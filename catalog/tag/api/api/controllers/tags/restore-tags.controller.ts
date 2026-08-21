import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { RestoreTagsUseCase } from "../../../application/use-cases/restore-tags/restore-tags.use-case"
import { RestoreTagsResponseDto, TagIdsDto } from "../../contracts/tag.contract"

import type { RestoreTagsOutput } from "../../../application/use-cases/restore-tags/types"

@ApiTags("Tag")
@Controller("admin/tags")
export class RestoreTagsController {
  constructor(private readonly restoreTags: RestoreTagsUseCase) {}

  @ApiOperation({ operationId: "restoreTags" })
  @RequirePermission("admin.tags.trash.restore")
  @Post("restore")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RestoreTagsResponseDto })
  async handle(@Body() dto: TagIdsDto): Promise<RestoreTagsOutput> {
    return this.restoreTags.execute({ tagIds: dto.tagIds })
  }
}
