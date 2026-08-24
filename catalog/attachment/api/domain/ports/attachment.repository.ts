import type { Attachment } from "../attachment.entity"

export interface AttachmentRepository {
  /** Insere a entidade + a linha de ACL 1:1 na mesma tx. */
  insert(attachment: Attachment): Promise<void>
  insertMany(attachments: Attachment[]): Promise<void>
  findById(id: string): Promise<Attachment | null>
  findByIds(ids: string[]): Promise<Attachment[]>
  /** UPDATE de status (soft-delete). */
  update(attachment: Attachment): Promise<void>
  saveMany(attachments: Attachment[]): Promise<void>
  /** Pendentes criados antes do corte — alvo do expurgo de órfãos. */
  findPendingOlderThan(cutoff: Date): Promise<Attachment[]>
  deletePendingByIds(ids: string[]): Promise<void>
  /** Soma de `size_bytes` dos pendentes do dono — base da cota de upload. */
  sumPendingBytesByOwner(ownerId: string): Promise<number>
}

export const ATTACHMENT_REPOSITORY: unique symbol = Symbol("AttachmentRepository")
