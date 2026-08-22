# Test Suite Refactor Tasks

## Execution Protocol (MANDATORY)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, wave dispatch, file ownership, gates, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

**Pre-flight (binding, T1):** this feature assumes the post-v1 tree — `catalog/` holds the five entries, `apps/api/src/modules/` holds only the two boundary specs, `main` is at or after `8bb606d`. T1 checks it and stops otherwise.

**Orchestrator reminders:** the planning window never implements a cluster; each wave is dispatched in one message, all clusters concurrently; the Build gate runs once per wave through the runner; the full suite runs exactly once, at the Verifier's Final gate; the orchestrator is the only writer of `.specs/**` during Execute.

---

**Design**: `.specs/features/test-suite-refactor/design.md`
**Status**: Draft

## Test Coverage Matrix

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Kernel harness helper (`mockOf`, `resetDb`, `waitFor`, `expectProblem`, `drainOutbox`) | unit | every documented behaviour incl. the failure path (unstubbed method, unknown schema, timeout) | `apps/api/src/shared/test/**/<name>.spec.ts` | `pnpm --filter api test -- shared/test` |
| Guard spec scanner | unit | the scanner reports a seeded violation and ignores `.catalog-stage` | `apps/api/src/shared/test/hygiene/*.spec.ts` | `pnpm --filter api test -- hygiene` |
| Entry `testing/` barrel | none of its own | exercised by the entry's specs; excluded from the coverage denominator | `catalog/<entry>/api/testing/**` | `pnpm catalog:check` |
| Use case (entry) | unit | happy path + every `throw`; the saved entity asserted, not only the call | `catalog/<entry>/api/application/use-cases/<name>/<name>.use-case.spec.ts` | `pnpm --filter api test` |
| Repository / trigger (entry) | integration | key query paths + conflict/error path, against the real database | `catalog/<entry>/api/infrastructure/**/*.int-spec.ts` | `pnpm --filter api test:int` |
| Route / flow (entry, kernel) | e2e | status, problem body, persisted state; order-independent | `catalog/<entry>/api/__e2e__/*.e2e-spec.ts`, `apps/api/test/*.e2e-spec.ts` | `pnpm --filter api test:e2e` |
| Cross-entry facade | unit | the shape each consumer relies on | `catalog/<entry>/api/api/facades/*.facade.spec.ts` | `pnpm --filter api test` |
| ESLint local rule | unit (RuleTester) | reported and exempt cases both | `packages/eslint-config/rules/*.test.js` | `pnpm --filter @platform/eslint-config test` |
| Lint configuration | unit | resolved severities for an api and a web test file | `packages/eslint-config/*.config.test.js` | `pnpm --filter @platform/eslint-config test` |
| Web component / hook | vitest | rendered outcome or navigation target, never existence | `apps/web/src/**/*.test.ts(x)` | `pnpm --filter web test` |
| Repo tooling (`it-count`, gates) | node:test | exit codes and the reported drop | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| quick | inside a task, on the files just changed | `pnpm --filter api test -- <path>` · `pnpm --filter web test -- <path>` |
| scoped | worker's cluster gate, and the wave Build gate for a wave marked `scoped` | `pnpm --filter api typecheck && pnpm --filter api test -- <cluster paths>` (+ `test:int`/`test:e2e` limited to the touched entry) |
| full-unit | wave Build gate for a wave that touches kernel, harness, lint config or root config | `pnpm check && pnpm turbo test:cov --filter=api --filter=web` |
| final | Verifier only, once per feature | `pnpm check && pnpm --filter api test:cov && pnpm --filter api test:int && pnpm --filter api test:e2e -- --randomize && pnpm --filter web test:cov && pnpm contract && git diff --exit-code openapi.json && pnpm catalog:check && pnpm test:scripts && node scripts/platform/it-count.mjs --check .specs/features/test-suite-refactor/baseline.json` |

## Wave Plan

| Wave | Cluster | Tasks (in order) | Files (union of Touches) | Notes |
| --- | --- | --- | --- | --- |
| 1 | C1 — kernel harness | T1 → T2 → T3 → T4 → T5 → T6 | `scripts/platform/it-count.mjs`, `scripts/platform/__tests__/it-count.test.mjs`, `.specs/features/test-suite-refactor/baseline.json`, `apps/api/src/shared/test/{unit,int,e2e}/**`, `apps/api/test/**`, `apps/api/package.json` (jest config), `catalog/identity/single-tenant/api/testing/**` | `gate: full-unit`; tier **opus** — harness API is the contract every other cluster reuses, and RULE C is decided here |
| 1 | C2 — web vertical | T7 → T8 → T9 → T10 | `apps/web/src/shared/test/**`, `apps/web/src/**/*.test.ts(x)`, `apps/web/src/**` (coverage fill), `apps/web/vitest.config.ts` (excludes only) | `gate: scoped`; tier **sonnet**; no file in common with C1 |
| 2 | C3 — identity | T11 → T12 → T13 → T14 → T15 → T16 | `catalog/identity/single-tenant/api/**` | `gate: full-unit` (wave); tier **sonnet**, T12/T14 **opus** if the chain split touches domain invariants |
| 2 | C4 — notification + attachment | T17 → T18 → T19 → T20 → T21 → T22 | `catalog/notification/api/**`, `catalog/attachment/api/**` | tier **sonnet** |
| 2 | C5 — tag + audit | T23 → T24 → T25 → T26 → T27 | `catalog/tag/api/**`, `catalog/audit/api/**` | tier **sonnet** |
| 2 | C6 — kernel specs | T28 → T29 → T30 | `apps/api/src/**` excluding `src/shared/test/**` and `src/modules/**` | tier **sonnet**; single vertical over the kernel's own specs |
| 3 | C7 — enforcement | T31 → T32 → T33 → T34 | `packages/eslint-config/**`, `apps/api/src/shared/test/hygiene/**`, `apps/api/src/modules/module-boundaries.spec.ts`, `scripts/platform/catalog-lint.mjs` | `gate: full-unit`; tier **opus** for T33/T34 (RULE C/D semantics), **sonnet** for T31/T32 |
| 3 | C8 — docs and formatting | T35 → T36 | `docs/test/testing.md`, `catalog/*/README.md`, `packages/api-client/package.json`, formatting-only edits across spec files | tier **sonnet**; touches no file owned by C7 |
| 4 | C9 — root gates (exclusive) | T37 → T38 | `turbo.json`, `.github/workflows/ci.yml`, `scripts/platform/__tests__/gates.test.mjs` | `Exclusive: yes` — alone in its wave; `gate: scoped`; tier **sonnet** |
| 5 | C10 — ratchet and closure (exclusive) | T39 → T40 | `apps/api/package.json`, `apps/web/vitest.config.ts`, `lefthook.yml`, `.specs/STATE.md`, `.specs/features/test-suite-refactor/**` | `Exclusive: yes`; `gate: full-unit` — this wave *is* the coverage gate; tier **sonnet** |

