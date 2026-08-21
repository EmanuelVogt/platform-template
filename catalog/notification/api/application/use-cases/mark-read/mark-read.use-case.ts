import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepositoryPort,
} from "../../../domain/ports/notification.repository.port"
import { requireRecipient } from "../../require-recipient"

import type { MarkReadInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class MarkReadUseCase implements UseCaseContract<MarkReadInput, void> {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepositoryPort,
    private readonly ctx: RequestContext,
    @Inject(CLOCK) private readonly clock: Clock
  ) {}

  @Transactional()
  @Traced({ name: "notification.markRead" })
  async execute(input: MarkReadInput): Promise<void> {
    const recipientId = requireRecipient(this.ctx)
    const notification = await this.notifications.findByIdForRecipient(
      input.id,
      recipientId
    )
    // Id alheio/inexistente: no-op silencioso — 403/404 viraria oráculo de ids.
    if (!notification) {
      return
    }
    await this.notifications.update(notification.markRead(this.clock.now()))
  }
}
