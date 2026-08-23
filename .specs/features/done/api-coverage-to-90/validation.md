# API coverage to 90 — Validation

**Date**: 2026-08-22
**Spec**: `.specs/features/api-coverage-to-90/spec.md`
**Diff range**: `19a26f9`..`HEAD` **minus `510e312`** — the 12 feature commits `b30be0d 188734d
54a910b 2bdee72 eabcc02 4aa2dfb b9c468a d6814bc 2595c3e 9ff5e57 2d8e0d5 cea5d1d`. `510e312`
(another session's `security-audit-remediation` wave record) touches only `.specs/STATE.md` and
`.specs/features/security-audit-remediation/{design,tasks}.md` — disjoint from every path this
feature touches, so excluding it changes nothing in the surface reviewed.
**Verifier**: independent sub-agent (author ≠ verifier)
**Verdict**: **PASS ✅** — 10/10 ACs matched the spec-defined outcome, 0 spec-precision gaps,
final gate green, 3/3 mutants killed.

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 denominator | ✅ Done | `b30be0d` — both exclusions + both doc rows |
| T2 idempotency | ✅ Done | `188734d` |
| T3 problem-details | ✅ Done | `eabcc02` |
| T4 openapi-config | ✅ Done | `2bdee72` — source untouched |
| T5 log.interceptor | ✅ Done | `54a910b` |
| T6 logger.factory | ✅ Done | `4aa2dfb` |
| T7 weekly-slot / list-query | ✅ Done | `b9c468a` |
| T8 transaction-manager / managed-dedicated-client | ✅ Done | `d6814bc` |
| T9 request-context.middleware | ✅ Done | `2595c3e` |
| F1 wave-2 lint fix | ✅ Done | `9ff5e57` — includes a real vacuous-assertion defect, see Gate Check |
| T10 measure & close | ✅ Done | `2d8e0d5` — measured, no residual to close |
| F2 stale comment | ✅ Done | `cea5d1d` |

Feature surface (union of the 12 commits, 17 files): 4 new specs, 8 modified specs/int-specs,
**4 production files**, `docs/test/testing.md`, `vitest.coverage.mts`.

---

## Spec-Anchored Acceptance Criteria

| ID | Spec-defined outcome | Declared proof | Evidence (`file:line` + assertion) | Result |
| --- | --- | --- | --- | --- |
| COV-01 | `pnpm test:coverage` exits 0, no `ERROR: … does not meet … threshold` for the global thresholds or either glob | gate | Final gate: `pnpm test:coverage` **exit 0**, 93 files / 614 tests; `grep 'ERROR:\|does not meet'` over `coverage.log` → **zero hits**. Per-glob recomputed by the verifier from `coverage/coverage-summary.json` over the 86 `apps/api/src/**` entries: st 965/998 = 96.69, br 449/471 = 95.33, fn 280/295 = 94.92, ln 920/950 = 96.84 — all ≥ 90, matching `tasks.md` § T10 exactly | ✅ PASS |
| COV-02 | `pnpm test` exits 0 | gate | Final gate: `pnpm test` **exit 0** — Test Files 80 passed (80), Tests 490 passed (490) | ✅ PASS |
| COV-03 | Every threshold value still `90`; no metric key and no glob key removed | probe | `vitest.coverage.mts:45-70` — 12 numeric values, all `90` (global 4 · `apps/api/src/**` 4 · `apps/web/src/**` 4); all four metric keys present in all three blocks, both glob keys present. `git diff 19a26f9 HEAD -- vitest.coverage.mts` contains **no numeric hunk**: only 2 added `exclude` entries and one replaced comment (the amendment's intent) | ✅ PASS |
| COV-04 | No coverage-ignore pragma under `apps/api/src/**` | probe | `grep -rn 'c8 ignore\|v8 ignore\|istanbul ignore\|node:coverage' apps/api/src` → exit 1, no output | ✅ PASS |
| COV-05 | Both exclusions present with a reason comment; both rows in the `docs/test/testing.md` table | probe | `vitest.coverage.mts:31-33` (`apps/api/src/openapi/export-openapi.ts`, CLI entry-point reason) and `:36-40` (`apps/api/src/shared/config/coverage-metric/*.sample.ts`, fixture reason naming COV-06); `docs/test/testing.md:165` and `:166`. **Effect verified**: `coverage-summary.json` contains no `export-openapi` key and no `*.sample.ts` key | ✅ PASS |
| COV-06 | Both `it`s of the coverage-metric contract green after D-2 | test | `coverage-metric.contract.spec.ts:86` `expect(branches.uncovered).toBe(0)`; `:94` `expect(branches.total).toBeGreaterThan(0)`; `:95` `expect(branches.uncovered).toBeGreaterThan(0)`. Re-run scoped by the verifier post-D-2: exit 0, 2 passed | ✅ PASS |
| COV-07 | Every new test asserts an observable outcome, or the error class **and** message | probe | 90 added `it`, 152 added `expect`, **zero added `toBeDefined`**. Sampled: `idempotency.interceptor.spec.ts` pairs every `toBeInstanceOf` with the value — `UnprocessableEntityException` + `.message` `toBe("Idempotency-Key reusada com payload diferente")`, `HttpException` + `getStatus() toBe(422)` + `getResponse() toEqual({title:"Saldo insuficiente"})`, + `getResponse() toBe("Erro")`; `managed-dedicated-client.spec.ts` `toBeInstanceOf(Error)` + `.message toBe("econnrefused")` + `second toBe(first)`; `problem-details.filter.spec.ts:67` `toBe("60")` (the pre-existing `toBeDefined` was strengthened, as claimed) | ✅ PASS |
| COV-08 | An unreachable branch is removed by restructuring; the commit body names the branch and why | probe | 4 removals, each named: `188734d` (idempotency `endpoint`, `?? ""`), `eabcc02` (filter `instance`, `?? originalUrl`), `54a910b` (`stripQuery`, `?? url`), `b9c468a` (`list-query`, `json.properties ?? {}`). Equivalence independently re-derived — see § Production-code equivalence | ✅ PASS |
| COV-09 | No file under `catalog/**` or `.worktrees/**` modified | probe | Union of `git show --name-only` over the 12 commits: 0 paths matching `^catalog/` or `^\.worktrees/` | ✅ PASS |
| COV-10 | A file that issues SQL is covered by an `*.int-spec.ts` against the testcontainer, never a mocked db | probe | The only SQL-issuing file touched is `transaction-manager.ts` → `transaction-manager.int-spec.ts` (testcontainer). `managed-dedicated-client.ts` issues **no SQL** (verified: connect / `client.end()` / `error`+`end` listeners over an injected `DedicatedClientFactory`; the `LISTEN` lives in the caller's `onReady`) — its unit double is a collaborator, `import type { Client } from "pg"` is type-only. `openapi-config.spec.ts`, `list-query.decorator.spec.ts`, `logger.factory.spec.ts` import no database | ✅ PASS |

**Status**: ✅ 10/10 covered · 0 spec-precision gaps.

---

## Production-code equivalence (the four COV-08 removals)

Weighted as the feature's main risk: four branches were deleted from production code, not test code.

**The three `split("?")` sites** — `log.interceptor.ts:23`, `problem-details.filter.ts:112-114`,
`idempotency.interceptor.ts:103-105`. `String.prototype.split` always returns ≥ 1 element, so
`s.split("?")[0]` is never `undefined` and the `??` arm was genuinely unreachable — it existed only
to satisfy `noUncheckedIndexedAccess`. Equivalence to `indexOf === -1 ? s : s.slice(0, indexOf)`
holds for every input, checked at the boundaries the payload named:

| input | `s.split("?")[0]` | `indexOf`/`slice` | equal |
| --- | --- | --- | --- |
| `""` | `""` | idx `-1` → `""` | ✅ |
| `"?"` | `""` | idx `0` → `slice(0,0)` = `""` | ✅ |
| `"?a"` | `""` | idx `0` → `""` | ✅ |
| `"/a?b=1"` | `"/a"` | idx `2` → `"/a"` | ✅ |
| no `"?"` | `s` | idx `-1` → `s` | ✅ |

The idempotency site is the one whose old fallback was `?? ""` rather than `?? originalUrl` — since
that arm was unreachable, the differing literal never mattered, and the restructure lands on the
same value; the `endpoint`/scope key is unchanged for every input. Pinned by
`idempotency.interceptor.spec.ts:530` `expect(firstReserve(reserved).endpoint).toBe("POST /v1/things")`
for `originalUrl: "/v1/things?page=2&q=x"`, and by the sibling test for the no-query url.

**`list-query.decorator.ts:38`** (`json.properties ?? {}` → `json.properties`) is *not* an identity:
if `properties` were ever `undefined`, `Object.entries(undefined)` would throw where the old code
returned no params. The unreachability claim was therefore verified against the installed
dependency, not accepted: `node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema-processors.js:279`
sets `json.properties = {}` unconditionally before populating, for any `ZodObject`; the parameter
type `z.ZodObject<z.ZodRawShape>` admits nothing else. Exercised empirically by
`list-query.decorator.spec.ts:33` `@ListQuery(z.object({}))` — the empty-object case, the only way
"no properties" could arise — which is green.

**Contract cross-check.** `list-query.decorator.ts` feeds `@ApiQuery` into the OpenAPI document, so
the verifier ran `pnpm contract` (with the env the exporter validates) → exit 0, then
`git diff --exit-code openapi.json` → exit 0 and a clean tree: the regenerated document is
byte-identical. Direct evidence that the removal changed no observable output.

---

## Denominator (COV-05) — correction, not floor relief

- The `thresholds` block carries no numeric change in the whole range (COV-03); the two entries are
  `exclude` rows. A floor was not moved.
- Both excluded paths follow the precedent already in the file (`main.ts` bootstrap,
  `db/**` CLI scripts) and neither is product code reachable from a request.
- `buildOpenApiDocument`, the thing `export-openapi.ts` wraps, **stayed** in the denominator and is
  covered by T4 — the exclusion removes the `process.argv`/`writeFileSync` shell only.
- Both halves of the fixture pair are excluded, not only the uncovered one.
- **COV-06 cannot be broken by D-2**: the nested measurement in
  `coverage-metric.contract.spec.ts:54-72` is `pnpm exec vitest run --project=api … --coverage.include=<sample>`
  with `cwd` = `apps/api`, so it resolves `apps/api/vitest.config.mts` — not the root
  `vitest.coverage.mts` where the exclusion lives. Confirmed empirically by re-running the contract.

---

## Discrimination Sensor

3 mutants (default depth — the feature is tooling/tests, not P0). Each injected once into the real
file, scoped gate run once, restored with `git checkout --` and `git status --short` confirmed empty
before the next. No `stash`, no branch, no worktree.

| # | File:line | Mutation | Scoped gate | Killed? |
| --- | --- | --- | --- | --- |
| 1 | `apps/api/src/shared/kernel/errors/problem-details.filter.ts:114` | `queryStart === -1` → `queryStart !== -1` (inverts the query-string truncation of `instance`) | `problem-details.filter.spec.ts` | ✅ **Killed** — exit 1, 4 failed / 31 passed: *"trunca a url no primeiro ? e não ecoa a query"*, *"url sem query string entra inteira"*, *"copia type, title, status e detail do erro"*, *"corpo é RFC 7807 exato…"* |
| 2 | `apps/api/src/shared/kernel/idempotency/idempotency.interceptor.ts:129` | `existing.responseStatus ?? 200` → `?? 500` (replay default status) | `idempotency.interceptor.spec.ts` | ✅ **Killed** — exit 1, 1 failed / 31 passed: *"faz replay com 200 quando não há status persistido"* |
| 3 | `apps/api/src/shared/kernel/idempotency/idempotency.interceptor.ts:105` | `queryStart === -1 ? …` → `true ? …` (the reservation `endpoint` keeps the query string) | `idempotency.interceptor.spec.ts` | ✅ **Killed** — exit 1, 1 failed / 31 passed: *"descarta a query string do endpoint reservado"* |

Mutant 1 covers a restructured `split("?")` site; mutants 2–3 cover the idempotency replay path and
the CAS reservation key derivation, as the verification brief required. Mutant 2 is the informative
one: the `?? 200` arm was *exercised* (the file reports 100 % branches) and is also *asserted* — the
distinction the sensor exists to make.

**Result**: 3/3 killed — ✅ PASS.

---

## Gate Check

- **Gate command run** (`shell-runner`, one dispatch): `pnpm check` · `pnpm test:coverage` · `pnpm test`.
  `pnpm test` was added to the payload's narrowed command because COV-02 declares it as its proof.
- **Results**: `pnpm check` **exit 0** · `pnpm test:coverage` **exit 0** (93 files / 614 tests, 0 failed,
  no `ERROR:` line) · `pnpm test` **exit 0** (80 files / 490 tests, 0 failed).
- **Contract half of the declared final gate**, run separately by the verifier: `pnpm contract`
  **exit 0**, `git diff --exit-code openapi.json` **exit 0**, working tree clean afterwards.
  It needs `DATABASE_URL`, `REDIS_URL`, `WEB_ORIGIN` and the five `R2_*` vars in the shell — with
  none set it fails at env validation. Pre-existing environment friction, unrelated to this feature
  (neither `env.ts` nor `export-openapi.ts` is in the range); same family as note N-2's prettier issue.
- **Test count before feature**: 76 files / 399 tests (`pnpm test`, wave-1 baseline).
- **Test count after feature**: 80 files / 490 tests. **Delta: +91 tests, +4 files.** No drop.
- **Skipped tests**: none. **Failures**: none.
- **Coverage merged total**: 96.46 st / 95.19 br / 95.00 fn / 96.81 ln.
- **F1 note** — the wave-2 Build gate did fail once (`pnpm check` exit 1, 6 eslint errors in three
  specs) and was fixed in `9ff5e57`. One of the six was a real defect, not a style nit: an
  `@typescript-eslint/no-unnecessary-condition` on a `??` whose left operand TypeScript narrowed to
  always-`null`, which made the `app.audit_ctx` assertion vacuous. Confirmed fixed at HEAD —
  `transaction-manager.int-spec.ts:276-291` now returns the value out of the awaited chain and
  asserts `toEqual({actor_user_id:"user-42", correlation_id:"corr-audit", origin:"job"})`.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — the only production edits are the 4 COV-08 restructures |
| Surgical changes | ✅ — no file outside the declared `Touches` |
| No scope creep | ✅ — T10 correctly declined to add tests to files already above the bar |
| Matches patterns | ✅ — AD-028 (`vitest` imports, relative paths in api specs), test next to the file under test |
| Spec-anchored outcome check | ✅ |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed | ✅ — `docs/test/testing.md` (§ What counts as proof, § The api's three layers) |

---

## Minor observations (not gaps, no fix task)

1. `apply-listing.spec.ts:108,168` still hold `expect(clauses.where).toBeDefined()`. Pre-existing and
   **outside this feature's range** — COV-07 scopes to new tests, so this is not a finding, but it is
   the last `toBeDefined` left in the listing kernel if someone wants it.
2. `stripQuery` has unit cases for "with query" (`log.interceptor.spec.ts:51`) and "without query"
   (`:57`) but none for `""` or a bare `"?"`. The equivalence proof above covers both inputs, so
   behaviour is not at risk; the two cases would simply make the sensor's job someone else's.
3. `list-query.decorator.spec.ts:53` is titled *"schema sem campo obrigatório não grava nenhum
   parâmetro como required"* while it asserts that **no parameter at all** was recorded. The
   assertion is the right one for `z.object({})`; the title undersells it.
4. `.specs/features/api-coverage-to-90/` is untracked in git — the feature's own spec/tasks were
   never committed. Orchestrator's call at closeout, not an AC.

---

## Summary

**Overall**: ✅ Ready.

**Spec-anchored check**: 10/10 ACs matched the spec-defined outcome · 0 spec-precision gaps.
**Sensor**: 3/3 mutations killed.
**Gate**: `check` 0 · `test:coverage` 0 (614 passed) · `test` 0 (490 passed) · `contract` 0, no
`openapi.json` drift.

**What works**: the api glob clears the flat 90 on all four metrics with margin (96.69 / 95.33 /
94.92 / 96.84) without a single floor moved, without one ignore pragma, and with the two denominator
exclusions justified, documented in both the config and `docs/test/testing.md`, and proven inert
against the coverage-metric contract they could plausibly have broken. The four unreachable branches
were removed by restructuring with commit bodies that name them; all four removals are behaviourally
identical to the originals for every input, the `list-query` one confirmed against zod's source and
against a byte-identical regenerated `openapi.json`.

**Issues found**: none blocking.

**Next steps**: closeout — merge, move `.specs/features/api-coverage-to-90/` to
`.specs/features/done/`, and hand `vitest.coverage.mts` back to `test-suite-refactor` T39/C10, whose
ratchet now re-baselines from a green api glob rather than a red one.
