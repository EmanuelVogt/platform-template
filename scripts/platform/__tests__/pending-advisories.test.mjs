import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AdvisoryParseError, parseAdvisory } from "../lib/advisories.mjs";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..");
const HOOK_PATH = path.join(REPO_ROOT, ".claude", "hooks", "pending-advisories.mjs");
const FIXTURES_DIR = path.join(TESTS_DIR, "fixtures", "pending-advisories");
const ADVISORY_FILE_RE = /^ADV-.*\.md$/;

function runHook({ projectDir, hookEventName = "SessionStart", sessionId = randomUUID() }) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify({ session_id: sessionId, hook_event_name: hookEventName }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
}

const KERNEL_ADVISORY_MD = [
  "---",
  'id: "ADV-20260823-01"',
  'kind: "bug"',
  'module: "kernel"',
  'affects: ">=2.0.0 <2.1.0"',
  'severity: "high"',
  'detect: "pnpm platform status"',
  'fix: "copier update para >= v2.1.0"',
  'parity: "scripts/platform/__tests__/lint.test.mjs"',
  "---",
  "Contexto, impacto e passos em pt-BR.",
  "",
].join("\n");

const ENTRY_ADVISORY_MD = [
  "---",
  'id: "ADV-20260901-01"',
  'kind: "security"',
  'module: "identity/single-tenant"',
  'affects: ">=1.0.0 <1.2.0"',
  'severity: "high"',
  'detect: "pnpm platform advisory detect ADV-20260901-01"',
  'fix: "resumo + link para CHANGELOG"',
  'parity: "apps/api/src/modules/identity/__parity__/sessions.parity.spec.ts"',
  "---",
  "Contexto, impacto e passos em pt-BR.",
  "",
].join("\n");

// Escrito em runtime (nunca commitado) — um `.copier-answers.yml` rastreado no git é o
// vazamento que ADV-20260823-02 descreve; `copier-answers-leak.test.mjs` barra isso.
function makeKernelProjectDir({ commit, withLock = false }) {
  const dir = mkdtempSync(path.join(tmpdir(), "pending-advisories-kernel-"));
  writeFileSync(
    path.join(dir, ".copier-answers.yml"),
    `_src_path: gh:example/platform-template\n_commit: ${commit}\n`,
  );
  mkdirSync(path.join(dir, "docs", "advisories"), { recursive: true });
  writeFileSync(path.join(dir, "docs", "advisories", "APPLIED.md"), "# Advisories aplicados\n");
  writeFileSync(path.join(dir, "docs", "advisories", "ADV-20260823-01.md"), KERNEL_ADVISORY_MD);
  if (withLock) {
    writeFileSync(
      path.join(dir, ".platform-modules.lock"),
      JSON.stringify({
        catalog: { source: "gh:example/template", ref: "v1.0.0" },
        modules: { identity: { variant: "single-tenant", version: "1.1.0", installedAt: "2026-08-19T00:00:00.000Z" } },
      }),
    );
    writeFileSync(path.join(dir, "docs", "advisories", "ADV-20260901-01.md"), ENTRY_ADVISORY_MD);
  }
  return dir;
}

test("sem .platform-modules.lock: emite a linha de no-lock alinhada ao spec.md ADV-02 (sem prefixo pnpm)", () => {
  const result = runHook({ projectDir: path.join(FIXTURES_DIR, "no-lock") });
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(
    payload.hookSpecificOutput.additionalContext,
    "no .platform-modules.lock — run platform module adopt",
  );
});

test("lock presente sem advisory pendente: sem saída (branch de lista vazia)", () => {
  const result = runHook({ projectDir: path.join(FIXTURES_DIR, "no-pending") });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("lock presente com advisory pendente: emite uma linha `ADV-… <kind> <severity> <module>` (spec.md ADV-02)", () => {
  const result = runHook({ projectDir: path.join(FIXTURES_DIR, "pending") });
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(
    payload.hookSpecificOutput.additionalContext,
    "ADV-20260901-01 security high identity/single-tenant",
  );
});

test("kernel sem lock: a linha de kernel aparece mesmo sem .platform-modules.lock, antes do aviso de no-lock", () => {
  const projectDir = makeKernelProjectDir({ commit: "v2.0.0", withLock: false });
  const result = runHook({ projectDir });
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(
    payload.hookSpecificOutput.additionalContext,
    "ADV-20260823-01 bug high kernel\nno .platform-modules.lock — run platform module adopt",
  );
});

test("kernel com lock: linhas de kernel vêm antes das linhas de entrada", () => {
  const projectDir = makeKernelProjectDir({ commit: "v2.0.0", withLock: true });
  const result = runHook({ projectDir });
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(
    payload.hookSpecificOutput.additionalContext,
    "ADV-20260823-01 bug high kernel\nADV-20260901-01 security high identity/single-tenant",
  );
});

test("UserPromptSubmit só dispara no primeiro prompt da sessão", () => {
  const sessionId = randomUUID();
  const projectDir = path.join(FIXTURES_DIR, "pending");

  const first = runHook({ projectDir, hookEventName: "UserPromptSubmit", sessionId });
  assert.equal(first.status, 0);
  assert.notEqual(first.stdout, "");

  const second = runHook({ projectDir, hookEventName: "UserPromptSubmit", sessionId });
  assert.equal(second.status, 0);
  assert.equal(second.stdout, "");
});

test("docs/advisories/ADV-*.md reais parseiam com o parser real (README.md/APPLIED.md ficam fora do glob)", () => {
  const dir = path.join(REPO_ROOT, "docs", "advisories");
  const entries = readdirSync(dir);
  const advisoryFiles = entries.filter((entry) => ADVISORY_FILE_RE.test(entry));

  for (const entry of advisoryFiles) {
    const filePath = path.join(dir, entry);
    assert.doesNotThrow(() => parseAdvisory(readFileSync(filePath, "utf8"), filePath));
  }

  assert.equal(entries.includes("README.md"), true);
  assert.equal(entries.includes("APPLIED.md"), true);
  for (const nonAdvisory of ["README.md", "APPLIED.md"]) {
    assert.throws(
      () => parseAdvisory(readFileSync(path.join(dir, nonAdvisory), "utf8"), nonAdvisory),
      AdvisoryParseError,
    );
  }
});

test("parseAdvisory reprova um advisory com frontmatter inválido (fixture temporária, não commitada)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "advisories-invalid-"));
  const filePath = path.join(dir, "ADV-invalid.md");
  writeFileSync(
    filePath,
    ['---', 'id: "ADV-20260901-02"', 'kind: "not-a-real-kind"', 'module: "identity/single-tenant"', 'affects: ">=1.0.0"', 'severity: "high"', 'detect: "true"', 'fix: "n/a"', 'parity: "n/a"', '---', 'corpo'].join("\n"),
  );
  assert.throws(
    () => parseAdvisory(readFileSync(filePath, "utf8"), filePath),
    (error) => error instanceof AdvisoryParseError && /kind inválido/.test(error.message),
  );
});
