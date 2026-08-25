import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

// GT10 — a v2.4.0 saiu com um defeito que só afetava `web_stack=next` enquanto a
// própria corrida de release reportava 8/8 verde: o release.yml nunca rodava
// `template:smoke` e o `catalog:check` dele não tinha a dimensão `web_stack`,
// embora o ci.yml tivesse as duas coisas.
//
// O guard é a invariante, não a lista que ele avalia hoje: todo comando que o
// ci.yml roda num `push: main` tem de ser rodado por um job do release.yml que
// **gateia a tag** — e toda dimensão de matriz que o ci.yml declara tem de existir
// no job homônimo do release. Assim um check acrescentado ao CI amanhã não some
// do release em silêncio.
//
// Duas decisões deliberadas:
//
//  1. Só se exigem comandos `pnpm`/`pipx`. O que o ci.yml roda como shell cru é
//     encanamento do próprio workflow (o job `detect` decide se o checkout é o
//     template ou um filho); o release.yml responde a mesma pergunta pelo job
//     `marker`. Exigir aquele texto seria exigir que os dois workflows fossem o
//     mesmo arquivo, não que certificassem o mesmo.
//
//  2. Presença não basta: o comando tem de estar num job dentro do fecho
//     transitivo de `needs` do job `tag`. Um job que roda tudo e não é ancestral
//     de `tag` passa verde certificando nada — exatamente a classe de defeito que
//     deixou a v2.4.0 sair.

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(TESTS_DIR, "../../..")
const CI_PATH = path.join(ROOT_DIR, ".github/workflows/ci.yml")
const RELEASE_PATH = path.join(ROOT_DIR, ".github/workflows/release.yml")

const RELEASE_TERMINAL_JOB = "tag"
const PULL_REQUEST_ONLY_PATTERN = /github\.event_name\s*==\s*'pull_request'/
const GATE_COMMAND_PATTERN = /^(pnpm|pipx)\s/

function readWorkflow(filePath) {
  return parseYaml(readFileSync(filePath, "utf8"))
}

// Um step com `if: github.event_name == 'pull_request'` nunca roda num push a
// main, então o release não deve nada a ele.
function isPullRequestOnly(step) {
  return typeof step.if === "string" && PULL_REQUEST_ONLY_PATTERN.test(step.if)
}

function commandsOf(job) {
  return (job.steps ?? [])
    .filter((step) => typeof step.run === "string" && !isPullRequestOnly(step))
    .map((step) => step.run.trim())
}

// `needs` aceita string ou lista no schema do Actions.
function needsOf(job) {
  const needs = job?.needs
  if (typeof needs === "string") return [needs]
  return Array.isArray(needs) ? needs : []
}

// Fecho transitivo de `needs` a partir de `tag`, incluindo o próprio `tag`: os
// únicos jobs cuja falha impede a tag de ser criada e empurrada.
function jobsGatingTag(jobs, terminal = RELEASE_TERMINAL_JOB) {
  const reached = new Set()
  const pending = [terminal]
  while (pending.length > 0) {
    const name = pending.pop()
    if (reached.has(name) || !jobs[name]) continue
    reached.add(name)
    pending.push(...needsOf(jobs[name]))
  }
  return reached
}

// Todo comando de gate que o ci.yml roda num push a main.
function requiredCommands(ciJobs) {
  const commands = new Set()
  for (const job of Object.values(ciJobs)) {
    for (const command of commandsOf(job)) {
      if (GATE_COMMAND_PATTERN.test(command)) commands.add(command)
    }
  }
  return commands
}

// Comandos rodados por jobs do release que efetivamente gateiam a tag.
function commandsGatingTag(releaseJobs) {
  const gating = jobsGatingTag(releaseJobs)
  const commands = new Set()
  for (const name of gating) {
    for (const command of commandsOf(releaseJobs[name])) commands.add(command)
  }
  return commands
}

function findMissingCommands(ciJobs, releaseJobs) {
  const have = commandsGatingTag(releaseJobs)
  return [...requiredCommands(ciJobs)].filter((command) => !have.has(command))
}

function matrixDimensions(jobs, jobName) {
  const matrix = jobs[jobName]?.strategy?.matrix
  return matrix ? Object.keys(matrix).sort() : null
}

// Para todo job do ci.yml que declara matriz, o job homônimo do release.yml
// (`catalog`/`smoke` nomeiam a mesma coisa nos dois arquivos) tem de declarar ao
// menos as mesmas dimensões — e tem de gatear a tag.
function findMissingMatrixDimensions(ciJobs, releaseJobs) {
  const gating = jobsGatingTag(releaseJobs)
  const missing = []
  for (const name of Object.keys(ciJobs)) {
    const ciDims = matrixDimensions(ciJobs, name)
    if (!ciDims) continue
    const releaseDims = gating.has(name)
      ? (matrixDimensions(releaseJobs, name) ?? [])
      : []
    for (const dim of ciDims) {
      if (!releaseDims.includes(dim)) missing.push(`${name}.${dim}`)
    }
  }
  return missing
}

