import { BASE_ACCESS_PROFILES } from "./access-profile.types"
import { defineAccessProfiles } from "./define-access-profiles"
import {
  ASSIGNABLE_ACCESS_PROFILES,
  requiresPermissionFloor,
} from "./permission.types"

import type { AccessProfileDef } from "./access-profile.types"
import type { AssignableAccessProfile } from "./permission.types"

const SAMPLE_PROFILE = {
  key: "sample",
  label: "Amostra",
  assignable: true,
  permissionFloor: false,
} as const satisfies AccessProfileDef

const SAMPLE_INTERNAL_PROFILE = {
  key: "sample_internal",
  label: "Amostra interna",
  assignable: false,
  permissionFloor: true,
} as const satisfies AccessProfileDef

describe("defineAccessProfiles", () => {
  describe("base-set sem produto", () => {
    const baseRegistry = defineAccessProfiles(BASE_ACCESS_PROFILES)

    it("ACCESS_PROFILES lista os três perfis do base-set na ordem declarada", () => {
      expect(baseRegistry.ACCESS_PROFILES).toEqual(["master", "admin", "professional"])
    })

    it("ASSIGNABLE_ACCESS_PROFILES exclui o perfil não atribuível", () => {
      expect(baseRegistry.ASSIGNABLE_ACCESS_PROFILES).toEqual(["admin", "professional"])
    })

    it("o tipo atribuível exclui master em tempo de compilação", () => {
      // @ts-expect-error "master" tem assignable: false e fica fora do tipo
      const notAssignable: AssignableAccessProfile = "master"
      expect(ASSIGNABLE_ACCESS_PROFILES).not.toContain(notAssignable)
    })

    it("requiresPermissionFloor segue o permissionFloor de cada def do base-set", () => {
      expect(requiresPermissionFloor("admin")).toBe(true)
      expect(requiresPermissionFloor("master")).toBe(false)
      expect(requiresPermissionFloor("professional")).toBe(false)
    })
  })

  describe("com perfil de produto no slot", () => {
    const registry = defineAccessProfiles([
      ...BASE_ACCESS_PROFILES,
      SAMPLE_PROFILE,
      SAMPLE_INTERNAL_PROFILE,
    ] as const)

    it("ACCESS_PROFILES inclui os perfis de produto depois dos do base-set", () => {
      expect(registry.ACCESS_PROFILES).toEqual([
        "master",
        "admin",
        "professional",
        "sample",
        "sample_internal",
      ])
    })

    it("ASSIGNABLE_ACCESS_PROFILES inclui só o perfil de produto atribuível", () => {
      expect(registry.ASSIGNABLE_ACCESS_PROFILES).toEqual([
        "admin",
        "professional",
        "sample",
      ])
    })

    it("profileOf devolve a def registrada com rótulo", () => {
      expect(registry.profileOf("sample")).toEqual(SAMPLE_PROFILE)
      expect(registry.profileOf("admin")).toEqual({
        key: "admin",
        label: "Administrador",
        assignable: true,
        permissionFloor: true,
      })
    })

    it("requiresPermissionFloor segue o permissionFloor da def do produto", () => {
      expect(registry.requiresPermissionFloor("sample")).toBe(false)
      expect(registry.requiresPermissionFloor("sample_internal")).toBe(true)
    })

    it("PROFILE_DEFS expõe todas as defs para quem monta o catálogo", () => {
      expect(registry.PROFILE_DEFS).toEqual([
        ...BASE_ACCESS_PROFILES,
        SAMPLE_PROFILE,
        SAMPLE_INTERNAL_PROFILE,
      ])
    })

    it("isAccessProfile discrimina perfil registrado de perfil inventado", () => {
      expect(registry.isAccessProfile("sample")).toBe(true)
      expect(registry.isAccessProfile("master")).toBe(true)
      expect(registry.isAccessProfile("sample_missing")).toBe(false)
    })

    it("profileOf lança identificando o perfil fora do registro", () => {
      const unknown = "sample_missing" as (typeof registry.ACCESS_PROFILES)[number]
      expect(() => registry.profileOf(unknown)).toThrow(
        "Perfil de acesso fora do registro: sample_missing",
      )
    })
  })

  it("lança quando a chave do produto colide com uma chave do base-set", () => {
    expect(() =>
      defineAccessProfiles([
        ...BASE_ACCESS_PROFILES,
        {
          key: "admin",
          label: "Administrador do produto",
          assignable: true,
          permissionFloor: false,
        },
      ] as const),
    ).toThrow("Perfil de acesso duplicado: admin")
  })

  it("registros independentes não compartilham estado", () => {
    const other = defineAccessProfiles([SAMPLE_PROFILE] as const)
    expect(other.isAccessProfile("master")).toBe(false)
    expect(other.ACCESS_PROFILES).toEqual(["sample"])
  })
})
