import { pgSchema } from "drizzle-orm/pg-core"

/** Schema Postgres dedicado do produto de exemplo (smoke do template). */
export const sampleSchema = pgSchema("sample")
