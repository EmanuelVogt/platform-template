import { Inject, Injectable } from "@nestjs/common"

import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from "../../../../shared/infra/storage/object-storage.port"
import {
  type AppLogger,
  LoggerFactory,
} from "../../../../shared/kernel/logging/logger.factory"
import { MaintenanceJob } from "../../../../shared/kernel/scheduling/maintenance-job.decorator"
import { registerMaintenanceJob } from "../../../../shared/kernel/scheduling/maintenance-registry"
import { Traced } from "../../../../shared/kernel/tracing/traced.decorator"
import {
  ATTACHMENT_REPOSITORY,
  type AttachmentRepository,
} from "../../domain/ports/attachment.repository"

// Antes do decorator, que resolve a spec no registry ao avaliar a classe.
registerMaintenanceJob({
  name: "attachment-pending.purge",
  cron: "0 5 * * *",
  lockId: 8,
})

const STALE_AFTER_HOURS = 24

/**
 * Remove pendentes órfãos: anexo que subiu pela API mas cujo relato nunca foi
 * enviado (ou cuja confirmação falhou) após STALE_AFTER_HOURS. Apaga o objeto
 * no storage quando existir e a linha no DB.
 */
@Injectable()
export class PurgePendingAttachmentsJob {
  private readonly log: AppLogger

  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(ATTACHMENT_REPOSITORY) private readonly repo: AttachmentRepository,
    loggerFactory: LoggerFactory,
  ) {
    this.log = loggerFactory.forModule("PurgePendingAttachments")
  }

  @MaintenanceJob("attachment-pending.purge")
  @Traced({ name: "attachment.pending.purge" })
  async run(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000)
    const stale = await this.repo.findPendingOlderThan(cutoff)
    if (stale.length === 0) return

    for (const attachment of stale) {
      try {
        await this.storage.delete(attachment.props.storageKey)
      } catch (error) {
        // Objeto ausente é o caso normal: o upload nunca chegou ao storage.
        this.log.warn("attachment.pending_object_delete_failed", {
          storageKey: attachment.props.storageKey,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    await this.repo.deleteByIds(stale.map((a) => a.props.id))
    this.log.info("attachment.pending_purged", { count: stale.length })
  }
}