```
Wave 1: [C1: T1→T2→T3→T4→T5→T6]  ∥  [C2: T7→T8→T9→T10]
Wave 2: [C3: T11→…→T16]  ∥  [C4: T17→…→T22]  ∥  [C5: T23→…→T27]  ∥  [C6: T28→T29→T30]
Wave 3: [C7: T31→T32→T33→T34]  ∥  [C8: T35→T36]
Wave 4: [C9: T37→T38]                        (exclusive — root config)
Wave 5: [C10: T39→T40]                       (exclusive — thresholds, closure)
```

Why the order is what it is: the harness is the contract (wave 1), the migrations consume it in parallel by entry (wave 2), enforcement can only be switched on once the tree is clean (wave 3 — a lint plugin enabled earlier turns the repository red mid-flight), root config and the coverage ratchet are exclusive and land last (waves 4–5, the ratchet after the fills or it blocks its own push).

## Task Breakdown

### T1: Pre-flight and `it`-count baseline

**What**: verify the post-v1 tree, then write the tool and the baseline that prove no test is lost.
**Where**: `scripts/platform/it-count.mjs`, `scripts/platform/__tests__/it-count.test.mjs`, `.specs/features/test-suite-refactor/baseline.json`
**Touches**: the three files above
**Depends on**: None
**Exclusive**: no
**Reuses**: the file-walk of `scripts/platform/catalog-lint.mjs`
**Requirement**: STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] The pre-flight fails loudly if `catalog/` lacks any of the five entries or `apps/api/src/modules/` holds a module directory
- [ ] `--write` records `{ titles, count }` per test file; `--check` exits non-zero on a drop and names file, expected, actual
- [ ] Split files are matched by preserved `it` title, so a split is not read as a loss
- [ ] `baseline.json` committed with the counts of the current tree
- [ ] `node --test scripts/platform/__tests__/it-count.test.mjs` passes

**Tests**: node:test · **Gate**: quick
**Commit**: `test(scripts): it-count baseline tool for the test refactor`

### T2: Unit harness

**What**: `mockOf`, `fixedClock`, `fakeRequestContext`, `fakeLogger` and the shared constants, each with its own spec.
**Where**: `apps/api/src/shared/test/unit/{mock-of,clock,request-context,logger,constants,index}.ts`
**Touches**: `apps/api/src/shared/test/unit/**`
**Depends on**: T1
**Exclusive**: no
**Reuses**: `apps/api/test/setup/test-logger.ts`
**Requirement**: UNT-01, UNT-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `mockOf<T>()` returns `jest.Mocked<T>`; a method neither supplied nor stubbed **rejects** naming itself
- [ ] `fixedClock`, `fakeRequestContext` (kernel defaults), `fakeLogger` exported with types, no `any`
- [ ] `FIXED_NOW` and `TEST_PASSWORD` are the only literals of their kind in the harness
- [ ] Each helper has a spec asserting its documented behaviour and its failure path
- [ ] No import from `catalog/**` or module vocabulary anywhere in the folder (RULE C)

**Tests**: unit · **Gate**: quick
**Commit**: `test(api): unit test harness — typed doubles, clock, request context`

### T3: Int harness

**What**: pool, `resetDb` by schema, `withTestDb`, Redis access; rewire the kernel int-specs onto it.
**Where**: `apps/api/src/shared/test/int/{db,with-test-db,redis,logger,index}.ts`, kernel `*.int-spec.ts`
**Touches**: `apps/api/src/shared/test/int/**`, `apps/api/src/shared/**/*.int-spec.ts`
**Depends on**: T2
**Exclusive**: no
**Reuses**: `apps/api/test/setup/test-db.ts`, `apps/api/test/setup/container-uris.ts`
**Requirement**: HRN-02, UNT-02

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `resetDb(pool, schemas)` truncates in one statement and throws on an unknown schema, listing the known ones
- [ ] `withTestDb({ schemas })` registers its own `beforeAll`/`beforeEach`/`afterAll` and returns `{ pool, db, txm, logger }`
- [ ] No module-named truncation helper exists anywhere in the harness
- [ ] Kernel int-specs use `withTestDb`; no `createTestPool()` inside an `it` body in this scope
- [ ] `pnpm --filter api test:int` green

**Tests**: integration · **Gate**: scoped
**Commit**: `test(api): int harness — withTestDb, resetDb by schema, shared redis`

### T4: E2E harness and the kernel e2e

**What**: the single app factory and the HTTP/outbox/problem vocabulary; migrate the two kernel e2e onto it.
**Where**: `apps/api/src/shared/test/e2e/{app,http,outbox,wait-for,problem,constants,index}.ts`, `apps/api/test/{openapi-contract,security-bootstrap}.e2e-spec.ts`
**Touches**: `apps/api/src/shared/test/e2e/**`, `apps/api/test/*.e2e-spec.ts`
**Depends on**: T3
**Exclusive**: no
**Reuses**: `apps/api/test/setup/app-factory.ts`, `apps/api/test/setup/cookies.ts`
**Requirement**: HRN-01, HRN-03, HRN-04, HRN-05

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `createE2eApp` covers the three app shapes through `middleware` and `rateLimiter`; `middleware: "none"` still silences the logger and returns a closable app
- [ ] `drainOutbox` takes `dispatchers` as a `Pollable[]` option — no module dispatcher named in the kernel (RULE C) — and rejects with the timeout in the message
- [ ] `expectProblem`, `waitFor`, `cookieValue`, `cookieHeader`, `withE2ePool`, `E2E_ORIGIN` exported and specced
- [ ] The two kernel e2e boot through the factory and own no pool of their own
- [ ] `pnpm --filter api test:e2e` green

**Tests**: e2e + unit (helpers) · **Gate**: scoped
**Commit**: `test(api): e2e harness — one app factory, problem and outbox vocabulary`

### T5: Runner plumbing and coverage denominator

**What**: reduce `apps/api/test/setup/` to the runner allow-list and exclude the harness from coverage.
**Where**: `apps/api/test/setup/**`, `apps/api/test/jest-*.json`, `apps/api/package.json`
**Touches**: the paths above
**Depends on**: T4
**Exclusive**: no
**Reuses**: `apps/api/test/setup/e2e-env.ts` (its env block becomes the shared one)
**Requirement**: ENT-05, COV-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `app-factory.ts`, `cookies.ts`, `test-db.ts`, `test-logger.ts` no longer exist under `test/setup/`; nothing imports them
- [ ] `unit-env.ts` imports the shared env block instead of duplicating `e2e-env.ts`
- [ ] Coverage excludes `src/shared/test/**`, `src/modules/*/testing/**`, test files, `*.d.ts`, `main.ts`
- [ ] All three tiers still discover and run the same file set as before the change

**Tests**: none (config) · **Gate**: full-unit
**Commit**: `test(api): shrink runner plumbing, exclude the harness from coverage`

### T6: Identity `testing/` barrel

