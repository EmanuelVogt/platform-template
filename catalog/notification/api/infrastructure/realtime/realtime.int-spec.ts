import Redis from "ioredis"
import { GenericContainer, type StartedTestContainer } from "testcontainers"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { makeTestLogger } from "../../../../../test/setup/test-logger"

import { NOTIF_REALTIME_CHANNEL } from "./realtime-channel"
import { RedisRealtimeListener } from "./redis-realtime-listener"
import { RedisRealtimePublisher } from "./redis-realtime-publisher"
import { SseConnectionRegistry } from "./sse-connection-registry"

describe("realtime Redis pub/sub (int)", () => {
  let container: StartedTestContainer
  let pub: Redis
  let sub: Redis
  let registry: SseConnectionRegistry
  let listener: RedisRealtimeListener

  beforeAll(async () => {
    container = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      .start()
    const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`
    pub = new Redis(url)
    sub = new Redis(url)
    registry = new SseConnectionRegistry()
    listener = new RedisRealtimeListener(
      sub,
      registry,
      makeTestLogger().loggerFactory
    )
    listener.onModuleInit()
    // SPEC_DEVIATION: aguarda a confirmação do SUBSCRIBE antes de liberar o
    // beforeAll. Reason: onModuleInit() dispara subscribe() sem aguardar
    // (fire-and-forget por desenho, redis-realtime-listener.ts:41-51); ioredis
    // 5 não emite um evento "subscribe" no client (confirmado lendo
    // DataHandler.js — a confirmação só resolve a Promise do próprio comando),
    // então a única espera determinística é reemitir o mesmo SUBSCRIBE nesta
    // mesma conexão: o servidor já trata o canal como inscrito e responde de
    // imediato. Publicar sem essa espera é uma corrida real do Redis (mensagem
    // para assinante ainda não inscrito nunca chega).
    await sub.subscribe(NOTIF_REALTIME_CHANNEL)
  }, 60_000)

  afterAll(async () => {
    registry.onApplicationShutdown()
    await listener.onApplicationShutdown()
    await pub.quit()
    await container.stop()
  })

  it("publish no canal dispara nudge na conexão registrada", async () => {
    const events: unknown[] = []
    const conn = registry.register("u1")
    conn.stream.subscribe({ next: (e) => events.push(e) })

    await new RedisRealtimePublisher(pub).publishNew("u1")

    await new Promise((r) => setTimeout(r, 200))
    expect(events).toEqual([{ data: { type: "new" } }])
    conn.close()
  })
})
