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
  SESSION_REPOSITORY,
  type SessionRepository,
} from "../../../domain/ports/session.repository"
import { authEventOf } from "../../auth-event.factory"
import { requireAuth } from "../../require-auth"

import type { LogoutInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class LogoutUseCase implements UseCaseContract<LogoutInput, void> {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    private readonly ctx: RequestContext,
  ) {}

  @Transactional()
  @Traced({ name: "identity.logout" })
  async execute(_input: LogoutInput): Promise<void> {
    const ctx = requireAuth(this.ctx)
    // deleteById escopa por dono (anti-IDOR) — userId garante que é a própria.
    await this.sessions.deleteById(ctx.sessionId, ctx.userId)
    await this.authEvents.recordInTx(
      authEventOf(ctx, { userId: ctx.userId, eventType: "logout" }),
    )
  }
}
