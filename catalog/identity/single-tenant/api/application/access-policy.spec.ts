import { describe, expect, it } from "vitest"

import { BASE_ACCESS_PROFILES } from "../domain/access/access-profile.types"
import {
  InvalidPermissionSetError,
  PermissionGrantNotAllowedError,
} from "../domain/errors"

import {
  assertCanGrant,
  assertProfileFloor,
  assertValidPermissionSet,
  resolveUserAccess,
} from "./access-policy"

import type { GrantContext } from "./access-policy"

describe("assertValidPermissionSet (closure de requires)", () => {
  it("aceita set vazio", () => {
    expect(() => {
      assertValidPermissionSet([])
    }).not.toThrow()
    expect(() => {
      assertValidPermissionSet(["admin.users.trash.read"])
    }).toThrow("admin.users.read")
  })

  it("aceita set com cadeia completa", () => {
    expect(() => {
      assertValidPermissionSet([
        "admin.users.read",
        "admin.users.trash.read",
        "admin.users.trash.purge",
      ])
    }).not.toThrow()
    expect(() => {
      assertValidPermissionSet(["admin.users.read", "admin.users.trash.purge"])
    }).toThrow("admin.users.trash.read")
  })

  it("rejeita chave sem o requires presente, listando as faltantes", () => {
    expect(() => {
      assertValidPermissionSet(["admin.users.trash.purge"])
    }).toThrow(InvalidPermissionSetError)
    // SPEC_DEVIATION: 2ª chamada com toThrow(string) no lugar de try/catch com
    // expect dentro do catch. Reason: vitest/no-conditional-expect — toThrow
    // aceita substring da mensagem e mantém o assert incondicional.
    expect(() => {
      assertValidPermissionSet(["admin.users.trash.purge"])
    }).toThrow("admin.users.trash.read")
  })
})

describe("assertProfileFloor (piso do perfil)", () => {
  it("master é isento (set vazio passa)", () => {
    expect(() => {
      assertProfileFloor("master", [])
    }).not.toThrow()
    expect(() => {
      assertProfileFloor("admin", [])
    }).toThrow(InvalidPermissionSetError)
  })

  it("admin exige ≥1 chave do módulo admin", () => {
    expect(() => {
      assertProfileFloor("admin", ["admin.users.read"])
    }).not.toThrow()
    expect(() => {
      assertProfileFloor("admin", [])
    }).toThrow(InvalidPermissionSetError)
  })
  describe("o piso sai da def registrada, não de chave literal", () => {
    const exempt = BASE_ACCESS_PROFILES.filter((def) => !def.permissionFloor)
    const enforced = BASE_ACCESS_PROFILES.filter((def) => def.permissionFloor)

    it("perfil com permissionFloor false aceita set vazio", () => {
      expect(exempt.map((def) => def.key)).toEqual(["master"])
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
          `O perfil de acesso exige ao menos uma permissão do módulo "${def.key}".`
        )
      }
    })
  })
})

const MASTER_GRANT: GrantContext = {
  actor: { permissions: new Set<string>(), isMaster: true },
  current: [],
}

describe("resolveUserAccess", () => {
  it("resolve só o conjunto de permissões — a fatia profissional saiu da entrada", () => {
    const access = resolveUserAccess(
      { accessProfile: "admin", permissions: ["admin.users.read"] },
      MASTER_GRANT
    )
    expect(access).toEqual({ permissions: ["admin.users.read"] })
  })

  it("propaga a recusa do piso do perfil sem resolver nada", () => {
    expect(() =>
      resolveUserAccess(
        { accessProfile: "admin", permissions: [] },
        MASTER_GRANT
      )
    ).toThrow(InvalidPermissionSetError)
  })
})
describe("assertCanGrant (concessão limitada ao ator)", () => {
  function actorOf(keys: string[]): GrantContext["actor"] {
    return { permissions: new Set(keys), isMaster: false }
  }

  it("master concede qualquer chave", () => {
    expect(() => {
      assertCanGrant(
        {
          actor: { permissions: new Set<string>(), isMaster: true },
          current: [],
        },
        ["admin.users.read"]
      )
    }).not.toThrow()
    expect(() => {
      assertCanGrant({ actor: actorOf([]), current: [] }, ["admin.users.read"])
    }).toThrow(PermissionGrantNotAllowedError)
  })

  it("conjunto contido no do ator passa", () => {
    expect(() => {
      assertCanGrant(
        {
          actor: actorOf(["admin.users.read", "admin.users.create"]),
          current: [],
        },
        ["admin.users.read"]
      )
    }).not.toThrow()
    expect(() => {
      assertCanGrant({ actor: actorOf(["admin.users.create"]), current: [] }, [
        "admin.users.read",
      ])
    }).toThrow(PermissionGrantNotAllowedError)
  })

  it("chave nova fora do conjunto do ator lança", () => {
    expect(() => {
      assertCanGrant({ actor: actorOf(["admin.users.read"]), current: [] }, [
        "admin.tags.read",
      ])
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
    expect(() => {
      assertCanGrant(
        {
          actor: actorOf(["admin.users.read", "admin.users.update"]),
          current: ["admin.tags.read"],
        },
        []
      )
    }).toThrow(PermissionGrantNotAllowedError)
  })

  it("revogar chave que o ator não tem lança (a revogação também é edição)", () => {
    expect(() => {
      assertCanGrant(
        {
          actor: actorOf(["admin.users.update"]),
          current: ["admin.tags.read"],
        },
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
    expect(() => {
      assertCanGrant(
        {
          actor: actorOf(["admin.users.update"]),
          current: ["admin.tags.read"],
        },
        []
      )
    }).toThrow(PermissionGrantNotAllowedError)
  })

  it("conjunto inalterado passa mesmo com chave fora do ator", () => {
    expect(() => {
      assertCanGrant({ actor: actorOf([]), current: ["admin.tags.read"] }, [
        "admin.tags.read",
      ])
    }).not.toThrow()
    expect(() => {
      assertCanGrant({ actor: actorOf([]), current: ["admin.tags.read"] }, [
        "admin.tags.read",
        "admin.users.read",
      ])
    }).toThrow(PermissionGrantNotAllowedError)
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
    expect(() => {
      assertCanGrant({ actor: actorOf([]), current: ["admin.tags.read"] }, [])
    }).toThrow(PermissionGrantNotAllowedError)
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
