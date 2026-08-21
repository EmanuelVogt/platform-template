import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

test("lock presente com advisory pendente: emite uma linha com id/kind/severity/module", () => {
  const result = runHook({ projectDir: path.join(FIXTURES_DIR, "pending") });
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(
    payload.hookSpecificOutput.additionalContext,
    "pending advisories: ADV-20260901-01 security high identity/single-tenant",
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
