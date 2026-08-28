import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { EXIT_CODES } from "../lib/exit-codes.mjs"
import { run } from "../cli.mjs"
import {
  planRelease,
  releaseAbortCommand,
  releaseCommand,
  releaseStatusCommand,
  unknownReleaseFlags,
} from "../lib/commands/release.mjs"

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

const HEAD_SHA = "aaaaaaa000000000000000000000000000000000"
const ORIGIN_SHA = "bbbbbbb000000000000000000000000000000000"
const HOLDER = Object.freeze({ id: "sess-local", kind: "session" })

// `catalog/` é o que distingue o template de um produto gerado: sem ele o
// comando se recusa a rodar, então a fixture do caminho feliz precisa tê-lo.
function buildFixtureDir({ template = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "release-command-fixture-"))
  mkdirSync(path.join(root, "docs/dev"), { recursive: true })
  writeFileSync(path.join(root, "docs/dev/template-changelog.md"), CHANGELOG)
  if (template) mkdirSync(path.join(root, "catalog"), { recursive: true })
  return root
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true })
}

// Roteia por sub-comando git; cada teste passa só os campos que usa — os
// demais viram respostas neutras (branch main, árvore limpa, sem tag prévia,
// origin presente e já no clone local, nada de marcador entre origin e HEAD).
function fakeExec({
  branch = "main",
  statusOutput = "",
  tagList = "",
  lsRemote = "",
  diffStatus = () => 0,
  showAt = () => undefined,
  pushStatus = 0,
  head = HEAD_SHA,
  originUrl = "git@github.com:acme/platform-template.git",
  catFileStatus = 0,
  fetchStatus = 0,
  aheadSubjects = [],
  originSubject = "chore(deps): rotina",
  logStatus = 0,
} = {}) {
  const calls = []
  const exec = (command, args, options = {}) => {
    calls.push({ command, args, options })
    assert.equal(command, "git")
    const [sub] = args
    if (sub === "rev-parse") {
      if (args[1] === "HEAD") return { status: 0, stdout: `${head}\n` }
      return { status: 0, stdout: `${branch}\n` }
    }
    if (sub === "status") return { status: 0, stdout: statusOutput }
    if (sub === "tag") return { status: 0, stdout: tagList }
    if (sub === "ls-remote") return { status: 0, stdout: lsRemote }
    if (sub === "remote") {
      return originUrl
        ? { status: 0, stdout: `${originUrl}\n` }
        : { status: 1, stdout: "" }
    }
    if (sub === "cat-file") return { status: catFileStatus, stdout: "" }
    if (sub === "fetch") return { status: fetchStatus, stdout: "" }
    if (sub === "log") {
      if (args[1] === "-1")
        return { status: logStatus, stdout: `${originSubject}\n` }
      return { status: logStatus, stdout: `${aheadSubjects.join("\n")}\n` }
    }
    if (sub === "reset") return { status: 0, stdout: "" }
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
    if (sub === "push") return { status: pushStatus, stdout: "" }
    throw new Error(`unexpected git subcommand in test: ${sub}`)
  }
  exec.calls = calls
  return exec
}

// Dublê do módulo de lease: registra cada chamada e devolve o que o cenário
// pedir. O módulo real toca `.git/` e a rede, e nenhum teste aqui quer isso.
function fakeLease({
  holder = HOLDER,
  acquire = { ok: true, lease: { version: "3.0.0", stage: "draft" } },
  lease = undefined,
  corruptRead = false,
  tagExists = false,
  originSha = ORIGIN_SHA,
  ancestor = true,
  runs = { available: true, runs: [] },
  stableTags = ["v2.0.0"],
  matches = true,
  classify = "active",
  // Padrão inerte: o self-clear é do módulo de lease e tem teste próprio contra
  // o disco em `release-lease.test.mjs`. Aqui só interessa se o comando o chama
  // e o que ele faz com a resposta.
  reconcile = { cleared: false },
} = {}) {
  const calls = []
  const record = (name, args) => calls.push({ name, args })
  const api = {
    currentHolderId: () => holder,
    acquireLease: (args) => {
      record("acquireLease", args)
      return typeof acquire === "function" ? acquire(args) : acquire
    },
    readLease: () => (corruptRead ? { corrupt: true } : { lease }),
    updateLease: (args) => {
      record("updateLease", args)
      return { ok: true, lease: { ...lease, ...args.patch } }
    },
    releaseLease: (args) => {
      record("releaseLease", args)
      return { ok: true, released: true }
    },
    holderMatches: () => matches,
    classifyLease: () => classify,
    originTagExists: ({ version }) => {
      record("originTagExists", { version })
      return typeof tagExists === "function" ? tagExists(version) : tagExists
    },
    originMainSha: () => originSha,
    isAncestorOfHead: () => ancestor,
    originStableTags: () => stableTags,
    probeReleaseRuns: () => runs,
    reconcileFinishedLease: (args) => {
      record("reconcileFinishedLease", args)
      return typeof reconcile === "function" ? reconcile(args) : reconcile
    },
  }
  api.calls = calls
  api.named = (name) => calls.filter((call) => call.name === name)
  return api
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

function hasCommit(exec) {
  return exec.calls.some((call) => call.args[0] === "commit")
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
      lease: fakeLease(),
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
      lease: fakeLease(),
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
    const lease = fakeLease()
    const logs = []
    const exitCode = await planRelease({
      cwd: dir,
      exec,
      runPreflight: preflight,
      lease,
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.USAGE_ERROR)
    assert.match(logs.join("\n"), /não está em "main"/)
    assert.equal(preflight.calls.length, 0)
    assert.equal(hasCommit(exec), false)
    assert.equal(lease.calls.length, 0)
  } finally {
    cleanup(dir)
  }
})

