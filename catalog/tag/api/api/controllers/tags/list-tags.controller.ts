import { Controller, Get, HttpCode, HttpStatus, Query } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { ListQuery } from "../../../../../shared/kernel/listing/list-query.decorator"
import { ListTagsUseCase } from "../../../application/use-cases/list-tags/list-tags.use-case"
import {
  ListTagsQueryDto,
  ListTagsResponseDto,
  listTagsQuerySchema,
} from "../../contracts/tag.contract"

import type { ListTagsOutput } from "../../../application/use-cases/list-tags/types"
import type { ListTagsInput } from "../../../domain/ports/tag.repository"

function toListTagsInput(query: ListTagsQueryDto): ListTagsInput {
  return {
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    order: query.order,
    q: query.q,
    isActive: query.isActive,
    deleted: query.deleted,
  }
}

@ApiTags("Tag")
@Controller("admin/tags")
export class ListTagsController {
  constructor(private readonly listTags: ListTagsUseCase) {}

  @ApiOperation({ operationId: "listTags" })
  @RequirePermission("admin.tags.read")
  @Get()
  @HttpCode(HttpStatus.OK)
  @ListQuery(listTagsQuerySchema)
  @ApiOkResponse({ type: ListTagsResponseDto })
  async handle(@Query() query: ListTagsQueryDto): Promise<ListTagsOutput> {
    return this.listTags.execute(toListTagsInput(query))
  }
}
