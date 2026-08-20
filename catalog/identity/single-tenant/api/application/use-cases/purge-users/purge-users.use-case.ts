import { Inject, Optional } from "@nestjs/common"

import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { UserNotInTrashError } from "../../../domain/errors"
import {
  AUDIT_TRAIL_PURGER,
  type AuditTrailPurger,
} from "../../../domain/ports/audit-trail-purger"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import { authEventOf } from "../../auth-event.factory"

import type { PurgeUsersInput, PurgeUsersOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class PurgeUsersUseCase
  implements UseCaseContract<PurgeUsersInput, PurgeUsersOutput>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUTH_EVENT_REPOSITORY) private readonly authEvents: AuthEventRepository,
    private readonly ctx: RequestContext,
    @Optional()
    @Inject(AUDIT_TRAIL_PURGER)
    private readonly auditTrail: AuditTrailPurger | null = null,
  ) {}

  @Transactional()
  @Traced({ name: "identity.purgeUsers" })
  async execute(input: PurgeUsersInput): Promise<PurgeUsersOutput> {
    const store = this.ctx.get()
    const found = await this.users.findByIds(input.userIds)
    if (found.some((user) => !user.isDeleted())) {
      throw new UserNotInTrashError()
    }
    // Auditoria antes do delete, na mesma tx: auth_events não tem FK e sobrevive.
    for (const user of found) {
      await this.authEvents.recordInTx(
        authEventOf(store, {
          userId: user.props.id,
          actorUserId: this.ctx.getActor()?.id ?? null,
          eventType: "user_purged",
        }),
      )
    }
    await this.users.hardDeleteByIds(found.map((user) => user.props.id))
    // Purge LGPD da trilha do titular DEPOIS do hard delete (que gera as linhas
    // op=delete com PII em row_old), na mesma tx via escape hatch.
    await this.auditTrail?.purgeEntities(
      found.map((user) => ({ table: "users", entityId: user.props.id })),
    )
    return { purged: found.length }
  }
}
