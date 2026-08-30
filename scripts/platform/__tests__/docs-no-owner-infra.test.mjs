import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

// The 9 skills the guidance docs became (name map in .ca-plans/harness-to-skills/plan-02.md).
const MAPPED_SKILL_DIRS = [
  "agent-harness",
  "backend-architecture",
  "code-quality",
  "communication",
  "dev-workflow",
  "frontend-architecture",
  "infra",
  "issue-tracker",
  "testing",
]

function scannedFiles() {
  const skillsDir = path.join(REPO_ROOT, ".agents", "skills")
  const files = MAPPED_SKILL_DIRS.map((name) => {
    const entry = readdirSync(path.join(skillsDir, name)).find(
      (f) => f === "SKILL.md" || f === "SKILL.md.jinja"
    )
    return path.posix.join(".agents", "skills", name, entry)
  })
  files.push("docs/dev/deploy.md.jinja")
  return files.sort()
}

// Domain-only: creating-issues carried pilot vertical-slice examples and area labels
// (T10/AC-11) but also contains "resend" as the English verb (line 216), which the
// infra list's /\bResend\b/i would flag as the email vendor — so it joins only the
// domain sweep, not scannedFiles().
const DOMAIN_ONLY_FILES = [".agents/skills/creating-issues/SKILL.md.jinja"]

function domainSweepFiles() {
  return [...scannedFiles(), ...DOMAIN_ONLY_FILES].sort()
}

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

// The naive stem "reserva" also matches inside generic Portuguese words that have nothing to
// do with the pilot's booking domain: "preservar"/"preservad-" (to preserve) and the bare,
// generic "reservado"/"reservada" (a reserved field/slot). Those three shapes account for
// ~110 of 241 raw hits across the repo (research.md § *Domain vocabulary*) and must not trip
// the guard, or it gets disabled on its first run.
const RESERVA_EXCLUDE = /^(?:preserv\w*|reservad[oa]s?)$/i

const OWNER_DOMAIN_TERMS = [
  /h[oó]sped(?:es|e)/i,
  /acomodaç(?:[aã]o|[oõ]es)/i,
  /recepç(?:[aã]o|[oõ]es)/i,
  /agendamento/i,
  // creating-issues' pt-BR area-label list swapped these pilot entries out (T10); no
  // exclusion needed like RESERVA_EXCLUDE — the swept files are English-only plus that
  // one declared label list, so no legitimate prose collides with these stems.
  /cr[eé]ditos?/i,
  /espa[cç]os?/i,
  /\bquartos?\b/i,
  /\bguests?\b/i,
  /\bbookings?\b/i,
]

const OWNER_INFRA_TERMS = [
  /\bAWS\b/,
  /\bEC2\b/,
  /\bDokploy\b/i,
  /\bCloudflare\b/i,
  /\bResend\b/i,
  /\bTraefik\b/i,
  /\bSwarm\b/i,
  /\bMySQL\b/i,
  /~\/\.local\/bin/,
  /\bus-east-2\b/,
  /\bsa-east-1\b/,
]

function domainHits(text) {
  const hits = []
  for (const term of OWNER_DOMAIN_TERMS) {
    const match = text.match(term)
    if (match) hits.push(match[0])
  }
  for (const match of text.matchAll(/\b\w*reserva\w*\b/gi)) {
    if (!RESERVA_EXCLUDE.test(match[0])) hits.push(match[0])
  }
  return hits
}

function infraHits(text) {
  const hits = []
  for (const term of OWNER_INFRA_TERMS) {
    const match = text.match(term)
    if (match) hits.push(match[0])
  }
  return hits
}

test("scope: the literal 9 mapped skills plus deploy.md.jinja", () => {
  assert.deepEqual(scannedFiles(), [
    ".agents/skills/agent-harness/SKILL.md",
    ".agents/skills/backend-architecture/SKILL.md",
    ".agents/skills/code-quality/SKILL.md",
    ".agents/skills/communication/SKILL.md",
    ".agents/skills/dev-workflow/SKILL.md",
    ".agents/skills/frontend-architecture/SKILL.md",
    ".agents/skills/infra/SKILL.md.jinja",
    ".agents/skills/issue-tracker/SKILL.md.jinja",
    ".agents/skills/testing/SKILL.md",
    "docs/dev/deploy.md.jinja",
  ])
})

test("scope: domain sweep additionally covers creating-issues", () => {
  assert.deepEqual(domainSweepFiles(), [
    ".agents/skills/agent-harness/SKILL.md",
    ".agents/skills/backend-architecture/SKILL.md",
    ".agents/skills/code-quality/SKILL.md",
    ".agents/skills/communication/SKILL.md",
    ".agents/skills/creating-issues/SKILL.md.jinja",
    ".agents/skills/dev-workflow/SKILL.md",
    ".agents/skills/frontend-architecture/SKILL.md",
    ".agents/skills/infra/SKILL.md.jinja",
    ".agents/skills/issue-tracker/SKILL.md.jinja",
    ".agents/skills/testing/SKILL.md",
    "docs/dev/deploy.md.jinja",
  ])
})

test("no owner-domain (pilot hospitality) noun survives in the scanned skills", () => {
  for (const rel of domainSweepFiles()) {
    const hits = domainHits(read(rel))
    assert.deepEqual(
      hits,
      [],
      `${rel} still names the pilot's domain: ${hits.join(", ")}`
    )
  }
})

test("no owner-infra noun survives in the scanned skills", () => {
  for (const rel of scannedFiles()) {
    const hits = infraHits(read(rel))
    assert.deepEqual(
      hits,
      [],
      `${rel} still names owner infrastructure: ${hits.join(", ")}`
    )
  }
})

test("self-test: the exclusion list does not trip the guard", () => {
  const benign =
    "O campo fica reservado para uso futuro; o método deve preservar o estado " +
    "existente e a rotina de state-preservation do vendor cuida do resto."
  assert.deepEqual(domainHits(benign), [])
})

test("self-test: the guard is not vacuous — it flags real domain and infra vocabulary", () => {
  assert.deepEqual(
    domainHits("A área de Hóspedes cobre toda reserva feita pelo guest."),
    ["Hóspedes", "guest", "reserva"]
  )
  assert.deepEqual(
    infraHits(
      "Deploy runs through Dokploy on an AWS EC2 VM behind Cloudflare."
    ),
    ["AWS", "EC2", "Dokploy", "Cloudflare"]
  )
})
