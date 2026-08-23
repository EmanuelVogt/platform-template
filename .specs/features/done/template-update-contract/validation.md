# template-update-contract Validation

**Date**: 2026-08-23
**Spec**: `.specs/features/template-update-contract/spec.md`
**Diff range**: `db8149d..HEAD` (17 task commits across 8 clusters/3 waves + gate fix `b2cb486` + `.specs` records)
**Verifier**: independent sub-agent (author ≠ verifier)

Note on foreign WIP: the checkout carries uncommitted changes from a parallel session
(`.claude/hooks/kill-orphan-dev-servers.mjs`, `.claude/hooks/no-servers-left-behind.mjs`,
`.claude/hooks/lib/dev-servers.mjs`, `.claude/settings.json`, `docs/agents/harness.md`, a
v2.3.0-changelog item 7) — out of scope, never touched, confirmed still present/untouched
after the sensor runs. The Final gate passed clean, so none of it interfered.

---

## Task Completion

All 17 tasks DONE per `tasks.md` § Execution Record (authoritative, not re-derived from
`git log`): Wave 1 (C1 T1/T3/T2/T4 + gate fix `b2cb486`, C2 T5/T6, C3 T9/T10/T11), Wave 2
(C4 T7/T8, C5 T12/T13/T14, C6 T15, C7 T17), Wave 3 exclusive (C8 T16). Both Build gates
green (314/314 then 345/345 then 349/349 `test:scripts`, `catalog:lint` 0 each wave).

---

## Spec-Anchored Acceptance Criteria

Spec's own "Coverage: 31 total" line undercounts — the traceability table (spec.md:179-211)
lists **33** distinct AC ids (REL 5, KADV 7, FEED 4, CAD 4, BOT 7, MIG 3, DOC 3); `tasks.md`'s
"31 ACs → all mapped" line has the same miscount but the mapping string itself does enumerate
all 33. Bookkeeping inconsistency only — every id below has an assigned task and was checked.

