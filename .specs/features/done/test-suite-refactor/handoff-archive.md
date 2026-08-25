# Handoff archive — test-suite-refactor

Archived from `.specs/STATE.md` § *Handoff* at close-out, 2026-08-25.

## Verdict

Verifier **PASS** at round 4 — 21/22 ACs verified, 1 owner-blocked (CI-01), 0 defects
outstanding. Sensor across rounds 2–4: 9 mutants injected, 8 killed, the 1 survivor
re-seeded and killed. Full report: `validation.md`; the four rounds and the fix clusters:
`tasks.md` § *Post-Verifier fix waves and the four verification rounds*.

## Merged at `ced8745`

`tsr-verify` (`c0d0bba` + 18 commits) merged into `main`; parents `501e3a8` + `f520755`.
The branch was pushed to `origin/tsr-verify` before deletion, so the pre-merge tree the
Verifier actually measured is recoverable from the remote as well as from `ced8745^2`.

**Gate at `ced8745`**: `pnpm check` 0 · hygiene 47/47 · `test:coverage` 0
(96.42 / 93.92 / 94.58 / 96.71, over every 90 floor) · `it-count` 0 (2248, no drop) ·
`catalog:check` 7 — the 5 wave-8 errors that are `audit-2026-08-23-remediation`'s.

### The ten conflicts, resolved

| Conflict | Resolution |
| --- | --- |
| 3× `module.json` | main's `3.0.0`; `8b92f67`'s `>=3.0.0 <4.0.0` `dependsOn` preserved — only the conflicting `version` line was replaced |
| 3× `CHANGELOG.md` | both sections kept, descending: `2.1.x` carries the assertion repairs, `3.0.0` the kernel/dependsOn bump on top |
| `harness-hygiene-baseline.json` | `tsr-verify`'s layout-neutral `module:<entry>/<path>` keys + main's `r2`→`s3` delta; 141 keys / 551 records, zero count drift, **never regenerated** |
| `lessons.json` + `LESSONS.md` | union of ten distinct lessons; `tsr-verify`'s four renumbered `L-047..L-050`, `next_id` 51 |
| `validation.md` | round-4 PASS; the round-1 FAIL report stays on record in `501e3a8` |

### The defect the merge itself created

`scan.ts` auto-merged with **no conflict marker**, but HRN-03 had shipped twice and
independently — `a94d4b1`/`c6a7b33` on main, `0e227b7` on `tsr-verify`, which branched
from `c0d0bba` and predates C8. Git kept both `it` blocks, and the older copy called
`compareToBaseline` with the pre-widening 3-arg signature: `TS2554`, then
`TypeError: files is not iterable`, cascading into `catalog:check`. All ten flagged
conflicts were resolved correctly and none of them was the defect — only gating the
merged tree found it. Recorded as **L-051**.

## Premises that did not survive measurement

- **UNT-01 was no longer red on `main`** by the time of the merge — `49824ef` removed the
  casts at 04:28. The one surviving `as unknown as TransactionManager`
  (`notification-requested.handler.spec.ts:61`) is grandfathered at `no-unsafe-cast: 7`.
- **The `docs/test/testing.md` ↔ `release.yml` chore did not exist** — zero occurrences of
  `release` in that file on either branch; the guard's own suite is 9/9.
- **The merge took 38 of the 43 `exit7` errors with it.** C9 had already repaired the 38
  that predate wave 8, so `catalog:check` dropped 43 → 5.

## Still open at close-out, and none of it this feature's

- **CI-01 / T37's last Done-when.** `tsr-verify` is pushed, but `ci.yml` is
  `on: push: branches: [main]`, tags `v*`, and `pull_request` — a feature-branch push does
  not trigger it, so no run can fire. **Owner ruled 2026-08-25**: wait for wave 8 to clear
  its 5, then push `main`. Not by PR from `tsr-verify` — ADV-04 over `base..head` fails on
  `52e9c8a`, the one catalog-touching commit of the 18 with no `Advisory:` trailer
  (see **L-052**). CI-01 is no longer this feature's to close.
- **Collapsing `2.1.2`/`2.1.3` into `3.0.0`** in the three CHANGELOGs before the release —
  those versions were never tagged, so no child installs them. Version-contract call, the
  owner's.
- **Verifier residuals** (`validation.md` § *Residual items*): `pnpm contract` needs a
  `.env`, which also makes the `openapi.json` diff-check vacuous; an `auth-anti-enum` e2e
  flake in an untouched file; pin `SCAN_ROOTS`.
- The five entry READMEs point at `catalog/<entry>/api/testing/**`, a path no child has
  after `module add` — recorded as a follow-up on `docs-audience-contract`'s side.
