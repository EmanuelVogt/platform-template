# API coverage to 90 — Spec

**Scope**: Medium · Design skipped (no architectural decision; the shape is "write the missing
tests, correct two denominator entries") · Tasks formal (10 tasks).

## Problem

`vitest.coverage.mts` declares a flat 90 on every metric, globally and per glob (AD-027). The
`apps/api/src/**` glob does not clear it, so `pre-push` and the CI coverage job are red and every
push is blocked.

Measured 2026-08-22 (`pnpm test:coverage`, `coverage/coverage-summary.json`):

| metric | covered/total | % | short of 90 |
| --- | --- | --- | --- |
| statements | 884/1008 | 87.70 | 24 |
| branches | 354/477 | 74.21 | 76 |
| functions | 273/299 | 91.30 | clears |
| lines | 849/960 | 88.44 | 15 |

123 branches are uncovered across 34 files. Branches are the binding metric; statements and lines
follow from the same tests.

## Goal

`pnpm test:coverage` exits 0 with no threshold ERROR, and `pnpm test` stays green.

## Non-goals

- Lowering any floor, for any metric, global or per glob.
- Any `v8`/`istanbul` ignore pragma.
- Deleting or weakening an existing test.
- Touching `catalog/**` or `.worktrees/**` (the `security-audit-remediation` worktree is in flight
  in another session).
- Covering `apps/web/src/**` — it already clears the bar (94.78 / 94.51 / 95.56 / 96.58).

## Denominator decisions (settled before any test was written)

Two files sit in the denominator that do not belong there. Correcting a denominator is not
lowering a floor: the floor stays at 90 on every metric.

**D-1 — `apps/api/src/openapi/export-openapi.ts` is excluded.** 0/10 statements, 0/2 branches,
0/2 functions, 0/10 lines. It is a CLI entry point that writes `openapi.json` to disk — the same
nature as `apps/api/src/db/**`, already excluded as "CLI scripts", and as `apps/api/src/main.ts`,
excluded as "process bootstrap". The reference tree excludes this exact path
(`~/Developer/ailapidus/vitest.coverage.mts`: `"apps/api/src/openapi/export-openapi.ts"`). The
document it exports is `buildOpenApiDocument`, which stays in the denominator and is covered by
this feature (T3) — the script is the `process.argv`/`writeFileSync` wrapper around it.

**D-2 — `apps/api/src/shared/config/coverage-metric/*.sample.ts` is excluded.** These two files
are fixtures for the coverage-metric contract, not product code:
`coverage-metric.contract.spec.ts:80-97` spawns a nested `vitest run --coverage` scoped to each
sample and asserts what the v8 provider reports (COV-05: optional chaining leaves
`branches.uncovered === 0`; COV-06: an if/else exercised on the true path only leaves
`branches.uncovered > 0`). `if-else.sample.ts` is **required to stay uncovered** in the outer run
— its own spec (`if-else.sample.uncovered.spec.ts`) is gated behind `COVERAGE_METRIC_FIXTURE=1`
precisely so the outer suite never executes it. A file whose contract is "be uncovered" cannot
also be coverage debt. Both samples are excluded, not only the uncovered one: cherry-picking the
red half of a fixture pair is the denominator equivalent of lowering a floor.
`coverage-metric.contract.spec.ts` itself is already excluded as a spec.

Combined effect on the denominator: −13 statements, −4 branches, −3 functions, −13 lines, of
which all but `optional-chain.sample.ts` were uncovered. Remaining gap to close by testing:
**+72 branches, +12 statements, +4 lines**.

## Where the branches are

The four largest files carry 72 of the 72 branches still needed; the next six carry 28 more. This
feature covers all ten, so the result lands with margin rather than on the threshold.

| file (under `apps/api/src/`) | br unc | st unc | ln unc | layer | existing spec |
| --- | --- | --- | --- | --- | --- |
| `shared/kernel/idempotency/idempotency.interceptor.ts` | 30 | 21 | 21 | unit | yes |
| `openapi/openapi-config.ts` | 22 | 34 | 28 | unit | none |
| `shared/kernel/errors/problem-details.filter.ts` | 12 | 7 | 7 | unit | yes |
| `shared/kernel/logging/log.interceptor.ts` | 8 | 2 | 2 | unit | yes |
| `shared/kernel/scheduling/weekly-slot.ts` | 6 | 4 | 0 | unit | yes |
| `shared/kernel/transactional/transaction-manager.ts` | 5 | 2 | 2 | int | int only |
| `shared/kernel/logging/logger.factory.ts` | 5 | 1 | 1 | unit | none |
| `shared/kernel/listing/list-query.decorator.ts` | 4 | 6 | 5 | unit | none |
| `shared/infra/database/managed-dedicated-client.ts` | 4 | 3 | 2 | worker's call | none |
| `shared/kernel/context/request-context.middleware.ts` | 4 | 1 | 1 | unit | yes |

## Acceptance criteria

| ID | Criterion | Proof |
| --- | --- | --- |
| COV-01 | `pnpm test:coverage` exits 0 and prints no `ERROR: Coverage for <metric> … does not meet … threshold` line, for the global thresholds and for both globs. | gate |
| COV-02 | `pnpm test` exits 0 — the Docker-free unit loop stays green. | gate |
| COV-03 | Every floor in `vitest.coverage.mts` is still `90` for statements, branches, functions and lines — global, `apps/api/src/**` and `apps/web/src/**`. | probe (every numeric value in the `thresholds` block is `90`; no metric key removed, no glob key removed) |
| COV-04 | No `c8 ignore`, `v8 ignore`, `istanbul ignore` or `node:coverage` pragma anywhere under `apps/api/src/**`. | probe (`rg -n 'c8 ignore\|v8 ignore\|istanbul ignore' apps/api/src` returns nothing) |
| COV-05 | `vitest.coverage.mts` excludes `apps/api/src/openapi/export-openapi.ts` and `apps/api/src/shared/config/coverage-metric/*.sample.ts`, each with a comment naming the reason, and the exclusion table in `docs/test/testing.md` lists both rows. | test-adjacent probe (file content) |
| COV-06 | The coverage-metric contract still passes: both `it`s in `coverage-metric.contract.spec.ts` are green after D-2. | test |
| COV-07 | Every new test asserts an observable outcome or the error class **and** message — no `toBeDefined`, no "the field exists", no "did not throw" as the sole assertion (L-007, `docs/test/testing.md` § What counts as proof). | probe (Verifier reads the diff's assertions) |
| COV-08 | A branch that no input can reach is removed by restructuring the production code, never left uncovered and never ignored. Where that happens the commit body names the branch and why it was unreachable. | probe (commit bodies) |
| COV-09 | No file under `catalog/**` or `.worktrees/**` is modified. | probe (`git diff --name-only` on the feature range) |
| COV-10 | A file that issues SQL is covered by an `*.int-spec.ts` against the testcontainer, never by a mocked database (`docs/test/testing.md` § The api's three layers). | probe (Verifier reads the new specs' imports) |

### COV-03 amendment (wave 3)

COV-03 first read "`git diff` on the `thresholds` block is empty". That probe tested the wrong
thing. The invariant is **no floor is lowered**; an empty diff is a proxy that also freezes the
block's comments. T10 measured the api at 95–97 % on all four metrics, which makes the comment
sitting inside that block (`vitest.coverage.mts:53-55`, "a api ainda não alcança a barra (branches
74.21 %) … o pre-push fica vermelho de propósito") false. A probe that forces a document to keep
a false statement is a bad probe, so the criterion now asserts the numbers, not the diff, and the
stale comment is retired in F2. The four `90`s and both glob keys are unchanged and stay unchanged.

## Constraints carried from the project

- AD-027 — the floors are a flat 90 and are never lowered to pass.
- AD-028 — Vitest root `projects` is the only runner; `globals: false`, every spec imports from
  `vitest`; api specs use relative imports, never `@/`.
- AD-023 — anything a spec imports lives in `apps/api/src/shared/test/{unit,int,e2e,…}`; a test
  file may not define a local copy of a harness helper.
- `docs/test/testing.md` — pt-BR in `describe`/`it`, identifiers in English; test next to the file
  under test; no database mock in the integration or e2e layer.
- Lint (`@vitest/eslint-plugin`): no `.only`, no `.skip`, no assertion-less test, no duplicate
  title, `max-nested-callbacks: 4`.

## Relationship to `test-suite-refactor`

`test-suite-refactor` T39/C10 owns the coverage ratchet and `vitest.coverage.mts` in its wave 5.
That feature has not started Execute (it is waiting on owner confirmation of the assumption rows).
This feature closes the gap that made the floors red and touches `vitest.coverage.mts` only for
the two exclusion rows of D-1/D-2 — the `thresholds` block is left untouched (COV-03), so T39
still has its ratchet to re-baseline. Recorded in `STATE.md` § Handoff at closeout.
