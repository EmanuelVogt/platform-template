import { spawnSync } from "node:child_process"
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { hostname, userInfo } from "node:os"
import path from "node:path"
import { stableTagsFromLsRemote } from "./template-version.mjs"

// The marker grammar lives in `release-marker.mjs`, which exports neither the
// regex nor the prefix; only the prefix is duplicated here.
export const MARKER_SUBJECT_PREFIX = "chore(release): v"

// Loose on purpose, like the `marker` job's `if` in release.yml: a malformed
// marker still occupies the same concurrency group, so the probe must see it.
const MARKER_TITLE_FILTER = "chore(release):"

const LEASE_DIR = "platform"
const LEASE_FILE = "release-lease.json"
const DEFAULT_TTL_MIN = 90
const PROBE_TIMEOUT_MS = 8000
const ACTIVE_RUN_STATUS = new Set(["queued", "in_progress"])
const REPO_SLUG =
  /^(?:git@[^:]+:|(?:ssh|https?):\/\/[^/]+\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/

function defaultExec(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options })
  return { status: result.status ?? 1, stdout: result.stdout ?? "" }
}

export function currentHolderId({ env = process.env } = {}) {
  const sessionId = env.CLAUDE_CODE_SESSION_ID
  if (sessionId) return { id: sessionId, kind: "session" }
  return {
    id: `${userInfo().username}@${hostname()}#${process.pid}`,
    kind: "process",
  }
}

// `--git-common-dir`, never `--git-dir`: each worktree has its own git dir,
// and the lease must be one per repository — it is what coordinates sessions.
export function leasePathFor({ cwd = process.cwd(), exec = defaultExec } = {}) {
  const result = exec("git", ["rev-parse", "--git-common-dir"], { cwd })
  const commonDir = path.resolve(cwd, (result?.stdout ?? "").trim() || ".git")
  return path.join(commonDir, LEASE_DIR, LEASE_FILE)
}

// A read error other than "file absent" counts as corrupt: callers treat
// corrupt as HELD, and guessing on top of an unreadable lease would let a
// concurrent release through.
export function readLease({
  cwd = process.cwd(),
  exec = defaultExec,
  leasePath = undefined,
} = {}) {
  const target = leasePath ?? leasePathFor({ cwd, exec })
  let raw
  try {
    raw = readFileSync(target, "utf8")
  } catch (err) {
    if (err.code === "ENOENT") return { lease: undefined }
    return { corrupt: true }
  }
  try {
    return { lease: JSON.parse(raw) }
  } catch {
    return { corrupt: true }
  }
}

function serialize(lease) {
  return `${JSON.stringify(lease, null, 2)}\n`
}

// The temp file stays in the SAME directory as the lease: `rename` is only
// atomic within one filesystem.
function writeLeaseAtomic(leasePath, lease) {
  const tempPath = `${leasePath}.${process.pid}.tmp`
  writeFileSync(tempPath, serialize(lease))
  renameSync(tempPath, leasePath)
}

function unlinkIfPresent(leasePath) {
  try {
    unlinkSync(leasePath)
  } catch (err) {
    if (err.code !== "ENOENT") throw err
  }
}

function createExclusive({ leasePath, version, holder, now }) {
  const at = now()
  const lease = {
    version,
    stage: "draft",
    holder,
    startedAt: at,
    updatedAt: at,
    markerSha: null,
  }
  let fd
  try {
    fd = openSync(leasePath, "wx")
  } catch (err) {
    if (err.code === "EEXIST") return undefined
    throw err
  }
  try {
    writeFileSync(fd, serialize(lease))
  } finally {
    closeSync(fd)
  }
  return { ok: true, lease }
}

// The single fact that retires a lease without an `--abort`: the version's tag
// on origin. Whoever asks gets the same answer, so a session that does not hold
// the lease may act on it too. `originTagExists` answers `null` when it cannot
// tell — only a literal `true` counts, and a failed probe leaves the lease
// standing. Module-private: the two exported consumers below are the contract.
function leaseIsFinished({
  cwd = process.cwd(),
  exec = defaultExec,
  lease,
} = {}) {
  if (lease === undefined) return true
  return originTagExists({ cwd, exec, version: lease.version }) === true
}

