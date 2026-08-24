#!/usr/bin/env node
// UserPromptSubmit: warns the agent when the session context has become
// expensive, and blocks new work once it is cheaper to restart than to
// continue. Every turn resends the whole conversation, so the cost of a
// session grows with the SQUARE of the turns. Measured 2026-08-17 over 212
// sessions: 80% of all token cost comes from the 22% of sessions with more
// than 200 model turns, and 6 of 9 sessions kept going past 50 turns after a
// checkpoint that told the agent to "ignore silently if mid-task" — median
// final context 174k.
//
// Below HARD_ALERT the hook asks the agent to reach the next natural boundary
// and then choose between two exits and say so to the user: /compact when the
// work goes on in the same direction (the recent turns are still the working
// set), /clear when what remains is a new stretch of work or the direction
// changed — with the Handoff written and a ready-to-paste prompt for the next
// session. At or above HARD_ALERT it asks the agent to stop starting new work
// and hand off now, /clear by default. It still only MEASURES and WARNS: it
// clears nothing, compacts nothing, and which exit fits — and where the
// boundary is — stays with the agent's judgement, not the hook's.
// Harness tooling — not app code.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readContextTokens } from "./lib/transcript-context.mjs"

const FIRST_ALERT = 120_000
const STEP = 60_000
const HARD_ALERT = 250_000

try {
  const input = JSON.parse(readFileSync(0, "utf8"))
  const { transcript_path: transcriptPath, session_id: sessionId } = input
  if (!transcriptPath || !sessionId || !existsSync(transcriptPath))
    process.exit(0)

  const contextTokens = readContextTokens(transcriptPath)
  if (contextTokens < FIRST_ALERT) process.exit(0)

  const bucket = Math.floor((contextTokens - FIRST_ALERT) / STEP)
  const stateFile = join(tmpdir(), `platform-context-checkpoint-${sessionId}`)
  const lastBucket = existsSync(stateFile)
    ? Number(readFileSync(stateFile, "utf8"))
    : Number.NaN
  if (Number.isFinite(lastBucket) && bucket <= lastBucket) process.exit(0)
  writeFileSync(stateFile, String(bucket))

  const thousands = Math.round(contextTokens / 1000)
  const ratio = (contextTokens / 46_000).toFixed(1)
  const exits = [
    "Two exits — you decide which fits, then tell the user in their language, in one line:",
    "• `/compact` — the work continues in the same direction and the recent turns are still the working set (a follow-up of a few turns; a wave mid-feature whose plan is in tasks.md). A summary keeps the thread at a fraction of the cost. Say what must survive the summary (feature, step, constraint).",
    "• `/clear` — what remains is a new stretch of work (dozens of turns) or the direction changed: the conversation is dead weight and disk holds the memory. First write the Handoff (.specs/STATE.md § Handoff, section-scoped), then hand the user a ready-to-paste prompt for the next session, fenced, in their language:",
    '```\nContinue <feature/task>. Load: .specs/STATE.md § Handoff entry "<name>"; <spec/tasks/design paths>. Checkout: <worktree path>, branch <branch>. Next: <the exact next step>. Keep: <1–3 constraints or decisions that must not be lost>.\n```',
  ].join("\n")
  const context =
    contextTokens >= HARD_ALERT
      ? [
          `Context is at ~${thousands}k tokens — beyond the point where continuing is cheaper than restarting. Do NOT start new work: finish only what is mid-flight (a running sub-agent, an uncommitted edit), then hand off now. /clear is the default at this size; /compact only if a wave or fix is mid-flight and its plan is on disk.`,
          exits,
          "If a sub-agent is running, wait for its result, record it, then hand off.",
        ].join("\n\n")
      : [
          `Context checkpoint: ~${thousands}k tokens (fresh session floor ≈ 46k; each turn now costs ~${ratio}× a fresh one).`,
          "Finish the step in progress — never abandon a half-done edit or an in-flight wave — then STOP at the next natural boundary (task committed, wave gated, verifier returned, fix landed).",
          exits,
          "Do not push the boundary further than the current step. Do not mention cost figures to the user; one line plus the prompt (when /clear) is enough.",
        ].join("\n\n")

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: context,
      },
    })
  )
} catch {
  // A context hook must never take the prompt down: any failure exits silently.
}
process.exit(0)
