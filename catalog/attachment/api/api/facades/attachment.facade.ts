import { Inject, Injectable } from "@nestjs/common"

import { ConfirmUploadsUseCase } from "../../application/use-cases/confirm-uploads/confirm-uploads.use-case"
import { DeleteAttachmentUseCase } from "../../application/use-cases/delete-attachment/delete-attachment.use-case"
import {
  GetAttachmentForDownloadUseCase,
  type DownloadResult,
} from "../../application/use-cases/get-attachment-for-download/get-attachment-for-download.use-case"
import { ListAttachmentAccessLogUseCase } from "../../application/use-cases/list-attachment-access-log/list-attachment-access-log.use-case"
import { UploadAttachmentUseCase } from "../../application/use-cases/upload-attachment/upload-attachment.use-case"
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepository,
} from "../../domain/ports/attachment.repository"

import type { ListAttachmentAccessLogResult } from "../../application/use-cases/list-attachment-access-log/types"
import type { UploadAttachmentInput } from "../../application/use-cases/upload-attachment/types"
import type { UploadProfileName } from "../../domain/upload-profiles"

export type { ListAttachmentAccessLogResult } from "../../application/use-cases/list-attachment-access-log/types"

export type AttachmentDownload = DownloadResult

export type AttachmentFileRef = {
  id: string
  originalFilename: string | null
  sizeBytes: number
  contentType: string
}

/** Única superfície do módulo attachment consumida por outros módulos. */
@Injectable()
export class AttachmentFacade {
  constructor(
    private readonly uploadUseCase: UploadAttachmentUseCase,
    private readonly deleteUseCase: DeleteAttachmentUseCase,
    private readonly confirmUseCase: ConfirmUploadsUseCase,
    private readonly downloadUseCase: GetAttachmentForDownloadUseCase,
    @Inject(ATTACHMENT_REPOSITORY) private readonly repo: AttachmentRepository,
    private readonly listAccessLogUseCase: ListAttachmentAccessLogUseCase,
  ) {}

  upload(input: UploadAttachmentInput): Promise<{ id: string }> {
    return this.uploadUseCase.execute(input)
  }

  delete(id: string): Promise<void> {
    return this.deleteUseCase.execute({ id })
  }

  confirmUploads(
    ids: string[],
    opts: { profile: UploadProfileName; ownerUserId: string },
  ): Promise<void> {
    return this.confirmUseCase.execute({ ids, ...opts })
  }

  // Módulo consumidor já autorizou; sem trusted, restricted bloquearia triagem admin.
  openForDownload(id: string): Promise<AttachmentDownload> {
    return this.downloadUseCase.execute({ id, trusted: true })
  }

  /**
   * true se o attachment existe e está 'ready'. Se `ownerUserId` for informado,
   * exige também que o dono bata (anti-injeção cross-account na ativação).
   */
  async exists(id: string, ownerUserId?: string): Promise<boolean> {
    const found = await this.repo.findById(id)
    if (found?.props.status !== "ready") {
      return false
    }
    if (ownerUserId !== undefined && found.props.ownerUserId !== ownerUserId) {
      return false
    }
    return true
  }

  /** Metadados dos anexos prontos — os pendentes e apagados não entram. */
  async describeByIds(ids: string[]): Promise<Map<string, AttachmentFileRef>> {
    const found = await this.repo.findByIds(ids)
    return new Map(
      found
        .filter((a) => a.props.status === "ready")
        .map((a) => [
          a.props.id,
          {
            id: a.props.id,
            originalFilename: a.props.originalFilename,
            sizeBytes: a.props.sizeBytes,
            contentType: a.props.contentType,
          },
        ]),
    )
  }

  /** Chamador já autorizou a leitura do histórico do anexo. */
  listAccessLog(attachmentId: string): Promise<ListAttachmentAccessLogResult> {
    return this.listAccessLogUseCase.execute({ attachmentId })
  }
}
