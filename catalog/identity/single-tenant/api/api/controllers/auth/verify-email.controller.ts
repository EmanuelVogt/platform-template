import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { Public } from "../../../../../shared/kernel/access/decorators"
import { VerifyEmailUseCase } from "../../../application/use-cases/verify-email/verify-email.use-case"
import { VerifyEmailDto } from "../../contracts/identity.contract"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"

@ApiTags("Auth")
@Controller("auth")
export class VerifyEmailController {
  constructor(private readonly verifyEmail: VerifyEmailUseCase) {}

  @ApiOperation({ operationId: "verifyEmail" })
  @Public()
  @Post("verify-email")
  @RateLimit({ limit: 5, windowSeconds: 60, critical: true })
  @HttpCode(HttpStatus.NO_CONTENT) // 204
  async handle(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.verifyEmail.execute({ token: dto.token })
  }
}
