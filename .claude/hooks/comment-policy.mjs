#!/usr/bin/env node
// PostToolUse: detects a comment added in an Edit/Write/MultiEdit. Two levels:
// a certain mechanical violation (TODO with no condition, banner, eslint-disable) → exit 2;
// a generic comment → non-blocking additionalContext (the edit was ALREADY applied; a
// "failed" here sends a subagent into a retry spiral). Harness tooling — not app code.
import { readFileSync } from "node:fs"

let data
try {
  data = JSON.parse(readFileSync(0, "utf8"))
} catch {
  process.exit(0)
}

const ti = data.tool_input || {}
const file = ti.file_path || ""

if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) process.exit(0)
if (
  file.endsWith(".d.ts") ||
  file.includes("/generated/") ||
  file.includes("/node_modules/") ||
  file.includes("/.claude/")
) {
  process.exit(0)
}

const chunks = []
if (typeof ti.content === "string") chunks.push(ti.content)
if (typeof ti.new_string === "string") chunks.push(ti.new_string)
if (Array.isArray(ti.edits)) {
  for (const e of ti.edits) {
    if (e && typeof e.new_string === "string") chunks.push(e.new_string)
  }
}
const text = chunks.join("\n")
if (!text.trim()) process.exit(0)

const startsComment = (t) =>
  t.startsWith("//") || t.startsWith("/*") || /^\{\/\*/.test(t)
// a `* ...` line is only a comment as a block continuation — standalone, it is something else
const continuesComment = (t) => t.startsWith("*")

const lines = text.split("\n").map((l) => l.trim())
const blocks = []
let current = null
for (const t of lines) {
  if (startsComment(t) || (current !== null && continuesComment(t))) {
    if (current === null) current = []
    current.push(t)
  } else {
    if (current !== null) blocks.push(current)
    current = null
  }
}
if (current !== null) blocks.push(current)
if (blocks.length === 0) process.exit(0)

const flat = blocks.flat()
const violations = []
for (const t of flat) {
  if (/eslint-disable/.test(t)) {
    violations.push({
      line: t,
      why: "suppressing lint is forbidden — fix the code",
    })
  } else if (
    /^(\/\/|\/\*|\*)\s*(TODO|FIXME)\b/i.test(t) &&
    !/\(.*(20\d\d|#\d+|issue).*\)/i.test(t)
  ) {
    violations.push({
      line: t,
      why: "TODO/FIXME without a measurable condition (date/issue) is forbidden",
    })
  } else if (/^(\/\/|\/\*)\s*[=\-#*~_]{4,}/.test(t)) {
    violations.push({ line: t, why: "visual banner/separator is forbidden" })
  }
}

const APPLIED =
  "The edit was ALREADY APPLIED to the file — do NOT retry the same Edit (old_string no longer matches)."

if (violations.length > 0) {
  const sample = violations
    .slice(0, 6)
    .map((v) => `  ${v.line}\n    ↳ ${v.why}`)
    .join("\n")
  process.stderr.write(
    `Mechanical comment violation (${violations.length}) — .agents/skills/code-quality/SKILL.md:
${sample}

${APPLIED}
Action: make a NEW Edit removing/fixing only the lines above.
`
  )
  process.exit(2)
}

const sample = blocks
  .slice(0, 4)
  .map((b) => "  " + b[0] + (b.length > 1 ? ` (+${b.length - 1} lines)` : ""))
  .join("\n")

// A comment that tells a business story ("came from legacy", "usually") with no source on
// the same line is the code-level twin of the unsourced reply — a nudge, not a block.
const NARRATIVE =
  /(legado|legacy|[ée] comum|costuma|geralmente|normalmente|historicamente|a ideia [ée]|sempre foi|por conven[çc][ãa]o|historically|usually|typically|it'?s common|always been|the idea (is|was)|by convention)/i
const SOURCED = /(\bAD-\d+\b|\bADR\b|\bspec\b|#\d+|\.md\b|usu[áa]rio|\buser\b)/i
const unsourced = flat.filter((t) => NARRATIVE.test(t) && !SOURCED.test(t))
const narrative =
  unsourced.length === 0
    ? ""
    : `\nUnsourced narrative (${unsourced.length}): ${unsourced.slice(0, 3).join(" | ")} — a comment states a business reason, history or frequency only with its source beside it (AD-nn, spec, the user's words); without one, delete it or ask the user.`

const context = `Comment added in this edit (${blocks.length} block(s)) — ${APPLIED}
${sample}${narrative}
Validate against .agents/skills/code-quality/SKILL.md (default ZERO; valid cases: an invariant the type does not capture / an external workaround with a reference / a domain constraint outside the adjacent code / a counterintuitive decision another dev would "fix"; JSDoc only on public API). If any does not fit, remove it with a NEW Edit; while you are there, clean up pre-existing noise comments in the region you touched.`

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: context,
    },
  })
)
process.exit(0)
