import type Redis from "ioredis"

// Isola env() do processo (memoizado) por teste: reseta o registro de módulos
// e injeta REDIS_URL/DATABASE_SSL antes de reimportar createRedis a cada caso.
describe("createRedis", () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV, DATABASE_SSL: "disable" }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  async function buildClient(redisUrl: string): Promise<Redis> {
    process.env.REDIS_URL = redisUrl
    const { createRedis } = await import("./redis.provider")
    return createRedis()
  }

  it("define commandTimeout de 2000ms", async () => {
    const client = await buildClient("redis://localhost:6379")
    expect(client.options.commandTimeout).toBe(2000)
    client.disconnect()
  })

  it("repassa a URL redis:// (texto plano) sem alterar host/porta/tls", async () => {
    const client = await buildClient("redis://localhost:6379")
    expect(client.options.host).toBe("localhost")
    expect(client.options.port).toBe(6379)
    expect(client.options.tls).toBeUndefined()
    client.disconnect()
  })

  it("repassa a URL rediss:// (TLS) sem alterar host/porta/tls", async () => {
    const client = await buildClient("rediss://localhost:6380")
    expect(client.options.host).toBe("localhost")
    expect(client.options.port).toBe(6380)
    expect(client.options.tls).toBeTruthy()
    client.disconnect()
  })
})
