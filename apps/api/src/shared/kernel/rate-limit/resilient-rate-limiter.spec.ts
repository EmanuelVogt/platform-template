import { EventEmitter2 } from "@nestjs/event-emitter"
import { type Mock, describe, expect, it, vi } from "vitest"

import { InMemoryRateLimiter } from "./in-memory-rate-limiter"
import { ResilientRateLimiter } from "./resilient-rate-limiter"

import type { LoggerFactory } from "../logging/logger.factory"

type Warn = { message: string; meta: unknown }
type Emitted = { name: string; payload: unknown }

function makeHarness(): {
  limiter: ResilientRateLimiter
  fallback: InMemoryRateLimiter
  primary: { consume: Mock; reset: Mock }
  emitted: Emitted[]
  warns: Warn[]
} {
  const primary = {
    consume: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    reset: vi.fn().mockResolvedValue(undefined),
  }
  const fallback = new InMemoryRateLimiter()
  const emitter = new EventEmitter2()
  const emitted: Emitted[] = []
  emitter.onAny((name, payload) => {
    emitted.push({ name: String(name), payload })
  })
  const warns: Warn[] = []
  const loggerFactory = {
    forModule: () => ({
      warn: (message: string, meta?: unknown) => {
        warns.push({ message, meta })
      },
    }),
  } as unknown as LoggerFactory

  return {
    limiter: new ResilientRateLimiter(
      primary,
      fallback,
      emitter,
      loggerFactory
    ),
    fallback,
    primary,
    emitted,
    warns,
  }
}

const REDIS_DOWN = new Error("connect ECONNREFUSED")

