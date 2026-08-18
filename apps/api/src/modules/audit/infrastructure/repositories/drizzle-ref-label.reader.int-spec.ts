import { ulid } from "ulid"

import {
  createTestDb,
  createTestPool,
  truncateTag,
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
    await truncateTag(pool)
    await pool.query("TRUNCATE audit.entries RESTART IDENTITY")
  })

  afterAll(async () => {
    await pool.end()
  })

  it("resolve id→label e ignora ids inexistentes", async () => {
    const id = ulid()
    await pool.query(
      `INSERT INTO tag.tags (id, name, created_at, updated_at)
       VALUES ($1, 'Óleo essencial', now(), now())`,
      [id]
    )
    const labels = await reader.findLabels(
      { schema: "tag", table: "tags", labelColumn: "name" },
      [id, "id-que-nao-existe"]
    )
    expect(labels.get(id)).toBe("Óleo essencial")
    expect(labels.size).toBe(1)
  })

  it("lista vazia de ids não vai ao banco", async () => {
    const labels = await reader.findLabels(
      { schema: "tag", table: "tags", labelColumn: "name" },
      []
    )
    expect(labels.size).toBe(0)
  })
})
