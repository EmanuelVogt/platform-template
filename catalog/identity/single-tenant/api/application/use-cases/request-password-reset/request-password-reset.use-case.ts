import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { OutboxPublisher } from "../../../../../shared/kernel/outbox/outbox.publisher"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { NotificationRequested } from "../../../../notification/api/events/notification-requested.event"
import { VerificationToken } from "../../../domain/entities/verification-token.entity"
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
import { IDENTITY_CONFIG, type IdentityConfig } from "../../../identity.config"
import { authEventOf } from "../../auth-event.factory"

import type { RequestPasswordResetInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class RequestPasswordResetUseCase
  implements UseCaseContract<RequestPasswordResetInput, void>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    private readonly outbox: OutboxPublisher,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
  ) {}

  @Transactional()
  @Traced({ name: "identity.requestPasswordReset" })
  async execute(input: RequestPasswordResetInput): Promise<void> {
    const email = input.email.trim().toLowerCase()
    const now = this.clock.now()
    const store = this.ctx.get()

    const user = await this.users.findByEmail(email)

    // Ramo inexistente: trabalho dummy de custo equivalente (gera+descarta token).
    if (!user) {
      this.tokens.generate()
      return
    }

    // Cooldown por conta — independente de Idempotency-Key (§8).
    if (
      user.props.lastResetRequestedAt &&
      now.getTime() - user.props.lastResetRequestedAt.getTime() <
        this.config.RESET_COOLDOWN_SECONDS * 1000
    ) {
      return
    }

    // Single active token: invalida pendentes antes de emitir o novo.
    await this.verificationTokens.invalidateAllForUser(
      user.props.id,
      "password_reset",
    )

    const { raw, hash } = this.tokens.generate()
    const expiresAt = new Date(
      now.getTime() + this.config.RESET_TOKEN_TTL_SECONDS * 1000,
    )
    await this.verificationTokens.create(
      VerificationToken.create({
        userId: user.props.id,
        tokenHash: hash,
        type: "password_reset",
        expiresAt,
      }),
    )

    await this.users.update(user.markResetRequested(now))

    const link = `${this.config.WEB_ORIGIN}/redefinir-senha?token=${raw}`
    await this.outbox.publish(
      NotificationRequested.from({
        recipientId: user.props.id,
        type: "password_reset_requested",
        locale: store.locale,
        data: { email, link, tokenExpiresAt: expiresAt.toISOString() },
      }),
    )
    await this.authEvents.recordInTx(
      authEventOf(store, {
        userId: user.props.id,
        eventType: "password_reset_requested",
      }),
    )
  }
}
