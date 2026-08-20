import { HttpException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import { RateLimitGuard, RATE_LIMIT_KEY, RateLimit } from "./rate-limit.guard"

import type { RateLimiter } from "../../domain/ports/rate-limiter"
import type { ExecutionContext } from "@nestjs/common"

function handlerOf<T extends object, K extends keyof T>(
  proto: T,
  name: K
): T[K] {
  return proto[name]
}

function makeContext(handler: () => void, ip = "1.2.3.4"): ExecutionContext {
  const req = {
    ip,
    route: { path: "/auth/login" },
    originalUrl: "/v1/auth/login",
  }
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext
}

describe("RateLimitGuard", () => {
  it("permite quando o limiter retorna allowed", async () => {
    const limiter: RateLimiter = {
      consume: jest
        .fn()
        .mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    }
    class Ctrl {
      @RateLimit({ limit: 10, windowSeconds: 60 })
      h(): void {
        return
      }
    }
    const guard = new RateLimitGuard(limiter, new Reflector())
    await expect(
      guard.canActivate(makeContext(handlerOf(Ctrl.prototype, "h")))
    ).resolves.toBe(true)
  })

  it("lança 429 com retryAfter quando bloqueado", async () => {
    const limiter: RateLimiter = {
      consume: jest
        .fn()
        .mockResolvedValue({ allowed: false, retryAfterSeconds: 42 }),
    }
    class Ctrl {
      @RateLimit({ limit: 10, windowSeconds: 60 })
      h(): void {
        return
      }
    }
    const guard = new RateLimitGuard(limiter, new Reflector())
    try {
      await guard.canActivate(makeContext(handlerOf(Ctrl.prototype, "h")))
      throw new Error("deveria ter lançado")
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException)
      expect((err as HttpException).getStatus()).toBe(429)
      expect((err as HttpException).getResponse()).toMatchObject({
        retryAfter: 42,
      })
    }
  })

  it("ignora rota sem @RateLimit", async () => {
    const consume = jest.fn()
    const limiter: RateLimiter = { consume }
    class Ctrl {
      h(): void {
        return
      }
    }
    const guard = new RateLimitGuard(limiter, new Reflector())
    await expect(
      guard.canActivate(makeContext(handlerOf(Ctrl.prototype, "h")))
    ).resolves.toBe(true)
    expect(consume).not.toHaveBeenCalled()
  })

  it("exporta a chave de metadata", () => {
    expect(typeof RATE_LIMIT_KEY).toBe("string")
  })
})
