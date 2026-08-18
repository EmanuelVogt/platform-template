import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common"
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { ArchiveNotificationUseCase } from "../../../application/use-cases/archive-notification/archive-notification.use-case"
import { NotificationIdParamsDto } from "../../contracts/notification.contract"

@ApiTags("Notifications")
@Controller("notifications")
export class ArchiveNotificationController {
  constructor(
    private readonly archiveNotification: ArchiveNotificationUseCase
  ) {}

  @ApiOperation({ operationId: "archiveNotification" })
  @SelfService()
  @Post(":id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async handle(@Param() params: NotificationIdParamsDto): Promise<void> {
    await this.archiveNotification.execute({ id: params.id })
  }
}
