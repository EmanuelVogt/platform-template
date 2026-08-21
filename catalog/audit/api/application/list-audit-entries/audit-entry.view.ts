import type {
  AuditEntryReadRow,
  AuditOp,
} from "../../domain/ports/audit.repository"

export type AuditChange = {
  old: unknown
  new: unknown
  oldLabel: string | null
  newLabel: string | null
}

/** Resolve o valor de uma coluna FK para o nome legível, ou null se não aplicável. */
export type RefResolver = (
  table: string,
  column: string,
  value: unknown
) => string | null

export type AuditEntryView = {
  seq: number
  occurredAt: string
  schemaName: string
  tableName: string
  entityId: string
  op: AuditOp
  changedKeys: string[]
  changes: Record<string, AuditChange>
  actorUserId: string | null
  actorName: string | null
  correlationId: string | null
  origin: string
  txId: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * Monta `changes` = {campo: {old, new}} a partir dos snapshots × changed_keys:
 * insert expõe row_new inteiro (old null), delete expõe row_old inteiro (new
 * null), update só as chaves que mudaram.
 */
function buildChanges(
  row: AuditEntryReadRow,
  resolve: RefResolver
): Record<string, AuditChange> {
  const old = asRecord(row.rowOld)
  const next = asRecord(row.rowNew)
  const change = (k: string, oldValue: unknown, newValue: unknown): AuditChange => ({
    old: oldValue,
    new: newValue,
    oldLabel: resolve(row.tableName, k, oldValue),
    newLabel: resolve(row.tableName, k, newValue),
  })
  if (row.op === "insert") {
    return Object.fromEntries(
      Object.keys(next).map((k) => [k, change(k, null, next[k])])
    )
  }
  if (row.op === "delete") {
    return Object.fromEntries(
      Object.keys(old).map((k) => [k, change(k, old[k], null)])
    )
  }
  return Object.fromEntries(
    row.changedKeys.map((k) => [k, change(k, old[k] ?? null, next[k] ?? null)])
  )
}

export function toAuditEntryView(
  row: AuditEntryReadRow,
  names: Map<string, string>,
  resolve: RefResolver
): AuditEntryView {
  return {
    seq: row.seq,
    occurredAt: row.occurredAt.toISOString(),
    schemaName: row.schemaName,
    tableName: row.tableName,
    entityId: row.entityId,
    // op vem de coluna text com CHECK IN ('insert','update','delete') na 0054.
    op: row.op as AuditOp,
    changedKeys: row.changedKeys,
    changes: buildChanges(row, resolve),
    actorUserId: row.actorUserId,
    actorName: row.actorUserId ? names.get(row.actorUserId) ?? null : null,
    correlationId: row.correlationId,
    origin: row.origin,
    txId: row.txId,
  }
}
