// Decision logic of main-sync-guard.mjs: which statements of a Bash command land
// commits on (or push) the local default branch, and what to do given its drift
// against origin. Pure — git is reached only through the `env` callbacks, so the
// tests drive every case without a repository. The default branch is a name the
// caller resolves (resolveMainBranch), never a hard-coded `main`.
// Harness tooling — not app code.
import { statements } from "./shell-statements.mjs"

export const MAIN_CANDIDATES = ["main", "master"]
export const REMIND_AGE_HOURS = 4
export const REMIND_AHEAD_COMMITS = 20
export const FETCH_CACHE_MS = 2 * 60 * 1000
export const FETCH_TIMEOUT_MS = 10_000

export const originOf = (main) => `origin/${main}`

// The default branch: PLATFORM_MAIN_BRANCH when set, else what origin/HEAD points
// at, else the first candidate origin has, else the first one the checkout has.
export const resolveMainBranch = ({
  override,
  originHead,
  hasRemote = () => false,
  hasLocal = () => false,
}) => {
  if (override) return override
  const fromOrigin = originHead
    ?.trim()
    .replace(/^(refs\/remotes\/)?origin\//, "")
  if (fromOrigin) return fromOrigin
  return (
    MAIN_CANDIDATES.find(hasRemote) ??
    MAIN_CANDIDATES.find(hasLocal) ??
    MAIN_CANDIDATES[0]
  )
}

// shell words of one statement: quotes removed, separators already split off
export const words = (statement) => {
  const out = []
  let current = ""
  let quote = ""
  let has = false
  for (let i = 0; i < statement.length; i++) {
    const ch = statement[i]
    if (quote) {
      if (ch === quote) quote = ""
      else if (ch === "\\" && quote === '"') current += statement[++i] ?? ""
      else current += ch
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      has = true
      continue
    }
    if (ch === "\\") {
      current += statement[++i] ?? ""
      has = true
      continue
    }
    if (/\s/.test(ch)) {
      if (has || current) out.push(current)
      current = ""
      has = false
      continue
    }
    current += ch
  }
  if (has || current) out.push(current)
  return out
}

const GLOBAL_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
])
const LANDING = new Set([
  "merge",
  "commit",
  "cherry-pick",
  "rebase",
  "revert",
  "am",
  "pull",
])
const NON_LANDING_FLAGS = new Set([
  "--abort",
  "--quit",
  "--skip",
  "--dry-run",
  "-h",
  "--help",
  "--edit-todo",
  "--show-current-patch",
])

// `git [globals] <sub> <rest>` → { dir, sub, rest }; null when not a git call
export const parseGit = (tokens) => {
  let i = 0
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++
  if (tokens[i] !== "git" && !tokens[i]?.endsWith("/git")) return null
  i++
  let dir = null
  while (i < tokens.length && tokens[i].startsWith("-")) {
    const flag = tokens[i]
    if (flag === "-C") dir = tokens[i + 1] ?? null
    if (GLOBAL_WITH_VALUE.has(flag)) i += 2
    else i += 1
  }
  if (i >= tokens.length) return null
  return { dir, sub: tokens[i], rest: tokens.slice(i + 1) }
}

const positionals = (rest) => rest.filter((t) => !t.startsWith("-"))

const namesOriginMain = (ref, main) =>
  ref === originOf(main) ||
  ref === `refs/remotes/origin/${main}` ||
  ref === "origin/HEAD"

// refspec of `git push` whose destination is the default branch
const pushesMain = (refspec, main) => {
  const dst = refspec.replace(/^\+/, "").split(":").pop()
  return dst === main || dst === `refs/heads/${main}`
}

// One git statement → { kind: 'land' | 'integrate' | 'push' } or null when it
// neither lands on nor pushes the default branch (`ctx.main`, default "main").
export const classify = (git, ctx) => {
  const main = ctx.main ?? MAIN_CANDIDATES[0]
  const { sub, rest } = git
  if (sub === "push") {
    if (
      rest.some(
        (t) => t === "--delete" || t === "-d" || t === "--dry-run" || t === "-n"
      )
    )
      return null
    if (rest.some((t) => t === "--all" || t === "--mirror"))
      return { kind: "push" }
    const [, ...refspecs] = positionals(rest)
    if (refspecs.length === 0)
      return ctx.branch === main ? { kind: "push" } : null
    return refspecs.some((refspec) => pushesMain(refspec, main))
      ? { kind: "push" }
      : null
  }
  if (!LANDING.has(sub)) return null
  if (rest.some((t) => NON_LANDING_FLAGS.has(t))) return null
  const args = positionals(rest)

  if (sub === "rebase") {
    // `git rebase <upstream> <main>` checks the default branch out first
    if (args[1] !== main && ctx.branch !== main) return null
    if (rest.includes("--continue")) return { kind: "land" }
    const upstream = args[0]
    return {
      kind:
        upstream === undefined || namesOriginMain(upstream, main)
          ? "integrate"
          : "land",
    }
  }

  if (ctx.branch !== main) return null

  if (sub === "pull") {
    // pull on the default branch fetches its upstream; only `pull <remote> <other>` lands foreign work
    const [remote, ...refs] = args
    const integrates =
      remote === undefined ||
      (remote === "origin" && refs.every((r) => r === main))
    return { kind: integrates ? "integrate" : "land" }
  }
  if (sub === "merge") {
    if (rest.includes("--continue")) return { kind: "land" }
    // a branch that already carries origin/<main> brings the default branch up to date with it
    const integrates = args.some(
      (ref) => namesOriginMain(ref, main) || ctx.containsOriginMain(ref)
    )
    return { kind: integrates ? "integrate" : "land" }
  }
  return { kind: "land" }
}

