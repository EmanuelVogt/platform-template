# Release Marker Commit + CI Consolidation Validation

**Date**: 2026-08-24
**Spec**: `.specs/features/release-marker-commit/spec.md`
**Diff range**: this feature's 15 commits, plus round-2 fix `9820444` — `c4ea19e 7550d88 f3b5635 6b99461 529ad5c dc1e3c7 c3f3690 e1e2c8c 2c21355 3ced718 6e63888 7e5a43e 0358bd4 94fbeab b9afc82 9820444` (the checkout is shared with a live sibling session; `259ac55`, `bc75d78`, `29ed003`, `35c8a4f`, `5f89723`, `4088235`, `2fa2977` and all `apps/**` history are foreign and out of scope, per payload).
**Verifier**: independent sub-agent (author ≠ verifier)

**Round 2** (2026-08-24): fix commit `9820444` — `test(platform): refuse a marker that changes exactly one file` — touches only `scripts/platform/__tests__/release-marker.test.mjs` (+10 lines, one new test "MARK-08 boundary" at `:164-172`). Re-verified below; everything else from round 1 stands unchanged.

---

## Design-authoritative corrections (not scored as spec misses)

`design.md` § *Spec corrections this Design makes* overrides the spec's stale text in 4 places; scored per the design here:

1. **CI-03** — spec named 8 commands; design adds `template:smoke` (`catalog.yml:82-94` had a `smoke` job the naive merge would silently drop). Implementation includes it — see CI-03 row below.
2. **DOC-03** — spec's anchors (`docs/dev/template.md:58`, `TEMPLATE.md:26`) are stale; design re-anchors at `TEMPLATE.md:24/29`. Scored against the design's anchors.
3. **MARK-03** — spec text says `tag` needs `[verify, catalog]`; design requires the superset `[marker, verify, catalog]` (a job reads outputs only from a direct `needs`). Scored as a superset, not equality.
4. **Edge case / assumption rows** — "the 5-entry matrix runs twice — accepted" and "the release's own duplication survives" are dead text; design resolves the double-run the other way round: `ci.yml`'s `detect` job skips on a marker push, so `release.yml`'s gate set is the only one that runs on that push. This directly informs CI-02 below.

---

## Spec-Anchored Acceptance Criteria

