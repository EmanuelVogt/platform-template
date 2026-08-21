import "reflect-metadata"

import { Reflector } from "@nestjs/core"

import { ForbiddenError } from "../errors/forbidden.error"

import { AccessPolicyMissingError } from "./access.errors"
import { AccessGuard } from "./access.guard"
import {
  Authenticated,
  OptionalAuth,
  Public,
  RequireAnyPermission,
  RequirePermission,
} from "./decorators"

import type { AccessPolicy, AccessRequirement } from "./access-policy.port"
import type { ExecutionContext } from "@nestjs/common"

jest.mock("../context/request-context", () => ({
  getActor: jest.fn(),
}))

const { getActor } = jest.requireMock<{
  getActor: jest.Mock
}>("../context/request-context")

class Routes {
  @Public()
  publicRoute(): void {
    return
  }

  @Authenticated()
  authenticatedRoute(): void {
    return
  }

  @RequirePermission("admin.users.read")
  permissionRoute(): void {
    return
  }

  @OptionalAuth()
  optionalRoute(): void {
    return
  }

  @RequireAnyPermission(["admin.users.audit.read", "admin.tags.audit.read"])
  anyPermissionRoute(): void {
    return
  }

  undecoratedRoute(): void {
    return
  }
}

function contextFor(route: keyof Routes): ExecutionContext {
  return {
    getHandler: () => Routes.prototype[route],
    getClass: () => Routes,
  } as unknown as ExecutionContext
}

function policyReturning(
  result: boolean | Promise<boolean>
): AccessPolicy & { can: jest.Mock } {
  return { can: jest.fn().mockReturnValue(result) }
}

function guardWithout(): AccessGuard {
  return new AccessGuard(new Reflector())
}

function guardWith(policy: AccessPolicy): AccessGuard {
  return new AccessGuard(new Reflector(), policy)
}

describe("AccessGuard", () => {
  beforeEach(() => {
    getActor.mockReset()
    getActor.mockReturnValue(null)
  })

  describe("sem provider de ACCESS_POLICY", () => {
    it("libera a rota pública", async () => {
      await expect(
        guardWithout().canActivate(contextFor("publicRoute"))
      ).resolves.toBe(true)
    })

    it("nega a rota de permissão com 403 access-policy-missing", async () => {
      const promise = guardWithout().canActivate(contextFor("permissionRoute"))

      await expect(promise).rejects.toBeInstanceOf(AccessPolicyMissingError)
      await expect(promise).rejects.toMatchObject({
        status: 403,
        type: "https://errors.example.com/access-policy-missing",
      })
    })

    it("nega a rota autenticada — ausência de política não libera", async () => {
      await expect(
        guardWithout().canActivate(contextFor("authenticatedRoute"))
      ).rejects.toBeInstanceOf(AccessPolicyMissingError)
    })
  })

  describe("com provider de ACCESS_POLICY", () => {
    it("libera a rota pública sem consultar a política", async () => {
      const policy = policyReturning(false)

      await expect(
        guardWith(policy).canActivate(contextFor("publicRoute"))
      ).resolves.toBe(true)
      expect(policy.can).not.toHaveBeenCalled()
    })

    it("libera quando a política responde true", async () => {
      await expect(
        guardWith(policyReturning(true)).canActivate(
          contextFor("permissionRoute")
        )
      ).resolves.toBe(true)
    })

    it("nega com 403 quando a política responde false", async () => {
      const promise = guardWith(policyReturning(false)).canActivate(
        contextFor("permissionRoute")
      )

      await expect(promise).rejects.toBeInstanceOf(ForbiddenError)
      await expect(promise).rejects.toMatchObject({ status: 403 })
    })

    it("aguarda a política assíncrona antes de negar", async () => {
      await expect(
        guardWith(policyReturning(Promise.resolve(false))).canActivate(
          contextFor("permissionRoute")
        )
      ).rejects.toBeInstanceOf(ForbiddenError)
    })

    it("passa o ator do contexto e o requisito da rota para a política", async () => {
      const actor = { id: "user-1", kind: "user" }
      getActor.mockReturnValue(actor)
      const policy = policyReturning(true)

      await guardWith(policy).canActivate(contextFor("permissionRoute"))

      expect(policy.can).toHaveBeenCalledWith(actor, {
        kind: "permission",
        key: "admin.users.read",
      } satisfies AccessRequirement)
    })

    it("rota @OptionalAuth chega no handler sem ator e sem consultar a política", async () => {
      const policy = policyReturning(false)

      await expect(
        guardWith(policy).canActivate(contextFor("optionalRoute"))
      ).resolves.toBe(true)
      expect(policy.can).not.toHaveBeenCalled()
    })

    it("encaminha o requisito OR do @RequireAnyPermission para a política", async () => {
      const policy = policyReturning(true)

      await guardWith(policy).canActivate(contextFor("anyPermissionRoute"))

      expect(policy.can).toHaveBeenCalledWith(null, {
        kind: "anyPermission",
        keys: ["admin.users.audit.read", "admin.tags.audit.read"],
      } satisfies AccessRequirement)
    })

    it("nega com 403 a rota OR quando a política responde false", async () => {
      await expect(
        guardWith(policyReturning(false)).canActivate(
          contextFor("anyPermissionRoute")
        )
      ).rejects.toBeInstanceOf(ForbiddenError)
    })

    it("handler sem decorator exige ator autenticado (fail closed)", async () => {
      const policy = policyReturning(true)

      await guardWith(policy).canActivate(contextFor("undecoratedRoute"))

      expect(policy.can).toHaveBeenCalledWith(null, {
        kind: "authenticated",
      } satisfies AccessRequirement)
    })
  })
})
