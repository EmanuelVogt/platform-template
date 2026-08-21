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
import { SetPasswordUseCase } from "../../../application/use-cases/set-password/set-password.use-case"
import { CSRF } from "../../../domain/ports/csrf"
import { IDENTITY_CONFIG } from "../../../identity.config"
import {
  CurrentUserResponseDto,
  SetPasswordDto,
} from "../../contracts/identity.contract"
import {
  readDeviceCookie,
  setCsrfCookie,
  setDeviceCookie,
  setSessionCookie,
} from "../../guards/cookie"
import { RateLimit } from "../../guards/rate-limit.guard"

import type { UserView } from "../../../application/views"
import type { Csrf } from "../../../domain/ports/csrf"
import type { IdentityConfig } from "../../../identity.config"
import type { Request, Response } from "express"

@ApiTags("Auth")
@Controller("auth")
export class SetPasswordController {
  constructor(
    private readonly setPassword: SetPasswordUseCase,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
    @Inject(CSRF) private readonly csrf: Csrf
  ) {}

  // SEM @Idempotent: o cache não reenvia Set-Cookie e colide no scope público;
  // o token single-use já garante ativação única (ADR 0026).
  @ApiOperation({ operationId: "setPassword" })
  @Public()
  @Post("set-password")
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CurrentUserResponseDto })
  async handle(
    @Body() dto: SetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ user: UserView }> {
    const deviceCookie = readDeviceCookie(req, this.config)
    const result = await this.setPassword.execute({
      token: dto.token,
      password: dto.password,
      name: dto.name,
      birthDate: dto.birthDate,
      avatarAttachmentId: dto.avatarAttachmentId,
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
    // Sob SameSite=none, emite o cookie CSRF (HMAC do sessionId) p/ o SPA refletir.
    if (this.config.COOKIE_SAMESITE === "none") {
      setCsrfCookie(res, this.config, this.csrf.sign(result.sessionId))
    }
    return { user: result.user }
  }
}
