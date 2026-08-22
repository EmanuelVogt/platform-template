import { Reflector } from "@nestjs/core"
import { type Mock, describe, expect, it, vi } from "vitest"

import { TooManyRequestsError } from "../errors/too-many-requests.error"

import { RateLimit, RATE_LIMIT_KEY } from "./rate-limit.decorator"
import { RateLimitGuard } from "./rate-limit.guard"

import type { RateLimiter } from "./rate-limiter.port"
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

function makeLimiter(result: {
  allowed: boolean
  retryAfterSeconds: number
}): RateLimiter & { consume: Mock; reset: Mock } {
  return {
    consume: vi.fn().mockResolvedValue(result),
    reset: vi.fn().mockResolvedValue(undefined),
  }
}

describe("RateLimitGuard (kernel)", () => {
  it("permite quando o limiter retorna allowed", async () => {
    const limiter = makeLimiter({ allowed: true, retryAfterSeconds: 0 })
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

  it("lança TooManyRequestsError com o retryAfter do limiter", async () => {
    const limiter = makeLimiter({ allowed: false, retryAfterSeconds: 42 })
    class Ctrl {
      @RateLimit({ limit: 10, windowSeconds: 60 })
      h(): void {
        return
      }
    }
    const guard = new RateLimitGuard(limiter, new Reflector())
    // `null` quando resolve: a primeira asserção falha se o guard não rejeitar.
    const rejection = await guard
      .canActivate(makeContext(handlerOf(Ctrl.prototype, "h")))
      .then(
        () => null,
        (err: unknown) => err
      )
    expect(rejection).toBeInstanceOf(TooManyRequestsError)
    expect((rejection as TooManyRequestsError).status).toBe(429)
    expect((rejection as TooManyRequestsError).retryAfterSeconds).toBe(42)
  })

  it("ignora rota sem @RateLimit", async () => {
    const limiter = makeLimiter({ allowed: true, retryAfterSeconds: 0 })
    class Ctrl {
      h(): void {
        return
      }
    }
    const guard = new RateLimitGuard(limiter, new Reflector())
    await expect(
      guard.canActivate(makeContext(handlerOf(Ctrl.prototype, "h")))
    ).resolves.toBe(true)
    expect(limiter.consume).not.toHaveBeenCalled()
  })

  it("consome a chave ip:<ip>:<rota> com o limite e a janela da metadata", async () => {
    const limiter = makeLimiter({ allowed: true, retryAfterSeconds: 0 })
    class Ctrl {
      @RateLimit({ limit: 10, windowSeconds: 60 })
      h(): void {
        return
      }
    }
    const guard = new RateLimitGuard(limiter, new Reflector())
    await guard.canActivate(
      makeContext(handlerOf(Ctrl.prototype, "h"), "9.9.9.9")
    )
    expect(limiter.consume).toHaveBeenCalledWith(
      "ip:9.9.9.9:/auth/login",
      10,
      60,
      { critical: undefined }
    )
  })

  it("repassa critical da metadata para o consume", async () => {
    const limiter = makeLimiter({ allowed: true, retryAfterSeconds: 0 })
    class Ctrl {
      @RateLimit({ limit: 10, windowSeconds: 60, critical: true })
      h(): void {
        return
      }
    }
    const guard = new RateLimitGuard(limiter, new Reflector())
    await guard.canActivate(makeContext(handlerOf(Ctrl.prototype, "h")))
    expect(limiter.consume).toHaveBeenCalledWith(
      "ip:1.2.3.4:/auth/login",
      10,
      60,
      { critical: true }
    )
  })

  it("expõe a chave de metadata do kernel", () => {
    expect(RATE_LIMIT_KEY).toBe("kernel:rateLimit")
  })

  it("guarda { limit, windowSeconds, critical } sob a chave do kernel", () => {
    class Ctrl {
      @RateLimit({ limit: 3, windowSeconds: 15, critical: true })
      h(): void {
        return
      }
    }
    expect(
      new Reflector().get(RATE_LIMIT_KEY, handlerOf(Ctrl.prototype, "h"))
    ).toEqual({ limit: 3, windowSeconds: 15, critical: true })
  })
})
