import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { after, describe, test } from "node:test"
import {
  describeJobs,
  IDLE_GRACE_S,
  meminfoFreePct,
  readProcesses,
  scanJobs,
} from "../lib/heavy-runs.mjs"
import { runHook } from "./run-hook.mjs"

const REPO = "/home/x/product"

const proc = (
  pid,
  ppid,
  exec,
  command,
  { cpu = 0, ageS = 30, rssMb = 100 } = {}
) => ({
  pid,
  ppid,
  exec,
  command,
  cpu,
  ageS,
  rssMb,
})
const scan = (procs) => scanJobs(procs, { selfPid: -1 })

describe("scanJobs — fixtures", () => {
  test('shell waiting on "pnpm check" in another session (PID 36530) never counts', () => {
    const procs = [
      proc(900, 1, "claude", "claude"),
      proc(
        36530,
        900,
        "zsh",
        `/bin/zsh -c source /Users/x/.claude/shell-snapshots/snapshot-zsh.sh && eval 'until ! pgrep -f "pnpm check" > /dev/null; do sleep 5; done'`,
        { ageS: 83 * 60, rssMb: 2 }
      ),
      proc(36600, 36530, "pgrep", "pgrep -f pnpm check", { rssMb: 1 }),
      proc(36601, 36530, "sleep", "sleep 5", { rssMb: 1 }),
      proc(36602, 900, "grep", "grep -E vitest|jest", { rssMb: 1 }),
    ]
    assert.deepEqual(scan(procs), [])
  })

  test("a real vitest run counts, named by its PID", () => {
    const procs = [
      proc(
        500,
        1,
        "zsh",
        `/bin/zsh -c eval 'pnpm test --run apps/web/src/x.test.ts'`,
        { rssMb: 2 }
      ),
      proc(
        501,
        500,
        "node",
        `node ${REPO}/node_modules/.pnpm/node_modules/.bin/pnpm.cjs test --run apps/web/src/x.test.ts`
      ),
      proc(
        502,
        501,
        "node",
        `node ${REPO}/node_modules/vitest/vitest.mjs run apps/web/src/x.test.ts`,
        { cpu: 180, rssMb: 900 }
      ),
    ]
    const [job, ...rest] = scan(procs)
    assert.deepEqual(rest, [])
    assert.equal(job.pid, 501)
    assert.equal(job.processes, 2)
    assert.equal(job.idle, false)
  })

  test("jest with workers is one job whose tree carries the CPU", () => {
    const procs = [
      proc(
        700,
        1,
        "node",
        `node ${REPO}/apps/api/node_modules/.bin/jest src/a.spec.ts`,
        { cpu: 0, ageS: 900 }
      ),
      proc(
        701,
        700,
        "node",
        `node ${REPO}/node_modules/jest-worker/build/workers/processChild.js`,
        { cpu: 90, ageS: 900 }
      ),
      proc(
        702,
        700,
        "node",
        `node ${REPO}/node_modules/jest-worker/build/workers/processChild.js`,
        { cpu: 85, ageS: 900 }
      ),
    ]
    const jobs = scan(procs)
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].pid, 700)
    assert.equal(jobs[0].processes, 3)
    assert.equal(jobs[0].idle, false)
  })

  test("pnpm check idle at the top but busy below (turbo → tsc) is active", () => {
    const procs = [
      proc(800, 1, "node", `node /opt/pnpm/pnpm.cjs check`, { ageS: 600 }),
      proc(801, 800, "sh", "sh -c turbo run lint typecheck", {
        ageS: 600,
        rssMb: 2,
      }),
      proc(
        802,
        801,
        "turbo",
        `${REPO}/node_modules/turbo-darwin-arm64/bin/turbo run lint typecheck`,
        { ageS: 600 }
      ),
      proc(
        803,
        802,
        "node",
        `node ${REPO}/node_modules/typescript/bin/tsc --noEmit`,
        { cpu: 99, ageS: 60 }
      ),
    ]
    const jobs = scan(procs)
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].pid, 800)
    assert.equal(jobs[0].idle, false)
  })

  test("an orphan vitest with no CPU past the grace is idle", () => {
    const procs = [
      proc(600, 1, "node", `node ${REPO}/node_modules/vitest/vitest.mjs`, {
        ageS: 2 * 3600,
      }),
    ]
    assert.equal(scan(procs)[0].idle, true)
  })

  test("a fresh run is active before it has burned CPU", () => {
    const procs = [
      proc(610, 1, "node", `node ${REPO}/node_modules/vitest/vitest.mjs run`, {
        ageS: IDLE_GRACE_S - 1,
      }),
    ]
    assert.equal(scan(procs)[0].idle, false)
  })

  test("the whole pnpm dev tree is ignored, tsc, next dev and nest --watch included", () => {
    const procs = [
      proc(400, 1, "node", `node /opt/pnpm/pnpm.cjs dev`),
      proc(
        401,
        400,
        "turbo",
        `${REPO}/node_modules/turbo-linux-64/bin/turbo run dev`
      ),
      proc(
        402,
        401,
        "node",
        `node /opt/pnpm/pnpm.cjs --filter @platform/api-client dev`
      ),
      proc(
        403,
        402,
        "node",
        `node ${REPO}/node_modules/typescript/bin/tsc -p tsconfig.build.json`,
        { cpu: 40 }
      ),
      proc(
        404,
        401,
        "node",
        `node ${REPO}/apps/web/node_modules/next/dist/bin/next dev`,
        { cpu: 20 }
      ),
      proc(
        405,
        401,
        "node",
        `node ${REPO}/apps/api/node_modules/@nestjs/cli/bin/nest.js start --watch`,
        { cpu: 20 }
      ),
    ]
    assert.deepEqual(scan(procs), [])
  })

  test("a next build counts, a lone pnpm dev:api does not", () => {
    const build = scan([
      proc(
        900,
        1,
        "node",
        `node ${REPO}/apps/web/node_modules/next/dist/bin/next build`,
        { cpu: 300 }
      ),
    ])
    assert.equal(build.length, 1)
    assert.equal(build[0].label, "next")
    assert.deepEqual(
      scan([proc(910, 1, "node", "node /opt/pnpm/pnpm.cjs dev:api")]),
      []
    )
  })

  test("the api dev tree (concurrently → nest --watch + tsc --watch) is ignored", () => {
    const procs = [
      proc(420, 1, "node", "node /opt/pnpm/pnpm.cjs --filter api dev"),
      proc(
        421,
        420,
        "node",
        `node ${REPO}/node_modules/concurrently/dist/bin/concurrently.js -n nest,types -c green,yellow nest start --watch tsc --noEmit --watch --preserveWatchOutput`
      ),
      proc(
        422,
        421,
        "node",
        `node ${REPO}/apps/api/node_modules/@nestjs/cli/bin/nest.js start --watch`,
        { cpu: 30 }
      ),
      proc(
        423,
        421,
        "node",
        `node ${REPO}/node_modules/typescript/bin/tsc --noEmit --watch --preserveWatchOutput`,
        { cpu: 60 }
      ),
    ]
    assert.deepEqual(scan(procs), [])
  })

  test("the guard itself never counts", () => {
    const procs = [
      proc(
        300,
        1,
        "node",
        `node ${REPO}/.claude/hooks/heavy-run-guard.mjs --wait pnpm check`
      ),
    ]
    assert.deepEqual(scan(procs), [])
  })

  test("a vite started through the pnpm shim path is long-lived and clears its tsc child", () => {
    const procs = [
      proc(
        410,
        1,
        "MainThread",
        `node ${REPO}/node_modules/.bin/../vite/bin/vite.js --host`,
        { cpu: 20 }
      ),
      proc(
        411,
        410,
        "MainThread",
        `node ${REPO}/node_modules/typescript/bin/tsc --noEmit -p apps/web`,
        { cpu: 60 }
      ),
    ]
    assert.deepEqual(scan(procs), [])
  })
})

