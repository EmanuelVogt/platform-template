import { createHash } from "node:crypto"

import { Inject } from "@nestjs/common"
import { ulid } from "ulid"

import { OBJECT_STORAGE, type ObjectStoragePort } from "../../../../../shared/infra/storage/object-storage.port"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { TransactionManager } from "../../../../../shared/kernel/transactional/transaction-manager"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { Attachment } from "../../../domain/attachment.entity"
import { sniffImageContentType } from "../../../domain/content-type-sniff"
import { PayloadTooLargeError, UnsupportedMediaTypeError } from "../../../domain/errors"
import {
  ATTACHMENT_ACCESS_LOG_REPOSITORY,
  type AttachmentAccessLogRepository,
} from "../../../domain/ports/attachment-access-log.repository"
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepository,
} from "../../../domain/ports/attachment.repository"
import {
  UPLOAD_PROFILES,
  type UploadProfileCatalog,
} from "../../../domain/upload-profiles"

import type { UploadAttachmentInput } from "./types"

@UseCase()
export class UploadAttachmentUseCase {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(ATTACHMENT_REPOSITORY) private readonly repo: AttachmentRepository,
    @Inject(ATTACHMENT_ACCESS_LOG_REPOSITORY)
    private readonly accessLog: AttachmentAccessLogRepository,
    private readonly txManager: TransactionManager,
    private readonly ctx: RequestContext,
    @Inject(UPLOAD_PROFILES) private readonly profiles: UploadProfileCatalog,
  ) {}

  @Traced({ name: "attachment.upload" })
  async execute(input: UploadAttachmentInput): Promise<{ id: string }> {
    const profile = this.profiles[input.profile]
    if (input.bytes.byteLength > profile.maxBytes) {
      throw new PayloadTooLargeError(`Limite: ${profile.maxBytes} bytes.`)
    }
    if (profile.accept === "image") {
      const sniffed = sniffImageContentType(input.bytes)
      if (sniffed === null || sniffed !== input.declaredContentType) {
        throw new UnsupportedMediaTypeError()
      }
    }
    // Profile "any" confia no tipo declarado porque a origem é interna (PDF que
    // nós mesmos renderizamos) e o download serve esses profiles como
    // octet-stream + attachment + nosniff — byte arbitrário não executa.
    const contentType = input.declaredContentType

    const checksum = createHash("sha256").update(input.bytes).digest("hex")
    const id = ulid()
    const storageKey = `attachments/${id}`

    // PUT no R2 FORA de tx (IO externo). Só persistimos depois do upload OK.
    await this.storage.put(storageKey, input.bytes, contentType)

    const now = new Date()
    const attachment = Attachment.fromProps({
      id,
      storageKey,
      contentType,
      sizeBytes: input.bytes.byteLength,
      checksum,
      originalFilename: input.originalFilename,
      profile: input.profile,
      visibility: profile.visibility,
      ownerUserId: input.ownerUserId,
      status: "ready",
      createdAt: now,
      updatedAt: now,
    })
    // Tx curta via run explícito (chamada interna não passa pelo @Transactional).
    // O PUT no R2 já ocorreu acima, fora da tx.
    await this.txManager.run(() => this.repo.insert(attachment))

    const store = this.ctx.get()
    await this.accessLog.record({
      attachmentId: id,
      userId: this.ctx.getActor()?.id ?? null,
      ip: store.ip,
      userAgent: store.userAgent,
      action: "upload",
      outcome: "allowed",
      correlationId: store.correlationId,
    })
    return { id }
  }
}
