import { describe, expect, it } from "vitest"

import { buildEventContextStore } from "./event-context"

import type { EventEnvelope } from "../events/domain-event.base"

function envelope(over: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: "evt-1",
    eventName: "test.event",
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    aggregateId: "agg-1",
    aggregateType: "test",
    correlationId: "corr-1",
    causationId: null,
    traceparent: "00-abc123-def456-01",
    tenantId: "tenant-1",
    payload: {},
    ...over,
  }
}

describe("buildEventContextStore", () => {
  it("herda correlationId e define causationId = eventId", () => {
    const store = buildEventContextStore(envelope())
    expect(store.correlationId).toBe("corr-1")
    expect(store.causationId).toBe("evt-1")
    expect(store.origin).toBe("event")
    expect(store.tenantId).toBe("tenant-1")
  })

  it("extrai traceId do traceparent W3C", () => {
    const store = buildEventContextStore(envelope())
    expect(store.traceId).toBe("abc123")
  })

  it("traceId null quando traceparent ausente ou inválido", () => {
    expect(
      buildEventContextStore(envelope({ traceparent: null })).traceId
    ).toBeNull()
    expect(
      buildEventContextStore(envelope({ traceparent: "invalid" })).traceId
    ).toBeNull()
  })
})
