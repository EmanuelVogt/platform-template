import Redis from "ioredis"

import { env } from "../../config/env"

/** Token DI do client Redis compartilhado (rate-limit, cache, BullMQ futuro). */
export const REDIS_CLIENT = Symbol("REDIS_CLIENT")

/**
 * Client Redis do app. `enableOfflineQueue: false` + `maxRetriesPerRequest: 1`
 * fazem o comando falhar rápido quando o Redis está fora, em vez de enfileirar
 * e travar o request — quem consome (rate-limit) trata o erro com fail-open. O
 * BullMQ, quando entrar, cria a própria conexão (exige maxRetriesPerRequest: null).
 *
 * `lazyConnect: true`: o socket só abre no primeiro comando, não na criação do
 * provider (que roda no boot do container Nest, antes de `app.listen()`).
 * Sem isso, ferramentas que só montam o grafo Nest sem servir requisições
 * (ex.: export de OpenAPI) abrem conexão à toa — e contra um Redis alcançável
 * que exige auth, o reconnect infinito do ioredis nunca solta o processo.
 */
export function createRedis(): Redis {
  return new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  })
}
