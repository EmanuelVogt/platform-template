#!/usr/bin/env node
// PreToolUse(Bash): blocks a heavy run (test, gate, build, dev, install) while
// the machine is already busy. Several Claude tabs coexist fine; several test
// suites do not — the sibling harness this was ported from ran its box out of
// memory with parallel vitest runs; a saturated machine also makes a gate lie
// (a red that is only contention).
// The decision is "deny", never "ask": a hook prompt stalls whoever waits on
// the agent (2026-09-14: a worker's scoped gate froze a full-cycle wave on a
// dialog nobody was there to answer, on the sibling harness). The reason goes back to the agent as the
// tool result, with the way out: wait with `--wait`, then retry the same
// command — the guard re-evaluates on every call.
// Two independent triggers:
//   1. another heavy run alive in ANY checkout of this machine — a real
//      runner process, by executable and CPU, never a shell that mentions one
//      (lib/heavy-runs.mjs);
//   2. the machine under pressure — load average above the core count, or free
//      memory below a floor — which catches load the patterns do not know about.
// A dev server (turbo/pnpm dev, next dev, nest start --watch, tsc --watch) and
// the turbo daemon are long-lived by design and never count as a running heavy job;
// starting one is still gated, because it competes with a suite in flight.
// CLI: `node heavy-run-guard.mjs --wait [minutes]` blocks until the machine is
// free by the same rules (exit 0) or the deadline passes (exit 1, default 10).
// Overrides: the human, in the main session, prefixes the command with
// `PLATFORM_HEAVY_GUARD_OFF=1`; inside a subagent the prefix is ignored — the
// call is never the user's. The same variable in the process environment turns
// the guard off entirely, for debugging the harness itself.
// Harness tooling — not app code.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  describeJobs,
  meminfoFreePct,
  readProcesses,
  scanJobs,
} from "./lib/heavy-runs.mjs"
import { firstSegment, statements } from "./lib/shell-statements.mjs"

const LOAD_FACTOR = 1.2
const MEM_FREE_PCT_MIN = 25
const WAIT_DEFAULT_MIN = 10
const WAIT_POLL_MS = 15_000
const OVERRIDE = "PLATFORM_HEAVY_GUARD_OFF"

// commands that START a heavy run — the ones this guard gates
const STARTER_CMDS = new Set([
  "vitest",
  "jest",
  "playwright",
  "tsc",
  "eslint",
  "turbo",
  "prettier",
  "next",
  "nest",
])
const STARTER_PNPM =
  /^(test(:\w+)?|typecheck|check(:\w+)?|lint(:\w+)?|build|contract(:check)?|format(:\w+)?|dev(:\w+)?|install|i|add|update|up)$/
const STARTER_DOCKER = /^docker(-compose)?$/

process.on("uncaughtException", () => process.exit(0))

if (process.env[OVERRIDE] === "1") process.exit(0)

// free-memory percentage: MemAvailable on Linux, memory_pressure on macOS;
// 100 (no pressure) where neither answers. Swap usage is not usable here: macOS
// keeps gigabytes of swap allocated long after the pressure that caused it is gone.
const memFreePct = () => {
  try {
    const pct = meminfoFreePct(readFileSync("/proc/meminfo", "utf8"))
    if (pct !== null) return pct
  } catch {
    // not Linux: ask macOS below
  }
  try {
    const report = execFileSync("memory_pressure", ["-Q"], {
      encoding: "utf8",
      timeout: 2000,
    })
    return Number(report.match(/free percentage:\s*(\d+)%/)?.[1] ?? 100)
  } catch {
    return 100
  }
}

// what keeps the machine busy right now — the single source of truth for the
// guard and for `--wait`, so "free" means the same thing in both
const busy = () => {
  const jobs = scanJobs(readProcesses()).filter((job) => !job.idle)
  const cores = os.cpus().length || 1
  const load = os.loadavg()[0]
  const memFree = memFreePct()
  const pressure = []
  if (load > cores * LOAD_FACTOR)
    pressure.push(`load average ${load.toFixed(1)} on ${cores} cores`)
  if (memFree < MEM_FREE_PCT_MIN)
    pressure.push(`only ${memFree}% of memory free`)
  return { jobs, pressure, free: jobs.length === 0 && pressure.length === 0 }
}

const describe = ({ jobs, pressure }) => {
  const lines = jobs.length > 0 ? [describeJobs(jobs)] : []
  if (pressure.length > 0)
    lines.push(`  • machine under pressure: ${pressure.join(", ")}`)
  return lines.join("\n")
}

