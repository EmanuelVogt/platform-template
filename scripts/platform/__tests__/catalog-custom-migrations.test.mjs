import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { discoverEntries } from "../lib/lint.mjs";
import { readManifest } from "../lib/manifest.mjs";

const ROOT = path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))));
const CATALOG_ROOT = path.join(ROOT, "catalog");

test("customMigrations de cada entrada real do catálogo é nome de arquivo puro e existe em migrations/custom/", () => {
  for (const dir of discoverEntries(CATALOG_ROOT)) {
    const manifest = readManifest(path.join(dir, "module.json"));
    for (const entry of manifest.customMigrations ?? []) {
      assert.ok(
        !entry.includes("/"),
        `${manifest.name}: customMigrations "${entry}" deve ser nome de arquivo puro, sem caminho`,
      );
      const resolved = path.join(dir, "migrations/custom", entry);
      assert.ok(
        existsSync(resolved),
        `${manifest.name}: customMigrations "${entry}" não encontrado em ${resolved}`,
      );
    }
  }
});
