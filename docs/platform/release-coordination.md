# Release coordination — the lease

How concurrent sessions serialize `pnpm platform release`. The contract and its
rationale live in the decisions log (AD-039); this page is the mechanics.

## The lease file

`<git common dir>/platform/release-lease.json` — one per checkout, shared by every
worktree, never rendered by copier. Created atomically by `pnpm platform release`.
Holder identity: the Claude session id (`CLAUDE_CODE_SESSION_ID`) or `user@host#pid`.

| Stage | Meaning | Cleared by |
| --- | --- | --- |
| `draft` | preflight running, no marker yet | success moves on; refusal releases; after the TTL (90 min, `PLATFORM_RELEASE_LEASE_TTL_MIN`) `--abort` may take over |
| `marker-local` | marker committed, not pushed | push (upgrades it) · `--abort` (resets the marker) |
| `marker-pushed` | marker on origin, gate running | tag exists on origin (self-clear) · `--abort` |

A lease carrying a marker never expires by clock — only tag evidence or an explicit
`--abort` clears it. Corrupt lease JSON reads as held; `--status` names it and
`--abort --force` clears it.

## Enforcement layers

- `scripts/platform/release-freeze-guard.mjs` (lefthook pre-push, template-only): while
  a foreign lease sits at `marker-local`/`marker-pushed`, a push to `main` is refused.
  Decisions come from the lease file — no network on the allow path. Escape hatch:
  `PLATFORM_RELEASE_FREEZE_BYPASS=1`.
- `.claude/hooks/release-coordination.mjs` (PreToolUse, Bash): stops an agent's
  `git push` to main — `--no-verify` included — and a second `platform release` while a
  foreign window is open.
- A human terminal pushing with `--no-verify` is beyond both layers; the failure
  playbook below is the recovery, not prevention.

## Commands

- `pnpm platform release --status` — lease, origin (last stable tag, marker at head?),
  live release runs (gh), verdict. Always exit 0.
- `pnpm platform release --abort` — allowed for the holder, on a stale lease, or with
  `--force`. `draft`: clears. `marker-local`: resets the local marker (requires
  `HEAD == markerSha`, clean tree, marker absent from origin) and clears.
  `marker-pushed`: refuses while a release run is live; with `--force`, clears and
  abandons the old run — never re-run an abandoned one.

## Failure playbook

| State | Move |
| --- | --- |
| `PUSH_FAILED` (12) | `pnpm platform release --abort`, `git pull`, release again. Never `git pull --rebase` while a local marker exists. |
| Gate red, tag absent, main untouched | Re-run the SAME run (`gh run rerun --failed <id>`). A second marker is not the recovery path. |
| Gate red + main moved + tag absent | The old run is burned: `--abort`, then a fresh `release` — the sanctioned re-cut (AD-039). |
| `RELEASE_LOCKED` (13) | Another session or machine holds the cut: `pnpm platform release --status`, then wait, or `--abort` under the rules above. |
| Stale `draft` lease | `--abort` takes over. |

## Remote guards

`pnpm platform release` checks, before the marker: tag absent on origin; origin/main's
head is not an untagged marker; no marker subject in `origin/main..HEAD`; origin/main
is an ancestor of local HEAD; no live release run (gh probe — advisory when gh is
absent, the origin-marker check is the hard cross-machine guard). Git probes fail
closed. The tag check runs once more between the marker commit and the push. All of
this lives in the `release` command, not in the preflight the gate re-runs.