test("MARK-13: recusa quando a árvore tem alterações não commitadas, e nenhum commit é criado", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ statusOutput: " M some-file.txt\n" })
    const preflight = stubPreflight(EXIT_CODES.OK)
    const lease = fakeLease()
    const logs = []
    const exitCode = await planRelease({
      cwd: dir,
      exec,
      runPreflight: preflight,
      lease,
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.USAGE_ERROR)
    assert.match(logs.join("\n"), /alterações não commitadas/)
    assert.equal(preflight.calls.length, 0)
    assert.equal(hasCommit(exec), false)
    assert.equal(lease.calls.length, 0)
  } finally {
    cleanup(dir)
  }
})

test("MARK-11: repassa o exit code exato do preflight e a mensagem original sem reescrevê-la, sem criar commit", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease()
    const logs = []
    const preflight = stubPreflight(EXIT_CODES.MIGRATION_FAILURE, {
      log: (log) =>
        log("release-preflight — passo 1 não é executável por máquina"),
    })
    const exitCode = await planRelease({
      cwd: dir,
      exec,
      runPreflight: preflight,
      lease,
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.MIGRATION_FAILURE)
    assert.deepEqual(logs, [
      "release-preflight — passo 1 não é executável por máquina",
    ])
    assert.equal(hasCommit(exec), false)
    // O lease volta: um release que não aconteceu não deixa freeze de pé.
    assert.equal(lease.named("releaseLease").length, 1)
  } finally {
    cleanup(dir)
  }
})

test("MARK-12: no sucesso, sem --push, cria exatamente um commit vazio, sem tag e sem push", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const preflight = stubPreflight(EXIT_CODES.OK)
    const lease = fakeLease()
    const logs = []
    const exitCode = await planRelease({
      version: "3.0.0",
      cwd: dir,
      exec,
      runPreflight: preflight,
      lease,
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
      exec.calls.some((c) => c.args[0] === "push"),
      false
    )
    assert.equal(logs[0], "git push origin main")
    assert.match(logs.join("\n"), /marker-local/)
    assert.match(logs.join("\n"), /--abort/)
  } finally {
    cleanup(dir)
  }
})

test("child-safety: num produto gerado (sem catalog/) recusa antes de tudo, mesmo com --push", async () => {
  const dir = buildFixtureDir({ template: false })
  try {
    const exec = fakeExec()
    const preflight = stubPreflight(EXIT_CODES.OK)
    const lease = fakeLease()
    const logs = []
    const exitCode = await planRelease({
      version: "3.0.0",
      push: true,
      cwd: dir,
      exec,
      runPreflight: preflight,
      lease,
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.USAGE_ERROR)
    assert.match(logs.join("\n"), /exclusivo do template/)
    assert.equal(preflight.calls.length, 0)
    assert.equal(lease.calls.length, 0)
    for (const sub of ["commit", "push", "tag"]) {
      assert.equal(
        exec.calls.some((c) => c.args[0] === sub),
        false
      )
    }
  } finally {
    cleanup(dir)
  }
})

test("MARK-12b: com --push, empurra origin main uma vez, depois do commit, e nunca cria tag", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const preflight = stubPreflight(EXIT_CODES.OK)
    const exitCode = await planRelease({
      version: "3.0.0",
      push: true,
      cwd: dir,
      exec,
      runPreflight: preflight,
      lease: fakeLease(),
      log: () => {},
    })
    assert.equal(exitCode, EXIT_CODES.OK)

    const subcommands = exec.calls.map((c) => c.args[0])
    const pushCalls = exec.calls.filter((c) => c.args[0] === "push")
    assert.equal(pushCalls.length, 1)
    assert.deepEqual(pushCalls[0].args, ["push", "origin", "main"])
    assert.ok(subcommands.indexOf("commit") < subcommands.indexOf("push"))
    assert.equal(
      exec.calls.some((c) => c.args[0] === "tag"),
      false
    )
  } finally {
    cleanup(dir)
  }
})

test("MARK-12b: push que falha devolve PUSH_FAILED e não se anuncia como sucesso", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ pushStatus: 1 })
    const preflight = stubPreflight(EXIT_CODES.OK)
    const logs = []
    const exitCode = await planRelease({
      version: "3.0.0",
      push: true,
      cwd: dir,
      exec,
      runPreflight: preflight,
      lease: fakeLease(),
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.PUSH_FAILED)
    assert.notEqual(exitCode, EXIT_CODES.OK)
    assert.match(logs.join("\n"), /nenhuma tag foi disparada/)
  } finally {
    cleanup(dir)
  }
})

