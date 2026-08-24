import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { discoverEntries } from "../lib/lint.mjs"
import { readManifest } from "../lib/manifest.mjs"

const ROOT = path.dirname(
  path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
)
const CATALOG_ROOT = path.join(ROOT, "catalog")

// Arquivos que não representam um acoplamento de produção entre entradas:
// testes unitários e de integração ficam de fora; specs e2e continuam contando
// (AD-026 exige que mesmo um acoplamento só-de-e2e seja declarado em dependsOn).
function isScannableApiFile(filePath) {
  if (!filePath.endsWith(".ts")) return false
  if (filePath.endsWith(".spec.ts") || filePath.endsWith(".int-spec.ts"))
    return false
  return true
}

function listApiFiles(dir) {
  const files = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!existsSync(current)) continue
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === "testing") continue
        stack.push(full)
      } else if (entry.isFile() && isScannableApiFile(full)) {
        files.push(full)
      }
    }
  }
  return files
}

const IMPORT_FROM_RE =
  /(?:^|\s)(?:import|export)[^;\n]*?from\s+["']([^"']+)["']/g
const RELATIVE_ENTRY_RE = /^(?:\.\.\/)+([a-zA-Z0-9_-]+)\//
const MODULES_ENTRY_RE = /^modules\/([a-zA-Z0-9_-]+)\//

function findCrossEntryDeps(filePath, selfName, knownEntryNames) {
  const content = readFileSync(filePath, "utf8")
  const deps = new Set()
  for (const match of content.matchAll(IMPORT_FROM_RE)) {
    const importPath = match[1]
    const candidate =
      importPath.match(RELATIVE_ENTRY_RE)?.[1] ??
      importPath.match(MODULES_ENTRY_RE)?.[1]
    if (candidate && candidate !== selfName && knownEntryNames.has(candidate)) {
      deps.add(candidate)
    }
  }
  return deps
}

test("customMigrations de cada entrada real do catálogo é nome de arquivo puro e existe em migrations/custom/", () => {
  for (const dir of discoverEntries(CATALOG_ROOT)) {
    const manifest = readManifest(path.join(dir, "module.json"))
    for (const entry of manifest.customMigrations ?? []) {
      assert.ok(
        !entry.includes("/"),
        `${manifest.name}: customMigrations "${entry}" deve ser nome de arquivo puro, sem caminho`
      )
      const resolved = path.join(dir, "migrations/custom", entry)
      assert.ok(
        existsSync(resolved),
        `${manifest.name}: customMigrations "${entry}" não encontrado em ${resolved}`
      )
    }
  }
})

test("dependsOn de cada entrada real do catálogo é derivado dos imports que cruzam para outra entrada", () => {
  const entries = discoverEntries(CATALOG_ROOT).map((dir) => ({
    dir,
    manifest: readManifest(path.join(dir, "module.json")),
  }))
  const knownEntryNames = new Set(entries.map(({ manifest }) => manifest.name))

  for (const { dir, manifest } of entries) {
    const derived = new Set()
    for (const file of listApiFiles(path.join(dir, "api"))) {
      for (const dep of findCrossEntryDeps(
        file,
        manifest.name,
        knownEntryNames
      )) {
        derived.add(dep)
      }
    }
    const declared = new Set((manifest.dependsOn ?? []).map((dep) => dep.name))
    assert.deepEqual(
      [...derived].sort(),
      [...declared].sort(),
      `${manifest.name}: dependsOn declarado [${[...declared].sort().join(", ")}] diverge dos imports reais [${[...derived].sort().join(", ")}]`
    )
  }
})
