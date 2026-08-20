import { Inject, Injectable } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../shared/kernel/clock/clock"
import {
  type AppLogger,
  LoggerFactory,
} from "../../../../shared/kernel/logging/logger.factory"
import { MaintenanceJob } from "../../../../shared/kernel/scheduling/maintenance-job.decorator"
import { registerMaintenanceJob } from "../../../../shared/kernel/scheduling/maintenance-registry"
import {
  ATTACHMENT_CONFIG,
  type AttachmentConfig,
} from "../../attachment.config"
import {
  ATTACHMENT_ACCESS_LOG_REPOSITORY,
  type AttachmentAccessLogRepository,
} from "../../domain/ports/attachment-access-log.repository"

// Antes do decorator, que resolve a spec no registry ao avaliar a classe.
registerMaintenanceJob({
  name: "attachment-access-log.purge",
  cron: "30 4 * * *",
  lockId: 7,
})

const BATCH_SIZE = 5000
const MAX_BATCHES_PER_RUN = 20

/**
 * Purga o access log de attachments além da retention. Desvio consciente do
 * molde purge-auth-events: DELETE em lote pela conexão raiz (volume ordens de
 * magnitude acima), com teto por execução — sobra fica pro próximo tick.
 */
@Injectable()
export class PurgeAttachmentAccessLogsJob {
  private readonly log: AppLogger

  constructor(
    @Inject(ATTACHMENT_ACCESS_LOG_REPOSITORY)
    private readonly accessLogs: AttachmentAccessLogRepository,
    @Inject(ATTACHMENT_CONFIG) private readonly config: AttachmentConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    loggerFactory: LoggerFactory
  ) {
    this.log = loggerFactory.forModule("PurgeAttachmentAccessLogs")
  }

  @MaintenanceJob("attachment-access-log.purge")
  async purge(): Promise<void> {
    const retentionDays = this.config.ATTACHMENT_ACCESS_LOG_RETENTION_DAYS
    const cutoff = new Date(this.clock.now())
    cutoff.setDate(cutoff.getDate() - retentionDays)

    let removed = 0
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      const batch = await this.accessLogs.deleteBatchOlderThan(
        cutoff,
        BATCH_SIZE
      )
      removed += batch
      if (batch < BATCH_SIZE) break
    }
    if (removed > 0) {
      this.log.info("attachment_access_log.purged", { removed, retentionDays })
    }
  }
}
