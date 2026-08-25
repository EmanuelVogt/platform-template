import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  canonicalKey,
  collectScanFiles,
  compareToBaseline,
  entriesOf,
  formatViolation,
  scanSource,
  type Baseline,
} from "./scan"
import { SEEDED } from "./violations.fixture"

const TEMPLATE_SPEC =
  "catalog/sample/api/application/create-sample.use-case.spec.ts"
const CHILD_SPEC =
  "apps/api/src/modules/sample/application/create-sample.use-case.spec.ts"
const CHILD_BARREL = "apps/api/src/modules/sample/testing/index.ts"
const TEMPLATE_BARREL = "catalog/sample/api/testing/index.ts"
const HARNESS = "apps/api/src/shared/test/e2e/app.ts"
const HARNESS_SPEC = "apps/api/src/shared/test/e2e/wait-for.spec.ts"

function rulesOf(file: string, source: string): string[] {
  return scanSource(file, source).map((violation) => violation.rule)
}

function fixtureTree(): string {
  const root = mkdtempSync(resolve(tmpdir(), "hygiene-scan-"))
  const write = (rel: string, source: string) => {
    const abs = resolve(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, source)
  }
  write("apps/api/src/modules/sample/testing/index.ts", "export const a = 1\n")
  write("apps/api/src/modules/sample/sample.spec.ts", "export const b = 1\n")
  write("apps/api/src/node_modules/pkg/index.ts", "export const c = 1\n")
  write("apps/api/src/dist/bundle.ts", "export const d = 1\n")
  write("apps/api/src/coverage/report.ts", "export const e = 1\n")
  write(
    "apps/api/.catalog-stage/src/modules/sample/sample.spec.ts",
    "const f = 1\n"
  )
  write("apps/api/src/modules/sample/README.md", "# sample\n")
  write("apps/api/src/shared/test/hygiene/scan.ts", "const g = 1\n")
  return root
}

describe("scan — a varredura de arquivos", () => {
  const root = fixtureTree()

  it("recolhe .ts do layout do produto e ignora node_modules, dist e coverage", () => {
    const files = collectScanFiles(root, ["apps/api/src"])
    expect(files).toEqual([
      "apps/api/src/modules/sample/sample.spec.ts",
      "apps/api/src/modules/sample/testing/index.ts",
    ])
  })

  it("ignora o próprio guard — ele nomeia cada token banido por definição", () => {
    const files = collectScanFiles(root, ["apps/api/src"])
    expect(files.filter((file) => file.includes("/hygiene/"))).toEqual([])
  })

  it("ignora apps/api/.catalog-stage/**", () => {
    const files = collectScanFiles(root, ["apps/api"])
    expect(files.filter((file) => file.includes(".catalog-stage"))).toEqual([])
  })

  it("devolve lista vazia para uma raiz que não existe (produto sem catalog/)", () => {
    expect(collectScanFiles(root, ["catalog"])).toEqual([])
  })
})

describe("scan — o barrel da entrada é lido nos dois layouts", () => {
  const literal = SEEDED.webOrigin

  it("o barrel do template não é reprovado", () => {
    expect(rulesOf(TEMPLATE_BARREL, literal)).toEqual([])
  })

  it("o barrel instalado no filho não é reprovado", () => {
    expect(rulesOf(CHILD_BARREL, literal)).toEqual([])
  })

  it("o mesmo literal num spec do filho é reprovado", () => {
    expect(rulesOf(CHILD_SPEC, literal)).toEqual(["no-harness-literal"])
  })
})

