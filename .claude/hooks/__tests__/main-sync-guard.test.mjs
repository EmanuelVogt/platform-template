import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, test } from "node:test"
import {
  decide,
  driftLine,
  mainOps,
  REMIND_AGE_HOURS,
  REMIND_AHEAD_COMMITS,
  resolveMainBranch,
  words,
} from "../lib/main-sync.mjs"
import { runHook } from "./run-hook.mjs"

const MAIN_DIR = "/repo"
const WT = "/repo/.worktrees/feat"

// /repo is on main, the worktree on feat/x; feat/synced already merged origin/main
const env = (branches = {}) => ({
  resolve: (from, to) => path.resolve(from, to),
  branchOf: (dir) =>
    branches[dir] ?? { [MAIN_DIR]: "main", [WT]: "feat/x" }[dir] ?? null,
  containsOriginMain: (_dir, ref) => ref === "feat/synced",
})
const kinds = (command, cwd = MAIN_DIR, e = env()) =>
  mainOps(command, cwd, e).map((op) => op.kind)

describe("words", () => {
  test("quotes are removed and keep their spaces", () => {
    assert.deepEqual(words(`git commit -m "fix: a b" -- 'x y'`), [
      "git",
      "commit",
      "-m",
      "fix: a b",
      "--",
      "x y",
    ])
  })
})

describe("mainOps — command parsing", () => {
  test("landing subcommands on main", () => {
    for (const sub of [
      "commit -m x",
      "merge feat/x",
      "cherry-pick abc",
      "revert abc",
      "am p.patch",
      "rebase feat/x",
    ]) {
      assert.deepEqual(kinds(`git ${sub}`), ["land"], sub)
    }
  })

  test("the same subcommands off main are ignored", () => {
    for (const sub of [
      "commit -m x",
      "merge feat/y",
      "cherry-pick abc",
      "rebase main",
      "push origin feat/x",
      "push",
    ]) {
      assert.deepEqual(kinds(`git ${sub}`, WT), [], sub)
    }
  })

  test("fetch, status, log, abort and dry-run never count", () => {
    for (const c of [
      "git fetch origin main",
      "git status",
      "git log main",
      "git merge --abort",
      "git rebase --abort",
      "git cherry-pick --quit",
      "git commit --dry-run",
    ]) {
      assert.deepEqual(kinds(c), [], c)
    }
  })

  test("integrating origin/main is its own kind", () => {
    assert.deepEqual(kinds("git merge origin/main"), ["integrate"])
    assert.deepEqual(kinds("git merge --ff-only origin/main"), ["integrate"])
    assert.deepEqual(kinds("git pull"), ["integrate"])
    assert.deepEqual(kinds("git pull --rebase origin main"), ["integrate"])
    assert.deepEqual(kinds("git rebase origin/main"), ["integrate"])
    assert.deepEqual(
      kinds("git merge feat/synced"),
      ["integrate"],
      "branch already carrying origin/main"
    )
    assert.deepEqual(kinds("git pull origin feat/x"), ["land"])
  })

  test("git -C <path> resolves the target checkout", () => {
    assert.deepEqual(kinds(`git -C ${MAIN_DIR} merge feat/x`, WT), ["land"])
    assert.deepEqual(kinds("git -C ../.. merge feat/x", WT), ["land"])
    assert.deepEqual(kinds(`git -C ${WT} merge origin/main`, MAIN_DIR), [])
  })

  test("cd and checkout within the command are followed", () => {
    assert.deepEqual(kinds(`cd ${MAIN_DIR} && git merge feat/x`, WT), ["land"])
    assert.deepEqual(kinds("git checkout main && git merge feat/x", WT), [
      "land",
    ])
    assert.deepEqual(kinds("git switch feat/y && git commit -m x"), [])
  })

  test("rebase naming main as the branch lands on main from anywhere", () => {
    assert.deepEqual(kinds("git rebase feat/x main", WT), ["land"])
  })

  test("push of main", () => {
    assert.deepEqual(kinds("git push"), ["push"])
    assert.deepEqual(kinds("git push origin main"), ["push"])
    assert.deepEqual(kinds("git push origin HEAD:main", WT), ["push"])
    assert.deepEqual(kinds("git push --all", WT), ["push"])
    assert.deepEqual(kinds("git push origin --delete old"), [])
  })

  test("a commit message that mentions git merge is text", () => {
    assert.deepEqual(
      kinds(`git -C ${WT} commit -m "docs: run git merge main; then git push"`),
      []
    )
  })
})

const drift = (ahead, behind, oldestUnpushedHours = null, extra = {}) => ({
  ahead,
  behind,
  oldestUnpushedHours,
  fetchError: null,
  ...extra,
})
const ops = (...list) =>
  list.map((kind) => ({ kind, statement: `git ${kind}`, dir: MAIN_DIR }))

