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

// generateForModule lê do journal o que o drizzle registrou (issue #11); para o lock
// gravar o baseline, o stub precisa simular o journal andando a cada `generate`.
function withDrizzleJournal(child, stubRun) {
  return (command, args, options) => {
    const result = stubRun(command, args, options);
    if (args.includes("generate")) {
      const migrationsDir = path.join(child, "apps/api/drizzle/migrations");
      mkdirSync(path.join(migrationsDir, "meta"), { recursive: true });
      const journalPath = path.join(migrationsDir, "meta/_journal.json");
      const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) : { entries: [] };
      const tag = `${String(journal.entries.length).padStart(4, "0")}_${args[args.indexOf("--name") + 1]}`;
      journal.entries.push({ idx: journal.entries.length, tag });
      writeFileSync(journalPath, JSON.stringify(journal), "utf8");
      writeFileSync(path.join(migrationsDir, `${tag}.sql`), "-- gerado\n", "utf8");
    }
    return result;
  };
}

test("module add instala alpha com sucesso: copia arquivo, grava lock e registries", async () => {
  const child = makeChild();
  const { run: stubRun, calls } = makeStubRun();

  const exitCode = await run(["module", "add", "alpha", "--catalog-ref", CATALOG_ROOT], {
    cwd: child,
    run: withDrizzleJournal(child, stubRun),
  });

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

function writeKernelAdvisory(dir) {
  mkdirSync(path.join(dir, "docs", "advisories"), { recursive: true });
  writeFileSync(path.join(dir, "docs", "advisories", "APPLIED.md"), "");
  writeFileSync(
    path.join(dir, "docs", "advisories", "ADV-20260823-01.md"),
    [
      "---",
      'id: "ADV-20260823-01"',
      'kind: "bug"',
      'module: "kernel"',
      'affects: ">=2.0.0 <2.1.0"',
      'severity: "high"',
      'detect: "pnpm platform status"',
      'fix: "copier update para >= v2.1.0"',
      'parity: "scripts/platform/__tests__/lint.test.mjs"',
      "---",
      "Corpo em pt-BR.",
      "",
    ].join("\n"),
    "utf8",
  );
}

test("status --json reporta advisory de kernel pendente sem quebrar o shape existente", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "cli-status-"));
  writeFileSync(
    path.join(cwd, ".copier-answers.yml"),
    "_src_path: gh:EmanuelVogt/platform-template\n_commit: v2.0.0\n",
    "utf8",
  );
  writeKernelAdvisory(cwd);

  const { result: exitCode, output } = await captureOutput("stdout", () =>
    run(["status", "--json"], { cwd, fetchTags: () => ["v2.0.0"], now: Date.parse("2026-08-23T12:00:00Z") }),
  );

  assert.equal(exitCode, EXIT_CODES.OK);
  const status = JSON.parse(output);
  assert.equal(status.advisories.noLock, true);
  assert.deepEqual(status.advisories.pending, [
    { id: "ADV-20260823-01", kind: "bug", severity: "high", module: "kernel", ageDays: 0, overdue: false },
  ]);
  assert.deepEqual(Object.keys(status).sort(), ["advisories", "modules", "template"]);
});

test("status --json não reporta o advisory de kernel quando a versão instalada está fora do affects", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "cli-status-"));
  writeFileSync(
    path.join(cwd, ".copier-answers.yml"),
    "_src_path: gh:EmanuelVogt/platform-template\n_commit: v2.1.0\n",
    "utf8",
  );
  writeKernelAdvisory(cwd);

  const { output } = await captureOutput("stdout", () => run(["status", "--json"], { cwd, fetchTags: () => ["v2.1.0"] }));

  assert.deepEqual(JSON.parse(output).advisories.pending, []);
});

