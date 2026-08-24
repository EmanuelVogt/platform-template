import {
  Inject,
  Injectable,
  RequestMethod,
  ServiceUnavailableException,
} from "@nestjs/common"

import { CLOCK } from "../../../../shared/kernel/clock/clock"
import { RequestContext } from "../../../../shared/kernel/context/request-context"
import {
  IDENTITY_ACCESS,
  IDENTITY_SESSION,
} from "../../application/identity-context"
import { SESSION_REPOSITORY } from "../../domain/ports/session.repository"
import { TOKEN_GENERATOR } from "../../domain/ports/token-generator"
import { USER_REPOSITORY } from "../../domain/ports/user.repository"
import { IDENTITY_CONFIG } from "../../identity.config"
import { clearSessionCookie } from "../guards/cookie"

import type { Clock } from "../../../../shared/kernel/clock/clock"
import type { IdentityAccess } from "../../application/identity-context"
import type { Session } from "../../domain/entities/session.entity"
import type { SessionRepository } from "../../domain/ports/session.repository"
import type { TokenGenerator } from "../../domain/ports/token-generator"
import type { UserRepository } from "../../domain/ports/user.repository"
import type { CookieConfig } from "../guards/cookie"
import type { NestMiddleware } from "@nestjs/common"
import type { NextFunction, Request, Response } from "express"

/** Config consumida pelo middleware (cookie + TTLs de sessão) — subset de IdentityConfig. */
export interface AuthMiddlewareConfig extends CookieConfig {
  SESSION_IDLE_TTL_SECONDS: number
  SESSION_ABSOLUTE_TTL_SECONDS: number
  SESSION_TOUCH_INTERVAL_SECONDS: number
}

/**
 * Toda rota da aplicação. `{*splat}` é o coringa do path-to-regexp v8 (Express
 * 5) que também casa `/`; o `"*"` do Nest 10 lança na inicialização.
 */
export const AUTH_MIDDLEWARE_ROUTE = {
  path: "{*splat}",
  method: RequestMethod.ALL,
} as const

type AuthedRequest = Request & {
  userId?: string
  sessionId?: string
  deviceId?: string | null
}

/**
 * Identidade do request. Roda como middleware — antes de QUALQUER guard,
 * inclusive o `AccessGuard` global do kernel, que é registrado no
 * SharedKernelModule e por isso rodaria antes de um guard do identity.
 *
 * Valida o cookie de sessão (sha256 → lookup → expiry idle/absolute) e, quando
 * válido, publica o `Actor` e o conjunto de permissões no RequestContext. NUNCA
 * barra: quem nega é o `IdentityAccessPolicy` a partir do que está no contexto.
 * Cookie ausente/inválido/expirado segue anônimo (com Set-Cookie de limpeza
 * quando havia cookie, para não deixar cookie morto em rajada). FAIL-CLOSED em
 * erro de banco: 503, nunca segue anônimo.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_GENERATOR) private readonly tokens: TokenGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(IDENTITY_CONFIG) private readonly cfg: AuthMiddlewareConfig,
    private readonly ctx: RequestContext
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const raw = (req.cookies as Record<string, string> | undefined)?.[
      this.cfg.COOKIE_NAME
    ]
    if (!raw) {
      next()
      return
    }

    const session = await this.lookup(this.tokens.hashOf(raw))
    const now = this.clock.now()
    if (
      session === null ||
      session.isExpired(
        now,
        this.cfg.SESSION_IDLE_TTL_SECONDS,
        this.cfg.SESSION_ABSOLUTE_TTL_SECONDS
      )
    ) {
      clearSessionCookie(res, this.cfg)
      next()
      return
    }

    // Acesso ANTES de publicar o ator: usuário excluído (ou sumido) não publica
    // nada, então nenhuma rota autenticada o enxerga — antes ele seguia com
    // ator e sem permissões, o que deixava passar toda rota self-service.
    const access = await this.loadAccess(session.props.userId)
    if (access === null) {
      clearSessionCookie(res, this.cfg)
      next()
      return
    }

    this.publish(req, session, access)
    await this.touchIfDue(session, now)
    next()
  }

  /**
   * Um UPDATE por request transformava toda leitura em escrita. A sessão só é
   * tocada quando `now − lastSeenAt` alcança SESSION_TOUCH_INTERVAL_SECONDS; a
   * mesma fronteira vai no WHERE do repositório, para dois requests
   * concorrentes não gravarem duas vezes.
   */
  private async touchIfDue(session: Session, now: Date): Promise<void> {
    const touchBefore = new Date(
      now.getTime() - this.cfg.SESSION_TOUCH_INTERVAL_SECONDS * 1000
    )
    if (session.props.lastSeenAt > touchBefore) return
    const nextExpiresAt = new Date(
      now.getTime() + this.cfg.SESSION_IDLE_TTL_SECONDS * 1000
    )
    await this.sessions.touch(session.props.id, now, nextExpiresAt, touchBefore)
  }

  private async lookup(tokenHash: string): Promise<Session | null> {
    try {
      return await this.sessions.findByTokenHash(tokenHash)
    } catch {
      throw new ServiceUnavailableException(
        "Serviço de autenticação indisponível."
      )
    }
  }

  private publish(
    req: Request,
    session: Session,
    access: IdentityAccess
  ): void {
    const { tenantId } = this.ctx.get()
    this.ctx.setActor({
      id: session.props.userId,
      kind: "user",
      ...(tenantId === null ? {} : { tenantId }),
    })
    this.ctx.setExtension(IDENTITY_SESSION, {
      sessionId: session.props.id,
      deviceId: session.props.deviceId,
    })
    this.ctx.setExtension(IDENTITY_ACCESS, access)

    // Espelho no request: @CurrentUser e o CsrfGuard não leem o ALS.
    const authed = req as AuthedRequest
    authed.userId = session.props.userId
    authed.sessionId = session.props.id
    authed.deviceId = session.props.deviceId
  }

  /**
   * Usuário sumido ou excluído devolve `null`: a sessão continua viva na tabela,
   * mas não vira identidade nenhuma no request.
   */
  private async loadAccess(userId: string): Promise<IdentityAccess | null> {
    const found = await this.users.findByIdWithPermissions(userId)
    if (!found || found.user.isDeleted()) return null
    return {
      permissions: new Set(found.permissions),
      isMaster: found.user.isMaster(),
    }
  }
}
