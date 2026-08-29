#!/usr/bin/env node
// PreToolUse(Edit|Write|MultiEdit): a ca-full-cycle run cannot close with an
// unretro'd QA finding. Fires on a write that sets `Status: Done` in a plan
// file under a run's directory in the ca-plans tree; reads the sibling
// review.md and requires every QA Log finding line (`- F<n> · ...`) to carry
// its closing marker (`→ L-nn`, `→ brief-error`, `→ preference`), and every
// `→ L-nn` to resolve to an entry with a `guard:` field in the tree's
// LESSONS.md ledger. Contract: the ca-full-cycle skill's review reference,
// § 3.5 — runtime artifacts, created by runs, not shipped with the repo.
// Escape hatch for debugging the harness itself: PLATFORM_RETRO_OFF=1.
// Harness tooling — not app code.
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"

let data
try {
  data = JSON.parse(readFileSync(0, "utf8"))
} catch {
  process.exit(0)
}

if (process.env.PLATFORM_RETRO_OFF === "1") process.exit(0)

const filePath = data.tool_input?.file_path ?? ""
if (!/(^|\/)[.]ca-plans\/[^/]+\/plan[^/]*[.]md$/.test(filePath)) process.exit(0)

const texts = []
if (typeof data.tool_input?.content === "string")
  texts.push(data.tool_input.content)
if (typeof data.tool_input?.new_string === "string")
  texts.push(data.tool_input.new_string)
for (const edit of data.tool_input?.edits ?? []) {
  if (typeof edit?.new_string === "string") texts.push(edit.new_string)
}
if (!texts.some((text) => /Status:\s*Done\b/.test(text))) process.exit(0)

const runDir = dirname(filePath)
const reviewPath = join(runDir, "review.md")
if (!existsSync(reviewPath)) process.exit(0)

const review = readFileSync(reviewPath, "utf8")
const qaLog = review.split(/^## QA Log\b[^\n]*$/m)[1]?.split(/^## /m)[0] ?? ""
const findingLines = qaLog
  .split("\n")
  .filter((line) => /^\s*-\s*F\d+\b/.test(line))

const unmarked = findingLines.filter(
  (line) => !/→\s*(L-\d+|brief-error|preference)\b/.test(line)
)

const lessonsPath = join(dirname(runDir), "LESSONS.md")
const lessonLines = existsSync(lessonsPath)
  ? readFileSync(lessonsPath, "utf8").split("\n")
  : []
const missingLessons = []
const guardlessLessons = []
for (const line of findingLines) {
  const ref = line.match(/→\s*(L-\d+)\b/)?.[1]
  if (!ref) continue
  const entry = lessonLines.find((lesson) =>
    new RegExp(`^${ref}\\b`).test(lesson)
  )
  if (!entry) missingLessons.push(ref)
  else if (!/guard:\s*\S/.test(entry)) guardlessLessons.push(ref)
}

if (
  unmarked.length === 0 &&
  missingLessons.length === 0 &&
  guardlessLessons.length === 0
) {
  process.exit(0)
}

const problems = []
if (unmarked.length > 0) {
  const samples = unmarked.map((line) => line.trim().slice(0, 70)).join(" | ")
  problems.push(
    `${unmarked.length} QA finding(s) without a retro marker: ${samples}`
  )
}
if (missingLessons.length > 0) {
  problems.push(
    `marker(s) pointing to no LESSONS.md entry: ${missingLessons.join(", ")}`
  )
}
if (guardlessLessons.length > 0) {
  problems.push(
    `LESSONS.md entr(ies) without a \`guard:\` field: ${guardlessLessons.join(", ")}`
  )
}
process.stderr.write(
  `\`Status: Done\` blocked — unfinished QA retro in ${reviewPath}.
${problems.join("\n")}
Every escaped bug closes with root cause + guard + a LESSONS.md line, and every QA Log finding line ends with → L-nn | brief-error | preference (ca-full-cycle review.md § 3.5). Debugging: PLATFORM_RETRO_OFF=1.
`
)
process.exit(2)
