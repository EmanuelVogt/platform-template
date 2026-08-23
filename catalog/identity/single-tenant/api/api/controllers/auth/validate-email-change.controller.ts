import { Controller, Get, HttpCode, HttpStatus, Query } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { Public } from "../../../../../shared/kernel/access/decorators"
import { ListQuery } from "../../../../../shared/kernel/listing/list-query.decorator"
import { RateLimit } from "../../../../../shared/kernel/rate-limit/rate-limit.decorator"
import { ValidateEmailChangeQuery } from "../../../application/use-cases/validate-email-change/validate-email-change.use-case"
import {
  EmailChangeInfoDto,
  ValidateEmailChangeQueryDto,
  validateEmailChangeQuerySchema,
} from "../../contracts/identity.contract"

@ApiTags("Auth")
@Controller("auth")
export class ValidateEmailChangeController {
  constructor(private readonly validate: ValidateEmailChangeQuery) {}

  @ApiOperation({ operationId: "validateEmailChange" })
  @Public()
  @Get("email-change")
  @RateLimit({ limit: 20, windowSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @ListQuery(validateEmailChangeQuerySchema)
  @ApiOkResponse({ type: EmailChangeInfoDto })
  async handle(
    @Query() query: ValidateEmailChangeQueryDto,
  ): Promise<EmailChangeInfoDto> {
    return this.validate.execute({ token: query.token })
  }
}
