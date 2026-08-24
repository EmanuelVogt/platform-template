import { Inject } from "@nestjs/common"

import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { UserDirectoryFacade } from "../../../../identity/api/facades/user-directory.facade"
import {
  ATTACHMENT_ACCESS_LOG_REPOSITORY,
  type AttachmentAccessLogRepository,
} from "../../../domain/ports/attachment-access-log.repository"

import {
  ATTACHMENT_ACCESS_LOG_LIMIT,
  type ListAttachmentAccessLogInput,
  type ListAttachmentAccessLogResult,
} from "./types"

import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class ListAttachmentAccessLogUseCase implements UseCaseContract<
  ListAttachmentAccessLogInput,
  ListAttachmentAccessLogResult
> {
  constructor(
    @Inject(ATTACHMENT_ACCESS_LOG_REPOSITORY)
    private readonly accessLog: AttachmentAccessLogRepository,
    private readonly users: UserDirectoryFacade
  ) {}

  @ReadOnly()
  @Traced({ name: "attachment.listAccessLog" })
  async execute(
    input: ListAttachmentAccessLogInput
  ): Promise<ListAttachmentAccessLogResult> {
    const rows = await this.accessLog.listByAttachment(
      input.attachmentId,
      ATTACHMENT_ACCESS_LOG_LIMIT
    )

    const actorIds = [
      ...new Set(
        rows.map((row) => row.userId).filter((id): id is string => id !== null)
      ),
    ]
    const names =
      actorIds.length > 0
        ? await this.users.findNamesByIds(actorIds)
        : new Map<string, string>()

    return {
      data: rows.map((row) => ({
        id: row.id,
        actorUserId: row.userId,
        actorName: row.userId === null ? null : (names.get(row.userId) ?? null),
        action: row.action,
        occurredAt: row.occurredAt,
      })),
    }
  }
}
