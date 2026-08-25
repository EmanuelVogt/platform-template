import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"
import { lintEntryBump } from "../lib/lint.mjs"
import {
  ENTRY_BUMP_STATE_ENV,
  currentStateFromEnv,
  entryChangedWithoutBump,
} from "../release-preflight.mjs"

const REPO_ROOT = "/repo"
const ENTRY_DIR = path.join(REPO_ROOT, "catalog/widget")
const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const RELEASE_PREFLIGHT_PATH = path.join(TESTS_DIR, "../release-preflight.mjs")
const LEFTHOOK_LOCAL_PATH = path.join(TESTS_DIR, "../../../lefthook-local.yml")

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

function git(args, cwd) {
  execFileSync(
    "git",
    ["-c", "user.email=test@test.local", "-c", "user.name=test", ...args],
    { cwd, stdio: "pipe" }
  )
}

function realExec(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return { status: result.status ?? 1, stdout: result.stdout ?? "" }
}

function writeEntryManifest(entryDir, version) {
  writeFileSync(
    path.join(entryDir, "module.json"),
    `${JSON.stringify(
      { name: "widget", version, kernelRange: ">=1.0.0 <2.0.0" },
      null,
      2
    )}\n`,
    "utf8"
  )
}

function writeEntryChangelog(entryDir, body) {
  writeFileSync(path.join(entryDir, "CHANGELOG.md"), body, "utf8")
}

// Repositório real com uma entrada em 1.0.0 e a tag `v1.0.0` como linha de
// base — o mínimo que a regra de bump precisa para ter algo com que comparar.
function makeTaggedEntryRepo() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "entry-bump-"))
  const entryDir = path.join(repoRoot, "catalog/widget")
  mkdirSync(entryDir, { recursive: true })
  writeEntryManifest(entryDir, "1.0.0")
  writeEntryChangelog(entryDir, "# widget\n\n## [1.0.0]\n\n- primeira versão\n")
  git(["init", "-q"], repoRoot)
  git(["branch", "-M", "main"], repoRoot)
  git(["add", "."], repoRoot)
  git(["commit", "-q", "-m", "init"], repoRoot)
  git(["tag", "v1.0.0"], repoRoot)
  return { repoRoot, entryDir }
}

// A armadilha de 2026-08-24 (`51daeb3`), passo a passo: um commit editou o
// CHANGELOG da entrada sem mover a versão e, por cima dele, o bump que
// conserta está apenas *staged* — exatamente o instante em que o hook de
// pre-commit roda e em que `HEAD` já é o commit errado.
function makeTrapRepo() {
  const { repoRoot, entryDir } = makeTaggedEntryRepo()
  writeEntryChangelog(
    entryDir,
    "# widget\n\n## [1.0.0]\n\n- primeira versão, agora com o motivo real\n"
  )
  git(["add", "catalog/widget/CHANGELOG.md"], repoRoot)
  git(["commit", "-q", "-m", "docs(widget): reescreve o CHANGELOG"], repoRoot)

  writeEntryManifest(entryDir, "1.0.1")
  writeEntryChangelog(
    entryDir,
    "# widget\n\n## [1.0.1]\n\n- bump que conserta o commit anterior\n\n## [1.0.0]\n\n- primeira versão, agora com o motivo real\n"
  )
  git(["add", "catalog/widget"], repoRoot)
  return { repoRoot, entryDir }
}

function withStateEnv(value, run) {
  const previous = process.env[ENTRY_BUMP_STATE_ENV]
  if (value === undefined) delete process.env[ENTRY_BUMP_STATE_ENV]
  else process.env[ENTRY_BUMP_STATE_ENV] = value
  try {
    return run()
  } finally {
    if (previous === undefined) delete process.env[ENTRY_BUMP_STATE_ENV]
    else process.env[ENTRY_BUMP_STATE_ENV] = previous
  }
}

