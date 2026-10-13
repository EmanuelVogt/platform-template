// Shared by kill-orphan-dev-servers.mjs (SessionEnd) and
// no-servers-left-behind.mjs (SubagentStop): lists the dev servers alive in the
// checkouts of this repo and terminates them by family — the wrapper
// (`pnpm dev`, `concurrently`) plus every watcher under it, because SIGTERM on
// the leaf alone leaves the wrapper holding the port and it respawns. A process
// attached to a terminal of the main checkout is the user's and is never
// reported. With `session`, only a family that carries that
// CLAUDE_CODE_SESSION_ID (inherited from the session that started it) is
// listed, so one session never kills another's servers. The environment and the
// cwd come from /proc on Linux (procps `ps` has no `-E`), from `ps -E` and
// `lsof` on macOS. Test seams: PLATFORM_PS_OUTPUT replaces the live process
// table with tab-separated `pid ppid tty cwd session command` lines;
// PLATFORM_KILL_DRY_RUN=1 makes `terminate` signal nothing.
// Harness tooling — not app code.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readlinkSync, statSync } from "node:fs"
import path from "node:path"

// A long-lived process of this stack: it holds a port or a watcher and only
// stops when someone kills it. One-shot commands (`vite build`, `vitest run`)
// stay out — they end on their own.
const SERVER_PATTERNS = [
  /vite\/bin\/vite\.js(?!\s+\S*build)/,
  /-n\s+vite,types/,
  /@nestjs\/cli\/bin\/nest\.js\s+start/,
  /-n\s+nest,types/,
  /next\/dist\/bin\/next\s+(dev|start)\b/,
  /\bnodemon\b/,
  /\btsx\s+watch\b/,
  /\bts-node-dev\b/,
  /\btsc\b[^|]*--watch\b/,
  /\bvitest\b(?![^|]*\brun\b)/,
  /\bjest\b[^|]*--watch\b/,
  /drizzle-kit\s+studio\b/,
  /\bnode\s+dist\/main\b/,
  /docker(-|\s+)compose\s+up\b(?![^|]*\s-d\b)/,
]

// A candidate is the server's own executable — a JS runtime or docker — never
// a shell, pgrep or grep whose command text merely MENTIONS a server's entry
// (2026-10-13, on a sibling harness: matching the whole argv SIGTERM'd an
// agent's own `zsh -c …` tool shell whose text named vite's entry). The family
// climb from a real candidate to its wrapper below is unchanged.
const SERVER_EXEC =
  /^(\S*\/)?(node|nodejs|bun|deno|docker|docker-compose)(\s|$)/

// Climbing from the leaf to the process that owns the port: a parent only
// qualifies as the wrapper of the same run, never as an unrelated shell.
const WRAPPER_BIN = /(^|\/)(sh|bash|zsh|node|pnpm|npm|npx|yarn)\b/
const WRAPPER_INTENT =
  /concurrently|\bdev\b|\bstart\b|--watch\b|\bstudio\b|\bserve\b|\bpreview\b/
// The harness itself, its shell, and the editors that host it, are never a dev
// server — matched by binary, not by any path that contains "claude": a server
// running from a `.claude/worktrees/<name>` checkout is still a server.
const NEVER =
  /(^|\/)claude(\s|$)|\.claude\/shell-snapshots\/|@anthropic-ai\/claude-code|cursor|Code Helper|VS Code|Electron/i
const MAX_CLIMB = 4
const MAX_FAMILY = 64

const LABELS = [
  [/vitest/, "vitest"],
  [/vite/, "vite"],
  [/nest/, "nest"],
  [/next/, "next"],
  [/drizzle-kit/, "drizzle studio"],
  [/docker/, "docker compose"],
  [/nodemon|tsx watch|ts-node-dev/, "watcher"],
  [/tsc\b/, "tsc --watch"],
]

