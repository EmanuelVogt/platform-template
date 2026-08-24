import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
} from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { RequestEmailChangeUseCase } from "../../../application/use-cases/request-email-change/request-email-change.use-case"
import { IDENTITY_CONFIG } from "../../../identity.config"
import { ChangeEmailDto } from "../../contracts/identity.contract"
import { clearSessionCookie } from "../../guards/cookie"

import type { IdentityConfig } from "../../../identity.config"
import type { Response } from "express"

@ApiTags("Session")
@Controller("auth")
export class RequestEmailChangeController {
  constructor(
    private readonly requestEmailChange: RequestEmailChangeUseCase,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig
  ) {}

  @ApiOperation({ operationId: "requestEmailChange" })
  @SelfService()
  @Post("change-email")
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(
    @Body() dto: ChangeEmailDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<void> {
    await this.requestEmailChange.execute({
      currentPassword: dto.currentPassword,
      newEmail: dto.newEmail,
    })
    // O use case já revogou todas as sessões; limpa o cookie morto do browser.
    clearSessionCookie(res, this.config)
  }
}
