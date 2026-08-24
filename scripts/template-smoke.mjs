#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { EXIT_CODES } from "./platform/lib/exit-codes.mjs"
import { isMain } from "./platform/lib/is-main.mjs"
import {
  CHILD_ENV_DEFAULTS,
  childCleanup,
  createScratchDir,
  installChild,
  onInterrupt,
  renderChild,
  runGates,
} from "./platform/lib/child.mjs"
import {
  assertWebShell,
  InvalidWebStackError,
  parseWebStack,
} from "./platform/lib/web-shell.mjs"

const EXPECTED_SCHEMAS = ["_kernel", "drizzle"]
const ALLOWED_EXTRA_SCHEMAS = ["public"]
const HEALTH_PORT = "3222"

let activeCleanup = null

onInterrupt(() => activeCleanup)

export function parseArgs(argv) {
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    dryRun: argv.includes("--dry-run") || argv.includes("--plan"),
    keep: argv.includes("--keep"),
    webStack: parseWebStack(argv),
  }
}

export function helpText() {
  return [
    "Uso: pnpm template:smoke [opções]",
    "",
    "Renderiza um child kernel-only via copier e roda as quatro checagens de fumaça:",
    ...planSteps().map((step, i) => `  ${i + 1}. ${step}`),
    "",
    "Opções:",
    "  --dry-run, --plan       mostra os passos sem executar nada",
    "  --keep                  mantém o diretório do child ao final (debug)",
    "  --web-stack vite|next   escolhe o stack do child renderizado (padrão: vite)",
    "  --help, -h              mostra esta ajuda",
  ].join("\n")
}

export function planSteps() {
  return [
    "pnpm check && pnpm test no child",
    "db:migrate num Postgres efêmero — só _kernel, drizzle e o public do Postgres podem existir",
    "GET /health no child retorna 200",
    "RULE C (module-boundaries.spec.ts) passa no child",
  ]
}

// pnpm platform status/list rodam de verdade dentro do próprio child renderizado (CLI-03):
// se algum caminho excluído por copier.yml voltar a ser importado (CLI-01/CLI-02), a CLI
// quebra em tempo de import aqui, não só no teste unitário do guard.
function checkPlatformCli({ childDir, run, log }) {
  const statusResult = run("pnpm", ["platform", "status"], { cwd: childDir })
  if (statusResult.status !== 0) {
    log(
      `template:smoke — "pnpm platform status" falhou no child (código ${statusResult.status})`
    )
    return EXIT_CODES.TEST_FAILURE
  }
  const listResult = run("pnpm", ["platform", "list"], { cwd: childDir })
  if (listResult.status !== 0) {
    log(
      `template:smoke — "pnpm platform list" falhou no child (código ${listResult.status})`
    )
    return EXIT_CODES.TEST_FAILURE
  }
  return null
}

function collectPathLikeStrings(value, acc = []) {
  if (typeof value === "string") {
    if (value.includes("/")) acc.push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) collectPathLikeStrings(item, acc)
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectPathLikeStrings(item, acc)
  }
  return acc
}

// Metade offline do guard de scripts/platform/__tests__/prettier-config.test.mjs: aquele
// teste garante que o caminho existe no template; este garante que ainda existe no child
// renderizado, onde a árvore é mais rasa (catalog/ e outros diretórios do template-only
// não são copiados) — um plugin ou caminho que só resolve no template chegaria quebrado.
function checkPrettierConfigPaths({ childDir, log }) {
  const configPath = path.join(childDir, ".prettierrc")
  if (!existsSync(configPath)) return null
  const config = JSON.parse(readFileSync(configPath, "utf8"))
  for (const value of collectPathLikeStrings(config)) {
    if (!existsSync(path.join(childDir, value))) {
      log(
        `template:smoke — .prettierrc do child nomeia um caminho que não existe: ${value}`
      )
      return EXIT_CODES.TEST_FAILURE
    }
  }
  return null
}

function checkFormatCheck({ childDir, run, log }) {
  const result = run("pnpm", ["format:check"], { cwd: childDir })
  if (result.status !== 0) {
    log(
      `template:smoke — "pnpm format:check" falhou no child (código ${result.status})`
    )
    return EXIT_CODES.TEST_FAILURE
  }
  return null
}

