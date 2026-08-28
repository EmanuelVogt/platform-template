import test from "node:test"
import assert from "node:assert/strict"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { hostname, tmpdir, userInfo } from "node:os"
import path from "node:path"
import {
  acquireLease,
  classifyLease,
  currentHolderId,
  decideFreeze,
  holderMatches,
  isAncestorOfHead,
  leasePathFor,
  leaseTtlMs,
  originMainSha,
  originStableTags,
  originTagExists,
  parseRepoSlug,
  probeReleaseRuns,
  readLease,
  reconcileFinishedLease,
  reconcilePushedMarker,
  releaseLease,
  updateLease,
} from "../lib/release-lease.mjs"

const COMMON_DIR = ".git-common"
const T0 = 1_700_000_000_000
const MINUTE = 60_000

function buildFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "release-lease-fixture-"))
  mkdirSync(path.join(root, COMMON_DIR), { recursive: true })
  return root
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true })
}

function leaseDir(root) {
  return path.join(root, COMMON_DIR, "platform")
}

function leaseFile(root) {
  return path.join(leaseDir(root), "release-lease.json")
}

function readLeaseFile(root) {
  return JSON.parse(readFileSync(leaseFile(root), "utf8"))
}

function seedLease(root, lease) {
  mkdirSync(leaseDir(root), { recursive: true })
  writeFileSync(leaseFile(root), JSON.stringify(lease, null, 2))
}

// Routes by git subcommand; each test passes only the fields it uses — the
// rest answer neutrally (no tags, no remote main, no gh).
function fakeExec(
  root,
  {
    tags = [],
    lsRemoteStatus = 0,
    mainSha,
    ancestorStatus = 128,
    originUrl = "git@github.com:acme/platform.git",
    originStatus = 0,
    ghStdout,
    ghStatus = 0,
  } = {}
) {
  return (command, args) => {
    if (command === "gh") {
      if (ghStdout === undefined) return { status: 1, stdout: "" }
      return { status: ghStatus, stdout: ghStdout }
    }
    assert.equal(command, "git")
    const [sub] = args
    if (sub === "rev-parse") {
      assert.deepEqual(args, ["rev-parse", "--git-common-dir"])
      return { status: 0, stdout: `${path.join(root, COMMON_DIR)}\n` }
    }
    if (sub === "remote") return { status: originStatus, stdout: originUrl }
    if (sub === "merge-base") return { status: ancestorStatus, stdout: "" }
    if (sub === "ls-remote") {
      if (lsRemoteStatus !== 0) return { status: lsRemoteStatus, stdout: "" }
      if (args.includes("refs/heads/main")) {
        return mainSha === undefined
          ? { status: 1, stdout: "" }
          : { status: 0, stdout: `${mainSha}\trefs/heads/main\n` }
      }
      const pattern = args.at(-1)
      const matched = tags.filter((tag) => pattern === "v*" || tag === pattern)
      return {
        status: 0,
        stdout: matched.map((tag) => `deadbeef\trefs/tags/${tag}\n`).join(""),
      }
    }
    throw new Error(`unexpected git subcommand in test: ${sub}`)
  }
}

const SESSION_HOLDER = { id: "sess-alpha", kind: "session" }
const FOREIGN_HOLDER = { id: "sess-beta", kind: "session" }

function leaseOf(overrides = {}) {
  return {
    version: "3.0.0",
    stage: "marker-local",
    holder: SESSION_HOLDER,
    startedAt: T0,
    updatedAt: T0,
    markerSha: null,
    ...overrides,
  }
}

test("acquireLease creates a draft lease under the git common dir", () => {
  const root = buildFixture()
  try {
    const exec = fakeExec(root)
    assert.equal(leasePathFor({ cwd: root, exec }), leaseFile(root))

    const result = acquireLease({
      cwd: root,
      exec,
      version: "3.0.0",
      holder: SESSION_HOLDER,
      now: () => T0,
    })

    assert.equal(result.ok, true)
    assert.deepEqual(readLeaseFile(root), {
      version: "3.0.0",
      stage: "draft",
      holder: SESSION_HOLDER,
      startedAt: T0,
      updatedAt: T0,
      markerSha: null,
    })
    assert.deepEqual(readLease({ cwd: root, exec }).lease, readLeaseFile(root))
  } finally {
    cleanup(root)
  }
})

