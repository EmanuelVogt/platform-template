import Redis from "ioredis"

import { env } from "../../config/env"

/** Token DI do client Redis compartilhado (rate-limit, cache, BullMQ futuro). */
export const REDIS_CLIENT = Symbol("REDIS_CLIENT")

/**
 * Client Redis do app. `enableOfflineQueue: false` + `maxRetriesPerRequest: 1`
 * fazem o comando falhar rápido quando o Redis está fora, em vez de enfileirar
 * e travar o request — quem consome (rate-limit) trata o erro com fail-open. O
 * BullMQ, quando entrar, cria a própria conexão (exige maxRetriesPerRequest: null).
 */
export function createRedis(): Redis {
  return new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  })
}
