import { Inject } from "@nestjs/common"

import { OBJECT_STORAGE, type ObjectStoragePort } from "../../../../../shared/infra/storage/object-storage.port"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
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
  stream: NodeJS.ReadableStream
  contentType: string
  sizeBytes: number
  checksum: string
  originalFilename: string | null
  profile: UploadProfileName | "legacy"
}

type AccessLogContext = {
  userId: string | null
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
    private readonly ctx: RequestContext,
  ) {}

  /**
   * Sem transação própria (Regra de Ouro 17): o corpo busca o objeto no storage,
   * e IO externo nunca roda dentro de tx. Some com a trilha, que commita na
   * conexão raiz por decisão do repositório, e uma tx aqui seguraria a conexão
   * dela enquanto pede uma SEGUNDA ao mesmo pool — com `DATABASE_POOL_MAX`
   * downloads simultâneos ninguém libera a primeira e o pool trava inteiro.
   */
  @Traced({ name: "attachment.download" })
  async execute(input: {
    id: string
    trusted?: boolean
  }): Promise<DownloadResult> {
    const store = this.ctx.get()
    const attachment = await this.repo.findById(input.id)

    if (attachment?.props.status !== "ready" || attachment.props.checksum === null) {
      await this.log(input.id, "denied", store)
      throw new AttachmentNotFoundError()
    }

    if (!input.trusted) {
      const policy = new AccessPolicy(attachment.props.visibility)
      if (!policy.canBeReadBy(store.userId, attachment.props.ownerUserId)) {
        await this.log(input.id, "denied", store)
        throw new AttachmentNotFoundError()
      }
    }

    await this.log(input.id, "allowed", store)
    const stream = await this.storage.getStream(attachment.props.storageKey)
    return {
      stream,
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
  ): Promise<void> {
    await this.accessLog.record({
      attachmentId,
      userId: store.userId,
      ip: store.ip,
      userAgent: store.userAgent,
      action: "download",
      outcome,
      correlationId: store.correlationId,
    })
  }
}