export function parseSchemaList(stdout) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export function schemasMatchExpected(
  actualSchemas,
  expected = EXPECTED_SCHEMAS,
  allowedExtra = ALLOWED_EXTRA_SCHEMAS
) {
  const actual = new Set(actualSchemas)
  const wanted = new Set(expected)
  const allowed = new Set([...wanted, ...allowedExtra])
  for (const name of wanted) {
    if (!actual.has(name)) return false
  }
  for (const name of actual) {
    if (!allowed.has(name)) return false
  }
  return true
}

function defaultSleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

export async function waitForPostgresReady({
  containerId,
  run,
  attempts = 30,
  delayMs = 500,
  sleep = defaultSleep,
}) {
  for (let i = 0; i < attempts; i += 1) {
    const probe = run("docker", [
      "exec",
      containerId,
      "pg_isready",
      "-U",
      "postgres",
    ])
    if (probe.status === 0) return true
    await sleep(delayMs)
  }
  return false
}

export async function waitForRedisReady({
  containerId,
  run,
  attempts = 30,
  delayMs = 500,
  sleep = defaultSleep,
}) {
  for (let i = 0; i < attempts; i += 1) {
    const probe = run("docker", ["exec", containerId, "redis-cli", "ping"])
    if (probe.status === 0 && probe.stdout.trim() === "PONG") return true
    await sleep(delayMs)
  }
  return false
}

export async function waitForHealth({
  url,
  fetchImpl = fetch,
  attempts = 30,
  delayMs = 500,
  sleep = defaultSleep,
}) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetchImpl(url)
      if (res.status === 200) return true
    } catch {
      // servidor ainda não está de pé — tenta de novo
    }
    await sleep(delayMs)
  }
  return false
}

function defaultRun(command, args, options) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

function defaultSpawnProcess(command, args, options) {
  return spawn(command, args, {
    stdio: ["ignore", "ignore", "pipe"],
    ...options,
  })
}

function startContainer({ run, image, args = [] }) {
  const result = run("docker", ["run", "--rm", "-d", ...args, "-P", image])
  return {
    containerId: result.status === 0 ? result.stdout.trim() : null,
    status: result.status,
  }
}

function getMappedPort({ run, containerId, containerPort }) {
  const portResult = run("docker", [
    "port",
    containerId,
    `${containerPort}/tcp`,
  ])
  return portResult.stdout.trim().split("\n")[0]?.split(":").pop() || null
}

async function startPostgres({ run, sleep, log }) {
  const { containerId, status } = startContainer({
    run,
    image: "postgres:16-alpine",
    args: ["-e", "POSTGRES_PASSWORD=postgres", "-e", "POSTGRES_DB=smoke"],
  })
  if (status !== 0) {
    log(
      `template:smoke — não consegui subir um Postgres efêmero via docker (código ${status}); verifique se o daemon está rodando`
    )
    return null
  }
  const ready = await waitForPostgresReady({ containerId, run, sleep })
  if (!ready) {
    log(
      "template:smoke — Postgres efêmero não ficou pronto a tempo (pg_isready nunca retornou 0)"
    )
    run("docker", ["stop", containerId])
    return null
  }
  const mappedPort = getMappedPort({ run, containerId, containerPort: 5432 })
  if (!mappedPort) {
    log(
      "template:smoke — não consegui descobrir a porta publicada do Postgres efêmero"
    )
    run("docker", ["stop", containerId])
    return null
  }
  return {
    containerId,
    url: `postgres://postgres:postgres@localhost:${mappedPort}/smoke`,
  }
}

async function startRedis({ run, sleep, log }) {
  const { containerId, status } = startContainer({
    run,
    image: "redis:7-alpine",
  })
  if (status !== 0) {
    log(
      `template:smoke — não consegui subir um Redis efêmero via docker (código ${status}); verifique se o daemon está rodando`
    )
    return null
  }
  const ready = await waitForRedisReady({ containerId, run, sleep })
  if (!ready) {
    log(
      "template:smoke — Redis efêmero não ficou pronto a tempo (redis-cli ping nunca retornou PONG)"
    )
    run("docker", ["stop", containerId])
    return null
  }
  const mappedPort = getMappedPort({ run, containerId, containerPort: 6379 })
  if (!mappedPort) {
    log(
      "template:smoke — não consegui descobrir a porta publicada do Redis efêmero"
    )
    run("docker", ["stop", containerId])
    return null
  }
  return { containerId, url: `redis://localhost:${mappedPort}` }
}

