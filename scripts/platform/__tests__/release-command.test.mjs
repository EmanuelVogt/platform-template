import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { EXIT_CODES } from "../lib/exit-codes.mjs"
import { planRelease, releaseCommand } from "../lib/commands/release.mjs"

// Major version: sem "### Child migration steps" — o preflight real só exige
// essa seção para versões não-major.
const CHANGELOG = [
  "# Changelog",
  "",
  "## v3.0.0",
  "",
  "Nova major.",
  "",
  "## v2.0.0",
  "",
  "Anterior.",
  "",
].join("\n")

function buildFixtureDir() {
  const root = mkdtempSync(path.join(tmpdir(), "release-command-fixture-"))
  mkdirSync(path.join(root, "docs/dev"), { recursive: true })
  writeFileSync(path.join(root, "docs/dev/template-changelog.md"), CHANGELOG)
  return root
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true })
}

// Roteia por sub-comando git; cada teste passa só os campos que usa — os
// demais viram respostas neutras (branch main, árvore limpa, sem tag prévia).
function fakeExec({
  branch = "main",
  statusOutput = "",
  tagList = "",
  lsRemote = "",
  diffStatus = () => 0,
  showAt = () => undefined,
} = {}) {
  const calls = []
  const exec = (command, args) => {
    calls.push({ command, args })
    assert.equal(command, "git")
    const [sub] = args
    if (sub === "rev-parse") return { status: 0, stdout: `${branch}\n` }
    if (sub === "status") return { status: 0, stdout: statusOutput }
    if (sub === "tag") return { status: 0, stdout: tagList }
    if (sub === "ls-remote") return { status: 0, stdout: lsRemote }
    if (sub === "diff") {
      const dir = args.at(-1)
      return { status: diffStatus(dir), stdout: "" }
    }
    if (sub === "show") {
      const [ref, entryPath] = args[1].split(":")
      const content = showAt(ref, entryPath)
      return content === undefined
        ? { status: 128, stdout: "" }
        : { status: 0, stdout: content }
    }
    if (sub === "commit") return { status: 0, stdout: "" }
    throw new Error(`unexpected git subcommand in test: ${sub}`)
  }
  exec.calls = calls
  return exec
}

function stubPreflight(returnCode, { log: preflightLog } = {}) {
  const calls = []
  const fn = async ({ version, log }) => {
    calls.push({ version })
    preflightLog?.(log)
    return returnCode
  }
  fn.calls = calls
  return fn
}

test("MARK-10: sem argumento, a versão vem da última seção do changelog", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const preflight = stubPreflight(EXIT_CODES.OK)
    const exitCode = await planRelease({
      cwd: dir,
      exec,
      runPreflight: preflight,
      log: () => {},
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(preflight.calls[0].version, "3.0.0")
    const commitCall = exec.calls.find((c) => c.args[0] === "commit")
    assert.match(commitCall.args.join(" "), /chore\(release\): v3\.0\.0/)
  } finally {
    cleanup(dir)
  }
})

test("MARK-10: um argumento explícito sobrescreve a versão do changelog", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const preflight = stubPreflight(EXIT_CODES.OK)
    const exitCode = await planRelease({
      version: "5.5.5",
      cwd: dir,
      exec,
      runPreflight: preflight,
      log: () => {},
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(preflight.calls[0].version, "5.5.5")
    const commitCall = exec.calls.find((c) => c.args[0] === "commit")
    assert.match(commitCall.args.join(" "), /chore\(release\): v5\.5\.5/)
  } finally {
    cleanup(dir)
  }
})

test("MARK-13: recusa quando HEAD não está em main, e nenhum commit é criado", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ branch: "feature/x" })
    const preflight = stubPreflight(EXIT_CODES.OK)
    const logs = []
    const exitCode = await planRelease({
      cwd: dir,
      exec,
      runPreflight: preflight,
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.USAGE_ERROR)
    assert.match(logs.join("\n"), /não está em "main"/)
    assert.equal(preflight.calls.length, 0)
    assert.equal(
      exec.calls.some((c) => c.args[0] === "commit"),
      false
    )
  } finally {
    cleanup(dir)
  }
})

