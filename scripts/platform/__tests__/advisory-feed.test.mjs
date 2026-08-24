import assert from "node:assert/strict"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import {
  FeedUnreachableError,
  fetchRemoteAdvisories,
  mergeAdvisories,
} from "../lib/advisory-feed.mjs"

const SOURCE = "gh:acme/platform-template"
const TAG = "v2.1.0"

const ADVISORY_MD = [
  "---",
  "id: ADV-20260821-01",
  "kind: breaking",
  "module: notification",
  'affects: ">=1.0.0 <2.0.0"',
  "severity: high",
  'detect: "true"',
  'fix: "true"',
  "parity: catalog/notification/parity",
  "---",
  "",
  "body",
  "",
].join("\n")

// Simula o que `git clone --sparse` + `sparse-checkout set docs/advisories` faria em
// disco: escreve os arquivos fixture no dest recebido pelo comando `clone`.
function fakeExec({
  advisories = { "ADV-20260821-01.md": ADVISORY_MD },
  tagDate = "2026-08-21T10:00:00-03:00",
} = {}) {
  const calls = []
  const exec = (cmd, args) => {
    calls.push(args)
    if (args[0] === "clone") {
      const dest = args.at(-1)
      const advisoriesDir = path.join(dest, "docs", "advisories")
      mkdirSync(advisoriesDir, { recursive: true })
      for (const [name, content] of Object.entries(advisories)) {
        writeFileSync(path.join(advisoriesDir, name), content)
      }
      return ""
    }
    if (args[0] === "sparse-checkout") return ""
    if (args[0] === "log") return `${tagDate}\n`
    throw new Error(`unexpected git args: ${args.join(" ")}`)
  }
  return { exec, calls }
}

test("fetchRemoteAdvisories: fresh fetch clones, parses and populates the cache", () => {
  const cacheRoot = mkdtempSync(path.join(tmpdir(), "feed-cache-"))
  const { exec, calls } = fakeExec()

  const result = fetchRemoteAdvisories(SOURCE, TAG, {
    cacheRoot,
    exec,
    now: 1_000,
  })

  assert.equal(result.fromCache, false)
  assert.equal(result.tag, TAG)
  assert.equal(result.tagDate, "2026-08-21T10:00:00-03:00")
  assert.deepEqual(
    result.advisories.map((a) => a.id),
    ["ADV-20260821-01"]
  )
  assert.deepEqual(result.skipped, [])
  assert.ok(calls.some((args) => args[0] === "clone"))

  const [cacheFile] = readdirSync(cacheRoot)
  const cached = JSON.parse(
    readFileSync(path.join(cacheRoot, cacheFile), "utf8")
  )
  assert.equal(cached.source, SOURCE)
  assert.equal(cached.tag, TAG)
})

test("fetchRemoteAdvisories: a TTL hit never touches exec again", () => {
  const cacheRoot = mkdtempSync(path.join(tmpdir(), "feed-cache-"))
  const { exec } = fakeExec()
  fetchRemoteAdvisories(SOURCE, TAG, { cacheRoot, exec, now: 1_000 })

  const failingExec = () => assert.fail("must not exec on a cache hit")
  const second = fetchRemoteAdvisories(SOURCE, TAG, {
    cacheRoot,
    exec: failingExec,
    now: 2_000,
    ttlMs: 24 * 60 * 60 * 1000,
  })

  assert.equal(second.fromCache, true)
  assert.deepEqual(
    second.advisories.map((a) => a.id),
    ["ADV-20260821-01"]
  )
})

test("fetchRemoteAdvisories: an unparseable advisory is skipped, not thrown", () => {
  const cacheRoot = mkdtempSync(path.join(tmpdir(), "feed-cache-"))
  const { exec } = fakeExec({
    advisories: {
      "ADV-20260821-01.md": ADVISORY_MD,
      "ADV-20260821-02.md":
        "---\nid: ADV-20260821-02\n---\ncorpo sem os campos obrigatórios\n",
    },
  })

  const result = fetchRemoteAdvisories(SOURCE, TAG, {
    cacheRoot,
    exec,
    now: 1_000,
  })

  assert.deepEqual(
    result.advisories.map((a) => a.id),
    ["ADV-20260821-01"]
  )
  assert.equal(result.skipped.length, 1)
  assert.equal(result.skipped[0].file, "ADV-20260821-02.md")
})

test("fetchRemoteAdvisories: a corrupt cache plus a failing exec throws FeedUnreachableError", () => {
  const cacheRoot = mkdtempSync(path.join(tmpdir(), "feed-cache-"))
  fetchRemoteAdvisories(SOURCE, TAG, {
    cacheRoot,
    exec: fakeExec().exec,
    now: 1_000,
  })

  const [cacheFile] = readdirSync(cacheRoot)
  writeFileSync(path.join(cacheRoot, cacheFile), "{not json")

  assert.throws(
    () =>
      fetchRemoteAdvisories(SOURCE, TAG, {
        cacheRoot,
        now: 2_000,
        exec: () => {
          throw new Error("offline")
        },
      }),
    FeedUnreachableError
  )
})

test("mergeAdvisories: the remote copy of a duplicated id wins", () => {
  const local = [
    { id: "ADV-1", severity: "low" },
    { id: "ADV-2", severity: "low" },
  ]
  const remote = [
    { id: "ADV-1", severity: "high" },
    { id: "ADV-3", severity: "high" },
  ]

  const merged = mergeAdvisories(local, remote)

  assert.deepEqual(
    merged.map((a) => [a.id, a.severity]),
    [
      ["ADV-1", "high"],
      ["ADV-2", "low"],
      ["ADV-3", "high"],
    ]
  )
})
