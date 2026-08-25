# Test Suite Refactor Validation — round 4 (final)

**Date**: 2026-08-25
**Spec**: `.specs/features/test-suite-refactor/spec.md`
**Diff range**: `d1ba876^..85561fd`
**Checkout**: isolated worktree `tsr-verify`, HEAD `85561fd`, unmoved across the gate
**Verifier**: independent sub-agent (author ≠ verifier)
**Verdict**: ✅ **PASS** — with one requirement carried as **owner-blocked**, not defective.

**Nothing new or substantial was found this round. All remaining items are residual.** A fifth
round is not warranted.

---

## The round-3 defect is fixed — verified by re-seeding my own mutant

Round 3 failed on one Major defect: 17 assertions converted to `not.toThrow(<matcher>)`, which
Vitest passes when a *different* error is thrown, sanctioned by LNT-02 AC2's exemption. I re-ran the
**exact seed** that survived in round 3.

| | Round 3 | Round 4 |
| --- | --- | --- |
| Seed: `TypeError` on the **valid path** of `assertValidPermissionSet` | `access-policy.spec.ts` 27 tests, **8 failed — all `resolveUserAccess`**. The four `not.toThrow(InvalidPermissionSetError)` accept-case assertions **passed** | 27 tests, **14 failed**, now including **`aceita set vazio`** and **`aceita set com cadeia completa`** |

The two assertions whose entire job is "a valid set is accepted" now fail when the function throws
on every valid set. **The mutant that survived is dead.** Confirmed independently, not taken from
the report.

### The repair pattern, tested in both directions

`0113b0e` pairs an argument-less `not.toThrow()` (fails on *any* throw) with a **discriminating
negative** — a minimal variation of the same input that must be refused. I mutated a second,
independent function to test the other half:

| Mutant | Target | Which half should catch it | Result |
| --- | --- | --- | --- |
| **A** — wrong error on the valid path | `assertValidPermissionSet` | the argument-less `not.toThrow()` | ✅ **Killed** — `aceita set vazio`, `aceita set com cadeia completa` |
| **B** — no-op: `assertProfileFloor` never refuses | `assertProfileFloor` | the discriminating `.toThrow(InvalidPermissionSetError)` | ✅ **Killed** — `master é isento (set vazio passa)`, `admin exige ≥1 chave do módulo admin`, `perfil com permissionFloor true exige chave do módulo homônimo`, `professional é isento` |

A no-op would have left the old `not.toThrow(X)`-only tests green; the discriminating half is what
catches it. Both directions of the pattern hold. (Both mutants were injected in one run because they
sit in independent functions with disjoint assertions — attribution by test name is unambiguous, as
the table shows. Disclosed for the record.)

---

## My read on the rule semantics (`784d1af`) — **correct choice**

`not.toThrow(<matcher>)` now counts as an existence-only assertion: reportable when it is the body's
**sole** assertion, never reportable outright. I probed the built rule directly via
`eslint --stdin` rather than reading the RuleTester:

| body | expected | actual |
| --- | --- | --- |
| only `not.toThrow(X)` | report | ✅ **REPORTED** — the escape hatch is closed |
| only `not.toThrow()` | report | ✅ REPORTED |
| only `resolves.not.toThrow(X)` | report | ✅ REPORTED |
| `not.toThrow(X)` **+ concrete value** | silent | ✅ not reported |
| `not.toThrow()` + `toThrow(msg)` (the repair pattern) | silent | ✅ not reported |
| `not.toThrow(X)` + `expect.assertions(1)` | silent | ✅ not reported |
| control: only `toBeDefined` | report | ✅ REPORTED |
| control: concrete value only | silent | ✅ not reported |

Judging the **body** rather than the assertion is the right granularity. An outright ban would have
destroyed a legitimate pattern — asserting that a specific error is *not* raised while proving what
*is* produced is real proof, and it survives. An exemption was the bug, because it made the weaker
form the sanctioned way to satisfy the rule. Reporting-when-sole removes the escape hatch without
touching the legitimate case. The error message now names the trap and prescribes the fix, which is
what stops the pattern recurring. `expect.assertions(n)` and the value-alongside exemptions are
untouched, as claimed.

## Claims audited, not accepted

- **"Zero call sites outside the 17 reddened; nothing entered the GA-9 baseline"** — ✅ true:
  `git diff 6fdf5fb..HEAD -- harness-hygiene-baseline.json` is **empty**. The narrowing bought no
  suppressions.
- **"No test removed"** — ✅ true: `it` counts unchanged on all four repaired specs (27→27, 5→5,
  5→5, 14→14); stage 8 confirms `338 arquivos, 2216 testes`, no drop.
- **`079d7d6` / `85561fd`** — ✅ spec.md AC2, its edge case, T32's Done-when and `docs/test/testing.md`
  all now describe the rule as built, and each records that the exemption was backwards and how the
  loss was proved. Corrections, not deletions.

---

## Final Gate

