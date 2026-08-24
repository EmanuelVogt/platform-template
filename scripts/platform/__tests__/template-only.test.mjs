import assert from "node:assert/strict"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { TEMPLATE_ONLY_FILES, removeTemplateOnlyFiles } from "../lib/apply.mjs"

function makeChild() {
  const child = mkdtempSync(path.join(tmpdir(), "template-only-child-"))
  for (const relPath of TEMPLATE_ONLY_FILES) {
    const filePath = path.join(child, relPath)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, "describe('KRN-01', () => {})\n", "utf8")
  }
  return child
}

test("a lista de arquivos só-do-template cobre o guard do KRN-01 e o contrato OpenAPI", () => {
  assert.ok(TEMPLATE_ONLY_FILES.length > 0)
  assert.ok(
    TEMPLATE_ONLY_FILES.includes(
      "apps/api/src/modules/template-kernel-only.spec.ts"
    )
  )
  assert.ok(
    TEMPLATE_ONLY_FILES.includes("apps/api/test/openapi-contract.e2e-spec.ts")
  )
  assert.ok(
    TEMPLATE_ONLY_FILES.includes(
      "apps/api/test/__snapshots__/openapi-contract.e2e-spec.ts.snap"
    )
  )
})

test("removeTemplateOnlyFiles apaga cada arquivo e devolve o que apagou", () => {
  const child = makeChild()

  const removed = removeTemplateOnlyFiles(child)

  assert.deepEqual(removed, [...TEMPLATE_ONLY_FILES])
  for (const relPath of TEMPLATE_ONLY_FILES) {
    assert.equal(existsSync(path.join(child, relPath)), false)
  }
})

test("removeTemplateOnlyFiles é idempotente: segunda passada não apaga nem lança", () => {
  const child = makeChild()

  removeTemplateOnlyFiles(child)
  const second = removeTemplateOnlyFiles(child)

  assert.deepEqual(second, [])
})

test("removeTemplateOnlyFiles tolera arquivo já removido (produto pode ter apagado antes)", () => {
  const child = makeChild()
  const alreadyGone =
    "apps/api/test/__snapshots__/openapi-contract.e2e-spec.ts.snap"
  rmSync(path.join(child, alreadyGone))

  const removed = removeTemplateOnlyFiles(child)

  assert.deepEqual(
    removed,
    TEMPLATE_ONLY_FILES.filter((relPath) => relPath !== alreadyGone)
  )
  for (const relPath of TEMPLATE_ONLY_FILES) {
    assert.equal(existsSync(path.join(child, relPath)), false)
  }
})

test("removeTemplateOnlyFiles não toca em vizinho do mesmo diretório", () => {
  const child = makeChild()
  const neighbour = path.join(
    child,
    "apps/api/src/modules/module-boundaries.spec.ts"
  )
  writeFileSync(neighbour, "describe('RULE A', () => {})\n", "utf8")

  removeTemplateOnlyFiles(child)

  assert.equal(existsSync(neighbour), true)
})
