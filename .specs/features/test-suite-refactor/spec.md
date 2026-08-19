# Test suite refactor — harness, reuse, gates — Specification

**Scope:** Complex (cross-cutting over 250+ test files, new shared-harness pattern, new lint rules, CI from zero; gray areas GA-1..GA-7 in `context.md`).
**Unifies with / absorbs:** `pre-push-coverage-95` (the coverage feature) — its COV-01..10 requirements and remaining waves 2–3 (T3, T9, T10 remnant, T11) continue here as COV-01..11; its T4–T8 (module-tree fills) are void after v1 T22 (trees leave the template denominator). That feature is closed as "absorbed by test-suite-refactor".
**Sequencing constraint:** runs **after `v1-kernel-only-module-catalog` wave 4 (T22 cutover)** and takes over its T26 (`docs/test/testing.md` rewrite). Test code is refactored once, in its final home: kernel in the template, modules in `catalog/<entry>/api/**`.

## Problem Statement

The test *setup* is above market standard (unit / int / e2e tiers on testcontainers, per-worker template DB clone, nyc-merged cross-tier coverage, Redis flush per test) but the test *code* reuses almost nothing: 24/31 e2e files re-implement the app bootstrap that `test/setup/app-factory.ts` already centralizes, 12 local `login→cookie` helpers plus 6 inline copies, 19 local `makeUser` builders, 33 `makeDeps()` factories typed `Record<string, any>`, 5 ways to read `Set-Cookie`, 5 assertion styles for RFC 7807, two int-specs booting their own Redis container. Weak proofs survive the handbook rule L-007 (24 `toBeDefined`, 22 bare `not.toThrow()`, 6 `rejects.toBeDefined()` on web guards), e2e suites depend on `it` order, 20 `createTestPool()` sites leak on failure, `.github/` does not exist and `docs/test/testing.md` documents a CI that never ran. Nothing mechanical stops `.only`, `expect`-less tests, or the next copy of a helper. v1 is about to copy today's patterns into five catalog entries that children will own — the refactor must land before children inherit the debt.

## Goals

- [ ] One importable, module-agnostic api harness (`apps/api/src/shared/test/**`) + entry-owned `testing/` barrels; zero inline app bootstraps, zero local login/cookie/truncate/poll/storage helpers in any `*.e2e-spec.ts`.
- [ ] Unit/int specs build doubles and fixtures from shared factories (`mockOf`, `fixedClock`, `fakeRequestContext`, `withTestDb`, entry `make<Entity>`); zero `Record<string, any>` deps, `as never` / `as unknown as` casts only in the harness itself.
- [ ] Every test proves a value: lint forbids `.only`/`.skip`, `expect`-less tests, existence-only asserts; the audit's weak spots are strengthened, none deleted; `it` count never decreases.
- [ ] Gates exist and run: CI workflow (check → unit+cov → int → e2e → contract → coverage-all), pre-push unchanged (Docker-free) with the 95% unit/web bar from `pre-push-coverage-95` reached on the kernel-only denominator.
- [ ] `docs/test/testing.md` describes the real harness (kernel + entry), the lint rules, the CI, and the parity convention (absorbs v1 T26).

## Out of Scope

| Feature | Reason |
| --- | --- |
| Moving module code/tests into `catalog/` | v1 T22; this feature starts after it |
| Filling unit coverage of catalog entries to 95% | entries are gated by `catalog:check` (v1 CAT-02/T24/T28); this feature only migrates entry tests to the harness and fills the two gaps named below (tag use-cases, delivery repo) because the audit found them |
| Raising the nyc combined floor (85/51/90/90) | not changed — still `test:cov:all` off-hook |
| Mutation-testing tool (Stryker) in CI | the Verifier's sensor is manual/bounded; a permanent tool is a follow-up |
| Visual/e2e browser tests for web | template web is a shell after T22 |
| `packages/api-client` tests | generated output |
| In-memory fake repositories for every port | GA-3: typed mocks by default; stateful fakes only where state is asserted |
| Rewriting `docs/back/back-arch.md` § Testes | v1 HBK-02 owns it; this feature updates only `docs/test/testing.md` and links |

---

