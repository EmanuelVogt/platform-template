# vitest-migration Validation

**Date**: 2026-08-22 (round 2 re-verify)
**Spec**: `.specs/features/vitest-migration/spec.md`
**Diff range**: `e167341..HEAD` (HEAD `ff33db9`, branch `feat/vitest-migration`); round 2 fix range `16ad3ff..ff33db9` (F6 `348606f`, F7 `4f6e376`, probes `00351a1`, deviation record `ff33db9`)
**Verifier**: independent sub-agent (author ≠ verifier)

**Round 2 summary**: all 3 gaps from round 1 closed — F7 added the `ALTER COLUMN created_at SET DEFAULT clock_timestamp()` instruction to `ADV-20260821-03.md`; the CAT-02/DOC-02 probes were tightened in `spec.md` (Deviation 26) to exclude legitimate migration-documentation prose; F6 fixed the `tag.tags` missing `audit_row` trigger with a `SPEC_DEVIATION`-marked reattach helper, mirroring the identity precedent, plus a manual-step paragraph in `ADV-20260821-05.md` for real products. Root cause and fix independently re-derived and judged sound (see updated rows below), not taken on the worker's word. No new mutations run — round 1's sensor (3/3 killed) stands.

---

## Task Completion

All 6 waves (T1–T29, clusters C0–C10, fix tasks F1–F5) are recorded `DONE` in `tasks.md` § *Execution log*, each with a Build-gate PASS. No re-derivation needed beyond the Final gate below, which is the first run to exercise the scenario every per-entry Execute gate skipped (see Gate Check).

---

## Spec-Anchored Acceptance Criteria

