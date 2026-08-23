import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ADD_SOURCE_PATH = path.join(TESTS_DIR, "../lib/commands/add.mjs");
const WEB_SHELL_DIRS = ["apps/web-vite", "apps/web-next"]
  .map((dir) => path.join(TESTS_DIR, "../../..", dir))
  .filter((dir) => existsSync(dir));

test("passo web-tests do add.mjs invoca um script existente em cada shell web", () => {
  const addSource = readFileSync(ADD_SOURCE_PATH, "utf8");
  const match = addSource.match(/"--filter",\s*"web",\s*"([^"]+)"/);
  assert.ok(match, "esperava encontrar a invocação pnpm --filter web <script> em add.mjs");

  const webScript = match[1];
  assert.ok(WEB_SHELL_DIRS.length > 0, "esperava ao menos um shell web em apps/");
  for (const shellDir of WEB_SHELL_DIRS) {
    const webPackage = JSON.parse(readFileSync(path.join(shellDir, "package.json"), "utf8"));
    assert.ok(
      Object.hasOwn(webPackage.scripts, webScript),
      `${path.basename(shellDir)}/package.json não expõe o script "${webScript}" invocado por add.mjs`,
    );
  }
});
