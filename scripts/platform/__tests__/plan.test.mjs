import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { readManifest } from "../lib/manifest.mjs";
import {
  AlreadyInstalledError,
  CyclicDependencyError,
  KernelRangeError,
  MissingDepsError,
  checkKernelRange,
  checkLock,
  planCopy,
  resolveDeps,
} from "../lib/plan.mjs";

const FIXTURES_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/catalog");
const alphaManifest = readManifest(path.join(FIXTURES_ROOT, "alpha", "module.json"));
const betaManifest = readManifest(path.join(FIXTURES_ROOT, "beta", "module.json"));

const REPO_CATALOG = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../catalog");

test("resolveDeps --with-deps resolve dependência que mora sob uma variante", () => {
  const attachment = readManifest(path.join(REPO_CATALOG, "attachment", "module.json"));
  const { order } = resolveDeps({
    catalogRoot: REPO_CATALOG,
    manifest: attachment,
    lock: { modules: {} },
    withDeps: true,
  });
  assert.ok(order.indexOf("identity") < order.indexOf("attachment"));
});

test("checkKernelRange não lança quando a versão do template satisfaz o range", () => {
  assert.doesNotThrow(() => checkKernelRange(alphaManifest, "1.5.0"));
});

test("checkKernelRange lança KernelRangeError quando a versão do template não satisfaz o range", () => {
  try {
    checkKernelRange(alphaManifest, "2.0.0");
    assert.fail("deveria ter lançado KernelRangeError");
  } catch (err) {
    assert.ok(err instanceof KernelRangeError);
    assert.equal(err.requiredRange, alphaManifest.kernelRange);
    assert.equal(err.templateVersion, "2.0.0");
  }
});

test("checkLock não lança quando o módulo não está instalado", () => {
  assert.doesNotThrow(() => checkLock({ modules: {} }, "alpha"));
});

test("checkLock lança AlreadyInstalledError com a mensagem exata do AC3", () => {
  const lock = { modules: { alpha: { version: "1.0.0" } } };
  try {
    checkLock(lock, "alpha");
    assert.fail("deveria ter lançado AlreadyInstalledError");
  } catch (err) {
    assert.ok(err instanceof AlreadyInstalledError);
    assert.equal(err.message, "already installed alpha@1.0.0");
  }
});

test("resolveDeps lança MissingDepsError listando a dependência ausente sem --with-deps", () => {
  const lock = { modules: {} };
  try {
    resolveDeps({ catalogRoot: FIXTURES_ROOT, manifest: betaManifest, lock, withDeps: false });
    assert.fail("deveria ter lançado MissingDepsError");
  } catch (err) {
    assert.ok(err instanceof MissingDepsError);
    assert.deepEqual(err.missing, [{ name: "alpha", range: "^1.0.0" }]);
  }
});

test("resolveDeps retorna ordem topológica com --with-deps", () => {
  const lock = { modules: {} };
  const result = resolveDeps({ catalogRoot: FIXTURES_ROOT, manifest: betaManifest, lock, withDeps: true });
  assert.deepEqual(result, { order: ["alpha", "beta"], missing: [] });
});

test("resolveDeps não reporta dependência já satisfeita pelo lock", () => {
  const lock = { modules: { alpha: { version: "1.0.0" } } };
  const result = resolveDeps({ catalogRoot: FIXTURES_ROOT, manifest: betaManifest, lock, withDeps: false });
  assert.deepEqual(result, { order: ["beta"], missing: [] });
});

test("resolveDeps lança CyclicDependencyError e nomeia o nó em um self-edge", () => {
  const manifest = readManifest(path.join(FIXTURES_ROOT, "self-cycle", "module.json"));
  const lock = { modules: {} };
  try {
    resolveDeps({ catalogRoot: FIXTURES_ROOT, manifest, lock, withDeps: true });
    assert.fail("deveria ter lançado CyclicDependencyError");
  } catch (err) {
    assert.ok(err instanceof CyclicDependencyError);
    assert.deepEqual(err.chain, ["self-cycle", "self-cycle"]);
    assert.match(err.message, /self-cycle/);
  }
});

