import { ulid } from "ulid"

import * as schema from "../db/schema"
import { loadIdentityConfig } from "../modules/identity/identity.config"
import { Argon2PasswordHasher } from "../modules/identity/infrastructure/hashing/argon2-password-hasher"
import { users } from "../modules/identity/infrastructure/tables/user.table"
import { loadDotenvForDev } from "../shared/config/load-dotenv"
import {
  createDrizzle,
  createPool,
} from "../shared/infra/database/drizzle.provider"

// Bootstrap do superusuário (access_profile=master) em QUALQUER ambiente, incluindo produção.
// Diferente do seed dev (`db:seed`), a credencial vem do ENV — nunca do repo —
// então rodar em prod não planta backdoor com senha versionada. Segurança vem de:
// credencial fora do git + invocação deliberada (one-off) + idempotência. Por isso
// não há guard de NODE_ENV. Após o primeiro login, troque a senha pelo fluxo
// autenticado e remova MASTER_PASSWORD do orquestrador.

// pepperVersion inicial — igual ao default da coluna pepper_version.
const PEPPER_VERSION = 1
const DEFAULT_MASTER_NAME = "Platform Admin"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} ausente: bootstrap-master exige a credencial via env`)
  }
  return value
}

async function main(): Promise<void> {
  // Em prod o env vem do orquestrador; em dev carrega o .env local (no-op em prod).
  loadDotenvForDev()

  // lowercase espelha a invariante de User.create — o login normaliza o input e o
  // repo casa por igualdade exata.
  const email = requireEnv("MASTER_EMAIL").toLowerCase()
  const password = requireEnv("MASTER_PASSWORD")
  const name = process.env.MASTER_NAME ?? DEFAULT_MASTER_NAME

  const cfg = loadIdentityConfig()

  // Mesmo hasher do runtime (argon2id + pepper) — garante que o hash semeado
  // verifica no login. Sem isto, a senha do master nunca casaria.
  const hasher = new Argon2PasswordHasher({
    pepper: cfg.PASSWORD_PEPPER,
    memoryKib: cfg.ARGON_MEMORY_KIB,
    timeCost: cfg.ARGON_TIME_COST,
    parallelism: cfg.ARGON_PARALLELISM,
    hashLength: cfg.ARGON_HASH_LENGTH,
    saltLength: cfg.ARGON_SALT_LENGTH,
  })

  const passwordHash = await hasher.hash(password)
  const now = new Date()

  const pool = createPool()
  const db = createDrizzle(pool, schema)
  try {
    // onConflictDoNothing por e-mail: re-rodar não duplica nem reescreve a senha
    // de um master já existente (idempotente). `returning` vazio = já existia.
    const inserted = await db
      .insert(users)
      .values({
        id: ulid(),
        name,
        email,
        emailVerified: true,
        accessProfile: "master" as const,
        passwordHash,
        pepperVersion: PEPPER_VERSION,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastResetRequestedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id })

    if (inserted.length === 0) {
      console.info(`[bootstrap-master] ${email} já existe — nada a fazer`)
      return
    }
    console.info(`[bootstrap-master] criado ${email} (access_profile=master)`)
  } finally {
    await pool.end()
  }
}

void main().catch((err: unknown) => {
  console.error(
    `[bootstrap-master] falhou: ${err instanceof Error ? err.message : String(err)}`,
  )
  process.exitCode = 1
})
