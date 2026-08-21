import { Body, Controller, Delete, HttpCode, HttpStatus } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { PurgeTagsUseCase } from "../../../application/use-cases/purge-tags/purge-tags.use-case"
import { PurgeTagsResponseDto, TagIdsDto } from "../../contracts/tag.contract"

import type { PurgeTagsOutput } from "../../../application/use-cases/purge-tags/types"

@ApiTags("Tag")
@Controller("admin/tags")
export class PurgeTagsController {
  constructor(private readonly purgeTags: PurgeTagsUseCase) {}

  @ApiOperation({ operationId: "purgeTags" })
  @RequirePermission("admin.tags.trash.purge")
  @Delete("purge")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PurgeTagsResponseDto })
  async handle(@Body() dto: TagIdsDto): Promise<PurgeTagsOutput> {
    return this.purgeTags.execute({ tagIds: dto.tagIds })
  }
}
