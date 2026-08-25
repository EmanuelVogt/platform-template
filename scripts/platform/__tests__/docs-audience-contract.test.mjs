import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"

import {
  readExcludes,
  renderedDestination,
  ROOT,
  shippedSet,
  trackedFiles,
} from "./lib/audience-contract.mjs"

// AUD-01..04 e AUD-09..11 — o contrato de entrega dos docs, verificado contra o copier.yml
// e o conjunto entregue de verdade, nunca contra uma cópia da lista dentro do teste.

const read = (relativePath) =>
  readFileSync(path.join(ROOT, relativePath), "utf8")

const trackedUnder = (...paths) =>
  execFileSync("git", ["ls-files", "-z", ...paths], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)

// Este arquivo nomeia o caminho antigo para poder asseverar sobre ele: a asserção não é
// uma referência que mande o leitor para lá.
const SELF = "scripts/platform/__tests__/docs-audience-contract.test.mjs"

const filesReferencing = (needle) => {
  try {
    return execFileSync(
      "git",
      ["grep", "-l", "-F", needle, "--", ":!.specs", `:!${SELF}`],
      {
        cwd: ROOT,
        encoding: "utf8",
      }
    )
      .split("\n")
      .filter(Boolean)
  } catch {
    return []
  }
}

// Auditorias internas do template, excluídas desde antes desta feature (copier.yml:31-34):
// ficam sob `docs/` mas nunca foram entregues.
const NOT_THIS_FEATURE = "docs/platform_template/"

test("AUD-01: `_exclude` carrega a âncora /docs/platform e o diretório não está vazio", () => {
  assert.ok(
    readExcludes().includes("/docs/platform"),
    "sem a âncora, `docs/platform` casaria qualquer diretório com esse nome em qualquer profundidade"
  )
  const docs = trackedUnder("docs/platform")
  assert.ok(
    docs.length > 0,
    "docs/platform/ ausente ou vazio não é resultado limpo: é o contrato inteiro passando por vacuidade"
  )
})

