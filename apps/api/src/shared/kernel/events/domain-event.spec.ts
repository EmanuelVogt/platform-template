import { describe, expect, it } from "vitest"

import { DomainEvent } from "./domain-event.base"

class SampleEvent extends DomainEvent<{ x: number }> {
  readonly eventName = "sample.happened"
  readonly eventVersion = 1

  static make(args: {
    aggregateId: string
    payload: { x: number }
    eventId?: string
    occurredAt?: string
  }): SampleEvent {
    return new SampleEvent({ aggregateType: "sample", ...args })
  }
}

describe("DomainEvent", () => {
  it("preenche eventId (ULID) e occurredAt (ISO) ao criar via factory", () => {
    const event = SampleEvent.make({ aggregateId: "a-1", payload: { x: 7 } })

    expect(event.eventId).toHaveLength(26)
    expect(new Date(event.occurredAt).toISOString()).toBe(event.occurredAt)
    expect(event.eventName).toBe("sample.happened")
    expect(event.eventVersion).toBe(1)
    expect(event.aggregateType).toBe("sample")
    expect(event.payload.x).toBe(7)
  })

  it("respeita eventId e occurredAt fornecidos", () => {
    const event = SampleEvent.make({
      aggregateId: "a-1",
      payload: { x: 42 },
      eventId: "fixed-id",
      occurredAt: "2026-01-01T00:00:00.000Z",
    })

    expect(event.eventId).toBe("fixed-id")
    expect(event.occurredAt).toBe("2026-01-01T00:00:00.000Z")
    expect(event.payload.x).toBe(42)
  })
})
