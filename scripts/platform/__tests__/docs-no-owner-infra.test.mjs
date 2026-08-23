import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..");

// SPEC_DEVIATION: scope narrowed from the literal "docs/agents/**" to exclude harness.md.
// Reason: harness.md still names the hospitality-era P0 taxonomy ("booking rules") — that is
// BRAND-04, a different task in a later wave (tasks.md § 0.1), and this task must not touch
// harness/skill files. Scanning it here would fail this feature's own wave-1 gate for a
// defect this task cannot fix.
const EXCLUDED_FILES = new Set(["docs/agents/harness.md"]);

function scannedFiles() {
  const agentsDir = path.join(REPO_ROOT, "docs", "agents");
  const files = readdirSync(agentsDir)
    .filter((name) => !name.startsWith("."))
    .map((name) => path.posix.join("docs", "agents", name))
    .filter((rel) => !EXCLUDED_FILES.has(rel));
  files.push("docs/dev/deploy.md.jinja");
  return files.sort();
}

const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

// The naive stem "reserva" also matches inside generic Portuguese words that have nothing to
// do with the pilot's booking domain: "preservar"/"preservad-" (to preserve) and the bare,
// generic "reservado"/"reservada" (a reserved field/slot). Those three shapes account for
// ~110 of 241 raw hits across the repo (research.md § *Domain vocabulary*) and must not trip
// the guard, or it gets disabled on its first run.
const RESERVA_EXCLUDE = /^(?:preserv\w*|reservad[oa]s?)$/i;

const OWNER_DOMAIN_TERMS = [
  /h[oó]sped(?:es|e)/i,
  /acomodaç(?:[aã]o|[oõ]es)/i,
  /recepç(?:[aã]o|[oõ]es)/i,
  /agendamento/i,
  /\bquartos?\b/i,
  /\bguests?\b/i,
  /\bbookings?\b/i,
];

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
];

function domainHits(text) {
  const hits = [];
  for (const term of OWNER_DOMAIN_TERMS) {
    const match = text.match(term);
    if (match) hits.push(match[0]);
  }
  for (const match of text.matchAll(/\b\w*reserva\w*\b/gi)) {
    if (!RESERVA_EXCLUDE.test(match[0])) hits.push(match[0]);
  }
  return hits;
}

function infraHits(text) {
  const hits = [];
  for (const term of OWNER_INFRA_TERMS) {
    const match = text.match(term);
    if (match) hits.push(match[0]);
  }
  return hits;
}

test("scope: docs/agents/** (minus the pending-BRAND-04 harness.md) plus deploy.md.jinja", () => {
  assert.deepEqual(scannedFiles(), [
    "docs/agents/README.md",
    "docs/agents/communication.md",
    "docs/agents/infra.md.jinja",
    "docs/agents/issue-tracker.md.jinja",
    "docs/agents/workflow.md",
    "docs/dev/deploy.md.jinja",
  ]);
});

test("no owner-domain (pilot hospitality) noun survives in the scanned docs", () => {
  for (const rel of scannedFiles()) {
    const hits = domainHits(read(rel));
    assert.deepEqual(hits, [], `${rel} still names the pilot's domain: ${hits.join(", ")}`);
  }
});

test("no owner-infra noun survives in the scanned docs", () => {
  for (const rel of scannedFiles()) {
    const hits = infraHits(read(rel));
    assert.deepEqual(hits, [], `${rel} still names owner infrastructure: ${hits.join(", ")}`);
  }
});

test("self-test: the exclusion list does not trip the guard", () => {
  const benign =
    "O campo fica reservado para uso futuro; o método deve preservar o estado " +
    "existente e a rotina de state-preservation do vendor cuida do resto.";
  assert.deepEqual(domainHits(benign), []);
});

test("self-test: the guard is not vacuous — it flags real domain and infra vocabulary", () => {
  assert.deepEqual(domainHits("A área de Hóspedes cobre toda reserva feita pelo guest."), [
    "Hóspedes",
    "guest",
    "reserva",
  ]);
  assert.deepEqual(infraHits("Deploy runs through Dokploy on an AWS EC2 VM behind Cloudflare."), [
    "AWS",
    "EC2",
    "Dokploy",
    "Cloudflare",
  ]);
});
