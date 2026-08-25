import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

import {
  collectScanFiles,
  compareToBaseline,
  HYGIENE_RULES,
  scanFiles,
  type Baseline,
  type Violation,
} from "./scan"

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..", "..", "..")
const SCAN_ROOTS = ["apps/api/src", "apps/api/test", "catalog"]
const BASELINE_PATH = resolve(__dirname, "harness-hygiene-baseline.json")

const files = collectScanFiles(REPO_ROOT, SCAN_ROOTS)
const violations: Violation[] = scanFiles(REPO_ROOT, files)

function currentBaseline(): Baseline {
  const baseline: Baseline = {}
  for (const violation of violations) {
    const rules = baseline[violation.file] ?? {}
    rules[violation.rule] = (rules[violation.rule] ?? 0) + 1
    baseline[violation.file] = rules
  }
  return Object.fromEntries(
    Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b))
  )
}

function loadBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline
}

describe("harness-hygiene — os bans de duplicação sobre a árvore", () => {
  beforeAll(() => {
    if (process.env.HYGIENE_BASELINE === "write") {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify(currentBaseline(), null, 2)}\n`
      )
    }
  })

  it("a varredura enxerga a árvore e ignora o stage do catálogo", () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.filter((file) => file.includes(".catalog-stage"))).toEqual([])
    expect(files).toContain("apps/api/src/shared/test/e2e/app.ts")
    expect(files).toContain("catalog/attachment/api/testing/index.ts")
  })

  it("todo ban do scanner tem um it neste arquivo", () => {
    const covered = HYGIENE_RULES.map((rule) => rule.id)
    expect(covered).toEqual([
      "single-testing-module",
      "no-local-helper",
      "no-harness-literal",
      "pool-owned-by-harness",
      "typed-deps",
      "no-unsafe-cast",
      "no-from-props",
      "no-container-in-int-spec",
      "runner-setup-allowlist",
    ])
  })

  it("HRN-01 — um único bootstrap do Nest em toda a árvore", () => {
    const { unrecorded, stale } = compareToBaseline(
      "single-testing-module",
      violations,
      loadBaseline()
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("HRN-06 — nenhuma redefinição local de helper do harness", () => {
    const { unrecorded, stale } = compareToBaseline(
      "no-local-helper",
      violations,
      loadBaseline()
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("HRN-06 — byte do PNG, origem web e senha literal só no harness e nos barrels", () => {
    const { unrecorded, stale } = compareToBaseline(
      "no-harness-literal",
      violations,
      loadBaseline()
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("HRN-05 — o pool é do harness, nunca aberto dentro de um caso", () => {
    const { unrecorded, stale } = compareToBaseline(
      "pool-owned-by-harness",
      violations,
      loadBaseline()
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("UNT-01 — as dependências de um spec são tipadas", () => {
    const { unrecorded, stale } = compareToBaseline(
      "typed-deps",
      violations,
      loadBaseline()
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("UNT-01 — as never e as unknown as só sob shared/test/**", () => {
    const { unrecorded, stale } = compareToBaseline(
      "no-unsafe-cast",
      violations,
      loadBaseline()
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("UNT-03 — nenhum fromProps( num spec fora do barrel", () => {
    const { unrecorded, stale } = compareToBaseline(
      "no-from-props",
      violations,
      loadBaseline()
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("HRN-02 — nenhum GenericContainer num int-spec", () => {
    const { unrecorded, stale } = compareToBaseline(
      "no-container-in-int-spec",
      violations,
      loadBaseline()
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("ENT-05 — test/setup/ tem só o plumbing do runner", () => {
    const { unrecorded, stale } = compareToBaseline(
      "runner-setup-allowlist",
      violations,
      loadBaseline()
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })
})
