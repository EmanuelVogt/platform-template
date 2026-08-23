import { Body, Controller, Param, Put } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { Idempotent } from "../../../../../shared/kernel/idempotency/idempotent.decorator"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { UpdatePermissionTemplateUseCase } from "../../../application/use-cases/update-permission-template/update-permission-template.use-case"
import {
  PermissionTemplateBodyDto,
  PermissionTemplateParamsDto,
  PermissionTemplateResponseDto,
} from "../../contracts/permission-template.contract"

import type { UpdatePermissionTemplateOutput } from "../../../application/use-cases/update-permission-template/types"

@ApiTags("Admin")
@Controller("admin/permission-templates")
export class UpdatePermissionTemplateController {
  constructor(
    private readonly updateTemplate: UpdatePermissionTemplateUseCase
  ) {}

  @ApiOperation({ operationId: "updatePermissionTemplate" })
  @ApiOkResponse({ type: PermissionTemplateResponseDto })
  @RequirePermission("admin.permission_templates.update")
  @Put(":id")
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @Idempotent({ ttlHours: 1 })
  async handle(
    @Param() params: PermissionTemplateParamsDto,
    @Body() dto: PermissionTemplateBodyDto
  ): Promise<UpdatePermissionTemplateOutput> {
    return this.updateTemplate.execute({
      id: params.id,
      name: dto.name,
      description: dto.description,
      permissions: dto.permissions,
    })
  }
}
