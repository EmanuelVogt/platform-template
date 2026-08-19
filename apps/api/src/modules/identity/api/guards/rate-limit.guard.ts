import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common"
import { Reflector } from "@nestjs/core"

import { RATE_LIMITER } from "../../domain/ports/rate-limiter"

import type { RateLimiter } from "../../domain/ports/rate-limiter"
import type { CanActivate, ExecutionContext } from "@nestjs/common"
import type { Request } from "express"

/** Configuração de rate-limit por rota (limite por janela). */
export interface RateLimitConfig {
  limit: number
  windowSeconds: number
}

/** Chave de metadata com a config de rate-limit da rota. */
export const RATE_LIMIT_KEY = "identity:rateLimit"

/** Aplica rate-limit por IP+rota à rota anotada (limites da spec §8). */
export const RateLimit = (config: RateLimitConfig) =>
  SetMetadata(RATE_LIMIT_KEY, config)

/**
 * Guard de rate-limit por IP+rota. Roda antes do argon2 — bloqueio responde 429
 * sem custo de hash. Eixo por email-alvo fica no use-case.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.getAllAndOverride<RateLimitConfig | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (!config) {
      return true
    }

    const req = context.switchToHttp().getRequest<Request>()
    const routeKey =
      (req.route?.path as string | undefined) ??
      req.originalUrl.split("?")[0]
    const key = `ip:${req.ip ?? "unknown"}:${routeKey}`

    const { allowed, retryAfterSeconds } = await this.limiter.consume(
      key,
      config.limit,
      config.windowSeconds,
    )
    if (!allowed) {
      // ProblemDetailsFilter lê retryAfter do response da exceção e emite Retry-After (kernel).
      throw new HttpException(
        { message: "Muitas requisições.", retryAfter: retryAfterSeconds },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    return true
  }
}
