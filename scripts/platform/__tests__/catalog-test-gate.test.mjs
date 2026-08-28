import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { STAGE_DIR, stage } from "../catalog-stage.mjs"
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

function readExcludePatterns(configPath) {
  const source = readFileSync(configPath, "utf8")
  const excludeMatch = source.match(/exclude:\s*\[([^\]]*)\]/)
  assert.ok(excludeMatch, `não achei "exclude" em ${configPath}`)
  return [...excludeMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
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

// `stageRoot` isolado por teste: node --test roda arquivos de teste em
// paralelo, e catalog-eslint.mjs também estagia para o `apps/api/.catalog-stage`
// real — sem isolamento os dois processos disputam o mesmo diretório físico
// (EEXIST/ENOTEMPTY intermitentes). O basename de STAGE_DIR é preservado
// dentro do tmpdir para que `resolveGlobstarSuffix` continue resolvendo o
// padrão ".catalog-stage/..." do config real, sem reescrever a asserção.
test("o include de vitest.catalog.config.mts resolve, contra o stage real, a >= 1 arquivo", () => {
  const entries = listEntries(CATALOG_ROOT)
  const stageParent = mkdtempSync(path.join(tmpdir(), "catalog-test-gate-"))
  stage({
    repoRoot: ROOT_DIR,
    entries,
    stageRoot: path.join(stageParent, path.basename(STAGE_DIR)),
  })
  const patterns = readIncludePatterns(API_CATALOG_CONFIG_PATH)
  const matches = patterns.flatMap((pattern) =>
    resolveGlobstarSuffix(stageParent, pattern)
  )
  assert.ok(
    matches.length > 0,
    `include ${JSON.stringify(patterns)} resolveu a 0 arquivos contra o stage`
  )
})

// `contract.parity.spec.ts` só pode passar contra um `openapi.json`
// *renderizado* (child real, pós `module add`); o template é kernel-only
// por construção e nunca teria essas rotas. `pnpm catalog:check` é quem
// prova esse teste de verdade (foi lá que a wave 11 pegou uma regressão
// real, contract.parity.spec.ts:42) — este check só garante que o exclude
// que tira esses specs da coleta daqui não virou um no-op silencioso nem
// engoliu specs que não são de contrato.
test("o exclude de contract.parity.spec.ts em vitest.catalog.config.mts casa >= 1 arquivo staged, sem apagar os demais", () => {
  const entries = listEntries(CATALOG_ROOT)
  const stageRoot = mkdtempSync(path.join(tmpdir(), "catalog-test-gate-"))
  const plan = stage({ repoRoot: ROOT_DIR, entries, stageRoot })
  const stagedModulesDir = path.join(plan.stageRoot, "src/modules")
  const patterns = readExcludePatterns(API_CATALOG_CONFIG_PATH)
  assert.deepEqual(
    patterns,
    ["**/contract.parity.spec.ts"],
    "o exclude mudou de forma inesperada — revê o motivo documentado no config"
  )

  const stagedSpecs = walkFiles(stagedModulesDir, (name) =>
    name.endsWith(".spec.ts")
  )
  const excludedByPattern = stagedSpecs.filter(
    (file) => path.basename(file) === "contract.parity.spec.ts"
  )
  assert.ok(
    excludedByPattern.length > 0,
    "exclude de contract.parity.spec.ts não casou nenhum staged — virou no-op silencioso"
  )
  assert.ok(
    excludedByPattern.length < stagedSpecs.length,
    "exclude de contract.parity.spec.ts apagou tudo — 0 specs sobrariam pra este tier coletar"
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
