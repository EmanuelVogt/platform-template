export type AuditEntryRow = {
  occurredAt: Date
  schemaName: string
  tableName: string
  entityId: string
  op: "insert" | "update" | "delete"
  rowOld: unknown
  rowNew: unknown
  changedKeys: string[]
  actorUserId: string | null
  correlationId: string | null
  origin: string
  txId: number
}

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z")

/** Linha de `audit.entries` pronta pra spec: só o que o teste muda entra em `over`. */
export function makeAuditEntry(
  over: Partial<AuditEntryRow> = {}
): AuditEntryRow {
  return {
    occurredAt: FIXED_NOW,
    schemaName: "identity",
    tableName: "users",
    entityId: "u-1",
    op: "insert",
    rowOld: null,
    rowNew: {},
    changedKeys: [],
    actorUserId: null,
    correlationId: null,
    origin: "http",
    txId: 1,
    ...over,
  }
}
