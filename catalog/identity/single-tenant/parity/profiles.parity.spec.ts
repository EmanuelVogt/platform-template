import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { accessProfile, users } from "../infrastructure/tables/user.table"

describe("paridade dos perfis de acesso do identity", () => {
  it("mantém os perfis base como enum do banco, sem o literal profissional (AD-002, AD-004, AD-035)", () => {
    expect(accessProfile.enumName).toBe("access_profile")
    expect(accessProfile.schema).toBe("identity")
    // Encolher este literal é o re-snapshot do corte do agregado (AD-035), não
    // uma regressão: quem quer `professional` de volta usa o slot de produto.
    expect([...accessProfile.enumValues]).toEqual(["master", "admin"])
  })

  it("liga o perfil do usuário ao enum, com admin como padrão", () => {
    expect(users.accessProfile.enumValues).toEqual(accessProfile.enumValues)
    expect(users.accessProfile.notNull).toBe(true)
    expect(users.accessProfile.default).toBe("admin")
  })

  it("não carrega mais serves_clients nem birth_date na tabela de usuários (IDENT-01)", () => {
    const columns = getTableColumns(users)
    const sqlNames = Object.values(columns).map((column) => column.name)

    expect(Object.keys(columns)).not.toContain("servesClients")
    expect(Object.keys(columns)).not.toContain("birthDate")
    expect(sqlNames).not.toContain("serves_clients")
    expect(sqlNames).not.toContain("birth_date")
  })
})
