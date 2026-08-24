import { Controller, Get, HttpCode, HttpStatus, Query } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { Public } from "../../../../../shared/kernel/access/decorators"
import { ListQuery } from "../../../../../shared/kernel/listing/list-query.decorator"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { ValidateAccessLinkQuery } from "../../../application/use-cases/validate-access-link/validate-access-link.use-case"
import {
  AccessLinkInfoDto,
  ValidateAccessLinkQueryDto,
  validateAccessLinkQuerySchema,
} from "../../contracts/identity.contract"

@ApiTags("Auth")
@Controller("auth")
export class ValidateAccessLinkController {
  constructor(private readonly validate: ValidateAccessLinkQuery) {}

  @ApiOperation({ operationId: "validateAccessLink" })
  @Public()
  @Get("access-link")
  @RateLimit({ limit: 20, windowSeconds: 60, critical: true })
  @HttpCode(HttpStatus.OK)
  @ListQuery(validateAccessLinkQuerySchema)
  @ApiOkResponse({ type: AccessLinkInfoDto })
  async handle(
    @Query() query: ValidateAccessLinkQueryDto
  ): Promise<AccessLinkInfoDto> {
    return this.validate.execute({ token: query.token })
  }
}
