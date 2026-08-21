import { Inject } from "@nestjs/common"

import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from "../../../../../shared/infra/storage/object-storage.port"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { TransactionManager } from "../../../../../shared/kernel/transactional/transaction-manager"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { Attachment } from "../../../domain/attachment.entity"
import {
  AttachmentNotFoundError,
  UploadNotConfirmableError,
  UploadQuotaExceededError,
} from "../../../domain/errors"
import { formatMegabytes } from "../../../domain/format-megabytes"
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepository,
} from "../../../domain/ports/attachment.repository"
import {
  UPLOAD_PROFILES,
  type UploadProfileCatalog,
} from "../../../domain/upload-profiles"

import type { ConfirmUploadsInput } from "./types"

@UseCase()
export class ConfirmUploadsUseCase {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(ATTACHMENT_REPOSITORY) private readonly repo: AttachmentRepository,
    @Inject(UPLOAD_PROFILES) private readonly profiles: UploadProfileCatalog,
    private readonly txManager: TransactionManager,
  ) {}

  @Traced({ name: "attachment.confirmUploads" })
  async execute(input: ConfirmUploadsInput): Promise<void> {
    if (input.ids.length === 0) return

    const profile = this.profiles[input.profile]
    const found = await this.repo.findByIds(input.ids)
    if (found.length !== input.ids.length) throw new AttachmentNotFoundError()
    if (found.length > profile.maxFiles) {
      throw new UploadQuotaExceededError(
        `Máximo de ${String(profile.maxFiles)} arquivos por envio.`,
      )
    }

    const ready: Attachment[] = []
    let total = 0
    for (const attachment of found) {
      const p = attachment.props
      if (
        p.status !== "pending" ||
        p.profile !== input.profile ||
        p.ownerUserId !== input.ownerUserId
      ) {
        throw new UploadNotConfirmableError()
      }
      const object = await this.storage.head(p.storageKey)
      if (object === null) throw new UploadNotConfirmableError()
      if (object.sizeBytes > p.sizeBytes) {
        throw new UploadQuotaExceededError(
          `Cada arquivo pode ter no máximo ${formatMegabytes(profile.maxBytes)}.`,
        )
      }
      total += object.sizeBytes
      ready.push(attachment.markReady(object.sizeBytes, object.etag.replaceAll('"', "")))
    }
    if (total > profile.maxTotalBytes) {
      throw new UploadQuotaExceededError(
        `O total não pode passar de ${formatMegabytes(profile.maxTotalBytes)}.`,
      )
    }

    await this.txManager.run(() => this.repo.saveMany(ready))
  }
}