| Requirement | Proof type | Evidence | Result |
| --- | --- | --- | --- |
| RUN-01 api unit project | gate | Final gate `pnpm test` = 76 files/399 tests, incl. 52 api unit files | ✅ PASS |
| RUN-02 worker DB handshake | test | `apps/api/test/setup/test-db.int-spec.ts:32` `expect(result.rows[0]?.db).toBe(\`test_w${poolId}\`)`; `:36` `inject("postgresUri")`. Mutant (renamed the pathname template) killed — 2 assertions failed with the exact literal mismatch. | ✅ PASS |
| RUN-03 e2e env locks | test | `apps/api/test/runner-env.e2e-spec.ts:22` `MAIL_TRANSPORT` toBe `"log"`; `:23` `RESEND_API_KEY` toBeUndefined; `:24` `MAIL_FROM` toBeUndefined; `:28-40` R2 dummies; `:44` Redis `dbsize()` toBe 0. Mutant (dropped the `RESEND_API_KEY` delete) killed — assertion failed with the leaked value. | ✅ PASS |
| RUN-04 scalar native load | test | `apps/api/src/openapi/docs-reference.spec.ts:1,20` real `@scalar/nestjs-api-reference` import + handler assertions; `apps/api/test/setup/scalar-stub.ts` confirmed absent | ✅ PASS |
| RUN-05 typecheck w/o jest types | gate | Final gate `pnpm check` (turbo typecheck+lint) = 5/5 | ✅ PASS |
| GAT-01 `pnpm test` Docker-free | gate | Final gate `pnpm test` exit 0; corroborated by `tasks.md:757` (`DOCKER_HOST=unix:///nonexistent pnpm test` 76 files/399, no container) | ✅ PASS |
| GAT-02 `test:coverage` merged thresholds | gate | Final gate `pnpm test:coverage` = 89 files/519 tests, exit 0; api 88.52/77.46/91.86/89.32 vs floors 86.1/72.7/89.8/86.9, web 64/56/61/64 — no threshold-fail lines | ✅ PASS |
| GAT-03 test:int/e2e/db scripts | test | `scripts/platform/__tests__/gates.test.mjs:27-35` asserts exact `test:int`/`test:e2e`/`test:db` script strings | ✅ PASS |
| GAT-04 Jest artefacts gone | gate | Final gate `pnpm install --frozen-lockfile && pnpm check` exit 0; `apps/api/package.json` carries no jest/nyc deps (T28 log) | ✅ PASS |
| GAT-05 pre-push chain | test | `gates.test.mjs:56-61` asserts `lefthook.yml` pre-push piped, order `migrations→typecheck→test-coverage` | ✅ PASS |
| GAT-06 CI jobs | test | `gates.test.mjs:74-90` asserts `ci.yml` `test-unit`/`test-coverage` after `quality`, `catalog.yml` gates keep `pnpm test`+`pnpm test:scripts` | ✅ PASS |
| GAT-07 no `test*` in turbo/app manifests | test | `gates.test.mjs:37-54`, three blocks, `assert.deepEqual([...], [])` each | ✅ PASS |
| CAT-01 codemod rewrite rules | test | `scripts/platform/__tests__/jest-to-vitest.test.mjs` covers rules 1 (fn/spyOn/mock, `:8-27`), 2 (requireActual, `:29-47`), 3 (setTimeout, `:49-55`), 4 (SpyInstance→MockInstance, `:57-63`), 5 (vi.hoisted, `:65-112`), 6 (import merge, `:114-135`), 7 (idempotency, `:173-193`). Mutant (renamed `testTimeout`→`hookTimeout`) killed. **Note**: 8 of the 19 `RENAMED_MEMBERS` (restoreAllMocks, resetAllMocks, clearAllMocks, useFakeTimers, useRealTimers, advanceTimersByTime(Async), setSystemTime, mocked) and 3 of 4 `TYPE_RENAMES` (Mock, Mocked, MockedFunction) are exercised only through the shared allow-list mechanism, not by a dedicated per-member assertion — confirmed data-driven in source (`jest-to-vitest.mjs:17-37,41-47`), not a functional gap, but thin evidence per member. | ✅ PASS (note) |
| CAT-02 no `jest.` in apps/api, catalog | probe | Spec's probe re-declared (Deviation 26): `rg -c 'jest\.' apps/api catalog --glob '!*.md'` → **no output** (exit 1, confirmed by re-running it myself). `apps/api` and the code trees of `catalog` are clean; only excluded is `CHANGELOG.md` migration-note prose, on the same grounds the changelog exclusion already covered. | ✅ PASS |
| CAT-03 five entries green in child | gate | Final gate `pnpm catalog:check` (all 5 entries, default no-arg scope) — **exit 0**. Child `check` 5/5 turbo tasks, `test` 201 files/1237 pass, `test:db` **68 files/463 tests all pass** (was 1 failed/462). Root cause independently confirmed: `catalog/tag/migrations/custom/01_audit_attach_tags.sql:7-15` guards on `pg_proc`/`pg_namespace` finding `audit.attach`; `resolveInstallOrder` with no requested entry (`catalog-graph.mjs:58`, `roots = [...index.keys()]`) can order `tag` before `audit`, so the guard silently skips — a pre-existing, documented design (`catalog/tag/README.md:53`, `catalog/audit/README.md:60-63`, both predating this fix at `ec14e1f`/wave 4: "no automatic retro-attach, the owning module attaches its own"). F6's fix (`348606f`) adds `catalog/audit/api/testing/reattach-tag-tables.ts` (`to_regclass`-guarded, no-op standalone), applies it in `audit-coverage.int-spec.ts`'s `beforeAll`/`afterAll` with an explicit `SPEC_DEVIATION` comment — the assertion (`expect(missing).toEqual([])`) is untouched, only the fixture now simulates the documented manual remedy, exactly mirroring the already-accepted `reattachIdentityTables` pattern (Deviation 21c) for the same class of sibling-ordering gap. `ADV-20260821-05.md` gained the manual `SELECT audit.attach('tag','tags','{id}','{}')` step (with a verification query) for real products that install `tag` before `audit` — the actual production-facing hole this exposed, now documented. Judged sound: not a weakened assertion, not an invented excuse — a pre-existing, refused-by-design behavior properly surfaced by the gate and properly remediated with a documented manual step. | ✅ PASS |
| CAT-04 module add / template-smoke use vitest | test | `scripts/platform/__tests__/add-web-test-script.test.mjs:12,19` assert `vitest run --project api/web …`; `scripts/platform/__tests__/template-smoke.test.mjs:285,308` assert `pnpm vitest run --project api …/module-boundaries.spec.ts`. Spec names the proof file `module-add.test.mjs`; actual file is `add-web-test-script.test.mjs` (naming only, assertions found and correct). | ✅ PASS (note) |
| CAT-05 entry version/CHANGELOG/advisory | gate | Final gate `pnpm catalog:lint` exit 0; confirmed all 5 `module.json` at `2.0.0`, `docs/advisories/ADV-20260821-0{1..5}.md` exist | ✅ PASS |
| CAT-06 changelog migration note | probe | `docs/dev/template-changelog.md:87` names `node scripts/platform/jest-to-vitest.mjs apps/api/src apps/api/test apps/web/src` | ✅ PASS |
| LNT-01 vitest eslint rule set | test | `packages/eslint-config/vitest.test.js:119-163` — `RULE_FIXTURES` table + loop asserts every named rule errors on both api-node and web configs; web-only testing-library rules asserted `:149-163`. **Note**: no fixture exercises the `int-spec`/`e2e-spec`/`parity.spec`/`vitest.setup.ts`/`shared/test/**`/`apps/api/test/**` file globs directly (only `x.spec.ts`/`x.test.tsx`); confirmed in source `packages/eslint-config/vitest.js:4-8,25-28,62` that the globs cover those paths, so this is thin test evidence, not a config gap. | ✅ PASS (note) |
| LNT-02 `.only`/assertion-free fail lint | test | `vitest.test.js:166-169` `it.only` → `no-focused-tests` error; `:171-174` `it` w/o `expect` → `expect-expect` error | ✅ PASS |
| LNT-03 tree lints clean | gate | Final gate `pnpm check` (includes turbo lint) exit 0 | ✅ PASS |
| DOC-01 testing.md rewritten | gate (Verifier review) | `docs/test/testing.md` has all 10 required sections (`grep '^#'`: Comandos, Layout, harness da api, três camadas, o que substitui, Convenções, Lint, Gate de pre-push, Exclusões, Performance); worker DBs/Redis/mail-R2 locks/Docker runtime detail present (`:62-80`); zero matches for `runInBand`/`workerIdleMemoryLimit`/`scalar-stub`/`nyc` | ✅ PASS |
| DOC-02 no stray "jest" | probe | Spec's probe re-declared (Deviation 26), with `--glob '!docs/advisories/*' --glob '!scripts/platform/jest-to-vitest*'` added and `gates.test.mjs`'s absence-assertions named as allowed: re-ran it myself, 42 total lines, **0 residual** after removing `jest-dom`, `jest-to-vitest` and the two `gates.test.mjs:49,53` absence-assertion lines. Matches the AC's literal claim. | ✅ PASS |
| DOC-03 arch/catalog/agents docs name Vitest | gate (shares DOC-02 probe) | Confirmed independently: `docs/back/back-arch.md`, `docs/catalog/catalog.md`, `AGENTS.md.jinja`, `docs/agents/harness.md` all mention Vitest | ✅ PASS |

**Status**: ✅ All ACs covered — 24/24 clean, 0 failed, 0 spec-precision gaps.

### Extra check (orchestrator-requested, round 1): ADV-20260821-03 clock_timestamp instruction

**Closed in round 2** (F7 `4f6e376`). `docs/advisories/ADV-20260821-03.md` gained a new § *Correção adicional: Passo manual para `clock_timestamp()`...* plus step 1 of "Passos": "Se o produto estiver em `1.x`, rode manualmente `ALTER COLUMN created_at SET DEFAULT clock_timestamp();` na tabela `user_professional_services`." Confirmed present, mirroring the `CREATE SCHEMA` precedent. Minor, non-blocking nit: the quoted SQL fragment omits the `ALTER TABLE user_professional_services` prefix (reads as a bare `ALTER COLUMN` clause); the surrounding prose names the table so the intent is unambiguous, but the fragment isn't copy-pasteable as literal SQL like the `CREATE SCHEMA` instruction is.

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `apps/api/test/setup/test-db.ts:18` | `test_w${VITEST_POOL_ID}` → `test_worker${VITEST_POOL_ID}` | ✅ Killed — `test-db.int-spec.ts` 2 failures: `database "test_worker1" does not exist`, `expected '/test_worker1' to be '/test_w1'` |
| 2 | `apps/api/test/setup/e2e-env.ts:32` | Dropped `delete process.env.RESEND_API_KEY` | ✅ Killed — `runner-env.e2e-spec.ts` failed: `expected 'leaked-real-key-should-be-deleted' to be undefined` |
| 3 | `scripts/platform/jest-to-vitest.mjs:282` | `testTimeout` key → `hookTimeout` in the `setTimeout` rewrite | ✅ Killed — `jest-to-vitest.test.mjs` rule-3 test failed on exact string diff |

**Sensor depth**: default (3 — tooling migration, not P0/Light Execute)
**Result**: 3/3 killed — PASS ✅ (all files restored, `git status --short` clean throughout). Round 2: no new mutations, per orchestrator instruction — round 1 stands.

**Round 2 note — new `SPEC_DEVIATION`**: F6 added one at `catalog/audit/api/domain/audit-coverage.int-spec.ts:34-38`, reasoned in `tasks.md` Deviation 27. Independently judged sound (see CAT-03 row) — the assertion is untouched, only the fixture's `beforeAll`/`afterAll` now simulates the pre-existing, documented manual remedy for a sibling-ordering gap the entries' own READMEs already refuse to auto-fix. Lesson recorded (`L-013`).

---

## Gate Check

- **Gate command**: `pnpm install --frozen-lockfile && pnpm check && pnpm test && pnpm test:coverage && pnpm test:scripts && pnpm catalog:lint && pnpm catalog:typecheck && pnpm catalog:check && pnpm template:smoke` (Docker), via `shell-runner`
- **Round 1 result**: exit 7 — chain aborted at `pnpm catalog:check` (`test:db` 1 failed/462); `pnpm template:smoke` never reached
- **Round 2 result**: exit **0** — full chain, single run, log `/private/tmp/claude-501/.../scratchpad/final-gate.log` (2771 lines)
  - `pnpm install --frozen-lockfile`: ✅ ok
  - `pnpm check`: ✅ 5/5 (lint+typecheck, api/web/api-client)
  - `pnpm test`: ✅ 76 files / 399 tests
  - `pnpm test:coverage`: ✅ 89 files / 519 tests — api 87.70/74.21/91.30/88.44 vs floors 86.1/72.7/89.8/86.9, web 94.78/94.51/95.56/96.58 vs floors 64/56/61/64, all PASS
  - `pnpm test:scripts`: ✅ 225/225
  - `pnpm catalog:lint`: ✅ exit 0
  - `pnpm catalog:typecheck`: ✅ exit 0 — "5 entrada(s): tag, notification, identity, audit, attachment"
  - `pnpm catalog:check`: ✅ exit 0 — child `check` 5/5 turbo tasks, `test` 201 files/1237, `test:db` **68 files/463, all pass**; closing line `catalog:check — OK: notification, identity/single-tenant, tag, audit, attachment`
  - `pnpm template:smoke`: ✅ exit 0 — "Smoke do template passou: as quatro checagens ficaram verdes" (kernel-only child: check+test, ephemeral Postgres `db:migrate`, ephemeral Redis + `GET /health`, `module-boundaries.spec.ts`)
- **Test count before feature**: api 51 files/330 tests · web 24/68 · scripts 192
- **Test count after feature**: `pnpm test` 76 files/399 · `pnpm test:coverage` 89 files/519 · `pnpm test:scripts` 225 — no drop anywhere, net growth
- **Failures**: none (round 2)

---

## Fix Plans

All three round-1 findings are closed as of `ff33db9`. No open fix plans.

- ~~Fix 1 (Blocker): `tag.tags` missing `audit_row` trigger in the combined 5-entry child~~ — closed by F6 `348606f` (`reattach-tag-tables.ts` + `ADV-20260821-05.md` manual step). Verified: Final gate `catalog:check` exit 0, `test:db` 68 files/463 all pass.
- ~~Fix 2 (Major): `ADV-20260821-03` missing manual DDL step~~ — closed by F7 `4f6e376`. Verified: instruction present, mirrored into "Passos".
- ~~Fix 3 (Minor): CAT-02 / DOC-02 probes too broad~~ — closed by `00351a1` (Deviation 26). Verified: both probes, re-run exactly as re-declared, return no residual matches.

Minor, non-blocking nit carried forward (not a fix task): `ADV-20260821-03.md`'s new `ALTER COLUMN created_at SET DEFAULT clock_timestamp();` fragment omits the `ALTER TABLE user_professional_services` prefix — unambiguous in context but not literally copy-pasteable SQL.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| RUN-01..05, GAT-01..07, CAT-01..06, LNT-01..03, DOC-01..03 | Pending | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 24/24 ACs matched spec outcome, 0 spec-precision gaps, 0 failed
**Sensor**: 3/3 mutations killed (round 1, stands unchanged)
**Gate**: 9/9 Final-gate steps passed (round 2, exit 0, single run)

**What works**: the entire migration — api unit/int/e2e tiers, root gates and coverage, the codemod, catalog entries (individually and combined), test lint, and docs — is proven end-to-end with a green Final gate and killed mutants on the riskiest paths (worker DB isolation, e2e env locks, codemod rewrite). The one real cross-entry gap the combined gate surfaced (`tag.tags` audit trigger) was root-caused correctly and fixed following an already-established pattern (the identity precedent), not papered over — the fix was independently re-derived and judged sound, including confirming the underlying "no automatic retro-attach" design decision predates this feature.

**Issues found**: none open.

**Next steps**: none — feature ready to close. Carry the minor `ALTER COLUMN` SQL-fragment wording nit in `ADV-20260821-03.md` as an optional polish, not a blocker.
