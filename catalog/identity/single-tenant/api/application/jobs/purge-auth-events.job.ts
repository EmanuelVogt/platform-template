import { Inject, Injectable } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../shared/kernel/clock/clock"
import {
  type AppLogger,
  LoggerFactory,
} from "../../../../shared/kernel/logging/logger.factory"
import { MaintenanceJob } from "../../../../shared/kernel/scheduling/maintenance-job.decorator"
import { registerMaintenanceJob } from "../../../../shared/kernel/scheduling/maintenance-registry"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../domain/ports/auth-event.repository"

// Antes do decorator, que resolve a spec no registry ao avaliar a classe.
registerMaintenanceJob({
  name: "auth-events.purge",
  cron: "45 3 * * *",
  lockId: 5,
})

const RETENTION_MONTHS = 24

/**
 * Purga a trilha de auth além da retention (LGPD): apaga eventos com mais de
 * RETENTION_MONTHS meses. Roda no envelope do MaintenanceRuntime (tx + advisory
 * lock), condição sem a qual o escape hatch do DELETE (GUC transaction-scoped)
 * não valeria.
 */
@Injectable()
export class PurgeAuthEventsJob {
  private readonly log: AppLogger

  constructor(
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    loggerFactory: LoggerFactory
  ) {
    this.log = loggerFactory.forModule("PurgeAuthEvents")
  }

  @MaintenanceJob("auth-events.purge")
  async purge(): Promise<void> {
    const cutoff = new Date(this.clock.now())
    cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS)
    const removed = await this.authEvents.deleteOlderThan(cutoff)
    if (removed > 0) {
      this.log.info("auth_events.purged", {
        removed,
        retentionMonths: RETENTION_MONTHS,
      })
    }
  }
}
