import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { STAGE_DIR, stagePlan } from "../catalog-stage.mjs"
import { listEntries } from "../lib/catalog-graph.mjs"
import { KERNEL_STAGE_PATHS } from "../lib/child-layout.mjs"

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const CATALOG_ROOT = path.join(REPO_ROOT, "catalog")

test("o staging cobre toda entrada descoberta em catalog/, sem lista escrita à mão", () => {
  const entries = listEntries(CATALOG_ROOT)
  const { copies } = stagePlan({ repoRoot: REPO_ROOT, entries })
  const apiCopies = copies.filter(
    (copy) => path.basename(copy.to) !== "__parity__"
  )
  assert.deepEqual(
    apiCopies.map((copy) => path.basename(copy.to)).sort(),
    entries.map((entry) => entry.name).sort()
  )
})

test("toda entrada com parity/ ganha um copy para __parity__, irmão de application/domain/infrastructure", () => {
  const entries = listEntries(CATALOG_ROOT)
  const { copies } = stagePlan({ repoRoot: REPO_ROOT, entries })
  const entriesWithParity = entries.filter((entry) =>
    existsSync(path.join(entry.dir, "parity"))
  )
  assert.ok(
    entriesWithParity.length > 0,
    "esperava >= 1 entrada com parity/ em catalog/ para este check fazer sentido"
  )
  for (const entry of entriesWithParity) {
    const parityCopy = copies.find(
      (copy) => copy.from === path.join(entry.dir, "parity")
    )
    assert.ok(
      parityCopy,
      `esperava copy de parity/ para a entrada ${entry.name}`
    )
    assert.equal(
      parityCopy.to,
      path.join(REPO_ROOT, STAGE_DIR, "src/modules", entry.name, "__parity__")
    )
  }
})

test("o staging liga todo caminho do kernel declarado, dentro de .catalog-stage", () => {
  const { links, stageRoot } = stagePlan({ repoRoot: REPO_ROOT, entries: [] })
  assert.equal(links.length, KERNEL_STAGE_PATHS.length)
  assert.equal(stageRoot, path.join(REPO_ROOT, STAGE_DIR))
  for (const link of links) {
    assert.ok(link.from.startsWith(path.join(REPO_ROOT, "apps/api")))
    assert.ok(link.to.startsWith(stageRoot))
  }
})

test("entrada sem pasta api/ não entra no staging", () => {
  const { copies } = stagePlan({
    repoRoot: REPO_ROOT,
    entries: [{ name: "fantasma", dir: path.join(CATALOG_ROOT, "nao-existe") }],
  })
  assert.deepEqual(copies, [])
})
