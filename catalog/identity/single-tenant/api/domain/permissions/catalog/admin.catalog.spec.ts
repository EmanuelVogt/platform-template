import { PERMISSION_KEYS } from "../permission-catalog"

import { ADMIN_CATALOG } from "./admin.catalog"

import type { PermissionDef } from "../../access/permission.types"

function findPermission(key: string): PermissionDef | undefined {
  for (const feature of ADMIN_CATALOG.features) {
    for (const p of feature.permissions) {
      if (p.key === key) return p
    }
  }
  return undefined
}

describe("ADMIN_CATALOG — só recursos do base-set", () => {
  const featureKeys: string[] = ADMIN_CATALOG.features.map((f) => f.key)

  it("as features são users, permission_templates, tags, audit e usage", () => {
    expect(featureKeys).toEqual([
      "users",
      "permission_templates",
      "tags",
      "audit",
      "usage",
    ])
  })

  it("toda chave é única e prefixada por admin.", () => {
    const allKeys = ADMIN_CATALOG.features.flatMap((f) =>
      f.permissions.map((p) => p.key)
    )
    expect(new Set(allKeys).size).toBe(allKeys.length)
    for (const key of allKeys) expect(key.startsWith("admin.")).toBe(true)
  })

  it("total de permissões é 24 (9 users + 5 permission_templates + 8 tags + 1 audit + 1 usage)", () => {
    const total = ADMIN_CATALOG.features.reduce(
      (acc, f) => acc + f.permissions.length,
      0
    )
    expect(total).toBe(24)
  })
})

describe("ADMIN_CATALOG — grafo de requires das features com lixeira", () => {
  it.each(["users", "tags"])(
    "%s tem read como raiz e o grafo canônico de lixeira",
    (feature) => {
      expect(findPermission(`admin.${feature}.read`)?.requires).toEqual([])
      expect(findPermission(`admin.${feature}.create`)?.requires).toEqual([
        `admin.${feature}.read`,
      ])
      expect(findPermission(`admin.${feature}.update`)?.requires).toEqual([
        `admin.${feature}.read`,
      ])
      expect(findPermission(`admin.${feature}.delete`)?.requires).toEqual([
        `admin.${feature}.read`,
      ])
      expect(findPermission(`admin.${feature}.trash.read`)?.requires).toEqual([
        `admin.${feature}.read`,
      ])
      expect(
        findPermission(`admin.${feature}.trash.restore`)?.requires
      ).toEqual([`admin.${feature}.trash.read`])
      expect(findPermission(`admin.${feature}.trash.purge`)?.requires).toEqual([
        `admin.${feature}.trash.read`,
      ])
    }
  )
})

describe("ADMIN_CATALOG — trilha completa (ADR 0049, revisão 2026-08-02)", () => {
  it("admin.audit.read não exige leitura de nenhuma feature", () => {
    expect(findPermission("admin.audit.read")?.requires).toEqual([])
  })

  it.each(["users", "permission_templates", "tags"])(
    "feature %s tem admin.%s.audit.read com label 'Ver logs' e requires do read",
    (feature) => {
      const p = findPermission(`admin.${feature}.audit.read`)
      expect(p).toBeDefined()
      expect(p?.label).toBe("Ver logs")
      expect(p?.requires).toEqual([`admin.${feature}.read`])
    }
  )
})

describe("ADMIN_CATALOG — feature usage (painel de uso, issue #36)", () => {
  const featureUsage = ADMIN_CATALOG.features.find((f) => f.key === "usage")

  it("existe com label 'Uso do sistema' e uma única permissão", () => {
    expect(featureUsage?.label).toBe("Uso do sistema")
    expect(featureUsage?.permissions).toHaveLength(1)
  })

  it("admin.usage.read tem label 'Ver painel de uso' e não exige outra chave", () => {
    const p = findPermission("admin.usage.read")
    expect(p?.label).toBe("Ver painel de uso")
    expect(p?.requires).toEqual([])
  })

  it("a feature não tem chave de trilha (não é dona de tabela auditada)", () => {
    expect(findPermission("admin.usage.audit.read")).toBeUndefined()
  })
})

describe("PERMISSION_KEYS — o catálogo admin entra no z.enum do contrato", () => {
  it("toda chave do ADMIN_CATALOG está em PERMISSION_KEYS", () => {
    for (const feature of ADMIN_CATALOG.features) {
      for (const p of feature.permissions) {
        expect(PERMISSION_KEYS).toContain(p.key)
      }
    }
  })
})
