import assert from "node:assert/strict"
import { test } from "node:test"
import {
  decideRelease,
  isMarkerSubject,
  parseMarkerSubject,
} from "../lib/release-marker.mjs"

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
