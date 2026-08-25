import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(TESTS_DIR, "../../..")
const ROOT_PACKAGE_JSON_PATH = path.join(ROOT_DIR, "package.json")
const TURBO_JSON_PATH = path.join(ROOT_DIR, "turbo.json")
// O shell web renderizado mora em `apps/web`; neste repositório do template os
// dois shells convivem como `apps/web-vite`/`apps/web-next` (L-016: derivar do
// que existe, nunca do nome de diretório do template).
const WEB_PACKAGE_JSON_PATHS = ["apps/web", "apps/web-vite", "apps/web-next"]
  .map((dir) => path.join(ROOT_DIR, dir, "package.json"))
  .filter((file) => existsSync(file))
const API_PACKAGE_JSON_PATH = path.join(ROOT_DIR, "apps/api/package.json")
const LEFTHOOK_PATH = path.join(ROOT_DIR, "lefthook.yml")
const LEFTHOOK_LOCAL_PATH = path.join(ROOT_DIR, "lefthook-local.yml")
const CI_WORKFLOW_PATH = path.join(ROOT_DIR, ".github/workflows/ci.yml")
const CATALOG_WORKFLOW_PATH = path.join(
  ROOT_DIR,
  ".github/workflows/catalog.yml"
)

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function readYaml(filePath) {
  return parseYaml(readFileSync(filePath, "utf8"))
}

function allRunSteps(jobs) {
  return Object.values(jobs).flatMap((job) =>
    (job.steps ?? []).map((step) => step.run).filter(Boolean)
  )
}

// T38: comandos do pre-push mesclados por `priority` — mesma leitura que o
// lefthook 2.x faz para decidir ordem de execução (confirmado ao vivo com
// `lefthook run pre-push --verbose`; sem `priority` explícita ele ordena por
// nome, não pela intenção "mais barato primeiro" do comentário de lefthook.yml).
function mergedPrePushCommands() {
  const base = readYaml(LEFTHOOK_PATH)["pre-push"].commands
  const local = readYaml(LEFTHOOK_LOCAL_PATH)["pre-push"].commands
  return { ...base, ...local }
}

function orderByPriority(commands) {
  return Object.entries(commands)
    .sort(([, a], [, b]) => a.priority - b.priority)
    .map(([name]) => name)
}

test("GAT-03: package.json raiz expõe os seis scripts de teste do AD-028 com o comando exato", () => {
  const { scripts } = readJson(ROOT_PACKAGE_JSON_PATH)
  assert.equal(scripts.test, "vitest run")
  assert.equal(scripts["test:watch"], "vitest")
  assert.equal(
    scripts["test:coverage"],
    "vitest run --config vitest.coverage.mts --coverage"
  )
  assert.equal(
    scripts["test:int"],
    "vitest run --config vitest.integration.mts --project api-int"
  )
  assert.equal(
    scripts["test:e2e"],
    "vitest run --config vitest.integration.mts --project api-e2e"
  )
  assert.equal(scripts["test:db"], "vitest run --config vitest.integration.mts")
})

test("GAT-07: turbo.json não tem mais nenhuma task test*", () => {
  const { tasks } = readJson(TURBO_JSON_PATH)
  const testTasks = Object.keys(tasks).filter((name) => name.startsWith("test"))
  assert.deepEqual(testTasks, [])
})

test("GAT-07: nenhum package.json de shell web tem script test*", () => {
  assert.ok(
    WEB_PACKAGE_JSON_PATHS.length > 0,
    "esperava ao menos um shell web em apps/"
  )
  for (const manifestPath of WEB_PACKAGE_JSON_PATHS) {
    const { scripts } = readJson(manifestPath)
    const testScripts = Object.keys(scripts).filter((name) =>
      name.startsWith("test")
    )
    assert.deepEqual(
      testScripts,
      [],
      `${path.relative(ROOT_DIR, manifestPath)} ainda expõe script test*`
    )
  }
})

test("GAT-07: apps/api/package.json não tem mais nenhum script test* nem o bloco jest", () => {
  const manifest = readJson(API_PACKAGE_JSON_PATH)
  const testScripts = Object.keys(manifest.scripts).filter((name) =>
    name.startsWith("test")
  )
  assert.deepEqual(testScripts, [])
  assert.equal(manifest.jest, undefined)
})

