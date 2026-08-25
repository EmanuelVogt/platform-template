import { describe, expect, it, vi } from "vitest"

import { ProfessionalDirectoryFacade } from "./professional-directory.facade"

import type { UserRepository } from "../../domain/ports/user.repository"

function notImplemented(): never {
  throw new Error("not implemented")
}

function makeRepository() {
  const groupedAreas = new Map<string, readonly string[]>([
    ["pro-1", ["area-1", "area-2"]],
    ["pro-2", ["area-2"]],
  ])
  const findProfessionalAreaIdsByUserIds = vi.fn(
    (_userIds: string[]): Promise<Map<string, readonly string[]>> =>
      Promise.resolve(groupedAreas)
  )
  const repository: UserRepository = {
    findByEmail: (_email) => notImplemented(),
    findById: (_id) => notImplemented(),
    findVisibleById: (_id) => notImplemented(),
    insert: (_user) => notImplemented(),
    update: (_user) => notImplemented(),
    registerFailedAttempt: (_userId, _now, _threshold, _durationSeconds) =>
      notImplemented(),
    findByIdForUpdate: (_id) => notImplemented(),
    list: (_input) => notImplemented(),
    findByIdWithPermissions: (_id) => notImplemented(),
    findPermissions: (_userId) => notImplemented(),
    replacePermissions: (_userId, _permissions) => notImplemented(),
    findProfessionalScope: (_userId) => notImplemented(),
    findProfessionalAreaIdsByUserIds,
    findByIds: (_ids) => notImplemented(),
    findStaleEmailChanges: (_now) => notImplemented(),
    hardDeleteByIds: (_ids) => notImplemented(),
    existsActiveProfessional: (_userId) => notImplemented(),
    existsProfessional: (_userId) => notImplemented(),
    searchAssignableProfessionals: (_input) => notImplemented(),
    findProfessionalsByIds: (_ids) => notImplemented(),
    listActiveProfessionals: () => notImplemented(),
    listActiveProfessionalsByArea: (_areaId) => notImplemented(),
    findActiveProfessionalIdsByServices: (_serviceIds) => notImplemented(),
    findActiveProfessionalLinksByServices: (_serviceIds) => notImplemented(),
    findNamesByIds: (_ids) => notImplemented(),
    findIdsByNameLike: (_term) => notImplemented(),
    findNotificationTargetsByPermission: (_permission) => notImplemented(),
  }

  return {
    repository,
    findProfessionalAreaIdsByUserIds,
    groupedAreas,
  }
}

describe("ProfessionalDirectoryFacade", () => {
  it("publica o agrupamento de áreas sem alterar a ordem", async () => {
    const { repository, findProfessionalAreaIdsByUserIds, groupedAreas } =
      makeRepository()
    const facade = new ProfessionalDirectoryFacade(repository)

    await expect(
      facade.findAreaIdsByProfessionalIds(["pro-1", "pro-2"])
    ).resolves.toEqual(groupedAreas)
    expect(findProfessionalAreaIdsByUserIds).toHaveBeenCalledWith([
      "pro-1",
      "pro-2",
    ])
  })
})
