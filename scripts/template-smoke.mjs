#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const overlayRoot = join(repoRoot, "scripts", "smoke", "fake-product")
const keep = process.argv.includes("--keep")

const step = (label) => console.log(`\n== ${label} ==`)

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" })
  if (result.error) {
    console.error(`Falha ao executar ${cmd}: ${result.error.message}`)
    process.exit(1)
  }
  return result.status ?? 1
}

function copyDir(src, dest) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name)
    const to = join(dest, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true })
      copyDir(from, to)
    } else {
      mkdirSync(dirname(to), { recursive: true })
      copyFileSync(from, to)
    }
  }
}

function applySlotAppends(childRoot) {
  const ops = JSON.parse(
    readFileSync(join(overlayRoot, "slot-appends.json"), "utf8"),
  )
  for (const op of ops) {
    const target = join(childRoot, op.file)
    const content = readFileSync(target, "utf8")
    if (!content.includes(op.find)) {
      console.error(`slot-appends: marcador não encontrado em ${op.file}`)
      console.error(op.find)
      process.exit(1)
    }
    writeFileSync(target, content.replace(op.find, op.replace))
  }
}

function appendJournalEntry(childRoot) {
  const journalPath = join(
    childRoot,
    "apps",
    "api",
    "drizzle",
    "migrations",
    "meta",
    "_journal.json",
  )
  const journal = JSON.parse(readFileSync(journalPath, "utf8"))
  const last = journal.entries[journal.entries.length - 1]
  journal.entries.push({
    idx: last.idx + 1,
    version: last.version,
    when: last.when + 10_000_000,
    tag: "1000_sample_init",
    breakpoints: true,
  })
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`)
}

function applyOverlay(childRoot) {
  copyDir(join(overlayRoot, "files"), childRoot)
  applySlotAppends(childRoot)
  appendJournalEntry(childRoot)
}

function cleanup(dir) {
  if (keep) {
    console.log(`--keep: diretório mantido em ${dir}`)
    return
  }
  rmSync(dir, { recursive: true, force: true })
}

step("Verificando copier no PATH")
const copierCheck = spawnSync("copier", ["--version"], { stdio: "ignore" })
if (copierCheck.error) {
  console.error(
    "copier não encontrado no PATH. Instale com `pipx install copier` (ou `pip install copier`) e rode de novo.",
  )
  process.exit(2)
}

const tmpDir = mkdtempSync(join(tmpdir(), "platform-smoke-"))
console.log(`Diretório temporário do filho: ${tmpDir}`)

step("Gerando projeto filho via copier")
const copyStatus = run(
  "copier",
  [
    "copy",
    "--trust",
    "--defaults",
    // Sem isso o copier usa a última tag git do template (ex.: v0.1.0) em vez
    // do HEAD do worktree atual, e o filho fica sem o que ainda não foi taggeado.
    "--vcs-ref",
    "HEAD",
    "--data",
    "project_name=Demo",
    "--data",
    "github_org=acme",
    "--data",
    "root_domain=demo.test",
    repoRoot,
    tmpDir,
  ],
  repoRoot,
)
if (copyStatus !== 0) {
  cleanup(tmpDir)
  process.exit(copyStatus)
}

step("Aplicando overlay de produto fake (scripts/smoke/fake-product)")
applyOverlay(tmpDir)

step("Instalando dependências no filho")
const installStatus = run("pnpm", ["install"], tmpDir)
if (installStatus !== 0) {
  cleanup(tmpDir)
  process.exit(installStatus)
}

step("pnpm check && pnpm --filter api test")
const checkStatus = run("pnpm", ["check"], tmpDir)
if (checkStatus !== 0) {
  cleanup(tmpDir)
  process.exit(checkStatus)
}
const testStatus = run("pnpm", ["--filter", "api", "test"], tmpDir)
if (testStatus !== 0) {
  cleanup(tmpDir)
  process.exit(testStatus)
}

const apiPkg = JSON.parse(
  readFileSync(join(tmpDir, "apps", "api", "package.json"), "utf8"),
)
if (apiPkg.scripts?.["db:check:journal"]) {
  step("pnpm --filter api db:check:journal")
  const journalStatus = run(
    "pnpm",
    ["--filter", "api", "db:check:journal"],
    tmpDir,
  )
  if (journalStatus !== 0) {
    cleanup(tmpDir)
    process.exit(journalStatus)
  }
}

cleanup(tmpDir)
console.log("\nSmoke do template passou: todos os slots estendidos, gates verdes.")