export function acquireLease({
  cwd = process.cwd(),
  exec = defaultExec,
  version,
  holder = currentHolderId(),
  now = Date.now,
} = {}) {
  const leasePath = leasePathFor({ cwd, exec })
  mkdirSync(path.dirname(leasePath), { recursive: true })

  const created = createExclusive({ leasePath, version, holder, now })
  if (created) return created

  const existing = readLease({ cwd, exec, leasePath })
  if (existing.corrupt) return { ok: false, corrupt: true }

  // The previous lease's tag already exists: that release finished and the file
  // is leftover. Any other case is a live holder.
  if (!leaseIsFinished({ cwd, exec, lease: existing.lease }))
    return { ok: false, lease: existing.lease }

  unlinkIfPresent(leasePath)
  const retried = createExclusive({ leasePath, version, holder, now })
  return (
    retried ?? { ok: false, lease: readLease({ cwd, exec, leasePath }).lease }
  )
}

// The self-clear AD-039 promises for a lease carrying a marker, reachable
// WITHOUT acquiring: until this existed the evidence was only read by the next
// release, so a finished cut froze `main` for every non-holder until somebody
// cut the following one. Deliberately not `--abort`: nothing is abandoned and
// the marker is never touched — the tag is proof the run reached its last job.
export function reconcileFinishedLease({
  cwd = process.cwd(),
  exec = defaultExec,
} = {}) {
  const leasePath = leasePathFor({ cwd, exec })
  const current = readLease({ cwd, exec, leasePath })
  // A corrupt lease names no version to check a tag against, so it is not this
  // function's to clear: it stays for `--abort --force`.
  if (current.corrupt || !current.lease) return { cleared: false }
  if (!leaseIsFinished({ cwd, exec, lease: current.lease }))
    return { cleared: false }
  unlinkIfPresent(leasePath)
  return { cleared: true, lease: current.lease }
}

// The stage upgrade the pre-push guard used to claim optimistically:
// `marker-local` → `marker-pushed` is written only where origin can be read.
// The evidence is origin/main's head being the lease's own marker; any
// uncertain probe changes nothing — a lease that under-claims its stage blocks
// nobody it shouldn't. No holder check, like `reconcileFinishedLease`: the
// evidence reads the same for everyone.
export function reconcilePushedMarker({
  cwd = process.cwd(),
  exec = defaultExec,
  now = Date.now,
} = {}) {
  const leasePath = leasePathFor({ cwd, exec })
  const current = readLease({ cwd, exec, leasePath })
  if (current.corrupt || !current.lease) return { upgraded: false }
  const lease = current.lease
  if (lease.stage !== "marker-local" || !lease.markerSha)
    return { upgraded: false }
  if (originMainSha({ cwd, exec }) !== lease.markerSha)
    return { upgraded: false }
  const next = { ...lease, stage: "marker-pushed", updatedAt: now() }
  writeLeaseAtomic(leasePath, next)
  return { upgraded: true, lease: next }
}

// The asymmetry is load-bearing: for a session the id is the agent's and the
// `PLATFORM_RELEASE_HOLDER` escape hatch applies; for a process the pid is
// deliberately ignored, because hooks run as children of the holder's `git
// push`, in a different pid, and are still the holder.
export function holderMatches({
  lease,
  env = process.env,
  user = undefined,
  host = undefined,
} = {}) {
  const holder = lease?.holder
  if (typeof holder?.id !== "string") return false
  if (holder.kind === "session") {
    return (
      env.CLAUDE_CODE_SESSION_ID === holder.id ||
      env.PLATFORM_RELEASE_HOLDER === holder.id
    )
  }
  if (holder.kind !== "process") return false
  const current = `${user ?? userInfo().username}@${host ?? hostname()}`
  return holder.id.split("#")[0] === current
}

