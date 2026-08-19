# Pre-push coverage 95% — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/pre-push-coverage-95/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `docs/test/testing.md`, `docs/code-quality.md`, `apps/api/package.json` (jest), `apps/web/vitest.config.ts`, `lefthook.yml`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Jest / vitest / lefthook config | none | Build/coverage gate | `apps/api/package.json`, `apps/web/vitest.config.ts`, `lefthook.yml` | `pnpm --filter api test:cov` / `pnpm --filter web test:cov` |
| Coverage-metric samples + contract | unit | COV-05: optional-chain file 100% branch; COV-06: if/else true-only path branch < 100% | `apps/api/src/shared/config/coverage-metric/**` | `pnpm --filter api test -- coverage-metric` |
| Api production trees | unit | Tree ≥95% S/B/F/L; every new test asserts observable outcome (COV-08/09); dead code deleted (COV-10); no ignore pragmas | `apps/api/src/**/*.spec.ts` beside source | `pnpm --filter api test -- <tree>` |
| Web production trees | unit | Same 95% bar; RTL/observable DOM or schema parse | `apps/web/src/**/*.test.ts(x)` | `pnpm --filter web test` |
| Integration / e2e | none | Not this feature (Docker off pre-push) | — | Final gate only |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After unit-only tasks | `pnpm --filter api test -- <Touches spec paths>` or `pnpm --filter web test <paths>` |
| Full | Not used in-task (no int/e2e tasks) | — |
| Build | Once per wave | Wave 1 `scoped`: typecheck + lint + unit path-filter on the wave’s Touches. Wave 2 `full-unit`: `pnpm --filter api test` + `pnpm --filter web test` + typecheck/lint (kernel + modules). Wave 3 `full-unit`: `pnpm --filter api test:cov` and `pnpm --filter web test:cov` (the ratchet proof) + typecheck/lint |
| Final | Verifier | `pnpm check` + `pnpm --filter api test:cov` + `pnpm --filter web test:cov` + `pnpm --filter api test:int` + `pnpm --filter api test:e2e` |

---

## Wave Plan

Waves run in order (barrier + Build gate between them). Clusters inside a wave run **in parallel**, one worker each; tasks inside a cluster run in the listed order. Exclusive waves hold one task and nothing else in flight. Wave 2 has 7 clusters — dispatch first four, FIFO the rest.

| Wave | Cluster | Tasks (in order) | Files (union of Touches) | Notes |
| --- | --- | --- | --- | --- |
| 1 | C1 | T1 → T2 | `apps/api/package.json`, `apps/api/src/shared/config/coverage-metric/**` | collector then contract; T2 folded · gate: scoped |
| 1 | C2 | T10 | `apps/web/src/**`, `apps/web/src/**/*.test.ts(x)` | web fill; disjoint from C1 |
| 2 | C3 | T3 | `apps/api/src/shared/**` (except `coverage-metric/` owned by C1 — **do not edit T2 files**) | kernel+infra+config fill · gate: full-unit |
| 2 | C4 | T4 | `apps/api/src/modules/identity/**` | |
| 2 | C5 | T5 | `apps/api/src/modules/attachment/**` | |
| 2 | C6 | T6 | `apps/api/src/modules/audit/**` | |
| 2 | C7 | T7 | `apps/api/src/modules/notification/**` | FIFO after a C3–C6 slot frees |
| 2 | C8 | T8 | `apps/api/src/modules/tag/**` | FIFO |
| 2 | C9 | T9 | `apps/api/src/openapi/**`, `apps/api/src/db/**`, `apps/api/src/seeds/**`, `apps/api/src/app.module.ts`, other `apps/api/src/*.ts` except `main.ts` | remainder; not shared/, not modules/ |
| 3 (exclusive) | C10 | T11 | `apps/api/package.json`, `apps/web/vitest.config.ts`, `lefthook.yml`, `docs/test/testing.md` | ratchet 95% + hook · gate: full-unit |

```
Wave 1:  [C1: T1 → T2]  ∥  [C2: T10]
Wave 2:  [C3: T3] ∥ [C4: T4] ∥ [C5: T5] ∥ [C6: T6]   then FIFO  [C7: T7] ∥ [C8: T8] ∥ [C9: T9]
Wave 3:  [C10: T11]  (exclusive)
```

---

## Task Breakdown

### T1: Api unit collector = V8 + excludes + SWC es2022

