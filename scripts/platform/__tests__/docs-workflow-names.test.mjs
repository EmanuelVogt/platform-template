import assert from "node:assert/strict"
import { test } from "node:test"

import {
  auditWorkflowNames,
  documentWorkflowNames,
  excludedWorkflowStems,
  readExcludes,
  workflowNameForms,
} from "./lib/audience-contract.mjs"

// AUD-06 — um token inline que nomeia um workflow removido pelo `_exclude` derruba o gate.
// Mais largo que a letra do AC de propósito: o token de hoje é `` `release.yml` ``, que não é
// o stem nem um token de caminho. Ver o comentário em lib/audience-contract.mjs.
const FIXTURES = "scripts/platform/__tests__/fixtures/audience-contract"

const auditFixture = (name) =>
  auditWorkflowNames({
    docs: [
      { destination: "docs/fixture.md", source: `${FIXTURES}/${name}.md` },
    ],
  })

const auditText = (text, overrides = {}) =>
  auditWorkflowNames({
    docs: [{ destination: "docs/fixture.md", source: "inline" }],
    readDoc: () => text,
    ...overrides,
  })

test("os stems vêm do `_exclude` em tempo de execução, nunca escritos à mão", () => {
  assert.deepEqual([...excludedWorkflowStems()].sort(), ["format", "release"])
  const withoutRelease = readExcludes().filter(
    (entry) => entry !== ".github/workflows/release.yml"
  )
  assert.deepEqual(
    [...excludedWorkflowStems(withoutRelease)],
    ["format"],
    "tirar a entrada do `_exclude` tem de tirar o stem — senão a lista está embutida (AUD-08)"
  )
  assert.deepEqual(
    auditText("O gate roda em `release`.", { stems: new Set() }),
    [],
    "sem stem nenhum não há o que acusar — a regra depende do `_exclude`, não de uma palavra"
  )
})

test("as três grafias falham; `pnpm catalog:lint` e `catalog/` não", () => {
  const findings = auditFixture("workflow-names")
  assert.deepEqual(
    findings.map((finding) => finding.token),
    ["release", "release.yml", "release.yaml"],
    "`<stem>`, `<stem>.yml` e `<stem>.yaml` são a mesma intenção com a grafia que o doc usa"
  )
  assert.deepEqual(workflowNameForms("release"), [
    "release",
    "release.yml",
    "release.yaml",
  ])
  for (const token of ["pnpm catalog:lint", "catalog/", "ci.yml", "releases"]) {
    assert.ok(
      !findings.some((finding) => finding.token === token),
      `a igualdade é exata — \`${token}\` não pode entrar na regra`
    )
  }
})

test("a mensagem nomeia file:line e o token", () => {
  const [finding] = auditFixture("workflow-names")
  assert.equal(finding.file, "docs/fixture.md")
  assert.equal(finding.line, 3)
  assert.equal(
    finding.message,
    "docs/fixture.md:3 — `release` nomeia o workflow release, que o `_exclude` remove do filho"
  )
})

// `format` é um token plausível para um job de verdade e o `_exclude` remove o workflow de
// mesmo nome: a colisão fica documentada aqui em vez de ser descoberta depois.
// `docs/dev/template-changelog.md:157` já carrega um — e o changelog é isento (T9).
test("`format` colide com uma palavra comum e é tratado deliberadamente", () => {
  assert.deepEqual(
    auditText("Rode `pnpm format` antes do commit.").map(
      (finding) => finding.token
    ),
    [],
    "`pnpm format` é um comando, não o nome do workflow — a igualdade é exata"
  )
  assert.deepEqual(
    auditText("O workflow `format` roda no template.").map(
      (finding) => finding.token
    ),
    ["format"],
    "o token sozinho nomeia o workflow removido e acusa"
  )
  assert.deepEqual(
    auditWorkflowNames({ exempt: [] }).filter(
      (finding) => finding.file !== "docs/dev/template-changelog.md"
    ),
    auditWorkflowNames(),
    "a isenção do changelog é a única coisa que segura os tokens `format`/`release` dele"
  )
})

test("uma isenção inline no fim da linha fecha o achado", () => {
  assert.deepEqual(
    auditText(
      "O gate roda em `release`. <!-- audience-contract: release — nomeia o gate do próprio template, que o filho não recebe -->"
    ),
    []
  )
  assert.deepEqual(
    documentWorkflowNames("O gate roda em `release`.", new Set(["release"])),
    [{ line: 1, token: "release", stem: "release" }]
  )
})

// SPEC_DEVIATION: one live finding is pinned instead of repaired.
// Reason: `docs/dev/template-update.md:10` ("The `release` workflow runs the full gate")
// is a REAL instance of AUD-06 that no wave repaired — the prototype could not see it,
// because the stem rule this task introduces did not exist when the tree was measured. The
// file belongs to no task in this cluster, so the one-line fix (an inline waiver, the doc
// is telling the child what the UPSTREAM promises) is the owner's to write. Pinning it is a
// ratchet, not an allowlist: the day the waiver lands this assertion goes red and has to
// shrink to [].
test("a árvore viva tem exatamente um achado pendente, nominal", () => {
  assert.deepEqual(
    auditWorkflowNames().map((finding) => [
      finding.file,
      finding.line,
      finding.token,
    ]),
    [["docs/dev/template-update.md", 10, "release"]],
    "achado REAL pendente de reparo por quem é dono do arquivo; qualquer OUTRO achado é regressão"
  )
})
