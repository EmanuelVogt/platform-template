import { Inject } from "@nestjs/common"

import { RequestContext } from "../../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../../shared/kernel/errors/forbidden.error"
import { Traced } from "../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../shared/kernel/use-case/use-case.decorator"
import { IDENTITY_ACCESS } from "../../../identity/api/facades/identity-access.facade"
import { FULL_AUDIT_PERMISSION } from "../../../identity/api/facades/permission-catalog.facade"
import { UserDirectoryFacade } from "../../../identity/api/facades/user-directory.facade"
import {
  AUDIT_REPOSITORY,
  type AuditEntryReadRow,
  type AuditRepository,
} from "../../domain/ports/audit.repository"
import {
  REF_LABEL_READER,
  type RefLabelReader,
  type RefTarget,
} from "../../domain/ports/ref-label.reader"
import { AuditRegistry } from "../services/audit-registry"

import {
  toAuditEntryView,
  type AuditEntryView,
  type RefResolver,
} from "./audit-entry.view"

import type { ListAuditEntriesQuery } from "./types"
import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type { UseCase as UseCaseContract } from "../../../../shared/kernel/use-case/use-case"

const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {}

function changedColumnsOf(row: AuditEntryReadRow): string[] {
  if (row.op === "update") return row.changedKeys
  return Object.keys(asRecord(row.op === "insert" ? row.rowNew : row.rowOld))
}

/**
 * Lista a trilha paginada, resolve o nome do ator em lote (facade do identity)
 * e traduz FKs das changes para o nome do alvo (RefLabelReader, ver ADR 0047).
 */
@UseCase()
export class ListAuditEntriesUseCase
  implements
    UseCaseContract<ListAuditEntriesQuery, PaginatedResult<AuditEntryView>>
{
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly repo: AuditRepository,
    private readonly users: UserDirectoryFacade,
    @Inject(REF_LABEL_READER) private readonly refs: RefLabelReader,
    private readonly ctx: RequestContext,
    private readonly registry: AuditRegistry
  ) {}

  @ReadOnly()
  @Traced({ name: "audit.listAuditEntries" })
  async execute(
    input: ListAuditEntriesQuery
  ): Promise<PaginatedResult<AuditEntryView>> {
    const access = this.ctx.getExtension(IDENTITY_ACCESS)
    if (access === undefined) {
      throw new ForbiddenError()
    }
    const { table, ...rest } = input
    const readsEverything =
      access.isMaster || access.permissions.has(FULL_AUDIT_PERMISSION)
    let tables: string[] | undefined
    if (table !== undefined) {
      const owner = this.registry.ownerOf(table)
      if (
        owner === undefined ||
        (!readsEverything && !access.permissions.has(owner))
      ) {
        throw new ForbiddenError()
      }
      tables = this.registry.tablesForAggregate(table)
    } else if (!readsEverything) {
      tables = this.registry.allowedTables(access.permissions)
      if (tables.length === 0) {
        throw new ForbiddenError()
      }
    }
    const { data, page } = await this.repo.list({ ...rest, tables })
    const actorIds = [
      ...new Set(
        data
          .map((r) => r.actorUserId)
          .filter((id): id is string => id !== null)
      ),
    ]
    const names = await this.users.findNamesByIds(actorIds)

    const buckets = new Map<string, { target: RefTarget; ids: Set<string> }>()
    for (const r of data) {
      const oldRec = asRecord(r.rowOld)
      const newRec = asRecord(r.rowNew)
      for (const column of changedColumnsOf(r)) {
        const target = this.registry.refTargetFor(column)
        if (target === undefined) continue
        const key = `${target.schema}.${target.table}`
        const bucket = buckets.get(key) ?? { target, ids: new Set<string>() }
        for (const value of [oldRec[column], newRec[column]]) {
          if (typeof value === "string") bucket.ids.add(value)
        }
        buckets.set(key, bucket)
      }
    }
    const resolved = new Map<string, string>()
    await Promise.all(
      [...buckets.values()].map(async ({ target, ids }) => {
        const labels = await this.refs.findLabels(target, [...ids])
        for (const [id, label] of labels) {
          resolved.set(`${target.schema}.${target.table}:${id}`, label)
        }
      })
    )
    const resolve: RefResolver = (_tableName, column, value) => {
      if (typeof value !== "string") return null
      const target = this.registry.refTargetFor(column)
      if (target === undefined) return null
      return resolved.get(`${target.schema}.${target.table}:${value}`) ?? null
    }
    return { data: data.map((r) => toAuditEntryView(r, names, resolve)), page }
  }
}
