import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { test } from "node:test"

import {
  auditShippedDocs,
  catalogEntryDirs,
  CHILD_CREATED_PREFIXES,
  EXEMPT_DOC_PREFIXES,
  EXEMPT_DOCS,
  ROOT,
  shippedDocs,
} from "./lib/audience-contract.mjs"

// AUD-05/AUD-07 — nenhum doc entregue nomeia um caminho ausente do que o filho recebe.
// O caso de falha roda contra FIXTURE, nunca contra a árvore viva.
const FIXTURES = "scripts/platform/__tests__/fixtures/audience-contract"

const auditFixture = (name) =>
  auditShippedDocs({
    docs: [
      { destination: "docs/fixture.md", source: `${FIXTURES}/${name}.md` },
    ],
  })

const auditText = (text, destination = "docs/fixture.md") =>
  auditShippedDocs({
    docs: [{ destination, source: "inline" }],
    readDoc: () => text,
  })

test("nenhum doc entregue nomeia um caminho que o filho não tem", () => {
  const findings = auditShippedDocs()
  assert.deepEqual(
    findings.map((finding) => finding.message),
    [],
    "cada linha acima é um doc entregue mandando o filho para um caminho que ele não recebe"
  )
  assert.ok(
    shippedDocs().length > 20,
    "o guard tem de varrer os docs de verdade — uma lista vazia passaria por vacuidade"
  )
})

test("um doc entregue que nomeia .github/workflows/release.yml falha; sem o token, passa", () => {
  const findings = auditFixture("names-excluded-workflow")
  assert.equal(findings.length, 1)
  assert.equal(findings[0].token, ".github/workflows/release.yml")
  assert.deepEqual(auditFixture("repaired-workflow"), [])
})

test("a mensagem nomeia file:line e o token (AUD-07)", () => {
  const [finding] = auditFixture("names-excluded-workflow")
  assert.equal(finding.file, "docs/fixture.md")
  assert.equal(finding.line, 3)
  assert.equal(
    finding.message,
    "docs/fixture.md:3 — `.github/workflows/release.yml` não existe no que o filho recebe"
  )
})

test("edge case — um `.jinja` linkado pelo nome renderizado está presente", () => {
  assert.deepEqual(
    auditText("Veja [infra](../.agents/skills/infra/SKILL.md)."),
    []
  )
  assert.deepEqual(
    auditText("Veja [infra](../.agents/skills/infra/SKILL.md.jinja).").map(
      (f) => f.token
    ),
    ["../.agents/skills/infra/SKILL.md.jinja"],
    "o filho nunca recebe o nome com `.jinja` — nomeá-lo assim é defeito"
  )
})

test("edge case — um diretório existe quando algum arquivo entregue mora sob ele", () => {
  assert.deepEqual(auditText("A camada é `apps/api/src/shared`."), [])
  assert.deepEqual(
    auditText("A camada é `apps/api/src/sharedd`.").map((f) => f.token),
    ["apps/api/src/sharedd"]
  )
})

test("edge case — token com placeholder é ignorado, não resolvido", () => {
  assert.deepEqual(
    auditText(
      "Entrada `catalog/<entry>`, migration `apps/api/drizzle/0000_*.sql`, slug `{{ project_slug }}/x`."
    ),
    []
  )
  assert.deepEqual(
    auditText("Entrada `catalog/entry`.").map((f) => f.token),
    ["catalog/entry"],
    "sem o placeholder o mesmo token é resolvido e acusado"
  )
  assert.deepEqual(
    auditText("A advisory nasce como `docs/advisories/ADV-YYYYMMDD-NN.md`."),
    [],
    "`ADV-YYYYMMDD-NN.md` nomeia o formato de uma advisory, não um arquivo"
  )
})

