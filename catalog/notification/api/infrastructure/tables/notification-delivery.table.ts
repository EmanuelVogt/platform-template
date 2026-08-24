import { index, integer, jsonb, text, timestamp } from "drizzle-orm/pg-core"

import { notificationSchema } from "./notification.schema"

export const notificationDeliveryStatus = notificationSchema.enum(
  "notification_delivery_status",
  ["pending", "sent", "failed", "dead_letter"]
)

export const notificationChannel = notificationSchema.enum(
  "notification_channel",
  ["email", "push"]
)

export const notificationDeliveries = notificationSchema.table(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    // id lógico do feed (mesmo schema, sem FK física — null em email-only).
    notificationId: text("notification_id"),
    recipientId: text("recipient_id").notNull(),
    type: text("type").notNull(),
    channel: notificationChannel("channel").notNull(),
    payload: jsonb("payload").notNull(),
    status: notificationDeliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("notification_deliveries_poll_idx").on(t.status, t.nextAttemptAt),
  ]
)

export type DeliveryRow = typeof notificationDeliveries.$inferSelect
export type DeliveryInsert = typeof notificationDeliveries.$inferInsert
