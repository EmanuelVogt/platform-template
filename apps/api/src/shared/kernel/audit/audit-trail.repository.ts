import { Injectable } from "@nestjs/common"
import { sql } from "drizzle-orm"

import { TransactionManager } from "../transactional/transaction-manager"

import type { DrizzleExecutor } from "../../infra/database/drizzle.provider"

/** Referência a uma entidade auditada (para purge LGPD do titular). */
export type AuditEntityRef = { table: string; entityId: string }

/**
 * Escrita de manutenção da trilha `audit.entries` (retention + purge LGPD).
 * A trilha é append-only via trigger: o DELETE só passa quando o GUC
 * transaction-scoped `app.audit_maintenance=on` é ligado na mesma tx — por isso
 * todo método exige uma transação aberta. Ver ADR 0041.
 */
@Injectable()
export class AuditTrailRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  /** Remove entradas além da janela de retention. */
  async deleteOlderThan(cutoff: Date): Promise<number> {
    this.assertTx()
    await this.enableMaintenance()
    const res = await this.db.execute(
      sql`DELETE FROM audit.entries WHERE occurred_at < ${cutoff}`
    )
    return res.rowCount ?? 0
  }

  /**
   * Apaga a trilha das entidades informadas (purge físico do titular). Chamar
   * DEPOIS do hard delete, na mesma tx: o próprio delete gera linhas op=delete
   * com PII em row_old que este purge também remove.
   */
  async purgeEntities(refs: readonly AuditEntityRef[]): Promise<number> {
    if (refs.length === 0) return 0
    this.assertTx()
    await this.enableMaintenance()
    const preds = refs.map(
      (r) => sql`(table_name = ${r.table} AND entity_id = ${r.entityId})`
    )
    const res = await this.db.execute(
      sql`DELETE FROM audit.entries WHERE ${sql.join(preds, sql` OR `)}`
    )
    return res.rowCount ?? 0
  }

  private assertTx(): void {
    if (!this.tx.isInTransaction()) {
      throw new Error(
        "purge da trilha de audit exige transação aberta (escape hatch GUC é transaction-scoped)"
      )
    }
  }

  private async enableMaintenance(): Promise<void> {
    await this.db.execute(
      sql`SELECT set_config('app.audit_maintenance', 'on', true)`
    )
  }
}
