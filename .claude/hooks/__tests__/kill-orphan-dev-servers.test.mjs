import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import assert from "node:assert/strict"
import { baseEnv, runHook } from "./run-hook.mjs"

const SESSION = "session-under-test"
// pids no live process holds (Linux pid_max is 4194304); dry-run signals nothing anyway
const PID = 4194001

const git = (cwd, ...args) =>
  execFileSync(
    "git",
    ["-c", "user.email=hook@test", "-c", "user.name=hook", ...args],
    {
      cwd,
      stdio: "ignore",
      env: baseEnv,
    }
  )

// a pnpm workspace with one commit and real linked worktrees under .worktrees/x
// and .claude/worktrees/y
function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "kill-orphan-"))
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - 'apps/*'\n")
  git(root, "init", "-q")
  git(root, "add", "pnpm-workspace.yaml")
  git(root, "commit", "-q", "-m", "init")
  git(
    root,
    "worktree",
    "add",
    "-q",
    join(root, ".worktrees", "x"),
    "-b",
    "feat/x"
  )
  mkdirSync(join(root, ".claude", "worktrees"), { recursive: true })
  git(
    root,
    "worktree",
    "add",
    "-q",
    join(root, ".claude", "worktrees", "y"),
    "-b",
    "feat/y"
  )
  return root
}

