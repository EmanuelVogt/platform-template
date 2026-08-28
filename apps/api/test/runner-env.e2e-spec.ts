import Redis from "ioredis"
import { describe, expect, it } from "vitest"

import { testRedisUrl } from "../src/shared/test/int/redis"

async function withRedis<T>(use: (redis: Redis) => Promise<T>): Promise<T> {
  const redis = new Redis(testRedisUrl(), { maxRetriesPerRequest: 1 })
  try {
    return await use(redis)
  } finally {
    await redis.quit()
  }
}

/**
 * RUN-03: as travas de ambiente do tier e2e. Sem elas um e2e que dispara e-mail
 * bate na API real do Resend (o .env de dev traz chave real), e o estado de
 * rate-limit vaza de um teste para o outro.
 */
describe("travas de ambiente do tier e2e", () => {
  it("prende o mailer no transporte de log, sem credencial de envio real", () => {
    expect(process.env.MAIL_TRANSPORT).toBe("log")
    expect(process.env.RESEND_API_KEY).toBeUndefined()
    expect(process.env.MAIL_FROM).toBeUndefined()
  })

  it("preenche o storage com credenciais descartáveis", () => {
    expect({
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
      bucket: process.env.STORAGE_BUCKET,
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION,
    }).toEqual({
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      bucket: "test-bucket",
      endpoint: "https://test.r2.cloudflarestorage.com",
      region: "test-region",
    })
  })

  it("começa com o Redis do run vazio", async () => {
    expect(await withRedis((redis) => redis.dbsize())).toBe(0)
  })

  it("enche o Redis para o hook de limpeza ter o que apagar", async () => {
    const size = await withRedis(async (redis) => {
      await redis.set("rate-limit:runner-env", "1")
      return redis.dbsize()
    })

    expect(size).toBe(1)
  })

  it("volta vazio: o hook após cada teste flusha o Redis", async () => {
    expect(await withRedis((redis) => redis.dbsize())).toBe(0)
  })
})
