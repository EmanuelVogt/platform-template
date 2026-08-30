#!/usr/bin/env node
// PreToolUse(Edit|Write|MultiEdit|Bash): handbooks under docs/ and CLAUDE.md /
// AGENTS.md are manuals — mechanism, commands, the one caveat that bites.
// Reasoning, rejected alternatives and history belong in an ADR (docs/adr/README.md
// caps the "Why" at 4 sentences). Three checks on the text a write ADDS:
//   1. growth — an edit may add at most MAX_GROWTH lines net; a new file may
//      have at most MAX_NEW_FILE lines (ADRs: MAX_NEW_ADR);
//   2. rationale prose outside docs/adr — "por quê", "porque", "descartado",
//      "optamos"… and headings like "Why…", "Alternatives", "Context";
//   3. Bash writes into docs/ (heredoc, sed -i, tee, python open(..., 'w')) are
//      refused so the content always passes through Edit/Write and checks 1–2.
// Template files keep the `.md.jinja` suffix and count as handbooks too.
// Ledgers are exempt — they are append-only records, not handbooks, and the cap
// would make the record impossible: docs/advisories/ has its own format (loader +
// hook), and docs/dev/template-changelog.md gains a section per release, where a
// major carries child migration steps (AD-006).
// A longer text is the user's call: PLATFORM_DOCS_LEAN_OFF=1 for that session.
// Harness tooling — not app code.
import { existsSync, readFileSync } from "node:fs"

const MAX_GROWTH = 30
const MAX_NEW_FILE = 80
const MAX_NEW_ADR = 60

const DOC = String.raw`\.md(\.jinja)?`
const HANDBOOK = new RegExp(
  String.raw`(^|/)(docs/(?!adr/|advisories/)[^\n]*${DOC}|\.agents/skills/[^\n]*${DOC}|(CLAUDE|AGENTS)${DOC})$`
)
const ADR = new RegExp(String.raw`(^|/)docs/adr/[^\n]*${DOC}$`)
const FROZEN = /(^|\/)(docs\/advisories\/|docs\/dev\/template-changelog\.md$)/

const RATIONALE_HEADING =
  /^\s{0,3}#{1,6}\s*(por\s*qu[eê]|o\s+que\s+foi\s+descartado|alternativas?|alternatives?|motiva[çc][ãa]o|motivation|contexto|context|hist[óo]rico|history|racional|rationale|why\b)/imu
// JS \b is ASCII-only, so "porquê" would never match at a word end; use Unicode lookarounds.
const RATIONALE_PHRASE =
  /(?<![\p{L}\p{N}])(por\s*qu[eê]|porque|o\s+motivo|descartad[oa]s?|foi\s+decidido|optamos|decidimos|a\s+raz[ãa]o|justificativa|trade-?offs?)(?![\p{L}\p{N}])/iu

let data
try {
  data = JSON.parse(readFileSync(0, "utf8"))
} catch {
  process.exit(0)
}

if (process.env.PLATFORM_DOCS_LEAN_OFF === "1") process.exit(0)

const tool = data.tool_name ?? ""
const input = data.tool_input ?? {}

function block(message) {
  process.stderr.write(
    `${message}\nRule: .agents/skills/code-quality/SKILL.md § Documentation; hook .claude/hooks/docs-stay-lean.mjs. A longer text is the user's call — ask, or PLATFORM_DOCS_LEAN_OFF=1 for this session.\n`
  )
  process.exit(2)
}

if (tool === "Bash") {
  const cmd = String(input.command ?? "")
  const docPath = String.raw`(docs/[^\s"']*${DOC}|(CLAUDE|AGENTS)${DOC})`
  const touchesDocs = new RegExp(String.raw`(^|[\s"'=(])(\./)?${docPath}`).test(
    cmd
  )
  if (!touchesDocs) process.exit(0)
  const writes =
    new RegExp(String.raw`(^|[^<>])>{1,2}\s*["']?(\./)?${docPath}`).test(cmd) ||
    /\bsed\s+(-[a-zA-Z]*i|--in-place)/.test(cmd) ||
    /\btee\b/.test(cmd) ||
    new RegExp(String.raw`(?<!git\s)\b(cp|mv)\b[^|;&]*${docPath}`).test(cmd) ||
    /open\([^)]*['"][wa]\+?['"]/.test(cmd) ||
    /write_?(text|file)\(/.test(cmd)
  if (!writes) process.exit(0)
  block(
    `Shell write into a handbook blocked — \`${cmd.slice(0, 100)}${cmd.length > 100 ? "…" : ""}\`.\nEdit docs with the Edit/Write tools so the text goes through the lean-docs checks (growth cap ${MAX_GROWTH} lines, no rationale prose outside docs/adr).`
  )
}

const filePath = String(input.file_path ?? "")
if (FROZEN.test(filePath)) process.exit(0)
const isAdr = ADR.test(filePath)
const isHandbook = HANDBOOK.test(filePath)
if (!isAdr && !isHandbook) process.exit(0)

const countLines = (s) => (s === "" ? 0 : s.split("\n").length)
const prose = (s) =>
  s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")

let added = 0
let newText = ""
let label = ""

if (tool === "Write") {
  const content = String(input.content ?? "")
  if (existsSync(filePath)) {
    const current = readFileSync(filePath, "utf8")
    added = countLines(content) - countLines(current)
    newText = content
    label = `Write grows \`${filePath}\` by ${added} lines (cap ${MAX_GROWTH})`
  } else {
    const cap = isAdr ? MAX_NEW_ADR : MAX_NEW_FILE
    const lines = countLines(content)
    if (lines > cap) {
      block(
        `New ${isAdr ? "ADR" : "handbook"} \`${filePath}\` has ${lines} lines (cap ${cap}).\nA handbook is mechanism + commands + the caveat that bites; an ADR is decision + "Why" in ≤ 4 sentences + consequences. Cut, or split what is reasoning into an ADR and link it.`
      )
    }
    newText = content
  }
} else {
  const edits = tool === "MultiEdit" ? (input.edits ?? []) : [input]
  const parts = []
  for (const e of edits) {
    const oldS = String(e?.old_string ?? "")
    const newS = String(e?.new_string ?? "")
    added += countLines(newS) - countLines(oldS)
    parts.push(newS)
  }
  newText = parts.join("\n")
  label = `Edit grows \`${filePath}\` by ${added} lines (cap ${MAX_GROWTH})`
}

if (added > MAX_GROWTH) {
  block(
    `${label}.\nA handbook is mechanism + commands + the caveat that bites. Cut to the lines a reader needs to act; reasoning, history and rejected alternatives go to an ADR (link it, don't restate it).`
  )
}

if (!isAdr) {
  const text = prose(newText)
  const heading = text.match(RATIONALE_HEADING)
  const phrase = text.match(RATIONALE_PHRASE)
  if (heading || phrase) {
    const hit = (heading ?? phrase)[0].trim()
    block(
      `Rationale prose in a handbook blocked — "${hit}" in \`${filePath}\`.\nHandbooks say what to do and how; the why, the rejected alternatives and the history live only in an ADR (docs/adr/README.md). Link the ADR and delete the explanation.`
    )
  }
}

process.exit(0)
