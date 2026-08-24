import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { EXIT_CODES } from "../lib/exit-codes.mjs"
import { preflightMessage, runPreflight } from "../release-preflight.mjs"

const CHANGELOG = [
  "# Changelog",
  "",
  "## v2.1.0",
  "",
  "Adds a widget, fixed on the child by re-running the affected command.",
  "",
  "### Child migration steps",
  "",
  "1. `pnpm install` picks up the new dependency.",
  "",
  "## v2.0.0",
  "",
  "Previous stable.",
  "",
  "### Child migration steps",
  "",
  "None — copier update is enough.",
  "",
].join("\n")

function buildFixtureRepo({ changelog = CHANGELOG, entries = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "release-preflight-fixture-"))
  mkdirSync(path.join(root, "docs/dev"), { recursive: true })
  writeFileSync(path.join(root, "docs/dev/template-changelog.md"), changelog)
  for (const [entryName, moduleJson] of Object.entries(entries)) {
    const entryDir = path.join(root, "catalog", entryName)
    mkdirSync(entryDir, { recursive: true })
    writeFileSync(
      path.join(entryDir, "module.json"),
      JSON.stringify(moduleJson)
    )
  }
  return root
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true })
}

// Roteia por sub-comando git; cada teste passa só os campos que usa —
// os demais viram respostas neutras (sem tag, sem diff, sem tag anterior).
function fakeExec({
  tagList = "",
  lsRemote = "",
  diffStatus = () => 0,
  showAt = () => undefined,
} = {}) {
  return (command, args) => {
    assert.equal(command, "git")
    const [sub] = args
    if (sub === "tag") return { status: 0, stdout: tagList }
    if (sub === "ls-remote") return { status: 0, stdout: lsRemote }
    if (sub === "diff") {
      const dir = args.at(-1)
      return { status: diffStatus(dir), stdout: "" }
    }
    if (sub === "show") {
      const [ref, entryPath] = args[1].split(":")
      const content = showAt(ref, entryPath)
      return content === undefined
        ? { status: 128, stdout: "" }
        : { status: 0, stdout: content }
    }
    throw new Error(`unexpected git subcommand in test: ${sub}`)
  }
}

test("runPreflight fails with USAGE_ERROR when version is not the latest changelog section", async () => {
  const dir = buildFixtureRepo()
  try {
    const logs = []
    const exitCode = await runPreflight({
      version: "2.0.0",
      repoRoot: dir,
      exec: fakeExec(),
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.USAGE_ERROR)
    assert.match(logs.join("\n"), /2\.0\.0.*não é a última/)
  } finally {
    cleanup(dir)
  }
})

test("runPreflight fails with ALREADY_INSTALLED when the tag already exists (double-dispatch)", async () => {
  const dir = buildFixtureRepo()
  try {
    const logs = []
    const exitCode = await runPreflight({
      version: "2.1.0",
      repoRoot: dir,
      exec: fakeExec({ tagList: "v2.1.0\n" }),
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.ALREADY_INSTALLED)
    assert.match(logs.join("\n"), /"v2\.1\.0" já existe/)
  } finally {
    cleanup(dir)
  }
})

test("runPreflight fails with TEST_FAILURE when an entry changed without a module.json version bump", async () => {
  const dir = buildFixtureRepo({
    entries: { widget: { name: "widget", version: "1.0.0" } },
  })
  try {
    const logs = []
    const exitCode = await runPreflight({
      version: "2.1.0",
      repoRoot: dir,
      exec: fakeExec({
        lsRemote: "abc\trefs/tags/v2.0.0\n",
        diffStatus: () => 1,
        showAt: (ref) => JSON.stringify({ name: "widget", version: "1.0.0" }),
      }),
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.TEST_FAILURE)
    assert.match(
      logs.join("\n"),
      /"catalog\/widget" mudou desde v2\.0\.0 sem bump/
    )
  } finally {
    cleanup(dir)
  }
})

test("runPreflight passes an entry that changed together with a module.json version bump", async () => {
  const dir = buildFixtureRepo({
    entries: { widget: { name: "widget", version: "1.1.0" } },
  })
  try {
    const exitCode = await runPreflight({
      version: "2.1.0",
      repoRoot: dir,
      exec: fakeExec({
        lsRemote: "abc\trefs/tags/v2.0.0\n",
        diffStatus: () => 1,
        showAt: (ref) =>
          JSON.stringify({
            name: "widget",
            version: ref === "v2.0.0" ? "1.0.0" : "1.1.0",
          }),
      }),
      log: () => {},
    })
    assert.equal(exitCode, EXIT_CODES.OK)
  } finally {
    cleanup(dir)
  }
})

test("runPreflight fails with MIGRATION_FAILURE when a non-major section has a manual (non-backticked) step", async () => {
  const changelog = [
    "## v2.1.0",
    "",
    "Intro.",
    "",
    "### Child migration steps",
    "",
    "1. **Do it by hand.**",
    "",
  ].join("\n")
  const dir = buildFixtureRepo({ changelog })
  try {
    const logs = []
    const exitCode = await runPreflight({
      version: "2.1.0",
      repoRoot: dir,
      exec: fakeExec(),
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.MIGRATION_FAILURE)
    assert.match(logs.join("\n"), /passo 1/)
  } finally {
    cleanup(dir)
  }
})

test("runPreflight green path: exit 0 when version/tag/entries/migration-steps are all clean", async () => {
  const dir = buildFixtureRepo()
  try {
    const exitCode = await runPreflight({
      version: "2.1.0",
      repoRoot: dir,
      exec: fakeExec(),
      log: () => {},
    })
    assert.equal(exitCode, EXIT_CODES.OK)
  } finally {
    cleanup(dir)
  }
})

test("preflightMessage prints exactly the section's first paragraph", () => {
  const dir = buildFixtureRepo()
  try {
    assert.equal(
      preflightMessage({ version: "2.1.0", repoRoot: dir }),
      "Adds a widget, fixed on the child by re-running the affected command."
    )
  } finally {
    cleanup(dir)
  }
})