function writeSecurityKernelAdvisory(dir, id) {
  mkdirSync(path.join(dir, "docs", "advisories"), { recursive: true });
  writeFileSync(path.join(dir, "docs", "advisories", "APPLIED.md"), "");
  writeFileSync(
    path.join(dir, "docs", "advisories", `${id}.md`),
    [
      "---",
      `id: "${id}"`,
      'kind: "security"',
      'module: "kernel"',
      'affects: ">=2.0.0 <2.1.0"',
      'severity: "critical"',
      'detect: "pnpm platform status"',
      'fix: "copier update para >= v2.1.0"',
      'parity: "scripts/platform/__tests__/lint.test.mjs"',
      "---",
      "Corpo em pt-BR.",
      "",
    ].join("\n"),
    "utf8",
  );
}

test("status --json marca overdue uma advisory de kernel security com 10 dias (CAD-01)", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "cli-status-"));
  writeFileSync(path.join(cwd, ".copier-answers.yml"), "_src_path: gh:EmanuelVogt/platform-template\n_commit: v2.0.0\n", "utf8");
  writeSecurityKernelAdvisory(cwd, "ADV-20260801-01");

  const { output } = await captureOutput("stdout", () =>
    run(["status", "--json"], { cwd, fetchTags: () => ["v2.0.0"], now: Date.parse("2026-08-11T00:00:00Z") }),
  );

  assert.deepEqual(JSON.parse(output).advisories.pending, [
    { id: "ADV-20260801-01", kind: "security", severity: "critical", module: "kernel", ageDays: 10, overdue: true },
  ]);
});

test("status --json não marca overdue uma advisory de kernel security com 3 dias (CAD-01)", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "cli-status-"));
  writeFileSync(path.join(cwd, ".copier-answers.yml"), "_src_path: gh:EmanuelVogt/platform-template\n_commit: v2.0.0\n", "utf8");
  writeSecurityKernelAdvisory(cwd, "ADV-20260801-01");

  const { output } = await captureOutput("stdout", () =>
    run(["status", "--json"], { cwd, fetchTags: () => ["v2.0.0"], now: Date.parse("2026-08-04T00:00:00Z") }),
  );

  assert.deepEqual(JSON.parse(output).advisories.pending, [
    { id: "ADV-20260801-01", kind: "security", severity: "critical", module: "kernel", ageDays: 3, overdue: false },
  ]);
});

test("status --json soma template.latestPublishedDaysAgo a partir da tagDate do feed quando behind (CAD-02)", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "cli-status-"));
  writeFileSync(path.join(cwd, ".copier-answers.yml"), "_src_path: gh:EmanuelVogt/platform-template\n_commit: v2.0.0\n", "utf8");

  const { output } = await captureOutput("stdout", () =>
    run(["status", "--json"], {
      cwd,
      fetchTags: () => ["v2.0.0", "v2.1.0"],
      fetchFeed: () => ({ tag: "v2.1.0", tagDate: "2026-08-13T10:00:00-03:00", advisories: [], skipped: [] }),
      now: Date.parse("2026-08-23T00:00:00Z"),
    }),
  );

  assert.equal(JSON.parse(output).template.latestPublishedDaysAgo, 10);
});

test("status --json surfaces the feed error and still prints template/modules/advisories (spec edge case)", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "cli-status-"));
  writeFileSync(path.join(cwd, ".copier-answers.yml"), "_src_path: gh:EmanuelVogt/platform-template\n_commit: v2.0.0\n", "utf8");

  const { output } = await captureOutput("stdout", () =>
    run(["status", "--json"], {
      cwd,
      fetchTags: () => ["v2.0.0", "v2.1.0"],
      fetchFeed: () => {
        throw new Error("feed do template inacessível: offline");
      },
    }),
  );

  const status = JSON.parse(output);
  assert.match(status.template.feedError, /offline/);
  assert.deepEqual(status.template.behind, ["v2.1.0"]);
  assert.deepEqual(status.advisories, { noLock: true, pending: [] });
});

