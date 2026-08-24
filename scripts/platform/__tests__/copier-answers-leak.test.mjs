import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
)

// copier writes ANY tracked file named like `_answers_file` to the product root, before
// `_exclude` is consulted (observed with copier 9.17.2: a fixture at
// `scripts/platform/__tests__/fixtures/child/.copier-answers.yml` overwrote the rendered
// answers with `_commit: v1.0.0` and no answers — every product was born unable to
// `copier update` and `module add` cloned the catalog at v1.0.0).
test("the only .copier-answers.yml copier can see is the .jinja at the root", () => {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
  const answersFiles = tracked.filter(
    (file) => path.basename(file) === ".copier-answers.yml"
  )
  assert.deepEqual(
    answersFiles,
    [],
    "rename the fixture — copier redirects it to the product root"
  )
  assert.ok(tracked.includes(".copier-answers.yml.jinja"))
})
