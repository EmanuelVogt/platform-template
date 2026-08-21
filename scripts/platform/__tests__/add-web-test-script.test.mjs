import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ADD_SOURCE_PATH = path.join(TESTS_DIR, "../lib/commands/add.mjs");
const WEB_PACKAGE_JSON_PATH = path.join(TESTS_DIR, "../../../apps/web/package.json");

test("passo web-tests do add.mjs invoca um script existente em apps/web/package.json", () => {
  const addSource = readFileSync(ADD_SOURCE_PATH, "utf8");
  const match = addSource.match(/"--filter",\s*"web",\s*"([^"]+)"/);
  assert.ok(match, "esperava encontrar a invocação pnpm --filter web <script> em add.mjs");

  const webScript = match[1];
  const webPackage = JSON.parse(readFileSync(WEB_PACKAGE_JSON_PATH, "utf8"));
  assert.ok(
    Object.hasOwn(webPackage.scripts, webScript),
    `apps/web/package.json não expõe o script "${webScript}" invocado por add.mjs`,
  );
});
