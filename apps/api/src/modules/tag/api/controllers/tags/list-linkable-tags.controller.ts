import { Controller, Get, HttpCode, HttpStatus, Inject } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import {
  TAG_REPOSITORY,
  type LinkableTagRef,
  type TagRepository,
} from "../../../domain/ports/tag.repository"
import { LinkableTagsResponseDto } from "../../contracts/tag.contract"

// Rota estática ANTES de @Get(":id") — senão o param a sombreia (404).
@ApiTags("Tag")
@Controller("admin/tags")
export class ListLinkableTagsController {
  constructor(@Inject(TAG_REPOSITORY) private readonly tags: TagRepository) {}

  @ApiOperation({ operationId: "listLinkableTags" })
  @RequirePermission("admin.tags.read")
  @Get("linkable")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LinkableTagsResponseDto })
  async handle(): Promise<LinkableTagRef[]> {
    return this.tags.listLinkableRefs()
  }
}
