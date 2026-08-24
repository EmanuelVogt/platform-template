# prettier-format-gate Validation

**Date**: 2026-08-24
**Spec**: `.specs/features/prettier-format-gate/spec.md`
**Diff range**: feature-owned commits only (this checkout is shared with the concurrently-run
`audit-2026-08-23-remediation`; commits are interleaved on `main` — see payload):
`266d2fd`(T1) `a3ebba0`(T2) `abd2caf`(T3) `fa5cf45`(T4) `5ac5fdf`(T5) `16a9e92`(T6) `4088235`(T7)
`06f35fb`(T8) `c9803f8`(T12) `259ac55`(T13) `6d0c6b2`+`edde664`(T9) `a2839ff`(T10) `60a011a`(T11).
Plan-only: `5c4e76d`, `304c3c0`, `cebdb82`, `8c59f63`.
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Fix Round (re-verification, 2026-08-24)

Round-1 baseline stands; only the 3 ranked gaps were re-checked, independently, against these fix
commits (all `scripts/platform/__tests__/` + `scripts/template-smoke.mjs` + one sibling-owned file):

| Commit | Targets | Re-verification |
| --- | --- | --- |
| `8816705` | gap 1 / FMT-07 — new `format-gate.test.mjs`, 3 glob tests + 2 `runTemplateSmoke` tests | Mutant re-run **by the Verifier**, not taken on report: reverted `lefthook-local.yml:24` to `**/*.{ext}`, `node --test format-gate.test.mjs` → `not ok 1 - ...matches a covered extension at the repo root`, `expected: true actual: false` — matches the worker's claimed evidence exactly. Restored, `git status --short` clean, re-run green (5/5) |
| `2fa2977` | gap 2 / FMT-03 — real `checkFormatCheck` in `template-smoke.mjs` | Claim verified: `installChild` (`scripts/platform/lib/child.mjs:58-60`) is `run("pnpm", ["install"], { cwd })` — not a stub — and runs at `template-smoke.mjs:458-459`, before `checkFormatCheck` at `:474-475`. Confirmed with a real `pnpm template:smoke` run: the child's `pnpm format:check` step logged and passed silently (no failure line); overall exit 7 is the same pre-existing, out-of-scope `checkPlatformCli` issue as round 1 (commit `5f89723`, not in this feature's range) |
| `fd6b41e` | gap 3 / FMT-05 — 2 new tests in `prettier-config.test.mjs` | Baseline green (4/4). Verifier's own fresh mutant (not the worker's): dropped `.specs/` from `.prettierignore` → `not ok 4 - .prettierignore lists the paths FMT-05 requires excluded`. Restored, clean, re-run green |
| `583c758` | disclosed fix-up — stray NUL byte in `format-gate.test.mjs` | Confirmed 0 NUL bytes now (`python3` byte count), file size matches commit stat (4771 bytes); the gap-1 mutant re-run above already exercised this exact file state |
| `36f1f9f` | sibling fix — `catalog:typecheck` | `src/bootstrap.product.ts` added to `KERNEL_STAGE_PATHS` (`scripts/platform/lib/child-layout.mjs:13`), confirmed by diff read; Final gate re-run (below) confirms `catalog:typecheck` green |

All three ranked gaps from round 1 are **closed**. Final gate re-run whole (`catalog:typecheck` no
longer contaminated) — see Gate Check below. Everything judged in round 1 and not flagged (accepted
wave-3 regex deviation, T11 `harness.md` non-delivery) stands unchanged; not re-litigated.

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 | ✅ Done | `.prettierrc:1-8` — no `plugins`/`tailwindStylesheet`/`tailwindFunctions`, other keys intact (`266d2fd`) |
| T2 | ✅ Done | `.vscode/settings.json` — no `tailwindCSS.*` key remains (grep, 0 hits) (`a3ebba0`) |
| T3 | ✅ Done | `catalog/notification/api/infrastructure/mailer/email-theme.ts:1-4` names no dead path; advisory trailer present (`abd2caf`) |
| T4 | ✅ Done | `package.json:11` glob + `.prettierignore` widened per Done-when (`fa5cf45`) |
| T5 | ✅ Done | `scripts/platform/__tests__/prettier-config.test.mjs:27-38` — independently re-verified with a mutant (killed) (`5ac5fdf`) |
| T6 | ✅ Done | `prettier-plugin-tailwindcss` absent from `package.json`/lockfile (`16a9e92`) |
| T7 | ✅ Done | 206 files reformatted outside `catalog/**`; one accepted regex-widening deviation on a pre-existing test, independently re-verified (see Fix Plans note) (`4088235`) |
| T8 | ✅ Done | 341 catalog files reformatted; `Advisory: none — mechanical formatting, no behaviour change` trailer confirmed with the correct em dash (U+2014) via hexdump (`06f35fb`) |
| T12 | ✅ Done | 5 manifests `2.0.0`→`2.0.1` + 5 `## [2.0.1]` headings, all confirmed by direct read (`c9803f8`) |
| T13 | ✅ Done | `.prettierignore` gains `.claude/settings.local.json` (confirmed present) (`259ac55`) |
| T9 | ✅ Done | `lefthook-local.yml:19-25` — format-and-restage job wired; **no automated test covers it** (see Discrimination Sensor mutant 3) (`6d0c6b2`+`edde664`) |
| T10 | ✅ Done | `.github/workflows/format.yml` (template-only) + `copier.yml:43` exclude + both-direction `copier-delivery.test.mjs` test + `template-smoke.mjs` path-check, all confirmed by direct read (`a2839ff`) |
| T11 | ✅ Done | `docs/dev/template-changelog.md:30-37` item 7 inside existing `## v2.3.0`; `docs/agents/harness.md` deliberately untouched — independently confirmed correct (its own "Off-pattern" section at `docs/agents/harness.md:204-206` scopes the file to Claude-Code-only mechanisms, and "Repo hooks" at `:211` only documents `.claude/hooks/*.mjs`, never lefthook) (`60a011a`) |

