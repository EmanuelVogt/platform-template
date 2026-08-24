import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import {
  computePending,
  loadAdvisories,
  parseAdvisory,
} from "../lib/advisories.mjs"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")
const REAL_ADVISORIES_DIR = path.join(REPO_ROOT, "docs", "advisories")

function advisoryMd(overrides = {}) {
  const fields = {
    id: "ADV-20260901-01",
    kind: "security",
    module: "identity/single-tenant",
    affects: ">=1.0.0 <2.0.0",
    severity: "high",
    detect: "pnpm platform advisory detect ADV-20260901-01",
    fix: "resumo + link para CHANGELOG",
    parity: "apps/api/src/modules/identity/__parity__/sessions.parity.spec.ts",
    ...overrides,
  }
  const frontmatter = Object.entries(fields)
    .map(([key, value]) => `${key}: "${value}"`)
    .join("\n")
  return `---\n${frontmatter}\n---\nContexto, impacto e passos em pt-BR.\n`
}

function lockWith(modules) {
  return { catalog: { source: "gh:example/template", ref: "v1.0.0" }, modules }
}

test("CAT-03: um módulo em 2.0.0 (versão colidida) instalado a partir de um catalogRef pré-remediação fica pendente", () => {
  const advisory = parseAdvisory(advisoryMd())
  const lock = lockWith({
    identity: {
      variant: "single-tenant",
      version: "2.0.0",
      installedAt: "2026-08-19T00:00:00.000Z",
      catalogRef: "gh:example/platform-template#v1.0.0",
    },
  })
  const result = computePending(lock, [advisory], [])
  assert.deepEqual(result.pending, [
    {
      id: "ADV-20260901-01",
      kind: "security",
      severity: "high",
      module: "identity/single-tenant",
    },
  ])
})

test("CAT-03: mesma versão colidida (2.0.0), mas catalogRef pós-remediação — nem version nem catalogRef batem, não fica pendente", () => {
  const advisory = parseAdvisory(advisoryMd())
  const lock = lockWith({
    identity: {
      variant: "single-tenant",
      version: "2.0.0",
      installedAt: "2026-08-19T00:00:00.000Z",
      catalogRef: "gh:example/platform-template#v2.1.0",
    },
  })
  const result = computePending(lock, [advisory], [])
  assert.deepEqual(result.pending, [])
})

test("CAT-03: quando catalogRef não ajuda (ausente, ou presente mas não semver-parseável como um sha bruto), a decisão cai só na version — sem derrubar a checagem", () => {
  const withoutCatalogRef = lockWith({
    identity: {
      variant: "single-tenant",
      version: "1.5.0",
      installedAt: "2026-08-19T00:00:00.000Z",
    },
  })
  const withUnparseableCatalogRef = lockWith({
    identity: {
      variant: "single-tenant",
      version: "2.0.0",
      installedAt: "2026-08-19T00:00:00.000Z",
      catalogRef: "gh:example/platform-template#a1b2c3d",
    },
  })
  const advisory = parseAdvisory(advisoryMd())

  assert.deepEqual(computePending(withoutCatalogRef, [advisory], []).pending, [
    {
      id: "ADV-20260901-01",
      kind: "security",
      severity: "high",
      module: "identity/single-tenant",
    },
  ])
  assert.doesNotThrow(() =>
    computePending(withUnparseableCatalogRef, [advisory], [])
  )
  assert.deepEqual(
    computePending(withUnparseableCatalogRef, [advisory], []).pending,
    []
  )
})

test("CAT-03: variant instalada diferente da exigida continua descartando antes de consultar o catalogRef", () => {
  const advisory = parseAdvisory(
    advisoryMd({ module: "identity/single-tenant" })
  )
  const lock = lockWith({
    identity: {
      variant: "multi-tenant",
      version: "2.0.0",
      installedAt: "2026-08-19T00:00:00.000Z",
      catalogRef: "gh:example/platform-template#v1.0.0",
    },
  })
  const result = computePending(lock, [advisory], [])
  assert.deepEqual(result.pending, [])
})

test("CAT-03/AC3: um filho com os cinco módulos reais em 2.0.0, instalados a partir do ref pré-remediação, é relatado afetado por ADV-20260822-01..05", () => {
  const advisories = loadAdvisories(REAL_ADVISORIES_DIR).filter((advisory) =>
    advisory.id.startsWith("ADV-20260822-")
  )
  assert.equal(advisories.length, 5)

  const preRemediation = {
    variant: undefined,
    version: "2.0.0",
    installedAt: "2026-08-19T00:00:00.000Z",
    catalogRef: "gh:example/platform-template#v1.0.0",
  }
  const lock = lockWith({
    identity: { ...preRemediation, variant: "single-tenant" },
    attachment: { ...preRemediation },
    notification: { ...preRemediation },
    audit: { ...preRemediation },
    tag: { ...preRemediation },
  })

  const result = computePending(lock, advisories, [])
  assert.deepEqual(result.pending.map((advisory) => advisory.id).sort(), [
    "ADV-20260822-01",
    "ADV-20260822-02",
    "ADV-20260822-03",
    "ADV-20260822-04",
    "ADV-20260822-05",
  ])
})
