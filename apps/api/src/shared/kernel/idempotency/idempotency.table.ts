import {
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

import { kernelSchema } from "../kernel.schema"

export const idempotencyKeys = kernelSchema.table(
  "idempotency_keys",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    endpoint: text("endpoint").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.key] }),
    index("idempotency_keys_expires_at_idx").on(t.expiresAt),
  ]
)

export type IdempotencyRow = typeof idempotencyKeys.$inferSelect
export type NewIdempotencyRow = typeof idempotencyKeys.$inferInsert
