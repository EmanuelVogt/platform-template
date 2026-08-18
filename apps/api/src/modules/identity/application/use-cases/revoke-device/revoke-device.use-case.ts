import { Inject } from "@nestjs/common"

import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { OutboxPublisher } from "../../../../../shared/kernel/outbox/outbox.publisher"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { NotificationRequested } from "../../../../notification/api/events/notification-requested.event"
import { CannotRevokeCurrentDeviceError } from "../../../domain/errors"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../../domain/ports/device.repository"
import { authEventOf } from "../../auth-event.factory"
import { requireAuth } from "../../require-auth"

import type { RevokeDeviceInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class RevokeDeviceUseCase
  implements UseCaseContract<RevokeDeviceInput, void>
{
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    private readonly outbox: OutboxPublisher,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    private readonly ctx: RequestContext
  ) {}

  @Transactional()
  @Traced({ name: "identity.revokeDevice" })
  async execute(input: RevokeDeviceInput): Promise<void> {
    const ctx = requireAuth(this.ctx)
    // Logout encerra o device atual; revogar por aqui é só para os outros.
    if (input.deviceId === ctx.deviceId) {
      throw new CannotRevokeCurrentDeviceError()
    }
    // Escopo por dono no WHERE: cascade derruba as sessões. n=0 = inexistente OU não é seu.
    const deleted = await this.devices.deleteById(input.deviceId, ctx.userId)
    if (deleted > 0) {
      await this.authEvents.recordInTx(
        authEventOf(ctx, {
          userId: ctx.userId,
          eventType: "device_revoked",
          metadata: { deviceId: input.deviceId },
        })
      )
      await this.outbox.publish(
        NotificationRequested.from({
          recipientId: ctx.userId,
          type: "device_revoked",
          locale: ctx.locale,
          data: { deviceId: input.deviceId },
        })
      )
    }
  }
}
