import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { isMain } from "./lib/is-main.mjs"

export const AREAS = ["apps/api", "catalog", "apps/web-vite", "apps/web-next"]

export const REQUIRED_ENTRIES = [
  "attachment",
  "audit",
  "identity/single-tenant",
  "notification",
  "tag",
]

// SPEC_DEVIATION: o pre-flight aceita os DOIS guards de `apps/api/src/modules/`,
// não só `module-boundaries.spec.ts`.
// Reason: tasks.md se contradiz — o § Execution Protocol descreve a árvore
// pós-v1 como "holds only the two boundary specs" e o Done-when de T1 cita um
// arquivo só. A árvore tem exatamente os dois specs (`template-kernel-only`
// existe desde KRN-01) e nenhuma pasta de módulo, que é o fato que o pre-flight
// protege. Abortar aqui seria por redação vencida, não por árvore errada.
export const KERNEL_MODULE_FILES = [
  "module-boundaries.spec.ts",
  "template-kernel-only.spec.ts",
]

const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".catalog-stage",
  ".git",
])

const TEST_FILE = /\.(spec|test|int-spec|e2e-spec)\.(ts|tsx|mts|mjs|js|jsx)$/

const CALL_SITE = /(^|[^\w$.])(it|test)((?:\.\w+)*)\s*\(/g

export function preflight(root = process.cwd()) {
  const errors = []
  for (const entry of REQUIRED_ENTRIES) {
    if (!existsSync(path.join(root, "catalog", entry))) {
      errors.push(`catalog/${entry}: entrada ausente`)
    }
  }
  const modulesDir = path.join(root, "apps", "api", "src", "modules")
  if (!existsSync(modulesDir)) {
    errors.push("apps/api/src/modules: diretório ausente")
    return errors
  }
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      errors.push(
        `apps/api/src/modules/${entry.name}: pasta de módulo instalada — a árvore não é a do template`
      )
    } else if (!KERNEL_MODULE_FILES.includes(entry.name)) {
      errors.push(
        `apps/api/src/modules/${entry.name}: arquivo fora dos guards do ponto de montagem`
      )
    }
  }
  return errors
}

function walk(dir, root, out) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, root, out)
    } else if (TEST_FILE.test(entry.name)) {
      out.push(path.relative(root, full).split(path.sep).join("/"))
    }
  }
}

export function collectTestFiles(root = process.cwd(), areas = AREAS) {
  const out = []
  for (const area of areas) walk(path.join(root, area), root, out)
  return out.sort()
}

function skipBalanced(source, openIndex) {
  let depth = 0
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i]
    if (char === "(") depth += 1
    else if (char === ")") {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return -1
}

function readLiteral(source, start) {
  let i = start
  while (i < source.length && /\s/.test(source[i])) i += 1
  const quote = source[i]
  if (quote !== '"' && quote !== "'" && quote !== "`") return null
  let title = ""
  for (let j = i + 1; j < source.length; j += 1) {
    const char = source[j]
    if (char === "\\") {
      title += source[j + 1] ?? ""
      j += 1
    } else if (char === quote) {
      return title
    } else {
      title += char
    }
  }
  return null
}

export function parseTests(content) {
  const titles = []
  let count = 0
  CALL_SITE.lastIndex = 0
  let match = CALL_SITE.exec(content)
  while (match !== null) {
    count += 1
    const openIndex = CALL_SITE.lastIndex - 1
    const table = /\.(each|for)\b/.test(match[3])
    // `it.each([...])("título")` — o título vem depois da tabela.
    const titleStart = table ? skipBalanced(content, openIndex) : openIndex + 1
    if (titleStart > 0) {
      const afterTable = table
        ? content.indexOf("(", titleStart - 1) + 1
        : titleStart
      const title = afterTable > 0 ? readLiteral(content, afterTable) : null
      if (title !== null) titles.push(title)
    }
    match = CALL_SITE.exec(content)
  }
  return { titles, count }
}

export function measure(root = process.cwd()) {
  const files = collectTestFiles(root).map((file) => {
    const { titles, count } = parseTests(
      readFileSync(path.join(root, file), "utf8")
    )
    return { file, titles, count }
  })
  return {
    totals: {
      files: files.length,
      sites: files.reduce((sum, entry) => sum + entry.count, 0),
    },
    files,
  }
}

/**
 * Quedas do baseline para a medição atual. Um arquivo que encolheu só é queda
 * se o grupo do split — todo arquivo atual que preservou algum título dele —
 * também encolheu.
 */
export function compareBaseline(baseline, current) {
  const currentByFile = new Map(current.files.map((e) => [e.file, e]))
  const violations = []
  for (const recorded of baseline.files) {
    const same = currentByFile.get(recorded.file)
    if (same && same.count >= recorded.count) continue
    const recordedTitles = new Set(recorded.titles)
    const group = current.files.filter(
      (entry) =>
        entry.file === recorded.file ||
        entry.titles.some((title) => recordedTitles.has(title))
    )
    const actual = group.reduce((sum, entry) => sum + entry.count, 0)
    if (actual >= recorded.count) continue
    violations.push({
      file: recorded.file,
      expected: recorded.count,
      actual,
      found: group.map((entry) => entry.file),
    })
  }
  return violations
}

function parseArgs(argv) {
  const options = { mode: null, file: null, root: process.cwd() }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--write" || arg === "--check") {
      options.mode = arg.slice(2)
      options.file = argv[i + 1] ?? null
      i += 1
    } else if (arg === "--preflight") {
      options.mode = options.mode ?? "preflight"
    } else if (arg === "--root") {
      options.root = argv[i + 1] ?? options.root
      i += 1
    }
  }
  return options
}

export function run(argv, { stdout, stderr } = {}) {
  const out = stdout ?? process.stdout
  const err = stderr ?? process.stderr
  const options = parseArgs(argv)
  if (options.mode === null) {
    err.write(
      "uso: it-count.mjs --preflight | --write <arquivo> | --check <arquivo>\n"
    )
    return 2
  }
  if (options.mode !== "check") {
    const errors = preflight(options.root)
    if (errors.length > 0) {
      err.write("pre-flight falhou — a árvore não é a esperada:\n")
      for (const error of errors) err.write(`  ${error}\n`)
      return 1
    }
    if (options.mode === "preflight") {
      out.write("pre-flight ok\n")
      return 0
    }
  }
  if (options.file === null) {
    err.write(`--${options.mode} exige o caminho do baseline\n`)
    return 2
  }
  const current = measure(options.root)
  if (options.mode === "write") {
    writeFileSync(
      path.resolve(options.root, options.file),
      `${JSON.stringify(current, null, 2)}\n`
    )
    out.write(
      `baseline gravado em ${options.file}: ${current.totals.files} arquivos, ${current.totals.sites} testes\n`
    )
    return 0
  }
  const baselinePath = path.resolve(options.root, options.file)
  if (!existsSync(baselinePath)) {
    err.write(`${options.file}: baseline ausente\n`)
    return 2
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"))
  const violations = compareBaseline(baseline, current)
  if (violations.length > 0) {
    err.write(`${violations.length} arquivo(s) perderam teste:\n`)
    for (const violation of violations) {
      err.write(
        `  ${violation.file}: esperado ${violation.expected}, atual ${violation.actual} (procurado em: ${violation.found.join(", ") || "nenhum arquivo"})\n`
      )
    }
    return 1
  }
  out.write(
    `sem queda: ${current.totals.files} arquivos, ${current.totals.sites} testes\n`
  )
  return 0
}

if (isMain(import.meta.url, process.argv[1])) {
  process.exit(run(process.argv.slice(2)))
}
