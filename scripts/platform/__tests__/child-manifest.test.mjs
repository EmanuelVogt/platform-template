import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { parse } from "yaml"

// Scripts da raiz que dependem de `catalog/`, que `copier.yml` não copia. O
// manifest vai literal para o filho e o `_task` de poda os remove de lá.
const TEMPLATE_ONLY_SCRIPTS = [
  "catalog:check",
  "catalog:lint",
  "catalog:typecheck",
  "template:smoke",
  "test:scripts",
]

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8")
}

const manifest = JSON.parse(read("../../../package.json"))
const tasks = parse(read("../../../copier.yml"))._tasks ?? []
const pruneTask = tasks.find(
  (task) =>
    typeof task?.command === "string" && task.command.includes("package.json")
)

test("copier prunes the child manifest before installing anything", () => {
  assert.ok(
    pruneTask,
    "copier.yml precisa de um _task que ajuste o package.json do filho"
  )
  assert.equal(
    tasks.indexOf(pruneTask),
    0,
    "a poda tem que rodar antes do pnpm install"
  )
  assert.match(pruneTask.command, /p\.name='\{\{ project_slug \}\}'/)
})

test("the prune task removes every template-only script", () => {
  for (const name of TEMPLATE_ONLY_SCRIPTS) {
    assert.ok(
      name in manifest.scripts,
      `${name} deveria existir em package.json`
    )
    assert.ok(
      pruneTask.command.includes(`'${name}'`),
      `o _task de poda não remove ${name}`
    )
  }
})

test("no template-only script escapes the prune list", () => {
  for (const [name, command] of Object.entries(manifest.scripts)) {
    if (!/catalog|template-smoke|__tests__/.test(command)) continue
    assert.ok(
      TEMPLATE_ONLY_SCRIPTS.includes(name),
      `"${name}" depende do catálogo e não está na lista de poda`
    )
  }
})
