import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import {
  EmailAlreadyInUseError,
  InvalidEmailChangeTokenError,
} from "../../../domain/errors"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import {
  TOKEN_GENERATOR,
  type TokenGenerator,
} from "../../../domain/ports/token-generator"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from "../../../domain/ports/verification-token.repository"
import { authEventOf } from "../../auth-event.factory"
import { CreateSessionService } from "../../services/create-session.service"
import { toUserView } from "../../views"

import type {
  ConfirmEmailChangeInput,
  ConfirmEmailChangeOutput,
} from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

/**
 * Confirma a troca de e-mail: consome o token, promove `pendingEmail` a `email`,
 * reativa a conta e cria uma sessão (auto-login). Token single-use; o índice
 * único de `email` fecha a corrida de um novo e-mail tomado entre o pedido e a
 * confirmação (→ 409).
 */
@UseCase()
export class ConfirmEmailChangeUseCase
  implements UseCaseContract<ConfirmEmailChangeInput, ConfirmEmailChangeOutput>
{
  constructor(
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext,
    private readonly createSession: CreateSessionService,
  ) {}

  @Traced({ name: "identity.confirmEmailChange" })
  async execute(
    input: ConfirmEmailChangeInput,
  ): Promise<ConfirmEmailChangeOutput> {
    // Pré-check fora da tx (anti-enumeration: mesmo erro do token ausente).
    const now = this.clock.now()
    const active = await this.verificationTokens.findActiveByHash(
      this.tokens.hashOf(input.token),
      "email_change",
      now,
    )
    if (!active) {
      throw new InvalidEmailChangeTokenError()
    }
    const user = await this.users.findById(active.userId)
    if (!user?.hasPendingEmailChange()) {
      throw new InvalidEmailChangeTokenError()
    }
    return this.confirmInTx(input)
  }

  @Transactional()
  private async confirmInTx(
    input: ConfirmEmailChangeInput,
  ): Promise<ConfirmEmailChangeOutput> {
    const now = this.clock.now()
    const store = this.ctx.get()

    const consumed = await this.verificationTokens.consumeByHash(
      this.tokens.hashOf(input.token),
      "email_change",
      now,
    )
    if (!consumed) {
      throw new InvalidEmailChangeTokenError()
    }
    const user = await this.users.findById(consumed.userId)
    if (!user?.hasPendingEmailChange()) {
      throw new InvalidEmailChangeTokenError()
    }

    const confirmed = user.confirmEmailChange(now)
    try {
      await this.users.update(confirmed)
    } catch (error) {
      // Novo e-mail tomado por outra conta entre o pedido e a confirmação.
      if (isUniqueViolation(error)) {
        throw new EmailAlreadyInUseError()
      }
      throw error
    }
    await this.verificationTokens.invalidateAllForUser(consumed.userId, "email_change")

    const session = await this.createSession.create(
      confirmed,
      { deviceCookie: input.deviceCookie, rememberMe: false },
      now,
    )

    await this.authEvents.recordInTx(
      authEventOf(store, { userId: consumed.userId, eventType: "email_changed" }),
    )

    return {
      user: toUserView(
        confirmed,
        await this.users.findPermissions(confirmed.props.id),
      ),
      sessionToken: session.sessionToken,
      maxAgeSeconds: session.maxAge,
      sessionId: session.sessionId,
      deviceCookie: session.deviceCookie,
      deviceCookieMaxAgeSeconds: session.deviceCookieMaxAge,
    }
  }
}

/** Violação de unique constraint do Postgres (pg error code 23505). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  )
}
