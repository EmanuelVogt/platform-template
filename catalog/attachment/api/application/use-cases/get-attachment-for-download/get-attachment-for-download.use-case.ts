import { Inject } from "@nestjs/common"

import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from "../../../../../shared/infra/storage/object-storage.port"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { NonTransactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { AccessPolicy } from "../../../domain/access-policy"
import { AttachmentNotFoundError } from "../../../domain/errors"
import {
  ATTACHMENT_ACCESS_LOG_REPOSITORY,
  type AttachmentAccessLogRepository,
} from "../../../domain/ports/attachment-access-log.repository"
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepository,
} from "../../../domain/ports/attachment.repository"

import type { UploadProfileName } from "../../../domain/upload-profiles"

export interface DownloadResult {
  openStream(): Promise<NodeJS.ReadableStream>
  contentType: string
  sizeBytes: number
  checksum: string
  originalFilename: string | null
  profile: UploadProfileName | "legacy"
}

type AccessLogContext = {
  ip: string | null
  userAgent: string | null
  correlationId: string | null
}

@UseCase()
export class GetAttachmentForDownloadUseCase {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(ATTACHMENT_REPOSITORY) private readonly repo: AttachmentRepository,
    @Inject(ATTACHMENT_ACCESS_LOG_REPOSITORY)
    private readonly accessLog: AttachmentAccessLogRepository,
    private readonly ctx: RequestContext
  ) {}

  @NonTransactional(
    "io externo: stream do storage seguraria conexão do pool durante o download"
  )
  @Traced({ name: "attachment.download" })
  async execute(input: {
    id: string
    trusted?: boolean
  }): Promise<DownloadResult> {
    const store = this.ctx.get()
    const actorId = this.ctx.getActor()?.id ?? null
    const attachment = await this.repo.findById(input.id)

    if (
      attachment?.props.status !== "ready" ||
      attachment.props.checksum === null
    ) {
      await this.log(input.id, "denied", store, actorId)
      throw new AttachmentNotFoundError()
    }

    if (!input.trusted) {
      const policy = new AccessPolicy(attachment.props.visibility)
      if (!policy.canBeReadBy(actorId, attachment.props.ownerUserId)) {
        await this.log(input.id, "denied", store, actorId)
        throw new AttachmentNotFoundError()
      }
    }

    await this.log(input.id, "allowed", store, actorId)
    const storageKey = attachment.props.storageKey
    return {
      openStream: () => this.storage.getStream(storageKey),
      contentType: attachment.props.contentType,
      sizeBytes: attachment.props.sizeBytes,
      checksum: attachment.props.checksum,
      originalFilename: attachment.props.originalFilename,
      profile: attachment.props.profile,
    }
  }

  private async log(
    attachmentId: string,
    outcome: "allowed" | "denied",
    store: AccessLogContext,
    actorId: string | null
  ): Promise<void> {
    await this.accessLog.record({
      attachmentId,
      userId: actorId,
      ip: store.ip,
      userAgent: store.userAgent,
      action: "download",
      outcome,
      correlationId: store.correlationId,
    })
  }
}
