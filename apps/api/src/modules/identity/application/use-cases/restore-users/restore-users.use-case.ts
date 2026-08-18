import { Inject } from "@nestjs/common"

import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import { authEventOf } from "../../auth-event.factory"

import type { RestoreUsersInput, RestoreUsersOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class RestoreUsersUseCase
  implements UseCaseContract<RestoreUsersInput, RestoreUsersOutput>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUTH_EVENT_REPOSITORY) private readonly authEvents: AuthEventRepository,
    private readonly ctx: RequestContext,
  ) {}

  @Transactional()
  @Traced({ name: "identity.restoreUsers" })
  async execute(input: RestoreUsersInput): Promise<RestoreUsersOutput> {
    const store = this.ctx.get()
    const found = await this.users.findByIds(input.userIds)
    // Não-deletado/inexistente é ignorado: re-submissão do batch é no-op.
    const deleted = found.filter((user) => user.isDeleted())
    for (const user of deleted) {
      await this.users.update(user.restore())
      await this.authEvents.recordInTx(
        authEventOf(store, {
          userId: user.props.id,
          actorUserId: store.userId,
          eventType: "user_restored",
        }),
      )
    }
    return { restored: deleted.length }
  }
}