test("a second acquireLease is refused and returns the first holder's lease", () => {
  const root = buildFixture()
  try {
    const exec = fakeExec(root)
    acquireLease({
      cwd: root,
      exec,
      version: "3.0.0",
      holder: SESSION_HOLDER,
      now: () => T0,
    })

    const second = acquireLease({
      cwd: root,
      exec,
      version: "3.1.0",
      holder: FOREIGN_HOLDER,
      now: () => T0 + MINUTE,
    })

    assert.equal(second.ok, false)
    assert.deepEqual(second.lease.holder, SESSION_HOLDER)
    assert.equal(second.lease.version, "3.0.0")
    assert.deepEqual(readLeaseFile(root).holder, SESSION_HOLDER)
  } finally {
    cleanup(root)
  }
})

test("acquireLease self-heals when the stale lease's tag already exists on origin", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "marker-pushed" }))
    const exec = fakeExec(root, { tags: ["v3.0.0"] })

    const result = acquireLease({
      cwd: root,
      exec,
      version: "3.1.0",
      holder: FOREIGN_HOLDER,
      now: () => T0 + MINUTE,
    })

    assert.equal(result.ok, true)
    assert.equal(result.lease.version, "3.1.0")
    assert.equal(result.lease.stage, "draft")
    const onDisk = readLeaseFile(root)
    assert.deepEqual(onDisk.holder, FOREIGN_HOLDER)
    assert.equal(onDisk.version, "3.1.0")
  } finally {
    cleanup(root)
  }
})

test("acquireLease keeps the lease when the tag probe fails — no self-heal on an unknown", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf())
    const exec = fakeExec(root, { lsRemoteStatus: 128 })

    const result = acquireLease({
      cwd: root,
      exec,
      version: "3.1.0",
      holder: FOREIGN_HOLDER,
      now: () => T0 + MINUTE,
    })

    assert.equal(result.ok, false)
    assert.deepEqual(result.lease.holder, SESSION_HOLDER)
    assert.equal(readLeaseFile(root).version, "3.0.0")
  } finally {
    cleanup(root)
  }
})

test("a corrupt lease reads as corrupt, refuses acquisition and blocks the freeze decision", () => {
  const root = buildFixture()
  try {
    mkdirSync(leaseDir(root), { recursive: true })
    writeFileSync(leaseFile(root), "{ not json")
    const exec = fakeExec(root, { tags: ["v3.0.0"] })

    assert.deepEqual(readLease({ cwd: root, exec }), { corrupt: true })

    const acquired = acquireLease({
      cwd: root,
      exec,
      version: "3.1.0",
      holder: FOREIGN_HOLDER,
      now: () => T0,
    })
    assert.deepEqual(acquired, { ok: false, corrupt: true })
    assert.equal(readFileSync(leaseFile(root), "utf8"), "{ not json")

    const decision = decideFreeze({
      lease: undefined,
      corrupt: true,
      holderEnv: {},
      pushesMain: true,
      tagExists: null,
    })
    assert.equal(decision.action, "block")
    assert.match(decision.reason, /--status/)
    assert.match(decision.reason, /--abort --force/)
  } finally {
    cleanup(root)
  }
})

test("classifyLease: a draft past the TTL is stale, one inside it is active", () => {
  const ttlMs = 90 * MINUTE
  const lease = leaseOf({ stage: "draft" })
  assert.equal(
    classifyLease({ lease, now: () => T0 + 91 * MINUTE, ttlMs }),
    "stale"
  )
  assert.equal(
    classifyLease({ lease, now: () => T0 + 89 * MINUTE, ttlMs }),
    "active"
  )
})

test("classifyLease: marker stages never go stale, at 10x the TTL", () => {
  const ttlMs = 90 * MINUTE
  const tenTtls = () => T0 + 900 * MINUTE
  assert.equal(
    classifyLease({
      lease: leaseOf({ stage: "marker-pushed" }),
      now: tenTtls,
      ttlMs,
    }),
    "active"
  )
  assert.equal(
    classifyLease({
      lease: leaseOf({ stage: "marker-local" }),
      now: tenTtls,
      ttlMs,
    }),
    "active"
  )
})

