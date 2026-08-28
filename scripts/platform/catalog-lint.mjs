import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { isAdvisoryFilename, parseAdvisory } from "./lib/advisories.mjs"
import { isMain } from "./lib/is-main.mjs"
import {
  ChangelogVersionMissingError,
  lintOpenChangelogSections,
  readChangelogHeadings,
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

// RULE D (design § RULE D, AD-025): fora de um filho, `catalog-lint` é o único
// lugar onde a aresta `<entrada> → <outra>/testing` é conferida. Os specifiers
// do catálogo são escritos para o layout instalado (`modules/<entrada>/...`).
// Dentro do filho quem cobre a regra é a cópia em
// `apps/api/src/modules/module-boundaries.spec.ts` (este arquivo não é copiado
// para lá); `__tests__/catalog-testing-imports.test.mjs` roda as duas sobre o
// mesmo corpus e reprova divergência.
const IMPORT_SPECIFIER =
  /\b(?:import|export)\s+[^"';]*?\s*from\s*["']([^"']+)["']/g

// `await import("…")` cria a mesma aresta em runtime que o import estático e
// não tem cláusula `from` — sem esta forma, RULE D é contornável escrevendo o
// import do barrel alheio como chamada.
const DYNAMIC_IMPORT_SPECIFIER = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g

function importSpecifiers(content) {
  const found = []
  for (const pattern of [IMPORT_SPECIFIER, DYNAMIC_IMPORT_SPECIFIER]) {
    for (const match of content.matchAll(pattern)) {
      found.push({
        index: match.index,
        line: content.slice(0, match.index).split("\n").length,
        specifier: match[1] ?? "",
      })
    }
  }
  return found
    .sort((a, b) => a.index - b.index)
    .map(({ line, specifier }) => ({ line, specifier }))
}

function resolvePosix(fromDir, specifier) {
  const parts = fromDir.split("/")
  for (const segment of specifier.split("/")) {
    if (segment === "" || segment === ".") continue
    if (segment === "..") parts.pop()
    else parts.push(segment)
  }
  return parts.join("/")
}

export function testingEntryOf(childPath, specifier) {
  if (!specifier.startsWith(".")) return null
  const fromDir = childPath.slice(0, childPath.lastIndexOf("/"))
  const target = resolvePosix(fromDir, specifier)
  return /^modules\/([^/]+)\/testing(?:\/|$)/.exec(target)?.[1] ?? null
}

export function cycleThrough(dependsOn, from, to) {
  const stack = [{ name: to, chain: [from, to] }]
  const seen = new Set()
  while (stack.length > 0) {
    const current = stack.pop()
    if (current.name === from) return current.chain
    if (seen.has(current.name)) continue
    seen.add(current.name)
    for (const next of dependsOn.get(current.name) ?? []) {
      stack.push({ name: next, chain: [...current.chain, next] })
    }
  }
  return null
}

export function lintTestingImports(entryDirs) {
  const entries = []
  for (const dir of entryDirs) {
    try {
      const manifest = JSON.parse(
        readFileSync(path.join(dir, "module.json"), "utf8")
      )
      entries.push({
        name: manifest.name,
        dir,
        dependsOn: (manifest.dependsOn ?? []).map((dep) => dep.name),
      })
    } catch {
      continue
    }
  }
  const dependsOn = new Map(
    entries.map((entry) => [entry.name, entry.dependsOn])
  )
  const errors = []
  for (const entry of entries) {
    const apiDir = path.join(entry.dir, "api")
    for (const filePath of walkSourceFiles(apiDir)) {
      const relFromApi = path
        .relative(apiDir, filePath)
        .split(path.sep)
        .join("/")
      const childPath = `modules/${entry.name}/${relFromApi}`
      for (const { line, specifier } of importSpecifiers(
        readFileSync(filePath, "utf8")
      )) {
        const target = testingEntryOf(childPath, specifier)
        if (target === null || target === entry.name) continue
        if (!entry.dependsOn.includes(target)) {
          errors.push(
            `${filePath}:${line}: importa ${target}/testing sem ${target} em dependsOn`
          )
          continue
        }
        const cycle = cycleThrough(dependsOn, entry.name, target)
        if (cycle) {
          errors.push(
            `${filePath}:${line}: importa ${target}/testing e fecha ciclo em dependsOn: ${cycle.join(" -> ")}`
          )
        }
      }
    }
  }
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

function readLocalStableTags({ repoRoot, exec }) {
  const result = exec("git", ["tag", "-l", "v*"], { cwd: repoRoot })
  if (result.status !== 0) return []
  return result.stdout
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function lintOpenChangelogSectionsRule({ changelogPath, repoRoot, exec }) {
  if (!repoRoot) return []
  const headings = readChangelogHeadings(changelogPath)
  const stableTags = readLocalStableTags({ repoRoot, exec })
  const result = lintOpenChangelogSections({ headings, stableTags })
  return result.ok ? [] : [`${changelogPath}: ${result.reason}`]
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
  errors.push(...lintTestingImports(entryDirs))
  errors.push(...lintAdvisories(advisoriesDir, entryNames))
  if (repoRoot) {
    errors.push(...lintEntryBump({ repoRoot, exec, entries: entryDirs }))
  }
  errors.push(
    ...lintOpenChangelogSectionsRule({ changelogPath, repoRoot, exec })
  )
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