describe("meminfoFreePct", () => {
  test("MemAvailable over MemTotal, rounded", () => {
    const text =
      "MemTotal:       16000000 kB\nMemFree:         1000000 kB\nMemAvailable:    4800000 kB\nBuffers:          200000 kB\n"
    assert.equal(meminfoFreePct(text), 30)
  })

  test("null without both keys, so the macOS probe gets its turn", () => {
    assert.equal(meminfoFreePct("MemTotal:       16000000 kB\n"), null)
    assert.equal(meminfoFreePct(""), null)
  })
})

describe("describeJobs", () => {
  test("names the worktree a job runs in, .claude/worktrees included", () => {
    for (const [dir, name] of [
      [".worktrees/feat-a", "feat-a"],
      [".claude/worktrees/feat-b", "feat-b"],
    ]) {
      const text = describeJobs(
        scan([
          proc(
            4300,
            1,
            "node",
            `node ${REPO}/${dir}/node_modules/vitest/vitest.mjs run`,
            { cpu: 90 }
          ),
        ]),
        REPO
      )
      assert.match(text, new RegExp(`worktree ${name}`))
    }
  })

  test("names the PID and the command holding the machine", () => {
    const procs = [
      proc(
        4242,
        1,
        "node",
        `node ${REPO}/node_modules/vitest/vitest.mjs run apps/web`,
        { cpu: 150 }
      ),
    ]
    const text = describeJobs(scan(procs), REPO)
    assert.match(text, /PID 4242/)
    assert.match(text, /tests \(vitest\)/)
    assert.match(text, /vitest\.mjs run apps\/web/)
    assert.match(text, /main checkout/)
  })
})