**What**: Switch api unit Jest coverage to `coverageProvider: "v8"`, exclude spec/d.ts/main/slots from `collectCoverageFrom`, ensure `@swc/jest` emits source maps for V8 remap (prefer existing `.swcrc` `es2023`; add `sourceMaps: true` there or inline if missing). Do **not** raise `coverageThreshold`.
**Where**: `apps/api/package.json`
**Touches**: `apps/api/package.json`
**Depends on**: none
**Exclusive**: no
**Reuses**: existing `jest` block; handbook SWC decorator flags
**Requirement**: COV-04, COV-05 (enabler)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `coverageProvider` is `"v8"`
- [ ] `collectCoverageFrom` includes `**/*.ts` and excludes `*.spec.ts`, `*.int-spec.ts`, `*.e2e-spec.ts`, `*.d.ts`, `main.ts`, `**/product-permission-catalogs.ts`, `**/product-access-profiles.ts`, `**/product-upload-profiles.ts`
- [ ] Thresholds still 43/35/40/45
- [ ] `pnpm --filter api test` still green (no coverage fail)

**Tests**: none
**Gate**: quick — `pnpm --filter api test`

---

### T2: Coverage-metric contract (COV-05 / COV-06)

**What**: Add optional-chain and if/else fixtures plus a contract spec that spawns Jest `--coverage` and asserts branch semantics.
**Where**: `apps/api/src/shared/config/coverage-metric/`
**Touches**: `apps/api/src/shared/config/coverage-metric/optional-chain.sample.ts`, `apps/api/src/shared/config/coverage-metric/optional-chain.sample.spec.ts`, `apps/api/src/shared/config/coverage-metric/if-else.sample.ts`, `apps/api/src/shared/config/coverage-metric/if-else.sample.uncovered.spec.ts`, `apps/api/src/shared/config/coverage-metric/coverage-metric.contract.spec.ts`, `apps/api/package.json` (`testPathIgnorePatterns` for the uncovered spec only)
**Depends on**: T1
**Exclusive**: no
**Reuses**: Jest CLI from `test:cov`
**Requirement**: COV-05, COV-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Contract: optional-chain sample file reports 100% branch under unit coverage
- [ ] Contract: if/else sample with only the true path reports branch < 100%
- [ ] `if-else.sample.uncovered.spec.ts` is ignored by the default unit run
- [ ] Gate: `pnpm --filter api test -- coverage-metric` passes
- [ ] Test count: ≥3 passing (optional-chain spec, contract, ignored uncovered spec still present)

**Tests**: unit
**Gate**: quick

---

### T3: Fill `apps/api/src/shared/` unit coverage to ≥95%

**What**: Add behavioural unit tests (and delete dead code) so this tree is ≥95% S/B/F/L. Do not edit `coverage-metric/` (T2).
**Where**: `apps/api/src/shared/`
**Touches**: `apps/api/src/shared/**` except `apps/api/src/shared/config/coverage-metric/**`
**Depends on**: T2
**Exclusive**: no
**Reuses**: existing `*.spec.ts` in the tree
**Requirement**: COV-08, COV-09, COV-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `pnpm --filter api exec jest --coverage --collectCoverageFrom='shared/**/*.ts' --collectCoverageFrom='!shared/**/*.spec.ts' --collectCoverageFrom='!shared/config/coverage-metric/**' --testPathPattern='src/shared/'` reports ≥95% S/B/F/L
- [ ] New tests assert observable outcomes; error paths assert class + message when named
- [ ] No new `istanbul ignore` / `v8 ignore` / `c8 ignore` in the tree
- [ ] Test count: existing shared specs still pass (no silent deletions)

**Tests**: unit
**Gate**: quick

---

### T4: Fill identity unit coverage to ≥95%

**What**: Same bar for `modules/identity`.
**Where**: `apps/api/src/modules/identity/`
**Touches**: `apps/api/src/modules/identity/**`
**Depends on**: T2
**Exclusive**: no
**Reuses**: existing identity `*.spec.ts`
**Requirement**: COV-08, COV-09, COV-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Jest `--coverage` with `collectCoverageFrom='modules/identity/**/*.ts'` (exclude specs) ≥95% S/B/F/L
- [ ] Behavioural asserts; no ignore pragmas; no silent spec deletions

**Tests**: unit
**Gate**: quick

---

### T5: Fill attachment unit coverage to ≥95%

