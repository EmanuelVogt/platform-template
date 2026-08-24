import "reflect-metadata"

import { describe, expect, it } from "vitest"

import {
  ACCESS_REQUIREMENT,
  Authenticated,
  OptionalAuth,
  Public,
  RequireAnyPermission,
  RequirePermission,
  SelfService,
} from "./decorators"

function handlerOf<T extends object, K extends keyof T>(
  proto: T,
  name: K
): T[K] {
  return proto[name]
}

describe("decorators de acesso", () => {
  class Fixture {
    @Public()
    publicRoute(): void {
      return
    }

    @Authenticated()
    authenticatedRoute(): void {
      return
    }

    @OptionalAuth()
    optionalRoute(): void {
      return
    }

    @SelfService()
    selfRoute(): void {
      return
    }

    @RequirePermission("admin.users.read")
    permissionRoute(): void {
      return
    }

    undecoratedRoute(): void {
      return
    }
  }

  describe("requisito de acesso do kernel", () => {
    it("@Public grava { kind: public }", () => {
      expect(
        Reflect.getMetadata(
          ACCESS_REQUIREMENT,
          handlerOf(Fixture.prototype, "publicRoute")
        )
      ).toEqual({ kind: "public" })
    })

    it("@Authenticated grava { kind: authenticated }", () => {
      expect(
        Reflect.getMetadata(
          ACCESS_REQUIREMENT,
          handlerOf(Fixture.prototype, "authenticatedRoute")
        )
      ).toEqual({ kind: "authenticated" })
    })

    it("@RequirePermission grava { kind: permission, key }", () => {
      expect(
        Reflect.getMetadata(
          ACCESS_REQUIREMENT,
          handlerOf(Fixture.prototype, "permissionRoute")
        )
      ).toEqual({ kind: "permission", key: "admin.users.read" })
    })

    it("@OptionalAuth grava { kind: public } — anônimo chega no handler", () => {
      expect(
        Reflect.getMetadata(
          ACCESS_REQUIREMENT,
          handlerOf(Fixture.prototype, "optionalRoute")
        )
      ).toEqual({ kind: "public" })
    })

    it("@SelfService grava { kind: authenticated }", () => {
      expect(
        Reflect.getMetadata(
          ACCESS_REQUIREMENT,
          handlerOf(Fixture.prototype, "selfRoute")
        )
      ).toEqual({ kind: "authenticated" })
    })

    it("handler sem decorator não tem requisito — o guard decide o default", () => {
      expect(
        Reflect.getMetadata(
          ACCESS_REQUIREMENT,
          handlerOf(Fixture.prototype, "undecoratedRoute")
        )
      ).toBeUndefined()
    })
  })
})

describe("RequireAnyPermission", () => {
  it("grava { kind: anyPermission, keys } no requisito do kernel", () => {
    class T {
      @RequireAnyPermission(["admin.users.audit.read", "admin.tags.audit.read"])
      h(): void {
        return
      }
    }
    expect(
      Reflect.getMetadata(ACCESS_REQUIREMENT, handlerOf(T.prototype, "h"))
    ).toEqual({
      kind: "anyPermission",
      keys: ["admin.users.audit.read", "admin.tags.audit.read"],
    })
  })

  it("lista vazia lança na definição", () => {
    expect(() => RequireAnyPermission([])).toThrow()
  })
})
