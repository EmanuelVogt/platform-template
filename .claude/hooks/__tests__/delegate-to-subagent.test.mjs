import { join } from "node:path"
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  cleanupSessionState,
  makeFixtureRepo,
  removeFixtureRepo,
  runHook,
  uniqueSessionId,
} from "./run-hook.mjs"

const grep = (sessionId, pattern) =>
  runHook("delegate-to-subagent", {
    tool_name: "Grep",
    tool_input: { pattern },
    session_id: sessionId,
  })

const bash = (sessionId, command, fixture) =>
  runHook(
    "delegate-to-subagent",
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

test("delegate-to-subagent: blocks the 5th direct Grep in a turn, pointing to repo-scout", () => {
  const sessionId = uniqueSessionId("delegate")
  try {
    exhaustQuota(sessionId)
    const { code, stderr } = grep(sessionId, "e")

    assert.equal(code, 2)
    assert.match(stderr, /repo-scout/)
  } finally {
    cleanupSessionState(sessionId)
  }
})

test("delegate-to-subagent: listing commands never count", () => {
  const fixture = makeFixtureRepo()
  const sessionId = uniqueSessionId("delegate")
  try {
    exhaustQuota(sessionId)
    for (const command of [
      "ls -la apps/api",
      "stat apps/api/src/main.ts",
      "wc -l apps/api/src/main.ts",
      "fd -t f main apps/api",
      "find apps/api -name '*.ts'",
    ]) {
      assert.equal(bash(sessionId, command, fixture).code, 0, command)
    }
  } finally {
    cleanupSessionState(sessionId)
    removeFixtureRepo(fixture)
  }
})

test("delegate-to-subagent: recursive ls and unscoped fd still count", () => {
  const fixture = makeFixtureRepo()
  const sessionId = uniqueSessionId("delegate")
  try {
    exhaustQuota(sessionId)
    assert.equal(bash(sessionId, "ls -R apps", fixture).code, 2)
    assert.equal(bash(sessionId, "fd -t f main", fixture).code, 2)
    assert.equal(bash(sessionId, "fd . .", fixture).code, 2)
  } finally {
    cleanupSessionState(sessionId)
    removeFixtureRepo(fixture)
  }
})

test("delegate-to-subagent: a redirected { … } group is one redirect, not N navigations", () => {
  const fixture = makeFixtureRepo()
  const sessionId = uniqueSessionId("delegate")
  try {
    exhaustQuota(sessionId)
    const command =
      "{ rg -n foo apps/api; cat apps/api/src/main.ts; } > /tmp/out.txt 2>&1; echo done"
    assert.equal(bash(sessionId, command, fixture).code, 0)
    assert.equal(bash(sessionId, "{ rg -n foo apps/api; }", fixture).code, 2)
  } finally {
    cleanupSessionState(sessionId)
    removeFixtureRepo(fixture)
  }
})

test("delegate-to-subagent: navigation scoped to harness dirs never counts", () => {
  const fixture = makeFixtureRepo()
  const sessionId = uniqueSessionId("delegate")
  try {
    exhaustQuota(sessionId)
    assert.equal(bash(sessionId, "cat .specs/feature.md", fixture).code, 0)
    assert.equal(bash(sessionId, "rg -n foo .claude/hooks", fixture).code, 0)
    assert.equal(
      bash(sessionId, "cat .specs/feature.md apps/api/src/main.ts", fixture)
        .code,
      2
    )
  } finally {
    cleanupSessionState(sessionId)
    removeFixtureRepo(fixture)
  }
})

test("delegate-to-subagent: blocks a heavy pnpm script, pointing to shell-runner", () => {
  for (const command of ["pnpm test", "pnpm contract", "pnpm typecheck"]) {
    const sessionId = uniqueSessionId("delegate")
    try {
      const { code, stderr } = runHook("delegate-to-subagent", {
        tool_name: "Bash",
        tool_input: { command },
        session_id: sessionId,
      })

      assert.equal(code, 2, command)
      assert.match(stderr, /shell-runner/)
    } finally {
      cleanupSessionState(sessionId)
    }
  }
})

test("delegate-to-subagent: contract queries are not heavy runs", () => {
  const sessionId = uniqueSessionId("delegate")
  try {
    for (const command of [
      "pnpm contract:consumers getBooking",
      "pnpm contract:diff",
    ]) {
      const { code } = runHook("delegate-to-subagent", {
        tool_name: "Bash",
        tool_input: { command },
        session_id: sessionId,
      })
      assert.equal(code, 0, command)
    }
  } finally {
    cleanupSessionState(sessionId)
  }
})

test("delegate-to-subagent: PLATFORM_DELEGATE_OFF=1 allows everything", () => {
  const sessionId = uniqueSessionId("delegate")
  try {
    exhaustQuota(sessionId)
    const { code, stderr } = runHook(
      "delegate-to-subagent",
      {
        tool_name: "Grep",
        tool_input: { pattern: "e" },
        session_id: sessionId,
      },
      { env: { PLATFORM_DELEGATE_OFF: "1" } }
    )

    assert.equal(code, 0)
    assert.equal(stderr, "")
  } finally {
    cleanupSessionState(sessionId)
  }
})

test("delegate-to-subagent: reads under .specs/ and .ca-plans/ never count against the quota", () => {
  const fixture = makeFixtureRepo()
  const sessionId = uniqueSessionId("delegate")
  try {
    for (let i = 0; i < 6; i += 1) {
      const { code } = runHook(
        "delegate-to-subagent",
        {
          tool_name: "Read",
          tool_input: {
            file_path: join(
              fixture,
              i % 2 ? ".specs/feature.md" : ".ca-plans/fixture/plan.md"
            ),
          },
          session_id: sessionId,
          cwd: fixture,
        },
        { env: { CLAUDE_PROJECT_DIR: fixture } }
      )
      assert.equal(code, 0)
    }
  } finally {
    cleanupSessionState(sessionId)
    removeFixtureRepo(fixture)
  }
})

test("delegate-to-subagent: reset clears the turn navigation counter", () => {
  const sessionId = uniqueSessionId("delegate")
  try {
    exhaustQuota(sessionId)
    assert.equal(grep(sessionId, "e").code, 2)

    runHook(
      "delegate-to-subagent",
      { session_id: sessionId },
      { args: ["reset"] }
    )

    assert.equal(grep(sessionId, "f").code, 0)
  } finally {
    cleanupSessionState(sessionId)
  }
})

test("delegate-to-subagent: malformed stdin exits 0 silently", () => {
  const { code, stdout, stderr } = runHook("delegate-to-subagent", "not json")

  assert.equal(code, 0)
  assert.equal(stdout, "")
  assert.equal(stderr, "")
})

const read = (sessionId, fixture, filePath, extra = {}) =>
  runHook(
    "delegate-to-subagent",
    {
      tool_name: "Read",
      tool_input: { file_path: join(fixture, filePath), limit: 100 },
      session_id: sessionId,
      cwd: fixture,
      ...extra,
    },
    { env: { CLAUDE_PROJECT_DIR: fixture } }
  )

test("delegate-to-subagent: a commit message that mentions navigation commands is text", () => {
  const fixture = makeFixtureRepo()
  const sessionId = uniqueSessionId("delegate")
  try {
    exhaustQuota(sessionId)
    const commit =
      'git commit -m "fix(hooks): x\n\ntree is ignored; ls && grep here are words" -- a.mjs'
    assert.equal(bash(sessionId, commit, fixture).code, 0)
  } finally {
    cleanupSessionState(sessionId)
    removeFixtureRepo(fixture)
  }
})

test("delegate-to-subagent: the per-turn Read byte budget blocks paging through a file, reset clears it", () => {
  const fixture = makeFixtureRepo()
  const sessionId = uniqueSessionId("delegate")
  try {
    assert.equal(read(sessionId, fixture, ".specs/feature.md").code, 0)
    const { code, stderr } = read(sessionId, fixture, "big.json")
    assert.equal(code, 2)
    assert.match(stderr, /Read budget for this turn exhausted/)
    runHook(
      "delegate-to-subagent",
      { session_id: sessionId },
      { args: ["reset"] }
    )
    assert.equal(read(sessionId, fixture, ".specs/feature.md").code, 0)
  } finally {
    cleanupSessionState(sessionId)
    removeFixtureRepo(fixture)
  }
})

test("delegate-to-subagent: inside a spec-worker navigation and gates are free, the byte budget applies", () => {
  const fixture = makeFixtureRepo()
  const sessionId = uniqueSessionId("delegate")
  const worker = { agent_id: "w1", agent_type: "spec-worker" }
  try {
    for (let i = 0; i < 8; i += 1) {
      const { code } = runHook(
        "delegate-to-subagent",
        {
          tool_name: "Bash",
          tool_input: { command: "rg -n foo apps/api" },
          session_id: sessionId,
          cwd: fixture,
          ...worker,
        },
        { env: { CLAUDE_PROJECT_DIR: fixture } }
      )
      assert.equal(code, 0)
    }
    const gate = runHook(
      "delegate-to-subagent",
      {
        tool_name: "Bash",
        tool_input: { command: "pnpm test" },
        session_id: sessionId,
        cwd: fixture,
        ...worker,
      },
      { env: { CLAUDE_PROJECT_DIR: fixture } }
    )
    assert.equal(gate.code, 0)
    const big = runHook(
      "delegate-to-subagent",
      {
        tool_name: "Read",
        tool_input: { file_path: join(fixture, "big.json") },
        session_id: sessionId,
        cwd: fixture,
        ...worker,
      },
      { env: { CLAUDE_PROJECT_DIR: fixture } }
    )
    assert.equal(big.code, 0)
    assert.equal(read(sessionId, fixture, "big.json", worker).code, 2)
  } finally {
    cleanupSessionState(sessionId)
    cleanupSessionState(`${sessionId}-w1`)
    removeFixtureRepo(fixture)
  }
})
