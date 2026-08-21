import { pgSchema } from "drizzle-orm/pg-core"

/** Schema Postgres dedicado do módulo de attachment. */
export const attachmentSchema = pgSchema("attachment")
