import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { EXIT_CODES } from "../exit-codes.mjs"
import {
  compareSemver,
  parseInstalledVersion,
  parseSemverTag,
  readTemplateOrigin,
} from "../template-version.mjs"

const SCRIPT_RE = /^(v\d+\.\d+\.\d+)\.mjs$/

const defaultLog = (msg) => process.stdout.write(`${msg}\n`)

// Descobre os scripts de migração presentes em `scripts/platform/migrations/`,
// em ordem ascendente de versão. Diretório ausente ou vazio -> nenhum script.
export function discoverMigrationScripts(migrationsDir) {
  if (!existsSync(migrationsDir)) return []
  return readdirSync(migrationsDir)
    .map((file) => SCRIPT_RE.exec(file)?.[1])
    .filter((version) => Boolean(version))
    .sort(compareSemver)
    .map((version) => ({ version, file: `${version}.mjs` }))
}

function resolveTarget({ options, cwd }) {
  if (options.target !== undefined) {
    if (typeof options.target !== "string" || !parseSemverTag(options.target)) {
      return { error: `--target inválido (use vX.Y.Z): ${options.target}` }
    }
    return { target: options.target }
  }
  const origin = readTemplateOrigin(path.join(cwd, ".copier-answers.yml"))
  const installed = origin && parseInstalledVersion(origin.commit)
  if (!installed) {
    return {
      error:
        "não foi possível determinar a versão-alvo — passe --target vX.Y.Z",
    }
  }
  return { target: installed.version }
}

// `platform template migrate [--target vX.Y.Z]` — roda cada
// `scripts/platform/migrations/v*.mjs` (cada um exporta `run({cwd, log})` e é
// responsável pela própria idempotência) em ordem ascendente até o alvo
// (padrão: a versão instalada em `.copier-answers.yml`). Para no primeiro
// script que falhar, nomeando-o; os scripts seguintes não rodam.
export async function templateMigrateCommand({
  options = {},
  cwd = process.cwd(),
  log = defaultLog,
} = {}) {
  const migrationsDir = path.join(cwd, "scripts", "platform", "migrations")
  const scripts = discoverMigrationScripts(migrationsDir)
  if (scripts.length === 0) {
    log("nenhuma migração encontrada — nada a fazer")
    return EXIT_CODES.OK
  }

  const { target, error } = resolveTarget({ options, cwd })
  if (error) {
    process.stderr.write(`${error}\n`)
    return EXIT_CODES.USAGE_ERROR
  }

  const due = scripts.filter(
    (script) => compareSemver(script.version, target) <= 0
  )
  for (const script of due) {
    const scriptPath = path.join(migrationsDir, script.file)
    try {
      const mod = await import(pathToFileURL(scriptPath).href)
      await mod.run({ cwd, log })
    } catch (err) {
      process.stderr.write(
        `migração ${script.version} falhou: ${err.message}\n`
      )
      return EXIT_CODES.MIGRATION_FAILURE
    }
    log(`migração ${script.version} aplicada`)
  }

  return EXIT_CODES.OK
}
