import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { GetUnseenCountUseCase } from "../../../application/use-cases/get-unseen-count/get-unseen-count.use-case"
import { UnseenCountResponseDto } from "../../contracts/notification.contract"

import type { GetUnseenCountOutput } from "../../../application/use-cases/get-unseen-count/types"

@ApiTags("Notifications")
@Controller("notifications")
export class UnseenCountController {
  constructor(private readonly getUnseenCount: GetUnseenCountUseCase) {}

  @ApiOperation({ operationId: "unseenCount" })
  @SelfService()
  @Get("unseen-count")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UnseenCountResponseDto })
  async handle(): Promise<GetUnseenCountOutput> {
    return this.getUnseenCount.execute()
  }
}
