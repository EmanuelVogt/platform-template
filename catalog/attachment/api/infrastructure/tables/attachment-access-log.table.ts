import { index, text, timestamp } from "drizzle-orm/pg-core"

import { attachmentSchema } from "./attachment.schema"

export const accessAction = attachmentSchema.enum("attachment_access_action", [
  "download",
  "upload",
  "delete",
])

export const accessOutcome = attachmentSchema.enum(
  "attachment_access_outcome",
  ["allowed", "denied"]
)

export const attachmentAccessLogs = attachmentSchema.table(
  "attachment_access_logs",
  {
    id: text("id").primaryKey(),
    attachmentId: text("attachment_id").notNull(),
    userId: text("user_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    action: accessAction("action").notNull(),
    outcome: accessOutcome("outcome").notNull(),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("attachment_access_logs_attachment_idx").on(
      t.attachmentId,
      t.createdAt
    ),
    index("attachment_access_logs_user_idx").on(t.userId, t.createdAt),
  ]
)

export type AttachmentAccessLogInsert = typeof attachmentAccessLogs.$inferInsert