test("MARK-13: --push não contorna as recusas — árvore suja não empurra nada", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ statusOutput: " M some-file.txt\n" })
    const preflight = stubPreflight(EXIT_CODES.OK)
    const exitCode = await planRelease({
      push: true,
      cwd: dir,
      exec,
      runPreflight: preflight,
      lease: fakeLease(),
      log: () => {},
    })
    assert.equal(exitCode, EXIT_CODES.USAGE_ERROR)
    assert.equal(
      exec.calls.some((c) => c.args[0] === "push"),
      false
    )
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
    const exitCode = await planRelease({
      cwd: dir,
      exec,
      lease: fakeLease(),
      log: () => {},
    })
    assert.notEqual(exitCode, EXIT_CODES.OK)
    assert.equal(hasCommit(exec), false)
  } finally {
    cleanup(dir)
  }
})

test("caminho feliz com o preflight real: changelog limpo, sem tag prévia, cria o commit", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const exitCode = await planRelease({
      cwd: dir,
      exec,
      lease: fakeLease(),
      log: () => {},
    })
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
      { exec: fakeExec({ branch: "other" }), lease: fakeLease() },
      { exec: fakeExec({ statusOutput: "M x\n" }), lease: fakeLease() },
      {
        exec: fakeExec(),
        lease: fakeLease({ acquire: { ok: false, corrupt: true } }),
      },
      { exec: fakeExec(), lease: fakeLease({ tagExists: null }) },
      { exec: fakeExec(), lease: fakeLease({ originSha: null }) },
      { exec: fakeExec(), lease: fakeLease({ ancestor: false }) },
    ]
    for (const { exec, lease } of scenarios) {
      const exitCode = await planRelease({
        cwd: dir,
        exec,
        runPreflight: stubPreflight(EXIT_CODES.OK),
        lease,
        log: () => {},
      })
      assert.notEqual(exitCode, EXIT_CODES.OK)
      assert.equal(hasCommit(exec), false)
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
      lease: fakeLease(),
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

async function planWith({ dir, exec, lease, ...rest }) {
  const logs = []
  const exitCode = await planRelease({
    version: "3.0.0",
    cwd: dir,
    exec,
    runPreflight: stubPreflight(EXIT_CODES.OK),
    lease,
    log: (line) => logs.push(line),
    ...rest,
  })
  return { exitCode, logs: logs.join("\n") }
}

test("lease de outra sessão: recusa em RELEASE_LOCKED, sem commit, e não devolve o lease alheio", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({
      matches: false,
      acquire: {
        ok: false,
        lease: {
          version: "3.0.0",
          stage: "marker-local",
          holder: { id: "sess-outra", kind: "session" },
          updatedAt: Date.now(),
          markerSha: "cccccc0",
        },
      },
    })
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(hasCommit(exec), false)
    assert.equal(lease.named("releaseLease").length, 0)
    assert.match(logs, /sess-outra/)
    assert.match(logs, /outra sessão/)
    assert.match(logs, /marker-local/)
    assert.match(logs, /--status/)
    assert.match(logs, /--abort/)
  } finally {
    cleanup(dir)
  }
})

test("lease corrompido: recusa em RELEASE_LOCKED e manda inspecionar antes de descartar", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({ acquire: { ok: false, corrupt: true } })
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(hasCommit(exec), false)
    assert.match(logs, /ilegível/)
    assert.match(logs, /--abort --force/)
  } finally {
    cleanup(dir)
  }
})

test("guarda a: a tag já existe na origin — ALREADY_INSTALLED e o lease é devolvido", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({ tagExists: true })
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.ALREADY_INSTALLED)
    assert.equal(hasCommit(exec), false)
    assert.equal(lease.named("releaseLease").length, 1)
    assert.match(logs, /tag v3\.0\.0 já existe na origin/)
  } finally {
    cleanup(dir)
  }
})

test("guarda a: sonda de tags cega (null) falha fechado em RELEASE_LOCKED", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({ tagExists: null })
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(hasCommit(exec), false)
    assert.equal(lease.named("releaseLease").length, 1)
    assert.match(logs, /ls-remote --tags/)
  } finally {
    cleanup(dir)
  }
})

test("guarda b: head de origin/main indisponível (null) falha fechado e devolve o lease", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({ originSha: null })
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(hasCommit(exec), false)
    assert.equal(lease.named("releaseLease").length, 1)
    assert.match(logs, /head de origin\/main/)
  } finally {
    cleanup(dir)
  }
})

test("guarda b: sha da origin fora do clone local e fetch que falha manda rodar git fetch", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ catFileStatus: 1, fetchStatus: 1 })
    const lease = fakeLease()
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(hasCommit(exec), false)
    assert.match(logs, /git fetch origin main/)
  } finally {
    cleanup(dir)
  }
})

test("guarda b: marcador órfão entre origin/main e HEAD recusa e manda abortar", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({
      aheadSubjects: ["docs: nota", "chore(release): v3.0.0"],
    })
    const lease = fakeLease()
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(hasCommit(exec), false)
    assert.equal(lease.named("releaseLease").length, 1)
    assert.match(logs, /marcador local órfão/)
    assert.match(logs, /--abort/)
  } finally {
    cleanup(dir)
  }
})