describe("scan — cada ban reprova a violação semeada e aceita a forma correta", () => {
  it("single-testing-module", () => {
    const source = SEEDED.testingModule
    expect(rulesOf(TEMPLATE_SPEC, source)).toEqual(["single-testing-module"])
    expect(rulesOf(HARNESS, source)).toEqual([])
  })

  it("no-local-helper", () => {
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.seedUserDefinition)).toEqual([
      "no-local-helper",
    ])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.waitForDefinition)).toEqual([
      "no-local-helper",
    ])
    expect(rulesOf(TEMPLATE_BARREL, SEEDED.waitForDefinition)).toEqual([])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.waitForImport)).toEqual([])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.waitForCall)).toEqual([])
  })

  it("no-harness-literal", () => {
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.pngLiteral)).toEqual([
      "no-harness-literal",
    ])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.passwordLiteral)).toEqual([
      "no-harness-literal",
    ])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.passwordConstant)).toEqual([
      "no-harness-literal",
    ])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.passwordHash)).toEqual([])
    expect(rulesOf(TEMPLATE_BARREL, SEEDED.passwordLiteral)).toEqual([])
  })

  it("pool-owned-by-harness", () => {
    const inside = SEEDED.poolInsideTest
    const outside = SEEDED.poolInBeforeAll
    expect(rulesOf(TEMPLATE_SPEC, inside)).toEqual(["pool-owned-by-harness"])
    expect(rulesOf(TEMPLATE_SPEC, outside)).toEqual([])
  })

  it("typed-deps", () => {
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.anyRecord)).toEqual(["typed-deps"])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.unknownRecord)).toEqual([])
  })

  it("no-unsafe-cast", () => {
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.unknownCast)).toEqual([
      "no-unsafe-cast",
    ])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.neverCast)).toEqual(["no-unsafe-cast"])
    expect(rulesOf(HARNESS, SEEDED.unknownCast)).toEqual([])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.typedMock)).toEqual([])
  })

  it("no-from-props", () => {
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.fromProps)).toEqual(["no-from-props"])
    expect(rulesOf(TEMPLATE_BARREL, SEEDED.fromPropsInBarrel)).toEqual([])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.makeEntity)).toEqual([])
  })

  it("no-container-in-int-spec", () => {
    const intSpec =
      "catalog/sample/api/infrastructure/sample.repository.int-spec.ts"
    const source = SEEDED.genericContainer
    expect(rulesOf(intSpec, source)).toEqual(["no-container-in-int-spec"])
    expect(rulesOf(TEMPLATE_SPEC, source)).toEqual([])
  })

  it("no-sleep-as-proof", () => {
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.sleepAsProof)).toEqual([
      "no-sleep-as-proof",
    ])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.handRolledPoll)).toEqual([
      "no-sleep-as-proof",
    ])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.forPoll)).toEqual([
      "no-sleep-as-proof",
    ])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.waitForCall)).toEqual([])
    expect(rulesOf(TEMPLATE_SPEC, SEEDED.awaitedIteration)).toEqual([])
    expect(rulesOf(HARNESS_SPEC, SEEDED.sleepAsProof)).toEqual([])
  })

  it("runner-setup-allowlist", () => {
    expect(rulesOf("apps/api/test/setup/app-factory.ts", "")).toEqual([
      "runner-setup-allowlist",
    ])
    expect(rulesOf("apps/api/test/setup/global-setup.ts", "")).toEqual([])
  })
})

describe("scan — a identidade de um arquivo é a mesma nos dois layouts", () => {
  it("o barrel da entrada tem uma chave só no template e no filho", () => {
    expect(canonicalKey(TEMPLATE_BARREL)).toBe("module:sample/testing/index.ts")
    expect(canonicalKey(CHILD_BARREL)).toBe("module:sample/testing/index.ts")
  })

  it("o spec da entrada tem uma chave só no template e no filho", () => {
    expect(canonicalKey(TEMPLATE_SPEC)).toBe(
      "module:sample/application/create-sample.use-case.spec.ts"
    )
    expect(canonicalKey(CHILD_SPEC)).toBe(
      "module:sample/application/create-sample.use-case.spec.ts"
    )
  })

  it("o parity cai onde a instalação o põe — __parity__/ no filho", () => {
    expect(
      canonicalKey("catalog/notification/parity/mailer.parity.spec.ts")
    ).toBe("module:notification/__parity__/mailer.parity.spec.ts")
    expect(
      canonicalKey(
        "apps/api/src/modules/notification/__parity__/mailer.parity.spec.ts"
      )
    ).toBe("module:notification/__parity__/mailer.parity.spec.ts")
  })

  it("a entrada com variante fica com o nome do módulo, sem a variante", () => {
    expect(
      canonicalKey("catalog/identity/single-tenant/api/testing/index.ts")
    ).toBe("module:identity/testing/index.ts")
  })

  it("o api/ interno da entrada não é confundido com a raiz api/", () => {
    expect(
      canonicalKey("catalog/attachment/api/api/attachment.controller.ts")
    ).toBe("module:attachment/api/attachment.controller.ts")
  })

  it("o kernel e o que só existe no template ficam com o próprio caminho", () => {
    expect(canonicalKey(HARNESS)).toBe(HARNESS)
    const webFile = "catalog/identity/single-tenant/web/core/session.types.ts"
    expect(canonicalKey(webFile)).toBe(webFile)
  })

  it("as entradas presentes saem da árvore, em qualquer layout", () => {
    expect([...entriesOf([TEMPLATE_BARREL, HARNESS])]).toEqual(["sample"])
    expect([...entriesOf([CHILD_BARREL, HARNESS])]).toEqual(["sample"])
    expect([...entriesOf([HARNESS])]).toEqual([])
  })
})

