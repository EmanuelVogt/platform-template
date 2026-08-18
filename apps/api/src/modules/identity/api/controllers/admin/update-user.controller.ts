import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { Idempotent } from "../../../../../shared/kernel/idempotency/idempotent.decorator"
import { UpdateUserUseCase } from "../../../application/use-cases/update-user/update-user.use-case"
import { UpdateUserDto, UpdateUserParamsDto } from "../../contracts/identity.contract"
import { RateLimit } from "../../guards/rate-limit.guard"

@ApiTags("Admin")
@Controller("admin/users")
export class UpdateUserController {
  constructor(private readonly updateUser: UpdateUserUseCase) {}

  @ApiOperation({ operationId: "updateUser" })
  @RequirePermission("admin.users.update")
  @Put(":id")
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent({ ttlHours: 1 })
  async handle(
    @Param() params: UpdateUserParamsDto,
    @Body() dto: UpdateUserDto
  ): Promise<void> {
    await this.updateUser.execute({
      userId: params.id,
      name: dto.name,
      accessProfile: dto.accessProfile,
      attendsGuests: dto.attendsGuests,
      permissions: dto.permissions,
      areaIds: dto.areaIds,
      serviceIds: dto.serviceIds,
      schedulingAreaIds: dto.schedulingAreaIds,
    })
  }
}
