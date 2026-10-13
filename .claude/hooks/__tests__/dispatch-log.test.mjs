import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import assert from "node:assert/strict"
import { runHook, uniqueSessionId } from "./run-hook.mjs"

// a projects dir holding the main transcript `<session>.jsonl`, where the log lands
const withProjects = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "dispatch-log-"))
  const session = uniqueSessionId("dispatch")
  writeFileSync(join(dir, `${session}.jsonl`), "")
  try {
    fn({ dir, session, transcript: join(dir, `${session}.jsonl`) })
  } finally {
    rmSync(dir, { recursive: true, force: true })
    rmSync(join(tmpdir(), `platform-wave-${session}.json`), { force: true })
  }
}

const rows = (dir) =>
  readFileSync(join(dir, "dispatch-log.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))

const dispatch = (ctx, cluster, extra = {}) =>
  runHook(
    "dispatch-log",
    {
      tool_name: "Agent",
      session_id: ctx.session,
      transcript_path: ctx.transcript,
      tool_input: {
        subagent_type: "spec-worker",
        model: "sonnet",
        description: cluster,
        prompt: `Wave 2, cluster ${cluster}`,
      },
      ...extra,
    },
    { args: ["dispatch"] }
  )

test("dispatch-log: logs a dispatch with tier, wave and cluster next to the transcript", () => {
  withProjects((ctx) => {
    assert.equal(dispatch(ctx, "C1").code, 0)
    const [row] = rows(ctx.dir)
    assert.equal(row.ev, "dispatch")
    assert.equal(row.type, "spec-worker")
    assert.equal(row.model, "sonnet")
    assert.equal(row.wave, 2)
    assert.equal(row.cluster, "C1")
  })
})

test("dispatch-log: blocks a wave dispatched one worker at a time, allows serial-ok", () => {
  withProjects((ctx) => {
    const old = Date.now() - 10 * 60 * 1000
    writeFileSync(
      join(tmpdir(), `platform-wave-${ctx.session}.json`),
      JSON.stringify({
        2: { first_ts: old, clusters: { C1: old }, blocked_at: null },
      })
    )
    const split = dispatch(ctx, "C2")
    assert.equal(split.code, 2)
    assert.match(split.stderr, /Wave 2 is being dispatched serially/)
    assert.ok(rows(ctx.dir).some((row) => row.ev === "wave-split"))
  })
})

test("dispatch-log: start and stop rows; a helper stop with no type is dropped", () => {
  withProjects((ctx) => {
    const base = { session_id: ctx.session, transcript_path: ctx.transcript }
    runHook(
      "dispatch-log",
      { ...base, agent_id: "a1", agent_type: "repo-scout" },
      { args: ["start"] }
    )
    runHook(
      "dispatch-log",
      {
        ...base,
        agent_id: "a1",
        agent_type: "repo-scout",
        last_assistant_message: "DONE",
      },
      { args: ["stop"] }
    )
    runHook("dispatch-log", { ...base, agent_type: "" }, { args: ["stop"] })
    assert.deepEqual(
      rows(ctx.dir).map((row) => [row.ev, row.type, row.outcome ?? null]),
      [
        ["start", "repo-scout", null],
        ["stop", "repo-scout", "done"],
      ]
    )
  })
})

test("dispatch-log: malformed stdin exits 0 silently", () => {
  const { code, stdout, stderr } = runHook("dispatch-log", "not json", {
    args: ["dispatch"],
  })

  assert.equal(code, 0)
  assert.equal(stdout, "")
  assert.equal(stderr, "")
})

test("dispatch-log: with no transcript, falls back to ~/.claude/<repo>-dispatch-log.jsonl named after the main checkout", () => {
  const home = mkdtempSync(join(tmpdir(), "dispatch-home-"))
  mkdirSync(join(home, ".claude"))
  try {
    for (const projectDir of [
      "/work/product",
      "/work/product/.worktrees/feat-x",
      "/work/product/.claude/worktrees/feat-y",
    ]) {
      const { code } = runHook(
        "dispatch-log",
        {
          tool_name: "Agent",
          session_id: uniqueSessionId("fallback"),
          tool_input: {
            subagent_type: "repo-scout",
            model: "haiku",
            description: "find it",
          },
        },
        {
          env: { HOME: home, CLAUDE_PROJECT_DIR: projectDir },
          args: ["dispatch"],
        }
      )
      assert.equal(code, 0)
    }
    const logged = readFileSync(
      join(home, ".claude", "product-dispatch-log.jsonl"),
      "utf8"
    )
      .split("\n")
      .filter(Boolean)
    assert.equal(logged.length, 3)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
