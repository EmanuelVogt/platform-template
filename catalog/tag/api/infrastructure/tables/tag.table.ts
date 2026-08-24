import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { tagSchema } from "./tag.schema"

export const tags = tagSchema.table(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("tags_name_unique")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} IS NULL`),
    index("tags_active_idx").on(t.isActive),
  ]
)

export type TagRow = typeof tags.$inferSelect
export type TagInsert = typeof tags.$inferInsert
