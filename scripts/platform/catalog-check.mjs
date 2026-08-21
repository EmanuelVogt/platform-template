import path from "node:path";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { run as runCliCommand } from "./cli.mjs";
import { EXIT_CODES } from "./lib/exit-codes.mjs";
import { CyclicDependencyError } from "./lib/plan.mjs";
import { CatalogRootMissingError, UnknownEntryError, resolveInstallOrder } from "./lib/catalog-graph.mjs";
import { installChild, renderChild } from "./lib/render-child.mjs";
import { readLatestChangelogVersion, writeSimulatedKernelVersion } from "./lib/kernel-version.mjs";

const DEFAULT_STEP_TIMEOUT_MS = 10 * 60 * 1000; // render/install/gate final
const DEFAULT_CONTRACT_TIMEOUT_MS = 3 * 60 * 1000; // pnpm contract dentro de module add

function defaultRun(command, args = [], options = {}) {
  const { timeoutMs, ...rest } = options;
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "inherit",
    detached: true,
    ...rest,
    ...(timeoutMs ? { timeout: timeoutMs, killSignal: "SIGKILL" } : {}),
  });
  const timedOut = result.error?.code === "ETIMEDOUT";
  if (timedOut && result.pid) {
    // spawnSync mata só o processo direto; com detached:true ele lidera o
    // próprio grupo, então derrubamos o grupo inteiro pra não deixar netos
    // (ex.: ts-node) órfãos rodando depois do timeout.
    try {
      process.kill(-result.pid, "SIGKILL");
    } catch {
      // grupo já encerrado
    }
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "", timedOut };
}

function defaultScratchDir() {
  return mkdtempSync(path.join(tmpdir(), "catalog-check-"));
}

// Encapsula o passo de timeout mais recente que estourou, pra que o loop de
// "module add" (que só recebe um exitCode numérico de volta) consiga nomear
// qual sub-passo (ex.: "contract") foi quem travou.
function createTimeoutTracker() {
  let last = null;
  return {
    wrap(run, { defaultMs, contractMs }) {
      return (command, args = [], options = {}) => {
        const isContract = command === "pnpm" && args[0] === "contract";
        const timeoutMs = options.timeoutMs ?? (isContract ? contractMs : defaultMs);
        const result = run(command, args, { ...options, timeoutMs });
        if (result.timedOut) {
          last = { stepLabel: isContract ? "contract" : [command, ...args].join(" "), timeoutMs };
        }
        return result;
      };
    },
    reset() {
      last = null;
    },
    get() {
      return last;
    },
  };
}

function timeoutFailure(log, stepLabel, timeoutMs) {
  log(`catalog:check — passo "${stepLabel}" excedeu o tempo limite (${timeoutMs}ms); processo encerrado`);
  return EXIT_CODES.TEST_FAILURE;
}

let activeCleanup = null;

process.on("SIGINT", () => {
  if (activeCleanup) activeCleanup();
  process.exit(130);
});

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
// Nunca sobrescrevem um valor já presente no ambiente do processo. R2_* cobre
// a validação Zod síncrona do storage (storage.config.ts), que é fail-fast
// mas não abre conexão — sem esses defaults o passo falha (não trava) por
// falta de env, mesmo com Redis/Postgres resolvidos.
const CONTRACT_ENV_DEFAULTS = {
  DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  REDIS_URL: "redis://localhost:6379",
  WEB_ORIGIN: "http://localhost:3000",
  R2_ACCOUNT_ID: "placeholder",
  R2_ACCESS_KEY_ID: "placeholder",
  R2_SECRET_ACCESS_KEY: "placeholder",
  R2_BUCKET: "placeholder",
  R2_ENDPOINT: "https://placeholder.r2.example.com",
};

