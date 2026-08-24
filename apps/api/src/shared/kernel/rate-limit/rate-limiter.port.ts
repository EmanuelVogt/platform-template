/** Opções por chamada. `critical` decide a política quando o backend falha. */
export interface RateLimitOptions {
  /** true → a chave é enforçada mesmo com o backend fora (fallback local). */
  critical?: boolean
}

export interface RateLimitResult {
  allowed: boolean
  /** Segundos até liberar (0 quando allowed). */
  retryAfterSeconds: number
}

/**
 * Porta de rate-limit do kernel. Chaves são strings opacas — quem chama decide
 * o eixo (ip, conta, rota). Fica no kernel porque guard, login e upload
 * compartilham o mesmo seam; nenhum módulo de domínio é dono dele.
 */
export interface RateLimiter {
  consume(
    key: string,
    limit: number,
    windowSeconds: number,
    opts?: RateLimitOptions
  ): Promise<RateLimitResult>
  reset(key: string): Promise<void>
}

/** Metadata de `@RateLimit` — a config da rota é a opção + o par limite/janela. */
export interface RateLimitConfig extends RateLimitOptions {
  limit: number
  windowSeconds: number
}

export const RATE_LIMITER: unique symbol = Symbol("RateLimiter")