| Requirement | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| CI-01 | `catalog.yml` doesn't exist, `copier.yml` exclude entry removed | `gates.test.mjs:120` `existsSync(CATALOG_WORKFLOW_PATH)===false`; `copier-delivery.test.mjs:59-75` `assert.deepEqual(tracked, [])` + not excluded | ✅ PASS |
| CI-02 | `turbo lint typecheck`/`pnpm test` requested exactly once across all workflows on that event | `gates.test.mjs:124-132` counts `===1` **within `ci.yml`**; cross-workflow exclusivity established structurally by `gates.test.mjs:197-199` (`detect.if` scoped to `refs/heads/main` + marker prefix) and `release-workflow.test.mjs:43-53` (`marker.if` fires only on the marker prefix) — the two conditions are complements, per design correction 4 above | ✅ PASS (no single cross-file assertion; covered by two independently-tested, mutually-exclusive conditions) |
| CI-03 | merged `ci.yml` requests every one of 9 commands incl. `template:smoke`, none extra | `gates.test.mjs:134-159` — 10-command `expectedCommands` array includes `"pnpm template:smoke"`; asserts `!runs.some(includes("pnpm check"))` | ✅ PASS |
| CI-04 | `ci.yml` runs on a pushed `v*` tag | `gates.test.mjs:161-164` `on.push.tags.includes("v*")` | ✅ PASS |
| CI-05 | only the ADV-04 step carries a `pull_request`-only `if` | `gates.test.mjs:166-176` `stepsWithPrIf.length===1` && `run.includes("advisory-required.mjs")` | ✅ PASS |
| CI-06 | every catalog job skipped, workflow succeeds in a generated product | `gates.test.mjs:178-195` — exhaustive loop over every job whose steps run `catalog:*`/`test:scripts`/`template:smoke`, asserts `needs.includes("detect")` + `if` checks `needs.detect.outputs.template` | ✅ PASS |
| MARK-01 | marker push → Release workflow runs, tags on green `verify`+`catalog` | `release-workflow.test.mjs:58-67` `jobs.verify.if === "needs.marker.outputs.release == 'true'"` (same for `catalog`) | ✅ PASS |
| MARK-02 | version from head subject only; tag message = changelog first paragraph | `release-marker.test.mjs:43-48` (`parseMarkerSubject`); `release-preflight.test.mjs:204-212` (`preflightMessage()` = first paragraph) | ✅ PASS |
| MARK-03 | `tag.needs` ⊇ `[verify, catalog]` (superset per design) | `release-workflow.test.mjs:73-77` `jobs.tag.needs.includes("verify")` && `.includes("catalog")` | ✅ PASS |
| MARK-04 | non-marker push starts no runner | `release-workflow.test.mjs:43-47` `assert.match(jobs.marker.if, /head_commit\.message/)` | ✅ PASS |
| MARK-05 | no `workflow_dispatch`, no `version` input, no ref-guard step | `release-workflow.test.mjs:19-41` (two tests) | ✅ PASS |
| MARK-06 | malformed `chore(release):` subject fails before any gate, names the form | `release-marker.test.mjs:103-111` `result.action==="fail"`, `reason` matches `/chore\(release\): vX\.Y\.Z/` | ✅ PASS |
| MARK-07 | non-head marker fails, names "must be the last commit" | `release-marker.test.mjs:113-121` `reason` matches `/não é o head/` | ✅ PASS |
| MARK-08 | marker changing ≥1 file fails, naming the count | `release-marker.test.mjs:154-162` (2 files) + `:164-172` (round 2: exactly 1 file, `reason` matches `/1 arquivo/`) | ✅ PASS — boundary now covered, sensor M3 re-run confirms kill (see Sensor section) |
| MARK-09 | preflight refusal ⇒ no tag | `release-preflight.test.mjs:77-90,94-107,111-133,162-185` (exit codes per refusal path); `tag.needs` structurally includes `verify` (MARK-03) so GH Actions skips `tag` on a failed `needs` by default | ✅ PASS |
| MARK-10 | no-arg → latest changelog version; explicit arg overrides | `release-command.test.mjs:95` (`"3.0.0"` no-arg), `:116` (`"5.5.5"` explicit) | ✅ PASS |
| MARK-11 | local preflight; refusal ⇒ its exit code/message, no commit | `release-command.test.mjs:187-194` | ✅ PASS |
| MARK-12 | pass ⇒ exactly one empty commit, no tag, no push, prints push command | `release-command.test.mjs:215-230` — `commitCalls.length===1`, exact args, no `tag`/`push` call, `logs===["git push origin main"]` | ✅ PASS |
| MARK-13 | dirty tree or non-`main` HEAD ⇒ refuse, no commit | `release-command.test.mjs:124-146` (branch≠main), `:148-170` (dirty tree) | ✅ PASS |
| MARK-14 | marker commit passes `commit-msg` hook without `Advisory:` trailer | Probe run by the Verifier: `git commit --allow-empty -m "chore(release): v9.9.9"` at HEAD `2fa2977` → exit 0, `commit-msg` hook's `advisory-required` step passed with no trailer; `git reset --hard 2fa2977` restored HEAD, `git status --short` clean after | ✅ PASS |
| DOC-01 | AD-034 amended: marker supersedes dispatch clause of REL-01 | `.specs/STATE.md:42` (commit `b9afc82`) — names the pushed marker, the deleted `workflow_dispatch`/ref guard, and "supersedes that clause of REL-01" verbatim | ✅ PASS |
| DOC-02 | new decision: `ci.yml` is the single gate workflow, ships, catalog jobs inert in a product | `.specs/STATE.md:44` (AD-036, commit `b9afc82`) — matches the AC verbatim | ✅ PASS |
| DOC-03 | no doc instructs a dispatch or hand-written `git tag` | Probe: `grep -n "workflow_dispatch\|Actions.*Run workflow\|git tag v\|dispatch the.*release\|Release workflow" docs/agents/workflow.md TEMPLATE.md docs/dev/template.md AGENTS.md.jinja` → exit 1 (no match); confirmed `TEMPLATE.md:29-30` and `docs/agents/workflow.md:137-139` describe the marker flow correctly | ✅ PASS |
| DOC-04 | the 3 named test files assert the new shape, `pnpm test:scripts` passes | Gate: `pnpm test:scripts` 454/454 (baseline 376) — see Gate Check; scout confirmed no stale-shape assertion remains, `release-workflow.test.mjs:19-41` positively asserts absence of `workflow_dispatch`/ref-guard | ✅ PASS |
| DOC-05 | "agent never tags/pushes" still holds in every edited doc | Gate (same `pnpm test:scripts` run) + direct read: `TEMPLATE.md:29-30`, `docs/agents/workflow.md:137-139` both say "the agent still never tags or pushes on its own" | ✅ PASS |

