# Handoff archive — `prettier-format-gate`

Moved out of `.specs/STATE.md` § Handoff at closeout (2026-08-24). The Handoff carries open work
only; this is the closed record.

## Closeout precondition — satisfied

The Handoff entry below ends with *"Closeout (move to `.specs/features/done/`) is deliberately NOT
done — it waits on the tag."* **That precondition is met:** `v2.3.0` was cut, tagged and Released on
2026-08-24 (marker `6c44937`, annotated tag object `73ea22c`, run `32758942152` success on all 8
jobs), and the divergence the entry names is reconciled — `main` is now merely a few commits ahead
of `origin/main`, not 108-vs-40. Closeout executed on that basis.

## Outcome

**DONE 2026-08-24, Verifier PASS round 2** — 9/9 ACs matched the spec outcome, 0 spec-precision
gaps, 0 uncovered ACs; mutation sensor round 1 2/3 killed → round 2 4/4 killed. `validation.md`
closes with *"Issues found: none open"* and *"Next steps: none — feature ready to close out"*.

Final gate exit 0, whole chain: `check` 5/5 · `test` 614/614 · `test:scripts` 462/462 ·
`catalog:lint` 0 findings · `catalog:typecheck` 0 findings · `format:check` 0 diffs.

## Handoff entry, verbatim

- Feature `prettier-format-gate` — **DONE (2026-08-24). Verifier PASS round 2, 9/9 ACs, sensor 4/4 killed.** Artifacts at `.specs/features/prettier-format-gate/{spec,tasks,validation}.md`. 16 commits on `main`, `266d2fd`..`4a69739`, **not pushed**. Final gate exit 0: `check` 5/5 - `test` 614/614 - `test:scripts` 462/462 - `catalog:lint` 0 - `catalog:typecheck` 0 - `format:check` 0 diffs. **Owner lifted the `v2.3.0` tag gate on 2026-08-23**: the feature ships *inside* `v2.3.0`, not behind it, after being shown the cost. Consequence: T12 bumped the five entries to `2.0.1` (`catalog/{attachment,audit,notification,tag}/module.json` + `catalog/identity/single-tenant/module.json`, each with a `## [2.0.1]` CHANGELOG heading) because the reformat trips `entryChangedWithoutBump` (`release-preflight.mjs:47-55`); every child will see five modules "behind" for a cosmetic change. T11 wrote **item 7 inside the existing `## v2.3.0` section** — never a new heading, or `release-preflight` (`:72-75`, keys on the latest section) would make `v2.3.0` untaggable. Three tasks were added during Execute, all from defects the plan did not foresee: **T12** (the bumps), **T13** (`.claude/settings.local.json` into `.prettierignore` — untracked, ignored only by the user's *global* gitignore, which prettier never reads, so `format:check` was red locally and green in CI), and **T14/T15/T16** (the Verifier's three missing proofs). **Two lessons of the same family, both grounded:** a gate's behaviour is confirmed by running the shipped command, never by reconstructing its input set (T7's worker called `settings.local.json` "correctly excluded" because it built its list from `git ls-files`; the shipped `format:check` uses a glob); and lefthook's `**/*` does **not** match repo-root files while prettier's does — the hook was armed with a hole and only mutation revealed it (`format-gate.test.mjs` now guards it). L-028/029/030. **Executed concurrently with `audit-2026-08-23-remediation` in the same checkout** — serialized by owner ruling, this feature first; that feature's RUN-04 is now genuinely `satisfied-by-sibling`. Its `35c8a4f` broke `catalog:typecheck` mid-verification and was repaired there at `36f1f9f`. **REMAINING, OWNER-ONLY (AD-006/AD-034 — the agent never tags and never pushes): `main` and `origin/main` have DIVERGED — 108 local commits vs 40 remote, neither side shared. `git push origin main` will be refused.** That must be reconciled before the `release` workflow can see any of this; only then can `v2.3.0` be dispatched. Closeout (move to `.specs/features/done/`) is deliberately NOT done — it waits on the tag.

## Live references left pointing at the pre-move path

Per the archive convention (an archived feature's own artifacts keep their original paths — see
`done/vitest-migration/validation.md:4`), nothing was rewritten. Three references from the
**in-flight** `audit-2026-08-23-remediation` still name `.specs/features/prettier-format-gate/`:
`design.md:160`, `design.md:341`, `tasks.md:55`. All three concern RUN-04, whose delegation is
already recorded as `satisfied-by-sibling`; read them at
`.specs/features/done/prettier-format-gate/`.
