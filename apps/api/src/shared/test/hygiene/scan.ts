import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"

export type Violation = {
  rule: string
  file: string
  line: number
  snippet: string
}

export type Baseline = Record<string, Record<string, number>>

const IGNORED_SEGMENT =
  /(?:^|\/)(?:node_modules|dist|coverage|\.catalog-stage|__snapshots__)(?:\/|$)/

// O próprio guard nomeia cada token banido — varrê-lo seria contar a definição
// do ban como violação dele. Mesma isenção que `module-boundaries.spec.ts` dá
// aos seus fixtures; a cobertura do guard é `scan.spec.ts`, contra fixtures.
const GUARD_DIR = /(?:^|\/)src\/shared\/test\/hygiene\//

const SPEC_FILE = /\.(?:spec|int-spec|e2e-spec|test)\.tsx?$/
const HARNESS_FILE = /(?:^|\/)src\/shared\/test\//
const HARNESS_APP_FILE = /(?:^|\/)src\/shared\/test\/e2e\/app\.ts$/
const BARREL_FILE = /(?:^|\/)testing\//
const RUNNER_SETUP_FILE = /(?:^|\/)test\/setup\//

// A vizinhança onde o vocabulário de teste pode morar: o harness do kernel e o
// barrel da entrada. Fora dela, cada um destes bans é uma cópia local.
function isVocabularyHome(file: string): boolean {
  return HARNESS_FILE.test(file) || BARREL_FILE.test(file)
}

const BANNED_HELPERS = [
  "allowAll",
  "login",
  "loginAndGetCookie",
  "extractCookieValue",
  "parseSetCookie",
  "linkFromHtml",
  "waitFor",
  "pollUntil",
  "findSent",
  "makeInMemoryStorage",
  "seedUser",
] as const

const HELPER_DEFINITION = new RegExp(
  `(?:^|[^.\\w])(?:export\\s+)?(?:(?:async\\s+)?function|const|let|var)\\s+(?:${BANNED_HELPERS.join("|")})\\b`
)

// O allow-list de `apps/api/test/setup/` é plumbing do runner (design § 8):
// tudo que um spec importa mora no harness, não aqui.
const RUNNER_SETUP_ALLOWLIST = new Set([
  "global-setup.ts",
  "e2e-env.ts",
  "int-env.ts",
  "unit-env.ts",
  "e2e-after-env.ts",
  "container-uris.ts",
  "docker-runtime.ts",
])