const run = (file, args) => {
  try {
    return execFileSync(file, args, { encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}

const gitCommonDir = (dir) =>
  run("git", [
    "-C",
    dir,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ])

const repoRootOf = (dir) => {
  let current = dir

  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current
    current = path.dirname(current)
  }

  return null
}

const liveCwd = (pid) => {
  try {
    return readlinkSync(`/proc/${pid}/cwd`)
  } catch {
    const line = run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
      .split("\n")
      .find((entry) => entry.startsWith("n"))

    return line ? line.slice(1) : ""
  }
}

const SESSION_VAR = "CLAUDE_CODE_SESSION_ID="

const liveSession = (pid) => {
  let entries
  try {
    entries = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0")
  } catch {
    entries = run("ps", [
      "-E",
      "-ww",
      "-o",
      "command=",
      "-p",
      String(pid),
    ]).split(/\s+/)
  }
  const entry = entries.find((pair) => pair.startsWith(SESSION_VAR))

  return entry ? entry.slice(SESSION_VAR.length) : ""
}

const cwdOf = (proc) => proc.cwd ?? liveCwd(proc.pid)

const sessionOf = (proc) => proc.session ?? liveSession(proc.pid)

const isLinkedWorktree = (repoRoot) => {
  try {
    return statSync(path.join(repoRoot, ".git")).isFile()
  } catch {
    return false
  }
}

const injectedTable = (raw) => {
  const table = new Map()

  for (const line of raw.split("\n")) {
    const parts = line.split("\t")
    if (parts.length !== 6) continue
    const [pid, ppid, tty, cwd, session, command] = parts
    if (!/^\d+$/.test(pid) || !/^\d+$/.test(ppid)) continue

    table.set(Number(pid), {
      pid: Number(pid),
      ppid: Number(ppid),
      tty,
      command,
      cwd,
      session,
    })
  }

  return table
}

const processTable = () => {
  if (process.env.PLATFORM_PS_OUTPUT !== undefined)
    return injectedTable(process.env.PLATFORM_PS_OUTPUT)

  const table = new Map()

  for (const line of run("ps", ["-eo", "pid=,ppid=,tty=,command="]).split(
    "\n"
  )) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)
    if (!match) continue

    table.set(Number(match[1]), {
      pid: Number(match[1]),
      ppid: Number(match[2]),
      tty: match[3],
      command: match[4],
    })
  }

  return table
}

// Nothing in this hook's own ancestry is ever a candidate.
const ownChain = (table) => {
  const chain = new Set()
  let pid = process.pid

  while (pid > 1 && !chain.has(pid)) {
    chain.add(pid)
    pid = table.get(pid)?.ppid ?? 0
  }

  return chain
}

const rootOf = (proc, table) => {
  let root = proc

  for (let level = 0; level < MAX_CLIMB; level += 1) {
    const parent = table.get(root.ppid)
    if (!parent || parent.pid <= 1) break
    if (NEVER.test(parent.command)) break
    if (!WRAPPER_BIN.test(parent.command)) break
    if (!WRAPPER_INTENT.test(parent.command)) break
    root = parent
  }

  return root
}

const familyOf = (root, childrenOf) => {
  const pids = [root.pid]

  for (
    let index = 0;
    index < pids.length && pids.length < MAX_FAMILY;
    index++
  ) {
    for (const child of childrenOf.get(pids[index]) ?? []) {
      if (!pids.includes(child.pid)) pids.push(child.pid)
    }
  }

  return pids
}

const labelOf = (command) =>
  LABELS.find(([pattern]) => pattern.test(command))?.[1] ?? "dev server"

/**
 * Dev servers alive in any checkout that shares the git dir of `projectDir`.
 * `detached` = no controlling terminal (started by an agent; `?` on Linux,
 * `??` on macOS); `worktree` = it lives in a linked worktree, where a
 * terminal is an agent's too. `session` keeps only the families started by
 * that Claude Code session.
 */
export const listServers = (projectDir, { session } = {}) => {
  const commonDir = gitCommonDir(projectDir)
  if (!commonDir) return []

  const table = processTable()
  const mine = ownChain(table)
  const childrenOf = new Map()

  for (const proc of table.values()) {
    const siblings = childrenOf.get(proc.ppid) ?? []
    siblings.push(proc)
    childrenOf.set(proc.ppid, siblings)
  }

  const families = new Map()
  const seen = new Set()

  for (const proc of table.values()) {
    if (mine.has(proc.pid) || NEVER.test(proc.command)) continue
    if (!SERVER_EXEC.test(proc.command)) continue
    if (!SERVER_PATTERNS.some((pattern) => pattern.test(proc.command))) continue

    const root = rootOf(proc, table)
    if (mine.has(root.pid) || seen.has(root.pid)) continue

    const repoRoot = repoRootOf(cwdOf(root)) ?? repoRootOf(cwdOf(proc))
    if (!repoRoot || gitCommonDir(repoRoot) !== commonDir) continue
    seen.add(root.pid)

    const pids = familyOf(root, childrenOf).filter((pid) => !mine.has(pid))
    if (
      session &&
      !pids.some((pid) => {
        const member = table.get(pid)
        return member !== undefined && sessionOf(member) === session
      })
    )
      continue

    families.set(root.pid, {
      pid: root.pid,
      pids,
      tty: root.tty,
      detached: /^\?+$/.test(root.tty),
      worktree: isLinkedWorktree(repoRoot),
      repoRoot,
      label: labelOf(`${root.command} ${proc.command}`),
    })
  }

  return [...families.values()]
}

export const terminate = ({ pids }) => {
  if (process.env.PLATFORM_KILL_DRY_RUN === "1") return pids.length > 0

  let signalled = false

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM")
      signalled = true
    } catch {
      continue
    }
  }

  return signalled
}

export const describe = ({ pid, label, repoRoot }) =>
  `${label} ${pid} (${path.basename(repoRoot)})`
