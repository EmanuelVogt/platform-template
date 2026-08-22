import { describe, expect, it } from "vitest"

import { isUnchanged } from "./entity-props"

describe("isUnchanged", () => {
  const base = {
    id: "1",
    name: "A",
    count: 2,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  }
  const later = new Date("2026-06-01T00:00:00Z")

  it("true quando só updatedAt difere", () => {
    expect(isUnchanged(base, { ...base, updatedAt: later })).toBe(true)
  })

  it("false quando um campo de negócio muda", () => {
    expect(isUnchanged(base, { ...base, name: "B", updatedAt: later })).toBe(false)
  })

  it("Date comparada por valor (getTime), não identidade", () => {
    const clone = new Date("2026-01-01T00:00:00Z")
    expect(isUnchanged(base, { ...base, createdAt: clone, updatedAt: later })).toBe(
      true
    )
  })

  it("array reconstruído conta como mudança (identidade)", () => {
    const withArr = { ...base, tags: ["x"] }
    expect(
      isUnchanged(withArr, { ...withArr, tags: ["x"], updatedAt: later })
    ).toBe(false)
  })

  it("null preservado é igual", () => {
    const withNull = { ...base, note: null as string | null }
    expect(isUnchanged(withNull, { ...withNull, updatedAt: later })).toBe(true)
  })
})
