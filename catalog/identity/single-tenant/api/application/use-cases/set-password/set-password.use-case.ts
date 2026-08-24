import { Inject, Optional } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { OutboxPublisher } from "../../../../../shared/kernel/outbox/outbox.publisher"
import {
  PROFILE_IMAGE_STORE,
  type ProfileImageStore,
} from "../../../../../shared/kernel/profile-image/profile-image-store.port"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { NotificationRequested } from "../../../../notification/api/events/notification-requested.event"
import { InvalidAccessLinkError } from "../../../domain/errors"
import { validatePasswordPolicy } from "../../../domain/password-policy"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import {
  BREACH_CHECK,
  type BreachCheck,
} from "../../../domain/ports/breach-check"
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from "../../../domain/ports/password-hasher"
import {
  PASSWORD_STRENGTH,
  type PasswordStrength,
} from "../../../domain/ports/password-strength"
import { requireProfileImageStore } from "../../../domain/ports/profile-image-store"
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
import { type BreachOutcome, checkBreach } from "../../password/check-breach"
import { CreateSessionService } from "../../services/create-session.service"
import { toUserView } from "../../views"

import type { SetPasswordInput, SetPasswordOutput } from "./types"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"
import type { User } from "../../../domain/entities/user.entity"

@UseCase()
export class SetPasswordUseCase implements UseCaseContract<
  SetPasswordInput,
  SetPasswordOutput
> {
  constructor(
    @Inject(VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokens: VerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
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
    @Optional()
    @Inject(PROFILE_IMAGE_STORE)
    private readonly profileImages: ProfileImageStore | null = null,
    private readonly createSession: CreateSessionService
  ) {}

  @Traced({ name: "identity.setPassword" })
  async execute(input: SetPasswordInput): Promise<SetPasswordOutput> {
    // Validação de senha é pré-condição pura: FORA da tx, antes de queimar o
    // token (senha fraca não consome o link). Igual ao reset.
    const breachOutcome = await this.validateNewPassword(input.password)

    // Resolve o user pelo token SEM consumir, p/ checar status (pending) e
    // resolver o avatar (ownership) antes de abrir a tx.
    // Pre-check fora da tx NÃO é fonte de verdade: só resolve o avatar antes de abrir a tx;
    // a garantia atômica é o consumeByHash + re-check dentro da tx.
    const now = this.clock.now()
    const active = await this.verificationTokens.findActiveByHash(
      this.tokens.hashOf(input.token),
      "access_link",
      now
    )
    if (!active) {
      throw new InvalidAccessLinkError()
    }
    const user = await this.users.findById(active.userId)
    // Mesmo erro genérico do token ausente (anti-enumeration).
    if (user?.props.status !== "pending") {
      throw new InvalidAccessLinkError()
    }
    const avatarAttachmentId = await this.resolveAvatar(
      input.avatarAttachmentId,
      user.props.id,
      user.props.avatarAttachmentId
    )

    return this.activateInTx(input, avatarAttachmentId, breachOutcome)
  }

  // BREACH_CHECK_ENABLED decide SE consulta; BREACH_CHECK_MODE decide só o que
  // fazer quando a consulta falha — quem aplica o modo é o adapter.
  private async validateNewPassword(password: string): Promise<BreachOutcome> {
    validatePasswordPolicy({
      minZxcvbnScore: this.config.PASSWORD_MIN_ZXCVBN_SCORE,
      zxcvbnScore: this.strength.score(password),
    })
    return this.config.BREACH_CHECK_ENABLED
      ? checkBreach(this.breach, password)
      : "clear"
  }

  /**
   * Resolve o avatar a persistir. Aceita: nenhum (mantém o atual), o mesmo id já
   * associado (avatar pré-setado pelo admin — dono é o admin, não re-checa), ou
   * um upload próprio do user pending (ownership). Id de terceiro → cai no atual.
   *
   * Janela TOCTOU aceita: sem FK, pior caso é id dangling se o attachment morrer
   * entre o check e o commit.
   */
  private async resolveAvatar(
    submitted: string | undefined,
    userId: string,
    current: string | null
  ): Promise<string | null> {
    if (submitted === undefined || submitted === current) {
      return current
    }
    const ok = await requireProfileImageStore(this.profileImages).exists(
      submitted,
      userId
    )
    return ok ? submitted : current
  }

  @Transactional()
  private async activateInTx(
    input: SetPasswordInput,
    avatarAttachmentId: string | null,
    breachOutcome: BreachOutcome
  ): Promise<SetPasswordOutput> {
    const now = this.clock.now()
    const store = this.ctx.get()

    const consumed = await this.verificationTokens.consumeByHash(
      this.tokens.hashOf(input.token),
      "access_link",
      now
    )
    if (!consumed) {
      throw new InvalidAccessLinkError()
    }
    const found = await this.users.findById(consumed.userId)
    if (found?.props.status !== "pending") {
      throw new InvalidAccessLinkError()
    }

    const passwordHash = await this.hasher.hash(input.password)
    const activated: User = found.activate(
      {
        passwordHash,
        name: input.name,
        birthDate: input.birthDate,
        avatarAttachmentId,
      },
      now
    )
    await this.users.update(activated)
    await this.verificationTokens.invalidateAllForUser(
      consumed.userId,
      "access_link"
    )

    const session = await this.createSession.create(
      activated,
      { deviceCookie: input.deviceCookie, rememberMe: false },
      now
    )

    // Só aqui o dono da senha é conhecido: a lacuna da consulta é atribuída a
    // quem de fato definiu a senha sem verificação.
    if (breachOutcome === "skipped") {
      await this.authEvents.recordInTx(
        authEventOf(store, {
          userId: consumed.userId,
          eventType: "breach_check_skipped",
          metadata: { mode: this.config.BREACH_CHECK_MODE },
        })
      )
    }

    await this.authEvents.recordInTx(
      authEventOf(store, { userId: consumed.userId, eventType: "password_set" })
    )

    // Notifica quem criou a conta; null = seed/master → ninguém a notificar.
    const createdBy = activated.props.createdByUserId
    if (createdBy) {
      await this.outbox.publish(
        NotificationRequested.from({
          recipientId: createdBy,
          type: "password_set",
          locale: store.locale,
          data: { userName: activated.props.name },
        })
      )
    }

    return {
      user: toUserView(
        activated,
        await this.users.findPermissions(activated.props.id)
      ),
      sessionToken: session.sessionToken,
      maxAgeSeconds: session.maxAge,
      sessionId: session.sessionId,
      deviceCookie: session.deviceCookie,
      deviceCookieMaxAgeSeconds: session.deviceCookieMaxAge,
    }
  }
}
