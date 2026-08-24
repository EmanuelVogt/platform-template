import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { lintEntryBump } from "../lib/lint.mjs"
import { entryChangedWithoutBump } from "../release-preflight.mjs"

const REPO_ROOT = "/repo"
const ENTRY_DIR = path.join(REPO_ROOT, "catalog/widget")
const RELEASE_PREFLIGHT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../release-preflight.mjs"
)

function fakeExec({
  lsRemoteStatus = 0,
  lsRemote = "",
  diffStatus = () => 1,
  showAt = () => undefined,
} = {}) {
  return (command, args) => {
    assert.equal(command, "git")
    const [sub] = args
    if (sub === "ls-remote") return { status: lsRemoteStatus, stdout: lsRemote }
    if (sub === "diff") {
      const dir = args.at(-1)
      return { status: diffStatus(dir), stdout: "" }
    }
    if (sub === "show") {
      const [ref] = args[1].split(":")
      const content = showAt(ref)
      return content === undefined
        ? { status: 128, stdout: "" }
        : { status: 0, stdout: content }
    }
    throw new Error(`unexpected git subcommand in test: ${sub}`)
  }
}

test("lintEntryBump reports nothing for an entry that changed together with a module.json version bump", () => {
  const errors = lintEntryBump({
    repoRoot: REPO_ROOT,
    exec: fakeExec({
      lsRemote: "abc\trefs/tags/v2.0.0\n",
      diffStatus: () => 1,
      showAt: (ref) =>
        JSON.stringify({ version: ref === "v2.0.0" ? "1.0.0" : "1.1.0" }),
    }),
    entries: [ENTRY_DIR],
  })
  assert.deepEqual(errors, [])
})

test("lintEntryBump names the entry that changed without a module.json version bump", () => {
  const errors = lintEntryBump({
    repoRoot: REPO_ROOT,
    exec: fakeExec({
      lsRemote: "abc\trefs/tags/v2.0.0\n",
      diffStatus: () => 1,
      showAt: () => JSON.stringify({ version: "1.0.0" }),
    }),
    entries: [ENTRY_DIR],
  })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /catalog\/widget: mudou desde v2\.0\.0 sem bump/)
})

test("lintEntryBump reports nothing for an entry whose tree did not change since the baseline", () => {
  const errors = lintEntryBump({
    repoRoot: REPO_ROOT,
    exec: fakeExec({
      lsRemote: "abc\trefs/tags/v2.0.0\n",
      diffStatus: () => 0,
    }),
    entries: [ENTRY_DIR],
  })
  assert.deepEqual(errors, [])
})

test("lintEntryBump fails loud when no stable tag ever existed (no tags)", () => {
  const errors = lintEntryBump({
    repoRoot: REPO_ROOT,
    exec: fakeExec({ lsRemote: "" }),
    entries: [ENTRY_DIR],
  })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^lintEntryBump: nenhuma tag estável/)
})

test("lintEntryBump fails loud on a shallow clone that fetched refs but no tags (fetch-depth without T35)", () => {
  const errors = lintEntryBump({
    repoRoot: REPO_ROOT,
    exec: fakeExec({ lsRemote: "abc\trefs/heads/main\n" }),
    entries: [ENTRY_DIR],
  })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /clone raso sem fetch-depth: 0/)
})

test("lintEntryBump fails loud when git ls-remote itself fails (not a git repository)", () => {
  const errors = lintEntryBump({
    repoRoot: REPO_ROOT,
    exec: fakeExec({ lsRemoteStatus: 128, lsRemote: "" }),
    entries: [ENTRY_DIR],
  })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^lintEntryBump: "git ls-remote" falhou/)
})

test("lib/lint.mjs imports entryChangedWithoutBump from release-preflight.mjs instead of declaring its own copy (release-preflight.mjs ships to the child, lib/lint.mjs is excluded by copier.yml — the only safe direction)", () => {
  const lintSource = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../lib/lint.mjs"),
    "utf8"
  )
  assert.ok(
    lintSource.includes(
      'import { entryChangedWithoutBump } from "../release-preflight.mjs"'
    )
  )
  assert.doesNotMatch(lintSource, /function entryChangedWithoutBump/)

  const preflightSource = readFileSync(RELEASE_PREFLIGHT_PATH, "utf8")
  assert.match(preflightSource, /export function entryChangedWithoutBump/)
  assert.equal(
    typeof entryChangedWithoutBump,
    "function",
    "the imported function must exist for lib/lint.mjs to reuse"
  )
})
