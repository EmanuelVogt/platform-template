#!/usr/bin/env node
// Stop: re-opens the turn ONCE, as hook feedback (never a hook error), when the final
// reply states a frequency ("é comum"), a history ("vem do legado") or an intent
// ("a ideia é") in a sentence that carries neither a source (file:line, AD-nn, inline
// code, a path, "verifiquei…", the user's words) nor a hypothesis label ("hipótese",
// "não verificado", "provavelmente"…). Replies go to the user in the product locale
// (AGENTS.md; pt-BR by default), so the phrase list is pt-BR first, with an English
// subset. The rule: a business reason, history or frequency is
// stated with its source beside it or labelled a hypothesis. This hook only catches the
// narrow phrase shapes of a 2026-09-28 incident on the sibling harness it was ported
// from, where an invented business narrative was stated in the same tone as code facts.
// Deliberately blind to everything else — a regex cannot judge truth, so a plain
// explanation with no marker phrase passes untouched. Fenced code, inline code and
// quoted spans are stripped before matching; a question is never flagged. Measured
// there 2026-09-28 over 149 final replies of the 12 latest sessions: 2 fired (the incident
// and one provenance claim); "de propósito" and "na prática" were dropped from the
// list after firing three times as discourse phrases.
// Loop guards: `stop_hook_active`, plus one nudge per prompt_id (state in tmpdir).
// PLATFORM_CLAIMS_OFF=1 in the environment disables it. Harness tooling — not app code.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join } from "node:path"

const NARRATIVE = [
  // frequency
  /(?<![\p{L}\p{N}])[ée] comum(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])costumam?(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(geralmente|normalmente|frequentemente|tipicamente|quase sempre|na maioria d[oa]s)(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(it'?s common|usually|typically)(?![\p{L}\p{N}])/iu,
  // history
  /(?<![\p{L}\p{N}])(vem|veio|vindo|herdad[oa]s?|trazid[oa]s?|migrad[oa]s?|puxad[oa]s?|vieram) do (sistema )?legado(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(historicamente|sempre foi|desde o (in[íi]cio|come[çc]o))(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(came from (the )?legacy|historically)(?![\p{L}\p{N}])/iu,
  // intent
  /(?<![\p{L}\p{N}])a (ideia|inten[çc][ãa]o) ([ée]|era|foi)(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(foi pensad[oa]|foi feit[oa] assim)(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(existe|foi criad[oa]) porque(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(o motivo|a raz[ãa]o) ([ée]|era)(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])the (idea|intent) (is|was)(?![\p{L}\p{N}])/iu,
]

const EVIDENCE = [
  /`[^`]+`/, // inline code: a cited identifier, path or command
  /[\w./-]+\.(ts|tsx|js|mjs|cjs|md|sql|json|ya?ml)(?![\w.])/i,
  /\w:\d+\b/, // file:line
  /\b(AD|ADR|D)-\d+\b/,
  /\bADR \d+\b/,
  /\bspec\b/i,
  /(?<![\p{L}\p{N}])(hip[óo]tese|n[ãa]o (foi )?verific|sem verificar|suposi[çc][ãa]o|infer[êe]ncia|inferi|acho que|acredito|provavelmente|talvez|palpite|chute|pode ser que|parece que|n[ãa]o confirmei|n[ãa]o chequei)(?![\p{L}\p{N}])/iu,
  /(?<![\p{L}\p{N}])(verifiquei|verificad[oa]s?|conferi|confirmad[oa]s?|confirmei|chequei|segundo (o|a|voc[êe])|voc[êe] (disse|falou|mencionou|contou|pediu)|conforme|de acordo com|o c[óo]digo (mostra|faz)|na linha|migration|constraint|coluna|tabela|query|sa[íi]da do comando|resultado d[oa])(?![\p{L}\p{N}])/iu,
  /\b(hypothesis|unverified|not verified|I infer|inferred|likely|probably|verified|confirmed|per the user|you said)\b/i,
]

const stripQuotedSpans = (s) =>
  s
    .replace(/`[^`]*`/g, " ")
    .replace(/«[^»]*»/g, " ")
    .replace(/“[^”]*”/g, " ")
    .replace(/"[^"\n]*"/g, " ")

export const findUnsourcedClaims = (text) => {
  const body = String(text ?? "").replace(/```[\s\S]*?```/g, " ")
  const sentences = body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const hits = []
  for (const sentence of sentences) {
    if (sentence.endsWith("?")) continue
    const bare = stripQuotedSpans(sentence)
    if (!NARRATIVE.some((re) => re.test(bare))) continue
    if (EVIDENCE.some((re) => re.test(sentence))) continue
    hits.push(sentence.replace(/\s+/g, " ").slice(0, 180))
  }
  return hits
}

const main = () => {
  let input
  try {
    input = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    return
  }
  if (process.env.PLATFORM_CLAIMS_OFF === "1") return
  if (input.stop_hook_active === true) return
  const text = input.last_assistant_message
  if (typeof text !== "string" || !text.trim()) return

  const hits = findUnsourcedClaims(text)
  if (hits.length === 0) return

  const key = String(
    input.prompt_id ??
      createHash("sha1").update(hits.join("\n")).digest("hex").slice(0, 16)
  )
  const stateFile = join(
    tmpdir(),
    `platform-claim-evidence-${String(input.session_id ?? "nosession")}`
  )
  try {
    if (existsSync(stateFile) && readFileSync(stateFile, "utf8") === key) return
    writeFileSync(stateFile, key)
  } catch {
    return
  }

  const quoted = hits
    .slice(0, 3)
    .map((h) => `  • «${h}»`)
    .join("\n")
  const context = `Claim check (claim-evidence hook): the reply you just finished states a frequency, a history or an intent with no source and no hypothesis label in that sentence:
${quoted}
Append ONE short line, in pt-BR, doing one of: (a) put the source beside the claim — file:line, AD-nn, the command output, or the user's own words; (b) relabel it "hipótese, não verificado" and name the one check that settles it (file to open / query to run / question to the user). Do not restate the reply. If this reply was already a retraction or the sentence quotes the user, say so in that line and stop. Rule: a business reason, history or frequency carries its source or a hypothesis label (hook .claude/hooks/claim-evidence.mjs).`

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "Stop", additionalContext: context },
    })
  )
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main()
  process.exit(0)
}