function isHolder({ lease, holder, env, user, host }) {
  if (typeof holder?.id === "string" && lease?.holder?.id === holder.id)
    return true
  return holderMatches({ lease, env, user, host })
}

export function updateLease({
  cwd = process.cwd(),
  exec = defaultExec,
  holder = currentHolderId(),
  patch = {},
  now = Date.now,
  env = process.env,
  user = undefined,
  host = undefined,
} = {}) {
  const leasePath = leasePathFor({ cwd, exec })
  const current = readLease({ cwd, exec, leasePath })
  if (current.corrupt) return { ok: false, reason: "lease-corrupt" }
  if (!current.lease) return { ok: false, reason: "lease-absent" }
  if (!isHolder({ lease: current.lease, holder, env, user, host }))
    return { ok: false, reason: "holder-mismatch" }

  const next = { ...current.lease, ...patch, updatedAt: now() }
  writeLeaseAtomic(leasePath, next)
  return { ok: true, lease: next }
}

export function releaseLease({
  cwd = process.cwd(),
  exec = defaultExec,
  holder = currentHolderId(),
  force = false,
  env = process.env,
  user = undefined,
  host = undefined,
} = {}) {
  const leasePath = leasePathFor({ cwd, exec })
  const current = readLease({ cwd, exec, leasePath })
  if (!current.corrupt && !current.lease) return { ok: true, released: false }
  if (!force) {
    if (current.corrupt) return { ok: false, reason: "lease-corrupt" }
    if (!isHolder({ lease: current.lease, holder, env, user, host }))
      return { ok: false, reason: "holder-mismatch" }
  }
  unlinkIfPresent(leasePath)
  return { ok: true, released: true }
}

export function leaseTtlMs({ env = process.env } = {}) {
  const minutes = Number(env.PLATFORM_RELEASE_LEASE_TTL_MIN)
  const resolved =
    Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_TTL_MIN
  return resolved * 60 * 1000
}

// Only stage `draft` ages. Once the marker exists, age says nothing: a session
// debugging a red gate outlives any clock and is still the holder —
// `marker-local`/`marker-pushed` clear only on tag evidence or explicit abort.
export function classifyLease({
  lease,
  now = Date.now,
  ttlMs = undefined,
} = {}) {
  if (lease?.stage !== "draft") return "active"
  const limit = ttlMs ?? leaseTtlMs()
  const since = lease.updatedAt ?? lease.startedAt ?? 0
  return now() - since > limit ? "stale" : "active"
}

function freezeBlockReason({ lease, now }) {
  const ageMin = Math.max(
    0,
    Math.round((now() - (lease.updatedAt ?? lease.startedAt ?? 0)) / 60000)
  )
  return `release v${lease.version} em andamento (estágio "${lease.stage}", titular ${lease.holder?.id}, há ${ageMin} min) — espere, ou use \`pnpm platform release --status\` e \`pnpm platform release --abort --force\``
}

// Precedence fixed by the spec: a corrupt lease blocks BEFORE the `pushesMain`
// test — an unreadable lease is indistinguishable from a live release.
export function decideFreeze({
  lease,
  corrupt = false,
  holderEnv = process.env,
  pushesMain = false,
  tagExists = null,
  now = Date.now,
} = {}) {
  if (!lease && !corrupt) return { action: "allow", reason: "no-lease" }
  if (corrupt)
    return {
      action: "block",
      reason:
        "lease de release ilegível — trate como release em andamento; inspecione com `pnpm platform release --status` ou descarte com `pnpm platform release --abort --force`",
    }
  if (!pushesMain) return { action: "allow", reason: "not-main-push" }
  if (lease.stage === "draft") return { action: "allow", reason: "draft-stage" }
  if (tagExists === true) return { action: "allow", reason: "tag-exists" }
  // "allow-attempt", não um upgrade de estágio: quem decide aqui roda ANTES da
  // transferência, então o único fato disponível é a tentativa — o sucesso é de
  // quem consegue observá-lo (`release --push` após exit 0, ou a evidência de
  // origin em `reconcilePushedMarker`).
  if (holderMatches({ lease, env: holderEnv })) {
    return lease.stage === "marker-local"
      ? { action: "allow-attempt", reason: "holder-marker-local" }
      : { action: "allow", reason: "holder" }
  }
  return { action: "block", reason: freezeBlockReason({ lease, now }) }
}

