import {
  boolean,
  index,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { devices } from "./devices.table"
import { identitySchema } from "./identity.schema"
import { users } from "./user.table"

export const sessions = identitySchema.table(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    rememberMe: boolean("remember_me").notNull().default(false),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    // Nullable: sessões pré-feature (órfãs) ficam null e envelhecem (D1).
    deviceId: text("device_id").references(() => devices.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_device_id_idx").on(t.deviceId),
  ]
)

export type SessionRow = typeof sessions.$inferSelect
export type SessionInsert = typeof sessions.$inferInsert
