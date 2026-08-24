import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { RestoreUsersUseCase } from "../../../application/use-cases/restore-users/restore-users.use-case"
import {
  RestoreUsersResponseDto,
  TrashUserIdsDto,
} from "../../contracts/identity.contract"

import type { RestoreUsersOutput } from "../../../application/use-cases/restore-users/types"

@ApiTags("Admin")
@Controller("admin/users")
export class RestoreUsersController {
  constructor(private readonly restoreUsers: RestoreUsersUseCase) {}

  @ApiOperation({ operationId: "restoreUsers" })
  @RequirePermission("admin.users.trash.restore")
  @Post("restore")
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RestoreUsersResponseDto })
  async handle(@Body() dto: TrashUserIdsDto): Promise<RestoreUsersOutput> {
    return this.restoreUsers.execute({ userIds: dto.userIds })
  }
}
