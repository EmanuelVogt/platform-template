#!/usr/bin/env node
// PreToolUse(Edit|Write|MultiEdit): everything under `.ca-plans/` is written in
// English — research, plan, review, decisions, handoffs. Agents are the only
// readers, and every artifact is re-read on every turn of every session for
// the life of the run; pt-BR prose costs ~30-40% more tokens for the same
// content. Rule in .agents/skills/dev-workflow/SKILL.md and the ca-full-cycle skill
// (SKILL.md § Critical Rules). This hook blocks a write whose new text reads
// as pt-BR prose. Quoted product strings ("Sem horário") inside English prose
// stay under the threshold by construction; a pt-BR paragraph does not.
// Escape hatch for debugging the harness itself: PLATFORM_SPECS_LANG_OFF=1.
// Harness tooling — not app code.
import { readFileSync } from "node:fs"

const MIN_WORDS = 12
const STOPWORD_RATIO = 0.1
const BOOSTED_STOPWORD_RATIO = 0.05
const BOOST_DIACRITIC_RATIO = 0.1

// pt-BR function words that are not English words. Deliberately excludes
// "no", "do", "a", "e", "o", "as", "os", "de", "em" — too ambiguous or too
// present in slugs and English text.
const PT_STOPWORDS = new Set([
  "não",
  "nao",
  "uma",
  "que",
  "para",
  "com",
  "porque",
  "nunca",
  "só",
  "também",
  "quando",
  "então",
  "mas",
  "já",
  "são",
  "está",
  "pelo",
  "pela",
  "dos",
  "das",
  "nas",
  "nos",
  "isso",
  "esse",
  "essa",
  "este",
  "esta",
  "sem",
  "mais",
  "muito",
  "foi",
  "tem",
  "como",
  "ser",
  "sobre",
  "entre",
  "depois",
  "antes",
  "onde",
  "cada",
  "mesmo",
  "mesma",
  "ainda",
  "aqui",
  "hoje",
  "ontem",
  "sempre",
  "seja",
  "pode",
  "deve",
  "fica",
  "vira",
  "mora",
  "nasce",
  "passa",
  "continua",
  "segue",
  "nenhum",
  "nenhuma",
  "todo",
  "toda",
  "qual",
  "quais",
  "porém",
  "senão",
  "ou",
])

const DIACRITICS = /[ãõáéíóúâêôàçÃÕÁÉÍÓÚÂÊÔÀÇ]/g

let data
try {
  data = JSON.parse(readFileSync(0, "utf8"))
} catch {
  process.exit(0)
}

if (process.env.PLATFORM_SPECS_LANG_OFF === "1") process.exit(0)

const filePath = data.tool_input?.file_path ?? ""
if (!/(^|\/)[.]ca-plans\//.test(filePath)) process.exit(0)
if (/[.]json$/.test(filePath)) process.exit(0)

const texts = []
if (typeof data.tool_input?.content === "string")
  texts.push(data.tool_input.content)
if (typeof data.tool_input?.new_string === "string")
  texts.push(data.tool_input.new_string)
for (const edit of data.tool_input?.edits ?? []) {
  if (typeof edit?.new_string === "string") texts.push(edit.new_string)
}
const text = texts.join("\n")
if (!text) process.exit(0)

// Fenced code, inline code and URLs are not prose.
const prose = text
  .replace(/```[\s\S]*?```/g, " ")
  .replace(/`[^`\n]*`/g, " ")
  .replace(/https?:\/\/\S+/g, " ")

const words = prose
  .split(/\s+/)
  .map((w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").toLowerCase())
  .filter(Boolean)

if (words.length < MIN_WORDS) process.exit(0)

const stopwordHits = words.filter((w) => PT_STOPWORDS.has(w)).length
const diacriticHits = (prose.match(DIACRITICS) ?? []).length
const stopwordRatio = stopwordHits / words.length
const diacriticRatio = diacriticHits / words.length

// Diacritics alone never block: English prose that quotes a pt-BR product
// string — a button label ("Salvar"), a field name ("descrição") — is dense
// in them. They only lower the bar when pt-BR function words are already
// present.
const isPortuguese =
  stopwordRatio >= STOPWORD_RATIO ||
  (stopwordRatio >= BOOSTED_STOPWORD_RATIO &&
    diacriticRatio >= BOOST_DIACRITIC_RATIO)
if (!isPortuguese) process.exit(0)

const sample = words
  .filter((w) => PT_STOPWORDS.has(w))
  .slice(0, 8)
  .join(", ")

process.stderr.write(
  `Write to \`${filePath}\` blocked — reads as pt-BR prose (${stopwordHits} pt-BR function words in ${words.length}, ${diacriticHits} diacritics; e.g. ${sample || "diacritics only"}).
Everything under .ca-plans/ is English (ca-full-cycle Critical Rule 6, .agents/skills/dev-workflow/SKILL.md). Rewrite in English and repeat; quote pt-BR only for a product string (UI label, error message, domain term) inside English sentences. Editing an older pt-BR entry: translate the span you touch, or narrow old_string/new_string to the changed words. Debugging: PLATFORM_SPECS_LANG_OFF=1.
`
)
process.exit(2)
