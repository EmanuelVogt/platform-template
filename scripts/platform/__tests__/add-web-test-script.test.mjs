import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const ADD_SOURCE_PATH = path.join(TESTS_DIR, "../lib/commands/add.mjs")

test("passo api-tests do add.mjs roda o pacote da entrada via vitest --project api", () => {
  const addSource = readFileSync(ADD_SOURCE_PATH, "utf8")
  const match = addSource.match(
    /\["vitest",\s*"run",\s*"--project",\s*"api",\s*`apps\/api\/src\/modules\/\$\{name\}`\]/
  )
  assert.ok(
    match,
    "esperava encontrar pnpm vitest run --project api apps/api/src/modules/<name> em add.mjs"
  )
})

test("passo web-tests do add.mjs roda vitest --project web no webRootFor do módulo", () => {
  const addSource = readFileSync(ADD_SOURCE_PATH, "utf8")
  const match = addSource.match(
    /\[\s*"vitest",\s*"run",\s*"--project",\s*"web",\s*webRootFor\(name,\s*options\["web-root"\]\),?\s*\]/
  )
  assert.ok(
    match,
    "esperava encontrar pnpm vitest run --project web <webRootFor(name)> em add.mjs"
  )
})
