import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"

const SRC_DIR = resolve(__dirname, "..")
const SCHEMA_FILE = join(__dirname, "schema.ts")
const PLATFORM_SCHEMA_FILE = join(__dirname, "platform-schema.ts")

// Reexport gerado pelo `pnpm platform module`: é por ele que as tabelas das
// entradas instaladas chegam ao agregador, então não aponta para um *.table.ts.
const GENERATED_REEXPORT = "./platform-schema"

const ALLOWLIST = new Set<string>([])

// Só reexport põe tabela no módulo que o drizzle-kit lê: um `import` de
// *.table.ts vizinho (declarar FK, por exemplo) não reexporta nada.
const REEXPORT = /^\s*export\s[^;]*?\bfrom\s+"([^"]+)"/gm

function toPosix(path: string): string {
  return path.split(sep).join("/")
}

function tableFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })
    .map(toPosix)
    .filter((entry) => entry.endsWith(".table.ts"))
}

function reexportsOf(source: string): string[] {
  return [...source.matchAll(REEXPORT)].map((match) => match[1] ?? "")
}

function reexportsIn(file: string): string[] {
  if (!existsSync(file)) return []
  return reexportsOf(readFileSync(file, "utf8"))
}

// Uma entrada do catálogo declara os seus reexports no manifesto e o arquivo
// gerado os repassa — e um deles pode ser um barril (`<módulo>.schema.ts`) que
// reexporta as tabelas em vez do *.table.ts direto. Por isso a varredura segue
// a cadeia inteira em vez de parar no primeiro salto.
function aggregatedFiles(): string[] {
  const seeds = [SCHEMA_FILE, PLATFORM_SCHEMA_FILE]
  const queue = [...seeds]
  const visited = new Set(seeds)
  const reached = new Set<string>()
  while (queue.length > 0) {
    const file = queue.pop()
    if (file === undefined) continue
    for (const specifier of reexportsIn(file)) {
      const target = resolve(dirname(file), `${specifier}.ts`)
      if (seeds.includes(target)) continue
      reached.add(toPosix(relative(SRC_DIR, target)))
      if (visited.has(target)) continue
      visited.add(target)
      queue.push(target)
    }
  }
  return [...reached]
}

describe("schema-completeness — todo *.table.ts entra no agregador do drizzle", () => {
  const onDisk = tableFiles()
  const aggregated = aggregatedFiles()

  it("varredura encontra tabelas e o agregador exporta algo (sanidade)", () => {
    expect(onDisk.length).toBeGreaterThan(0)
    expect(aggregated.length).toBeGreaterThan(0)
  })

  it("schema.ts reexporta o registry gerado das entradas instaladas", () => {
    expect(reexportsIn(SCHEMA_FILE)).toContain(GENERATED_REEXPORT)
  })

  it("nenhuma tabela do disco fora do agregador e da allowlist", () => {
    const missing = onDisk
      .filter((rel) => !ALLOWLIST.has(rel))
      .filter((rel) => !aggregated.includes(rel))
    expect(missing).toEqual([])
  })

  it("agregador não aponta para arquivo inexistente", () => {
    const dangling = aggregated.filter(
      (rel) => !existsSync(resolve(SRC_DIR, rel))
    )
    expect(dangling).toEqual([])
  })

  it("allowlist sem entrada morta (arquivo existe e segue fora do agregador)", () => {
    const stale = [...ALLOWLIST].filter(
      (rel) => !onDisk.includes(rel) || aggregated.includes(rel)
    )
    expect(stale).toEqual([])
  })

  describe("prova sintética do reexport", () => {
    it("segue reexport nomeado, estrela e barril de entrada", () => {
      expect(
        reexportsOf(
          [
            `export { outbox } from "../shared/kernel/outbox/outbox.table"`,
            `export * from "./platform-schema"`,
            `export * from "../modules/exemplo/infrastructure/tables/exemplo.schema"`,
          ].join("\n")
        )
      ).toEqual([
        "../shared/kernel/outbox/outbox.table",
        "./platform-schema",
        "../modules/exemplo/infrastructure/tables/exemplo.schema",
      ])
    })

    it("não conta `import` — importar tabela vizinha não a reexporta", () => {
      expect(
        reexportsOf(`import { exemplos } from "./exemplo.table"`)
      ).toEqual([])
    })
  })
})
