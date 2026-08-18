import { Inject, Injectable } from "@nestjs/common"

import { CLOCK, type Clock } from "../clock/clock"
import { type AppLogger, LoggerFactory } from "../logging/logger.factory"
import { MaintenanceJob } from "../scheduling/maintenance-job.decorator"

import { AuditTrailRepository } from "./audit-trail.repository"

const RETENTION_MONTHS = 24

/**
 * Purga a trilha de auditoria além da retention (LGPD). Roda no envelope do
 * MaintenanceRuntime (tx + advisory lock), condição sem a qual o escape hatch
 * do DELETE (GUC transaction-scoped) não valeria.
 */
@Injectable()
export class PurgeAuditJob {
  private readonly log: AppLogger

  constructor(
    private readonly trail: AuditTrailRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    loggerFactory: LoggerFactory
  ) {
    this.log = loggerFactory.forModule("PurgeAudit")
  }

  @MaintenanceJob("audit.purge")
  async purge(): Promise<void> {
    const cutoff = new Date(this.clock.now())
    cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS)
    const removed = await this.trail.deleteOlderThan(cutoff)
    if (removed > 0) {
      this.log.info("audit.purged", { removed, retentionMonths: RETENTION_MONTHS })
    }
  }
}
