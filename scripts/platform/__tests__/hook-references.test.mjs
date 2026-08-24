import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")
const HOOKS_DIR = path.join(REPO_ROOT, ".claude", "hooks")

// Matches a repo-relative-looking reference such as `docs/arch/front.md` or
// `./lib/dev-servers.mjs`; excludes matches that continue a JS regex literal
// (`/i.test(...)`) by requiring the first path segment to be at least 2 chars
// and by refusing a match that starts right after another `/`.
const PATH_RE =
  /(?<![/~])(?:\.{1,2}\/)*[A-Za-z0-9_-]{2,}(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+\b/g

function listHookFiles() {
  const files = []
  for (const entry of readdirSync(HOOKS_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".mjs")) {
      files.push(path.join(HOOKS_DIR, entry.name))
    } else if (entry.isDirectory()) {
      const subDir = path.join(HOOKS_DIR, entry.name)
      for (const sub of readdirSync(subDir, { withFileTypes: true })) {
        if (sub.isFile() && sub.name.endsWith(".mjs")) {
          files.push(path.join(subDir, sub.name))
        }
      }
    }
  }
  return files
}

// A bare reference in these hooks resolves from the repo root, from a
// `.`-prefixed repo root directory (`.claude`, `.specs`), relative to the
// hook file's own directory (`./lib/...`), or relative to `.claude/hooks/`
// (a prose mention such as "lib/dev-servers.mjs"). It exists if any resolves.
function resolves(reference, hookFile) {
  const bases = [path.join(REPO_ROOT, reference)]
  if (!reference.startsWith("."))
    bases.push(path.join(REPO_ROOT, `.${reference}`))
  if (reference.startsWith("./") || reference.startsWith("../"))
    bases.push(path.resolve(path.dirname(hookFile), reference))
  else bases.push(path.join(HOOKS_DIR, reference))
  return bases.some((candidate) => existsSync(candidate))
}

function referencedPaths(content) {
  const found = []
  for (const match of content.matchAll(PATH_RE)) {
    const before = content.slice(Math.max(0, match.index - 3), match.index)
    if (before.includes("~")) continue // e.g. `~/.claude/platform-dispatch-log.jsonl`: a runtime path, not a repo one
    found.push(match[0])
  }
  return found
}

test("the harness ships exactly 20 hook files under .claude/hooks", () => {
  assert.equal(listHookFiles().length, 20)
})

test("no hook references a file, helper or spec that does not exist", () => {
  for (const file of listHookFiles()) {
    const content = readFileSync(file, "utf8")
    for (const reference of referencedPaths(content)) {
      assert.ok(
        resolves(reference, file),
        `${path.relative(REPO_ROOT, file)} references \`${reference}\`, which does not exist in the repo`
      )
    }
  }
})

test("contract-enum.mjs no longer points at the absent select-options helper or contract-enums spec", () => {
  const content = readFileSync(
    path.join(HOOKS_DIR, "contract-enum.mjs"),
    "utf8"
  )
  assert.doesNotMatch(content, /select-options\.ts/)
  assert.doesNotMatch(content, /enumOptions/)
  assert.doesNotMatch(content, /contract-enums\.test\.ts/)
})

test("docs/arch/front.md no longer claims a contract-enums spec gates pre-push and CI", () => {
  const content = readFileSync(
    path.join(REPO_ROOT, "docs", "arch", "front.md"),
    "utf8"
  )
  assert.doesNotMatch(content, /contract-enums.*(pre-push|CI)/s)
  assert.doesNotMatch(content, /`contract-enums`\s*(conformance\s*)?spec/)
})

test("edit-reminders.mjs no longer mandates @workspace/ui, design tokens or Lucide", () => {
  const content = readFileSync(
    path.join(HOOKS_DIR, "edit-reminders.mjs"),
    "utf8"
  )
  assert.doesNotMatch(content, /@workspace\/ui/)
  assert.doesNotMatch(content, /design tokens/)
  assert.doesNotMatch(content, /Lucide/)
})
