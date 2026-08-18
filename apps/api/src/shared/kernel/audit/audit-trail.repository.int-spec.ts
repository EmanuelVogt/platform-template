import {
  createTestDb,
  createTestPool,
} from "../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../test/setup/test-logger"
import { TransactionManager } from "../transactional/transaction-manager"

import { AuditTrailRepository } from "./audit-trail.repository"

import type { Pool } from "pg"

describe("AuditTrailRepository (int)", () => {
  let pool: Pool
  let db: ReturnType<typeof createTestDb>
  let txm: TransactionManager
  let repo: AuditTrailRepository

  beforeAll(() => {
    pool = createTestPool()
    db = createTestDb(pool)
    txm = new TransactionManager(db, makeTestLogger().loggerFactory)
    repo = new AuditTrailRepository(txm)
  })

  beforeEach(async () => {
    await pool.query("TRUNCATE audit.entries RESTART IDENTITY")
  })

  afterAll(async () => {
    await pool.end()
  })

  async function seed(
    occurredAt: Date,
    table: string,
    entityId: string
  ): Promise<void> {
    await pool.query(
      `INSERT INTO audit.entries
        (occurred_at, schema_name, table_name, entity_id, op, changed_keys, origin, tx_id)
       VALUES ($1, 'x', $2, $3, 'insert', '{}', 'unknown', 1)`,
      [occurredAt, table, entityId]
    )
  }

  async function entityIds(): Promise<string[]> {
    const { rows } = await pool.query<{ entity_id: string }>(
      "SELECT entity_id FROM audit.entries ORDER BY entity_id"
    )
    return rows.map((r) => r.entity_id)
  }

  it("deleteOlderThan purga o vencido e mantém o recente (escape hatch em tx)", async () => {
    await seed(new Date("2020-01-01T00:00:00Z"), "supplies", "old")
    await seed(new Date(), "supplies", "recent")

    const removed = await txm.run(() =>
      repo.deleteOlderThan(new Date("2024-01-01T00:00:00Z"))
    )

    expect(removed).toBe(1)
    expect(await entityIds()).toEqual(["recent"])
  })

  it("deleteOlderThan exige tx aberta (GUC é transaction-scoped)", async () => {
    await expect(repo.deleteOlderThan(new Date())).rejects.toThrow(
      /transação aberta/
    )
  })

  it("purgeEntities apaga só a trilha do titular informado (por table+entity_id)", async () => {
    await seed(new Date(), "guests", "g1")
    await seed(new Date(), "guests", "g2")
    await seed(new Date(), "guest_contacts", "c1")

    const removed = await txm.run(() =>
      repo.purgeEntities([{ table: "guests", entityId: "g1" }])
    )

    expect(removed).toBe(1)
    expect(await entityIds()).toEqual(["c1", "g2"])
  })

  it("purgeEntities sem refs é no-op e não exige tx", async () => {
    expect(await repo.purgeEntities([])).toBe(0)
  })

  it("purgeEntities exige tx aberta quando há refs", async () => {
    await expect(
      repo.purgeEntities([{ table: "guests", entityId: "g1" }])
    ).rejects.toThrow(/transação aberta/)
  })
})
