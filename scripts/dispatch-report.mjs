#!/usr/bin/env node
// Reads the dispatch log that .claude/hooks/dispatch-log.mjs appends outside
// the repo (~/.claude/projects/<slug>/dispatch-log.jsonl) and prints what the
// delegation model actually does: runs, turns, context, cost and warm-up per
// agent type and tier, waves dispatched serially, forks, dollars per commit.
// A "run" is one sub-agent (one agent_id): a SendMessage resume of a
// sub-agent fires another SubagentStop whose ctx/turns/commits are already
// cumulative over the whole transcript (dispatch-log.mjs re-reads it from the
// top on every stop), so pricing every stop row counted the same tokens once
// per resume — 45 spec-workers produced 295 stop rows and inflated the total
// ~4.8x (2026-08-21). Only the LAST stop row per agent_id is priced. The why
// of each rule it measures is in .agents/skills/agent-harness/SKILL.md § Token economy.
//
// Usage: pnpm dispatch:report [path/to/dispatch-log.jsonl]
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

// price per million tokens: input, output, cache write, cache read
const PRICE = {
  opus: { in: 15, out: 75, cw: 18.75, cr: 1.5 },
  sonnet: { in: 3, out: 15, cw: 3.75, cr: 0.3 },
  haiku: { in: 1, out: 5, cw: 1.25, cr: 0.1 },
}

const REPO_SLUG = process.cwd().replace(/\//g, "-")
const DEFAULT_LOG = join(
  homedir(),
  ".claude",
  "projects",
  REPO_SLUG,
  "dispatch-log.jsonl"
)
const logPath = process.argv[2] ?? DEFAULT_LOG

if (!existsSync(logPath)) {
  console.error(
    `No dispatch log at ${logPath} — the hook writes it from the first dispatch of a new session.`
  )
  process.exit(1)
}

const rows = readFileSync(logPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })

const dispatches = rows.filter((r) => r.ev === "dispatch" && !r.blocked)
const starts = rows.filter((r) => r.ev === "start")
// a stop with no type and no transcript is one of Claude Code's helper
// invocations (logged before the hook learned to drop them)
const stops = rows.filter(
  (r) => r.ev === "stop" && (r.type || r.transcript !== "missing")
)
const splits = rows.filter((r) => r.ev === "wave-split")

const tierOf = (model) => {
  if (typeof model !== "string" || !model) return null
  const m = model.toLowerCase()
  if (/opus|fable/.test(m)) return "opus"
  if (m.includes("sonnet")) return "sonnet"
  if (m.includes("haiku")) return "haiku"
  return null
}

// dispatch ↔ stop: by tool_use_id through the start row when the harness
// exposes it, else the n-th dispatch of a type in a session ↔ its n-th stop
const dispatchByToolUse = new Map(
  dispatches
    .filter((d) => d.tool_use_id)
    .map((d) => [`${d.session}:${d.tool_use_id}`, d])
)
const toolUseByAgent = new Map(
  starts
    .filter((s) => s.agent_id && s.tool_use_id)
    .map((s) => [`${s.session}:${s.agent_id}`, s.tool_use_id])
)
const queues = new Map()
for (const d of dispatches) {
  const key = `${d.session}:${d.type}`
  if (!queues.has(key)) queues.set(key, [])
  queues.get(key).push(d)
}
const joined = stops.map((stop) => {
  const toolUse = toolUseByAgent.get(`${stop.session}:${stop.agent_id}`)
  let dispatch = toolUse
    ? dispatchByToolUse.get(`${stop.session}:${toolUse}`)
    : undefined
  if (!dispatch) dispatch = queues.get(`${stop.session}:${stop.type}`)?.shift()
  const tier = tierOf(stop.model) ?? tierOf(dispatch?.model)
  return { stop, dispatch, tier: tier ?? "opus", tierUnknown: tier === null }
})

// One run = one agent_id; a resume keeps only its last (most cumulative) stop
// row, log order being append-only == chronological order.
const runKey = (j, i) =>
  j.stop.agent_id ? `${j.stop.session}:${j.stop.agent_id}` : `__row${i}`