test("edge case — um doc sob docs/platform/ não é varrido", () => {
  const tracked = execFileSync("git", ["ls-files", "-z", "docs/platform"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => file.endsWith(".md"))
  assert.ok(
    tracked.length > 0,
    "docs/platform/ tem de ter docs rastreados — senão esta asserção passa por vacuidade"
  )
  assert.deepEqual(
    shippedDocs().filter((doc) => doc.destination.startsWith("docs/platform/")),
    [],
    "a regra restringe o que o filho recebe; o template tem todos os arquivos"
  )
})

test("isenção inline: no fim da linha isenta o token; em linha própria não isenta o de baixo", () => {
  const findings = auditFixture("waivers")
  assert.deepEqual(
    findings.map((finding) => [finding.line, finding.token]),
    [
      [8, "catalog/schema/module.schema.json"],
      [10, "catalog/registry.json"],
    ],
    "`catalog/` está isento pelo comentário no fim da linha; o comentário em linha própria não isenta " +
      "o token abaixo dele, e um comentário sem razão não isenta nada"
  )
  const ownLine =
    "<!-- audience-contract: catalog/entry — isenção em linha própria -->\n" +
    "A entrada é `catalog/entry`."
  assert.deepEqual(
    auditText(ownLine).map((finding) => finding.line),
    [2],
    "colado na linha de cima, dentro do mesmo parágrafo, o comentário em linha própria continua não isentando"
  )
  assert.deepEqual(
    auditText(
      "A entrada é `catalog/entry`. <!-- audience-contract: catalog/entry — nomeada para explicar que não é entregue -->"
    ),
    [],
    "no fim da linha, com razão, o mesmo comentário isenta"
  )
})

test("a lista de caminhos criados pelo filho é asseverada, entrada por entrada", () => {
  assert.deepEqual(CHILD_CREATED_PREFIXES, [
    ".specs/",
    ".claude/skills/",
    "generated/",
    ".worktrees/",
    "apps/api/.env",
  ])
  for (const prefix of CHILD_CREATED_PREFIXES) {
    const token = prefix.endsWith("/") ? `${prefix}exemplo.md` : prefix
    assert.deepEqual(
      auditText(`O filho cria [isso](../${token}).`),
      [],
      `${prefix} está na lista de criados pelo filho e não pode virar achado`
    )
  }
  assert.deepEqual(
    auditText("O filho cria [isso](../apps/api/.envv).").map((f) => f.token),
    ["../apps/api/.envv"],
    "a lista é por prefixo exato — um vizinho parecido continua sendo acusado"
  )
})

test("a isenção do changelog é aquele arquivo e só ele", () => {
  assert.deepEqual(EXEMPT_DOCS, ["docs/dev/template-changelog.md"])
  const withoutExemption = auditShippedDocs({ exempt: [] })
  assert.ok(
    withoutExemption.length > 0,
    "sem a isenção o changelog acusa — se não acusa, a isenção não está segurando nada"
  )
  assert.deepEqual(
    withoutExemption.filter(
      (finding) => finding.file !== "docs/dev/template-changelog.md"
    ),
    [],
    "a isenção só pode estar segurando achados do changelog"
  )
})

// SPEC_DEVIATION: `.agents/skills/**` is out of the guard's scope — see the reason at
// audience-contract.mjs. This test pins the blast radius so it cannot widen unnoticed.
test("a isenção por prefixo cobre .agents/skills/ e nada além dele", () => {
  assert.deepEqual(EXEMPT_DOC_PREFIXES, [".agents/skills/"])
  const withoutExemption = auditShippedDocs({ exemptPrefixes: [] })
  assert.ok(withoutExemption.length > 0)
  assert.deepEqual(
    withoutExemption.filter(
      (finding) => !finding.file.startsWith(".agents/skills/")
    ),
    [],
    "nenhum manual do repositório pode depender desta isenção"
  )
})

test("buraco conhecido: token em bloco cercado não é varrido, inline é", () => {
  assert.deepEqual(
    auditFixture("fenced-hole").map((finding) => [finding.line, finding.token]),
    [[7, "scripts/platform/catalog-lint.mjs"]],
    "docs/test/testing.md:40-44 nomeia `catalog/**` dentro de bloco cercado — o guard não fecha esse buraco"
  )
})

// Reescrita inline, não a fixture compartilhada (docs-workflow-names.test.mjs também a usa):
// o link do `.jinja` e a citação de linha precisavam de um alvo que o filho ainda recebe.
test("as quatro situações que não são defeito passam juntas", () => {
  const text = [
    "Acesso operacional está em [`infra`](../.agents/skills/infra/SKILL.md), um `.jinja` no template.",
    "A camada compartilhada da API mora em `apps/api/src/shared`.",
    "Uma migration nasce como `apps/api/drizzle/0000_*.sql` e uma entrada é `catalog/<entry>`.",
    "O spec do filho vive em `.specs/features/x/spec.md` e o contrato em `generated/`.",
    "`.agents/skills/dev-workflow/SKILL.md:120` cita `apps/api/vitest.config.mts:20`.",
  ].join("\n")
  assert.deepEqual(auditText(text), [])
})

// O instalador é o segundo canal de entrega: `catalog/<dir>/api/**` vira
// `apps/api/src/modules/<entrada>/**` no filho. O guard resolve contra o catálogo — o raio
// destes três casos é o que separa "ensinou o canal" de "cegou a regra".
test("um caminho pós-`module add` que existe no catálogo não é achado", () => {
  assert.deepEqual(
    auditText(
      "Edite `apps/api/src/modules/audit/infrastructure/repositories/drizzle-activity-stats.reader.spec.ts`."
    ),
    []
  )
})

test("um arquivo que a entrada NÃO tem continua sendo achado", () => {
  const findings = auditText(
    "Edite `apps/api/src/modules/audit/nao/existe/em/lugar/nenhum.ts`."
  )
  assert.equal(findings.length, 1)
  assert.equal(
    findings[0].token,
    "apps/api/src/modules/audit/nao/existe/em/lugar/nenhum.ts"
  )
})

test("um caminho sob entrada inexistente continua sendo achado", () => {
  const findings = auditText(
    "Edite `apps/api/src/modules/entrada-fantasma/identity.config.spec.ts`."
  )
  assert.equal(findings.length, 1)
  assert.equal(
    findings[0].token,
    "apps/api/src/modules/entrada-fantasma/identity.config.spec.ts"
  )
})

test("o mapa de entradas vem do catálogo de verdade, não de uma lista embutida", () => {
  const dirs = catalogEntryDirs()
  assert.equal(dirs.get("identity"), "identity/single-tenant")
  assert.deepEqual([...dirs.keys()].sort(), [
    "attachment",
    "audit",
    "identity",
    "notification",
    "professional",
    "tag",
  ])
})

test("o diretório da entrada, sem arquivo, também resolve pós-`module add`", () => {
  assert.deepEqual(auditText("Veja `apps/api/src/modules/identity`."), [])
  assert.equal(
    auditText("Veja `apps/api/src/modules/entrada-fantasma`.").length,
    1
  )
})
