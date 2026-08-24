import { describe, expect, it } from "vitest"

import { parseEnv } from "../../config/env"

import { createRedis } from "./redis.provider"

const BASE = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  DATABASE_SSL: "disable",
  WEB_ORIGIN: "http://localhost:5173",
  REDIS_URL: "redis://localhost:6379",
} as NodeJS.ProcessEnv

describe("createRedis", () => {
  it("define commandTimeout de 2000ms", () => {
    const client = createRedis(parseEnv(BASE))
    expect(client.options.commandTimeout).toBe(2000)
    client.disconnect()
  })

  it("repassa a URL redis:// (texto plano) sem alterar host/porta/tls", () => {
    const client = createRedis(parseEnv(BASE))
    expect(client.options.host).toBe("localhost")
    expect(client.options.port).toBe(6379)
    expect(client.options.tls).toBeUndefined()
    client.disconnect()
  })

  it("repassa a URL rediss:// (TLS) sem alterar host/porta/tls", () => {
    const client = createRedis(
      parseEnv({ ...BASE, REDIS_URL: "rediss://localhost:6380" })
    )
    expect(client.options.host).toBe("localhost")
    expect(client.options.port).toBe(6380)
    expect(client.options.tls).toBeTruthy()
    client.disconnect()
  })
})
