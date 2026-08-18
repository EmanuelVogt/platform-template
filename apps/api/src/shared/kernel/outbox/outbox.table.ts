import { sql } from "drizzle-orm"
import { index, integer, jsonb, text, timestamp } from "drizzle-orm/pg-core"

import { kernelSchema } from "../kernel.schema"

export const outbox = kernelSchema.table(
  "outbox",
  {
    eventId: text("event_id").primaryKey(),
    eventName: text("event_name").notNull(),
    eventVersion: integer("event_version").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    payload: jsonb("payload").notNull(),
    correlationId: text("correlation_id").notNull(),
    causationId: text("causation_id"),
    tenantId: text("tenant_id"),
    traceparent: text("traceparent"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("outbox_unpublished_idx")
      .on(t.aggregateId, t.nextAttemptAt, t.occurredAt)
      .where(sql`${t.publishedAt} is null`),
  ]
)

export const outboxDead = kernelSchema.table("outbox_dead", {
  eventId: text("event_id").primaryKey(),
  eventName: text("event_name").notNull(),
  eventVersion: integer("event_version").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  payload: jsonb("payload").notNull(),
  correlationId: text("correlation_id").notNull(),
  causationId: text("causation_id"),
  tenantId: text("tenant_id"),
  traceparent: text("traceparent"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull(),
  lastError: text("last_error"),
  deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export type OutboxRow = typeof outbox.$inferSelect
export type NewOutboxRow = typeof outbox.$inferInsert
