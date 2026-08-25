import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(TESTS_DIR, "../../..")
const WORKFLOW_PATHS = [
  path.join(ROOT_DIR, ".github/workflows/ci.yml"),
  path.join(ROOT_DIR, ".github/workflows/release.yml"),
]

// Versão que TOOL-13 validou empiricamente (scripts/platform/__tests__/copier-questions.test.mjs:78,
// comentário de linha 62) — não é arbitrária, é a baseline do comportamento de render que aquele
// teste assume.
const COPIER_VERSION = "9.17.2"
const COPIER_PROVISION_STEP = `pipx install 'copier==${COPIER_VERSION}'`

const COPIER_INSTALL_STEP_PATTERN =
  /^pipx install (?:'copier==([^']+)'|copier)$/

// GT7: nenhum nome de job é hardcoded aqui de propósito — o padrão abaixo é a
// única fonte da verdade sobre "o que renderiza um filho": qualquer comando
// pnpm que bata nele precisa do binário `copier` no PATH do runner. Um job
// futuro que rode um desses comandos entra na cobertura sem editar este
// arquivo; um job que só rode `catalog:lint`/`catalog:typecheck` (que não
// renderizam nada) fica de fora, como hoje.
const RENDERS_CHILD_PATTERN = /\b(catalog:check|test:scripts|template:smoke)\b/

function readWorkflow(filePath) {
  return parseYaml(readFileSync(filePath, "utf8"))
}

function jobsThatRenderAChild(jobs) {
  return Object.entries(jobs).filter(([, job]) =>
    (job.steps ?? []).some(
      (step) =>
        typeof step.run === "string" && RENDERS_CHILD_PATTERN.test(step.run)
    )
  )
}

// GT8: varre TODOS os jobs, não só os que batem em RENDERS_CHILD_PATTERN — um site pinado
// errado num job que ainda não precisa de copier hoje já quebra a concordância de versão.
function copierInstallSites(jobs, workflowRelativePath) {
  const sites = []
  for (const [jobName, job] of Object.entries(jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run !== "string") continue
      const match = step.run.match(COPIER_INSTALL_STEP_PATTERN)
      if (match) {
        sites.push({
          workflow: workflowRelativePath,
          jobName,
          run: step.run,
          version: match[1],
        })
      }
    }
  }
  return sites
}

const workflows = WORKFLOW_PATHS.map((workflowPath) => ({
  relative: path.relative(ROOT_DIR, workflowPath),
  jobs: readWorkflow(workflowPath).jobs,
}))

const allCopierInstallSites = workflows.flatMap(({ relative, jobs }) =>
  copierInstallSites(jobs, relative)
)

for (const { relative, jobs } of workflows) {
  test(`GT7: todo job de ${relative} que roda um comando que renderiza um filho provisiona copier pinado antes dele`, () => {
    const jobsNeedingCopier = jobsThatRenderAChild(jobs)
    assert.ok(
      jobsNeedingCopier.length > 0,
      `nenhum job de ${relative} bateu em ${RENDERS_CHILD_PATTERN} — o padrão ficou obsoleto?`
    )

    for (const [jobName, job] of jobsNeedingCopier) {
      const steps = job.steps ?? []
      const provisionIndex = steps.findIndex(
        (step) => step.run === COPIER_PROVISION_STEP
      )
      assert.ok(
        provisionIndex >= 0,
        `job "${jobName}" de ${relative} roda um comando que renderiza um filho mas não tem o step "run: ${COPIER_PROVISION_STEP}" — falta o step ou falta o pin de versão`
      )

      const renderIndexes = steps
        .map((step, index) => ({ step, index }))
        .filter(
          ({ step }) =>
            typeof step.run === "string" && RENDERS_CHILD_PATTERN.test(step.run)
        )
        .map(({ index }) => index)
      for (const renderIndex of renderIndexes) {
        assert.ok(
          provisionIndex < renderIndex,
          `job "${jobName}" de ${relative}: "${COPIER_PROVISION_STEP}" precisa rodar antes do step no índice ${renderIndex} (que renderiza um filho) — instalar depois reproduz a falha "status === null" da release 32795089578`
        )
      }
    }
  })
}

test("GT8: todo provisionamento de copier nos workflows está pinado numa versão", () => {
  assert.ok(
    allCopierInstallSites.length > 0,
    'nenhum step "pipx install copier" encontrado nos workflows — o padrão ficou obsoleto?'
  )
  for (const site of allCopierInstallSites) {
    assert.ok(
      site.version,
      `job "${site.jobName}" de ${site.workflow} roda "${site.run}" sem pin de versão — deveria ser "${COPIER_PROVISION_STEP}"`
    )
  }
})

test("GT8: todos os provisionamentos de copier concordam na mesma versão, a que TOOL-13 validou", () => {
  const versions = new Set(allCopierInstallSites.map((site) => site.version))
  assert.equal(
    versions.size,
    1,
    `sites de provisionamento de copier discordam de versão: ${allCopierInstallSites
      .map(
        (site) =>
          `${site.workflow}#${site.jobName}=${site.version ?? "unpinned"}`
      )
      .join(", ")}`
  )
  assert.equal(
    [...versions][0],
    COPIER_VERSION,
    `versão pinada não é a que TOOL-13 validou empiricamente (copier-questions.test.mjs:78, copier ${COPIER_VERSION})`
  )
})
