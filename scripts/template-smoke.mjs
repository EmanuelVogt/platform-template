#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_CODES } from "./platform/lib/exit-codes.mjs";
import { installChild, renderChild } from "./platform/lib/render-child.mjs";

const EXPECTED_SCHEMAS = ["_kernel", "drizzle"];
const ALLOWED_EXTRA_SCHEMAS = ["public"];
const HEALTH_PORT = "3222";

export function parseArgs(argv) {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    dryRun: argv.includes("--dry-run") || argv.includes("--plan"),
    keep: argv.includes("--keep"),
  };
}

export function helpText() {
  return [
    "Uso: pnpm template:smoke [opções]",
    "",
    "Renderiza um child kernel-only via copier e roda as quatro checagens de fumaça:",
    ...planSteps().map((step, i) => `  ${i + 1}. ${step}`),
    "",
    "Opções:",
    "  --dry-run, --plan   mostra os passos sem executar nada",
    "  --keep              mantém o diretório do child ao final (debug)",
    "  --help, -h          mostra esta ajuda",
  ].join("\n");
}

export function planSteps() {
  return [
    "pnpm check && pnpm test no child",
    "db:migrate num Postgres efêmero — só _kernel, drizzle e o public do Postgres podem existir",
    "GET /health no child retorna 200",
    "RULE C (module-boundaries.spec.ts) passa no child",
  ];
}

export function parseSchemaList(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function schemasMatchExpected(actualSchemas, expected = EXPECTED_SCHEMAS, allowedExtra = ALLOWED_EXTRA_SCHEMAS) {
  const actual = new Set(actualSchemas);
  const wanted = new Set(expected);
  const allowed = new Set([...wanted, ...allowedExtra]);
  for (const name of wanted) {
    if (!actual.has(name)) return false;
  }
  for (const name of actual) {
    if (!allowed.has(name)) return false;
  }
  return true;
}

function defaultSleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export async function waitForPostgresReady({ containerId, run, attempts = 30, delayMs = 500, sleep = defaultSleep }) {
  for (let i = 0; i < attempts; i += 1) {
    const probe = run("docker", ["exec", containerId, "pg_isready", "-U", "postgres"]);
    if (probe.status === 0) return true;
    await sleep(delayMs);
  }
  return false;
}

export async function waitForHealth({ url, fetchImpl = fetch, attempts = 30, delayMs = 500, sleep = defaultSleep }) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetchImpl(url);
      if (res.status === 200) return true;
    } catch {
      // servidor ainda não está de pé — tenta de novo
    }
    await sleep(delayMs);
  }
  return false;
}

function defaultRun(command, args, options) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function defaultSpawnProcess(command, args, options) {
  return spawn(command, args, { stdio: "ignore", ...options });
}

function defaultScratchDir() {
  return mkdtempSync(path.join(tmpdir(), "template-smoke-"));
}

