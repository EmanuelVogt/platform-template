import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { MarkAllSeenUseCase } from "../../../application/use-cases/mark-all-seen/mark-all-seen.use-case"

@ApiTags("Notifications")
@Controller("notifications")
export class MarkAllSeenController {
  constructor(private readonly markAllSeen: MarkAllSeenUseCase) {}

  @ApiOperation({ operationId: "markAllSeen" })
  @SelfService()
  @Post("seen")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async handle(): Promise<void> {
    await this.markAllSeen.execute()
  }
}
