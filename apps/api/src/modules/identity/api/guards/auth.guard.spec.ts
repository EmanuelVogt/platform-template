import {
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import {
  OptionalAuth,
  Public,
} from "../../../../shared/kernel/access/decorators"
import { RequestContext } from "../../../../shared/kernel/context/request-context"
import { Session } from "../../domain/entities/session.entity"

import { AuthGuard } from "./auth.guard"

import type { Clock } from "../../../../shared/kernel/clock/clock"
import type { SessionProps } from "../../domain/entities/session.entity"
import type { SessionRepository } from "../../domain/ports/session.repository"
import type { TokenGenerator } from "../../domain/ports/token-generator"
import type { ExecutionContext } from "@nestjs/common"

const cfg = {
  COOKIE_NAME: "__Host-rit_session",
  COOKIE_SECURE: true,
  COOKIE_SAMESITE: "lax" as const,
  SESSION_IDLE_TTL_SECONDS: 604800,
  SESSION_ABSOLUTE_TTL_SECONDS: 2592000,
  SESSION_TOUCH_INTERVAL_SECONDS: 60,
}

const STORE = {
  requestId: "r",
  correlationId: "c",
  causationId: null,
  traceId: null,
  spanId: null,
  tenantId: null,
  origin: "http" as const,
  userId: null,
  sessionId: null,
  deviceId: null,
  access: null,
  locale: "pt-BR",
  ip: null,
  userAgent: null,
  startedAt: 0,
}

function makeSession(over: Partial<SessionProps> = {}): Session {
  const now = new Date("2026-05-30T00:00:00Z")
  return Session.fromProps({
    id: "sess-1",
    userId: "user-1",
    tokenHash: "hash-1",
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date("2026-06-29T00:00:00Z"),
    rememberMe: true,
    ipAddress: "1.2.3.4",
    userAgent: "jest",
    deviceId: null,
    ...over,
  })
}

type Captured = { cookieCleared?: boolean }

function handlerOf<T extends object, K extends keyof T>(
  proto: T,
  name: K
): T[K] {
  return proto[name]
}

function makeContext(
  cookieValue: string | undefined,
  handler: () => void,
  captured: Captured
): ExecutionContext {
  const req = { cookies: cookieValue ? { [cfg.COOKIE_NAME]: cookieValue } : {} }
  const res = {
    cookie(name: string, value: string) {
      if (name === cfg.COOKIE_NAME && value === "")
        captured.cookieCleared = true
    },
  }
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext
}

function makeGuard(
  sessions: Partial<SessionRepository>,
  ctx: RequestContext,
  clockNow = new Date("2026-05-30T01:00:00Z")
): AuthGuard {
  const tokens: TokenGenerator = {
    generate: () => ({ raw: "", hash: "" }),
    hashOf: (raw) => `hash-of:${raw}`,
    safeEqual: () => true,
  }
  const clock: Clock = { now: () => clockNow }
  return new AuthGuard(
    sessions as SessionRepository,
    tokens,
    clock,
    new Reflector(),
    cfg,
    ctx
  )
}

describe("AuthGuard", () => {
  it("libera rota pública sem cookie", async () => {
    class Ctrl {
      @Public()
      h(): void {
        return
      }
    }
    const ctx = new RequestContext()
    const guard = makeGuard({}, ctx)
    const c: Captured = {}
    const result = await ctx.run(STORE, () =>
      guard.canActivate(
        makeContext(undefined, handlerOf(Ctrl.prototype, "h"), c)
      )
    )
    expect(result).toBe(true)
  })

  it("rota protegida sem cookie → 401 + Set-Cookie limpeza", async () => {
    class Ctrl {
      h(): void {
        return
      }
    }
    const ctx = new RequestContext()
    const guard = makeGuard({}, ctx)
    const c: Captured = {}
    await ctx.run({ ...STORE }, async () => {
      await expect(
        guard.canActivate(
          makeContext(undefined, handlerOf(Ctrl.prototype, "h"), c)
        )
      ).rejects.toBeInstanceOf(UnauthorizedException)
    })
    expect(c.cookieCleared).toBe(true)
  })

  it("cookie válido → popula userId e sessionId no contexto", async () => {
    class Ctrl {
      h(): void {
        return
      }
    }
    const ctx = new RequestContext()
    const sessions: Partial<SessionRepository> = {
      findByTokenHash: jest.fn().mockResolvedValue(makeSession()),
      touch: jest.fn().mockResolvedValue(undefined),
    }
    const guard = makeGuard(sessions, ctx)
    const c: Captured = {}
    const populated = await ctx.run({ ...STORE }, async () => {
      const ok = await guard.canActivate(
        makeContext("raw-token", handlerOf(Ctrl.prototype, "h"), c)
      )
      return { ok, store: ctx.get() }
    })
    expect(populated.ok).toBe(true)
    expect(populated.store.userId).toBe("user-1")
    expect(populated.store.sessionId).toBe("sess-1")
  })

  it("erro de DB → 503 (fail-closed), NUNCA anônimo", async () => {
    class Ctrl {
      h(): void {
        return
      }
    }
    const ctx = new RequestContext()
    const sessions: Partial<SessionRepository> = {
      findByTokenHash: jest.fn().mockRejectedValue(new Error("db down")),
    }
    const guard = makeGuard(sessions, ctx)
    const c: Captured = {}
    await ctx.run({ ...STORE }, async () => {
      await expect(
        guard.canActivate(
          makeContext("raw-token", handlerOf(Ctrl.prototype, "h"), c)
        )
      ).rejects.toBeInstanceOf(ServiceUnavailableException)
    })
  })

  it("@OptionalAuth sem cookie → segue anônimo (userId null), não lança", async () => {
    class Ctrl {
      @OptionalAuth()
      h(): void {
        return
      }
    }
    const ctx = new RequestContext()
    const guard = makeGuard({}, ctx)
    const c: Captured = {}
    const out = await ctx.run({ ...STORE }, async () => {
      const ok = await guard.canActivate(
        makeContext(undefined, handlerOf(Ctrl.prototype, "h"), c)
      )
      return { ok, store: ctx.get() }
    })
    expect(out.ok).toBe(true)
    expect(out.store.userId).toBeNull()
  })

  it("@OptionalAuth com cookie válido → popula userId", async () => {
    class Ctrl {
      @OptionalAuth()
      h(): void {
        return
      }
    }
    const ctx = new RequestContext()
    const sessions: Partial<SessionRepository> = {
      findByTokenHash: jest.fn().mockResolvedValue(makeSession()),
      touch: jest.fn().mockResolvedValue(undefined),
    }
    const guard = makeGuard(sessions, ctx)
    const c: Captured = {}
    const out = await ctx.run({ ...STORE }, async () => {
      const ok = await guard.canActivate(
        makeContext("raw-token", handlerOf(Ctrl.prototype, "h"), c)
      )
      return { ok, store: ctx.get() }
    })
    expect(out.ok).toBe(true)
    expect(out.store.userId).toBe("user-1")
  })

  it("@OptionalAuth com erro de DB → degrada a anônimo (NÃO 503)", async () => {
    class Ctrl {
      @OptionalAuth()
      h(): void {
        return
      }
    }
    const ctx = new RequestContext()
    const sessions: Partial<SessionRepository> = {
      findByTokenHash: jest.fn().mockRejectedValue(new Error("db down")),
    }
    const guard = makeGuard(sessions, ctx)
    const c: Captured = {}
    const out = await ctx.run({ ...STORE }, async () => {
      const ok = await guard.canActivate(
        makeContext("raw-token", handlerOf(Ctrl.prototype, "h"), c)
      )
      return { ok, store: ctx.get() }
    })
    expect(out.ok).toBe(true)
    expect(out.store.userId).toBeNull()
  })
})