| Criterion | Spec-defined outcome | file:line + assertion | Result |
| --- | --- | --- | --- |
| REL-01 (version mismatch) | preflight fails, USAGE_ERROR | `release-preflight.test.mjs:77` `assert.equal(exitCode, EXIT_CODES.USAGE_ERROR)` | ✅ PASS |
| REL-01 (tag exists) | preflight fails, ALREADY_INSTALLED | `release-preflight.test.mjs:94` | ✅ PASS |
| REL-01 (ref ≠ main HEAD) | workflow SHALL **fail** | none — no test; `.github/workflows/release.yml:19` `if: github.ref == 'refs/heads/main'` **skips** the `verify` job (neutral/green), not fail | ⚠️ Gap (functional deviation from "SHALL fail") |
| REL-02 | any gate step fails → no tag, no push | none found (checked `release-preflight.test.mjs` directly, no ref/gate-failure-to-no-tag assertion) — actual guarantee is structural only (`needs: [verify, catalog]` in `release.yml:85`) | ⚠️ Spec-precision gap (declared `test`, only provable as `probe`, same class as REL-03) |
| REL-03 | `actionlint` clean + steps match preflight exit codes | probe run: `actionlint .github/workflows/release.yml` → exit 0; steps reviewed (`release.yml:31,90-107`) — exit codes wired correctly except the REL-01 ref gap above | ✅ PASS (probe) |
| REL-04 | entry changed w/o bump → TEST_FAILURE | `release-preflight.test.mjs:115`; green path `:131` | ✅ PASS |
| REL-05 | non-major manual step → MIGRATION_FAILURE | `release-preflight.test.mjs:161`; rule itself `kernel-version.test.mjs:194,206,216` | ✅ PASS |
| KADV-01 | kernel advisory matched by templateVersion, lock ignored | `advisories.test.mjs:131-132` `assert.deepEqual(result.pending, [...])` | ✅ PASS |
| KADV-02 | no lock → kernel advisories still computed | `advisories.test.mjs:151-154`; `pending-advisories.test.mjs:111-114` | ✅ PASS |
| KADV-03 | status/hook print id/kind/severity/module=kernel; `--json` shape kept | `cli.test.mjs:442-445` `assert.deepEqual(Object.keys(status).sort(), [...])`; `pending-advisories.test.mjs:100-103` | ✅ PASS |
| KADV-04 | ledger id → not pending | `advisories.test.mjs:93-94` `assert.deepEqual(result.pending, [])` | ✅ PASS |
| KADV-05 | unknown module → lint fails | `lint.test.mjs:311-313` | ✅ PASS |
| KADV-06 | fixture `_commit: v2.0.0` no lock → hook prints ADV-20260823-01 | probe run by me: built temp fixture (`.copier-answers.yml` `_commit: v2.0.0`, `docs/advisories/` copied, no lock), ran `pending-advisories.mjs` → `additionalContext` = `"ADV-20260823-01 bug high kernel\nADV-20260823-02 bug high kernel\nno .platform-modules.lock..."` | ✅ PASS (probe) |
| KADV-07 | `test:scripts` unchanged/green | Final gate: 349/349 pass | ✅ PASS (gate) |
| FEED-01 | sparse fetch, 24h cache keyed source+tag, merge by id (remote wins) | `advisory-feed.test.mjs:63,67-68,81,139-145` | ✅ PASS |
| FEED-02 | pending kernel advisories printed (id/kind/severity/fix) | `template-behind.test.mjs:100` | ✅ PASS |
| FEED-03 | unreachable/timeout → silent, exit 0, cache used | `template-behind.test.mjs:23,113-117,130` | ✅ PASS |
| FEED-04 | template repo itself → feed doesn't run | `template-behind.test.mjs:90` `assert.equal(result.stdout, "")` | ✅ PASS |
| CAD-01 | days elapsed + overdue mark | `cli.test.mjs:494-496,508-510` | ✅ PASS |
| CAD-02 | "latest `<tag>` published N days ago" | `cli.test.mjs:526` | ✅ PASS |
| CAD-03 | up-to-date output unchanged | `cli.test.mjs:627-632` | ✅ PASS |
| CAD-04 | `docs/dev/template-update.md` shipped, cadence documented | probe run by me: `test -f docs/dev/template-update.md` → OK; `grep -n _exclude copier.yml` → only `release.yml` excluded, `template-update.md` absent from `_exclude` | ✅ PASS (probe) |
| BOT-01 | no behind tags → no-op | `template-update-ci.test.mjs:49` | ✅ PASS |
| BOT-02 | behind → branch/copier update/migrate/install/gate steps | `template-update-ci.test.mjs:64,73-87` | ✅ PASS |
| BOT-03 | green+no conflict → push+PR; existing PR → idempotent | `template-update-ci.test.mjs:72,54` | ✅ PASS |
| BOT-04 | conflict/gate fail → issue, no push; never duplicate | `template-update-ci.test.mjs:99-100,103,116,135` | ✅ PASS |
| BOT-05 | inert in template itself; ships via copier | `.github/workflows/template-update.yml:28` `if: hashFiles('.copier-answers.yml') != ''`; `copier-delivery.test.mjs:26` | ✅ PASS |
| BOT-06 | unreachable origin → fails naming TEMPLATE_READ_TOKEN | `template-update-ci.test.mjs:144` | ✅ PASS |
| BOT-07 | `test:scripts` green | Final gate: 349/349 pass | ✅ PASS (gate) |
| MIG-01 | ascending, skip missing, idempotent | `template-migrate.test.mjs:56,71` | ✅ PASS |
| MIG-02 | stop at failing script, report by name, later unrun | `template-migrate.test.mjs:92,93,94` | ✅ PASS |
| MIG-03 | this feature's changelog section satisfies REL-05 | `docs/dev/template-changelog.md:35` literal `None — copier update is enough.`; rule `kernel-version.test.mjs:216` | ✅ PASS |
| DOC-01 | AD-034 in `.specs/STATE.md` § Decisions, both sides + enforcement points | `.specs/STATE.md:42` — confirmed present, states template-side (`release-preflight.mjs`, `computePending`, `catalog:lint`, migrations) and child-side (session hook, `status`, `template-update.yml`) obligations and enforcement points | ✅ PASS (non-test, per payload) |
| DOC-02 | `docs/agents/workflow.md` tag rule (user dispatches, agent never tags/pushes) | `docs/agents/workflow.md:134-135` | ✅ PASS |
| DOC-03 | `docs/advisories/README.md` documents `module: kernel` + feed | content confirmed correct (`docs/advisories/README.md:25-46`) but **no test** asserts it (checked `lint.test.mjs`/`advisories.test.mjs` directly — only a `loadAdvisories` test that ignores README as a file, not a content assertion) | ⚠️ Spec-precision gap (declared `test`, zero automated guard) |

