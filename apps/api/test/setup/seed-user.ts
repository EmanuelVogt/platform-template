import { ulid } from "ulid"

import { PASSWORD_HASHER } from "../../src/modules/identity/domain/ports/password-hasher"

import type { PasswordHasher } from "../../src/modules/identity/domain/ports/password-hasher"
import type { INestApplication } from "@nestjs/common"
import type { Pool } from "pg"

type SeedUserOptions = {
  email: string
  password: string
  name?: string
  emailVerified?: boolean
  accessProfile?: "master" | "admin" | "professional"
  // Default = perfil professional, espelhando o backfill da migration 0131.
  servesClients?: boolean
  permissions?: string[]
}

/**
 * Semeia um usuário direto no banco com hash real (argon2+pepper do app) — o
 * caminho de signup (`/register`) não existe mais. Idempotente por e-mail:
 * re-semear o mesmo e-mail é no-op e devolve o id existente (permite simular
 * múltiplas sessões do mesmo usuário em sequência).
 */
export async function seedUser(
  app: INestApplication,
  pool: Pool,
  opts: SeedUserOptions,
): Promise<string> {
  const hasher = app.get<PasswordHasher>(PASSWORD_HASHER)
  const passwordHash = await hasher.hash(opts.password)
  const email = opts.email.toLowerCase()
  await pool.query(
    `INSERT INTO identity.users
       (id, name, email, email_verified, password_hash, pepper_version, failed_login_attempts, access_profile, serves_clients, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 1, 0, $6, $7, now(), now())
     ON CONFLICT (email) DO NOTHING`,
    [
      ulid(),
      opts.name ?? opts.email,
      email,
      opts.emailVerified ?? true,
      passwordHash,
      opts.accessProfile ?? "admin",
      opts.servesClients ?? opts.accessProfile === "professional",
    ],
  )
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id FROM identity.users WHERE email = $1",
    [email],
  )
  const id = rows[0]?.id
  if (!id) {
    throw new Error(`seedUser: usuário ${email} não encontrado após insert`)
  }
  if (opts.permissions && opts.permissions.length > 0) {
    await pool.query(
      `INSERT INTO identity.user_permissions (user_id, permission)
       SELECT $1, unnest($2::text[])
       ON CONFLICT DO NOTHING`,
      [id, opts.permissions],
    )
  }
  return id
}
