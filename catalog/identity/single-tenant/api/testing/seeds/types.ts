import type { DrizzleDb } from "../../../../shared/infra/database/drizzle.provider"
import type { PasswordHasher } from "../../domain/ports/password-hasher"

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