test("GAT-05: lefthook.yml pre-push é piped e roda migrations → typecheck → test-coverage nessa ordem", () => {
  const { "pre-push": prePush } = readYaml(LEFTHOOK_PATH)
  assert.equal(prePush.piped, true)
  assert.deepEqual(Object.keys(prePush.commands), [
    "migrations",
    "typecheck",
    "test-coverage",
  ])
  assert.equal(prePush.commands["test-coverage"].run, "pnpm test:coverage")
})

test("GAT-05: lefthook.yml não tem mais os comandos test-api/test-web", () => {
  const { "pre-push": prePush } = readYaml(LEFTHOOK_PATH)
  assert.equal(prePush.commands["test-api"], undefined)
  assert.equal(prePush.commands["test-web"], undefined)
})

test("GAT-05: lefthook-local.yml mantém catalog-typecheck no pre-push", () => {
  const { "pre-push": prePush } = readYaml(LEFTHOOK_LOCAL_PATH)
  assert.equal(
    prePush.commands["catalog-typecheck"].run,
    "node scripts/platform/catalog-stage.mjs"
  )
})

// T38: a ordem "mais barato primeiro" é intenção do próprio lefthook.yml (ver
// comentário sobre `migrations`), não de AD-027 — AD-027 decide o gate de
// cobertura (`pnpm test:coverage`, com Docker) e os pisos por glob; não decide
// ordem de execução do pre-push.
test("T38: pre-push roda mais barato primeiro — migrations → typecheck → catalog-typecheck → test-coverage → platform-scripts", () => {
  const commands = mergedPrePushCommands()
  for (const name of [
    "migrations",
    "typecheck",
    "catalog-typecheck",
    "test-coverage",
    "platform-scripts",
  ]) {
    assert.equal(
      typeof commands[name]?.priority,
      "number",
      `${name} precisa de priority explícita — sem ela o lefthook 2.x ordena os comandos do pre-push alfabeticamente`
    )
  }
  assert.deepEqual(orderByPriority(commands), [
    "migrations",
    "typecheck",
    "catalog-typecheck",
    "test-coverage",
    "platform-scripts",
  ])
})

// `test:coverage` é Vitest sobre `apps/**` e não coleta
// `scripts/platform/__tests__/*.test.mjs`. Sem este passo a suíte que verifica o
// contrato do template com o filho não tem gate local nenhum — só o job Gates da
// CI, depois do push, e a `main` não tem branch protection.
test("T38: o pre-push do template roda a suíte de scripts da plataforma", () => {
  const command = mergedPrePushCommands()["platform-scripts"]
  assert.match(command?.run ?? "", /scripts\/platform\/__tests__/)
})

test("T38: num filho renderizado (sem lefthook-local.yml) a ordem continua mais barato primeiro — migrations → typecheck → test-coverage", () => {
  const { "pre-push": prePush } = readYaml(LEFTHOOK_PATH)
  assert.deepEqual(orderByPriority(prePush.commands), [
    "migrations",
    "typecheck",
    "test-coverage",
  ])
})

// AD-027: `pnpm test:coverage` é o gate de cobertura ligado a Docker
// (testcontainers); os outros três comandos do pre-push não abrem container.
test("AD-027: test-coverage é o único comando do pre-push ligado a Docker", () => {
  const commands = mergedPrePushCommands()
  const dockerBound = Object.entries(commands)
    .filter(([, command]) =>
      /\bpnpm test:(coverage|int|e2e|db)\b/.test(command.run)
    )
    .map(([name]) => name)
  assert.deepEqual(dockerBound, ["test-coverage"])
})

test("GAT-06: ci.yml test-unit e test-coverage rodam após detect e quality", () => {
  const { jobs } = readYaml(CI_WORKFLOW_PATH)
  const testUnitRuns = jobs["test-unit"].steps
    .map((step) => step.run)
    .filter(Boolean)
  const testCoverageRuns = jobs["test-coverage"].steps
    .map((step) => step.run)
    .filter(Boolean)
  assert.deepEqual(jobs["test-unit"].needs, ["detect", "quality"])
  assert.deepEqual(testUnitRuns, [
    "pnpm install --frozen-lockfile",
    "pnpm test",
  ])
  assert.deepEqual(jobs["test-coverage"].needs, ["detect", "quality"])
  assert.ok(testCoverageRuns.includes("pnpm test:coverage"))
})

