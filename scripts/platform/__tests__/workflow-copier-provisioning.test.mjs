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

const COPIER_PROVISION_STEP = "pipx install copier"

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

for (const workflowPath of WORKFLOW_PATHS) {
  const relative = path.relative(ROOT_DIR, workflowPath)

  test(`GT7: todo job de ${relative} que roda um comando que renderiza um filho provisiona copier antes dele`, () => {
    const { jobs } = readWorkflow(workflowPath)
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
        `job "${jobName}" de ${relative} roda um comando que renderiza um filho mas não tem o step "run: ${COPIER_PROVISION_STEP}"`
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
