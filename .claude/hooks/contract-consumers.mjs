#!/usr/bin/env node
// PostToolUse: when an api contract is edited, lists the front files that
// consume the operations touched. The rule "a contract change is verified on the
// consumer" (AGENTS.md) already existed as text and was forgotten mid-task
// anyway — here it arrives at the moment of the edit, with the files in hand.
// It is not a gate: what actually blocks is turbo typecheck on pre-push.
// Harness tooling — not app code.
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

let data
try {
  data = JSON.parse(readFileSync(0, "utf8"))
} catch {
  process.exit(0)
}

const filePath = data?.tool_input?.file_path ?? ""
const isContract = /\/api\/contracts\/.*\.contract\.ts$/.test(filePath)

if (!isContract) process.exit(0)

const repoRoot = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

const result = spawnSync(
  "node",
  [
    path.join(repoRoot, "scripts", "contract-consumers.mjs"),
    "--for-file",
    filePath,
  ],
  { encoding: "utf8", timeout: 20000 }
)

if (result.status !== 0 || !result.stdout.trim()) process.exit(0)

const lines = result.stdout.trimEnd().split("\n")
const operations = lines.filter((line) => !line.startsWith(" ")).length

// Consolidate by file: the operations of a same contract almost always land in the
// same front files, and repeating the list per operation floods the context.
const files = [
  ...new Set(
    lines.filter((line) => line.startsWith("  ")).map((line) => line.trim())
  ),
]
const shown = files.slice(0, 8)
const rest =
  files.length > shown.length
    ? `\n  … and ${files.length - shown.length} more`
    : ""

process.stderr.write(
  `Contract edited — ${operations} operation(s); ${files.length} front file(s) consume it:
${shown.map((file) => `  ${file}`).join("\n")}${rest}

The edit was ALREADY APPLIED to the file — do NOT retry the same Edit.
Check these files before closing the task. A real break shows up in \`turbo typecheck\`
(after \`pnpm contract\` + rebuilding the dist); what changed in the contract: \`pnpm contract:diff\`.
Per operation: \`pnpm contract:consumers <operationId>\`.
`
)
process.exit(2)
