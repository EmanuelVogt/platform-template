import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { Idempotent } from "../../../../../shared/kernel/idempotency/idempotent.decorator"
import { UpdateTagUseCase } from "../../../application/use-cases/update-tag/update-tag.use-case"
import {
  TagIdParamsDto,
  TagViewDto,
  UpdateTagDto,
} from "../../contracts/tag.contract"

import type { UpdateTagInput } from "../../../application/use-cases/update-tag/types"
import type { TagViewOutput } from "../../../application/views"

function toUpdateTagInput(id: string, dto: UpdateTagDto): UpdateTagInput {
  return {
    id,
    data: {
      name: dto.name,
      color: dto.color ?? null,
      isActive: dto.isActive,
    },
  }
}

@ApiTags("Tag")
@Controller("admin/tags")
export class UpdateTagController {
  constructor(private readonly updateTag: UpdateTagUseCase) {}

  @ApiOperation({ operationId: "updateTag" })
  @RequirePermission("admin.tags.update")
  @Put(":id")
  @HttpCode(HttpStatus.OK)
  @Idempotent({ ttlHours: 1 })
  @ApiOkResponse({ type: TagViewDto })
  async handle(
    @Param() params: TagIdParamsDto,
    @Body() dto: UpdateTagDto
  ): Promise<TagViewOutput> {
    return this.updateTag.execute(toUpdateTagInput(params.id, dto))
  }
}
