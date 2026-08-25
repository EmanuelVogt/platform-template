import { describe, expect, it, vi } from "vitest"

import { ProfessionalDirectoryFacade } from "./professional-directory.facade"

import type { AssignableProfessionalRow } from "../../domain/ports/professional-assignment.repository"
import type { ProfessionalDirectoryReader } from "../../domain/ports/professional-directory.reader"

function notImplemented(): never {
  throw new Error("not implemented")
}

const ANA: AssignableProfessionalRow = {
  id: "pro-1",
  name: "Ana",
  email: "ana@test.local",
  avatarAttachmentId: null,
}

function makeReader(overrides: Partial<ProfessionalDirectoryReader> = {}) {
  const reader: ProfessionalDirectoryReader = {
    existsActive: (_userId) => notImplemented(),
    searchAssignable: (_input) => notImplemented(),
    findAssignableByIds: (_ids) => notImplemented(),
    listActive: () => notImplemented(),
    listActiveByArea: (_areaId) => notImplemented(),
    findAreaIdsByUserIds: (_userIds) => notImplemented(),
    findActiveIdsByServices: (_serviceIds) => notImplemented(),
    findActiveLinksByServices: (_serviceIds) => notImplemented(),
    ...overrides,
  }
  return new ProfessionalDirectoryFacade(reader)
}

describe("ProfessionalDirectoryFacade", () => {
  it("publica o agrupamento de áreas sem alterar a ordem", async () => {
    const groupedAreas = new Map<string, readonly string[]>([
      ["pro-1", ["area-1", "area-2"]],
      ["pro-2", ["area-2"]],
    ])
    const findAreaIdsByUserIds = vi.fn(() => Promise.resolve(groupedAreas))
    const facade = makeReader({ findAreaIdsByUserIds })

    await expect(
      facade.findAreaIdsByProfessionalIds(["pro-1", "pro-2"])
    ).resolves.toEqual(groupedAreas)
    expect(findAreaIdsByUserIds).toHaveBeenCalledWith(["pro-1", "pro-2"])
  })

  it("repassa o input de listagem e devolve o envelope paginado", async () => {
    const page = {
      data: [ANA],
      page: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    }
    const searchAssignable = vi.fn(() => Promise.resolve(page))
    const facade = makeReader({ searchAssignable })

    await expect(
      facade.searchAssignable({ page: 1, pageSize: 20, q: "an" })
    ).resolves.toEqual(page)
    expect(searchAssignable).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      q: "an",
    })
  })

  it("resolve por ids devolvendo o mapa do leitor", async () => {
    const found = new Map([[ANA.id, ANA]])
    const facade = makeReader({
      findAssignableByIds: () => Promise.resolve(found),
    })

    await expect(facade.findByIds(["pro-1", "fantasma"])).resolves.toEqual(
      found
    )
  })

  it("responde se a pessoa é profissional ativa a partir do leitor", async () => {
    const ativa = makeReader({ existsActive: () => Promise.resolve(true) })
    const inativa = makeReader({ existsActive: () => Promise.resolve(false) })

    await expect(ativa.isActiveProfessional("pro-1")).resolves.toBe(true)
    await expect(inativa.isActiveProfessional("pro-2")).resolves.toBe(false)
  })

  it("devolve os vínculos ativos agrupados por serviço, com isDefault", async () => {
    const links = new Map([
      [
        "svc-1",
        [
          { userId: "pro-1", isDefault: true },
          { userId: "pro-2", isDefault: false },
        ],
      ],
    ])
    const facade = makeReader({
      findActiveLinksByServices: () => Promise.resolve(links),
    })

    await expect(
      facade.findActiveProfessionalLinksByServices(["svc-1"])
    ).resolves.toEqual(links)
  })
})
