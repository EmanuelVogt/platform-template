import { performance } from "node:perf_hooks"

import { ulid } from "ulid"

import type { RequestContextStore } from "./request-context"
import type { EventEnvelope } from "../events/domain-event.base"


function traceIdFromTraceparent(traceparent: string | null): string | null {
  if (!traceparent) {
    return null
  }
  const parts = traceparent.split("-")
  return parts.length >= 2 ? (parts[1] ?? null) : null
}

/**
 * Deriva o contexto de um handler de evento a partir do envelope: herda
 * `correlationId`, define `causationId = eventId` (o fato que disparou) e lê o
 * `traceId` do traceparent. O dispatcher roda o handler dentro deste store.
 */
export function buildEventContextStore(
  envelope: EventEnvelope
): RequestContextStore {
  return {
    requestId: ulid(),
    correlationId: envelope.correlationId,
    causationId: envelope.eventId,
    traceId: traceIdFromTraceparent(envelope.traceparent),
    spanId: null,
    tenantId: envelope.tenantId,
    origin: "event",
    actor: null,
    extensions: new Map(),
    userId: null,
    sessionId: null,
    deviceId: null,
    access: null,
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: performance.now(),
  }
}
