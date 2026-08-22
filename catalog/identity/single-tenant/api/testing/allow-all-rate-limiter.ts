import type { RateLimiter } from "../../../shared/kernel/rate-limit/rate-limiter.port"

/** Limiter que nunca bloqueia — para e2e que só precisam de sessão, não de limite. */
export const allowAllRateLimiter: RateLimiter = {
  consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
  reset: () => Promise.resolve(),
}
