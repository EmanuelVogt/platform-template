import { Injectable } from "@nestjs/common"
import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm"

import { bucketOf } from "../../../../shared/kernel/clock/bucket-sql"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { auditEntries } from "../tables/audit-entry.table"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type {
  ActivityStatsReader,
  ActivityStatsWindow,
  TableActivityRow,
} from "../../domain/ports/activity-stats.reader"

/** Origem gravada pela trilha quando a alteração veio de um request HTTP —
 *  job, sincronização do legado e migração usam outras origens. */
const HUMAN_ORIGIN = "http"

@Injectable()
export class DrizzleActivityStatsReader implements ActivityStatsReader {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async countByTableAndBucket(
    window: ActivityStatsWindow
  ): Promise<TableActivityRow[]> {
    const bucket = bucketOf(auditEntries.occurredAt, window.unit)
    const rows = await this.db
      .select({
        tableName: auditEntries.tableName,
        bucket,
        count: sql<number>`count(*)::int`,
      })
      .from(auditEntries)
      .where(
        and(
          gte(auditEntries.occurredAt, window.from),
          lt(auditEntries.occurredAt, window.to),
          eq(auditEntries.origin, HUMAN_ORIGIN),
          isNotNull(auditEntries.actorUserId)
        )
      )
      .groupBy(auditEntries.tableName, bucket)
    return rows.map((row) => ({
      tableName: row.tableName,
      bucket: new Date(row.bucket),
      count: row.count,
    }))
  }
}