const withWorkspace = (fn) => {
  const root = makeWorkspace()
  try {
    fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// one injected `ps` row: pid ppid tty cwd session command
const row = (pid, ppid, tty, cwd, session, command) =>
  [pid, ppid, tty, cwd, session, command].join("\t")

const next = (dir) =>
  `node ${dir}/node_modules/.bin/../next/dist/bin/next dev -p 3001`
const nest = (dir) =>
  `node ${dir}/apps/api/node_modules/.bin/../@nestjs/cli/bin/nest.js start --watch`

const killOrphans = (root, rows, input = { session_id: SESSION }) =>
  runHook("kill-orphan-dev-servers", input, {
    env: {
      CLAUDE_PROJECT_DIR: root,
      PLATFORM_PS_OUTPUT: rows.join("\n"),
      PLATFORM_KILL_DRY_RUN: "1",
    },
  })

const killedPids = (stdout) =>
  stdout
    ? [...JSON.parse(stdout).systemMessage.matchAll(/ (\d+) \(/g)].map((m) =>
        Number(m[1])
      )
    : []

test("kill-orphan-dev-servers: this session's next dev in a worktree and nest in the main checkout", () => {
  withWorkspace((root) => {
    const wt = join(root, ".worktrees", "x")
    const { code, stdout } = killOrphans(root, [
      row(PID, 1, "?", join(wt, "apps", "web"), SESSION, next(wt)),
      row(PID + 1, 1, "?", join(root, "apps", "api"), SESSION, nest(root)),
    ])

    assert.equal(code, 0)
    assert.deepEqual(killedPids(stdout), [PID, PID + 1])
    assert.match(stdout, /next \d+ \(x\)/)
  })
})

test("kill-orphan-dev-servers: a server in a .claude/worktrees checkout is still a server", () => {
  withWorkspace((root) => {
    const wt = join(root, ".claude", "worktrees", "y")
    const { stdout } = killOrphans(root, [
      row(PID, 1, "?", join(wt, "apps", "web"), SESSION, next(wt)),
    ])

    assert.deepEqual(killedPids(stdout), [PID])
  })
})

test("kill-orphan-dev-servers: the pnpm dev wrapper owns the family — one kill per family", () => {
  withWorkspace((root) => {
    const api = join(root, "apps", "api")
    const { stdout } = killOrphans(root, [
      row(
        PID,
        1,
        "?",
        api,
        SESSION,
        "node /opt/pnpm/bin/pnpm.cjs --filter api dev"
      ),
      row(
        PID + 1,
        PID,
        "?",
        api,
        SESSION,
        `node ${root}/node_modules/concurrently/dist/bin/concurrently.js -n nest,types -c green,yellow nest start --watch tsc --noEmit --watch --preserveWatchOutput`
      ),
      row(PID + 2, PID + 1, "?", api, SESSION, nest(root)),
      row(
        PID + 3,
        PID + 1,
        "?",
        api,
        SESSION,
        `node ${root}/node_modules/typescript/bin/tsc --noEmit --watch --preserveWatchOutput`
      ),
    ])

    assert.deepEqual(killedPids(stdout), [PID])
  })
})

test("kill-orphan-dev-servers: skips a server another session or the user's terminal started", () => {
  withWorkspace((root) => {
    const wt = join(root, ".worktrees", "x")
    const { code, stdout } = killOrphans(root, [
      row(PID, 1, "?", wt, "another-session", next(wt)),
      row(PID + 1, 1, "pts/3", root, "", next(root)),
    ])

    assert.equal(code, 0)
    assert.equal(stdout, "")
  })
})

test("kill-orphan-dev-servers: skips this session's server in another repository", () => {
  withWorkspace((root) => {
    withWorkspace((other) => {
      const { stdout } = killOrphans(root, [
        row(PID, 1, "?", other, SESSION, next(other)),
      ])

      assert.equal(stdout, "")
    })
  })
})

test("kill-orphan-dev-servers: skips an unrelated process of this session", () => {
  withWorkspace((root) => {
    const { stdout } = killOrphans(root, [
      row(PID, 1, "?", root, SESSION, "vim some-file.ts"),
    ])

    assert.equal(stdout, "")
  })
})

test("kill-orphan-dev-servers: a shell or pgrep that mentions vite's entry is never a server; node on the entry is", () => {
  withWorkspace((root) => {
    const web = join(root, "apps", "web")
    const { code, stdout } = killOrphans(root, [
      row(PID, 1, "?", web, SESSION, "zsh -c 'pgrep -f vite/bin/vite.js'"),
      row(PID + 1, PID, "?", web, SESSION, "pgrep -f vite/bin/vite.js"),
      row(
        PID + 2,
        1,
        "?",
        web,
        SESSION,
        `/bin/zsh -c node ${web}/node_modules/vite/bin/vite.js`
      ),
      row(PID + 3, 1, "?", web, SESSION, "grep -E vite/bin/vite.js"),
      row(
        PID + 4,
        1,
        "?",
        web,
        SESSION,
        `node ${root}/node_modules/.bin/../vite/bin/vite.js --host`
      ),
    ])

    assert.equal(code, 0)
    assert.deepEqual(killedPids(stdout), [PID + 4])
  })
})

test("kill-orphan-dev-servers: no session id, empty or malformed ps output exits 0", () => {
  withWorkspace((root) => {
    const line = row(PID, 1, "?", root, SESSION, next(root))
    const noSession = runHook(
      "kill-orphan-dev-servers",
      {},
      {
        env: {
          CLAUDE_PROJECT_DIR: root,
          CLAUDE_CODE_SESSION_ID: "",
          PLATFORM_PS_OUTPUT: line,
          PLATFORM_KILL_DRY_RUN: "1",
        },
      }
    )
    assert.equal(noSession.code, 0)
    assert.equal(noSession.stdout, "")

    const garbage = killOrphans(root, ["garbage line with no tabs"])
    assert.equal(garbage.code, 0)
    assert.equal(garbage.stdout, "")
  })
})

test("kill-orphan-dev-servers: malformed stdin exits 0 silently", () => {
  const { code, stdout, stderr } = runHook(
    "kill-orphan-dev-servers",
    "not json",
    {
      env: {
        CLAUDE_CODE_SESSION_ID: "",
        PLATFORM_PS_OUTPUT: "",
        PLATFORM_KILL_DRY_RUN: "1",
      },
    }
  )

  assert.equal(code, 0)
  assert.equal(stdout, "")
  assert.equal(stderr, "")
})

test("no-servers-left-behind: sweeps a detached server of this session (Linux tty `?`), never the user's terminal", () => {
  withWorkspace((root) => {
    const session = `${SESSION}-sweep-${process.pid}`
    const env = (rows) => ({
      CLAUDE_PROJECT_DIR: root,
      PLATFORM_PS_OUTPUT: rows.join("\n"),
      PLATFORM_KILL_DRY_RUN: "1",
      PLATFORM_SERVER_SWEEP_OFF: "",
    })
    const event = {
      session_id: session,
      agent_id: "a1",
      agent_type: "general-purpose",
    }
    try {
      const arm = runHook("no-servers-left-behind", event, {
        env: env([]),
        args: ["arm"],
      })
      assert.equal(arm.code, 0)

      const sweep = runHook(
        "no-servers-left-behind",
        { ...event, agent_transcript_path: "/x/subagents/agent-a1.jsonl" },
        {
          env: env([
            row(PID, 1, "?", join(root, "apps", "api"), session, nest(root)),
            row(
              PID + 1,
              1,
              "pts/4",
              join(root, "apps", "web"),
              session,
              next(root)
            ),
          ]),
          args: ["sweep"],
        }
      )
      assert.equal(sweep.code, 0)
      assert.deepEqual(killedPids(sweep.stdout), [PID])
    } finally {
      rmSync(join(tmpdir(), `platform-servers-${session}.json`), {
        force: true,
      })
    }
  })
})

test(
  "kill-orphan-dev-servers: reads the session id of a live process from /proc",
  { skip: process.platform !== "linux" },
  async () => {
    const root = makeWorkspace()
    const bin = join(root, "node_modules", "next", "dist", "bin")
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, "next"), "setInterval(() => {}, 1000)\n")
    // double fork: the server is orphaned, as an agent's background server is
    // once its shell returns, instead of hanging under this test runner
    const spawnServer = (session) =>
      Number(
        execFileSync(
          "sh",
          [
            "-c",
            'nohup "$0" "$1" dev -p 3001 >/dev/null 2>&1 & echo $!',
            process.execPath,
            join(bin, "next"),
          ],
          {
            cwd: root,
            env: { ...baseEnv, CLAUDE_CODE_SESSION_ID: session },
            encoding: "utf8",
          }
        ).trim()
      )
    const mine = spawnServer(`${SESSION}-live`)
    const theirs = spawnServer("another-session")
    const stop = (pid) => {
      try {
        process.kill(pid, "SIGKILL")
      } catch {
        // already gone
      }
    }
    try {
      await new Promise((resolve) => setTimeout(resolve, 300))
      const { code, stdout } = runHook(
        "kill-orphan-dev-servers",
        { session_id: `${SESSION}-live` },
        { env: { CLAUDE_PROJECT_DIR: root, PLATFORM_KILL_DRY_RUN: "1" } }
      )

      assert.equal(code, 0)
      assert.deepEqual(killedPids(stdout), [mine])
    } finally {
      stop(mine)
      stop(theirs)
      rmSync(root, { recursive: true, force: true })
    }
  }
)