test("resolveDeps lança CyclicDependencyError e nomeia os dois nós em um ciclo de dois nós", () => {
  const manifest = readManifest(path.join(FIXTURES_ROOT, "cycle-a", "module.json"));
  const lock = { modules: {} };
  try {
    resolveDeps({ catalogRoot: FIXTURES_ROOT, manifest, lock, withDeps: true });
    assert.fail("deveria ter lançado CyclicDependencyError");
  } catch (err) {
    assert.ok(err instanceof CyclicDependencyError);
    assert.deepEqual(err.chain, ["cycle-a", "cycle-b", "cycle-a"]);
    assert.match(err.message, /cycle-a.*cycle-b.*cycle-a/);
  }
});

test("resolveDeps lança CyclicDependencyError e nomeia a cadeia completa em um ciclo de três nós", () => {
  const manifest = readManifest(path.join(FIXTURES_ROOT, "cycle-x", "module.json"));
  const lock = { modules: {} };
  try {
    resolveDeps({ catalogRoot: FIXTURES_ROOT, manifest, lock, withDeps: true });
    assert.fail("deveria ter lançado CyclicDependencyError");
  } catch (err) {
    assert.ok(err instanceof CyclicDependencyError);
    assert.deepEqual(err.chain, ["cycle-x", "cycle-y", "cycle-z", "cycle-x"]);
  }
});

test("resolveDeps detecta um ciclo alcançável apenas por um nó que não é o alvo da instalação", () => {
  const manifest = readManifest(path.join(FIXTURES_ROOT, "root-cycle", "module.json"));
  const lock = { modules: {} };
  try {
    resolveDeps({ catalogRoot: FIXTURES_ROOT, manifest, lock, withDeps: true });
    assert.fail("deveria ter lançado CyclicDependencyError");
  } catch (err) {
    assert.ok(err instanceof CyclicDependencyError);
    assert.ok(err.chain.includes("deep-cycle-a"));
    assert.ok(err.chain.includes("deep-cycle-b"));
  }
});

test("resolveDeps resolve um diamante sem falso positivo de ciclo, com ordem topológica válida", () => {
  const manifest = readManifest(path.join(FIXTURES_ROOT, "diamond-a", "module.json"));
  const lock = { modules: {} };
  const result = resolveDeps({ catalogRoot: FIXTURES_ROOT, manifest, lock, withDeps: true });

  assert.deepEqual(result.missing, []);
  assert.deepEqual([...result.order].sort(), ["diamond-a", "diamond-b", "diamond-c", "diamond-d"]);

  const indexOf = (name) => result.order.indexOf(name);
  assert.ok(indexOf("diamond-d") < indexOf("diamond-b"));
  assert.ok(indexOf("diamond-d") < indexOf("diamond-c"));
  assert.ok(indexOf("diamond-b") < indexOf("diamond-a"));
  assert.ok(indexOf("diamond-c") < indexOf("diamond-a"));
});

test("planCopy monta a lista from/to seguindo a convenção api/** -> apps/api/src/modules/<name>/**", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "plan-copy-"));
  const { files, conflicts } = planCopy(path.join(FIXTURES_ROOT, "alpha"), alphaManifest, { targetRoot: dir });

  assert.deepEqual(conflicts, []);
  assert.deepEqual(files, [
    {
      from: path.join(FIXTURES_ROOT, "alpha", "api", "alpha.module.ts"),
      to: path.join(dir, "apps/api/src/modules/alpha/alpha.module.ts"),
    },
  ]);
});

test("planCopy reporta conflito quando o destino já existe", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "plan-copy-"));
  const destDir = path.join(dir, "apps/api/src/modules/alpha");
  mkdirSync(destDir, { recursive: true });
  writeFileSync(path.join(destDir, "alpha.module.ts"), "// já existe\n", "utf8");

  const { conflicts } = planCopy(path.join(FIXTURES_ROOT, "alpha"), alphaManifest, { targetRoot: dir });

  assert.deepEqual(conflicts, [path.join(dir, "apps/api/src/modules/alpha/alpha.module.ts")]);
});