const resumesByAgent = new Map()
const runByAgent = new Map()
joined.forEach((j, i) => {
  const key = runKey(j, i)
  if (runByAgent.has(key))
    resumesByAgent.set(key, (resumesByAgent.get(key) ?? 1) + 1)
  runByAgent.set(key, j)
})
const runs = [...runByAgent.values()]
const resumesOf = (j) =>
  j.stop.agent_id
    ? (resumesByAgent.get(`${j.stop.session}:${j.stop.agent_id}`) ?? 0)
    : 0

const cost = ({ stop, tier }) => {
  const p = PRICE[tier]
  const cr = stop.cache_read ?? 0
  const cw = stop.cache_create ?? 0
  const input = Math.max(0, (stop.ctx ?? 0) - cr - cw)
  return (input * p.in + (stop.out ?? 0) * p.out + cw * p.cw + cr * p.cr) / 1e6
}

const quantile = (values, q) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[
    Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))
  ]
}
const k = (n) => `${Math.round(n / 1000)}k`
const usd = (n) => `$${n.toFixed(2)}`

const table = (headers, lines) => {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...lines.map((l) => String(l[i]).length))
  )
  const fmt = (cells) =>
    cells.map((c, i) => String(c).padEnd(widths[i])).join("  ")
  console.log(fmt(headers))
  console.log(widths.map((w) => "-".repeat(w)).join("  "))
  for (const l of lines) console.log(fmt(l))
}

console.log(`Dispatch log: ${logPath}`)
console.log(
  `${dispatches.length} dispatches · ${starts.length} starts · ${stops.length} stops · ${splits.length} wave-split blocks\n`
)

