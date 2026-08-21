import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { ResendVerificationUseCase } from "../../../application/use-cases/resend-verification/resend-verification.use-case"
import { RateLimit } from "../../guards/rate-limit.guard"

@ApiTags("Session")
@Controller("auth")
export class ResendVerificationController {
  constructor(
    private readonly resendVerification: ResendVerificationUseCase,
  ) {}

  @ApiOperation({ operationId: "resendVerification" })
  @SelfService()
  @Post("resend-verification")
  @RateLimit({ limit: 5, windowSeconds: 60 })
  @HttpCode(HttpStatus.ACCEPTED) // 202 — autenticado; lê o usuário do contexto.
  async handle(): Promise<void> {
    await this.resendVerification.execute({})
  }
}
