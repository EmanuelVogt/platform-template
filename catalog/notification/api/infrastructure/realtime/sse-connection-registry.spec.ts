import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SseConnectionRegistry } from "./sse-connection-registry"

import type { MessageEvent } from "@nestjs/common"

function collect(registry: SseConnectionRegistry, userId: string) {
  const events: MessageEvent[] = []
  const conn = registry.register(userId)
  conn.stream.subscribe({ next: (e) => events.push(e) })
  return { conn, events }
}

describe("SseConnectionRegistry", () => {
  let registry: SseConnectionRegistry
  beforeEach(() => {
    registry = new SseConnectionRegistry()
  })
  afterEach(() => {
    registry.onApplicationShutdown()
  })

  it("notifyNew entrega {type:new} a todas as conexões do recipient", () => {
    const a1 = collect(registry, "u1")
    const a2 = collect(registry, "u1")
    const b = collect(registry, "u2")
    registry.notifyNew("u1")
    expect(a1.events).toEqual([{ data: { type: "new" } }])
    expect(a2.events).toEqual([{ data: { type: "new" } }])
    expect(b.events).toEqual([])
  })

  it("close remove a conexão (sem vazamento)", () => {
    const { conn, events } = collect(registry, "u1")
    conn.close()
    registry.notifyNew("u1")
    expect(events).toEqual([])
  })

  it("cap de 5 conexões/user: a 6ª derruba a mais antiga", () => {
    const first = collect(registry, "u1")
    let completed = false
    first.conn.stream.subscribe({ complete: () => (completed = true) })
    for (let i = 0; i < 5; i++) collect(registry, "u1")
    expect(completed).toBe(true)
  })

  it("heartbeat emite ping periódico a toda conexão registrada", () => {
    vi.useFakeTimers()
    try {
      registry.onModuleInit()
      const { events } = collect(registry, "u1")
      vi.advanceTimersByTime(25_000)
      expect(events).toEqual([{ data: { type: "ping" } }])
      vi.advanceTimersByTime(25_000)
      expect(events).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("shutdown completa todos os streams e limpa o registro", () => {
    const { conn, events } = collect(registry, "u1")
    let completed = false
    conn.stream.subscribe({ complete: () => (completed = true) })
    registry.onApplicationShutdown()
    expect(completed).toBe(true)
    registry.notifyNew("u1")
    expect(events).toEqual([])
  })
})