test("leaseTtlMs defaults to 90 minutes and honours PLATFORM_RELEASE_LEASE_TTL_MIN", () => {
  assert.equal(leaseTtlMs({ env: {} }), 90 * MINUTE)
  assert.equal(
    leaseTtlMs({ env: { PLATFORM_RELEASE_LEASE_TTL_MIN: "5" } }),
    5 * MINUTE
  )
  assert.equal(
    leaseTtlMs({ env: { PLATFORM_RELEASE_LEASE_TTL_MIN: "nonsense" } }),
    90 * MINUTE
  )
})

test("updateLease patches the lease, bumps updatedAt and leaves no temp file behind", () => {
  const root = buildFixture()
  try {
    const exec = fakeExec(root)
    acquireLease({
      cwd: root,
      exec,
      version: "3.0.0",
      holder: SESSION_HOLDER,
      now: () => T0,
    })

    const updated = updateLease({
      cwd: root,
      exec,
      holder: SESSION_HOLDER,
      patch: { stage: "marker-local", markerSha: "abc1234" },
      now: () => T0 + 5 * MINUTE,
      env: {},
    })

    assert.equal(updated.ok, true)
    const onDisk = readLeaseFile(root)
    assert.equal(onDisk.stage, "marker-local")
    assert.equal(onDisk.markerSha, "abc1234")
    assert.equal(onDisk.updatedAt, T0 + 5 * MINUTE)
    assert.equal(onDisk.startedAt, T0)
    assert.deepEqual(readdirSync(leaseDir(root)), ["release-lease.json"])
  } finally {
    cleanup(root)
  }
})

test("updateLease refuses a foreign holder, an absent lease and a corrupt one", () => {
  const root = buildFixture()
  try {
    const exec = fakeExec(root)
    assert.deepEqual(
      updateLease({
        cwd: root,
        exec,
        holder: SESSION_HOLDER,
        patch: { stage: "marker-local" },
        env: {},
      }),
      { ok: false, reason: "lease-absent" }
    )

    acquireLease({
      cwd: root,
      exec,
      version: "3.0.0",
      holder: SESSION_HOLDER,
      now: () => T0,
    })
    const foreign = updateLease({
      cwd: root,
      exec,
      holder: FOREIGN_HOLDER,
      patch: { stage: "marker-pushed" },
      now: () => T0 + MINUTE,
      env: {},
    })
    assert.deepEqual(foreign, { ok: false, reason: "holder-mismatch" })
    assert.equal(readLeaseFile(root).stage, "draft")

    writeFileSync(leaseFile(root), "{ not json")
    assert.deepEqual(
      updateLease({
        cwd: root,
        exec,
        holder: SESSION_HOLDER,
        patch: { stage: "marker-local" },
        env: {},
      }),
      { ok: false, reason: "lease-corrupt" }
    )
  } finally {
    cleanup(root)
  }
})

test("releaseLease: the holder removes it, a stranger cannot, force overrides", () => {
  const root = buildFixture()
  try {
    const exec = fakeExec(root)
    assert.deepEqual(
      releaseLease({ cwd: root, exec, holder: SESSION_HOLDER, env: {} }),
      {
        ok: true,
        released: false,
      }
    )

    acquireLease({
      cwd: root,
      exec,
      version: "3.0.0",
      holder: SESSION_HOLDER,
      now: () => T0,
    })
    assert.deepEqual(
      releaseLease({ cwd: root, exec, holder: FOREIGN_HOLDER, env: {} }),
      { ok: false, reason: "holder-mismatch" }
    )
    assert.equal(readLeaseFile(root).version, "3.0.0")

    assert.deepEqual(
      releaseLease({
        cwd: root,
        exec,
        holder: FOREIGN_HOLDER,
        force: true,
        env: {},
      }),
      { ok: true, released: true }
    )
    assert.deepEqual(readdirSync(leaseDir(root)), [])
  } finally {
    cleanup(root)
  }
})