---

## Spec-Anchored Acceptance Criteria

### P1: Prettier runs again

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| FMT-01: `pnpm format:check` exits without plugin-load/ENOENT | exit 0, no ENOENT/plugin error | own run, `format-check.log`: `exit=0` — `"All matched files use Prettier code style!"`; `.prettierrc:1-8` has no `plugins` key | ✅ PASS |
| FMT-02: `.prettierrc` path SHALL exist, asserted by committed test | `fs.existsSync` true for every path-like value | `scripts/platform/__tests__/prettier-config.test.mjs:33-36` — `assert.ok(fs.existsSync(path.join(ROOT, value)), ...)`; independently confirmed with a mutant (killed, see Sensor) | ✅ PASS |
| FMT-03: generated product's `pnpm format:check` SHALL exit 0 | the AC names the literal command's exit code in the child | **Round 2**: `scripts/template-smoke.mjs:108-118` (`checkFormatCheck`) now runs `run("pnpm", ["format:check"], { cwd: childDir })` for real, called at `:474-475` — **after** `installChildFn` (`installChild`, `scripts/platform/lib/child.mjs:58-60` = literal `pnpm install`) runs at `:458-459`. Confirmed with a real `pnpm template:smoke` run: the child's format:check step logs and passes silently. `scripts/platform/__tests__/format-gate.test.mjs:92-132` also asserts the call shape (`call.args[0] === "format:check"`, `call.options.cwd === childDir`) and the failure path (`:134-146`) | ✅ PASS |

### P1: The tree is formatted

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| FMT-04: `format:check` reports zero differing files | 0 diffs after reformat | own run, `format-check.log`: `exit=0` — `"All matched files use Prettier code style!"` | ✅ PASS |
| FMT-05: checked set covers `ts,tsx,mts,mjs,js,json,yml,css`, excludes `*.jinja`, `docs/platform_template/`, generated trees | declared proof: `test` | **Round 2**: `scripts/platform/__tests__/prettier-config.test.mjs:63-83` asserts extension membership as a class on `package.json`'s `format:check` brace group (each of `ts,tsx,mts,mjs,cjs,js,jsx,json,yml,yaml,css` present, `md` absent); `:85-99` asserts exact-line membership for `.prettierignore` (`*.jinja`, `docs/platform_template/`, `packages/api-client/generated/`, `openapi.json`, `.worktrees/`, `.specs/`, `.claude/settings.local.json`). Verifier's own mutant (dropped `.specs/` from `.prettierignore`) killed at `:21` (`not ok 4`), restored | ✅ PASS |
| FMT-06: `catalog/**` reformat commit satisfies `advisory-required` without inventing an advisory | hook accepts the trailer | `git log -1 06f35fb`/`c9803f8`: `Advisory: none — mechanical formatting, no behaviour change`, em dash (U+2014) confirmed via `hexdump`; `pnpm catalog:lint` exit 0 (Final gate) | ✅ PASS |

