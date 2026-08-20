import { UnauthorizedException } from "@nestjs/common"

import { RequestContext } from "../../../../shared/kernel/context/request-context"
import { IDENTITY_ACCESS } from "../../application/identity-context"

import { IdentityAccessPolicy } from "./identity-access.policy"

import type { AccessRequirement } from "../../../../shared/kernel/access/access-policy.port"
import type {
  Actor,
  RequestContextStore,
} from "../../../../shared/kernel/context/request-context"

const ACTOR: Actor = { id: "user-1", kind: "user" }

const PUBLIC: AccessRequirement = { kind: "public" }
const AUTHENTICATED: AccessRequirement = { kind: "authenticated" }
const PERMISSION: AccessRequirement = {
  kind: "permission",
  key: "admin.users.read",
}

const ANY_PERMISSION: AccessRequirement = {
  kind: "anyPermission",
  keys: ["admin.users.audit.read", "admin.tags.audit.read"],
}

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

function decide(
  actor: Actor | null,
  requirement: AccessRequirement,
  access?: { permissions: string[]; isMaster: boolean }
): boolean {
  const ctx = new RequestContext()
  const policy = new IdentityAccessPolicy(ctx)
  return ctx.run(storeOf(), () => {
    if (access !== undefined) {
      ctx.setExtension(IDENTITY_ACCESS, {
        permissions: new Set(access.permissions),
        isMaster: access.isMaster,
      })
    }
    return policy.can(actor, requirement)
  })
}

describe("IdentityAccessPolicy", () => {
  it("rota pública passa sem ator", () => {
    expect(decide(null, PUBLIC)).toBe(true)
  })

  it("rota autenticada sem ator responde 401, não 403", () => {
    expect(() => decide(null, AUTHENTICATED)).toThrow(UnauthorizedException)
  })

  it("rota de permissão sem ator responde 401, não 403", () => {
    expect(() => decide(null, PERMISSION)).toThrow(UnauthorizedException)
  })

  it("rota autenticada só exige ator — não exige permissão nenhuma", () => {
    expect(decide(ACTOR, AUTHENTICATED)).toBe(true)
  })

  it("libera quando o ator tem a permissão exigida", () => {
    expect(
      decide(ACTOR, PERMISSION, {
        permissions: ["admin.users.read"],
        isMaster: false,
      })
    ).toBe(true)
  })

  it("nega quando o ator não tem a permissão exigida", () => {
    expect(
      decide(ACTOR, PERMISSION, {
        permissions: ["admin.users.write"],
        isMaster: false,
      })
    ).toBe(false)
  })

  it("master passa sem ter a chave (bypass)", () => {
    expect(decide(ACTOR, PERMISSION, { permissions: [], isMaster: true })).toBe(
      true
    )
  })

  it("ator sem permissões publicadas (usuário excluído) é negado", () => {
    expect(decide(ACTOR, PERMISSION)).toBe(false)
  })

  describe("requisito OR (anyPermission)", () => {
    it("libera com uma única das chaves exigidas", () => {
      expect(
        decide(ACTOR, ANY_PERMISSION, {
          permissions: ["admin.tags.audit.read"],
          isMaster: false,
        })
      ).toBe(true)
    })

    it("nega quando o ator não tem nenhuma das chaves", () => {
      expect(
        decide(ACTOR, ANY_PERMISSION, {
          permissions: ["admin.users.read"],
          isMaster: false,
        })
      ).toBe(false)
    })

    it("master passa sem ter chave nenhuma (bypass)", () => {
      expect(
        decide(ACTOR, ANY_PERMISSION, { permissions: [], isMaster: true })
      ).toBe(true)
    })

    it("sem ator responde 401, não 403", () => {
      expect(() => decide(null, ANY_PERMISSION)).toThrow(UnauthorizedException)
    })

    it("ator sem permissões publicadas é negado", () => {
      expect(decide(ACTOR, ANY_PERMISSION)).toBe(false)
    })
  })
})
