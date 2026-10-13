#!/usr/bin/env node
// PreToolUse(Bash): blocks a `git commit` whose recorded diff ADDS a line that fakes
// done work — a focused test (`.only`), a bare skipped test (`.skip`/`.todo` with no
// issue/AD/date reference), a literal-on-literal `expect`, a "not implemented" throw,
// a lint/ts suppression (`@ts-expect-error` included), or a TODO/FIXME with no
// measurable condition. None of these is lint-covered here (no vitest plugin, no
// no-warning-comments), and lint never runs at commit time anyway. The diff
// inspected is the one the commit records:
// staged (`--cached`); the working tree against HEAD with `-a`/`--all`; the working
// tree of the given paths with `-- <paths>`. `cd`/`-C` before the commit segment are
// followed. Only added lines in code files count; `.claude/`, `generated/` (the
// Kubb client) and `.d.ts` are skipped (the hook and its test carry the patterns
// as literals). Fail-open when git itself cannot answer — a commit is not a
// release. Escape hatch, on the user's say-so only: prefix the command with
// PLATFORM_COMMIT_STUBS_OFF=1.
// Harness tooling — not app code.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const SKIPPED_PATH = /(^|\/)(\.claude|node_modules|generated)\/|\.d\.ts$/
const CONDITIONED =
  /(#\d+|\bAD-\d+\b|\bADR[- ]?\d+\b|20\d\d-\d\d-\d\d|\bissue\b)/i

const RULES = [
  {
    re: /\b(it|test|describe)\.only\s*\(|\b(fit|fdescribe)\s*\(/,
    why: "focused test — the suite would run only this",
  },
  {
    re: /\b(it|test|describe)\.(skip|todo)\s*\(|\b(xit|xtest|xdescribe)\s*\(/,
    why: "skipped test with no issue/AD/date on the line — a silent skip is not accepted (testing skill)",
    unless: CONDITIONED,
  },
  {
    re: /\bexpect\(\s*(true|false|null|undefined|\d+|'[^']*'|"[^"]*")\s*\)\s*\.(not\.)?(toBe|toEqual|toStrictEqual|toBeTruthy|toBeFalsy|toBeDefined)\s*\(/,
    why: "literal-on-literal expect — asserts nothing about the code",
  },
  {
    re: /throw new (Error|NotImplementedException)\(\s*(["'`]\s*(not implemented|n[ãa]o implementad[oa]|unimplemented|todo|stub)|\))/i,
    why: "stub presented as done — implement it or leave it out of the commit",
  },
  {
    re: /eslint-disable|@ts-ignore|@ts-nocheck|@ts-expect-error/,
    why: "lint/type suppression — forbidden (code-quality skill § Lint / format)",
  },
  {
    re: /(\/\/|\/\*|^\s*\*|\{\/\*)\s*(TODO|FIXME|HACK|XXX)\b/,
    why: "TODO/FIXME with no measurable condition (date/issue) — code-quality skill",
    unless: CONDITIONED,
  },
]

const expandToken = (raw) => {
  const unquoted = raw.replace(/^["']|["']$/g, "")
  const withHome =
    unquoted === "~"
      ? homedir()
      : unquoted.startsWith("~/")
        ? path.join(homedir(), unquoted.slice(2))
        : unquoted
  return withHome.replace(
    /\$\{([A-Za-z_]\w*)\}|\$([A-Za-z_]\w*)/g,
    (_, braced, bare) => process.env[braced ?? bare] ?? ""
  )
}

const tokenize = (segment) =>
  segment.trim().match(/"(?:[^"\\]|\\.)*"|'[^']*'|\S+/g) ?? []

const isGitCommit = (tokens) => {
  const gitIdx = tokens.findIndex((t) => t === "git" || t.endsWith("/git"))
  if (gitIdx === -1) return null
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
  if (tokens[i] !== "commit") return null
  const rest = tokens.slice(i + 1)
  const dashDash = rest.indexOf("--")
  const pathspec =
    dashDash === -1
      ? []
      : rest.slice(dashDash + 1).map((t) => t.replace(/^["']|["']$/g, ""))
  const flags = dashDash === -1 ? rest : rest.slice(0, dashDash)
  const all = flags.some(
    (t) => t === "-a" || t === "--all" || /^-[a-zA-Z]*a[a-zA-Z]*$/.test(t)
  )
  return { dirOverride, pathspec, all }
}

// The diff the commit records, as `-U0` unified text; null when git cannot answer.
const recordedDiff = (cwd, { pathspec, all }) => {
  const base = [
    "diff",
    "-U0",
    "--no-color",
    "--no-ext-diff",
    "--diff-filter=ACMR",
  ]
  const run = (args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
  try {
    if (pathspec.length > 0) return run([...base, "HEAD", "--", ...pathspec])
    if (all) return run([...base, "HEAD"])
    return run([...base, "--cached"])
  } catch {
    try {
      return run([
        ...base,
        "--cached",
        ...(pathspec.length > 0 ? ["--", ...pathspec] : []),
      ])
    } catch {
      return null
    }
  }
}

export const findStubs = (diff) => {
  const hits = []
  let file = null
  let line = 0
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const target = raw.slice(4).replace(/^b\//, "")
      file =
        CODE_FILE.test(target) && !SKIPPED_PATH.test(target) ? target : null
      continue
    }
    if (
      raw.startsWith("--- ") ||
      raw.startsWith("diff ") ||
      raw.startsWith("index ")
    )
      continue
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (raw.startsWith("-")) continue
    if (raw.startsWith("+")) {
      if (file !== null) {
        const added = raw.slice(1)
        for (const rule of RULES) {
          if (!rule.re.test(added)) continue
          if (rule.unless && rule.unless.test(added)) continue
          hits.push({
            file,
            line,
            why: rule.why,
            text: added.trim().slice(0, 120),
          })
          break
        }
      }
      line += 1
      continue
    }
    line += 1
  }
  return hits
}

const main = () => {
  let data
  try {
    data = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    process.exit(0)
  }
  const command = data.tool_input?.command
  if (
    typeof command !== "string" ||
    !/\bgit\b/.test(command) ||
    !/\bcommit\b/.test(command)
  )
    process.exit(0)
  if (
    /\bPLATFORM_COMMIT_STUBS_OFF=1\b/.test(command) ||
    process.env.PLATFORM_COMMIT_STUBS_OFF === "1"
  )
    process.exit(0)

  let cwd = data.cwd || process.cwd()
  const violations = []
  for (const segment of command.split(/&&|\|\||[;\n]/)) {
    const tokens = tokenize(segment)
    if (tokens.length === 0) continue
    if (tokens[0] === "cd" && tokens[1]) {
      cwd = path.resolve(cwd, expandToken(tokens[1]))
      continue
    }
    const commit = isGitCommit(tokens)
    if (!commit) continue
    const tree = commit.dirOverride
      ? path.resolve(cwd, expandToken(commit.dirOverride))
      : cwd
    const diff = recordedDiff(tree, commit)
    if (diff === null) continue
    violations.push(...findStubs(diff))
  }
  if (violations.length === 0) process.exit(0)

  const sample = violations
    .slice(0, 10)
    .map((v) => `  ${v.file}:${v.line} — ${v.why}\n    + ${v.text}`)
    .join("\n")
  process.stderr.write(
    `Commit held: the diff it would record adds work presented as done (${violations.length}):
${sample}
${violations.length > 10 ? `  … ${violations.length - 10} more\n` : ""}
Fix the lines above (implement, un-skip, un-focus, or reference the issue/AD/date on the line) and commit again. Never route around this with another git form or by leaving the file out silently — the report to the user must name what is still a stub. On the user's explicit say-so only: PLATFORM_COMMIT_STUBS_OFF=1 <same command>.
Rules: testing skill § What counts as proof; code-quality skill § Comments; hook .claude/hooks/commit-no-stubs.mjs.
`
  )
  process.exit(2)
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main()
