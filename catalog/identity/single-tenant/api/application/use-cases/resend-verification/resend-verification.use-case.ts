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
import { requireAuth } from "../../require-auth"

import type { ResendVerificationInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class ResendVerificationUseCase
  implements UseCaseContract<ResendVerificationInput, void>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    private readonly outbox: OutboxPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
  ) {}

  @Transactional()
  @Traced({ name: "identity.resendVerification" })
  async execute(_input: ResendVerificationInput): Promise<void> {
    const ctx = requireAuth(this.ctx)
    const now = this.clock.now()

    const user = await this.users.findById(ctx.userId)
    // Já verificado, inexistente, ou em cooldown → no-op silencioso (202).
    if (!user || user.props.emailVerified) {
      return
    }
    if (
      user.props.lastVerificationRequestedAt &&
      now.getTime() - user.props.lastVerificationRequestedAt.getTime() <
        this.config.VERIFICATION_COOLDOWN_SECONDS * 1000
    ) {
      return
    }

    await this.verificationTokens.invalidateAllForUser(
      user.props.id,
      "email_verify",
    )
    const { raw, hash } = this.tokens.generate()
    const expiresAt = new Date(
      now.getTime() + this.config.VERIFY_TOKEN_TTL_SECONDS * 1000,
    )
    await this.verificationTokens.create(
      VerificationToken.create({
        userId: user.props.id,
        tokenHash: hash,
        type: "email_verify",
        expiresAt,
      }),
    )

    await this.users.update(user.markVerificationRequested(now))

    const link = `${this.config.WEB_ORIGIN}/verificar-email?token=${raw}`
    await this.outbox.publish(
      NotificationRequested.from({
        recipientId: user.props.id,
        type: "email_verification",
        locale: this.ctx.get().locale,
        data: { email: user.props.email, link, tokenExpiresAt: expiresAt.toISOString() },
      }),
    )
  }
}
