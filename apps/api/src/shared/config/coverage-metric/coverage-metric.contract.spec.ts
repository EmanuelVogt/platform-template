import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

type FileCoverage = {
  b?: Record<string, number[]>
}

type BranchTally = { total: number; uncovered: number }

/**
 * SPEC_DEVIATION: o contrato passa a contar branches, e não mais o % delas.
 * Reason: sob o remapeamento AST-aware do v8 no Vitest 4 o optional chaining
 * não gera NENHUMA branch (`branchMap: {}`) — o percentual vira 0/0, indefinido,
 * enquanto o que COV-05 assevera ("o transpiler não inventa branch descoberta")
 * é exatamente `uncovered === 0`. COV-06 continua exigindo o else contado.
 */
function branchTally(
  coverageFinalPath: string,
  sourceSuffix: string,
): BranchTally {
  const map = JSON.parse(readFileSync(coverageFinalPath, "utf8")) as Record<
    string,
    FileCoverage
  >
  const entry = Object.entries(map).find(([path]) => path.endsWith(sourceSuffix))
  if (!entry) {
    throw new Error(`coverage entry not found for ${sourceSuffix}`)
  }
  const hits = Object.values(entry[1].b ?? {})
  return {
    total: hits.reduce((sum, arr) => sum + arr.length, 0),
    uncovered: hits.reduce(
      (sum, arr) => sum + arr.filter((hit) => hit === 0).length,
      0,
    ),
  }
}

/**
 * Roda o tier unitário só sobre o spec-fixture, com cobertura restrita ao
 * fonte-fixture, e devolve a contagem de branches do provider v8. O
 * `--exclude` sobrescreve o do `vitest.config.mts` (que tira o fixture
 * descoberto do run normal) sem afetar os demais tiers.
 */
function runFixtureCoverage(args: {
  source: string
  spec: string
}): BranchTally {
  const outDir = mkdtempSync(join(tmpdir(), "cov-metric-"))
  const apiRoot = join(__dirname, "../../../..")
  execFileSync(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "--project=api",
      args.spec,
      "--coverage.enabled=true",
      "--coverage.provider=v8",
      "--coverage.reporter=json",
      `--coverage.reportsDirectory=${outDir}`,
      `--coverage.include=${args.source}`,
      "--silent",
    ],
    {
      cwd: apiRoot,
      stdio: "pipe",
      env: { ...process.env, COVERAGE_METRIC_FIXTURE: "1" },
    },
  )
  const suffix = args.source.replace(/^.*\//, "")
  return branchTally(join(outDir, "coverage-final.json"), suffix)
}

describe("coverage-metric contract", () => {
  it("optional-chain não deixa branch descoberta (COV-05)", () => {
    const branches = runFixtureCoverage({
      source: "src/shared/config/coverage-metric/optional-chain.sample.ts",
      spec: "src/shared/config/coverage-metric/optional-chain.sample.spec.ts",
    })
    expect(branches.uncovered).toBe(0)
  })

  it("if/else só com o caminho true deixa branch descoberta (COV-06)", () => {
    const branches = runFixtureCoverage({
      source: "src/shared/config/coverage-metric/if-else.sample.ts",
      spec: "src/shared/config/coverage-metric/if-else.sample.uncovered.spec.ts",
    })
    expect(branches.total).toBeGreaterThan(0)
    expect(branches.uncovered).toBeGreaterThan(0)
  })
})