**What**: Same bar for `modules/attachment`.
**Where**: `apps/api/src/modules/attachment/`
**Touches**: `apps/api/src/modules/attachment/**`
**Depends on**: T2
**Exclusive**: no
**Reuses**: existing attachment specs
**Requirement**: COV-08, COV-09, COV-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Jest coverage on `modules/attachment/**/*.ts` (exclude specs) ≥95% S/B/F/L
- [ ] Behavioural asserts; no ignore pragmas; no silent spec deletions

**Tests**: unit
**Gate**: quick

---

### T6: Fill audit unit coverage to ≥95%

**What**: Same bar for `modules/audit`.
**Where**: `apps/api/src/modules/audit/`
**Touches**: `apps/api/src/modules/audit/**`
**Depends on**: T2
**Exclusive**: no
**Reuses**: existing audit specs
**Requirement**: COV-08, COV-09, COV-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Jest coverage on `modules/audit/**/*.ts` (exclude specs) ≥95% S/B/F/L
- [ ] Behavioural asserts; no ignore pragmas; no silent spec deletions

**Tests**: unit
**Gate**: quick

---

### T7: Fill notification unit coverage to ≥95%

**What**: Same bar for `modules/notification`.
**Where**: `apps/api/src/modules/notification/`
**Touches**: `apps/api/src/modules/notification/**`
**Depends on**: T2
**Exclusive**: no
**Reuses**: existing notification specs
**Requirement**: COV-08, COV-09, COV-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Jest coverage on `modules/notification/**/*.ts` (exclude specs) ≥95% S/B/F/L
- [ ] Behavioural asserts; no ignore pragmas; no silent spec deletions

**Tests**: unit
**Gate**: quick

---

### T8: Fill tag unit coverage to ≥95%

**What**: Same bar for `modules/tag`.
**Where**: `apps/api/src/modules/tag/`
**Touches**: `apps/api/src/modules/tag/**`
**Depends on**: T2
**Exclusive**: no
**Reuses**: existing tag specs
**Requirement**: COV-08, COV-09, COV-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Jest coverage on `modules/tag/**/*.ts` (exclude specs) ≥95% S/B/F/L
- [ ] Behavioural asserts; no ignore pragmas; no silent spec deletions

**Tests**: unit
**Gate**: quick

---

### T9: Fill remaining api src (not shared, not modules) to ≥95%

**What**: Same bar for openapi, db, seeds, `app.module.ts`, and other root `src/*.ts` except `main.ts` (excluded from denominator).
**Where**: `apps/api/src/` (remainder)
**Touches**: `apps/api/src/openapi/**`, `apps/api/src/db/**`, `apps/api/src/seeds/**`, `apps/api/src/app.module.ts`, other `apps/api/src/*.ts` except `main.ts`
**Depends on**: T2
**Exclusive**: no
**Reuses**: existing specs in those trees
**Requirement**: COV-08, COV-09, COV-10, COV-04 (`main.ts` stays excluded)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Jest coverage on this remainder glob ≥95% S/B/F/L
- [ ] `main.ts` still not in `collectCoverageFrom`
- [ ] Behavioural asserts; no ignore pragmas; no silent spec deletions

**Tests**: unit
**Gate**: quick

---

### T10: Fill web unit coverage to ≥95%

**What**: Add behavioural vitest tests so `pnpm --filter web test:cov` can pass 95% on all four metrics (thresholds still old until T11).
**Where**: `apps/web/src/`
**Touches**: `apps/web/src/**`, colocated `*.test.ts(x)`
**Depends on**: none
**Exclusive**: no
**Reuses**: existing `*.test.ts(x)`; current vitest exclude list (`main.tsx`, `shared/test/**`, d.ts, tests)
**Requirement**: COV-08, COV-09, COV-10, COV-04 (web excludes)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `pnpm --filter web exec vitest run --coverage` reports ≥95% S/B/F/L **before** thresholds are raised (read the summary, not the exit code if still gated at 64/56/61/64)
- [ ] Behavioural asserts; no ignore pragmas; no silent deletions

**Tests**: unit
**Gate**: quick — `pnpm --filter web test`

---

### T11: Ratchet 95% + pre-push `test:cov`

