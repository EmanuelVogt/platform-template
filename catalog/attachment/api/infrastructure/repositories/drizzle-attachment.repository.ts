import { Injectable } from "@nestjs/common"
import { and, eq, inArray, lt } from "drizzle-orm"

import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import { Attachment } from "../../domain/attachment.entity"
import { attachmentAcls } from "../tables/attachment-acl.table"
import { attachments, type AttachmentRow } from "../tables/attachment.table"

import type { DrizzleExecutor } from "../../../../shared/infra/database/drizzle.provider"
import type { AttachmentRepository } from "../../domain/ports/attachment.repository"
import type { UploadProfileName } from "../../domain/upload-profiles"
import type { AttachmentAclRow } from "../tables/attachment-acl.table"

@Injectable()
export class DrizzleAttachmentRepository implements AttachmentRepository {
  constructor(private readonly tx: TransactionManager) {}

  private get db(): DrizzleExecutor {
    return this.tx.getExecutor()
  }

  async insert(attachment: Attachment): Promise<void> {
    await this.insertMany([attachment])
  }

  async insertMany(items: Attachment[]): Promise<void> {
    if (items.length === 0) return
    await this.db.insert(attachments).values(
      items.map((attachment) => {
        const p = attachment.props
        return {
          id: p.id,
          storageKey: p.storageKey,
          contentType: p.contentType,
          sizeBytes: p.sizeBytes,
          checksum: p.checksum,
          originalFilename: p.originalFilename,
          profile: p.profile,
          ownerUserId: p.ownerUserId,
          status: p.status,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }
      }),
    )
    await this.db.insert(attachmentAcls).values(
      items.map((attachment) => ({
        attachmentId: attachment.props.id,
        visibility: attachment.props.visibility,
      })),
    )
  }

  async findById(id: string): Promise<Attachment | null> {
    const found = await this.findByIds([id])
    return found[0] ?? null
  }

  async findByIds(ids: string[]): Promise<Attachment[]> {
    if (ids.length === 0) return []
    const rows = await this.db
      .select()
      .from(attachments)
      .innerJoin(attachmentAcls, eq(attachmentAcls.attachmentId, attachments.id))
      .where(inArray(attachments.id, ids))
    return rows.map((row) => this.toEntity(row.attachments, row.attachment_acls))
  }

  async update(attachment: Attachment): Promise<void> {
    await this.saveMany([attachment])
  }

  async saveMany(items: Attachment[]): Promise<void> {
    for (const attachment of items) {
      const p = attachment.props
      await this.db
        .update(attachments)
        .set({
          sizeBytes: p.sizeBytes,
          checksum: p.checksum,
          status: p.status,
          updatedAt: p.updatedAt,
        })
        .where(eq(attachments.id, p.id))
    }
  }

  async findPendingOlderThan(cutoff: Date): Promise<Attachment[]> {
    const rows = await this.db
      .select()
      .from(attachments)
      .innerJoin(attachmentAcls, eq(attachmentAcls.attachmentId, attachments.id))
      .where(and(eq(attachments.status, "pending"), lt(attachments.createdAt, cutoff)))
    return rows.map((row) => this.toEntity(row.attachments, row.attachment_acls))
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.db.delete(attachmentAcls).where(inArray(attachmentAcls.attachmentId, ids))
    await this.db.delete(attachments).where(inArray(attachments.id, ids))
  }

  private toEntity(row: AttachmentRow, acl: AttachmentAclRow): Attachment {
    return Attachment.fromProps({
      id: row.id,
      storageKey: row.storageKey,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      checksum: row.checksum,
      originalFilename: row.originalFilename,
      profile: row.profile as UploadProfileName | "legacy",
      visibility: acl.visibility,
      ownerUserId: row.ownerUserId,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  }
}