async function checkMigrateAndSchema({ childDir, run, sleep, log }) {
  const startResult = run("docker", [
    "run",
    "--rm",
    "-d",
    "-e",
    "POSTGRES_PASSWORD=postgres",
    "-e",
    "POSTGRES_DB=smoke",
    "-P",
    "postgres:16-alpine",
  ]);
  if (startResult.status !== 0) {
    log(`template:smoke — não consegui subir um Postgres efêmero via docker (código ${startResult.status}); verifique se o daemon está rodando`);
    return EXIT_CODES.CATALOG_UNREACHABLE;
  }
  const containerId = startResult.stdout.trim();

  try {
    const ready = await waitForPostgresReady({ containerId, run, sleep });
    if (!ready) {
      log("template:smoke — Postgres efêmero não ficou pronto a tempo (pg_isready nunca retornou 0)");
      return EXIT_CODES.CATALOG_UNREACHABLE;
    }

    const portResult = run("docker", ["port", containerId, "5432/tcp"]);
    const mappedPort = portResult.stdout.trim().split("\n")[0]?.split(":").pop();
    if (!mappedPort) {
      log("template:smoke — não consegui descobrir a porta publicada do Postgres efêmero");
      return EXIT_CODES.CATALOG_UNREACHABLE;
    }
    const databaseUrl = `postgres://postgres:postgres@localhost:${mappedPort}/smoke`;

    const migrateResult = run("pnpm", ["--filter", "api", "run", "db:migrate"], {
      cwd: childDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    if (migrateResult.status !== 0) {
      log(`template:smoke — "pnpm --filter api run db:migrate" falhou no child (código ${migrateResult.status})`);
      return EXIT_CODES.MIGRATION_FAILURE;
    }

    const schemaResult = run("docker", [
      "exec",
      containerId,
      "psql",
      "-U",
      "postgres",
      "-d",
      "smoke",
      "-tAc",
      "SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY 1;",
    ]);
    if (schemaResult.status !== 0) {
      log(`template:smoke — não consegui consultar os schemas do Postgres efêmero (código ${schemaResult.status})`);
      return EXIT_CODES.CATALOG_UNREACHABLE;
    }
    const actualSchemas = parseSchemaList(schemaResult.stdout);
    if (!schemasMatchExpected(actualSchemas)) {
      log(
        `template:smoke — schemas após "db:migrate" divergem do esperado: encontrados [${actualSchemas.join(", ")}], obrigatórios [${EXPECTED_SCHEMAS.join(", ")}], extras permitidos [${ALLOWED_EXTRA_SCHEMAS.join(", ")}]`,
      );
      return EXIT_CODES.MIGRATION_FAILURE;
    }

    return null;
  } finally {
    run("docker", ["stop", containerId]);
  }
}

async function checkHealth({ childDir, run, spawnProcess, sleep, fetchImpl, log }) {
  const buildResult = run("pnpm", ["--filter", "api", "run", "build"], { cwd: childDir });
  if (buildResult.status !== 0) {
    log(`template:smoke — "pnpm --filter api run build" falhou no child (código ${buildResult.status})`);
    return EXIT_CODES.TEST_FAILURE;
  }

  const server = spawnProcess("pnpm", ["--filter", "api", "run", "start"], {
    cwd: childDir,
    env: { ...process.env, PORT: HEALTH_PORT },
  });

  try {
    const healthy = await waitForHealth({ url: `http://localhost:${HEALTH_PORT}/health`, fetchImpl, sleep });
    if (!healthy) {
      log("template:smoke — GET /health não respondeu 200 a tempo no child");
      return EXIT_CODES.TEST_FAILURE;
    }
    return null;
  } finally {
    server.kill();
  }
}

function checkRuleC({ childDir, run, log }) {
  const result = run("pnpm", ["--filter", "api", "exec", "jest", "src/modules/module-boundaries.spec.ts"], {
    cwd: childDir,
  });
  if (result.status !== 0) {
    log(`template:smoke — RULE C (module-boundaries.spec.ts) falhou no child (código ${result.status})`);
    return EXIT_CODES.TEST_FAILURE;
  }
  return null;
}

export async function runTemplateSmoke({
  repoRoot = process.cwd(),
  scratchDir,
  run = defaultRun,
  spawnProcess = defaultSpawnProcess,
  renderChildFn = renderChild,
  installChildFn = installChild,
  sleep = defaultSleep,
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
  keep = false,
  log = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  const childDir = scratchDir ?? defaultScratchDir();

  try {
    log(`template:smoke — renderizando child kernel-only em ${childDir}`);
    const renderResult = renderChildFn({ repoRoot, targetDir: childDir, run });
    if (renderResult.status !== 0) {
      log(`template:smoke — falha ao renderizar o child (copier saiu com código ${renderResult.status})`);
      return EXIT_CODES.CATALOG_UNREACHABLE;
    }

    log("template:smoke — instalando dependências do child (pnpm install)");
    const installResult = installChildFn({ cwd: childDir, run });
    if (installResult.status !== 0) {
      log(`template:smoke — falha ao instalar dependências do child (pnpm install saiu com código ${installResult.status})`);
      return EXIT_CODES.CATALOG_UNREACHABLE;
    }

    log("template:smoke — checagem 1/4: pnpm check && pnpm test");
    const checkResult = run("pnpm", ["check"], { cwd: childDir });
    if (checkResult.status !== 0) {
      log(`template:smoke — "pnpm check" falhou no child (código ${checkResult.status})`);
      return EXIT_CODES.TEST_FAILURE;
    }
    const testResult = run("pnpm", ["test"], { cwd: childDir });
    if (testResult.status !== 0) {
      log(`template:smoke — "pnpm test" falhou no child (código ${testResult.status})`);
      return EXIT_CODES.TEST_FAILURE;
    }

    log("template:smoke — checagem 2/4: db:migrate num Postgres efêmero, só _kernel + drizzle");
    const migrateExit = await checkMigrateAndSchema({ childDir, run, sleep, log });
    if (migrateExit !== null) return migrateExit;

    log("template:smoke — checagem 3/4: GET /health");
    const healthExit = await checkHealth({ childDir, run, spawnProcess, sleep, fetchImpl, log });
    if (healthExit !== null) return healthExit;

    log("template:smoke — checagem 4/4: RULE C (module-boundaries.spec.ts)");
    const ruleCExit = checkRuleC({ childDir, run, log });
    if (ruleCExit !== null) return ruleCExit;

    log("\nSmoke do template passou: as quatro checagens ficaram verdes.");
    return EXIT_CODES.OK;
  } finally {
    if (keep) {
      log(`--keep: diretório do child mantido em ${childDir}`);
    } else {
      rmSync(childDir, { recursive: true, force: true });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${helpText()}\n`);
    process.exit(EXIT_CODES.OK);
  }
  if (args.dryRun) {
    for (const [i, step] of planSteps().entries()) {
      process.stdout.write(`${i + 1}. ${step}\n`);
    }
    process.exit(EXIT_CODES.OK);
  }
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const exitCode = await runTemplateSmoke({ repoRoot, keep: args.keep });
  process.exit(exitCode ?? EXIT_CODES.OK);
}
