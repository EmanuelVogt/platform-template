import { Inject } from "@nestjs/common"

import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { toPaginated } from "../../../../../shared/kernel/listing/paginated"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepositoryPort,
} from "../../../domain/ports/notification.repository.port"
import { NotificationMapper } from "../../mappers/notification.mapper"
import { requireRecipient } from "../../require-recipient"

import type { ListNotificationsInput, ListNotificationsOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class ListNotificationsUseCase
  implements UseCaseContract<ListNotificationsInput, ListNotificationsOutput>
{
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepositoryPort,
    private readonly mapper: NotificationMapper,
    private readonly ctx: RequestContext
  ) {}

  @Traced({ name: "notification.list" })
  async execute(input: ListNotificationsInput): Promise<ListNotificationsOutput> {
    const recipientId = requireRecipient(this.ctx)
    const { data, total } = await this.notifications.list(recipientId, input)
    return toPaginated(
      data.map((n) => this.mapper.toItem(n)),
      total,
      input.page,
      input.pageSize
    )
  }
}
