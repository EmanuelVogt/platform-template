import { definePermissionCatalog } from "./define-permission-catalog"

import type { ModuleDef } from "./permission.types"

const FIRST_CATALOG = {
  key: "admin",
  label: "Administração",
  features: [
    {
      key: "widgets",
      label: "Widgets",
      permissions: [
        { key: "admin.widgets.read", label: "Ver widgets", requires: [] },
        {
          key: "admin.widgets.write",
          label: "Editar widgets",
          requires: ["admin.widgets.read"],
        },
      ],
    },
  ],
} as const satisfies ModuleDef

const SECOND_CATALOG = {
  key: "catalog",
  label: "Catálogo",
  features: [
    {
      key: "gadgets",
      label: "Gadgets",
      permissions: [
        { key: "catalog.gadgets.read", label: "Ver gadgets", requires: [] },
      ],
    },
  ],
} as const satisfies ModuleDef

const catalog = definePermissionCatalog([FIRST_CATALOG, SECOND_CATALOG] as const)

const {
  PERMISSION_KEYS,
  featureOf,
  isPermissionKey,
  moduleOf,
  requiresOf,
} = catalog

describe("definePermissionCatalog", () => {
  it("PERMISSION_KEYS reúne as chaves dos dois módulos na ordem declarada", () => {
    expect(PERMISSION_KEYS).toEqual([
      "admin.widgets.read",
      "admin.widgets.write",
      "catalog.gadgets.read",
    ])
  })

  it("requiresOf devolve os pré-requisitos declarados", () => {
    expect(requiresOf("admin.widgets.write")).toEqual(["admin.widgets.read"])
    expect(requiresOf("admin.widgets.read")).toEqual([])
  })

  it("moduleOf devolve o módulo dono de cada chave", () => {
    expect(moduleOf("admin.widgets.write")).toBe("admin")
    expect(moduleOf("catalog.gadgets.read")).toBe("catalog")
  })

  it("featureOf devolve a feature dona com chave e rótulo", () => {
    expect(featureOf("admin.widgets.write")).toEqual({
      key: "widgets",
      label: "Widgets",
    })
    expect(featureOf("catalog.gadgets.read")).toEqual({
      key: "gadgets",
      label: "Gadgets",
    })
  })

  it("isPermissionKey discrimina chave do catálogo de chave inventada", () => {
    expect(isPermissionKey("admin.widgets.read")).toBe(true)
    expect(isPermissionKey("catalog.gadgets.read")).toBe(true)
    expect(isPermissionKey("admin.widgets.delete")).toBe(false)
  })

  describe("chave fora do catálogo", () => {
    const unknown = "admin.widgets.delete" as (typeof PERMISSION_KEYS)[number]

    it("requiresOf devolve lista vazia", () => {
      expect(requiresOf(unknown)).toEqual([])
    })

    it("moduleOf lança identificando a chave", () => {
      expect(() => moduleOf(unknown)).toThrow(
        "Chave de permissão fora do catálogo: admin.widgets.delete",
      )
    })

    it("featureOf lança identificando a chave", () => {
      expect(() => featureOf(unknown)).toThrow(
        "Chave de permissão fora do catálogo: admin.widgets.delete",
      )
    })
  })

  it("catálogos independentes não compartilham estado", () => {
    const other = definePermissionCatalog([SECOND_CATALOG] as const)
    expect(other.isPermissionKey("admin.widgets.read")).toBe(false)
    expect(isPermissionKey("admin.widgets.read")).toBe(true)
  })
})
