import { Injectable } from "@nestjs/common"
import { eq, gte, inArray, lte, ne, sql, type SQL } from "drizzle-orm"

import {
  buildListingClauses,
  escapeLike,
  type ListingConfig,
} from "../../../../shared/kernel/listing/apply-listing"
import { toPaginated } from "../../../../shared/kernel/listing/paginated"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { UserDirectoryFacade } from "../../../identity/api/facades/user-directory.facade"
import { auditEntries } from "../tables/audit-entry.table"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"
import type {
  AuditEntryReadRow,
  AuditRepository,
  ListAuditEntriesInput,
} from "../../domain/ports/audit.repository"

/**
 * `q` varre o id da entidade, o conteúdo das alterações (trgm, índice 0056) e
 * o ator — resolvido fora do SQL, via `actorIds` já buscados pela facade.
 * Combinados em OR pelo buildListingClauses.
 */
function buildConfig(actorIds: string[]): ListingConfig {
  return {
    sortable: { occurredAt: auditEntries.occurredAt },
    searchable: [
      auditEntries.entityId,
      (term) =>
        sql`(coalesce(${auditEntries.rowOld}::text, '') || coalesce(${auditEntries.rowNew}::text, '')) ILIKE ${`%${escapeLike(term)}%`}`,
      // Ignora term de propósito: os ids já vieram resolvidos via UserDirectoryFacade.
      () =>
        actorIds.length > 0 ? inArray(auditEntries.actorUserId, actorIds) : undefined,
    ],
    defaultSort: { key: "occurredAt", order: "desc" },
    tiebreaker: auditEntries.seq,
  }
}

@Injectable()
export class DrizzleAuditRepository implements AuditRepository {
  constructor(
    private readonly tx: TransactionManager,
    private readonly users: UserDirectoryFacade
  ) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async list(
    input: ListAuditEntriesInput
  ): Promise<PaginatedResult<AuditEntryReadRow>> {
    const actorIds =
      input.q !== undefined ? await this.users.findIdsByNameLike(input.q) : []
    const filters: SQL[] = []
    if (input.tables !== undefined && input.tables.length > 0) {
      filters.push(inArray(auditEntries.tableName, input.tables))
    }
    if (input.entityId !== undefined) {
      filters.push(eq(auditEntries.entityId, input.entityId))
    }
    if (input.actorUserId !== undefined) {
      filters.push(eq(auditEntries.actorUserId, input.actorUserId))
    }
    if (input.op !== undefined) {
      filters.push(eq(auditEntries.op, input.op))
    }
    if (input.origin === "user") {
      filters.push(eq(auditEntries.origin, "http"))
    }
    if (input.origin === "system") {
      filters.push(ne(auditEntries.origin, "http"))
    }
    if (input.txId !== undefined) {
      filters.push(eq(auditEntries.txId, input.txId))
    }
    if (input.from !== undefined) {
      filters.push(gte(auditEntries.occurredAt, new Date(input.from)))
    }
    if (input.to !== undefined) {
      filters.push(lte(auditEntries.occurredAt, new Date(input.to)))
    }

    const { where, orderBy, limit, offset } = buildListingClauses(
      input,
      buildConfig(actorIds),
      filters
    )
    const rows = await this.db
      .select({
        seq: auditEntries.seq,
        occurredAt: auditEntries.occurredAt,
        schemaName: auditEntries.schemaName,
        tableName: auditEntries.tableName,
        entityId: auditEntries.entityId,
        op: auditEntries.op,
        rowOld: auditEntries.rowOld,
        rowNew: auditEntries.rowNew,
        changedKeys: auditEntries.changedKeys,
        actorUserId: auditEntries.actorUserId,
        correlationId: auditEntries.correlationId,
        origin: auditEntries.origin,
        txId: auditEntries.txId,
      })
      .from(auditEntries)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)

    const counted = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditEntries)
      .where(where)

    return toPaginated(rows, counted[0]?.n ?? 0, input.page, input.pageSize)
  }
}
