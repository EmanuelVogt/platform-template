import Redis from "ioredis"

import { testRedisUrl } from "./test-db"

/**
 * Roda em todo arquivo e2e (setupFilesAfterEnv). Flusha o Redis efêmero após
 * cada teste para o estado de rate-limit não vazar entre testes do mesmo run —
 * o Redis só guarda contadores transientes de rate-limit; o feed/sessões moram
 * no Postgres. Uma conexão por arquivo, encerrada no afterAll.
 */
let redis: Redis

beforeAll(() => {
  redis = new Redis(testRedisUrl(), { maxRetriesPerRequest: 1 })
})

afterEach(async () => {
  await redis.flushall()
})

afterAll(async () => {
  await redis.quit()
})
