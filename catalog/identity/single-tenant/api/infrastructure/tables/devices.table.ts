import { index, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

import { identitySchema } from "./identity.schema"
import { users } from "./user.table"

export const devices = identitySchema.table(
  "devices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // sha256 do valor do cookie de device. O cookie NÃO é credencial — só agrupa.
    cookieTokenHash: text("cookie_token_hash").notNull(),
    label: text("label"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Device escopado por user: mesmo browser + user diferente = row diferente (anti-IDOR).
    uniqueIndex("devices_user_id_cookie_token_hash_unique").on(
      t.userId,
      t.cookieTokenHash
    ),
    index("devices_user_id_idx").on(t.userId),
  ]
)

export type DeviceRow = typeof devices.$inferSelect
export type DeviceInsert = typeof devices.$inferInsert
