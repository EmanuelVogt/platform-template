import { RequestContext } from "../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../shared/kernel/errors/forbidden.error"

import { assertPermission } from "./assert-permission"
import { IDENTITY_ACCESS } from "./identity-context"

import type { RequestContextStore } from "../../../shared/kernel/context/request-context"
import type { PermissionKey } from "../domain/permissions/permission-catalog"
import { describe, expect, it } from "vitest"

function storeOf(): RequestContextStore {
  return {
    requestId: "r",
    correlationId: "c",
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId: null,
    origin: "http" as const,
    actor: null,
    extensions: new Map(),
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: 0,
  }
}

function check(
  key: PermissionKey,
  access?: { permissions: string[]; isMaster: boolean }
): () => void {
  const ctx = new RequestContext()
  return () =>
    ctx.run(storeOf(), () => {
      if (access !== undefined) {
        ctx.setExtension(IDENTITY_ACCESS, {
          permissions: new Set(access.permissions),
          isMaster: access.isMaster,
        })
      }
      assertPermission(key)
    })
}

describe("assertPermission", () => {
  it("passa quando o ator tem a chave", () => {
    expect(
      check("admin.users.trash.read", {
        permissions: ["admin.users.read", "admin.users.trash.read"],
        isMaster: false,
      })
    ).not.toThrow()
  })

  it("nega com 403 quando o ator não tem a chave", () => {
    const run = check("admin.users.trash.read", {
      permissions: ["admin.users.read"],
      isMaster: false,
    })
    expect(run).toThrow(ForbiddenError)
    try {
      run()
      fail("deveria ter lançado")
    } catch (error) {
      expect((error as ForbiddenError).status).toBe(403)
    }
  })

  it("master passa sem a chave", () => {
    expect(
      check("admin.users.trash.read", { permissions: [], isMaster: true })
    ).not.toThrow()
  })

  it("sem contexto de acesso no request nega, nunca passa", () => {
    expect(check("admin.users.trash.read")).toThrow(ForbiddenError)
  })

  it("fora de um escopo de request nega, nunca passa", () => {
    expect(() => { assertPermission("admin.users.trash.read"); }).toThrow(
      ForbiddenError
    )
  })
})
