import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { childLayout } from "./child-layout.mjs"
import { EXIT_CODES } from "./exit-codes.mjs"

export class MigrationFailureError extends Error {
  constructor(step, output) {
    super(`falha ao gerar migrações (${step}): ${output}`)
    this.name = "MigrationFailureError"
    this.step = step
    this.output = output
    this.exitCode = EXIT_CODES.MIGRATION_FAILURE
  }
}

function defaultRun(command, args, options) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

function migrationsDir(child) {
  return childLayout(child).migrationsDir
}

function journalPath(child) {
  return path.join(migrationsDir(child), "meta/_journal.json")
}

function journalEntries(child) {
  const jPath = journalPath(child)
  if (!existsSync(jPath)) return []
  const journal = JSON.parse(readFileSync(jPath, "utf8"))
  return journal.entries ?? []
}

function slugFromCustomMigration(fileName) {
  return fileName.replace(/^\d+_/, "").replace(/\.sql$/, "")
}

// O rollback apaga o .sql de cada migração revertida; sem tirar a entrada
// correspondente do journal, `db:check:journal` acusa par quebrado (tag no
// journal sem .sql) e reinstalar o mesmo módulo falha com MIGRATION_FAILURE.
export function removeMigrations(child, fileNames) {
  const dir = migrationsDir(child)
  for (const fileName of fileNames) {
    const migrationFile = path.join(dir, fileName)
    if (existsSync(migrationFile)) rmSync(migrationFile)
  }

  const jPath = journalPath(child)
  if (!existsSync(jPath)) return
  const journal = JSON.parse(readFileSync(jPath, "utf8"))
  const removedTags = new Set(
    fileNames.map((fileName) => fileName.replace(/\.sql$/, ""))
  )
  const entries = (journal.entries ?? []).filter(
    (entry) => !removedTags.has(entry.tag)
  )
  writeFileSync(
    jPath,
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
    "utf8"
  )
}

function runStep(run, step, args, options) {
  const result = run("pnpm", args, options)
  if (result.status !== 0) {
    throw new MigrationFailureError(
      step,
      `${result.stdout ?? ""}${result.stderr ?? ""}`
    )
  }
}

export function generateForModule(
  child,
  manifest,
  { catalogEntryRoot, run = defaultRun } = {}
) {
  const options = { cwd: child }

  runStep(
    run,
    "check",
    ["--filter", "api", "exec", "drizzle-kit", "check"],
    options
  )

  // Os nomes NUNCA são calculados a partir de índices previstos: uma entrada sem diff
  // de schema não gera baseline nem consome índice, e qualquer conta a partir daí erra
  // o alvo de todos os customs seguintes (issue #11 — SQL de segurança gravado fora do
  // journal, stub vazio dentro). A fonte da verdade é o que o drizzle registrou no journal.
  const baselineName = `${manifest.name}_baseline`
  let seenEntries = journalEntries(child).length
  runStep(
    run,
    "generate:baseline",
    [
      "--filter",
      "api",
      "exec",
      "drizzle-kit",
      "generate",
      "--name",
      baselineName,
    ],
    options
  )
  const afterBaseline = journalEntries(child)
  const generated = afterBaseline
    .slice(seenEntries)
    .map((entry) => `${entry.tag}.sql`)
  seenEntries = afterBaseline.length

  const customMigrations = manifest.customMigrations ?? []
  for (const fileName of customMigrations) {
    const sourcePath = path.join(
      catalogEntryRoot,
      "migrations/custom",
      fileName
    )
    let shippedSql
    try {
      shippedSql = readFileSync(sourcePath, "utf8")
    } catch (err) {
      throw new MigrationFailureError(
        `custom:${fileName}`,
        `SQL custom não encontrado em ${sourcePath}: ${err.message}`
      )
    }

    const customName = `${manifest.name}_${slugFromCustomMigration(fileName)}`
    runStep(
      run,
      `generate:custom:${fileName}`,
      [
        "--filter",
        "api",
        "exec",
        "drizzle-kit",
        "generate",
        "--custom",
        "--name",
        customName,
      ],
      options
    )

    const created = journalEntries(child).slice(seenEntries)
    if (created.length !== 1) {
      throw new MigrationFailureError(
        `custom:${fileName}`,
        `drizzle-kit generate --custom deveria registrar exatamente 1 entrada no journal, registrou ${created.length}`
      )
    }
    seenEntries += 1

    const destPath = path.join(migrationsDir(child), `${created[0].tag}.sql`)
    mkdirSync(path.dirname(destPath), { recursive: true })
    writeFileSync(destPath, shippedSql, "utf8")
    generated.push(`${created[0].tag}.sql`)
  }

  runStep(
    run,
    "journal",
    ["--filter", "api", "run", "db:check:journal"],
    options
  )

  return generated
}
