import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

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
