import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { webRootFor } from "../lib/child-layout.mjs"

// SEAM-03 (spec.md AC3): "WHEN the identity entry is installed THEN no edit
// to shell.tsx, main.tsx or app-providers.tsx SHALL be required." The claim
// is prose-only today (catalog/identity/single-tenant/README.md, in the
// TanStack Router guard recipe); these assertions make the two structural
// facts that back it fail loudly if either ever stops holding, without
// paying for a full `module add` install (pnpm install + `pnpm contract`,
// minutes, network-dependent).

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")
const ENTRY_WEB_DIR = path.join(
  REPO_ROOT,
  "catalog",
  "identity",
  "single-tenant",
  "web"
)
const SEAM_FILES = [
  path.join("apps", "web", "src", "app", "router", "shell.tsx"),
  path.join("apps", "web", "src", "main.tsx"),
  path.join("apps", "web", "src", "app", "providers", "app-providers.tsx"),
]

function walk(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...walk(full))
    else found.push(full)
  }
  return found
}

test("SEAM-03 — the identity entry ships no file named shell.tsx, main.tsx or app-providers.tsx", () => {
  const names = walk(ENTRY_WEB_DIR).map((file) => path.basename(file))
  for (const seamFile of SEAM_FILES) {
    assert.ok(
      !names.includes(path.basename(seamFile)),
      `the entry must not ship its own ${path.basename(seamFile)}`
    )
  }
})

test("SEAM-03 — webRootFor always lands under apps/web/src/entities/<name>, never at a seam file", () => {
  const entryRoot = webRootFor("identity")
  assert.equal(
    entryRoot,
    path.join("apps", "web", "src", "entities", "identity")
  )
  for (const seamFile of SEAM_FILES) {
    assert.ok(
      !seamFile.startsWith(entryRoot + path.sep),
      `${seamFile} must fall outside the entry's copy destination`
    )
  }
})

test("SEAM-03 — the README's no-edit claim text is still on disk", () => {
  const readme = readFileSync(
    path.join(REPO_ROOT, "catalog", "identity", "single-tenant", "README.md"),
    "utf8"
  )
  assert.match(
    readme,
    /`shell\.tsx`, `main\.tsx`, `app-providers\.tsx`\) precisa ser editado/
  )
  assert.match(
    readme,
    /exige editar `shell\.tsx`, `main\.tsx` ou `app-providers\.tsx`\./
  )
})

test("SEAM-03 — the entry web tree exists (guards against an empty-directory false pass)", () => {
  const files = walk(ENTRY_WEB_DIR)
  assert.ok(statSync(ENTRY_WEB_DIR).isDirectory())
  assert.ok(
    files.length > 0,
    "the identity entry must ship at least one web file"
  )
})
