import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import {
  discoverEntries,
  extractContractHeadings,
  lintAdvisoryFrontmatter,
  lintAdvisoryModule,
  lintChangelogVersion,
  lintKernelRange,
  lintManifest,
  lintProductionTestingImports,
  lintReadmeHeadings,
  lintWebImports,
} from "../lib/lint.mjs"
import { readLatestChangelogVersion } from "../lib/kernel-version.mjs"
import { runLint } from "../catalog-lint.mjs"

const ROOT = path.dirname(
  path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
)
const CONTRACT_PATH = path.join(ROOT, "docs/platform/README-contract.md")
const CHANGELOG_PATH = path.join(ROOT, "docs/dev/template-changelog.md")
const FIXTURES_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/catalog"
)

const EXPECTED_CONTRACT_HEADINGS = [
  "## Contrato",
  "## Portas do kernel consumidas",
  "## Dados",
  "## Decisões",
  "## Paridade",
  "## Dependências",
  "## Parte web",
  "## Follow-ups absorvidos",
]

function readmeWith(headings) {
  return headings.map((heading) => `${heading}\n\nconteúdo.\n`).join("\n")
}

function advisoryMd(overrides = {}) {
  const fields = {
    id: "ADV-20260901-01",
    kind: "security",
    module: "identity/single-tenant",
    affects: ">=1.0.0 <1.2.0",
    severity: "high",
    detect: "pnpm platform advisory detect ADV-20260901-01",
    fix: "resumo + link para CHANGELOG",
    parity: "apps/api/src/modules/identity/__parity__/sessions.parity.spec.ts",
    ...overrides,
  }
  const frontmatter = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: "${value}"`)
    .join("\n")
  return `---\n${frontmatter}\n---\nContexto, impacto e passos em pt-BR.\n`
}

test("extractContractHeadings lê os 8 H2 do contrato real, na ordem definida em docs/platform/README-contract.md", () => {
  const headings = extractContractHeadings(readFileSync(CONTRACT_PATH, "utf8"))
  assert.deepEqual(headings, EXPECTED_CONTRACT_HEADINGS)
})

test("lintReadmeHeadings passa quando as 8 seções aparecem na ordem exata", () => {
  const errors = lintReadmeHeadings(
    readmeWith(EXPECTED_CONTRACT_HEADINGS),
    EXPECTED_CONTRACT_HEADINGS
  )
  assert.deepEqual(errors, [])
})

test("lintReadmeHeadings falha quando uma seção obrigatória está ausente (## Paridade)", () => {
  const withoutParidade = EXPECTED_CONTRACT_HEADINGS.filter(
    (heading) => heading !== "## Paridade"
  )
  const errors = lintReadmeHeadings(
    readmeWith(withoutParidade),
    EXPECTED_CONTRACT_HEADINGS
  )
  assert.ok(errors.length > 0)
  assert.match(errors[0], /## Paridade/)
})

test("lintReadmeHeadings falha quando duas seções estão fora de ordem", () => {
  const swapped = [...EXPECTED_CONTRACT_HEADINGS]
  ;[swapped[2], swapped[3]] = [swapped[3], swapped[2]]
  const errors = lintReadmeHeadings(
    readmeWith(swapped),
    EXPECTED_CONTRACT_HEADINGS
  )
  assert.ok(
    errors.some(
      (error) => error.includes('"## Dados"') && error.includes("posição 3")
    )
  )
})

test("lintChangelogVersion passa quando existe heading keep-a-changelog para a versão", () => {
  const errors = lintChangelogVersion(
    "## [1.0.0] - 2026-01-01\n\n- inicial\n",
    "1.0.0"
  )
  assert.deepEqual(errors, [])
})

test("lintChangelogVersion falha quando não há heading para a versão do module.json", () => {
  const errors = lintChangelogVersion(
    "## [0.9.0] - 2026-01-01\n\n- inicial\n",
    "1.0.0"
  )
  assert.equal(errors.length, 1)
  assert.match(errors[0], /1\.0\.0/)
})

test("lintWebImports passa para web/core só com zod, @platform/api-client (com subpath) e imports relativos", () => {
  const files = [
    {
      path: "catalog/identity/single-tenant/web/core/session.ts",
      layer: "core",
      content: `import { z } from "zod";\nimport { useLogin } from "@platform/api-client/hooks/useLogin";\nimport { schema } from "./schema";\n`,
    },
  ]
  assert.deepEqual(lintWebImports(files), [])
})

test("lintWebImports falha quando web/core importa @tanstack/react-router", () => {
  const files = [
    {
      path: "catalog/identity/single-tenant/web/core/router.ts",
      layer: "core",
      content: `import { createRouter } from "@tanstack/react-router";\n`,
    },
  ]
  const errors = lintWebImports(files)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /@tanstack\/react-router/)
})

test("lintWebImports permite @tanstack/react-query em web/react mas não em web/core", () => {
  const reactFiles = [
    {
      path: "catalog/identity/single-tenant/web/react/use-session.ts",
      layer: "react",
      content: `import { useQuery } from "@tanstack/react-query";\n`,
    },
  ]
  assert.deepEqual(lintWebImports(reactFiles), [])

  const coreFiles = [
    {
      path: "catalog/identity/single-tenant/web/core/use-session.ts",
      layer: "core",
      content: `import { useQuery } from "@tanstack/react-query";\n`,
    },
  ]
  const errors = lintWebImports(coreFiles)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /@tanstack\/react-query/)
})

test("lintWebImports permite vitest em web/core/*.test.ts", () => {
  const files = [
    {
      path: "catalog/identity/single-tenant/web/core/session.test.ts",
      layer: "core",
      content: `import { describe, it, expect } from "vitest";\n`,
    },
  ]
  assert.deepEqual(lintWebImports(files), [])
})

test("lintWebImports continua barrando vitest em web/core fora de *.test.ts", () => {
  const files = [
    {
      path: "catalog/identity/single-tenant/web/core/session.ts",
      layer: "core",
      content: `import { describe } from "vitest";\n`,
    },
  ]
  const errors = lintWebImports(files)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /vitest/)
})

test("lintWebImports continua barrando @tanstack/react-router mesmo em *.test.ts", () => {
  const files = [
    {
      path: "catalog/identity/single-tenant/web/core/router.test.ts",
      layer: "core",
      content: `import { createRouter } from "@tanstack/react-router";\n`,
    },
  ]
  const errors = lintWebImports(files)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /@tanstack\/react-router/)
})

test("lintWebImports permite @testing-library/react em web/react/*.test.tsx (renderHook)", () => {
  const files = [
    {
      path: "catalog/identity/single-tenant/web/react/use-session.test.tsx",
      layer: "react",
      content: `import { renderHook } from "@testing-library/react";\nimport { describe, it, expect } from "vitest";\n`,
    },
  ]
  assert.deepEqual(lintWebImports(files), [])
})

test("lintWebImports barra @testing-library/react em web/core/*.test.ts", () => {
  const files = [
    {
      path: "catalog/identity/single-tenant/web/core/session.test.ts",
      layer: "core",
      content: `import { renderHook } from "@testing-library/react";\n`,
    },
  ]
  const errors = lintWebImports(files)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /@testing-library\/react/)
})

test("lintManifest passa para um module.json válido", () => {
  const manifest = {
    name: "alpha",
    version: "1.0.0",
    kernelRange: ">=1.0.0 <2.0.0",
    apiModule: { export: "AlphaModule", path: "modules/alpha/alpha.module" },
  }
  assert.deepEqual(lintManifest(manifest), [])
})

test("lintManifest falha e reporta o campo obrigatório ausente", () => {
  const manifest = { name: "alpha", version: "1.0.0" }
  const errors = lintManifest(manifest)
  assert.ok(
    errors.some((error) =>
      error.includes("campo obrigatório ausente: kernelRange")
    )
  )
})

test("lintKernelRange reproduz a v2.0.0 (issue #9): entrada 2.0.0 com kernelRange 1.x não aceita o kernel 2.0.0", () => {
  const manifest = {
    name: "audit",
    version: "2.0.0",
    kernelRange: ">=1.0.0 <2.0.0",
  }
  const errors = lintKernelRange(manifest, "2.0.0")
  assert.equal(errors.length, 1)
  assert.match(errors[0], />=1\.0\.0 <2\.0\.0/)
  assert.match(errors[0], /kernel 2\.0\.0/)
})

test("lintKernelRange passa quando o range aberto no bump cobre o kernel atual e os minors seguintes", () => {
  const manifest = {
    name: "audit",
    version: "2.0.0",
    kernelRange: ">=2.0.0 <3.0.0",
  }
  assert.deepEqual(lintKernelRange(manifest, "2.0.0"), [])
  assert.deepEqual(lintKernelRange(manifest, "2.2.0"), [])
})

test("lintKernelRange não duplica o erro de um kernelRange ausente ou inválido (já é de lintManifest)", () => {
  assert.deepEqual(
    lintKernelRange({ name: "audit", version: "2.0.0" }, "2.0.0"),
    []
  )
  assert.deepEqual(
    lintKernelRange(
      { name: "audit", version: "2.0.0", kernelRange: "not-a-range" },
      "2.0.0"
    ),
    []
  )
})

test("toda entrada do catálogo real aceita a versão mais recente de docs/dev/template-changelog.md", () => {
  const kernelVersion = readLatestChangelogVersion(CHANGELOG_PATH)
  for (const entryDir of discoverEntries(path.join(ROOT, "catalog"))) {
    const manifest = JSON.parse(
      readFileSync(path.join(entryDir, "module.json"), "utf8")
    )
    assert.deepEqual(
      lintKernelRange(manifest, kernelVersion),
      [],
      `${entryDir} vs kernel ${kernelVersion}`
    )
  }
})

function writeCatalogRepo({ kernelRange, changelogVersion }) {
  const root = mkdtempSync(path.join(tmpdir(), "lint-kernel-range-"))
  const entryDir = path.join(root, "catalog/alpha")
  writeEntryFile(
    entryDir,
    "module.json",
    JSON.stringify({
      name: "alpha",
      version: "2.0.0",
      kernelRange,
      apiModule: { export: "AlphaModule", path: "modules/alpha/alpha.module" },
    })
  )
  writeEntryFile(entryDir, "README.md", "# alpha\n")
  writeEntryFile(
    entryDir,
    "CHANGELOG.md",
    "## [2.0.0] - 2026-08-21\n\n- bump\n"
  )
  const changelogPath = path.join(root, "docs/dev/template-changelog.md")
  writeEntryFile(
    root,
    "docs/dev/template-changelog.md",
    `# Template changelog\n\n## v${changelogVersion}\n\ntexto.\n`
  )
  return {
    options: {
      catalogRoot: path.join(root, "catalog"),
      contractPath: path.join(root, "missing-contract.md"),
      advisoriesDir: path.join(root, "missing-advisories"),
      changelogPath,
    },
  }
}

