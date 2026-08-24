import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { isMain } from "../lib/is-main.mjs"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")
const IS_MAIN_PATH = path.join(
  REPO_ROOT,
  "scripts",
  "platform",
  "lib",
  "is-main.mjs"
)
const RAW_GUARD_RE = /import\.meta\.url === `file:\/\//

function walkScriptFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkScriptFiles(full))
    else if (entry.name.endsWith(".mjs")) out.push(full)
  }
  return out
}

test("isMain compara pelo pathToFileURL do argv[1], não por concatenação de string", () => {
  const argv1 = "/repo/scripts/platform/cli.mjs"
  assert.equal(isMain(pathToFileURL(argv1).href, argv1), true)
  assert.equal(
    isMain(pathToFileURL(argv1).href, "/repo/scripts/platform/other.mjs"),
    false
  )
  assert.equal(
    isMain("file:///repo/scripts/platform/cli.mjs", undefined),
    false
  )
  // Caminho com espaço: file://${argv1} nunca bateria com o %20 que import.meta.url usa.
  const spacedArgv1 = "/repo/has space/cli.mjs"
  assert.equal(isMain(pathToFileURL(spacedArgv1).href, spacedArgv1), true)
})

test("nenhum arquivo sob scripts/** ainda compara import.meta.url por concatenação crua", () => {
  const offenders = walkScriptFiles(path.join(REPO_ROOT, "scripts")).filter(
    (file) => RAW_GUARD_RE.test(readFileSync(file, "utf8"))
  )
  assert.deepEqual(offenders, [])
})

test("um entrypoint real executa o corpo principal quando o próprio caminho do arquivo tem espaço", () => {
  // realpathSync: no macOS o tmpdir do sistema é um symlink (/var -> /private/var); sem
  // normalizar aqui, import.meta.url do probe resolveria o caminho real e nunca bateria com
  // o caminho simbólico que passamos como argv[1] — por um motivo alheio ao que este teste mede.
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "is-main-")))
  const spacedDir = path.join(dir, "has space in the path")
  mkdirSync(spacedDir, { recursive: true })
  const probePath = path.join(spacedDir, "probe.mjs")
  writeFileSync(
    probePath,
    [
      `import { isMain } from ${JSON.stringify(pathToFileURL(IS_MAIN_PATH).href)};`,
      "if (isMain(import.meta.url, process.argv[1])) {",
      '  process.stdout.write("ran\\n");',
      "  process.exit(0);",
      "}",
      "process.exit(3);",
    ].join("\n")
  )
  const result = spawnSync(process.execPath, [probePath], { encoding: "utf8" })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, "ran\n")
})
