import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { listDirectories } from "../../test/unit/source-survey"

const MODULES_DIR = join(__dirname, "..", "..", "..", "modules")

const TYPE_BASE_RE = /const TYPE_BASE = ["']([^"']+)["']/

type ModuleErrorsFile = { module: string; content: string }

function moduleErrorsFiles(): ModuleErrorsFile[] {
  return listDirectories(MODULES_DIR)
    .map((module) => ({
      module,
      path: join(MODULES_DIR, module, "domain", "errors.ts"),
    }))
    .filter(({ path }) => existsSync(path))
    .map(({ module, path }) => ({
      module,
      content: readFileSync(path, "utf8"),
    }))
}

function namespaceOffenderOf({ module, content }: ModuleErrorsFile): string | null {
  const expected = `https://errors.example.com/${module}`
  const actual = TYPE_BASE_RE.exec(content)?.[1] ?? "TYPE_BASE ausente"
  return actual === expected ? null : `${module}: ${actual}`
}

describe("error-namespace — TYPE_BASE segue o nome do módulo e o 403 mora no kernel", () => {
  const files = moduleErrorsFiles()

  it("nenhum TYPE_BASE fora de https://errors.example.com/<módulo>", () => {
    const offenders = files
      .map(namespaceOffenderOf)
      .filter((offender): offender is string => offender !== null)
    expect(offenders).toEqual([])
  })

  it("reprova TYPE_BASE que não casa com a pasta do módulo", () => {
    expect(
      namespaceOffenderOf({
        module: "agenda",
        content: `const TYPE_BASE = "https://errors.example.com/booking"`,
      })
    ).toBe("agenda: https://errors.example.com/booking")
    expect(
      namespaceOffenderOf({
        module: "agenda",
        content: `const TYPE_BASE = "https://errors.example.com/agenda"`,
      })
    ).toBeNull()
    expect(
      namespaceOffenderOf({ module: "agenda", content: "export {}" })
    ).toBe("agenda: TYPE_BASE ausente")
  })

  it("nenhum módulo declara class ForbiddenError (o 403 tem casa única no kernel)", () => {
    const offenders = files
      .filter(({ content }) => content.includes("class ForbiddenError"))
      .map(({ module }) => module)
    expect(offenders).toEqual([])
  })
})