test("runLint (pnpm catalog:lint) sai vermelho no estado da tag v2.0.0 e verde com o range aberto", () => {
  const broken = writeCatalogRepo({
    kernelRange: ">=1.0.0 <2.0.0",
    changelogVersion: "2.0.0",
  })
  const errors = runLint(broken.options)
  assert.equal(errors.length, 1)
  assert.match(
    errors[0],
    /catalog\/alpha\/module\.json: kernelRange ">=1\.0\.0 <2\.0\.0" não aceita o kernel 2\.0\.0/
  )

  const fixed = writeCatalogRepo({
    kernelRange: ">=2.0.0 <3.0.0",
    changelogVersion: "2.0.0",
  })
  assert.deepEqual(runLint(fixed.options), [])
})

test("runLint reporta um changelog sem versão em vez de pular a conferência em silêncio", () => {
  const repo = writeCatalogRepo({
    kernelRange: ">=2.0.0 <3.0.0",
    changelogVersion: "2.0.0",
  })
  writeFileSync(
    repo.options.changelogPath,
    "# Template changelog\n\nsem seções.\n"
  )
  const errors = runLint(repo.options)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /template-changelog\.md: nenhuma seção/)
})

test("lintAdvisoryFrontmatter passa para um advisory com frontmatter válido", () => {
  assert.deepEqual(
    lintAdvisoryFrontmatter(advisoryMd(), "docs/advisories/ADV-20260901-01.md"),
    []
  )
})

