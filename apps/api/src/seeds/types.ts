import type { PasswordHasher } from "../modules/identity/domain/ports/password-hasher"
import type { DrizzleDb } from "../shared/infra/database/drizzle.provider"

/** Dependências que o runner injeta em cada seed. */
export interface SeedContext {
  db: DrizzleDb
  hasher: PasswordHasher
}

/** Seed idempotente: rodar N vezes converge sempre ao mesmo estado. */
export interface Seed {
  name: string
  run(ctx: SeedContext): Promise<void>
}
