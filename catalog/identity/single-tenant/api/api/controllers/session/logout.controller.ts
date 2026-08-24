import {
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
import { LogoutUseCase } from "../../../application/use-cases/logout/logout.use-case"
import { IDENTITY_CONFIG } from "../../../identity.config"
import { clearSessionCookie } from "../../guards/cookie"

import type { IdentityConfig } from "../../../identity.config"
import type { Response } from "express"

@ApiTags("Session")
@Controller("auth")
export class LogoutController {
  constructor(
    private readonly logout: LogoutUseCase,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig
  ) {}

  @ApiOperation({ operationId: "logout" })
  @SelfService()
  @Post("logout")
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Res({ passthrough: true }) res: Response): Promise<void> {
    await this.logout.execute({})
    clearSessionCookie(res, this.config)
  }
}
