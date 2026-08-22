import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { Public } from "../../../../../shared/kernel/access/decorators"
import { ConfirmEmailChangeUseCase } from "../../../application/use-cases/confirm-email-change/confirm-email-change.use-case"
import { CSRF } from "../../../domain/ports/csrf"
import { IDENTITY_CONFIG } from "../../../identity.config"
import {
  ConfirmEmailChangeDto,
  CurrentUserResponseDto,
} from "../../contracts/identity.contract"
import {
  readDeviceCookie,
  setCsrfCookie,
  setDeviceCookie,
  setSessionCookie,
} from "../../guards/cookie"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"

import type { UserView } from "../../../application/views"
import type { Csrf } from "../../../domain/ports/csrf"
import type { IdentityConfig } from "../../../identity.config"
import type { Request, Response } from "express"

@ApiTags("Auth")
@Controller("auth")
export class ConfirmEmailChangeController {
  constructor(
    private readonly confirmEmailChange: ConfirmEmailChangeUseCase,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
    @Inject(CSRF) private readonly csrf: Csrf
  ) {}

  // Reativa a conta com o novo e-mail e cria sessão (auto-login). Token single-use.
  @ApiOperation({ operationId: "confirmEmailChange" })
  @Public()
  @Post("confirm-email-change")
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CurrentUserResponseDto })
  async handle(
    @Body() dto: ConfirmEmailChangeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ user: UserView }> {
    const deviceCookie = readDeviceCookie(req, this.config)
    const result = await this.confirmEmailChange.execute({
      token: dto.token,
      deviceCookie,
    })
    setSessionCookie(
      res,
      this.config,
      result.sessionToken,
      result.maxAgeSeconds
    )
    setDeviceCookie(
      res,
      this.config,
      result.deviceCookie,
      result.deviceCookieMaxAgeSeconds
    )
    if (this.config.COOKIE_SAMESITE === "none") {
      setCsrfCookie(res, this.config, this.csrf.sign(result.sessionId))
    }
    return { user: result.user }
  }
}
