import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { firstSegment, statements } from "../lib/shell-statements.mjs"
import { cleanupSessionState, runHook, uniqueSessionId } from "./run-hook.mjs"

const COMMIT = `git add -- a.mjs && git commit -m "fix(harness): x

A shell, pgrep or until-loop no longer holds the machine;
tree is ignored. ls && grep here are words.
pnpm test --run is a word too" -- a.mjs`

const HEREDOC = `python3 - <<'EOF'
s = open('x').read()
tree = 1; grep = 2
EOF
ls apps`

describe("statements", () => {
  test("separators inside double quotes stay in the statement", () => {
    const parts = statements(COMMIT)
    assert.equal(parts.length, 2)
    assert.equal(parts[0], "git add -- a.mjs")
    assert.match(parts[1], /^git commit -m "fix/)
    assert.match(parts[1], /-- a\.mjs$/)
  })

  test("single quotes and escapes", () => {
    assert.deepEqual(statements(`echo 'a; b' && echo "c \\" ; d"; ls`), [
      `echo 'a; b'`,
      `echo "c \\" ; d"`,
      "ls",
    ])
  })

  test("a heredoc body belongs to the statement that opened it", () => {
    const parts = statements(HEREDOC)
    assert.equal(parts.length, 2)
    assert.match(parts[0], /^python3 - <<'EOF'\n[\s\S]*\nEOF$/)
    assert.equal(parts[1], "ls apps")
  })

  test("plain separators still split", () => {
    assert.deepEqual(statements("a && b || c; d\ne"), ["a", "b", "c", "d", "e"])
  })

  test("first pipe segment ignores pipes in quotes and ||", () => {
    assert.equal(
      firstSegment(`grep -E "a|b" file | head`),
      `grep -E "a|b" file`
    )
    assert.equal(firstSegment("a || b"), "a || b")
  })
})

const run = (hook, command, extra = {}) =>
  runHook(
    hook,
    { tool_name: "Bash", tool_input: { command }, ...extra },
    { env: { PLATFORM_DELEGATE_OFF: "" } }
  )

describe("delegate-to-subagent", () => {
  test("a commit message with navigation words is not navigation", () => {
    const session = uniqueSessionId("statements")
    try {
      for (let i = 0; i < 6; i++)
        assert.equal(
          run("delegate-to-subagent", COMMIT, { session_id: session }).code,
          0
        )
    } finally {
      cleanupSessionState(session)
    }
  })

  test("real navigation past the quota is still blocked", () => {
    const session = uniqueSessionId("statements")
    try {
      const codes = [1, 2, 3, 4, 5].map(
        () =>
          run("delegate-to-subagent", "rg -n foo apps", { session_id: session })
            .code
      )
      assert.deepEqual(codes, [0, 0, 0, 0, 2])
    } finally {
      cleanupSessionState(session)
    }
  })
})
