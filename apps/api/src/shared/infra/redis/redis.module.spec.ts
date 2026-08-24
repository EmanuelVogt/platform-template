import { type Mock, describe, expect, it, vi } from "vitest"

import { RedisConnection } from "./redis.module"

import type { LoggerFactory } from "../../kernel/logging/logger.factory"
import type Redis from "ioredis"

function makeConnection(quit: Mock): {
  conn: RedisConnection
  disconnect: Mock
} {
  const disconnect = vi.fn()
  const redis = { quit, disconnect, on: vi.fn() } as unknown as Redis
  const lf = {
    forModule: () => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }),
  } as unknown as LoggerFactory
  return { conn: new RedisConnection(redis, lf), disconnect }
}

describe("RedisConnection.onApplicationShutdown", () => {
  it("quit resolve → sem disconnect forçado", async () => {
    const { conn, disconnect } = makeConnection(vi.fn().mockResolvedValue("OK"))
    await conn.onApplicationShutdown()
    expect(disconnect).not.toHaveBeenCalled()
  })

  it("quit rejeita (socket ainda conectando) → não propaga e cai para disconnect", async () => {
    const quit = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Stream isn't writeable and enableOfflineQueue options is false"
        )
      )
    const { conn, disconnect } = makeConnection(quit)
    await expect(conn.onApplicationShutdown()).resolves.toBeUndefined()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})