function checkMigrateAndSchema({
  childDir,
  run,
  containerId,
  databaseUrl,
  log,
}) {
  const migrateResult = run("pnpm", ["--filter", "api", "run", "db:migrate"], {
    cwd: childDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })
  if (migrateResult.status !== 0) {
    log(
      `template:smoke — "pnpm --filter api run db:migrate" falhou no child (código ${migrateResult.status})`
    )
    return EXIT_CODES.MIGRATION_FAILURE
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
  ])
  if (schemaResult.status !== 0) {
    log(
      `template:smoke — não consegui consultar os schemas do Postgres efêmero (código ${schemaResult.status})`
    )
    return EXIT_CODES.CATALOG_UNREACHABLE
  }
  const actualSchemas = parseSchemaList(schemaResult.stdout)
  if (!schemasMatchExpected(actualSchemas)) {
    log(
      `template:smoke — schemas após "db:migrate" divergem do esperado: encontrados [${actualSchemas.join(", ")}], obrigatórios [${EXPECTED_SCHEMAS.join(", ")}], extras permitidos [${ALLOWED_EXTRA_SCHEMAS.join(", ")}]`
    )
    return EXIT_CODES.MIGRATION_FAILURE
  }

  return null
}

async function checkHealth({
  childDir,
  run,
  spawnProcess,
  sleep,
  fetchImpl,
  log,
  databaseUrl,
  redisUrl,
}) {
  const buildResult = run("pnpm", ["--filter", "api", "run", "build"], {
    cwd: childDir,
  })
  if (buildResult.status !== 0) {
    log(
      `template:smoke — "pnpm --filter api run build" falhou no child (código ${buildResult.status})`
    )
    return EXIT_CODES.TEST_FAILURE
  }

  const server = spawnProcess("pnpm", ["--filter", "api", "run", "start"], {
    cwd: childDir,
    env: {
      ...process.env,
      ...CHILD_ENV_DEFAULTS,
      PORT: HEALTH_PORT,
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
    },
  })

  let stderrOutput = ""
  server.stderr?.on("data", (chunk) => {
    stderrOutput += chunk.toString()
  })

  try {
    const healthy = await waitForHealth({
      url: `http://localhost:${HEALTH_PORT}/health`,
      fetchImpl,
      sleep,
    })
    if (!healthy) {
      const firstLines = stderrOutput.trim().split("\n").slice(0, 10).join("\n")
      const detail = firstLines ? ` — stderr do child:\n${firstLines}` : ""
      log(
        `template:smoke — GET /health não respondeu 200 a tempo no child${detail}`
      )
      return EXIT_CODES.TEST_FAILURE
    }
    return null
  } finally {
    server.kill()
  }
}

function checkRuleC({ childDir, run, log }) {
  const result = run(
    "pnpm",
    [
      "vitest",
      "run",
      "--project",
      "api",
      "apps/api/src/modules/module-boundaries.spec.ts",
    ],
    {
      cwd: childDir,
    }
  )
  if (result.status !== 0) {
    log(
      `template:smoke — RULE C (module-boundaries.spec.ts) falhou no child (código ${result.status})`
    )
    return EXIT_CODES.TEST_FAILURE
  }
  return null
}

