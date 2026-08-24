import { SetMetadata } from "@nestjs/common"

import type { RateLimitConfig } from "./rate-limiter.port"

/** Chave de metadata com a config de rate-limit da rota. */
export const RATE_LIMIT_KEY = "kernel:rateLimit"

/**
 * Aplica rate-limit por IP+rota à rota anotada. `critical: true` mantém a rota
 * enforçada mesmo com o Redis fora (janela local); sem ele a rota libera na
 * queda. O eixo por alvo (conta, dono) fica no use-case, não aqui.
 */
export const RateLimit = (config: RateLimitConfig) =>
  SetMetadata(RATE_LIMIT_KEY, config)