// strips `rtk` (global proxy), env prefixes and wrappers like `time`/`nice`
const head = (tokens) => {
  let i = 0
  while (i < tokens.length && /^[A-Z_][A-Z0-9_]*=/.test(tokens[i])) i++
  if (tokens[i] === "rtk") i++
  if (["sudo", "time", "nice", "env"].includes(tokens[i])) i++
  return { cmd: path.basename(tokens[i] ?? ""), rest: tokens.slice(i + 1) }
}

const pnpmScript = (rest) => {
  let i = 0
  while (i < rest.length) {
    if (rest[i] === "--filter" || rest[i] === "-F" || rest[i] === "-C") i += 2
    else if (
      rest[i] === "run" ||
      rest[i] === "exec" ||
      rest[i] === "dlx" ||
      /^-/.test(rest[i])
    )
      i++
    else break
  }
  return rest[i] ?? ""
}

// the heavy statement this command would start, or '' — a compound command is
// classified by any of its statements, each by its first pipe segment —
// quoted text and heredoc bodies are never statements
const starter = (line) => {
  for (const statement of statements(line)) {
    const tokens = firstSegment(statement).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    const { cmd, rest } = head(tokens)
    if (!cmd) continue
    if (STARTER_CMDS.has(cmd)) return statement
    if (cmd === "npx" && STARTER_CMDS.has(path.basename(rest[0] ?? "")))
      return statement
    if (cmd === "pnpm" || cmd === "npm" || cmd === "yarn") {
      const script = pnpmScript(rest)
      if (STARTER_PNPM.test(script) || STARTER_CMDS.has(script))
        return statement
    }
    if (STARTER_DOCKER.test(cmd) && /\b(build|up)\b/.test(rest.join(" ")))
      return statement
  }
  return ""
}

// `--wait [minutes]`: block until the machine is free by the guard's own rules
const wait = () => {
  const minutes = Number(process.argv[3]) || WAIT_DEFAULT_MIN
  const deadline = Date.now() + minutes * 60_000
  const poll = () => {
    const state = busy()
    if (state.free) {
      process.stdout.write(
        "Machine free — repeat the command that was blocked.\n"
      )
      process.exit(0)
    }
    if (Date.now() >= deadline) {
      process.stdout.write(
        `Machine still busy after ${minutes} min:\n${describe(state)}\nDo not insist: report to the orchestrator or the user.\n`
      )
      process.exit(1)
    }
    setTimeout(poll, WAIT_POLL_MS)
  }
  poll()
}

const guard = () => {
  let data
  try {
    data = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    return
  }

  const command = data.tool_input?.command
  if (typeof command !== "string") return

  const heavy = starter(command)
  if (!heavy) return

  // the human's in-band override — main session only: a subagent's call is
  // never the user's decision, so the prefix does nothing there. A caller with
  // no human-typed Bash at all (Codex) marks every call as agent through
  // PLATFORM_HEAVY_GUARD_CALLER=codex.
  const inSubagent =
    Boolean(data.agent_id) ||
    process.env.PLATFORM_HEAVY_GUARD_CALLER === "codex"
  if (!inSubagent && new RegExp(`(^|[\\s;&|(])${OVERRIDE}=1\\s`).test(command))
    return

  const state = busy()
  if (state.free) return

  const risk =
    state.jobs.length > 0
      ? `Two heavy runs at once is what runs this machine out of memory. And on a contended
machine the result is not reliable: the gate can go red for lack of CPU with nothing
wrong in the code.`
      : `With the machine in this state the result is not reliable: the gate can go red for lack
of CPU with nothing wrong in the code — and this is how it runs out of memory.`

  const waitCmd = `node "${path.resolve(process.argv[1])}" --wait`
  const override = inSubagent
    ? ""
    : `\n\nTo run it anyway — the user's decision, never the agent's — prefix the command with ${OVERRIDE}=1.`

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Heavy command blocked — the machine is already busy.
Command:
  ${heavy.length > 120 ? `${heavy.slice(0, 120)}…` : heavy}
Busy right now:
${describe(state)}

${risk}

How to proceed:
  1. Wait for it to free up: \`${waitCmd}\` blocks until the machine is free by these same
     rules (max ${WAIT_DEFAULT_MIN} min — run it with a 600000 ms timeout or in the background). When
     it exits 0, repeat this same command: the guard re-evaluates on every call.
  2. While waiting, move on with what does not depend on this command.
  3. If a pinpoint answer is enough, run a single test file instead of the suite.
  If it is still busy after the wait, report instead of insisting.${override}`,
      },
    })
  )
}

if (process.argv[2] === "--wait") wait()
else guard()
