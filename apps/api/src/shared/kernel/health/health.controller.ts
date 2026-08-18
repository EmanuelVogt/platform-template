import {
  Controller,
  Get,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from "@nestjs/common"
import { ApiOperation, ApiTags } from "@nestjs/swagger"

import { DedicatedClientFactory } from "../../infra/database/dedicated-client.factory"
import { ManagedDedicatedClient } from "../../infra/database/managed-dedicated-client"
import { Public } from "../access/decorators"
import { type AppLogger, LoggerFactory } from "../logging/logger.factory"

@ApiTags("health")
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  private readonly log: AppLogger
  private readonly dedicated: ManagedDedicatedClient

  constructor(factory: DedicatedClientFactory, loggerFactory: LoggerFactory) {
    this.log = loggerFactory.forModule("HealthController")
    this.dedicated = new ManagedDedicatedClient(
      factory,
      "readiness",
      undefined,
      this.log,
    )
  }

  @Public()
  @Get("health")
  @ApiOperation({ operationId: "liveness" })
  liveness(): { status: string } {
    return { status: "ok" }
  }

  @Public()
  @Get("ready")
  @ApiOperation({ operationId: "readiness" })
  async readiness(): Promise<{ status: string }> {
    try {
      const client = await this.dedicated.ensure()
      await client.query("select 1")
      return { status: "ready" }
    } catch (err) {
      this.log.error("readiness_db_check_failed", { err })
      throw new ServiceUnavailableException("Banco de dados indisponível")
    }
  }
}