### P2: It cannot rot again

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| FMT-07: pre-commit hook fails or fixes an unformatted staged file | job wired, glob correct | **Round 2**: `scripts/platform/__tests__/format-gate.test.mjs:68-90` — 3 tests parse `lefthook-local.yml`'s format job glob (`readFormatJobGlob`, `:61-66`) and assert it matches a root-level covered file (`package.json`), a nested one (`apps/api/src/main.ts`), and excludes an uncovered extension (`README.md`), via a real brace/glob-to-regexp expansion (`:33-59`) that mirrors gobwas/glob's `**/`-needs-a-segment semantics. Verifier re-ran the exact mutant (reverted `lefthook-local.yml:24` to `**/*.{ext}`): `not ok 1 - ...matches a covered extension at the repo root`, `expected: true actual: false` — killed. Restored, clean, re-run green (5/5) | ✅ PASS |
| FMT-08: CI runs a format check on `main`/PRs, fails on unformatted file | workflow wired correctly | `.github/workflows/format.yml:1-27` — `on: push: branches:[main]` + `pull_request`, `run: pnpm format:check`; `copier-delivery.test.mjs:31-36` confirms it stays template-only (killed by mutant 2) | ✅ PASS (structural; matches the Test Coverage Matrix's declared "gate only" design) |
| FMT-09: generated product's pipeline SHALL NOT fail on formatting the template didn't ship | `ci.yml` (which ships) never runs `format:check`; `format.yml` excluded | `copier.yml:43` (`- .github/workflows/format.yml` in `_exclude`); `.github/workflows/ci.yml` has zero `format` references (`grep`, confirmed no commit in this feature's range touches it); `copier-delivery.test.mjs:38-55` (`ci.yml` ships, unchanged) — killed by mutant 2; recorded at `docs/dev/template-changelog.md:30-37` | ✅ PASS |

**Status (round 2)**: ✅ All ACs covered — all 3 round-1 gaps closed and independently re-verified

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `.prettierrc:8` | Re-added `"tailwindStylesheet": "packages/ui/src/styles/globals.css"` (the historical defect) | ✅ Killed — `node --test prettier-config.test.mjs` fails at `:33`, `AssertionError` |
| 2 | `copier.yml:43` | Removed `.github/workflows/format.yml` from `_exclude` | ✅ Killed — `node --test copier-delivery.test.mjs`: `not ok 2 - format.yml is excluded...` |
| 3 | `lefthook-local.yml:24` | Reverted glob `{*,**/*}.{ext}` → `**/*.{ext}` (the historical root-glob defect, fixed in wave 5) | ❌ **Round 1**: Survived — `pnpm test:scripts` 454/454 pass, `gates.test.mjs` 16/16 pass; no test referenced the `format` job. ✅ **Round 2 (same mutant, re-run by the Verifier)**: `format-gate.test.mjs:68-74` now catches it — `not ok 1 - lefthook's format job glob matches a covered extension at the repo root`, `expected: true actual: false`. Restored, clean, re-run green (5/5) |
| 4 (round 2) | `.prettierignore` | Dropped `.specs/` (FMT-05 fresh mutant, Verifier's own) | ✅ Killed — `prettier-config.test.mjs:21`, `not ok 4 - .prettierignore lists the paths FMT-05 requires excluded` |

**Sensor depth**: default (3 round 1 + 1 re-run + 1 fresh in round 2)
**Result**: round 1 2/3 killed → round 2 4/4 killed (mutant 3 re-run now kills; 1 new mutant confirms FMT-05) — ✅ PASS

All mutations restored; `git status --short` clean on all three files before and after.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ |
| Matches patterns | ✅ (`node:test` style reused from `copier-answers-leak.test.mjs`; `copier-delivery.test.mjs` reuses that file's parse-and-assert shape) |
| Spec-anchored outcome check (asserted values match spec) | ✅ round 2 — FMT-03/FMT-05 closed, see table above |
| Per-layer Coverage Expectation met | ✅ round 2 — FMT-07 now has a dedicated `format-gate.test.mjs`; the hole the sensor found in round 1 is closed |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed | none — config/tooling feature, strong defaults applied |

---

## Edge Cases

- [x] `*.jinja` skipped — `.prettierignore:11`
- [x] `pnpm-lock.yaml`/`packages/api-client/generated/**` ignored — `.prettierignore:5,10`
- [x] `copier update` onto the fixed `.prettierrc` needs no manual step — `docs/dev/template-changelog.md:41` (`None — copier update is enough.`)
- [x] Reformat never touched a `.claude/hooks` tripwire-guarded file — `git show 4088235 --stat` has zero `.md`/`CLAUDE.md`/`AGENTS.md`/`docs/` handbook entries (only `.mjs` hook *source*, which is in-glob and expected)

---

## Gate Check

- **Gate command**: `pnpm check && pnpm test && pnpm test:scripts && pnpm catalog:lint && pnpm catalog:typecheck && pnpm format:check`
- **Round 1 (via `shell-runner`)**: chain exit 1, halted at `pnpm catalog:typecheck` — root-caused to sibling commit `35c8a4f` (missing `KERNEL_STAGE_PATHS` entry), not this feature. `pnpm format:check` run independently: PASS, exit 0
- **Round 2 (via `shell-runner`, whole chain, after sibling fix `36f1f9f`)**: **exit 0, all 6 sub-commands PASS**
  - `pnpm check`: PASS — `Tasks: 5 successful, 5 total`
  - `pnpm test`: PASS — `Test Files 90 passed (90)`, `Tests 614 passed (614)`
  - `pnpm test:scripts`: PASS — `# tests 462`, `# pass 462`, `# fail 0`
  - `pnpm catalog:lint`: PASS — `5 entrada(s): tag, notification, identity, audit, attachment`
  - `pnpm catalog:typecheck`: PASS — same 5 entries, no missing-module error (confirms `36f1f9f`'s fix)
  - `pnpm format:check`: PASS — `"All matched files use Prettier code style!"`
- **Test count before/after**: not a usable signal in this shared checkout — sibling added tests mid-flight (per payload); 454→462 in `test:scripts` between rounds (this feature's own 8 new tests), 614/614 unchanged in `test`; exit 0 + zero failures is the only read
- **Skipped tests**: none
- **Failures**: none (round 2)

---

## Fix Plans

All 3 round-1 fix plans are **resolved** as of round 2 — kept here for the audit trail, not as open work.

### Fix 1 (resolved): FMT-07 had zero automated regression coverage

- **Was**: `lefthook-local.yml`'s `format` pre-commit job glob had no test; a revert to the historical root-glob defect passed the full suite silently.
- **Resolved by**: `8816705` — `scripts/platform/__tests__/format-gate.test.mjs`. Verifier independently re-ran the exact mutant against the new test: killed.

### Fix 2 (resolved): FMT-03's proof was weaker than the AC text

- **Was**: `template-smoke.mjs` only checked `.prettierrc` path existence in the child, never ran `pnpm format:check` there.
- **Resolved by**: `2fa2977` — `checkFormatCheck` now runs the literal command after `installChildFn`. Verifier confirmed `installChild` is a real `pnpm install` (not a stub) and reproduced the pass with a live `pnpm template:smoke` run.

### Fix 3 (resolved): FMT-05 had no committed test

- **Was**: declared `test` proof for the checked-set glob / `.prettierignore` exclusions did not exist.
- **Resolved by**: `fd6b41e` — two new tests in `prettier-config.test.mjs` asserting extension membership as a class and exact-line membership. Verifier's own fresh mutant on `.prettierignore` killed.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| FMT-01 | In Tasks | ✅ Verified |
| FMT-02 | In Tasks | ✅ Verified |
| FMT-03 | In Tasks | ✅ Verified (round 2) |
| FMT-04 | In Tasks | ✅ Verified |
| FMT-05 | In Tasks | ✅ Verified (round 2) |
| FMT-06 | In Tasks | ✅ Verified |
| FMT-07 | In Tasks | ✅ Verified (round 2) |
| FMT-08 | In Tasks | ✅ Verified |
| FMT-09 | In Tasks | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 9/9 ACs matched spec outcome, 0 spec-precision gaps, 0 uncovered ACs
**Sensor**: round 1 2/3 killed → round 2 4/4 killed (mutant 3 re-run now kills; +1 fresh mutant on FMT-05)
**Gate**: 6/6 sub-gates PASS, whole chain, exit 0 (`check` 5/5, `test` 614/614, `test:scripts` 462/462, `catalog:lint` 0 findings, `catalog:typecheck` 0 findings — sibling's `36f1f9f` cleared the round-1 contamination, `format:check` 0 diffs)

**What works**: the Tailwind ghost is fully purged (T1-T3, T6), the whole tree + catalog reformat is clean, the `.prettierrc` path-existence guard is real (T5), the copier delivery boundary is real and bidirectionally tested (T10), the pre-commit format gate now has a dedicated regression test that independently caught the historical root-glob defect on re-run (T9 + `format-gate.test.mjs`), the child-side proof runs the literal `pnpm format:check` after a real `pnpm install` (T10 + `checkFormatCheck`), and the checked-set glob/`.prettierignore` AC now has class-level assertions (T4 + `prettier-config.test.mjs`). T11's deliberate non-delivery of `docs/agents/harness.md` was independently re-verified as correct and stands unchanged.

**Issues found**: none open. All 3 round-1 gaps (FMT-07, FMT-03, FMT-05) closed and independently re-verified by the Verifier with fresh mutation/execution evidence, not taken on the fix report.

**Next steps**: none — feature ready to close out.
