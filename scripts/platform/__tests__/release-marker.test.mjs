import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import {
  decideFromGit,
  decideRelease,
  isMarkerSubject,
  parseMarkerSubject,
  writeGithubOutput,
} from "../lib/release-marker.mjs"

const ZERO_SHA = "0000000000000000000000000000000000000000"

// Roteia por sub-comando git; cada teste passa só as respostas que usa.
function gitRouter({
  headSubject = "chore(release): v2.4.0",
  rangeCalls = {},
  changedFiles = [],
} = {}) {
  return (command, args) => {
    const joined = args.join(" ")
    if (joined === "log -1 --format=%s") {
      return { status: 0, stdout: `${headSubject}\n` }
    }
    if (joined.startsWith("log --format=%s ")) {
      const range = joined.slice("log --format=%s ".length)
      const response = rangeCalls[range]
      if (!response) throw new Error(`unexpected range: ${range}`)
      return response
    }
    if (joined.startsWith("diff-tree")) {
      return {
        status: 0,
        stdout: changedFiles.length ? `${changedFiles.join("\n")}\n` : "",
      }
    }
    throw new Error(`unexpected git call: ${command} ${joined}`)
  }
}

test("parseMarkerSubject aceita chore(release): v2.4.0", () => {
  assert.deepEqual(parseMarkerSubject("chore(release): v2.4.0"), {
    ok: true,
    version: "2.4.0",
  })
})

test("parseMarkerSubject rejeita chore(release): 2.4.0 (sem v) e nomeia a forma esperada", () => {
  const result = parseMarkerSubject("chore(release): 2.4.0")
  assert.equal(result.ok, false)
  assert.match(result.reason, /chore\(release\): vX\.Y\.Z/)
})

test("parseMarkerSubject rejeita chore(release):v2.4.0 (sem espaço)", () => {
  assert.equal(parseMarkerSubject("chore(release):v2.4.0").ok, false)
})

test("parseMarkerSubject rejeita chore(release): v2.4.0-rc.1 (prerelease)", () => {
  assert.equal(parseMarkerSubject("chore(release): v2.4.0-rc.1").ok, false)
})

test("isMarkerSubject é true para o assunto exato", () => {
  assert.equal(isMarkerSubject("chore(release): v2.4.0"), true)
})

test("isMarkerSubject é true para o prefixo frouxo, mesmo malformado", () => {
  assert.equal(isMarkerSubject("chore(release):v2.4.0"), true)
  assert.equal(isMarkerSubject("chore(release): 2.4.0"), true)
})

test("isMarkerSubject é false para um assunto não relacionado", () => {
  assert.equal(isMarkerSubject("chore(deps): bump x"), false)
})

test("isMarkerSubject é false quando o texto do marcador só aparece fora do prefixo", () => {
  assert.equal(
    isMarkerSubject("docs: mention chore(release): usage"),
    false
  )
})

test("decideRelease: skip quando nenhum subject é marcador (filtro frouxo do CI bateu no corpo)", () => {
  assert.deepEqual(
    decideRelease({
      headSubject: "docs: mention chore(release): usage",
      subjects: ["docs: mention chore(release): usage"],
      changedFiles: [],
    }),
    { action: "skip" }
  )
})

test("decideRelease: release quando o head é um marcador válido, sem outro marcador e sem arquivos", () => {
  assert.deepEqual(
    decideRelease({
      headSubject: "chore(release): v2.4.0",
      subjects: ["chore(release): v2.4.0", "feat: something"],
      changedFiles: [],
    }),
    { action: "release", version: "2.4.0" }
  )
})

test("MARK-06: decideRelease falha quando o head é um marcador malformado, nomeando a forma esperada", () => {
  const result = decideRelease({
    headSubject: "chore(release): 2.4.0",
    subjects: ["chore(release): 2.4.0"],
    changedFiles: [],
  })
  assert.equal(result.action, "fail")
  assert.match(result.reason, /chore\(release\): vX\.Y\.Z/)
})

test("MARK-07: decideRelease falha quando um subject anterior é marcador e o head não é", () => {
  const result = decideRelease({
    headSubject: "feat: something",
    subjects: ["chore(release): v2.4.0", "feat: something"],
    changedFiles: [],
  })
  assert.equal(result.action, "fail")
  assert.match(result.reason, /não é o head/)
})

test("edge case — dois marcadores num push: só o head conta, o anterior aciona MARK-07", () => {
  const result = decideRelease({
    headSubject: "chore(release): v2.4.0",
    subjects: ["chore(release): v2.3.0", "chore(release): v2.4.0"],
    changedFiles: [],
  })
  assert.equal(result.action, "fail")
  assert.match(result.reason, /v2\.3\.0/)
  assert.match(result.reason, /não é o head/)
})

