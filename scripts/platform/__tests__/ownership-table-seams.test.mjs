import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

// SEAM-07 — "WHEN a reader consults the ownership table THEN it SHALL list
// every intended product edit point, including `main.ts` as platform."
// docs/dev/template.md's table is the only ownership table in the repo.

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const table = readFileSync(
  path.join(REPO_ROOT, "docs", "dev", "template.md"),
  "utf8"
)

test("the ownership table names apps/api/src/main.ts as platform-owned", () => {
  assert.match(
    table,
    /\| API boot entrypoint[^|]*\|[^|]*platform[^|]*\|[^|]*`apps\/api\/src\/main\.ts`[^|]*\|/,
    "main.ts must appear in the ownership table, marked platform"
  )
})

test("the ownership table names bootstrap.product.ts as the product boot seam", () => {
  assert.match(
    table,
    /Product boot seam[^|]*\|[^|]*\|[^|]*`apps\/api\/src\/bootstrap\.product\.ts`[^|]*\|/,
    "bootstrap.product.ts must appear as the product-owned boot seam"
  )
})

test("the ownership table names the three web guard/provider/route seams from T25/T26", () => {
  assert.match(
    table,
    /Web auth-guard registration seam[^|]*\|[^|]*\|[^|]*`apps\/web\/src\/app\/router\/shell\.tsx`[^|]*\|/,
    "shell.tsx must appear as the web auth-guard registration seam"
  )
  assert.match(
    table,
    /Web provider seam[^|]*\|[^|]*\|[^|]*`apps\/web\/src\/app\/providers\/app-providers\.tsx`[^|]*\|/,
    "app-providers.tsx must appear as the web provider seam"
  )
  assert.match(
    table,
    /Web protected-routes registry[^|]*\|[^|]*\|[^|]*`apps\/web\/src\/shared\/config\/routes\.ts`[^|]*\|/,
    "routes.ts must appear as the web protected-routes registry seam"
  )
})
