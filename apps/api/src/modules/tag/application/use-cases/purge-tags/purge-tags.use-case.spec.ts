import { Tag } from "../../../domain/entities/tag.entity"
import { TagNotInTrashError } from "../../../domain/errors"

import { PurgeTagsUseCase } from "./purge-tags.use-case"

const NOW = new Date("2026-07-27T10:00:00.000Z")

function tag(deleted: boolean) {
  return Tag.fromProps({
    id: deleted ? "t-trashed" : "t-live",
    name: deleted ? "Arquivada" : "Ativa",
    color: null,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: deleted ? NOW : null,
  })
}

function makeDeps(over: Record<string, any> = {}) {
  const tags = over.tags ?? {
    findByIds: jest.fn().mockResolvedValue([tag(true)]),
    hardDeleteByIds: jest.fn().mockResolvedValue(undefined),
  }
  const outbox = over.outbox ?? { publish: jest.fn().mockResolvedValue(undefined) }
  const uc = new PurgeTagsUseCase(tags as never, outbox as never)
  return { uc, tags, outbox }
}

describe("PurgeTagsUseCase", () => {
  it("remove as tags da lixeira e emite tag.purged com os ids removidos", async () => {
    const { uc, tags, outbox } = makeDeps()
    const out = await uc.execute({ tagIds: ["t-trashed"] })
    expect(out).toEqual({ purged: 1 })
    expect(tags.hardDeleteByIds).toHaveBeenCalledWith(["t-trashed"])
    expect(outbox.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "tag.purged",
        payload: { tagIds: ["t-trashed"] },
      })
    )
  })

  it("remove mesmo com vínculos — purge não checa mais uso", async () => {
    const { uc } = makeDeps()
    await expect(uc.execute({ tagIds: ["t-trashed"] })).resolves.toEqual({
      purged: 1,
    })
  })

  it("tag fora da lixeira → TagNotInTrashError, sem remoção nem evento", async () => {
    const { uc, tags, outbox } = makeDeps({
      tags: {
        findByIds: jest.fn().mockResolvedValue([tag(false)]),
        hardDeleteByIds: jest.fn(),
      },
    })
    await expect(uc.execute({ tagIds: ["t-live"] })).rejects.toThrow(
      TagNotInTrashError
    )
    expect(tags.hardDeleteByIds).not.toHaveBeenCalled()
    expect(outbox.publish).not.toHaveBeenCalled()
  })

  it("nenhum id encontrado → não emite evento", async () => {
    const { uc, outbox } = makeDeps({
      tags: {
        findByIds: jest.fn().mockResolvedValue([]),
        hardDeleteByIds: jest.fn(),
      },
    })
    await expect(uc.execute({ tagIds: ["ghost"] })).resolves.toEqual({ purged: 0 })
    expect(outbox.publish).not.toHaveBeenCalled()
  })
})