function probe({ exec, cwd, command, args }) {
  try {
    return exec(command, args, {
      cwd,
      timeout: PROBE_TIMEOUT_MS,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    })
  } catch {
    return undefined
  }
}

// `null` means "could not tell": a release decision must fail closed on it,
// never read it as "the tag does not exist".
export function originTagExists({
  cwd = process.cwd(),
  exec = defaultExec,
  version,
} = {}) {
  const tag = String(version ?? "").startsWith("v") ? version : `v${version}`
  const result = probe({
    exec,
    cwd,
    command: "git",
    args: ["ls-remote", "--tags", "--refs", "origin", tag],
  })
  if (!result || result.status !== 0) return null
  return (result.stdout ?? "")
    .split("\n")
    .some((line) => line.trim().endsWith(`refs/tags/${tag}`))
}

export function originMainSha({
  cwd = process.cwd(),
  exec = defaultExec,
} = {}) {
  const result = probe({
    exec,
    cwd,
    command: "git",
    args: ["ls-remote", "origin", "refs/heads/main"],
  })
  if (!result || result.status !== 0) return null
  const sha = (result.stdout ?? "").trim().split(/\s+/)[0] ?? ""
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha : null
}

export function isAncestorOfHead({
  cwd = process.cwd(),
  exec = defaultExec,
  sha,
} = {}) {
  if (!sha) return null
  const result = probe({
    exec,
    cwd,
    command: "git",
    args: ["merge-base", "--is-ancestor", sha, "HEAD"],
  })
  if (!result) return null
  if (result.status === 0) return true
  if (result.status === 1) return false
  return null
}

export function originStableTags({
  cwd = process.cwd(),
  exec = defaultExec,
} = {}) {
  const result = probe({
    exec,
    cwd,
    command: "git",
    args: ["ls-remote", "--tags", "--refs", "origin", "v*"],
  })
  if (!result || result.status !== 0) return []
  return stableTagsFromLsRemote(result.stdout ?? "")
}

export function parseRepoSlug(url) {
  const match = REPO_SLUG.exec(String(url ?? "").trim())
  return match ? match[1] : undefined
}

// A routine push occupies the same concurrency group as the release, so
// without the title filter any queued run would be a false positive for
// "release in progress".
export function probeReleaseRuns({
  cwd = process.cwd(),
  exec = defaultExec,
} = {}) {
  const originUrl = probe({
    exec,
    cwd,
    command: "git",
    args: ["remote", "get-url", "origin"],
  })
  if (!originUrl || originUrl.status !== 0) return { available: false }
  const slug = parseRepoSlug(originUrl.stdout)
  if (!slug) return { available: false }

  const result = probe({
    exec,
    cwd,
    command: "gh",
    args: [
      "run",
      "list",
      "--workflow=release.yml",
      "--repo",
      slug,
      "--limit",
      "10",
      "--json",
      "databaseId,status,displayTitle,headSha,url,createdAt",
    ],
  })
  if (!result || result.status !== 0) return { available: false }

  let parsed
  try {
    parsed = JSON.parse(result.stdout ?? "")
  } catch {
    return { available: false }
  }
  if (!Array.isArray(parsed)) return { available: false }

  const runs = parsed.filter(
    (run) =>
      ACTIVE_RUN_STATUS.has(run?.status) &&
      typeof run?.displayTitle === "string" &&
      run.displayTitle.startsWith(MARKER_TITLE_FILTER)
  )
  return { available: true, runs }
}
