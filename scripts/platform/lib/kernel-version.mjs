import { existsSync, readFileSync, writeFileSync } from "node:fs"
import semver from "semver"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"

const CHANGELOG_HEADING = /^## v(\d+\.\d+\.\d+)\s*$/gm
const MIGRATION_STEPS_SENTINEL = "None — copier update is enough."
const MIGRATION_STEPS_HEADING = /^### Child migration steps.*$/m

export class ChangelogVersionMissingError extends Error {
  constructor() {
    super(
      'nenhuma seção "## vX.Y.Z" encontrada em docs/dev/template-changelog.md'
    )
    this.name = "ChangelogVersionMissingError"
  }
}

export class ChangelogSectionMissingError extends Error {
  constructor(version) {
    super(`nenhuma seção "## v${version}" encontrada no changelog`)
    this.name = "ChangelogSectionMissingError"
    this.version = version
  }
}

export function readLatestChangelogVersion(changelogPath) {
  let text
  try {
    text = readFileSync(changelogPath, "utf8")
  } catch {
    throw new ChangelogVersionMissingError()
  }
  const versions = [...text.matchAll(CHANGELOG_HEADING)].map(
    (match) => match[1]
  )
  if (versions.length === 0) throw new ChangelogVersionMissingError()
  return versions.reduce((latest, version) =>
    semver.gt(version, latest) ? version : latest
  )
}

// Fatia a seção de uma versão: do heading "## vX.Y.Z" (exclusive) até o
// próximo heading "## vX.Y.Z" (exclusive) ou o fim do arquivo.
export function readChangelogSection(changelogPath, version) {
  let text
  try {
    text = readFileSync(changelogPath, "utf8")
  } catch {
    throw new ChangelogSectionMissingError(version)
  }
  const headingRe = new RegExp(
    `^## v${version.replace(/\./g, "\\.")}\\s*$`,
    "m"
  )
  const match = headingRe.exec(text)
  if (!match) throw new ChangelogSectionMissingError(version)
  const rest = text.slice(match.index + match[0].length)
  const nextHeadingRe = /^## v\d+\.\d+\.\d+\s*$/m
  const nextMatch = nextHeadingRe.exec(rest)
  return (nextMatch ? rest.slice(0, nextMatch.index) : rest).trim()
}

// Primeiro parágrafo da seção: até a primeira linha em branco ou o primeiro
// heading (### Changes, ### Child migration steps), o que vier primeiro.
export function sectionFirstParagraph(section) {
  const trimmed = section.trim()
  const blankLineIdx = trimmed.search(/\n[ \t]*\n/)
  const headingIdx = trimmed.search(/^#{2,3} /m)
  let end = trimmed.length
  if (blankLineIdx !== -1) end = Math.min(end, blankLineIdx)
  if (headingIdx !== -1) end = Math.min(end, headingIdx)
  return trimmed.slice(0, end).trim()
}

// REL-05 / MIG-03: para versões não-major, "### Child migration steps" só
// pode ser o sentinel literal ou passos numerados cujo primeiro token é um
// comando entre crases. Versões major (X.0.0) ficam livres (passos manuais
// são esperados). Retorna { ok, reason } em vez de lançar — puro e testável.
export function lintChildMigrationSteps(section, version) {
  const parsed = semver.parse(version)
  if (!parsed) throw new TypeError(`versão inválida: ${version}`)
  const isMajor = parsed.minor === 0 && parsed.patch === 0
  if (isMajor) return { ok: true }

  const headingMatch = MIGRATION_STEPS_HEADING.exec(section)
  if (!headingMatch) {
    return {
      ok: false,
      reason: 'seção "### Child migration steps" não encontrada',
    }
  }
  const afterHeading = section.slice(
    headingMatch.index + headingMatch[0].length
  )
  const nextHeadingRe = /^#{2,3} /m
  const nextMatch = nextHeadingRe.exec(afterHeading)
  const body = (
    nextMatch ? afterHeading.slice(0, nextMatch.index) : afterHeading
  ).trim()

  if (body === MIGRATION_STEPS_SENTINEL) return { ok: true }

  const stepRe = /^(\d+)\.\s+(.*)$/gm
  const steps = [...body.matchAll(stepRe)]
  if (steps.length === 0) {
    return {
      ok: false,
      reason: `"### Child migration steps" precisa ser "${MIGRATION_STEPS_SENTINEL}" ou uma lista numerada; nenhuma das duas foi encontrada`,
    }
  }
  for (const [, stepNumber, rest] of steps) {
    if (!/^`[^`]+`/.test(rest.trim())) {
      return {
        ok: false,
        reason: `passo ${stepNumber} de "### Child migration steps" não começa com um comando entre crases: "${rest.trim().slice(0, 60)}"`,
      }
    }
  }
  return { ok: true }
}

// Não lança em arquivo ausente (diferente de readLatestChangelogVersion): a
// ausência já é reportada por quem chama, então [] aqui evita duplicar o erro.
export function readChangelogHeadings(changelogPath) {
  let text
  try {
    text = readFileSync(changelogPath, "utf8")
  } catch {
    return []
  }
  return [...text.matchAll(CHANGELOG_HEADING)].map((match) => match[1])
}

// O kernel version é o semver-max de todos os headings do changelog
// (readLatestChangelogVersion): uma segunda seção aberta acima da tag estável
// torna a mais baixa das duas unreleasable (release-preflight recusa
// `version !== latest`) e seus "Child migration steps" perdem a tag em que
// iam pendurar — aconteceu em espírito com v2.3.0 (duas sessões numa seção só).
export function lintOpenChangelogSections({ headings, stableTags }) {
  const normalizedTags = (stableTags ?? [])
    .map((tag) => tag.replace(/^v/, ""))
    .filter((tag) => semver.valid(tag))
  if (normalizedTags.length === 0) {
    return {
      ok: true,
      skipped:
        "nenhuma tag estável local (vX.Y.Z) — clone novo sem tags ainda; a checagem de seção aberta não se aplica",
    }
  }
  const maxTag = normalizedTags.reduce((max, tag) =>
    semver.gt(tag, max) ? tag : max
  )
  const openHeadings = (headings ?? [])
    .map((heading) => heading.replace(/^v/, ""))
    .filter((heading) => semver.valid(heading) && semver.gt(heading, maxTag))
  if (openHeadings.length <= 1) return { ok: true }
  const offending = openHeadings.map((version) => `v${version}`).join(", ")
  return {
    ok: false,
    reason: `mais de uma seção "## vX.Y.Z" aberta acima da tag estável mais recente (v${maxTag}): ${offending} — dobre o rascunho mais novo na seção aberta existente; uma versão aberta por vez, a próxima só abre depois que a anterior for tagueada`,
  }
}

export function writeSimulatedKernelVersion({ answersPath, kernelVersion }) {
  if (!existsSync(answersPath)) return false
  const answers = parseYaml(readFileSync(answersPath, "utf8")) ?? {}
  answers._commit = `v${kernelVersion}`
  writeFileSync(answersPath, stringifyYaml(answers))
  return true
}