| # | Stage | Exit | Note |
| --- | --- | --- | --- |
| 1 | `pnpm check` | **0** | 7/7 turbo; 4 `react-refresh` warnings, 0 errors |
| 2 | `pnpm test:coverage` | **0** | 122 files / 881 tests; coverage **96.51 / 94.42 / 94.93 / 96.81**, above every 90 floor |
| 3 | `pnpm contract` | **1** | ⚠️ **environmental** — env validation; no `.env` anywhere in the worktree (`.env*` is gitignored) |
| 4 | `git diff --exit-code openapi.json` | **0** | ⚠️ **vacuous** — stage 3 never regenerated it |
| 5 | `pnpm catalog:check` | **0** | first attempt, no retry needed; 241/1718 unit + 71/512 db. **The `auth-anti-enum` flake did not reappear.** |
| 6 | `pnpm template:smoke` | **0** | all four checks green |
| 7 | `pnpm test:scripts` | **0** | 643 pass / 0 fail |
| 8 | `it-count --check` | **0** | `sem queda: 338 arquivos, 2216 testes` |

**The only failing stage is environmental.** No code defect remains in the gate.

## Discrimination Sensor

| # | Mutation / probe | Gate | Killed? |
| --- | --- | --- | --- |
| 1 | Wrong error on the valid path of `assertValidPermissionSet` (round-3 survivor, re-seeded) | `pnpm catalog:check` | ✅ **Killed** |
| 2 | `assertProfileFloor` made a no-op | `pnpm catalog:check` | ✅ **Killed** |
| 3 | Narrowed rule, 8 bodies, both directions | `eslint --stdin` | ✅ All 8 correct |

**Result: 3/3 — ✅.** Cumulatively across rounds 2–4: 9 mutations injected, 8 killed, 1 survived and
has now been re-seeded and killed.

---

## Acceptance Criteria — final

| Requirement | Status |
| --- | --- |
| HRN-01…06, ENT-01…05, UNT-01…04, LNT-01, STR-04, WEB-01, CI-02, DOC-01 | ✅ Verified |
| **LNT-02** | ✅ **Verified** — rule narrowed, spec/edge-case/Done-when/docs corrected, mutation-proven in both directions |
| **CI-01** | ⏸️ **OWNER-BLOCKED — no defect to fix** |

**21/22 verified · 1 owner-blocked · 0 defects outstanding.**

### CI-01 and T37's last Done-when — the one thing still open

Both need the workflow to run green on a **pushed** branch with the run URL in the commit body.
Nothing is pushed, and no owner authorization to push exists. **This Verifier pushed nothing.**

This is an authorization gap, not a broken thing: the four jobs are declared, and the substantive
one — `test-coverage` — passes locally with coverage above every floor. But it is **unproven**, and
it should not be marked verified until someone pushes. It is the single item the owner must close.

---

## Residual items — none blocking

1. **`pnpm contract` needs a `.env`** (Minor). Fails on env validation in any fresh checkout, and it
   makes stage 4's `git diff --exit-code openapi.json` vacuous — the diff is clean because nothing
   was regenerated. Give `contract` test defaults (as `int-env.ts` does), or document the
   prerequisite in the `final` Gate Check Commands row.
2. **`auth-anti-enum` e2e flake** (Minor). Failed once in round 3 with `Parse Error: Expected
   HTTP/…` under a deliberate rate-limit burst; passed on re-run then, and did not appear at all in
   round 4. File untouched by this feature. Worth a keep-alive/agent fix so it stops reddening
   `catalog:check` at random.
3. **Pin `SCAN_ROOTS`** (Cosmetic). `isObservable` infers "installed" from what the run scanned.
   Safe today because `SCAN_ROOTS` is a fixed module-level constant; add a note or assertion so a
   future parameterised root cannot silently narrow the stale check.

---

## Summary

**Overall**: ✅ Ready, pending the owner-blocked CI-01

**Spec-anchored check**: 21/22 verified · 1 owner-blocked · 0 defects
**Sensor**: 3/3 killed this round (9 injected / 8 killed / 1 re-seeded and killed, cumulative)
**Gate**: 7/8 green; the one failure is environmental

**What closed across four rounds**: an environmental blocker (a checkout three sessions were writing
to), then three child-facing blockers (a lint rule that reddened every child's `pnpm check`, a RULE D
spec that failed in every child, a `test:coverage` collision that hid coverage entirely), a twin
RULE D implementation with no parity, a hygiene baseline that was template-shaped in every child,
and finally a proof regression at 17 assertion sites *and* the spec exemption that sanctioned it.
Every one was verified by mutation or by direct measurement, not by report.

**Why PASS now**: the defect I named in round 3 is fixed at the root, not papered over — the rule
that permitted it was narrowed, the spec that documented it was corrected, and my own surviving
mutant is dead. No test was removed at any point (2216 tests, no drop). The remaining gate failure
is a missing `.env`, and the remaining requirement needs a push nobody has authorized.

**Next step**: the owner pushes the branch and records the run URL to close CI-01. Residual items
1–3 are independent and minor. **No code or test was modified by this Verifier, and nothing was
pushed.**
