import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { isAdvisoryFilename, parseAdvisory } from "./lib/advisories.mjs"
import { isMain } from "./lib/is-main.mjs"
import {
  ChangelogVersionMissingError,
  readLatestChangelogVersion,
} from "./lib/kernel-version.mjs"
import {
  discoverEntries,
  extractContractHeadings,
  lintAdvisoryFrontmatter,
  lintAdvisoryModule,
  lintAdvisoryPathScope,
  lintChangelogVersion,
  lintEntryBump,
  lintKernelRange,
  lintManifest,
  lintProductionTestingImports,
  lintReadmeHeadings,
  lintWebImports,
} from "./lib/lint.mjs"

function defaultExec(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return { status: result.status ?? 1, stdout: result.stdout ?? "" }
}

function walkSourceFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkSourceFiles(full))
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full)
    }
  }
  return out
}

function readWebLayer(entryDir, layer) {
  return walkSourceFiles(path.join(entryDir, "web", layer)).map((filePath) => ({
    path: filePath,
    content: readFileSync(filePath, "utf8"),
    layer,
  }))
}

function lintEntry(entryDir, contractHeadings, kernelVersion) {
  const errors = []
  const manifestPath = path.join(entryDir, "module.json")
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  } catch (err) {
    return [`${manifestPath}: JSON inválido — ${err.message}`]
  }
  errors.push(
    ...lintManifest(manifest).map((error) => `${manifestPath}: ${error}`)
  )
  if (kernelVersion) {
    errors.push(
      ...lintKernelRange(manifest, kernelVersion).map(
        (error) => `${manifestPath}: ${error}`
      )
    )
  }

  const readmePath = path.join(entryDir, "README.md")
  if (!existsSync(readmePath)) {
    errors.push(`${readmePath}: arquivo ausente`)
  } else {
    errors.push(
      ...lintReadmeHeadings(
        readFileSync(readmePath, "utf8"),
        contractHeadings
      ).map((error) => `${readmePath}: ${error}`)
    )
  }

  const changelogPath = path.join(entryDir, "CHANGELOG.md")
  if (!existsSync(changelogPath)) {
    errors.push(`${changelogPath}: arquivo ausente`)
  } else if (manifest.version) {
    errors.push(
      ...lintChangelogVersion(
        readFileSync(changelogPath, "utf8"),
        manifest.version
      ).map((error) => `${changelogPath}: ${error}`)
    )
  }

  const webFiles = [
    ...readWebLayer(entryDir, "core"),
    ...readWebLayer(entryDir, "react"),
  ]
  errors.push(...lintWebImports(webFiles))

  errors.push(...lintProductionTestingImports(entryDir))

  return errors
}

function lintAdvisories(dir, entryNames) {
  if (!existsSync(dir)) return []
  const errors = []
  for (const name of readdirSync(dir)) {
    if (!isAdvisoryFilename(name)) continue
    const filePath = path.join(dir, name)
    const content = readFileSync(filePath, "utf8")
    const frontmatterErrors = lintAdvisoryFrontmatter(content, filePath)
    if (frontmatterErrors.length > 0) {
      errors.push(...frontmatterErrors.map((error) => `${filePath}: ${error}`))
      continue
    }
    const advisory = parseAdvisory(content, filePath)
    errors.push(
      ...lintAdvisoryModule(advisory, entryNames).map(
        (error) => `${filePath}: ${error}`
      )
    )
    errors.push(
      ...lintAdvisoryPathScope(advisory).map((error) => `${filePath}: ${error}`)
    )
  }
  return errors
}

function readKernelVersion(changelogPath, errors) {
  try {
    return readLatestChangelogVersion(changelogPath)
  } catch (err) {
    if (!(err instanceof ChangelogVersionMissingError)) throw err
    errors.push(
      `${changelogPath}: ${err.message} — sem versão do kernel, o kernelRange das entradas não é conferido`
    )
    return undefined
  }
}

export function runLint({
  catalogRoot = "catalog",
  contractPath = "docs/platform/README-contract.md",
  advisoriesDir = "docs/advisories",
  changelogPath = "docs/dev/template-changelog.md",
  // Sem `repoRoot`, lintEntryBump não roda: precisa de um repositório git de
  // verdade (ver entry-bump-lint.test.mjs) — quem chama sem ele (fixtures de
  // outros lints) não paga o custo nem o risco de um `git` fora do repo.
  repoRoot,
  exec = defaultExec,
} = {}) {
  const contractHeadings = existsSync(contractPath)
    ? extractContractHeadings(readFileSync(contractPath, "utf8"))
    : []
  const errors = []
  const kernelVersion = readKernelVersion(changelogPath, errors)
  const entryDirs = discoverEntries(catalogRoot)
  const entryNames = entryDirs.map((entryDir) =>
    path.relative(catalogRoot, entryDir).split(path.sep).join("/")
  )
  for (const entryDir of entryDirs) {
    errors.push(...lintEntry(entryDir, contractHeadings, kernelVersion))
  }
  errors.push(...lintAdvisories(advisoriesDir, entryNames))
  if (repoRoot) {
    errors.push(...lintEntryBump({ repoRoot, exec, entries: entryDirs }))
  }
  return errors
}

if (isMain(import.meta.url, process.argv[1])) {
  const errors = runLint({ repoRoot: process.cwd() })
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`${error}\n`)
    process.exit(1)
  }
  process.exit(0)
}
