import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { renderChild } from "../lib/child.mjs"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")

// Mesma exceção de docs-no-owner-infra.test.mjs (T16): "preserva*" e
// "reservad[oa]s" respondem por ~110 dos 241 hits crus de "reserva" no repo
// (research.md § Domain vocabulary) e não têm nada a ver com o domínio de
// hospedagem do piloto — sem esta exceção o gate erra na primeira leva e é
// desligado.
const RESERVA_EXCLUDE = /^(?:preserv\w*|reservad[oa]s?)$/i

const OWNER_DOMAIN_TERMS = [
  /h[oó]sped(?:es|e)/i,
  /acomodaç(?:[aã]o|[oõ]es)/i,
  /recepç(?:[aã]o|[oõ]es)/i,
  /agendamento/i,
  /\bquartos?\b/i,
  /\bguests?\b/i,
  /\bbookings?\b/i,
]

const OWNER_INFRA_TERMS = [
  /\bAWS\b/,
  /\bEC2\b/,
  /\bDokploy\b/i,
  /\bCloudflare\b/i,
  /\bResend\b/i,
  /\bTraefik\b/i,
  /\bSwarm\b/i,
  /\bMySQL\b/i,
  /~\/\.local\/bin/,
  /\bus-east-2\b/,
  /\bsa-east-1\b/,
]

// Chave no prefixo do cookie/storage, nunca no nome da empresa — que não
// sobrevive ao copier em lugar nenhum (`.specs/` e `docs/platform_template/`
// ficam fora de `_exclude`, então nunca chegam ao child renderizado).
const BRAND_TOKENS = [/rit_/, /rit-/, /__Host-rit/]

// TZ-01: o fuso do dono, nunca outro fuso IANA qualquer (que é exemplo
// legítimo em erro de validação e em teste).
const TIMEZONE_TOKENS = [/America\/Sao_Paulo/]

// Escopo desta release: docs, o harness de agente e os workflows de CI do
// child renderizado — domínio e infra do dono continuam restritos aqui.
const SCAN_ROOTS = ["docs", ".claude", ".github/workflows"]

// T55: v3.0.0 renomeia cookie e timezone em código (SEAM-05, TZ-01). Só brand
// e timezone rodam neste escopo — domínio/infra sobre todo apps/api/src é um
// problema pré-existente muito maior, fora do que T55 pede.
const CODE_SCAN_ROOTS = ["apps/api/src"]

// SPEC_DEVIATION: docs/dev/template-changelog.md tem uma ocorrência que este
// teste não pode corrigir editando o arquivo — está fora de `Touches` de T46
// (CF1 possui apenas scripts/platform/__tests__/** e
// .claude/hooks/specs-in-english.mjs).
//   - "Cloudflare"/"Traefik" (:228) — exemplo genérico de cadeia de proxy pra
//     explicar TRUST_PROXY_HOPS, não a infra do dono (exceção pré-existente
//     de T46).
// A antiga entrada "booking" (:67) foi removida por GT5: a linha foi
// reescrita para não citar o termo de domínio, então o scan end-to-end volta
// a cobrir o arquivo de verdade em vez de crescer a exceção a cada release.
// Reason: reescrever a linha do Cloudflare/Traefik exige editar um arquivo
// fora do escopo desta task; sem a exceção o teste vermelho bloquearia por um
// arquivo que T46 não pode tocar.
// SPEC_DEVIATION: T55 estende o scan a apps/api/src (SEAM-05/TZ-01) e
// encontra 4 usos legítimos fora do Touches desta task — nenhum é o dono
// vazando, e nenhum arquivo abaixo pertence a este cluster (C15) para editar.
// Reason:
//   - openapi-config.spec.ts:177 — a asserção negativa que prova a ausência
//     do prefixo de brand carrega o próprio literal na regex.
//   - env.ts:76, bucket-sql.spec.ts:34-35, maintenance-registry.spec.ts:132,145
//     — "America/Sao_Paulo" como exemplo de fuso IANA válido (mensagem de
//     erro/fixture de teste), não o default hard-coded que TZ-01 eliminou.
//   - docs/advisories/ADV-20260824-03.md:36-37, ADV-20260824-04.md:8,31 — a
//     advisory de migração do C14 cita os valores `2.x` (`__Host-rit_session`,
//     `rit_csrf`, `America/Sao_Paulo`) de propósito, como escape hatch pra
//     quem não pode trocar agora; não é o dono vazando, é o texto que explica
//     a mudança quebrada.
//   - docs/advisories/ADV-20260825-03.md, ADV-20260825-04.md (T49f) — mesmo
//     motivo: a advisory manda o child procurar `rit_session`/`rit_device` nos
//     specs copiados e declarar `America/Sao_Paulo` no int-spec, então o passo
//     a passo carrega os literais que o gate bane. Sem citá-los a advisory não
//     é acionável.
const KNOWN_EXCEPTIONS = {
  "docs/dev/template-changelog.md": ["Cloudflare", "Traefik"],
  "apps/api/src/openapi/openapi-config.spec.ts": ["rit_", "rit-", "__Host-rit"],
  "apps/api/src/shared/config/env.ts": ["America/Sao_Paulo"],
  "apps/api/src/shared/kernel/clock/bucket-sql.spec.ts": ["America/Sao_Paulo"],
  "apps/api/src/shared/kernel/scheduling/maintenance-registry.spec.ts": [
    "America/Sao_Paulo",
  ],
  "docs/advisories/ADV-20260824-03.md": ["rit_", "__Host-rit"],
  "docs/advisories/ADV-20260824-04.md": ["America/Sao_Paulo"],
  "docs/advisories/ADV-20260825-03.md": ["rit_", "America/Sao_Paulo"],
  "docs/advisories/ADV-20260825-04.md": ["America/Sao_Paulo"],
}

