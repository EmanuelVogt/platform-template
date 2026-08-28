// IDENT-03 — "WHEN the extraction ships THEN a new AD SHALL record it and a
// `breaking` advisory SHALL ship per affected entry" (spec.md:319-320 da feature
// audit-2026-08-23-remediation).
//
// POR QUE ISTO É UM TESTE E NÃO UM GATE (ruling em tasks.md, § Fix Round 4):
// `Proof = gate` seria mentira. `pnpm catalog:lint` valida advisories que já
// existem (`lintAdvisoryFrontmatter`/`lintAdvisoryModule`/`lintAdvisoryPathScope`)
// e sai 0 sobre uma árvore com ZERO advisories — nada amarra uma mudança breaking
// a um advisory obrigatório. E `advisory-required.mjs` é hook de commit-msg, não
// gate nomeado: olha o diff staged, nunca exige `kind: "breaking"`, e seu escape
// `Advisory: none — <motivo>` foi usado 11 vezes só nesta feature.
//
// COMO O CONJUNTO DE ENTRADAS AFETADAS É DERIVADO (e não fixado):
//   (a) a origem do corte sai do `dependsOn` de `catalog/professional/module.json`
//       — a entrada de destino declara de quem a fatia foi cortada;
//   (b) as afetadas estruturalmente saem de uma varredura: qualquer entrada que
//       AINDA nomeie, em código, as tabelas da fatia extraída (é o mesmo sinal que
//       o `detect` do ADV-20260824-02 usa para `audit`).
// Assim "shipar a extração sem advisar `audit`" fica vermelho por construção, e
// uma entrada futura que passe a nomear a fatia sem advisory também.

import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { loadAdvisories } from "../lib/advisories.mjs"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(TESTS_DIR, "../../..")
// A varredura enraíza AQUI de propósito, não em REPO_ROOT: `apps/api/.catalog-stage`
// recebe cópias staged das entradas durante `test:scripts`, e uma stage sobrevivente
// com o `identity` pré-extração mudaria o conjunto derivado abaixo.
const CATALOG_DIR = path.join(REPO_ROOT, "catalog")
const ADVISORIES_DIR = path.join(REPO_ROOT, "docs/advisories")
const STATE_PATH = path.join(REPO_ROOT, ".specs/STATE.md")

// A entrada de DESTINO da extração. Nasce em 1.0.0: não tem versão anterior para
// quebrar, e por isso é a única que nomeia a fatia sem dever advisory.
const EXTRACTION_ENTRY = "professional"

// AD-035: as cinco tabelas que saem de `identity`, mais a `professional_profile`
// criada pelo corte no agregado (`servesClients`/`birthDate` deixam `User`).
const SLICE_TABLES = [
  "professional_areas",
  "professional_services",
  "professional_scheduling_areas",
  "professional_schedule_config",
  "professional_default_hours",
  "professional_profile",
]

// Não basta "a entrada tem algum breaking": `docs/advisories/` tem 9 breaking e
// mais de um por módulo (`ADV-20260821-02` e `ADV-20260824-04` são ambos `audit`),
// então essa versão passaria verde com um advisory de jest-to-vitest. Casar tabela
// da fatia E menção à entrada de destino seleciona exatamente -01 e -02.
const DESTINATION_MENTION = /catalog\/professional\/|entrada `professional`/

// AD-035 nomeia `identity` e `audit` como afetadas "at minimum". O piso existe
// para que a derivação acima não passe verde por não ter casado nada — o modo de
// falha "green because blind" que esta feature já registrou dezesseis vezes.
const MIN_AFFECTED_ENTRIES = 2

function catalogEntries(dir = CATALOG_DIR, rel = "") {
  const found = []
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (!item.isDirectory()) continue
    const abs = path.join(dir, item.name)
    const name = rel ? `${rel}/${item.name}` : item.name
    if (existsFile(path.join(abs, "module.json"))) {
      found.push({ name, dir: abs })
      continue
    }
    found.push(...catalogEntries(abs, name))
  }
  return found
}

function existsFile(target) {
  try {
    return statSync(target).isFile()
  } catch {
    return false
  }
}

function sourceFiles(dir, collected = []) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, item.name)
    if (item.isDirectory()) {
      if (item.name === "node_modules") continue
      sourceFiles(abs, collected)
      continue
    }
    // Docs (CHANGELOG/README) descrevem a quebra em vez de sofrerem dela: uma
    // entrada não é "afetada" por citar a extração no changelog dela.
    if (item.name.endsWith(".md")) continue
    collected.push(abs)
  }
  return collected
}

function namesSliceTables(entry) {
  return sourceFiles(entry.dir).some((file) => {
    const text = readFileSync(file, "utf8")
    return SLICE_TABLES.some((table) => text.includes(table))
  })
}

function isExtractionAdvisory(advisory) {
  const text = [
    advisory.detect,
    advisory.fix,
    advisory.parity,
    advisory.body,
  ].join(" ")
  return (
    SLICE_TABLES.some((table) => text.includes(table)) &&
    DESTINATION_MENTION.test(text)
  )
}

