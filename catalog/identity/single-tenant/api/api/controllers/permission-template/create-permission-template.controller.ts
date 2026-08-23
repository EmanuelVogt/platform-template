import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiCreatedResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { Idempotent } from "../../../../../shared/kernel/idempotency/idempotent.decorator"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { CreatePermissionTemplateUseCase } from "../../../application/use-cases/create-permission-template/create-permission-template.use-case"
import {
  PermissionTemplateBodyDto,
  PermissionTemplateResponseDto,
} from "../../contracts/permission-template.contract"

import type { CreatePermissionTemplateOutput } from "../../../application/use-cases/create-permission-template/types"

@ApiTags("Admin")
@Controller("admin/permission-templates")
export class CreatePermissionTemplateController {
  constructor(
    private readonly createTemplate: CreatePermissionTemplateUseCase
  ) {}

  @ApiOperation({ operationId: "createPermissionTemplate" })
  @ApiCreatedResponse({ type: PermissionTemplateResponseDto })
  @RequirePermission("admin.permission_templates.create")
  @Post()
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @HttpCode(HttpStatus.CREATED)
  @Idempotent({ ttlHours: 1 })
  async handle(
    @Body() dto: PermissionTemplateBodyDto
  ): Promise<CreatePermissionTemplateOutput> {
    return this.createTemplate.execute({
      name: dto.name,
      description: dto.description,
      permissions: dto.permissions,
    })
  }
}
