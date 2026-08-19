import { execSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

type FileCoverage = {
  b?: Record<string, number[]>
}

const DEFAULT_IGNORE = [
  "/node_modules/",
  "\\.int-spec\\.ts$",
  "\\.e2e-spec\\.ts$",
] as const

function branchPercent(coverageFinalPath: string, sourceSuffix: string): number {
  const map = JSON.parse(readFileSync(coverageFinalPath, "utf8")) as Record<
    string,
    FileCoverage
  >
  const entry = Object.entries(map).find(([path]) => path.endsWith(sourceSuffix))
  if (!entry) {
    throw new Error(`coverage entry not found for ${sourceSuffix}`)
  }
  const hits = entry[1].b ?? {}
  const totalBranches = Object.values(hits).reduce((sum, arr) => sum + arr.length, 0)
  if (totalBranches === 0) {
    throw new Error(`no branches recorded for ${sourceSuffix}`)
  }
  const coveredBranches = Object.values(hits).reduce(
    (sum, arr) => sum + arr.filter((hit) => hit > 0).length,
    0,
  )
  return (coveredBranches / totalBranches) * 100
}

function runFixtureCoverage(args: {
  collectFrom: string
  testPattern: string
  allowIgnoredSpec?: boolean
}): number {
  const outDir = mkdtempSync(join(tmpdir(), "cov-metric-"))
  const apiRoot = join(__dirname, "../../../..")
  const ignoreFlags = (args.allowIgnoredSpec ? DEFAULT_IGNORE : DEFAULT_IGNORE)
    .flatMap((pattern) => [`--testPathIgnorePatterns=${pattern}`])
  execSync(
    [
      "pnpm",
      "exec",
      "jest",
      "--coverage",
      `--coverageDirectory=${outDir}`,
      `--collectCoverageFrom=${args.collectFrom}`,
      `--testPathPattern=${args.testPattern}`,
      ...ignoreFlags,
      "--coverageProvider=v8",
      "--silent",
    ].join(" "),
    { cwd: apiRoot, stdio: "pipe" },
  )
  const suffix = args.collectFrom.replace(/^.*\//, "")
  return branchPercent(join(outDir, "coverage-final.json"), suffix)
}

describe("coverage-metric contract", () => {
  it("optional-chain fixture reports 100% branch (COV-05)", () => {
    const pct = runFixtureCoverage({
      collectFrom: "shared/config/coverage-metric/optional-chain.sample.ts",
      testPattern: "optional-chain.sample.spec",
    })
    expect(pct).toBe(100)
  })

  it("if/else with only true path reports branch below 100% (COV-06)", () => {
    const pct = runFixtureCoverage({
      collectFrom: "shared/config/coverage-metric/if-else.sample.ts",
      testPattern: "if-else.sample.uncovered.spec",
      allowIgnoredSpec: true,
    })
    expect(pct).toBeLessThan(100)
  })
})
