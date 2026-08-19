import { createTestDb, createTestPool } from "../../../../../test/setup/test-db"
import { makeTestLogger } from "../../../../../test/setup/test-logger"
import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"

import { DrizzleActivityStatsReader } from "./drizzle-activity-stats.reader"

import type { Pool } from "pg"

function saoPaulo(local: string): Date {
  return new Date(`${local}-03:00`)
}

describe("DrizzleActivityStatsReader (int)", () => {
  let pool: Pool
  let reader: DrizzleActivityStatsReader

  const window = {
    from: saoPaulo("2026-03-01T00:00:00"),
    to: saoPaulo("2026-03-11T00:00:00"),
    unit: "day" as const,
  }

  async function seed(entry: {
    at: string
    table: string
    origin?: string
    actorUserId?: string | null
  }): Promise<void> {
    await pool.query(
      `INSERT INTO audit.entries
        (occurred_at, schema_name, table_name, entity_id, op, changed_keys, actor_user_id, origin, tx_id)
       VALUES ($1, 'x', $2, 'e1', 'update', '{}', $3, $4, 1)`,
      [
        entry.at,
        entry.table,
        entry.actorUserId === undefined ? "user-1" : entry.actorUserId,
        entry.origin ?? "http",
      ]
    )
  }

  beforeAll(() => {
    pool = createTestPool()
    reader = new DrizzleActivityStatsReader(
      new TransactionManager(createTestDb(pool), makeTestLogger().loggerFactory)
    )
  })

  beforeEach(async () => {
    await pool.query("TRUNCATE audit.entries RESTART IDENTITY")
  })

  afterAll(async () => {
    await pool.end()
  })

  it("soma as alterações por tabela e por dia", async () => {
    await seed({ at: "2026-03-05T09:00:00-03:00", table: "reservations" })
    await seed({ at: "2026-03-05T14:00:00-03:00", table: "reservations" })
    await seed({ at: "2026-03-06T09:00:00-03:00", table: "reservations" })
    await seed({ at: "2026-03-05T09:00:00-03:00", table: "guests" })

    const rows = await reader.countByTableAndBucket(window)

    expect(rows).toEqual(
      expect.arrayContaining([
        {
          tableName: "reservations",
          bucket: saoPaulo("2026-03-05T00:00:00"),
          count: 2,
        },
        {
          tableName: "reservations",
          bucket: saoPaulo("2026-03-06T00:00:00"),
          count: 1,
        },
        {
          tableName: "guests",
          bucket: saoPaulo("2026-03-05T00:00:00"),
          count: 1,
        },
      ])
    )
    expect(rows).toHaveLength(3)
  })

  it("alteração de rotina automática fica de fora da conta", async () => {
    await seed({ at: "2026-03-05T09:00:00-03:00", table: "reservations" })
    await seed({
      at: "2026-03-05T03:00:00-03:00",
      table: "reservations",
      origin: "job",
    })
    await seed({
      at: "2026-03-05T04:00:00-03:00",
      table: "reservations",
      origin: "legacy-sync",
    })

    const rows = await reader.countByTableAndBucket(window)

    expect(rows).toEqual([
      {
        tableName: "reservations",
        bucket: saoPaulo("2026-03-05T00:00:00"),
        count: 1,
      },
    ])
  })

  it("alteração sem ator identificado fica de fora da conta", async () => {
    await seed({
      at: "2026-03-05T09:00:00-03:00",
      table: "reservations",
      actorUserId: null,
    })

    expect(await reader.countByTableAndBucket(window)).toEqual([])
  })

  it("alteração às 23h fica no dia local, não no dia seguinte", async () => {
    await seed({ at: "2026-03-05T23:30:00-03:00", table: "reservations" })

    const rows = await reader.countByTableAndBucket(window)

    expect(rows).toEqual([
      {
        tableName: "reservations",
        bucket: saoPaulo("2026-03-05T00:00:00"),
        count: 1,
      },
    ])
  })

  it("agrega por semana quando a unidade é semana", async () => {
    await seed({ at: "2026-03-03T09:00:00-03:00", table: "reservations" })
    await seed({ at: "2026-03-08T09:00:00-03:00", table: "reservations" })

    const rows = await reader.countByTableAndBucket({ ...window, unit: "week" })

    expect(rows).toEqual([
      {
        tableName: "reservations",
        bucket: saoPaulo("2026-03-02T00:00:00"),
        count: 2,
      },
    ])
  })

  it("ignora alteração fora da janela pedida", async () => {
    await seed({ at: "2026-02-27T09:00:00-03:00", table: "reservations" })
    await seed({ at: "2026-03-11T09:00:00-03:00", table: "reservations" })

    expect(await reader.countByTableAndBucket(window)).toEqual([])
  })

  it("período sem nenhuma alteração devolve lista vazia", async () => {
    expect(await reader.countByTableAndBucket(window)).toEqual([])
  })
})
