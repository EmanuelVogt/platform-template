import { primaryKey, text, timestamp } from "drizzle-orm/pg-core"

import { kernelSchema } from "../kernel.schema"

export const processedEvents = kernelSchema.table(
  "processed_events",
  {
    eventId: text("event_id").notNull(),
    consumer: text("consumer").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.consumer] })]
)

export type ProcessedEventRow = typeof processedEvents.$inferSelect
