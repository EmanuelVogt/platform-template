import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(TESTS_DIR, "..", "..", "..")
const HOOK_PATH = path.join(
  REPO_ROOT,
  ".claude",
  "hooks",
  "template-behind.mjs"
)

function runHook({
  projectDir,
  hookEventName = "SessionStart",
  sessionId = randomUUID(),
}) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify({
      session_id: sessionId,
      hook_event_name: hookEventName,
    }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  })
}

function additionalContextOf(result) {
  assert.equal(result.status, 0)
  if (result.stdout === "") return undefined
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext
}

// Repositório git real (não bare) usado como `_src_path` — o próprio hook faz
// `git ls-remote`/`git clone --sparse` de verdade contra ele (sem rede, mas sem
// stub de `exec`, já que um processo filho não aceita função injetada).
function git(args, cwd) {
  return execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" })
}

function makeTemplateSourceRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "template-behind-source-"))
  git(["init", "-q", "-b", "main", "."], dir)
  git(["config", "user.email", "t@example.com"], dir)
  git(["config", "user.name", "Test"], dir)

  const advisoriesDir = path.join(dir, "docs", "advisories")
  mkdirSync(advisoriesDir, { recursive: true })
  writeFileSync(path.join(advisoriesDir, "README.md"), "base\n")
  git(["add", "-A"], dir)
  git(["commit", "-q", "-m", "base"], dir)
  git(["tag", "v1.0.0"], dir)

  writeFileSync(
    path.join(advisoriesDir, "ADV-20260821-01.md"),
    [
      "---",
      'id: "ADV-20260821-01"',
      'kind: "bug"',
      'module: "kernel"',
      'affects: ">=1.0.0 <2.0.0"',
      'severity: "high"',
      'detect: "pnpm platform status"',
      'fix: "copier update to >= v2.0.0"',
      'parity: "n/a"',
      "---",
      "body",
      "",
    ].join("\n")
  )
  git(["add", "-A"], dir)
  git(["commit", "-q", "-m", "advisory only in v2.0.0"], dir)
  git(["tag", "v2.0.0"], dir)

  return dir
}

function makeChildProjectDir({ source, commit }) {
  const dir = mkdtempSync(path.join(tmpdir(), "template-behind-child-"))
  writeFileSync(
    path.join(dir, ".copier-answers.yml"),
    `_src_path: ${source}\n_commit: ${commit}\n`
  )
  return dir
}

// Mesma chave de cache que o hook usa para `cachedRemoteStableTags` — grava a
// lista de tags direto, sem passar por `git ls-remote` real.
function seedTagsCache(source, tags) {
  const cacheKey = createHash("sha1").update(source).digest("hex").slice(0, 12)
  const cachePath = path.join(
    tmpdir(),
    `platform-template-tags-${cacheKey}.json`
  )
  writeFileSync(
    cachePath,
    JSON.stringify({ source, checkedAt: Date.now(), tags })
  )
}

test("template repo itself (no _src_path): silent, no feed fetched (FEED-04)", () => {
  const projectDir = mkdtempSync(
    path.join(tmpdir(), "template-behind-notemplate-")
  )
  const result = runHook({ projectDir })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, "")
})

test("behind + pending: the advisory published only at the latest tag is printed (FEED-01/02)", () => {
  const source = makeTemplateSourceRepo()
  const projectDir = makeChildProjectDir({ source, commit: "v1.0.0" })

  const context = additionalContextOf(runHook({ projectDir }))

  assert.equal(
    context.split("\n")[0],
    "template behind: installed v1.0.0, latest v2.0.0 — 1 tag(s): v2.0.0"
  )
  assert.equal(
    context.split("\n")[2],
    "ADV-20260821-01 bug high kernel — fix: copier update to >= v2.0.0"
  )
})

test("feed unreachable (tag absent at the source): behind message only, exit 0 (FEED-03)", () => {
  const source = makeTemplateSourceRepo()
  // Tags cache forjado com uma tag "latest" que não existe de fato no repositório:
  // `computeTemplateStatus` acredita que há uma tag nova, mas `fetchRemoteAdvisories`
  // (clone --branch v9.9.9) falha de verdade — sem stub de exec no processo filho.
  seedTagsCache(source, ["v1.0.0", "v9.9.9"])
  const projectDir = makeChildProjectDir({ source, commit: "v1.0.0" })

  const context = additionalContextOf(runHook({ projectDir }))

  assert.equal(
    context,
    "template behind: installed v1.0.0, latest v9.9.9 — 1 tag(s): v9.9.9\n" +
      "run the template-update skill (pnpm platform status for the full picture)"
  )
})

test("cached feed still prints its advisory once the source is gone (FEED-03 cache-only)", () => {
  const source = makeTemplateSourceRepo()
  const projectDir = makeChildProjectDir({ source, commit: "v1.0.0" })

  const first = additionalContextOf(runHook({ projectDir }))
  assert.match(
    first,
    /^ADV-20260821-01/m,
    "run 1 must have populated both caches"
  )

  rmSync(source, { recursive: true, force: true })

  const second = additionalContextOf(runHook({ projectDir }))
  assert.equal(
    second,
    first,
    "run 2 reads from cache alone, the source is unreachable"
  )
})
