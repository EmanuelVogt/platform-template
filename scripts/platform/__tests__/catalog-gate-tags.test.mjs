import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(TESTS_DIR, "../../..")

const WORKFLOWS = ["ci.yml", "release.yml"]

// `catalog:lint` chama `lintEntryBump`, que compara cada entrada com a última
// tag estável `v*` alcançável a partir de HEAD. O checkout padrão do
// actions/checkout é raso e não traz tag alguma, então o gate morre com
// "nenhuma tag estável v* alcançável" antes de olhar uma entrada sequer —
// e o job que roda `catalog:check` chega lá por dentro, sem citar
// `catalog:lint` em nenhum `run`.
const TAG_DEPENDENT = /pnpm catalog:(lint|check)\b/

function readWorkflow(file) {
  return parseYaml(
    readFileSync(path.join(ROOT_DIR, ".github/workflows", file), "utf8")
  )
}

function checkoutStepOf(job) {
  return job.steps.find(
    (step) =>
      typeof step.uses === "string" && step.uses.startsWith("actions/checkout@")
  )
}

function tagDependentJobs(file) {
  const { jobs } = readWorkflow(file)
  return Object.entries(jobs).filter(([, job]) =>
    (job.steps ?? []).some((step) => step.run && TAG_DEPENDENT.test(step.run))
  )
}

for (const file of WORKFLOWS) {
  test(`${file}: todo job que roda catalog:lint ou catalog:check faz checkout com fetch-depth 0`, () => {
    const jobs = tagDependentJobs(file)
    assert.ok(
      jobs.length > 0,
      `nenhum job de ${file} roda catalog:lint/catalog:check — o teste perdeu o alvo`
    )
    for (const [name, job] of jobs) {
      const checkout = checkoutStepOf(job)
      assert.ok(checkout, `job "${name}" de ${file} não faz checkout`)
      assert.equal(
        checkout.with?.["fetch-depth"],
        0,
        `job "${name}" de ${file} faz checkout raso: catalog:lint precisa das tags v* e falha antes de olhar uma entrada`
      )
    }
  })
}

test("ci.yml: os jobs cobertos são exatamente gates e catalog", () => {
  assert.deepEqual(
    tagDependentJobs("ci.yml").map(([name]) => name),
    ["gates", "catalog"]
  )
})

test("release.yml: os jobs cobertos são exatamente verify e catalog", () => {
  assert.deepEqual(
    tagDependentJobs("release.yml").map(([name]) => name),
    ["verify", "catalog"]
  )
})
