import { Inject, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import { TooManyRequestsError } from "../errors/too-many-requests.error"

import { RATE_LIMIT_KEY } from "./rate-limit.decorator"
import { RATE_LIMITER } from "./rate-limiter.port"

import type { RateLimitConfig, RateLimiter } from "./rate-limiter.port"
import type { CanActivate, ExecutionContext } from "@nestjs/common"
import type { Request } from "express"

/**
 * Guard de rate-limit por IP+rota. Roda antes do argon2 — bloqueio responde 429
 * sem custo de hash. O kernel não registra este guard como APP_GUARD: a ordem
 * relativa ao CSRF importa (origem inválida não pode consumir bucket), e quem
 * conhece essa ordem é o módulo que expõe as rotas.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.getAllAndOverride<
      RateLimitConfig | undefined
    >(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()])
    if (!config) {
      return true
    }

    const req = context.switchToHttp().getRequest<Request>()
    const routeKey =
      (req.route?.path as string | undefined) ?? req.originalUrl.split("?")[0]
    const key = `ip:${req.ip ?? "unknown"}:${routeKey}`

    const { allowed, retryAfterSeconds } = await this.limiter.consume(
      key,
      config.limit,
      config.windowSeconds,
      { critical: config.critical }
    )
    if (!allowed) {
      // Erro de domínio do kernel: o ProblemDetailsFilter lê retryAfterSeconds
      // e emite o Retry-After. HttpException nu não carrega esse contrato.
      throw new TooManyRequestsError(retryAfterSeconds)
    }
    return true
  }
}