**What**: give identity a real barrel — it is the helper every other entry's e2e imports.
**Where**: `catalog/identity/single-tenant/api/testing/index.ts` (+ the loose files already there), `catalog/identity/single-tenant/api/module.json`
**Touches**: `catalog/identity/single-tenant/api/testing/**`, `catalog/identity/single-tenant/api/module.json`, `catalog/identity/single-tenant/api/identity.config.fixture.ts`
**Depends on**: T5
**Exclusive**: no
**Reuses**: `testing/{seed-user,allow-all-rate-limiter}.ts`, `testing/seeds/**`, `identity.config.fixture.ts`
**Requirement**: ENT-01, ENT-04, UNT-03

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `index.ts` exports `seedUser` (with `accessProfile: "master"` demoting a previous master), `loginAs`, `tokenFromMail`, `makeUser`, `makeIdentityConfig`, `emails`, `seedEmail`, `allowAllRateLimiter`
- [ ] `identity.config.fixture.ts` moved into `testing/` and re-exported
- [ ] Identity's local `FakeMailer` is deleted in T17's favour, or kept only as a re-export — no second implementation
- [ ] `module.json.files` lists `testing/**`; `pnpm catalog:check` green for identity
- [ ] The barrel imports nothing from another entry except along `dependsOn`

**Tests**: none of its own (exercised by C3) · **Gate**: scoped
**Commit**: `test(identity): testing barrel — seed, login, builders, config fixture`

### T7: Web harness additions

**What**: the missing web helpers, and the deletion of the unused one.
**Where**: `apps/web/src/shared/test/{create-query-wrapper,mock-router,reset-auth-state,index}.ts(x)`
**Touches**: `apps/web/src/shared/test/**`
**Depends on**: None
**Exclusive**: no
**Reuses**: `render-with-providers.tsx`, `msw-server.ts`
**Requirement**: WEB-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `createQueryWrapper`, `mockRouter` (one `vi.hoisted` shape), `resetAuthState`, `useMswServer`, `makeTestQueryClient` exported from one index
- [ ] `fixed-clock.ts` deleted and nothing references it
- [ ] Each helper typed, no `as unknown as` outside the folder

**Tests**: unit · **Gate**: quick
**Commit**: `test(web): harness — router mock, query wrapper, auth reset`

### T8: Migrate web tests onto the harness

**What**: replace ad-hoc router mocks, inline query clients and setup duplication.
**Where**: `apps/web/src/**/*.test.ts(x)`
**Touches**: the same
**Depends on**: T7
**Exclusive**: no
**Reuses**: T7
**Requirement**: WEB-02, WEB-03, STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] No `vi.mock("@tanstack/react-router")` and no `new QueryClient(` in a test file
- [ ] No re-import of a matcher set already loaded by `test/setup.ts`; every `vi.mock` factory uses `vi.hoisted`
- [ ] Current-user fixtures come from the identity web barrel, not from literals
- [ ] `it` count per file ≥ baseline; `pnpm --filter web test` green

**Tests**: vitest · **Gate**: scoped
**Commit**: `test(web): tests on the shared harness`

### T9: Strengthen the web weak asserts

**What**: turn the existence-only web assertions into value assertions.
**Where**: `apps/web/src/app/router/{router,shell.integration}.test.tsx`, `apps/web/src/app/config/transport.test.ts`
**Touches**: the three files above
**Depends on**: T8
**Exclusive**: no
**Reuses**: T7
**Requirement**: STR-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] The router tests assert the redirect target, not that a redirect object exists
- [ ] The shell test asserts the rendered outlet content
- [ ] The transport test asserts the thrown problem and that the 401 path clears the session
- [ ] No `rejects.toBeDefined()` remains in web tests

**Tests**: vitest · **Gate**: quick
**Commit**: `test(web): assert values in router, shell and transport tests`

### T10: Fill web coverage to the bar

**What**: raise web statements/branches/functions/lines to ≥95 % on the post-v1 denominator.
**Where**: `apps/web/src/**`
**Touches**: web test files (and dead code deleted where found)
**Depends on**: T9
**Exclusive**: no
**Reuses**: T7
**Requirement**: COV-05..COV-11

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `pnpm --filter web test:cov` reports ≥95 % on all four metrics
- [ ] Every new test asserts an observable outcome or an error class and message — no ignore pragma anywhere
- [ ] Dead code found while filling is deleted, not ignored, and the deletion is named in the commit body

**Tests**: vitest · **Gate**: scoped
**Commit**: `test(web): coverage to 95% on the kernel-only denominator`

### T11: Identity auth e2e onto the harness

**What**: migrate the auth group (login, logout, refresh, rate limit, outbox e-mail, password flows).
**Where**: `catalog/identity/single-tenant/api/__e2e__/auth-*.e2e-spec.ts`
**Touches**: the same
**Depends on**: None (wave 1 delivered the harness and the barrel)
**Exclusive**: no
**Reuses**: T4, T6
**Requirement**: HRN-01, HRN-06, STR-01, STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] No local `allowAll`, `login`, `extractCookieValue`, `parseSetCookie`, `linkFromHtml` in these files
- [ ] `auth-rate-limit` asserts a numeric `retry-after` and the problem `type` suffix through `expectProblem`
- [ ] `auth-outbox-email` proves delivery through `drainOutbox`, with no `setTimeout` as proof
- [ ] `it` count ≥ baseline; the group passes under `--randomize`

**Tests**: e2e · **Gate**: scoped
**Commit**: `test(identity): auth e2e on the shared harness`

### T12: Identity flow e2e and the ordered chains

**What**: migrate the flow group and make `create-user-flow`, `authz`, `access-link-activation` order-independent.
**Where**: `catalog/identity/single-tenant/api/__e2e__/{create-user-flow,authz,access-link-activation,user-trash,access-catalog}.e2e-spec.ts`
**Touches**: the same
**Depends on**: T11
**Exclusive**: no
**Reuses**: T4, T6
**Requirement**: HRN-06, STR-02, STR-03, STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Each `it` seeds what it needs through a shared `beforeEach`; no `it` reads state written by a previous `it`
- [ ] The "seed master" pseudo-test is removed — the single removal this feature allows, named in the commit body
- [ ] `authz` asserts a 200 and its body instead of "not 401"; `access-catalog` asserts the 403 body through `expectProblem`
- [ ] `user-trash` reads the row through the pool after each mutation
- [ ] `pnpm --filter api test:e2e -- --randomize` green for these files; `it` count ≥ baseline − 1

**Tests**: e2e · **Gate**: scoped
**Commit**: `test(identity): order-independent flow e2e, persisted-state asserts`

### T13: The four `notifications-*` e2e (identity-hosted)

**What**: migrate the cross-entry e2e that AD-026 placed in identity.
**Where**: `catalog/identity/single-tenant/api/__e2e__/notifications-{email,feed,inapp,sse}.e2e-spec.ts`
**Touches**: the same
**Depends on**: T12
**Exclusive**: no
**Reuses**: T4, T6, and notification's barrel once T17 lands (until then, its current fake mailer path)
**Requirement**: HRN-03, HRN-06, STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Delivery is driven by `drainOutbox` with the dispatchers passed in — no hand-rolled poll loop, no sleep
- [ ] Truncation is `resetDb(pool, [...schemas])`, never raw SQL per table
- [ ] Mail assertions go through `findSent`, not a local finder
- [ ] `it` count ≥ baseline; the group passes under `--randomize`

