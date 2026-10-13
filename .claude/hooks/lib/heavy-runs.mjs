// Which heavy runs are really alive on the machine — shared by heavy-run-guard
// and its tests. A process counts only when three things hold:
//   1. its real executable (the kernel's `ucomm`, not argv) is a runner —
//      a shell, pgrep, grep or sleep whose argv merely MENTIONS `pnpm check`
//      never counts, from any session (2026-09-28: another session's
//      `zsh -c 'until ! pgrep -f "pnpm check"…'` blocked every run for 1h23);
//   2. its argv matches a heavy-run pattern;
//   3. neither it nor a runner ancestor is long-lived by design (`pnpm dev`
//      and its whole tree, `next dev`, `nest start --watch`, `tsc --watch`,
//      a vite dev server, the turbo daemon, tsserver), and it is not this guard.
// Matching processes are grouped into jobs by process tree, named by the root
// PID. A job past its startup grace whose whole tree burns no CPU is an idle
// orphan (a forgotten `vitest` in watch mode) and does not hold the machine.
// Ported from a sibling harness; the dated incident above happened there.
// Harness tooling — not app code.
import { execFileSync } from "node:child_process"
import path from "node:path"

// On Linux a node process reports its main thread's name, `MainThread`, as ucomm.
const RUNNER_EXECS = new Set([
  "node",
  "MainThread",
  "turbo",
  "pnpm",
  "docker",
  "com.docker.cli",
  "docker-compose",
])
export const IDLE_GRACE_S = 300
export const IDLE_CPU_PCT = 1

// heavy runs by label, matched against the argv of a runner process
export const RUNNING = [
  ["vitest", /vitest/],
  ["jest", /\bjest(-worker)?\b/],
  ["playwright", /playwright/],
  ["tsc", /node_modules\/\.bin\/tsc|\/tsc(\.js)?(\s|$)/],
  ["eslint", /node_modules\/\.bin\/eslint|\/eslint(\.js)?(\s|$)/],
  ["prettier", /node_modules\/\.bin\/prettier|\/prettier(\.js)?(\s|$)/],
  ["next", /next(\/dist\/bin\/next)?(\.js)?\s+build\b/],
  [
    "turbo",
    /turbo(\.js)?\s+(run\s+)?(test|typecheck|lint|check|build|contract|format)/,
  ],
  [
    "pnpm",
    /pnpm(\.cjs)?\s+((run|--filter|-F|-r|-C)\s+\S*\s*)*(test|typecheck|lint|check|build|contract|format|install|add|update)/,
  ],
  ["docker", /docker(-compose)?\s+(compose\s+)?(build|up)\b/],
]
// long-lived by design — a match here also clears every descendant. A watch
// is only excluded for the type-checker: `vitest --watch` is a suite running.
const LONG_LIVED =
  /turbod|turbo(\.js)?\s+(run\s+)?dev\b|pnpm(\.cjs)?\s+(run\s+)?dev(:\w+)?\b|next(\/dist\/bin\/next)?(\.js)?\s+dev\b|nest(\.js)?\s+start\b[^\n]*--watch|vite\/bin\/vite\.js|nodemon|tsserver|tsc\b[^\n]*--watch/
// the guard and its tests clear only themselves, not what they spawn
const SELF = /heavy-run-guard/

export const LABELS = {
  vitest: "tests (vitest)",
  jest: "tests (jest)",
  playwright: "end-to-end tests (playwright)",
  tsc: "typecheck (tsc)",
  eslint: "lint (eslint)",
  prettier: "formatting (prettier)",
  next: "production build (next build)",
  turbo: "gate/build (turbo)",
  pnpm: "pnpm script",
  docker: "image build (docker)",
}

// Linux free-memory percentage from /proc/meminfo (MemAvailable, the kernel's
// own "reclaimable without swapping" figure); null when the text has neither key
export const meminfoFreePct = (text) => {
  const total = Number(text.match(/^MemTotal:\s+(\d+)/m)?.[1])
  const available = Number(text.match(/^MemAvailable:\s+(\d+)/m)?.[1])
  return total > 0 && Number.isFinite(available)
    ? Math.round((available / total) * 100)
    : null
}

// `[[dd-]hh:]mm:ss` → seconds
const seconds = (etime) => {
  const [days, clock] = etime.includes("-") ? etime.split("-") : ["0", etime]
  return (
    clock.split(":").reduce((acc, part) => acc * 60 + Number(part), 0) +
    Number(days) * 86_400
  )
}