**Status**: ⚠️ 30/33 ACs fully matched · 3 gaps flagged (1 functional deviation, 2 spec-precision gaps) — none blocking (safety property — no broken tag ships — holds in all three cases).

---

## Discrimination Sensor (default depth — 3, not P0/Light Execute)

| # | File:line | Mutation | Killed? |
| - | --- | --- | --- |
| 1 | `scripts/platform/lib/advisories.mjs:62` | `!semver.satisfies(...)` → `semver.satisfies(...)` (inverted kernel-affects match) | ✅ Killed — `node --test advisories.test.mjs` 2 failures (tests 13, 16), restored, `git status --short` clean |
| 2 | `scripts/platform/release-preflight.mjs:54` | `currentVersion === previousVersion` → `currentVersion !== previousVersion` (inverted entry-bump detection) | ✅ Killed — `node --test release-preflight.test.mjs` 2 failures (tests 3, 4), restored, clean |
| 3 | `scripts/platform/template-update-ci.mjs:27` | `openPrs.includes(tag)` → `!openPrs.includes(tag)` (inverted PR-idempotency check) | ✅ Killed — `node --test template-update-ci.test.mjs` 3 failures (tests 2, 3, 4), restored, clean |

**Result**: 3/3 killed — ✅ PASS. All three files confirmed restored (`git checkout -- <file>` + empty `git status --short`).

---

## Edge Cases

- [x] Changelog's latest section already tagged → double-dispatch caught by REL-01's ALREADY_INSTALLED path.
- [~] `_commit` with `-N-gHASH` suffix → `parseInstalledVersion` (pre-existing utility, reused unmodified by KADV-01); not independently re-tested by this feature.
- [~] Two sessions racing the 24h feed cache → last-write-wins is inherent to the `writeFileSync` cache implementation; not independently tested, low risk.
- [x] Unparseable remote advisory file → feed skips silently (`advisory-feed.test.mjs:106-107`, `skipped[]`); `status` surfaces the parse error (Wave-2 deviation `6e82a92`, `template.feedError`/`advisories.feedSkipped[]`).
- [x] Bot's closed-unmerged PR never reopened → `template-update-ci.test.mjs` "pr-closed (does not reopen)" case (confirmed live during mutant 3's failure output).

---

## Gate Check

- **Gate command**: `pnpm check && pnpm test && pnpm test:scripts && pnpm catalog:lint && pnpm catalog:typecheck` (via `shell-runner`)
- **Result**: exit 0 — `pnpm check` 5/5 tasks; `pnpm test` (vitest) 585/585 across 89 files; `pnpm test:scripts` 349/349; `pnpm catalog:lint` 0 errors; `pnpm catalog:typecheck` 5/5 entries.
- **Test count before feature**: 279 (`test:scripts`)
- **Test count after feature**: 349 (`test:scripts`)
- **Delta**: +70 new tests, 0 dropped
- **Failures**: none

---

## Fix Plans (if issues found)

