import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { Idempotent } from "../../../../../shared/kernel/idempotency/idempotent.decorator"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { CreateUserUseCase } from "../../../application/use-cases/create-user/create-user.use-case"
import { CreateUserDto } from "../../contracts/identity.contract"

@ApiTags("Admin")
@Controller("admin/users")
export class CreateUserController {
  constructor(private readonly createUser: CreateUserUseCase) {}

  @ApiOperation({ operationId: "createUser" })
  @RequirePermission("admin.users.create")
  @Post()
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @HttpCode(HttpStatus.CREATED)
  @Idempotent({ ttlHours: 1 })
  async handle(@Body() dto: CreateUserDto): Promise<void> {
    await this.createUser.execute({
      name: dto.name,
      email: dto.email,
      accessProfile: dto.accessProfile,
      servesClients: dto.servesClients,
      permissions: dto.permissions,
      areaIds: dto.areaIds,
      serviceIds: dto.serviceIds,
      schedulingAreaIds: dto.schedulingAreaIds,
    })
  }
}