describe("scan — o relato e o contrato do baseline", () => {
  const source = SEEDED.testingModule
  const KEY = "module:sample/application/create-sample.use-case.spec.ts"
  const TEMPLATE_TREE = [TEMPLATE_SPEC, TEMPLATE_BARREL]
  const CHILD_TREE = [CHILD_SPEC, CHILD_BARREL]

  it("cada violação é relatada como rule · file:line · snippet", () => {
    const [violation] = scanSource(TEMPLATE_SPEC, `\n${source}`)
    expect(formatViolation(violation!)).toBe(
      `single-testing-module · ${TEMPLATE_SPEC}:2 · ${source}`
    )
  })

  it("uma violação acima do registrado reprova (GA-9)", () => {
    const violations = scanSource(TEMPLATE_SPEC, `${source}\n${source}`)
    const baseline: Baseline = { [KEY]: { "single-testing-module": 1 } }
    const { unrecorded, stale } = compareToBaseline(
      "single-testing-module",
      violations,
      baseline,
      TEMPLATE_TREE
    )
    expect(unrecorded).toHaveLength(2)
    expect(stale).toEqual([])
  })

  it("um registro que já não corresponde reprova (o baseline só encolhe)", () => {
    const baseline: Baseline = { [KEY]: { "single-testing-module": 3 } }
    const { unrecorded, stale } = compareToBaseline(
      "single-testing-module",
      scanSource(TEMPLATE_SPEC, source),
      baseline,
      TEMPLATE_TREE
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([
      `single-testing-module · ${KEY} · baseline registra 3, a árvore tem 1 — rode o gerador do baseline`,
    ])
  })

  it("a violação registrada exatamente passa", () => {
    const baseline: Baseline = { [KEY]: { "single-testing-module": 1 } }
    const { unrecorded, stale } = compareToBaseline(
      "single-testing-module",
      scanSource(TEMPLATE_SPEC, source),
      baseline,
      TEMPLATE_TREE
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("o registro feito no template vale para o mesmo arquivo instalado no filho", () => {
    const baseline: Baseline = { [KEY]: { "single-testing-module": 1 } }
    const { unrecorded, stale } = compareToBaseline(
      "single-testing-module",
      scanSource(CHILD_SPEC, source),
      baseline,
      CHILD_TREE
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("uma violação nova no filho reprova mesmo sem catalog/ na árvore", () => {
    const { unrecorded } = compareToBaseline(
      "single-testing-module",
      scanSource(CHILD_SPEC, source),
      {},
      CHILD_TREE
    )
    expect(unrecorded).toEqual([
      `single-testing-module · ${CHILD_SPEC}:1 · ${source}`,
    ])
  })

  it("o registro de uma entrada instalada exige casamento exato", () => {
    const baseline: Baseline = { [KEY]: { "single-testing-module": 1 } }
    const { stale } = compareToBaseline(
      "single-testing-module",
      [],
      baseline,
      CHILD_TREE
    )
    expect(stale).toEqual([
      `single-testing-module · ${KEY} · baseline registra 1, a árvore tem 0 — rode o gerador do baseline`,
    ])
  })

  it("o registro de uma entrada que esta árvore não instalou é inerte", () => {
    const baseline: Baseline = { [KEY]: { "single-testing-module": 1 } }
    const { unrecorded, stale } = compareToBaseline(
      "single-testing-module",
      [],
      baseline,
      [HARNESS]
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })

  it("o registro do kernel é cobrado mesmo num filho sem entrada alguma", () => {
    const baseline: Baseline = { [HARNESS]: { "single-testing-module": 1 } }
    const { stale } = compareToBaseline("single-testing-module", [], baseline, [
      HARNESS,
    ])
    expect(stale).toEqual([
      `single-testing-module · ${HARNESS} · baseline registra 1, a árvore tem 0 — rode o gerador do baseline`,
    ])
  })

  it("o registro de um arquivo só-do-template é inerte no filho e cobrado no template", () => {
    const webFile = "catalog/identity/single-tenant/web/core/session.types.ts"
    const baseline: Baseline = { [webFile]: { "single-testing-module": 1 } }
    expect(
      compareToBaseline("single-testing-module", [], baseline, [CHILD_SPEC])
        .stale
    ).toEqual([])
    expect(
      compareToBaseline("single-testing-module", [], baseline, [TEMPLATE_SPEC])
        .stale
    ).toEqual([
      `single-testing-module · ${webFile} · baseline registra 1, a árvore tem 0 — rode o gerador do baseline`,
    ])
  })
})
