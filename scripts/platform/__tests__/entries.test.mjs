import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { discoverEntries } from "../lib/entries.mjs";

function writeModuleJson(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "module.json"), "{}");
}

test("discoverEntries retorna vazio para uma raiz que não existe", () => {
  assert.deepEqual(discoverEntries(path.join(tmpdir(), "entries-missing-root-does-not-exist")), []);
});

test("discoverEntries encontra uma entrada simples com module.json na raiz do catálogo", () => {
  const root = mkdtempSync(path.join(tmpdir(), "entries-simple-"));
  writeModuleJson(path.join(root, "alpha"));
  assert.deepEqual(discoverEntries(root), [path.join(root, "alpha")]);
});

test("discoverEntries encontra várias entradas irmãs", () => {
  const root = mkdtempSync(path.join(tmpdir(), "entries-siblings-"));
  writeModuleJson(path.join(root, "alpha"));
  writeModuleJson(path.join(root, "beta"));
  const entries = discoverEntries(root).map((entryDir) => path.relative(root, entryDir));
  assert.deepEqual(entries.sort(), ["alpha", "beta"]);
});

test("discoverEntries para em <name>/<variant>/module.json e não desce além dele", () => {
  const root = mkdtempSync(path.join(tmpdir(), "entries-variant-"));
  writeModuleJson(path.join(root, "gamma", "variant-x"));
  // module.json mais fundo do que o já encontrado — nunca deveria ser alcançado.
  writeModuleJson(path.join(root, "gamma", "variant-x", "api"));
  const entries = discoverEntries(root).map((entryDir) => path.relative(root, entryDir));
  assert.deepEqual(entries, [path.join("gamma", "variant-x")]);
});
