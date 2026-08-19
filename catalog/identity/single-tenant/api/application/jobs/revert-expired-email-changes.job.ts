import { Inject, Injectable } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../shared/kernel/clock/clock"
import {
  type AppLogger,
  LoggerFactory,
} from "../../../../shared/kernel/logging/logger.factory"
import { MaintenanceJob } from "../../../../shared/kernel/scheduling/maintenance-job.decorator"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../domain/ports/user.repository"

/**
 * Auto-revert da troca de e-mail: contas com `pendingEmail` cujo token expirou
 * sem confirmação voltam a 'active' com o e-mail antigo. Bounda o lockout por
 * typo ao TTL do token (em vez de deixar a conta presa indefinidamente).
 * Roda no envelope do MaintenanceRuntime (tx + advisory lock).
 */
@Injectable()
export class RevertExpiredEmailChangesJob {
  private readonly log: AppLogger

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    loggerFactory: LoggerFactory,
  ) {
    this.log = loggerFactory.forModule("RevertExpiredEmailChanges")
  }

  @MaintenanceJob("email-change.revert")
  async revertExpired(): Promise<void> {
    const now = this.clock.now()
    const stale = await this.users.findStaleEmailChanges(now)
    for (const user of stale) {
      await this.users.update(user.cancelEmailChange(now))
    }
    if (stale.length > 0) {
      this.log.info("email_change.reverted", { count: stale.length })
    }
  }
}