test("CI-01: .github/workflows/catalog.yml não existe mais", () => {
  assert.equal(existsSync(CATALOG_WORKFLOW_PATH), false)
})

test("CI-02: turbo lint typecheck e pnpm test aparecem exatamente uma vez em todo ci.yml", () => {
  const { jobs } = readYaml(CI_WORKFLOW_PATH)
  const runs = allRunSteps(jobs)
  assert.equal(
    runs.filter((run) => run === "pnpm turbo lint typecheck").length,
    1
  )
  assert.equal(runs.filter((run) => run === "pnpm test").length, 1)
})

test("CI-03: ci.yml pede todos os comandos que os dois workflows originais rodavam, e nenhum a mais", () => {
  const { jobs } = readYaml(CI_WORKFLOW_PATH)
  const runs = allRunSteps(jobs)
  const expectedCommands = [
    "pnpm turbo lint typecheck",
    "pnpm --filter api build:emit",
    "pnpm turbo build --filter=web",
    "pnpm test",
    "pnpm test:coverage",
    "pnpm test:scripts",
    "pnpm catalog:lint",
    "pnpm catalog:typecheck",
    "pnpm catalog:check",
    "pnpm template:smoke",
  ]
  for (const command of expectedCommands) {
    assert.ok(
      runs.some((run) => run.includes(command)),
      `esperava um step run: contendo "${command}"`
    )
  }
  assert.ok(
    !runs.some((run) => run.includes("pnpm check")),
    "pnpm check não deve mais rodar — quality e test-unit já cobrem lint/typecheck e test"
  )
})

test("CI-04: ci.yml on.push.tags contém v*", () => {
  const { on } = readYaml(CI_WORKFLOW_PATH)
  assert.ok(on.push.tags.includes("v*"))
})

test("CI-05: só o step ADV-04 carrega if de pull_request", () => {
  const { jobs } = readYaml(CI_WORKFLOW_PATH)
  const allSteps = Object.values(jobs).flatMap((job) => job.steps ?? [])
  const stepsWithPrIf = allSteps.filter(
    (step) =>
      typeof step.if === "string" &&
      step.if.includes("github.event_name == 'pull_request'")
  )
  assert.equal(stepsWithPrIf.length, 1)
  assert.ok(stepsWithPrIf[0].run.includes("advisory-required.mjs"))
})

test("CI-06: todo job que roda catalog:*, test:scripts ou template:smoke depende de detect e checa needs.detect.outputs.template", () => {
  const { jobs } = readYaml(CI_WORKFLOW_PATH)
  const gatedCommandPattern = /catalog:|test:scripts|template:smoke/
  for (const [jobName, job] of Object.entries(jobs)) {
    const runs = (job.steps ?? []).map((step) => step.run).filter(Boolean)
    if (!runs.some((run) => gatedCommandPattern.test(run))) continue
    const needsList = Array.isArray(job.needs) ? job.needs : [job.needs]
    assert.ok(
      needsList.includes("detect"),
      `${jobName} deveria depender de detect`
    )
    assert.ok(
      typeof job.if === "string" &&
        job.if.includes("needs.detect.outputs.template"),
      `${jobName} deveria checar needs.detect.outputs.template`
    )
  }
})

test("regressão AD-033: detect.if do ci.yml contém refs/heads/main", () => {
  const { jobs } = readYaml(CI_WORKFLOW_PATH)
  assert.ok(jobs.detect.if.includes("refs/heads/main"))
})

test("gates job mantém fetch-depth: 0 no checkout (lintEntryBump precisa da tag anterior)", () => {
  const { jobs } = readYaml(CI_WORKFLOW_PATH)
  const checkoutStep = jobs.gates.steps.find(
    (step) =>
      typeof step.uses === "string" && step.uses.startsWith("actions/checkout")
  )
  assert.equal(checkoutStep.with?.["fetch-depth"], 0)
})
