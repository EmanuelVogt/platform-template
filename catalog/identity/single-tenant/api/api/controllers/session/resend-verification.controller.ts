import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { ResendVerificationUseCase } from "../../../application/use-cases/resend-verification/resend-verification.use-case"

@ApiTags("Session")
@Controller("auth")
export class ResendVerificationController {
  constructor(private readonly resendVerification: ResendVerificationUseCase) {}

  @ApiOperation({ operationId: "resendVerification" })
  @SelfService()
  @Post("resend-verification")
  @RateLimit({ limit: 5, windowSeconds: 60, critical: true })
  @HttpCode(HttpStatus.ACCEPTED) // 202 — autenticado; lê o usuário do contexto.
  async handle(): Promise<void> {
    await this.resendVerification.execute({})
  }
}
