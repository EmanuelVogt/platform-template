// Spawns .claude/hooks/delegate-to-subagent.mjs exactly as Claude Code does
// (stdin JSON, CLAUDE_PROJECT_DIR env, exit code) instead of importing hook
// internals, so the tests exercise the real process contract.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")
const HOOK = path.join(
  REPO_ROOT,
  ".claude",
  "hooks",
  "delegate-to-subagent.mjs"
)

// git exports GIT_* into pre-push hooks; inherited, they would point the
// fixture at the real repo
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))
)

const runHook = (input, { env = {}, cwd, args = [] } = {}) => {
  const result = spawnSync(process.execPath, [HOOK, ...args], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: { ...baseEnv, ...env },
    cwd,
    encoding: "utf8",
  })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}

const makeFixtureRepo = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "platform-delegate-fixture-"))
  mkdirSync(path.join(dir, "apps", "api", "src"), { recursive: true })
  writeFileSync(path.join(dir, "apps", "api", "src", "main.ts"), "export {}\n")
  mkdirSync(path.join(dir, ".claude", "hooks"), { recursive: true })
  writeFileSync(path.join(dir, ".claude", "hooks", "x.mjs"), "export {}\n")
  mkdirSync(path.join(dir, ".ca-plans"), { recursive: true })
  writeFileSync(path.join(dir, ".ca-plans", "feature.md"), "# fixture\n")
  return dir
}

const uniqueSessionId = () =>
  `delegate-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`

const cleanupSessionState = (sessionId) =>
  rmSync(path.join(tmpdir(), `platform-delegate-${sessionId}.json`), {
    force: true,
  })

const grep = (sessionId, pattern) =>
  runHook({ tool_name: "Grep", tool_input: { pattern }, session_id: sessionId })

const bash = (sessionId, command, fixture) =>
  runHook(
    {
      tool_name: "Bash",
      tool_input: { command },
      session_id: sessionId,
      cwd: fixture,
    },
    { env: { CLAUDE_PROJECT_DIR: fixture } }
  )

const exhaustQuota = (sessionId) => {
  for (const p of ["a", "b", "c", "d"]) assert.equal(grep(sessionId, p).code, 0)
}

const withFixture = (fn) => () => {
  const fixture = makeFixtureRepo()
  const sessionId = uniqueSessionId()
  try {
    fn(sessionId, fixture)
  } finally {
    cleanupSessionState(sessionId)
    rmSync(fixture, { recursive: true, force: true })
  }
}

test(
  "delegate-to-subagent: blocks the 5th direct Grep in a turn, pointing to repo-scout",
  withFixture((sessionId) => {
    exhaustQuota(sessionId)
    const { code, stderr } = grep(sessionId, "e")
    assert.equal(code, 2)
    assert.match(stderr, /repo-scout/)
  })
)

test(
  "delegate-to-subagent: listing commands never count",
  withFixture((sessionId, fixture) => {
    exhaustQuota(sessionId)
    for (const command of [
      "ls -la apps/api/src",
      "stat apps/api/src/main.ts",
      "wc -l apps/api/src/main.ts",
      "fd -t f main apps/api",
      "find apps/api -name '*.ts'",
    ]) {
      assert.equal(bash(sessionId, command, fixture).code, 0, command)
    }
  })
)

test(
  "delegate-to-subagent: recursive ls and unscoped fd still count",
  withFixture((sessionId, fixture) => {
    exhaustQuota(sessionId)
    assert.equal(bash(sessionId, "ls -R apps", fixture).code, 2)
    assert.equal(bash(sessionId, "fd -t f main", fixture).code, 2)
    assert.equal(bash(sessionId, "fd . .", fixture).code, 2)
  })
)

test(
  "delegate-to-subagent: a redirected { … } group is one redirect, not N navigations",
  withFixture((sessionId, fixture) => {
    exhaustQuota(sessionId)
    const log = path.join(fixture, "out.log")
    const grouped = `{ rg -n foo apps/api/src; cat apps/api/src/main.ts; } > ${log} 2>&1; echo done`
    assert.equal(bash(sessionId, grouped, fixture).code, 0)
    assert.equal(
      bash(sessionId, "{ rg -n foo apps/api/src; }", fixture).code,
      2
    )
  })
)

test(
  "delegate-to-subagent: navigation scoped to harness dirs never counts",
  withFixture((sessionId, fixture) => {
    exhaustQuota(sessionId)
    assert.equal(bash(sessionId, "cat .claude/hooks/x.mjs", fixture).code, 0)
    assert.equal(
      bash(sessionId, "cat .claude/hooks/x.mjs apps/api/src/main.ts", fixture)
        .code,
      2
    )
  })
)

test(
  "delegate-to-subagent: blocks a heavy pnpm script, pointing to shell-runner",
  withFixture((sessionId, fixture) => {
    const { code, stderr } = bash(sessionId, "pnpm test", fixture)
    assert.equal(code, 2)
    assert.match(stderr, /shell-runner/)
  })
)

test(
  "delegate-to-subagent: PLATFORM_DELEGATE_OFF=1 allows everything",
  withFixture((sessionId) => {
    exhaustQuota(sessionId)
    const { code, stderr } = runHook(
      {
        tool_name: "Grep",
        tool_input: { pattern: "e" },
        session_id: sessionId,
      },
      { env: { PLATFORM_DELEGATE_OFF: "1" } }
    )
    assert.equal(code, 0)
    assert.equal(stderr, "")
  })
)

test(
  "delegate-to-subagent: reads under .ca-plans/ never count against the quota",
  withFixture((sessionId, fixture) => {
    for (let i = 0; i < 6; i += 1) {
      const { code } = runHook(
        {
          tool_name: "Read",
          tool_input: {
            file_path: path.join(fixture, ".ca-plans", "feature.md"),
          },
          session_id: sessionId,
          cwd: fixture,
        },
        { env: { CLAUDE_PROJECT_DIR: fixture } }
      )
      assert.equal(code, 0)
    }
  })
)

test(
  "delegate-to-subagent: reset clears the turn navigation counter",
  withFixture((sessionId) => {
    exhaustQuota(sessionId)
    assert.equal(grep(sessionId, "e").code, 2)
    runHook({ session_id: sessionId }, { args: ["reset"] })
    assert.equal(grep(sessionId, "f").code, 0)
  })
)

test("delegate-to-subagent: malformed stdin exits 0 silently", () => {
  const { code, stdout, stderr } = runHook("not json")
  assert.equal(code, 0)
  assert.equal(stdout, "")
  assert.equal(stderr, "")
})