test("guarda c: head da origin é um marcador ainda sem tag — release em voo, recusa", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ originSubject: "chore(release): v2.9.0" })
    const lease = fakeLease({ tagExists: (version) => version === "9.9.9" })
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(hasCommit(exec), false)
    assert.equal(lease.named("releaseLease").length, 1)
    assert.match(logs, /chore\(release\): v2\.9\.0/)
    assert.match(logs, /--status/)
  } finally {
    cleanup(dir)
  }
})

test("guarda c: head da origin é um marcador já tagueado — segue e corta o release", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ originSubject: "chore(release): v2.9.0" })
    const lease = fakeLease({ tagExists: (version) => version === "2.9.0" })
    const { exitCode } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(hasCommit(exec), true)
  } finally {
    cleanup(dir)
  }
})

test("guarda d: origin/main não é ancestral de HEAD — manda dar git pull", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({ ancestor: false })
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(hasCommit(exec), false)
    assert.equal(lease.named("releaseLease").length, 1)
    assert.match(logs, /git pull/)
  } finally {
    cleanup(dir)
  }
})

test("guarda d: sonda de ancestralidade cega (null) falha fechado", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({ ancestor: null })
    const { exitCode } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(hasCommit(exec), false)
  } finally {
    cleanup(dir)
  }
})

test("guarda e: run de release em andamento recusa citando a url", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({
      runs: {
        available: true,
        runs: [{ databaseId: 7, url: "https://gh/run/7" }],
      },
    })
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(hasCommit(exec), false)
    assert.equal(lease.named("releaseLease").length, 1)
    assert.match(logs, /https:\/\/gh\/run\/7/)
  } finally {
    cleanup(dir)
  }
})

test("guarda e: gh indisponível avisa uma vez e segue o release", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({ runs: { available: false } })
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(hasCommit(exec), true)
    assert.equal(
      logs.split("\n").filter((line) => line.includes("sonda cross-machine"))
        .length,
      1
    )
  } finally {
    cleanup(dir)
  }
})

test("sem --push o lease fica em marker-local, com o sha do marcador", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease()
    const { exitCode } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.OK)
    const updates = lease.named("updateLease")
    assert.equal(updates.length, 1)
    assert.deepEqual(updates[0].args.patch, {
      stage: "marker-local",
      markerSha: HEAD_SHA,
    })
    assert.equal(lease.named("releaseLease").length, 0)
  } finally {
    cleanup(dir)
  }
})

test("--push: a tag apareceu entre o preflight e o push — desfaz o marcador, devolve o lease e sai em ALREADY_INSTALLED", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    let seen = 0
    // Falsa na guarda inicial, verdadeira na reconferência antes do push.
    const lease = fakeLease({
      tagExists: () => {
        seen += 1
        return seen > 1
      },
    })
    const { exitCode, logs } = await planWith({
      dir,
      exec,
      lease,
      push: true,
    })
    assert.equal(exitCode, EXIT_CODES.ALREADY_INSTALLED)
    const resets = exec.calls.filter((c) => c.args[0] === "reset")
    assert.equal(resets.length, 1)
    assert.deepEqual(resets[0].args, ["reset", "--hard", "HEAD~1"])
    assert.equal(
      exec.calls.some((c) => c.args[0] === "push"),
      false
    )
    assert.equal(lease.named("releaseLease").length, 1)
    assert.match(logs, /apareceu na origin/)
  } finally {
    cleanup(dir)
  }
})

test("--push com sucesso: lease vai a marker-pushed e o push carrega PLATFORM_RELEASE_HOLDER", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease()
    const { exitCode, logs } = await planWith({
      dir,
      exec,
      lease,
      push: true,
      env: { PATH: "/usr/bin" },
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    const pushCall = exec.calls.find((c) => c.args[0] === "push")
    assert.equal(pushCall.options.env.PLATFORM_RELEASE_HOLDER, HOLDER.id)
    assert.equal(pushCall.options.env.PATH, "/usr/bin")
    const stages = lease.named("updateLease").map((c) => c.args.patch.stage)
    assert.deepEqual(stages, ["marker-local", "marker-pushed"])
    assert.equal(lease.named("releaseLease").length, 0)
    // A linha de fecho tem de nomear QUEM limpa. "limpa sozinho" descrevia um
    // daemon que nunca existiu, e foi o que deixou a v3.0.0 congelada.
    assert.match(logs, /se limpa no primeiro `pnpm platform release --status`/)
    assert.doesNotMatch(logs, /sozinho/)
  } finally {
    cleanup(dir)
  }
})

