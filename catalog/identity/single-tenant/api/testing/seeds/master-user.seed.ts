import { ulid } from "ulid"

import { users } from "../../infrastructure/tables/user.table"

import type { Seed } from "./types"

// Superusuário interno da plataforma. Credencial conhecida e versionada no
// repositório: ROTACIONE antes de qualquer ambiente exposto — este seed é só
// bootstrap interno/dev, nunca cria conta por signup. Em ambiente real use
// `db:bootstrap`, que lê a credencial do env.
const MASTER_EMAIL = "admin@example.com"
const MASTER_PASSWORD = "Trocar-Esta-Senha-No-1o-Login!2026"
const MASTER_NAME = "Platform Admin"

// pepperVersion inicial — igual ao default da coluna pepper_version. Rotação do
// PASSWORD_PEPPER incrementa este número.
const PEPPER_VERSION = 1

export const masterUserSeed: Seed = {
  name: "master-user",
  async run({ db, hasher }) {
    const now = new Date()
    const passwordHash = await hasher.hash(MASTER_PASSWORD)

    // onConflictDoNothing por e-mail: re-rodar não duplica nem reescreve a senha
    // de um master já existente (idempotente). `returning` vazio = já existia.
    const inserted = await db
      .insert(users)
      .values({
        id: ulid(),
        name: MASTER_NAME,
        // lowercase espelha a invariante de User.create — o login normaliza o
        // input e o repo casa por igualdade exata.
        email: MASTER_EMAIL.toLowerCase(),
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
      process.stdout.write(`[seed:master-user] ${MASTER_EMAIL} já existe — nada a fazer\n`)
      return
    }
    process.stdout.write(
      `[seed:master-user] criado ${MASTER_EMAIL} (access_profile=master)\n`
    )
  },
}
