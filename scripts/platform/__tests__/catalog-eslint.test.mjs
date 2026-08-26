import assert from "node:assert/strict"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { runCatalogEslint } from "../catalog-eslint.mjs"

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)

const CLEAN_SOURCE = `export function pick(input: { value: number } | null): number | undefined {
  return input?.value
}
`

// Regra `@typescript-eslint/no-explicit-any` de base.js: "error" incondicional
// para todo *.ts que não seja arquivo de teste — não depende do override de
// no-console que este próprio gate adiciona, então prova a regra herdada de
// `@workspace/eslint-config/nest`, não só o config gerado por cima dela.
const OFFENDING_SOURCE = `export const bad: any = 1
`

// Entrada sintética fora de catalog/: `stage()` só precisa de `{ name, dir }`
// com uma pasta `api/` dentro — não precisa ser uma entrada real do catálogo.
// Isso mantém o stage pequeno (só este arquivo, mais os symlinks do kernel),
// então o programa type-aware do ESLint fica rápido mesmo com projectService
// desligado.
function fixtureEntry(source) {
  const dir = mkdtempSync(path.join(tmpdir(), "catalog-eslint-fixture-"))
  mkdirSync(path.join(dir, "api"), { recursive: true })
  writeFileSync(path.join(dir, "api", "sample.ts"), source)
  return { dir, fixtureDir: dir, entries: [{ name: "eslint-fixture", dir }] }
}

function cleanup(fixtureDir) {
  // Só a fixture privada: o stage físico é compartilhado com
  // catalog-test-gate.test.mjs (mesmo `apps/api/.catalog-stage`, ver
  // catalog-stage.mjs) e `stage()` já o zera no início de toda chamada — apagá-lo
  // aqui de novo só criaria uma segunda janela de corrida sem necessidade.
  rmSync(fixtureDir, { recursive: true, force: true })
}

// `stage()` (catalog-stage.mjs) escreve sempre no mesmo `apps/api/.catalog-stage`
// físico, sem trava — quando node:test roda catalog-test-gate.test.mjs em paralelo
// (arquivo de teste diferente, catalog real de ~571 arquivos), o `stage()` dele pode
// apagar o diretório enquanto o processo eslint aqui ainda está lendo, e o pnpm
// falha com ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL — falha de infraestrutura
// transitória, não do gate. Reencena o stage e tenta de novo; qualquer outra saída
// (inclusive uma real violação de regra) passa direto, sem retry.
function runCatalogEslintRetrying(options, attemptsLeft = 3) {
  const result = runCatalogEslint(options)
  const collided = /ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL/.test(
    `${result.stdout}${result.stderr}`
  )
  if (collided && attemptsLeft > 1)
    return runCatalogEslintRetrying(options, attemptsLeft - 1)
  return result
}

test("catalog:eslint falha numa entrada estagiada com violação de regra (@typescript-eslint/no-explicit-any)", () => {
  const { fixtureDir, entries } = fixtureEntry(OFFENDING_SOURCE)
  const result = runCatalogEslintRetrying({
    repoRoot: REPO_ROOT,
    entries,
    stdio: "pipe",
  })
  cleanup(fixtureDir)
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /no-explicit-any/)
})

test("catalog:eslint passa numa entrada estagiada limpa", () => {
  const { fixtureDir, entries } = fixtureEntry(CLEAN_SOURCE)
  const result = runCatalogEslintRetrying({
    repoRoot: REPO_ROOT,
    entries,
    stdio: "pipe",
  })
  cleanup(fixtureDir)
  assert.equal(result.status, 0, result.stdout || result.stderr)
})

test("o config gerado reaponta o parser type-aware para tsconfig.catalog.json, não para o eslint.config.mjs real (que ignora .catalog-stage/**)", () => {
  const { fixtureDir, entries } = fixtureEntry(CLEAN_SOURCE)
  const result = runCatalogEslintRetrying({
    repoRoot: REPO_ROOT,
    entries,
    stdio: "pipe",
  })
  const generatedConfig = readFileSync(
    path.join(result.plan.stageRoot, "eslint.config.catalog.mjs"),
    "utf8"
  )
  cleanup(fixtureDir)
  assert.match(generatedConfig, /tsconfig\.catalog\.json/)
  assert.match(generatedConfig, /packages\/eslint-config\/nest\.js/)
})

test("package.json expõe catalog:eslint, e o comando aponta pro script novo", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")
  )
  assert.equal(
    manifest.scripts["catalog:eslint"],
    "node scripts/platform/catalog-eslint.mjs"
  )
})
