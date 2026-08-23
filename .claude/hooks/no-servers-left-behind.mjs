#!/usr/bin/env node
// SubagentStart `arm` · SubagentStop `sweep`: an agent leaves no dev server
// hanging. `arm` records, when the first agent of a batch starts, which servers
// were already alive (the user's, and the main thread's); `sweep` terminates on
// the last agent's exit everything that appeared since — the leak is the
// `pnpm dev` / `nest start --watch` a worker booted and never killed, which
// holds the port and keeps compiling until the machine is rebooted.
//
// While a sibling is still running the sweep is deferred: a fan-out of workers
// shares the process table, and only the last one out can tell a leak from a
// server another worker is still using. An agent that dies without its stop
// event is dropped from the batch after STALE_MIN; kill-orphan-dev-servers.mjs
// (SessionEnd) remains the backstop for whatever survives all of it.
//
// State per session in the tmpdir, as in dispatch-log.mjs. A stop event never
// fails: every failure exits 0. PLATFORM_SERVER_SWEEP_OFF=1 disables the sweep
// (a server booted by an agent for the main thread to use survives).
// Harness tooling — not app code.
import { readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, listServers, terminate } from "./lib/dev-servers.mjs"

process.on("uncaughtException", () => process.exit(0))

const STALE_MIN = 90

const mode = process.argv[2]
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

const input = (() => {
  try {
    return JSON.parse(readFileSync(0, "utf8"))
  } catch {
    return null
  }
})()

if (!input || process.env.PLATFORM_SERVER_SWEEP_OFF === "1") process.exit(0)

const session = input.session_id
const agent =
  input.agent_id ??
  /agent-([^/\\]+)\.jsonl$/.exec(
    String(input.agent_transcript_path ?? input.transcript_path ?? "")
  )?.[1]

if (typeof session !== "string" || typeof agent !== "string") process.exit(0)

const stateFile = path.join(tmpdir(), `platform-servers-${session}.json`)

const readState = () => {
  try {
    return JSON.parse(readFileSync(stateFile, "utf8"))
  } catch {
    return { live: [] }
  }
}

const writeState = (state) => {
  try {
    writeFileSync(stateFile, JSON.stringify(state))
  } catch {
    // without state the rule degrades to "never sweep" — SessionEnd still cleans
  }
}

const fresh = (live) => {
  const floor = Date.now() - STALE_MIN * 60 * 1000

  return (live ?? []).filter((entry) => (entry.at ?? 0) > floor)
}

const state = readState()
const live = fresh(state.live).filter((entry) => entry.agent !== agent)

if (mode === "arm") {
  const baseline =
    live.length > 0 && Array.isArray(state.baseline)
      ? state.baseline
      : listServers(projectDir).map((server) => server.pid)

  writeState({ baseline, live: [...live, { agent, at: Date.now() }] })
  process.exit(0)
}

if (mode !== "sweep" || !Array.isArray(state.baseline)) process.exit(0)

// Claude Code also fires SubagentStop for its own helper invocations while an
// agent runs (empty agent_type, no transcript). Sweeping on one of those kills
// the server of an agent that is still working.
if (!input.agent_type && !input.agent_transcript_path) process.exit(0)

// A sibling still runs: it owns the sweep when it exits.
if (live.length > 0) {
  writeState({ ...state, live })
  process.exit(0)
}

const known = new Set(state.baseline)
const killed = listServers(projectDir)
  .filter((server) => !known.has(server.pid))
  .filter((server) => server.detached || server.worktree)
  .filter(terminate)
  .map(describe)

writeState({ live: [] })

if (killed.length > 0) {
  console.log(
    JSON.stringify({
      systemMessage: `Server left behind by the subagent, terminated: ${killed.join(", ")}.`,
    })
  )
}
