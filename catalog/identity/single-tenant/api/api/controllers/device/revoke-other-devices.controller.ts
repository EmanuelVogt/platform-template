import { Controller, Delete, HttpCode, HttpStatus } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { RevokeOtherDevicesUseCase } from "../../../application/use-cases/revoke-other-devices/revoke-other-devices.use-case"

@ApiTags("Device")
@Controller("auth")
export class RevokeOtherDevicesController {
  constructor(private readonly revokeOtherDevices: RevokeOtherDevicesUseCase) {}

  @ApiOperation({ operationId: "revokeOtherDevices" })
  @SelfService()
  @Delete("devices")
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(): Promise<void> {
    await this.revokeOtherDevices.execute({})
  }
}
