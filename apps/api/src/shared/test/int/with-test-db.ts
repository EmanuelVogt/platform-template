import { afterAll, beforeAll, beforeEach } from "vitest"

import { TransactionManager } from "../../kernel/transactional/transaction-manager"

import { createTestDb, createTestPool, resetDb } from "./db"
import { makeTestLogger } from "./logger"

import type { TestDb } from "./db"
import type { ApplicationPool } from "../../infra/database/application-pool"
import type { LoggerFactory } from "../../kernel/logging/logger.factory"

export type TestDbHandle = {
  readonly pool: ApplicationPool
  readonly db: TestDb
  readonly txm: TransactionManager
  readonly logger: LoggerFactory
}

type Opened = {
  pool: ApplicationPool
  db: TestDb
  txm: TransactionManager
  logger: LoggerFactory
}

/**
 * Banco de uma suíte de integração: abre o pool no `beforeAll`, zera os schemas
 * pedidos a cada `beforeEach` e fecha no `afterAll`. Os campos só existem
 * depois do `beforeAll` — ler qualquer um no corpo do `describe` lança em vez de
 * devolver `undefined`.
 */
export function withTestDb(opts: { schemas: readonly string[] }): TestDbHandle {
  let opened: Opened | null = null

  const require = (): Opened => {
    if (opened === null) {
      throw new Error(
        "withTestDb: o banco só existe dentro de beforeEach/it — leia o handle lá, não no corpo do describe"
      )
    }
    return opened
  }

  beforeAll(() => {
    const pool = createTestPool()
    const db = createTestDb(pool)
    const logger = makeTestLogger().loggerFactory
    opened = { pool, db, txm: new TransactionManager(db, logger), logger }
  })

  beforeEach(async () => {
    await resetDb(require().pool, opts.schemas)
  })

  afterAll(async () => {
    if (opened !== null) await opened.pool.end()
    opened = null
  })

  return {
    get pool() {
      return require().pool
    },
    get db() {
      return require().db
    },
    get txm() {
      return require().txm
    },
    get logger() {
      return require().logger
    },
  }
}
