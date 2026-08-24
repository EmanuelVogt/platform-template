import { Injectable } from "@nestjs/common"
import { and, desc, eq, inArray, lt } from "drizzle-orm"
import { ulid } from "ulid"

import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { attachmentAccessLogs } from "../tables/attachment-access-log.table"

import type {
  AccessLogEntry,
  AttachmentAccessLogListItem,
  AttachmentAccessLogRepository,
} from "../../domain/ports/attachment-access-log.repository"

@Injectable()
export class DrizzleAttachmentAccessLogRepository implements AttachmentAccessLogRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get executor() {
    return this.tx.getExecutor()
  }

  async record(entry: AccessLogEntry): Promise<void> {
    await this.tx
      .outsideTransaction()
      .insert(attachmentAccessLogs)
      .values(this.toRow(entry))
  }

  async recordInTx(entry: AccessLogEntry): Promise<void> {
    if (!this.tx.isInTransaction()) {
      throw new Error(
        "recordInTx exige uma transação aberta; use record() fora de tx"
      )
    }
    await this.tx
      .getExecutor()
      .insert(attachmentAccessLogs)
      .values(this.toRow(entry))
  }

  private toRow(entry: AccessLogEntry) {
    return {
      id: ulid(),
      attachmentId: entry.attachmentId,
      userId: entry.userId,
      ip: entry.ip,
      userAgent: entry.userAgent,
      action: entry.action,
      outcome: entry.outcome,
      correlationId: entry.correlationId,
    }
  }

  async listByAttachment(
    attachmentId: string,
    limit: number
  ): Promise<AttachmentAccessLogListItem[]> {
    const rows = await this.executor
      .select({
        id: attachmentAccessLogs.id,
        attachmentId: attachmentAccessLogs.attachmentId,
        userId: attachmentAccessLogs.userId,
        action: attachmentAccessLogs.action,
        occurredAt: attachmentAccessLogs.createdAt,
      })
      .from(attachmentAccessLogs)
      .where(
        and(
          eq(attachmentAccessLogs.attachmentId, attachmentId),
          eq(attachmentAccessLogs.outcome, "allowed")
        )
      )
      .orderBy(desc(attachmentAccessLogs.createdAt))
      .limit(limit)

    return rows
  }

  async deleteBatchOlderThan(cutoff: Date, limit: number): Promise<number> {
    const batch = this.executor
      .select({ id: attachmentAccessLogs.id })
      .from(attachmentAccessLogs)
      .where(lt(attachmentAccessLogs.createdAt, cutoff))
      .orderBy(attachmentAccessLogs.createdAt)
      .limit(limit)
    const res = await this.executor
      .delete(attachmentAccessLogs)
      .where(inArray(attachmentAccessLogs.id, batch))
    return res.rowCount ?? 0
  }
}
