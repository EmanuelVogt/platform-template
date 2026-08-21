import { Controller, Get } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { ListPermissionTemplatesUseCase } from "../../../application/use-cases/list-permission-templates/list-permission-templates.use-case"
import { ListPermissionTemplatesResponseDto } from "../../contracts/permission-template.contract"

import type { ListPermissionTemplatesOutput } from "../../../application/use-cases/list-permission-templates/types"

@ApiTags("Admin")
@Controller("admin/permission-templates")
export class ListPermissionTemplatesController {
  constructor(
    private readonly listTemplates: ListPermissionTemplatesUseCase
  ) {}

  @ApiOperation({ operationId: "listPermissionTemplates" })
  @ApiOkResponse({ type: ListPermissionTemplatesResponseDto })
  @RequirePermission("admin.permission_templates.read")
  @Get()
  async handle(): Promise<ListPermissionTemplatesOutput> {
    return this.listTemplates.execute()
  }
}
