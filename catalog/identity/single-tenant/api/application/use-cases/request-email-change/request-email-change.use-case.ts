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
import { VerificationToken } from "../../../domain/entities/verification-token.entity"
import {
  EmailAlreadyInUseError,
  EmailUnchangedError,
  InvalidCredentialsError,
  RateLimitedError,
} from "../../../domain/errors"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from "../../../domain/ports/password-hasher"
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
import { requireAuth } from "../../require-auth"

import type { RequestEmailChangeInput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

/**
 * Inicia a troca de e-mail: exige a senha atual, desativa a conta (status
 * 'pending'), revoga todas as sessões (logout forçado) e envia link de
 * reativação ao novo e-mail + aviso ao antigo. A confirmação no novo endereço
 * reativa a conta; a expiração do token reverte (maintenance job).
 */
@UseCase()
export class RequestEmailChangeUseCase implements UseCaseContract<
  RequestEmailChangeInput,
  void
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly outbox: OutboxPublisher,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig
  ) {}

  @Traced({ name: "identity.requestEmailChange" })
  async execute(input: RequestEmailChangeInput): Promise<void> {
    const ctx = requireAuth(this.ctx)
    const now = this.clock.now()

    // Leitura + verificação da senha (argon2) FORA da tx — não segura conexão
    // durante o hash. Ordem de erros: Forbidden → InvalidCredentials → demais.
    const user = await this.users.findById(ctx.userId)
    if (!user) {
      throw new ForbiddenError()
    }
    if (user.props.passwordHash === null) {
      throw new InvalidCredentialsError()
    }
    const ok = await this.hasher.verify(
      input.currentPassword,
      user.props.passwordHash
    )
    if (!ok) {
      throw new InvalidCredentialsError()
    }

    const newEmail = input.newEmail.trim().toLowerCase()
    if (newEmail === user.props.email) {
      throw new EmailUnchangedError()
    }
    this.assertNotInCooldown(user.props.lastEmailChangeRequestedAt, now)

    // Pré-checagem de unicidade (best-effort): pendingEmail não tem unique index,
    // a garantia definitiva é o índice de `email` no swap da confirmação.
    const existing = await this.users.findByEmail(newEmail)
    if (existing) {
      // Cooldown gravado ANTES de recusar, e um único 409 para endereço em uso
      // ou de usuário excluído: sem isso, a recusa era um oráculo de e-mails
      // grátis e sem espera.
      await this.users.update(user.recordEmailChangeAttempt(now))
      throw new EmailAlreadyInUseError()
    }

    await this.applyInTx(user, newEmail, now)
  }

  private assertNotInCooldown(last: Date | null, now: Date): void {
    if (last === null) {
      return
    }
    const elapsed = now.getTime() - last.getTime()
    const windowMs = this.config.EMAIL_CHANGE_COOLDOWN_SECONDS * 1000
    if (elapsed < windowMs) {
      throw new RateLimitedError(Math.ceil((windowMs - elapsed) / 1000))
    }
  }

  @Transactional()
  private async applyInTx(
    snapshot: User,
    newEmail: string,
    now: Date
  ): Promise<void> {
    // Releitura com trava: credencial velha em voo não pode iniciar a troca
    // depois de a senha ter sido trocada — a consequência seria entregar a
    // conta a um e-mail novo.
    const user = await this.users.findByIdForUpdate(snapshot.props.id)
    if (
      !user ||
      user.isDeleted() ||
      user.props.status !== "active" ||
      user.isLocked(now) ||
      user.props.passwordHash === null ||
      user.props.passwordHash !== snapshot.props.passwordHash
    ) {
      throw new InvalidCredentialsError()
    }
    await this.users.update(user.requestEmailChange(newEmail, now))
    await this.verificationTokens.invalidateAllForUser(
      user.props.id,
      "email_change"
    )

    const { raw, hash } = this.tokens.generate()
    const expiresAt = new Date(
      now.getTime() + this.config.EMAIL_CHANGE_TOKEN_TTL_SECONDS * 1000
    )
    await this.verificationTokens.create(
      VerificationToken.create({
        userId: user.props.id,
        tokenHash: hash,
        type: "email_change",
        expiresAt,
      })
    )

    // Desloga de todos os dispositivos: conta inativa até reativar.
    await this.sessions.deleteAllForUser(user.props.id)

    const link = `${this.config.WEB_ORIGIN}/confirmar-email?token=${raw}`
    await this.outbox.publish(
      NotificationRequested.from({
        recipientId: user.props.id,
        type: "email_change_requested",
        locale: this.ctx.get().locale,
        data: {
          email: newEmail,
          link,
          tokenExpiresAt: expiresAt.toISOString(),
        },
      })
    )
    await this.outbox.publish(
      NotificationRequested.from({
        recipientId: user.props.id,
        type: "email_change_notice",
        locale: this.ctx.get().locale,
        data: { email: user.props.email, at: now.toISOString() },
      })
    )
    await this.authEvents.recordInTx(
      authEventOf(this.ctx.get(), {
        userId: user.props.id,
        eventType: "email_change_requested",
      })
    )
  }
}
