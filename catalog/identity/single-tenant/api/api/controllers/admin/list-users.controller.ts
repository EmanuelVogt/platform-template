import { Controller, Get, HttpCode, HttpStatus, Query } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequirePermission } from "../../../../../shared/kernel/access/decorators"
import { ListQuery } from "../../../../../shared/kernel/listing/list-query.decorator"
import { ListUsersUseCase } from "../../../application/use-cases/list-users/list-users.use-case"
import {
  ListUsersQueryDto,
  ListUsersResponseDto,
  listUsersQuerySchema,
} from "../../contracts/identity.contract"

import type { ListUsersOutput } from "../../../application/use-cases/list-users/types"
import type { ListUsersInput } from "../../../domain/ports/user.repository"

/** Mapeia o DTO de query (já coagido pelo ZodValidationPipe) para o input do domínio. */
function toListUsersInput(query: ListUsersQueryDto): ListUsersInput {
  return {
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    order: query.order,
    q: query.q,
    emailVerified: query.emailVerified,
    status: query.status,
    deleted: query.deleted,
  }
}

@ApiTags("Admin")
@Controller("admin/users")
export class ListUsersController {
  constructor(private readonly listUsers: ListUsersUseCase) {}

  @ApiOperation({ operationId: "listUsers" })
  @RequirePermission("admin.users.read")
  @Get()
  @HttpCode(HttpStatus.OK)
  @ListQuery(listUsersQuerySchema)
  @ApiOkResponse({ type: ListUsersResponseDto })
  async handle(@Query() query: ListUsersQueryDto): Promise<ListUsersOutput> {
    return this.listUsers.execute(toListUsersInput(query))
  }
}
