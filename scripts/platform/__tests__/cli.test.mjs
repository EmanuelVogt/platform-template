import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { run } from "../cli.mjs";
import { EXIT_CODES } from "../lib/exit-codes.mjs";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_ROOT = path.join(TESTS_DIR, "fixtures/catalog");
const CHILD_FIXTURE = path.join(TESTS_DIR, "fixtures/child");

function makeChild() {
  const dir = mkdtempSync(path.join(tmpdir(), "cli-child-"));
  cpSync(CHILD_FIXTURE, dir, { recursive: true });
  // The fixture cannot carry the real name: copier writes any file called
  // `.copier-answers.yml` to the product root (copier-answers-leak.test.mjs).
  renameSync(path.join(dir, "copier-answers.yml"), path.join(dir, ".copier-answers.yml"));
  return dir;
}

function setTemplateVersion(child, commit) {
  writeFileSync(
    path.join(child, ".copier-answers.yml"),
    `_src_path: gh:EmanuelVogt/platform-template\n_commit: ${commit}\n`,
    "utf8",
  );
}

function makeStubRun(overrides = {}) {
  const calls = [];
  const stubRun = (command, args, options) => {
    calls.push({ command, args, options });
    const key = [command, ...args].join(" ");
    for (const [pattern, result] of Object.entries(overrides)) {
      if (key.includes(pattern)) return result;
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  return { run: stubRun, calls };
}

async function captureOutput(streamName, fn) {
  const stream = process[streamName];
  const original = stream.write.bind(stream);
  let output = "";
  stream.write = (chunk) => {
    output += chunk;
    return true;
  };
  try {
    const result = await fn();
    return { result, output };
  } finally {
    stream.write = original;
  }
}

function alphaDestFile(child) {
  return path.join(child, "apps/api/src/modules/alpha/alpha.module.ts");
}

function lockOf(child) {
  return JSON.parse(readFileSync(path.join(child, ".platform-modules.lock"), "utf8"));
}

async function installAlpha(child) {
  const { run: stubRun } = makeStubRun();
  return run(["module", "add", "alpha", "--catalog-ref", CATALOG_ROOT], { cwd: child, run: stubRun });
}

test("module add instala alpha com sucesso: copia arquivo, grava lock e registries", async () => {
  const child = makeChild();
  const { run: stubRun, calls } = makeStubRun();

  const exitCode = await run(["module", "add", "alpha", "--catalog-ref", CATALOG_ROOT], { cwd: child, run: stubRun });

  assert.equal(exitCode, EXIT_CODES.OK);
  assert.equal(readFileSync(alphaDestFile(child), "utf8"), "export class AlphaModule {}\n");

  const apiTestCall = calls.find((call) => call.args.includes("--project"));
  assert.deepEqual(apiTestCall.args, ["vitest", "run", "--project", "api", "apps/api/src/modules/alpha"]);

  const lock = lockOf(child);
  assert.equal(lock.modules.alpha.version, "1.0.0");
  assert.deepEqual(lock.modules.alpha.migrations, ["0000_alpha_baseline.sql"]);

  const platformModules = readFileSync(path.join(child, "apps/api/src/platform-modules.ts"), "utf8");
  assert.match(platformModules, /import \{ AlphaModule \} from "\.\/modules\/alpha\/alpha\.module";/);
  assert.match(platformModules, /export const PLATFORM_MODULES = \[resolvePlatformModule\(AlphaModule\)\] as const;/);
});

test("module add grava o env do módulo em apps/api/.env (não na raiz), mesmo sem .env pré-existente", async () => {
  const child = makeChild();
  const { run: stubRun } = makeStubRun();

  const exitCode = await run(["module", "add", "epsilon", "--catalog-ref", CATALOG_ROOT], { cwd: child, run: stubRun });

  assert.equal(exitCode, EXIT_CODES.OK);
  assert.equal(existsSync(path.join(child, ".env")), false);
  assert.equal(existsSync(path.join(child, ".env.example")), false);
  assert.match(readFileSync(path.join(child, "apps/api/.env"), "utf8"), /EPSILON_SECRET=troque-me/);
  assert.match(readFileSync(path.join(child, "apps/api/.env.example"), "utf8"), /EPSILON_SECRET=troque-me/);
});

test("module add retorna exit 3 quando o catálogo é inacessível", async () => {
  const child = makeChild();
  const { run: stubRun } = makeStubRun();
  const missingCatalog = path.join(tmpdir(), "catalogo-inexistente-xyz");

  const exitCode = await run(["module", "add", "alpha", "--catalog-ref", missingCatalog], { cwd: child, run: stubRun });

  assert.equal(exitCode, EXIT_CODES.CATALOG_UNREACHABLE);
  assert.equal(existsSync(path.join(child, ".platform-modules.lock")), false);
});

test("module add retorna exit 3 quando o módulo não existe no catálogo", async () => {
  const child = makeChild();
  const { run: stubRun } = makeStubRun();

  const exitCode = await run(["module", "add", "nao-existe", "--catalog-ref", CATALOG_ROOT], { cwd: child, run: stubRun });

  assert.equal(exitCode, EXIT_CODES.CATALOG_UNREACHABLE);
});

test("module add retorna exit 4 quando o módulo já está instalado", async () => {
  const child = makeChild();
  assert.equal(await installAlpha(child), EXIT_CODES.OK);

  const { run: stubRun } = makeStubRun();
  const { result: exitCode, output } = await captureOutput("stderr", () =>
    run(["module", "add", "alpha", "--catalog-ref", CATALOG_ROOT], { cwd: child, run: stubRun }),
  );

  assert.equal(exitCode, EXIT_CODES.ALREADY_INSTALLED);
  assert.match(output, /already installed alpha@1\.0\.0/);
});

test("module add retorna exit 5 quando faltam dependências sem --with-deps", async () => {
  const child = makeChild();
  const { run: stubRun } = makeStubRun();

  const { result: exitCode, output } = await captureOutput("stderr", () =>
    run(["module", "add", "beta", "--catalog-ref", CATALOG_ROOT], { cwd: child, run: stubRun }),
  );

  assert.equal(exitCode, EXIT_CODES.MISSING_DEPS);
  assert.match(output, /alpha@\^1\.0\.0/);
  assert.equal(existsSync(path.join(child, ".platform-modules.lock")), false);
});

test("module add retorna exit 5 e sem stack trace quando há ciclo de dependências", async () => {
  const child = makeChild();
  const { run: stubRun } = makeStubRun();

  const { result: exitCode, output } = await captureOutput("stderr", () =>
    run(["module", "add", "cycle-a", "--catalog-ref", CATALOG_ROOT, "--with-deps"], { cwd: child, run: stubRun }),
  );

  assert.equal(exitCode, EXIT_CODES.MISSING_DEPS);
  assert.match(output, /cycle-a -> cycle-b -> cycle-a/);
  assert.doesNotMatch(output, /\bat .+\.mjs:\d+/);
  assert.equal(existsSync(path.join(child, ".platform-modules.lock")), false);
});

test("module add --with-deps instala alpha antes de beta", async () => {
  const child = makeChild();
  const { run: stubRun, calls } = makeStubRun();

  const exitCode = await run(["module", "add", "beta", "--catalog-ref", CATALOG_ROOT, "--with-deps"], {
    cwd: child,
    run: stubRun,
  });

  assert.equal(exitCode, EXIT_CODES.OK);
  const lock = lockOf(child);
  assert.ok(lock.modules.alpha);
  assert.ok(lock.modules.beta);

  const alphaIdx = calls.findIndex((call) => call.args.includes("alpha_baseline"));
  const betaIdx = calls.findIndex((call) => call.args.includes("beta_baseline"));
  assert.ok(alphaIdx !== -1 && betaIdx !== -1 && alphaIdx < betaIdx);
});

test("module add retorna exit 6 quando o destino já existe, e --force sobrescreve", async () => {
  const child = makeChild();
  mkdirSync(path.dirname(alphaDestFile(child)), { recursive: true });
  writeFileSync(alphaDestFile(child), "// já existe\n", "utf8");

  const { run: stubRun } = makeStubRun();
  const { result: exitCode, output } = await captureOutput("stderr", () =>
    run(["module", "add", "alpha", "--catalog-ref", CATALOG_ROOT], { cwd: child, run: stubRun }),
  );

  assert.equal(exitCode, EXIT_CODES.DESTINATION_EXISTS);
  assert.match(output, /--force/);
  assert.equal(existsSync(path.join(child, ".platform-modules.lock")), false);

  const { run: forceRun } = makeStubRun();
  const forcedExitCode = await run(["module", "add", "alpha", "--catalog-ref", CATALOG_ROOT, "--force"], {
    cwd: child,
    run: forceRun,
  });

  assert.equal(forcedExitCode, EXIT_CODES.OK);
  assert.equal(readFileSync(alphaDestFile(child), "utf8"), "export class AlphaModule {}\n");
});

test("module add retorna exit 7 quando os testes falham após a cópia, mantendo os arquivos", async () => {
  const child = makeChild();
  const { run: stubRun } = makeStubRun({ "modules/alpha": { status: 1, stdout: "", stderr: "falhou\n" } });

  const { result: exitCode, output } = await captureOutput("stderr", () =>
    run(["module", "add", "alpha", "--catalog-ref", CATALOG_ROOT], { cwd: child, run: stubRun }),
  );

  assert.equal(exitCode, EXIT_CODES.TEST_FAILURE);
  assert.match(output, /--rollback/);
  assert.equal(existsSync(alphaDestFile(child)), true);
  assert.ok(lockOf(child).modules.alpha);
});

test("module add --skip-tests não executa pnpm test", async () => {
  const child = makeChild();
  const { run: stubRun, calls } = makeStubRun({ "modules/alpha": { status: 1, stdout: "", stderr: "" } });

  const exitCode = await run(["module", "add", "alpha", "--catalog-ref", CATALOG_ROOT, "--skip-tests"], {
    cwd: child,
    run: stubRun,
  });

  assert.equal(exitCode, EXIT_CODES.OK);
  assert.ok(!calls.some((call) => call.args.includes("modules/alpha")));
});

test("module add retorna exit 8 quando kernelRange não é satisfeito", async () => {
  const child = makeChild();
  setTemplateVersion(child, "v3.0.0");
  const { run: stubRun } = makeStubRun();

  const exitCode = await run(["module", "add", "alpha", "--catalog-ref", CATALOG_ROOT], { cwd: child, run: stubRun });

  assert.equal(exitCode, EXIT_CODES.KERNEL_RANGE_UNSATISFIED);
  assert.equal(existsSync(path.join(child, ".platform-modules.lock")), false);
});

test("module add retorna exit 9 quando drizzle-kit check falha, mantendo os arquivos", async () => {
  const child = makeChild();
  const { run: stubRun } = makeStubRun({ "drizzle-kit check": { status: 1, stdout: "drift\n", stderr: "" } });

  const { result: exitCode, output } = await captureOutput("stderr", () =>
    run(["module", "add", "alpha", "--catalog-ref", CATALOG_ROOT], { cwd: child, run: stubRun }),
  );

  assert.equal(exitCode, EXIT_CODES.MIGRATION_FAILURE);
  assert.match(output, /--rollback/);
  assert.equal(existsSync(alphaDestFile(child)), true);
  assert.deepEqual(lockOf(child).modules.alpha.migrations, []);
});

test("module add --dry-run não escreve nada em disco", async () => {
  const child = makeChild();
  const { run: stubRun, calls } = makeStubRun();

  const { result: exitCode, output } = await captureOutput("stdout", () =>
    run(["module", "add", "alpha", "--catalog-ref", CATALOG_ROOT, "--dry-run"], { cwd: child, run: stubRun }),
  );

  assert.equal(exitCode, EXIT_CODES.OK);
  assert.equal(existsSync(alphaDestFile(child)), false);
  assert.equal(existsSync(path.join(child, ".platform-modules.lock")), false);
  assert.equal(calls.length, 0);
  assert.match(output, /alpha\.module\.ts/);
});

test("module add --rollback remove arquivos, lock e não afeta outros módulos", async () => {
  const child = makeChild();
  assert.equal(await installAlpha(child), EXIT_CODES.OK);

  const { run: stubRun } = makeStubRun();
  const exitCode = await run(["module", "add", "alpha", "--catalog-ref", CATALOG_ROOT, "--rollback"], {
    cwd: child,
    run: stubRun,
  });

  assert.equal(exitCode, EXIT_CODES.OK);
  assert.equal(existsSync(alphaDestFile(child)), false);
  assert.equal(lockOf(child).modules.alpha, undefined);
});

test("module adopt grava o lock sem copiar arquivos", async () => {
  const child = makeChild();
  const sentinel = "// já presente manualmente (v0.2)\nexport class AlphaModule {}\n";
  mkdirSync(path.dirname(alphaDestFile(child)), { recursive: true });
  writeFileSync(alphaDestFile(child), sentinel, "utf8");

  const exitCode = await run(["module", "adopt", "alpha", "--catalog-ref", CATALOG_ROOT], { cwd: child });

  assert.equal(exitCode, EXIT_CODES.OK);
  assert.equal(readFileSync(alphaDestFile(child), "utf8"), sentinel);
  assert.ok(lockOf(child).modules.alpha.files[0].path.endsWith("alpha.module.ts"));
});

test("module list imprime a versão do lock e a versão HEAD do catálogo", async () => {
  const child = makeChild();
  assert.equal(await installAlpha(child), EXIT_CODES.OK);

  const { result: exitCode, output } = await captureOutput("stdout", () =>
    run(["module", "list", "--catalog-ref", CATALOG_ROOT], { cwd: child }),
  );

  assert.equal(exitCode, EXIT_CODES.OK);
  assert.match(output, /alpha: lock=1\.0\.0 catalog=1\.0\.0/);
});

test("module update imprime a instrução da skill port-module-update", async () => {
  const { result: exitCode, output } = await captureOutput("stdout", () => run(["module", "update", "alpha"]));

  assert.equal(exitCode, EXIT_CODES.OK);
  assert.match(output, /port-module-update/);
});

test("advisory detect executa o comando detect e retorna exit 1 quando afetado", async () => {
  const advisoriesDir = mkdtempSync(path.join(tmpdir(), "advisories-"));
  writeFileSync(
    path.join(advisoriesDir, "ADV-20260901-01.md"),
    [
      "---",
      'id: "ADV-20260901-01"',
      'kind: "security"',
      'module: "alpha"',
      'affects: ">=1.0.0 <2.0.0"',
      'severity: "high"',
      'detect: "meu-detector --check"',
      'fix: "resumo"',
      'parity: "apps/api/src/modules/alpha/__parity__/x.parity.spec.ts"',
      "---",
      "Corpo em pt-BR.",
      "",
    ].join("\n"),
    "utf8",
  );
  const { run: stubRun, calls } = makeStubRun({ "meu-detector": { status: 1, stdout: "", stderr: "" } });

  const exitCode = await run(["advisory", "detect", "ADV-20260901-01"], { advisoriesDir, run: stubRun });

  assert.equal(exitCode, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "meu-detector");
  assert.deepEqual(calls[0].args, ["--check"]);
});

test("advisory detect retorna exit 0 quando o comando detect não acusa afetação", async () => {
  const advisoriesDir = mkdtempSync(path.join(tmpdir(), "advisories-"));
  writeFileSync(
    path.join(advisoriesDir, "ADV-20260901-02.md"),
    [
      "---",
      'id: "ADV-20260901-02"',
      'kind: "bug"',
      'module: "alpha"',
      'affects: ">=1.0.0 <2.0.0"',
      'severity: "low"',
      'detect: "meu-detector --check"',
      'fix: "resumo"',
      'parity: "apps/api/src/modules/alpha/__parity__/x.parity.spec.ts"',
      "---",
      "Corpo em pt-BR.",
      "",
    ].join("\n"),
    "utf8",
  );
  const { run: stubRun } = makeStubRun({ "meu-detector": { status: 0, stdout: "", stderr: "" } });

  const exitCode = await run(["advisory", "detect", "ADV-20260901-02"], { advisoriesDir, run: stubRun });

  assert.equal(exitCode, EXIT_CODES.OK);
});