function withContractEnv(run) {
  return (command, args = [], options = {}) => {
    if (command !== "pnpm" || args[0] !== "contract") return run(command, args, options);
    const defaults = Object.fromEntries(
      Object.entries(CONTRACT_ENV_DEFAULTS).map(([key, value]) => [key, process.env[key] ?? value]),
    );
    const env = { ...process.env, ...defaults, ...options.env };
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
  keep = false,
  stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS,
  contractTimeoutMs = DEFAULT_CONTRACT_TIMEOUT_MS,
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

  const ownsChildDir = scratchDir === undefined;
  const childDir = scratchDir ?? defaultScratchDir();
  const cleanupChildDir = () => {
    if (ownsChildDir && !keep) rmSync(childDir, { recursive: true, force: true });
  };
  activeCleanup = cleanupChildDir;

  try {
    const timeoutTracker = createTimeoutTracker();
    const timedRun = timeoutTracker.wrap(run, { defaultMs: stepTimeoutMs, contractMs: contractTimeoutMs });

    log(`catalog:check — renderizando child kernel-only em ${childDir}`);
    const renderResult = renderChild({ repoRoot, targetDir: childDir, run: timedRun });
    if (renderResult.timedOut) return timeoutFailure(log, "render (copier)", stepTimeoutMs);
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
    const installResult = installChild({ cwd: childDir, run: timedRun });
    if (installResult.timedOut) return timeoutFailure(log, "pnpm install", stepTimeoutMs);
    if (installResult.status !== 0) {
      log(`catalog:check — falha ao instalar dependências do child (pnpm install saiu com código ${installResult.status})`);
      return EXIT_CODES.CATALOG_UNREACHABLE;
    }

    for (const entry of order) {
      const label = entryLabel(entry);
      log(`catalog:check — module add ${label}`);
      // --catalog-ref explícito: o copier normaliza o _src_path do child para o
      // remote origin (gh:...), e este gate roda ANTES da tag simulada existir lá —
      // a resolução tem de ficar no checkout local.
      const args = ["module", "add", entry.name, "--catalog-ref", catalogRoot];
      if (entry.manifest.variant) args.push("--variant", entry.manifest.variant);
      timeoutTracker.reset();
      const exitCode = await runCli(args, { cwd: childDir, run: withContractEnv(timedRun) });
      if (exitCode !== EXIT_CODES.OK) {
        const timedOutStep = timeoutTracker.get();
        if (timedOutStep) {
          log(
            `catalog:check — passo "${timedOutStep.stepLabel}" (dentro de "module add ${label}") excedeu o tempo limite (${timedOutStep.timeoutMs}ms); processo encerrado`,
          );
          return EXIT_CODES.TEST_FAILURE;
        }
        log(
          `catalog:check — falha ao instalar a entrada "${label}" (module add saiu com código ${exitCode}); ver a saída acima para o spec/asserção que falhou`,
        );
        return exitCode;
      }
    }

    log("catalog:check — gate final: pnpm check && pnpm test");
    const checkResult = timedRun("pnpm", ["check"], { cwd: childDir });
    if (checkResult.timedOut) return timeoutFailure(log, "pnpm check", stepTimeoutMs);
    if (checkResult.status !== 0) {
      log(`catalog:check — "pnpm check" falhou no child (código ${checkResult.status})`);
      return EXIT_CODES.TEST_FAILURE;
    }
    const testResult = timedRun("pnpm", ["test"], { cwd: childDir });
    if (testResult.timedOut) return timeoutFailure(log, "pnpm test", stepTimeoutMs);
    if (testResult.status !== 0) {
      log(`catalog:check — "pnpm test" falhou no child (código ${testResult.status})`);
      return EXIT_CODES.TEST_FAILURE;
    }

    log(`catalog:check — OK: ${order.map(entryLabel).join(", ")}`);
    return EXIT_CODES.OK;
  } finally {
    cleanupChildDir();
    activeCleanup = null;
  }
}

export function parseKeep(argv) {
  return argv.includes("--keep");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const kernelVersion = parseKernelVersion(argv);
  const keep = parseKeep(argv);
  const entries = parseEntries(stripKernelVersionFlag(argv));
  const exitCode = await runCatalogCheck({ entries, kernelVersion, keep });
  process.exit(exitCode ?? EXIT_CODES.OK);
}
