import Redis from "ioredis"

import { env } from "../../../../shared/config/env"

/** Token DI da conexão Redis dedicada ao SUBSCRIBE (modo subscriber não roda comando comum). */
export const NOTIF_REDIS_SUBSCRIBER = Symbol("NOTIF_REDIS_SUBSCRIBER")

/**
 * Factory própria (NÃO .duplicate() do client de comandos): o client do app usa
 * enableOfflineQueue:false/maxRetriesPerRequest:1 — fail-fast certo pra
 * rate-limit, errado pra um subscriber que deve re-subscrever após reconnect.
 *
 * `lazyConnect: true` pelo mesmo motivo do client de comandos (ver
 * `shared/infra/redis/redis.provider.ts`): a construção do provider roda no
 * boot do Nest (`NestFactory.create`), inclusive em ferramentas que só montam
 * o grafo sem servir tráfego (ex.: export de OpenAPI) — sem lazy, o socket
 * abre à toa nesse boot.
 */
export function createNotifSubscriber(): Redis {
  return new Redis(env().REDIS_URL, { lazyConnect: true })
}
