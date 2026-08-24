import { Controller, Get, HttpCode, HttpStatus, Query } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { ListQuery } from "../../../../../shared/kernel/listing/list-query.decorator"
import { ListAccessHistoryUseCase } from "../../../application/use-cases/list-access-history/list-access-history.use-case"
import {
  AccessHistoryListResponseDto,
  AccessHistoryQueryDto,
  accessHistoryQuerySchema,
} from "../../contracts/identity.contract"

import type { ListAccessHistoryOutput } from "../../../application/use-cases/list-access-history/types"

@ApiTags("Session")
@Controller("auth")
export class AccessHistoryController {
  constructor(private readonly listHistory: ListAccessHistoryUseCase) {}

  @ApiOperation({ operationId: "accessHistory" })
  @SelfService()
  @Get("access-history")
  @HttpCode(HttpStatus.OK)
  @ListQuery(accessHistoryQuerySchema)
  @ApiOkResponse({ type: AccessHistoryListResponseDto })
  async handle(
    @Query() query: AccessHistoryQueryDto
  ): Promise<ListAccessHistoryOutput> {
    return this.listHistory.execute({
      page: query.page,
      pageSize: query.pageSize,
      order: query.order,
    })
  }
}
