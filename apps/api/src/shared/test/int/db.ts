import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"

import { containerPostgresUri } from "../../../../test/setup/container-uris"
import * as schema from "../../../db/schema"
import { parseEnv } from "../../config/env"
import { ApplicationPool } from "../../infra/database/application-pool"
import { poolConfig } from "../../infra/database/connection-config"

import type { Env } from "../../config/env"
import type { Pool } from "pg"

export function testDatabaseUrl(): string {
  const base = containerPostgresUri()
  if (process.env.TEST_DB_PER_WORKER !== "1") return base
  const url = new URL(base)
  url.pathname = `/test_w${process.env.VITEST_POOL_ID ?? "1"}`
  return url.toString()
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

const truncateStatements = new WeakMap<Pool, Map<string, string>>()

async function knownSchemas(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata
      WHERE schema_name NOT LIKE 'pg\\_%' AND schema_name <> 'information_schema'
      ORDER BY schema_name`
  )
  return rows.map((row) => row.schema_name)
}

async function truncateStatement(
  pool: Pool,
  schemas: readonly string[]
): Promise<string | null> {
  const cacheKey = [...schemas].sort().join(",")
  const perPool = truncateStatements.get(pool) ?? new Map<string, string>()
  const cached = perPool.get(cacheKey)
  if (cached !== undefined) return cached === "" ? null : cached

  const known = await knownSchemas(pool)
  const unknown = schemas.filter((name) => !known.includes(name))
  if (unknown.length > 0) {
    throw new Error(
      `resetDb: schema desconhecido — ${unknown.join(", ")}. Conhecidos: ${known.join(", ")}`
    )
  }
  const { rows } = await pool.query<{ schema: string; table: string }>(
    `SELECT table_schema AS schema, table_name AS table
       FROM information_schema.tables
      WHERE table_schema = ANY($1::text[]) AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name`,
    [[...schemas]]
  )
  const statement =
    rows.length === 0
      ? ""
      : `TRUNCATE TABLE ${rows
          .map((row) => `"${row.schema}"."${row.table}"`)
          .join(", ")} RESTART IDENTITY CASCADE`
  perPool.set(cacheKey, statement)
  truncateStatements.set(pool, perPool)
  return statement === "" ? null : statement
}

/**
 * Zera os schemas listados num único TRUNCATE. Um nome que não existe no banco
 * falha antes de qualquer escrita — um schema escrito errado apagaria nada e o
 * teste passaria sujo.
 */
export async function resetDb(
  pool: Pool,
  schemas: readonly string[]
): Promise<void> {
  if (schemas.length === 0) return
  const statement = await truncateStatement(pool, schemas)
  if (statement === null) return
  await pool.query(statement)
}

export function truncateKernel(pool: Pool): Promise<void> {
  return resetDb(pool, ["_kernel"])
}
