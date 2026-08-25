import Redis from "ioredis"

import { containerRedisUri } from "../../../../test/setup/container-uris"

export function testRedisUrl(): string {
  return containerRedisUri()
}

/**
 * Zera o Redis efêmero entre testes. Abre uma conexão própria, faz FLUSHALL e
 * encerra — usar no `beforeEach` das suítes que dependem de estado de rate-limit
 * para o contador não vazar entre testes do mesmo run.
 */
export async function flushRedis(): Promise<void> {
  const redis = new Redis(testRedisUrl(), { maxRetriesPerRequest: 1 })
  try {
    await redis.flushall()
  } finally {
    await redis.quit()
  }
}
