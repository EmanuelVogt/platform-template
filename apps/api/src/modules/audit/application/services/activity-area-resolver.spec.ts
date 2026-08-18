import { AuditRegistry } from "./audit-registry"
import { ActivityAreaResolver } from "./activity-area-resolver"

describe("ActivityAreaResolver", () => {
  function makeResolver(): ActivityAreaResolver {
    return new ActivityAreaResolver(new AuditRegistry())
  }

  it("resolve a tabela no assunto dono, com o rótulo pt-BR do catálogo", () => {
    const resolver = makeResolver()
    expect(resolver.activityAreaOf("permission_templates")).toEqual(
      expect.objectContaining({ key: "admin.permission_templates" })
    )
  })

  it("tabelas do mesmo agregado caem no mesmo assunto", () => {
    const resolver = makeResolver()
    expect(resolver.activityAreaOf("permission_template_permissions")).toEqual(
      resolver.activityAreaOf("permission_templates")
    )
  })

  it("tabela sem dono no mapa vira Outros", () => {
    const resolver = makeResolver()
    expect(resolver.activityAreaOf("tabela_desconhecida")).toEqual({
      key: "other",
      label: "Outros",
    })
  })

  it("toda tabela auditada resolve para um assunto com rótulo", () => {
    const registry = new AuditRegistry()
    const resolver = new ActivityAreaResolver(registry)
    for (const table of registry.auditedTables()) {
      const area = resolver.activityAreaOf(table)
      expect(area.key).not.toBe("other")
      expect(area.label.length).toBeGreaterThan(0)
    }
  })

  it("assuntos distintos nunca compartilham a mesma chave", () => {
    const registry = new AuditRegistry()
    const resolver = new ActivityAreaResolver(registry)
    const byKey = new Map<string, string>()
    for (const table of registry.auditedTables()) {
      const area = resolver.activityAreaOf(table)
      const seen = byKey.get(area.key)
      if (seen !== undefined) expect(seen).toBe(area.label)
      byKey.set(area.key, area.label)
    }
  })
})