describe("live ps", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "hrg-"))
  const spawned = []
  after(() => {
    for (const child of spawned) child.kill("SIGKILL")
    rmSync(tmp, { recursive: true, force: true })
  })

  const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

  // a fake runner: argv shaped like a real vitest, idle, killed at the end
  const fakeVitest = async () => {
    const dir = path.join(tmp, "node_modules", "vitest")
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      path.join(dir, "vitest.mjs"),
      "setInterval(() => {}, 1000);\n"
    )
    const child = spawn(
      process.execPath,
      [path.join(dir, "vitest.mjs"), "run"],
      { stdio: "ignore" }
    )
    spawned.push(child)
    await settle()
    return child
  }

  // macOS pgrep skips itself and its ancestors, so one loop never sees itself:
  // two sessions' loops see each other and wait forever — the real PID 36530
  test(
    'two zsh loops pgrepping "pnpm check" keep each other alive and are no job',
    { skip: !existsSync("/bin/zsh") },
    async () => {
      const loop = () => {
        const child = spawn(
          "/bin/zsh",
          ["-c", 'until ! pgrep -f "pnpm check" > /dev/null; do sleep 1; done'],
          {
            stdio: "ignore",
          }
        )
        spawned.push(child)
        return child
      }
      const loops = [loop(), loop()]
      await new Promise((resolve) => setTimeout(resolve, 1500))
      const alive = readProcesses()
      for (const child of loops)
        assert.ok(
          alive.some((p) => p.pid === child.pid),
          `loop ${child.pid} is alive`
        )
      const jobs = scanJobs(alive).map((job) => job.pid)
      for (const child of loops) assert.ok(!jobs.includes(child.pid))
    }
  )

  test("a live vitest-shaped node process is a job", async () => {
    const runner = await fakeVitest()
    const job = scanJobs(readProcesses()).find((j) => j.pid === runner.pid)
    assert.ok(job)
    assert.equal(job.label, "vitest")
    assert.equal(job.idle, false)
  })

  const guard = (command) =>
    runHook(
      "heavy-run-guard",
      { tool_name: "Bash", tool_input: { command } },
      { env: { PLATFORM_HEAVY_GUARD_OFF: "" } }
    )
  const denied = (result) =>
    result.stdout !== "" &&
    JSON.parse(result.stdout).hookSpecificOutput.permissionDecision === "deny"

  test("while busy: a contract regen is denied, contract queries and a commit message are not runs", async () => {
    await fakeVitest()
    assert.ok(denied(guard("pnpm contract")))
    for (const command of [
      "pnpm contract:consumers getBooking",
      "pnpm contract:diff",
      `git commit -m "fix(hooks): x

pnpm test --run is a word here" -- a.mjs`,
    ])
      assert.equal(denied(guard(command)), false, command)
  })

  test("the hook denies naming the live runner PID", async () => {
    const runner = await fakeVitest()
    const result = runHook(
      "heavy-run-guard",
      {
        tool_input: { command: "pnpm test --run apps/web/src/x.test.ts" },
      },
      { env: { PLATFORM_HEAVY_GUARD_OFF: "" } }
    )
    const reason = JSON.parse(result.stdout).hookSpecificOutput
      .permissionDecisionReason
    assert.match(reason, new RegExp(`PID ${runner.pid} — tests \\(vitest\\)`))
    assert.match(reason, /vitest\.mjs run/)
  })
})
