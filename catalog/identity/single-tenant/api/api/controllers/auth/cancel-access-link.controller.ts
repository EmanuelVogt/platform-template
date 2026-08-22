import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { Public } from "../../../../../shared/kernel/access/decorators"
import { CancelAccessLinkUseCase } from "../../../application/use-cases/cancel-access-link/cancel-access-link.use-case"
import { CancelAccessLinkDto } from "../../contracts/identity.contract"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"

@ApiTags("Auth")
@Controller("auth")
export class CancelAccessLinkController {
  constructor(private readonly cancel: CancelAccessLinkUseCase) {}

  // SEM @Idempotent (token single-use já garante). Recusar o convite invalida o link.
  @ApiOperation({ operationId: "cancelAccessLink" })
  @Public()
  @Post("access-link/cancel")
  @RateLimit({ limit: 5, windowSeconds: 60, critical: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Body() dto: CancelAccessLinkDto): Promise<void> {
    await this.cancel.execute({ token: dto.token })
  }
}