**Tests**: e2e · **Gate**: scoped
**Commit**: `test(identity): notification e2e on drainOutbox`

### T14: Identity unit specs onto shared doubles

**What**: typed dependency factories, builders from the barrel, state asserted on writes.
**Where**: `catalog/identity/single-tenant/api/**/*.spec.ts`
**Touches**: the same
**Depends on**: T13
**Exclusive**: no
**Reuses**: T2, T6
**Requirement**: UNT-01, UNT-03, UNT-04, STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] No `Record<string, any>` dependency factory, no `as never` / `as unknown as` in these specs
- [ ] No `User.fromProps({` outside the barrel; `makeUser` defined exactly once
- [ ] `request-email-change`, `change-password`, `upload-avatar`, `set-password` each assert the changed fields of the saved entity
- [ ] No inline `parseIdentityConfig({…})` — `makeIdentityConfig` instead
- [ ] `it` count ≥ baseline; `pnpm --filter api test` green

**Tests**: unit · **Gate**: scoped
**Commit**: `test(identity): unit specs on typed doubles and entry builders`

### T15: Identity int-specs onto `withTestDb`

**What**: one database lifecycle, one Redis runtime.
**Where**: `catalog/identity/single-tenant/api/**/*.int-spec.ts`
**Touches**: the same, notably `infrastructure/rate-limit/redis-rate-limiter.int-spec.ts`
**Depends on**: T14
**Exclusive**: no
**Reuses**: T3
**Requirement**: UNT-02, HRN-05, STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Every int-spec here uses `withTestDb`; no `createTestPool()` inside an `it`
- [ ] `redis-rate-limiter.int-spec.ts` uses `testRedisUrl()` + `flushRedis()`; no `GenericContainer`
- [ ] `pnpm --filter api test:int` green and measurably faster for this entry (runtime named in the commit body)

**Tests**: integration · **Gate**: scoped
**Commit**: `test(identity): int-specs on withTestDb and the shared redis`

### T16: Identity facade shape specs

**What**: pin the shape consumers depend on for `user-directory` and `permission-catalog`.
**Where**: `catalog/identity/single-tenant/api/api/facades/{user-directory,permission-catalog}.facade.spec.ts`
**Touches**: the two new files
**Depends on**: T15
**Exclusive**: no
**Reuses**: `catalog/attachment/api/api/facades/attachment.facade.spec.ts` as the pattern
**Requirement**: GAP-02

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Each spec asserts the method set and the returned shape each consumer relies on, with a real value per field
- [ ] A removed or renamed field fails the spec (verified by a scratch edit, reverted)

**Tests**: unit · **Gate**: quick
**Commit**: `test(identity): facade shape specs for user-directory and permission-catalog`

### T17: Notification `testing/` barrel

**What**: notification becomes the single owner of `FakeMailer`.
**Where**: `catalog/notification/api/testing/index.ts`, `catalog/notification/api/module.json`
**Touches**: `catalog/notification/api/testing/**`, `catalog/notification/api/module.json`
**Depends on**: None
**Exclusive**: no
**Reuses**: `catalog/notification/api/testing/fake-mailer.ts`
**Requirement**: ENT-02, ENT-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `index.ts` exports `FakeMailer`, `findSent`, `makeNotification`, `DELIVERY_DISPATCHERS(app)`
- [ ] `module.json.files` lists `testing/**`; `pnpm catalog:check` green for notification
- [ ] The barrel names no other entry's vocabulary

**Tests**: none of its own · **Gate**: quick
**Commit**: `test(notification): testing barrel — mailer, findSent, dispatchers`

### T18: Attachment `testing/` barrel

**What**: storage fake, image bytes and seed, in the entry that owns them.
**Where**: `catalog/attachment/api/testing/index.ts`
**Touches**: `catalog/attachment/api/testing/**`, `catalog/attachment/api/module.json`
**Depends on**: T17
**Exclusive**: no
**Reuses**: the in-memory storage currently inlined in attachment's e2e
**Requirement**: ENT-02, ENT-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `inMemoryStorage()` implements the full `ObjectStoragePort` including `getStream`, and exposes its `objects` for assertions
- [ ] `PNG_1PX`, `seedAttachment`, `makeAttachment` exported; the byte literal exists in exactly one file
- [ ] `module.json.files` lists `testing/**`; `pnpm catalog:check` green for attachment

**Tests**: none of its own · **Gate**: quick
**Commit**: `test(attachment): testing barrel — in-memory storage, seeds, fixtures`

### T19: Notification and attachment e2e onto the harness

**What**: migrate both entries' e2e files.
**Where**: `catalog/notification/api/__e2e__/*.e2e-spec.ts`, `catalog/attachment/api/__e2e__/*.e2e-spec.ts`
**Touches**: the same
**Depends on**: T18
**Exclusive**: no
**Reuses**: T4, T6, T17, T18
**Requirement**: HRN-03, HRN-06, STR-03, STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] No inline bootstrap, no local storage fake, no local poll loop, no raw per-table truncation
- [ ] Attachment e2e log in through identity's `loginAs` (import backed by `dependsOn`)
- [ ] Upload and download assert the stored object and the persisted row, not only the status code
- [ ] `it` count ≥ baseline; both groups pass under `--randomize`

**Tests**: e2e · **Gate**: scoped
**Commit**: `test(notification,attachment): e2e on the shared harness`

### T20: Notification and attachment unit and int specs

**What**: shared doubles, entry builders, one Redis runtime.
**Where**: `catalog/notification/api/**/*.{spec,int-spec}.ts`, `catalog/attachment/api/**/*.{spec,int-spec}.ts`
**Touches**: the same, notably `infrastructure/realtime/realtime.int-spec.ts`
**Depends on**: T19
**Exclusive**: no
**Reuses**: T2, T3, T17, T18
**Requirement**: UNT-01, UNT-02, UNT-03, STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] No `Record<string, any>`, no `as never` / `as unknown as`, no `fromProps` literal in these specs
- [ ] `realtime.int-spec.ts` uses the global Redis; no `GenericContainer` anywhere in the two entries
- [ ] Every int-spec uses `withTestDb`
- [ ] `it` count ≥ baseline

**Tests**: unit + integration · **Gate**: scoped
**Commit**: `test(notification,attachment): specs on shared doubles and the global redis`

### T21: Delivery repository int-spec

**What**: the gap the audit named — the delivery repository has no integration coverage.
**Where**: `catalog/notification/api/infrastructure/repositories/drizzle-delivery.repository.int-spec.ts`
**Touches**: the new file
**Depends on**: T20
**Exclusive**: no
**Reuses**: T3, T17
**Requirement**: GAP-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] The key query paths are covered against the real database, each asserting returned rows
- [ ] The conflict/error path is covered, asserting the error class and message
- [ ] `pnpm --filter api test:int` green

**Tests**: integration · **Gate**: scoped
**Commit**: `test(notification): int-spec for the delivery repository`

### T22: Strengthen the notification weak asserts

