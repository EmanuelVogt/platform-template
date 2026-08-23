import { bigint, jsonb, text, timestamp } from "drizzle-orm/pg-core"

import { auditSchema } from "./audit.schema"

/**
 * View drizzle da `audit.entries` para a leitura da trilha. A tabela é criada
 * e mantida pela migration manual 0054 (trigger genérica, append-only) — de
 * propósito FORA do schema agregado do drizzle-kit, para o generate não tentar
 * emiti-la (module.json.schemaExports lista só audit.schema, nunca este
 * arquivo). Só leitura passa por aqui; a escrita é do trigger. Nome sem
 * sufixo `.table.ts` de propósito: `schema-completeness.spec.ts` do kernel
 * varre `*.table.ts` exigindo que tudo esteja no agregador do drizzle-kit —
 * este arquivo, por desenho, nunca deve estar.
 */
export const auditEntries = auditSchema.table("entries", {
  seq: bigint("seq", { mode: "number" }).primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  schemaName: text("schema_name").notNull(),
  tableName: text("table_name").notNull(),
  entityId: text("entity_id").notNull(),
  op: text("op").notNull(),
  rowOld: jsonb("row_old"),
  rowNew: jsonb("row_new"),
  changedKeys: text("changed_keys").array().notNull(),
  actorUserId: text("actor_user_id"),
  correlationId: text("correlation_id"),
  origin: text("origin").notNull(),
  txId: bigint("tx_id", { mode: "number" }).notNull(),
})

export type AuditEntryRow = typeof auditEntries.$inferSelect
