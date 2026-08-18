#!/usr/bin/env node
// SessionEnd: kills the Vite dev server the session (or a subagent in a worktree) left alive.
// Preserves what runs in a terminal of the main repo — that one is the user's. Harness tooling.
import { execFileSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import path from "node:path"

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

function run(file, args) {
  try {
    return execFileSync(file, args, { encoding: "utf8" }).trim()
  } catch {
    return ""
  }
}

function gitCommonDir(dir) {
  return run("git", [
    "-C",
    dir,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ])
}

function repoRootOf(dir) {
  let current = dir

  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current
    current = path.dirname(current)
  }

  return null
}

function cwdOf(pid) {
  const line = run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"])
    .split("\n")
    .find((entry) => entry.startsWith("n"))

  return line ? line.slice(1) : ""
}

function isLinkedWorktree(repoRoot) {
  try {
    return statSync(path.join(repoRoot, ".git")).isFile()
  } catch {
    return false
  }
}

const sessionCommonDir = gitCommonDir(projectDir)
if (!sessionCommonDir) process.exit(0)

const candidates = run("ps", ["-eo", "pid=,tty=,command="])
  .split("\n")
  .map((line) => line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/))
  .filter((match) => match !== null)
  .filter(([, , , command]) => /vite\/bin\/vite\.js|-n vite,types/.test(command))

const killed = []

for (const [, pid, tty] of candidates) {
  const repoRoot = repoRootOf(cwdOf(pid))
  if (!repoRoot || gitCommonDir(repoRoot) !== sessionCommonDir) continue

  const detached = tty === "??"
  if (!detached && !isLinkedWorktree(repoRoot)) continue

  try {
    process.kill(Number(pid), "SIGTERM")
    killed.push(`${pid} (${path.basename(repoRoot)})`)
  } catch {
    continue
  }
}

if (killed.length > 0) {
  console.log(
    JSON.stringify({
      systemMessage: `Orphan dev server terminated: ${killed.join(", ")}.`,
    }),
  )
}
