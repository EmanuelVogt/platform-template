import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { UserNotFoundError } from "../../../domain/errors"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from "../../../domain/ports/session.repository"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import { authEventOf } from "../../auth-event.factory"

import type { DeleteUserInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class DeleteUserUseCase implements UseCaseContract<
  DeleteUserInput,
  void
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext
  ) {}

  @Transactional()
  @Traced({ name: "identity.deleteUser" })
  async execute(input: DeleteUserInput): Promise<void> {
    const store = this.ctx.get()
    const actorId = this.ctx.getActor()?.id ?? null
    const user = await this.users.findById(input.userId)
    if (!user || user.isDeleted()) {
      throw new UserNotFoundError()
    }
    if (user.isMaster()) {
      throw new ForbiddenError("Não é possível excluir o usuário master.")
    }
    if (user.props.id === actorId) {
      throw new ForbiddenError("Não é possível excluir a própria conta.")
    }
    await this.users.update(user.delete(this.clock.now()))
    // Revoga as sessões do excluído: o próximo request segue anônimo (401).
    await this.sessions.deleteAllForUser(user.props.id)
    await this.authEvents.recordInTx(
      authEventOf(store, {
        userId: user.props.id,
        actorUserId: actorId,
        eventType: "user_deleted",
      })
    )
  }
}
