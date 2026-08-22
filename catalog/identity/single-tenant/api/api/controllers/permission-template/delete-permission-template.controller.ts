import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
} from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { DeletePermissionTemplateUseCase } from "../../../application/use-cases/delete-permission-template/delete-permission-template.use-case"
import { PermissionTemplateParamsDto } from "../../contracts/permission-template.contract"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"

@ApiTags("Admin")
@Controller("admin/permission-templates")
export class DeletePermissionTemplateController {
  constructor(
    private readonly deleteTemplate: DeletePermissionTemplateUseCase
  ) {}

  @ApiOperation({ operationId: "deletePermissionTemplate" })
  @RequirePermission("admin.permission_templates.delete")
  @Delete(":id")
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Param() params: PermissionTemplateParamsDto): Promise<void> {
    await this.deleteTemplate.execute({ id: params.id })
  }
}
