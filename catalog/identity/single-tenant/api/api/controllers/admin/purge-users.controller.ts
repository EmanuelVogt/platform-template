import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { PurgeUsersUseCase } from "../../../application/use-cases/purge-users/purge-users.use-case"
import { PurgeUsersResponseDto, TrashUserIdsDto } from "../../contracts/identity.contract"

import type { PurgeUsersOutput } from "../../../application/use-cases/purge-users/types"

@ApiTags("Admin")
@Controller("admin/users")
export class PurgeUsersController {
  constructor(private readonly purgeUsers: PurgeUsersUseCase) {}

  @ApiOperation({ operationId: "purgeUsers" })
  @RequirePermission("admin.users.trash.purge")
  @Post("purge")
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PurgeUsersResponseDto })
  async handle(@Body() dto: TrashUserIdsDto): Promise<PurgeUsersOutput> {
    return this.purgeUsers.execute({ userIds: dto.userIds })
  }
}
