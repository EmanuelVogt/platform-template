import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..");
const ENTRYPOINT_PATH = path.join(REPO_ROOT, "apps", "api", "docker-entrypoint.sh");

const NODE_STUB = "#!/bin/sh\nif [ -n \"$NODE_INVOKED_LOG\" ]; then echo \"$1\" >> \"$NODE_INVOKED_LOG\"; fi\nexit 0\n";

function makeStubNodeBin() {
  const binDir = mkdtempSync(path.join(tmpdir(), "docker-entrypoint-bin-"));
  const nodePath = path.join(binDir, "node");
  writeFileSync(nodePath, NODE_STUB);
  chmodSync(nodePath, 0o755);
  return binDir;
}

function runEntrypoint({ env, distDir }) {
  const binDir = makeStubNodeBin();
  const invokedLog = path.join(binDir, "invoked.log");
  writeFileSync(invokedLog, "");
  const result = spawnSync("sh", [ENTRYPOINT_PATH, "true"], {
    encoding: "utf8",
    env: {
      PATH: `${binDir}:${process.env.PATH}`,
      RUN_MIGRATIONS: "false",
      NODE_INVOKED_LOG: invokedLog,
      ...(distDir ? { DIST_DIR: distDir } : {}),
      ...env,
    },
  });
  const invoked = readFileSync(invokedLog, "utf8").split("\n").filter(Boolean);
  return { result, invoked };
}

test("MASTER_EMAIL e MASTER_PASSWORD presentes: invoca cada dist/modules/*/seeds/bootstrap.js encontrado", () => {
  const distDir = mkdtempSync(path.join(tmpdir(), "docker-entrypoint-dist-"));
  const identitySeeds = path.join(distDir, "modules", "identity", "seeds");
  mkdirSync(identitySeeds, { recursive: true });
  writeFileSync(path.join(identitySeeds, "bootstrap.js"), "");
  // módulo sem seeds/bootstrap.js — o glob não deve inventar um caminho pra ele.
  mkdirSync(path.join(distDir, "modules", "no-seed-here"), { recursive: true });

  const { result, invoked } = runEntrypoint({
    distDir,
    env: { MASTER_EMAIL: "admin@example.com", MASTER_PASSWORD: "secret" },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(invoked, [path.join(distDir, "modules", "identity", "seeds", "bootstrap.js")]);
});

test("MASTER_EMAIL e MASTER_PASSWORD ausentes: nenhum seed roda", () => {
  const distDir = mkdtempSync(path.join(tmpdir(), "docker-entrypoint-dist-"));
  const identitySeeds = path.join(distDir, "modules", "identity", "seeds");
  mkdirSync(identitySeeds, { recursive: true });
  writeFileSync(path.join(identitySeeds, "bootstrap.js"), "");

  const { result, invoked } = runEntrypoint({ distDir, env: {} });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(invoked, []);
});

test("só MASTER_EMAIL presente (falta MASTER_PASSWORD): nenhum seed roda", () => {
  const distDir = mkdtempSync(path.join(tmpdir(), "docker-entrypoint-dist-"));
  const identitySeeds = path.join(distDir, "modules", "identity", "seeds");
  mkdirSync(identitySeeds, { recursive: true });
  writeFileSync(path.join(identitySeeds, "bootstrap.js"), "");

  const { result, invoked } = runEntrypoint({
    distDir,
    env: { MASTER_EMAIL: "admin@example.com" },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(invoked, []);
});

test("glob sem nenhum match (DIST_DIR sem modules/) não derruba o boot", () => {
  const distDir = mkdtempSync(path.join(tmpdir(), "docker-entrypoint-dist-"));

  const { result, invoked } = runEntrypoint({
    distDir,
    env: { MASTER_EMAIL: "admin@example.com", MASTER_PASSWORD: "secret" },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(invoked, []);
});
