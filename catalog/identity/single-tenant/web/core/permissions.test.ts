import { describe, expect, it } from "vitest"

import { can } from "./permissions"
import { makeCurrentUser } from "./session.fixture"

describe("can", () => {
  it("libera qualquer chave para o perfil master, mesmo sem permissões explícitas", () => {
    const user = makeCurrentUser({ accessProfile: "master", permissions: [] })

    expect(can(user, "admin.users.read")).toBe(true)
    expect(can(user, "admin.permission_templates.delete")).toBe(true)
  })

  it("libera a chave concedida explicitamente a um perfil não-master", () => {
    const user = makeCurrentUser({
      accessProfile: "admin",
      permissions: ["admin.users.read"],
    })

    expect(can(user, "admin.users.read")).toBe(true)
  })

  it("nega a chave ausente da lista de um perfil não-master", () => {
    const user = makeCurrentUser({
      accessProfile: "admin",
      permissions: ["admin.users.read"],
    })

    expect(can(user, "admin.users.delete")).toBe(false)
  })

  it("nega qualquer chave para o perfil professional sem permissões", () => {
    const user = makeCurrentUser({ accessProfile: "professional", permissions: [] })

    expect(can(user, "admin.users.read")).toBe(false)
  })
})
