import { type Mock, describe, expect, it, vi } from "vitest"

import { BASE_ACCESS_PROFILES } from "../domain/access/access-profile.types"
import {
  InvalidPermissionSetError,
  InvalidProfessionalScopeError,
  InvalidSchedulingAreasError,
  PermissionGrantNotAllowedError,
} from "../domain/errors"


import {
  assertCanGrant,
  assertProfileFloor,
  assertValidPermissionSet,
  resolveUserAccess,
} from "./access-policy"

import type { GrantContext } from "./access-policy"
import type { ProfessionalScope } from "../domain/ports/professional-scope.port"

describe("assertValidPermissionSet (closure de requires)", () => {
  it("aceita set vazio", () => {
    expect(() => { assertValidPermissionSet([]); }).not.toThrow()
  })

  it("aceita set com cadeia completa", () => {
    expect(() =>
      { assertValidPermissionSet([
        "admin.users.read",
        "admin.users.trash.read",
        "admin.users.trash.purge",
      ]); }
    ).not.toThrow()
  })

  it("rejeita chave sem o requires presente, listando as faltantes", () => {
    expect(() => { assertValidPermissionSet(["admin.users.trash.purge"]); }).toThrow(
      InvalidPermissionSetError
    )
    // SPEC_DEVIATION: 2ª chamada com toThrow(string) no lugar de try/catch com
    // expect dentro do catch. Reason: vitest/no-conditional-expect — toThrow
    // aceita substring da mensagem e mantém o assert incondicional.
    expect(() => { assertValidPermissionSet(["admin.users.trash.purge"]); }).toThrow(
      "admin.users.trash.read"
    )
  })
})

describe("assertProfileFloor (piso do perfil)", () => {
  it("master é isento (set vazio passa)", () => {
    expect(() => { assertProfileFloor("master", []); }).not.toThrow()
  })

  it("admin exige ≥1 chave do módulo admin", () => {
    expect(() => { assertProfileFloor("admin", ["admin.users.read"]); }).not.toThrow()
    expect(() => { assertProfileFloor("admin", []); }).toThrow(
      InvalidPermissionSetError
    )
  })

  it("professional é isento (o piso vem do slot de produto, não do catálogo)", () => {
    expect(() => { assertProfileFloor("professional", []); }).not.toThrow()
  })

  describe("o piso sai da def registrada, não de chave literal", () => {
    const exempt = BASE_ACCESS_PROFILES.filter((def) => !def.permissionFloor)
    const enforced = BASE_ACCESS_PROFILES.filter((def) => def.permissionFloor)

    it("perfil com permissionFloor false aceita set vazio", () => {
      expect(exempt.map((def) => def.key)).toEqual(["master", "professional"])
      for (const def of exempt) {
        expect(() => {
          assertProfileFloor(def.key, [])
        }).not.toThrow()
      }
    })

    it("perfil com permissionFloor true exige chave do módulo homônimo", () => {
      expect(enforced.map((def) => def.key)).toEqual(["admin"])
      for (const def of enforced) {
        expect(() => {
          assertProfileFloor(def.key, [])
        }).toThrow(
          `O perfil de acesso exige ao menos uma permissão do módulo "${def.key}".`,
        )
      }
    })
  })
})

function makeScope(): ProfessionalScope & { assertValid: Mock } {
  return { assertValid: vi.fn().mockResolvedValue(undefined) }
}

const MASTER_GRANT: GrantContext = {
  actor: { permissions: new Set<string>(), isMaster: true },
  current: [],
}

