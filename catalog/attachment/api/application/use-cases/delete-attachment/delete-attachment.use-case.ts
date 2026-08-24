import { Inject } from "@nestjs/common"

import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from "../../../../../shared/infra/storage/object-storage.port"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { TransactionManager } from "../../../../../shared/kernel/transactional/transaction-manager"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  ATTACHMENT_ACCESS_LOG_REPOSITORY,
  type AttachmentAccessLogRepository,
} from "../../../domain/ports/attachment-access-log.repository"
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepository,
} from "../../../domain/ports/attachment.repository"

@UseCase()
export class DeleteAttachmentUseCase {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(ATTACHMENT_REPOSITORY) private readonly repo: AttachmentRepository,
    @Inject(ATTACHMENT_ACCESS_LOG_REPOSITORY)
    private readonly accessLog: AttachmentAccessLogRepository,
    private readonly txManager: TransactionManager,
    private readonly ctx: RequestContext
  ) {}

  @Transactional()
  @Traced({ name: "attachment.delete" })
  async execute(input: { id: string }): Promise<void> {
    const attachment = await this.repo.findById(input.id)
    if (attachment === null || attachment.props.status === "deleted") return

    await this.repo.update(attachment.markDeleted())
    // IO externo nunca dentro da tx: delete no R2 só após commit.
    this.txManager.onCommit(() =>
      this.storage.delete(attachment.props.storageKey)
    )

    const store = this.ctx.get()
    await this.accessLog.recordInTx({
      attachmentId: input.id,
      userId: this.ctx.getActor()?.id ?? null,
      ip: store.ip,
      userAgent: store.userAgent,
      action: "delete",
      outcome: "allowed",
      correlationId: store.correlationId,
    })
  }
}
