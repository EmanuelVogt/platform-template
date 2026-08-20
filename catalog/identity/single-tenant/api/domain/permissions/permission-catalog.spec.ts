import "reflect-metadata"

import {
  ACCESS_REQUIREMENT,
  RequirePermission,
} from "../../../../shared/kernel/access/decorators"
import { definePermissionCatalog } from "../access/define-permission-catalog"
import { PRODUCT_PERMISSION_CATALOGS } from "../access/product-permission-catalogs"

import { ADMIN_CATALOG } from "./catalog/admin.catalog"
import {
  AUDIT_PERMISSION_KEYS,
  FULL_AUDIT_PERMISSION,
  MODULES,
  PERMISSION_KEYS,
  featureOf,
  isPermissionKey,
  moduleOf,
  requiresOf,
} from "./permission-catalog"

import type { PermissionKey } from "./permission-catalog"

describe("permission-catalog", () => {
  it("chaves são únicas no catálogo inteiro", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length)
  })

  it("toda chave segue o prefixo do módulo que a contém", () => {
    for (const mod of MODULES) {
      for (const feature of mod.features) {
        for (const p of feature.permissions) {
          expect(p.key.startsWith(`${mod.key}.`)).toBe(true)
        }
      }
    }
  })

  it("todo requires aponta para chave existente do mesmo módulo", () => {
    const all = new Set<string>(PERMISSION_KEYS)
    for (const key of PERMISSION_KEYS) {
      for (const req of requiresOf(key)) {
        expect(all.has(req)).toBe(true)
        expect(moduleOf(req)).toBe(moduleOf(key))
      }
    }
  })

  it("requires não tem ciclo (fecho transitivo termina)", () => {
    for (const key of PERMISSION_KEYS) {
      const seen = new Set<string>()
      const stack = [...requiresOf(key)]
      while (stack.length > 0) {
        const next = stack.pop()
        if (next === undefined) break
        expect(seen.has(next)).toBe(false)
        seen.add(next)
        stack.push(...requiresOf(next))
      }
    }
  })

  describe("chave fora do catálogo", () => {
    const unknown = "modulo.inexistente.acao" as PermissionKey

    it("requiresOf devolve lista vazia", () => {
      expect(requiresOf(unknown)).toEqual([])
    })

    it("moduleOf lança erro identificando a chave", () => {
      expect(() => moduleOf(unknown)).toThrow(/fora do catálogo/)
    })

    it("featureOf lança erro identificando a chave", () => {
      expect(() => featureOf(unknown)).toThrow(/fora do catálogo/)
    })

    it("isPermissionKey discrimina chave válida de inválida", () => {
      expect(isPermissionKey(PERMISSION_KEYS[0])).toBe(true)
      expect(isPermissionKey("modulo.inexistente.acao")).toBe(false)
    })
  })

  it("o base-set traz só o módulo admin; o resto entra pelo slot de produto", () => {
    expect(MODULES[0].key).toBe("admin")
    expect(MODULES).toHaveLength(1 + PRODUCT_PERMISSION_CATALOGS.length)
  })

  it("PERMISSION_KEYS = soma das chaves do catálogo", () => {
    const catalogCount = MODULES.flatMap((m) =>
      m.features.flatMap((f) => f.permissions.map((p) => p.key)),
    ).length
    expect(PERMISSION_KEYS).toHaveLength(catalogCount)
  })
})

describe("featureOf — feature dona da chave", () => {
  it("devolve a feature dona com o label em pt-BR", () => {
    expect(featureOf("admin.tags.audit.read")).toEqual({
      key: "tags",
      label: "Tags",
    })
  })

  it("chaves da mesma feature compartilham o mesmo dono", () => {
    expect(featureOf("admin.users.read")).toEqual(
      featureOf("admin.users.audit.read"),
    )
  })

  it("toda chave do catálogo tem feature com label não-vazio", () => {
    for (const key of PERMISSION_KEYS) {
      expect(featureOf(key).label.length).toBeGreaterThan(0)
    }
  })
})

describe("admin.usage.read — chave do painel de uso", () => {
  it("existe no catálogo e não exige nenhuma outra chave", () => {
    expect(isPermissionKey("admin.usage.read")).toBe(true)
    expect(requiresOf("admin.usage.read")).toEqual([])
  })

  it("pertence à feature 'Uso do sistema' do módulo admin", () => {
    expect(featureOf("admin.usage.read")).toEqual({
      key: "usage",
      label: "Uso do sistema",
    })
    expect(moduleOf("admin.usage.read")).toBe("admin")
  })

  it("não entra nas chaves de trilha (a feature não é dona de tabela)", () => {
    expect(AUDIT_PERMISSION_KEYS).not.toContain("admin.usage.read")
  })
})

describe("AUDIT_PERMISSION_KEYS — chaves 'Ver logs' derivadas do catálogo", () => {
  it("o base-set (só admin) tem 3 chaves de auditoria; o slot de produto só acrescenta", () => {
    const baseCatalog = definePermissionCatalog([ADMIN_CATALOG])
    const baseAuditKeys = baseCatalog.PERMISSION_KEYS.filter(
      (key) => key.endsWith(".audit.read") && key !== FULL_AUDIT_PERMISSION,
    )
    expect(baseAuditKeys).toHaveLength(3)
    expect(AUDIT_PERMISSION_KEYS).toEqual(expect.arrayContaining(baseAuditKeys))
    for (const key of AUDIT_PERMISSION_KEYS) {
      expect(key.endsWith(".audit.read")).toBe(true)
      expect(PERMISSION_KEYS).toContain(key)
    }
  })

  it("a trilha completa não entra na lista por dono de tabela", () => {
    expect(AUDIT_PERMISSION_KEYS).not.toContain("admin.audit.read")
  })
})

function handlerOf<T extends object, K extends keyof T>(
  proto: T,
  name: K,
): T[K] {
  return proto[name]
}

describe("PermissionKeyRegistry augmentado por este catálogo", () => {
  class Fixture {
    @RequirePermission("admin.users.read")
    allowed(): void {
      return
    }

    @RequirePermission("nope")
    invalid(): void {
      return
    }
  }

  it("@RequirePermission aceita chave do catálogo e a grava na metadata", () => {
    expect(
      Reflect.getMetadata(
        ACCESS_REQUIREMENT,
        handlerOf(Fixture.prototype, "allowed"),
      ),
    ).toEqual({ kind: "permission", key: "admin.users.read" })
  })

  it("@RequirePermission grava chave fora do catálogo — PermissionKey é string no kernel", () => {
    expect(
      Reflect.getMetadata(
        ACCESS_REQUIREMENT,
        handlerOf(Fixture.prototype, "invalid"),
      ),
    ).toEqual({ kind: "permission", key: "nope" })
  })
})
