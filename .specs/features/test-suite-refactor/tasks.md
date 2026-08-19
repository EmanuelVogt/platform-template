# Test suite refactor — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

**Pre-flight (binding):** this feature assumes the post-v1-T22 tree (`catalog/` holds the five entries, `apps/api/src/modules/` empty, v1 wave 4 gate PASS). T0 checks it and stops otherwise.

---

**Design**: `.specs/features/test-suite-refactor/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `docs/test/testing.md` (pyramid, "o que conta como prova" L-004/L-007/L-010/L-013, runners, naming), `docs/code-quality.md`, `AGENTS.md.jinja`, `apps/api/package.json` jest (`.spec.ts`, thresholds 43/35/40/45), `apps/api/test/jest-integration.json` (`.int-spec.ts`, 4 workers), `apps/api/test/jest-e2e.json` (`.e2e-spec.ts`, 1 worker, 1.5 GB idle limit), `apps/web/vitest.config.ts` (`.test.ts(x)`, 64/56/61/64), `apps/api/scripts/coverage-all.sh` (85/51/90/90), `lefthook.yml` (pre-push), `packages/eslint-config/rules/*.test.js` (`node --test`).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Harness logic (api `shared/test/unit`: `mockOf`, `fakeRequestContext`; `shared/test/e2e`: `expectProblem`, `waitFor`, `cookieValue`) | unit | every branch of the helper (unstubbed throw, timeout, matcher variants); 1:1 to HRN/UNT ACs | `apps/api/src/shared/test/**/*.spec.ts` | `pnpm --filter api test` |
| Harness DB logic (`resetDb`, `withTestDb`, `flushRedis`) | integration | schema validation error path + truncate across two schemas + redis flush | `apps/api/src/shared/test/int/*.int-spec.ts` | `pnpm --filter api test:int` |
| Harness app (`createE2eApp`, `drainOutbox`, `withE2ePool`) | e2e | every option value (`rateLimiter`, `middleware`, `overrides`, `extraModules`; dispatcher injection; timeout) | `apps/api/test/harness.e2e-spec.ts` | `pnpm --filter api test:e2e` |
| Entry `testing/` barrels | unit (for `makeUser`/`inMemoryStorage` logic) + consumed by the entry's migrated specs | `seedUser` master demotion, `inMemoryStorage` getStream/head/delete, `tokenFromMail` no-link rejection | `catalog/<entry>/api/testing/*.spec.ts` | `pnpm --filter api test` (catalog entries run under the template jest roots during this feature — confirm T0) |
| Migrated spec files (e2e/int/unit) | same tier as the file | `it` count ≥ before; every AC in STR-01/02/03 for the named files; `--randomize` green for e2e | unchanged | tier command |
| Web harness (`mockRouter`, `createQueryWrapper`, `resetAuthState`, `useMswServer`) | unit (via adopting tests + one direct test each) | each helper exercised by ≥1 migrated test + its own smoke | `apps/web/src/shared/test/*.test.ts(x)` | `pnpm --filter web test` |
| Lint rule `no-existence-only-assert` | unit (`node --test`) | valid/invalid cases from design § 6 incl. `not.toThrow(/x/)` non-report, `expect.assertions` | `packages/eslint-config/rules/no-existence-only-assert.test.js` | `pnpm --filter @platform/eslint-config test` (or `node --test rules/*.test.js` — confirm at T21) |
| Config (jest/vitest/turbo/lefthook/tsconfig) | none — build gate | — | — | build gate |
| CI workflow | none — green run on branch | — | `.github/workflows/ci.yml` | push + check |
| Docs | none | — | `docs/test/testing.md` | `pnpm format:check` |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | unit-only tasks (api or web) | `pnpm --filter api test` · `pnpm --filter web test` |
| Full | tasks touching int/e2e or harness | quick + `pnpm --filter api test:int && pnpm --filter api test:e2e` (e2e tasks also `pnpm --filter api test:e2e -- --randomize`) |
| Build | phase end / config tasks | `pnpm check && pnpm test && pnpm --filter api test:int && pnpm --filter api test:e2e && pnpm --filter api build` |
| Coverage | COV tasks | `pnpm turbo test:cov --filter=api --filter=web` |

---

## Execution Plan

### Phase 0: Pre-flight + baseline
```
T0
```
### Phase 1: Kernel api harness
```
T1 → T2 → T3 → T4
```
### Phase 2: Entry `testing/` barrels
```
T5 → T6 → T7 → T8 → T9
```
### Phase 3: E2E migration
```
T10 → T11 → T12 → T13
```
### Phase 4: Unit/int migration + gaps
```
T14 → T15 → T16 → T17 → T18
```
### Phase 5: Web
```
T19 → T20
```
### Phase 6: Lint + CI
```
T21 → T22 → T23
```
### Phase 7: Coverage + docs + closure
```
T24 → T25 → T26 → T27
```

---

## Task Breakdown

### T0: Pre-flight check + baseline metrics
**What**: Verify post-T22 tree; record the baseline the Verifier compares against.
**Where**: `.specs/features/test-suite-refactor/baseline.md`
**Depends on**: None
**Reuses**: audit greps (spec § Success Criteria)
**Requirement**: STR-04
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `catalog/` has `identity/single-tenant`, `audit`, `attachment`, `notification`, `tag`; `apps/api/src/modules/` has no module dir — else STOP with the message "v1 T22 not landed".
- [ ] `baseline.md` has: per spec file path → `it` count (`rg -c "^\s*it\("` + `it.each` rows noted), totals per tier, and the grep counts of spec § Success Criteria (bootstraps, `allowAll`, `login`, `Record<string, any>`, `as never`, `as unknown as`, `toBeDefined`, `not.toThrow()`), plus the coverage numbers of `pnpm turbo test:cov --filter=api --filter=web`.
- [ ] Confirms how catalog entries' specs are run during this feature (jest roots include `catalog/**` or a `catalog:check` command) and records the command in § Gate Check Commands.
**Tests**: none · **Gate**: build (read-only; just run it to record)
**Commit**: `chore(specs): test-suite-refactor baseline`

### T1: `shared/test/unit` — `mockOf`, `fixedClock`, `fakeRequestContext`, `fakeLogger`, constants
**What**: Create the unit doubles module with its own specs.
**Where**: `apps/api/src/shared/test/unit/{mock-of,clock,request-context,logger,constants,index}.ts` + `mock-of.spec.ts`, `request-context.spec.ts`
**Depends on**: T0
**Reuses**: kernel `Clock`, `RequestContext` public API, `makeTestLogger` (`apps/api/test/setup/test-logger.ts`)
**Requirement**: UNT-01
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `mockOf<T>()` returns `jest.Mocked<T>`; unstubbed method call throws `Error("<name> não stubado")`; provided functions are `jest.fn` wrappers (`toHaveBeenCalledWith` works) — each a test.
- [ ] `fakeRequestContext()` defaults (`correlationId "c1"`, `requestId "r1"`, `userAgent "jest"`, `actor null`) readable via `ctx.get()`; override merges — tests.
- [ ] `fixedClock().now()` equals `FIXED_NOW`; `fakeLogger().lines` captures a `warn` call — tests.
- [ ] `pnpm --filter api build` output contains no `shared/test` (add `exclude` to `tsconfig.build.json`/`nest-cli.json` if it does — record in design Risks).
- [ ] Quick gate passes; new tests ≥ 8.
**Tests**: unit · **Gate**: quick
**Commit**: `test(api): shared unit doubles — mockOf, clocks, request-context fake`

### T2: `shared/test/int` — move DB harness, add `resetDb` + `withTestDb` + Redis helpers, rewire imports
**What**: Move `test/setup/test-db.ts` + `test-logger.ts` into `src/shared/test/int/`, add `resetDb(schemas)` (validation + single TRUNCATE), `withTestDb`, `testRedisUrl`/`flushRedis`; rewire all 36 int-specs and `e2e-after-env.ts` imports; delete `truncateIdentity/Attachment/Tag` (entries pass schema names).
**Where**: `apps/api/src/shared/test/int/{db,with-test-db,redis,logger,index}.ts`, `apps/api/src/shared/test/int/reset-db.int-spec.ts`, 36 `*.int-spec.ts` (imports only), `apps/api/test/setup/e2e-after-env.ts`
**Depends on**: T1
**Reuses**: `test/setup/test-db.ts`, `container-uris.ts`
**Requirement**: HRN-02, UNT-02 (first half), ENT-05 (partial)
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `reset-db.int-spec.ts`: unknown schema rejects with a message listing known schemas; truncating `["_kernel", "<entry schema>"]` empties both; `withTestDb` holder populated in `beforeAll` and pool closed in `afterAll` (assert `pool.ended`).
- [ ] `rg "test/setup/test-db|test/setup/test-logger" apps/api catalog` → 0.
- [ ] `e2e-after-env.ts` calls `flushRedis()` (no inline flushall).
- [ ] Full gate passes; int `it` count unchanged vs baseline (+ new).
**Tests**: integration · **Gate**: full
**Commit**: `test(api): shared int harness — resetDb, withTestDb, redis helpers`

### T3: `shared/test/e2e` — `createE2eApp` (options), `withE2ePool`, `drainOutbox`, `waitFor`, `expectProblem`, cookie helpers, constants; migrate kernel e2e + current `createE2eApp` consumers
**What**: Move/extend `app-factory.ts` + `cookies.ts`; add the helpers; migrate kernel e2e files (`health`, `security-bootstrap`, `openapi-contract`, kernel access-guard e2e if present) and the 7 files already importing `createE2eApp`; add `harness.e2e-spec.ts`.
**Where**: `apps/api/src/shared/test/e2e/{app,http,outbox,wait-for,problem,constants,index}.ts`, `apps/api/src/shared/test/e2e/problem.spec.ts`, `apps/api/test/harness.e2e-spec.ts`, kernel e2e files
**Depends on**: T2
**Reuses**: `test/setup/app-factory.ts:14,26`, `cookies.ts`, `e2e-env.ts` (`WEB_ORIGIN`)
**Requirement**: HRN-01, HRN-03, HRN-04, HRN-05
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `harness.e2e-spec.ts`: `middleware: "none"` boots without request-context middleware (404 body has no `correlationId` echo) and `"full"` echoes it; `rateLimiter: "real"` returns 429 after the configured burst on a kernel route (or skips with reason if no kernel rate-limited route exists — record); `overrides` replaces a kernel token; `drainOutbox` resolves when `until` returns a value and rejects with `timeout após` when it never does; `withE2ePool` closes the pool in `afterAll`.
- [ ] `problem.spec.ts`: `expectProblem` passes on a conforming response, fails naming the mismatching field; `cookieValue`/`cookieHeader` handle string and array `set-cookie`.
- [ ] `rg -l "Test.createTestingModule" apps/api catalog` → exactly `apps/api/src/shared/test/e2e/app.ts`, for the files migrated in this task (remaining inline files are migrated in P3; record count).
- [ ] Full gate passes; e2e `it` count ≥ baseline for migrated files.
**Tests**: e2e · **Gate**: full
**Commit**: `test(api): shared e2e harness — createE2eApp options, drainOutbox, expectProblem`

### T4: Runner plumbing shrink + coverage denominator + env sharing
**What**: `apps/api/test/setup/` keeps only plumbing; `unit-env.ts` imports a shared env block from `e2e-env.ts`; `collectCoverageFrom` excludes `src/shared/test/**` and `src/modules/*/testing/**`; vitest excludes unchanged; jest `roots` confirmed.
**Where**: `apps/api/test/setup/*.ts`, `apps/api/package.json` (jest), `apps/api/test/jest-*.json`, `apps/web/vitest.config.ts`
**Depends on**: T3
**Reuses**: existing configs
**Requirement**: ENT-05, COV-04 (ENT-04 second half)
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `ls apps/api/test/setup` = {global-setup, global-teardown, e2e-env, int-env, unit-env, e2e-after-env, container-uris, docker-runtime, scalar-stub, global.d.ts}; `seed-user.ts`/`fake-mailer.ts` still present only if P2 has not yet moved them (they are deleted in T5/T6).
- [ ] `pnpm --filter api test:cov` summary lists no file under `shared/test/`.
- [ ] Build gate passes.
**Tests**: none · **Gate**: build
**Commit**: `test(api): test/setup reduced to runner plumbing; coverage excludes harness`

### T5: Identity entry `testing/` barrel
**What**: `seedUser` (move + master demotion), `loginAs`, `tokenFromMail`, `makeUser`, `aUser`, `makeIdentityConfig` (move), `emails`, `seedEmail`; list in `module.json.files`; delete `apps/api/test/setup/seed-user.ts`.
**Where**: `catalog/identity/single-tenant/api/testing/{seed-user,login,mail,fixtures,config,index}.ts`, `catalog/identity/single-tenant/api/testing/fixtures.spec.ts`, `catalog/identity/single-tenant/module.json`
**Depends on**: T4
**Reuses**: `test/setup/seed-user.ts`, `access-link-activation.e2e-spec.ts:138-141` (demotion), `create-user-flow.e2e-spec.ts:31-48` (`linkFromHtml`), `identity.config.fixture.ts`
**Requirement**: ENT-01, ENT-04, UNT-03 (fixture side)
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `fixtures.spec.ts`: `makeUser()` yields a valid `User` with overrides applied; `seedUser({accessProfile:"master"})` twice leaves exactly one master row (int-spec in same folder); `tokenFromMail` rejects with a named error when no link in HTML.
- [ ] `module.json.files` includes `api/testing/**`; `rg "test/setup/seed-user|identity.config.fixture" apps/api catalog` → 0.
- [ ] Full gate passes.
**Tests**: unit + integration · **Gate**: full
**Commit**: `test(identity): entry testing barrel — seedUser, loginAs, tokenFromMail, makeUser`

### T6: Notification entry `testing/` barrel
**What**: Move `FakeMailer`; add `findSent`, `makeNotification`, `deliveryDispatchers(app)`; `module.json.files`; delete `apps/api/test/setup/fake-mailer.ts`.
**Where**: `catalog/notification/api/testing/{fake-mailer,fixtures,dispatchers,index}.ts` (+ `fake-mailer.spec.ts`), `catalog/notification/module.json`
**Depends on**: T5
**Reuses**: `test/setup/fake-mailer.ts`, `notifications-email.e2e-spec.ts:88-110` (`findSent`)
**Requirement**: ENT-02, ENT-04
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `fake-mailer.spec.ts`: `send` records `{to, subject, html, idempotencyKey}`; `findSent` filters by `to` + optional subject regex.
- [ ] `rg "test/setup/fake-mailer" apps/api catalog` → 0; `module.json.files` updated.
- [ ] Quick gate passes.
**Tests**: unit · **Gate**: quick
**Commit**: `test(notification): entry testing barrel — FakeMailer, findSent`

### T7: Attachment entry `testing/` barrel
**What**: `inMemoryStorage()` (full `ObjectStoragePort`), `PNG_1PX`, `seedAttachment`, `makeAttachment`; `module.json.files`.
**Where**: `catalog/attachment/api/testing/{storage,fixtures,seed,index}.ts` (+ `storage.spec.ts`), `catalog/attachment/module.json`
**Depends on**: T6
**Reuses**: `attachment-download.e2e-spec.ts:34-101`
**Requirement**: ENT-02, ENT-04
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `storage.spec.ts`: put → get/getStream/head/delete round-trip; `getStream` on missing key rejects with the port's not-found error.
- [ ] `module.json.files` updated; quick gate passes.
**Tests**: unit · **Gate**: quick
**Commit**: `test(attachment): entry testing barrel — inMemoryStorage, PNG_1PX, seedAttachment`

### T8: Tag + audit entry `testing/` barrels
**What**: `makeTag`, `seedTag`; `makeAuditEntry`, `seedAuditEntry`; `module.json.files` both.
**Where**: `catalog/tag/api/testing/{fixtures,seed,index}.ts`, `catalog/audit/api/testing/{fixtures,seed,index}.ts` (+ one `fixtures.spec.ts` each), both `module.json`
**Depends on**: T7
**Reuses**: `tags.e2e-spec.ts:createTag`, `audit-product-extension.e2e-spec.ts:seedThingAndAuditEntry`
**Requirement**: ENT-04, UNT-03
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] Each `fixtures.spec.ts` asserts a built aggregate's fields incl. an override; `module.json.files` updated; quick gate passes.
**Tests**: unit · **Gate**: quick
**Commit**: `test(tag,audit): entry testing barrels`

### T9: Catalog rule — `testing/` import must be backed by `dependsOn`
**What**: Extend v1's catalog lint/boundaries test: any import from `catalog/<y>/api/testing` inside `catalog/<x>/api/**` requires `y ∈ x.module.json.dependsOn`.
**Where**: v1 catalog-lint location (`scripts/platform/catalog-lint.mjs` or `apps/api/src/modules/module-boundaries.spec.ts` RULE D — confirm at task start) + its test
**Depends on**: T8
**Reuses**: v1 T13 catalog-lint
**Requirement**: ENT-03
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] Test fixture: entry without `dependsOn` importing another's `testing/` → lint fails naming both; with `dependsOn` → passes.
- [ ] Build gate passes.
**Tests**: unit (`node --test` or jest, per host) · **Gate**: build
**Commit**: `test(catalog): testing/ imports require dependsOn`

### T10: Migrate identity e2e — auth group (10 files)
**What**: `auth-login`, `auth-logout`, `auth-session`, `auth-csrf-none`, `auth-anti-enum`, `auth-rate-limit`, `auth-reset-token-logging`, `auth-outbox-email`, `idempotency`, `docs-login` → `createE2eApp` + barrels; zero local helpers; strengthen `auth-rate-limit:52,55`, `docs-login:89,100`, `auth-outbox-email:132` (→ `drainOutbox` + assert exactly one mail), `auth-reset-token-logging` → `fakeLogger` lines; `auth-csrf-none` raw-SQL `seedUser` → barrel.
**Where**: `catalog/identity/single-tenant/api/**/auth-*.e2e-spec.ts` (paths as laid by v1)
**Depends on**: T9
**Reuses**: T3, T5, T6
**Requirement**: HRN-06, STR-01, STR-04
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] Per-file `it` count ≥ baseline; `rg "createTestingModule|const allowAll|function login|extractCookieValue|linkFromHtml|waitFor\(" <these files>` → 0.
- [ ] `expectProblem` used for every RFC 7807 assert in these files; `auth-rate-limit` asserts `retry-after` is a positive integer and `type` suffix.
- [ ] `pnpm --filter api test:e2e -- --randomize` green on these files; full gate passes.
**Tests**: e2e · **Gate**: full
**Commit**: `test(identity): auth e2e on shared harness`

### T11: Migrate identity e2e — flows group (8 files) + chain splits + state asserts
**What**: `authz`, `create-user-flow`, `access-link-activation`, `verify-email`, `user-trash`, `devices`, `access-catalog`, `access-history` → harness/barrels; split ordered chains into independent `it`s with `beforeEach` seeds (remove the `toBeTruthy` "seed master" pseudo-test); `user-trash` + `authz` mutations assert persisted rows; `authz:394-401` asserts 200 + body; `tags/audit/access-catalog` 403 bodies via `expectProblem` (access-catalog here); `create-user-flow` split into activation vs listing files if >250 LOC.
**Where**: same entry paths
**Depends on**: T10
**Reuses**: T3, T5, T6, T7
**Requirement**: HRN-06, STR-02, STR-03, STR-04
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `--randomize` green on these files three consecutive runs; `it` count ≥ baseline − 1 (the pseudo-test) summed across split files, titles preserved.
- [ ] `user-trash`: ≥1 SQL assert per mutation (trash → `deleted_at` set; restore → null; purge → row absent); `authz` PUT/POST: row assert or second-endpoint read.
- [ ] No `createTestPool()` inside `it`; `UPDATE … access_profile` absent; full gate passes.
**Tests**: e2e · **Gate**: full
**Commit**: `test(identity): flow e2e independent of order, persisted-state asserts`

### T12: Migrate notification e2e (5 files)
**What**: `notifications-email`, `-feed`, `-inapp`, `-sse`, `-product-extension` → harness (`drainOutbox` with `deliveryDispatchers(app)`), barrels; drain loops removed; raw `truncate table notification.*` → `resetDb(pool, ["notification", …])`.
**Where**: `catalog/notification/api/**/*.e2e-spec.ts`
**Depends on**: T11
**Reuses**: T3, T5, T6
**Requirement**: HRN-03, HRN-06, STR-04
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `rg "pollUntil|findSent\s*=|truncate table notification|setTimeout" <files>` → 0 (local defs); `it` ≥ baseline; `--randomize` green; full gate.
**Tests**: e2e · **Gate**: full
**Commit**: `test(notification): e2e on shared harness, drainOutbox`

### T13: Migrate attachment, tag, audit e2e (6 files)
**What**: `attachment-download`, `attachment-delete`, `tags`, `audit`, `audit-product-extension`, plus any `access-link` attachment usage → harness + barrels (`inMemoryStorage`, `PNG_1PX`, `seedAttachment`, `loginAs`); `tags:135-141`, `audit:128-144` 403 via `expectProblem`; `tags` trash asserts row; keep the pool-saturation regression with its raw `Pool` (title states intent).
**Where**: `catalog/{attachment,tag,audit}/api/**/*.e2e-spec.ts`
**Depends on**: T12
**Reuses**: T3, T5, T7, T8
**Requirement**: HRN-06, STR-01, STR-03, STR-04
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `rg -l "Test.createTestingModule" apps/api catalog` → 1 (the factory); `rg "makeInMemoryStorage|PNG_1PX\s*=" catalog apps/api/test` → only barrels; `it` ≥ baseline; `--randomize` green; full gate.
**Tests**: e2e · **Gate**: full
**Commit**: `test(attachment,tag,audit): e2e on shared harness`

### T14: Kernel unit/int specs → shared doubles + strengthen kernel weak asserts
**What**: All `apps/api/src/shared/**` + `src/db`, `src/openapi`, `src/config` specs: `makeDeps` typed via `mockOf`, `fixedClock`, `fakeRequestContext`; fix `bucket-sql.spec.ts` (assert SQL text), `pool-metrics.spec.ts:185,211,215`, `application-pool.int-spec.ts:92,112,211`, `load-dotenv.spec.ts:31`, `audit-trigger.int-spec.ts:86,112` (if kernel-side) to concrete values; `not.toThrow()` bare → value asserts.
**Where**: `apps/api/src/shared/**/*.spec.ts|*.int-spec.ts`, `apps/api/src/{db,openapi,config}/**/*.spec.ts`
**Depends on**: T13
**Reuses**: T1, T2
**Requirement**: UNT-01, STR-01, STR-04
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `rg "Record<string, any>|as never|as unknown as" apps/api/src --glob '*.spec.ts' --glob '*.int-spec.ts'` → 0 outside `shared/test/**`; `rg "toBeDefined\(\)|not\.toThrow\(\)" apps/api/src` → 0 outside `shared/test/**`.
- [ ] `it` ≥ baseline; full gate.
**Tests**: unit + integration · **Gate**: full
**Commit**: `test(api): kernel specs on shared doubles; concrete asserts`

### T15: Identity entry unit/int specs → barrel + typed deps + state asserts + prettier
**What**: identity use-case/domain/infra specs: `makeUser` local defs → barrel (19), `makeDeps` typed, `fakeRequestContext`/`fixedClock`, `makeIdentityConfig` inline (4) → fixture; `request-email-change`, `change-password`, `upload-avatar`, `set-password` assert saved-entity fields; `login.use-case.spec.ts:103` `Reflect.set` private poke → behaviour via public path or a stubbed hasher; prettier on the 7 single-quote domain specs; int-specs use `withTestDb`.
**Where**: `catalog/identity/single-tenant/api/**/*.spec.ts|*.int-spec.ts`
**Depends on**: T14
**Reuses**: T1, T2, T5
**Requirement**: UNT-01, UNT-03, UNT-04, DOC-02 (prettier part), STR-04
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `rg "User.fromProps\(\{|parseIdentityConfig\(\{" <entry specs>` → 0 outside `testing/`; the four specs each have ≥1 `expect(saved).toMatchObject({...changed fields})`-style assert; `pnpm format:check` passes on the entry; `it` ≥ baseline; full gate.
**Tests**: unit + integration · **Gate**: full
**Commit**: `test(identity): specs on entry barrel, typed deps, saved-state asserts`

### T16: Notification, attachment, tag, audit unit/int specs → barrels + typed deps; Redis int-specs on global container
**What**: Same migration for the other four entries; `realtime.int-spec.ts` and `redis-rate-limiter.int-spec.ts` (identity, but grouped here as the Redis pair) drop `GenericContainer` for `testRedisUrl()` + `flushRedis()` in `beforeEach`; `notification-template-registry.spec.ts:29,36` concrete asserts; int-specs use `withTestDb`.
**Where**: `catalog/{notification,attachment,tag,audit}/api/**/*.spec.ts|*.int-spec.ts`, the two Redis int-specs
**Depends on**: T15
**Reuses**: T1, T2, T6, T7, T8
**Requirement**: UNT-01, UNT-02, UNT-03, STR-01, STR-04
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `rg "GenericContainer" apps/api catalog --glob '*.int-spec.ts'` → 0; `rg "Record<string, any>" catalog --glob '*.spec.ts'` → 0; `it` ≥ baseline; full gate (int wall-clock recorded before/after for the Redis pair).
**Tests**: unit + integration · **Gate**: full
**Commit**: `test(entries): specs on barrels; redis int-specs on shared container`

### T17: GAP-01 — tag use-case specs ×5 + delivery repository int-spec
**What**: `create-tag`, `get-tag`, `restore-tags`, `stash-tag`, `update-tag` specs (happy + each `throw`); `drizzle-delivery.repository.int-spec.ts` (insert/find-pending/mark-sent/conflict).
**Where**: `catalog/tag/api/application/use-cases/*/…spec.ts`, `catalog/notification/api/infrastructure/repositories/drizzle-delivery.repository.int-spec.ts`
**Depends on**: T16
**Reuses**: T8 barrel, T2 `withTestDb`, T6 barrel
**Requirement**: GAP-01
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] Every `throw` in the five use-cases has a test asserting error class + message fragment; delivery repo: 4 named paths; full gate.
**Tests**: unit + integration · **Gate**: full
**Commit**: `test(tag,notification): fill use-case specs and delivery repo int-spec`

### T18: GAP-02 — cross-entry facade shape specs
**What**: `*.spec.ts` per facade (`user-directory`, `permission-catalog`, `tag-directory`, `audit-registry`, `attachment`) snapshotting the shape each consumer reads (keys + types via a typed sample; `toMatchSnapshot` vs explicit shape object per `back-arch.md` § Testes — pick one, apply to all five, document the choice in `testing.md` at T27, never in a code comment).
**Where**: `catalog/<entry>/api/api/facades/*.spec.ts`
**Depends on**: T17
**Reuses**: entry barrels
**Requirement**: GAP-02
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] 5 facade specs; each fails if a consumed field is renamed (verify by a scratch rename); quick gate.
**Tests**: unit · **Gate**: quick
**Commit**: `test(catalog): facade shape specs`

### T19: Web harness additions
**What**: `createQueryWrapper`, `mockRouter` (`vi.hoisted` single shape), `resetAuthState`, `useMswServer`; delete `fixed-clock.ts`; one smoke test per helper; `render.test.tsx` duplicate jest-dom import removed.
**Where**: `apps/web/src/shared/test/{create-query-wrapper,mock-router,reset-auth-state,msw-server}.ts(x)` + `*.test.tsx`
**Depends on**: T18
**Reuses**: `render-with-providers.tsx`, `msw-server.ts`, `transport.test.ts:15-35`
**Requirement**: WEB-01, WEB-03 (hygiene)
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `mockRouter` smoke: `useNavigate()` returns the provided mock and `Outlet` renders `outlet`; `useMswServer` smoke: handler answers a fetch; `resetAuthState` clears store + localStorage; `fixed-clock.ts` gone; quick gate.
**Tests**: unit · **Gate**: quick
**Commit**: `test(web): shared harness — mockRouter, query wrapper, auth reset, msw lifecycle`

### T20: Migrate web tests to the harness + strengthen
**What**: 7 ad-hoc router mocks → `mockRouter`; 5 inline `QueryClient` → `makeTestQueryClient`/`createQueryWrapper`; 5 reset blocks → `resetAuthState`; `router.test:92,103,110,118`, `shell.integration:31`, `transport:74` assert redirect `to`/thrown problem body; `vi.hoisted` in the 2 closure-hoisting files; session fixtures via identity entry `web/testing` if those tests remain in the template.
**Where**: `apps/web/src/**/*.test.ts(x)` (+ identity entry `web/testing/make-current-user.ts` if needed)
**Depends on**: T19
**Reuses**: T19
**Requirement**: WEB-02, WEB-03, STR-01, STR-04
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `rg 'vi.mock\("@tanstack/react-router"' apps/web/src` → only inside `mock-router`; `rg "new QueryClient\(" apps/web/src --glob '*.test.*'` → 0; `rg "rejects.toBeDefined" apps/web/src` → 0; `it` ≥ baseline; quick gate.
**Tests**: unit · **Gate**: quick
**Commit**: `test(web): tests on shared harness; redirect targets asserted`

### T21: Test lint plugins in `packages/eslint-config`
**What**: Add `eslint-plugin-jest` (api test override), `@vitest/eslint-plugin` + `eslint-plugin-testing-library` + `eslint-plugin-jest-dom` (web override) with the rule set from design § 6; fix every violation they surface (no rule disabling); versions resolved against the repo's ESLint major.
**Where**: `packages/eslint-config/{base.js,react.js,package.json}`, violating test files
**Depends on**: T20
**Reuses**: `base.js:125-139` override block
**Requirement**: LNT-01
**Tools**: MCP `context7` (plugin compat) · Skill NONE
**Done when**:
- [ ] `pnpm lint` green; a scratch `it.only` in api and web each fails lint (`no-focused-tests`), a scratch assertion-less `it` fails (`expect-expect`); fixture removed before commit.
**Tests**: none (lint config) · **Gate**: build
**Commit**: `chore(lint): jest/vitest/testing-library rules for tests`

### T22: Local rule `no-existence-only-assert`
**What**: Rule + `node --test` suite + enabled as error for all test globs; fix remaining violations (should be ~0 after T14–T20).
**Where**: `packages/eslint-config/rules/no-existence-only-assert.{js,test.js}`, `base.js`
**Depends on**: T21
**Reuses**: `rules/sr-only-requires-positioned-ancestor.{js,test.js}`
**Requirement**: LNT-02
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] Tests: reports `toBeDefined`-only, `toBeTruthy`-only, bare `not.toThrow()`, `rejects.toBeDefined()`; does not report when any chain asserts a value, `not.toThrow(/x/)`, `expect.assertions(n)`; `pnpm lint` green.
**Tests**: unit (`node --test`) · **Gate**: build
**Commit**: `chore(lint): no-existence-only-assert rule`

### T23: turbo pipelines, `api-client` explicit test, CI workflow
**What**: `turbo.json` declares `test:cov`, `test:cov:all`, `test:watch` (outputs/caching per design); `packages/api-client` `test` script no-op with explicit message; `.github/workflows/ci.yml` (or extend v1's) with jobs `check`, `unit`, `int`, `e2e`, `contract`, `coverage-all`; lefthook unchanged (Docker-free).
**Where**: `turbo.json`, `packages/api-client/package.json`, `.github/workflows/ci.yml`
**Depends on**: T22
**Reuses**: `apps/api/scripts/coverage-all.sh`, `.nvmrc`, `packageManager`
**Requirement**: CI-01, CI-02, DOC-02 (api-client part)
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] Workflow green on the feature branch (all six jobs); `pnpm turbo test:cov --filter=api --filter=web` runs from root; `turbo test` shows `api-client` as an explicit no-op.
**Tests**: none · **Gate**: build (+ CI run)
**Commit**: `ci: workflow check/unit/int/e2e/contract/coverage-all; turbo test pipelines`

### T24: Fill api kernel unit coverage to ≥95% (absorbed coverage-95 T3/T9)
**What**: Measure on the post-T22 denominator; add behavioural unit tests under `apps/api/src/**` until S/B/F/L ≥ 95; delete dead code instead of ignoring (COV-10); error paths assert class + message (COV-09).
**Where**: `apps/api/src/**/*.spec.ts`
**Depends on**: T23
**Reuses**: T1 doubles
**Requirement**: COV-05..10, COV-11
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `pnpm --filter api test:cov` ≥ 95/95/95/95; `rg "istanbul ignore|v8 ignore" apps/api/src` adds nothing vs baseline; quick gate.
**Tests**: unit · **Gate**: coverage
**Commit**: `test(api): kernel unit coverage ≥95%`

### T25: Fill web coverage to ≥95% (absorbed coverage-95 T10 remnant)
**What**: Same for `apps/web/src/**` on the post-T22 web shell.
**Where**: `apps/web/src/**/*.test.ts(x)`
**Depends on**: T24
**Reuses**: T19
**Requirement**: COV-05..10, COV-11
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `pnpm --filter web test:cov` ≥ 95/95/95/95; no new ignore pragmas; quick gate.
**Tests**: unit · **Gate**: coverage
**Commit**: `test(web): coverage ≥95%`

### T26: Ratchet thresholds to 95 + lefthook api `test` → `test:cov` (absorbed coverage-95 T11)
**What**: jest `coverageThreshold` 95×4, vitest thresholds 95×4, lefthook pre-push api command `test:cov`; `test:cov:all` floors untouched.
**Where**: `apps/api/package.json` (jest), `apps/web/vitest.config.ts`, `lefthook.yml`
**Depends on**: T25
**Reuses**: —
**Requirement**: COV-01, COV-02, COV-03, COV-11
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] A scratch commit deleting one test drops a metric <95 and `lefthook run pre-push` fails; restored → passes; build gate.
**Tests**: none · **Gate**: build + coverage
**Commit**: `chore(coverage): 95% thresholds on api unit + web; pre-push runs test:cov`

### T27: `docs/test/testing.md` rewrite + closure of absorbed spec
**What**: Rewrite `testing.md` per DOC-01 (harness API, entry `testing/` convention, parity suites — absorbing v1 T26 —, lint rules, CI, pre-push, thresholds, facade-shape convention chosen at T18); mark v1 T26 absorbed in v1 `tasks.md`; STATE handoff.
**Where**: `docs/test/testing.md`, `.specs/**`
**Depends on**: T26
**Reuses**: design § Components
**Requirement**: DOC-01, DOC-02
**Tools**: MCP NONE · Skill NONE
**Done when**:
- [ ] `rg "Test.createTestingModule|test/setup/seed-user|truncateIdentity" docs/test/testing.md` → 0; every exported harness symbol from design § 1–5 appears in the doc; `pnpm format:check` passes; `.specs` moves done.
**Tests**: none · **Gate**: build
**Commit**: `docs(test): testing handbook for the shared harness; close coverage-95 spec`

---

## Phase Execution Map

```
Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7

P0:  T0
P1:  T1 → T2 → T3 → T4
P2:  T5 → T6 → T7 → T8 → T9
P3:  T10 → T11 → T12 → T13
P4:  T14 → T15 → T16 → T17 → T18
P5:  T19 → T20
P6:  T21 → T22 → T23
P7:  T24 → T25 → T26 → T27
```

Batch packing (~7 tasks, whole phases): B1 = P0+P1 (5) · B2 = P2 (5) · B3 = P3 (4, heaviest — e2e) · B4 = P4+P5 (7) · B5 = P6+P7 (7). Five workers, sequential. Tier per batch: B1/B2 top (harness API design + RULE C), B3/B4 mid, B5 mid (T23 CI may need top on failure).

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T0 | 1 doc | ✅ |
| T1 | 1 module (5 small files, one concept: doubles) | ✅ cohesive |
| T2 | 1 module + mechanical import rewire (36 files, imports only) | ⚠️ cohesive — move + rewire must land together to stay green |
| T3 | 1 module + kernel e2e + 7 consumers | ⚠️ cohesive — factory move breaks consumers otherwise |
| T4 | config | ✅ |
| T5–T8 | 1 barrel each | ✅ |
| T9 | 1 rule | ✅ |
| T10–T13 | one e2e file group each (10/8/5/6 files) | ⚠️ cohesive tree — per-file tasks would be 29 |
| T14–T16 | one spec tree each | ⚠️ same |
| T17, T18 | named gap fills | ✅ |
| T19, T20 | harness / adoption | ✅ |
| T21, T22, T23 | config / rule / CI | ✅ |
| T24–T26 | coverage fill / fill / ratchet | ✅ (ratchet last) |
| T27 | docs + closure | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram | Status |
| --- | --- | --- | --- |
| T0 | none | P0 root | ✅ |
| T1 | T0 | P0→P1 | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T2 | T2→T3 | ✅ |
| T4 | T3 | T3→T4 | ✅ |
| T5 | T4 | P1→P2 | ✅ |
| T6–T9 | previous | chain | ✅ |
| T10 | T9 | P2→P3 | ✅ |
| T11–T13 | previous | chain | ✅ |
| T14 | T13 | P3→P4 | ✅ |
| T15–T18 | previous | chain | ✅ |
| T19 | T18 | P4→P5 | ✅ |
| T20 | T19 | chain | ✅ |
| T21 | T20 | P5→P6 | ✅ |
| T22, T23 | previous | chain | ✅ |
| T24 | T23 | P6→P7 | ✅ |
| T25–T27 | previous | chain | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T0 | doc | none | none | ✅ |
| T1 | harness logic | unit | unit | ✅ |
| T2 | harness DB | integration | integration | ✅ |
| T3 | harness app | e2e | e2e | ✅ |
| T4 | config | none | none | ✅ |
| T5 | entry barrel (logic + seed) | unit + integration | unit + integration | ✅ |
| T6–T8 | entry barrel | unit | unit | ✅ |
| T9 | lint/boundaries rule | unit | unit | ✅ |
| T10–T13 | migrated e2e | e2e | e2e | ✅ |
| T14–T16 | migrated unit/int | unit + integration | unit + integration | ✅ |
| T17 | use-case + repo | unit + integration | unit + integration | ✅ |
| T18 | facade spec | unit | unit | ✅ |
| T19 | web harness | unit | unit | ✅ |
| T20 | migrated web | unit | unit | ✅ |
| T21 | lint config | none | none | ✅ |
| T22 | lint rule | unit (`node --test`) | unit | ✅ |
| T23 | CI/config | none | none | ✅ |
| T24, T25 | fills | unit | unit | ✅ |
| T26 | config | none | none | ✅ |
| T27 | docs | none | none | ✅ |

## Requirement mapping

| Requirement | Tasks |
| --- | --- |
| HRN-01 | T3 |
| HRN-02 | T2 |
| HRN-03 | T3, T12 |
| HRN-04 | T3 |
| HRN-05 | T3, T11 |
| HRN-06 | T10, T11, T12, T13 |
| ENT-01 | T5 |
| ENT-02 | T6, T7 |
| ENT-03 | T9 |
| ENT-04 | T4, T5, T6, T7, T8 |
| ENT-05 | T2, T4 |
| UNT-01 | T1, T14, T15, T16 |
| UNT-02 | T2, T16 |
| UNT-03 | T5, T8, T15, T16 |
| UNT-04 | T15 |
| LNT-01 | T21 |
| LNT-02 | T22 |
| STR-01 | T10, T13, T14, T16, T20 |
| STR-02 | T11 |
| STR-03 | T11, T13 |
| STR-04 | T0, T10–T16, T20 |
| WEB-01 | T19 |
| WEB-02 | T20 |
| WEB-03 | T19, T20 |
| CI-01 | T23 |
| CI-02 | T23, T26 |
| COV-01..10 | T4 (04), T24, T25, T26 |
| COV-11 | T24, T25, T26 |
| GAP-01 | T17 |
| GAP-02 | T18 |
| DOC-01 | T27 |
| DOC-02 | T15, T23, T27 |

**Coverage:** 32 requirements, 32 mapped, 0 unmapped.

## Execution Log

(empty — Execute not started; blocked on v1 T22.)
