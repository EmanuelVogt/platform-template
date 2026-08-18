import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const MODULES_DIR = join(__dirname, "..", "..", "..", "modules")

// Namespaces herdados do contrato público de erro (o `type` RFC 7807 é URL
// publicada): renomear para o nome da pasta seria breaking silencioso para
// qualquer consumidor que compare a URL inteira.
const NAMESPACE_ALLOWLIST = new Map([["identity", "auth"]])

const TYPE_BASE_RE = /const TYPE_BASE = ["']([^"']+)["']/

type ModuleErrorsFile = { module: string; content: string }

function moduleErrorsFiles(): ModuleErrorsFile[] {
  return readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      module: entry.name,
      path: join(MODULES_DIR, entry.name, "domain", "errors.ts"),
    }))
    .filter(({ path }) => existsSync(path))
    .map(({ module, path }) => ({
      module,
      content: readFileSync(path, "utf8"),
    }))
}

describe("error-namespace — TYPE_BASE segue o nome do módulo e o 403 mora no kernel", () => {
  const files = moduleErrorsFiles()

  it("varredura encontra errors.ts de módulo (sanidade do glob)", () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it("nenhum TYPE_BASE fora de https://errors.example.com/<módulo>, allowlist à parte", () => {
    const offenders = files
      .map(({ module, content }) => {
        const namespace = NAMESPACE_ALLOWLIST.get(module) ?? module
        const expected = `https://errors.example.com/${namespace}`
        const actual = TYPE_BASE_RE.exec(content)?.[1] ?? "TYPE_BASE ausente"
        return actual === expected ? null : `${module}: ${actual}`
      })
      .filter((offender): offender is string => offender !== null)
    expect(offenders).toEqual([])
  })

  it("nenhum módulo declara class ForbiddenError (o 403 tem casa única no kernel)", () => {
    const offenders = files
      .filter(({ content }) => content.includes("class ForbiddenError"))
      .map(({ module }) => module)
    expect(offenders).toEqual([])
  })

  it("allowlist sem entrada morta (módulo tem errors.ts e o namespace diverge da pasta)", () => {
    const modules = new Set(files.map(({ module }) => module))
    const stale = [...NAMESPACE_ALLOWLIST.entries()]
      .filter(
        ([module, namespace]) => !modules.has(module) || namespace === module
      )
      .map(([module]) => module)
    expect(stale).toEqual([])
  })
})
