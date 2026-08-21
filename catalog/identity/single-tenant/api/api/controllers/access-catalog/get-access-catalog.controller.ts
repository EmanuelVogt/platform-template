import { Controller, Get } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"

import { SelfService } from "../../../../../shared/kernel/access/decorators"
import { PROFILE_DEFS } from "../../../domain/access/permission.types"
import { MODULES } from "../../../domain/permissions/permission-catalog"
import { AccessCatalogResponseDto } from "../../contracts/access-catalog.contract"

import type { AccessCatalogResponse } from "../../contracts/access-catalog.contract"

/**
 * Exceção consciente à regra "controller chama use case": catálogo é constante
 * de código, sem operação de negócio nem IO — só serialização. Ver ADR 0028.
 */
@ApiTags("Access")
@Controller("access-catalog")
export class GetAccessCatalogController {
  @ApiOperation({ operationId: "getAccessCatalog" })
  @ApiOkResponse({ type: AccessCatalogResponseDto })
  @SelfService()
  @Get()
  handle(): AccessCatalogResponse {
    return {
      modules: MODULES.map((m) => ({
        key: m.key,
        label: m.label,
        features: m.features.map((f) => ({
          key: f.key,
          label: f.label,
          permissions: f.permissions.map((p) => ({
            key: p.key,
            label: p.label,
            requires: [...p.requires],
          })),
        })),
      })),
      profiles: PROFILE_DEFS.map((p) => ({
        key: p.key,
        label: p.label,
        assignable: p.assignable,
      })),
    }
  }
}
