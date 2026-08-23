# remove-child-update-bot Validation

**Date**: 2026-08-23
**Spec**: `.specs/features/remove-child-update-bot/spec.md`
**Diff range**: `38d4063..HEAD` (`eb907ef`, `0ec749a`, `557fef0`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| `eb907ef` — delete the weekly bot, invert the guard | ✅ Done | Deletes `.github/workflows/template-update.yml` and `scripts/platform/template-update-ci.mjs` + its test; rewrites `copier-delivery.test.mjs`'s guard to assert absence via `git ls-files`; drops the bot mention from `copier.yml`'s comment. |
| `0ec749a` — drop the bot from the docs the child receives | ✅ Done | `template-changelog.md` item 5 removed, items 6-7 renumbered to 5-6, `### Child migration steps` untouched; `template-update.md`'s "Bot" section replaced by "The product never updates itself". |
| `557fef0` — record the reversal, amend AD-034 | ✅ Done | `spec.md` authored; `.specs/STATE.md` AD-034 child side amended in place (history not rewritten). |

---

## Spec-Anchored Acceptance Criteria

| AC | Requirement | Proof | Spec-defined outcome | `file:line` + assertion | Result |
| -- | ----------- | ----- | --------------------- | ------------------------ | ------ |
| AC-1 | REV-01 | test | `.github/workflows/template-update.yml` not tracked by git | `scripts/platform/__tests__/copier-delivery.test.mjs:27-39` — `git ls-files -z <path1> <path2>` → `assert.deepEqual(tracked, [])`; confirmed live by sensor mutant 1 (restored the file + `git add`, test failed, reverted). | ✅ PASS |
| AC-2 | REV-02 | test | `scripts/platform/template-update-ci.mjs` not tracked by git, same guard | Same assertion, second path in the array (`copier-delivery.test.mjs:30`); confirmed live by sensor mutant 2 (restored the script + `git add`, test failed, reverted). | ✅ PASS |
| AC-3 | REV-02 | gate | `pnpm test:scripts` exits 0; suite no longer contains `template-update-ci.test.mjs`, its 161 lines gone | Final gate: `pnpm test:scripts` exit 0, `# tests 345`. `git diff --stat 38d4063..HEAD` shows `template-update-ci.test.mjs \| 161 -------` (full deletion). Deleted file carried exactly 10 `test(` cases (`git show 38d4063:scripts/platform/__tests__/template-update-ci.test.mjs \| grep -c "^test("` → 10), matching the 355→345 baseline delta. | ✅ PASS |
| AC-4 | REV-03 | probe | `copier.yml` carries no reference to the bot | `grep -n "template-update.yml\|template-update-ci" copier.yml` → no matches (exit 1, empty output), run directly. | ✅ PASS |
| AC-5 | REV-03 | test | `release.yml`, `docs/dev/template-update.md`, `scripts/platform/migrations` tests in `copier-delivery.test.mjs` still pass, unchanged | `copier-delivery.test.mjs:18-23` (release.yml excluded), `:42-47` (template-update.md not excluded), `:49-63` (migrations not excluded) — all three byte-identical to pre-range version (only the middle test block was rewritten); the release.yml test proven live by sensor mutant 3 (removed the `_exclude` entry, test failed, reverted). | ✅ PASS |
| AC-6 | REV-04 | test | Guard fails if either bot path is restored | Sensor mutants 1 and 2 (below) — both killed the same assertion at `copier-delivery.test.mjs:35-38`. | ✅ PASS |
| AC-7 | REV-05 | probe | `## v2.3.0` section has no "Weekly bot"; items run `1.`…`6.` with no gap; `### Child migration steps` still `None — copier update is enough.` | `docs/dev/template-changelog.md:7-33` — no "Weekly bot" string; items `1.`…`6.` (`:14,17,20,22,24,26`) consecutive; line 33 = `None — copier update is enough.` (verified directly with `nl -ba`). | ✅ PASS — see note below |
| AC-8 | REV-06 | probe | `docs/dev/template-update.md` headings exactly the 6 listed, no "Bot"/"weekly"/"schedule" in any heading | Headings read in order: `# Template update contract` (`:1`), `## What the template promises per tag` (`:8`), `## Cadence (recommended, never enforced)` (`:22`), `## Feed: advisories before you update` (`:34`), `## The product never updates itself` (`:41`), `## Commands` (`:48`) — exact match, no forbidden word in any heading. | ✅ PASS |
| AC-9 | REV-06 | gate | `template-behind.test.mjs` and `template-version.test.mjs` green, detection half untouched | Final gate: `pnpm test:scripts` exit 0 (345/345, no failures). Both files present and untouched by the range: `git diff --stat 38d4063..HEAD -- .claude/hooks/template-behind.mjs scripts/platform/lib/advisory-feed.mjs scripts/platform/migrations` → empty (no diff). | ✅ PASS |
| AC-10 | REV-07 | probe | AD-034 child side states the child never updates itself, no longer describes a weekly PR bot | `.specs/STATE.md:42` — `"**The child never updates itself** (amended 2026-08-23 by `remove-child-update-bot`...): ... no scheduled workflow — in the product's repository or anywhere else — runs `copier update` or opens an update PR. The weekly bot originally specified here ... was deleted, not relocated"`. | ✅ PASS |

**Status**: ✅ All 10 ACs covered with `file:line` evidence.

**Note on AC-7**: the spec's Evidence column cites `template-changelog.md:7-36` and "line 35" for the `None — copier update is enough.` literal; the current file has the section at lines 7-33 (blank line 34, `## v2.2.1` at 35) and the literal at line 33. This is a 2-line drift in the spec's own citation (consistent with the spec being authored before a final pass, or simply miscounted), not a defect in the delivered content — every substantive claim (no "Weekly bot", `1.`…`6.` with no gap, the literal child-migration-steps sentence) is independently verified true against the actual file. Not treated as a spec-precision gap: the requirement itself (REV-05) is precise and fully checkable; only an auxiliary line-number pointer is stale.

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ------------ | ------- |
| 1 | `.github/workflows/template-update.yml` (recreated + `git add`) | Restored the deleted workflow bot path into git tracking | ✅ Killed — `node --test copier-delivery.test.mjs` → `not ok 2 - no self-updating bot ships to the child`, `# fail 1` |
| 2 | `scripts/platform/template-update-ci.mjs` (recreated + `git add`) | Restored the deleted script bot path into git tracking, independently of mutant 1 | ✅ Killed — same test, `not ok 2`, `# fail 1` |
| 3 | `copier.yml:41` (`- .github/workflows/release.yml` removed from `_exclude`) | Dropped the release.yml exclusion the guard's sibling test depends on | ✅ Killed — `not ok 1 - release.yml is excluded — template-only...`, `# fail 1` |

All three mutations: injected once, scoped test run once (`node --test scripts/platform/__tests__/copier-delivery.test.mjs`), reverted with `git reset -- <file>` (mutants 1-2, since they were new files) / `git checkout -- copier.yml` (mutant 3); `git status --short` confirmed empty for each target file after revert.

**Sensor depth**: default (3) — Medium scope, not Light Execute-exempt (a real guard test exists), not P0.
**Result**: 3/3 killed — PASS ✅

---

## Code Quality

| Principle        | Status |
| ---------------- | ------ |
| Minimum code     | ✅ Diff touches exactly the 9 files the payload enumerated — no scope creep. |
| Surgical changes | ✅ `copier.yml`'s only change is a comment; the guard test is a targeted rewrite of one `test(...)` block. |
| No scope creep   | ✅ `template-changelog.md` diff is exactly item 5 removal + renumbering (out-of-scope constraint respected). |
| Matches patterns | ✅ New guard follows the existing `copier-answers-leak.test.mjs` / same-file pattern (`parseYaml` + `git ls-files`). |
| Spec-anchored outcome check (asserted values match spec) | ✅ |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| Documented guidelines followed | AD-034 (amended by this feature), AD-006 (agents never tag/push — respected, no tag/push in range) |

---

## Edge Cases

- [x] Detection half untouched: `git diff --stat 38d4063..HEAD -- .claude/hooks/template-behind.mjs scripts/platform/lib/advisory-feed.mjs scripts/platform/migrations` empty; `template-behind.test.mjs`/`template-version.test.mjs` both present and green.
- [x] No dangling import of the deleted script: `grep -rn "template-update-ci" scripts/ .github/workflows/*.yml package.json` finds nothing outside the guard test's string literal and `.specs/` history.
- [x] `copier.yml`'s `_exclude` contract otherwise unchanged: `release.yml` still excluded, `docs/dev/template-update.md` and `scripts/platform/migrations/**` still ship (verified by reading the 3 surviving `copier-delivery.test.mjs` tests + sensor mutant 3).
- [x] `.github/workflows/` now lists exactly `catalog.yml`, `ci.yml`, `feedback-triage.yml`, `release.yml` — no `template-update.yml`.
- [x] Nothing tagged, nothing pushed (out of scope, respected).

---

## Gate Check

- **Gate command**: `pnpm check` && `pnpm test` && `pnpm test:scripts` && `pnpm catalog:lint` && `pnpm catalog:typecheck` (via `shell-runner`)
- **Result**:
  - `pnpm check` — exit 0 (turbo: 5/5 tasks successful, cache hits)
  - `pnpm test` — exit 0 (585/585 tests, 89 files)
  - `pnpm test:scripts` — exit 0, 345/345 (see note below)
  - `pnpm catalog:lint` — exit 0
  - `pnpm catalog:typecheck` — exit 0 (5 entries: tag, notification, identity, audit, attachment)
- **Test count before feature** (`test:scripts` baseline, pre-`38d4063`): 355
- **Test count after feature**: 345
- **Delta**: -10 (expected — the deleted `template-update-ci.test.mjs` carried exactly 10 `test(` cases, confirmed via `git show 38d4063:scripts/platform/__tests__/template-update-ci.test.mjs`)
- **Skipped tests**: none
- **Failures**: none in the final result. **Operational note**: the runner's first direct `pnpm test:scripts` invocation exited 1 with no diagnosable failure — the TAP log stopped mid-stream (last line `ok 87`) with no `not ok` and no `1../# pass/# fail` summary, consistent with the process being killed rather than an assertion failing. A second run (`rtk proxy pnpm test:scripts`) came back clean: exit 0, `# tests 345 / # pass 345 / # fail 0`, matching the pre-verification baseline the orchestrator already confirmed and the independent 355-10=345 math above. Treated as environmental flake, not a regression — no code or test in the feature's diff surface is implicated. Worth a rerun on CI to confirm it isn't intermittent there too.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ----------- |
| REV-01 | Implementing | ✅ Verified |
| REV-02 | Implementing | ✅ Verified |
| REV-03 | Implementing | ✅ Verified |
| REV-04 | Implementing | ✅ Verified |
| REV-05 | Implementing | ✅ Verified |
| REV-06 | Implementing | ✅ Verified |
| REV-07 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 10/10 ACs matched spec outcome (1 minor citation-drift note on AC-7, not a gap)
**Sensor**: 3/3 mutations killed
**Gate**: 5/5 commands passed (one transient, non-reproducible `test:scripts` flake on the runner's first invocation, resolved clean on rerun, root-caused to no assertion failure)

**What works**: The bot is fully removed and untracked (guard proven live by two independent sensor mutations); the detection half (`template-behind.mjs`, `advisory-feed.mjs`, `platform status`, `template-update` skill, migrations) is untouched by the range; `copier.yml`'s `_exclude` contract is otherwise intact (release.yml still template-only, docs and migrations still ship); the changelog renumbering has no gap and keeps the required `None — copier update is enough.` line; `docs/dev/template-update.md`'s headings match exactly, with the bot section replaced by a positive contract statement; AD-034's child side is amended in place, naming the deletion and the detection half that ships instead; history (`done/template-update-contract/**`) is untouched.

**Issues found**: none blocking. Non-blocking: AC-7's spec citation line numbers are 2 lines stale (content itself correct); the first `pnpm test:scripts` run flaked with no assertion failure (rerun clean, matches baseline).

**Next steps**: none required for this feature. Optional: refresh AC-7's line-number citation in spec.md next time it's touched; keep an eye on `test:scripts` for CI flakiness (unrelated to this feature).
