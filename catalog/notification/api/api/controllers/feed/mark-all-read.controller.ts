import { Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { MarkAllReadUseCase } from "../../../application/use-cases/mark-all-read/mark-all-read.use-case"

@ApiTags("Notifications")
@Controller("notifications")
export class MarkAllReadController {
  constructor(private readonly markAllRead: MarkAllReadUseCase) {}

  @ApiOperation({ operationId: "markAllRead" })
  @SelfService()
  @Post("read-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async handle(): Promise<void> {
    await this.markAllRead.execute()
  }
}