// HRN-03: o efeito assíncrono se prova com `waitFor`/`drainOutbox`. Um laço
// escrito à mão — `while (!(await pronto()))` ou a condição de um `for`
// clássico que reconsulta — é a mesma espera, sem prazo nem erro nomeado.
// `for (const x of await consulta())` não é espera: só itera o que veio.
const POLL_LOOP = /\bwhile\s*\([^)]*\bawait\b|\bfor\s*\([^;]*;[^;]*\bawait\b/

type LineContext = { file: string; insideTest: boolean }

type HygieneRule = {
  id: string
  description: string
  appliesTo: (file: string) => boolean
  matchesLine?: (line: string, context: LineContext) => boolean
  matchesFile?: (file: string) => boolean
}

export const HYGIENE_RULES: readonly HygieneRule[] = [
  {
    id: "single-testing-module",
    description: "um único bootstrap do Nest fora de shared/test/e2e/app.ts",
    appliesTo: (file) => !HARNESS_APP_FILE.test(file),
    matchesLine: (line) => line.includes("Test.createTestingModule"),
  },
  {
    id: "no-local-helper",
    description: "helper do harness redefinido localmente",
    appliesTo: (file) => !isVocabularyHome(file),
    matchesLine: (line) => HELPER_DEFINITION.test(line),
  },
  {
    id: "no-harness-literal",
    description: "byte do PNG, origem web ou senha literal fora do harness",
    appliesTo: (file) => !isVocabularyHome(file),
    matchesLine: (line) =>
      line.includes("iVBORw0KGgo") ||
      /https?:\/\/localhost:5173/.test(line) ||
      /password\s*:\s*["'`]/i.test(line) ||
      /(?:const|let|var)\s+[A-Z_]*PASSWORD[A-Z_]*\s*=\s*["'`]/.test(line),
  },
  {
    id: "pool-owned-by-harness",
    description: "pool aberto dentro de um caso de teste",
    appliesTo: () => true,
    matchesLine: (line, context) =>
      context.insideTest && /\bcreateTestPool\s*\(/.test(line),
  },
  {
    id: "typed-deps",
    description: "dependência não tipada num spec",
    appliesTo: (file) => SPEC_FILE.test(file),
    matchesLine: (line) => /Record<\s*string\s*,\s*any\s*>/.test(line),
  },
  {
    id: "no-unsafe-cast",
    description: "as never / as unknown as fora de shared/test/**",
    appliesTo: (file) =>
      (SPEC_FILE.test(file) || BARREL_FILE.test(file)) &&
      !HARNESS_FILE.test(file),
    matchesLine: (line) => /\bas\s+never\b|\bas\s+unknown\s+as\b/.test(line),
  },
  {
    id: "no-from-props",
    description: "fromProps( num spec — use o make<Entity>() da entrada",
    appliesTo: (file) => SPEC_FILE.test(file) && !BARREL_FILE.test(file),
    matchesLine: (line) => /\.fromProps\s*\(/.test(line),
  },
  {
    id: "no-container-in-int-spec",
    description: "GenericContainer num int-spec",
    appliesTo: (file) => file.endsWith(".int-spec.ts"),
    matchesLine: (line) => line.includes("GenericContainer"),
  },
  {
    id: "no-sleep-as-proof",
    description:
      "setTimeout ou laço à mão como prova de efeito assíncrono — use waitFor/drainOutbox",
    appliesTo: (file) => SPEC_FILE.test(file) && !isVocabularyHome(file),
    matchesLine: (line) =>
      /\bsetTimeout\s*\(/.test(line) || POLL_LOOP.test(line),
  },
  {
    id: "runner-setup-allowlist",
    description: "arquivo em test/setup/ fora do plumbing do runner",
    appliesTo: (file) => RUNNER_SETUP_FILE.test(file),
    matchesFile: (file) =>
      !RUNNER_SETUP_ALLOWLIST.has(file.split("/").at(-1) ?? file),
  },
]

function closingIndex(source: string, openIndex: number): number {
  let depth = 0
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === "(" || char === "{" || char === "[") depth += 1
    if (char === ")" || char === "}" || char === "]") {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function lineOf(source: string, index: number): number {
  let line = 1
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === "\n") line += 1
  }
  return line
}

/**
 * Linhas cobertas por um corpo de `it`/`test`. O casamento de delimitadores
 * ignora strings — um parêntese solto dentro de uma string alargaria a faixa,
 * o que só torna o ban mais estrito, nunca mais frouxo.
 */
function testLines(source: string): Set<number> {
  const lines = new Set<number>()
  const opener = /\b(?:it|test)(?:\.\w+)*\s*\(/g
  let match: RegExpExecArray | null

  while ((match = opener.exec(source)) !== null) {
    const open = match.index + match[0].length - 1
    const close = closingIndex(source, open)
    if (close === -1) continue
    for (let line = lineOf(source, open); line <= lineOf(source, close); ) {
      lines.add(line)
      line += 1
    }
  }
  return lines
}

export function scanSource(file: string, source: string): Violation[] {
  const violations: Violation[] = []
  const applicable = HYGIENE_RULES.filter((rule) => rule.appliesTo(file))

  for (const rule of applicable) {
    if (rule.matchesFile?.(file)) {
      violations.push({ rule: rule.id, file, line: 1, snippet: file })
    }
  }

  const lineRules = applicable.filter((rule) => rule.matchesLine)
  if (lineRules.length === 0) return violations

  const inTest = testLines(source)
  const lines = source.split("\n")
  for (const [index, text] of lines.entries()) {
    const context = { file, insideTest: inTest.has(index + 1) }
    for (const rule of lineRules) {
      if (rule.matchesLine?.(text, context)) {
        violations.push({
          rule: rule.id,
          file,
          line: index + 1,
          snippet: text.trim().slice(0, 120),
        })
      }
    }
  }

  return violations
}

export function collectScanFiles(root: string, roots: string[]): string[] {
  const files: string[] = []
  for (const relRoot of roots) {
    const abs = resolve(root, relRoot)
    if (!existsSync(abs) || !statSync(abs).isDirectory()) continue
    for (const entry of readdirSync(abs, {
      recursive: true,
      encoding: "utf8",
    })) {
      const rel = `${relRoot}/${entry.split("\\").join("/")}`
      if (IGNORED_SEGMENT.test(rel) || GUARD_DIR.test(rel)) continue
      if (!/\.tsx?$/.test(rel)) continue
      if (!statSync(resolve(root, rel)).isFile()) continue
      files.push(rel)
    }
  }
  return files.sort()
}

export function scanFiles(root: string, files: string[]): Violation[] {
  return files.flatMap((file) =>
    scanSource(file, readFileSync(resolve(root, file), "utf8"))
  )
}

export function formatViolation(violation: Violation): string {
  return `${violation.rule} · ${violation.file}:${violation.line} · ${violation.snippet}`
}

function countByFile(violations: Violation[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const violation of violations) {
    counts.set(violation.file, (counts.get(violation.file) ?? 0) + 1)
  }
  return counts
}

/**
 * GA-9: o baseline só encolhe. Uma violação acima do registrado reprova; um
 * registro que já não corresponde reprova também — senão o arquivo vira
 * allow-list e o ban perde a força.
 */
export function compareToBaseline(
  rule: string,
  violations: Violation[],
  baseline: Baseline
): { unrecorded: string[]; stale: string[] } {
  const counts = countByFile(violations.filter((v) => v.rule === rule))
  const unrecorded: string[] = []
  const stale: string[] = []

  for (const violation of violations.filter((v) => v.rule === rule)) {
    const recorded = baseline[violation.file]?.[rule] ?? 0
    const found = counts.get(violation.file) ?? 0
    if (found > recorded) unrecorded.push(formatViolation(violation))
  }

  for (const [file, rules] of Object.entries(baseline)) {
    const recorded = rules[rule]
    if (recorded === undefined) continue
    const found = counts.get(file) ?? 0
    if (found < recorded) {
      stale.push(
        `${rule} · ${file} · baseline registra ${String(recorded)}, a árvore tem ${String(found)} — rode o gerador do baseline`
      )
    }
  }

  return { unrecorded, stale }
}
