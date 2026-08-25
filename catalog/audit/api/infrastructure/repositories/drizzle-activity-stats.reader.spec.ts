import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { DrizzleActivityStatsReader } from "./drizzle-activity-stats.reader"

import { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"

import type { SQL } from "drizzle-orm"

function readerCapturingBucket(captured: { bucket?: SQL }) {
  const chain = {
    from: () => chain,
    where: () => chain,
    groupBy: () => Promise.resolve([]),
  }
  // TransactionManager tem campos privados: nenhum objeto literal satisfaz o
  // tipo por estrutura, só uma instância real do prototype (UNT-01 bane o
  // cast de força-bruta que contornaria essa checagem).
  const tx = Object.create(TransactionManager.prototype)
  tx.getExecutor = () => ({
    select: (fields: Record<string, unknown>) => {
      captured.bucket = fields.bucket as SQL
      return chain
    },
  })
  return new DrizzleActivityStatsReader(tx)
}

describe("DrizzleActivityStatsReader", () => {
  it("agrupa pelo fuso de APP_TIMEZONE, como literal e não como bind (TZ-01)", async () => {
    const captured: { bucket?: SQL } = {}

    await readerCapturingBucket(captured).countByTableAndBucket({
      unit: "day",
      from: new Date("2026-08-01T00:00:00Z"),
      to: new Date("2026-08-31T00:00:00Z"),
    })

    const query = new PgDialect().sqlToQuery(captured.bucket as SQL)
    expect(query.sql).toContain("AT TIME ZONE 'UTC'")
    expect(query.params).toEqual([])
  })
})
