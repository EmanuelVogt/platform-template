import { randomUUID } from "node:crypto"

import { Inject, Injectable } from "@nestjs/common"

import { REDIS_CLIENT } from "../redis/redis.provider"

import { SLIDING_WINDOW_SCRIPT } from "./lua-scripts"

import type {
  RateLimiter,
  RateLimitResult,
} from "../../kernel/rate-limit/rate-limiter.port"
import type Redis from "ioredis"

/**
 * Adaptador Redis da porta de rate-limit — a janela deslizante roda no script
 * Lua, atômica. Erro do Redis **propaga**: o adaptador não decide política.
 * Quem compõe (ResilientRateLimiter) é que sabe se a chave é crítica o
 * bastante para cair no fallback local ou se pode liberar.
 */
@Injectable()
export class RedisRateLimiter implements RateLimiter {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const nowMs = Date.now()
    // membro único por request: senão o ZADD sobrescreveria o score e o
    // ZCARD subcontaria requests no mesmo milissegundo.
    const member = `${nowMs}-${randomUUID()}`
    const [allowed, retryAfterSeconds] = (await this.redis.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      `ratelimit:${key}`,
      windowSeconds,
      limit,
      nowMs,
      member,
    )) as [number, number]

    return {
      allowed: allowed === 1,
      retryAfterSeconds,
    }
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`ratelimit:${key}`)
  }
}
