import { describe, expect, it } from "vitest"

import { resolveAccess } from "./resolve-access"
import { makeCurrentUser } from "./session.fixture"

describe("resolveAccess", () => {
  it("permite rota pública para visitante anônimo", () => {
    expect(resolveAccess(null, { kind: "public" })).toBe("allow")
  })

  it("permite rota pública para usuário logado", () => {
    expect(resolveAccess(makeCurrentUser(), { kind: "public" })).toBe("allow")
  })

  it("devolve anon para visitante em rota autenticada", () => {
    expect(resolveAccess(null, { kind: "authenticated" })).toBe("anon")
  })

  it("devolve anon para visitante em rota por permissão", () => {
    expect(
      resolveAccess(null, { kind: "permission", key: "admin.users.read" })
    ).toBe("anon")
  })

  it("permite rota autenticada para qualquer usuário logado", () => {
    const user = makeCurrentUser({
      accessProfile: "professional",
      permissions: [],
    })

    expect(resolveAccess(user, { kind: "authenticated" })).toBe("allow")
  })

  it("permite rota por permissão quando o usuário tem a chave", () => {
    const user = makeCurrentUser({ permissions: ["admin.users.read"] })

    expect(
      resolveAccess(user, { kind: "permission", key: "admin.users.read" })
    ).toBe("allow")
  })

  it("devolve forbidden quando o usuário logado não tem a chave", () => {
    const user = makeCurrentUser({ permissions: ["admin.users.read"] })

    expect(
      resolveAccess(user, { kind: "permission", key: "admin.users.delete" })
    ).toBe("forbidden")
  })

  it("permite rota por permissão para o perfil master", () => {
    const user = makeCurrentUser({ accessProfile: "master", permissions: [] })

    expect(
      resolveAccess(user, { kind: "permission", key: "admin.users.delete" })
    ).toBe("allow")
  })
})
