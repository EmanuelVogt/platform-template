import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(TESTS_DIR, "../../..");
const ROOT_PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");
const TURBO_JSON_PATH = path.join(ROOT_DIR, "turbo.json");
const WEB_PACKAGE_JSON_PATH = path.join(ROOT_DIR, "apps/web/package.json");
const LEFTHOOK_PATH = path.join(ROOT_DIR, "lefthook.yml");
const LEFTHOOK_LOCAL_PATH = path.join(ROOT_DIR, "lefthook-local.yml");
const CI_WORKFLOW_PATH = path.join(ROOT_DIR, ".github/workflows/ci.yml");
const CATALOG_WORKFLOW_PATH = path.join(ROOT_DIR, ".github/workflows/catalog.yml");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readYaml(filePath) {
  return parseYaml(readFileSync(filePath, "utf8"));
}

test("GAT-03: package.json raiz expõe os seis scripts de teste do AD-028 com o comando exato", () => {
  const { scripts } = readJson(ROOT_PACKAGE_JSON_PATH);
  assert.equal(scripts.test, "vitest run");
  assert.equal(scripts["test:watch"], "vitest");
  assert.equal(scripts["test:coverage"], "vitest run --config vitest.coverage.mts --coverage");
  assert.equal(scripts["test:int"], "vitest run --config vitest.integration.mts --project api-int");
  assert.equal(scripts["test:e2e"], "vitest run --config vitest.integration.mts --project api-e2e");
  assert.equal(scripts["test:db"], "vitest run --config vitest.integration.mts");
});

test("GAT-07: turbo.json não tem mais nenhuma task test*", () => {
  const { tasks } = readJson(TURBO_JSON_PATH);
  const testTasks = Object.keys(tasks).filter((name) => name.startsWith("test"));
  assert.deepEqual(testTasks, []);
});

test("GAT-07: apps/web/package.json não tem mais nenhum script test*", () => {
  const { scripts } = readJson(WEB_PACKAGE_JSON_PATH);
  const testScripts = Object.keys(scripts).filter((name) => name.startsWith("test"));
  assert.deepEqual(testScripts, []);
});

test("GAT-05: lefthook.yml pre-push é piped e roda migrations → typecheck → test-coverage nessa ordem", () => {
  const { "pre-push": prePush } = readYaml(LEFTHOOK_PATH);
  assert.equal(prePush.piped, true);
  assert.deepEqual(Object.keys(prePush.commands), ["migrations", "typecheck", "test-coverage"]);
  assert.equal(prePush.commands["test-coverage"].run, "pnpm test:coverage");
});

test("GAT-05: lefthook.yml não tem mais os comandos test-api/test-web", () => {
  const { "pre-push": prePush } = readYaml(LEFTHOOK_PATH);
  assert.equal(prePush.commands["test-api"], undefined);
  assert.equal(prePush.commands["test-web"], undefined);
});

test("GAT-05: lefthook-local.yml mantém catalog-typecheck no pre-push", () => {
  const { "pre-push": prePush } = readYaml(LEFTHOOK_LOCAL_PATH);
  assert.equal(prePush.commands["catalog-typecheck"].run, "node scripts/platform/catalog-stage.mjs");
});

test("GAT-06: ci.yml test-unit roda install + pnpm test e test-coverage roda pnpm test:coverage, ambos após quality", () => {
  const { jobs } = readYaml(CI_WORKFLOW_PATH);
  const testUnitRuns = jobs["test-unit"].steps.map((step) => step.run).filter(Boolean);
  const testCoverageRuns = jobs["test-coverage"].steps.map((step) => step.run).filter(Boolean);
  assert.equal(jobs["test-unit"].needs, "quality");
  assert.deepEqual(testUnitRuns, ["pnpm install --frozen-lockfile", "pnpm test"]);
  assert.equal(jobs["test-coverage"].needs, "quality");
  assert.ok(testCoverageRuns.includes("pnpm test:coverage"));
});

test("GAT-06: catalog.yml gates mantém pnpm check, pnpm test e pnpm test:scripts", () => {
  const { jobs } = readYaml(CATALOG_WORKFLOW_PATH);
  const gateRuns = jobs.gates.steps.map((step) => step.run).filter(Boolean);
  assert.ok(gateRuns.includes("pnpm check"));
  assert.ok(gateRuns.includes("pnpm test"));
  assert.ok(gateRuns.includes("pnpm test:scripts"));
});
