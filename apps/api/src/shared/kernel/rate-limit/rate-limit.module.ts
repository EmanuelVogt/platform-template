import { Global, Module } from "@nestjs/common"
import { EventEmitter2 } from "@nestjs/event-emitter"

import { RedisRateLimiter } from "../../infra/rate-limit/redis-rate-limiter"
import { RedisModule } from "../../infra/redis/redis.module"
import { REDIS_CLIENT } from "../../infra/redis/redis.provider"
import { LoggerFactory } from "../logging/logger.factory"

import { InMemoryRateLimiter } from "./in-memory-rate-limiter"
import { RATE_LIMITER } from "./rate-limiter.port"
import { ResilientRateLimiter } from "./resilient-rate-limiter"

import type Redis from "ioredis"

/**
 * Seam de rate-limit do kernel. `@Global` para que qualquer módulo que importe
 * este receba `RATE_LIMITER` sem repetir a fábrica. O guard NÃO é registrado
 * aqui como APP_GUARD: a ordem em relação ao CSRF é decisão de quem expõe as
 * rotas (origem recusada não pode consumir bucket).
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [
    {
      provide: RATE_LIMITER,
      useFactory: (
        redis: Redis,
        emitter: EventEmitter2,
        loggerFactory: LoggerFactory
      ) =>
        new ResilientRateLimiter(
          new RedisRateLimiter(redis),
          new InMemoryRateLimiter(),
          emitter,
          loggerFactory
        ),
      inject: [REDIS_CLIENT, EventEmitter2, LoggerFactory],
    },
  ],
  exports: [RATE_LIMITER],
})
export class RateLimitModule {}