test("status (texto) mostra a falha do feed sem derrubar o resto da saída (spec edge case)", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "cli-status-"));
  writeFileSync(path.join(cwd, ".copier-answers.yml"), "_src_path: gh:EmanuelVogt/platform-template\n_commit: v2.0.0\n", "utf8");
  writeFileSync(path.join(cwd, ".platform-modules.lock"), JSON.stringify({ modules: { alpha: { version: "1.0.0" } } }));

  const { output } = await captureOutput("stdout", () =>
    run(["status"], {
      cwd,
      fetchTags: () => ["v2.0.0", "v2.1.0"],
      fetchFeed: () => {
        throw new Error("offline");
      },
    }),
  );

  assert.equal(
    output,
    "template: gh:EmanuelVogt/platform-template installed=v2.0.0 latest=v2.1.0 — 1 versão(ões) atrás: v2.1.0\n" +
      "template: feed não consultado — offline\n" +
      "modules: alpha lock=1.0.0 (catálogo: pnpm platform module list)\n" +
      "advisories: nenhuma pendente\n",
  );
});

test("status --json names the remote advisory files the feed skipped for failing to parse (spec edge case)", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "cli-status-"));
  writeFileSync(path.join(cwd, ".copier-answers.yml"), "_src_path: gh:EmanuelVogt/platform-template\n_commit: v2.0.0\n", "utf8");

  const { output } = await captureOutput("stdout", () =>
    run(["status", "--json"], {
      cwd,
      fetchTags: () => ["v2.0.0", "v2.1.0"],
      fetchFeed: () => ({
        tag: "v2.1.0",
        tagDate: "2026-08-13T10:00:00-03:00",
        advisories: [],
        skipped: [{ file: "ADV-20260901-09.md", reason: "campo obrigatório ausente: fix" }],
      }),
      now: Date.parse("2026-08-23T00:00:00Z"),
    }),
  );

  assert.deepEqual(JSON.parse(output).advisories.feedSkipped, [
    { file: "ADV-20260901-09.md", reason: "campo obrigatório ausente: fix" },
  ]);
});

test("status (texto) nomeia o arquivo do feed ignorado por falha de parse (spec edge case)", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "cli-status-"));
  writeFileSync(path.join(cwd, ".copier-answers.yml"), "_src_path: gh:EmanuelVogt/platform-template\n_commit: v2.0.0\n", "utf8");

  const { output } = await captureOutput("stdout", () =>
    run(["status"], {
      cwd,
      fetchTags: () => ["v2.0.0", "v2.1.0"],
      fetchFeed: () => ({
        tag: "v2.1.0",
        tagDate: "2026-08-13T10:00:00-03:00",
        advisories: [],
        skipped: [{ file: "ADV-20260901-09.md", reason: "campo obrigatório ausente: fix" }],
      }),
      now: Date.parse("2026-08-23T00:00:00Z"),
    }),
  );

  assert.match(output, /advisories: 1 arquivo\(s\) do feed remoto ignorado\(s\) — ADV-20260901-09\.md \(campo obrigatório ausente: fix\)/);
});

test("status (texto) permanece byte-idêntico ao formato atual quando não há tags atrás nem advisories pendentes (CAD-03)", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "cli-status-"));
  writeFileSync(path.join(cwd, ".copier-answers.yml"), "_src_path: gh:EmanuelVogt/platform-template\n_commit: v2.0.0\n", "utf8");
  writeFileSync(path.join(cwd, ".platform-modules.lock"), JSON.stringify({ modules: { alpha: { version: "1.0.0" } } }));

  const { result: exitCode, output } = await captureOutput("stdout", () =>
    run(["status"], { cwd, fetchTags: () => ["v2.0.0"] }),
  );

  assert.equal(exitCode, EXIT_CODES.OK);
  assert.equal(
    output,
    "template: gh:EmanuelVogt/platform-template installed=v2.0.0 latest=v2.0.0 — atualizado\n" +
      "modules: alpha lock=1.0.0 (catálogo: pnpm platform module list)\n" +
      "advisories: nenhuma pendente\n",
  );
});
