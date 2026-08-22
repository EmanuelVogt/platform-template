import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { OutboxPublisher } from "../../../../../shared/kernel/outbox/outbox.publisher"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { NotificationRequested } from "../../../../notification/api/events/notification-requested.event"
import { InvalidResetTokenError, WeakPasswordError } from "../../../domain/errors"
import { validatePasswordPolicy } from "../../../domain/password-policy"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import { BREACH_CHECK, type BreachCheck } from "../../../domain/ports/breach-check"
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from "../../../domain/ports/password-hasher"
import {
  PASSWORD_STRENGTH,
  type PasswordStrength,
} from "../../../domain/ports/password-strength"
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from "../../../domain/ports/session.repository"
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

import type { ResetPasswordInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class ResetPasswordUseCase
  implements UseCaseContract<ResetPasswordInput, void>
{
  constructor(
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(PASSWORD_STRENGTH) private readonly strength: PasswordStrength,
    @Inject(BREACH_CHECK) private readonly breach: BreachCheck,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    private readonly outbox: OutboxPublisher,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
  ) {}

  @Traced({ name: "identity.resetPassword" })
  async execute(input: ResetPasswordInput): Promise<void> {
    // Validação (policy + força + breach) é pré-condição pura — roda FORA da tx
    // (o fetch HIBP nunca segura conexão do pool, R17) e antes de consumir o
    // token single-use (senha inválida não queima o token).
    await this.validateNewPassword(input.password)
    await this.executeInTx(input)
  }

  private async validateNewPassword(password: string): Promise<void> {
    validatePasswordPolicy({
      minZxcvbnScore: this.config.PASSWORD_MIN_ZXCVBN_SCORE,
      zxcvbnScore: this.strength.score(password),
    })
    if (this.config.BREACH_CHECK_MODE === "fail_closed") {
      if ((await this.breach.check(password)) === "breached") {
        throw new WeakPasswordError(
          "Esta senha apareceu em vazamentos conhecidos.",
        )
      }
    }
  }

  @Transactional()
  private async executeInTx(input: ResetPasswordInput): Promise<void> {
    const now = this.clock.now()
    const store = this.ctx.get()

    // Consumo ATÔMICO: o UPDATE condicional garante que duas requisições
    // concorrentes resultem em exatamente 1 sucesso (§8).
    const tokenHash = this.tokens.hashOf(input.token)
    const consumed = await this.verificationTokens.consumeByHash(
      tokenHash,
      "password_reset",
      now,
    )
    if (!consumed) {
      throw new InvalidResetTokenError()
    }

    const user = await this.users.findById(consumed.userId)
    if (!user) {
      throw new InvalidResetTokenError()
    }

    await this.users.update(user.rehashPassword(await this.hasher.hash(input.password)))

    // Reset (não-autenticado) invalida TODAS as sessões + tokens pendentes (§6).
    await this.sessions.deleteAllForUser(consumed.userId)
    await this.verificationTokens.invalidateAllForUser(
      consumed.userId,
      "password_reset",
    )

    await this.authEvents.recordInTx(
      authEventOf(store, {
        userId: consumed.userId,
        eventType: "password_reset_completed",
      }),
    )

    await this.outbox.publish(
      NotificationRequested.from({
        recipientId: consumed.userId,
        type: "password_changed",
        locale: store.locale,
        data: { email: user.props.email, at: now.toISOString() },
      }),
    )
  }
}
