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
import { LoginUseCase } from "../../../application/use-cases/login/login.use-case"
import { CSRF } from "../../../domain/ports/csrf"
import { IDENTITY_CONFIG } from "../../../identity.config"
import {
  CurrentUserResponseDto,
  LoginDto,
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
export class LoginController {
  constructor(
    private readonly login: LoginUseCase,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
    @Inject(CSRF) private readonly csrf: Csrf
  ) {}

  @ApiOperation({ operationId: "login" })
  @Public()
  @Post("login")
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CurrentUserResponseDto })
  async handle(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ user: UserView }> {
    const deviceCookie = readDeviceCookie(req, this.config)
    const result = await this.login.execute({
      email: dto.email,
      password: dto.password,
      rememberMe: dto.rememberMe,
      deviceCookie,
    })
    // maxAgeSeconds vem do use-case (fonte única do TTL).
    setSessionCookie(
      res,
      this.config,
      result.sessionToken,
      result.maxAgeSeconds
    )
    // Cookie de device: persistente, re-setado todo login (sliding). Logout não apaga.
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