describe("resolveUserAccess — atendimento e áreas de agendamento", () => {
  it("sem área de agendamento resolve lista vazia sem tocar o port", async () => {
    const scope = makeScope()
    const access = await resolveUserAccess(
      {
        accessProfile: "admin",
        servesClients: false,
        permissions: ["admin.users.read"],
        areaIds: [],
        serviceIds: [],
        schedulingAreaIds: [],
      },
      scope,
      MASTER_GRANT
    )
    expect(access.schedulingAreaIds).toEqual([])
    expect(scope.assertValid).not.toHaveBeenCalled()
  })

  it("áreas de agendamento informadas são validadas no port e preservadas", async () => {
    const scope = makeScope()
    const access = await resolveUserAccess(
      {
        accessProfile: "admin",
        servesClients: false,
        permissions: ["admin.users.read"],
        areaIds: ["area-ignorada"],
        serviceIds: ["svc-ignorado"],
        schedulingAreaIds: ["area-1", "area-2"],
      },
      scope,
      MASTER_GRANT
    )
    expect(access).toEqual({
      permissions: ["admin.users.read"],
      areaIds: [],
      serviceIds: [],
      schedulingAreaIds: ["area-1", "area-2"],
    })
    expect(scope.assertValid).toHaveBeenCalledWith(["area-1", "area-2"], [])
  })

  it("falha do port (área inexistente/inativa) vira InvalidSchedulingAreasError", async () => {
    const scope = makeScope()
    scope.assertValid.mockRejectedValue(
      new InvalidProfessionalScopeError("área inativa")
    )
    await expect(
      resolveUserAccess(
        {
          accessProfile: "admin",
          servesClients: false,
          permissions: ["admin.users.read"],
          areaIds: [],
          serviceIds: [],
          schedulingAreaIds: ["area-morta"],
        },
        scope,
        MASTER_GRANT
      )
    ).rejects.toBeInstanceOf(InvalidSchedulingAreasError)
  })

  it("quem atende guarda áreas e serviços de atuação, em qualquer perfil", async () => {
    const scope = makeScope()
    const access = await resolveUserAccess(
      {
        accessProfile: "professional",
        servesClients: true,
        permissions: [],
        areaIds: ["area-1"],
        serviceIds: ["svc-1"],
        schedulingAreaIds: [],
      },
      scope,
      MASTER_GRANT
    )
    expect(access).toEqual({
      permissions: [],
      areaIds: ["area-1"],
      serviceIds: ["svc-1"],
      schedulingAreaIds: [],
    })
    expect(scope.assertValid).toHaveBeenCalledWith(["area-1"], ["svc-1"])
  })

  it("quem atende sem área de atuação → InvalidProfessionalScopeError", async () => {
    await expect(
      resolveUserAccess(
        {
          accessProfile: "admin",
          servesClients: true,
          permissions: ["admin.users.read"],
          areaIds: [],
          serviceIds: [],
          schedulingAreaIds: [],
        },
        makeScope(),
        MASTER_GRANT
      )
    ).rejects.toBeInstanceOf(InvalidProfessionalScopeError)
  })

  it("perfil Profissional sem a marcação zera áreas e serviços de atuação", async () => {
    const access = await resolveUserAccess(
      {
        accessProfile: "professional",
        servesClients: false,
        permissions: [],
        areaIds: ["area-1"],
        serviceIds: ["svc-1"],
        schedulingAreaIds: [],
      },
      makeScope(),
      MASTER_GRANT
    )
    expect(access).toEqual({
      permissions: [],
      areaIds: [],
      serviceIds: [],
      schedulingAreaIds: [],
    })
  })

  it("atuação e agendamento coexistem sem uma zerar a outra", async () => {
    const access = await resolveUserAccess(
      {
        accessProfile: "admin",
        servesClients: true,
        permissions: ["admin.users.read"],
        areaIds: ["atuacao-1"],
        serviceIds: ["svc-1"],
        schedulingAreaIds: ["agenda-1"],
      },
      makeScope(),
      MASTER_GRANT
    )
    expect(access).toEqual({
      permissions: ["admin.users.read"],
      areaIds: ["atuacao-1"],
      serviceIds: ["svc-1"],
      schedulingAreaIds: ["agenda-1"],
    })
  })

  it("sem atendimento zera áreas e serviços de atuação", async () => {
    const access = await resolveUserAccess(
      {
        accessProfile: "admin",
        servesClients: false,
        permissions: ["admin.users.read"],
        areaIds: ["a"],
        serviceIds: ["s"],
        schedulingAreaIds: [],
      },
      makeScope(),
      MASTER_GRANT
    )
    expect(access).toEqual({
      permissions: ["admin.users.read"],
      areaIds: [],
      serviceIds: [],
      schedulingAreaIds: [],
    })
  })
})

