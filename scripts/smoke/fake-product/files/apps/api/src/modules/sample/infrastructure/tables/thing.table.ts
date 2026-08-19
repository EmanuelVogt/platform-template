import { text } from "drizzle-orm/pg-core"

import { sampleSchema } from "./sample.schema"

export const things = sampleSchema.table("things", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
})

export type ThingRow = typeof things.$inferSelect
export type ThingInsert = typeof things.$inferInsert