describe("decide — ahead/behind/age matrix", () => {
  test("no op on main → silent whatever the drift", () => {
    assert.deepEqual(decide([], drift(500, 600, 99)), {
      block: null,
      remind: null,
    })
  })

  test("behind blocks land and push, never integrate", () => {
    assert.match(
      decide(ops("land"), drift(0, 3)).block,
      /3 commit\(s\) behind origin\/main/
    )
    assert.match(
      decide(ops("land"), drift(10, 3, 1)).block,
      /git merge origin\/main/
    )
    assert.ok(decide(ops("push"), drift(2, 1)).block)
    assert.equal(decide(ops("integrate"), drift(5, 7)).block, null)
    assert.ok(
      decide(ops("integrate", "land"), drift(0, 1)).block,
      "a later land in the same command still blocks"
    )
  })

  test("in sync or freshly ahead → silent", () => {
    assert.deepEqual(decide(ops("land"), drift(0, 0)), {
      block: null,
      remind: null,
    })
    assert.deepEqual(decide(ops("land"), drift(3, 0, REMIND_AGE_HOURS - 1)), {
      block: null,
      remind: null,
    })
  })

  test("ahead past the age or count threshold → non-blocking reminder that the push is the user's call", () => {
    const old = decide(ops("land"), drift(2, 0, REMIND_AGE_HOURS + 1))
    assert.equal(old.block, null)
    assert.match(old.remind, /unpushed work.*user's call/s)
    assert.match(old.remind, /never push on your own/)
    assert.match(old.remind, /dev-workflow skill/)
    assert.match(
      decide(ops("land"), drift(REMIND_AHEAD_COMMITS + 1, 0, 0.1)).remind,
      /unpushed work/
    )
    assert.equal(
      decide(ops("push"), drift(30, 0, 48)).remind,
      null,
      "pushing is the cure, no reminder"
    )
  })

  test("fetch failure fails open with a note; unknown origin/main skips", () => {
    const offline = decide(
      ops("land"),
      drift(0, 0, null, { fetchError: "timeout after 10s" })
    )
    assert.equal(offline.block, null)
    assert.match(offline.remind, /could not fetch/)
    assert.match(
      decide(ops("land"), drift(0, 2, null, { fetchError: "offline" })).block,
      /behind/,
      "stale ref already behind still blocks"
    )
    const unknown = decide(ops("land"), {
      ahead: null,
      behind: null,
      oldestUnpushedHours: null,
      fetchError: "offline",
    })
    assert.equal(unknown.block, null)
  })
})

describe("driftLine", () => {
  test("silent in sync, one line otherwise", () => {
    assert.equal(driftLine(drift(0, 0)), null)
    assert.match(driftLine(drift(0, 4)), /merge origin\/main into your branch/)
    assert.match(
      driftLine(drift(25, 0, 1)),
      /unpushed work — tell the user once/
    )
    assert.match(driftLine(drift(1, 0, 0.5)), /only on the user's request/)
    assert.match(
      driftLine(drift(1, 0, 0.5)),
      /oldest unpushed commit landed 30 min ago/
    )
  })
})

describe("resolveMainBranch — the default branch is detected, never assumed", () => {
  test("an explicit override wins", () => {
    assert.equal(
      resolveMainBranch({ override: "trunk", originHead: "origin/master" }),
      "trunk"
    )
  })

  test("origin/HEAD names it", () => {
    assert.equal(resolveMainBranch({ originHead: "origin/master" }), "master")
    assert.equal(
      resolveMainBranch({ originHead: "refs/remotes/origin/develop" }),
      "develop"
    )
  })

  test("without origin/HEAD, the candidate origin has, then the one the checkout has", () => {
    assert.equal(
      resolveMainBranch({
        originHead: null,
        hasRemote: (name) => name === "master",
        hasLocal: (name) => name === "main",
      }),
      "master"
    )
    assert.equal(
      resolveMainBranch({
        originHead: null,
        hasLocal: (name) => name === "master",
      }),
      "master"
    )
    assert.equal(resolveMainBranch({ originHead: null }), "main")
  })
})

describe("a repo whose default branch is master", () => {
  const masterEnv = () => ({
    ...env({ [MAIN_DIR]: "master" }),
    main: "master",
  })
  const masterKinds = (command, cwd = MAIN_DIR) =>
    mainOps(command, cwd, masterEnv()).map((op) => op.kind)

  test("landing on master counts, landing on a branch named main does not", () => {
    assert.deepEqual(masterKinds("git merge feat/x"), ["land"])
    assert.deepEqual(masterKinds("git merge origin/master"), ["integrate"])
    assert.deepEqual(masterKinds("git push origin master"), ["push"])
    assert.deepEqual(masterKinds("git push origin main"), [])
    assert.deepEqual(
      mainOps("git commit -m x", MAIN_DIR, {
        ...env({ [MAIN_DIR]: "main" }),
        main: "master",
      }),
      []
    )
  })

  test("messages name master and origin/master", () => {
    const blocked = decide(ops("land"), drift(0, 2), "master")
    assert.match(
      blocked.block,
      /local master while it is 2 commit\(s\) behind origin\/master/
    )
    assert.match(blocked.block, /git merge --ff-only origin\/master/)
    assert.doesNotMatch(blocked.block, /origin\/main\b/)
    assert.match(
      driftLine(drift(0, 1), "master"),
      /merge origin\/master into your branch/
    )
  })
})

describe("hook process", () => {
  test("non-git and non-main commands exit 0 without touching git", () => {
    for (const command of ["ls apps", "git status", "git fetch origin main"]) {
      const r = runHook("main-sync-guard", {
        tool_input: { command },
        cwd: "/",
      })
      assert.equal(r.code, 0, command)
      assert.equal(r.stdout, "")
    }
  })
})

describe("--git-hook mode", () => {
  const gitEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))
  )
  const git = (cwd, ...args) =>
    execFileSync(
      "git",
      ["-c", "user.email=hook@test", "-c", "user.name=hook", ...args],
      { cwd, stdio: "ignore", env: gitEnv }
    )

  // a clone on <branch> whose origin/<branch> is one commit ahead, or behind, of the local one
  const withClone = (fn, branch = "main") => {
    const root = mkdtempSync(path.join(tmpdir(), "main-sync-"))
    try {
      git(root, "init", "-q", "--bare", "-b", branch, "origin.git")
      git(root, "clone", "-q", "origin.git", "clone")
      const clone = path.join(root, "clone")
      git(clone, "checkout", "-q", "-b", branch)
      git(clone, "commit", "-q", "--allow-empty", "-m", "one")
      git(clone, "commit", "-q", "--allow-empty", "-m", "two")
      git(clone, "push", "-q", "origin", branch)
      fn(clone, git)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  test("silent when main is only ahead, one stderr line when it is behind", () => {
    withClone((clone) => {
      git(clone, "commit", "-q", "--allow-empty", "-m", "local")
      const ahead = runHook("main-sync-guard", "", {
        cwd: clone,
        args: ["--git-hook"],
      })
      assert.equal(ahead.code, 0)
      assert.equal(ahead.stderr, "")

      git(clone, "reset", "-q", "--hard", "HEAD~2")
      const behind = runHook("main-sync-guard", "", {
        cwd: clone,
        args: ["--git-hook"],
      })
      assert.equal(behind.code, 0)
      assert.match(behind.stderr, /0 ahead \/ 1 behind origin\/main/)
    })
  })
})

describe("default branch detection end to end", () => {
  const gitEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))
  )
  const git = (cwd, ...args) =>
    execFileSync(
      "git",
      ["-c", "user.email=hook@test", "-c", "user.name=hook", ...args],
      { cwd, stdio: "ignore", env: gitEnv }
    )

  // a clone whose default branch is master, one commit behind origin/master
  const withMasterBehind = (fn) => {
    const root = mkdtempSync(path.join(tmpdir(), "main-sync-master-"))
    try {
      git(root, "init", "-q", "--bare", "-b", "master", "origin.git")
      git(root, "clone", "-q", "origin.git", "clone")
      const clone = path.join(root, "clone")
      git(clone, "checkout", "-q", "-b", "master")
      git(clone, "commit", "-q", "--allow-empty", "-m", "one")
      git(clone, "commit", "-q", "--allow-empty", "-m", "two")
      git(clone, "push", "-q", "-u", "origin", "master")
      git(clone, "remote", "set-head", "origin", "master")
      git(clone, "reset", "-q", "--hard", "HEAD~1")
      fn(clone)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  test("--git-hook on master behind origin/master speaks, with or without origin/HEAD", () => {
    withMasterBehind((clone) => {
      const withHead = runHook("main-sync-guard", "", {
        cwd: clone,
        args: ["--git-hook"],
      })
      assert.equal(withHead.code, 0)
      assert.match(
        withHead.stderr,
        /local master is 0 ahead \/ 1 behind origin\/master/
      )

      git(clone, "remote", "set-head", "origin", "-d")
      const withoutHead = runHook("main-sync-guard", "", {
        cwd: clone,
        args: ["--git-hook"],
      })
      assert.match(withoutHead.stderr, /behind origin\/master/)
    })
  })

  test("PreToolUse blocks a commit on master while it is behind origin/master", () => {
    withMasterBehind((clone) => {
      const blocked = runHook(
        "main-sync-guard",
        { tool_input: { command: "git commit -m x" }, cwd: clone },
        { env: { PLATFORM_MAIN_BRANCH: "" } }
      )
      assert.equal(blocked.code, 2)
      assert.match(
        blocked.stderr,
        /lands on local master while it is 1 commit\(s\) behind origin\/master/
      )

      const integrate = runHook("main-sync-guard", {
        tool_input: { command: "git merge --ff-only origin/master" },
        cwd: clone,
      })
      assert.equal(integrate.code, 0)
    })
  })

  test("PLATFORM_MAIN_BRANCH overrides the detection", () => {
    withMasterBehind((clone) => {
      const r = runHook(
        "main-sync-guard",
        { tool_input: { command: "git commit -m x" }, cwd: clone },
        { env: { PLATFORM_MAIN_BRANCH: "release" } }
      )
      assert.equal(r.code, 0)
      assert.equal(r.stderr, "")
    })
  })
})
