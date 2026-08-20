import { ServiceUnavailableException } from "@nestjs/common"

import { RequestContext } from "../../../../shared/kernel/context/request-context"
import {
  IDENTITY_ACCESS,
  IDENTITY_SESSION,
} from "../../application/identity-context"
import { Session } from "../../domain/entities/session.entity"

import { AuthMiddleware } from "./auth.middleware"

import type { Clock } from "../../../../shared/kernel/clock/clock"
import type { RequestContextStore } from "../../../../shared/kernel/context/request-context"
import type { SessionProps } from "../../domain/entities/session.entity"
import type { SessionRepository } from "../../domain/ports/session.repository"
import type { TokenGenerator } from "../../domain/ports/token-generator"
import type { UserRepository } from "../../domain/ports/user.repository"
import type { NextFunction, Request, Response } from "express"

const cfg = {
  COOKIE_NAME: "__Host-rit_session",
  COOKIE_SECURE: true,
  COOKIE_SAMESITE: "lax" as const,
  SESSION_IDLE_TTL_SECONDS: 604800,
  SESSION_ABSOLUTE_TTL_SECONDS: 2592000,
  SESSION_TOUCH_INTERVAL_SECONDS: 60,
}

const NOW = new Date("2026-05-30T01:00:00Z")

function storeOf(tenantId: string | null = null): RequestContextStore {
  return {
    requestId: "r",
    correlationId: "c",
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId,
    origin: "http" as const,
    actor: null,
    extensions: new Map(),
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: 0,
  }
}

function makeSession(over: Partial<SessionProps> = {}): Session {
  const created = new Date("2026-05-30T00:00:00Z")
  return Session.fromProps({
    id: "sess-1",
    userId: "user-1",
    tokenHash: "hash-1",
    createdAt: created,
    lastSeenAt: created,
    expiresAt: new Date("2026-06-29T00:00:00Z"),
    rememberMe: true,
    ipAddress: "1.2.3.4",
    userAgent: "jest",
    deviceId: "dev-1",
    ...over,
  })
}

type Scenario = {
  cookie?: string
  session?: Session | null
  lookupThrows?: boolean
  permissions?: string[]
  master?: boolean
  deleted?: boolean
  userNotFound?: boolean
  tenantId?: string | null
}

function setup(scenario: Scenario) {
  const sessions: Partial<SessionRepository> = {
    findByTokenHash: jest.fn(async () => {
      if (scenario.lookupThrows === true) throw new Error("db down")
      return scenario.session ?? null
    }),
    touch: jest.fn(async () => undefined),
  }
  const user = {
    isMaster: () => scenario.master === true,
    isDeleted: () => scenario.deleted === true,
    props: { id: "user-1" },
  }
  const users: Partial<UserRepository> = {
    findByIdWithPermissions: jest.fn(async () =>
      scenario.userNotFound === true
        ? null
        : { user, permissions: scenario.permissions ?? [] }
    ) as UserRepository["findByIdWithPermissions"],
  }
  const tokens: TokenGenerator = {
    generate: () => ({ raw: "", hash: "" }),
    hashOf: (raw) => `hash-of:${raw}`,
    safeEqual: () => true,
  }
  const clock: Clock = { now: () => NOW }
  const ctx = new RequestContext()
  const middleware = new AuthMiddleware(
    sessions as SessionRepository,
    users as UserRepository,
    tokens,
    clock,
    cfg,
    ctx
  )

  const cleared: string[] = []
  const req = {
    cookies:
      scenario.cookie === undefined ? {} : { [cfg.COOKIE_NAME]: scenario.cookie },
  } as unknown as Request & {
    userId?: string
    sessionId?: string
    deviceId?: string | null
  }
  const res = {
    cookie: (name: string, value: string) => {
      if (value === "") cleared.push(name)
    },
  } as unknown as Response
  const next = jest.fn() as unknown as NextFunction

  const run = async () =>
    ctx.run(storeOf(scenario.tenantId ?? null), () =>
      middleware.use(req, res, next)
    )

  return { middleware, ctx, sessions, users, req, cleared, next, run }
}

