import type { RateLimiter } from "../domain/ports/rate-limiter"

/** Limiter que nunca bloqueia — para e2e que só precisam de sessão, não de limite. */
export const allowAllRateLimiter: RateLimiter = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
}
