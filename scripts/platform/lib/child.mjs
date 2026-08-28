import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const DEFAULT_ANSWERS = {
  project_name: "Demo",
  github_org: "acme",
  root_domain: "demo.test",
}

// Variáveis que o boot do child exige (validação Zod síncrona, fail-fast) mas
// que nenhum gate usa de verdade: sem elas o passo falha por falta de env, não
// por travar. Nunca sobrescrevem um valor já presente no ambiente do processo.
export const CHILD_ENV_DEFAULTS = {
  NODE_ENV: "test",
  DATABASE_SSL: "disable",
  TRUST_PROXY_HOPS: "0",
  BREACH_CHECK_ENABLED: "false",
  WEB_ORIGIN: "http://localhost:3000",
  STORAGE_ACCESS_KEY_ID: "placeholder",
  STORAGE_SECRET_ACCESS_KEY: "placeholder",
  STORAGE_BUCKET: "placeholder",
  STORAGE_ENDPOINT: "https://placeholder.r2.example.com",
  STORAGE_REGION: "placeholder",
}

// O passo "contract" só monta o grafo Nest e nunca abre conexão, então
// Postgres/Redis também entram como placeholder inerte.
export const CONTRACT_ENV_DEFAULTS = {
  ...CHILD_ENV_DEFAULTS,
  DATABASE_URL:
    "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  REDIS_URL: "redis://localhost:6379",
}

export function renderChild({
  repoRoot,
  targetDir,
  answers = DEFAULT_ANSWERS,
  webStack = "vite",
  run,
}) {
  const dataArgs = Object.entries({ ...answers, web_stack: webStack }).flatMap(
    ([key, value]) => ["--data", `${key}=${value}`]
  )
  return run("copier", [
    "copy",
    "--trust",
    "--defaults",
    "--vcs-ref",
    "HEAD",
    ...dataArgs,
    repoRoot,
    targetDir,
  ])
}

export function installChild({ cwd, run }) {
  return run("pnpm", ["install"], { cwd })
}

export function createScratchDir(prefix) {
  return mkdtempSync(path.join(tmpdir(), prefix))
}

export function childCleanup({ childDir, owns = true, keep = false, log }) {
  return () => {
    if (!owns) return
    if (keep) {
      log?.(`--keep: diretório do child mantido em ${childDir}`)
      return
    }
    rmSync(childDir, { recursive: true, force: true })
  }
}

export function onInterrupt(getCleanup) {
  process.on("SIGINT", () => {
    getCleanup()?.()
    process.exit(130)
  })
}

export function withEnvDefaults(run, defaults, { only } = {}) {
  return (command, args = [], options = {}) => {
    if (only && !only(command, args)) return run(command, args, options)
    const applied = Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [
        key,
        process.env[key] ?? value,
      ])
    )
    return run(command, args, {
      ...options,
      env: { ...process.env, ...applied, ...options.env },
    })
  }
}

export function runGates(run, { cwd }) {
  for (const step of ["check", "test", "test:db"]) {
    const result = run("pnpm", [step], { cwd })
    if (result.timedOut || result.status !== 0)
      return { ok: false, step: `pnpm ${step}`, result }
  }
  return { ok: true }
}
