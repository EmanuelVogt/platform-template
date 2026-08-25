import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { DrizzleUsageStatsReader } from "./drizzle-usage-stats.reader"

import type { TransactionManager } from "../../../../shared/kernel/transactional/transaction-manager"
import type { SQL } from "drizzle-orm"

function readerCapturingBucket(captured: { bucket?: SQL }) {
  const chain = {
    from: () => chain,
    where: () => chain,
    groupBy: () => Promise.resolve([]),
  }
  const tx = {
    getExecutor: () => ({
      select: (fields: Record<string, unknown>) => {
        captured.bucket = fields.bucket as SQL
        return chain
      },
    }),
  } as unknown as TransactionManager
  return new DrizzleUsageStatsReader(tx)
}

describe("DrizzleUsageStatsReader", () => {
  it("agrupa pelo fuso de APP_TIMEZONE, como literal e não como bind (TZ-01)", async () => {
    const captured: { bucket?: SQL } = {}

    await readerCapturingBucket(captured).countLoginsByBucket({
      unit: "week",
      from: new Date("2026-08-01T00:00:00Z"),
      to: new Date("2026-08-31T00:00:00Z"),
    })

    const query = new PgDialect().sqlToQuery(captured.bucket as SQL)
    expect(query.sql).toContain("AT TIME ZONE 'UTC'")
    expect(query.params).toEqual([])
  })
})
