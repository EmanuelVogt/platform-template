import { pgSchema } from "drizzle-orm/pg-core"

/** Schema lógico do módulo de autenticação. Espelha `pgSchema('identity')`. */
export const identitySchema = pgSchema("identity")