// two `ps` calls joined by pid: `ucomm` is the executable's real name, which
// argv cannot fake, and `command` is argv — each one parses unambiguously
export const parseProcesses = (statText, commandText) => {
  const commands = new Map()
  for (const line of commandText.split("\n")) {
    const match = line.match(/^\s*(\d+)\s(.*)$/)
    if (match) commands.set(Number(match[1]), match[2].trim())
  }
  const procs = []
  for (const line of statText.split("\n")) {
    const match = line.match(
      /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.,]+)\s+(\S+)\s+(.*?)\s*$/
    )
    if (!match) continue
    const [, pid, ppid, rss, cpu, etime, exec] = match
    procs.push({
      pid: Number(pid),
      ppid: Number(ppid),
      rssMb: Number(rss) / 1024,
      cpu: Number(cpu.replace(",", ".")),
      ageS: seconds(etime),
      exec,
      command: commands.get(Number(pid)) ?? "",
    })
  }
  return procs
}

export const readProcesses = () => {
  try {
    const opts = { encoding: "utf8", timeout: 5000 }
    const stat = execFileSync(
      "ps",
      ["-Ao", "pid=,ppid=,rss=,pcpu=,etime=,ucomm="],
      opts
    )
    const command = execFileSync("ps", ["-Ao", "pid=,command="], opts)
    return parseProcesses(stat, command)
  } catch {
    return []
  }
}

const isRunner = (proc) => RUNNER_EXECS.has(path.basename(proc.exec))

// every job alive now, busiest first, as
// { pid, label, command, ageS, cpu, rssMb, processes, idle }
export const scanJobs = (procs, { selfPid = process.pid } = {}) => {
  const byPid = new Map(procs.map((proc) => [proc.pid, proc]))
  const children = new Map()
  for (const proc of procs)
    children.set(proc.ppid, [...(children.get(proc.ppid) ?? []), proc])

  const ancestors = (proc) => {
    const chain = []
    for (
      let up = byPid.get(proc.ppid);
      up && !chain.includes(up);
      up = byPid.get(up.ppid)
    )
      chain.push(up)
    return chain
  }
  const ignored = (proc) =>
    SELF.test(proc.command) ||
    [proc, ...ancestors(proc)].some(
      (p) => isRunner(p) && LONG_LIVED.test(p.command)
    )
  const label = (proc) => RUNNING.find(([, re]) => re.test(proc.command))?.[0]

  const heavy = new Set(
    procs.filter(
      (proc) =>
        proc.pid !== selfPid && isRunner(proc) && label(proc) && !ignored(proc)
    )
  )
  const subtree = (root) => {
    const all = []
    const stack = [root]
    while (stack.length > 0) {
      const proc = stack.pop()
      if (all.includes(proc)) continue
      all.push(proc)
      stack.push(...(children.get(proc.pid) ?? []))
    }
    return all
  }

  const jobs = []
  for (const root of heavy) {
    if (ancestors(root).some((up) => heavy.has(up))) continue
    const tree = subtree(root)
    const cpu = tree.reduce((acc, proc) => acc + proc.cpu, 0)
    jobs.push({
      pid: root.pid,
      label: label(root),
      command: root.command,
      ageS: root.ageS,
      cpu,
      rssMb: tree.reduce((acc, proc) => acc + proc.rssMb, 0),
      processes: tree.filter((proc) => heavy.has(proc)).length,
      idle: root.ageS > IDLE_GRACE_S && cpu < IDLE_CPU_PCT,
    })
  }
  return jobs.sort((a, b) => b.cpu - a.cpu)
}

const size = (mb) =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
const age = (s) =>
  s < 60
    ? `${s} s`
    : s < 3600
      ? `${Math.floor(s / 60)} min`
      : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`

// the command without the absolute directories that make it unreadable;
// relative paths (`apps/web/…`) stay, they say what is under test
const compact = (command) => {
  const clean = command.replace(/(^|\s)\/\S*\//g, "$1").trim()
  return clean.length > 140 ? `${clean.slice(0, 140)}…` : clean
}

// which checkout the job belongs to — a worktree is named by its folder
const checkoutOf = (command, projectDir) => {
  const worktree = command.match(/(?:\.claude\/|\.)worktrees\/([^/\s]+)/)
  if (worktree) return `worktree ${worktree[1]}`
  const root = path.basename(projectDir)
  return root && command.includes(`/${root}/`) ? "main checkout" : ""
}

export const describeJobs = (
  jobs,
  projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
) =>
  jobs
    .map((job) => {
      const where = checkoutOf(job.command, projectDir)
      const extra =
        job.processes > 1 ? ` across ${job.processes} processes` : ""
      return `  • PID ${job.pid} — ${LABELS[job.label] ?? job.label}, running for ${age(job.ageS)}, CPU ${Math.round(job.cpu)}%, ${size(job.rssMb)}${extra}${where ? ` (${where})` : ""}
      ${compact(job.command)}`
    })
    .join("\n")
