import { Injectable } from "@nestjs/common"

import { type AppLogger, LoggerFactory } from "../logging/logger.factory"
import { MaintenanceJob } from "../scheduling/maintenance-job.decorator"

import { IdempotencyRepository } from "./idempotency.repository"

/** Cleanup nightly das idempotency keys: apaga rows expiradas (TTL vencido). */
@Injectable()
export class IdempotencyCleanup {
  private readonly log: AppLogger

  constructor(
    private readonly repo: IdempotencyRepository,
    loggerFactory: LoggerFactory
  ) {
    this.log = loggerFactory.forModule("IdempotencyCleanup")
  }

  @MaintenanceJob("idempotency.purge")
  async purgeExpired(): Promise<void> {
    const removed = await this.repo.deleteExpired()
    this.log.info("idempotency.cleanup", { removed })
  }
}
