import { describe, expect, it } from "vitest"

import { InMemoryRateLimiter, MAX_TRACKED_KEYS } from "./in-memory-rate-limiter"

import type { Clock } from "../clock/clock"

/** Relógio dirigido pelo teste — nenhum timer real, nenhuma espera. */
function fakeClock(startMs = 1_700_000_000_000): Clock & {
  advance(ms: number): void
} {
  let nowMs = startMs
  return {
    now: () => new Date(nowMs),
    advance: (ms: number) => {
      nowMs += ms
    },
  }
}

describe("InMemoryRateLimiter", () => {
  it("admite enquanto a contagem na janela é menor que o limite", async () => {
    const limiter = new InMemoryRateLimiter(fakeClock())
    const first = await limiter.consume("k", 3, 60)
    const second = await limiter.consume("k", 3, 60)
    const third = await limiter.consume("k", 3, 60)
    expect([first, second, third]).toEqual([
      { allowed: true, retryAfterSeconds: 0 },
      { allowed: true, retryAfterSeconds: 0 },
      { allowed: true, retryAfterSeconds: 0 },
    ])
  })

  it("nega a (limite+1)-ésima com o Retry-After do script Lua", async () => {
    const clock = fakeClock()
    const limiter = new InMemoryRateLimiter(clock)
    await limiter.consume("k", 2, 60)
    await limiter.consume("k", 2, 60)
    clock.advance(10_000)
    // Lua: ceil((oldest + window_ms - now_ms) / 1000) = ceil((0+60000-10000)/1000)
    expect(await limiter.consume("k", 2, 60)).toEqual({
      allowed: false,
      retryAfterSeconds: 50,
    })
  })

  it("gate negado não consome slot — a espera não anda para frente", async () => {
    const clock = fakeClock()
    const limiter = new InMemoryRateLimiter(clock)
    await limiter.consume("k", 1, 60)
    clock.advance(1_000)
    const firstDenial = await limiter.consume("k", 1, 60)
    const secondDenial = await limiter.consume("k", 1, 60)
    expect(firstDenial).toEqual({ allowed: false, retryAfterSeconds: 59 })
    expect(secondDenial).toEqual({ allowed: false, retryAfterSeconds: 59 })
  })

  it("janela deslizante: o evento sai da janela e a chave volta a admitir", async () => {
    const clock = fakeClock()
    const limiter = new InMemoryRateLimiter(clock)
    await limiter.consume("k", 1, 60)
    clock.advance(59_999)
    expect((await limiter.consume("k", 1, 60)).allowed).toBe(false)
    clock.advance(2)
    expect(await limiter.consume("k", 1, 60)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
  })

  it("reset limpa uma chave e deixa as demais intactas", async () => {
    const limiter = new InMemoryRateLimiter(fakeClock())
    await limiter.consume("a", 1, 60)
    await limiter.consume("b", 1, 60)
    await limiter.reset("a")
    expect((await limiter.consume("a", 1, 60)).allowed).toBe(true)
    expect((await limiter.consume("b", 1, 60)).allowed).toBe(false)
  })

  it("clear descarta todo o estado local", async () => {
    const limiter = new InMemoryRateLimiter(fakeClock())
    await limiter.consume("a", 1, 60)
    await limiter.consume("b", 1, 60)
    expect(limiter.trackedKeys).toBe(2)
    limiter.clear()
    expect(limiter.trackedKeys).toBe(0)
    expect((await limiter.consume("a", 1, 60)).allowed).toBe(true)
    expect((await limiter.consume("b", 1, 60)).allowed).toBe(true)
  })

  it("expira a chave cuja janela esvaziou em vez de guardar array vazio", async () => {
    const clock = fakeClock()
    const limiter = new InMemoryRateLimiter(clock)
    await limiter.consume("k", 1, 60)
    clock.advance(60_001)
    await limiter.consume("outra", 1, 60)
    expect(limiter.trackedKeys).toBe(2)
    await limiter.reset("k")
    expect(limiter.trackedKeys).toBe(1)
  })

  it("não passa de MAX_TRACKED_KEYS chaves — despeja a menos recente", async () => {
    const limiter = new InMemoryRateLimiter(fakeClock())
    for (let i = 0; i <= MAX_TRACKED_KEYS; i += 1) {
      await limiter.consume(`k${i}`, 1, 60)
    }
    expect(MAX_TRACKED_KEYS).toBe(50_000)
    expect(limiter.trackedKeys).toBe(MAX_TRACKED_KEYS)
    // k1 ainda é rastreada (nega); k0, a mais antiga, foi despejada (admite).
    expect((await limiter.consume("k1", 1, 60)).allowed).toBe(false)
    expect((await limiter.consume("k0", 1, 60)).allowed).toBe(true)
  })
})