**What**: the template registry spec must assert what it resolves.
**Where**: `catalog/notification/api/application/templates/notification-template-registry.spec.ts`
**Touches**: the same
**Depends on**: T21
**Exclusive**: no
**Reuses**: T2
**Requirement**: STR-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] The resolved template, subject and recipient are asserted by value
- [ ] No `toBeDefined()` or bare `not.toThrow()` remains in the file
- [ ] A wrong registration fails the spec (verified by a scratch edit, reverted)

**Tests**: unit · **Gate**: quick
**Commit**: `test(notification): assert resolved template and subject`

### T23: Tag and audit `testing/` barrels

**What**: the two entries that have no test vocabulary of their own.
**Where**: `catalog/tag/api/testing/index.ts`, `catalog/audit/api/testing/index.ts`
**Touches**: `catalog/{tag,audit}/api/testing/**`, both `module.json`
**Depends on**: None
**Exclusive**: no
**Reuses**: the seeds currently inlined in their e2e
**Requirement**: ENT-02, ENT-04, UNT-03

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `makeTag`/`seedTag` and `makeAuditEntry`/`seedAuditEntry` exported, typed, no `any`
- [ ] `module.json.files` lists `testing/**` for both; `pnpm catalog:check` green for both
- [ ] Neither barrel names another entry's vocabulary except along `dependsOn`

**Tests**: none of their own · **Gate**: quick
**Commit**: `test(tag,audit): testing barrels`

### T24: Tag and audit e2e onto the harness

**What**: migrate both e2e groups and assert the bodies and the rows.
**Where**: `catalog/tag/api/__e2e__/*.e2e-spec.ts`, `catalog/audit/api/__e2e__/*.e2e-spec.ts`
**Touches**: the same
**Depends on**: T23
**Exclusive**: no
**Reuses**: T4, T6, T23
**Requirement**: HRN-06, STR-01, STR-03, STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] No inline bootstrap, no local login or cookie helper, no raw per-table truncation
- [ ] The 403 cases assert the body through `expectProblem`, not only the status
- [ ] The tag trash case reads the row after the mutation
- [ ] `it` count ≥ baseline; both groups pass under `--randomize`

**Tests**: e2e · **Gate**: scoped
**Commit**: `test(tag,audit): e2e on the shared harness with body and row asserts`

### T25: Tag and audit unit and int specs

**What**: shared doubles and a real assertion on the audit trigger.
**Where**: `catalog/tag/api/**/*.{spec,int-spec}.ts`, `catalog/audit/api/**/*.{spec,int-spec}.ts`
**Touches**: the same, notably `infrastructure/trail/audit-trigger.int-spec.ts`
**Depends on**: T24
**Exclusive**: no
**Reuses**: T2, T3, T23
**Requirement**: UNT-01, UNT-03, STR-01, STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] No `Record<string, any>`, no `as` casts, no `fromProps` literal in these specs
- [ ] `audit-trigger.int-spec.ts` asserts the trail row the trigger writes, field by field
- [ ] Every int-spec uses `withTestDb`
- [ ] `it` count ≥ baseline

**Tests**: unit + integration · **Gate**: scoped
**Commit**: `test(tag,audit): specs on shared doubles, assert the trail row`

### T26: Tag use-case specs

**What**: the five use-cases with no spec at all.
**Where**: `catalog/tag/api/application/use-cases/{create-tag,get-tag,restore-tags,stash-tag,update-tag}/<name>.use-case.spec.ts`
**Touches**: the five new files
**Depends on**: T25
**Exclusive**: no
**Reuses**: T2, T23
**Requirement**: GAP-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Each spec covers the happy path and every `throw` in its use-case, asserting the error class and message
- [ ] Writes assert the entity captured by the port, not only that the port was called
- [ ] `pnpm --filter api test` green

**Tests**: unit · **Gate**: scoped
**Commit**: `test(tag): specs for the five uncovered use-cases`

### T27: Tag and audit facade shape specs

**What**: close GAP-02 for the remaining two facades.
**Where**: `catalog/tag/api/api/facades/tag-directory.facade.spec.ts`, `catalog/audit/api/api/facades/audit-registry.facade.spec.ts`
**Touches**: the two new files
**Depends on**: T26
**Exclusive**: no
**Reuses**: T16's pattern
**Requirement**: GAP-02

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Each spec asserts the method set and returned shape consumers rely on, with real values
- [ ] A removed or renamed field fails the spec (verified by a scratch edit, reverted)

**Tests**: unit · **Gate**: quick
**Commit**: `test(tag,audit): facade shape specs`

### T28: Kernel specs onto the shared doubles

**What**: the api's own specs adopt the harness.
**Where**: `apps/api/src/**/*.{spec,int-spec}.ts` excluding `src/shared/test/**` and `src/modules/**`
**Touches**: the same
**Depends on**: None
**Exclusive**: no
**Reuses**: T2, T3
**Requirement**: UNT-01, UNT-02, STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] No `Record<string, any>` and no `as never` / `as unknown as` in kernel specs
- [ ] Every kernel int-spec uses `withTestDb`; no `createTestPool()` inside an `it`
- [ ] `it` count ≥ baseline; `pnpm --filter api test` and `test:int` green

**Tests**: unit + integration · **Gate**: scoped
**Commit**: `test(api): kernel specs on the shared doubles`

### T29: Strengthen the kernel weak asserts

**What**: four files that today prove existence, not behaviour.
**Where**: `apps/api/src/shared/kernel/clock/bucket-sql.spec.ts`, `apps/api/src/shared/infra/database/{pool-metrics.spec.ts,application-pool.int-spec.ts}`, `apps/api/src/shared/config/load-dotenv.spec.ts`
**Touches**: the four files
**Depends on**: T28
**Exclusive**: no
**Reuses**: T2, T3
**Requirement**: STR-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `bucket-sql` asserts the generated SQL text; `pool-metrics` asserts metric values; `application-pool` asserts pool state per transition; `load-dotenv` asserts the loaded value
- [ ] No `toBeDefined()` or bare `not.toThrow()` remains in the four files
- [ ] Each strengthened assertion fails against a scratch mutation of its production file (reverted)

**Tests**: unit + integration · **Gate**: quick
**Commit**: `test(api): assert values in clock, pool and config specs`

### T30: Fill api kernel coverage to the bar

**What**: raise api unit coverage to ≥95 % on the kernel-only denominator.
**Where**: `apps/api/src/**`
**Touches**: api spec files (and dead code deleted where found)
**Depends on**: T29
**Exclusive**: no
**Reuses**: T2, T3
**Requirement**: COV-05..COV-11

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `pnpm --filter api test:cov` reports ≥95 % on all four metrics
- [ ] Every new test asserts an observable outcome or an error class and message — no ignore pragma
- [ ] Dead code found while filling is deleted, not ignored, and named in the commit body

**Tests**: unit · **Gate**: scoped
**Commit**: `test(api): kernel unit coverage to 95%`

### T31: Test lint plugins

