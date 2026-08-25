import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import {
  cycleThrough,
  lintTestingImports,
  testingEntryOf,
} from "../catalog-lint.mjs"

function entryFixture(entries) {
  const root = mkdtempSync(path.join(tmpdir(), "catalog-rule-d-"))
  const dirs = []
  for (const entry of entries) {
    const dir = path.join(root, entry.name)
    mkdirSync(path.join(dir, "api", "__e2e__"), { recursive: true })
    writeFileSync(
      path.join(dir, "module.json"),
      JSON.stringify({
        name: entry.name,
        dependsOn: (entry.dependsOn ?? []).map((name) => ({
          name,
          range: ">=2.0.0 <3.0.0",
        })),
      })
    )
    if (entry.source) {
      writeFileSync(
        path.join(dir, "api", "__e2e__", "flow.e2e-spec.ts"),
        entry.source
      )
    }
    dirs.push(dir)
  }
  return dirs
}

test("testingEntryOf resolve o specifier no layout instalado do filho", () => {
  const from = "modules/identity/__e2e__/flow.e2e-spec.ts"
  assert.equal(
    testingEntryOf(from, "../../notification/testing"),
    "notification"
  )
  assert.equal(testingEntryOf(from, "../testing"), "identity")
  assert.equal(testingEntryOf(from, "../../notification/api/facades"), null)
  assert.equal(testingEntryOf(from, "@nestjs/testing"), null)
})

test("cycleThrough nomeia o ciclo que a aresta fecharia", () => {
  const graph = new Map([
    ["identity", ["notification"]],
    ["notification", []],
  ])
  assert.deepEqual(cycleThrough(graph, "notification", "identity"), [
    "notification",
    "identity",
    "notification",
  ])
  assert.equal(cycleThrough(graph, "identity", "notification"), null)
})

test("reprova import de testing/ de entrada fora do dependsOn", () => {
  const dirs = entryFixture([
    {
      name: "identity",
      dependsOn: [],
      source: 'import { seedTag } from "../../tag/testing"\n',
    },
    { name: "tag", dependsOn: ["identity"] },
  ])
  const errors = lintTestingImports(dirs)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /importa tag\/testing sem tag em dependsOn$/)
  assert.match(errors[0], /flow\.e2e-spec\.ts:1:/)
})

test("aceita import de testing/ declarado no dependsOn", () => {
  const dirs = entryFixture([
    {
      name: "identity",
      dependsOn: ["notification"],
      source: 'import { findSent } from "../../notification/testing"\n',
    },
    { name: "notification", dependsOn: [] },
  ])
  assert.deepEqual(lintTestingImports(dirs), [])
})

test("reprova import() dinâmico de testing/ fora do dependsOn", () => {
  const dirs = entryFixture([
    {
      name: "identity",
      dependsOn: [],
      source:
        'it("t", async () => {\n  const { seedTag } = await import("../../tag/testing")\n})\n',
    },
    { name: "tag", dependsOn: ["identity"] },
  ])
  const errors = lintTestingImports(dirs)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /importa tag\/testing sem tag em dependsOn$/)
  assert.match(errors[0], /flow\.e2e-spec\.ts:2:/)
})

test("aceita import() dinâmico de entrada declarada no dependsOn", () => {
  const dirs = entryFixture([
    {
      name: "identity",
      dependsOn: ["notification"],
      source:
        'const { findSent } = await import("../../notification/testing")\n',
    },
    { name: "notification", dependsOn: [] },
  ])
  assert.deepEqual(lintTestingImports(dirs), [])
})

test("aceita o barrel da própria entrada", () => {
  const dirs = entryFixture([
    {
      name: "identity",
      dependsOn: [],
      source: 'import { seedUser } from "../testing"\n',
    },
  ])
  assert.deepEqual(lintTestingImports(dirs), [])
})

test("reprova a aresta que fecharia um ciclo, nomeando o ciclo (AD-025)", () => {
  const dirs = entryFixture([
    { name: "identity", dependsOn: ["notification"] },
    {
      name: "notification",
      dependsOn: ["identity"],
      source: 'import { seedUser } from "../../identity/testing"\n',
    },
  ])
  const errors = lintTestingImports(dirs)
  assert.equal(errors.length, 1)
  assert.match(
    errors[0],
    /fecha ciclo em dependsOn: notification -> identity -> notification$/
  )
})

// RULE D é implementada duas vezes de propósito: `catalog-lint.mjs` é excluído
// da cópia para o filho (`copier.yml` `_exclude`) e quem embarca no filho é
// `apps/api/src/modules/module-boundaries.spec.ts` — nenhum dos dois lados
// alcança um módulo comum, então não há implementação única a extrair. O que
// impede a deriva silenciosa é esta paridade: os corpos da cópia embarcada são
// extraídos do próprio arquivo e decidem o mesmo corpus que a cópia do lint.
// Se a cópia TS ganhar sintaxe de tipo que o extrator não conhece, este teste
// quebra ruidosamente — é a intenção: uma regra AD-025 que chega em todo filho
// não pode divergir em silêncio.
const SPEC_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "apps",
  "api",
  "src",
  "modules",
  "module-boundaries.spec.ts"
)

