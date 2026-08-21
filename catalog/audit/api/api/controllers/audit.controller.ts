import { Controller, Get, HttpCode, HttpStatus, Query } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { RequireAnyPermission } from "../../../../shared/kernel/access/decorators"
import { ListQuery } from "../../../../shared/kernel/listing/list-query.decorator"
import {
  AUDIT_PERMISSION_KEYS,
  FULL_AUDIT_PERMISSION,
} from "../../../identity/api/facades/permission-catalog.facade"
import { ListAuditEntriesUseCase } from "../../application/list-audit-entries/list-audit-entries.use-case"
import {
  ListAuditEntriesQueryDto,
  ListAuditEntriesResponseDto,
  listAuditEntriesQuerySchema,
} from "../contracts/audit.contract"

import type { ListAuditEntriesQuery } from "../../application/list-audit-entries/types"

function toListInput(query: ListAuditEntriesQueryDto): ListAuditEntriesQuery {
  return {
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    order: query.order,
    q: query.q,
    table: query.table,
    entityId: query.entityId,
    actorUserId: query.actorUserId,
    op: query.op,
    origin: query.origin,
    txId: query.txId,
    from: query.from,
    to: query.to,
  }
}

@ApiTags("Administration")
@Controller("audit")
export class AuditController {
  constructor(private readonly listEntries: ListAuditEntriesUseCase) {}

  @ApiOperation({ operationId: "listAuditEntries" })
  @RequireAnyPermission([FULL_AUDIT_PERMISSION, ...AUDIT_PERMISSION_KEYS])
  @Get()
  @HttpCode(HttpStatus.OK)
  @ListQuery(listAuditEntriesQuerySchema)
  @ApiOkResponse({ type: ListAuditEntriesResponseDto })
  async list(
    @Query() query: ListAuditEntriesQueryDto
  ): Promise<ListAuditEntriesResponseDto> {
    return this.listEntries.execute(toListInput(query))
  }
}
