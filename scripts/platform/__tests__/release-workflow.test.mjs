import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(TESTS_DIR, "../../..")
const RELEASE_WORKFLOW_PATH = path.join(
  ROOT_DIR,
  ".github/workflows/release.yml"
)

function readWorkflow() {
  return parseYaml(readFileSync(RELEASE_WORKFLOW_PATH, "utf8"))
}

test("MARK-05: workflow_dispatch e seu input version não existem mais", () => {
  const doc = readWorkflow()
  assert.equal(doc.on.workflow_dispatch, undefined)
  assert.equal(doc.on.push?.branches?.[0], "main")
})

test("MARK-05: nenhum step carrega o guard de ref não-main que foi deletado", () => {
  const { jobs } = readWorkflow()
  for (const job of Object.values(jobs)) {
    for (const step of job.steps) {
      if (!step.run) continue
      const carriesGuard =
        /github\.ref/.test(step.run) &&
        /refs\/heads\/main/.test(step.run) &&
        /exit 1/.test(step.run)
      assert.equal(
        carriesGuard,
        false,
        `step "${step.name ?? step.run}" ainda carrega o guard deletado`
      )
    }
  }
})

test("MARK-04: jobs.marker.if existe e referencia head_commit.message — um push comum não sobe runner", () => {
  const { jobs } = readWorkflow()
  assert.ok(jobs.marker, "job marker não existe")
  assert.match(jobs.marker.if, /head_commit\.message/)
})

test("guarda de regressão: marker.if permanece frouxo — sem padrão de versão \\d/[0-9]", () => {
  const { jobs } = readWorkflow()
  assert.doesNotMatch(
    jobs.marker.if,
    /\\d|\[0-9\]/,
    "marker.if não pode validar a gramática da versão — isso reintroduziria o skip silencioso que MARK-06 existe para evitar"
  )
})

test("MARK-01: verify só roda quando needs.marker.outputs.release é true", () => {
  const { jobs } = readWorkflow()
  assert.equal(jobs.verify.needs, "marker")
  assert.equal(jobs.verify.if, "needs.marker.outputs.release == 'true'")
})

test("MARK-01: catalog só roda quando needs.marker.outputs.release é true", () => {
  const { jobs } = readWorkflow()
  assert.equal(jobs.catalog.if, "needs.marker.outputs.release == 'true'")
})

// MARK-03: a AC pede `needs: [verify, catalog]`; `marker` entra porque um job
// só lê outputs de quem está em `needs` diretamente. O conjunto é um
// superconjunto estrito — a garantia da AC (nenhuma tag sem gates verdes)
// continua de pé. Não trocar por igualdade.
test("MARK-03: tag.needs é um superconjunto de [verify, catalog]", () => {
  const { jobs } = readWorkflow()
  assert.ok(jobs.tag.needs.includes("verify"))
  assert.ok(jobs.tag.needs.includes("catalog"))
})

test("tag é o único job com permissions.contents write", () => {
  const { jobs } = readWorkflow()
  const jobsWithWrite = Object.entries(jobs)
    .filter(([, job]) => job.permissions?.contents === "write")
    .map(([name]) => name)
  assert.deepEqual(jobsWithWrite, ["tag"])
})

function releaseStep() {
  const { jobs } = readWorkflow()
  return jobs.tag.steps.find(
    (step) => step.run && /gh release create/.test(step.run)
  )
}

test("o job tag publica o GitHub Release depois que a tag existe no remoto", () => {
  const { jobs } = readWorkflow()
  const runs = jobs.tag.steps.map((step) => step.run).filter(Boolean)
  const pushIndex = runs.findIndex((run) =>
    /git push origin "v\$VERSION"/.test(run)
  )
  const releaseIndex = runs.findIndex((run) => /gh release create/.test(run))
  assert.ok(pushIndex >= 0, "o step que empurra a tag sumiu")
  assert.ok(releaseIndex >= 0, "nenhum step cria o GitHub Release")
  assert.ok(
    pushIndex < releaseIndex,
    "o Release precisa vir depois da tag — senão --verify-tag falha por construção"
  )
})

test("as notas do Release saem da seção do changelog, não de texto solto no YAML", () => {
  const step = releaseStep()
  assert.match(step.run, /release-preflight\.mjs --notes "\$VERSION"/)
  assert.match(step.run, /--notes-file/)
})

// Sem --verify-tag, `gh release create` cria a tag que faltar: um segundo
// caminho de tagueamento ao lado do step anterior, que AD-034 fecha.
test("o Release nunca cria uma tag: --verify-tag", () => {
  assert.match(releaseStep().run, /--verify-tag/)
})

test("o step do Release recebe GH_TOKEN — sem ele o gh falha só em runtime", () => {
  const step = releaseStep()
  assert.ok(step.env?.GH_TOKEN, "GH_TOKEN não está no env do step")
})

test("verify roda o release-preflight (com a versão do marker) antes de qualquer passo de gate", () => {
  const { jobs } = readWorkflow()
  const runs = jobs.verify.steps.map((step) => step.run).filter(Boolean)
  const preflightIndex = runs.findIndex((run) =>
    /release-preflight\.mjs "\$\{\{ needs\.marker\.outputs\.version \}\}"/.test(
      run
    )
  )
  assert.ok(
    preflightIndex >= 0,
    "release-preflight.mjs não encontrado nos passos de verify, ou não usa needs.marker.outputs.version"
  )
  const gatePatterns = [
    // GT10: `pnpm check` deu lugar a `pnpm turbo lint typecheck` — o mesmo
    // comando que o ci.yml roda, porque release-gate-parity.test.mjs compara o
    // texto e um alias equivalente não satisfaz a paridade.
    /^pnpm turbo lint typecheck$/,
    /^pnpm --filter api build:emit$/,
    /^pnpm turbo build --filter=web$/,
    /^pnpm contract:check$/,
    /^pnpm test$/,
    /^pnpm test:scripts$/,
    /^pnpm catalog:lint$/,
    /^pnpm catalog:typecheck$/,
    /^pnpm catalog:eslint$/,
  ]
  for (const pattern of gatePatterns) {
    const gateIndex = runs.findIndex((run) => pattern.test(run.trim()))
    assert.ok(gateIndex >= 0, `passo de gate ${pattern} não encontrado`)
    assert.ok(
      preflightIndex < gateIndex,
      `preflight deve rodar antes de ${pattern}`
    )
  }
})