### Fix 1: REL-01 ref-check doesn't fail, it skips
- **Root cause**: `.github/workflows/release.yml:19` gates the whole `verify` job with a job-level `if: github.ref == 'refs/heads/main'`. A wrong-ref dispatch makes the job (and its downstream `needs`) **skip** — GitHub shows a neutral/skipped run, not a failure — while the AC text says "the workflow SHALL fail."
- **Fix task**: add an explicit failing step (e.g. a leading `run:` step in `verify` — or a dedicated `guard` job — that checks `github.ref` and exits non-zero with a clear message) so the run shows red, not grey/skipped. No test exists for this clause either; add one once the mechanism changes to something testable, or keep it `probe`-proven like REL-02/REL-03.
- **Priority**: Minor (the unsafe outcome — a bad tag shipping — cannot occur either way; this is an observability gap for whoever dispatches from the wrong ref).

### Fix 2: REL-02 has no test evidence
- **Root cause**: the guarantee ("gate fails → no tag/push") is entirely a property of the workflow's `needs: [verify, catalog]` graph, not of any function `release-preflight.test.mjs` can unit-test.
- **Fix task**: re-classify REL-02's traceability Proof to `probe` (workflow steps review, same as REL-03) rather than `test`, or add a workflow-level integration check if the project ever gains one.
- **Priority**: Cosmetic (spec-precision correction, not a code fix).

### Fix 3: DOC-03 has no test evidence
- **Root cause**: `docs/advisories/README.md`'s `module: kernel` + feed documentation is correct today but nothing guards it from drifting (only a negative test that README.md is *not* parsed as an advisory).
- **Fix task**: add a grep-style assertion (pattern already used elsewhere in this codebase for docs content) checking the README mentions `module: kernel` and the remote feed.
- **Priority**: Cosmetic.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| REL-01 | Pending | ⚠️ Partial — ref clause unproven/deviant |
| REL-02 | Pending | ⚠️ Spec-precision gap |
| REL-03, REL-04, REL-05 | Pending | ✅ Verified |
| KADV-01..07 | Pending | ✅ Verified |
| FEED-01..04 | Pending | ✅ Verified |
| CAD-01..04 | Pending | ✅ Verified |
| BOT-01..07 | Pending | ✅ Verified |
| MIG-01..03 | Pending | ✅ Verified |
| DOC-01, DOC-02 | Pending | ✅ Verified |
| DOC-03 | Pending | ⚠️ Spec-precision gap |

---

## Summary

**Overall**: ⚠️ Issues (non-blocking) — recommend orchestrator opens 3 small fix tasks; feature is otherwise shippable.

