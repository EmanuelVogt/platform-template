#!/usr/bin/env node
// SessionStart + UserPromptSubmit (first prompt only): surfaces advisories
// pending for modules already installed via `pnpm platform module adopt`,
// filtered by the child's applied-advisories ledger (docs/advisories/APPLIED.md).
// Harness tooling — not app code.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  computePending,
  loadAdvisories,
  readLedger,
} from "../../scripts/platform/lib/advisories.mjs"
import { readLock } from "../../scripts/platform/lib/lock.mjs"
import {
  parseInstalledVersion,
  readTemplateOrigin,
} from "../../scripts/platform/lib/template-version.mjs"

try {
  const input = JSON.parse(readFileSync(0, "utf8"))
  const sessionId = input.session_id
  const hookEventName = input.hook_event_name
  if (!sessionId) process.exit(0)

  if (hookEventName === "UserPromptSubmit") {
    const stateFile = join(tmpdir(), `platform-pending-advisories-${sessionId}`)
    if (existsSync(stateFile)) process.exit(0)
    writeFileSync(stateFile, "1")
  }

  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const lock = readLock(join(projectDir, ".platform-modules.lock"))
  const advisories = loadAdvisories(join(projectDir, "docs", "advisories"))
  const ledger = readLedger(
    join(projectDir, "docs", "advisories", "APPLIED.md")
  )
  const origin = readTemplateOrigin(join(projectDir, ".copier-answers.yml"))
  const templateVersion = origin
    ? parseInstalledVersion(origin.commit)?.version
    : undefined

  const { noLock, pending } = computePending(lock, advisories, ledger, {
    templateVersion,
  })

  const formatAdvisory = (advisory) =>
    `${advisory.id} ${advisory.kind} ${advisory.severity} ${advisory.module}`
  const kernelLines = pending
    .filter((advisory) => advisory.module === "kernel")
    .map(formatAdvisory)
  const entryLines = noLock
    ? ["no .platform-modules.lock — run platform module adopt"]
    : pending
        .filter((advisory) => advisory.module !== "kernel")
        .map(formatAdvisory)
  const lines = [...kernelLines, ...entryLines]

  if (lines.length === 0) process.exit(0)

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext: lines.join("\n"),
      },
    })
  )
} catch {
  // A context hook must never break the prompt or the session start: any failure exits silently.
}
process.exit(0)
