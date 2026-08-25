import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import {
  collectTestFiles,
  compareBaseline,
  measure,
  parseTests,
  preflight,
} from "../it-count.mjs"

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "it-count.mjs"
)

function write(root, rel, content) {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
}

function makeTree(overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "it-count-"))
  for (const entry of [
    "attachment",
    "audit",
    "identity/single-tenant",
    "notification",
    "tag",
  ]) {
    write(root, `catalog/${entry}/module.json`, "{}")
  }
  write(root, "apps/api/src/modules/module-boundaries.spec.ts", "")
  write(root, "apps/api/src/modules/template-kernel-only.spec.ts", "")
  for (const [rel, content] of Object.entries(overrides)) {
    write(root, rel, content)
  }
  return root
}

function runCli(root, args) {
  return spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], {
    encoding: "utf8",
  })
}

test("pre-flight aceita a árvore pós-v1 com as cinco entradas e os dois guards", () => {
  assert.deepEqual(preflight(makeTree()), [])
})

test("pre-flight nomeia cada entrada do catálogo que falta", () => {
  const root = makeTree()
  const errors = preflight(path.join(root, "vazio"))
  assert.ok(
    errors.some((error) => error.includes("catalog/identity/single-tenant")),
    `identity não foi cobrada: ${errors.join(" | ")}`
  )
  assert.ok(errors.some((error) => error.includes("catalog/tag")))
})

test("pre-flight falha com uma pasta de módulo instalada em apps/api/src/modules", () => {
  const root = makeTree({
    "apps/api/src/modules/identity/identity.module.ts": "",
  })
  assert.deepEqual(preflight(root), [
    "apps/api/src/modules/identity: pasta de módulo instalada — a árvore não é a do template",
  ])
})

test("pre-flight falha com um arquivo fora dos dois guards do ponto de montagem", () => {
  const root = makeTree({ "apps/api/src/modules/leftover.ts": "" })
  assert.deepEqual(preflight(root), [
    "apps/api/src/modules/leftover.ts: arquivo fora dos guards do ponto de montagem",
  ])
})

test("parseTests conta it, test e os modificadores, e guarda os títulos literais", () => {
  const result = parseTests(`
    describe("suite", () => {
      it("um", () => {})
      it.skip("dois", () => {})
      test('três', () => {})
      it.each([1, 2])("quatro %i", () => {})
    })
  `)
  assert.equal(result.count, 4)
  assert.deepEqual(result.titles, ["um", "dois", "três", "quatro %i"])
})

test("parseTests ignora describe e identificadores que só terminam em it", () => {
  const result = parseTests(`
    describe("x", () => {})
    const audit = { it: 1 }
    submit("não é teste")
    it("único", () => {})
  `)
  assert.equal(result.count, 1)
  assert.deepEqual(result.titles, ["único"])
})

test("a varredura cobre as quatro áreas e ignora node_modules, dist, coverage e .catalog-stage", () => {
  const root = makeTree({
    "apps/api/src/a.spec.ts": 'it("a", () => {})',
    "catalog/tag/api/b.int-spec.ts": 'it("b", () => {})',
    "apps/web-vite/src/c.test.tsx": 'it("c", () => {})',
    "apps/web-next/src/d.test.ts": 'it("d", () => {})',
    "apps/api/node_modules/e.spec.ts": 'it("e", () => {})',
    "apps/api/dist/f.spec.ts": 'it("f", () => {})',
    "coverage/g.spec.ts": 'it("g", () => {})',
    "apps/api/.catalog-stage/h.spec.ts": 'it("h", () => {})',
    "apps/api/src/i.ts": 'it("i", () => {})',
  })
  assert.deepEqual(collectTestFiles(root), [
    "apps/api/src/a.spec.ts",
    "apps/api/src/modules/module-boundaries.spec.ts",
    "apps/api/src/modules/template-kernel-only.spec.ts",
    "apps/web-next/src/d.test.ts",
    "apps/web-vite/src/c.test.tsx",
    "catalog/tag/api/b.int-spec.ts",
  ])
})

test("--write grava titles e count por arquivo, mais os totais", () => {
  const root = makeTree({
    "apps/api/src/a.spec.ts": 'it("um", () => {})\nit("dois", () => {})',
  })
  const result = runCli(root, ["--write", "baseline.json"])
  assert.equal(result.status, 0, result.stderr)
  const baseline = JSON.parse(
    readFileSync(path.join(root, "baseline.json"), "utf8")
  )
  assert.deepEqual(baseline.totals, { files: 3, sites: 2 })
  assert.deepEqual(
    baseline.files.filter((entry) => entry.count > 0),
    [{ file: "apps/api/src/a.spec.ts", titles: ["um", "dois"], count: 2 }]
  )
})

