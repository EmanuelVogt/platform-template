import { Controller, Delete, HttpCode, HttpStatus, Param } from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { StashTagUseCase } from "../../../application/use-cases/stash-tag/stash-tag.use-case"
import { TagIdParamsDto } from "../../contracts/tag.contract"

@ApiTags("Tag")
@Controller("admin/tags")
export class DeleteTagController {
  constructor(private readonly stashTag: StashTagUseCase) {}

  @ApiOperation({ operationId: "deleteTag" })
  @RequirePermission("admin.tags.delete")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Param() params: TagIdParamsDto): Promise<void> {
    await this.stashTag.execute({ id: params.id })
  }
}
