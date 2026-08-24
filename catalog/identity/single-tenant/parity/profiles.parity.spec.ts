import { describe, expect, it } from "vitest"

import { accessProfile, users } from "../infrastructure/tables/user.table"

describe("paridade dos perfis de acesso do identity", () => {
  it("mantém os três perfis da v0.2 como enum do banco (AD-002, AD-004)", () => {
    expect(accessProfile.enumName).toBe("access_profile")
    expect(accessProfile.schema).toBe("identity")
    expect([...accessProfile.enumValues]).toEqual([
      "master",
      "admin",
      "professional",
    ])
  })

  it("liga o perfil do usuário ao enum, com admin como padrão", () => {
    expect(users.accessProfile.enumValues).toEqual(accessProfile.enumValues)
    expect(users.accessProfile.notNull).toBe(true)
    expect(users.accessProfile.default).toBe("admin")
  })

  it("mantém servesClients desacoplado do perfil (AD-003)", () => {
    expect(users.servesClients.name).toBe("serves_clients")
    expect(users.servesClients.notNull).toBe(true)
    expect(users.servesClients.default).toBe(false)
  })
})