describe("ResilientRateLimiter", () => {
  it("repassa o resultado do primário quando ele responde", async () => {
    const { limiter, primary, emitted } = makeHarness()
    primary.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 17 })

    expect(await limiter.consume("k", 5, 60, { critical: true })).toEqual({
      allowed: false,
      retryAfterSeconds: 17,
    })
    expect(primary.consume).toHaveBeenCalledWith("k", 5, 60)
    expect(emitted).toEqual([])
  })

  it("primário fora + critical: o fallback enforça o mesmo limite e janela", async () => {
    const { limiter, primary } = makeHarness()
    primary.consume.mockRejectedValue(REDIS_DOWN)

    const results = [
      await limiter.consume("acct:a", 2, 900, { critical: true }),
      await limiter.consume("acct:a", 2, 900, { critical: true }),
      await limiter.consume("acct:a", 2, 900, { critical: true }),
    ]

    expect(results.map((r) => r.allowed)).toEqual([true, true, false])
    expect(results[2]?.retryAfterSeconds).toBe(900)
  })

  it("primário fora + chave não crítica: libera com retryAfterSeconds 0", async () => {
    const { limiter, primary, fallback } = makeHarness()
    primary.consume.mockRejectedValue(REDIS_DOWN)

    expect(await limiter.consume("ip:1.2.3.4:/docs", 1, 60)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
    expect(await limiter.consume("ip:1.2.3.4:/docs", 1, 60)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
    // Chave não crítica nem entra na janela local.
    expect(fallback.trackedKeys).toBe(0)
  })

  it("primeiro erro depois de saudável: um warn e um rate-limiter.degraded", async () => {
    const { limiter, primary, emitted, warns } = makeHarness()
    const before = Date.now()
    primary.consume.mockRejectedValue(REDIS_DOWN)

    await limiter.consume("k", 1, 60, { critical: true })

    expect(warns).toHaveLength(1)
    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.name).toBe("rate-limiter.degraded")
    const payload = emitted[0]?.payload as { since: Date; error: string }
    expect(payload.error).toBe("connect ECONNREFUSED")
    expect(payload.since).toBeInstanceOf(Date)
    expect(payload.since.getTime()).toBeGreaterThanOrEqual(before)
    expect(payload.since.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it("segundo erro na mesma queda não emite nem loga de novo", async () => {
    const { limiter, primary, emitted, warns } = makeHarness()
    primary.consume.mockRejectedValue(REDIS_DOWN)

    await limiter.consume("k", 1, 60, { critical: true })
    await limiter.consume("k", 1, 60, { critical: true })
    await limiter.consume("outra", 1, 60)

    expect(warns).toHaveLength(1)
    expect(emitted.map((e) => e.name)).toEqual(["rate-limiter.degraded"])
  })

  it("primeiro sucesso depois da queda descarta o estado local e emite recovered", async () => {
    const { limiter, primary, fallback, emitted } = makeHarness()
    primary.consume.mockRejectedValue(REDIS_DOWN)
    await limiter.consume("acct:a", 1, 900, { critical: true })
    expect(fallback.trackedKeys).toBe(1)

    primary.consume.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    await limiter.consume("acct:a", 1, 900, { critical: true })

    expect(fallback.trackedKeys).toBe(0)
    expect(emitted.map((e) => e.name)).toEqual([
      "rate-limiter.degraded",
      "rate-limiter.recovered",
    ])
  })

  it("Redis volta: a tentativa da queda não é cobrada de novo (sem contagem dobrada)", async () => {
    const { limiter, primary, fallback } = makeHarness()
    primary.consume.mockRejectedValue(REDIS_DOWN)
    await limiter.consume("acct:a", 1, 900, { critical: true })

    primary.consume.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    await limiter.consume("acct:a", 1, 900, { critical: true })

    // Nova queda: a janela local recomeça do zero em vez de já estar no teto.
    primary.consume.mockRejectedValue(REDIS_DOWN)
    expect(await limiter.consume("acct:a", 1, 900, { critical: true })).toEqual(
      {
        allowed: true,
        retryAfterSeconds: 0,
      }
    )
    expect(fallback.trackedKeys).toBe(1)
  })

  it("nova queda depois de recuperar emite degraded outra vez", async () => {
    const { limiter, primary, emitted, warns } = makeHarness()
    primary.consume.mockRejectedValue(REDIS_DOWN)
    await limiter.consume("k", 1, 60, { critical: true })
    primary.consume.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 })
    await limiter.consume("k", 1, 60, { critical: true })
    primary.consume.mockRejectedValue(REDIS_DOWN)
    await limiter.consume("k", 1, 60, { critical: true })

    expect(emitted.map((e) => e.name)).toEqual([
      "rate-limiter.degraded",
      "rate-limiter.recovered",
      "rate-limiter.degraded",
    ])
    expect(warns).toHaveLength(2)
  })

  it("reset repassa ao primário e sinaliza recuperação como o consume", async () => {
    const { limiter, primary, fallback, emitted } = makeHarness()
    primary.consume.mockRejectedValue(REDIS_DOWN)
    await limiter.consume("acct:a", 1, 900, { critical: true })
    expect(fallback.trackedKeys).toBe(1)

    await limiter.reset("acct:a")

    expect(primary.reset).toHaveBeenCalledWith("acct:a")
    expect(fallback.trackedKeys).toBe(0)
    expect(emitted.map((e) => e.name)).toEqual([
      "rate-limiter.degraded",
      "rate-limiter.recovered",
    ])
  })

  it("reset com o primário fora limpa a chave local e sinaliza a queda", async () => {
    const { limiter, primary, emitted, warns } = makeHarness()
    primary.consume.mockRejectedValue(REDIS_DOWN)
    primary.reset.mockRejectedValue(REDIS_DOWN)
    await limiter.consume("acct:a", 1, 900, { critical: true })
    await limiter.consume("acct:b", 1, 900, { critical: true })

    await limiter.reset("acct:a")

    expect(
      (await limiter.consume("acct:a", 1, 900, { critical: true })).allowed
    ).toBe(true)
    expect(
      (await limiter.consume("acct:b", 1, 900, { critical: true })).allowed
    ).toBe(false)
    expect(warns).toHaveLength(1)
    expect(emitted.map((e) => e.name)).toEqual(["rate-limiter.degraded"])
  })
})
