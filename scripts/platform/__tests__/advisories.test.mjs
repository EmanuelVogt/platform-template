import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  AdvisoryParseError,
  computePending,
  loadAdvisories,
  parseAdvisory,
  readLedger,
} from "../lib/advisories.mjs";

function advisoryMd(overrides = {}) {
  const fields = {
    id: "ADV-20260901-01",
    kind: "security",
    module: "identity/single-tenant",
    affects: ">=1.0.0 <1.2.0",
    severity: "high",
    detect: "pnpm platform advisory detect ADV-20260901-01",
    fix: "resumo + link para CHANGELOG",
    parity: "apps/api/src/modules/identity/__parity__/sessions.parity.spec.ts",
    ...overrides,
  };
  const frontmatter = Object.entries(fields)
    .map(([key, value]) => `${key}: "${value}"`)
    .join("\n");
  return `---\n${frontmatter}\n---\nContexto, impacto e passos em pt-BR.\n`;
}

function lockWith(modules) {
  return { catalog: { source: "gh:example/template", ref: "v1.0.0" }, modules };
}

const installedIdentity = {
  identity: { variant: "single-tenant", version: "1.1.0", installedAt: "2026-08-19T00:00:00.000Z" },
};

test("parseAdvisory lê frontmatter válido e devolve os campos + corpo", () => {
  const advisory = parseAdvisory(advisoryMd(), "docs/advisories/ADV-20260901-01.md");
  assert.equal(advisory.id, "ADV-20260901-01");
  assert.equal(advisory.module, "identity/single-tenant");
  assert.equal(advisory.affects, ">=1.0.0 <1.2.0");
  assert.equal(advisory.severity, "high");
  assert.match(advisory.body, /Contexto, impacto e passos/);
});

test("parseAdvisory lança erro nomeando arquivo e campo quando obrigatório está ausente", () => {
  const md = advisoryMd();
  const withoutSeverity = md.replace(/severity: "high"\n/, "");
  assert.throws(
    () => parseAdvisory(withoutSeverity, "docs/advisories/ADV-20260901-01.md"),
    (error) =>
      error instanceof AdvisoryParseError &&
      error.filePath === "docs/advisories/ADV-20260901-01.md" &&
      /severity/.test(error.message),
  );
});

test("parseAdvisory lança erro quando kind não está no enum permitido", () => {
  assert.throws(
    () => parseAdvisory(advisoryMd({ kind: "cosmetic" }), "ADV-x.md"),
    (error) => error instanceof AdvisoryParseError && /kind inválido/.test(error.message),
  );
});

test("parseAdvisory lança erro quando severity não está no enum permitido", () => {
  assert.throws(
    () => parseAdvisory(advisoryMd({ severity: "extreme" }), "ADV-x.md"),
    (error) => error instanceof AdvisoryParseError && /severity inválido/.test(error.message),
  );
});

test("parseAdvisory lança erro quando não há frontmatter", () => {
  assert.throws(
    () => parseAdvisory("apenas corpo, sem frontmatter", "ADV-x.md"),
    (error) => error instanceof AdvisoryParseError && /frontmatter/.test(error.message),
  );
});

test("computePending: advisory instalado, dentro do range e fora do ledger fica pendente", () => {
  const advisory = parseAdvisory(advisoryMd());
  const result = computePending(lockWith(installedIdentity), [advisory], []);
  assert.equal(result.noLock, false);
  assert.deepEqual(result.pending, [
    { id: "ADV-20260901-01", kind: "security", severity: "high", module: "identity/single-tenant" },
  ]);
});

test("computePending: advisory já no ledger não fica pendente", () => {
  const advisory = parseAdvisory(advisoryMd());
  const result = computePending(lockWith(installedIdentity), [advisory], ["ADV-20260901-01"]);
  assert.deepEqual(result.pending, []);
});

test("computePending: affects fora do range da versão instalada não fica pendente", () => {
  const advisory = parseAdvisory(advisoryMd({ affects: ">=2.0.0" }));
  const result = computePending(lockWith(installedIdentity), [advisory], []);
  assert.deepEqual(result.pending, []);
});

test("computePending: módulo ausente do lock não fica pendente", () => {
  const advisory = parseAdvisory(advisoryMd({ module: "billing/default" }));
  const result = computePending(lockWith(installedIdentity), [advisory], []);
  assert.deepEqual(result.pending, []);
});

test("computePending: advisory aponta variant não instalada do módulo não fica pendente", () => {
  const advisory = parseAdvisory(advisoryMd({ module: "identity/multi-tenant" }));
  const result = computePending(lockWith(installedIdentity), [advisory], []);
  assert.deepEqual(result.pending, []);
});

test("computePending: lock ausente/vazio sinaliza noLock distinto de lista vazia", () => {
  const advisory = parseAdvisory(advisoryMd());
  const result = computePending({ modules: {} }, [advisory], []);
  assert.equal(result.noLock, true);
  assert.deepEqual(result.pending, []);
});

test("computePending: lista de advisories vazia (diretório ausente) não gera erro e devolve vazio", () => {
  const result = computePending(lockWith(installedIdentity), [], []);
  assert.equal(result.noLock, false);
  assert.deepEqual(result.pending, []);
});

test("loadAdvisories: diretório ausente devolve lista vazia silenciosamente", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "advisories-test-"));
  const missingDir = path.join(dir, "does-not-exist");
  assert.deepEqual(loadAdvisories(missingDir), []);
});

test("loadAdvisories: lê e parseia todos os .md do diretório", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "advisories-test-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "ADV-20260901-01.md"), advisoryMd());
  writeFileSync(path.join(dir, "notes.txt"), "não é advisory");
  const advisories = loadAdvisories(dir);
  assert.equal(advisories.length, 1);
  assert.equal(advisories[0].id, "ADV-20260901-01");
});

test("readLedger: arquivo ausente devolve lista vazia", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "advisories-test-"));
  assert.deepEqual(readLedger(path.join(dir, "APPLIED.md")), []);
});

test("readLedger: extrai os ids das linhas do ledger", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "advisories-test-"));
  const filePath = path.join(dir, "APPLIED.md");
  writeFileSync(filePath, "- ADV-20260901-01 — 2026-09-02 — abc123\n- ADV-20260815-02 — 2026-08-16 — def456\n");
  assert.deepEqual(readLedger(filePath), ["ADV-20260901-01", "ADV-20260815-02"]);
});
