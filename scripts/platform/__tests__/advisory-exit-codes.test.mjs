import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { detectCommand } from "../lib/commands/advisory.mjs"
import { EXIT_CODES } from "../lib/exit-codes.mjs"

function writeAdvisory(dir, id, detect) {
  writeFileSync(
    path.join(dir, `${id}.md`),
    [
      "---",
      `id: "${id}"`,
      'kind: "bug"',
      'module: "alpha"',
      'affects: ">=1.0.0 <2.0.0"',
      'severity: "low"',
      `detect: "${detect.replaceAll('"', '\\"')}"`,
      'fix: "resumo"',
      'parity: "apps/api/src/modules/alpha/__parity__/x.parity.spec.ts"',
      "---",
      "Corpo em pt-BR.",
      "",
    ].join("\n"),
    "utf8"
  )
}

function makeAdvisoriesDir() {
  return mkdtempSync(path.join(tmpdir(), "advisory-exit-codes-"))
}

function stubRunReturning(status) {
  const calls = []
  const run = (command, args, options) => {
    calls.push({ command, args, options })
    return { status, stdout: "", stderr: "" }
  }
  return { run, calls }
}

test("detect afetado (status 1) retorna exit 1", async () => {
  const dir = makeAdvisoriesDir()
  writeAdvisory(dir, "ADV-20260901-01", "meu-detector --check")
  const { run } = stubRunReturning(1)

  const exitCode = await detectCommand({
    id: "ADV-20260901-01",
    advisoriesDir: dir,
    run,
  })

  assert.equal(exitCode, 1)
})

test("detect não afetado (status 0) retorna EXIT_CODES.OK", async () => {
  const dir = makeAdvisoriesDir()
  writeAdvisory(dir, "ADV-20260901-02", "meu-detector --check")
  const { run } = stubRunReturning(0)

  const exitCode = await detectCommand({
    id: "ADV-20260901-02",
    advisoriesDir: dir,
    run,
  })

  assert.equal(exitCode, EXIT_CODES.OK)
})

test("rg ausente (status null, ENOENT) nunca vira 'não afetado' — retorna ADVISORY_DETECT_FAILED", async () => {
  const dir = makeAdvisoriesDir()
  writeAdvisory(dir, "ADV-20260901-03", "rg -l foo path")
  const { run } = stubRunReturning(null)

  const exitCode = await detectCommand({
    id: "ADV-20260901-03",
    advisoriesDir: dir,
    run,
  })

  assert.equal(exitCode, EXIT_CODES.ADVISORY_DETECT_FAILED)
  assert.notEqual(exitCode, EXIT_CODES.OK)
})

test("rg com erro (status 2) nunca vira 'não afetado' — retorna ADVISORY_DETECT_FAILED", async () => {
  const dir = makeAdvisoriesDir()
  writeAdvisory(dir, "ADV-20260901-04", "rg -l foo path")
  const { run } = stubRunReturning(2)

  const exitCode = await detectCommand({
    id: "ADV-20260901-04",
    advisoriesDir: dir,
    run,
  })

  assert.equal(exitCode, EXIT_CODES.ADVISORY_DETECT_FAILED)
  assert.notEqual(exitCode, EXIT_CODES.OK)
})

test("um detect encadeado com ';' (a forma real de ADV-20260822-04) roda via shell", async () => {
  const dir = makeAdvisoriesDir()
  const chained =
    "rg -l 'from: z.string' catalog/audit/api/api/contracts/audit.contract.ts; rg --files-without-match attach_module_hooks apps/api/src/modules/audit/testing/reattach-identity-tables.ts"
  writeAdvisory(dir, "ADV-20260901-05", chained)
  const { run, calls } = stubRunReturning(1)

  const exitCode = await detectCommand({
    id: "ADV-20260901-05",
    advisoriesDir: dir,
    run,
  })

  assert.equal(exitCode, 1)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, "sh")
  assert.deepEqual(calls[0].args, ["-c", chained])
})

test("um argumento entre aspas simples chega a rg como um único token, sem as aspas", async () => {
  const dir = makeAdvisoriesDir()
  writeAdvisory(
    dir,
    "ADV-20260901-06",
    "rg -l 'jest\\\\.' apps/api/src/modules/attachment"
  )
  const { run, calls } = stubRunReturning(0)

  await detectCommand({ id: "ADV-20260901-06", advisoriesDir: dir, run })

  assert.equal(calls[0].command, "rg")
  assert.deepEqual(calls[0].args, [
    "-l",
    "jest\\.",
    "apps/api/src/modules/attachment",
  ])
})
