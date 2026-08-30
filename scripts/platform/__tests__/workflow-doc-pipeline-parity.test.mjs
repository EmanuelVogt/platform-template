import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

// TOOL-09 — "WHEN dev-workflow or deploy.md.jinja describes the pre-push gate
// or the CI jobs THEN it SHALL match the real pipeline and name no Jest
// construct." Cross-checks .agents/skills/dev-workflow/SKILL.md's prose against the real
// lefthook.yml pre-push chain and .github/workflows/ci.yml job keys.

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

test("dev-workflow names no Jest construct (testRegex) for the api test include", () => {
  const workflow = read(".agents/skills/dev-workflow/SKILL.md")
  assert.doesNotMatch(
    workflow,
    /testRegex/,
    "testRegex is a Jest construct; the runner is Vitest"
  )
  const match = workflow.match(
    /`include` in\s*\n?\s*`apps\/api\/vitest\.config\.mts:(\d+)`/
  )
  assert.ok(
    match,
    "dev-workflow must cite the line of vitest.config.mts's include array"
  )
  const cited = read("apps/api/vitest.config.mts").split("\n")[
    Number(match[1]) - 1
  ]
  assert.match(
    cited,
    /include:/,
    `vitest.config.mts:${match[1]} must be the include array line`
  )
})

test("dev-workflow's pre-push chain matches lefthook.yml's real command order", () => {
  const commandsBlock = read("lefthook.yml").slice(
    read("lefthook.yml").indexOf("commands:")
  )
  const commandKeys = [...commandsBlock.matchAll(/^\s{4}([a-z-]+):\s*$/gm)].map(
    (m) => m[1]
  )
  assert.deepEqual(commandKeys, ["migrations", "typecheck", "test-coverage"])

  assert.match(
    read(".agents/skills/dev-workflow/SKILL.md"),
    /`migrations`[\s\S]{0,120}?`typecheck`[\s\S]{0,120}?`test-coverage`/,
    "dev-workflow's pre-push description must name migrations -> typecheck -> test-coverage in order"
  )
})

test("dev-workflow's CI job names exist as real job keys in ci.yml", () => {
  const ci = read(".github/workflows/ci.yml")
  const jobsBlock = ci.slice(ci.indexOf("\njobs:\n"))
  const jobKeys = [...jobsBlock.matchAll(/^\s{2}([a-z-]+):\s*$/gm)].map(
    (m) => m[1]
  )
  for (const job of ["quality", "test-unit", "test-coverage"]) {
    assert.ok(jobKeys.includes(job), `ci.yml must declare a "${job}" job`)
  }

  assert.match(
    read(".agents/skills/dev-workflow/SKILL.md"),
    /`quality`[^`]*`test-unit`[^`]*`test-coverage`/,
    "dev-workflow must name quality/test-unit/test-coverage as the real CI jobs"
  )
})