test("MARK-13: recusa quando a árvore tem alterações não commitadas, e nenhum commit é criado", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ statusOutput: " M some-file.txt\n" })
    const preflight = stubPreflight(EXIT_CODES.OK)
    const logs = []
    const exitCode = await planRelease({
      cwd: dir,
      exec,
      runPreflight: preflight,
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.USAGE_ERROR)
    assert.match(logs.join("\n"), /alterações não commitadas/)
    assert.equal(preflight.calls.length, 0)
    assert.equal(
      exec.calls.some((c) => c.args[0] === "commit"),
      false
    )
  } finally {
    cleanup(dir)
  }
})

test("MARK-11: repassa o exit code exato do preflight e a mensagem original sem reescrevê-la, sem criar commit", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const logs = []
    const preflight = stubPreflight(EXIT_CODES.MIGRATION_FAILURE, {
      log: (log) =>
        log("release-preflight — passo 1 não é executável por máquina"),
    })
    const exitCode = await planRelease({
      cwd: dir,
      exec,
      runPreflight: preflight,
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.MIGRATION_FAILURE)
    assert.deepEqual(logs, [
      "release-preflight — passo 1 não é executável por máquina",
    ])
    assert.equal(
      exec.calls.some((c) => c.args[0] === "commit"),
      false
    )
  } finally {
    cleanup(dir)
  }
})

test("MARK-12: no sucesso cria exatamente um commit vazio, sem tag e sem push", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const preflight = stubPreflight(EXIT_CODES.OK)
    const logs = []
    const exitCode = await planRelease({
      version: "3.0.0",
      cwd: dir,
      exec,
      runPreflight: preflight,
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    const commitCalls = exec.calls.filter((c) => c.args[0] === "commit")
    assert.equal(commitCalls.length, 1)
    assert.deepEqual(commitCalls[0].args, [
      "commit",
      "--allow-empty",
      "-m",
      "chore(release): v3.0.0",
    ])
    assert.equal(
      exec.calls.some((c) => c.args[0] === "tag"),
      false
    )
    assert.equal(
      exec.calls.some((c) => c.args.join(" ").includes("push")),
      false
    )
    assert.deepEqual(logs, ["git push origin main"])
  } finally {
    cleanup(dir)
  }
})

test("Independent Test: changelog desatualizado (versão já tagueada) — exit não-zero, nenhum commit criado", async () => {
  const dir = buildFixtureDir()
  try {
    // Preflight real (não substituído): a última versão do changelog (3.0.0) já
    // tem tag, então nada há para liberar.
    const exec = fakeExec({ tagList: "v3.0.0\n" })
    const exitCode = await planRelease({ cwd: dir, exec, log: () => {} })
    assert.notEqual(exitCode, EXIT_CODES.OK)
    assert.equal(
      exec.calls.some((c) => c.args[0] === "commit"),
      false
    )
  } finally {
    cleanup(dir)
  }
})

test("caminho feliz com o preflight real: changelog limpo, sem tag prévia, cria o commit", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const exitCode = await planRelease({ cwd: dir, exec, log: () => {} })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(exec.calls.filter((c) => c.args[0] === "commit").length, 1)
  } finally {
    cleanup(dir)
  }
})

test("garantia de ordenação: em todo caminho de recusa, nenhuma chamada de git commit é emitida", async () => {
  const dir = buildFixtureDir()
  try {
    const scenarios = [
      {
        exec: fakeExec({ branch: "other" }),
        preflight: stubPreflight(EXIT_CODES.OK),
      },
      {
        exec: fakeExec({ statusOutput: "M x\n" }),
        preflight: stubPreflight(EXIT_CODES.OK),
      },
      { exec: fakeExec(), preflight: stubPreflight(EXIT_CODES.USAGE_ERROR) },
    ]
    for (const { exec, preflight } of scenarios) {
      const exitCode = await planRelease({
        cwd: dir,
        exec,
        runPreflight: preflight,
        log: () => {},
      })
      assert.notEqual(exitCode, EXIT_CODES.OK)
      assert.equal(
        exec.calls.some((c) => c.args[0] === "commit"),
        false
      )
    }
  } finally {
    cleanup(dir)
  }
})

test("releaseCommand delega para planRelease, repassando version/exec/runPreflight/log", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const preflight = stubPreflight(EXIT_CODES.OK)
    const logs = []
    const exitCode = await releaseCommand({
      version: "9.0.0",
      cwd: dir,
      exec,
      runPreflight: preflight,
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(preflight.calls[0].version, "9.0.0")
    const commitCall = exec.calls.find((c) => c.args[0] === "commit")
    assert.match(commitCall.args.join(" "), /chore\(release\): v9\.0\.0/)
  } finally {
    cleanup(dir)
  }
})