test("releaseLease --force is the escape hatch for a corrupt lease", () => {
  const root = buildFixture()
  try {
    mkdirSync(leaseDir(root), { recursive: true })
    writeFileSync(leaseFile(root), "{ not json")
    const exec = fakeExec(root)

    assert.deepEqual(
      releaseLease({ cwd: root, exec, holder: SESSION_HOLDER, env: {} }),
      { ok: false, reason: "lease-corrupt" }
    )
    assert.deepEqual(
      releaseLease({
        cwd: root,
        exec,
        holder: SESSION_HOLDER,
        force: true,
        env: {},
      }),
      { ok: true, released: true }
    )
    assert.deepEqual(readdirSync(leaseDir(root)), [])
  } finally {
    cleanup(root)
  }
})

test("holderMatches: a session matches by CLAUDE_CODE_SESSION_ID or PLATFORM_RELEASE_HOLDER", () => {
  const lease = leaseOf()
  assert.equal(
    holderMatches({ lease, env: { CLAUDE_CODE_SESSION_ID: "sess-alpha" } }),
    true
  )
  assert.equal(
    holderMatches({ lease, env: { PLATFORM_RELEASE_HOLDER: "sess-alpha" } }),
    true
  )
  assert.equal(
    holderMatches({ lease, env: { CLAUDE_CODE_SESSION_ID: "sess-beta" } }),
    false
  )
  assert.equal(holderMatches({ lease, env: {} }), false)
})

test("holderMatches: a process holder matches on user@host with a different pid", () => {
  const lease = leaseOf({
    holder: { id: "ana@laptop#4242", kind: "process" },
  })
  assert.equal(
    holderMatches({ lease, env: {}, user: "ana", host: "laptop" }),
    true
  )
  assert.equal(
    holderMatches({ lease, env: {}, user: "ana", host: "buildbox" }),
    false
  )
  assert.equal(
    holderMatches({ lease, env: {}, user: "bob", host: "laptop" }),
    false
  )
})

test("currentHolderId prefers the session id and falls back to user@host#pid", () => {
  assert.deepEqual(
    currentHolderId({ env: { CLAUDE_CODE_SESSION_ID: "sess-x" } }),
    {
      id: "sess-x",
      kind: "session",
    }
  )
  const fallback = currentHolderId({ env: {} })
  assert.equal(fallback.kind, "process")
  assert.equal(
    fallback.id,
    `${userInfo().username}@${hostname()}#${process.pid}`
  )
})

test("decideFreeze allows when there is no lease, even on a main push", () => {
  assert.deepEqual(
    decideFreeze({
      lease: undefined,
      corrupt: false,
      holderEnv: {},
      pushesMain: true,
      tagExists: null,
    }),
    { action: "allow", reason: "no-lease" }
  )
})

test("decideFreeze blocks a corrupt lease before the pushesMain test", () => {
  const decision = decideFreeze({
    lease: undefined,
    corrupt: true,
    holderEnv: {},
    pushesMain: false,
    tagExists: null,
  })
  assert.equal(decision.action, "block")
})

test("decideFreeze allows a push that does not target main", () => {
  assert.deepEqual(
    decideFreeze({
      lease: leaseOf({ stage: "marker-pushed" }),
      holderEnv: {},
      pushesMain: false,
      tagExists: null,
    }),
    { action: "allow", reason: "not-main-push" }
  )
})

test("decideFreeze allows while the lease is still a draft — the freeze starts at marker-local", () => {
  assert.deepEqual(
    decideFreeze({
      lease: leaseOf({ stage: "draft" }),
      holderEnv: {},
      pushesMain: true,
      tagExists: null,
    }),
    { action: "allow", reason: "draft-stage" }
  )
})

test("decideFreeze allows a foreign lease once the tag exists", () => {
  assert.deepEqual(
    decideFreeze({
      lease: leaseOf({ stage: "marker-pushed" }),
      holderEnv: {},
      pushesMain: true,
      tagExists: true,
    }),
    { action: "allow", reason: "tag-exists" }
  )
})

