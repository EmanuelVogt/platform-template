import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  collectScanFiles,
  compareToBaseline,
  formatViolation,
  scanSource,
  type Baseline,
} from "./scan"
import { SEEDED } from "./violations.fixture"

const TEMPLATE_SPEC = "catalog/tag/api/application/create-tag.use-case.spec.ts"
const CHILD_SPEC =
  "apps/api/src/modules/tag/application/create-tag.use-case.spec.ts"
const CHILD_BARREL = "apps/api/src/modules/tag/testing/index.ts"
const TEMPLATE_BARREL = "catalog/tag/api/testing/index.ts"
const HARNESS = "apps/api/src/shared/test/e2e/app.ts"

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
  write("apps/api/src/modules/tag/testing/index.ts", "export const a = 1\n")
  write("apps/api/src/modules/tag/tag.spec.ts", "export const b = 1\n")
  write("apps/api/src/node_modules/pkg/index.ts", "export const c = 1\n")
  write("apps/api/src/dist/bundle.ts", "export const d = 1\n")
  write("apps/api/src/coverage/report.ts", "export const e = 1\n")
  write("apps/api/.catalog-stage/src/modules/tag/tag.spec.ts", "const f = 1\n")
  write("apps/api/src/modules/tag/README.md", "# tag\n")
  write("apps/api/src/shared/test/hygiene/scan.ts", "const g = 1\n")
  return root
}

describe("scan — a varredura de arquivos", () => {
  const root = fixtureTree()

  it("recolhe .ts do layout do produto e ignora node_modules, dist e coverage", () => {
    const files = collectScanFiles(root, ["apps/api/src"])
    expect(files).toEqual([
      "apps/api/src/modules/tag/tag.spec.ts",
      "apps/api/src/modules/tag/testing/index.ts",
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
    const intSpec = "catalog/tag/api/infrastructure/tag.repository.int-spec.ts"
    const source = SEEDED.genericContainer
    expect(rulesOf(intSpec, source)).toEqual(["no-container-in-int-spec"])
    expect(rulesOf(TEMPLATE_SPEC, source)).toEqual([])
  })

  it("runner-setup-allowlist", () => {
    expect(rulesOf("apps/api/test/setup/app-factory.ts", "")).toEqual([
      "runner-setup-allowlist",
    ])
    expect(rulesOf("apps/api/test/setup/global-setup.ts", "")).toEqual([])
  })
})

describe("scan — o relato e o contrato do baseline", () => {
  const source = SEEDED.testingModule

  it("cada violação é relatada como rule · file:line · snippet", () => {
    const [violation] = scanSource(TEMPLATE_SPEC, `\n${source}`)
    expect(formatViolation(violation!)).toBe(
      `single-testing-module · ${TEMPLATE_SPEC}:2 · ${source}`
    )
  })

  it("uma violação acima do registrado reprova (GA-9)", () => {
    const violations = scanSource(TEMPLATE_SPEC, `${source}\n${source}`)
    const baseline: Baseline = {
      [TEMPLATE_SPEC]: { "single-testing-module": 1 },
    }
    const { unrecorded, stale } = compareToBaseline(
      "single-testing-module",
      violations,
      baseline
    )
    expect(unrecorded).toHaveLength(2)
    expect(stale).toEqual([])
  })

  it("um registro que já não corresponde reprova (o baseline só encolhe)", () => {
    const baseline: Baseline = {
      [TEMPLATE_SPEC]: { "single-testing-module": 3 },
    }
    const { unrecorded, stale } = compareToBaseline(
      "single-testing-module",
      scanSource(TEMPLATE_SPEC, source),
      baseline
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([
      `single-testing-module · ${TEMPLATE_SPEC} · baseline registra 3, a árvore tem 1 — rode o gerador do baseline`,
    ])
  })

  it("a violação registrada exatamente passa", () => {
    const baseline: Baseline = {
      [TEMPLATE_SPEC]: { "single-testing-module": 1 },
    }
    const { unrecorded, stale } = compareToBaseline(
      "single-testing-module",
      scanSource(TEMPLATE_SPEC, source),
      baseline
    )
    expect(unrecorded).toEqual([])
    expect(stale).toEqual([])
  })
})