const groups = new Map()
for (const j of runs) {
  const key = `${j.stop.type ?? "?"}|${j.tier}${j.tierUnknown ? "*" : ""}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(j)
}
const typeLines = [...groups.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, js]) => {
    const [type, tier] = key.split("|")
    const turns = js.map((j) => j.stop.turns ?? 0)
    const ctx = js.map((j) => j.stop.ctx ?? 0)
    const outcomes = { done: 0, stopped: 0, unknown: 0 }
    for (const j of js)
      outcomes[j.stop.outcome ?? "unknown"] =
        (outcomes[j.stop.outcome ?? "unknown"] ?? 0) + 1
    return [
      type,
      tier,
      js.length,
      js.reduce((s, j) => s + resumesOf(j), 0),
      quantile(turns, 0.5),
      k(quantile(ctx, 0.5)),
      k(quantile(ctx, 0.9)),
      usd(js.reduce((s, j) => s + cost(j), 0)),
      `${outcomes.done}/${outcomes.stopped}/${outcomes.unknown}`,
    ]
  })
console.log("Per agent type × tier (* = tier unknown, priced as opus)")
table(
  [
    "type",
    "tier",
    "runs",
    "resumes",
    "med turns",
    "med ctx",
    "p90 ctx",
    "$",
    "done/stopped/unknown",
  ],
  typeLines
)

const sessions = [...new Set(rows.map((r) => r.session).filter(Boolean))]
const sessionLines = sessions.map((session) => {
  const own = dispatches.filter((d) => d.session === session)
  const split = new Set(
    splits.filter((s) => s.session === session).map((s) => s.wave)
  )
  const forks = own.filter((d) => d.type === "fork").length
  const spent = runs
    .filter((j) => j.stop.session === session)
    .reduce((s, j) => s + cost(j), 0)
  return [session.slice(0, 8), own.length, split.size, forks, usd(spent)]
})
console.log("\nPer session")
table(["session", "dispatches", "waves split", "forks", "$"], sessionLines)

const total = runs.reduce((s, j) => s + cost(j), 0)
const commits = runs.reduce((s, j) => s + (j.stop.commits?.length ?? 0), 0)
const unknownTier = runs.filter((j) => j.tierUnknown).length
const totalResumes = stops.length - runs.length
console.log(
  `\nTotal ${usd(total)} over ${runs.length} runs (${totalResumes} resume stop${totalResumes === 1 ? "" : "s"} not repriced) · ${commits} commits · ${commits ? usd(total / commits) : "n/a"} per commit`
)
if (unknownTier)
  console.log(
    `${unknownTier} run(s) had no model in the transcript nor a tier in the dispatch — priced as opus (inherited tier = the caller's).`
  )
const missing = stops.filter((s) => s.transcript === "missing").length
if (missing)
  console.log(
    `${missing} stop row(s) without a transcript on disk — usage fields skipped for those.`
  )

// Reconstructs the same subagent transcript path dispatch-log.mjs derives
// when a stop has no explicit agent_transcript_path (its findTranscript()).
const projectsDir = dirname(logPath)
const transcriptPathOf = (j) =>
  j.stop.session && j.stop.agent_id
    ? join(
        projectsDir,
        j.stop.session,
        "subagents",
        `agent-${j.stop.agent_id}.jsonl`
      )
    : null

const CODE_EDIT_PATH_RE = /[/\\](apps|packages)[/\\]/
// Turns/ctx/minutes from an agent's first transcript row to its first Edit or
// Write under apps/ or packages/ — reading, planning and scaffolding don't
// count as reaching code. Streamed assistant rows share one message.id, so
// turns and usage are deduped/accumulated by id the same way dispatch-log.mjs
// analyse() does (last usage seen per id wins).
const warmupOf = (transcriptPath) => {
  let lines
  try {
    lines = readFileSync(transcriptPath, "utf8").split("\n")
  } catch {
    return null
  }
  const turnsSeen = new Map()
  let firstTs = null
  for (const line of lines) {
    if (!line) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof row.timestamp === "string") firstTs ??= row.timestamp
    if (row.type !== "assistant") continue
    const content = Array.isArray(row.message?.content)
      ? row.message.content
      : []
    if (row.message?.id && row.message.usage)
      turnsSeen.set(row.message.id, row.message.usage)
    const edit = content.find(
      (b) =>
        b.type === "tool_use" &&
        (b.name === "Edit" || b.name === "Write") &&
        CODE_EDIT_PATH_RE.test(String(b.input?.file_path ?? ""))
    )
    if (!edit || !firstTs || !row.timestamp) continue
    let ctx = 0
    for (const usage of turnsSeen.values())
      ctx +=
        (usage.input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0)
    return {
      reached: true,
      turns: turnsSeen.size,
      ctx,
      minutes: (Date.parse(row.timestamp) - Date.parse(firstTs)) / 60000,
    }
  }
  return { reached: false }
}

const warmupGroups = new Map()
for (const j of runs) {
  const transcriptPath = transcriptPathOf(j)
  const w = transcriptPath ? warmupOf(transcriptPath) : null
  if (!w) continue
  const type = j.stop.type ?? "?"
  if (!warmupGroups.has(type)) warmupGroups.set(type, [])
  warmupGroups.get(type).push(w)
}
const med = (values, fmt) =>
  values.length ? fmt(quantile(values, 0.5)) : "n/a"
const warmupLines = [...warmupGroups.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([type, ws]) => {
    const reached = ws.filter((w) => w.reached)
    const neverPct = Math.round(
      ((ws.length - reached.length) / ws.length) * 100
    )
    return [
      type,
      ws.length,
      med(
        reached.map((w) => w.turns),
        (n) => String(n)
      ),
      med(
        reached.map((w) => w.ctx),
        k
      ),
      med(
        reached.map((w) => w.minutes),
        (n) => `${n.toFixed(1)}m`
      ),
      `${neverPct}%`,
    ]
  })
if (warmupLines.length) {
  console.log(
    "\nWarm-up to first code edit (Edit/Write under apps/ or packages/), per agent type"
  )
  table(
    ["type", "n", "med turns", "med ctx", "med minutes", "never edited"],
    warmupLines
  )
}
