#!/usr/bin/env node
// PostToolUse: warns when an edit in apps/web hand-writes a set of values that
// openapi.json already defines (ADR 0076). Early feedback — the real gate is
// apps/web/test/contract-enums.test.ts, which runs on pre-push and on CI.
// The match has to be exact: a partial slice of a list does not fire.
// Harness tooling — not app code.
import { readFileSync } from "node:fs"
import path from "node:path"

let data
try {
  data = JSON.parse(readFileSync(0, "utf8"))
} catch {
  process.exit(0)
}

const ti = data.tool_input || {}
const file = ti.file_path || ""

if (!file.includes("/apps/web/src/")) process.exit(0)
if (/\.(test|spec)\.tsx?$/.test(file)) process.exit(0)
if (!/\.tsx?$/.test(file)) process.exit(0)

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

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
let spec
try {
  spec = JSON.parse(readFileSync(path.join(projectDir, "openapi.json"), "utf8"))
} catch {
  process.exit(0)
}

const IGNORED = new Set(["false|true", "asc|desc"])
const keyOf = (values) => [...new Set(values)].sort().join("|")

const contract = new Map()
const isSortParameter = (node) =>
  node.in === "query" &&
  typeof node.name === "string" &&
  /^(sort|order|orderBy|direction)$/.test(node.name)

const walk = (node, where) => {
  if (node === null || typeof node !== "object") return
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, `${where}[${index}]`))
    return
  }
  if (isSortParameter(node)) return
  const values = node.enum
  if (
    Array.isArray(values) &&
    values.length >= 2 &&
    values.every((value) => typeof value === "string")
  ) {
    const key = keyOf(values)
    if (!contract.has(key)) contract.set(key, { values, where })
  }
  for (const [name, value] of Object.entries(node))
    walk(value, `${where}.${name}`)
}
walk(spec, "#")

const candidates = []
for (const block of text.matchAll(/\[[^[\]]*\]/gs)) {
  const body = block[0]
  const objectValues = [...body.matchAll(/\bvalue:\s*["']([^"']+)["']/g)].map(
    (m) => m[1]
  )
  if (objectValues.length >= 2) {
    candidates.push(objectValues)
    continue
  }
  const bare = body.trim().slice(1, -1).trim()
  if (!bare) continue
  if (/^(["'][^"']+["']\s*,\s*)+["'][^"']+["']\s*,?$/.test(bare)) {
    candidates.push([...bare.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]))
  }
}

const hits = []
for (const values of candidates) {
  const key = keyOf(values)
  if (IGNORED.has(key)) continue
  const match = contract.get(key)
  if (match) hits.push(match)
}

if (hits.length === 0) process.exit(0)

const seen = new Set()
const sample = hits
  .filter((hit) => !seen.has(hit.where) && seen.add(hit.where))
  .slice(0, 4)
  .map(
    (hit) => `  ${hit.values.join(", ")}\n    ↳ already defined at ${hit.where}`
  )
  .join("\n")

process.stderr.write(
  `Contract enum retyped by hand (${hits.length}) — ADR 0076, docs/arch/front.md § Contract enums and selects:
${sample}

The edit was ALREADY APPLIED to the file — do NOT retry the same Edit (old_string no longer matches).
Action: make a NEW Edit deriving from the generated const in @platform/api-client/models/*:
  select/filter list → enumOptions(generatedConst, { …pt-BR labels })  (shared/lib/select-options.ts)
  local schema       → z.enum(generatedConst)
  label / badge      → Record<GeneratedType, string>
A set that does NOT exist in the contract (map layer, scale, tab) is pure UI: keep it literal.
`
)
process.exit(2)