**What**: wire the four plugins and prove they actually resolve.
**Where**: `packages/eslint-config/{base.js,react.js,package.json}`, `packages/eslint-config/config.test.js`
**Touches**: the same
**Depends on**: None
**Exclusive**: no
**Reuses**: the existing flat-config shape of the package
**Requirement**: LNT-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `eslint-plugin-jest` on api test globs; `@vitest/eslint-plugin`, `eslint-plugin-testing-library`, `eslint-plugin-jest-dom` on web test globs, versions pinned
- [ ] `no-focused-tests`, `no-disabled-tests`, `expect-expect`, `no-conditional-expect` resolve as `error` for both an api and a web test file, asserted by the config test
- [ ] `pnpm lint` green on the whole repository — no `eslint-disable`, no allow-list

**Tests**: unit (config test) · **Gate**: full-unit
**Commit**: `chore(eslint): test lint plugins for api and web`

### T32: Local rule `no-existence-only-assert`

**What**: make lesson L-007 mechanical.
**Where**: `packages/eslint-config/rules/no-existence-only-assert.{js,test.js}`, registration in `base.js`/`react.js`
**Touches**: the same
**Depends on**: T31
**Exclusive**: no
**Reuses**: `rules/sr-only-requires-positioned-ancestor.{js,test.js}` and its registration at `react.js:9,13,66`
**Requirement**: LNT-02

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Reports a body whose every `expect` ends in `toBeDefined`/`toBeUndefined`/`toBeTruthy`/`toBeFalsy`/`resolves|rejects.toBeDefined`/argument-less `not.toThrow`
- [ ] Does not report when a concrete value is also asserted, when `expect.assertions(n)` is declared, or when `not.toThrow(matcher)` has an argument
- [ ] RuleTester suite covers both lists; the rule is registered as `error` for api and web test globs
- [ ] `pnpm lint` green on the repository

**Tests**: unit (RuleTester) · **Gate**: full-unit
**Commit**: `feat(eslint): no-existence-only-assert rule`

### T33: Guard spec

**What**: the executable form of every duplication ban — the component that keeps the refactor from decaying.
**Where**: `apps/api/src/shared/test/hygiene/{scan.ts,scan.spec.ts,harness-hygiene.spec.ts}`
**Touches**: `apps/api/src/shared/test/hygiene/**`
**Depends on**: T32
**Exclusive**: no
**Reuses**: the file-walk of `apps/api/src/modules/module-boundaries.spec.ts`
**Requirement**: HRN-01, HRN-02, HRN-05, HRN-06, UNT-01, UNT-03, ENT-05

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] One `it` per ban, each failure listing `rule · file:line · snippet`
- [ ] Bans: single `Test.createTestingModule`; no banned helper definition; no `PNG_1PX`, origin or password literal outside the harness and barrels; no `createTestPool(` inside an `it`; no `Record<string, any>` in a spec; `as never`/`as unknown as` only under `shared/test/**`; no `fromProps` in a spec; no `GenericContainer` in an int-spec; `test/setup/` matches the runner allow-list
- [ ] The scanner ignores `node_modules`, `dist`, `coverage` and `apps/api/.catalog-stage/**`, and works on both the template layout and a child's `apps/api/src/modules/*/testing/**` — asserted by `scan.spec.ts` against fixtures
- [ ] The spec is green on the tree and red on a seeded violation for every ban (verified once, reverted)

**Tests**: unit · **Gate**: full-unit
**Commit**: `test(api): harness hygiene guard spec`

### T34: RULE D for entry test imports

**What**: a `testing/` import must be backed by `dependsOn` and must not close a cycle.
**Where**: `apps/api/src/modules/module-boundaries.spec.ts`, `scripts/platform/catalog-lint.mjs`
**Touches**: the two files
**Depends on**: T33
**Exclusive**: no
**Reuses**: RULE C's implementation in the same spec, `resolveDeps` in the platform scripts
**Requirement**: ENT-03

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] An import of `catalog/<other>/api/testing/**` fails unless `<other>` is in the importer's `module.json.dependsOn`
- [ ] An import that would close a cycle in the `dependsOn` DAG fails with the cycle named (AD-025)
- [ ] `catalog-lint` reports the same violation for an entry checked outside a child
- [ ] Both rules verified against a scratch violation, reverted; `pnpm test:scripts` and `pnpm catalog:lint` green

**Tests**: unit + node:test · **Gate**: full-unit
**Commit**: `test(catalog): RULE D — testing imports follow dependsOn`

### T35: Rewrite `docs/test/testing.md`

**What**: the handbook describes the harness that now exists (absorbs v1 T26).
**Where**: `docs/test/testing.md`, `catalog/*/README.md` § *Tests*
**Touches**: the same
**Depends on**: None
**Exclusive**: no
**Reuses**: the section skeleton already in the file
**Requirement**: DOC-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Documents the three harness folders with their exported API, the entry `testing/` convention, the parity suites, RULE C and RULE D, the lint rules, the real CI, the pre-push suite and the coverage thresholds
- [ ] No reference to an inline `Test.createTestingModule` bootstrap, to `test/setup/seed-user`, to `test/setup/fake-mailer` or to any file the refactor removed
- [ ] Each entry README § *Tests* states where the entry's helpers live and what a dependent may import
- [ ] `rg -n 'Test\.createTestingModule|test/setup/seed-user' docs/test/testing.md` returns nothing

**Tests**: none (docs) · **Gate**: quick
**Commit**: `docs(test): rewrite testing.md for the shared harness`

### T36: Formatting and the `api-client` no-op test

**What**: the last two hygiene items.
**Where**: spec files failing `format:check`, `packages/api-client/package.json`
**Touches**: the same
**Depends on**: T35
**Exclusive**: no
**Reuses**: the repo prettier config
**Requirement**: DOC-02

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `pnpm format:check` passes on every spec file (formatting-only diff, no assertion touched)
- [ ] `packages/api-client` declares an explicit no-op `test` script with a comment pointing at the generator, so `turbo test` reports it rather than silently skipping

**Tests**: none · **Gate**: quick
**Commit**: `chore: format specs, explicit no-op test for api-client`

### T37: Turbo pipelines and the CI workflow

**What**: the pipeline the handbook has been promising.
**Where**: `turbo.json`, `.github/workflows/ci.yml`
**Touches**: the two files
**Depends on**: None
**Exclusive**: **yes** — root configuration
**Reuses**: `.github/workflows/catalog.yml` as the shape reference (Node from `.nvmrc`, pnpm from `packageManager`)
**Requirement**: CI-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Jobs `check`, `unit`, `int`, `e2e` (with `--randomize`), `contract`, `coverage-all`; `contract` fails on a dirty `openapi.json`; `coverage-all` keeps the existing combined floors
- [ ] `int` and `e2e` bring up their Docker services; jobs are independent so one red job never masks another
- [ ] `turbo.json` declares `test:cov`, `test:cov:all`, `test:watch` with `outputs: ["coverage/**"]` and `cache: false` on the Docker-bound tasks
- [ ] `catalog.yml` is untouched and no job is duplicated between the two files
- [ ] The workflow runs green on the feature branch (run URL in the commit body)