describe("AuthMiddleware", () => {
  it("sem cookie segue anônimo: nenhum ator publicado e o request continua", async () => {
    const { ctx, middleware, req, next, sessions } = setup({})
    const actor = await ctx.run(storeOf(), async () => {
      await middleware.use(req, {} as unknown as Response, next)
      return ctx.getActor()
    })
    expect(actor).toBeNull()
    expect(next).toHaveBeenCalled()
    expect(sessions.findByTokenHash).not.toHaveBeenCalled()
  })

  it("cookie válido publica o ator user, a sessão e o conjunto de permissões", async () => {
    const scenario: Scenario = {
      cookie: "raw",
      session: makeSession(),
      permissions: ["admin.users.read"],
    }
    const { ctx, middleware, req, next } = setup(scenario)
    const captured = await ctx.run(storeOf(), async () => {
      await middleware.use(req, {} as unknown as Response, next)
      return {
        actor: ctx.getActor(),
        session: ctx.getExtension(IDENTITY_SESSION),
        access: ctx.getExtension(IDENTITY_ACCESS),
      }
    })
    expect(captured.actor).toEqual({ id: "user-1", kind: "user" })
    expect(captured.session).toEqual({ sessionId: "sess-1", deviceId: "dev-1" })
    expect(captured.access?.isMaster).toBe(false)
    expect([...(captured.access?.permissions ?? [])]).toEqual([
      "admin.users.read",
    ])
    expect(req.userId).toBe("user-1")
    expect(req.sessionId).toBe("sess-1")
    expect(req.deviceId).toBe("dev-1")
  })

  it("propaga o tenantId do request para o ator", async () => {
    const { ctx, middleware, req, next } = setup({
      cookie: "raw",
      session: makeSession(),
      tenantId: "tenant-9",
    })
    const actor = await ctx.run(storeOf("tenant-9"), async () => {
      await middleware.use(req, {} as unknown as Response, next)
      return ctx.getActor()
    })
    expect(actor).toEqual({
      id: "user-1",
      kind: "user",
      tenantId: "tenant-9",
    })
  })

  it("renova a sessão (touch) quando o cookie é válido", async () => {
    const { ctx, middleware, req, next, sessions } = setup({
      cookie: "raw",
      session: makeSession(),
    })
    await ctx.run(storeOf(), () =>
      middleware.use(req, {} as unknown as Response, next)
    )
    expect(sessions.touch).toHaveBeenCalledWith(
      "sess-1",
      NOW,
      new Date(NOW.getTime() + cfg.SESSION_IDLE_TTL_SECONDS * 1000)
    )
  })

  it("cookie inválido segue anônimo e apaga o cookie morto", async () => {
    const { ctx, middleware, req, next, cleared } = setup({
      cookie: "raw",
      session: null,
    })
    const res = {
      cookie: (name: string, value: string) => {
        if (value === "") cleared.push(name)
      },
    } as unknown as Response
    const actor = await ctx.run(storeOf(), async () => {
      await middleware.use(req, res, next)
      return ctx.getActor()
    })
    expect(actor).toBeNull()
    expect(cleared).toEqual([cfg.COOKIE_NAME])
    expect(next).toHaveBeenCalled()
  })

  it("sessão expirada segue anônima e apaga o cookie morto", async () => {
    const cleared: string[] = []
    const { ctx, middleware, req, next } = setup({
      cookie: "raw",
      session: makeSession({
        lastSeenAt: new Date("2020-01-01T00:00:00Z"),
        createdAt: new Date("2020-01-01T00:00:00Z"),
      }),
    })
    const res = {
      cookie: (name: string, value: string) => {
        if (value === "") cleared.push(name)
      },
    } as unknown as Response
    const actor = await ctx.run(storeOf(), async () => {
      await middleware.use(req, res, next)
      return ctx.getActor()
    })
    expect(actor).toBeNull()
    expect(cleared).toEqual([cfg.COOKIE_NAME])
  })

  it("falha de banco é fail-closed: 503, nunca segue anônimo", async () => {
    const { ctx, middleware, req, next } = setup({
      cookie: "raw",
      lookupThrows: true,
    })
    await expect(
      ctx.run(storeOf(), () =>
        middleware.use(req, {} as unknown as Response, next)
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(next).not.toHaveBeenCalled()
  })

  it("usuário excluído fica COM ator e SEM permissões (403, não 401)", async () => {
    const { ctx, middleware, req, next } = setup({
      cookie: "raw",
      session: makeSession(),
      deleted: true,
      permissions: ["admin.users.read"],
    })
    const captured = await ctx.run(storeOf(), async () => {
      await middleware.use(req, {} as unknown as Response, next)
      return {
        actor: ctx.getActor(),
        access: ctx.getExtension(IDENTITY_ACCESS),
      }
    })
    expect(captured.actor).toEqual({ id: "user-1", kind: "user" })
    expect(captured.access).toBeUndefined()
  })

  it("usuário master publica isMaster no contexto", async () => {
    const { ctx, middleware, req, next } = setup({
      cookie: "raw",
      session: makeSession(),
      master: true,
    })
    const access = await ctx.run(storeOf(), async () => {
      await middleware.use(req, {} as unknown as Response, next)
      return ctx.getExtension(IDENTITY_ACCESS)
    })
    expect(access?.isMaster).toBe(true)
  })
})
