import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { lintAdvisoryPathScope } from "../lib/lint.mjs"
import { parseAdvisory } from "../lib/advisories.mjs"

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
)
const ADV_02_PATH = path.join(ROOT, "docs/advisories/ADV-20260822-02.md")

function advisory(overrides = {}) {
  return {
    id: "ADV-20260901-01",
    module: "widget",
    detect: "rg -l 'PATTERN' apps/api/src/modules/widget",
    parity: "apps/api/src/modules/widget/__parity__/widget.parity.spec.ts",
    ...overrides,
  }
}

test("lintAdvisoryPathScope flags a detect that begins with catalog/, naming the child-layout path it should use", () => {
  const errors = lintAdvisoryPathScope(
    advisory({ detect: "rg -l 'PATTERN' catalog/widget" })
  )
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^detect referencia "catalog\/widget"/)
  assert.match(errors[0], /apps\/api\/src\/modules\/<entrada>/)
  assert.match(errors[0], /ADV-20260901-01/)
})

test("lintAdvisoryPathScope flags a parity that begins with catalog/, naming the child-layout path it should use", () => {
  const errors = lintAdvisoryPathScope(
    advisory({ parity: "catalog/widget/parity/widget.parity.spec.ts" })
  )
  assert.equal(errors.length, 1)
  assert.match(
    errors[0],
    /^parity referencia "catalog\/widget\/parity\/widget\.parity\.spec\.ts"/
  )
  assert.match(errors[0], /__parity__/)
})

test("lintAdvisoryPathScope passes for detect/parity already written as child-layout paths", () => {
  assert.deepEqual(lintAdvisoryPathScope(advisory()), [])
})

test("ADV-20260822-02's detect and parity are child-layout paths (regression guard for the CAT-04 fix)", () => {
  const content = readFileSync(ADV_02_PATH, "utf8")
  const errors = lintAdvisoryPathScope(parseAdvisory(content, ADV_02_PATH))
  assert.deepEqual(errors, [])
})
