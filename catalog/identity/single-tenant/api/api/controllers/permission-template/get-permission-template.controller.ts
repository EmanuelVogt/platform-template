import { Controller, Get, Param } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { GetPermissionTemplateUseCase } from "../../../application/use-cases/get-permission-template/get-permission-template.use-case"
import {
  PermissionTemplateParamsDto,
  PermissionTemplateResponseDto,
} from "../../contracts/permission-template.contract"

import type { GetPermissionTemplateOutput } from "../../../application/use-cases/get-permission-template/types"

@ApiTags("Admin")
@Controller("admin/permission-templates")
export class GetPermissionTemplateController {
  constructor(private readonly getTemplate: GetPermissionTemplateUseCase) {}

  @ApiOperation({ operationId: "getPermissionTemplate" })
  @ApiOkResponse({ type: PermissionTemplateResponseDto })
  @RequirePermission("admin.permission_templates.read")
  @Get(":id")
  async handle(
    @Param() params: PermissionTemplateParamsDto
  ): Promise<GetPermissionTemplateOutput> {
    return this.getTemplate.execute({ id: params.id })
  }
}
