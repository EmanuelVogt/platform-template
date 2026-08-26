import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { parse as parseYaml } from "yaml"
import { EXIT_CODES } from "../lib/exit-codes.mjs"
import { resolveInstallOrder } from "../lib/catalog-graph.mjs"
import { runCatalogCheck } from "../catalog-check.mjs"

// Sem Docker de propósito: IDENT-02 fica provado no fecho que
// resolveInstallOrder calcula (catalog-graph.mjs:86) e nas chamadas de
// module add que runCatalogCheck dispara para esse fecho
// (catalog-check.mjs:181-194), com run/runCli dublês contra o catálogo real —
// não pela execução de fato de `pnpm catalog:check`.

const repoRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "..",
  ".."
)
const catalogRoot = path.join(repoRoot, "catalog")

function stubRun(overrides = {}) {
  const calls = []
  const fn = (command, args = [], options = {}) => {
    calls.push({ command, args, options })
    const key = [command, ...args].join(" ")
    const match = Object.entries(overrides).find(([pattern]) =>
      key.startsWith(pattern)
    )
    return match ? match[1] : { status: 0, stdout: "", stderr: "" }
  }
  fn.calls = calls
  return fn
}

function stubRunCli(overrides = {}) {
  const calls = []
  const fn = async (args, deps) => {
    calls.push({ args, deps })
    const key = args.join(" ")
    const match = Object.entries(overrides).find(([pattern]) =>
      key.includes(pattern)
    )
    return match ? match[1] : EXIT_CODES.OK
  }
  fn.calls = calls
  return fn
}

test("resolveInstallOrder(professional) traz só o fecho de dependsOn dela, nunca audit/attachment/tag (IDENT-02)", () => {
  const order = resolveInstallOrder({
    catalogRoot,
    requested: ["professional"],
  })
  const names = order.map((entry) => entry.name)

  assert.deepEqual(
    names,
    ["notification", "identity", "professional"],
    "o fecho de professional é notification -> identity -> professional, na ordem topológica"
  )
  for (const stranger of ["audit", "attachment", "tag"]) {
    assert.ok(
      !names.includes(stranger),
      `${stranger} não faz parte do dependsOn de professional e não deveria instalar`
    )
  }
})

test("resolveInstallOrder(identity) traz só o fecho de dependsOn dela, nunca professional/audit/attachment/tag (IDENT-02)", () => {
  const order = resolveInstallOrder({ catalogRoot, requested: ["identity"] })
  const names = order.map((entry) => entry.name)

  assert.deepEqual(
    names,
    ["notification", "identity"],
    "o fecho de identity é só notification -> identity"
  )
  for (const stranger of ["professional", "audit", "attachment", "tag"]) {
    assert.ok(
      !names.includes(stranger),
      `${stranger} não faz parte do dependsOn de identity e não deveria instalar`
    )
  }
})

test("runCatalogCheck(professional) contra o catálogo real: module add só para o fecho dela, gate final OK", async () => {
  const run = stubRun()
  const runCli = stubRunCli()
  const logs = []

  const code = await runCatalogCheck({
    entries: ["professional"],
    repoRoot,
    catalogRoot,
    scratchDir: "/scratch/professional-only-child",
    run,
    runCli,
    log: (line) => logs.push(line),
  })

  assert.equal(code, EXIT_CODES.OK)
  const installed = runCli.calls.map((call) => call.args[2])
  assert.deepEqual(
    installed,
    ["notification", "identity", "professional"],
    "module add roda só para o fecho de professional, nesta ordem"
  )
  assert.ok(
    runCli.calls.every(
      (call) => call.deps.cwd === "/scratch/professional-only-child"
    ),
    "as três instalações acontecem no mesmo child compartilhado"
  )
})

test("runCatalogCheck(identity) contra o catálogo real: module add só para o fecho dela, gate final OK", async () => {
  const run = stubRun()
  const runCli = stubRunCli()
  const logs = []

  const code = await runCatalogCheck({
    entries: ["identity"],
    repoRoot,
    catalogRoot,
    scratchDir: "/scratch/identity-only-child",
    run,
    runCli,
    log: (line) => logs.push(line),
  })

  assert.equal(code, EXIT_CODES.OK)
  const installed = runCli.calls.map((call) => call.args[2])
  assert.deepEqual(
    installed,
    ["notification", "identity"],
    "module add roda só para o fecho de identity, nesta ordem"
  )
})

// Nada assertava `matrix.entry` antes deste teste — só `matrix.web_stack`
// (catalog-check.test.mjs:906-937) — então perder uma entrada da lista aqui
// não quebrava nada sozinho.
test("ci.yml carrega professional na matriz entry: do job catalog (IDENT-02)", () => {
  const workflow = parseYaml(
    readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8")
  )

  const catalogJob = workflow.jobs.catalog
  assert.deepEqual(
    catalogJob.strategy.matrix.entry,
    ["identity", "attachment", "audit", "notification", "tag", "professional"],
    "professional entra na matriz do job catalog, ao lado das cinco entradas já cobertas"
  )
})