test("decideFreeze marks an attempt for the holder at marker-local and plainly allows at marker-pushed", () => {
  const env = { CLAUDE_CODE_SESSION_ID: "sess-alpha" }
  assert.equal(
    decideFreeze({
      lease: leaseOf({ stage: "marker-local" }),
      holderEnv: env,
      pushesMain: true,
      tagExists: null,
    }).action,
    "allow-attempt"
  )
  assert.equal(
    decideFreeze({
      lease: leaseOf({ stage: "marker-pushed" }),
      holderEnv: env,
      pushesMain: true,
      tagExists: null,
    }).action,
    "allow"
  )
  assert.equal(
    decideFreeze({
      lease: leaseOf({ stage: "marker-local" }),
      holderEnv: { PLATFORM_RELEASE_HOLDER: "sess-alpha" },
      pushesMain: true,
      tagExists: null,
    }).action,
    "allow-attempt"
  )
})

test("decideFreeze recognises a process holder whose pid changed (the hook's own push)", () => {
  const lease = leaseOf({
    stage: "marker-local",
    holder: {
      id: `${userInfo().username}@${hostname()}#999999`,
      kind: "process",
    },
  })
  assert.equal(
    decideFreeze({ lease, holderEnv: {}, pushesMain: true, tagExists: null })
      .action,
    "allow-attempt"
  )
})

test("decideFreeze blocks a foreign holder and names version, stage, holder and age", () => {
  const decision = decideFreeze({
    lease: leaseOf({ stage: "marker-local" }),
    holderEnv: { CLAUDE_CODE_SESSION_ID: "sess-beta" },
    pushesMain: true,
    tagExists: null,
    now: () => T0 + 30 * MINUTE,
  })
  assert.equal(decision.action, "block")
  assert.match(decision.reason, /3\.0\.0/)
  assert.match(decision.reason, /marker-local/)
  assert.match(decision.reason, /sess-alpha/)
  assert.match(decision.reason, /30 min/)
})

test("probeReleaseRuns reports unavailable when gh is missing", () => {
  const root = buildFixture()
  try {
    assert.deepEqual(probeReleaseRuns({ cwd: root, exec: fakeExec(root) }), {
      available: false,
    })
  } finally {
    cleanup(root)
  }
})

test("probeReleaseRuns keeps only queued/in_progress runs whose title is a release marker", () => {
  const root = buildFixture()
  try {
    const ghStdout = JSON.stringify([
      {
        databaseId: 1,
        status: "queued",
        displayTitle: "chore(release): v3.0.0",
        headSha: "aaa",
        url: "u1",
        createdAt: "2026-08-26T00:00:00Z",
      },
      {
        databaseId: 2,
        status: "in_progress",
        displayTitle: "fix(ci): routine push",
        headSha: "bbb",
        url: "u2",
        createdAt: "2026-08-26T00:01:00Z",
      },
      {
        databaseId: 3,
        status: "completed",
        displayTitle: "chore(release): v2.9.0",
        headSha: "ccc",
        url: "u3",
        createdAt: "2026-08-25T00:00:00Z",
      },
    ])

    const result = probeReleaseRuns({
      cwd: root,
      exec: fakeExec(root, { ghStdout }),
    })

    assert.equal(result.available, true)
    assert.deepEqual(
      result.runs.map((run) => run.databaseId),
      [1]
    )
  } finally {
    cleanup(root)
  }
})

test("probeReleaseRuns reports unavailable when gh answers something unparsable", () => {
  const root = buildFixture()
  try {
    assert.deepEqual(
      probeReleaseRuns({
        cwd: root,
        exec: fakeExec(root, { ghStdout: "not json" }),
      }),
      { available: false }
    )
  } finally {
    cleanup(root)
  }
})

test("parseRepoSlug handles the ssh and https remote forms", () => {
  assert.equal(
    parseRepoSlug("git@github.com:acme/platform.git"),
    "acme/platform"
  )
  assert.equal(
    parseRepoSlug("https://github.com/acme/platform"),
    "acme/platform"
  )
  assert.equal(
    parseRepoSlug("https://github.com/acme/platform.git\n"),
    "acme/platform"
  )
  assert.equal(parseRepoSlug("not-a-remote"), undefined)
})

test("originTagExists answers true/false and null when the probe fails", () => {
  const root = buildFixture()
  try {
    assert.equal(
      originTagExists({
        cwd: root,
        exec: fakeExec(root, { tags: ["v3.0.0"] }),
        version: "3.0.0",
      }),
      true
    )
    assert.equal(
      originTagExists({
        cwd: root,
        exec: fakeExec(root, { tags: ["v2.9.0"] }),
        version: "3.0.0",
      }),
      false
    )
    assert.equal(
      originTagExists({
        cwd: root,
        exec: fakeExec(root, { lsRemoteStatus: 128 }),
        version: "3.0.0",
      }),
      null
    )
  } finally {
    cleanup(root)
  }
})

