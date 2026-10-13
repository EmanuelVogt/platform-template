#!/usr/bin/env node
// Keeps the local default branch from drifting off its origin: local merges are the
// norm here (dev-workflow skill § A branch is only born inside a worktree), so
// landing on a default branch that is behind what someone else already pushed is
// what makes the two diverge. The branch is detected, never assumed `main`:
// PLATFORM_MAIN_BRANCH, else origin/HEAD, else `main`/`master` — whichever origin
// (or the checkout) has (lib/main-sync.mjs, resolveMainBranch).
//   PreToolUse(Bash)   blocks a merge/commit/cherry-pick/rebase/revert/am/pull or push
//                      that lands on the default branch while it is behind origin;
//                      when it sits unpushed too long, reminds the agent that the push
//                      is the user's call (never pushes). Never touches other work.
//   --session          SessionStart: one drift line, silent when in sync.
//   --git-hook         lefthook post-commit/post-merge: drift line on stderr when on
//                      the default branch and behind origin (ahead is the normal state
//                      here: a push waits for the user, so it is not worth a line on
//                      every commit).
// origin is fetched at most once per FETCH_CACHE_MS, fail-open when offline.
// Decision logic + tests: lib/main-sync.mjs, __tests__/main-sync-guard.test.mjs.
// Harness tooling — not app code.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  decide,
  driftLine,
  FETCH_CACHE_MS,
  FETCH_TIMEOUT_MS,
  mainOps,
  originOf,
  resolveMainBranch,
} from "./lib/main-sync.mjs"

const git = (dir, args, timeout = 5000) =>
  execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  }).trim()

const tryGit = (dir, args, timeout) => {
  try {
    return git(dir, args, timeout)
  } catch {
    return null
  }
}

const hasRef = (dir, ref) =>
  tryGit(dir, ["show-ref", "--verify", "--quiet", ref]) !== null

const mainBranchOf = (dir) =>
  resolveMainBranch({
    override: process.env.PLATFORM_MAIN_BRANCH,
    originHead: tryGit(dir, [
      "symbolic-ref",
      "--short",
      "-q",
      "refs/remotes/origin/HEAD",
    ]),
    hasRemote: (name) => hasRef(dir, `refs/remotes/origin/${name}`),
    hasLocal: (name) => hasRef(dir, `refs/heads/${name}`),
  })

const cacheFile = (commonDir) =>
  path.join(
    os.tmpdir(),
    `platform-main-sync-${createHash("sha1").update(commonDir).digest("hex").slice(0, 12)}.json`
  )

// fetch origin's default branch unless a fetch of this repository happened within the cache window
const fetchOriginMain = (dir, main) => {
  const commonDir = tryGit(dir, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ])
  if (!commonDir) return "not a git repository"
  const file = cacheFile(commonDir)
  try {
    const cached = JSON.parse(readFileSync(file, "utf8"))
    if (Date.now() - cached.at < FETCH_CACHE_MS) return cached.error ?? null
  } catch {
    // no cache yet: fetch below
  }
  let error = null
  try {
    git(dir, ["fetch", "--quiet", "origin", main], FETCH_TIMEOUT_MS)
  } catch (e) {
    error =
      e.code === "ETIMEDOUT" || e.signal
        ? `timeout after ${FETCH_TIMEOUT_MS / 1000}s`
        : "fetch failed (offline?)"
  }
  try {
    writeFileSync(file, JSON.stringify({ at: Date.now(), error }))
  } catch {
    // without the cache the next call fetches again
  }
  return error
}

const readDrift = (dir, main, { fetch = true } = {}) => {
  const fetchError = fetch ? fetchOriginMain(dir, main) : null
  const counts = tryGit(dir, [
    "rev-list",
    "--left-right",
    "--count",
    `${main}...${originOf(main)}`,
  ])
  if (!counts)
    return { ahead: null, behind: null, oldestUnpushedHours: null, fetchError }
  const [ahead, behind] = counts.split(/\s+/).map(Number)
  let oldestUnpushedHours = null
  if (ahead > 0) {
    // first-parent: when each commit LANDED on the branch (a merge's own time), not
    // when a branch commit was authored days earlier
    const times = (
      tryGit(dir, [
        "log",
        "--first-parent",
        "--format=%ct",
        `${originOf(main)}..${main}`,
      ]) ?? ""
    )
      .split("\n")
      .filter(Boolean)
      .map(Number)
    if (times.length)
      oldestUnpushedHours = (Date.now() / 1000 - Math.min(...times)) / 3600
  }
  return { ahead, behind, oldestUnpushedHours, fetchError }
}

const mode = process.argv[2]

if (mode === "--session" || mode === "--git-hook") {
  // a git hook runs in the checkout that committed, which may not be the session's
  const dir =
    mode === "--git-hook"
      ? process.cwd()
      : process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const main = mainBranchOf(dir)
  if (
    mode === "--git-hook" &&
    tryGit(dir, ["symbolic-ref", "--short", "-q", "HEAD"]) !== main
  )
    process.exit(0)
  const drift = readDrift(dir, main, { fetch: mode === "--session" })
  if (mode === "--git-hook" && !(drift.behind > 0)) process.exit(0)
  const line = driftLine(drift, main)
  if (line)
    (mode === "--session" ? process.stdout : process.stderr).write(`${line}\n`)
  process.exit(0)
}

let data
try {
  data = JSON.parse(readFileSync(0, "utf8"))
} catch {
  process.exit(0)
}
const command = data.tool_input?.command
if (typeof command !== "string" || !/\bgit\b/.test(command)) process.exit(0)

const cwd = data.cwd || process.cwd()
const main = mainBranchOf(cwd)
const env = {
  main,
  resolve: (from, to) =>
    path.resolve(from, to.replace(/^~(?=\/|$)/, os.homedir())),
  branchOf: (dir) => tryGit(dir, ["symbolic-ref", "--short", "-q", "HEAD"]),
  containsOriginMain: (dir, ref) =>
    tryGit(dir, ["merge-base", "--is-ancestor", originOf(main), ref]) !== null,
}

const candidates = mainOps(command, cwd, env)
if (candidates.length === 0) process.exit(0)
const drift = readDrift(candidates[0].dir, main)
// re-read after the fetch: "does this branch already carry origin?" needs the fresh ref
const { block, remind } = decide(mainOps(command, cwd, env), drift, main)
if (block) {
  process.stderr.write(`${block}\n`)
  process.exit(2)
}
if (remind) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: remind,
      },
    })
  )
}
process.exit(0)
