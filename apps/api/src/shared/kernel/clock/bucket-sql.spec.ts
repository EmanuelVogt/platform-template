import { pgTable, timestamp } from "drizzle-orm/pg-core"

import { bucketOf } from "./bucket-sql"
import { describe, expect, it } from "vitest"

const t = pgTable("sample", { at: timestamp("at") })

describe("bucketOf", () => {
  it("retorna fragmento SQL para bucket diário e semanal", () => {
    const day = bucketOf(t.at, "day")
    const week = bucketOf(t.at, "week")
    expect(day).toBeDefined()
    expect(week).toBeDefined()
    expect(day).not.toEqual(week)
  })
})
