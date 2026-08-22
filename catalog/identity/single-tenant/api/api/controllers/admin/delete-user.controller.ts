import { Controller, Delete, HttpCode, HttpStatus, Param } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { DeleteUserUseCase } from "../../../application/use-cases/delete-user/delete-user.use-case"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"

@ApiTags("Admin")
@Controller("admin/users")
export class DeleteUserController {
  constructor(private readonly deleteUser: DeleteUserUseCase) {}

  @ApiOperation({ operationId: "deleteUser" })
  @RequirePermission("admin.users.delete")
  @Delete(":id")
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Param("id") id: string): Promise<void> {
    await this.deleteUser.execute({ userId: id })
  }
}
