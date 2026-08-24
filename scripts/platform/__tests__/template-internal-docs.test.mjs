import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { parse as parseYaml } from "yaml"

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
)
const INTERNAL_DIR = "docs/platform_template"

const excludes = () =>
  parseYaml(readFileSync(path.join(ROOT, "copier.yml"), "utf8"))._exclude ?? []

test(`${INTERNAL_DIR} is excluded with the root anchor`, () => {
  assert.ok(
    excludes().includes(`/${INTERNAL_DIR}`),
    `copier.yml must exclude /${INTERNAL_DIR} — internal audits never reach a product`
  )
})

test("no tracked file under the internal dir is a handbook the product would look for", () => {
  const tracked = execFileSync("git", ["ls-files", "-z", INTERNAL_DIR], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
  const jinja = tracked.filter((file) => file.endsWith(".jinja"))
  assert.deepEqual(
    jinja,
    [],
    "an internal analysis is never rendered — drop the .jinja suffix"
  )
})