## Unification with the two live specs

| Spec | What this feature takes | What it leaves |
| --- | --- | --- |
| `v1-kernel-only-module-catalog` | T26 (`testing.md` rewrite — the harness and parity sections are written here, once); the home `apps/api/src/shared/test/**` (already allow-listed by RULE C, hosts `parity/contract-snapshot.ts`); entries' `testing/` barrel becomes part of the entry anatomy (README § Tests) | everything else; v1 waves 3–6 run first; this feature is listed in v1 `spec.md` § Out of Scope as the successor for test-infra |
| `pre-push-coverage-95` | COV-01..COV-10 (re-numbered here as COV-01..10, unchanged semantics) and tasks T3, T9, T10, T11 re-targeted to the post-T22 denominator | T1, T2 (done: `c264827`, `3e09e3b`), T4–T8 (void); the old folder was deleted on 2026-08-19 (history in git) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| GA-1 sequencing | after v1 T22 cutover, before v1 T26 | files touched once in final home; coverage fills target the real denominator | n — default; (a)/(b) in context.md |
| GA-2 harness home | runner plumbing stays `apps/api/test/`; importables in `apps/api/src/shared/test/{unit,int,e2e}/`; entry helpers in `catalog/<entry>/api/testing/` | RULE C forbids module vocabulary in `shared/**`; entries are copied with their helpers | n |
| GA-3 doubles | `mockOf<T>()` typed mocks; stateful `InMemory*` only when state is asserted, entry-owned | 740 `jest.fn(` sites; avoid a parallel repo implementation per entry | n |
| GA-4 fixtures | one `make<Entity>(overrides)` per aggregate + named constants in the entry `testing/` barrel | 19 `makeUser` copies, 186 `@example.com` literals | n |
| GA-5 lint | `eslint-plugin-jest` (api), `@vitest/eslint-plugin` + `testing-library` + `jest-dom` (web) + local `no-existence-only-assert` | L-007 is prose today; 24 `toBeDefined` survive | n |
| GA-6 CI | `.github/workflows/ci.yml` (extend v1's file if T24 lands one first); pre-push stays Docker-free | `.github/` absent; `testing.md` § CI describes a pipeline that does not exist | n |
| GA-7 non-weakening proof | `it` count per original file ≥ before; sensor mutant list killed; lint blocks skips | refactor must not buy simplicity with lost proof | n |
| Coverage denominator after T22 | excludes `apps/api/src/shared/test/**`, `apps/api/src/modules/*/testing/**`, `catalog/**` (catalog is not in `apps/api`), test files, `main.ts`; web excludes unchanged | inherits COV-04 + GA-2 | n |
| Web scope after T22 | template web = router shell, providers, transport, error/not-found pages, shared/lib; session/login live in the identity entry (`web/core`, `web/react`) and their tests go with them | v1 GA-3/AD-018 | y (from v1) |
| Ordered `it` chains | split into independent `it`s sharing a `beforeEach` seed; the "seed master" pseudo-test is removed (it asserted `toBeTruthy` only) — the only removal allowed, it asserts nothing | testing.md § Isolamento | n |
| Redis in int-specs | the two container-booting int-specs use the global container (`testRedisUrl()` + `flushRedis()`); `flushRedis` moves to the int harness | ~60 s saved per file; one runtime | n |
| `ORIGIN`/`TEST_PASSWORD`/dates | exported from harness (`E2E_ORIGIN` reads `process.env.WEB_ORIGIN`), `TEST_PASSWORD` one literal, `FIXED_NOW` one ISO | 26 / 12 / 217 literal sites | n |

**Open questions:** none unmarked — every row is a default the owner can flip on this spec before Design is approved.

---

## User Stories

### P1: Kernel api harness is the only way to boot, seed, and assert in e2e ⭐ MVP

**User Story**: As a test author (template or entry), I want one harness that boots the app, resets the database, drives the outbox, and asserts problem responses so that an e2e file contains only the flow under test.

**Why P1**: 21 inline bootstraps, 18 login copies, 29 truncate preludes — the largest duplication in the repo, and the pattern v1 entries would copy.

**Acceptance Criteria**:

1. WHEN `apps/api/src/shared/test/e2e/` is read THEN it SHALL export `createE2eApp(opts: { rateLimiter?: "allow-all" | "real"; overrides?: Array<[token, value]>; extraModules?: Type[]; middleware?: "full" | "none" })` returning `{ app, http, close }` where `http = app.getHttpServer()`, default `rateLimiter: "allow-all"`, default `middleware: "full"` (versioning + `applySecurity` + request-context middleware — mirrors `main.ts`), and `close()` calls `app.close()` — `Test.createTestingModule` SHALL appear in exactly one file under `apps/api/**` and `catalog/**` (the factory).
2. WHEN `resetDb(pool, schemas: string[])` is called THEN it SHALL truncate every table of the listed schemas (`_kernel` + any entry schema) in one statement, and `apps/api/test/setup/test-db.ts` SHALL export no `truncateIdentity`/`truncateAttachment`/`truncateTag` (module vocabulary) — entries pass their schema names.
3. WHEN `drainOutbox(app, { until?: () => Promise<T | undefined>; timeoutMs?: number })` is called THEN it SHALL call the outbox dispatcher and the delivery dispatcher poll methods until `until` resolves non-undefined or the timeout elapses (rejecting with a message naming the timeout), replacing every hand-rolled poll loop (5 files today) and every `setTimeout`-as-proof (`auth-outbox-email:132`).
4. WHEN `expectProblem(res, { status, type?, title?, detail? })` is called THEN it SHALL assert `content-type` contains `application/problem+json`, `body.status === status`, `body.type` ends with `/<type>` when given, and the other fields by equality when given; `waitFor(predicate, { timeoutMs, intervalMs })` SHALL be the single polling primitive; `cookieValue(res, name)` and `cookieHeader(res)` SHALL be the only Set-Cookie readers (today 5 styles across 13 files).
5. WHEN `resetDb`/`createTestPool` are used in a spec THEN the pool SHALL be owned by the harness (`withE2ePool()` or suite-level `beforeAll`/`afterAll`) — no `createTestPool()` inside an `it` body anywhere (20 sites today; all leak on assertion failure).
6. WHEN a file under `apps/api/test/*.e2e-spec.ts` or `catalog/*/api/**/*.e2e-spec.ts` is read THEN it SHALL define no local function named/behaving as `allowAll`, `login`, `loginAndGetCookie`, `extractCookieValue`, `parseSetCookie`, `linkFromHtml`, `waitFor`, `pollUntil`, `findSent`, `makeInMemoryStorage`, `seedUser` (raw SQL), nor the `PNG_1PX` bytes — grep over those names returns 0 hits outside harness/`testing/` barrels.
7. WHEN a constant `http://localhost:5173` or a password literal is needed THEN specs SHALL import `E2E_ORIGIN` / `TEST_PASSWORD` from the harness; grep for the literal origin in spec files returns 0.

**Independent Test**: `pnpm --filter api test:e2e` green; the greps in AC1/AC6/AC7 return the stated counts.

---

### P1: Entry-owned `testing/` barrels ⭐ MVP

**User Story**: As a catalog entry author, I want my entry to ship its own test helpers (seed, login, fakes, fixtures) so that my tests and my dependents' tests import one barrel and no module vocabulary leaks into the kernel harness.

**Acceptance Criteria**:

1. WHEN `catalog/identity/single-tenant/api/testing/index.ts` is read THEN it SHALL export at least `seedUser(pool, opts)` (with `accessProfile` option incl. `"master"`, demoting a previous master when the unique index requires), `loginAs(http, email, password?) → Promise<string[]>` (cookies), `tokenFromMail(mailer, to, { subject? }) → Promise<string>`, `makeUser(overrides)`, `emails`, `FIXED_NOW`; and the SQL `UPDATE … set access_profile='master'` SHALL appear in no spec (5 sites today).
2. WHEN `catalog/notification/api/testing/index.ts` is read THEN it SHALL export `FakeMailer` (moved from `apps/api/test/setup/fake-mailer.ts`) and `findSent(mailer, { to, subject? })`; WHEN `catalog/attachment/api/testing/index.ts` is read THEN it SHALL export `inMemoryStorage()` (full `ObjectStoragePort`, incl. `getStream`) and `PNG_1PX`, and `seedAttachment(pool, storage, opts)`.
3. WHEN an entry's e2e needs another entry's helper (attachment → identity login) THEN it SHALL import from that entry's `testing/` barrel and the dependency SHALL already be in `module.json.dependsOn` — a boundaries test over `catalog/**` fails on a `testing/` import not backed by `dependsOn`.
4. WHEN `module.json.files` is read THEN it SHALL include the `testing/**` files so `module add` copies them (child path `apps/api/src/modules/<entry>/testing/**`), and the coverage denominator SHALL exclude `modules/*/testing/**`.
5. WHEN `apps/api/test/setup/` is listed THEN it SHALL contain only runner plumbing (`global-setup`, `global-teardown`, `e2e-env`, `int-env`, `unit-env`, `e2e-after-env`, `container-uris`, `docker-runtime`, `scalar-stub`) — `seed-user.ts`, `fake-mailer.ts`, `cookies.ts`, `app-factory.ts`, `test-db.ts`, `test-logger.ts` SHALL have moved to the harness or an entry, and `unit-env.ts` SHALL import the shared env block instead of duplicating `e2e-env.ts:8-19`.

**Independent Test**: entry e2e files import only `shared/test/e2e` + `testing/` barrels; boundaries test green.

---

### P1: Unit and int doubles come from shared factories ⭐ MVP

**User Story**: As a use-case spec author, I want typed mock factories, a fixed clock, a request-context fake and an int-DB harness so that a spec declares only the behaviour it stubs.

**Acceptance Criteria**:

1. WHEN `apps/api/src/shared/test/unit/` is read THEN it SHALL export `mockOf<T>(partial?: Partial<jest.Mocked<T>>): jest.Mocked<T>` (unspecified methods are `jest.fn()` that reject/return `undefined`), `fixedClock(iso = FIXED_NOW): Clock`, `fakeRequestContext(partial?: Partial<RequestContextStore>): RequestContext` with the kernel defaults (`correlationId: "c1"`, `userAgent: "jest"`, `actor: null`), `fakeLogger()`; WHEN a use-case spec's `makeDeps()` is read THEN it SHALL be typed (no `Record<string, any>`; 24 today → 0) and `as never` / `as unknown as` SHALL occur only inside `shared/test/**` (70+84 sites today).
2. WHEN `apps/api/src/shared/test/int/` is read THEN it SHALL export `withTestDb({ schemas }: { schemas: string[] }) → { pool, db, txm, logger }` registering `beforeAll`/`beforeEach(resetDb)`/`afterAll(pool.end)` itself, plus `testRedisUrl()` and `flushRedis()`; WHEN `realtime.int-spec.ts` and `redis-rate-limiter.int-spec.ts` run THEN they SHALL use the global Redis (no `GenericContainer` in any int-spec).
3. WHEN a spec needs a `User` (or any aggregate) THEN it SHALL call the entry's `make<Entity>()`; `User.fromProps({` SHALL appear in no spec outside `testing/` (45 sites / 24 files today), `makeUser` defined in exactly one file per entry.
4. WHEN `makeIdentityConfig` exists THEN no spec SHALL inline `parseIdentityConfig({…})` (4 today); `identity.config.fixture.ts` SHALL move into the identity entry's `testing/`.
5. WHEN a use-case spec asserts the outcome of a write THEN it SHALL assert on the captured entity/state passed to the port (pattern `archive-notification.use-case.spec.ts:28`) or on a stateful fake, not only `toHaveBeenCalled()` — the four interaction-heaviest specs (`request-email-change`, `change-password`, `upload-avatar`, `set-password`) SHALL each assert at least the saved entity's changed fields.

**Independent Test**: `pnpm --filter api test` + `test:int` green; greps in AC1/AC3 at stated counts.

---

### P1: Tests prove values — lint + strengthening ⭐ MVP

**User Story**: As the maintainer, I want the handbook's "what counts as proof" enforced by lint and the audit's weak tests strengthened so that the refactor leaves the suite stronger, not just shorter.

**Acceptance Criteria**:

1. WHEN `pnpm lint` runs on a test file containing `it.only`, `describe.only`, `it.skip`, `xit`, `it.todo`, an `it` with no `expect`/assertion call, or `expect` inside a conditional THEN lint SHALL fail (api via `eslint-plugin-jest`, web via `@vitest/eslint-plugin`); web files using `container.querySelector` or `getByTestId` where a role/label query exists SHALL fail `testing-library` recommended rules.
2. WHEN a test body's only assertions are `toBeDefined()`, `toBeTruthy()`, `toBeUndefined()`, `toBeFalsy()` or `not.toThrow()` without argument THEN the local rule `no-existence-only-assert` (`packages/eslint-config/rules/`, unit-tested like `sr-only-requires-positioned-ancestor.test.js`) SHALL report it; a test that also asserts a concrete value passes.
3. WHEN the refactor lands THEN the following SHALL assert a concrete value: `bucket-sql.spec.ts` (SQL text), `audit-trigger.int-spec.ts:86,112`, `notification-template-registry.spec.ts:29,36`, `pool-metrics.spec.ts:185,211,215`, `application-pool.int-spec.ts:92,112,211`, `load-dotenv.spec.ts:31`, web `router.test.tsx:92,103,110,118` + `shell.integration.test.tsx:31` + `transport.test.ts:74` (redirect target / thrown problem asserted), `create-user-flow` `masterCookie toBeDefined` sites, `docs-login:89,100`, `auth-rate-limit:52,55` (`retry-after` numeric, `type` suffix), `tags:135-141` + `audit:128-144` + `access-catalog:98-103` (403 body via `expectProblem`), `authz:394-401` (asserts 200 + body, not "not 401").
4. WHEN `create-user-flow`, `authz`, `access-link-activation` run with `--randomize` (jest) THEN they SHALL pass — no `it` depends on a previous `it`; the "seed master" pseudo-test is removed.
5. WHEN `user-trash`, `authz` (PUT/POST), `tags` (trash) mutate state THEN at least one assertion per mutation SHALL read the row (pool) or a second endpoint whose response proves the persisted change.
6. WHEN any file migrated by this feature is compared before/after THEN its `it` count (summed across split files) SHALL be ≥ before, except the single removal in AC4.

**Independent Test**: `pnpm lint` with a fixture `.only` fails; `pnpm --filter api test:e2e -- --randomize` green; Verifier's per-file `it` count table.

---

### P1: Web harness adoption ⭐ MVP

**User Story**: As a web test author, I want router/session/query-client helpers in `apps/web/src/shared/test/` so that component tests stop hand-rolling `vi.mock("@tanstack/react-router")` and `new QueryClient`.

**Acceptance Criteria**:

1. WHEN `apps/web/src/shared/test/` is read THEN it SHALL export `renderWithProviders` (existing), `makeTestQueryClient` (existing), `createQueryWrapper(qc)` for `renderHook`, `mockRouter({ navigate?, pathname?, outlet? })` (one `vi.hoisted` shape), `resetAuthState()` (store + `localStorage`), `useMswServer(handlers)` (listen/reset/close lifecycle), and `fixed-clock.ts` SHALL be deleted (0 consumers, product leftover).
2. WHEN a web test mocks `@tanstack/react-router` THEN it SHALL do so through `mockRouter` (7 ad-hoc mocks today → 0); WHEN a test needs a `QueryClient` THEN it SHALL call `makeTestQueryClient`/`createQueryWrapper` (5 inline → 0).
3. WHEN session/login tests still exist in the template after T22 THEN they SHALL use `makeCurrentUser(overrides)` from the identity entry's `web/` testing barrel; if they moved with the entry, the entry carries the fixture.
4. WHEN `render.test.tsx` re-imports `@testing-library/jest-dom/vitest` already loaded by `test/setup.ts` THEN the duplicate import SHALL be removed; `vi.mock` factories SHALL use `vi.hoisted` consistently (2 files rely on closure hoisting).

**Independent Test**: `pnpm --filter web test` green; greps in AC2 at 0.

---

### P2: CI and pre-push gates

**User Story**: As the maintainer, I want the pipeline `testing.md` promises to actually exist so that int/e2e/contract/coverage regressions are caught before merge.

**Acceptance Criteria**:

1. WHEN `.github/workflows/ci.yml` runs on push/PR THEN it SHALL run jobs `check` (`pnpm check`), `unit` (`pnpm turbo test:cov --filter=api --filter=web`, thresholds from COV), `int` (`pnpm --filter api test:int`, Docker service), `e2e` (`pnpm --filter api test:e2e`), `contract` (`pnpm contract && git diff --exit-code openapi.json`), `coverage-all` (`apps/api/scripts/coverage-all.sh`, floors 85/51/90/90); `unit`/`int`/`e2e` SHALL use the same Node from `.nvmrc` and pnpm from `packageManager`.
2. WHEN v1 has already created a workflow (catalog-check) THEN this feature SHALL add jobs to it, not a second file.
3. WHEN `lefthook.yml` pre-push runs THEN it SHALL stay Docker-free (typecheck, migrations check, api `test:cov`, web `test:cov`) — COV-01..03.
4. WHEN `turbo.json` is read THEN `test:cov`, `test:cov:all`, `test:watch` SHALL be declared pipelines with correct `outputs` (`coverage/**`) and `cache: false` for Docker-bound tasks.

**Independent Test**: workflow green on the feature branch; `git push` blocked by a forced <95% fixture.

---

### P2: Coverage bar on the kernel-only denominator (absorbed `pre-push-coverage-95`)

**Acceptance Criteria** (COV-01..COV-10 — semantics unchanged from the absorbed spec; re-stated for traceability):

1. COV-01/02/03 — pre-push runs api `test:cov` + web `test:cov`; any metric <95% blocks; ≥95% never blocks on coverage.
2. COV-04 — denominator excludes test files, `*.d.ts`, `main.ts(x)`, `apps/web/src/shared/test/**`, `apps/api/src/shared/test/**`, `apps/api/src/modules/*/testing/**`, generated client.
3. COV-05/06 — branch % from TypeScript source (contract from the absorbed T2, done); untested source branch keeps the suite <95%.
4. COV-07/08/09/10 — no ignore pragmas; new tests assert observable outcomes / error class+message; dead code deleted not ignored.
5. WHEN fills are needed after T22 THEN they SHALL target `apps/api/src/shared/**` + remaining `apps/api/src/**` (absorbed T3/T9) and `apps/web/src/**` (absorbed T10 remnant); the ratchet (absorbed T11) raises jest/vitest thresholds to 95 and switches lefthook `test` → `test:cov` for api last.

---

### P2: Entry gaps named by the audit

**Acceptance Criteria**:

1. WHEN the tag entry is read THEN `create-tag`, `get-tag`, `restore-tags`, `stash-tag`, `update-tag` use-cases SHALL each have a spec covering happy path + every `throw` in the use-case; WHEN the notification entry is read THEN `drizzle-delivery.repository` SHALL have an int-spec (key query paths + conflict/error).
2. WHEN a cross-entry facade exists (`user-directory`, `permission-catalog`, `tag-directory`, `audit-registry`, `attachment` facades) THEN a `*.spec.ts` SHALL snapshot the shape each consumer relies on (`back-arch.md` § Testes), or the requirement SHALL be retired in `back-arch.md` by v1 HBK-02 — one of the two, recorded in Design.

---

### P3: Handbook and template hygiene

**Acceptance Criteria**:

1. WHEN `docs/test/testing.md` is read THEN it SHALL document the kernel harness (`shared/test/{unit,int,e2e}` API), the entry `testing/` barrel convention, parity suites (`__parity__`, `contract-snapshot`) — absorbing v1 T26 — the lint rules, the real CI, the pre-push suite, coverage thresholds, and contain no reference to inline `Test.createTestingModule` bootstraps or to `test/setup/seed-user`.
2. WHEN the 7 identity domain specs with single quotes + semicolons are formatted THEN `pnpm format:check` passes on them (prettier enforced on all spec files).
3. WHEN `packages/api-client` is read THEN its `package.json` SHALL declare `test` as a no-op with a comment pointing to the generator, so `turbo test` reports it explicitly rather than silently skipping.

---

## Edge Cases

- WHEN `createE2eApp` is called with `middleware: "none"` (openapi-contract, security-bootstrap) THEN the factory SHALL still apply `Logger` silencing and return a closable app — the three "app variants" today collapse into one factory with one option.
- WHEN `drainOutbox` is called and the dispatcher is disabled in test env THEN it SHALL call `poll()` directly (public method, testing.md § Integration) and not wait on the `@Interval`.
- WHEN `resetDb` receives an unknown schema name THEN it SHALL throw before executing (typo protection), listing the known schemas from `information_schema`.
- WHEN two e2e files run in the same worker (`maxWorkers: 1`) THEN harness state (pool, Redis) SHALL not leak across files — `close()` ends what `createE2eApp` opened; `e2e-after-env` Redis flush stays.
- WHEN `mockOf<T>()` is called for a port whose method is not stubbed and the code under test calls it THEN the mock SHALL reject with `Error("<method> não stubado")` — a spec cannot pass by an accidental `undefined` return.
- WHEN `no-existence-only-assert` meets `expect(fn).not.toThrow(/msg/)` (with matcher) THEN it SHALL not report — only the argument-less form is existence-only.
- WHEN a test file is split to break an ordered chain THEN the `it` titles (pt-BR) SHALL be preserved so the Verifier's count table maps by title.
- WHEN v1 T22 has not landed (someone starts this feature early) THEN Execute SHALL stop at the pre-flight check (`catalog/` contains the five entries, `apps/api/src/modules/` empty) — the task list assumes the post-cutover tree.

---

## Implicit-requirement dimensions

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | `resetDb` validates schema names; `mockOf` rejects unstubbed calls; lint rules validate test files |
| Failure / partial-failure | harness owns pool lifetime (`afterAll`/`finally`); `drainOutbox` times out with a named error; CI jobs independent (one red job does not hide another) |
| Idempotency / retry | `waitFor`/`drainOutbox` are the only retry primitives; tests are order-independent (`--randomize`) |
| Auth boundaries & rate limits | `createE2eApp` defaults to allow-all rate limiter; `rateLimiter: "real"` for the rate-limit suite only — explicit, not by omission |
| Concurrency / ordering | `maxWorkers` unchanged (int 4 / e2e 1); harness has no global mutable state beyond what `beforeAll` owns |
| Data lifecycle / expiry | N/A — test data lives per suite and is truncated |
| Observability | CI job names + coverage summary artifacts; Verifier `it`-count table in `validation.md` |
| External-dependency failure | Docker absent → int/e2e skipped only on pre-push (already); CI fails loudly |
| State-transition integrity | N/A — no runtime state machine touched |

---

## Sensor set (for the Verifier)

Mutants the refactored suite must kill (behaviour-level, in production code, scratch only): (1) `applySecurity` CSRF check inverted; (2) `AccessGuard` fail-closed → fail-open when no policy; (3) outbox dispatcher skips delivery on second poll; (4) `loginAs` target: login use-case returns cookie without `HttpOnly`; (5) problem-details filter drops `correlationId`; (6) `resetDb` target: trash/purge use-case purges without the cutoff; (7) web `requireAccess` returns `"allow"` for null user; (8) `transport` 401 interceptor does not clear session. Each must be killed by at least one migrated test.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| HRN-01 | P1 harness — `createE2eApp` single bootstrap (AC1) | Tasks | In Tasks |
| HRN-02 | P1 harness — `resetDb` by schema, no module vocabulary in kernel harness (AC2) | Tasks | In Tasks |
| HRN-03 | P1 harness — `drainOutbox`/`waitFor` replace poll loops and timing (AC3) | Tasks | In Tasks |
| HRN-04 | P1 harness — `expectProblem`, `cookieValue`, `cookieHeader` (AC4) | Tasks | In Tasks |
| HRN-05 | P1 harness — pool ownership, no `createTestPool` in `it` (AC5) | Tasks | In Tasks |
| HRN-06 | P1 harness — no local helper duplicates in e2e files (AC6–7) | Tasks | In Tasks |
| ENT-01 | P1 entry barrels — identity `testing/` exports (AC1) | Tasks | In Tasks |
| ENT-02 | P1 entry barrels — notification/attachment `testing/` exports (AC2) | Tasks | In Tasks |
| ENT-03 | P1 entry barrels — cross-entry `testing/` import backed by `dependsOn` (AC3) | Tasks | In Tasks |
| ENT-04 | P1 entry barrels — `module.json.files` + coverage exclude (AC4) | Tasks | In Tasks |
| ENT-05 | P1 entry barrels — `apps/api/test/setup` reduced to runner plumbing (AC5) | Tasks | In Tasks |
| UNT-01 | P1 doubles — `mockOf`/`fixedClock`/`fakeRequestContext`, typed `makeDeps` (AC1) | Tasks | In Tasks |
| UNT-02 | P1 doubles — `withTestDb`, global Redis in int (AC2) | Tasks | In Tasks |
| UNT-03 | P1 doubles — entry `make<Entity>`, no `fromProps` literals in specs (AC3–4) | Tasks | In Tasks |
| UNT-04 | P1 doubles — state-asserting writes in the four interaction-heavy specs (AC5) | Tasks | In Tasks |
| LNT-01 | P1 proof — jest/vitest/testing-library plugins (AC1) | Tasks | In Tasks |
| LNT-02 | P1 proof — local `no-existence-only-assert` rule + tests (AC2) | Tasks | In Tasks |
| STR-01 | P1 proof — weak asserts strengthened (AC3) | Tasks | In Tasks |
| STR-02 | P1 proof — order-independent suites, `--randomize` (AC4) | Tasks | In Tasks |
| STR-03 | P1 proof — persisted-state assert after mutations (AC5) | Tasks | In Tasks |
| STR-04 | P1 proof — `it` count non-decreasing (AC6) | Tasks | In Tasks |
| WEB-01 | P1 web — helpers exported, `fixed-clock` deleted (AC1) | Tasks | In Tasks |
| WEB-02 | P1 web — `mockRouter`/`makeTestQueryClient` adoption (AC2) | Tasks | In Tasks |
| WEB-03 | P1 web — `makeCurrentUser` from entry / jest-dom + hoisted hygiene (AC3–4) | Tasks | In Tasks |
| CI-01 | P2 gates — `ci.yml` jobs (AC1–2) | Tasks | In Tasks |
| CI-02 | P2 gates — lefthook Docker-free, turbo pipelines (AC3–4) | Tasks | In Tasks |
| COV-01..10 | P2 coverage — absorbed semantics (AC1–4) | Tasks | In Tasks |
| COV-11 | P2 coverage — fills T3/T9/T10 remnant + ratchet T11 on post-T22 denominator (AC5) | Tasks | In Tasks |
| GAP-01 | P2 entry gaps — tag use-case specs + delivery repo int-spec (AC1) | Tasks | In Tasks |
| GAP-02 | P2 entry gaps — facade shape specs or rule retired (AC2) | Tasks | In Tasks |
| DOC-01 | P3 — `testing.md` rewrite absorbing v1 T26 (AC1) | Tasks | In Tasks |
| DOC-02 | P3 — prettier on identity domain specs, `api-client` explicit no-op test (AC2–3) | Tasks | In Tasks |

**Coverage:** 32 total (COV-01..10 counted as one row), 32 mapped to tasks (tasks.md § Requirement mapping), 0 unmapped.

---

## Success Criteria

- [ ] `rg -l "Test.createTestingModule" apps/api catalog` → exactly 1 file; `rg -c "const allowAll|function login\b|linkFromHtml|makeInMemoryStorage" apps/api/test catalog/*/api` → 0 outside `testing/`.
- [ ] `rg -c "Record<string, any>" apps/api/src catalog --glob '*.spec.ts'` → 0; `as never` + `as unknown as` only under `shared/test/**`.
- [ ] `pnpm lint` fails on a committed `it.only` / assertion-less / existence-only test fixture.
- [ ] `pnpm --filter api test:e2e -- --randomize` green; all tiers green; `it` total ≥ pre-refactor total − 1.
- [ ] CI workflow green on the branch; pre-push gate 95/95/95/95 on api unit + web.
- [ ] Verifier sensor: 8/8 mutants killed.
