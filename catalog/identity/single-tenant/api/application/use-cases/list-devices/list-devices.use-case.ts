import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { ReadOnly } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  DEVICE_REPOSITORY,
  type DeviceRepository,
} from "../../../domain/ports/device.repository"
import { IDENTITY_CONFIG, type IdentityConfig } from "../../../identity.config"
import { requireAuth } from "../../require-auth"
import { toDeviceView } from "../../views"

import type { ListDevicesInput, ListDevicesOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class ListDevicesUseCase implements UseCaseContract<
  ListDevicesInput,
  ListDevicesOutput
> {
  constructor(
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
    private readonly ctx: RequestContext,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig
  ) {}

  @ReadOnly()
  @Traced({ name: "identity.listDevices" })
  async execute(_input: ListDevicesInput): Promise<ListDevicesOutput> {
    const { userId, deviceId } = requireAuth(this.ctx)
    const now = this.clock.now()
    const rows = await this.devices.listActiveByUser(
      userId,
      now,
      this.config.SESSION_IDLE_TTL_SECONDS,
      this.config.SESSION_ABSOLUTE_TTL_SECONDS
    )
    return { devices: rows.map((d) => toDeviceView(d, d.id === deviceId)) }
  }
}
