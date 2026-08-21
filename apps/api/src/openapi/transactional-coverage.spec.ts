import { readdirSync, readFileSync } from "node:fs"
import { join, sep } from "node:path"

const MODULES_DIR = join(__dirname, "..", "modules")

// Exceções conscientes: use cases que legitimamente não abrem tx própria. Cada
// entrada do catálogo carrega as suas na própria cópia deste guard.
const ALLOWLIST = new Set<string>([])


// Não aceita `.run(` genérico de propósito: `ctx.run(`/`als.run(` não provam
// transação nenhuma. Nenhum use case depende dessa fresta hoje — ela é um
// buraco aberto esperando alguém pisar, não uma isenção em uso.
// `@NonTransactional("motivo")` é a isenção que a entrada declara no próprio
// use case — o kernel não pode listar caminho de módulo na allowlist acima. Só
// vale com motivo literal: `@NonTransactional()` continua reprovando.
const TX_MARKER =
  /@Transactional\(|@ReadOnly\(|@NonTransactional\(\s*"[^"]+"\s*\)|txManager\.run\(|txm\.run\(/

function useCaseFiles(): string[] {
  return readdirSync(MODULES_DIR, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.split(sep).join("/"))
    .filter(
      (entry) =>
        entry.endsWith(".use-case.ts") && entry.includes("/application/")
    )
}

function hasTxMarker(relPath: string): boolean {
  return TX_MARKER.test(
    readFileSync(join(MODULES_DIR, relPath), "utf8")
  )
}

describe("transactional-coverage — todo use case declara participação em tx", () => {
  const files = useCaseFiles()

  it("nenhum use case fora da allowlist sem @Transactional/@ReadOnly/txm.run", () => {
    const offenders = files
      .filter((rel) => !ALLOWLIST.has(rel))
      .filter((rel) => !hasTxMarker(rel))
    expect(offenders).toEqual([])
  })

  it("allowlist sem entrada morta (arquivo existe e segue sem marcador)", () => {
    const stale = [...ALLOWLIST].filter(
      (rel) => !files.includes(rel) || hasTxMarker(rel)
    )
    expect(stale).toEqual([])
  })

  // Nenhum use case do repositório depende hoje da fresta do `.run(` genérico,
  // então a varredura contra os dados reais passaria mesmo com o marcador
  // frouxo. São estes casos sintéticos que provam o estreitamento.
  describe("prova sintética do marcador", () => {
    it("recusa `.run(` genérico como prova de transação", () => {
      expect(TX_MARKER.test("await this.ctx.run(store, () => fn())")).toBe(false)
      expect(TX_MARKER.test("await als.run(store, fn)")).toBe(false)
      expect(TX_MARKER.test("await engine.run(input)")).toBe(false)
    })

    it("aceita os quatro marcadores que provam transação", () => {
      expect(TX_MARKER.test("  @Transactional()")).toBe(true)
      expect(TX_MARKER.test("  @ReadOnly()")).toBe(true)
      expect(TX_MARKER.test("await this.txManager.run(() => fn())")).toBe(true)
      expect(TX_MARKER.test("await this.txm.run(() => fn())")).toBe(true)
    })

    it("aceita @NonTransactional com motivo e recusa a isenção muda", () => {
      expect(
        TX_MARKER.test('  @NonTransactional("io externo: stream do storage")')
      ).toBe(true)
      expect(TX_MARKER.test("  @NonTransactional()")).toBe(false)
      expect(TX_MARKER.test('  @NonTransactional("")')).toBe(false)
    })

    it("arquivo sem marcador nenhum segue reprovando", () => {
      expect(TX_MARKER.test("export class FooUseCase { async execute() {} }")).toBe(
        false
      )
    })
  })
})
