import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common"
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { MarkReadUseCase } from "../../../application/use-cases/mark-read/mark-read.use-case"
import { NotificationIdParamsDto } from "../../contracts/notification.contract"

@ApiTags("Notifications")
@Controller("notifications")
export class MarkReadController {
  constructor(private readonly markRead: MarkReadUseCase) {}

  @ApiOperation({ operationId: "markRead" })
  @SelfService()
  @Post(":id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async handle(@Param() params: NotificationIdParamsDto): Promise<void> {
    await this.markRead.execute({ id: params.id })
  }
}
