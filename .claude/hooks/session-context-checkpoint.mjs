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
// Below HARD_ALERT the hook asks for a Handoff at the next natural boundary,
// without abandoning work in flight. At or above HARD_ALERT it asks the
// agent to stop starting new work altogether and hand off now. It still
// only MEASURES and WARNS: it clears nothing, and deciding where the
// boundary is stays with the agent's judgement, not the hook's.
// Harness tooling — not app code.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readContextTokens } from "./lib/transcript-context.mjs";

const FIRST_ALERT = 120_000;
const STEP = 60_000;
const HARD_ALERT = 250_000;

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const { transcript_path: transcriptPath, session_id: sessionId } = input;
  if (!transcriptPath || !sessionId || !existsSync(transcriptPath)) process.exit(0);

  const contextTokens = readContextTokens(transcriptPath);
  if (contextTokens < FIRST_ALERT) process.exit(0);

  const bucket = Math.floor((contextTokens - FIRST_ALERT) / STEP);
  const stateFile = join(tmpdir(), `platform-context-checkpoint-${sessionId}`);
  const lastBucket = existsSync(stateFile) ? Number(readFileSync(stateFile, "utf8")) : Number.NaN;
  if (Number.isFinite(lastBucket) && bucket <= lastBucket) process.exit(0);
  writeFileSync(stateFile, String(bucket));

  const thousands = Math.round(contextTokens / 1000);
  const ratio = (contextTokens / 46_000).toFixed(1);
  const context =
    contextTokens >= HARD_ALERT
      ? [
          `Context is at ~${thousands}k tokens — beyond the point where continuing is cheaper than restarting. Do NOT start new work: finish only what is mid-flight (a running sub-agent, an uncommitted edit), write the Handoff now and ask the user for /clear before anything else.`,
          "If a sub-agent is running, wait for its result, record it, then hand off.",
        ].join("\n\n")
      : [
          `Context checkpoint: ~${thousands}k tokens (fresh session floor ≈ 46k; each turn now costs ~${ratio}× a fresh one).`,
          "Finish the step in progress — never abandon a half-done edit or an in-flight wave — then STOP at the next natural boundary (task committed, wave gated, verifier returned, fix landed): write the Handoff (.specs/STATE.md § Handoff, section-scoped) and tell the user explicitly, in their language, that it is time for /clear and exactly what to load next (spec/tasks path, worktree, branch, next step).",
          "Do not push the boundary further than the current step. Do not mention cost figures to the user; one line is enough.",
        ].join("\n\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context },
    }),
  );
} catch {
  // A context hook must never take the prompt down: any failure exits silently.
}
process.exit(0);