test("originMainSha returns the remote sha, null when origin is unreachable", () => {
  const root = buildFixture()
  try {
    assert.equal(
      originMainSha({
        cwd: root,
        exec: fakeExec(root, {
          mainSha: "0123456789abcdef0123456789abcdef01234567",
        }),
      }),
      "0123456789abcdef0123456789abcdef01234567"
    )
    assert.equal(
      originMainSha({
        cwd: root,
        exec: fakeExec(root, { lsRemoteStatus: 128 }),
      }),
      null
    )
  } finally {
    cleanup(root)
  }
})

test("isAncestorOfHead maps exit 0/1 to true/false and anything else to null", () => {
  const root = buildFixture()
  try {
    assert.equal(
      isAncestorOfHead({
        cwd: root,
        exec: fakeExec(root, { ancestorStatus: 0 }),
        sha: "abc",
      }),
      true
    )
    assert.equal(
      isAncestorOfHead({
        cwd: root,
        exec: fakeExec(root, { ancestorStatus: 1 }),
        sha: "abc",
      }),
      false
    )
    assert.equal(
      isAncestorOfHead({
        cwd: root,
        exec: fakeExec(root, { ancestorStatus: 128 }),
        sha: "abc",
      }),
      null
    )
    assert.equal(
      isAncestorOfHead({ cwd: root, exec: fakeExec(root), sha: undefined }),
      null
    )
  } finally {
    cleanup(root)
  }
})

test("originStableTags returns the sorted stable tags and an empty list on failure", () => {
  const root = buildFixture()
  try {
    assert.deepEqual(
      originStableTags({
        cwd: root,
        exec: fakeExec(root, { tags: ["v3.0.0", "v2.9.0", "v3.0.0-rc.1"] }),
      }),
      ["v2.9.0", "v3.0.0"]
    )
    assert.deepEqual(
      originStableTags({
        cwd: root,
        exec: fakeExec(root, { lsRemoteStatus: 128 }),
      }),
      []
    )
  } finally {
    cleanup(root)
  }
})

// --- reconcileFinishedLease -------------------------------------------------
// The self-clear that used to exist only inside `acquireLease`: before it, a
// finished cut left the lease on disk and froze `main` for every non-holder
// until somebody cut the NEXT release (STATE.md 2026-08-28).

test("reconcileFinishedLease clears a finished lease for a NON-holder — the evidence is the tag, not the identity", () => {
  const root = buildFixture()
  try {
    seedLease(
      root,
      leaseOf({
        stage: "marker-pushed",
        markerSha: "322f327",
        holder: FOREIGN_HOLDER,
      })
    )
    const exec = fakeExec(root, { tags: ["v3.0.0"] })

    const result = reconcileFinishedLease({ cwd: root, exec })

    assert.equal(result.cleared, true)
    assert.equal(result.lease.version, "3.0.0")
    assert.equal(readLease({ cwd: root, exec }).lease, undefined)
    assert.equal(readdirSync(leaseDir(root)).length, 0)
  } finally {
    cleanup(root)
  }
})

test("reconcileFinishedLease leaves a live lease alone while its tag is absent from origin", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "marker-pushed" }))
    const exec = fakeExec(root, { tags: ["v2.4.1"] })

    const result = reconcileFinishedLease({ cwd: root, exec })

    assert.equal(result.cleared, false)
    assert.equal(readLease({ cwd: root, exec }).lease.stage, "marker-pushed")
  } finally {
    cleanup(root)
  }
})

// Fail closed: `originTagExists` answers `null` when it cannot tell, and a
// network blip must never be read as "the release finished".
test("reconcileFinishedLease keeps the lease when the origin probe fails", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "marker-pushed" }))
    const exec = fakeExec(root, { tags: ["v3.0.0"], lsRemoteStatus: 128 })

    const result = reconcileFinishedLease({ cwd: root, exec })

    assert.equal(result.cleared, false)
    assert.equal(readLease({ cwd: root, exec }).lease.stage, "marker-pushed")
  } finally {
    cleanup(root)
  }
})

