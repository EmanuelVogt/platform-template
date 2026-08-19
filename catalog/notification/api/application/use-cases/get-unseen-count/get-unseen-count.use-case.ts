import { Inject } from "@nestjs/common"

import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepositoryPort,
} from "../../../domain/ports/notification.repository.port"
import { requireRecipient } from "../../require-recipient"

import type { GetUnseenCountOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class GetUnseenCountUseCase
  implements UseCaseContract<void, GetUnseenCountOutput>
{
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepositoryPort,
    private readonly ctx: RequestContext
  ) {}

  @ReadOnly()
  @Traced({ name: "notification.unseenCount" })
  async execute(): Promise<GetUnseenCountOutput> {
    const recipientId = requireRecipient(this.ctx)
    return { count: await this.notifications.countUnseen(recipientId) }
  }
}
