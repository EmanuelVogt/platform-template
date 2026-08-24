import { type Mock, describe, expect, it, vi } from "vitest"

import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { IDENTITY_ACCESS } from "../../../../identity/api/facades/identity-access.facade"
import { TagUsageRegistry } from "../../tag-usage.registry"

import { ListTagsUseCase } from "./list-tags.use-case"

import type { RequestContextStore } from "../../../../../shared/kernel/context/request-context"
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
  const tags = { list: vi.fn().mockResolvedValue({ data: [ROW], page: PAGE }) }
  return new ListTagsUseCase(tags as never, registry)
}

function makeUseCaseWithSpy(): {
  uc: ListTagsUseCase
  tags: { list: Mock }
} {
  const tags = { list: vi.fn().mockResolvedValue({ data: [ROW], page: PAGE }) }
  return {
    uc: new ListTagsUseCase(tags as never, new TagUsageRegistry()),
    tags,
  }
}

/** Roda o use-case dentro de um request com as permissões dadas ao ator. */
async function asActor<T>(
  permissions: string[],
  run: () => Promise<T>,
): Promise<T> {
  const ctx = new RequestContext()
  const store: RequestContextStore = {
    requestId: "r",
    correlationId: "c",
    causationId: null,
    traceId: null,
    spanId: null,
    tenantId: null,
    origin: "http",
    actor: null,
    extensions: new Map(),
    locale: "pt-BR",
    ip: null,
    userAgent: null,
    startedAt: 0,
  }
  return ctx.run(store, () => {
    ctx.setExtension(IDENTITY_ACCESS, {
      permissions: new Set(permissions),
      isMaster: false,
    })
    return run()
  })
}

describe("ListTagsUseCase — lixeira", () => {
  it("deleted=true sem admin.tags.trash.read responde 403 e não consulta o port", async () => {
    const { uc, tags } = makeUseCaseWithSpy()

    await expect(
      asActor(["admin.tags.read"], () =>
        uc.execute({ page: 1, pageSize: 20, deleted: true }),
      ),
    ).rejects.toThrow(ForbiddenError)
    expect(tags.list).not.toHaveBeenCalled()
  })

  it("deleted=true com admin.tags.trash.read lista a lixeira", async () => {
    const { uc, tags } = makeUseCaseWithSpy()

    const out = await asActor(
      ["admin.tags.read", "admin.tags.trash.read"],
      () => uc.execute({ page: 1, pageSize: 20, deleted: true }),
    )

    expect(out.data[0]).toMatchObject({ id: "t1" })
    expect(tags.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      deleted: true,
    })
  })

  it("deleted=false não exige a permissão de lixeira", async () => {
    const { uc, tags } = makeUseCaseWithSpy()

    await expect(
      uc.execute({ page: 1, pageSize: 20, deleted: false }),
    ).resolves.toBeDefined()
    expect(tags.list).toHaveBeenCalledTimes(1)
  })
})

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