describe("assertCanGrant (concessão limitada ao ator)", () => {
  function actorOf(keys: string[]): GrantContext["actor"] {
    return { permissions: new Set(keys), isMaster: false }
  }

  it("master concede qualquer chave", () => {
    expect(() => {
      assertCanGrant(
        { actor: { permissions: new Set<string>(), isMaster: true }, current: [] },
        ["admin.users.read"]
      )
    }).not.toThrow()
  })

  it("conjunto contido no do ator passa", () => {
    expect(() => {
      assertCanGrant(
        { actor: actorOf(["admin.users.read", "admin.users.create"]), current: [] },
        ["admin.users.read"]
      )
    }).not.toThrow()
  })

  it("chave nova fora do conjunto do ator lança", () => {
    expect(() => {
      assertCanGrant(
        { actor: actorOf(["admin.users.read"]), current: [] },
        ["admin.tags.read"]
      )
    }).toThrow(PermissionGrantNotAllowedError)
  })

  it("manter chave que o alvo já tinha e o ator não tem passa", () => {
    expect(() => {
      assertCanGrant(
        {
          actor: actorOf(["admin.users.read", "admin.users.update"]),
          current: ["admin.tags.read"],
        },
        ["admin.tags.read"]
      )
    }).not.toThrow()
  })

  it("revogar chave que o ator não tem lança (a revogação também é edição)", () => {
    expect(() => {
      assertCanGrant(
        { actor: actorOf(["admin.users.update"]), current: ["admin.tags.read"] },
        []
      )
    }).toThrow(PermissionGrantNotAllowedError)
  })

  it("revogar chave que o ator tem passa", () => {
    expect(() => {
      assertCanGrant(
        {
          actor: actorOf(["admin.users.update", "admin.tags.read"]),
          current: ["admin.tags.read"],
        },
        []
      )
    }).not.toThrow()
  })

  it("conjunto inalterado passa mesmo com chave fora do ator", () => {
    expect(() => {
      assertCanGrant(
        { actor: actorOf([]), current: ["admin.tags.read"] },
        ["admin.tags.read"]
      )
    }).not.toThrow()
  })

  it("troca simultânea cobra as duas pontas do delta", () => {
    expect(() => {
      assertCanGrant(
        {
          actor: actorOf(["admin.users.read", "admin.tags.read"]),
          current: ["admin.tags.read"],
        },
        ["admin.users.read"]
      )
    }).not.toThrow()
    expect(() => {
      assertCanGrant(
        { actor: actorOf(["admin.users.read"]), current: ["admin.tags.read"] },
        ["admin.users.read"]
      )
    }).toThrow(PermissionGrantNotAllowedError)
  })

  it("master revoga chave que não possui", () => {
    expect(() => {
      assertCanGrant(
        {
          actor: { permissions: new Set<string>(), isMaster: true },
          current: ["admin.tags.read"],
        },
        []
      )
    }).not.toThrow()
  })

  it("o 403 carrega o type permission-grant-not-allowed", () => {
    let caught: unknown
    try {
      assertCanGrant({ actor: actorOf([]), current: ["admin.tags.read"] }, [])
    } catch (error) {
      caught = error
    }
    const denied = caught as PermissionGrantNotAllowedError
    expect(denied.status).toBe(403)
    expect(denied.type).toMatch(/permission-grant-not-allowed$/)
  })

  it("a mensagem não enumera as chaves negadas", () => {
    // SPEC_DEVIATION: captura fora do catch, asserts incondicionais depois.
    // Reason: vitest/no-conditional-expect — expect dentro do catch só roda
    // se lançar; capturando em `caught` os asserts rodam sempre.
    let caught: unknown
    try {
      assertCanGrant({ actor: actorOf([]), current: [] }, ["admin.users.read"])
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(PermissionGrantNotAllowedError)
    expect((caught as Error).message).not.toContain("admin.users.read")
  })
})