**Spec-anchored check**: 30/33 ACs matched spec outcome (spec's own "31 total" line undercounts by 2); 2 spec-precision gaps + 1 functional deviation flagged.
**Sensor**: 3/3 mutations killed.
**Gate**: 349 `test:scripts` + 585 vitest + check + catalog:lint + catalog:typecheck all passed, exit 0.

**What works**: kernel-advisory matching independent of the module lock, the remote feed with 24h cache and silent-failure paths, cadence surfacing, the bot's plan/run split (idempotent PR/issue handling verified live via the surviving-mutant tests), executable migrations, and AD-034 recording both sides of the contract.

**Issues found**: see Fix Plans 1-3 above — none touch the release-safety property (no broken tag can ship in any of the three cases); all are precision/observability gaps.

**Next steps**: orchestrator opens fix tasks for REL-01 (ref-check job design), REL-02/DOC-03 (proof-kind correction or add the missing grep-style test), then this feature can proceed to tagging `v2.3.0` (user's act).

---

## Round 2 — Re-verification (2026-08-23)

**Fix range**: `18cd50f..HEAD` (2 commits: `0c9ad48`, `474f9f6` — note: coordinator's message named 3 commits including the REL-01 workflow edit; only the two test commits are new on top of `18cd50f`, the workflow fix itself is at/before `18cd50f`). Fresh worker, not the Verifier.

| Gap (Round 1) | Fix commit | Re-check | Result |
| --- | --- | --- | --- |
| REL-01 (ref clause skips instead of fails) | workflow edit (at `18cd50f`) | `.github/workflows/release.yml:19-24` — job-level `if:` removed from `verify`; unconditional first step `run:` checks `github.ref != 'refs/heads/main'`, prints `::error::` naming the wrong ref, `exit 1`. Confirmed by reading the file directly. New test `release-workflow.test.mjs` asserts `jobs.verify.if === undefined` and the guard step's `run` text matches `github\.ref`, `refs/heads/main`, `exit 1`, with no `if` of its own. | ✅ Fixed — now fails loud, matches AC text exactly |
| REL-02 (no test; structural-only guarantee) | `0c9ad48` | `scripts/platform/__tests__/release-workflow.test.mjs` parses the real `release.yml` (not a copy) and asserts: `jobs.tag.needs` deep-equals `["verify", "catalog"]`; `release-preflight.mjs` step index precedes every gate step (`pnpm check/test/test:scripts/catalog:lint/catalog:typecheck`); `tag` is the only job with `permissions.contents === "write"`. Read in full — assertions are concrete, not vacuous. | ✅ Fixed — genuine test now proves the job graph and step ordering |
| DOC-03 (README content untested) | `474f9f6` | `scripts/platform/__tests__/advisories.test.mjs:196-201` reads `docs/advisories/README.md` and asserts `/module:\s*<entry>\/<variant>\s*\|\s*kernel/`, `` /`module: kernel`/ ``, `/Remote feed/`, `/template-behind\.mjs/`. Cross-checked against the actual file — all four patterns match real lines (`README.md:15,25,41`). | ✅ Fixed |

**Tests run by me (not taken on the worker's report)**:
- `node --test scripts/platform/__tests__/release-workflow.test.mjs scripts/platform/__tests__/advisories.test.mjs` → exit 0, `# pass 28`, `# fail 0`.
- `actionlint .github/workflows/release.yml` → exit 0.

**Sensor**: none this round — all three fixes ship with concrete, non-vacuous assertions against real files (workflow YAML parsed directly, README content cross-checked); no fix looked untested, so no new mutation was required per this round's scope.

**Final gate re-run** (through `shell-runner`, full suite, at the coordinator's explicit request this round): `pnpm check && pnpm test && pnpm test:scripts && pnpm catalog:lint && pnpm catalog:typecheck` → **exit 0**. `pnpm check` 5/5 tasks; `pnpm test` 585/585 (89 files, unchanged); `pnpm test:scripts` **355/355** (Round 1 was 349 — +6 new tests: 5 in `release-workflow.test.mjs` + 1 DOC-03 case in `advisories.test.mjs`, 0 dropped); `pnpm catalog:lint` 0; `pnpm catalog:typecheck` 5/5 entries. No regression.

**Foreign WIP**: same untouched set confirmed present and unmodified by this round (`.claude/hooks/kill-orphan-dev-servers.mjs`, `.claude/hooks/no-servers-left-behind.mjs`, `.claude/hooks/lib/dev-servers.mjs`, `.claude/settings.json`, `docs/agents/harness.md`, changelog item 7) plus two new unrelated `.specs/features/` folders and a `.specs/STATE.md` edit from a parallel session — none touched, none attributed to this feature.

**Lessons**: none added this round (all three findings are now resolved, not new grounded failures). L-025/L-026/L-027 from Round 1 stand as general lessons (job-level `if:` vs failing guard step; proof-kind precision; doc-content needs a guarding test) — left in the store as-is.

### Round 2 Summary

**Overall**: ✅ Ready — all 3 Round 1 gaps fixed and independently re-verified; Final gate green; no regression.
**Spec-anchored check**: 33/33 ACs now matched (30 from Round 1 + 3 fixed).
**Gate**: 355 `test:scripts` (+6 vs Round 1) + 585 vitest + check + catalog:lint + catalog:typecheck, all exit 0.
**Sensor**: not re-run (no new mutation needed; Round 1's 3/3 killed stands).
