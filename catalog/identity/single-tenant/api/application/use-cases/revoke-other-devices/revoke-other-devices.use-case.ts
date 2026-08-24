import { Inject } from "@nestjs/common"

import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
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

import type { RevokeOtherDevicesInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class RevokeOtherDevicesUseCase implements UseCaseContract<
  RevokeOtherDevicesInput,
  void
> {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    private readonly ctx: RequestContext
  ) {}

  @Transactional()
  @Traced({ name: "identity.revokeOtherDevices" })
  async execute(_input: RevokeOtherDevicesInput): Promise<void> {
    const ctx = requireAuth(this.ctx)
    // deviceId pode ser null (sessão órfã, D1): o repo trata apagando todos.
    await this.devices.deleteOthers(ctx.userId, ctx.deviceId)
    await this.authEvents.recordInTx(
      authEventOf(this.ctx.get(), {
        userId: ctx.userId,
        eventType: "sessions_revoked_all",
      })
    )
  }
}
