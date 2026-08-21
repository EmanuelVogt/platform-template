import { readdirSync } from "node:fs"
import { sep } from "node:path"

const MODULES_DIR = __dirname

// KRN-01: o template distribui só o kernel. `src/modules/` nasce como ponto de
// montagem vazio e as entradas do catálogo entram por `pnpm platform module
// add`. Este é o único guard que afirma esse fato — os vizinhos
// (module-boundaries, transactional-coverage, error-namespace) valem com zero
// ou N entradas instaladas. O instalador apaga este arquivo na primeira
// instalação, quando o fato deixa de ser verdade no produto.
describe("template-kernel-only — o template sobe sem entrada instalada (KRN-01)", () => {
  it("src/modules não tem pasta de módulo", () => {
    const dirs = readdirSync(MODULES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
    expect(dirs).toEqual([])
  })

  it("src/modules não tem arquivo de produção — só os guards do próprio ponto de montagem", () => {
    const production = readdirSync(MODULES_DIR, {
      recursive: true,
      encoding: "utf8",
    })
      .map((entry) => entry.split(sep).join("/"))
      .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".spec.ts"))
    expect(production).toEqual([])
  })
})
