import { ForbiddenException } from "@nestjs/common"
import { describe, expect, it } from "vitest"

import {
  ACCESS_REQUIREMENT,
  IS_MACHINE_TO_MACHINE_KEY,
} from "../../../../shared/kernel/access/decorators"
import { HmacCsrf } from "../../infrastructure/hashing/hmac-csrf"

import { CsrfGuard, type CsrfConfig } from "./csrf.guard"

import type { Csrf } from "../../domain/ports/csrf"
import type { ExecutionContext } from "@nestjs/common"
import type { Reflector } from "@nestjs/core"

const baseCfg = {
  WEB_ORIGIN: "http://localhost:5173",
  COOKIE_SAMESITE: "lax" as const,
}

function makeContext(opts: {
  method: string
  origin?: string
  referer?: string
  sessionId?: string
  csrfHeader?: string
}): ExecutionContext {
  const headers: Record<string, string> = {}
  if (opts.origin) headers.origin = opts.origin
  if (opts.referer) headers.referer = opts.referer
  if (opts.csrfHeader) headers["x-csrf-token"] = opts.csrfHeader
  const req = { method: opts.method, headers, sessionId: opts.sessionId }
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext
}

function makeGuard(
  csrf: Csrf,
  cfg: CsrfConfig,
  isPublic = false,
  isMachineToMachine = false,
): CsrfGuard {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === IS_MACHINE_TO_MACHINE_KEY) return isMachineToMachine
      if (key === ACCESS_REQUIREMENT) {
        return isPublic ? { kind: "public" } : { kind: "authenticated" }
      }
      return undefined
    },
  } as unknown as Reflector
  return new CsrfGuard(reflector, csrf, cfg)
}

const noopCsrf: Csrf = { sign: () => "", verify: () => true }

describe("CsrfGuard — Origin/Referer (lax)", () => {
  it("permite GET sem Origin (método safe)", () => {
    const guard = makeGuard(noopCsrf, baseCfg)
    expect(guard.canActivate(makeContext({ method: "GET" }))).toBe(true)
  })

  it("permite POST com Origin igual ao WEB_ORIGIN", () => {
    const guard = makeGuard(noopCsrf, baseCfg)
    expect(
      guard.canActivate(
        makeContext({ method: "POST", origin: "http://localhost:5173" }),
      ),
    ).toBe(true)
  })

  it("403 em POST com Origin divergente", () => {
    const guard = makeGuard(noopCsrf, baseCfg)
    expect(() =>
      guard.canActivate(
        makeContext({ method: "POST", origin: "http://evil.example" }),
      ),
    ).toThrow(ForbiddenException)
  })

  it("403 em POST sem Origin nem Referer", () => {
    const guard = makeGuard(noopCsrf, baseCfg)
    expect(() =>
      guard.canActivate(makeContext({ method: "POST" })),
    ).toThrow(ForbiddenException)
  })

  it("rota máquina-a-máquina passa sem Origin (ADR 0074)", () => {
    const guard = makeGuard(noopCsrf, baseCfg, true, true)
    expect(guard.canActivate(makeContext({ method: "POST" }))).toBe(true)
  })

  it("rota máquina-a-máquina não afrouxa as demais", () => {
    const guard = makeGuard(noopCsrf, baseCfg, true, false)
    expect(() => guard.canActivate(makeContext({ method: "POST" }))).toThrow(
      ForbiddenException,
    )
  })

  it("cai no Referer quando Origin ausente", () => {
    const guard = makeGuard(noopCsrf, baseCfg)
    expect(
      guard.canActivate(
        makeContext({ method: "POST", referer: "http://localhost:5173/login" }),
      ),
    ).toBe(true)
  })
})

describe("CsrfGuard — SameSite=none (double-submit ancorado no sessionId)", () => {
  const csrf = new HmacCsrf("z".repeat(32))
  const cfg = { ...baseCfg, COOKIE_SAMESITE: "none" as const }
  const sessionId = "sess-1"
  const token = csrf.sign(sessionId)

  it("token do sessionId corrente + Origin ok → true", () => {
    const guard = makeGuard(csrf, cfg)
    expect(
      guard.canActivate(
        makeContext({
          method: "POST",
          origin: "http://localhost:5173",
          sessionId,
          csrfHeader: token,
        }),
      ),
    ).toBe(true)
  })

  it("token de OUTRO sessionId → 403", () => {
    const guard = makeGuard(csrf, cfg)
    expect(() =>
      guard.canActivate(
        makeContext({
          method: "POST",
          origin: "http://localhost:5173",
          sessionId,
          csrfHeader: csrf.sign("sess-2"),
        }),
      ),
    ).toThrow(ForbiddenException)
  })

  it("sem sessionId (com token) → 403", () => {
    const guard = makeGuard(csrf, cfg)
    expect(() =>
      guard.canActivate(
        makeContext({
          method: "POST",
          origin: "http://localhost:5173",
          csrfHeader: token,
        }),
      ),
    ).toThrow(ForbiddenException)
  })

  it("sessionId sem header → 403", () => {
    const guard = makeGuard(csrf, cfg)
    expect(() =>
      guard.canActivate(
        makeContext({
          method: "POST",
          origin: "http://localhost:5173",
          sessionId,
        }),
      ),
    ).toThrow(ForbiddenException)
  })

  it("rota @Public (sem sessionId/token) pula o double-submit (só Origin)", () => {
    const guard = makeGuard(csrf, cfg, true)
    expect(
      guard.canActivate(
        makeContext({ method: "POST", origin: "http://localhost:5173" }),
      ),
    ).toBe(true)
  })
})