test("AUD-02: nenhuma entrada do `_exclude` nomeia um arquivo individual sob docs/", () => {
  const docsEntries = readExcludes()
    .map((entry) => String(entry).replace(/^\//, "").replace(/\/$/, ""))
    .filter((entry) => entry.startsWith("docs/"))
  assert.ok(
    docsEntries.length > 0,
    "tem de haver entrada `docs/` — senão esta asserção não olha nada"
  )
  for (const entry of docsEntries) {
    assert.deepEqual(
      trackedUnder(entry).filter((file) => file === entry),
      [],
      `\`${entry}\` nomeia um arquivo: toda entrada docs/ tem de ser âncora de diretório`
    )
    assert.ok(
      trackedUnder(entry).length > 0,
      `\`${entry}\` não casa arquivo rastreado nenhum — entrada morta`
    )
  }
})

test("AUD-03: o conjunto entregue não tem nada de docs/platform/ e tem todo o resto de docs/", () => {
  const shipped = shippedSet()
  const underPlatform = []
  const missing = []
  for (const file of trackedUnder("docs")) {
    const destination = renderedDestination(file)
    if (destination.startsWith(NOT_THIS_FEATURE)) continue
    if (destination.startsWith("docs/platform/")) {
      if (shipped.has(destination)) underPlatform.push(destination)
      continue
    }
    if (!shipped.has(destination)) missing.push(destination)
  }
  assert.deepEqual(
    underPlatform,
    [],
    "docs/platform/ é endereçado a quem trabalha no template"
  )
  assert.deepEqual(
    missing,
    [],
    "todo o resto de docs/ continua sendo entregue ao filho"
  )
})

// O único doc que MUDOU de lugar (spec § Assumptions): os outros três são divisões, e a
// metade que ficou continua existindo no caminho original.
const MOVED_DOCS = [
  ["docs/catalog/README-contract.md", "docs/platform/README-contract.md"],
]

// Registros históricos: descrevem o que era verdade quando foram escritos e não podem ser
// reescritos — mesmo argumento da isenção do changelog em docs-shipped-paths.test.mjs.
const HISTORICAL_RECORDS = ["docs/dev/template-changelog.md", NOT_THIS_FEATURE]

test("AUD-04: nenhum arquivo rastreado fora de .specs/ cita o caminho antigo de um doc movido", () => {
  for (const [oldPath, newPath] of MOVED_DOCS) {
    assert.deepEqual(
      trackedUnder(oldPath),
      [],
      `${oldPath} moveu para ${newPath} e não pode voltar a existir`
    )
    assert.deepEqual(trackedUnder(newPath), [newPath])
    const referencing = filesReferencing(oldPath)
    assert.ok(
      referencing.length > 0,
      "o registro histórico ainda cita o caminho antigo — se não cita mais, esta isenção virou letra morta"
    )
    assert.deepEqual(
      referencing.filter(
        (file) =>
          !HISTORICAL_RECORDS.some((record) =>
            record.endsWith("/") ? file.startsWith(record) : file === record
          )
      ),
      [],
      `nenhum doc vivo pode mandar o leitor para ${oldPath}`
    )
  }
})

// AUD-09/AUD-10 — as quatro mecânicas que saíram do doc entregue, cada uma pelo literal que
// o arquivo movido realmente carrega. NÃO se assevera a ausência de `.worktrees/`: a
// convenção `.worktrees/<slug>` e o lock `branch-only-in-worktree.mjs` ficaram do lado do
// filho de propósito — o que saiu foi a REGRA do checkout compartilhado.
const TEMPLATE_ONLY_MECHANICS = [
  "release.yml",
  "shared between agents",
  "pull request",
  "origin/main",
]

test("AUD-09: o doc de workflow entregue não carrega nenhuma mecânica só do template", () => {
  const shipped = read("docs/agents/workflow.md").toLowerCase()
  for (const literal of TEMPLATE_ONLY_MECHANICS) {
    assert.ok(
      !shipped.includes(literal.toLowerCase()),
      `docs/agents/workflow.md ainda carrega "${literal}", que depende de um artefato que só o template tem`
    )
  }
})

test("AUD-10: as quatro estão sob docs/platform/, e esse arquivo não é entregue", () => {
  const templateOnly = read("docs/platform/workflow.md").toLowerCase()
  for (const literal of TEMPLATE_ONLY_MECHANICS) {
    assert.ok(
      templateOnly.includes(literal.toLowerCase()),
      `"${literal}" tem de continuar existindo em docs/platform/workflow.md — sair do filho não é apagar`
    )
  }
  assert.ok(!shippedSet().has("docs/platform/workflow.md"))
})

// Correção da onda 1: o filho USA worktree, e `harness.md`/`AGENTS.md.jinja` referenciam a
// convenção. Um "reparo" que tirasse isso do doc entregue deixaria o filho sem regra de
// branch nenhuma — a asserção existe para barrar esse reparo.
test("AUD-09 (limite): a convenção de worktree do filho continua no doc entregue", () => {
  const shipped = read("docs/agents/workflow.md")
  assert.ok(shipped.includes(".worktrees/<slug>"))
  assert.ok(shipped.includes(".claude/hooks/branch-only-in-worktree.mjs"))
})

test("AUD-11: toda linha da tabela de docs/agents/README.md resolve no conjunto entregue", () => {
  const shipped = shippedSet()
  const rows = read("docs/agents/README.md")
    .split("\n")
    .filter((line) => line.startsWith("| ["))
    .map((line) => /\[[^\]]*\]\(([^)\s]+)\)/.exec(line)?.[1])
  assert.ok(
    rows.length >= 5,
    `a tabela tem de ter linhas para conferir — ${rows.length} encontradas`
  )
  for (const target of rows) {
    assert.ok(target, "toda linha da tabela abre com um link para o arquivo")
    const resolved = path.posix.join("docs/agents", target)
    assert.ok(
      shipped.has(resolved),
      `docs/agents/README.md manda ler ${resolved}, que o filho não recebe`
    )
  }
})

test("o conjunto usado por estas asserções não é vazio", () => {
  assert.ok(shippedSet().size > 0 && trackedFiles().length > 0)
})
