#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { writeFileSync, rmSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const contract = "openapi.json"

const args = process.argv.slice(2)
const full = args.includes("--all")
const base = args.find((arg) => !arg.startsWith("--")) ?? "HEAD"

const run = (command, commandArgs, options = {}) =>
  spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  })

if (run("oasdiff", ["--version"]).status !== 0) {
  console.error("oasdiff não encontrado. Instale com: brew install oasdiff")
  process.exit(1)
}

const baseContract = run("git", ["show", `${base}:${contract}`], {
  maxBuffer: 32 * 1024 * 1024,
})

if (baseContract.status !== 0) {
  console.error(`Não consegui ler ${contract} em "${base}".`)
  process.exit(1)
}

const basePath = join(tmpdir(), `openapi-${process.pid}.json`)
writeFileSync(basePath, baseContract.stdout)

try {
  const mode = full ? "changelog" : "breaking"
  const result = run("oasdiff", [
    mode,
    "--format",
    "markdown",
    "--lang",
    "pt-br",
    basePath,
    join(repoRoot, contract),
  ])

  process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  if (!full && result.stdout.includes("No changes detected")) {
    console.log(
      "Nenhuma ruptura. `--all` lista também as mudanças compatíveis."
    )
  }
} finally {
  rmSync(basePath, { force: true })
}
