export interface RateLimitResult {
  allowed: boolean;
  /** Segundos até liberar (0 quando allowed). */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

export const RATE_LIMITER: unique symbol = Symbol('RateLimiter');