function withoutKnownExceptions(hits, rel) {
  const allowed = KNOWN_EXCEPTIONS[rel] ?? []
  return hits.filter((hit) => !allowed.includes(hit))
}

function domainHits(text) {
  const hits = []
  for (const term of OWNER_DOMAIN_TERMS) {
    const match = text.match(term)
    if (match) hits.push(match[0])
  }
  for (const match of text.matchAll(/\b\w*reserva\w*\b/gi)) {
    if (!RESERVA_EXCLUDE.test(match[0])) hits.push(match[0])
  }
  return hits
}

function infraHits(text) {
  const hits = []
  for (const term of OWNER_INFRA_TERMS) {
    const match = text.match(term)
    if (match) hits.push(match[0])
  }
  return hits
}

function brandHits(text) {
  const hits = []
  for (const term of BRAND_TOKENS) {
    const match = text.match(term)
    if (match) hits.push(match[0])
  }
  return hits
}

function timezoneHits(text) {
  const hits = []
  for (const term of TIMEZONE_TOKENS) {
    const match = text.match(term)
    if (match) hits.push(match[0])
  }
  return hits
}

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(abs))
    else if (entry.isFile()) files.push(abs)
  }
  return files
}

function scannedFiles(childDir, roots) {
  return roots.flatMap((root) => {
    const abs = path.join(childDir, root)
    try {
      return statSync(abs).isDirectory() ? walk(abs) : [abs]
    } catch {
      return []
    }
  })
}

// Compartilhado pelo teste fim a fim e pelo teste de mutante abaixo: os dois
// precisam passar pelo mesmo caminho de código, senão o segundo não prova
// nada sobre o primeiro (o mutante da Verifier — brandHits/infraHits sem
// domainHits no loop — teria que sobreviver aos dois).
function violationsIn(childDir, files) {
  const violations = []
  for (const file of files) {
    const text = readFileSync(file, "utf8")
    const rel = path.relative(childDir, file)
    const brand = withoutKnownExceptions(brandHits(text), rel)
    if (brand.length > 0)
      violations.push(`${rel} carrega um token de brand: ${brand.join(", ")}`)
    const infra = withoutKnownExceptions(infraHits(text), rel)
    if (infra.length > 0)
      violations.push(
        `${rel} carrega um substantivo de infra do dono: ${infra.join(", ")}`
      )
    const domain = withoutKnownExceptions(domainHits(text), rel)
    if (domain.length > 0)
      violations.push(
        `${rel} carrega vocabulário de domínio do piloto: ${domain.join(", ")}`
      )
    const timezone = withoutKnownExceptions(timezoneHits(text), rel)
    if (timezone.length > 0)
      violations.push(
        `${rel} carrega o fuso horário hard-coded do dono: ${timezone.join(", ")}`
      )
  }
  return violations
}

// T55: só brand e timezone — domínio/infra sobre CODE_SCAN_ROOTS não é o que
// esta task pede (ver comentário de CODE_SCAN_ROOTS).
function codeViolationsIn(childDir, files) {
  const violations = []
  for (const file of files) {
    const text = readFileSync(file, "utf8")
    const rel = path.relative(childDir, file)
    const brand = withoutKnownExceptions(brandHits(text), rel)
    if (brand.length > 0)
      violations.push(`${rel} carrega um token de brand: ${brand.join(", ")}`)
    const timezone = withoutKnownExceptions(timezoneHits(text), rel)
    if (timezone.length > 0)
      violations.push(
        `${rel} carrega o fuso horário hard-coded do dono: ${timezone.join(", ")}`
      )
  }
  return violations
}

let childDir

