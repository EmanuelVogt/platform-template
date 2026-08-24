import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { ChangePasswordUseCase } from "../../../application/use-cases/change-password/change-password.use-case"
import { ChangePasswordDto } from "../../contracts/identity.contract"

@ApiTags("Session")
@Controller("auth")
export class ChangePasswordController {
  constructor(private readonly changePassword: ChangePasswordUseCase) {}

  @ApiOperation({ operationId: "changePassword" })
  @SelfService()
  @Post("change-password")
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Body() dto: ChangePasswordDto): Promise<void> {
    await this.changePassword.execute({
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
    })
  }
}
