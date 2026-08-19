import Redis from "ioredis"

import { env } from "../../../../shared/config/env"

/** Token DI da conexão Redis dedicada ao SUBSCRIBE (modo subscriber não roda comando comum). */
export const NOTIF_REDIS_SUBSCRIBER = Symbol("NOTIF_REDIS_SUBSCRIBER")

/**
 * Factory própria (NÃO .duplicate() do client de comandos): o client do app usa
 * enableOfflineQueue:false/maxRetriesPerRequest:1 — fail-fast certo pra
 * rate-limit, errado pra um subscriber que deve re-subscrever após reconnect.
 */
export function createNotifSubscriber(): Redis {
  return new Redis(env().REDIS_URL)
}
