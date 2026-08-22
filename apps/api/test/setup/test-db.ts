import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import Redis from "ioredis"

import * as schema from "../../src/db/schema"
import { parseEnv } from "../../src/shared/config/env"
import { ApplicationPool } from "../../src/shared/infra/database/application-pool"
import { poolConfig } from "../../src/shared/infra/database/connection-config"

import { containerPostgresUri, containerRedisUri } from "./container-uris"

import type { Env } from "../../src/shared/config/env"
import type { Pool } from "pg"

export function testDatabaseUrl(): string {
  const base = containerPostgresUri()
  if (process.env.TEST_DB_PER_WORKER !== "1") return base
  const url = new URL(base)
  url.pathname = `/test_w${process.env.VITEST_POOL_ID ?? "1"}`
  return url.toString()
}

export function testRedisUrl(): string {
  return containerRedisUri()
}

/**
 * Zera o Redis efêmero entre testes. Abre uma conexão própria, faz FLUSHALL e
 * encerra — usar no `beforeEach` das suítes que dependem de estado de rate-limit
 * para o contador não vazar entre testes do mesmo run.
 */
export async function flushRedis(): Promise<void> {
  const redis = new Redis(testRedisUrl(), { maxRetriesPerRequest: 1 })
  try {
    await redis.flushall()
  } finally {
    await redis.quit()
  }
}

/**
 * E-mail de seed isolado por suíte. Dois e2e que reusam o mesmo e-mail num
 * Postgres compartilhado colidem se uma suíte não truncar antes da outra;
 * o namespace por suíte remove a dependência de ordem.
 */
export function seedEmail(suite: string, local: string): string {
  return `${suite}.${local}@test.local`
}

/**
 * `env()` é memoizado e exige WEB_ORIGIN/REDIS_URL, que o processo de teste de
 * integração nunca define — por isso valida uma cópia local com `parseEnv`,
 * suprindo os 3 campos obrigatórios sem tocar no cache global.
 */
function testConnectionEnv(): Env {
  return parseEnv({
    ...process.env,
    DATABASE_URL: testDatabaseUrl(),
    WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  })
}

export function createTestPool(overrides?: { max?: number }): ApplicationPool {
  const config = testConnectionEnv()
  return new ApplicationPool(
    { ...poolConfig(config), ...overrides },
    {
      maxWaiting: config.DATABASE_POOL_MAX_WAITING,
      acquireWarnMs: config.DATABASE_POOL_ACQUIRE_WARN_MS,
    }
  )
}

/**
 * Tipado com o schema concreto, e não com o `DrizzleDb` agnóstico do kernel:
 * int-spec usa a API relacional (`db.query.<tabela>`), que só existe quando o
 * tipo do schema é conhecido.
 */
export type TestDb = NodePgDatabase<typeof schema>

export function createTestDb(pool: Pool): TestDb {
  return drizzle(pool, { schema })
}

/** Zera o schema do kernel entre testes (isolamento). */
export async function truncateKernel(pool: Pool): Promise<void> {
  await pool.query(
    "TRUNCATE _kernel.outbox, _kernel.outbox_dead, _kernel.processed_events, _kernel.idempotency_keys"
  )
}

/**
 * Limpa todas as tabelas do schema identity entre testes de integração.
 * `auth_events` é append-only (REVOKE DELETE/TRUNCATE) — o TRUNCATE de tabela
 * inteira não dispara o trigger FOR EACH ROW de UPDATE/DELETE, e roda como o
 * superuser do container de teste (que retém TRUNCATE). CASCADE cobre as FKs.
 */
export async function truncateIdentity(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      identity.auth_events,
      identity.verification_tokens,
      identity.permission_templates,
      identity.sessions,
      identity.professional_default_hours,
      identity.users
    RESTART IDENTITY CASCADE
  `)
}

/** Limpa as tabelas do schema attachment entre testes de integração. */
export async function truncateAttachment(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      attachment.attachment_access_logs,
      attachment.attachment_acls,
      attachment.attachments
    RESTART IDENTITY CASCADE
  `)
}

/** Limpa a central de tags entre testes (vínculos saem no truncate de cada consumidor). */
export async function truncateTag(pool: Pool): Promise<void> {
  await pool.query("TRUNCATE TABLE tag.tags RESTART IDENTITY CASCADE")
}
