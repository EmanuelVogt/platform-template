import { AUDIT_TABLE_OWNERS } from "../domain/table-owners"

import { activityAreaOf } from "./activity-area"

describe("activityAreaOf", () => {
  it("resolve a tabela no assunto dono, com o rótulo pt-BR do catálogo", () => {
    expect(activityAreaOf("permission_templates")).toEqual(
      expect.objectContaining({ key: "admin.permission_templates" })
    )
  })

  it("tabelas do mesmo agregado caem no mesmo assunto", () => {
    expect(activityAreaOf("permission_template_permissions")).toEqual(
      activityAreaOf("permission_templates"),
    )
  })

  it("tabela sem dono no mapa vira Outros", () => {
    expect(activityAreaOf("tabela_desconhecida")).toEqual({
      key: "other",
      label: "Outros",
    })
  })

  it("toda tabela auditada resolve para um assunto com rótulo", () => {
    for (const table of Object.keys(AUDIT_TABLE_OWNERS)) {
      const area = activityAreaOf(table)
      expect(area.key).not.toBe("other")
      expect(area.label.length).toBeGreaterThan(0)
    }
  })

  it("assuntos distintos nunca compartilham a mesma chave", () => {
    const byKey = new Map<string, string>()
    for (const table of Object.keys(AUDIT_TABLE_OWNERS)) {
      const area = activityAreaOf(table)
      const seen = byKey.get(area.key)
      if (seen !== undefined) expect(seen).toBe(area.label)
      byKey.set(area.key, area.label)
    }
  })
})
