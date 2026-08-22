import "reflect-metadata"

import { RequestMethod } from "@nestjs/common"
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants"
import { describe, expect, it } from "vitest"

import { ACCESS_REQUIREMENT } from "../../../shared/kernel/access/decorators"
import { RATE_LIMIT_KEY } from "../../../shared/kernel/rate-limit/rate-limit.decorator"
import { CONTROLLERS } from "../api/controllers"

import type { AccessRequirement } from "../../../shared/kernel/access/access-policy.port"
import type { RateLimitConfig } from "../../../shared/kernel/rate-limit/rate-limiter.port"

const VERBS: Record<number, string> = {
  [RequestMethod.GET]: "GET",
  [RequestMethod.POST]: "POST",
  [RequestMethod.PUT]: "PUT",
  [RequestMethod.PATCH]: "PATCH",
  [RequestMethod.DELETE]: "DELETE",
}

const AUTHENTICATED: AccessRequirement = { kind: "authenticated" }
const PUBLIC: AccessRequirement = { kind: "public" }
const permission = (key: string): AccessRequirement => ({ kind: "permission", key })

/** Exigência de acesso de cada rota do identity na v0.2 — a tabela que a
 *  entrada promete reproduzir. Rota nova sem linha aqui reprova o teste. */
const EXPECTED: Record<string, AccessRequirement> = {
  "POST auth/login": PUBLIC,
  "POST auth/forgot-password": PUBLIC,
  "POST auth/reset-password": PUBLIC,
  "POST auth/set-password": PUBLIC,
  "POST auth/verify-email": PUBLIC,
  "GET auth/access-link": PUBLIC,
  "POST auth/access-link/cancel": PUBLIC,
  "POST auth/access-link/avatar": PUBLIC,
  "GET auth/email-change": PUBLIC,
  "POST auth/confirm-email-change": PUBLIC,
  "GET auth/session": AUTHENTICATED,
  "POST auth/logout": AUTHENTICATED,
  "POST auth/change-password": AUTHENTICATED,
  "POST auth/resend-verification": AUTHENTICATED,
  "GET auth/access-history": AUTHENTICATED,
  "PATCH auth/profile": AUTHENTICATED,
  "POST auth/avatar": AUTHENTICATED,
  "POST auth/change-email": AUTHENTICATED,
  "GET auth/devices": AUTHENTICATED,
  "DELETE auth/devices": AUTHENTICATED,
  "DELETE auth/devices/{id}": AUTHENTICATED,
  "GET access-catalog": AUTHENTICATED,
  "GET admin/users": permission("admin.users.read"),
  "POST admin/users": permission("admin.users.create"),
  "PUT admin/users/{id}": permission("admin.users.update"),
  "DELETE admin/users/{id}": permission("admin.users.delete"),
  "POST admin/users/restore": permission("admin.users.trash.restore"),
  "POST admin/users/purge": permission("admin.users.trash.purge"),
  "POST admin/users/{id}/resend-access-link": permission("admin.users.access_link.resend"),
  "GET admin/permission-templates": permission("admin.permission_templates.read"),
  "POST admin/permission-templates": permission("admin.permission_templates.create"),
  "GET admin/permission-templates/{id}": permission("admin.permission_templates.read"),
  "PUT admin/permission-templates/{id}": permission("admin.permission_templates.update"),
  "DELETE admin/permission-templates/{id}": permission("admin.permission_templates.delete"),
}

/** Rotas marcadas com `@SelfService()` — o decorator escreve
 *  `ACCESS_REQUIREMENT: authenticated`, nenhuma depende do default do kernel. */
const SELF_SERVICE = [
  "GET auth/session",
  "POST auth/logout",
  "POST auth/change-password",
  "POST auth/resend-verification",
  "GET auth/access-history",
  "PATCH auth/profile",
  "POST auth/avatar",
  "POST auth/change-email",
  "GET auth/devices",
  "DELETE auth/devices",
  "DELETE auth/devices/{id}",
  "GET access-catalog",
]

/** Rotas não autenticadas cujo teto continua valendo com o Redis fora
 *  (`critical`): são as que um atacante alcança sem sessão. Marcar uma rota
 *  autenticada aqui gastaria a janela local de graça. */
const CRITICAL_ROUTES = [
  "POST auth/login",
  "POST auth/forgot-password",
  "POST auth/reset-password",
  "POST auth/verify-email",
  "POST auth/set-password",
  "POST auth/resend-verification",
  "GET auth/access-link",
  "POST auth/access-link/cancel",
]

type Route = {
  key: string
  explicit: AccessRequirement | undefined
  rateLimit: RateLimitConfig | undefined
}

function trim(segment: string): string {
  return segment.replace(/^\/+/, "").replace(/\/+$/, "")
}

function collectRoutes(): Route[] {
  const routes: Route[] = []
  for (const controller of CONTROLLERS) {
    const base = trim(String(Reflect.getMetadata(PATH_METADATA, controller) ?? ""))
    const prototype = controller.prototype as unknown as Record<string, unknown>
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === "constructor") continue
      const handler = prototype[name]
      if (typeof handler !== "function") continue
      const verb = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined
      if (verb === undefined) continue
      const suffix = trim(String(Reflect.getMetadata(PATH_METADATA, handler) ?? ""))
      const path = [base, suffix].filter(Boolean).join("/").replace(/:(\w+)/g, "{$1}")
      routes.push({
        key: `${VERBS[verb]} ${path}`,
        explicit: Reflect.getMetadata(ACCESS_REQUIREMENT, handler) as AccessRequirement | undefined,
        rateLimit: Reflect.getMetadata(RATE_LIMIT_KEY, handler) as RateLimitConfig | undefined,
      })
    }
  }
  return routes
}

describe("paridade de acesso das rotas do identity", () => {
  const routes = collectRoutes()

  it("expõe exatamente as rotas da v0.2, sem rota nova nem removida", () => {
    expect(routes.map((route) => route.key).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  it.each(Object.entries(EXPECTED))("%s mantém a exigência de acesso da v0.2", (key, expected) => {
    const route = routes.find((candidate) => candidate.key === key)

    expect(route).toBeDefined()
    expect(route?.explicit ?? AUTHENTICATED).toEqual(expected)
  })

  it("nenhuma rota depende do default fail-closed do kernel", () => {
    const implicit = routes.filter((route) => route.explicit === undefined).map((route) => route.key)

    expect(implicit).toEqual([])
  })

  it("as rotas self-service declaram authenticated explicitamente", () => {
    const authenticated = routes
      .filter((route) => route.explicit?.kind === "authenticated")
      .map((route) => route.key)

    expect(authenticated.sort()).toEqual([...SELF_SERVICE].sort())
  })

  it("exatamente as rotas não autenticadas de auth são critical", () => {
    const critical = routes
      .filter((route) => route.rateLimit?.critical === true)
      .map((route) => route.key)

    expect(critical.sort()).toEqual([...CRITICAL_ROUTES].sort())
  })

  it("as demais rotas com rate-limit seguem sem critical (fail open na queda)", () => {
    const nonCritical = routes.filter(
      (route) => route.rateLimit !== undefined && route.rateLimit.critical !== true,
    )

    expect(nonCritical).toHaveLength(19)
  })
})