function functionBody(source, header) {
  const start = source.indexOf(header)
  assert.notEqual(
    start,
    -1,
    `module-boundaries.spec.ts não tem mais "${header}" — a paridade de RULE D perdeu a âncora`
  )
  const open = source.indexOf("{", start)
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1
    else if (source[index] === "}") {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, index)
    }
  }
  return assert.fail(
    `corpo de "${header}" não fecha em module-boundaries.spec.ts`
  )
}

// A cópia embarcada só difere da do lint nas anotações de tipo; o extrator
// conhece as duas formas que ela usa (anotação de `const` e argumento de tipo
// em `new Set`/`new Map`).
function asJs(body) {
  return body
    .replace(/^(\s*(?:const|let) [A-Za-z_$][\w$]*): [^=\n]+=/gm, "$1 =")
    .replace(/new (Set|Map)<[^>]*>\(/g, "new $1(")
}

function shippedCopy() {
  const source = readFileSync(SPEC_PATH, "utf8")
  const resolvePosix = new Function(
    "fromDir",
    "specifier",
    asJs(functionBody(source, "function resolvePosix("))
  )
  const entryOf = new Function(
    "resolvePosix",
    "childPath",
    "specifier",
    asJs(functionBody(source, "function testingEntryOf("))
  )
  return {
    testingEntryOf: (childPath, specifier) =>
      entryOf(resolvePosix, childPath, specifier),
    cycleThrough: new Function(
      "dependsOn",
      "from",
      "to",
      asJs(functionBody(source, "function cycleThrough("))
    ),
  }
}

const FROM = "modules/identity/__e2e__/flow.e2e-spec.ts"

// Corpus fixo: o esperado vem da regra, não de uma das cópias — assim a
// paridade não passa com as duas erradas do mesmo jeito.
const SPECIFIER_CORPUS = [
  {
    from: FROM,
    specifier: "../../notification/testing",
    entry: "notification",
  },
  {
    from: FROM,
    specifier: "../../notification/testing/seed",
    entry: "notification",
  },
  { from: FROM, specifier: "../testing", entry: "identity" },
  { from: FROM, specifier: "../testing/seed-user", entry: "identity" },
  { from: FROM, specifier: "../../notification/api/facades", entry: null },
  { from: FROM, specifier: "@nestjs/testing", entry: null },
  { from: FROM, specifier: "./testing", entry: null },
  { from: FROM, specifier: "../../tag/testingx", entry: null },
  { from: FROM, specifier: "../../../modules/tag/testing", entry: "tag" },
  {
    from: "modules/identity/api/facade.ts",
    specifier: "../../tag/testing",
    entry: "tag",
  },
  {
    from: "modules/identity/__e2e__/deep/case.ts",
    specifier: "../../../tag/testing",
    entry: "tag",
  },
]

const CYCLE_CORPUS = [
  {
    graph: [
      ["identity", ["notification"]],
      ["notification", ["identity"]],
    ],
    from: "notification",
    to: "identity",
    cycle: ["notification", "identity", "notification"],
  },
  {
    graph: [
      ["identity", ["notification"]],
      ["notification", []],
    ],
    from: "identity",
    to: "notification",
    cycle: null,
  },
  {
    graph: [
      ["a", ["b"]],
      ["b", ["c"]],
      ["c", []],
    ],
    from: "c",
    to: "a",
    cycle: ["c", "a", "b", "c"],
  },
  { graph: [], from: "a", to: "b", cycle: null },
]

test("paridade RULE D: as duas cópias de testingEntryOf decidem o mesmo corpus", () => {
  const shipped = shippedCopy()
  for (const { from, specifier, entry } of SPECIFIER_CORPUS) {
    assert.equal(
      testingEntryOf(from, specifier),
      entry,
      `catalog-lint.mjs divergiu da regra em ${specifier}`
    )
    assert.equal(
      shipped.testingEntryOf(from, specifier),
      entry,
      `module-boundaries.spec.ts divergiu da regra em ${specifier}`
    )
  }
})

test("paridade RULE D: as duas cópias de cycleThrough decidem o mesmo corpus", () => {
  const shipped = shippedCopy()
  for (const { graph, from, to, cycle } of CYCLE_CORPUS) {
    assert.deepStrictEqual(
      cycleThrough(new Map(graph), from, to),
      cycle,
      `catalog-lint.mjs divergiu da regra em ${from} -> ${to}`
    )
    assert.deepStrictEqual(
      shipped.cycleThrough(new Map(graph), from, to),
      cycle,
      `module-boundaries.spec.ts divergiu da regra em ${from} -> ${to}`
    )
  }
})
