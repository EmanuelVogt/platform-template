import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Req,
  Res,
} from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { GetCurrentUserUseCase } from "../../../application/use-cases/get-current-user/get-current-user.use-case"
import { CSRF } from "../../../domain/ports/csrf"
import { IDENTITY_CONFIG } from "../../../identity.config"
import { CurrentUserResponseDto } from "../../contracts/identity.contract"
import { setCsrfCookie } from "../../guards/cookie"

import type { UserView } from "../../../application/views"
import type { Csrf } from "../../../domain/ports/csrf"
import type { IdentityConfig } from "../../../identity.config"
import type { Request, Response } from "express"

@ApiTags("Session")
@Controller("auth")
export class GetSessionController {
  constructor(
    private readonly getCurrentUser: GetCurrentUserUseCase,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
    @Inject(CSRF) private readonly csrf: Csrf,
  ) {}

  @ApiOperation({ operationId: "getSession" })
  @SelfService()
  @Get("session")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CurrentUserResponseDto })
  async handle(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserView }> {
    const result = await this.getCurrentUser.execute({})
    // Bootstrap do SPA: reemite o cookie CSRF sob SameSite=none (sessionId vem
    // do AuthMiddleware). Não altera o body — contrato preservado.
    const sessionId = (req as Request & { sessionId?: string }).sessionId
    if (this.config.COOKIE_SAMESITE === "none" && sessionId !== undefined) {
      setCsrfCookie(res, this.config, this.csrf.sign(sessionId))
    }
    return result
  }
}
