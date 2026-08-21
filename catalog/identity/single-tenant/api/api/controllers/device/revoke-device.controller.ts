import { Controller, Delete, HttpCode, HttpStatus, Param } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { RevokeDeviceUseCase } from "../../../application/use-cases/revoke-device/revoke-device.use-case"
import { RateLimit } from "../../guards/rate-limit.guard"

@ApiTags("Device")
@Controller("auth")
export class RevokeDeviceController {
  constructor(private readonly revokeDevice: RevokeDeviceUseCase) {}

  @ApiOperation({ operationId: "revokeDevice" })
  @SelfService()
  @Delete("devices/:id")
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Param("id") id: string): Promise<void> {
    await this.revokeDevice.execute({ deviceId: id })
  }
}