**Tests**: none (CI config) · **Gate**: scoped
**Commit**: `ci: pipeline for check, unit, int, e2e, contract and coverage`

### T38: Gate shape test

**What**: keep the local gates from silently drifting.
**Where**: `scripts/platform/__tests__/gates.test.mjs`
**Touches**: the new file
**Depends on**: T37
**Exclusive**: **yes**
**Reuses**: the existing `node --test` suites under `scripts/platform/__tests__/`
**Requirement**: CI-02

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Asserts pre-push runs typecheck, migrations check, api `test:cov` and web `test:cov`, and that no pre-push task needs Docker
- [ ] Asserts the three turbo test pipelines exist with the declared `outputs` and `cache` flags
- [ ] `pnpm test:scripts` green

**Tests**: node:test · **Gate**: scoped
**Commit**: `test(scripts): assert the pre-push and turbo gate shape`

### T39: Coverage ratchet

**What**: raise the bar now that the tree can meet it.
**Where**: `apps/api/package.json` (jest thresholds), `apps/web/vitest.config.ts`, `lefthook.yml`
**Touches**: the three files
**Depends on**: None (within its own wave; every fill landed in wave 2)
**Exclusive**: **yes** — it changes the gate that every push runs
**Reuses**: the thresholds already declared at the lower value
**Requirement**: COV-01, COV-02, COV-03, COV-11

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] jest and vitest thresholds are 95 for statements, branches, functions and lines
- [ ] lefthook pre-push runs api `test:cov` (switched from `test`) and web `test:cov`, still Docker-free
- [ ] A scratch file with an uncovered branch blocks `git push`, and its removal unblocks it (verified once, reverted)

**Tests**: none (config) · **Gate**: full-unit
**Commit**: `chore(gates): ratchet coverage to 95% and switch pre-push to test:cov`

### T40: Closure

**What**: record the decision and hand the feature to the Verifier.
**Where**: `.specs/STATE.md`, `.specs/features/test-suite-refactor/**`
**Touches**: the same
**Depends on**: T39
**Exclusive**: **yes**
**Reuses**: the AD block drafted in `design.md` § *Tech Decisions*
**Requirement**: DOC-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] AD-023 appended to `.specs/STATE.md` § *Decisions* with status `active`, dated, RULE D included
- [ ] The Handoff entry for this feature reflects the wave plan actually executed
- [ ] `node scripts/platform/it-count.mjs --check .specs/features/test-suite-refactor/baseline.json` passes with the single documented removal accounted for

**Tests**: none · **Gate**: quick
**Commit**: `docs(specs): AD-023 active, test-suite-refactor closeout`

## Wave Execution Map

```
Wave 1  C1 kernel harness (opus)      T1 → T2 → T3 → T4 → T5 → T6
        C2 web vertical (sonnet)      T7 → T8 → T9 → T10
        Build gate: full-unit
Wave 2  C3 identity (sonnet/opus)     T11 → T12 → T13 → T14 → T15 → T16
        C4 notif + attach (sonnet)    T17 → T18 → T19 → T20 → T21 → T22
        C5 tag + audit (sonnet)       T23 → T24 → T25 → T26 → T27
        C6 kernel specs (sonnet)      T28 → T29 → T30
        Build gate: full-unit
Wave 3  C7 enforcement (opus/sonnet)  T31 → T32 → T33 → T34
        C8 docs (sonnet)              T35 → T36
        Build gate: full-unit
Wave 4  C9 root gates (sonnet)        T37 → T38                 [exclusive]
        Build gate: scoped
Wave 5  C10 ratchet + closure         T39 → T40                 [exclusive]
        Build gate: full-unit
Verifier (fresh, sonnet; opus if the sensor targets the access guard or the session cookie)
        Final gate + sensor + validation.md
```

Orchestrator per wave: dispatch every cluster of the wave in one message · wait for all compact summaries · run the Build gate once through the runner · record status and commit hashes in the tables of this file · one line to the user · next wave.

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | one tool + baseline file | ✅ |
| T2, T3, T4 | one harness folder each, with its specs | ✅ |
| T5 | plumbing shrink + coverage excludes — one config concern | ✅ |
| T6, T17, T18, T23 | one barrel each (T23 covers two thin entries that share a shape) | ✅ |
| T7, T8, T9, T10 | web harness, migration, strengthening, fill — separable, each independently verifiable | ✅ |
| T11, T12, T13 | identity e2e split by group; T12 carries the chain splits, the heaviest single task in the feature | ⚠️ split further if the flow group exceeds ~8 files |
| T14, T15 | identity unit vs int — different runners, different gates | ✅ |
| T16, T27 | facade specs, two per task | ✅ |
| T19, T20 | two entries per task, same shape of change | ✅ |
| T21, T22, T26 | one gap each | ✅ |
| T24, T25 | two entries per task, same shape of change | ✅ |
| T28, T29, T30 | kernel migration, strengthening, fill | ✅ |
| T31, T32 | plugin wiring vs local rule — different failure modes | ✅ |
| T33 | the guard spec is large but indivisible: one scanner, one spec, one ban list | ⚠️ acceptable — bans share the scanner |
| T34 | one boundary rule in two consumers | ✅ |
| T35, T36 | docs vs formatting | ✅ |
| T37, T38, T39, T40 | one config concern each | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram shows | Status |
| --- | --- | --- | --- |
| T1 | None | first in C1 | ✅ |
| T2–T6 | T1 → T2 → T3 → T4 → T5 | the same chain in C1 | ✅ |
| T7 | None | first in C2, no cross-cluster edge | ✅ |
| T8–T10 | T7 → T8 → T9 | the same chain in C2 | ✅ |
| T11 | None (wave 1 output only) | first in C3 | ✅ |
| T12–T16 | T11 → T12 → T13 → T14 → T15 | the same chain in C3 | ✅ |
| T17 | None (wave 1 output only) | first in C4 | ✅ |
| T18–T22 | T17 → T18 → T19 → T20 → T21 | the same chain in C4 | ✅ |
| T23 | None (wave 1 output only) | first in C5 | ✅ |
| T24–T27 | T23 → T24 → T25 → T26 | the same chain in C5 | ✅ |
| T28 | None (wave 1 output only) | first in C6 | ✅ |
| T29, T30 | T28 → T29 | the same chain in C6 | ✅ |
| T31 | None (waves 1–2 output only) | first in C7 | ✅ |
| T32–T34 | T31 → T32 → T33 | the same chain in C7 | ✅ |
| T35, T36 | None → T35 | C8 | ✅ |
| T37, T38 | None → T37 | C9, exclusive wave | ✅ |
| T39, T40 | None → T39 | C10, exclusive wave | ✅ |
| T13 note | uses notification's barrel (T17, wave 2, sibling cluster) | resolved: T13 falls back to the entry's current mailer path; the barrel import is picked up by T20's sweep | ✅ |

## Wave/Cluster Cross-Check

