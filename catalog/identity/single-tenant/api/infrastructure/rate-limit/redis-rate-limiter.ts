import { randomUUID } from "node:crypto"

import { Inject, Injectable } from "@nestjs/common"

import { REDIS_CLIENT } from "../../../../shared/infra/redis/redis.provider"
import { LoggerFactory } from "../../../../shared/kernel/logging/logger.factory"

import { SLIDING_WINDOW_SCRIPT } from "./lua-scripts"

import type { AppLogger } from "../../../../shared/kernel/logging/logger.factory"
import type {
  RateLimiter,
  RateLimitResult,
} from "../../domain/ports/rate-limiter"
import type Redis from "ioredis"

@Injectable()
export class RedisRateLimiter implements RateLimiter {
  private readonly logger: AppLogger

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    loggerFactory: LoggerFactory,
  ) {
    this.logger = loggerFactory.forModule("RedisRateLimiter")
  }

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    try {
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
    } catch (error) {
      // Fail-open: rate-limit é camada protetora, não caminho crítico. Redis
      // fora não pode derrubar a auth — libera a janela até o Redis voltar.
      this.logger.warn("rate-limit fail-open: Redis indisponível", {
        err: error instanceof Error ? error.message : String(error),
      })
      return { allowed: true, retryAfterSeconds: 0 }
    }
  }
}
