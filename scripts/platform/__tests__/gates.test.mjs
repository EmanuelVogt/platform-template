import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(TESTS_DIR, "../../..");
const ROOT_PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json");
const TURBO_JSON_PATH = path.join(ROOT_DIR, "turbo.json");
const WEB_PACKAGE_JSON_PATH = path.join(ROOT_DIR, "apps/web/package.json");

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
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
