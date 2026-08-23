#!/usr/bin/env node
// SessionEnd: terminates every dev server the session (or a subagent in a
// worktree) left alive — the backstop for what no-servers-left-behind.mjs
// missed. Preserves what runs in a terminal of the main repo — that one is the
// user's. Detection and killing in lib/dev-servers.mjs. Harness tooling.
import { describe, listServers, terminate } from "./lib/dev-servers.mjs"

// SessionEnd must never fail the shutdown — swallow any top-level crash.
process.on("uncaughtException", () => process.exit(0))

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

const killed = listServers(projectDir)
  .filter((server) => server.detached || server.worktree)
  .filter(terminate)
  .map(describe)

if (killed.length > 0) {
  console.log(
    JSON.stringify({
      systemMessage: `Orphan dev server terminated: ${killed.join(", ")}.`,
    })
  )
}
