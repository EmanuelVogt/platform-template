import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { ResendAccessLinkUseCase } from "../../../application/use-cases/resend-access-link/resend-access-link.use-case"
import { IdParamDto } from "../../contracts/identity.contract"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"

@ApiTags("Admin")
@Controller("admin/users")
export class ResendAccessLinkController {
  constructor(private readonly resendAccessLink: ResendAccessLinkUseCase) {}

  @ApiOperation({ operationId: "resendAccessLink" })
  @RequirePermission("admin.users.access_link.resend")
  @Post(":id/resend-access-link")
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @HttpCode(HttpStatus.ACCEPTED)
  async handle(@Param() params: IdParamDto): Promise<void> {
    await this.resendAccessLink.execute({ userId: params.id })
  }
}
