import { ForbiddenException, Inject, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import {
  ACCESS_REQUIREMENT,
  IS_MACHINE_TO_MACHINE_KEY,
} from "../../../../shared/kernel/access/decorators"
import { CSRF } from "../../domain/ports/csrf"
import { IDENTITY_CONFIG } from "../../identity.config"

import type { AccessRequirement } from "../../../../shared/kernel/access/access-policy.port"
import type { Csrf } from "../../domain/ports/csrf"
import type { CanActivate, ExecutionContext } from "@nestjs/common"
import type { Request } from "express"

/** Config consumida pelo CsrfGuard — subset de IdentityConfig. */
export interface CsrfConfig {
  WEB_ORIGIN: string
  COOKIE_SAMESITE: "lax" | "none" | "strict"
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * Valida Origin/Referer contra WEB_ORIGIN em métodos não-safe — defesa CSRF
 * independente de SameSite. Quando SameSite=none, soma signed double-submit
 * (HMAC atrelado ao cookie de sessão via port Csrf). GET nunca muta estado
 * (logout é POST).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CSRF) private readonly csrf: Csrf,
    @Inject(IDENTITY_CONFIG) private readonly cfg: CsrfConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    if (SAFE_METHODS.has(req.method)) {
      return true
    }

    // Chamador máquina-a-máquina não tem cookie de sessão nem Origin de
    // navegador: a defesa dele é o token do próprio guard da rota (ADR 0074).
    const isMachineToMachine = this.reflector.getAllAndOverride<
      boolean | undefined
    >(IS_MACHINE_TO_MACHINE_KEY, [context.getHandler(), context.getClass()])
    if (isMachineToMachine === true) {
      return true
    }

    this.assertSameOrigin(req)

    // double-submit só em rota autenticada: rotas @Public (login/forgot/reset)
    // não têm sessionId nem token CSRF ainda — o Origin-check já as cobre.
    const requirement = this.reflector.getAllAndOverride<
      AccessRequirement | undefined
    >(ACCESS_REQUIREMENT, [context.getHandler(), context.getClass()])
    const isPublic = requirement?.kind === "public"
    if (this.cfg.COOKIE_SAMESITE === "none" && !isPublic) {
      this.assertDoubleSubmit(req)
    }
    return true
  }

  private assertSameOrigin(req: Request): void {
    const origin = req.headers.origin
    const source = origin ?? this.refererOrigin(req.headers.referer)
    if (source === undefined) {
      throw new ForbiddenException("Origem da requisição ausente.")
    }
    if (source !== this.cfg.WEB_ORIGIN) {
      throw new ForbiddenException("Origem da requisição não autorizada.")
    }
  }

  // Só roda em SameSite=none: o token é HMAC sobre o sessionId (PK da sessão)
  // resolvido pelo AuthMiddleware (req.sessionId), o MESMO valor que o emissor
  // assina. Só se aplica a mutações autenticadas — rotas @Public pré-login não
  // têm sessionId e não carregam token CSRF ainda.
  private assertDoubleSubmit(req: Request): void {
    const sessionId = (req as Request & { sessionId?: string }).sessionId
    const token = req.headers["x-csrf-token"]
    if (
      sessionId == null ||
      typeof token !== "string" ||
      !this.csrf.verify(sessionId, token)
    ) {
      throw new ForbiddenException("Token CSRF inválido.")
    }
  }

  private refererOrigin(referer: string | undefined): string | undefined {
    if (!referer) return undefined
    try {
      const url = new URL(referer)
      return `${url.protocol}//${url.host}`
    } catch {
      return undefined
    }
  }
}
