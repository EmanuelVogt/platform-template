import { HttpException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { describe, expect, it, vi } from "vitest"

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
      consume: vi
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
      consume: vi
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
    // SPEC_DEVIATION: rejects.* no lugar de try/catch com expect dentro do catch.
    // Reason: vitest/no-conditional-expect — o assert só roda se o catch for
    // alcançado; rejects garante que a promise precisa rejeitar.
    const result = guard.canActivate(makeContext(handlerOf(Ctrl.prototype, "h")))
    await expect(result).rejects.toBeInstanceOf(HttpException)
    await expect(result).rejects.toMatchObject({
      status: 429,
      response: { retryAfter: 42 },
    })
  })

  it("ignora rota sem @RateLimit", async () => {
    const consume = vi.fn()
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
