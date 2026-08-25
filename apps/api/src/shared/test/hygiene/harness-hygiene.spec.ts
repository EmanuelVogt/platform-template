import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

import {
  canonicalKey,
  collectScanFiles,
  compareToBaseline,
  entriesOf,
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
    const key = canonicalKey(violation.file)
    const rules = baseline[key] ?? {}
    rules[violation.rule] = (rules[violation.rule] ?? 0) + 1
    baseline[key] = rules
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
  })

  it("a varredura alcança o barrel de toda entrada presente, no layout que esta árvore tiver", () => {
    const keys = files.map(canonicalKey)
    // No template as entradas moram em `catalog/<entrada>/api/`; num filho, em
    // `apps/api/src/modules/<entrada>/`. Um filho kernel-only não tem entrada
    // alguma e o laço é vazio de propósito — os dois layouts estão cobertos
    // contra fixtures em `scan.spec.ts`.
    for (const entry of entriesOf(files)) {
      expect(keys).toContain(`module:${entry}/testing/index.ts`)
    }
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
      "no-sleep-as-proof",
      "runner-setup-allowlist",
    ])
  })

  it("HRN-01 — um único bootstrap do Nest em toda a árvore", () => {
    const { unrecorded, stale } = compareToBaseline(
      "single-testing-module",
      violations,
      loadBaseline(),
      files
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("HRN-06 — nenhuma redefinição local de helper do harness", () => {
    const { unrecorded, stale } = compareToBaseline(
      "no-local-helper",
      violations,
      loadBaseline(),
      files
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("HRN-06 — byte do PNG, origem web e senha literal só no harness e nos barrels", () => {
    const { unrecorded, stale } = compareToBaseline(
      "no-harness-literal",
      violations,
      loadBaseline(),
      files
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("HRN-05 — o pool é do harness, nunca aberto dentro de um caso", () => {
    const { unrecorded, stale } = compareToBaseline(
      "pool-owned-by-harness",
      violations,
      loadBaseline(),
      files
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("UNT-01 — as dependências de um spec são tipadas", () => {
    const { unrecorded, stale } = compareToBaseline(
      "typed-deps",
      violations,
      loadBaseline(),
      files
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("UNT-01 — as never e as unknown as só sob shared/test/**", () => {
    const { unrecorded, stale } = compareToBaseline(
      "no-unsafe-cast",
      violations,
      loadBaseline(),
      files
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("UNT-03 — nenhum fromProps( num spec fora do barrel", () => {
    const { unrecorded, stale } = compareToBaseline(
      "no-from-props",
      violations,
      loadBaseline(),
      files
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("HRN-02 — nenhum GenericContainer num int-spec", () => {
    const { unrecorded, stale } = compareToBaseline(
      "no-container-in-int-spec",
      violations,
      loadBaseline(),
      files
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("HRN-03 — nenhum setTimeout ou laço à mão como prova de efeito", () => {
    const { unrecorded, stale } = compareToBaseline(
      "no-sleep-as-proof",
      violations,
      loadBaseline(),
      files
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("ENT-05 — test/setup/ tem só o plumbing do runner", () => {
    const { unrecorded, stale } = compareToBaseline(
      "runner-setup-allowlist",
      violations,
      loadBaseline(),
      files
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })
})
