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
const API_CLIENT_DIR = "packages/api-client"
const KUBB_CONFIG_PATH = path.join(ROOT_DIR, API_CLIENT_DIR, "kubb.config.ts")

function readYaml(filePath) {
  return parseYaml(readFileSync(filePath, "utf8"))
}

function allRunSteps(jobs) {
  return Object.values(jobs).flatMap((job) =>
    (job.steps ?? []).map((step) => step.run).filter(Boolean)
  )
}

// Corta em `plugins:` antes de procurar `output: { path: ... }`: os plugins
// (pluginTs/pluginZod/pluginReactQuery) também declaram `output.path`, só que
// como subdiretório do output de topo — sem o corte, o primeiro match poderia
// pegar um deles em vez do output raiz do defineConfig.
function deriveKubbOutputPath() {
  const source = readFileSync(KUBB_CONFIG_PATH, "utf8")
  const start = source.indexOf("defineConfig(")
  assert.ok(start !== -1, "kubb.config.ts não chama defineConfig(...)")
  const pluginsIndex = source.indexOf("plugins:", start)
  const topLevelBody = source.slice(
    start,
    pluginsIndex === -1 ? undefined : pluginsIndex
  )

  const rootMatch = topLevelBody.match(/root:\s*["']([^"']+)["']/)
  const outputMatch = topLevelBody.match(
    /output:\s*{\s*path:\s*["']([^"']+)["']/
  )
  assert.ok(rootMatch, "kubb.config.ts não declara `root` no nível de topo")
  assert.ok(
    outputMatch,
    "kubb.config.ts não declara `output.path` no nível de topo"
  )

  return path.posix.normalize(
    path.posix.join(API_CLIENT_DIR, rootMatch[1], outputMatch[1])
  )
}

test("TOOL-11/T57a: contract:check cobre openapi.json, src/ escrito à mão e o output real do Kubb — derivado de kubb.config.ts", () => {
  const { scripts } = JSON.parse(
    readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")
  )
  const kubbOutputPath = deriveKubbOutputPath()
  assert.equal(
    scripts["contract:check"],
    `pnpm contract && git diff --exit-code openapi.json ${API_CLIENT_DIR}/src ${kubbOutputPath}`
  )
})

test("T57a: generated/.kubb/ segue ignorado — o diretório de scratch do Kubb não deve fazer o check tropeçar", () => {
  const kubbOutputPath = deriveKubbOutputPath()
  const outputDirName = path.posix.basename(kubbOutputPath)
  const gitignore = readFileSync(
    path.join(ROOT_DIR, API_CLIENT_DIR, ".gitignore"),
    "utf8"
  )
  assert.ok(
    gitignore
      .split("\n")
      .map((line) => line.trim())
      .includes(`${outputDirName}/.kubb/`),
    `.gitignore de ${API_CLIENT_DIR} não ignora mais ${outputDirName}/.kubb/`
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
