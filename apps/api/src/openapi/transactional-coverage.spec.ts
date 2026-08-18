import { readdirSync, readFileSync } from "node:fs"
import { join, sep } from "node:path"

const MODULES_DIR = join(__dirname, "..", "modules")

// Exceções conscientes: use cases que legitimamente não abrem tx própria.
// - upload-access-link-avatar: delega a persistência ao AttachmentFacade (tx dele).
// - notification list-notifications: leitura pura sem @ReadOnly
//   (aceito por ora; retrofit de @ReadOnly seria refactor de escopo próprio).
// - get-attachment-for-download: busca o objeto no storage (IO externo) antes de
//   devolver o stream — IO externo nunca dentro de @Transactional (Regra de Ouro
//   17 do back-arch). Tx aqui ainda somava um segundo efeito: a trilha de acesso
//   commita na conexão raiz, então cada download segurava uma conexão e pedia
//   outra ao mesmo pool — DATABASE_POOL_MAX downloads simultâneos travavam o pool.
const ALLOWLIST = new Set([
  "identity/application/use-cases/upload-access-link-avatar/upload-access-link-avatar.use-case.ts",
  "notification/application/use-cases/list-notifications/list-notifications.use-case.ts",
  "attachment/application/use-cases/get-attachment-for-download/get-attachment-for-download.use-case.ts",
])


// Não aceita `.run(` genérico de propósito: `ctx.run(`/`als.run(` não provam
// transação nenhuma. Nenhum use case depende dessa fresta hoje — ela é um
// buraco aberto esperando alguém pisar, não uma isenção em uso.
const TX_MARKER = /@Transactional\(|@ReadOnly\(|txManager\.run\(|txm\.run\(/

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

  it("varredura encontra use cases (sanidade do glob)", () => {
    expect(files.length).toBeGreaterThan(0)
  })

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

    it("arquivo sem marcador nenhum segue reprovando", () => {
      expect(TX_MARKER.test("export class FooUseCase { async execute() {} }")).toBe(
        false
      )
    })
  })
})