**Status**: ✅ All 25 ACs matched their spec-defined outcome (4 scored against `design.md`'s corrections per the payload). MARK-08's round-1 boundary gap is closed by `9820444` — see Sensor section.

**T13** (changelog `## v2.4.0` section) is blocked on the owner tagging `v2.3.0`; maps to no AC (all 25 delivered by waves 1-3) — external blocker, does not affect this verdict.

---

## Worker deviation (C2): `marker.version` output carries no `v` prefix

Confirmed coherent end to end, not a defect:

- `release-marker.mjs:20` — `parseMarkerSubject` returns `version` without `v` (`"${m1}.${m2}.${m3}"`).
- `release-marker.test.mjs:238-246` — asserts the `GITHUB_OUTPUT` write is `"release=true\nversion=2.4.0\n"` (no `v`), proving the contract end to end for the marker step itself.
- `release.yml:47` — `verify` passes `needs.marker.outputs.version` raw (no `v`) to `release-preflight.mjs`.
- `release-preflight.mjs:100` — `git tag -l "v${version}"` expects `version` **without** `v` (it prepends its own), matching the old `inputs.version` contract.
- `release.yml:123` — `tag` re-adds the prefix: `git tag -a "v$VERSION"`.

No gap. Absent from the design text but consistent with the pre-existing `release-preflight.mjs` contract at every hop.

---

## Discrimination Sensor

| # | File:line | Description | Killed? |
| --- | --- | --- | --- |
| M1 | `.github/workflows/ci.yml:31-34` (`detect.if`) | Dropped `&& github.ref == 'refs/heads/main'` from the marker-skip condition | ✅ Killed — `gates.test.mjs` "regressão AD-033: detect.if do ci.yml contém refs/heads/main" (line 197) fails |
| M2 | `.github/workflows/release.yml:16-18` (`marker.if`) | Tightened the loose prefix filter to require a digit pattern (`contains(..., '[0-9]')`) | ✅ Killed — `release-workflow.test.mjs` "guarda de regressão: marker.if permanece frouxo" (line 46) fails |
| M3 (round 1) | `scripts/platform/lib/release-marker.mjs:60` | Off-by-one: `changedFiles.length > 0` → `> 1` | ❌ Survived — `release-marker.test.mjs` 24/24 still pass (the suite tested `changedFiles: []` and `["a.txt","b.txt"]`, never exactly one file) |
| M3 (round 2 re-run) | `scripts/platform/lib/release-marker.mjs:60` | Same off-by-one, re-injected after `9820444` added the 1-file case | ✅ Killed — `not ok 17 - MARK-08 boundary: ...` fails, 24 pass / 1 fail, exit 1 |

Each mutant: injected alone, scoped test run with log on disk, restored via `git checkout -- <file>`, `git status --short -- <file>` confirmed empty before the next. Round 2: independently confirmed `release-marker.mjs:60` is **unchanged** by `9820444` (not in its diff; `sed -n '60p'` still reads `changedFiles.length > 0`) — the fix added only a test, and the guard was already correct (1 > 0 is true, so exactly-one-file already failed loudly before the fix; only the regression net had the gap).

**Sensor depth**: default (3) — Medium/tooling feature, not Light Execute, not P0.
**Result**: 3/3 killed (round 2) — ✅ PASS

---

## Gate Check

- **Gate command**: `pnpm check && pnpm test && pnpm test:scripts && pnpm catalog:lint && pnpm catalog:typecheck && pnpm template:smoke` (through `shell-runner`)
- **Result**: exit 1 overall — `pnpm check` 5/5 ✅, `pnpm test` (Vitest) 614/614 ✅, `pnpm test:scripts` 454/454 ✅, `pnpm catalog:lint` ✅ (chain reached the next step), `pnpm catalog:typecheck` ❌, `pnpm template:smoke` not reached by the chain (run separately below)
- **Test count before feature**: 376 tests / 42 files (`test:scripts` at `d373b72`)
- **Test count after feature**: 454 tests / 49 files — **no drop**, +78 tests / +7 files
- **Failures, both root-caused to commits outside this feature's 15-commit range:**
  1. `pnpm catalog:typecheck`: `.catalog-stage/src/main.ts(9,34): error TS2307: Cannot find module './bootstrap.product'`. Root cause: commit `35c8a4f` ("feat(kernel): product bootstrap seam and rawBody in main.ts") added `apps/api/src/bootstrap.product.ts` and an import of it from `main.ts`, but `scripts/platform/lib/child-layout.mjs`'s `KERNEL_STAGE_PATHS` (lines 7-17) was never updated to stage it. `35c8a4f` is not one of this feature's 15 commits; none of the 15 touch `apps/**` or `child-layout.mjs` (`git log --oneline c4ea19e..HEAD -- scripts/platform/lib/child-layout.mjs` empty; `git status --short -- apps/` clean).
  2. `pnpm template:smoke` (run separately, exit 7): checks 1-4 (render, `pnpm check && pnpm test` in child, `db:migrate`, `GET /health`, RULE C) all passed; the added "checagem extra: pnpm platform status/list" failed on `pnpm platform list` — código 2. Root cause: commit `5f89723` ("feat(platform): run the CLI inside the smoke-rendered child") calls `run("pnpm", ["platform", "list"], ...)`, but `list` has only ever been a **subcommand of `module`** (`cli.mjs:56-57`, present since `a92f61a`, 2026-08-19 — well before this feature). Reproduced locally: `pnpm platform list` → `comando desconhecido: list`, exit 2. `5f89723` is not one of this feature's 15 commits.
- **Skipped tests**: none.

**These two failures are not scored against release-marker-commit.**

---

## Fix Plans

### Fix 1: MARK-08 boundary not exercised (surviving mutant M3) — RESOLVED round 2

- **Root cause**: `release-marker.test.mjs` tested `decideRelease`'s "marker changed files" check only at `changedFiles: []` and `changedFiles: ["a.txt","b.txt"]` (2 files); no case at exactly 1 file, so `changedFiles.length > 0` and a mutated `> 1` were indistinguishable to the suite.
- **Fix landed**: `9820444` adds "MARK-08 boundary" (`release-marker.test.mjs:164-172`), `changedFiles: ["a.txt"]` → `action: "fail"`, reason matches `/1 arquivo/`. 24 → 25 tests.
- **Verified independently**: production guard `release-marker.mjs:60` unchanged by `9820444` (not in its diff) and still reads `changedFiles.length > 0` — correct as-is, the gap was test-only. M3 re-injected (`>0`→`>1`) now fails the new test (exit 1, `not ok 17`); restored, `git status --short` clean.
- **Priority**: Minor — closed.

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 25/25 ACs matched spec outcome (4 scored per `design.md`'s corrections).
**Sensor**: 3/3 killed (round 2).
**Gate**: `pnpm check` 5/5, `pnpm test` 614/614, `pnpm test:scripts` 455/455 (round 2: +1 test from `9820444`; no drop from 376 baseline) all green; `catalog:typecheck` and `template:smoke`'s extra check failed in round 1, both root-caused to foreign commits (`35c8a4f`, `5f89723`) outside this feature's range — not this feature's failures, not re-run in round 2 per the Final-gate-once rule.

**What works**: all 25 ACs, both load-bearing conditions the payload flagged (`detect.if` scoping, `marker.if` looseness) are tested and sensor-confirmed; the C2 `version`-without-`v` deviation is coherent end to end; DOC-01/02 confirmed in `STATE.md`; MARK-14 and DOC-03 probes both pass; MARK-08's boundary gap closed by `9820444` with the production guard independently confirmed correct and unchanged.

**Issues found**: none open.

**Next steps**: none for the Verifier. T13 stays blocked on the owner's `v2.3.0` tag, unrelated to this verdict — maps to no AC.
