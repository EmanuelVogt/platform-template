import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"
import { TEMPLATE_ONLY_FILES } from "../lib/apply.mjs"

const ROOT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const CI_WORKFLOW_PATH = path.join(ROOT_DIR, ".github/workflows/ci.yml")

function readYaml(filePath) {
  return parseYaml(readFileSync(filePath, "utf8"))
}

function allRunSteps(jobs) {
  return Object.values(jobs).flatMap((job) =>
    (job.steps ?? []).map((step) => step.run).filter(Boolean)
  )
}

test("TOOL-11: package.json expõe contract:check = pnpm contract + diff sem sujeira no contrato gerado", () => {
  const { scripts } = JSON.parse(
    readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")
  )
  assert.equal(
    scripts["contract:check"],
    "pnpm contract && git diff --exit-code openapi.json packages/api-client/src"
  )
})

test("TOOL-11: um job de ci.yml sem o `if` template-only de `gates` roda contract:check — sobrevive ao module add", () => {
  const { jobs } = readYaml(CI_WORKFLOW_PATH)
  const runsContractCheck = Object.entries(jobs).filter(([, job]) =>
    (job.steps ?? []).some((step) => step.run === "pnpm contract:check")
  )
  assert.equal(
    runsContractCheck.length,
    1,
    "esperava exatamente um job rodando `pnpm contract:check`"
  )
  const [jobName, job] = runsContractCheck[0]
  assert.notEqual(
    jobName,
    "gates",
    "o job `gates` é template-only (if: needs.detect.outputs.template) e nunca roda no filho"
  )
  assert.equal(
    job.if,
    undefined,
    `job "${jobName}" não pode ter a condição template-only de gates`
  )
})

test("TOOL-11: format:check NÃO entra em ci.yml (§ 0.2 — o gate de formato é template-only, em format.yml)", () => {
  const { jobs } = readYaml(CI_WORKFLOW_PATH)
  assert.ok(
    !allRunSteps(jobs).some((run) => run.includes("format:check")),
    "ci.yml não deve rodar format:check em nenhum job"
  )
})

test("TOOL-11: nem package.json nem .github/workflows/ci.yml estão em TEMPLATE_ONLY_FILES — o step chega ao filho", () => {
  assert.ok(!TEMPLATE_ONLY_FILES.includes("package.json"))
  assert.ok(!TEMPLATE_ONLY_FILES.includes(".github/workflows/ci.yml"))
})
