import { PERMISSION_KEYS } from "../../identity/api/facades/permission-catalog.facade"

import { AGGREGATE_SATELLITES } from "./aggregate-registry"
import { AUDITED } from "./audit-coverage"
import {
  AUDIT_TABLE_OWNERS,
  allowedAuditTables,
  auditOwnerOf,
} from "./table-owners"

describe("table-owners", () => {
  const auditedBare = [...AUDITED].map((t) => t.split(".")[1])

  it("toda tabela auditada tem exatamente um dono, e nada além delas", () => {
    expect(Object.keys(AUDIT_TABLE_OWNERS).sort()).toEqual(
      [...auditedBare].sort()
    )
  })

  it("todo dono é chave do catálogo terminada em .audit.read", () => {
    for (const key of Object.values(AUDIT_TABLE_OWNERS)) {
      expect(PERMISSION_KEYS).toContain(key)
      expect(key.endsWith(".audit.read")).toBe(true)
    }
  })

  it("satélites de um agregado têm o mesmo dono da raiz", () => {
    for (const [root, satellites] of Object.entries(AGGREGATE_SATELLITES)) {
      for (const satellite of satellites) {
        expect(AUDIT_TABLE_OWNERS[satellite]).toBe(AUDIT_TABLE_OWNERS[root])
      }
    }
  })

  it("auditOwnerOf devolve o dono ou undefined pra tabela desconhecida", () => {
    expect(auditOwnerOf("tags")).toBe("admin.tags.audit.read")
    expect(auditOwnerOf("nao_existe")).toBeUndefined()
  })

  it("allowedAuditTables filtra pelo set do ator", () => {
    const allowed = allowedAuditTables(
      new Set(["admin.permission_templates.audit.read"])
    )
    expect(allowed).toEqual(
      expect.arrayContaining([
        "permission_templates",
        "permission_template_permissions",
      ])
    )
    expect(allowed).not.toContain("users")
  })
})
