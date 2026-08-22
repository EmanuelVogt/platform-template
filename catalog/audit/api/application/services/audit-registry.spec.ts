import { describe, expect, it } from "vitest"

import { PERMISSION_KEYS } from "../../../identity/api/facades/permission-catalog.facade"
import { AUDITED } from "../../domain/audit-coverage"
import { DuplicateAuditRegistrationError } from "../../domain/errors"

import { AuditRegistry } from "./audit-registry"

describe("AuditRegistry", () => {
  const auditedBare = [...AUDITED].map((t) => t.split(".")[1])

  describe("base set — paridade com o mapeamento anterior", () => {
    it("toda tabela auditada tem exatamente um dono, e nada além delas", () => {
      const registry = new AuditRegistry()
      expect([...registry.auditedTables()].sort()).toEqual(
        [...auditedBare].sort()
      )
    })

    it("todo dono é chave do catálogo terminada em .audit.read", () => {
      const registry = new AuditRegistry()
      for (const table of registry.auditedTables()) {
        const owner = registry.ownerOf(table)
        expect(PERMISSION_KEYS).toContain(owner)
        expect(owner?.endsWith(".audit.read")).toBe(true)
      }
    })

    it("ownerOf devolve o dono ou undefined pra tabela desconhecida", () => {
      const registry = new AuditRegistry()
      expect(registry.ownerOf("tags")).toBe("admin.tags.audit.read")
      expect(registry.ownerOf("nao_existe")).toBeUndefined()
    })

    it("allowedTables filtra pelo set do ator", () => {
      const registry = new AuditRegistry()
      const allowed = registry.allowedTables(
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

    it("toda tabela auditada aparece exatamente uma vez (raiz, satélite ou técnica)", () => {
      const registry = new AuditRegistry()
      expect([...registry.auditedTables()].sort()).toEqual(
        [...auditedBare].sort()
      )
      expect(new Set(registry.auditedTables()).size).toBe(
        registry.auditedTables().length
      )
    })

    it("satélites de um agregado têm o mesmo dono da raiz", () => {
      const registry = new AuditRegistry()
      for (const table of registry.tablesForAggregate("users")) {
        expect(registry.ownerOf(table)).toBe(registry.ownerOf("users"))
      }
    })

    it("tablesForAggregate expande raiz para raiz+satélites", () => {
      const registry = new AuditRegistry()
      expect(registry.tablesForAggregate("permission_templates")).toEqual([
        "permission_templates",
        "permission_template_permissions",
      ])
    })

    it("tabela fora do registry volta só ela mesma", () => {
      const registry = new AuditRegistry()
      expect(registry.tablesForAggregate("sessions")).toEqual(["sessions"])
    })

    it("technicalTables devolve devices/sessions/verification_tokens", () => {
      const registry = new AuditRegistry()
      expect([...registry.technicalTables()].sort()).toEqual(
        ["devices", "sessions", "verification_tokens"].sort()
      )
    })

    it("refTargetFor resolve as colunas de FK do base set", () => {
      const registry = new AuditRegistry()
      expect(registry.refTargetFor("user_id")).toEqual({
        column: "user_id",
        schema: "identity",
        table: "users",
        labelColumn: "name",
      })
      expect(registry.refTargetFor("template_id")).toEqual({
        column: "template_id",
        schema: "identity",
        table: "permission_templates",
        labelColumn: "name",
      })
      expect(registry.refTargetFor("coluna_desconhecida")).toBeUndefined()
    })
  })

  describe("extensão por produto", () => {
    it("registerTables aceita uma tabela nova e refTargetFor resolve sua FK", () => {
      const registry = new AuditRegistry()
      registry.registerTables([
        { schema: "sample", table: "things", owner: "admin.users.audit.read" },
      ])
      registry.registerRefTargets([
        {
          column: "thing_id",
          schema: "sample",
          table: "things",
          labelColumn: "name",
        },
      ])
      expect(registry.ownerOf("things")).toBe("admin.users.audit.read")
      expect(registry.refTargetFor("thing_id")).toEqual({
        column: "thing_id",
        schema: "sample",
        table: "things",
        labelColumn: "name",
      })
    })

    it("registerTables com tabela já registrada lança nomeando-a", () => {
      const registry = new AuditRegistry()
      expect(() => {
        registry.registerTables([
          { schema: "identity", table: "users", owner: "admin.users.audit.read" },
        ])
      }).toThrow(DuplicateAuditRegistrationError)
      expect(() => {
        registry.registerTables([
          { schema: "identity", table: "users", owner: "admin.users.audit.read" },
        ])
      }).toThrow(/users/)
    })

    it("registerRefTargets com coluna já registrada lança nomeando-a", () => {
      const registry = new AuditRegistry()
      expect(() => {
        registry.registerRefTargets([
          {
            column: "user_id",
            schema: "sample",
            table: "things",
            labelColumn: "name",
          },
        ])
      }).toThrow(DuplicateAuditRegistrationError)
      expect(() => {
        registry.registerRefTargets([
          {
            column: "user_id",
            schema: "sample",
            table: "things",
            labelColumn: "name",
          },
        ])
      }).toThrow(/user_id/)
    })
  })
})
