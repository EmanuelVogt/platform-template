import { Inject } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { ForbiddenError } from "../../../../../shared/kernel/errors/forbidden.error"
import { OutboxPublisher } from "../../../../../shared/kernel/outbox/outbox.publisher"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { NotificationRequested } from "../../../../notification/api/events/notification-requested.event"
import { User } from "../../../domain/entities/user.entity"
import {
  InvalidCredentialsError,
  WeakPasswordError,
} from "../../../domain/errors"
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
  USER_REPOSITORY,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import { IDENTITY_CONFIG, type IdentityConfig } from "../../../identity.config"
import { authEventOf } from "../../auth-event.factory"
import { type AuthedActor, requireAuth } from "../../require-auth"

import type { ChangePasswordInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

@UseCase()
export class ChangePasswordUseCase
  implements UseCaseContract<ChangePasswordInput, void>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(PASSWORD_STRENGTH) private readonly strength: PasswordStrength,
    @Inject(BREACH_CHECK) private readonly breach: BreachCheck,
    private readonly outbox: OutboxPublisher,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
  ) {}

  @Traced({ name: "identity.changePassword" })
  async execute(input: ChangePasswordInput): Promise<void> {
    const ctx = requireAuth(this.ctx)

    // Leitura + verificação da senha atual fora da tx (sem lock retido); a
    // ordem dos erros é preservada (Forbidden → InvalidCredentials → Weak).
    const user = await this.users.findById(ctx.userId)
    if (!user) {
      throw new ForbiddenError()
    }
    if (user.props.passwordHash === null) {
      throw new InvalidCredentialsError()
    }
    const currentOk = await this.hasher.verify(
      input.currentPassword,
      user.props.passwordHash,
    )
    if (!currentOk) {
      throw new InvalidCredentialsError()
    }

    // Breach-check (fetch HIBP) fora da tx — nunca segura conexão durante o IO
    // de rede (R17).
    await this.validateNewPassword(input.newPassword)

    const newPasswordHash = await this.hasher.hash(input.newPassword)
    await this.applyChange(user, newPasswordHash, ctx)
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
  private async applyChange(
    snapshot: User,
    newPasswordHash: string,
    ctx: AuthedActor,
  ): Promise<void> {
    // Releitura com trava: a senha conferida fora da tx precisa ainda ser a
    // vigente; conta desligada/desativada/travada no intervalo é recusada.
    const user = await this.users.findByIdForUpdate(snapshot.props.id)
    if (
      !user ||
      user.isDeleted() ||
      user.props.status !== "active" ||
      user.isLocked(this.clock.now()) ||
      user.props.passwordHash !== snapshot.props.passwordHash
    ) {
      throw new InvalidCredentialsError()
    }
    await this.users.update(user.rehashPassword(newPasswordHash))

    // Change (autenticado) revoga TODAS exceto a atual — não desloga este device.
    await this.sessions.deleteOthers(ctx.userId, ctx.sessionId)

    await this.authEvents.recordInTx(
      authEventOf(this.ctx.get(), {
        userId: ctx.userId,
        eventType: "password_changed",
      }),
    )

    await this.outbox.publish(
      NotificationRequested.from({
        recipientId: ctx.userId,
        type: "password_changed",
        locale: this.ctx.get().locale,
        data: { email: user.props.email, at: this.clock.now().toISOString() },
      }),
    )
  }
}
