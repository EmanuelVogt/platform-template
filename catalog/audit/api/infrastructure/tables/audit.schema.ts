import { pgSchema } from "drizzle-orm/pg-core"

/** Schema Postgres dedicado da trilha de auditoria. */
export const auditSchema = pgSchema("audit")
