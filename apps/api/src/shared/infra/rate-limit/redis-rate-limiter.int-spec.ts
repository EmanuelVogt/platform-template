import Redis from "ioredis"
import { GenericContainer, Wait } from "testcontainers"

import { RedisRateLimiter } from "./redis-rate-limiter"

import type { StartedTestContainer } from "testcontainers"

describe("RedisRateLimiter (int)", () => {
  let container: StartedTestContainer
  let redis: Redis
  let limiter: RedisRateLimiter
  // Cliente apontado para porta sem ninguém escutando: todo comando rejeita.
  let unreachable: Redis

  beforeAll(async () => {
    container = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      // GenericContainer não espera o Redis aceitar conexão (ao contrário do
      // PostgreSqlContainer): aguarda a porta escutar antes de retornar.
      .withWaitStrategy(Wait.forListeningPorts())
      .start()
    redis = new Redis({
      host: container.getHost(),
      port: container.getMappedPort(6379),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    // Absorve erros de conexão transientes do startup; espera o 'ready'.
    redis.on("error", () => undefined)
    await new Promise<void>((resolve) => {
      if (redis.status === "ready") {
        resolve()
        return
      }
      redis.once("ready", () => {
        resolve()
      })
    })
    limiter = new RedisRateLimiter(redis)
    unreachable = new Redis({
      host: "127.0.0.1",
      port: 1,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      // Sem isso o ioredis reagenda reconexão para sempre e o Jest não sai.
      retryStrategy: () => null,
    })
    unreachable.on("error", () => undefined)
  }, 60000)

  beforeEach(async () => {
    await redis.flushall()
  })

  afterAll(async () => {
    unreachable.disconnect()
    await redis.quit()
    await container.stop()
  })

  it("permite até o limite e bloqueia depois", async () => {
    const key = "ip:1.2.3.4:login"
    const r1 = await limiter.consume(key, 2, 60)
    const r2 = await limiter.consume(key, 2, 60)
    const r3 = await limiter.consume(key, 2, 60)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
    expect(r3.allowed).toBe(false)
    expect(r3.retryAfterSeconds).toBeGreaterThan(0)
  })

  it("consumos concorrentes admitem exatamente o limite (ZCARD+ZADD atômico)", async () => {
    const key = "ip:9.9.9.9:login"
    const results = await Promise.all(
      Array.from({ length: 10 }, () => limiter.consume(key, 5, 60)),
    )
    const allowed = results.filter((r) => r.allowed).length
    expect(allowed).toBe(5)
  })

  it("sliding-window: sem burst de 2x na borda da janela", async () => {
    const key = "ip:burst:login"
    // 2 consumes em t≈0 (janela de 2s)
    await limiter.consume(key, 2, 2)
    await limiter.consume(key, 2, 2)
    // a ~1s ainda há 2 eventos na janela deslizante de 2s → negado.
    // (fixed-window com reset deixaria passar na borda — burst de 2x.)
    await new Promise((r) => setTimeout(r, 1000))
    const mid = await limiter.consume(key, 2, 2)
    expect(mid.allowed).toBe(false)
    expect(mid.retryAfterSeconds).toBeGreaterThan(0)
    expect(mid.retryAfterSeconds).toBeLessThanOrEqual(2)
  })

  it("janela expirada zera o contador", async () => {
    const key = "ip:5.5.5.5:login"
    await limiter.consume(key, 1, 1)
    const blocked = await limiter.consume(key, 1, 1)
    expect(blocked.allowed).toBe(false)
    await new Promise((r) => setTimeout(r, 1100))
    const afterWindow = await limiter.consume(key, 1, 1)
    expect(afterWindow.allowed).toBe(true)
  })

  it("erro do Redis propaga em vez de liberar a janela", async () => {
    const failing = new RedisRateLimiter(unreachable)
    await expect(failing.consume("ip:down:login", 1, 60)).rejects.toThrow()
  })

  it("reset apaga o bucket ratelimit:<key> e a chave volta a admitir", async () => {
    const key = "ip:7.7.7.7:login"
    await limiter.consume(key, 1, 60)
    expect((await limiter.consume(key, 1, 60)).allowed).toBe(false)

    await limiter.reset(key)

    expect(await redis.exists(`ratelimit:${key}`)).toBe(0)
    expect(await limiter.consume(key, 1, 60)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
  })

  it("reset de uma chave não toca as demais", async () => {
    await limiter.consume("ip:a:login", 1, 60)
    await limiter.consume("ip:b:login", 1, 60)

    await limiter.reset("ip:a:login")

    expect((await limiter.consume("ip:a:login", 1, 60)).allowed).toBe(true)
    expect((await limiter.consume("ip:b:login", 1, 60)).allowed).toBe(false)
  })

  it("erro do Redis no reset também propaga", async () => {
    const failing = new RedisRateLimiter(unreachable)
    await expect(failing.reset("ip:down:login")).rejects.toThrow()
  })
})
