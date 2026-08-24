import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

// LOC-06 — "WHEN a child requests /favicon.ico THEN it SHALL receive an
// asset from a shipped apps/web/public/, not the SPA fallback." Scoped to
// apps/web-vite (the default web_stack=vite path, renamed to apps/web on
// render) — Fix 5 routes apps/web-next's seam to the sibling
// web-stack-next feature.

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

test("apps/web-vite/public/favicon.ico is a shipped asset", () => {
  const faviconPath = path.join(REPO_ROOT, "apps/web-vite/public/favicon.ico")
  assert.ok(
    existsSync(faviconPath),
    "apps/web-vite/public/favicon.ico must exist"
  )
  assert.ok(
    statSync(faviconPath).size > 0,
    "apps/web-vite/public/favicon.ico must not be empty"
  )
})

test("nginx.conf answers /favicon.ico with the static asset, not the SPA fallback", () => {
  const nginxConf = read("apps/web-vite/nginx.conf")
  const match = nginxConf.match(/location\s*=\s*\/favicon\.ico\s*\{([^}]*)\}/)
  assert.ok(
    match,
    "nginx.conf must declare an exact-match /favicon.ico location"
  )
  assert.doesNotMatch(
    match[1],
    /try_files/,
    "the /favicon.ico location must not fall back to try_files/index.html"
  )
})
