import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { stage } from "../catalog-stage.mjs"
import { listEntries } from "../lib/catalog-graph.mjs"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(TESTS_DIR, "../../..")
const ROOT_PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json")
const ROOT_CATALOG_CONFIG_PATH = path.join(ROOT_DIR, "vitest.catalog.mts")
const API_CATALOG_CONFIG_PATH = path.join(
  ROOT_DIR,
  "apps/api/vitest.catalog.config.mts"
)
const API_UNIT_CONFIG_PATH = path.join(ROOT_DIR, "apps/api/vitest.config.mts")
const CATALOG_ROOT = path.join(ROOT_DIR, "catalog")

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function readIncludePatterns(configPath) {
  const source = readFileSync(configPath, "utf8")
  const includeMatch = source.match(/include:\s*\[([^\]]*)\]/)
  assert.ok(includeMatch, `não achei "include" em ${configPath}`)
  return [...includeMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
}

function walkFiles(dir, matches) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full, matches))
    else if (matches(entry.name)) out.push(full)
  }
  return out
}

// Os dois configs da api usam a mesma forma de include: `<dir>/**/*<sufixo>`.
// Resolve essa forma contra árvore real em vez de reimplementar glob geral.
function resolveGlobstarSuffix(apiRoot, pattern) {
  const parsed = pattern.match(/^(.*)\/\*\*\/\*(\.[^/]+)$/)
  assert.ok(parsed, `padrão de include não reconhecido: "${pattern}"`)
  const [, baseDir, suffix] = parsed
  return walkFiles(path.join(apiRoot, baseDir), (name) => name.endsWith(suffix))
}

test("o tier de catalog/ existe: vitest.catalog.mts e apps/api/vitest.catalog.config.mts", () => {
  assert.equal(existsSync(ROOT_CATALOG_CONFIG_PATH), true)
  assert.equal(existsSync(API_CATALOG_CONFIG_PATH), true)
})

test("o include de vitest.catalog.config.mts resolve, contra o stage real, a >= 1 arquivo", () => {
  const entries = listEntries(CATALOG_ROOT)
  stage({ repoRoot: ROOT_DIR, entries })
  const apiRoot = path.join(ROOT_DIR, "apps/api")
  const patterns = readIncludePatterns(API_CATALOG_CONFIG_PATH)
  const matches = patterns.flatMap((pattern) =>
    resolveGlobstarSuffix(apiRoot, pattern)
  )
  assert.ok(
    matches.length > 0,
    `include ${JSON.stringify(patterns)} resolveu a 0 arquivos contra o stage`
  )
})

test("package.json expõe catalog:test, e o comando estagia antes de rodar o vitest", () => {
  const { scripts } = readJson(ROOT_PACKAGE_JSON_PATH)
  const command = scripts["catalog:test"]
  assert.ok(command, "catalog:test ausente em package.json")
  const stageIndex = command.indexOf("catalog-stage")
  const vitestIndex = command.indexOf("vitest")
  assert.ok(stageIndex >= 0, "catalog:test não chama catalog-stage.mjs")
  assert.ok(vitestIndex >= 0, "catalog:test não chama vitest")
  assert.ok(
    stageIndex < vitestIndex,
    "catalog-stage precisa vir antes de vitest no comando"
  )
})

test("apps/api/vitest.config.mts continua sem casar nada sob catalog/ — separação deliberada", () => {
  const patterns = readIncludePatterns(API_UNIT_CONFIG_PATH)
  assert.deepEqual(patterns, ["src/**/*.spec.ts"])

  // Não só o texto: nenhum spec real de catalog/ mora sob apps/api/src, então
  // esse include nunca alcança catalog/ — e não deve, por construção.
  const apiSrcDir = path.join(ROOT_DIR, "apps/api/src")
  const catalogSpecs = walkFiles(CATALOG_ROOT, (name) =>
    name.endsWith(".spec.ts")
  )
  assert.ok(
    catalogSpecs.length > 0,
    "esperava specs reais sob catalog/ para este check fazer sentido"
  )
  for (const specFile of catalogSpecs) {
    assert.ok(
      !specFile.startsWith(apiSrcDir),
      `${specFile} está sob apps/api/src — o include do tier unitário passaria a casá-lo`
    )
  }
})