test("--push que falha: o lease fica em marker-local e a receita prescreve --abort antes do git pull", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ pushStatus: 1 })
    const lease = fakeLease()
    const { exitCode, logs } = await planWith({
      dir,
      exec,
      lease,
      push: true,
    })
    assert.equal(exitCode, EXIT_CODES.PUSH_FAILED)
    const stages = lease.named("updateLease").map((c) => c.args.patch.stage)
    assert.deepEqual(stages, ["marker-local"])
    assert.equal(lease.named("releaseLease").length, 0)
    assert.match(logs, /pnpm platform release --abort/)
    assert.match(logs, /git pull`, e refaça o release/)
    assert.match(logs, /NUNCA rode `git pull --rebase`/)
  } finally {
    cleanup(dir)
  }
})

test("retomada: lease próprio em marker-local com HEAD no marcador não cria um segundo marcador", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({
      acquire: {
        ok: false,
        lease: {
          version: "3.0.0",
          stage: "marker-local",
          holder: HOLDER,
          markerSha: HEAD_SHA,
          updatedAt: Date.now(),
        },
      },
    })
    const { exitCode, logs } = await planWith({
      dir,
      exec,
      lease,
      push: true,
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(hasCommit(exec), false)
    assert.equal(exec.calls.filter((c) => c.args[0] === "push").length, 1)
    assert.deepEqual(
      lease.named("updateLease").map((c) => c.args.patch.stage),
      ["marker-pushed"]
    )
    assert.match(logs, /retomando o lease v3\.0\.0/)
  } finally {
    cleanup(dir)
  }
})

test("retomada impossível: HEAD passou do marcador — recusa e manda abortar", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ head: "ddddddd000000000000000000000000000000000" })
    const lease = fakeLease({
      acquire: {
        ok: false,
        lease: {
          version: "3.0.0",
          stage: "marker-local",
          holder: HOLDER,
          markerSha: HEAD_SHA,
          updatedAt: Date.now(),
        },
      },
    })
    const { exitCode, logs } = await planWith({ dir, exec, lease, push: true })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(hasCommit(exec), false)
    assert.equal(
      exec.calls.some((c) => c.args[0] === "push"),
      false
    )
    assert.match(logs, /não é mais o topo/)
    assert.match(logs, /--abort/)
  } finally {
    cleanup(dir)
  }
})

test("lease próprio em draft não é retomável: recusa apontando esta sessão", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({
      acquire: {
        ok: false,
        lease: {
          version: "3.0.0",
          stage: "draft",
          holder: HOLDER,
          updatedAt: Date.now(),
        },
      },
    })
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(hasCommit(exec), false)
    assert.match(logs, /esta sessão/)
  } finally {
    cleanup(dir)
  }
})

test("sem remote origin legível: avisa, não toma lease e mantém o fluxo antigo", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ originUrl: "" })
    const lease = fakeLease()
    const { exitCode, logs } = await planWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(hasCommit(exec), true)
    assert.equal(lease.calls.length, 0)
    assert.match(logs, /sem remote `origin` legível/)
  } finally {
    cleanup(dir)
  }
})

function statusWith({ dir, exec, lease, ...rest }) {
  const logs = []
  const exitCode = releaseStatusCommand({
    cwd: dir,
    exec,
    lease,
    log: (line) => logs.push(line),
    ...rest,
  })
  return { exitCode, logs: logs.join("\n") }
}

test("--status sem lease: sai em 0 e o veredito é livre", async () => {
  const dir = buildFixtureDir()
  try {
    const { exitCode, logs } = statusWith({
      dir,
      exec: fakeExec(),
      lease: fakeLease(),
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.match(logs, /lease: nenhum/)
    assert.match(logs, /última tag estável v2\.0\.0/)
    assert.match(logs, /runs: nenhuma em andamento/)
    assert.match(logs, /veredito: livre/)
  } finally {
    cleanup(dir)
  }
})

test("--status com lease em marker-local: mostra estágio, titular, idade e marcador, e veredito de release em voo", async () => {
  const dir = buildFixtureDir()
  try {
    const now = () => 10 * 60 * 1000
    const { exitCode, logs } = statusWith({
      dir,
      exec: fakeExec(),
      lease: fakeLease({
        lease: {
          version: "3.0.0",
          stage: "marker-local",
          holder: HOLDER,
          markerSha: HEAD_SHA,
          updatedAt: 5 * 60 * 1000,
        },
      }),
      now,
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.match(logs, /lease: v3\.0\.0, estágio "marker-local"/)
    assert.match(logs, /sess-local/)
    assert.match(logs, /esta sessão/)
    assert.match(logs, /há 5 min/)
    assert.match(logs, /marcador aaaaaaa/)
    assert.match(logs, /veredito: release em voo — não pushe main/)
  } finally {
    cleanup(dir)
  }
})

test("--status com lease corrompido: sai em 0 e ensina o --abort --force", async () => {
  const dir = buildFixtureDir()
  try {
    const { exitCode, logs } = statusWith({
      dir,
      exec: fakeExec(),
      lease: fakeLease({ corruptRead: true }),
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.match(logs, /lease: corrompido/)
    assert.match(logs, /--abort --force/)
  } finally {
    cleanup(dir)
  }
})

test("--status com lease draft vencido: veredito manda tomar com --abort", async () => {
  const dir = buildFixtureDir()
  try {
    const { exitCode, logs } = statusWith({
      dir,
      exec: fakeExec(),
      lease: fakeLease({
        classify: "stale",
        lease: {
          version: "3.0.0",
          stage: "draft",
          holder: { id: "sess-morta", kind: "session" },
          updatedAt: 0,
        },
      }),
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.match(logs, /veredito: lease stale — takeover com/)
    assert.match(logs, /--abort/)
  } finally {
    cleanup(dir)
  }
})

test("--status: head da origin sendo um marcador sem tag já basta para o veredito de release em voo", async () => {
  const dir = buildFixtureDir()
  try {
    const { exitCode, logs } = statusWith({
      dir,
      exec: fakeExec({ originSubject: "chore(release): v2.9.0" }),
      lease: fakeLease({ tagExists: false }),
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.match(logs, /marcador v2\.9\.0/)
    assert.match(logs, /veredito: release em voo/)
  } finally {
    cleanup(dir)
  }
})

test("--status com gh indisponível: reporta a lacuna em vez de fingir que não há runs", async () => {
  const dir = buildFixtureDir()
  try {
    const { exitCode, logs } = statusWith({
      dir,
      exec: fakeExec(),
      lease: fakeLease({ runs: { available: false } }),
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.match(logs, /runs: \(gh indisponível\)/)
  } finally {
    cleanup(dir)
  }
})

function abortWith({ dir, exec, lease, ...rest }) {
  const logs = []
  const exitCode = releaseAbortCommand({
    cwd: dir,
    exec,
    lease,
    log: (line) => logs.push(line),
    ...rest,
  })
  return { exitCode, logs: logs.join("\n") }
}

test("--abort em draft devolve o lease e não toca no git", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({
      lease: { version: "3.0.0", stage: "draft", holder: HOLDER },
    })
    const { exitCode, logs } = abortWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(lease.named("releaseLease").length, 1)
    assert.equal(
      exec.calls.some((c) => c.args[0] === "reset"),
      false
    )
    assert.match(logs, /lease v3\.0\.0 devolvido/)
  } finally {
    cleanup(dir)
  }
})

test("--abort em marker-local desfaz o marcador com reset --hard HEAD~1 e devolve o lease", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({
      lease: {
        version: "3.0.0",
        stage: "marker-local",
        holder: HOLDER,
        markerSha: HEAD_SHA,
      },
    })
    const { exitCode, logs } = abortWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.OK)
    const resets = exec.calls.filter((c) => c.args[0] === "reset")
    assert.deepEqual(resets[0].args, ["reset", "--hard", "HEAD~1"])
    assert.equal(lease.named("releaseLease").length, 1)
    assert.match(logs, /marcador v3\.0\.0 desfeito/)
  } finally {
    cleanup(dir)
  }
})

test("--abort em marker-local com árvore suja recusa sem resetar nada", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ statusOutput: " M docs/x.md\n" })
    const lease = fakeLease({
      lease: {
        version: "3.0.0",
        stage: "marker-local",
        holder: HOLDER,
        markerSha: HEAD_SHA,
      },
    })
    const { exitCode, logs } = abortWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(
      exec.calls.some((c) => c.args[0] === "reset"),
      false
    )
    assert.equal(lease.named("releaseLease").length, 0)
    assert.match(logs, /alterações não commitadas/)
  } finally {
    cleanup(dir)
  }
})

test("--abort em marker-local recusa quando HEAD não é o marcador", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ head: "eeeeeee000000000000000000000000000000000" })
    const lease = fakeLease({
      lease: {
        version: "3.0.0",
        stage: "marker-local",
        holder: HOLDER,
        markerSha: HEAD_SHA,
      },
    })
    const { exitCode, logs } = abortWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(
      exec.calls.some((c) => c.args[0] === "reset"),
      false
    )
    assert.match(logs, /não é o marcador do lease/)
  } finally {
    cleanup(dir)
  }
})

test("--abort em marker-local recusa quando o marcador já está na origin", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec({ originSubject: "chore(release): v3.0.0" })
    const lease = fakeLease({
      lease: {
        version: "3.0.0",
        stage: "marker-local",
        holder: HOLDER,
        markerSha: HEAD_SHA,
      },
    })
    const { exitCode, logs } = abortWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(
      exec.calls.some((c) => c.args[0] === "reset"),
      false
    )
    assert.match(logs, /já está na origin/)
  } finally {
    cleanup(dir)
  }
})

test("--abort em marker-pushed com run em andamento recusa: recuperação é re-run", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({
      lease: {
        version: "3.0.0",
        stage: "marker-pushed",
        holder: HOLDER,
        markerSha: HEAD_SHA,
      },
      runs: {
        available: true,
        runs: [{ databaseId: 9, url: "https://gh/run/9" }],
      },
    })
    const { exitCode, logs } = abortWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(lease.named("releaseLease").length, 0)
    assert.match(logs, /https:\/\/gh\/run\/9/)
    assert.match(logs, /re-run, não abort/)
  } finally {
    cleanup(dir)
  }
})

test("--abort --force em marker-pushed prossegue e imprime a doutrina da run abandonada", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({
      lease: {
        version: "3.0.0",
        stage: "marker-pushed",
        holder: HOLDER,
        markerSha: HEAD_SHA,
      },
      runs: {
        available: true,
        runs: [{ databaseId: 9, url: "https://gh/run/9" }],
      },
    })
    const { exitCode, logs } = abortWith({ dir, exec, lease, force: true })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(lease.named("releaseLease")[0].args.force, true)
    assert.match(logs, /o marcador empurrado fica onde está/)
    assert.match(logs, /nunca re-rode aquela run/)
    assert.match(logs, /confirmar que a tag não existe/)
  } finally {
    cleanup(dir)
  }
})

test("--abort em marker-pushed com gh indisponível recusa sem --force", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const lease = fakeLease({
      lease: {
        version: "3.0.0",
        stage: "marker-pushed",
        holder: HOLDER,
        markerSha: HEAD_SHA,
      },
      runs: { available: false },
    })
    const { exitCode, logs } = abortWith({ dir, exec, lease })
    assert.equal(exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(lease.named("releaseLease").length, 0)
    assert.match(logs, /`gh` não respondeu/)
  } finally {
    cleanup(dir)
  }
})

test("--abort de lease alheio ativo recusa; stale libera o takeover", async () => {
  const dir = buildFixtureDir()
  try {
    const alheio = {
      version: "3.0.0",
      stage: "draft",
      holder: { id: "sess-outra", kind: "session" },
      updatedAt: 0,
    }
    const ativo = fakeLease({ matches: false, lease: alheio })
    const recusa = abortWith({ dir, exec: fakeExec(), lease: ativo })
    assert.equal(recusa.exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(ativo.named("releaseLease").length, 0)
    assert.match(recusa.logs, /--force/)

    const vencido = fakeLease({
      matches: false,
      classify: "stale",
      lease: alheio,
    })
    const takeover = abortWith({ dir, exec: fakeExec(), lease: vencido })
    assert.equal(takeover.exitCode, EXIT_CODES.OK)
    assert.equal(vencido.named("releaseLease").length, 1)
  } finally {
    cleanup(dir)
  }
})

test("--abort com lease corrompido só limpa sob --force", async () => {
  const dir = buildFixtureDir()
  try {
    const semForce = fakeLease({ corruptRead: true })
    const recusa = abortWith({ dir, exec: fakeExec(), lease: semForce })
    assert.equal(recusa.exitCode, EXIT_CODES.RELEASE_LOCKED)
    assert.equal(semForce.named("releaseLease").length, 0)

    const comForce = fakeLease({ corruptRead: true })
    const limpeza = abortWith({
      dir,
      exec: fakeExec(),
      lease: comForce,
      force: true,
    })
    assert.equal(limpeza.exitCode, EXIT_CODES.OK)
    assert.equal(comForce.named("releaseLease")[0].args.force, true)
    assert.match(limpeza.logs, /corrompido descartado/)
  } finally {
    cleanup(dir)
  }
})

test("--abort sem lease algum é inócuo e sai em 0", async () => {
  const dir = buildFixtureDir()
  try {
    const lease = fakeLease()
    const { exitCode, logs } = abortWith({ dir, exec: fakeExec(), lease })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.match(logs, /não há lease para devolver/)
  } finally {
    cleanup(dir)
  }
})

async function captureStream(streamName, fn) {
  const stream = process[streamName]
  const original = stream.write.bind(stream)
  let output = ""
  stream.write = (chunk) => {
    output += chunk
    return true
  }
  try {
    return { result: await fn(), output }
  } finally {
    stream.write = original
  }
}

test("`release --help` imprime o uso e não chega a tocar no git", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const preflight = stubPreflight(EXIT_CODES.OK)
    const { result, output } = await captureStream("stdout", () =>
      run(["release", "--help"], {
        cwd: dir,
        exec,
        runPreflight: preflight,
        lease: fakeLease(),
        log: () => {},
      })
    )
    assert.equal(result, EXIT_CODES.OK)
    assert.match(output, /uso: pnpm platform release/)
    assert.match(output, /--status/)
    assert.match(output, /--abort/)
    assert.equal(preflight.calls.length, 0)
    assert.equal(exec.calls.length, 0)
  } finally {
    cleanup(dir)
  }
})

test("uma flag desconhecida sai em USAGE_ERROR sem criar marcador", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const preflight = stubPreflight(EXIT_CODES.OK)
    const { result, output } = await captureStream("stderr", () =>
      run(["release", "--halp"], {
        cwd: dir,
        exec,
        runPreflight: preflight,
        lease: fakeLease(),
        log: () => {},
      })
    )
    assert.equal(result, EXIT_CODES.USAGE_ERROR)
    assert.match(output, /flag desconhecida: release --halp/)
    assert.equal(preflight.calls.length, 0)
    assert.equal(exec.calls.length, 0)
  } finally {
    cleanup(dir)
  }
})

test("a guarda não estreita `--push`: a versão colada na flag continua valendo", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const preflight = stubPreflight(EXIT_CODES.OK)
    const exitCode = await run(["release", "--push", "4.1.0"], {
      cwd: dir,
      exec,
      runPreflight: preflight,
      lease: fakeLease(),
      log: () => {},
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(preflight.calls[0].version, "4.1.0")
    assert.equal(
      exec.calls.some((c) => c.args[0] === "push"),
      true
    )
  } finally {
    cleanup(dir)
  }
})

test("`release --status` roteia para o status e não chega ao preflight, mesmo com versão colada", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const preflight = stubPreflight(EXIT_CODES.OK)
    const logs = []
    const exitCode = await run(["release", "--status", "3.0.0"], {
      cwd: dir,
      exec,
      runPreflight: preflight,
      lease: fakeLease(),
      log: (line) => logs.push(line),
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(preflight.calls.length, 0)
    assert.equal(hasCommit(exec), false)
    assert.match(logs.join("\n"), /release --status — lease: nenhum/)
  } finally {
    cleanup(dir)
  }
})

test("`release --abort` roteia para o abort e `--force` chega até ele", async () => {
  const dir = buildFixtureDir()
  try {
    const exec = fakeExec()
    const preflight = stubPreflight(EXIT_CODES.OK)
    const lease = fakeLease({
      corruptRead: true,
    })
    const exitCode = await run(["release", "--abort", "--force"], {
      cwd: dir,
      exec,
      runPreflight: preflight,
      lease,
      log: () => {},
    })
    assert.equal(exitCode, EXIT_CODES.OK)
    assert.equal(preflight.calls.length, 0)
    assert.equal(hasCommit(exec), false)
    assert.equal(lease.named("releaseLease")[0].args.force, true)
  } finally {
    cleanup(dir)
  }
})

test("unknownReleaseFlags reconhece push, help, status, abort e force", () => {
  assert.deepEqual(unknownReleaseFlags({}), [])
  assert.deepEqual(unknownReleaseFlags({ push: true }), [])
  assert.deepEqual(unknownReleaseFlags({ help: true }), [])
  assert.deepEqual(unknownReleaseFlags({ status: true }), [])
  assert.deepEqual(unknownReleaseFlags({ abort: true, force: true }), [])
  assert.deepEqual(unknownReleaseFlags({ push: true, dry: true }), ["dry"])
})

// O defeito registrado no STATE.md de 2026-08-28: depois da tag da v3.0.0
// existir na origin, `--status` continuava dizendo `release em voo` na mesma
// saída em que imprimia `última tag estável v3.0.0`. Tinha a evidência e não
// agia sobre ela — e, como a guarda de pre-push não faz rede no caminho de
// allow, `main` ficava congelada para todo não-titular até alguém cortar a
// PRÓXIMA release.
test("--status libera o lease quando a tag da versão já existe em origin", async () => {
  const dir = buildFixtureDir()
  try {
    const held = {
      version: "3.0.0",
      stage: "marker-pushed",
      holder: { id: "sess-outra", kind: "session" },
      markerSha: "322f32783743dd59c2a0697bbae3054100137fb9",
    }
    const lease = fakeLease({
      lease: held,
      matches: false,
      stableTags: ["v3.0.0"],
      reconcile: { cleared: true, lease: held },
    })
    const { exitCode, logs } = statusWith({ dir, exec: fakeExec(), lease })

    assert.equal(exitCode, EXIT_CODES.OK)
    // A linha do lease que existia vem ANTES da liberação: quem lê o output
    // precisa ver o que havia e o que foi feito com ele.
    assert.match(logs, /lease: v3\.0\.0, estágio "marker-pushed"/)
    assert.match(
      logs,
      /já tem tag em origin — release terminado, lease liberado/
    )
    assert.match(logs, /veredito: livre/)
    assert.doesNotMatch(logs, /release em voo/)
    assert.equal(lease.named("reconcileFinishedLease").length, 1)
    // Não é `--abort`: nada é abandonado e o marcador não é tocado.
    assert.equal(lease.named("releaseLease").length, 0)
  } finally {
    cleanup(dir)
  }
})

test("--status não libera o lease enquanto a tag não existe em origin", async () => {
  const dir = buildFixtureDir()
  try {
    const lease = fakeLease({
      lease: {
        version: "3.1.0",
        stage: "marker-pushed",
        holder: { id: "sess-outra", kind: "session" },
        markerSha: "abc1234",
      },
      matches: false,
      reconcile: { cleared: false },
    })
    const { exitCode, logs } = statusWith({ dir, exec: fakeExec(), lease })

    assert.equal(exitCode, EXIT_CODES.OK)
    assert.doesNotMatch(logs, /lease liberado/)
    assert.match(logs, /veredito: release em voo — não pushe main/)
  } finally {
    cleanup(dir)
  }
})

// Um lease corrompido não nomeia versão nenhuma para conferir contra a origin:
// ele continua sendo assunto de `--abort --force`.
test("--status não tenta liberar um lease corrompido", async () => {
  const dir = buildFixtureDir()
  try {
    const lease = fakeLease({ corruptRead: true })
    const { logs } = statusWith({ dir, exec: fakeExec(), lease })

    assert.match(logs, /lease: corrompido/)
    assert.equal(lease.named("reconcileFinishedLease").length, 0)
  } finally {
    cleanup(dir)
  }
})
