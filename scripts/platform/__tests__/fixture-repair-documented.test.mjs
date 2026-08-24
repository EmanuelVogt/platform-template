import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

test("the changelog and the template-update skill both keep describing the .copier-answers.yml repair", () => {
  const changelog = read("docs/dev/template-changelog.md")
  assert.match(
    changelog,
    /Repair `\.copier-answers\.yml` by hand, once, before `copier update`/,
    "docs/dev/template-changelog.md no longer states the child-migration repair step"
  )

  const skill = read(".agents/skills/template-update/SKILL.md")
  assert.match(
    skill,
    /`_commit: v1\.0\.0`[\s\S]{0,200}repair it once, by hand, before anything else/,
    ".agents/skills/template-update/SKILL.md no longer states the precondition repair"
  )
})

test("no .copier-answers.yml (leading dot) is tracked — the fixture stays copier-answers.yml", () => {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
  const leaked = tracked.filter(
    (file) => path.basename(file) === ".copier-answers.yml"
  )
  assert.deepEqual(leaked, [])
  assert.ok(
    tracked.includes(
      "scripts/platform/__tests__/fixtures/child/copier-answers.yml"
    )
  )
})
