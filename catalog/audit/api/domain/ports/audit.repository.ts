import type { PaginatedResult } from "../../../../shared/kernel/listing/paginated"

export type AuditOp = "insert" | "update" | "delete"

export type AuditOriginFilter = "user" | "system"

/** Filtros da listagem da trilha (todos opcionais, combinados em AND). */
export type ListAuditEntriesInput = {
  page: number
  pageSize: number
  sort?: "occurredAt"
  order?: "asc" | "desc"
  q?: string
  tables?: string[]
  entityId?: string
  actorUserId?: string
  op?: AuditOp
  origin?: AuditOriginFilter
  txId?: number
  from?: string
  to?: string
}

/** Linha crua da trilha (snapshots completos + metadados de contexto). */
export type AuditEntryReadRow = {
  seq: number
  occurredAt: Date
  schemaName: string
  tableName: string
  entityId: string
  op: string
  rowOld: unknown
  rowNew: unknown
  changedKeys: string[]
  actorUserId: string | null
  correlationId: string | null
  origin: string
  txId: number
}

export interface AuditRepository {
  list(
    input: ListAuditEntriesInput
  ): Promise<PaginatedResult<AuditEntryReadRow>>
}

export const AUDIT_REPOSITORY: unique symbol = Symbol("AuditRepository")