test.before(() => {
  childDir = mkdtempSync(path.join(tmpdir(), "brand-hygiene-"))
  const result = renderChild({
    repoRoot: REPO_ROOT,
    targetDir: childDir,
    run: (command, args, options) =>
      spawnSync(command, args, { encoding: "utf8", ...options }),
  })
  assert.equal(result.status, 0, `copier copy falhou: ${result.stderr}`)
})

test.after(() => {
  if (childDir) rmSync(childDir, { recursive: true, force: true })
})

test('self-test: o termo excluído "preservar" não dispara o guard de domínio', () => {
  assert.deepEqual(domainHits("o método deve preservar o estado existente"), [])
})

test('self-test: o termo excluído "reservado" não dispara o guard de domínio', () => {
  assert.deepEqual(domainHits("o campo fica reservado para uso futuro"), [])
})

test('self-test: o termo excluído "state-preservation" não dispara o guard de domínio', () => {
  assert.deepEqual(
    domainHits("a rotina de state-preservation do vendor cuida do resto"),
    []
  )
})

test('self-test: o token de brand "rit_" é detectado', () => {
  assert.deepEqual(brandHits("COOKIE_NAME = rit_session"), ["rit_"])
})

test('self-test: o token de brand "rit-" é detectado', () => {
  assert.deepEqual(brandHits("id do produto: rit-platform"), ["rit-"])
})

test('self-test: o token de brand "__Host-rit" é detectado', () => {
  assert.deepEqual(
    brandHits("prefixo de cookie: __Host-rit vem antes do nome"),
    ["__Host-rit"]
  )
})

test("self-test: o guard não é vazio — vocabulário real de infra ainda dispara", () => {
  assert.deepEqual(
    infraHits(
      "Deploy runs through Dokploy on an AWS EC2 VM behind Cloudflare."
    ),
    ["AWS", "EC2", "Dokploy", "Cloudflare"]
  )
})

test("fim a fim: docs, harness e workflows do child renderizado não carregam brand, domínio ou infra do dono", () => {
  const files = scannedFiles(childDir, SCAN_ROOTS)
  assert.ok(
    files.length > 0,
    "esperava arquivos varríveis em docs/.claude/.github/workflows do child renderizado"
  )
  assert.deepEqual(violationsIn(childDir, files), [])
})

test("mutante: cada substantivo de domínio do piloto semeado no child renderizado derruba o gate", () => {
  const seedRel = path.join("docs", "_seed-domain-hygiene.md")
  const seedAbs = path.join(childDir, seedRel)
  const seeds = ["Hospedes", "Reservas", "agendamento", "quartos", "guests"]
  try {
    for (const noun of seeds) {
      writeFileSync(
        seedAbs,
        `Texto de teste que menciona ${noun} no meio da frase.\n`
      )
      const violations = violationsIn(childDir, [seedAbs])
      assert.ok(
        violations.some((v) => v.includes(noun)),
        `esperava que "${noun}" derrubasse o gate de higiene de domínio; violações: ${violations.join(" | ")}`
      )
    }
  } finally {
    rmSync(seedAbs, { force: true })
  }
})

test('self-test: o fuso horário do dono "America/Sao_Paulo" é detectado', () => {
  assert.deepEqual(timezoneHits("APP_TIMEZONE=America/Sao_Paulo"), [
    "America/Sao_Paulo",
  ])
})

test("self-test: outro fuso IANA válido não dispara o guard de timezone", () => {
  assert.deepEqual(timezoneHits("APP_TIMEZONE=America/New_York"), [])
})

test("fim a fim (código): apps/api/src do child renderizado não carrega brand nem fuso hard-coded do dono", () => {
  const files = scannedFiles(childDir, CODE_SCAN_ROOTS)
  assert.ok(
    files.length > 0,
    "esperava arquivos varridos sob apps/api/src do child renderizado"
  )
  assert.deepEqual(codeViolationsIn(childDir, files), [])
})

test("mutante: __Host-rit, rit_, rit- e America/Sao_Paulo semeados no código do child derrubam o gate", () => {
  const seedRel = path.join("apps", "api", "src", "_seed-code-hygiene.ts")
  const seedAbs = path.join(childDir, seedRel)
  const seeds = ["__Host-rit", "rit_", "rit-", "America/Sao_Paulo"]
  try {
    for (const token of seeds) {
      writeFileSync(seedAbs, `// código de teste que carrega ${token} solto\n`)
      const violations = codeViolationsIn(childDir, [seedAbs])
      assert.ok(
        violations.some((v) => v.includes(token)),
        `esperava que "${token}" derrubasse o gate no código do child; violações: ${violations.join(" | ")}`
      )
    }
  } finally {
    rmSync(seedAbs, { force: true })
  }
})