test("precedência: MARK-06 (head malformado) vence mesmo com um marcador anterior também presente", () => {
  const result = decideRelease({
    headSubject: "chore(release): 2.4.0",
    subjects: ["chore(release): v2.3.0", "chore(release): 2.4.0"],
    changedFiles: [],
  })
  assert.equal(result.action, "fail")
  assert.match(result.reason, /chore\(release\): vX\.Y\.Z/)
})

test("precedência: MARK-07 (marcador anterior) vence sobre MARK-08 (arquivos alterados)", () => {
  const result = decideRelease({
    headSubject: "chore(release): v2.4.0",
    subjects: ["chore(release): v2.3.0", "chore(release): v2.4.0"],
    changedFiles: ["docs/dev/template-changelog.md"],
  })
  assert.equal(result.action, "fail")
  assert.match(result.reason, /não é o head/)
})

test("MARK-08: decideRelease falha quando o marcador do head altera arquivos, nomeando a contagem", () => {
  const result = decideRelease({
    headSubject: "chore(release): v2.4.0",
    subjects: ["chore(release): v2.4.0"],
    changedFiles: ["a.txt", "b.txt"],
  })
  assert.equal(result.action, "fail")
  assert.match(result.reason, /2 arquivo/)
})

test("decideFromGit: action release quando o head é um marcador válido e vazio", () => {
  const exec = gitRouter({
    headSubject: "chore(release): v2.4.0",
    rangeCalls: {
      "abc..def": { status: 0, stdout: "chore(release): v2.4.0\n" },
    },
    changedFiles: [],
  })
  const decision = decideFromGit({ exec, before: "abc", sha: "def" })
  assert.deepEqual(decision, { action: "release", version: "2.4.0" })
})

test("decideFromGit: action skip quando nenhum subject é marcador", () => {
  const exec = gitRouter({
    headSubject: "feat: something",
    rangeCalls: {
      "abc..def": { status: 0, stdout: "feat: something\n" },
    },
  })
  const decision = decideFromGit({ exec, before: "abc", sha: "def" })
  assert.deepEqual(decision, { action: "skip" })
})

test("decideFromGit: action fail quando o head é um marcador malformado", () => {
  const exec = gitRouter({
    headSubject: "chore(release): 2.4.0",
    rangeCalls: {
      "abc..def": { status: 0, stdout: "chore(release): 2.4.0\n" },
    },
  })
  const decision = decideFromGit({ exec, before: "abc", sha: "def" })
  assert.equal(decision.action, "fail")
  assert.match(decision.reason, /chore\(release\): vX\.Y\.Z/)
})

test("decideFromGit: before all-zeros (primeiro push) cai direto para HEAD~1..HEAD", () => {
  const exec = gitRouter({
    headSubject: "chore(release): v2.4.0",
    rangeCalls: {
      "HEAD~1..HEAD": { status: 0, stdout: "chore(release): v2.4.0\n" },
    },
  })
  const decision = decideFromGit({ exec, before: ZERO_SHA, sha: "def" })
  assert.deepEqual(decision, { action: "release", version: "2.4.0" })
})

test("decideFromGit: range git log com status != 0 cai para HEAD~1..HEAD", () => {
  const exec = gitRouter({
    headSubject: "chore(release): v2.4.0",
    rangeCalls: {
      "abc..def": { status: 128, stdout: "" },
      "HEAD~1..HEAD": { status: 0, stdout: "chore(release): v2.4.0\n" },
    },
  })
  const decision = decideFromGit({ exec, before: "abc", sha: "def" })
  assert.deepEqual(decision, { action: "release", version: "2.4.0" })
})

function withTempOutputFile(run) {
  const dir = mkdtempSync(path.join(tmpdir(), "release-marker-output-"))
  const outputPath = path.join(dir, "github-output")
  try {
    return run(outputPath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test("writeGithubOutput: $GITHUB_OUTPUT ausente não lança", () => {
  assert.doesNotThrow(() =>
    writeGithubOutput({ action: "release", version: "2.4.0" }, undefined)
  )
})

test("writeGithubOutput: release grava release=true e version=<x.y.z>", () => {
  withTempOutputFile((outputPath) => {
    writeGithubOutput({ action: "release", version: "2.4.0" }, outputPath)
    assert.equal(readFileSync(outputPath, "utf8"), "release=true\nversion=2.4.0\n")
  })
})

test("writeGithubOutput: skip grava release=false e version vazio", () => {
  withTempOutputFile((outputPath) => {
    writeGithubOutput({ action: "skip" }, outputPath)
    assert.equal(readFileSync(outputPath, "utf8"), "release=false\nversion=\n")
  })
})