// A corrupt lease names no version to check a tag against — it stays for
// `--abort --force`, which is the only thing allowed to discard it blind.
test("reconcileFinishedLease does not clear a corrupt lease", () => {
  const root = buildFixture()
  try {
    mkdirSync(leaseDir(root), { recursive: true })
    writeFileSync(leaseFile(root), "{ not json")
    const exec = fakeExec(root, { tags: ["v3.0.0"] })

    const result = reconcileFinishedLease({ cwd: root, exec })

    assert.equal(result.cleared, false)
    assert.equal(readLease({ cwd: root, exec }).corrupt, true)
  } finally {
    cleanup(root)
  }
})

// --- reconcilePushedMarker --------------------------------------------------
// The upgrade the pre-push guard used to claim optimistically (STATE.md
// 2026-08-28, follow-up 3): `marker-local` → `marker-pushed` is written only
// on origin evidence — origin/main's head IS the lease's marker.

const MARKER_SHA = "a9e1e3c0000000000000000000000000000000aa"

test("reconcilePushedMarker upgrades marker-local when origin/main's head is the marker", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "marker-local", markerSha: MARKER_SHA }))
    const exec = fakeExec(root, { mainSha: MARKER_SHA })

    const result = reconcilePushedMarker({ cwd: root, exec, now: () => 777 })

    assert.equal(result.upgraded, true)
    assert.equal(result.lease.stage, "marker-pushed")
    const onDisk = readLeaseFile(root)
    assert.equal(onDisk.stage, "marker-pushed")
    assert.equal(onDisk.updatedAt, 777)
  } finally {
    cleanup(root)
  }
})

test("reconcilePushedMarker leaves the stage alone while origin/main's head is another sha", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "marker-local", markerSha: MARKER_SHA }))
    const exec = fakeExec(root, {
      mainSha: "b72ea700000000000000000000000000000000bb",
    })

    const result = reconcilePushedMarker({ cwd: root, exec })

    assert.equal(result.upgraded, false)
    assert.equal(readLeaseFile(root).stage, "marker-local")
  } finally {
    cleanup(root)
  }
})

// Fail closed: an unreadable origin is not evidence of anything, and a lease
// that under-claims its stage blocks nobody it shouldn't.
test("reconcilePushedMarker changes nothing when the origin probe fails", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "marker-local", markerSha: MARKER_SHA }))
    const exec = fakeExec(root, { lsRemoteStatus: 128 })

    const result = reconcilePushedMarker({ cwd: root, exec })

    assert.equal(result.upgraded, false)
    assert.equal(readLeaseFile(root).stage, "marker-local")
  } finally {
    cleanup(root)
  }
})

test("reconcilePushedMarker ignores other stages and a corrupt lease", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "marker-pushed", markerSha: MARKER_SHA }))
    const exec = fakeExec(root, { mainSha: MARKER_SHA })
    assert.equal(reconcilePushedMarker({ cwd: root, exec }).upgraded, false)

    writeFileSync(leaseFile(root), "{ not json")
    assert.equal(reconcilePushedMarker({ cwd: root, exec }).upgraded, false)
  } finally {
    cleanup(root)
  }
})

test("reconcileFinishedLease is a no-op when there is no lease", () => {
  const root = buildFixture()
  try {
    const exec = fakeExec(root, { tags: ["v3.0.0"] })

    const result = reconcileFinishedLease({ cwd: root, exec })

    assert.equal(result.cleared, false)
    assert.equal(result.lease, undefined)
  } finally {
    cleanup(root)
  }
})

// A `draft` lease carries no marker, but the tag existing still means that
// version is done — the same fact `acquireLease` acts on, so the two paths
// cannot disagree.
test("reconcileFinishedLease clears a draft lease whose version is already tagged", () => {
  const root = buildFixture()
  try {
    seedLease(root, leaseOf({ stage: "draft" }))
    const exec = fakeExec(root, { tags: ["v3.0.0"] })

    assert.equal(reconcileFinishedLease({ cwd: root, exec }).cleared, true)
  } finally {
    cleanup(root)
  }
})
