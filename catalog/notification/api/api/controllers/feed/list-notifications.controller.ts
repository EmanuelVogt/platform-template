import { Controller, Get, HttpCode, HttpStatus, Query } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { ListQuery } from "../../../../../shared/kernel/listing/list-query.decorator"
import { ListNotificationsUseCase } from "../../../application/use-cases/list-notifications/list-notifications.use-case"
import {
  ListNotificationsQueryDto,
  ListNotificationsResponseDto,
  listNotificationsQuerySchema,
} from "../../contracts/notification.contract"

import type { ListNotificationsOutput } from "../../../application/use-cases/list-notifications/types"

@ApiTags("Notifications")
@Controller("notifications")
export class ListNotificationsController {
  constructor(private readonly listNotifications: ListNotificationsUseCase) {}

  @ApiOperation({ operationId: "listNotifications" })
  @SelfService()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ListQuery(listNotificationsQuerySchema)
  @ApiOkResponse({ type: ListNotificationsResponseDto })
  async handle(
    @Query() query: ListNotificationsQueryDto
  ): Promise<ListNotificationsOutput> {
    return this.listNotifications.execute(query)
  }
}
