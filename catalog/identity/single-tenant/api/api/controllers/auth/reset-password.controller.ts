import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { Public } from "../../../../../shared/kernel/access/decorators"
import { Idempotent } from "../../../../../shared/kernel/idempotency/idempotent.decorator"
import { ResetPasswordUseCase } from "../../../application/use-cases/reset-password/reset-password.use-case"
import { ResetPasswordDto } from "../../contracts/identity.contract"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"

@ApiTags("Auth")
@Controller("auth")
export class ResetPasswordController {
  constructor(private readonly resetPassword: ResetPasswordUseCase) {}

  @ApiOperation({ operationId: "resetPassword" })
  @Public()
  @Post("reset-password")
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @HttpCode(HttpStatus.NO_CONTENT) // 204
  @Idempotent({ ttlHours: 1 })
  async handle(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.resetPassword.execute({
      token: dto.token,
      password: dto.password,
    })
  }
}
