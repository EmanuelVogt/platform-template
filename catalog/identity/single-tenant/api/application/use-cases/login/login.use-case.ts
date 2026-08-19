import { Inject, type OnModuleInit } from "@nestjs/common"

import { CLOCK, type Clock } from "../../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../../shared/kernel/context/request-context"
import { OutboxPublisher } from "../../../../../shared/kernel/outbox/outbox.publisher"
import { Traced } from "../../../../../shared/kernel/tracing/traced.decorator"
import { Transactional } from "../../../../../shared/kernel/transactional/transactional.decorator"
import { UseCase } from "../../../../../shared/kernel/use-case/use-case.decorator"
import { NotificationRequested } from "../../../../notification/api/events/notification-requested.event"
import { User } from "../../../domain/entities/user.entity"
import { InvalidCredentialsError } from "../../../domain/errors"
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventRepository,
} from "../../../domain/ports/auth-event.repository"
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from "../../../domain/ports/password-hasher"
import {
  RATE_LIMITER,
  type RateLimiter,
} from "../../../domain/ports/rate-limiter"
import {
  TOKEN_GENERATOR,
  type TokenGenerator,
} from "../../../domain/ports/token-generator"
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../../domain/ports/user.repository"
import { IDENTITY_CONFIG, type IdentityConfig } from "../../../identity.config"
import { authEventOf } from "../../auth-event.factory"
import { CreateSessionService } from "../../services/create-session.service"
import { toUserView } from "../../views"

import type { LoginInput, LoginOutput } from "./types"
import type { RequestContextStore } from "../../../../../shared/kernel/context/request-context"
import type { UseCase as UseCaseContract } from "../../../../../shared/kernel/use-case/use-case"

const LOGIN_RATE_LIMIT = 30
const LOGIN_RATE_WINDOW_SECONDS = 60

@UseCase()
export class LoginUseCase
  implements UseCaseContract<LoginInput, LoginOutput>, OnModuleInit
{
  // Hash dummy gerado no boot com os params/pepper CORRENTES (§8). Verify contra
  // ele mantém custo de tempo igual ao caminho real (anti-timing-oracle).
  private dummyHash = ""

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(RATE_LIMITER) private readonly rateLimiter: RateLimiter,
    @Inject(AUTH_EVENT_REPOSITORY)
    private readonly authEvents: AuthEventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly ctx: RequestContext,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
    private readonly outbox: OutboxPublisher,
    private readonly createSession: CreateSessionService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hasher.hash("dummy-password-for-constant-time")
  }

  @Traced({ name: "identity.login" })
  async execute(input: LoginInput): Promise<LoginOutput> {
    const email = input.email.trim().toLowerCase()
    const ctx = this.ctx.get()

    // Rate-limit ANTES do argon2 (gate barato — §8). Chave composta IP+conta.
    const gate = await this.rateLimiter.consume(
      `login:${ctx.ip ?? "noip"}:${email}`,
      LOGIN_RATE_LIMIT,
      LOGIN_RATE_WINDOW_SECONDS
    )
    if (!gate.allowed) {
      await this.authEvents.record(
        authEventOf(ctx, {
          userId: null,
          eventType: "rate_limited_burst",
          emailHash: this.tokens.hashOf(email),
          metadata: { retryAfterSeconds: gate.retryAfterSeconds },
        })
      )
      throw new InvalidCredentialsError()
    }

    const now = this.clock.now()
    const user = await this.users.findByEmail(email)

    // SEMPRE verify (dummy quando inexistente/pending) — sem short-circuit anti-timing.
    const hashToCheck =
      user && user.props.passwordHash !== null
        ? user.props.passwordHash
        : this.dummyHash
    const passwordOk = await this.hasher.verify(input.password, hashToCheck)

    // Falha → MESMA exceção (anti-enumeration). login_failed FORA da tx (§10).
    if (
      !user ||
      user.isDeleted() ||
      user.props.status !== "active" ||
      !passwordOk ||
      (this.config.REQUIRE_EMAIL_VERIFICATION && !user.props.emailVerified)
    ) {
      await this.recordFailure(user, email, ctx)
      throw new InvalidCredentialsError()
    }

    return this.succeed(user, input, ctx, now)
  }

  // record/raiz (não onCommit): sobrevive a abort/rollback (§10).
  private async recordFailure(
    user: User | null,
    email: string,
    ctx: RequestContextStore,
  ): Promise<void> {
    await this.authEvents.record(
      authEventOf(ctx, {
        userId: user?.props.id ?? null,
        eventType: "login_failed",
        emailHash: user ? null : this.tokens.hashOf(email),
      })
    )
  }

  @Transactional()
  private async succeed(
    user: User,
    input: LoginInput,
    ctx: RequestContextStore,
    now: Date,
  ): Promise<LoginOutput> {
    // Snapshot de execute() é pré-tx; releitura com trava evita regravar
    // desligamento/desativação commitados no intervalo.
    const fresh = await this.users.findByIdForUpdate(user.props.id)
    if (
      !fresh ||
      fresh.isDeleted() ||
      fresh.props.status !== "active"
    ) {
      throw new InvalidCredentialsError()
    }

    // Rehash-on-login: único momento com senha em claro (§7). Não comparar o
    // hash com o snapshot — rehash concorrente mudaria o hash sem mudar a senha.
    let current = fresh
    if (
      current.props.passwordHash !== null &&
      this.hasher.needsRehash(current.props.passwordHash)
    ) {
      current = current.rehashPassword(await this.hasher.hash(input.password))
    }
    // Contas com lockout residual (legado) limpam na entrada bem-sucedida.
    current = current.clearLockout()
    await this.users.update(current)

    const session = await this.createSession.create(
      current,
      { deviceCookie: input.deviceCookie, rememberMe: input.rememberMe },
      now,
    )

    await this.authEvents.recordInTx(
      authEventOf(ctx, { userId: current.props.id, eventType: "login_success" })
    )

    // Primeiro login da conta também dispara (todo device é novo na primeira
    // vez) — padrão de mercado, sem supressão.
    if (session.isNewDevice) {
      await this.outbox.publish(
        NotificationRequested.from({
          recipientId: current.props.id,
          type: "device_new_login",
          locale: ctx.locale,
          data: {
            email: current.props.email,
            deviceLabel: deviceLabelFrom(ctx.userAgent),
            ip: ctx.ip ?? null,
            at: now.toISOString(),
          },
        })
      )
    }

    // maxAgeSeconds é a fonte única do TTL do cookie — o controller não recalcula.
    return {
      user: toUserView(current, await this.users.findPermissions(current.props.id)),
      sessionToken: session.sessionToken,
      maxAgeSeconds: session.maxAge,
      sessionId: session.sessionId,
      deviceCookie: session.deviceCookie,
      deviceCookieMaxAgeSeconds: session.deviceCookieMaxAge,
    }
  }
}

function deviceLabelFrom(userAgent: string | null | undefined): string {
  if (!userAgent) {
    return "dispositivo desconhecido"
  }
  return userAgent.length > 80 ? `${userAgent.slice(0, 77)}...` : userAgent
}
