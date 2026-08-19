import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"

const SRC_DIR = resolve(__dirname, "..")
const SCHEMA_FILE = join(__dirname, "schema.ts")
const PLATFORM_SCHEMA_FILE = join(__dirname, "platform-schema.ts")

// Reexport gerado pelo `pnpm platform module`: é por ele que as tabelas das
// entradas instaladas chegam ao agregador, então não aponta para um *.table.ts.
const GENERATED_REEXPORT = "./platform-schema"

const ALLOWLIST = new Set<string>([])

function toPosix(path: string): string {
  return path.split(sep).join("/")
}

function tableFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .map(toPosix)
    .filter((entry) => entry.endsWith(".table.ts"))
}

function specifiersIn(file: string): string[] {
  if (!existsSync(file)) return []
  const source = readFileSync(file, "utf8")
  return [...source.matchAll(/from "(.+)"/g)].map((match) => match[1] ?? "")
}

function aggregatedFiles(): string[] {
  const specifiers = [
    ...specifiersIn(SCHEMA_FILE),
    ...specifiersIn(PLATFORM_SCHEMA_FILE),
  ].filter((specifier) => specifier !== GENERATED_REEXPORT)
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

  it("schema.ts reexporta o registry gerado das entradas instaladas", () => {
    expect(specifiersIn(SCHEMA_FILE)).toContain(GENERATED_REEXPORT)
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
