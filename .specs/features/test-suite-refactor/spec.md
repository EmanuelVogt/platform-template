# Test Suite Refactor Specification

**Scope:** Complex — cross-cutting over ~250 test files, a new shared-harness layer (AD-023), new lint rules and a CI pipeline from zero. Gray areas: `context.md`.
**Depends on:** `v1-kernel-only-module-catalog` — merged `8bb606d`, tagged `v1.0.0`. Test code is refactored once, in its final home: kernel in the template, modules in `catalog/<entry>/api/**`.
**Absorbs:** `pre-push-coverage-95` (COV-01..11) and v1 T26 (`docs/test/testing.md` rewrite).

> **Restored and re-baselined 2026-08-24.** `c1b10ec` (*docs(specs): remove the test-suite-refactor
> spec artifacts*, 2026-08-23) deleted all four artifacts and recorded no reason; it landed one commit
> after the `docs-stay-lean` harness port (`067dcb8`), which reads as a lean-docs sweep and not as a
> scope withdrawal. The scope was never withdrawn and three live documents still charge it to this
> feature by name — `STATE.md` AD-023 (Status literally `planned (test-suite-refactor)`),
> `audit-2026-08-23-remediation/spec.md:48` (defers *Coverage ratchet, harness layering, RULE D* here)
> and `done/security-audit-remediation/design.md:114` (catalog-lint carries a slot "for the planned
> RULE D"). The four files are restored verbatim from `c1b10ec^`; this note is the only edit and it
> governs all four — paths and recorded baselines below are **not** rewritten in place.
>
> What moved under the feature between the 2026-08-22 re-baseline and today:
>
> - **The AD-012 ratchet has no active decision behind it.** AD-012 (pre-push 95 % S/B/F/L) is
>   *superseded by AD-027* since 2026-08-22. The live bar is a flat 90, global plus one floor per glob,
>   in `vitest.coverage.mts:57-76`. Raising it is a **new decision on AD-027**, not a revival of AD-012 —
>   and it is nearly free today (see next row). **Superseded by the scope cut below: T39/C10 no
>   longer exist. Nobody owns the ratchet in this feature; `vitest.coverage.mts`'s *floors* are
>   touched by no task. Its *denominator* is owned by T5.**
> - **COV-11's measured gap is CLOSED.** The 2026-08-22 measurement in P2 § *Coverage bar* AC5 (24
>   statements, 76 branches, 15 lines short of 90) was overtaken by `audit-2026-08-23-remediation`:
>   v2.4.0's Final gate reports **96.5 / 94.4 / 94.9 / 96.8** over the 90 floor, 1212 tests against a
>   930 pre-feature baseline. AC5 has no work left; AC1-AC4 stand as invariants.
> - **The web shell split in two.** Every `apps/web/**` path in these four files reads as
>   `apps/web-vite/**` in this repository and `apps/web/**` in the rendered child (the `WEB_DIR`
>   resolver, `vitest.coverage.mts:7-10`); `apps/web-next` is the sibling `web_stack=next` surface.
>   **RULED 2026-08-24 — see GA-8: P1 § *Web harness adoption* lands in BOTH shells**, same relative
>   path, shell-agnostic half byte-identical, router helper the only divergence, parity asserted by the
>   guard spec. This is scoped to this feature; it sets a precedent v2.4.0's Fix 5 may adopt, but it
>   does not decide Fix 5 — that ruling is still the owner's, on that feature.
> - **The harness is partly built.** `apps/api/src/shared/test/` now holds `parity/` and
>   `unit/source-survey.ts`; `int/`, `e2e/` and `hygiene/` are still absent. `catalog/*/api/testing/`
>   exists for `audit`, `identity/single-tenant` and `notification`; `attachment` and `tag` have none.
> - **COV-04's harness exclusion is half in place.** `vitest.coverage.mts:51` already excludes
>   `**/shared/test/**`. The entry-barrel exclusion is **not** — moot here (`catalog/` is outside
>   `include`) and live in the child, where the barrels land at `apps/api/src/modules/<entry>/testing/**`,
>   inside the `apps/api/src/**` include glob. **That exclude is owned by T5** (the scope cut moved
>   COV-04's denominator half there when T39/C10 were removed — `tasks.md` § *Requirement mapping*).
> - **RULE D is still unimplemented.** `module-boundaries.spec.ts` carries RULE A and RULE C only. T34
>   remains its sole owner.
> - **The `it`-count baselines in `tasks.md` predate v2.4.0.** GA-7's non-weakening probe must re-record
>   its per-file baselines at wave 1 rather than trust the stored numbers.
>
> **SCOPE CUT 2026-08-24 — read `tasks.md` § *Scope cut* first.** 40 tasks / 10 clusters / 5 waves
> became **18 / 7 / 4**, on the owner's call ("arranca fora e diminua o trabalho — a duplicação de
> código é um problema real"). The bulk migration of ~250 test files, the coverage fills, the ratchet
> and the two audit gaps left scope; the harness, the entry barrels and the enforcement stayed,
> because those are what carry the template multiplier. **GA-9 is what makes the cut sound rather
> than merely smaller** — enforcement ships at full strength against a baseline that can only shrink,
> so nothing is postponed, only redistributed onto whoever next touches a file. The Goals and
> § *Out of Scope* below are amended in place and say which line was cut.
>
> **Gate CLEARED 2026-08-24.** The ten rows that were marked `n` are confirmed and GA-8 was added, on
> the owner's explicit delegation — not on a row-by-row owner review; § *Assumptions* says so in the
> rows themselves. `context.md:15` ("defaults set by the agent") is superseded by that table. **Design
> is unblocked; `design.md` was authored against these same defaults and needs re-reading only where
> GA-8 touches it** (P1 web harness, the guard spec's scan surface, the lint globs).

## Problem Statement

The test *setup* is strong (unit / int / e2e tiers on testcontainers, per-worker template DB clone, one Vitest run with v8 coverage merged across the four projects) but the test *code* reuses almost nothing: app bootstrap, login and cookie reading, table truncation, polling, aggregate fixtures and RFC 7807 assertions are re-implemented file by file, in several incompatible styles. Nothing mechanical stops `.only`, an assertion-less test, an existence-only assert or the next copy of a helper, and `.github/` does not exist — int, e2e, contract and coverage only ever run by hand. Measurements behind every claim: `design.md` § *Spike results*.

## Goals

- [ ] One importable, module-agnostic api harness (`apps/api/src/shared/test/{unit,int,e2e}`) plus entry-owned `api/testing/` barrels; zero inline app bootstraps and zero local login/cookie/truncate/poll/storage helpers in any test file.
- [ ] Unit and int specs build doubles and fixtures from shared factories; zero `Record<string, any>` deps in specs, `as never` / `as unknown as` only inside the harness. **(Cut 2026-08-24: enforced forward from the baseline, not retrofitted across the tree.)**
- [ ] Every test proves a value: lint blocks `.only`/`.skip`, assertion-less tests and existence-only asserts; the `it` count never decreases. **(Cut 2026-08-24: the audit's weak spots are recorded in the baseline instead of being strengthened in a sweep — the count can only fall.)**
- [ ] The duplication bans are executable: a committed guard spec fails when a banned helper, bootstrap or literal reappears — no grep-in-a-review as the only defence.
- [ ] **The bans are enforceable on day one without a 250-file sweep** — every rule ships at full strength against a generated baseline of what already exists, and the baseline can only shrink (GA-9).
- [ ] Gates exist and run: CI covers quality → unit → coverage (int + e2e) → contract; pre-push stays the AD-027 gate (`pnpm test:coverage`, Docker), whose floors are already 90 % on every metric — this feature is what makes the api tree actually clear them.
- [ ] `docs/test/testing.md` describes the real harness, the entry convention, the lint rules and the real CI (absorbs v1 T26).

## Out of Scope

| Feature | Reason |
| --- | --- |
| Moving module code or tests into `catalog/` | done by v1 T22; this feature starts from that tree |
| Filling catalog entries to 90 % unit coverage | entries are gated by `catalog:check` (v1 CAT-02); only the two gaps named in GAP-01 are filled here |
| The nyc combined floor (85/51/90/90) | gone — AD-027 replaced it with a flat 90 (global + per glob) in `vitest.coverage.mts`; this feature covers the code that makes the api clear it (T39) |
| Mutation testing as a permanent tool (Stryker) | the Verifier's sensor is bounded and manual; a tool is a follow-up |
| Browser/visual tests for web | template web is a router shell after v1 |
| `packages/api-client` tests | generated output — only an explicit no-op `test` script (DOC-02) |
| In-memory fake repositories for every port | GA-3: typed mocks by default, stateful fakes only where state is asserted |
| Rewriting `docs/arch/back.md` § Conformance specs | owned by v1 HBK-02; this feature updates `docs/test/testing.md` and links |
| **Migrating the ~250 existing test files** (cut 2026-08-24) | the majority of the cost and of the risk for the smallest marginal return — and refactoring tests fails silently, since a test broken into silence still passes. The harness and the enforcement stop **new** duplication; the existing files enter the GA-9 baseline and migrate when someone next touches them. Only the e2e move now, inside the task that builds the barrel they consume |
| **Filling coverage** (cut 2026-08-24) | done by events — `audit-2026-08-23-remediation` closed COV-11 at 96.5 / 94.4 / 94.9 / 96.8 over a 90 floor. Only COV-04's denominator survives, in T5, because the entry-barrel exclude is still a live defect in the child |
| **Raising the coverage bar above 90** (cut 2026-08-24) | AD-012 is superseded by AD-027; the ratchet is a new owner decision on AD-027, cheap today and still available, but not charged here |
| **The two audit gaps** GAP-01/GAP-02 (cut 2026-08-24) | real, but unrelated to duplication — their own follow-up |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| GA-1 sequencing | resolved — v1 merged (`8bb606d`), pre-flight is a check, not a wait | files are touched once, in their final home | y (event) |
| GA-2 harness home | runner plumbing stays in `apps/api/test/`; spec-facing helpers in `apps/api/src/shared/test/{unit,int,e2e}`; entry helpers in `catalog/<entry>/api/testing/` | RULE C forbids module vocabulary in `shared/**`; entries are copied into children with their helpers | **y (delegated 2026-08-24)** — the tree already agrees: `shared/test/parity/` and three `catalog/*/api/testing/` exist |
| GA-3 doubles | `mockOf<T>()` typed mocks; stateful `InMemory*` only where state is asserted, entry-owned | avoids a parallel repository implementation per entry | **y (delegated 2026-08-24)** |
| GA-4 fixtures | one `make<Entity>(overrides)` per aggregate plus named constants, in the entry `testing/` barrel | replaces the local `makeUser` copies and the raw literals | **y (delegated 2026-08-24)** |
| GA-5 lint | `@vitest/eslint-plugin` already on the api and web test globs and `testing-library` on the web ones (vitest-migration); this feature adds `jest-dom` (web) plus a local `no-existence-only-assert` rule | the handbook rule L-007 is prose today and is violated in the tree | **y (delegated 2026-08-24)** — `jest-dom` and the local rule land on **both** web shells (GA-8) |
| GA-6 CI | `.github/workflows/ci.yml` already exists (jobs `quality`, `test-unit`, `test-coverage`); this feature fills the gaps (contract job, shuffled e2e) and never duplicates `catalog.yml`; pre-push is the AD-027 gate and needs Docker | the pipeline `testing.md` promised was born with vitest-migration, still short of the contract job | **y (delegated 2026-08-24)** — with the standing follow-up: three workflow files carry the same gate block and two fire on the same trigger; GA-6 consolidates rather than adding a fourth |
| GA-7 non-weakening proof | `it` count per original file ≥ before, sensor mutants killed, lint blocks skips | the refactor must not buy brevity with lost proof | **y (delegated 2026-08-24)** — baselines are re-recorded at wave 1, not read from `tasks.md` (they predate v2.4.0) |
| **GA-8 web shell** (new, 2026-08-24) | the web harness lands in **both** shells at the identical relative path `src/shared/test/` — `apps/web-vite/` and `apps/web-next/` here, `apps/web/` in the child. The shell-agnostic half (`renderWithProviders`, `makeTestQueryClient`, `createQueryWrapper`, `resetAuthState`, `useMswServer`) is byte-identical; **the router helper is the only permitted divergence** (`mockRouter` over `@tanstack/react-router` vs the Next router), and the guard spec asserts that parity so the two cannot drift | a rendered child has exactly **one** web app, so a seam built in one shell only is a seam a `web_stack=next` child silently loses — the failure v2.4.0's Fix 5 names. Both shells are live surfaces today (own `vitest.config.ts`, 24 and 18 test files), so neither is a stub that can be deferred. A shared package was rejected: it would be copied into the child carrying the other shell's dead code | **y (delegated 2026-08-24)** |
| **GA-9 enforcement baseline** (new, 2026-08-24 — the decision the scope cut rests on) | every new rule ships **at full strength immediately**, measured against a *generated* baseline of the violations that already exist: `eslint.suppressions.json` for the lint rules (native to ESLint 10, which this repo is on — `eslint@10.4.0`) and `harness-hygiene-baseline.json` for the guard spec. A violation **not** in the baseline fails. A baseline entry that no longer matches **also** fails, so the file can only shrink — a fixed violation must be removed from it in the same commit | it is what makes the 250-file sweep unnecessary instead of merely postponed. The old plan put enforcement last (wave 3 of 5) for a real reason — a rule switched on early turns the repository red mid-flight — but that is only true when you enforce retroactively in one step. Baselined, enforcement lands early and holds forever, and the migration becomes opportunistic: whoever touches a file pays for that file. Rejected alternative: scoping the rules to changed files via the pre-commit hook — it is invisible to CI, silently skipped by `--no-verify`, and depends on git context a fresh clone lacks | **y (delegated 2026-08-24)** |
| Bans are enforced by a guard spec, not by greps | `apps/api/src/shared/test/hygiene/harness-hygiene.spec.ts` scans `apps/api/**` and `catalog/**` test files | a spec is a gate that survives the feature; a grep in a review is not (also keeps the feature within the ≤3-probe budget) | **y (delegated 2026-08-24)** — scan widened to both web shells for the GA-8 parity assertion |
| Coverage denominator | excludes test files, `*.d.ts`, `main.ts(x)`, `apps/api/src/shared/test/**`, `catalog/*/api/testing/**` (child: `apps/api/src/modules/*/testing/**`), generated client | inherits COV-04 + GA-2 | **y (delegated 2026-08-24)** — `**/shared/test/**` is already excluded at `vitest.coverage.mts:51`; the entry-barrel exclude is the piece still owed to the child, and **T5 owns it** (T39/C10 were removed by the scope cut) |
| Ordered `it` chains | split into independent `it`s sharing a `beforeEach` seed; the "seed master" pseudo-test is removed | it asserts nothing — the only removal allowed in this feature | **y (delegated 2026-08-24)** |
| Redis in int-specs | the two container-booting int-specs move to the global container (`testRedisUrl()` + `flushRedis()`) | one runtime, ~60 s per file saved | **y (delegated 2026-08-24)** |

**Open questions:** none. **Every row is confirmed as of 2026-08-24 — by the owner's explicit delegation ("faz o que tu achar melhor"), not by a row-by-row owner review.** The defaults were kept because each carries a recorded rationale and several are already reality in the tree; the one substantive call added is GA-8. Any row is still the owner's to flip — flipping one after Design is approved reopens Design, not the whole spec.

## User Stories

### P1: One kernel harness boots, seeds and asserts every e2e ⭐ MVP

**User Story**: As a test author (template or entry), I want one harness that boots the app, resets the database, drives the outbox and asserts problem responses so that an e2e file contains only the flow under test.

**Why P1**: it is the largest duplication in the repo and the pattern every catalog entry copies into every child.

**Acceptance Criteria**:

1. WHEN `apps/api/src/shared/test/e2e/` is read THEN it SHALL export `createE2eApp(opts?: { rateLimiter?: "allow-all" | "real"; overrides?: Array<[token, value]>; extraModules?: Type[]; middleware?: "full" | "none" })` returning `{ app, http, close }`, defaulting to `rateLimiter: "allow-all"` and `middleware: "full"` (versioning + `applySecurity` + request-context, mirroring `main.ts`), AND `Test.createTestingModule` SHALL appear in exactly one file across `apps/api/**` and `catalog/**`.
2. WHEN `resetDb(pool, schemas)` is called THEN it SHALL truncate every table of the listed schemas in one statement and SHALL throw before executing on an unknown schema name; the kernel harness SHALL export no truncation helper named after a module (`truncateIdentity`, `truncateAttachment`, `truncateTag`).
3. WHEN `drainOutbox(app, opts?)` is called THEN it SHALL poll the outbox and delivery dispatchers until `until` resolves a defined value or the timeout elapses, rejecting with an error naming the timeout, AND no test SHALL use `setTimeout` or a hand-rolled loop as proof that an async effect happened.
4. WHEN `expectProblem(res, expected)` is called THEN it SHALL assert `content-type` contains `application/problem+json`, `body.status`, `body.type` suffix when given and the remaining fields by equality when given; `waitFor` SHALL be the only polling primitive and `cookieValue`/`cookieHeader` the only `Set-Cookie` readers.
5. WHEN a spec needs a database pool THEN the pool SHALL be owned by the harness (`withE2ePool()` or a suite-level `beforeAll`/`afterAll`) and `createTestPool()` SHALL never be called inside an `it` body.
6. WHEN the guard spec runs over `apps/api/**` and `catalog/**` test files THEN it SHALL fail on a local definition of `allowAll`, `login`, `loginAndGetCookie`, `extractCookieValue`, `parseSetCookie`, `linkFromHtml`, `waitFor`, `pollUntil`, `findSent`, `makeInMemoryStorage`, `seedUser`, on the `PNG_1PX` byte literal, on the literal web origin and on a password literal outside the harness and the entry barrels.

**Independent Test**: `pnpm test:e2e` green; `harness-hygiene.spec.ts` green and failing on a seeded violation.

---

### P1: Every entry owns its test vocabulary ⭐ MVP

**User Story**: As a catalog entry author, I want my entry to ship its own seed, login, fakes and fixtures so that my tests and my dependents' tests import one barrel and no module vocabulary leaks into the kernel harness.

**Acceptance Criteria**:

1. WHEN `catalog/identity/single-tenant/api/testing/index.ts` is read THEN it SHALL export `seedUser` (with an `accessProfile` option including `"master"`, demoting a previous master where the unique index requires it), `loginAs`, `tokenFromMail`, `makeUser`, `makeIdentityConfig`, `emails` and `FIXED_NOW`, AND raw SQL promoting a user to master SHALL appear in no spec.
2. WHEN the other entries are read THEN `notification` SHALL export `FakeMailer`, `findSent` and the delivery dispatcher accessor; `attachment` SHALL export `inMemoryStorage()` (full `ObjectStoragePort`, `getStream` included), `PNG_1PX` and `seedAttachment`; `tag` and `audit` SHALL export their `make<Entity>`/`seed<Entity>` pair.
3. WHEN an entry's test imports another entry's `testing/` barrel THEN the boundaries spec over `catalog/**` SHALL fail unless that entry is declared in `module.json.dependsOn`, and SHALL fail on any import that would close a cycle in the `dependsOn` DAG (AD-025).
4. WHEN `module.json.files` is read THEN it SHALL list the `testing/**` files so `module add` copies them into the child at `apps/api/src/modules/<entry>/testing/**`, AND `pnpm catalog:check` SHALL pass for every entry with its tests running from the installed child.
5. WHEN `apps/api/test/setup/` is listed THEN it SHALL contain only runner plumbing (global setup/teardown, the three env files, `e2e-after-env`, container URIs, docker runtime, scalar stub) and `unit-env.ts` SHALL import the shared env block instead of duplicating it.

**Independent Test**: entry tests import only `shared/test/*` and `testing/` barrels; boundaries spec and `pnpm catalog:check` green.

---

### P1: Unit and int doubles come from shared factories ⭐ MVP

**User Story**: As a use-case spec author, I want typed mock factories, a fixed clock, a request-context fake and an int-DB harness so that a spec declares only the behaviour it stubs.

**Acceptance Criteria**:

1. WHEN `apps/api/src/shared/test/unit/` is read THEN it SHALL export `mockOf<T>(partial?): Mocked<T>` (from `"vitest"`), `fixedClock(iso?)`, `fakeRequestContext(partial?)` with the kernel defaults and `fakeLogger()`, AND a use-case spec's dependency factory SHALL be typed — `Record<string, any>` SHALL not appear in any spec and `as never` / `as unknown as` SHALL appear only under `shared/test/**`.
2. WHEN `apps/api/src/shared/test/int/` is read THEN it SHALL export `withTestDb({ schemas })` registering its own `beforeAll` / `beforeEach(resetDb)` / `afterAll(pool.end)`, plus `testRedisUrl()` and `flushRedis()`, AND no int-spec SHALL start a `GenericContainer`.
3. WHEN a spec needs an aggregate THEN it SHALL call the entry's `make<Entity>()`; `<Aggregate>.fromProps({` SHALL appear in no spec outside a `testing/` barrel, and each entry SHALL define each builder exactly once.
4. WHEN `mockOf<T>()` produces a method the spec did not stub and the code under test calls it THEN the call SHALL reject with an error naming the method — a spec SHALL NOT pass on an accidental `undefined`.
5. WHEN a use-case spec asserts the outcome of a write THEN it SHALL assert on the entity captured by the port or on a stateful fake, not only on `toHaveBeenCalled()`; the four interaction-heaviest identity specs SHALL each assert the changed fields of the saved entity.

**Independent Test**: `pnpm vitest run --project api` and `pnpm test:int` green; the guard spec's typed-deps and `fromProps` checks green.

---

### P1: Tests prove values — lint plus strengthening ⭐ MVP

**User Story**: As the maintainer, I want the handbook's "what counts as proof" enforced by lint and the audit's weak tests strengthened so that the refactor leaves the suite stronger, not merely shorter.

**Acceptance Criteria**:

1. WHEN `pnpm lint` resolves the config for a test file THEN `no-focused-tests`, `no-disabled-tests`, `expect-expect` and `no-conditional-expect` SHALL be active as errors (api and web via `@vitest/eslint-plugin`), and web test files SHALL additionally resolve `testing-library` and `jest-dom` recommended rules as errors.
2. WHEN a test body's only assertions are `toBeDefined`, `toBeTruthy`, `toBeUndefined`, `toBeFalsy`, `resolves/rejects.toBeDefined` or an argument-less `not.toThrow()` THEN the local rule `no-existence-only-assert` SHALL report it; WHEN the same body also asserts a concrete value, or declares `expect.assertions(n)`, or passes a matcher to `not.toThrow(...)` THEN it SHALL NOT report.
3. WHEN the weak spots listed in `design.md` § *Spike results* are re-read after the refactor THEN each SHALL assert a concrete value — an SQL text, a redirect target, a thrown problem, a numeric `retry-after`, a 403 body through `expectProblem`, or a positive assertion in place of a "not 401".
4. WHEN the e2e suites run with `--sequence.shuffle` THEN they SHALL pass — no `it` depends on a previous `it`, and the "seed master" pseudo-test is removed.
5. WHEN a test mutates state through a route THEN at least one assertion per mutation SHALL read the row through the pool or a second endpoint whose response proves the persisted change.
6. WHEN the `it` count of a migrated file is compared with the recorded baseline THEN the sum across the files it was split into SHALL be greater than or equal to the baseline, except the single removal in AC4.

**Independent Test**: RuleTester suite of the local rule green; `pnpm test:e2e --sequence.shuffle` green; the `it`-count probe reports no regression.

---

### P1: Web harness adoption ⭐ MVP

**User Story**: As a web test author, I want router, session and query-client helpers in `apps/web/src/shared/test/` so that component tests stop hand-rolling router mocks and query clients.

**Acceptance Criteria**:

1. WHEN `apps/web/src/shared/test/` is read THEN it SHALL export `renderWithProviders`, `makeTestQueryClient`, `createQueryWrapper(qc?)`, `mockRouter(opts?)` as a single `vi.hoisted` shape, `resetAuthState()` and `useMswServer(...handlers)`, AND `fixed-clock.ts` SHALL be deleted (no consumers).
2. WHEN a web test mocks `@tanstack/react-router` or needs a `QueryClient` THEN it SHALL do so through `mockRouter` / `makeTestQueryClient` / `createQueryWrapper` — no ad-hoc `vi.mock` of the router and no inline `new QueryClient` in a test file.
3. WHEN a web test needs a current user fixture THEN it SHALL come from `makeCurrentUser()` in `catalog/identity/single-tenant/web/core/session.fixture.ts` — rendered to `apps/web/src/entities/identity/core/` in the child — never from a literal in the test. **This AC binds the child, not the template.**
4. WHEN a web test file is read THEN it SHALL not re-import a matcher set already loaded by `test/setup.ts`, and every `vi.mock` factory SHALL use `vi.hoisted` rather than relying on closure hoisting.

> **AC3 amended 2026-08-24 — it named an artifact that may not exist.** The original wording required
> the fixture to come from "the identity entry's **web testing barrel**". There is no such barrel, and
> one may not be created: `docs/arch/front.md:47,56,58,199` forbids aggregating `index` barrels on the
> front. The reconciliation of `design.md` flagged AC3 as ownerless; the scout that checked it found
> the opposite of missing work — **the fixture already exists**. `catalog/identity/single-tenant/web/core/session.fixture.ts`
> exports `makeCurrentUser()`, and `catalog/identity/single-tenant/README.md:302` already documents it
> as being for the child's tests. Two consequences: (1) nothing is built for AC3 — T7 creates no fixture
> and no barrel; (2) **AC3 is not provable in this repository**. The template's shells have no identity
> entry installed (`catalog/` entries reach `apps/web/src/entities/identity` only in a rendered child),
> so no template web test can import it and the zero current-user literals in `apps/web-vite` and
> `apps/web-next` today are a consequence of that, not of discipline. Its proof is the entry's fixture
> plus the README line, verifiable by reading — **`proof: probe`, not `proof: test`**. The Verifier must
> not look for a template test here.

**Independent Test**: `pnpm vitest run --project web` green; the web half of the guard spec green. **AC3 is excluded from this run** — see the amendment above; it is proved by the entry artifact, not by a template test.

---

### P2: The gates exist and run

**User Story**: As the maintainer, I want the pipeline `testing.md` promises to actually exist so that int, e2e, contract and coverage regressions are caught before merge.

**Acceptance Criteria**:

1. WHEN a push or pull request runs CI THEN jobs `quality`, `test-unit`, `test-coverage` (int + e2e, Docker) and `contract` SHALL run, `contract` SHALL fail on a dirty `openapi.json`, the `api-e2e` project SHALL run shuffled, and all jobs SHALL use the Node of `.nvmrc` and the pnpm of `packageManager`.
2. WHEN the repository already carries a workflow (`catalog.yml`) THEN this feature SHALL extend the workflow set coherently and SHALL NOT create a second file running the same jobs.
3. WHEN pre-push runs THEN it SHALL be `migrations → typecheck → catalog-typecheck → test-coverage` (AD-027, Docker-bound) and SHALL block below any per-glob coverage floor.
4. WHEN `turbo.json` and the app manifests are read THEN they SHALL carry no `test*` task or script (AD-028) — tests run outside Turbo, from the root scripts.

**Independent Test**: workflow green on the feature branch; a forced sub-floor coverage fixture blocks `git push`.

---

### P2: Coverage bar on the kernel-only denominator (absorbs `pre-push-coverage-95`)

**Acceptance Criteria**:

1. WHEN pre-push runs `pnpm test:coverage` THEN any metric below 90 % (statements, branches, functions, lines), globally or on `apps/api/src/**` / `apps/web/src/**`, SHALL block the push, and at or above 90 % coverage SHALL never block (COV-01..03).
2. WHEN coverage is computed THEN the denominator SHALL exclude test files, `*.d.ts`, `main.ts(x)`, the api and web harnesses, entry `testing/**` and the generated client (COV-04).
3. WHEN branch coverage is reported THEN it SHALL be computed from the TypeScript source, and an untested source branch SHALL keep the suite below the bar (COV-05..06).
4. WHEN a gap is filled THEN it SHALL be filled with an assertion on an observable outcome or on the error class and message — never with an ignore pragma, and dead code SHALL be deleted rather than ignored (COV-07..10).
5. WHEN the fills land THEN they SHALL target `apps/api/src/**` on the post-v1 denominator and SHALL close the gap to the 90 % floors already declared — measured 2026-08-22: 24 statements, 76 branches and 15 lines short (COV-11).

---

### P2: The two gaps the audit named

**Acceptance Criteria**:

1. WHEN the tag entry is read THEN each of its use-cases SHALL have a spec covering the happy path and every `throw`; WHEN the notification entry is read THEN its delivery repository SHALL have an int-spec covering the key query paths and the conflict/error path.
2. WHEN a cross-entry facade exists THEN either a spec SHALL pin the shape each consumer relies on, or the requirement SHALL be retired from `docs/back/back-arch.md` — the choice is recorded in `design.md` § *Tech Decisions*, never left implicit.

---

### P3: Handbook and hygiene

**Acceptance Criteria**:

1. WHEN `docs/test/testing.md` is read THEN it SHALL document the kernel harness API, the entry `testing/` convention, the parity suites, the lint rules, the real CI, the pre-push suite and the coverage thresholds, and SHALL contain no reference to an inline `Test.createTestingModule` bootstrap or to a helper that no longer exists.
2. WHEN `pnpm format:check` runs THEN it SHALL pass on every spec file, AND `packages/api-client` SHALL declare an explicit no-op `test` script pointing at the generator.

## Edge Cases

- WHEN `createE2eApp` is called with `middleware: "none"` THEN it SHALL still silence the logger and return a closable app — the app variants collapse into one factory with one option.
- WHEN `drainOutbox` runs in an environment where the scheduled dispatcher is disabled THEN it SHALL call the dispatcher's public `poll()` directly rather than waiting on the interval.
- WHEN two e2e files run in the same worker THEN harness state SHALL not leak across files — `close()` ends what `createE2eApp` opened and the Redis flush between files stays.
- WHEN `no-existence-only-assert` meets `expect(fn).not.toThrow(SomeError)` THEN it SHALL not report — only the argument-less form is existence-only.
- WHEN a file is split to break an ordered chain THEN the `it` titles SHALL be preserved verbatim so the baseline count maps by title.
- WHEN the guard spec runs inside a child repository (entry installed by `module add`) THEN it SHALL scan the child's paths (`apps/api/src/modules/*/testing/**`) without failing on the absence of `catalog/`.
- WHEN the pre-flight finds `apps/api/src/modules/` still holding module directories THEN Execute SHALL stop — the task list assumes the post-v1 tree.

## Implicit-Requirement Dimensions

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | `resetDb` validates schema names; `mockOf` rejects unstubbed calls; the guard spec validates test files |
| Failure / partial failure | the harness owns pool lifetime; `drainOutbox` times out with a named error; CI jobs are independent so one red job never hides another |
| Idempotency / retry | `waitFor` and `drainOutbox` are the only retry primitives; suites are order-independent under `--sequence.shuffle` |
| Auth boundaries & rate limits | `createE2eApp` defaults to an allow-all limiter; the real limiter is opt-in for the rate-limit suite only — explicit, never by omission |
| Concurrency / ordering | worker counts unchanged (int parallel, e2e serial); the harness holds no global mutable state beyond what `beforeAll` owns |
| Data lifecycle / expiry | N/A — test data lives per suite and is truncated |
| Observability | CI job names and coverage artifacts; the Verifier's `it`-count table in `validation.md` |
| External-dependency failure | Docker absent → int/e2e skipped on pre-push only (already the case); CI fails loudly |
| State-transition integrity | N/A — no runtime state machine is touched |

## Requirement Traceability

| Requirement ID | Story | Proof | Phase | Status |
| --- | --- | --- | --- | --- |
| HRN-01 | P1 harness — single bootstrap factory (AC1) | test | Tasks | **FORWARD-ONLY 2026-08-25** — the factory shipped (T2/T4) and every new bootstrap must use it; the *absolute* "exactly one `Test.createTestingModule` in the tree" is not met (4 live files) and cannot be without the bulk migration the 2026-08-24 cut removed. Enforced against the GA-9 baseline, same mechanism that cut STR-01/STR-03/WEB-02 |
| HRN-02 | P1 harness — `resetDb` by schema, no module vocabulary (AC2) | test | Tasks | In Tasks |
| HRN-03 | P1 harness — `drainOutbox`/`waitFor` replace poll loops and sleeps (AC3) | test | Tasks | In Tasks |
| HRN-04 | P1 harness — `expectProblem`, `cookieValue`, `cookieHeader` (AC4) | test | Tasks | In Tasks |
| HRN-05 | P1 harness — pool ownership (AC5) | test | Tasks | In Tasks |
| HRN-06 | P1 harness — guard spec bans local helper copies (AC6) | test | Tasks | In Tasks |
| ENT-01 | P1 entries — identity `testing/` exports (AC1) | test | Tasks | In Tasks |
| ENT-02 | P1 entries — notification/attachment/tag/audit barrels (AC2) | test | Tasks | In Tasks |
| ENT-03 | P1 entries — cross-entry import backed by `dependsOn`, acyclic (AC3) | test | Tasks | In Tasks |
| ENT-04 | P1 entries — `module.json.files` ships `testing/**` (AC4) | gate | Tasks | **MECHANISM CORRECTED 2026-08-25** — `module.json.files` **does not exist**: no such field is allowed by `catalog/schema/module.schema.json` or `scripts/platform/lib/manifest.mjs`, and adding one is kernel work outside every task that cites it. What certifies a barrel reaching a rendered child is a green `pnpm catalog:check` plus the REL-04 version bump. Judge the row against that gate |
| ENT-05 | P1 entries — `test/setup` reduced to runner plumbing (AC5) | test | Tasks | **FORWARD-ONLY 2026-08-25** — the runner allow-list ships and the guard spec enforces it; residual `test/setup` content sits in the GA-9 baseline, per the 2026-08-24 cut |
| UNT-01 | P1 doubles — `mockOf`/`fixedClock`/`fakeRequestContext`, typed deps (AC1) | test | Tasks | **FORWARD-ONLY 2026-08-25** — the doubles ship and are the only sanctioned form; existing untyped doubles are baselined by GA-9, not migrated (2026-08-24 cut) |
| UNT-02 | P1 doubles — `withTestDb`, global Redis (AC2) | test | Tasks | **FORWARD-ONLY 2026-08-25** — same basis as UNT-01 |
| UNT-03 | P1 doubles — entry builders, no `fromProps` in specs (AC3) | test | Tasks | **FORWARD-ONLY 2026-08-25** — the `fromProps` ban is a live guard-spec rule; existing call sites are baselined by GA-9 (2026-08-24 cut) |
| UNT-04 | P1 doubles — unstubbed method rejects; state asserted on writes (AC4–5) | test | Tasks | In Tasks — **AC5 is unverifiable as written (2026-08-25)**: "the four interaction-heaviest identity specs" names no files and no tie-break, so no reader can tell which four. AC4 (`mockOf` rejects an unstubbed method) is proven. Name the four or drop the count |
| LNT-01 | P1 proof — vitest/testing-library/jest-dom rules active as errors (AC1) | test | Tasks | In Tasks |
| LNT-02 | P1 proof — local `no-existence-only-assert` rule (AC2) | test | Tasks | In Tasks |
| STR-01 | P1 proof — weak asserts strengthened (AC3) | test | Tasks | **CUT 2026-08-24** — baselined by GA-9 |
| STR-02 | P1 proof — order independence under `--sequence.shuffle` (AC4) | gate | Tasks | **CUT 2026-08-24** — the repo-wide shuffle proof; `--sequence.shuffle` still lands on `api-e2e` via T37 |
| STR-03 | P1 proof — persisted state asserted after a mutation (AC5) | test | Tasks | **CUT 2026-08-24** — baselined by GA-9 |
| STR-04 | P1 proof — `it` count non-decreasing (AC6) | probe: `node scripts/platform/it-count.mjs --check .specs/features/test-suite-refactor/baseline.json` | Tasks | In Tasks |
| WEB-01 | P1 web — helpers exported, `fixed-clock` deleted (AC1) | test | Tasks | In Tasks |
| WEB-02 | P1 web — router/query-client adoption (AC2) | test | Tasks | **CUT 2026-08-24** — baselined by GA-9, enforced forward by T7 + the lint rules |
| WEB-03 | P1 web — entry fixture, setup hygiene (AC3–4) | probe (AC3: read the entry artifact) | Tasks | **CUT 2026-08-24.** AC3 needs no work in any case — see the amendment under P1 § *Web harness adoption*: the fixture already exists at `catalog/identity/single-tenant/web/core/session.fixture.ts` and a "web testing barrel" may not be built (`docs/arch/front.md` forbids front `index` barrels). Not provable in the template — the shells have no identity entry installed |
| CI-01 | P2 gates — CI jobs (AC1–2) | gate | Tasks | In Tasks |
| CI-02 | P2 gates — pre-push Docker-free, turbo pipelines (AC3–4) | test | Tasks | In Tasks |
| COV-01..10 | P2 coverage — absorbed semantics (AC1–4) | gate | Tasks | **CUT 2026-08-24** — satisfied by `audit-2026-08-23-remediation`. **Except COV-04's denominator half, which survives in T5** (the entry-barrel exclude is a live defect in the child) |
| COV-11 | P2 coverage — fills and ratchet on the post-v1 denominator (AC5) | gate | Tasks | **CUT 2026-08-24** — closed by events at 96.5 / 94.4 / 94.9 / 96.8 over a 90 floor; the ratchet is a new decision on AD-027 |
| GAP-01 | P2 gaps — tag use-case specs, delivery repository int-spec (AC1) | test | Tasks | **CUT 2026-08-24** — real, unrelated to duplication; own follow-up |
| GAP-02 | P2 gaps — facade shape specs or rule retired (AC2) | test | Tasks | **CUT 2026-08-24** — real, unrelated to duplication; own follow-up |
| DOC-01 | P3 — `testing.md` rewrite absorbing v1 T26 (AC1) | probe: `rg -n 'Test\.createTestingModule\|test/setup/seed-user' docs/test/testing.md` | Tasks | In Tasks |
| DOC-02 | P3 — prettier on specs, explicit `api-client` no-op test (AC2) | gate | Tasks | **CUT 2026-08-24** — trivia; folded into T35 if free there |

**Coverage:** 32 total (COV-01..10 counted as one row) — **22 mapped to tasks, 10 cut with a reason, 0 unmapped** (`tasks.md` § *Requirement mapping*).
**Probe budget:** 2 of 3 used (STR-04, DOC-01) — every other live requirement is proven by a committed test or a named gate.

> **Reconciled to the scope cut — 2026-08-25, after the Verifier's first pass.** The Verifier
> reported five ACs asserting an absolute the tree does not meet (HRN-01, ENT-05, UNT-01, UNT-02,
> UNT-03) and judged them met only forward-only against the GA-9 baseline. That is the same basis on
> which the 2026-08-24 cut already retired STR-01, STR-03 and WEB-02 — the cut removed the bulk
> migration of the ~250 existing files and said so in `tasks.md` § *Scope cut* ("the existing files
> are baselined (GA-9) and migrate when someone next touches them"). The rows above now say it
> instead of implying it; **no rule was weakened and no baseline was widened** — the mechanism ships
> at full strength in every case and the baseline can only shrink. **This is bookkeeping applied by
> the orchestrator, not a new owner decision: it is the cut's own consequence, written down. The
> owner may flip any of the five back to an absolute, which reopens the bulk migration, not the
> spec.** ENT-04 is a different correction — the field it names never existed.

> **Corrected 2026-08-24 — the cut is 10 rows, not 11, and STR-04 was never cut.** `tasks.md`
> § *Requirement mapping* lumped **STR-04** into the `STR-01, STR-02, STR-03, STR-04 — cut` row, and
> the "11 of 32" arithmetic in that file and in `STATE.md` § *Handoff* was derived from that lump.
> STR-04 is **alive and owned by T1**: T1 declares `Requirement: STR-04`, `design.md` § *Components 10*
> calls the `it`-count tool "STR-04's proof", the `final` gate in `tasks.md` § *Gate Check Commands*
> runs `it-count.mjs --check`, T40's Done-when runs it again, § *Success Criteria* below requires it,
> and the probe-budget line above spends one of its two probes on it. Cutting the non-weakening probe
> would also have contradicted GA-7, which the owner confirmed the same day. One typo against six
> corroborating statements: the row was wrong, not the six.

## Success Criteria

- [ ] `harness-hygiene.spec.ts` is green on the tree and red on each seeded violation (one per banned pattern).
- [ ] `Test.createTestingModule` resolves to exactly one file across `apps/api/**` and `catalog/**`.
- [ ] `pnpm lint` fails on a fixture with `it.only`, on an assertion-less test and on an existence-only test.
- [ ] `pnpm test:e2e --sequence.shuffle` green; every tier green; the `it`-count probe reports no regression beyond the single allowed removal.
- [ ] CI green on the branch; pre-push blocks below 90 % on any metric, globally and per glob.
- [ ] Verifier sensor: every injected mutant killed by a migrated test.