| Wave | Cluster | Tasks (order) | Files (union of Touches) | Deps outside earlier waves / own cluster? | Files shared with a sibling cluster? | Exclusive alone? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | C1 | T1→T2→T3→T4→T5→T6 | `scripts/platform/it-count*`, `apps/api/src/shared/test/**`, `apps/api/test/**`, `apps/api/package.json`, `catalog/identity/**/testing/**` | no | no (C2 is web-only) | n/a | ✅ |
| 1 | C2 | T7→T8→T9→T10 | `apps/web/**` | no | no | n/a | ✅ |
| 2 | C3 | T11→…→T16 | `catalog/identity/single-tenant/api/**` | no — consumes wave 1 only | no | n/a | ✅ |
| 2 | C4 | T17→…→T22 | `catalog/notification/api/**`, `catalog/attachment/api/**` | no | no | n/a | ✅ |
| 2 | C5 | T23→…→T27 | `catalog/tag/api/**`, `catalog/audit/api/**` | no | no | n/a | ✅ |
| 2 | C6 | T28→T29→T30 | `apps/api/src/**` minus `shared/test/**` and `modules/**` | no | no | n/a | ✅ |
| 3 | C7 | T31→…→T34 | `packages/eslint-config/**`, `apps/api/src/shared/test/hygiene/**`, `apps/api/src/modules/module-boundaries.spec.ts`, `scripts/platform/catalog-lint.mjs` | no | no | n/a | ✅ |
| 3 | C8 | T35→T36 | `docs/test/testing.md`, `catalog/*/README.md`, `packages/api-client/package.json`, formatting-only spec edits | no | ⚠️ formatting touches files C7 does not own but that other clusters wrote in wave 2 — safe (wave 2 is closed), and the diff is formatting-only | n/a | ✅ |
| 4 | C9 | T37→T38 | `turbo.json`, `.github/workflows/ci.yml`, `scripts/platform/__tests__/gates.test.mjs` | no | n/a | yes — alone in wave 4 | ✅ |
| 5 | C10 | T39→T40 | `apps/api/package.json`, `apps/web/vitest.config.ts`, `lefthook.yml`, `.specs/**` | no | n/a | yes — alone in wave 5 | ✅ |

Notes: `apps/api/package.json` is touched by C1 (jest coverage excludes, wave 1) and by C10 (thresholds, wave 5) — different waves, no concurrent ownership. Four clusters is the cap and wave 2 sits exactly at it.

## Test Co-location Validation

| Task | Code layer created/modified | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T1 | repo tooling | node:test | node:test | ✅ |
| T2, T3, T4 | kernel harness helpers | unit spec per helper incl. failure path | unit specs required in Done-when | ✅ |
| T5 | runner config | none | none | ✅ |
| T6, T17, T18, T23 | entry testing barrels | none of their own; `catalog:check` | `catalog:check` in Done-when | ✅ |
| T7 | web harness | unit | unit | ✅ |
| T8, T9 | web components/hooks | vitest, outcome asserted | vitest with value asserts | ✅ |
| T10, T30 | coverage fills | same tier as the code filled | unit/vitest | ✅ |
| T11, T12, T13, T19, T24 | routes and flows | e2e, order-independent | e2e + `--randomize` | ✅ |
| T14, T20, T25, T26 | use cases | unit, saved entity asserted | unit with captured-entity asserts | ✅ |
| T15, T20, T21, T25 | repositories, triggers, realtime | integration | integration on `withTestDb` | ✅ |
| T16, T27 | cross-entry facades | unit shape spec | unit shape spec | ✅ |
| T22, T29 | strengthening only | same tier as the file | unit/integration, unchanged tier | ✅ |
| T31 | lint configuration | unit (resolved severities) | config test | ✅ |
| T32 | ESLint local rule | RuleTester | RuleTester | ✅ |
| T33 | guard scanner + spec | unit, incl. the exclusion of `.catalog-stage` | `scan.spec.ts` against fixtures | ✅ |
| T34 | boundary rule | unit + node:test | both | ✅ |
| T35, T36, T37, T39, T40 | docs, formatting, CI, thresholds | none / gate | gate result named in Done-when | ✅ |
| T38 | repo tooling | node:test | node:test | ✅ |

## Requirement mapping

| Requirement | Tasks |
| --- | --- |
| HRN-01 | T4, T11, T33 |
| HRN-02 | T3, T33 |
| HRN-03 | T4, T13, T19 |
| HRN-04 | T4 |
| HRN-05 | T4, T15, T28, T33 |
| HRN-06 | T11, T12, T13, T19, T24, T33 |
| ENT-01 | T6 |
| ENT-02 | T17, T18, T23 |
| ENT-03 | T34 |
| ENT-04 | T6, T17, T18, T23 |
| ENT-05 | T5, T33 |
| UNT-01 | T2, T14, T20, T25, T28, T33 |
| UNT-02 | T3, T15, T20, T28 |
| UNT-03 | T6, T14, T20, T23, T25, T33 |
| UNT-04 | T2, T14 |
| LNT-01 | T31 |
| LNT-02 | T32 |
| STR-01 | T9, T11, T22, T24, T25, T29 |
| STR-02 | T12 |
| STR-03 | T12, T19, T24 |
| STR-04 | T1, T8, T11–T15, T19, T20, T24, T25, T28, T40 |
| WEB-01 | T7 |
| WEB-02 | T8 |
| WEB-03 | T8 |
| CI-01 | T37 |
| CI-02 | T38 |
| COV-01..10 | T10, T30, T39 |
| COV-11 | T5, T10, T30, T39 |
| GAP-01 | T21, T26 |
| GAP-02 | T16, T27 |
| DOC-01 | T35, T40 |
| DOC-02 | T36 |

**32 requirements, 32 mapped, 0 unmapped.**

## Tips

- The harness is a product with users: every helper gets a spec for its failure path, because a harness that fails silently poisons every suite that uses it.
- Migrate a file in two steps inside the same task — first swap the helper, run the file, then strengthen the assertions. Doing both blind makes a red suite ambiguous.
- Preserve `it` titles verbatim when splitting a file; the baseline matches by title and a rename reads as a deletion.
- A strengthened assertion is worth what it rejects: prove it once against a scratch mutation of the production file, then revert. Never commit the mutation.
- When a migration reveals a real bug, stop and report it in the wave summary — do not fix production code inside a test task.
- `pnpm catalog:check` installs the entry into a scratch child; it is the only proof that `module.json.files` really carries `testing/**`.

## Task Verification Standards

- A task is done when its gate passes — the runner decides, never self-assessment. Tests are never weakened, skipped or deleted to make a gate pass.
- One atomic commit per task, pathspec-limited to the task's `Touches`. No `git add -A`, no `commit -a`, no `stash`, no branch operations inside a worker.
- A worker that needs a file it does not own stops and reports; it never edits across the ownership line.
- Every migration task states the `it` count before and after in its commit body; a drop is a failure, not a note.
- The full suite runs exactly once, at the Verifier's Final gate. Wave Build gates are scoped unless the wave is marked `full-unit`.
- The Verifier is dispatched automatically after wave 5 — fresh, author ≠ verifier, evidence-or-zero — and writes `validation.md`.
