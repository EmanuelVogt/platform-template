import { Controller, Get, HttpCode, HttpStatus, Param } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { GetTagUseCase } from "../../../application/use-cases/get-tag/get-tag.use-case"
import { TagIdParamsDto, TagViewDto } from "../../contracts/tag.contract"

import type { TagViewOutput } from "../../../application/views"

@ApiTags("Tag")
@Controller("admin/tags")
export class GetTagController {
  constructor(private readonly getTag: GetTagUseCase) {}

  @ApiOperation({ operationId: "getTag" })
  @RequirePermission("admin.tags.read")
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TagViewDto })
  async handle(@Param() params: TagIdParamsDto): Promise<TagViewOutput> {
    return this.getTag.execute({ id: params.id })
  }
}
