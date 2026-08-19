import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { copyFiles, rollback, writeEnv, writeLock, writeRegistry } from "../lib/apply.mjs";
import { readLock } from "../lib/lock.mjs";

function makeChild() {
  return mkdtempSync(path.join(tmpdir(), "apply-child-"));
}

test("copyFiles copia arquivos criando os diretórios de destino", () => {
  const child = makeChild();
  const srcDir = mkdtempSync(path.join(tmpdir(), "apply-src-"));
  const srcFile = path.join(srcDir, "alpha.module.ts");
  writeFileSync(srcFile, "export class AlphaModule {}\n", "utf8");
  const destFile = path.join(child, "apps/api/src/modules/alpha/alpha.module.ts");

  copyFiles([{ from: srcFile, to: destFile }]);

  assert.equal(readFileSync(destFile, "utf8"), "export class AlphaModule {}\n");
});

test("writeEnv anexa o bloco do módulo uma única vez em .env.example", () => {
  const child = makeChild();
  const envExamplePath = path.join(child, ".env.example");
  writeFileSync(envExamplePath, "DB_URL=postgres://localhost\n", "utf8");
  const envVars = [{ name: "IDENTITY_SESSION_TTL_SECONDS", example: "86400", required: false }];

  writeEnv({ envExamplePath, envPath: path.join(child, ".env"), moduleName: "identity", envVars });
  const afterFirst = readFileSync(envExamplePath, "utf8");
  writeEnv({ envExamplePath, envPath: path.join(child, ".env"), moduleName: "identity", envVars });
  const afterSecond = readFileSync(envExamplePath, "utf8");

  assert.equal(afterFirst, afterSecond);
  assert.match(afterFirst, /# identity\nIDENTITY_SESSION_TTL_SECONDS=86400\n/);
  assert.match(afterFirst, /^DB_URL=postgres:\/\/localhost/);
});

test("writeEnv preserva valor existente em .env e só acrescenta chaves ausentes", () => {
  const child = makeChild();
  const envExamplePath = path.join(child, ".env.example");
  const envPath = path.join(child, ".env");
  writeFileSync(envPath, "IDENTITY_SESSION_TTL_SECONDS=999\n", "utf8");
  const envVars = [
    { name: "IDENTITY_SESSION_TTL_SECONDS", example: "86400", required: false },
    { name: "IDENTITY_OTHER_VAR", example: "x", required: false },
  ];

  writeEnv({ envExamplePath, envPath, moduleName: "identity", envVars });

  const content = readFileSync(envPath, "utf8");
  assert.match(content, /IDENTITY_SESSION_TTL_SECONDS=999/);
  assert.doesNotMatch(content, /IDENTITY_SESSION_TTL_SECONDS=86400/);
  assert.match(content, /IDENTITY_OTHER_VAR=x/);
});

test("writeRegistry gera platform-modules.ts e platform-schema.ts de forma idempotente", () => {
  const child = makeChild();
  const platformModulesPath = path.join(child, "apps/api/src/platform-modules.ts");
  const platformSchemaPath = path.join(child, "apps/api/src/db/platform-schema.ts");
  const entries = [
    {
      name: "identity",
      apiModule: { export: "IdentityModule", path: "modules/identity/identity.module" },
      schemaExports: ["modules/identity/infrastructure/tables/users.table"],
    },
  ];

  writeRegistry({ entries, platformModulesPath, platformSchemaPath });
  const firstModules = readFileSync(platformModulesPath, "utf8");
  const firstSchema = readFileSync(platformSchemaPath, "utf8");
  writeRegistry({ entries, platformModulesPath, platformSchemaPath });
  const secondModules = readFileSync(platformModulesPath, "utf8");
  const secondSchema = readFileSync(platformSchemaPath, "utf8");

  assert.equal(firstModules, secondModules);
  assert.equal(firstSchema, secondSchema);
  assert.match(firstModules, /import \{ IdentityModule \} from "\.\/modules\/identity\/identity\.module";/);
  assert.match(firstModules, /export const PLATFORM_MODULES = \[IdentityModule\] as const;/);
  assert.match(firstSchema, /export \* from "\.\.\/modules\/identity\/infrastructure\/tables\/users\.table";/);
});

test("writeLock calcula sha256 de cada arquivo copiado e persiste no lock", () => {
  const child = makeChild();
  const lockPath = path.join(child, ".platform-modules.lock");
  const filePath = path.join(child, "apps/api/src/modules/alpha/alpha.module.ts");
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, "export class AlphaModule {}\n", "utf8");

  const nextLock = writeLock({
    lockPath,
    lock: { modules: {} },
    name: "alpha",
    entry: { version: "1.0.0", installedAt: "2026-08-19T00:00:00.000Z", catalogRef: "v1.0.0", files: [filePath], migrations: [] },
  });

  assert.equal(nextLock.modules.alpha.files[0].path, filePath);
  assert.match(nextLock.modules.alpha.files[0].sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(readLock(lockPath), nextLock);
});

test("rollback remove exatamente os files[] do lock, o bloco de env e as linhas de registro, e retira a entrada do lock", () => {
  const child = makeChild();
  const lockPath = path.join(child, ".platform-modules.lock");
  const filePath = path.join(child, "apps/api/src/modules/alpha/alpha.module.ts");
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, "export class AlphaModule {}\n", "utf8");

  const envExamplePath = path.join(child, ".env.example");
  const envPath = path.join(child, ".env");
  writeFileSync(envExamplePath, "DB_URL=x\n\n# alpha\nALPHA_VAR=1\n", "utf8");
  writeFileSync(envPath, "DB_URL=x\n\n# alpha\nALPHA_VAR=1\n", "utf8");

  const platformModulesPath = path.join(child, "apps/api/src/platform-modules.ts");
  const platformSchemaPath = path.join(child, "apps/api/src/db/platform-schema.ts");

  const lock = {
    modules: {
      alpha: {
        version: "1.0.0",
        installedAt: "2026-08-19T00:00:00.000Z",
        catalogRef: "v1.0.0",
        files: [{ path: filePath, sha256: "deadbeef" }],
        migrations: [],
      },
    },
  };
  writeFileSync(lockPath, JSON.stringify(lock, null, 2), "utf8");

  const result = rollback({
    lockPath,
    name: "alpha",
    envExamplePath,
    envPath,
    registry: { entries: [], platformModulesPath, platformSchemaPath },
  });

  assert.equal(existsSync(filePath), false);
  assert.equal(result.modules.alpha, undefined);
  assert.equal(readLock(lockPath).modules.alpha, undefined);
  assert.doesNotMatch(readFileSync(envExamplePath, "utf8"), /# alpha/);
  assert.doesNotMatch(readFileSync(envPath, "utf8"), /# alpha/);
  assert.match(readFileSync(envExamplePath, "utf8"), /DB_URL=x/);
});
