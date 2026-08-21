import "reflect-metadata"

import { ForbiddenException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import {
  ACCESS_REQUIREMENT,
  IS_MACHINE_TO_MACHINE_KEY,
} from "../../../shared/kernel/access/decorators"
import { CsrfGuard } from "../api/guards/csrf.guard"

import type { AccessRequirement } from "../../../shared/kernel/access/access-policy.port"
import type { CsrfConfig } from "../api/guards/csrf.guard"
import type { Csrf } from "../domain/ports/csrf"
import type { ExecutionContext } from "@nestjs/common"

const WEB_ORIGIN = "https://app.example.com"

const csrf: Csrf = {
  sign: (sessionId) => `token-${sessionId}`,
  verify: (sessionId, token) => token === `token-${sessionId}`,
}

function guard(sameSite: CsrfConfig["COOKIE_SAMESITE"]): CsrfGuard {
  return new CsrfGuard(new Reflector(), csrf, {
    WEB_ORIGIN,
    COOKIE_SAMESITE: sameSite,
  })
}

type FakeRequest = {
  method: string
  headers: Record<string, string | undefined>
  sessionId?: string
}

function contextFor(
  request: FakeRequest,
  metadata: Record<string, boolean | AccessRequirement> = {},
): ExecutionContext {
  const handler = (): void => undefined
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler)
  }
  class FakeController {}
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => FakeController,
  } as unknown as ExecutionContext
}

describe("paridade do CsrfGuard", () => {
  it("deixa passar método seguro sem Origin", () => {
    const context = contextFor({ method: "GET", headers: {} })

    expect(guard("lax").canActivate(context)).toBe(true)
  })

  it("barra mutação sem Origin nem Referer", () => {
    const context = contextFor({ method: "POST", headers: {} })

    expect(() => guard("lax").canActivate(context)).toThrow(ForbiddenException)
  })

  it("barra mutação com Origin de outro site", () => {
    const context = contextFor({
      method: "POST",
      headers: { origin: "https://evil.example.com" },
    })

    expect(() => guard("lax").canActivate(context)).toThrow(ForbiddenException)
  })

  it("aceita mutação com Origin do front", () => {
    const context = contextFor({ method: "POST", headers: { origin: WEB_ORIGIN } })

    expect(guard("lax").canActivate(context)).toBe(true)
  })

  it("aceita mutação sem Origin quando o Referer é do front", () => {
    const context = contextFor({
      method: "POST",
      headers: { referer: `${WEB_ORIGIN}/entrar` },
    })

    expect(guard("lax").canActivate(context)).toBe(true)
  })

  it("exige double-submit em rota autenticada quando SameSite=none", () => {
    const context = contextFor({
      method: "POST",
      headers: { origin: WEB_ORIGIN },
      sessionId: "session-1",
    })

    expect(() => guard("none").canActivate(context)).toThrow(ForbiddenException)
  })

  it("aceita double-submit com token assinado para a sessão", () => {
    const context = contextFor({
      method: "POST",
      headers: { origin: WEB_ORIGIN, "x-csrf-token": "token-session-1" },
      sessionId: "session-1",
    })

    expect(guard("none").canActivate(context)).toBe(true)
  })

  it("barra double-submit com token de outra sessão", () => {
    const context = contextFor({
      method: "POST",
      headers: { origin: WEB_ORIGIN, "x-csrf-token": "token-session-2" },
      sessionId: "session-1",
    })

    expect(() => guard("none").canActivate(context)).toThrow(ForbiddenException)
  })

  it("dispensa double-submit em rota pública (pré-login não tem sessão)", () => {
    const context = contextFor(
      { method: "POST", headers: { origin: WEB_ORIGIN } },
      { [ACCESS_REQUIREMENT]: { kind: "public" } },
    )

    expect(guard("none").canActivate(context)).toBe(true)
  })

  it("dispensa a checagem de Origin em rota máquina-a-máquina", () => {
    const context = contextFor(
      { method: "POST", headers: {} },
      { [IS_MACHINE_TO_MACHINE_KEY]: true },
    )

    expect(guard("lax").canActivate(context)).toBe(true)
  })
})
