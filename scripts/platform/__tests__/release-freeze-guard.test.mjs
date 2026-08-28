import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = path.join(TESTS_DIR, "../release-freeze-guard.mjs")

// Repositório real (git init), não um `exec` fake: o script sob teste roda
// como subprocesso e faz suas próprias chamadas de git — precisa de um
// repositório de verdade para resolver `--git-common-dir`.
function buildFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "release-freeze-guard-fixture-"))
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root })
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: root })
  execFileSync("git", ["config", "user.name", "test"], { cwd: root })
  writeFileSync(path.join(root, "README.md"), "x\n")
  execFileSync("git", ["add", "README.md"], { cwd: root })
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: root })
  return root
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true })
}

function leaseFile(root) {
  return path.join(root, ".git", "platform", "release-lease.json")
}

function seedLease(root, lease) {
  mkdirSync(path.dirname(leaseFile(root)), { recursive: true })
  writeFileSync(leaseFile(root), JSON.stringify(lease, null, 2))
}

function seedCorruptLease(root) {
  mkdirSync(path.dirname(leaseFile(root)), { recursive: true })
  writeFileSync(leaseFile(root), "{ not json")
}

const T0 = Date.now() - 5 * 60_000
const FOREIGN_HOLDER = { id: "foreign-session-id", kind: "session" }

function leaseOf(overrides = {}) {
  return {
    version: "9.9.9",
    stage: "marker-pushed",
    holder: FOREIGN_HOLDER,
    startedAt: T0,
    updatedAt: T0,
    markerSha: null,
    ...overrides,
  }
}

const MAIN_PUSH_STDIN =
  "refs/heads/feature abc1230000000000000000000000000000000f refs/heads/main def4560000000000000000000000000000000a\n"
const NON_MAIN_PUSH_STDIN =
  "refs/heads/feature abc1230000000000000000000000000000000f refs/heads/feature def4560000000000000000000000000000000a\n"

// Limpa o ambiente de identidade herdado desta própria sessão de teste — sem
// isso, CLAUDE_CODE_SESSION_ID do processo que roda `node --test` vazaria
// para o filho e contaminaria os casos "estranho" e "titular".
function runGuard({ cwd, stdin = "", env = {} }) {
  const baseEnv = { ...process.env }
  delete baseEnv.CLAUDE_CODE_SESSION_ID
  delete baseEnv.PLATFORM_RELEASE_HOLDER
  delete baseEnv.PLATFORM_RELEASE_FREEZE_BYPASS
  return spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd,
    input: stdin,
    encoding: "utf8",
    env: { ...baseEnv, ...env },
  })
}

test("no lease on disk allows the push to main", () => {
  const root = buildFixture()
  try {
    const result = runGuard({ cwd: root, stdin: MAIN_PUSH_STDIN })
    assert.equal(result.status, 0)
  } finally {
    cleanup(root)
  }
})

test("a foreign lease at marker-pushed blocks a push to main, naming the version and --status", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "marker-pushed" }))
    const result = runGuard({ cwd: root, stdin: MAIN_PUSH_STDIN })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /9\.9\.9/)
    assert.match(result.stderr, /pnpm platform release --status/)
  } finally {
    cleanup(root)
  }
})

test("a foreign lease still at draft allows the push", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "draft" }))
    const result = runGuard({ cwd: root, stdin: MAIN_PUSH_STDIN })
    assert.equal(result.status, 0)
  } finally {
    cleanup(root)
  }
})

test("the holder identified by CLAUDE_CODE_SESSION_ID pushes through their own lease", () => {
  const root = buildFixture()
  try {
    const holder = { id: "sess-mine", kind: "session" }
    seedLease(root, leaseOf({ stage: "marker-pushed", holder }))
    const result = runGuard({
      cwd: root,
      stdin: MAIN_PUSH_STDIN,
      env: { CLAUDE_CODE_SESSION_ID: "sess-mine" },
    })
    assert.equal(result.status, 0)
  } finally {
    cleanup(root)
  }
})

test("the holder identified by PLATFORM_RELEASE_HOLDER pushes through, upgrading marker-local to marker-pushed", () => {
  const root = buildFixture()
  try {
    const holder = { id: "sess-other", kind: "session" }
    seedLease(root, leaseOf({ stage: "marker-local", holder }))
    const result = runGuard({
      cwd: root,
      stdin: MAIN_PUSH_STDIN,
      env: { PLATFORM_RELEASE_HOLDER: "sess-other" },
    })
    assert.equal(result.status, 0)
    const updated = JSON.parse(readFileSync(leaseFile(root), "utf8"))
    assert.equal(updated.stage, "marker-pushed")
  } finally {
    cleanup(root)
  }
})

test("PLATFORM_RELEASE_FREEZE_BYPASS=1 lets a foreign push through", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "marker-pushed" }))
    const result = runGuard({
      cwd: root,
      stdin: MAIN_PUSH_STDIN,
      env: { PLATFORM_RELEASE_FREEZE_BYPASS: "1" },
    })
    assert.equal(result.status, 0)
  } finally {
    cleanup(root)
  }
})

test("a corrupt lease blocks even a push that is not to main", () => {
  const root = buildFixture()
  try {
    seedCorruptLease(root)
    const result = runGuard({ cwd: root, stdin: NON_MAIN_PUSH_STDIN })
    assert.equal(result.status, 1)
  } finally {
    cleanup(root)
  }
})

test("a local tag matching the lease version self-clears the lease and allows the push", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "marker-pushed" }))
    execFileSync("git", ["tag", "v9.9.9"], { cwd: root })
    const result = runGuard({ cwd: root, stdin: MAIN_PUSH_STDIN })
    assert.equal(result.status, 0)
    assert.equal(existsSync(leaseFile(root)), false)
  } finally {
    cleanup(root)
  }
})

test("empty stdin falls back to the local branch: main blocks like an explicit main push", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "marker-pushed" }))
    const result = runGuard({ cwd: root, stdin: "" })
    assert.equal(result.status, 1)
  } finally {
    cleanup(root)
  }
})

test("empty stdin on a non-main branch allows the push", () => {
  const root = buildFixture()
  try {
    execFileSync("git", ["checkout", "-q", "-b", "feature"], { cwd: root })
    seedLease(root, leaseOf({ stage: "marker-pushed" }))
    const result = runGuard({ cwd: root, stdin: "" })
    assert.equal(result.status, 0)
  } finally {
    cleanup(root)
  }
})
