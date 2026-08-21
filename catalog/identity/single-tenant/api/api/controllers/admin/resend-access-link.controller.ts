import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { ResendAccessLinkUseCase } from "../../../application/use-cases/resend-access-link/resend-access-link.use-case"
import { RateLimit } from "../../guards/rate-limit.guard"

@ApiTags("Admin")
@Controller("admin/users")
export class ResendAccessLinkController {
  constructor(private readonly resendAccessLink: ResendAccessLinkUseCase) {}

  @ApiOperation({ operationId: "resendAccessLink" })
  @RequirePermission("admin.users.access_link.resend")
  @Post(":id/resend-access-link")
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @HttpCode(HttpStatus.ACCEPTED)
  async handle(@Param("id") id: string): Promise<void> {
    await this.resendAccessLink.execute({ userId: id })
  }
}