// every statement of `command` that lands on or pushes the default branch
// (`env.main`), following `cd` and `git checkout/switch <branch>` within the command
export const mainOps = (command, cwd, env) => {
  const main = env.main ?? MAIN_CANDIDATES[0]
  const ops = []
  let dir = cwd
  const branchOverride = new Map()
  for (const statement of statements(command)) {
    const tokens = words(statement)
    if (tokens[0] === "cd" && tokens[1]) {
      dir = env.resolve(dir, tokens[1])
      continue
    }
    const git = parseGit(tokens)
    if (!git) continue
    const target = git.dir ? env.resolve(dir, git.dir) : dir
    if (
      (git.sub === "checkout" || git.sub === "switch") &&
      !git.rest.some((t) => t.startsWith("-"))
    ) {
      const [to] = positionals(git.rest)
      if (to) branchOverride.set(target, to)
      continue
    }
    if (!LANDING.has(git.sub) && git.sub !== "push") continue
    const branch = branchOverride.get(target) ?? env.branchOf(target)
    const op = classify(git, {
      main,
      branch,
      containsOriginMain: (ref) => env.containsOriginMain(target, ref),
    })
    if (op) ops.push({ ...op, statement, dir: target })
  }
  return ops
}

const hours = (h) =>
  h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h)} h`

export const describeDrift = (
  { ahead, behind, oldestUnpushedHours },
  main = MAIN_CANDIDATES[0]
) => {
  const parts = [
    `local ${main} is ${ahead} ahead / ${behind} behind ${originOf(main)}`,
  ]
  if (ahead > 0 && oldestUnpushedHours !== null)
    parts.push(
      `oldest unpushed commit landed ${hours(oldestUnpushedHours)} ago`
    )
  return parts.join("; ")
}

export const needsPushReminder = ({ ahead, oldestUnpushedHours }) =>
  ahead > 0 &&
  (ahead > REMIND_AHEAD_COMMITS ||
    (oldestUnpushedHours ?? 0) > REMIND_AGE_HOURS)

const pushReminder = (
  main
) => `${main} carries unpushed work. Pushing is the user's call — a push ships every commit on
${main} and fires whatever deploy the environment wires to it — so never push on your own:
if the user has not heard it in this session, say in one line that ${main} has unpushed
work and wait for an explicit request. Rule: dev-workflow skill § Gates (Deploy).`

const withNotes = (text, notes) =>
  notes.length ? `${text}\nNote: ${notes.join("; ")}.` : text

// { block, remind } — both null means allow silently
export const decide = (ops, drift, main = MAIN_CANDIDATES[0]) => {
  if (ops.length === 0) return { block: null, remind: null }
  const origin = originOf(main)
  const notes = []
  if (drift.fetchError)
    notes.push(
      `could not fetch ${origin} (${drift.fetchError}); judged against the last fetched ref`
    )
  if (drift.ahead === null) {
    notes.push(`${origin} is unknown — main sync guard skipped`)
    return { block: null, remind: `main sync guard: ${notes.join("; ")}.` }
  }
  const offending = ops.filter((op) => op.kind !== "integrate")
  if (drift.behind > 0 && offending.length > 0) {
    const block = `Blocked: this lands on local ${main} while it is ${drift.behind} commit(s) behind ${origin}.
  ${offending.map((op) => op.statement.split("\n")[0]).join("\n  ")}
${describeDrift(drift, main)}.

${main} and ${origin} must never diverge: someone already pushed work (and maybe
migrations / AD numbers) that this change does not know about.
Integrate ${origin} first:
  1. In your branch/worktree: git fetch origin ${main} && git merge ${origin}
     (resolve; a colliding migration or AD number is renumbered ABOVE ${origin}'s top).
  2. Run the gate there, then merge that branch into ${main} — ${main} then moves past
     ${origin}, which this guard allows.
  On ${main} with nothing of your own pending: git merge --ff-only ${origin}.
Rules: dev-workflow skill § A branch is only born inside a worktree.`
    return { block: withNotes(block, notes), remind: null }
  }
  const plain = notes.length ? `main sync guard: ${notes.join("; ")}.` : null
  if (ops.every((op) => op.kind === "push") || !needsPushReminder(drift))
    return { block: null, remind: plain }
  return {
    block: null,
    remind: withNotes(
      `main sync: ${describeDrift(drift, main)}.\n${pushReminder(main)}`,
      notes
    ),
  }
}

// one line for SessionStart / git hooks; null when the branch and origin agree
export const driftLine = (drift, main = MAIN_CANDIDATES[0]) => {
  if (drift.ahead === null || (drift.ahead === 0 && drift.behind === 0))
    return null
  const advice = []
  if (drift.behind > 0)
    advice.push(
      `before merging anything into ${main}, merge ${originOf(main)} into your branch first`
    )
  if (needsPushReminder(drift))
    advice.push(
      `${main} carries unpushed work — tell the user once; a push happens only on their request`
    )
  else if (drift.ahead > 0)
    advice.push("a push happens only on the user's request")
  return `main sync: ${describeDrift(drift, main)} — ${advice.join("; ")} (dev-workflow skill § Gates).`
}
