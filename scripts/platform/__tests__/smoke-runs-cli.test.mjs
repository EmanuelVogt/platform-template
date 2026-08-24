import assert from "node:assert/strict"
import { test } from "node:test"
import { run as cliRun } from "../cli.mjs"
import { EXIT_CODES } from "../lib/exit-codes.mjs"
import { runTemplateSmoke } from "../../template-smoke.mjs"

function noopLog() {}

function immediateSleep() {
  return Promise.resolve()
}

// Mesma base verde usada pelo teste "as quatro checagens" de template-smoke.test.mjs, para
// isolar a asserção nova (pnpm platform status/list) sem repetir os quatro checks anteriores.
function greenOverrides(extra = {}) {
  return {
    "docker run": { status: 0, stdout: "cid123\n", stderr: "" },
    "docker exec cid123 pg_isready": { status: 0, stdout: "", stderr: "" },
    "docker exec cid123 redis-cli ping": {
      status: 0,
      stdout: "PONG\n",
      stderr: "",
    },
    "docker port cid123": { status: 0, stdout: "0.0.0.0:32000\n", stderr: "" },
    "pnpm --filter api run db:migrate": { status: 0, stdout: "", stderr: "" },
    "docker exec cid123 psql": {
      status: 0,
      stdout: "_kernel\ndrizzle\n",
      stderr: "",
    },
    "pnpm vitest run --project api apps/api/src/modules/module-boundaries.spec.ts":
      { status: 0, stdout: "", stderr: "" },
    ...extra,
  }
}

function stubRun(overrides) {
  const calls = []
  const fn = (command, args = [], options = {}) => {
    calls.push({ command, args, options })
    const key = [command, ...args].join(" ")
    const match = Object.entries(overrides ?? {}).find(([pattern]) =>
      key.includes(pattern)
    )
    return match ? match[1] : { status: 0, stdout: "", stderr: "" }
  }
  fn.calls = calls
  return fn
}

function runGreenSmoke(run, childDir) {
  return runTemplateSmoke({
    scratchDir: childDir,
    run,
    renderChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    installChildFn: () => ({ status: 0, stdout: "", stderr: "" }),
    spawnProcess: () => ({ kill: () => {} }),
    fetchImpl: async () => ({ status: 200 }),
    sleep: immediateSleep,
    log: noopLog,
  })
}

test("runTemplateSmoke invoca pnpm platform status e pnpm platform module list dentro do próprio child renderizado", async () => {
  const childDir = "/tmp/template-smoke-test-cli-ok"
  const run = stubRun(greenOverrides())

  const code = await runGreenSmoke(run, childDir)

  assert.equal(code, EXIT_CODES.OK)
  const statusCall = run.calls.find(
    (c) => c.command === "pnpm" && c.args.join(" ") === "platform status"
  )
  const listCall = run.calls.find(
    (c) => c.command === "pnpm" && c.args.join(" ") === "platform module list"
  )
  assert.ok(statusCall, "esperava uma chamada a pnpm platform status")
  assert.ok(listCall, "esperava uma chamada a pnpm platform module list")
  assert.equal(statusCall.options.cwd, childDir)
  assert.equal(listCall.options.cwd, childDir)
})

test("os argumentos que checkPlatformCli usa são de fato comandos registrados por scripts/platform/cli.mjs — um comando que o child não registra não pode voltar verde", async () => {
  const childDir = "/tmp/template-smoke-test-cli-registry"
  const run = stubRun(greenOverrides())

  await runGreenSmoke(run, childDir)

  const platformCalls = run.calls.filter(
    (c) => c.command === "pnpm" && c.args[0] === "platform"
  )
  assert.ok(
    platformCalls.length >= 2,
    "esperava pelo menos duas chamadas a pnpm platform (status e module list)"
  )

  // Diretório que não existe: só prova o registro do comando em cli.mjs, sem
  // depender de fixtures — todo acesso a arquivo em status/list é opcional
  // (existsSync guarda cada leitura) e cai nos defaults quando o caminho falta.
  const unrenderedCwd = "/tmp/template-smoke-test-cli-registry-not-rendered"
  for (const call of platformCalls) {
    const argv = call.args.slice(1) // remove o "platform" do script do package.json
    const exitCode = await cliRun(argv, { cwd: unrenderedCwd })
    assert.notEqual(
      exitCode,
      EXIT_CODES.USAGE_ERROR,
      `cli.mjs não registra "${argv.join(" ")}" — checkPlatformCli invocaria um comando inexistente no child`
    )
  }
})

test("uma reintrodução deliberada do import excluído (a CLI crasha no child) deixa o smoke vermelho", async () => {
  const childDir = "/tmp/template-smoke-test-cli-crash"
  // status !== 0 simula exatamente o sintoma de CLI-01: a CLI morre em tempo de import
  // dentro do child porque um arquivo shipped voltou a importar um caminho _exclude'do.
  const run = stubRun(
    greenOverrides({
      "platform status": {
        status: 1,
        stdout: "",
        stderr: "Cannot find module",
      },
    })
  )

  const code = await runGreenSmoke(run, childDir)

  assert.equal(code, EXIT_CODES.TEST_FAILURE)
  const listCall = run.calls.find(
    (c) => c.command === "pnpm" && c.args.join(" ") === "platform module list"
  )
  assert.equal(
    listCall,
    undefined,
    "não deveria seguir para list depois que status falhou"
  )
})
