import { makeAuditEntry } from "./make-audit-entry"

import type { AuditEntryRow } from "./make-audit-entry"
import type { Pool } from "pg"

/** Insere uma linha em `audit.entries` direto no banco — a trilha é
 *  append-only e normalmente gerada pelo trigger; semear direto isola o
 *  teste do lado que escreve. */
export async function seedAuditEntry(
  pool: Pool,
  over: Partial<AuditEntryRow> = {}
): Promise<void> {
  const entry = makeAuditEntry(over)
  await pool.query(
    `insert into audit.entries
       (occurred_at, schema_name, table_name, entity_id, op, row_old, row_new, changed_keys, actor_user_id, correlation_id, origin, tx_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      entry.occurredAt,
      entry.schemaName,
      entry.tableName,
      entry.entityId,
      entry.op,
      entry.rowOld === null ? null : JSON.stringify(entry.rowOld),
      entry.rowNew === null ? null : JSON.stringify(entry.rowNew),
      entry.changedKeys,
      entry.actorUserId,
      entry.correlationId,
      entry.origin,
      entry.txId,
    ]
  )
}
