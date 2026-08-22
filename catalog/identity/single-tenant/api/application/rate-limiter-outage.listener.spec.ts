import { EventEmitter2 } from "@nestjs/event-emitter"

import { InMemoryRateLimiter } from "../../../shared/kernel/rate-limit/in-memory-rate-limiter"
import { ResilientRateLimiter } from "../../../shared/kernel/rate-limit/resilient-rate-limiter"
import { ACCESS_HISTORY_EVENT_TYPES } from "./use-cases/list-access-history/types"

import { RateLimiterOutageListener } from "./rate-limiter-outage.listener"

import type { LoggerFactory } from "../../../shared/kernel/logging/logger.factory"
import type { RateLimiter } from "../../../shared/kernel/rate-limit/rate-limiter.port"

const SINCE = new Date("2026-08-22T10:00:00.000Z")

const silentLoggerFactory = {
  forModule: () => ({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
} as unknown as LoggerFactory

function makeListener(over: { ctx?: unknown } = {}) {
  const authEvents = {
    record: jest.fn().mockResolvedValue(undefined),
    recordInTx: jest.fn().mockResolvedValue(undefined),
    listByUser: jest.fn(),
    deleteOlderThan: jest.fn(),
  }
  const ctx =
    over.ctx ??
    {
      tryGet: () => ({
        ip: "203.0.113.4",
        userAgent: "jest",
        correlationId: "corr-outage",
        traceId: "trace-1",
        spanId: "span-1",
      }),
    }
  const listener = new RateLimiterOutageListener(
    authEvents,
    ctx as ConstructorParameters<typeof RateLimiterOutageListener>[1]
  )
  return { listener, authEvents }
}

describe("RateLimiterOutageListener", () => {
  it("grava um auth event de sistema com userId null e o início da queda", async () => {
    const t = makeListener()

    await t.listener.onDegraded({ since: SINCE, error: "ECONNREFUSED" })

    expect(t.authEvents.record).toHaveBeenCalledTimes(1)
    expect(t.authEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          eventType: "rate_limiter_degraded",
          userId: null,
          emailHash: null,
          metadata: { since: SINCE.toISOString() },
        }),
      })
    )
    expect(t.authEvents.recordInTx).not.toHaveBeenCalled()
  })

  it("uma queda com vários consumes gera UM único evento", async () => {
    const t = makeListener()
    const emitter = new EventEmitter2()
    emitter.on("rate-limiter.degraded", (e) => {
      void t.listener.onDegraded(e as { since: Date; error: string })
    })
    const brokenPrimary: RateLimiter = {
      consume: () => Promise.reject(new Error("redis fora")),
      reset: () => Promise.reject(new Error("redis fora")),
    }
    const limiter = new ResilientRateLimiter(
      brokenPrimary,
      new InMemoryRateLimiter(),
      emitter,
      silentLoggerFactory
    )

    await limiter.consume("login:acct:a@b.test", 10, 900, { critical: true })
    await limiter.consume("login:acct:a@b.test", 10, 900, { critical: true })
    await limiter.consume("login:acct:c@d.test", 10, 900, { critical: true })

    expect(t.authEvents.record).toHaveBeenCalledTimes(1)
  })

  it("fora de um request o evento ainda é gravado, com correlationId próprio", async () => {
    const t = makeListener({ ctx: { tryGet: () => null } })

    await t.listener.onDegraded({ since: SINCE, error: "timeout" })

    const recorded = t.authEvents.record.mock.calls[0]?.[0] as {
      props: { correlationId: string; ip: string | null }
    }
    expect(recorded.props.ip).toBeNull()
    expect(recorded.props.correlationId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it("é evento de sistema: fica FORA da allowlist do histórico do usuário", () => {
    expect(ACCESS_HISTORY_EVENT_TYPES).not.toContain("rate_limiter_degraded")
  })
})
