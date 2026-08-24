import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
  findExcludedImports,
  parseExcludeList,
} from "../lib/copier-exclude.mjs"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

test("parseExcludeList lê a lista _exclude real de copier.yml, nunca uma cópia hard-coded", () => {
  const excludeList = parseExcludeList(
    readFileSync(path.join(REPO_ROOT, "copier.yml"), "utf8")
  )
  // Se este teste seguisse hard-coded, mudar o copier.yml sem tocar o teste não o quebraria —
  // a asserção contra o arquivo real garante que ele lê o conteúdo de verdade.
  assert.ok(excludeList.includes("scripts/platform/lib/lint.mjs"))
  assert.ok(excludeList.includes("scripts/platform/__tests__"))
})

test("findExcludedImports falha numa injeção deliberada de import de lib/lint.mjs a partir de cli.mjs", () => {
  const root = mkdtempSync(path.join(tmpdir(), "excluded-imports-"))
  mkdirSync(path.join(root, "scripts", "platform", "lib"), { recursive: true })
  writeFileSync(
    path.join(root, "scripts", "platform", "cli.mjs"),
    'import { discoverEntries } from "./lib/lint.mjs";\n'
  )
  writeFileSync(
    path.join(root, "scripts", "platform", "lib", "lint.mjs"),
    "export function discoverEntries() {}\n"
  )
  const excludeList = ["scripts/platform/lib/lint.mjs"]

  const offenders = findExcludedImports({ repoRoot: root, excludeList })

  assert.deepEqual(offenders, [
    {
      file: "scripts/platform/cli.mjs",
      specifier: "./lib/lint.mjs",
      resolved: "scripts/platform/lib/lint.mjs",
    },
  ])
})

test("findExcludedImports não acusa nada sob scripts/** na HEAD real, depois de T1", () => {
  const excludeList = parseExcludeList(
    readFileSync(path.join(REPO_ROOT, "copier.yml"), "utf8")
  )
  const offenders = findExcludedImports({ repoRoot: REPO_ROOT, excludeList })
  assert.deepEqual(offenders, [])
})
