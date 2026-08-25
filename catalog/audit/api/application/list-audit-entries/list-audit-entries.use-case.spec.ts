import { type Mock, describe, expect, it, vi } from "vitest"

import { ForbiddenError } from "../../../../shared/kernel/errors/forbidden.error"
import { AuditRegistry } from "../services/audit-registry"

import { ListAuditEntriesUseCase } from "./list-audit-entries.use-case"

import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type { IdentityAccess } from "../../../identity/api/facades/identity-access.facade"
import type { UserDirectoryFacade } from "../../../identity/api/facades/user-directory.facade"
import type {
  AuditEntryReadRow,
  AuditRepository,
} from "../../domain/ports/audit.repository"
import type {
  RefLabelReader,
  RefTarget,
} from "../../domain/ports/ref-label.reader"

function fakeReader(
  byTable: Record<string, Record<string, string>>
): RefLabelReader {
  return {
    findLabels: (target: RefTarget, ids: readonly string[]) => {
      const known = byTable[target.table] ?? {}
      const found = new Map<string, string>()
      for (const id of ids) {
        if (Object.hasOwn(known, id)) found.set(id, known[id]!)
      }
      return Promise.resolve(found)
    },
  }
}

function row(overrides: Partial<AuditEntryReadRow>): AuditEntryReadRow {
  return {
    seq: 1,
    occurredAt: new Date("2026-07-07T10:00:00Z"),
    schemaName: "service",
    tableName: "tags",
    entityId: "s1",
    op: "update",
    rowOld: null,
    rowNew: null,
    changedKeys: [],
    actorUserId: null,
    correlationId: null,
    origin: "http",
    txId: 1,
    ...overrides,
  }
}

function makeUseCase(
  rows: AuditEntryReadRow[],
  names: Map<string, string>,
  reader: RefLabelReader = fakeReader({})
): {
  useCase: ListAuditEntriesUseCase
  findNamesByIds: Mock
  list: Mock
} {
  const page: PaginatedResult<AuditEntryReadRow> = {
    data: rows,
    page: { total: rows.length, page: 1, pageSize: 20, totalPages: 1 },
  }
  const list = vi.fn().mockResolvedValue(page)
  const repo = { list } as unknown as AuditRepository
  const findNamesByIds = vi.fn().mockResolvedValue(names)
  const facade = { findNamesByIds } as unknown as UserDirectoryFacade
  const masterCtx = {
    getExtension: () => ({ permissions: new Set<string>(), isMaster: true }),
  }
  return {
    useCase: new ListAuditEntriesUseCase(
      repo,
      facade,
      reader,
      masterCtx as never,
      new AuditRegistry()
    ),
    findNamesByIds,
    list,
  }
}

describe("ListAuditEntriesUseCase", () => {
  it("insert expõe row_new inteiro com old null", async () => {
    const { useCase } = makeUseCase(
      [row({ op: "insert", rowNew: { name: "Novo", is_active: true } })],
      new Map()
    )
    const res = await useCase.execute({ page: 1, pageSize: 20 })
    expect(res.data[0]?.changes).toEqual({
      name: { old: null, new: "Novo", oldLabel: null, newLabel: null },
      is_active: { old: null, new: true, oldLabel: null, newLabel: null },
    })
  })

  it("delete expõe row_old inteiro com new null", async () => {
    const { useCase } = makeUseCase(
      [row({ op: "delete", rowOld: { name: "Ida" } })],
      new Map()
    )
    const res = await useCase.execute({ page: 1, pageSize: 20 })
    expect(res.data[0]?.changes).toEqual({
      name: { old: "Ida", new: null, oldLabel: null, newLabel: null },
    })
  })

  it("update expõe só as changed_keys", async () => {
    const { useCase } = makeUseCase(
      [
        row({
          op: "update",
          rowOld: { name: "A", age: 1 },
          rowNew: { name: "B", age: 1 },
          changedKeys: ["name"],
        }),
      ],
      new Map()
    )
    const res = await useCase.execute({ page: 1, pageSize: 20 })
    expect(res.data[0]?.changes).toEqual({
      name: { old: "A", new: "B", oldLabel: null, newLabel: null },
    })
  })

  it("expande table raiz para raiz+satélites no repositório", async () => {
    const { useCase, list } = makeUseCase([], new Map())
    await useCase.execute({
      page: 1,
      pageSize: 20,
      table: "permission_templates",
    })
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        tables: ["permission_templates", "permission_template_permissions"],
      })
    )
    expect(list.mock.calls[0]?.[0]).not.toHaveProperty("table")
  })

  it("sem table não passa tables", async () => {
    const { useCase, list } = makeUseCase([], new Map())
    await useCase.execute({ page: 1, pageSize: 20 })
    expect(list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      tables: undefined,
    })
    expect(list.mock.calls[0]?.[0].tables).toBeUndefined()
  })

  it("resolve actorName em lote com ids distintos", async () => {
    const { useCase, findNamesByIds } = makeUseCase(
      [
        row({ seq: 1, actorUserId: "u1" }),
        row({ seq: 2, actorUserId: "u1" }),
        row({ seq: 3, actorUserId: "u2" }),
        row({ seq: 4, actorUserId: null }),
      ],
      new Map([
        ["u1", "Ana"],
        ["u2", "Beto"],
      ])
    )
    const res = await useCase.execute({ page: 1, pageSize: 20 })
    expect(findNamesByIds).toHaveBeenCalledTimes(1)
    const calledWith = findNamesByIds.mock.calls[0]?.[0] as string[]
    expect([...calledWith].sort()).toEqual(["u1", "u2"])
    expect(res.data.map((e) => e.actorName)).toEqual([
      "Ana",
      "Ana",
      "Beto",
      null,
    ])
  })

  it("resolve labels de FK nas changes (update e insert de satélite)", async () => {
    const reader = fakeReader({
      users: { "u-1": "Ana", "u-2": "Bia" },
    })
    const { useCase } = makeUseCase(
      [
        row({
          seq: 1,
          tableName: "tags",
          op: "update",
          rowOld: { user_id: "u-1" },
          rowNew: { user_id: "u-2" },
          changedKeys: ["user_id"],
        }),
        row({
          seq: 2,
          tableName: "user_permissions",
          op: "insert",
          rowNew: { template_id: "t1", user_id: "u-1" },
        }),
      ],
      new Map(),
      reader
    )
    const res = await useCase.execute({ page: 1, pageSize: 20 })
    expect(res.data[0]?.changes.user_id).toEqual({
      old: "u-1",
      new: "u-2",
      oldLabel: "Ana",
      newLabel: "Bia",
    })
    expect(res.data[1]?.changes.user_id?.newLabel).toBe("Ana")
    // template_id não tem label no fake → null, sem erro.
    expect(res.data[1]?.changes.template_id?.newLabel).toBeNull()
  })
})

