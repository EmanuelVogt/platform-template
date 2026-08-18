import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiCreatedResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { Idempotent } from "../../../../../shared/kernel/idempotency/idempotent.decorator"
import { CreateTagUseCase } from "../../../application/use-cases/create-tag/create-tag.use-case"
import { CreateTagDto, TagViewDto } from "../../contracts/tag.contract"

import type { TagViewOutput } from "../../../application/views"

@ApiTags("Tag")
@Controller("admin/tags")
export class CreateTagController {
  constructor(private readonly createTag: CreateTagUseCase) {}

  @ApiOperation({ operationId: "createTag" })
  @RequirePermission("admin.tags.create")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Idempotent({ ttlHours: 1 })
  @ApiCreatedResponse({ type: TagViewDto })
  async handle(@Body() dto: CreateTagDto): Promise<TagViewOutput> {
    return this.createTag.execute(dto)
  }
}
