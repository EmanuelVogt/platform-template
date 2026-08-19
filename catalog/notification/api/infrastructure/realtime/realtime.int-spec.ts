import Redis from "ioredis"
import { GenericContainer, type StartedTestContainer } from "testcontainers"

import { makeTestLogger } from "../../../../../test/setup/test-logger"

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
    listener = new RedisRealtimeListener(sub, registry, makeTestLogger().loggerFactory)
    await listener.onModuleInit()
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
