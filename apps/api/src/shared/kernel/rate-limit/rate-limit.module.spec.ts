import {
  GLOBAL_MODULE_METADATA,
  MODULE_METADATA,
} from "@nestjs/common/constants"
import { APP_GUARD } from "@nestjs/core"
import { EventEmitter2 } from "@nestjs/event-emitter"
import { describe, expect, it } from "vitest"

import { RedisModule } from "../../infra/redis/redis.module"
import { LoggerFactory } from "../logging/logger.factory"

import { RateLimitModule } from "./rate-limit.module"
import { RATE_LIMITER } from "./rate-limiter.port"
import { ResilientRateLimiter } from "./resilient-rate-limiter"

type FactoryProvider = {
  provide: unknown
  useFactory: (...args: unknown[]) => unknown
  inject: unknown[]
}

function providersOf(): FactoryProvider[] {
  return (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RateLimitModule) ??
    []) as FactoryProvider[]
}

describe("RateLimitModule", () => {
  it("é @Global — quem importa recebe RATE_LIMITER sem repetir a fábrica", () => {
    expect(Reflect.getMetadata(GLOBAL_MODULE_METADATA, RateLimitModule)).toBe(
      true
    )
  })

  it("importa RedisModule (fonte do REDIS_CLIENT da fábrica)", () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, RateLimitModule)
    ).toContain(RedisModule)
  })

  it("provê e exporta RATE_LIMITER", () => {
    expect(providersOf().map((p) => p.provide)).toContain(RATE_LIMITER)
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, RateLimitModule)
    ).toContain(RATE_LIMITER)
  })

  it("RATE_LIMITER é o composite resiliente, montado com Redis e EventEmitter2", () => {
    const provider = providersOf().find((p) => p.provide === RATE_LIMITER)
    expect(provider?.inject).toEqual([
      expect.anything(),
      EventEmitter2,
      LoggerFactory,
    ])
    const instance = provider?.useFactory(
      {},
      new EventEmitter2(),
      { forModule: () => ({ warn: () => undefined }) }
    )
    expect(instance).toBeInstanceOf(ResilientRateLimiter)
  })

  it("não registra o guard como APP_GUARD — a ordem com o CSRF é do módulo de rotas", () => {
    expect(providersOf().map((p) => p.provide)).not.toContain(APP_GUARD)
  })
})
