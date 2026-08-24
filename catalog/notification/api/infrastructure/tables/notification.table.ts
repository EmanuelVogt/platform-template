import { desc, sql } from "drizzle-orm"
import { index, jsonb, text, timestamp } from "drizzle-orm/pg-core"

import { notificationSchema } from "./notification.schema"

export const notifications = notificationSchema.table(
  "notifications",
  {
    id: text("id").primaryKey(),
    recipientId: text("recipient_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    actions: jsonb("actions")
      .notNull()
      .default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    locale: text("locale").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_recipient_created_idx").on(
      t.recipientId,
      desc(t.createdAt)
    ),
    index("notifications_unseen_idx")
      .on(t.recipientId)
      .where(sql`${t.seenAt} is null and ${t.archivedAt} is null`),
  ]
)

export type NotificationRow = typeof notifications.$inferSelect
export type NotificationInsert = typeof notifications.$inferInsert