export async function runTemplateSmoke({
  repoRoot = process.cwd(),
  scratchDir,
  run = defaultRun,
  spawnProcess = defaultSpawnProcess,
  renderChildFn = renderChild,
  installChildFn = installChild,
  assertWebShellFn = assertWebShell,
  webStack = "vite",
  sleep = defaultSleep,
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
  keep = false,
  log = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  const ownsChildDir = scratchDir === undefined
  const childDir = scratchDir ?? createScratchDir("template-smoke-")
  const cleanupChildDir = childCleanup({
    childDir,
    owns: ownsChildDir,
    keep,
    log,
  })
  activeCleanup = cleanupChildDir
  let postgres = null
  let redis = null

  try {
    log(`template:smoke — renderizando child kernel-only em ${childDir}`)
    const renderResult = renderChildFn({
      repoRoot,
      targetDir: childDir,
      run,
      webStack,
    })
    if (renderResult.status !== 0) {
      log(
        `template:smoke — falha ao renderizar o child (copier saiu com código ${renderResult.status})`
      )
      return EXIT_CODES.CATALOG_UNREACHABLE
    }

    log("template:smoke — instalando dependências do child (pnpm install)")
    const installResult = installChildFn({ cwd: childDir, run })
    if (installResult.status !== 0) {
      log(
        `template:smoke — falha ao instalar dependências do child (pnpm install saiu com código ${installResult.status})`
      )
      return EXIT_CODES.CATALOG_UNREACHABLE
    }

    log(
      `template:smoke — verificando o shape do web shell (--web-stack ${webStack})`
    )
    try {
      assertWebShellFn(childDir, webStack)
    } catch (err) {
      log(`template:smoke — ${err.message}`)
      return EXIT_CODES.TEST_FAILURE
    }

    log(
      "template:smoke — checagem extra: caminhos do .prettierrc do child existem"
    )
    const prettierConfigExit = checkPrettierConfigPaths({ childDir, log })
    if (prettierConfigExit !== null) return prettierConfigExit

    log("template:smoke — checagem extra: pnpm format:check no child")
    const formatCheckExit = checkFormatCheck({ childDir, run, log })
    if (formatCheckExit !== null) return formatCheckExit

    log("template:smoke — checagem 1/4: pnpm check && pnpm test")
    const gate = runGates(run, { cwd: childDir })
    if (!gate.ok) {
      log(
        `template:smoke — "${gate.step}" falhou no child (código ${gate.result.status})`
      )
      return EXIT_CODES.TEST_FAILURE
    }

    log("template:smoke — subindo Postgres efêmero")
    postgres = await startPostgres({ run, sleep, log })
    if (!postgres) return EXIT_CODES.CATALOG_UNREACHABLE

    log(
      "template:smoke — checagem 2/4: db:migrate num Postgres efêmero, só _kernel + drizzle"
    )
    const migrateExit = checkMigrateAndSchema({
      childDir,
      run,
      containerId: postgres.containerId,
      databaseUrl: postgres.url,
      log,
    })
    if (migrateExit !== null) return migrateExit

    log("template:smoke — subindo Redis efêmero")
    redis = await startRedis({ run, sleep, log })
    if (!redis) return EXIT_CODES.CATALOG_UNREACHABLE

    log("template:smoke — checagem 3/4: GET /health")
    const healthExit = await checkHealth({
      childDir,
      run,
      spawnProcess,
      sleep,
      fetchImpl,
      log,
      databaseUrl: postgres.url,
      redisUrl: redis.url,
    })
    if (healthExit !== null) return healthExit

    log("template:smoke — checagem 4/4: RULE C (module-boundaries.spec.ts)")
    const ruleCExit = checkRuleC({ childDir, run, log })
    if (ruleCExit !== null) return ruleCExit

    log(
      "template:smoke — checagem extra: pnpm platform status/list dentro do child renderizado"
    )
    const cliExit = checkPlatformCli({ childDir, run, log })
    if (cliExit !== null) return cliExit

    log(
      "\nSmoke do template passou: as quatro checagens ficaram verdes, e a CLI roda dentro do child."
    )
    return EXIT_CODES.OK
  } finally {
    if (postgres) run("docker", ["stop", postgres.containerId])
    if (redis) run("docker", ["stop", redis.containerId])
    cleanupChildDir()
    activeCleanup = null
  }
}

if (isMain(import.meta.url, process.argv[1])) {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    if (err instanceof InvalidWebStackError) {
      process.stderr.write(`template:smoke — ${err.message}\n`)
      process.exit(EXIT_CODES.USAGE_ERROR)
    }
    throw err
  }
  if (args.help) {
    process.stdout.write(`${helpText()}\n`)
    process.exit(EXIT_CODES.OK)
  }
  if (args.dryRun) {
    for (const [i, step] of planSteps().entries()) {
      process.stdout.write(`${i + 1}. ${step}\n`)
    }
    process.exit(EXIT_CODES.OK)
  }
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  )
  const exitCode = await runTemplateSmoke({
    repoRoot,
    keep: args.keep,
    webStack: args.webStack,
  })
  process.exit(exitCode ?? EXIT_CODES.OK)
}
