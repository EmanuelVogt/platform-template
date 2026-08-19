import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { OutboxPublisher } from "../../../../../shared/kernel/outbox/outbox.publisher"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { NotificationRequested } from "../../../../notification/api/events/notification-requested.event"
import { VerificationToken } from "../../../domain/entities/verification-token.entity"
import { AccessLinkNotResendableError } from "../../../domain/errors"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import { TOKEN_GENERATOR, type TokenGenerator } from "../../../domain/ports/token-generator"
import { USER_REPOSITORY, type UserRepository } from "../../../domain/ports/user.repository"
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from "../../../domain/ports/verification-token.repository"
import { IDENTITY_CONFIG, type IdentityConfig } from "../../../identity.config"
import { authEventOf } from "../../auth-event.factory"

import type { ResendAccessLinkInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class ResendAccessLinkUseCase implements UseCaseContract<ResendAccessLinkInput, void> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    private readonly outbox: OutboxPublisher,
    @Inject(AUTH_EVENT_REPOSITORY) private readonly authEvents: AuthEventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
  ) {}

  @Transactional()
  @Traced({ name: "identity.resendAccessLink" })
  async execute(input: ResendAccessLinkInput): Promise<void> {
    const now = this.clock.now()
    const store = this.ctx.get()

    const user = await this.users.findById(input.userId)
    if (user?.props.status !== "pending") {
      throw new AccessLinkNotResendableError("Usuário não está pendente.")
    }

    const latest = await this.verificationTokens.findLatestForUser(input.userId, "access_link")
    const stillValid =
      latest !== null && latest.consumedAt === null && latest.expiresAt.getTime() > now.getTime()
    if (stillValid) {
      throw new AccessLinkNotResendableError("Link de acesso ainda válido.")
    }

    await this.verificationTokens.invalidateAllForUser(input.userId, "access_link")
    const { raw, hash } = this.tokens.generate()
    const expiresAt = new Date(
      now.getTime() + this.config.ACCESS_LINK_TOKEN_TTL_SECONDS * 1000,
    )
    await this.verificationTokens.create(
      VerificationToken.create({
        userId: input.userId,
        tokenHash: hash,
        type: "access_link",
        expiresAt,
      }),
    )

    const link = `${this.config.WEB_ORIGIN}/configurar-senha?token=${raw}`
    await this.outbox.publish(
      NotificationRequested.from({
        recipientId: input.userId,
        type: "access_link_sent",
        locale: store.locale,
        data: {
          email: user.props.email,
          name: user.props.name,
          link,
          tokenExpiresAt: expiresAt.toISOString(),
        },
      }),
    )
    await this.authEvents.recordInTx(
      authEventOf(store, {
        userId: input.userId,
        actorUserId: this.ctx.getActor()?.id ?? null,
        eventType: "access_link_resent",
      }),
    )
  }
}
