import {
  drizzle,
  type NodePgDatabase,
  type NodePgQueryResultHKT,
} from "drizzle-orm/node-postgres"

import { env } from "../../config/env"

import { ApplicationPool } from "./application-pool"
import { poolConfig } from "./connection-config"

import type { AppLogger } from "../../kernel/logging/logger.factory"
import type { ExtractTablesWithRelations } from "drizzle-orm"
import type { PgDatabase } from "drizzle-orm/pg-core"
import type { Pool } from "pg"

export const DRIZZLE = Symbol("DRIZZLE")
export const PG_POOL = Symbol("PG_POOL")

/**
 * Forma do agregado de tabelas, não o conteúdo: o kernel recebe o schema do app
 * por `DatabaseModule.forRoot` e nunca importa o agregador (RULE A).
 */
export type DrizzleSchema = Record<string, unknown>
export type DrizzleDb = NodePgDatabase<DrizzleSchema>

/** Executor de transação Drizzle, derivado da assinatura de `db.transaction`. */
export type DrizzleTx = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0]

/**
 * Raiz ou transação — o que o repositório recebe do TransactionManager. Tipado
 * como a base `PgDatabase` que a conexão raiz e a tx satisfazem; evita o erro
 * de "assinaturas incompatíveis em union" ao chamar `.insert`/`.select`.
 */
export type DrizzleExecutor = PgDatabase<
  NodePgQueryResultHKT,
  DrizzleSchema,
  ExtractTablesWithRelations<DrizzleSchema>
>

export function createPool(logger?: AppLogger): ApplicationPool {
  const config = env()
  return new ApplicationPool(poolConfig(config), {
    maxWaiting: config.DATABASE_POOL_MAX_WAITING,
    acquireWarnMs: config.DATABASE_POOL_ACQUIRE_WARN_MS,
    logger,
  })
}

export function createDrizzle(pool: Pool, schema: DrizzleSchema): DrizzleDb {
  return drizzle(pool, { schema })
}
