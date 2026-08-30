import assert from "node:assert/strict"
import { test } from "node:test"

import {
  excludeMatcher,
  excludedWorkflowStems,
  isExcluded,
  readExcludes,
  renderedDestination,
  shippedSet,
  trackedFiles,
} from "./lib/audience-contract.mjs"

// AUD-03/AUD-08 — o conjunto entregue ao filho, derivado do copier.yml de verdade.
// Piso deliberado: um `_exclude` casado errado encolhe o conjunto e faz TODA asserção
// derivada (T9, T10, T11) passar por vacuidade, verde e sem valor nenhum.
const SHIPPED_FLOOR = 500

const matches = (pattern, filePath) => excludeMatcher(pattern).test(filePath)

test("o conjunto entregue vem do copier.yml a cada chamada, nunca de uma lista no teste", () => {
  const real = shippedSet()
  assert.ok(
    real.has(".agents/skills/dev-workflow/SKILL.md"),
    ".agents/skills/dev-workflow/SKILL.md é entregue ao filho antes da entrada sintética"
  )

  const withSynthetic = shippedSet({
    excludes: [...readExcludes(), "/.agents/skills/dev-workflow"],
  })
  assert.ok(
    !withSynthetic.has(".agents/skills/dev-workflow/SKILL.md"),
    "uma entrada `_exclude` a mais tem de mudar o conjunto — se não muda, ele veio de uma lista embutida (AUD-08)"
  )
  assert.ok(
    withSynthetic.size < real.size,
    `excluir /.agents/skills/dev-workflow tem de reduzir o conjunto (${real.size} -> ${withSynthetic.size})`
  )
  assert.ok(
    shippedSet().has(".agents/skills/dev-workflow/SKILL.md"),
    "a chamada seguinte recalcula do copier.yml e volta ao conjunto real"
  )
})

test("o conjunto entregue nunca é vazio nem menor que o piso", () => {
  const shipped = shippedSet()
  assert.ok(
    shipped.size >= SHIPPED_FLOOR,
    `conjunto entregue com ${shipped.size} arquivos, abaixo do piso de ${SHIPPED_FLOOR}: ` +
      "isso é um `_exclude` casando demais, não um resultado limpo — toda asserção derivada passaria vazia"
  )
  assert.ok(
    shipped.size < trackedFiles().length,
    "o conjunto entregue tem de ser menor que o rastreado — senão o `_exclude` não casou nada"
  )
})

test("uma barra ancora na raiz; um nome puro casa o basename em qualquer profundidade", () => {
  assert.ok(matches("/catalog", "catalog/identity/single-tenant/README.md"))
  assert.ok(matches("/catalog", "catalog"))
  assert.ok(
    !matches("/catalog", "docs/catalog/catalog.md"),
    "`/catalog` ancorado não pode levar junto docs/catalog/ — foi exatamente o bug que a âncora corrigiu"
  )
  assert.ok(
    matches("catalog", "docs/catalog/catalog.md"),
    "sem a âncora, o mesmo nome casaria em qualquer profundidade — é o que a barra evita"
  )
  assert.ok(
    matches("node_modules", "apps/api/node_modules/pkg/index.js"),
    "nome puro casa o basename em qualquer profundidade"
  )
  assert.ok(matches("docs/platform", "docs/platform/workflow.md"))
  assert.ok(
    !matches("docs/platform", "apps/docs/platform/x.md"),
    "uma barra interna também ancora na raiz"
  )
})

test("casar um ancestral exclui a subárvore inteira", () => {
  assert.ok(matches("/docs/platform", "docs/platform/catalog-authoring.md"))
  assert.ok(
    matches(
      "scripts/platform/__tests__",
      "scripts/platform/__tests__/lib/audience-contract.mjs"
    )
  )
  assert.ok(
    !matches("/docs/platform", "docs/platform_template/audit.md"),
    "o casamento é por segmento: `platform` não casa `platform_template`"
  )
})

test("classes de caracteres e curingas seguem gitwildmatch", () => {
  assert.ok(matches("*.py[co]", "scripts/foo.pyc"))
  assert.ok(matches("*.py[co]", "foo.pyo"))
  assert.ok(
    !matches("*.py[co]", "scripts/foo.py"),
    "`*.py[co]` exige o caractere final da classe"
  )
  assert.ok(matches("~*", "docs/~rascunho.md"))
  assert.ok(!matches("~*", "docs/rascunho.md"))
  assert.ok(
    !matches("*.tsbuildinfo", "apps/api/tsconfig.json"),
    "`*` não casa através de barra dentro de um segmento diferente"
  )
})

test("nomes renderizados: `.jinja` some e as raízes condicionais viram apps/web", () => {
  assert.equal(
    renderedDestination(".agents/skills/infra/SKILL.md.jinja"),
    ".agents/skills/infra/SKILL.md"
  )
  assert.equal(
    renderedDestination("apps/web-vite/Dockerfile"),
    "apps/web/Dockerfile"
  )
  assert.equal(
    renderedDestination("apps/web-next/Dockerfile"),
    "apps/web/Dockerfile"
  )
  assert.equal(
    renderedDestination("{% if web_stack == 'next' %}apps{% endif %}/web"),
    null,
    "a entrada condicional em si não é destino nenhum — quem contribui é o alvo do symlink"
  )

  const shipped = shippedSet()
  assert.ok(
    shipped.has(".agents/skills/infra/SKILL.md"),
    "um doc entregue pode linkar infra pelo nome renderizado"
  )
  assert.ok(
    !shipped.has(".agents/skills/infra/SKILL.md.jinja"),
    "o filho nunca recebe o nome com `.jinja`"
  )
  for (const member of [
    "apps/web/Dockerfile",
    "apps/web/package.json",
    "apps/web/vite.config.ts",
    "apps/web/next.config.ts",
  ]) {
    assert.ok(
      shipped.has(member),
      `${member} tem de estar no conjunto entregue — assertWebShell (scripts/platform/lib/web-shell.mjs:70-106) ` +
        "verifica esse mesmo formato no filho renderizado; o modelo estático tem de concordar com ele"
    )
  }
  assert.ok(
    !shipped.has("apps/web-vite/Dockerfile"),
    "o filho não recebe apps/web-vite/ — recebe apps/web/"
  )
  assert.ok(
    ![...shipped].some((member) => member.includes("{%")),
    "nenhuma entrada condicional crua pode vazar para o conjunto entregue"
  )
})

test("o `_exclude` casa contra o caminho de destino, não o de origem", () => {
  const excludes = readExcludes()
  assert.ok(
    isExcluded("apps/web/.env.local", excludes),
    "`apps/web/.env.local` só faz sentido contra o destino renderizado — é o que prova o modelo"
  )
  assert.ok(!shippedSet().has("apps/web/.env.local"))
})

test("os stems de workflow excluídos são derivados do copier.yml", () => {
  const stems = excludedWorkflowStems()
  assert.deepEqual(
    [...stems].sort(),
    ["format", "release"],
    "hoje o `_exclude` remove release.yml e format.yml; a lista é derivada, nunca escrita à mão"
  )
  assert.ok(
    !stems.has("ci"),
    "ci.yml é entregue ao filho e não pode entrar nos stems excluídos"
  )
  assert.deepEqual(
    [...excludedWorkflowStems([".github/workflows/deploy.yaml"])],
    ["deploy"],
    "a extensão `.yaml` também é reconhecida"
  )
})
