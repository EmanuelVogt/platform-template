#!/usr/bin/env node
// PreToolUse(Bash): blocks creating/switching a branch in the main checkout — the
// "worktree or main" rule (.agents/skills/dev-workflow/SKILL.md). The main directory is
// shared between agents: moving HEAD there changes the files underneath
// whoever is working on main in parallel. A new branch only inside a worktree
// (git worktree add). Harness tooling — not app code.
import { readFileSync, statSync } from "node:fs"
import path from "node:path"

let data
try {
  data = JSON.parse(readFileSync(0, "utf8"))
} catch {
  process.exit(0)
}

const command = data.tool_input?.command
if (typeof command !== "string" || !/\bgit\b/.test(command)) process.exit(0)

// .git file = linked worktree (allowed); .git directory = main checkout
const dirKind = (dir) => {
  let current = path.resolve(dir)
  for (;;) {
    try {
      return statSync(path.join(current, ".git")).isFile()
        ? "worktree"
        : "main-checkout"
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return "outside-repo"
      current = parent
    }
  }
}

// `git branch` flags that list/delete/configure — they do not create a branch
const BRANCH_NON_CREATING = new Set([
  "-d",
  "-D",
  "--delete",
  "-l",
  "--list",
  "-a",
  "--all",
  "-r",
  "--remotes",
  "-v",
  "-vv",
  "--verbose",
  "--show-current",
  "--contains",
  "--no-contains",
  "--merged",
  "--no-merged",
  "--points-at",
  "--sort",
  "--format",
  "--column",
  "-u",
  "--set-upstream-to",
  "--unset-upstream",
  "--edit-description",
])

const createsBranch = (tokens, gitIdx) => {
  let i = gitIdx + 1
  let dirOverride = null
  while (i < tokens.length && tokens[i].startsWith("-")) {
    if (tokens[i] === "-C") {
      dirOverride = tokens[i + 1] ?? null
      i += 2
    } else if (tokens[i] === "-c") {
      i += 2
    } else {
      i += 1
    }
  }
  const sub = tokens[i]
  const rest = tokens.slice(i + 1)
  let creates = false
  if (sub === "checkout") {
    creates = rest.some(
      (t) => t === "-b" || t === "-B" || t === "--orphan" || /^-[bB]./.test(t)
    )
  } else if (sub === "switch") {
    creates = rest.some(
      (t) =>
        t === "-c" ||
        t === "-C" ||
        t === "--create" ||
        t === "--force-create" ||
        t === "--orphan" ||
        /^-[cC]./.test(t)
    )
  } else if (sub === "branch") {
    const hasNonCreating = rest.some((t) =>
      BRANCH_NON_CREATING.has(t.split("=")[0])
    )
    const hasPositional = rest.some((t) => !t.startsWith("-"))
    creates = !hasNonCreating && hasPositional
  }
  return { creates, dirOverride }
}

let cwd = data.cwd || process.cwd()
const violations = []

for (const segment of command.split(/&&|\|\||[;|\n]/)) {
  const tokens = segment.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) continue
  if (tokens[0] === "cd" && tokens[1]) {
    cwd = path.resolve(cwd, tokens[1].replace(/^["']|["']$/g, ""))
    continue
  }
  const gitIdx = tokens.findIndex((t) => t === "git" || t.endsWith("/git"))
  if (gitIdx === -1) continue
  if (tokens.includes("worktree")) continue
  const { creates, dirOverride } = createsBranch(tokens, gitIdx)
  if (!creates) continue
  const target = dirOverride ? path.resolve(cwd, dirOverride) : cwd
  if (dirKind(target) === "main-checkout") violations.push(segment.trim())
}

if (violations.length === 0) process.exit(0)

process.stderr.write(
  `Branch creation blocked in the main checkout (.agents/skills/dev-workflow/SKILL.md):
  ${violations.join("\n  ")}

The main checkout is shared between agents: creating/switching a branch here
moves HEAD underneath whoever is working on main in parallel.
Two valid paths:
  • Small task → commit straight to main, no branch at all.
  • Medium/large task → isolated worktree, and the branch is born there:
      git worktree add .worktrees/<slug> -b <branch> main
    Always under .worktrees/ (that is the path in the versioned .gitignore) and always
    branching from LOCAL main: here the merge is local with no push, so
    origin/main lives commits behind. Work inside the worktree; when closing,
    merge locally into main.
`
)
process.exit(2)
