import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { Public } from "../../../../../shared/kernel/access/decorators"
import { Idempotent } from "../../../../../shared/kernel/idempotency/idempotent.decorator"
import { RequestPasswordResetUseCase } from "../../../application/use-cases/request-password-reset/request-password-reset.use-case"
import { ForgotPasswordDto } from "../../contracts/identity.contract"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"

@ApiTags("Auth")
@Controller("auth")
export class ForgotPasswordController {
  constructor(
    private readonly requestPasswordReset: RequestPasswordResetUseCase,
  ) {}

  @ApiOperation({ operationId: "forgotPassword" })
  @Public()
  @Post("forgot-password")
  @RateLimit({ limit: 3, windowSeconds: 60 })
  @HttpCode(HttpStatus.ACCEPTED) // 202 sempre (spec §8)
  @Idempotent({ ttlHours: 1 })
  async handle(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.requestPasswordReset.execute({ email: dto.email })
  }
}