test("lintAdvisoryFrontmatter falha e nomeia o campo obrigatório ausente", () => {
  const md = advisoryMd({ parity: undefined })
  const errors = lintAdvisoryFrontmatter(
    md,
    "docs/advisories/ADV-20260901-01.md"
  )
  assert.equal(errors.length, 1)
  assert.match(errors[0], /parity/)
})

test("lintAdvisoryModule aceita kernel e cada uma das 5 entradas reais do catálogo", () => {
  const catalogRoot = path.join(ROOT, "catalog")
  const entryNames = discoverEntries(catalogRoot).map((entryDir) =>
    path.relative(catalogRoot, entryDir).split(path.sep).join("/")
  )
  assert.deepEqual(entryNames.sort(), [
    "attachment",
    "audit",
    "identity/single-tenant",
    "notification",
    "tag",
  ])
  assert.deepEqual(
    lintAdvisoryModule({ id: "ADV-x", module: "kernel" }, entryNames),
    []
  )
  for (const name of entryNames) {
    assert.deepEqual(
      lintAdvisoryModule({ id: "ADV-x", module: name }, entryNames),
      []
    )
  }
})

test("lintAdvisoryModule falha para módulo desconhecido, nomeando o módulo", () => {
  const errors = lintAdvisoryModule(
    { id: "ADV-20260901-01", module: "nonexistent" },
    ["tag"]
  )
  assert.equal(errors.length, 1)
  assert.match(errors[0], /nonexistent/)
  assert.match(errors[0], /ADV-20260901-01/)
})

