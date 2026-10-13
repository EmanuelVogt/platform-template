#!/usr/bin/env node
// SessionEnd: terminates the dev servers THIS session started — they inherit its
// CLAUDE_CODE_SESSION_ID — in any checkout of this repo (main or a linked
// worktree): the backstop for what no-servers-left-behind.mjs missed. Servers of
// another session, and of the user's own terminal, never carry this session's
// id, so they survive. Detection and killing in lib/dev-servers.mjs. Harness
// tooling — not app code.
import { readFileSync } from "node:fs"
import { describe, listServers, terminate } from "./lib/dev-servers.mjs"

// SessionEnd must never fail the shutdown — swallow any top-level crash.
process.on("uncaughtException", () => process.exit(0))

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

const readSessionId = () => {
  try {
    const input = JSON.parse(readFileSync(0, "utf8"))
    if (typeof input.session_id === "string" && input.session_id)
      return input.session_id
  } catch {
    // empty or invalid stdin: fall back to the environment
  }
  return process.env.CLAUDE_CODE_SESSION_ID ?? ""
}

const session = readSessionId()
if (!session) process.exit(0)

const killed = listServers(projectDir, { session })
  .filter(terminate)
  .map(describe)

if (killed.length > 0) {
  console.log(
    JSON.stringify({
      systemMessage: `Orphan dev server terminated: ${killed.join(", ")}.`,
    })
  )
}
