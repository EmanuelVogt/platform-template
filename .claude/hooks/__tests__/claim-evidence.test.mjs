// Behavioral test for claim-evidence.mjs — spawns the hook exactly as Claude Code's
// Stop event does (JSON on stdin; a nudge is a JSON additionalContext on stdout, a pass
// is empty stdout, exit 0 either way). Harness tooling — not app code.
import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { cleanupSessionState, runHook as spawnHook } from "./run-hook.mjs"

const sessions = []

function runHook(message, extra = {}, env = {}) {
  const sessionId = extra.session_id ?? randomUUID()
  sessions.push(sessionId)
  const result = spawnHook(
    "claim-evidence",
    {
      hook_event_name: "Stop",
      session_id: sessionId,
      prompt_id: randomUUID(),
      last_assistant_message: message,
      ...extra,
    },
    { env: { PLATFORM_CLAIMS_OFF: "", ...env } }
  )
  assert.equal(result.code, 0, result.stderr)
  const out = result.stdout.trim()
  return out ? JSON.parse(out).hookSpecificOutput.additionalContext : null
}

test.after(() => sessions.forEach(cleanupSessionState))

// The shape of the 2026-09-28 incident reply: mechanism verified, narrative invented.
const INCIDENT = `O endpoint de seleção de conta existe porque um mesmo e-mail pode pertencer a mais de um criador.
É comum uma agência compartilhar e-mail entre os criadores que gerencia (quem cadastrou coloca o próprio e-mail em todo mundo). Isso vem do legado e de como o time de suporte cadastra as contas.`

test("nudges on the incident reply and quotes the unsourced sentence", () => {
  const context = runHook(INCIDENT)
  assert.ok(context, "expected a nudge")
  assert.match(context, /É comum uma agência/)
  assert.match(context, /vem do legado/)
  assert.match(context, /hipótese, não verificado/)
  assert.match(context, /claim-evidence\.mjs/)
})

test("stays silent when the claim is labelled a hypothesis in the same sentence", () => {
  const hedged = `É comum uma agência compartilhar e-mail — hipótese, não verificado; confirmo olhando a tabela de contas.`
  assert.equal(runHook(hedged), null)
})

test("stays silent when the sentence carries a file:line or inline code", () => {
  assert.equal(
    runHook(
      "Isso vem do legado: o import copia email sem dedup em scripts/import-accounts.ts:212."
    ),
    null
  )
  assert.equal(
    runHook(
      "Historicamente o e-mail fica em `SocialAccount.email`, sem unique."
    ),
    null
  )
})

test("stays silent on a plain business explanation with no narrative marker", () => {
  const plain = `Quando dois criadores enviam o mesmo clipe no mesmo minuto, fica com quem enviou primeiro. O segundo envio aparece como duplicado em vez de sumir da tela.`
  assert.equal(runHook(plain), null)
})

test("ignores markers inside fenced code, inline code and quoted spans", () => {
  const fenced =
    'Veja o teste:\n```ts\nit("é comum compartilhar e-mail", () => {})\n```\nRodei e passou.'
  assert.equal(runHook(fenced), null)
  const quoted =
    "Você disse: «é comum a agência compartilhar e-mail». Vou verificar no banco."
  assert.equal(runHook(quoted), null)
})

test("never flags a question", () => {
  assert.equal(
    runHook("É comum uma agência compartilhar o mesmo e-mail entre criadores?"),
    null
  )
})

test("stays silent when stop_hook_active is set (already continuing)", () => {
  assert.equal(runHook(INCIDENT, { stop_hook_active: true }), null)
})

test("nudges once per prompt_id, then stays silent for the same prompt", () => {
  const session = randomUUID()
  const prompt = randomUUID()
  assert.ok(runHook(INCIDENT, { session_id: session, prompt_id: prompt }))
  assert.equal(
    runHook(INCIDENT, { session_id: session, prompt_id: prompt }),
    null
  )
  assert.ok(runHook(INCIDENT, { session_id: session, prompt_id: randomUUID() }))
})

test("PLATFORM_CLAIMS_OFF=1 disables the hook", () => {
  assert.equal(runHook(INCIDENT, {}, { PLATFORM_CLAIMS_OFF: "1" }), null)
})

test("passes through malformed or empty input", () => {
  const result = spawnHook("claim-evidence", "not json")
  assert.equal(result.code, 0)
  assert.equal(result.stdout.trim(), "")
  assert.equal(runHook(""), null)
})