test("runLint reporta o arquivo e o módulo desconhecido de um advisory", () => {
  const repo = writeCatalogRepo({
    kernelRange: ">=2.0.0 <3.0.0",
    changelogVersion: "2.0.0",
  })
  writeEntryFile(
    repo.options.advisoriesDir,
    "ADV-20260901-01.md",
    advisoryMd({ module: "nonexistent" })
  )
  const errors = runLint(repo.options)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /ADV-20260901-01\.md/)
  assert.match(errors[0], /nonexistent/)
})

function writeEntryFile(entryDir, relativePath, content) {
  const filePath = path.join(entryDir, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
  return filePath
}

function makeEntryDir() {
  return mkdtempSync(path.join(tmpdir(), "lint-production-testing-imports-"))
}

test("lintProductionTestingImports falha quando código de produção importa de testing/", () => {
  const entryDir = makeEntryDir()
  const filePath = writeEntryFile(
    entryDir,
    "api/application/use-cases/foo.use-case.ts",
    `import { helper } from "../../testing/helper"\n`
  )
  const errors = lintProductionTestingImports(entryDir)
  assert.equal(errors.length, 1)
  assert.match(
    errors[0],
    new RegExp(filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  )
  assert.match(errors[0], /testing\/helper/)
})

test("lintProductionTestingImports passa quando um spec importa de testing/", () => {
  const entryDir = makeEntryDir()
  writeEntryFile(
    entryDir,
    "api/application/use-cases/foo.spec.ts",
    `import { helper } from "../../testing/helper"\n`
  )
  assert.deepEqual(lintProductionTestingImports(entryDir), [])
})

test("lintProductionTestingImports passa para um arquivo que já está sob testing/", () => {
  const entryDir = makeEntryDir()
  writeEntryFile(
    entryDir,
    "api/testing/seeds/helper.ts",
    `import { other } from "../fixtures/testing/other"\n`
  )
  assert.deepEqual(lintProductionTestingImports(entryDir), [])
})

test("lintProductionTestingImports passa para uma entry limpa (sem import de testing/)", () => {
  const entryDir = makeEntryDir()
  writeEntryFile(
    entryDir,
    "api/application/use-cases/foo.use-case.ts",
    `import { db } from "../../infrastructure/db"\n`
  )
  assert.deepEqual(lintProductionTestingImports(entryDir), [])
})

test("discoverEntries encontra as entradas fixture, incluindo a forma <name>/<variant>", () => {
  // fixtures/catalog é compartilhado entre workers da wave; outras entradas podem coexistir.
  const entries = discoverEntries(FIXTURES_ROOT).map((entryDir) =>
    path.relative(FIXTURES_ROOT, entryDir)
  )
  assert.ok(entries.includes("alpha"))
  assert.ok(entries.includes("beta"))
  assert.ok(entries.includes(path.join("gamma", "variant-x")))
})