test("the 2026-08-24 trap: with the bump staged, the state being committed is clean even though HEAD (the parent) still is not", () => {
  const { repoRoot, entryDir } = makeTrapRepo()
  const call = { repoRoot, exec: realExec, previousTag: "v1.0.0", entryDir }
  try {
    assert.equal(
      entryChangedWithoutBump({ ...call, currentState: "head" }),
      true,
      "CI e release-preflight medem HEAD: o commit pai mexeu na entrada sem bump e continua reprovado"
    )
    assert.equal(
      entryChangedWithoutBump({ ...call, currentState: "staged" }),
      false,
      "no pre-commit o bump staged é o estado que vai virar commit — a regra tem de deixá-lo passar"
    )
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test("staged state still blocks the commit that creates the trap: an entry CHANGELOG staged with no version move", () => {
  const { repoRoot, entryDir } = makeTaggedEntryRepo()
  writeEntryChangelog(
    entryDir,
    "# widget\n\n## [1.0.0]\n\n- primeira versão, agora com o motivo real\n"
  )
  git(["add", "catalog/widget/CHANGELOG.md"], repoRoot)
  try {
    assert.equal(
      entryChangedWithoutBump({
        repoRoot,
        exec: realExec,
        previousTag: "v1.0.0",
        entryDir,
        currentState: "staged",
      }),
      true
    )
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test("staged state ignores an unstaged edit: the commit records the index, not the working tree", () => {
  const { repoRoot, entryDir } = makeTaggedEntryRepo()
  writeEntryChangelog(
    entryDir,
    "# widget\n\n## [1.0.0]\n\n- rascunho não staged\n"
  )
  try {
    assert.equal(
      entryChangedWithoutBump({
        repoRoot,
        exec: realExec,
        previousTag: "v1.0.0",
        entryDir,
        currentState: "staged",
      }),
      false
    )
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test("lintEntryBump — what catalog-lint.mjs runs for the hook — reads the index when the caller declares the staged state, and HEAD when it does not", () => {
  const { repoRoot, entryDir } = makeTrapRepo()
  try {
    withStateEnv(undefined, () => {
      const errors = lintEntryBump({
        repoRoot,
        exec: realExec,
        entries: [entryDir],
      })
      assert.equal(errors.length, 1)
      assert.match(errors[0], /catalog\/widget: mudou desde v1\.0\.0 sem bump/)
    })

    withStateEnv("staged", () => {
      assert.deepEqual(
        lintEntryBump({ repoRoot, exec: realExec, entries: [entryDir] }),
        []
      )
    })
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test("currentStateFromEnv defaults to head (CI, release-preflight) and refuses a state it does not know", () => {
  assert.equal(currentStateFromEnv({}), "head")
  assert.equal(currentStateFromEnv({ [ENTRY_BUMP_STATE_ENV]: "" }), "head")
  assert.equal(currentStateFromEnv({ [ENTRY_BUMP_STATE_ENV]: "head" }), "head")
  assert.equal(
    currentStateFromEnv({ [ENTRY_BUMP_STATE_ENV]: "staged" }),
    "staged"
  )
  assert.throws(
    () => currentStateFromEnv({ [ENTRY_BUMP_STATE_ENV]: "index" }),
    /estado inválido para a regra de bump: "index"/
  )
  assert.throws(
    () =>
      entryChangedWithoutBump({
        repoRoot: REPO_ROOT,
        exec: fakeExec(),
        previousTag: "v1.0.0",
        entryDir: ENTRY_DIR,
        currentState: "cached",
      }),
    /estado inválido para a regra de bump: "cached"/
  )
})

test("lefthook-local.yml declares the staged state on the pre-commit catalog-lint command — without it the fix never reaches the hook", () => {
  const { "pre-commit": preCommit } = parseYaml(
    readFileSync(LEFTHOOK_LOCAL_PATH, "utf8")
  )
  const { run } = preCommit.commands["catalog-lint"]
  assert.match(run, new RegExp(`(^|\\s)${ENTRY_BUMP_STATE_ENV}=staged\\s`))
  assert.match(run, /node scripts\/platform\/catalog-lint\.mjs/)
})
