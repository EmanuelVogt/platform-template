import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")
const HOOK_PATH = path.join(
  REPO_ROOT,
  ".claude",
  "hooks",
  "release-coordination.mjs"
)

function git(args, cwd) {
  return execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" })
}

// Repositório git real: o hook resolve o common dir com `git rev-parse
// --git-common-dir` de verdade — um processo filho não aceita `exec` injetado
// como o `readLease` da lib aceita nos testes da própria lease.
let repoDir
let plainDir

before(() => {
  repoDir = mkdtempSync(path.join(tmpdir(), "release-coordination-hook-"))
  git(["init", "-q", "-b", "main", "."], repoDir)
  git(["config", "user.email", "t@example.com"], repoDir)
  git(["config", "user.name", "Test"], repoDir)
  writeFileSync(path.join(repoDir, "f.txt"), "hi\n")
  git(["add", "f.txt"], repoDir)
  git(["commit", "-q", "-m", "init"], repoDir)

  plainDir = mkdtempSync(path.join(tmpdir(), "release-coordination-plain-"))
})

after(() => {
  rmSync(repoDir, { recursive: true, force: true })
  rmSync(plainDir, { recursive: true, force: true })
})

function leaseFile() {
  return path.join(repoDir, ".git", "platform", "release-lease.json")
}

function clearLease() {
  rmSync(leaseFile(), { force: true })
}

function seedLease(lease) {
  mkdirSync(path.dirname(leaseFile()), { recursive: true })
  writeFileSync(leaseFile(), JSON.stringify(lease))
}

const FOREIGN_HOLDER = { id: "someone@otherhost#999", kind: "process" }
const SESSION_HOLDER = { id: "sess-abc-123", kind: "session" }

function foreignLease(stage, holder = FOREIGN_HOLDER) {
  const startedAt = Date.now() - 5 * 60_000
  return {
    version: "3.1.0",
    stage,
    holder,
    startedAt,
    updatedAt: startedAt,
    markerSha: stage === "draft" ? null : "abc123",
  }
}

function runHook({ cwd = repoDir, command, sessionId, env = {} }) {
  const payload = { cwd, tool_input: { command } }
  if (sessionId) payload.session_id = sessionId
  return spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...env },
  })
}

test("no lease: git push origin main is allowed", () => {
  clearLease()
  const result = runHook({ command: "git push origin main" })
  assert.equal(result.status, 0)
})

test("foreign marker-pushed: git push origin main is blocked and stderr names the version", () => {
  seedLease(foreignLease("marker-pushed"))
  const result = runHook({ command: "git push origin main" })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /v3\.1\.0/)
})

test("foreign marker-pushed: git push --no-verify origin main is blocked too", () => {
  seedLease(foreignLease("marker-pushed"))
  const result = runHook({ command: "git push --no-verify origin main" })
  assert.equal(result.status, 2)
})

test("foreign marker-pushed: a tag push (git push origin v3.0.0) is allowed", () => {
  seedLease(foreignLease("marker-pushed"))
  const result = runHook({ command: "git push origin v3.0.0" })
  assert.equal(result.status, 0)
})

test("foreign draft: a bare git push is allowed (the freeze starts at marker-local)", () => {
  seedLease(foreignLease("draft"))
  const result = runHook({ command: "git push" })
  assert.equal(result.status, 0)
})

test("foreign draft: pnpm platform release --push is blocked (a release is already being prepared)", () => {
  seedLease(foreignLease("draft"))
  const result = runHook({ command: "pnpm platform release --push" })
  assert.equal(result.status, 2)
})

test("foreign marker-pushed: pnpm platform release --status stays available", () => {
  seedLease(foreignLease("marker-pushed"))
  const result = runHook({ command: "pnpm platform release --status" })
  assert.equal(result.status, 0)
})

test("holder identified by CLAUDE_CODE_SESSION_ID env is never blocked", () => {
  seedLease(foreignLease("marker-pushed", SESSION_HOLDER))
  const result = runHook({
    command: "git push origin main",
    env: { CLAUDE_CODE_SESSION_ID: SESSION_HOLDER.id },
  })
  assert.equal(result.status, 0)
})

test("holder identified by the stdin session_id is never blocked", () => {
  seedLease(foreignLease("marker-pushed", SESSION_HOLDER))
  const result = runHook({
    command: "git push origin main",
    sessionId: SESSION_HOLDER.id,
  })
  assert.equal(result.status, 0)
})

test("a corrupt lease blocks a push", () => {
  mkdirSync(path.dirname(leaseFile()), { recursive: true })
  writeFileSync(leaseFile(), "not json")
  const result = runHook({ command: "git push origin main" })
  assert.equal(result.status, 2)
})

test("malformed stdin JSON never blocks", () => {
  clearLease()
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: "not json at all",
    encoding: "utf8",
  })
  assert.equal(result.status, 0)
})

test("a non-git cwd never blocks", () => {
  const result = runHook({ cwd: plainDir, command: "git push origin main" })
  assert.equal(result.status, 0)
})
