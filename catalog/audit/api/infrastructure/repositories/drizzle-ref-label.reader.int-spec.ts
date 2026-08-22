import { ulid } from "ulid"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  createTestPool,
  truncateIdentity,
} from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"

import { DrizzleRefLabelReader } from "./drizzle-ref-label.reader"

import type { Pool } from "pg"

describe("DrizzleRefLabelReader (int)", () => {
  let pool: Pool
  let reader: DrizzleRefLabelReader

  beforeAll(() => {
    pool = createTestPool()
    const db = createTestDb(pool)
    reader = new DrizzleRefLabelReader(
      new TransactionManager(db, makeTestLogger().loggerFactory)
    )
  })

  beforeEach(async () => {
    await truncateIdentity(pool)
    await pool.query("TRUNCATE audit.entries RESTART IDENTITY")
  })

  afterAll(async () => {
    await pool.end()
  })

  // SPEC_DEVIATION: veículo trocado de tag.tags para identity.permission_templates.
  // Reason: audit não depende de tag (siblings sob identity) — um
  // `catalog:check audit` standalone nunca tem o schema "tag". O reader é
  // genérico ({schema, table, labelColumn}); qualquer tabela com coluna de
  // texto serve de prova.
  it("resolve id→label e ignora ids inexistentes", async () => {
    const id = ulid()
    await pool.query(
      `INSERT INTO identity.permission_templates (id, name, created_at, updated_at)
       VALUES ($1, 'Óleo essencial', now(), now())`,
      [id]
    )
    const labels = await reader.findLabels(
      { schema: "identity", table: "permission_templates", labelColumn: "name" },
      [id, "id-que-nao-existe"]
    )
    expect(labels.get(id)).toBe("Óleo essencial")
    expect(labels.size).toBe(1)
  })

  it("lista vazia de ids não vai ao banco", async () => {
    const labels = await reader.findLabels(
      { schema: "identity", table: "permission_templates", labelColumn: "name" },
      []
    )
    expect(labels.size).toBe(0)
  })
})
