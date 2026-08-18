import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import {
  IS_OPTIONAL_AUTH_KEY,
  IS_PUBLIC_KEY,
} from "../../../../shared/kernel/access/decorators"
import { CLOCK } from "../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../shared/kernel/context/request-context"
import { SESSION_REPOSITORY } from "../../domain/ports/session.repository"
import { TOKEN_GENERATOR } from "../../domain/ports/token-generator"
import { IDENTITY_CONFIG } from "../../identity.config"

import { clearSessionCookie } from "./cookie"

import type { CookieConfig } from "./cookie"
import type { Clock } from "../../../../shared/kernel/clock/clock"
import type { Session } from "../../domain/entities/session.entity"
import type { SessionRepository } from "../../domain/ports/session.repository"
import type { TokenGenerator } from "../../domain/ports/token-generator"
import type { CanActivate, ExecutionContext } from "@nestjs/common"
import type { Request, Response } from "express"

/** Config consumida pelo guard (cookie + TTLs de sessão) — subset de IdentityConfig. */
export interface AuthGuardConfig extends CookieConfig {
  SESSION_IDLE_TTL_SECONDS: number
  SESSION_ABSOLUTE_TTL_SECONDS: number
  SESSION_TOUCH_INTERVAL_SECONDS: number
}

/**
 * Guard global secure-by-default. `@Public` opta-out. Valida o cookie de sessão
 * (sha256 → lookup → expiry idle/absolute), popula `userId`+`sessionId` no
 * contexto (ALS) e no request. FAIL-CLOSED: erro de DB → 503, nunca segue
 * anônimo. No 401 emite Set-Cookie de limpeza com atributos idênticos (não deixa
 * cookie morto em rajada).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly reflector: Reflector,
    @Inject(IDENTITY_CONFIG) private readonly cfg: AuthGuardConfig,
    private readonly ctx: RequestContext
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()]
    )
    if (isPublic === true) {
      return true
    }

    const isOptional = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()]
    )

    const req = context.switchToHttp().getRequest<Request>()
    const res = context.switchToHttp().getResponse<Response>()
    const raw = (req.cookies as Record<string, string> | undefined)?.[
      this.cfg.COOKIE_NAME
    ]

    if (!raw) {
      // Modo opcional: ausência de cookie segue anônimo (userId null).
      if (isOptional === true) {
        return true
      }
      this.reject(res)
    }

    const now = this.clock.now()
    // Opcional degrada cookie inválido/erro de DB a anônimo; obrigatório é fail-closed.
    const session =
      isOptional === true
        ? await this.lookupOptional(this.tokens.hashOf(raw))
        : await this.lookup(this.tokens.hashOf(raw), res)

    if (session === null) {
      // Só ocorre em modo opcional: cookie presente mas inválido → anônimo.
      return true
    }

    if (
      session.isExpired(
        now,
        this.cfg.SESSION_IDLE_TTL_SECONDS,
        this.cfg.SESSION_ABSOLUTE_TTL_SECONDS
      )
    ) {
      // Opcional: sessão expirada também segue anônimo em vez de barrar.
      if (isOptional === true) {
        return true
      }
      this.reject(res)
    }

    this.ctx.setUserSession(
      session.props.userId,
      session.props.id,
      session.props.deviceId
    )
    // Espelha no request para o @CurrentUser (param decorator não injeta DI).
    const authedReq = req as Request & {
      userId?: string
      sessionId?: string
      deviceId?: string | null
    }
    authedReq.userId = session.props.userId
    authedReq.sessionId = session.props.id
    authedReq.deviceId = session.props.deviceId

    // touch throttled — UPDATE condicional no repo decide se grava (sem race).
    const nextExpiresAt = new Date(
      now.getTime() + this.cfg.SESSION_IDLE_TTL_SECONDS * 1000
    )
    await this.sessions.touch(session.props.id, now, nextExpiresAt)

    return true
  }

  private async lookup(tokenHash: string, res: Response): Promise<Session> {
    let session: Session | null
    try {
      session = await this.sessions.findByTokenHash(tokenHash)
    } catch {
      // FAIL-CLOSED: indisponibilidade do banco nunca vira sessão anônima.
      throw new ServiceUnavailableException(
        "Serviço de autenticação indisponível."
      )
    }
    if (session === null) {
      this.reject(res)
    }
    return session
  }

  /**
   * Lookup do modo opcional: nunca lança. Cookie inválido ou erro de DB
   * degradam a anônimo (`null`) — só rotas opcionais (download público/próprio)
   * usam isto; o `lookup` obrigatório segue fail-closed.
   */
  private async lookupOptional(tokenHash: string): Promise<Session | null> {
    try {
      return await this.sessions.findByTokenHash(tokenHash)
    } catch {
      return null
    }
  }

  private reject(res: Response): never {
    clearSessionCookie(res, this.cfg)
    throw new UnauthorizedException("Sessão inválida ou expirada.")
  }
}
