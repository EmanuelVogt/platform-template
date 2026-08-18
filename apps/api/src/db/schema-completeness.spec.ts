import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"

const SRC_DIR = resolve(__dirname, "..")
const SCHEMA_FILE = join(__dirname, "schema.ts")

// Exceção consciente: tabela fora do agregado do drizzle-kit de propósito.
// - audit-entry: audit.entries é criada e mantida pela migration manual 0054
//   (trigger genérica, append-only); fica fora do agregado para o generate não
//   tentar emiti-la — o runtime só lê.
const ALLOWLIST = new Set([
  "modules/audit/infrastructure/tables/audit-entry.table.ts",
])

function toPosix(path: string): string {
  return path.split(sep).join("/")
}

function tableFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .map(toPosix)
    .filter((entry) => entry.endsWith(".table.ts"))
}

function aggregatedFiles(): string[] {
  const source = readFileSync(SCHEMA_FILE, "utf8")
  const specifiers = [...source.matchAll(/from "(.+)"/g)].map(
    (match) => match[1] ?? ""
  )
  return [
    ...new Set(
      specifiers.map((specifier) =>
        toPosix(relative(SRC_DIR, resolve(__dirname, `${specifier}.ts`)))
      )
    ),
  ]
}

describe("schema-completeness — todo *.table.ts entra no agregador do drizzle", () => {
  const onDisk = tableFiles()
  const aggregated = aggregatedFiles()

  it("varredura encontra tabelas e o agregador exporta algo (sanidade)", () => {
    expect(onDisk.length).toBeGreaterThan(0)
    expect(aggregated.length).toBeGreaterThan(0)
  })

  it("nenhuma tabela do disco fora do agregador e da allowlist", () => {
    const missing = onDisk
      .filter((rel) => !ALLOWLIST.has(rel))
      .filter((rel) => !aggregated.includes(rel))
    expect(missing).toEqual([])
  })

  it("agregador não aponta para arquivo inexistente", () => {
    const dangling = aggregated.filter((rel) => !onDisk.includes(rel))
    expect(dangling).toEqual([])
  })

  it("allowlist sem entrada morta (arquivo existe e segue fora do agregador)", () => {
    const stale = [...ALLOWLIST].filter(
      (rel) => !onDisk.includes(rel) || aggregated.includes(rel)
    )
    expect(stale).toEqual([])
  })
})
