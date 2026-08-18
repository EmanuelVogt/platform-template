import { AuthEvent } from "../domain/entities/auth-event.entity"

import type { RequestContextStore } from "../../../shared/kernel/context/request-context"
import type { AuthEventType } from "../domain/entities/auth-event.entity"

type AuthEventFields = {
  userId: string | null
  eventType: AuthEventType
  actorUserId?: string | null
  emailHash?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Monta um `AuthEvent` preenchendo ip/userAgent/correlationId/trace a partir do
 * store de request. Os campos de trace passam a propagar o trace corrente —
 * antes ficavam fixos em null em cada call site.
 */
export function authEventOf(
  store: RequestContextStore,
  fields: AuthEventFields
): AuthEvent {
  return AuthEvent.create({
    userId: fields.userId,
    actorUserId: fields.actorUserId ?? null,
    eventType: fields.eventType,
    emailHash: fields.emailHash ?? null,
    ip: store.ip,
    userAgent: store.userAgent,
    correlationId: store.correlationId,
    traceId: store.traceId ?? null,
    spanId: store.spanId ?? null,
    metadata: fields.metadata ?? null,
  })
}
