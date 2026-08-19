import { describe, expect, it } from "vitest"

import { resolveAccess } from "./resolve-access"
import { IDENTITY_ROUTE_ACCESS } from "./route-access"
import { makeCurrentUser } from "./session.fixture"

describe("IDENTITY_ROUTE_ACCESS", () => {
  it("mantém raiz e login públicos e o início autenticado (paridade v0.2)", () => {
    expect(IDENTITY_ROUTE_ACCESS["/"]).toEqual({ kind: "public" })
    expect(IDENTITY_ROUTE_ACCESS["/entrar"]).toEqual({ kind: "public" })
    expect(IDENTITY_ROUTE_ACCESS["/inicio"]).toEqual({ kind: "authenticated" })
  })

  it("reproduz requireAnon: visitante entra no login, logado é barrado da rota autenticada", () => {
    expect(resolveAccess(null, IDENTITY_ROUTE_ACCESS["/entrar"])).toBe("allow")
    expect(resolveAccess(null, IDENTITY_ROUTE_ACCESS["/inicio"])).toBe("anon")
  })

  it("reproduz requireAccess: logado sem permissão alguma ainda alcança o início", () => {
    const user = makeCurrentUser({ accessProfile: "professional", permissions: [] })

    expect(resolveAccess(user, IDENTITY_ROUTE_ACCESS["/inicio"])).toBe("allow")
  })
})