test("--write recusa a gravar em uma árvore que não passa no pre-flight", () => {
  const root = makeTree({ "apps/api/src/modules/leftover.ts": "" })
  const result = runCli(root, ["--write", "baseline.json"])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /pre-flight falhou/)
  assert.match(result.stderr, /leftover\.ts/)
})

test("--check sai 0 quando nada caiu", () => {
  const root = makeTree({
    "apps/api/src/a.spec.ts": 'it("um", () => {})\nit("dois", () => {})',
  })
  assert.equal(runCli(root, ["--write", "baseline.json"]).status, 0)
  const result = runCli(root, ["--check", "baseline.json"])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /sem queda: 3 arquivos, 2 testes/)
})

test("--check sai 1 e nomeia arquivo, esperado e atual quando um teste some", () => {
  const root = makeTree({
    "apps/api/src/a.spec.ts": 'it("um", () => {})\nit("dois", () => {})',
  })
  runCli(root, ["--write", "baseline.json"])
  write(root, "apps/api/src/a.spec.ts", 'it("um", () => {})')
  const result = runCli(root, ["--check", "baseline.json"])
  assert.equal(result.status, 1)
  assert.match(
    result.stderr,
    /apps\/api\/src\/a\.spec\.ts: esperado 2, atual 1/
  )
})

test("--check sai 1 quando o arquivo inteiro é apagado", () => {
  const baseline = {
    files: [{ file: "apps/api/src/a.spec.ts", titles: ["um"], count: 1 }],
  }
  const violations = compareBaseline(baseline, { files: [] })
  assert.deepEqual(violations, [
    {
      file: "apps/api/src/a.spec.ts",
      expected: 1,
      actual: 0,
      found: [],
    },
  ])
})

test("um split que preserva os títulos não é lido como perda", () => {
  const root = makeTree({
    "apps/api/src/a.spec.ts":
      'it("um", () => {})\nit("dois", () => {})\nit("três", () => {})',
  })
  runCli(root, ["--write", "baseline.json"])
  write(root, "apps/api/src/a.spec.ts", 'it("um", () => {})')
  write(
    root,
    "apps/api/src/a-extra.spec.ts",
    'it("dois", () => {})\nit("três", () => {})'
  )
  const result = runCli(root, ["--check", "baseline.json"])
  assert.equal(result.status, 0, result.stderr)
})

test("um split que perde um teste pelo caminho continua sendo queda", () => {
  const root = makeTree({
    "apps/api/src/a.spec.ts":
      'it("um", () => {})\nit("dois", () => {})\nit("três", () => {})',
  })
  runCli(root, ["--write", "baseline.json"])
  write(root, "apps/api/src/a.spec.ts", 'it("um", () => {})')
  write(root, "apps/api/src/a-extra.spec.ts", 'it("dois", () => {})')
  const result = runCli(root, ["--check", "baseline.json"])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /esperado 3, atual 2/)
  assert.match(result.stderr, /a-extra\.spec\.ts/)
})

test("--check não exige o pre-flight, para rodar também no gate final", () => {
  const root = makeTree({ "apps/api/src/a.spec.ts": 'it("um", () => {})' })
  runCli(root, ["--write", "baseline.json"])
  write(root, "apps/api/src/modules/leftover.ts", "")
  assert.equal(runCli(root, ["--check", "baseline.json"]).status, 0)
})

test("sem modo o CLI sai 2 com o uso", () => {
  const root = makeTree()
  const result = runCli(root, [])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /uso: it-count\.mjs/)
})

test("o baseline versionado da feature bate com a árvore do repositório", () => {
  const repoRoot = path.resolve(path.dirname(SCRIPT), "..", "..")
  const baselinePath = path.join(
    repoRoot,
    ".specs/features/test-suite-refactor/baseline.json"
  )
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"))
  assert.deepEqual(compareBaseline(baseline, measure(repoRoot)), [])
  assert.ok(
    baseline.totals.files >= 317,
    `baseline com ${baseline.totals.files} arquivos — a varredura está perdendo uma área`
  )
  assert.ok(
    baseline.totals.sites >= 2074,
    `baseline com ${baseline.totals.sites} testes — a varredura está perdendo uma área`
  )
})
