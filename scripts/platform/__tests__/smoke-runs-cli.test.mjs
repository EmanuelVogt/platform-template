import assert from "node:assert/strict"
import { test } from "node:test"
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

test("runTemplateSmoke invoca pnpm platform status e pnpm platform list dentro do próprio child renderizado", async () => {
  const childDir = "/tmp/template-smoke-test-cli-ok"
  const run = stubRun(greenOverrides())

  const code = await runGreenSmoke(run, childDir)

  assert.equal(code, EXIT_CODES.OK)
  const statusCall = run.calls.find(
    (c) => c.command === "pnpm" && c.args.join(" ") === "platform status"
  )
  const listCall = run.calls.find(
    (c) => c.command === "pnpm" && c.args.join(" ") === "platform list"
  )
  assert.ok(statusCall, "esperava uma chamada a pnpm platform status")
  assert.ok(listCall, "esperava uma chamada a pnpm platform list")
  assert.equal(statusCall.options.cwd, childDir)
  assert.equal(listCall.options.cwd, childDir)
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
    (c) => c.command === "pnpm" && c.args.join(" ") === "platform list"
  )
  assert.equal(
    listCall,
    undefined,
    "não deveria seguir para list depois que status falhou"
  )
})
