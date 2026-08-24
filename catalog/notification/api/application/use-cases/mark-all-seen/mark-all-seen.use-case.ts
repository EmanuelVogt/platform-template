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

import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

/** Abrir o sino zera o badge: marca TODAS as não-vistas (não-arquivadas). */
@UseCase()
export class MarkAllSeenUseCase implements UseCaseContract<void, void> {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notifications: NotificationRepositoryPort,
    private readonly ctx: RequestContext,
    @Inject(CLOCK) private readonly clock: Clock
  ) {}

  @Transactional()
  @Traced({ name: "notification.markAllSeen" })
  async execute(): Promise<void> {
    await this.notifications.markAllSeen(
      requireRecipient(this.ctx),
      this.clock.now()
    )
  }
}