describe("ListAuditEntriesUseCase — escopo por permissão (ADR 0049)", () => {
  function makeScopedUseCase(access: IdentityAccess | null) {
    const repo = {
      list: vi.fn().mockResolvedValue({
        data: [],
        page: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
    }
    const users = { findNamesByIds: vi.fn().mockResolvedValue(new Map()) }
    const refs = { findLabels: vi.fn().mockResolvedValue(new Map()) }
    const ctx = { getExtension: () => access ?? undefined }
    const useCase = new ListAuditEntriesUseCase(
      repo,
      users as never,
      refs,
      ctx as never,
      new AuditRegistry()
    )
    return { useCase, repo }
  }

  const BASE = { page: 1, pageSize: 20 }

  it("sem access no contexto → 403", async () => {
    const { useCase } = makeScopedUseCase(null)
    await expect(useCase.execute(BASE)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("table cujo dono não é possuído → 403", async () => {
    const { useCase } = makeScopedUseCase({
      permissions: new Set(["admin.permission_templates.audit.read"]),
      isMaster: false,
    })
    await expect(
      useCase.execute({ ...BASE, table: "users" })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("table desconhecida → 403 fail-closed", async () => {
    const { useCase } = makeScopedUseCase({
      permissions: new Set(["admin.permission_templates.audit.read"]),
      isMaster: false,
    })
    await expect(
      useCase.execute({ ...BASE, table: "nao_existe" })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("table possuída expande agregado normalmente", async () => {
    const { useCase, repo } = makeScopedUseCase({
      permissions: new Set(["admin.permission_templates.audit.read"]),
      isMaster: false,
    })
    await useCase.execute({ ...BASE, table: "permission_templates" })
    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        tables: expect.arrayContaining([
          "permission_templates",
          "permission_template_permissions",
        ]),
      })
    )
  })

  it("sem table → união das tabelas permitidas", async () => {
    const owned = new Set(["admin.permission_templates.audit.read"])
    const { useCase, repo } = makeScopedUseCase({
      permissions: owned,
      isMaster: false,
    })
    await useCase.execute(BASE)
    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        tables: new AuditRegistry().allowedTables(owned),
      })
    )
  })

  it("sem table e sem nenhuma chave de logs → 403", async () => {
    const { useCase } = makeScopedUseCase({
      permissions: new Set(["admin.users.read"]),
      isMaster: false,
    })
    await expect(useCase.execute(BASE)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("master sem table → sem restrição (tables undefined)", async () => {
    const { useCase, repo } = makeScopedUseCase({
      permissions: new Set(),
      isMaster: true,
    })
    await useCase.execute(BASE)
    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({ tables: undefined })
    )
  })
})

describe("ListAuditEntriesUseCase — trilha completa (ADR 0049, revisão 2026-08-02)", () => {
  function makeUseCase(permissions: Set<string>) {
    const repo = {
      list: vi.fn().mockResolvedValue({
        data: [],
        page: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
    }
    const ctx = { getExtension: () => ({ permissions, isMaster: false }) }
    const useCase = new ListAuditEntriesUseCase(
      repo,
      { findNamesByIds: vi.fn().mockResolvedValue(new Map()) } as never,
      { findLabels: vi.fn().mockResolvedValue(new Map()) },
      ctx as never,
      new AuditRegistry()
    )
    return { useCase, repo }
  }

  const BASE = { page: 1, pageSize: 20 }
  const FULL = new Set(["admin.audit.read"])

  it("sem table → nenhuma restrição de tabela", async () => {
    const { useCase, repo } = makeUseCase(FULL)
    await useCase.execute(BASE)
    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({ tables: undefined })
    )
  })

  it("lê tabela de outro módulo sem ter a chave dona", async () => {
    const { useCase, repo } = makeUseCase(FULL)
    await useCase.execute({ ...BASE, table: "permission_templates" })
    expect(repo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        tables: expect.arrayContaining([
          "permission_templates",
          "permission_template_permissions",
        ]),
      })
    )
  })

  it("table desconhecida continua 403 mesmo com a trilha completa", async () => {
    const { useCase } = makeUseCase(FULL)
    await expect(
      useCase.execute({ ...BASE, table: "nao_existe" })
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})
