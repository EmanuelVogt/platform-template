# Test Suite Refactor Validation

**Date**: 2026-08-25
**Spec**: `.specs/features/test-suite-refactor/spec.md`
**Diff range**: `d1ba876^..c0d0bba` (T1 `d1ba876` → feature HEAD `c0d0bba`)
**Verifier**: independent sub-agent (author ≠ verifier)
**Verdict**: ❌ **FAIL** — not because the feature is broken, but because it could not be
proven on this checkout. See *Blocking environmental defect* first; it invalidates the Final gate.

---

## Blocking environmental defect — the checkout was not quiescent

The Verifier contract requires a checkout no worker is touching. That premise was false for the
whole run. Observed, first-hand:

| Time | HEAD | Event |
| --- | --- | --- |
| session start | `c0d0bba` | tree clean (payload's feature HEAD) |
| 03:33:07 | `755c300` | `spec(docs-audience-contract): wave 1 done` |
| 03:33:57 | `5122386` | `spec(docs-audience-contract): retarget T12` |
| 03:35:18 | `79d5d7a` | `feat(kernel)!: neutral cookie and storage-key defaults` |
| mid-gate | `d227089` | landed while the Final gate was running |

Two consequences, both material:

1. **`79d5d7a` rewrites two feature-scope files** — `apps/api/src/modules/module-boundaries.spec.ts`
   (RULE D) and `apps/api/src/shared/test/env.ts` (harness) — and bumps all five entries
   `2.1.1 → 3.0.0`. Every `file:line` below is therefore anchored at `c0d0bba`
   via `git grep <rev>`, not read from the working tree.
2. **A storage refactor was in flight during the Final gate.**
   `apps/api/src/shared/infra/storage/r2-storage.adapter.ts` was deleted from the tree while
   `storage.module.ts:4` still imported it; the replacements (`s3-storage.adapter.ts`,
   `null-storage.adapter.ts`) were untracked. Five of the nine gate stages died on
   `TS2307: Cannot find module './r2-storage.adapter'`. None of those failures is attributable
   to this feature — and none can be cleared without re-running the gate on a quiescent tree.

**The mutation sensor was deliberately NOT run** (see *Discrimination Sensor*): injecting a defect
into a tracked file while another agent commits every ~90 s risks that agent's `git add -A`
capturing a deliberate defect into `main` of a template repo that ships to child products, and
`git checkout -- <file>` risks destroying their uncommitted work. Both harms are irreversible.
Four non-mutating discrimination probes were run instead.

---

## Task Completion

Judged against the **post-cut** plan (18 tasks / 7 clusters / 4 waves, 2026-08-24). The eleven
requirements marked *— cut —* in spec.md § *Requirement mapping* are not judged here.

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 `it`-count baseline | ✅ Done | probe green, see STR-04 |
| T2 unit harness | ✅ Done | `apps/api/src/shared/test/unit/**` + 5 spec files |
| T3 int harness | ✅ Done | `withTestDb`, `resetDb`, redis helpers + `db.spec.ts` |
| T4 e2e harness | ✅ Done | `createE2eApp`, `drainOutbox`, `waitFor`, `expectProblem` |
| T5 runner plumbing / coverage denominator | ✅ Done | `vitest.coverage.mts` excludes `**/shared/test/**` and `apps/api/src/modules/*/testing/**` |
| T6 identity barrel | ✅ Done | `module.json.files` bullet unsatisfiable — no such field exists (schema + `manifest.mjs`); judged via `catalog:check` + REL-04 instead |
| T7 web harness (both shells) | ✅ Done | 10 files per shell, 8/10 byte-identical |
| T17/T18/T23 entry barrels | ✅ Done | notification, attachment, tag, audit |
| T31 lint plugins | ✅ Done | `packages/eslint-config/config.test.js` |
| T32 `no-existence-only-assert` | ✅ Done | rule + RuleTester |
| T33 guard spec | ✅ Done | 9 rules, 31 `it`s across `harness-hygiene.spec.ts` + `scan.spec.ts` |
| T34 RULE D | ⚠️ Partial | enforced, but evadable — see Sensor probe 4 |
| T35 `testing.md` rewrite | ✅ Done | DOC-01 probe green |
| T37 turbo + CI workflow | ⚠️ **Partial** | last Done-when **OPEN**: *"the workflow runs green on the feature branch (run URL in the commit body)"*. Nothing is pushed during Execute and the owner has not authorized a push. Not verifiable here; not a defect in the code. |
| T38 gate shape test | ✅ Done | `scripts/platform/__tests__/gates.test.mjs` |
| T40 closure | ✅ Done | — |

---

## Spec-Anchored Acceptance Criteria

22 live requirements (32 total − 10 cut). Evidence-or-zero; every row anchored at `c0d0bba`.

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| **HRN-01** `createE2eApp` factory + defaults | `{app,http,close}`, `rateLimiter:"allow-all"`, `middleware:"full"` | `shared/test/e2e/app.ts:52` def; `:58` `(opts.rateLimiter ?? "allow-all")`; `:68` `(opts.middleware ?? "full")` | ✅ PASS |
| **HRN-01** `Test.createTestingModule` in **exactly one** file across `apps/api/**` + `catalog/**` | exactly 1 | **4 files**: `e2e/app.ts:55` (legit) + `openapi-config.spec.ts:97` + `auth-seam.spec.ts:123` + `identity.module.spec.ts:53`. Guard rule `single-testing-module` `scan.ts:78` exists; the 3 extras are **baselined** | ⚠️ Not met (baselined) |
| **HRN-02** `resetDb(pool, schemas)` truncates, throws on unknown schema | throw before executing | `int/db.ts:106` def; `:78-82` `throw new Error(\`resetDb: schema desconhecido — ${unknown.join(", ")}...\`)`; tested `int/db.spec.ts:33` (6 `it`s) | ✅ PASS |
| **HRN-02** no module-named truncation helper in the kernel harness | none | `git grep truncateIdentity\|truncateAttachment\|truncateTag c0d0bba -- apps/api/src/shared` → 0 hits (they live in the entry barrels, as designed) | ✅ PASS |
| **HRN-03** `drainOutbox` polls until `until` or times out with a named error | error names the timeout | `e2e/outbox.ts:26` def, tested `outbox.spec.ts:30` (4 `it`s); `e2e/wait-for.ts:17` def, `:37` `throw new Error(\`waitFor: ${label} não ocorreu em ${timeoutMs}ms${cause}\`)` | ✅ PASS |
| **HRN-03** no test uses `setTimeout` / a hand-rolled loop as proof | zero | **No guard rule exists** — `scan.ts` has 9 rules, none for `setTimeout` (confirmed at runtime: `rules=9`). ≥10 live occurrences, e.g. `catalog/attachment/api/__e2e__/access-link-avatar-ownership.e2e-spec.ts:35` `await new Promise((resolve) => setTimeout(resolve, 25))` | ❌ **Not covered** |
| **HRN-04** `expectProblem` asserts content-type, status, type suffix, remaining fields | all four | `e2e/problem.ts:19` def; `:20` `expect(res.headers["content-type"]).toContain("application/problem+json")`; `:23` `expect(body.status).toBe(expected.status)`; `:24-26` type suffix via `toContain`; `:27-31` `title/detail/code` by equality. Tested `problem.spec.ts:18` (5 `it`s) | ✅ PASS |
| **HRN-04** `cookieValue`/`cookieHeader` the only `Set-Cookie` readers | sole readers | `e2e/http.ts:8` `cookieHeader`, `:13` `cookieValue`; tested `http.spec.ts:10` (6 `it`s); competing readers banned by `BANNED_HELPERS` (`extractCookieValue`, `parseSetCookie`) `scan.ts:34-45` | ✅ PASS |
| **HRN-05** pool owned by the harness; `createTestPool()` never inside an `it` | zero in-test calls | `e2e/app.ts:87` `withE2ePool`; guard `pool-owned-by-harness` `scan.ts:97-102` `context.insideTest && /\bcreateTestPool\s*\(/`. **Zero baseline entries for this rule** → the absolute clause actually holds | ✅ PASS |
| **HRN-06** guard fails on each of 11 local helper defs + PNG byte + web origin + password literal | 14 banned patterns | `BANNED_HELPERS` `scan.ts:34-45` = exactly the 11 names in AC6; `HELPER_DEFINITION` `:47-49`; `no-harness-literal` `:87-95` — `iVBORw0KGgo`, `/https?:\/\/localhost:5173/`, `/password\s*:\s*["'`]/i`, `/(?:const\|let\|var)\s+[A-Z_]*PASSWORD[A-Z_]*\s*=/`. Seeded-violation tests `harness-hygiene.spec.ts:38` (11 `it`s, one per ban) + `scan.spec.ts` (20 `it`s vs `violations.fixture.ts`) | ✅ PASS |
| **ENT-01** identity barrel exports the 7 symbols; `seedUser` handles `"master"` with demotion | demote previous master | `catalog/identity/single-tenant/api/testing/index.ts:2-9`; `seed-user.ts:26` def; `:34-40` `if (opts.accessProfile === "master") { await pool.query("UPDATE identity.users SET access_profile = 'admin' WHERE access_profile = 'master'") }` | ✅ PASS |
| **ENT-02** notification / attachment / tag / audit barrels | named symbols, `getStream` included | notification `testing/index.ts:1-3` → `DELIVERY_DISPATCHERS` (`delivery-dispatchers.ts:10`), `fakeMailer` (`fake-mailer.ts:3`), `findSent` (`find-sent.ts:11`); attachment `index.ts:2,7,8` → `inMemoryStorage` (`in-memory-storage.ts:13`, methods `put:17 getStream:21 head:26 delete:38 putStream:42`), `PNG_1PX` (`png-1px.ts:2`), `seedAttachment` (`seed-attachment.ts:18`); tag `make-tag.ts:8`/`seed-tag.ts:9`; audit `make-audit-entry.ts:19`/`seed-audit-entry.ts:9` | ✅ PASS |
| **ENT-03** cross-entry `testing/` import requires `dependsOn`; cycles rejected (AD-025) | fail unless declared; fail on cycle | Only cross-entry barrel import in the tree: `identity/.../api/testing/index.ts:3` `export { fakeMailer } from "../../notification/testing"`, legal (`identity.module.json:7` dependsOn `notification`). Tests: `scripts/platform/__tests__/catalog-testing-imports.test.mjs:64-77` undeclared → 1 error `/importa tag\/testing sem tag em dependsOn$/`; `:79-89` declared → `[]`; `:91-100` own barrel → `[]`; `:102-117` cycle → `/fecha ciclo em dependsOn: notification -> identity -> notification$/`. Child-side: `module-boundaries.spec.ts:902-960` (`ruleDOffenses()` → `[]` plus negative cases with file:line) | ✅ PASS (see Sensor 4 for the evasion) |
| **ENT-04** `module.json.files` ships `testing/**`; `pnpm catalog:check` green | gate | **`module.json.files` does not exist** — no such field in `catalog/schema/module.schema.json` or `manifest.mjs`; confirmed absent from all 5 manifests at `c0d0bba`. Judged instead on `catalog:check` + REL-04: entries all at `2.1.1` at `c0d0bba` ✅. **`pnpm catalog:check` exit 7** — died on the concurrent storage refactor | ❌ **Unproven** (gate contaminated) |
| **ENT-05** `test/setup/` only runner plumbing; `unit-env.ts` imports the shared env block | 7 plumbing files only | `RUNNER_SETUP_ALLOWLIST` `scan.ts:53-61` = the 7 named files; rule `runner-setup-allowlist` `:130-135`. But 4 non-plumbing files remain, **baselined**: `app-factory.ts`, `cookies.ts`, `test-db.ts`, `test-logger.ts` | ⚠️ Not met (baselined) |
| **UNT-01** `mockOf`/`fixedClock`/`fakeRequestContext`/`fakeLogger` exported | present | `unit/mock-of.ts:14`, `unit/clock.ts:5`, `unit/request-context.ts:8`, `unit/logger.ts:13`; tested `mock-of.spec.ts:10`, `clock.spec.ts:6`, `request-context.spec.ts:7`, `logger.spec.ts:6` | ✅ PASS |
| **UNT-01** `Record<string, any>` in **no** spec; `as never`/`as unknown as` only under `shared/test/**` | zero | Rules exist (`typed-deps` `scan.ts:104-108`, `no-unsafe-cast` `:110-116`) but ~25 `typed-deps` + ~200 `no-unsafe-cast` occurrences remain, all **baselined** | ⚠️ Not met (baselined) |
| **UNT-02** `withTestDb({schemas})` registers its own hooks; `testRedisUrl`/`flushRedis` | hooks registered | `int/with-test-db.ts:32` def, `beforeAll:44`, `beforeEach:51` `await resetDb(require().pool, opts.schemas)`, `afterAll:55`; `int/redis.ts:5` `testRedisUrl`, `:14` `flushRedis` | ✅ PASS |
| **UNT-02** no int-spec starts a `GenericContainer` | zero | Rule `no-container-in-int-spec` `scan.ts:124-128` exists, but 2 int-specs still do, both **baselined**: `redis-rate-limiter.int-spec.ts` (3), `notification/.../realtime.int-spec.ts` (2) | ⚠️ Not met (baselined) |
| **UNT-03** `<Aggregate>.fromProps({` in no spec outside a `testing/` barrel | zero | Rule `no-from-props` `scan.ts:118-122` exists; ~100 occurrences remain across identity/attachment/tag specs, all **baselined** | ⚠️ Not met (baselined) |
| **UNT-04a** unstubbed `mockOf` method rejects naming the method | error names the method | `unit/mock-of.ts:27` `vi.fn(() => Promise.reject(new Error(\`${property} not stubbed\`)))`; tested `mock-of.spec.ts:10` (5 `it`s) | ✅ PASS |
| **UNT-04b** the four interaction-heaviest identity specs each assert the changed fields of the saved entity | 4 named specs, field-level assertions | **No evidence located.** The spec never names the four specs; no guard rule and no test enforces it | ⚠️ **Spec-precision gap** |
| **LNT-01** vitest rules as errors on api+web; `testing-library`+`jest-dom` on web | severity 2 | `packages/eslint-config/config.test.js:62-68` `assert.equal(severityOf(rules, ruleId), 2)` for `no-focused-tests`/`no-disabled-tests`/`expect-expect`/`no-conditional-expect` on `API_TEST_FILE` (`:17`); `:78-84` same on `WEB_TEST_FILE` (`:18`); `:86-91` `testing-library/*` = 2; `:93-98` `jest-dom/*` = 2; `:70-75` jest-dom `undefined` on api; `:113-126` non-test file → `undefined`. Independently confirmed by probe 3 on **real** paths | ✅ PASS |
| **LNT-02** `no-existence-only-assert` reports the 6 existence forms, exempts value/`assertions(n)`/`not.toThrow(X)` | report vs not-report | Rule `packages/eslint-config/rules/no-existence-only-assert.js:111` (`create:125`); RuleTester `rules/no-existence-only-assert.test.js:16` — invalid `toBeDefined:34`, `toBeUndefined:38`, `toBeTruthy:42`, `toBeFalsy:46`, `resolves:50`, `rejects:54`, argument-less `not.toThrow():58`; valid value-after-existence `:19`, `not.toThrow(SyntaxError):23`, `expect.assertions(1):25`. Registered as error on both shells: `config.test.js:101-111` | ✅ PASS |
| **STR-04** `it` count non-decreasing vs baseline | exit 0, no drop beyond the one allowed removal | probe `node scripts/platform/it-count.mjs --check .specs/.../baseline.json` → **exit=0**, `sem queda: 339 arquivos, 2200 testes`. Confirms the single documented removal (`create-user-flow.e2e-spec.ts`, *"seed master e promoção via SQL"*, `d86a87a`, 11→10) is the **only** removal in the range | ✅ PASS |
| **WEB-01** web harness exports in `apps/web/src/shared/test/`; `fixed-clock.ts` deleted | 6 exports + deletion | Both shells: `renderWithProviders` `render-with-providers.tsx:25`, `makeTestQueryClient` `:11`, `createQueryWrapper` `create-query-wrapper.tsx:13`, `mockRouter` `mock-router.tsx:29` (vite) / `:37` (next) built from `mock-router.tsx:5` `const routerState = vi.hoisted(() => ({`, `resetAuthState` `reset-auth-state.ts:7`, `useMswServer` `use-msw-server.ts:12`. `fixed-clock*` absent from both shells at `c0d0bba`. Harness has its own tests (9 `it`s across 5 files per shell) | ✅ PASS |
| **CI-01** CI jobs `quality`/`test-unit`/`test-coverage`/`contract`; shuffled `api-e2e`; `.nvmrc`+`packageManager` | gate | Gate stages 1/2/3/6/7 all red on the concurrent storage refactor. T37's own last Done-when (*workflow green on the branch, run URL*) is **OPEN** — nothing pushed, no owner authorization | ❌ **Unproven** (gate contaminated + Done-when open) |
| **CI-02** pre-push `migrations → typecheck → catalog-typecheck → test-coverage`, Docker-bound, blocks below any per-glob floor; no `test*` in turbo/manifests | exact order + floors | `gates.test.mjs:109-118` `assert.equal(prePush.piped, true)` + keys `["migrations","typecheck","test-coverage"]` (`catalog-typecheck` is template-only, in `lefthook-local.yml`); `:138-158` merged `assert.deepEqual(orderByPriority(commands), [migrations, typecheck, catalog-typecheck, test-coverage])`; `:171-179` only `test-coverage` matches `/\bpnpm test:(coverage|int|e2e|db)\b/`; `:76-80` `assert.deepEqual(testTasks, [])` on `turbo.json`; `:82-98` web manifests; `:100-107` api manifest + `assert.equal(manifest.jest, undefined)`. Floors `vitest.coverage.mts` → global 90/90/90/90 + `"apps/api/src/**"` 90 + `WEB_DIR/src/**` 90. Suite green: `pnpm test:scripts` **639/639** | ✅ PASS |
| **DOC-01** `testing.md` free of `Test.createTestingModule` / `test/setup/seed-user` | no match | probe `rg -n 'Test\.createTestingModule\|test/setup/seed-user' docs/test/testing.md` → **exit=1** (no match) | ✅ PASS |

**Status**: ❌ Gaps present — **13 covered · 7 not met at the AC's absolute wording (all baselined by GA-9) · 2 unproven (gate) · 1 spec-precision gap · 1 uncovered ban**

### The systemic finding behind the seven ⚠️ rows

`HRN-01`, `ENT-05`, `UNT-01`, `UNT-02`, `UNT-03` all state their outcome **absolutely**
("SHALL appear in no spec", "no int-spec SHALL start a `GenericContainer`", "exactly one file").
On the tree none of them holds: the violations are recorded in
`apps/api/src/shared/test/hygiene/harness-hygiene-baseline.json` (~130 files, 535 live violations
across 9 rules). What actually shipped is **forward-only enforcement** — new violations fail, old
ones are frozen and may only shrink.

That is a legitimate engineering choice and it is exactly why the spec **cut** `STR-01`, `STR-03`
and `WEB-02` on 2026-08-24 with the reason *"baselined by GA-9"*. The defect is that the same
reasoning was not applied to `HRN-01`/`ENT-05`/`UNT-01`/`UNT-02`/`UNT-03`, whose absolute clauses
were left live and unamended. **Spec-precision gap, not silently passed** — the orchestrator must
either amend these five ACs to the forward-only wording or open follow-up tasks to drain the
baseline. I am not deciding which.

---

## Discrimination Sensor

**Mutation sensor NOT run — blocked with cause.** The traceless protocol requires
`git status --short` clean on the target file, injection, a scoped run, then
`git checkout -- <file>`. With another agent committing to this checkout every ~90 s
(4 commits observed during this run), `git checkout --` can destroy that agent's uncommitted work
and its `git add -A` can capture my injected defect into `main` of a template repo that ships to
child products. Both harms are irreversible; the sensor's value does not justify them.

Substituted: **four non-mutating discrimination probes**, aimed exactly where the payload said the
feature is weakest. They test the same property (does the guard reject bad input?) by feeding
synthetic input to the shipped checkers — for a feature whose deliverable *is* guards, this is
near-equivalent, and it touches no tracked file.

| # | Probe | Target | Method | Result |
| --- | --- | --- | --- | --- |
| 1 | **A guard that passes because it scans nothing** | `scan.ts` `collectScanFiles`/`scanFiles` | called on the real tree with roots `["apps/api","catalog"]` | ✅ **Killed** — `files_scanned=828 violations_found=535 rules=9`. The scanner reaches the tree and every rule fires. |
| 2 | **A baseline that swallows a new violation** | `scan.ts:255` `compareToBaseline` | injected **one extra** `typed-deps` into `cancel-access-link.use-case.spec.ts` (baseline records exactly 1) | ✅ **Killed** — clean tree `unrecorded=0`; with one extra `unrecorded=2`, first = `typed-deps · catalog/.../cancel-access-link.use-case.spec.ts:1 · function makeDeps(over: Record<string, any> = {}) {}` |
| 2b | **A baseline that goes stale into an allow-list** | same | removed all violations from a baselined file | ✅ **Killed** — `stale=1`: `baseline registra 1, a árvore tem 0 — rode o gerador do baseline`. The file cannot silently become an allow-list. |
| 3 | **A lint rule registered but not reaching the globs it claims** | flat config resolution | `eslint --print-config` on **real** paths, not the synthetic ones `config.test.js` uses | ✅ **Killed** — `apps/api/src/shared/test/e2e/problem.spec.ts` and `apps/api/test/security-bootstrap.e2e-spec.ts`: all four `vitest/*` rules `= 2` and `platform/no-existence-only-assert = 2`. `apps/web-vite/src/shared/test/mock-router.test.tsx`: `vitest/no-focused-tests = 2`, `platform/no-existence-only-assert = 2`, `testing-library/no-node-access = 2`, `jest-dom/prefer-to-have-text-content = 2`. |
| 4 | **RULE D accepting an import it should reject** | `catalog-lint.mjs` `lintTestingImports` | synthetic 3-entry fixture outside the repo, 8 specifier forms | ❌ **Partially survived** — see below |

### Probe 4 detail — RULE D's reach

Fed one synthetic `identity` entry (`dependsOn: ["notification"]`) importing `tag/testing` eight ways:

| Specifier | Should reject? | RULE D |
| --- | --- | --- |
| `export { fakeMailer } from "../../notification/testing"` (declared) | no | ✅ not flagged |
| `import { a } from "../../tag/testing"` | yes | ✅ flagged |
| `import { b } from "../../tag/testing/make-tag"` (deep) | yes | ✅ flagged |
| `import { c } from "../../tag/testing/index"` | yes | ✅ flagged |
| `import type { F } from "../../tag/testing"` (type-only) | yes | ✅ flagged |
| `import { d } from "@/modules/tag/testing"` (alias) | yes | ❌ **missed** |
| `import { e } from "src/modules/tag/testing"` (bare) | yes | ❌ **missed** |
| `const g = await import("../../tag/testing")` (dynamic) | yes | ❌ **missed** |

Cause: `testingEntryOf` (`catalog-lint.mjs:134`) returns `null` for any specifier not starting with
`.`, and `IMPORT_SPECIFIER` (`:110-111`)
`/\b(?:import|export)\s+[^"';]*?\s*from\s*["']([^"']+)["']/g` requires a `from` clause, so
`await import("…")` never matches.

**Severity, honestly assessed**: the two non-relative forms are **not currently exploitable** —
`apps/api/tsconfig.json` declares no `baseUrl` and no `paths`, so neither alias resolves today.
The **dynamic-import hole is live**: `await import("../../tag/testing")` resolves at runtime and
RULE D never sees it. Minor, but it is a real hole in an AD-025 rule that reaches every child.
`export … from` — the form the one real cross-entry import actually uses — **is** covered.

**Sensor depth**: default 3 required → 4 probes run (mutation sensor blocked with cause)
**Result**: 3 of 4 killed, 1 partially survived → ❌

---

## Edge Cases

- [x] `createE2eApp({ middleware: "none" })` still silences the logger and returns a closable app — one factory, one option (`e2e/app.ts:68`).
- [x] `drainOutbox` calls the dispatcher's public `poll()` directly rather than waiting on the interval (`e2e/outbox.ts:26`).
- [x] Guard exempts itself and skips `.catalog-stage` — `IGNORED_SEGMENT` `scan.ts:13-14`, `GUARD_DIR` `:19`; covered by `scan.spec.ts`.
- [x] `not.toThrow(SomeError)` not reported — only the argument-less form (`no-existence-only-assert.test.js:23`).
- [x] Titles preserved verbatim so the baseline maps by title — STR-04 probe exit 0 confirms.
- [x] Guard runs in a child without `catalog/` — `collectScanFiles` takes roots; `BARREL_FILE` `scan.ts:24` matches `testing/` at any depth, so `apps/api/src/modules/*/testing/**` is recognised.
- [ ] **`--sequence.shuffle` on the e2e suites** — not observed. STR-02 (the repo-wide shuffle proof) is cut, and the surviving half (shuffle on `api-e2e` via T37) sits inside the CI workflow that has never been run. Unverified.

---

## Gate Check

- **Gate command** (`tasks.md` § *Gate Check Commands*, `final` row): `pnpm check && pnpm test:coverage && pnpm contract && git diff --exit-code openapi.json && pnpm catalog:check && pnpm template:smoke && pnpm test:scripts && node scripts/platform/it-count.mjs --check .specs/features/test-suite-refactor/baseline.json`
- **Run once**, deliberately **stage-by-stage rather than `&&`-chained**, so a contaminated early
  stage could not hide `catalog:check`, `test:scripts` and the `it`-count probe behind it.

| # | Stage | Exit | Attribution |
| --- | --- | --- | --- |
| 1 | `pnpm check` | **2** | ❌ concurrent — 11 TS errors, all `apps/api/src/shared/infra/storage/**` `R2_* → STORAGE_*`; `*:lint` killed by turbo, no independent diagnostics |
| 2 | `pnpm test:coverage` | **1** | ❌ concurrent — 4 files / 3 tests failed on `Cannot find module './r2-storage.adapter'` + `storage.config.spec.ts`. **Aborted before the coverage report — no global or per-glob % was emitted** |
| 3 | `pnpm contract` | **1** | ❌ concurrent — `TS2307 storage.module.ts(4,34)` |
| 4 | `git diff --exit-code openapi.json` | 0 | ✅ clean |
| 5 | restore `openapi.json` | 0 | `git status --short -- openapi.json` empty |
| 6 | `pnpm catalog:check` | **7** | ❌ concurrent — same `TS2307` inside the `notification` module-add dry run |
| 7 | `pnpm template:smoke` | **7** | ❌ concurrent — child `api#typecheck` exits 2, same cause |
| 8 | `pnpm test:scripts` | **0** | ✅ **639 passed, 0 failed, 0 skipped** |
| 9 | `it-count --check` | **0** | ✅ `sem queda: 339 arquivos, 2200 testes` |

- **Result**: 2 of 9 stages green, 2 informative, **5 red — none attributable to this feature**
- **Test count before feature**: `baseline.json` (T1 snapshot at `d1ba876`)
- **Test count after feature**: 339 files / 2200 tests
- **Delta**: no drop anywhere; the single documented removal is accounted for
- **Skipped tests**: none
- **Coverage**: **not measured** — stage 2 aborted before the report. The 90 floors are declared in `vitest.coverage.mts` but were not exercised this run.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ — the 2026-08-24 cut is respected; no cut requirement was implemented anyway |
| Matches patterns | ✅ |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ — 7 ACs' absolute wording is met only forward-only |
| Per-layer Coverage Expectation met | ⚠️ — harness/guard/lint/tooling layers fully met; the entry layers ride on `catalog:check`, unproven this run |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| Documented guidelines followed | ✅ `docs/test/testing.md` (rewritten by T35), `docs/code-quality.md` |

Two nits worth recording, neither a defect:
- ENT-02 asks for `FakeMailer`; the barrel exports `fakeMailer` (`notification/api/testing/index.ts:2`) — a factory function, not a class. The capability is there; the spec's casing is stale.
- `catalog/**` is **not** covered by `pnpm lint` (`turbo lint` runs only `api`, `web`, `web-next`; there is no root `eslint.config.js`). Entry specs are linted only once rendered into a child. That matches the kernel/catalog split and LNT-01's declared proof, but it means the lint half of "tests prove values" reaches the catalog only via `catalog:check`/`template:smoke` — both red this run.

---

## Fix Plans

### Fix 1: Re-run the Final gate on a quiescent checkout — **Blocker**

- **Root cause**: another agent committed 4× to `main` during verification and left a half-finished
  `r2-storage.adapter` → `s3/null-storage.adapter` refactor in the tree. 5 of 9 gate stages died on it.
- **Fix task**: serialize Execute and Verify on this checkout. Re-run the `final` gate once the tree
  is quiescent; `ENT-04` and `CI-01` cannot be closed until `pnpm catalog:check` and
  `pnpm test:coverage` complete. Coverage was never measured.
- **Priority**: Blocker

### Fix 2: Five ACs assert an absolute end-state that GA-9 only enforces forward — **Major**

- **Root cause**: `HRN-01`, `ENT-05`, `UNT-01`, `UNT-02`, `UNT-03` were left absolute while
  `STR-01`/`STR-03`/`WEB-02` were cut on 2026-08-24 for precisely the reason that applies to them
  ("baselined by GA-9"). 535 live violations sit in the baseline.
- **Fix task**: owner decision — amend the five ACs to forward-only wording, **or** open drain
  tasks. Do not let a green guard read as a met absolute.
- **Priority**: Major (spec-precision)

### Fix 3: HRN-03's `setTimeout` ban is prose only — **Major**

- **Root cause**: `scan.ts` ships 9 rules and none of them looks for `setTimeout` / hand-rolled
  poll loops. ≥10 live occurrences, e.g. `access-link-avatar-ownership.e2e-spec.ts:35`.
- **Fix task**: add a `no-sleep-as-proof` rule to `HYGIENE_RULES` (baseline the current
  occurrences, exempt the deliberate stream-timing ones like `attachment-download.e2e-spec.ts:500`),
  or amend HRN-03 to drop the clause.
- **Priority**: Major — the ban is currently unenforceable, and it is the one AD-023 promise a
  future author is most likely to break.

### Fix 4: RULE D misses dynamic `import()` — **Minor**

- **Root cause**: `IMPORT_SPECIFIER` (`catalog-lint.mjs:110-111`) requires a `from` clause.
- **Fix task**: extend the regex to `import(...)` call form; add a RuleTester case to
  `catalog-testing-imports.test.mjs`. The alias/bare forms are unreachable today (no `paths` in
  `apps/api/tsconfig.json`) — guard them only if aliases are ever introduced.
- **Priority**: Minor

### Fix 5: T37's last Done-when is open — **Minor (process)**

- **Root cause**: *"the workflow runs green on the feature branch (run URL in the commit body)"*
  requires a push; Execute pushes nothing and the owner has not authorized one. Nothing was pushed
  by this Verifier.
- **Fix task**: owner pushes the branch and pastes the run URL, or the Done-when is retired as
  not-provable-in-repo (the same treatment WEB-03/AC3 already received).
- **Priority**: Minor

### Fix 6: UNT-04b names no artifact — **Minor**

- **Root cause**: *"the four interaction-heaviest identity specs SHALL each assert the changed
  fields of the saved entity"* never names the four specs, and nothing enforces it.
- **Fix task**: name the four specs in the spec, or drop the clause.
- **Priority**: Minor (spec-precision)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| HRN-02, HRN-04, HRN-05, HRN-06 | In Tasks | ✅ Verified |
| ENT-01, ENT-02, ENT-03 | In Tasks | ✅ Verified |
| LNT-01, LNT-02 | In Tasks | ✅ Verified |
| STR-04, WEB-01, CI-02, DOC-01 | In Tasks | ✅ Verified |
| HRN-01, ENT-05, UNT-01, UNT-02, UNT-03 | In Tasks | ⚠️ Verified forward-only — AC wording needs amendment (Fix 2) |
| HRN-03 | In Tasks | ❌ Needs Fix (Fix 3) |
| UNT-04 | In Tasks | ⚠️ (a) Verified · (b) spec-precision gap (Fix 6) |
| ENT-04, CI-01 | In Tasks | ❌ Unproven — gate contaminated (Fix 1) |

---

## Summary

**Overall**: ❌ Not Ready — **to re-verify, not to rebuild**

**Spec-anchored check**: 13/22 fully covered · 7 met forward-only against absolute ACs · 2 unproven · 2 spec-precision gaps (UNT-04b, and the five absolute ACs of Fix 2)
**Sensor**: mutation sensor blocked with cause; 4 substitute discrimination probes — 3 killed, 1 partially survived
**Gate**: 2/9 stages green, 5 red and none attributable to this feature; coverage never measured

**What works** — and it is most of the feature:
- The kernel harness is real and self-tested: `createE2eApp`, `resetDb` (with the unknown-schema
  throw), `withTestDb`, `drainOutbox`, `waitFor`, `expectProblem`, `mockOf` (unstubbed → reject),
  each with its own spec, 60+ `it`s under `shared/test/**`.
- The hygiene guard genuinely scans 828 files, fires 9 rules, finds 535 violations, and its
  baseline can move in only one direction — both directions probed and killed.
- Five entry `testing/` barrels exist and export what ENT-01/ENT-02 name, `getStream` included.
- RULE D is enforced twice (catalog-lint + `module-boundaries.spec.ts`) with real negative cases.
- The lint rules resolve at severity 2 on **real** api and web harness paths, not just the
  synthetic ones the config test uses.
- The web harness landed in both shells; `fixed-clock.ts` is gone.
- No test was lost: 339 files / 2200 tests, the one documented removal accounted for, no second
  removal anywhere in the range.
- `pnpm test:scripts` 639/639.

**Issues found**: Fixes 1–6 above, ranked.

**Next steps**: quiesce the checkout, re-run the `final` gate (Fix 1), then take the owner decision
in Fix 2. Fixes 3–6 are independent and can be scheduled. **No code or test was modified by this
Verifier.**
