import { UnauthorizedException } from "@nestjs/common"
import { describe, expect, it } from "vitest"

import { IdentityAccessPolicy } from "../api/access/identity-access.policy"
import { IDENTITY_ACCESS } from "../application/identity-context"

import type { Actor, RequestContext  } from "../../../shared/kernel/context/request-context"
import type { IdentityAccess } from "../application/identity-context"

const ACTOR: Actor = { id: "user-1", kind: "user" }

function policyWith(access: IdentityAccess | undefined): IdentityAccessPolicy {
  const ctx = {
    getExtension: (key: unknown) => (key === IDENTITY_ACCESS ? access : undefined),
  } as unknown as RequestContext
  return new IdentityAccessPolicy(ctx)
}

const master: IdentityAccess = { isMaster: true, permissions: new Set<string>() }
const reader: IdentityAccess = {
  isMaster: false,
  permissions: new Set(["admin.users.read"]),
}

describe("paridade do IdentityAccessPolicy", () => {
  it("libera rota pública sem ator", () => {
    expect(policyWith(undefined).can(null, { kind: "public" })).toBe(true)
  })

  it("responde 401 em rota autenticada sem ator (contrato do front na v0.2)", () => {
    expect(() => policyWith(undefined).can(null, { kind: "authenticated" })).toThrow(
      UnauthorizedException,
    )
  })

  it("responde 401 em rota por permissão sem ator", () => {
    expect(() =>
      policyWith(reader).can(null, { kind: "permission", key: "admin.users.read" }),
    ).toThrow(UnauthorizedException)
  })

  it("libera rota autenticada para qualquer ator, mesmo sem permissões", () => {
    const access: IdentityAccess = { isMaster: false, permissions: new Set<string>() }

    expect(policyWith(access).can(ACTOR, { kind: "authenticated" })).toBe(true)
  })

  it("libera qualquer permissão para o perfil master", () => {
    expect(
      policyWith(master).can(ACTOR, { kind: "permission", key: "admin.users.delete" }),
    ).toBe(true)
  })

  it("libera a permissão concedida ao ator", () => {
    expect(policyWith(reader).can(ACTOR, { kind: "permission", key: "admin.users.read" })).toBe(
      true,
    )
  })

  it("nega a permissão ausente do ator", () => {
    expect(policyWith(reader).can(ACTOR, { kind: "permission", key: "admin.users.delete" })).toBe(
      false,
    )
  })

  it("aplica OR em anyPermission", () => {
    const requirement = {
      kind: "anyPermission",
      keys: ["admin.users.delete", "admin.users.read"],
    } as const

    expect(policyWith(reader).can(ACTOR, requirement)).toBe(true)
    expect(
      policyWith(reader).can(ACTOR, {
        kind: "anyPermission",
        keys: ["admin.users.delete", "admin.users.create"],
      }),
    ).toBe(false)
  })

  it("nega quando o AuthMiddleware não publicou o acesso do identity (fail closed)", () => {
    expect(
      policyWith(undefined).can(ACTOR, { kind: "permission", key: "admin.users.read" }),
    ).toBe(false)
  })
})
