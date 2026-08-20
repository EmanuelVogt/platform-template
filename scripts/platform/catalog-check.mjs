import path from "node:path";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { run as runCliCommand } from "./cli.mjs";
import { EXIT_CODES } from "./lib/exit-codes.mjs";
import { CyclicDependencyError } from "./lib/plan.mjs";
import { CatalogRootMissingError, UnknownEntryError, resolveInstallOrder } from "./lib/catalog-graph.mjs";
import { installChild, renderChild } from "./lib/render-child.mjs";
import { readLatestChangelogVersion, writeSimulatedKernelVersion } from "./lib/kernel-version.mjs";

function defaultRun(command, args = [], options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "inherit", ...options });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function defaultScratchDir() {
  return mkdtempSync(path.join(tmpdir(), "catalog-check-"));
}

export function parseEntries(argv) {
  return argv.filter((arg) => !arg.startsWith("-"));
}

export function parseKernelVersion(argv) {
  const index = argv.indexOf("--kernel-version");
  return index === -1 ? undefined : argv[index + 1];
}

function stripKernelVersionFlag(argv) {
  const index = argv.indexOf("--kernel-version");
  return index === -1 ? argv : [...argv.slice(0, index), ...argv.slice(index + 2)];
}

function entryLabel(entry) {
  return entry.manifest.variant ? `${entry.name}/${entry.manifest.variant}` : entry.name;
}

// Placeholders inertes para o passo "contract" (só monta o grafo Nest, nunca
// abre conexão) — o child renderizado não carrega o .env real do produto.
// Nunca sobrescrevem um valor já presente no ambiente do processo.
const CONTRACT_ENV_DEFAULTS = {
  DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  REDIS_URL: "redis://localhost:6379",
  WEB_ORIGIN: "http://localhost:3000",
};

function withContractEnv(run) {
  return (command, args = [], options = {}) => {
    if (command !== "pnpm" || args[0] !== "contract") return run(command, args, options);
    const env = {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? CONTRACT_ENV_DEFAULTS.DATABASE_URL,
      REDIS_URL: process.env.REDIS_URL ?? CONTRACT_ENV_DEFAULTS.REDIS_URL,
      WEB_ORIGIN: process.env.WEB_ORIGIN ?? CONTRACT_ENV_DEFAULTS.WEB_ORIGIN,
      ...options.env,
    };
    return run(command, args, { ...options, env });
  };
}

export async function runCatalogCheck({
  entries = [],
  repoRoot = process.cwd(),
  catalogRoot = path.join(repoRoot, "catalog"),
  scratchDir,
  kernelVersion,
  run = defaultRun,
  runCli = runCliCommand,
  log = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  let order;
  try {
    order = resolveInstallOrder({ catalogRoot, requested: entries });
  } catch (err) {
    if (err instanceof UnknownEntryError) {
      log(
        `catalog:check — entrada de catálogo desconhecida: "${err.entry}". Rode "pnpm catalog:lint" ou veja catalog/README.md para a lista de entradas válidas.`,
      );
      return EXIT_CODES.USAGE_ERROR;
    }
    if (err instanceof CyclicDependencyError) {
      log(`catalog:check — ciclo de dependências detectado: ${err.chain.join(" -> ")}`);
      return EXIT_CODES.MISSING_DEPS;
    }
    if (err instanceof CatalogRootMissingError) {
      log(`catalog:check — catalogRoot não encontrado: ${err.catalogRoot}`);
      return EXIT_CODES.CATALOG_UNREACHABLE;
    }
    throw err;
  }

  const childDir = scratchDir ?? defaultScratchDir();

  log(`catalog:check — renderizando child kernel-only em ${childDir}`);
  const renderResult = renderChild({ repoRoot, targetDir: childDir, run });
  if (renderResult.status !== 0) {
    log(`catalog:check — falha ao renderizar o child (copier saiu com código ${renderResult.status})`);
    return EXIT_CODES.CATALOG_UNREACHABLE;
  }

  const answersPath = path.join(childDir, ".copier-answers.yml");
  if (existsSync(answersPath)) {
    let simulatedVersion;
    try {
      simulatedVersion =
        kernelVersion ?? readLatestChangelogVersion(path.join(repoRoot, "docs/dev/template-changelog.md"));
    } catch (err) {
      log(`catalog:check — não foi possível determinar a versão do kernel a simular: ${err.message}`);
      return EXIT_CODES.USAGE_ERROR;
    }
    log(
      `catalog:check — simulando o kernel na versão ${simulatedVersion} (ainda não tagueada no repositório real; a simulação vale só para o child renderizado neste gate, que precede o tag)`,
    );
    writeSimulatedKernelVersion({ answersPath, kernelVersion: simulatedVersion });
  }

  log("catalog:check — instalando dependências do child (pnpm install)");
  const installResult = installChild({ cwd: childDir, run });
  if (installResult.status !== 0) {
    log(`catalog:check — falha ao instalar dependências do child (pnpm install saiu com código ${installResult.status})`);
    return EXIT_CODES.CATALOG_UNREACHABLE;
  }

  for (const entry of order) {
    const label = entryLabel(entry);
    log(`catalog:check — module add ${label}`);
    const args = ["module", "add", entry.name];
    if (entry.manifest.variant) args.push("--variant", entry.manifest.variant);
    const exitCode = await runCli(args, { cwd: childDir, run: withContractEnv(run) });
    if (exitCode !== EXIT_CODES.OK) {
      log(
        `catalog:check — falha ao instalar a entrada "${label}" (module add saiu com código ${exitCode}); ver a saída acima para o spec/asserção que falhou`,
      );
      return exitCode;
    }
  }

  log("catalog:check — gate final: pnpm check && pnpm test");
  const checkResult = run("pnpm", ["check"], { cwd: childDir });
  if (checkResult.status !== 0) {
    log(`catalog:check — "pnpm check" falhou no child (código ${checkResult.status})`);
    return EXIT_CODES.TEST_FAILURE;
  }
  const testResult = run("pnpm", ["test"], { cwd: childDir });
  if (testResult.status !== 0) {
    log(`catalog:check — "pnpm test" falhou no child (código ${testResult.status})`);
    return EXIT_CODES.TEST_FAILURE;
  }

  log(`catalog:check — OK: ${order.map(entryLabel).join(", ")}`);
  return EXIT_CODES.OK;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const kernelVersion = parseKernelVersion(argv);
  const entries = parseEntries(stripKernelVersionFlag(argv));
  const exitCode = await runCatalogCheck({ entries, kernelVersion });
  process.exit(exitCode ?? EXIT_CODES.OK);
}
