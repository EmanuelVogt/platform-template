import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { ListDevicesUseCase } from "../../../application/use-cases/list-devices/list-devices.use-case"
import { DeviceListResponseDto } from "../../contracts/identity.contract"

import type { DeviceView } from "../../../application/views"

@ApiTags("Device")
@Controller("auth")
export class ListDevicesController {
  constructor(private readonly listDevices: ListDevicesUseCase) {}

  @ApiOperation({ operationId: "listDevices" })
  @SelfService()
  @Get("devices")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DeviceListResponseDto })
  async handle(): Promise<{ devices: DeviceView[] }> {
    return this.listDevices.execute({})
  }
}
