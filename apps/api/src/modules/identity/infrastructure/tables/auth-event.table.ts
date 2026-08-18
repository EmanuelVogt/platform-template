import { index, jsonb, text, timestamp } from "drizzle-orm/pg-core"

import { identitySchema } from "./identity.schema"

/** Espelha `AuthEventType` do domínio. */
export const authEventType = identitySchema.enum("auth_event_type", [
  "register",
  "login_success",
  "login_failed",
  "account_locked",
  "account_unlocked",
  "logout",
  "session_revoked",
  "sessions_revoked_all",
  "session_expired",
  "session_ip_changed",
  "password_reset_requested",
  "password_reset_completed",
  "password_changed",
  "email_change_requested",
  "email_changed",
  "email_verified",
  "breach_check_skipped",
  "rate_limited_burst",
  "admin_action",
  "access_link_sent",
  "access_link_resent",
  "password_set",
  "device_revoked",
  "user_deleted",
  "user_restored",
  "user_purged",
  "access_link_cancelled",
])

export const authEvents = identitySchema.table(
  "auth_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    actorUserId: text("actor_user_id"),
    eventType: authEventType("event_type").notNull(),
    emailHash: text("email_hash"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    correlationId: text("correlation_id").notNull(),
    traceId: text("trace_id"),
    spanId: text("span_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("auth_events_user_id_idx").on(t.userId),
    index("auth_events_created_at_idx").on(t.createdAt),
  ]
)

export type AuthEventRow = typeof authEvents.$inferSelect
export type AuthEventInsert = typeof authEvents.$inferInsert
