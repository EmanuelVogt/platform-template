import { env, type Env } from "../../config/env"

import type { ClientConfig, PoolConfig } from "pg"

const APPLICATION_NAME = "api"

/** Derivação única de `env()`: pool e clients dedicados não podem divergir. */
export function baseConnectionConfig(config: Env = env()): ClientConfig {
  return {
    connectionString: config.DATABASE_URL,
    statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: config.DATABASE_IDLE_IN_TX_TIMEOUT_MS,
    application_name: APPLICATION_NAME,
    ssl:
      config.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : false,
  }
}

export function poolConfig(config: Env = env()): PoolConfig {
  return {
    ...baseConnectionConfig(config),
    max: config.DATABASE_POOL_MAX,
    connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT_MS,
  }
}

export function dedicatedApplicationName(purpose: string): string {
  return `${APPLICATION_NAME}:${purpose}`
}

export function dedicatedConfig(
  purpose: string,
  config: Env = env()
): ClientConfig {
  return {
    ...baseConnectionConfig(config),
    application_name: dedicatedApplicationName(purpose),
  }
}