**What**: Set api `coverageThreshold.global` and web `thresholds` to 95/95/95/95; point lefthook `test-api` at `turbo test:cov --filter=api`; document in `docs/test/testing.md`.
**Where**: `apps/api/package.json`, `apps/web/vitest.config.ts`, `lefthook.yml`, `docs/test/testing.md`
**Touches**: `apps/api/package.json`, `apps/web/vitest.config.ts`, `lefthook.yml`, `docs/test/testing.md`
**Depends on**: T2, T3, T4, T5, T6, T7, T8, T9, T10
**Exclusive**: yes
**Reuses**: existing lefthook `test-web` already `test:cov`
**Requirement**: COV-01, COV-02, COV-03, COV-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Both `pnpm --filter api test:cov` and `pnpm --filter web test:cov` exit 0 with ≥95% S/B/F/L
- [ ] lefthook `test-api` `run:` is `pnpm turbo test:cov --filter=api`
- [ ] `rg -n 'istanbul ignore|v8 ignore|c8 ignore' apps/api/src apps/web/src` has no **new** pragmas vs main
- [ ] Combined `coverage-all.sh` floors still 85/51/90/90
- [ ] `docs/test/testing.md` states the 95% pre-push bar and that api unit uses V8 coverage
- [ ] 94.9% would fail (threshold is integer 95, no round-up)

**Tests**: none
**Gate**: build — both `test:cov` commands

---

## Wave Execution Map

```
Wave 1:  [C1: T1 → T2]  ∥  [C2: T10]
Wave 2:  [C3: T3] ∥ [C4: T4] ∥ [C5: T5] ∥ [C6: T6]   then FIFO  [C7: T7] ∥ [C8: T8] ∥ [C9: T9]
Wave 3:  [C10: T11]  (exclusive)
```

At Execute the orchestrator never implements. For each wave it dispatches one worker per cluster (≤4 in flight), waits, runs the Build gate once through the runner, records results, then the next wave. After the last wave it dispatches the Verifier.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 config block | ✅ Granular |
| T2 | 1 contract + fixtures | ✅ Granular |
| T3–T9 | one directory tree each | ⚠️ Cohesive tree — splitting per file would be 200+ tasks |
| T10 | web `src/` (~34 files) | ⚠️ Same |
| T11 | 4 wiring files, one ratchet | ✅ Cohesive exclusive |

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | none | wave 1 root | ✅ |
| T2 | T1 | folded after T1 in C1 | ✅ |
| T3–T9 | T2 | wave 2, after wave 1 | ✅ |
| T10 | none | wave 1 sibling of C1 | ✅ |
| T11 | T2–T10 | wave 3 after all fills | ✅ |

---

## Wave/Cluster Cross-Check

| Wave | Cluster | Tasks | Files | Deps outside earlier waves / own cluster? | Files shared with sibling? | Exclusive alone? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | C1 | T1 → T2 | api `package.json` + `coverage-metric/` | none | none (T10 is web) | n/a | ✅ |
| 1 | C2 | T10 | `apps/web/src/**` | none | none | n/a | ✅ |
| 2 | C3 | T3 | `shared/**` minus coverage-metric | T2 in wave 1 | none | n/a | ✅ |
| 2 | C4 | T4 | identity | T2 in wave 1 | none | n/a | ✅ |
| 2 | C5 | T5 | attachment | T2 in wave 1 | none | n/a | ✅ |
| 2 | C6 | T6 | audit | T2 in wave 1 | none | n/a | ✅ |
| 2 | C7 | T7 | notification | T2 in wave 1 | none | n/a | ✅ |
| 2 | C8 | T8 | tag | T2 in wave 1 | none | n/a | ✅ |
| 2 | C9 | T9 | remainder globs | T2 in wave 1 | none | n/a | ✅ |
| 3 | C10 | T11 | package.json, vitest.config, lefthook, testing.md | T2–T10 earlier | n/a | yes — only cluster | ✅ |

C3 must not modify `coverage-metric/` (C1). T11 is the second writer of `apps/api/package.json` and is exclusive after C1.

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Jest config | none | none | ✅ |
| T2 | Coverage-metric contract | unit | unit | ✅ |
| T3–T9 | Api production trees | unit | unit | ✅ |
| T10 | Web production trees | unit | unit | ✅ |
| T11 | Config / lefthook / docs | none | none | ✅ |

---

## Requirement mapping

| ID | Tasks |
| --- | --- |
| COV-01 | T11 |
| COV-02 | T11 |
| COV-03 | T11 |
| COV-04 | T1, T10, T11 |
| COV-05 | T2 |
| COV-06 | T2 |
| COV-07 | T3–T11 (probe on T11) |
| COV-08 | T3–T10 |
| COV-09 | T3–T10 |
| COV-10 | T3–T10 |
