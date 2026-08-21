import * as schema from "../../../../db/schema"
import { loadDotenvForDev } from "../../../../shared/config/load-dotenv"
import {
  createDrizzle,
  createPool,
} from "../../../../shared/infra/database/drizzle.provider"
import { loadIdentityConfig } from "../../identity.config"
import { Argon2PasswordHasher } from "../../infrastructure/hashing/argon2-password-hasher"

import { masterUserSeed } from "./master-user.seed"

import type { Seed, SeedContext } from "./types"

const SEEDS: Seed[] = [masterUserSeed]

async function main(): Promise<void> {
  loadDotenvForDev()

  // Fail-fast: este seed planta uma credencial mestre fixa e conhecida. Rodar
  // fora de dev/test seria um backdoor — staging/produção recebem o env do
  // orquestrador e poderiam apontar para um banco exposto.
  const nodeEnv = process.env.NODE_ENV ?? "development"
  if (nodeEnv !== "development" && nodeEnv !== "test") {
    throw new Error(
      `seed bloqueado em NODE_ENV=${nodeEnv}: credencial mestre fixa só roda em dev/test`,
    )
  }

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

  const pool = createPool()
  const ctx: SeedContext = { db: createDrizzle(pool, schema), hasher }
  try {
    for (const seed of SEEDS) {
      await seed.run(ctx)
    }
  } finally {
    await pool.end()
  }
}

void main().catch((err: unknown) => {
  process.stderr.write(`[seed] falhou: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
