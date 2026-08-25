import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

// Fix Round 2 / Cluster CG1 — `copier.yml:154-158`'s `web_stack` offers
// `[vite, next]`, but LOC-03, LOC-06 and SEAM-04 were only ever built in
// `apps/web-vite` (T23-T27). This guard pins the three seams in
// `apps/web-next` too, and fails the moment either shell drops one of them,
// so a `web_stack=next` child cannot silently lose a seam the `vite` child
// still has.

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

// --- LOC-06: a shipped favicon, not the SPA/route fallback -----------------

test("both shells ship a non-empty apps/web-{vite,next}/public/favicon.ico", () => {
  for (const shell of ["web-vite", "web-next"]) {
    const faviconPath = path.join(
      REPO_ROOT,
      "apps",
      shell,
      "public/favicon.ico"
    )
    assert.ok(
      existsSync(faviconPath),
      `apps/${shell}/public/favicon.ico must exist`
    )
    assert.ok(
      statSync(faviconPath).size > 0,
      `apps/${shell}/public/favicon.ico must not be empty`
    )
  }
})

// --- SEAM-04: protected routes join without editing routes.ts --------------

test("both shells' shared/config/routes.ts export registerProtectedRoute", () => {
  for (const shell of ["web-vite", "web-next"]) {
    const routes = read(`apps/${shell}/src/shared/config/routes.ts`)
    assert.match(
      routes,
      /export function registerProtectedRoute\(/,
      `apps/${shell}/src/shared/config/routes.ts must export registerProtectedRoute`
    )
  }
})

// --- LOC-03: app name and locale are configuration, not a platform edit ----

test("apps/web-vite's shell reads VITE_APP_NAME and VITE_LOCALE, with no default drift", () => {
  const shell = read("apps/web-vite/src/app/router/shell.tsx")
  assert.match(shell, /import\.meta\.env\.VITE_APP_NAME/)
  assert.match(shell, /import\.meta\.env\.VITE_LOCALE/)
  assert.match(shell, /\?\?\s*"Platform"/)
  assert.match(shell, /\?\?\s*"pt-BR"/)
})

test("apps/web-next's root layout reads NEXT_PUBLIC_APP_NAME and NEXT_PUBLIC_LOCALE, with no default drift", () => {
  const rootLayout = read("apps/web-next/src/_app/layout/root-layout.tsx")
  assert.match(rootLayout, /process\.env\.NEXT_PUBLIC_APP_NAME/)
  assert.match(rootLayout, /process\.env\.NEXT_PUBLIC_LOCALE/)
  assert.match(rootLayout, /\?\?\s*"Platform"/)
  assert.match(rootLayout, /\?\?\s*"pt-BR"/)
})

test("apps/web-next's html lang and title are driven by the locale seam, not hardcoded", () => {
  const rootLayout = read("apps/web-next/src/_app/layout/root-layout.tsx")
  assert.doesNotMatch(
    rootLayout,
    /<html lang="pt-BR">/,
    "html lang must resolve through resolveLocale(), not a literal pt-BR"
  )
  assert.doesNotMatch(
    rootLayout,
    /title:\s*"Platform"/,
    "metadata.title must resolve through resolveAppName(), not a literal string"
  )
})
