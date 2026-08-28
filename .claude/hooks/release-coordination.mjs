#!/usr/bin/env node
// PreToolUse(Bash): defense-in-depth for the release lease
// (`docs/platform/release-coordination.md`) — while a FOREIGN session's lease sits at
// `marker-local`/`marker-pushed`, a push to main would kill its in-flight release run, so
// this stops the agent before the shell runs, including `git push --no-verify` (which
// skips the git-side pre-push freeze guard). At the foreign lease's `draft` stage a push
// is still allowed (the freeze only starts once a marker exists) but a second
// `pnpm platform release` is refused. A human terminal pushing with `--no-verify` is out
// of reach for a Claude hook — documented limitation, not a gap this file can close.
// Harness tooling — not app code.
import { readFileSync } from "node:fs"
import path from "node:path"

let data
try {
  data = JSON.parse(readFileSync(0, "utf8"))
} catch {
  process.exit(0)
}

const command = data.tool_input?.command
if (typeof command !== "string") process.exit(0)

const MAIN_REF = "main"

function refTarget(refspec) {
  const ref = refspec.startsWith("+") ? refspec.slice(1) : refspec
  const colon = ref.indexOf(":")
  const dst = colon === -1 ? ref : ref.slice(colon + 1)
  return dst.replace(/^refs\/heads\//, "")
}

// Locates `push` after any leading git-level flags (`-C <dir>`, `-c <k=v>`), mirroring
// `branch-only-in-worktree.mjs`'s `createsBranch`. Any refspec whose destination is `main`
// counts, including a bare push (no remote, no refspec — upstream is main here) and a
// remote with no refspec at all (ambiguous, so treated as main-targeting).
function parsePush(tokens, gitIdx) {
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
  if (tokens[i] !== "push") return null
  const rest = tokens.slice(i + 1).filter((t) => !t.startsWith("-"))
  const refspecs = rest.slice(1)
  const targetsMain =
    rest.length <= 1 || refspecs.some((r) => refTarget(r) === MAIN_REF)
  return { targetsMain, dirOverride }
}

// `pnpm platform release ...` or `node .../cli.mjs release ...` — `--status` and `--abort`
// stay available even during a foreign window (coordination query / recovery).
function isReleaseInvocation(tokens) {
  if (tokens.some((t) => t === "--status" || t === "--abort")) return false
  if (
    tokens[0] === "pnpm" &&
    tokens[1] === "platform" &&
    tokens[2] === "release"
  )
    return true
  const nodeIdx = tokens.findIndex((t) => t === "node" || t.endsWith("/node"))
  if (nodeIdx === -1) return false
  const cliIdx = tokens.findIndex((t) => t.endsWith("cli.mjs"))
  return cliIdx !== -1 && cliIdx > nodeIdx && tokens[cliIdx + 1] === "release"
}

let cwd = data.cwd || process.cwd()
const triggers = []

for (const segment of command.split(/&&|\|\||[;|\n]/)) {
  const tokens = segment
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/^["']|["']$/g, ""))
  if (tokens.length === 0) continue
  if (tokens[0] === "cd" && tokens[1]) {
    cwd = path.resolve(cwd, tokens[1])
    continue
  }
  const gitIdx = tokens.findIndex((t) => t === "git" || t.endsWith("/git"))
  if (gitIdx !== -1) {
    const push = parsePush(tokens, gitIdx)
    if (push?.targetsMain) {
      const dir = push.dirOverride ? path.resolve(cwd, push.dirOverride) : cwd
      triggers.push({ kind: "push", dir })
      continue
    }
  }
  if (isReleaseInvocation(tokens)) triggers.push({ kind: "release", dir: cwd })
}

if (triggers.length === 0) process.exit(0)

function ageMinutes(lease) {
  const since = lease.updatedAt ?? lease.startedAt ?? 0
  return Math.max(0, Math.round((Date.now() - since) / 60000))
}

function block(message) {
  process.stderr.write(`${message}\n`)
  process.exit(2)
}

function corruptMessage() {
  return `Lease de release ilegível — tratada como release em andamento.
Rode \`pnpm platform release --status\` para inspecionar, ou \`pnpm platform release --abort --force\` para descartar.`
}

function draftReleaseMessage(lease) {
  return `Release v${lease.version} em preparação por outra sessão (estágio "draft", titular ${lease.holder?.id}, há ${ageMinutes(lease)} min).
Um segundo \`platform release\` agora colidiria com o preflight em andamento — rode \`pnpm platform release --status\` para acompanhar.`
}

function frozenMessage(lease) {
  return `Release v${lease.version} em andamento (estágio "${lease.stage}", titular ${lease.holder?.id}, há ${ageMinutes(lease)} min).
Um push para main agora derrubaria o gate do release em curso — rode \`pnpm platform release --status\` para acompanhar, ou espere o titular terminar.`
}

try {
  const { readLease, holderMatches } =
    await import("../../scripts/platform/lib/release-lease.mjs")

  for (const trigger of triggers) {
    const { lease, corrupt } = readLease({ cwd: trigger.dir })
    if (corrupt) block(corruptMessage())
    if (!lease) continue
    const isHolder =
      holderMatches({ lease, env: process.env }) ||
      (typeof data.session_id === "string" &&
        data.session_id === lease.holder?.id)
    if (isHolder) continue
    if (lease.stage === "draft") {
      if (trigger.kind === "release") block(draftReleaseMessage(lease))
      continue
    }
    block(frozenMessage(lease))
  }
} catch {
  process.exit(0)
}

process.exit(0)