function stateRow(id) {
  const line = readFileSync(STATE_PATH, "utf8")
    .split("\n")
    .find((candidate) => candidate.startsWith(`| ${id} |`))
  if (!line) return null
  const cells = line.split("|").map((cell) => cell.trim())
  return { status: cells[2] ?? "", text: cells[3] ?? "" }
}

function affectedEntries() {
  const entries = catalogEntries()
  const destination = entries.find((entry) => entry.name === EXTRACTION_ENTRY)
  assert.ok(
    destination,
    `catalog/${EXTRACTION_ENTRY}/module.json não existe — a extração da IDENT-03 não está no disco; ` +
      `este guard não tem o que verificar e não deve passar em silêncio`
  )

  const affected = new Set()

  // (a) a origem do corte, declarada pela própria entrada de destino
  const manifest = JSON.parse(
    readFileSync(path.join(destination.dir, "module.json"), "utf8")
  )
  for (const dependency of manifest.dependsOn ?? []) {
    const depName =
      typeof dependency === "string" ? dependency : dependency.name
    for (const entry of entries) {
      if (entry.name === depName || entry.name.startsWith(`${depName}/`)) {
        affected.add(entry.name)
      }
    }
  }

  // (b) as que ainda nomeiam a fatia em código depois da extração
  for (const entry of entries) {
    if (entry.name === EXTRACTION_ENTRY) continue
    if (namesSliceTables(entry)) affected.add(entry.name)
  }

  return affected
}

test("IDENT-03: a extração tem AD registrado e ativo", () => {
  const row = stateRow("AD-035")
  assert.ok(row, "AD-035 não está na tabela de decisões de .specs/STATE.md")
  assert.match(
    row.status,
    /^active\b/,
    `AD-035 precisa continuar ativa para sustentar a IDENT-03; status atual: "${row.status}"`
  )
  assert.match(
    row.text,
    /catalog\/professional\//,
    "a linha da AD-035 não registra a criação de catalog/professional/"
  )
  assert.match(
    row.text,
    /dependsOn/,
    "a linha da AD-035 não registra a aresta dependsOn da entrada nova"
  )
})

test("IDENT-03: cada entrada afetada pela extração carrega advisory breaking", () => {
  const affected = affectedEntries()
  assert.ok(
    affected.size >= MIN_AFFECTED_ENTRIES,
    `a derivação encontrou ${affected.size} entrada(s) afetada(s) — AD-035 registra ` +
      `identity e audit "at minimum". Um conjunto menor significa que a derivação ficou ` +
      `cega, não que a extração deixou de afetar entradas`
  )

  const advisories = loadAdvisories(ADVISORIES_DIR)
  for (const entry of [...affected].sort()) {
    const breaking = advisories.filter(
      (advisory) =>
        advisory.module === entry &&
        advisory.kind === "breaking" &&
        isExtractionAdvisory(advisory)
    )
    assert.ok(
      breaking.length > 0,
      `a entrada "${entry}" é afetada pela extração da fatia profissional e não tem ` +
        `advisory kind:"breaking" sobre a extração em docs/advisories/ — ` +
        `IDENT-03 exige um por entrada afetada`
    )
  }
})

test("IDENT-03: os advisories da extração são os registrados na AD-035", () => {
  const advisories = loadAdvisories(ADVISORIES_DIR)
  const expected = [
    {
      id: "ADV-20260824-01",
      module: "identity/single-tenant",
      severity: "critical",
    },
    { id: "ADV-20260824-02", module: "audit", severity: "high" },
  ]

  for (const want of expected) {
    const advisory = advisories.find((candidate) => candidate.id === want.id)
    assert.ok(advisory, `${want.id} não está em docs/advisories/`)
    assert.equal(
      advisory.kind,
      "breaking",
      `${want.id} precisa ser kind:"breaking" — é a quebra da extração`
    )
    assert.equal(advisory.module, want.module, `${want.id} mudou de módulo`)
    assert.equal(
      advisory.severity,
      want.severity,
      `${want.id} mudou de severidade`
    )
  }
})

test("IDENT-03: todo advisory breaking da extração aponta para uma entrada real", () => {
  const names = new Set(catalogEntries().map((entry) => entry.name))
  const affected = affectedEntries()
  const advisories = loadAdvisories(ADVISORIES_DIR).filter(
    (advisory) =>
      advisory.kind === "breaking" &&
      affected.has(advisory.module) &&
      isExtractionAdvisory(advisory)
  )
  assert.ok(
    advisories.length > 0,
    "nenhum advisory breaking casa com as entradas afetadas — a derivação ou os advisories mudaram"
  )
  for (const advisory of advisories) {
    assert.ok(
      names.has(advisory.module),
      `${advisory.id} aponta para "${advisory.module}", que não é uma entrada do catálogo`
    )
  }
})
