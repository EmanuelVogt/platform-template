import "reflect-metadata"

import {
  ACCESS_REQUIREMENT,
  Authenticated,
  IS_OPTIONAL_AUTH_KEY,
  IS_PUBLIC_KEY,
  IS_SELF_SERVICE_KEY,
  OptionalAuth,
  Public,
  REQUIRE_ANY_PERMISSION_KEY,
  REQUIRE_PERMISSION_KEY,
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

  it("@Public grava true na metadata", () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        handlerOf(Fixture.prototype, "publicRoute")
      )
    ).toBe(true)
  })

  it("@OptionalAuth grava true na metadata", () => {
    expect(
      Reflect.getMetadata(
        IS_OPTIONAL_AUTH_KEY,
        handlerOf(Fixture.prototype, "optionalRoute")
      )
    ).toBe(true)
  })

  it("@SelfService grava true na metadata", () => {
    expect(
      Reflect.getMetadata(
        IS_SELF_SERVICE_KEY,
        handlerOf(Fixture.prototype, "selfRoute")
      )
    ).toBe(true)
  })

  it("@RequirePermission grava o array de chaves", () => {
    expect(
      Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        handlerOf(Fixture.prototype, "permissionRoute")
      )
    ).toEqual(["admin.users.read"])
  })

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
  it("grava as chaves no metadata access:requireAnyPermission", () => {
    class T {
      @RequireAnyPermission([
        "admin.users.audit.read",
        "admin.tags.audit.read",
      ])
      h(): void {
        return
      }
    }
    expect(
      Reflect.getMetadata(REQUIRE_ANY_PERMISSION_KEY, handlerOf(T.prototype, "h"))
    ).toEqual(["admin.users.audit.read", "admin.tags.audit.read"])
  })

  it("lista vazia lança na definição", () => {
    expect(() => RequireAnyPermission([])).toThrow()
  })
})