const ci = readWorkflow(CI_PATH)
const release = readWorkflow(RELEASE_PATH)

test("GT10: a premissa do guard continua válida — há job de matriz com web_stack no ci.yml e `tag` gateia jobs no release.yml", () => {
  const withWebStack = Object.keys(ci.jobs).filter((name) =>
    matrixDimensions(ci.jobs, name)?.includes("web_stack")
  )
  assert.ok(
    withWebStack.length > 0,
    "nenhum job do ci.yml carrega a dimensão web_stack — a premissa do GT10 depende de existir ao menos um"
  )

  const gating = jobsGatingTag(release.jobs)
  assert.ok(
    gating.has(RELEASE_TERMINAL_JOB),
    `release.yml não tem job "${RELEASE_TERMINAL_JOB}" — o job terminal foi renomeado?`
  )
  assert.ok(
    gating.size > 1,
    `o job "${RELEASE_TERMINAL_JOB}" não depende de nenhum outro job — nada gateia a tag`
  )

  assert.ok(
    requiredCommands(ci.jobs).size > 0,
    "nenhum comando de gate extraído do ci.yml — o filtro pnpm/pipx ficou obsoleto?"
  )
})

test("GT10: todo comando que o ci.yml roda em push:main também é rodado por um job do release.yml que gateia a tag", () => {
  const missing = findMissingCommands(ci.jobs, release.jobs)
  assert.deepEqual(
    missing,
    [],
    `o gate do release não roda comando(s) que o ci.yml roda em push:main: ${missing.join(" | ")}`
  )
})

test("GT10: toda dimensão de matriz declarada no ci.yml existe no job homônimo do release.yml", () => {
  const missing = findMissingMatrixDimensions(ci.jobs, release.jobs)
  assert.deepEqual(
    missing,
    [],
    `release.yml não declara dimensão(ões) de matriz que o job homônimo do ci.yml declara: ${missing.join(", ")}`
  )
})

// --- prova vermelha: o guard detecta de fato as três formas de o release ficar
// para trás, em vez de passar por construção sobre os arquivos de hoje.

test("GT10 prova vermelha: remover um comando exigido de um job do release.yml é pego", () => {
  const required = [...requiredCommands(ci.jobs)]
  assert.ok(required.length > 0, "nenhum comando exigido para a prova")
  const commandToDrop = required[0]

  const mutated = structuredClone(release.jobs)
  for (const job of Object.values(mutated)) {
    job.steps = (job.steps ?? []).filter(
      (step) => step.run?.trim() !== commandToDrop
    )
  }

  assert.ok(
    findMissingCommands(ci.jobs, mutated).includes(commandToDrop),
    `remover "${commandToDrop}" de todo job do release.yml não deixou a paridade de comandos vermelha`
  )
})

test("GT10 prova vermelha: remover uma dimensão de matriz de um job do release.yml é pego", () => {
  const [jobName, dimension] = (() => {
    for (const name of Object.keys(ci.jobs)) {
      const dims = matrixDimensions(ci.jobs, name)
      if (dims?.length) return [name, dims[0]]
    }
    return [undefined, undefined]
  })()
  assert.ok(jobName, "nenhum job com matriz para a prova")
  assert.ok(
    release.jobs[jobName]?.strategy?.matrix?.[dimension],
    `o job "${jobName}" do release.yml não tem a dimensão "${dimension}" — a correção está no lugar?`
  )

  const mutated = structuredClone(release.jobs)
  delete mutated[jobName].strategy.matrix[dimension]

  assert.ok(
    findMissingMatrixDimensions(ci.jobs, mutated).includes(
      `${jobName}.${dimension}`
    ),
    `remover "${dimension}" da matriz de "${jobName}" não deixou a paridade de matriz vermelha`
  )
})

test("GT10 prova vermelha: um job que roda o comando mas deixa de gatear a tag é pego", () => {
  const directNeeds = needsOf(release.jobs[RELEASE_TERMINAL_JOB])
  assert.ok(
    directNeeds.length > 0,
    `"${RELEASE_TERMINAL_JOB}" não declara needs`
  )

  // Ao menos um dos jobs de que `tag` depende tem de ser o único portador de
  // algum comando exigido: é isso que torna a alcançabilidade carga útil e não
  // decoração. O job segue existindo no arquivo mutado — só deixa de gatear.
  const detachable = directNeeds.filter((name) => {
    const mutated = structuredClone(release.jobs)
    mutated[RELEASE_TERMINAL_JOB].needs = directNeeds.filter(
      (other) => other !== name
    )
    return findMissingCommands(ci.jobs, mutated).length > 0
  })

  assert.ok(
    detachable.length > 0,
    `desligar qualquer job de "${RELEASE_TERMINAL_JOB}.needs" deixou a paridade verde — a checagem de alcançabilidade não está prendendo nada`
  )
})
