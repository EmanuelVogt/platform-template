import { TagUsageRegistry } from "../../tag-usage.registry"

import { ListTagsUseCase } from "./list-tags.use-case"

import type { TagUsageReader } from "../../../domain/ports/tag-usage.reader"

const NOW = new Date("2026-07-27T10:00:00.000Z")

const ROW = {
  id: "t1",
  name: "Relaxante",
  color: "#aabbcc",
  isActive: true,
  createdAt: NOW,
  deletedAt: null,
}

const PAGE = { page: 1, pageSize: 20, total: 1, totalPages: 1 }

function makeReader(counts: Record<string, number>): TagUsageReader {
  return {
    countByTagIds: () => Promise.resolve(new Map(Object.entries(counts))),
  }
}

function makeUseCase(readers: TagUsageReader[]): ListTagsUseCase {
  const registry = new TagUsageRegistry()
  for (const reader of readers) registry.register(reader)
  const tags = { list: jest.fn().mockResolvedValue({ data: [ROW], page: PAGE }) }
  return new ListTagsUseCase(tags as never, registry)
}

describe("ListTagsUseCase", () => {
  it("soma o uso de todos os readers registrados", async () => {
    const uc = makeUseCase([makeReader({ t1: 2 }), makeReader({ t1: 1 })])
    const out = await uc.execute({ page: 1, pageSize: 20 })
    expect(out.data[0]).toMatchObject({ id: "t1", usage: { total: 3 } })
  })

  it("sem reader registrado o uso é zero", async () => {
    const uc = makeUseCase([])
    const out = await uc.execute({ page: 1, pageSize: 20 })
    expect(out.data[0]?.usage).toEqual({ total: 0 })
  })

  it("tag que nenhum reader conta fica zerada", async () => {
    const uc = makeUseCase([makeReader({ outra: 5 })])
    const out = await uc.execute({ page: 1, pageSize: 20 })
    expect(out.data[0]?.usage).toEqual({ total: 0 })
  })
})
