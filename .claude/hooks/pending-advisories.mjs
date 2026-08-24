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
  const copierAnswersPath = join(projectDir, ".copier-answers.yml")
  // Only a copier-generated child carries `.copier-answers.yml` — the template repo (the
  // source) never does. ADV-02's "run platform module adopt" nudge is only meaningful for a
  // child; without this file the project cannot be the child ADV-02 talks about.
  const isChild = existsSync(copierAnswersPath)
  const lockPath = join(projectDir, ".platform-modules.lock")
  // `readLock` normalizes a missing file to the same `{ modules: {} }` shape as a lock that
  // is present but genuinely empty — the two are indistinguishable once parsed, so the
  // distinction has to be made here, against the filesystem, before that normalization.
  const lockFileMissing = !existsSync(lockPath)
  const lock = readLock(lockPath)
  const advisories = loadAdvisories(join(projectDir, "docs", "advisories"))
  const ledger = readLedger(
    join(projectDir, "docs", "advisories", "APPLIED.md")
  )
  const origin = readTemplateOrigin(copierAnswersPath)
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
  const entryLines =
    isChild && noLock && lockFileMissing
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
