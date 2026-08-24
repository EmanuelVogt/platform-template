import assert from "node:assert/strict"
import { test } from "node:test"
import { advisoryIdDate, ageDays, isOverdue } from "../lib/cadence.mjs"

test("advisoryIdDate parses the YYYYMMDD embedded in an advisory id", () => {
  assert.equal(advisoryIdDate("ADV-20260813-01"), "2026-08-13")
  assert.equal(advisoryIdDate("ADV-20260101-99"), "2026-01-01")
})

test("advisoryIdDate returns null for a malformed id, never throws", () => {
  assert.equal(advisoryIdDate("not-an-advisory-id"), null)
  assert.equal(advisoryIdDate("ADV-2026-01"), null)
  assert.equal(advisoryIdDate(undefined), null)
  assert.equal(advisoryIdDate(42), null)
})

test("ageDays counts whole days elapsed since the id date", () => {
  const now = Date.parse("2026-08-23T00:00:00Z")
  assert.equal(ageDays("2026-08-13", now), 10)
  assert.equal(ageDays("2026-08-20", now), 3)
  assert.equal(ageDays("2026-08-23", now), 0)
})

test("isOverdue: security/breaking/bug boundaries — exactly at the cadence is not overdue, one day past is", () => {
  assert.equal(isOverdue("security", 7), false)
  assert.equal(isOverdue("security", 8), true)
  assert.equal(isOverdue("breaking", 30), false)
  assert.equal(isOverdue("breaking", 31), true)
  assert.equal(isOverdue("bug", 30), false)
  assert.equal(isOverdue("bug", 31), true)
})

test("isOverdue: an unknown kind is never overdue", () => {
  assert.equal(isOverdue("unknown", 999), false)
})
