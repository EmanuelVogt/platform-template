# Vitest Migration Specification

## Problem Statement

The template runs two test runners: Jest (CommonJS, `@swc/jest`) on `apps/api` and Vitest on `apps/web`. The Jest
pipeline forces workarounds the handbook has to explain — an ESM stub for `@scalar/nestjs-api-reference`, no `@/`
alias in the back, `workerIdleMemoryLimit` against e2e OOM, and a 75-line `coverage-all.sh` + nyc merge because Jest
cannot combine tiers — and leaves test files without lint rules. The `ailapidus` repo proves one Vitest 4 setup
(root `projects`, one shared container, native combined coverage, test lint) runs Nest 11 + decorators through
`unplugin-swc`. Migrate the whole template to that model: kernel, catalog entries, root gates, lint, git hooks, CI,
docs — and ship the codemod children need to follow. Evidence: `spike.md`.

## Goals

- [ ] One runner: every api tier (unit / int / e2e / parity), web and installed catalog entries run on Vitest 4.
- [ ] Root `projects` configs replace per-app runs; `pnpm test:coverage` measures unit+int+e2e+web in one process with per-glob thresholds; `coverage-all.sh`, nyc and every Jest dependency are gone.
- [ ] Kernel test infrastructure survives unchanged in behaviour: per-worker DB in the int tier, Redis container, mail/R2 locks in e2e, Docker-runtime detection, env handshake that tolerates two concurrent runs.
- [ ] Test lint (`@vitest/eslint-plugin`, `eslint-plugin-testing-library`) is an error-level gate on api and web.
- [ ] Children can follow with one command (codemod) plus a changelog note and one advisory per entry.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Renaming `*.spec.ts` / `*.int-spec.ts` / `*.e2e-spec.ts` / `*.parity.spec.ts` to `*.test.ts` | Only the `include` globs change; renaming 419 files would churn `module add`, docs, skills and every child for no runtime gain |
| Harness layering (`shared/test/{unit,int,e2e}`, entry `testing/` barrels, guard spec, web a11y helper) | Owned by the in-flight `test-suite-refactor` (AD-023); this feature re-baselines that plan at closeout, it does not execute it |
| Raising coverage floors toward AD-012's 95 % | Stays with `test-suite-refactor` T39; this feature only re-calibrates the floors to the new provider's measurement |
| Rewriting web tests, adopting MSW/RTL changes | Web changes are config + lint only |
| `scripts/platform/__tests__` (Node test runner) | Unrelated to the api/web runner; `test:scripts` stays |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| A1 suffixes | keep `.spec.ts` / `.int-spec.ts` / `.e2e-spec.ts` / `.parity.spec.ts`; Vitest `include` globs select them | zero churn in catalog, `module add`, docs, skills | n |
| A2 globals | `globals: false` in every project; the codemod adds `import { … } from "vitest"` per file | ailapidus convention and the template's own web rule (`testing.md` "sem globals") | n |
| A3 pre-push | `migrations` → `typecheck` → `catalog-typecheck` → `test:coverage` (piped); needs Docker, like ailapidus | one honest gate measuring all tiers; flips `test-suite-refactor` GA-6 ("pre-push stays Docker-free") — re-baselined at closeout | n |
| A4 thresholds | web 64/56/61/64 unchanged; `apps/api/src/**` floors re-calibrated once to the Vitest 4 measurement (floor = measured − 1.5 pt per metric), starting from 85/54.5/81.5/87.5; numbers recorded in `design.md` § Spike results and the changelog | Vitest 4's AST-aware v8 remapping changes branch accounting; the ratchet rule ("never lower to pass") still holds after calibration | n |
| A5 parallelism | int: `maxWorkers 4`, DB `test_w${VITEST_POOL_ID}`; e2e: `fileParallelism: false`, default `isolate: true` (fresh fork per file) replaces `workerIdleMemoryLimit`; unit api: `maxWorkers 4` | same shape as today; Vitest recycles the fork per file so the Jest OOM note becomes moot | n |
| A6 containers | the db `globalSetup` always starts Postgres **and** Redis and always clones `maxWorkers` worker DBs (no e2e-mode detection) | one setup for both tiers, shared when `test:coverage`/`test:db` run them together | n |
| A7 catalog entries | codemod applied in the template; each entry gets a CHANGELOG major bump + advisory `kind: breaking` pointing at the codemod (AD-016, AD-019) | child-installed copies of the entries carry Jest specs and must migrate the same way | n |
| A8 `__dirname` | kept (Vitest injects `__dirname`/`__filename` for transformed modules; ailapidus api uses it under Vitest) | the api still builds to CommonJS, so `import.meta.dirname` is not an option | n |
| A9 versions | vitest `^4.1.10`, `@vitest/coverage-v8` same, `unplugin-swc ^1.5.11`, `@vitest/eslint-plugin ^1.6`, `eslint-plugin-testing-library ^7.16`; web bumps from `^4.1.7` to the same line | the versions ailapidus runs | n |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: API tiers on Vitest ⭐ MVP

**User Story**: As a kernel maintainer, I want `apps/api` unit, integration and e2e tiers to run on Vitest with the
current containers, worker DBs and env locks, so that the Jest-only workarounds disappear without losing any proof.

**Why P1**: Every other story depends on the api running on the new runner.

**Acceptance Criteria**:

1. WHEN `pnpm vitest run --project api` runs THEN every `apps/api/src/**/*.spec.ts` (161 files) SHALL execute through `unplugin-swc` (decorator metadata on) and pass, with `setupFiles` loading `reflect-metadata` and the unit env.
2. WHEN `pnpm test:int` runs THEN `globalSetup` SHALL start one Postgres container, apply the real migrations, clone `test_w1..test_w<maxWorkers>` from the migrated DB, `provide` the URIs, and each worker SHALL point `DATABASE_URL` at `test_w${VITEST_POOL_ID}`.
3. WHEN `pnpm test:e2e` runs THEN e2e files SHALL run one at a time in a fresh forked process, against Postgres and Redis from the same `globalSetup`, with `MAIL_TRANSPORT=log`, `RESEND_API_KEY`/`MAIL_FROM` unset, R2 dummies set, and Redis flushed after every test.
4. WHEN the e2e app boots THEN `@scalar/nestjs-api-reference` SHALL load natively and `test/setup/scalar-stub.ts` SHALL not exist.
5. WHEN two `pnpm test:int` runs start concurrently in the same checkout THEN each SHALL talk only to its own container (URIs travel by `provide`/`inject`, never by a file on disk).
6. WHEN `pnpm --filter api typecheck` runs THEN spec files SHALL type-check with `vitest` imports and no `jest` entry in `tsconfig.json` `types`.

**Independent Test**: `pnpm test:db` green on a machine with Docker; `rg -c 'jest\.' apps/api` returns 0.

---

### P1: Root gates and coverage

**User Story**: As a template maintainer, I want root-level Vitest configs and scripts that mirror ailapidus, so that
`pnpm test` is the Docker-free inner loop and `pnpm test:coverage` is the single honest gate.

**Why P1**: The combined gate is what makes the migration worth it; pre-push and CI hang off it.

**Acceptance Criteria**:

1. WHEN `pnpm test` runs at the root THEN only the unit projects (`api`, `web`) SHALL run, no container SHALL start, and the command SHALL exit 0 without a Docker daemon.
2. WHEN `pnpm test:coverage` runs THEN projects `api`, `api-int`, `api-e2e`, `web` SHALL run in one Vitest process with v8 coverage merged and thresholds declared per glob (`apps/api/src/**`, `apps/web/src/**`), excluding tests, `.d.ts`, `apps/api/src/main.ts`, `apps/api/src/db/**` CLI scripts, `apps/web/src/main.tsx`, `**/shared/test/**` and `apps/api/test/**`.
3. WHEN `pnpm test:int`, `pnpm test:e2e` or `pnpm test:db` runs THEN it SHALL use `vitest.integration.mts` and select `api-int`, `api-e2e` or both.
4. WHEN the migration lands THEN `apps/api/scripts/coverage-all.sh`, `apps/api/test/tools/normalize-coverage.ts`, `test/jest-*.json`, the inline `jest` block and the packages `jest`, `@swc/jest`, `@types/jest`, `nyc` SHALL be gone, and `pnpm install --frozen-lockfile && pnpm check` SHALL pass.
5. WHEN `git push` runs THEN lefthook pre-push SHALL run `migrations` → `typecheck` → `catalog-typecheck` → `test:coverage` (piped) and a metric under its floor SHALL abort the push.
6. WHEN CI runs THEN `ci.yml` SHALL have `test-unit` (`pnpm test`, Docker-free) and `test-coverage` (`pnpm test:coverage`) after `quality`, and `catalog.yml` `gates` SHALL keep `pnpm test` + `pnpm test:scripts`.
7. WHEN `turbo.json` is read THEN no `test*` task SHALL remain (tests are driven by Vitest at the root, outside Turbo), and `apps/api/package.json` / `apps/web/package.json` SHALL carry no `test*` scripts.

**Independent Test**: `pnpm test` green without Docker; `pnpm test:coverage` green with Docker and a threshold table in the output.

---

### P1: Catalog entries and the child path

**User Story**: As a product team, I want the five catalog entries migrated and a codemod for my own specs, so that
`copier update` to this tag leaves my repo green.

**Why P1**: Entries ship specs that run in the child; without this the catalog is unusable after the update.

**Acceptance Criteria**:

1. WHEN `node scripts/platform/jest-to-vitest.mjs <path…>` runs on a tree of Jest specs THEN every `jest.fn|spyOn|mock|mocked|restoreAllMocks|resetAllMocks|clearAllMocks|useFakeTimers|useRealTimers|advanceTimersByTime|setSystemTime` SHALL become `vi.<same>`, `jest.requireActual(x)` SHALL become `await vi.importActual(x)` inside an `async` factory, `jest.setTimeout(n)` SHALL become `vi.setConfig({ testTimeout: n })`, `jest.Mock`/`jest.Mocked`/`jest.MockedFunction`/`jest.SpyInstance` SHALL become `Mock`/`Mocked`/`MockedFunction`/`MockInstance` imported from `vitest`, a `jest.mock` factory that references an outer binding SHALL have that binding wrapped in `vi.hoisted`, and each file SHALL gain one `import { … } from "vitest"` covering exactly the globals it uses; a second run SHALL change nothing.
2. WHEN the codemod has run over `apps/api` and `catalog` THEN `rg -c 'jest\.' apps/api catalog` SHALL return no matches.
3. WHEN `pnpm catalog:check <entry>` runs for `identity`, `attachment`, `audit`, `notification`, `tag` THEN the rendered child SHALL install the entry and its unit/int/e2e/parity specs SHALL pass on Vitest.
4. WHEN `module add` finishes installing an entry THEN its post-install test commands SHALL target the Vitest projects (`pnpm vitest run --project api <path>` / `--project web <path>`) and `scripts/template-smoke.mjs` SHALL invoke `module-boundaries.spec.ts` through Vitest.
5. WHEN an entry's specs change THEN its `module.json.version` SHALL bump major, its CHANGELOG SHALL gain the entry, and `docs/advisories/ADV-20260821-NN.md` (`kind: breaking`, `affects` the previous range, `fix` = the codemod command) SHALL exist — one per entry — so `pnpm catalog:lint` and the commit-msg hook accept the change.
6. WHEN `docs/dev/template-changelog.md` is read at the new tag THEN it SHALL carry a migration note telling a child to run the codemod on `apps/api/src/**` and `apps/web/src/**`, drop Jest deps and adopt the root configs.

**Independent Test**: `pnpm catalog:check` (5/5) green; codemod test suite green.

---

### P2: Test lint

**User Story**: As a reviewer, I want `.only`, `.skip`, assertion-free and duplicate tests to fail lint, so that the
rules the handbook states in prose are enforced by the gate.

**Why P2**: Not needed to run the suite, but part of the ailapidus pattern and cheap once the runner is one.

**Acceptance Criteria**:

1. WHEN `pnpm lint` runs THEN `@workspace/eslint-config/vitest` SHALL apply `@vitest/eslint-plugin` recommended rules plus, as errors, `no-focused-tests`, `no-disabled-tests`, `no-standalone-expect`, `expect-expect`, `no-conditional-expect`, `no-conditional-in-test`, `no-identical-title`, `prefer-to-be`, `prefer-to-have-length`, `valid-expect`, `consistent-test-it` (`it`), `require-top-level-describe` on `**/*.{spec,int-spec,e2e-spec,parity.spec,test}.{ts,tsx}` and on `vitest.setup.ts` / `**/shared/test/**` / `apps/api/test/**`, and the web config SHALL add `testing-library/flat/react` + `prefer-user-event`, `no-manual-cleanup`, `prefer-explicit-assert`, `prefer-presence-queries`.
2. WHEN a fixture file contains `it.only(` or an `it` without `expect` THEN `eslint` SHALL report an error.
3. WHEN `pnpm lint` runs on the migrated tree THEN it SHALL exit 0 (existing violations fixed, none suppressed).

**Independent Test**: `pnpm --filter @workspace/eslint-config test` green; `pnpm lint` green.

---

### P3: Docs and agent harness

**User Story**: As an agent or a new maintainer, I want the handbook, catalog READMEs and the harness cards to
describe the Vitest setup, so that nobody reaches for a jest command that no longer exists.

**Why P3**: Docs lag is tolerable for a day, wrong commands in agent cards are not for a week.

**Acceptance Criteria**:

1. WHEN `docs/test/testing.md` is read THEN it SHALL describe the Vitest setup in the ailapidus structure (Commands, Layout, api harness, three tiers, what the setup replaces, Conventions, Lint, Pre-push gate, exclusions table, Performance) with the kernel specifics (worker DBs, Redis, mail/R2 locks, Docker runtime) and no Jest-era section (`--runInBand`, `workerIdleMemoryLimit`, `scalar-stub`, nyc).
2. WHEN `rg -in 'jest' docs .claude/agents .claude/hooks .agents/skills/tlc-spec-driven/references/cards scripts catalog/*/README.md apps packages --glob '!docs/dev/template-changelog.md' --glob '!pnpm-lock.yaml'` runs THEN the only matches SHALL be `@testing-library/jest-dom` and `jest-to-vitest`.
3. WHEN `docs/back/back-arch.md` §Testes, `docs/catalog/catalog.md`, `AGENTS.md.jinja` and `docs/agents/harness.md` mention the runner THEN they SHALL name Vitest and the root commands.

---

## Edge Cases

- WHEN a `jest.mock` factory closes over an outer `const` (`traced.decorator.spec.ts:20`) THEN the codemod SHALL emit `vi.hoisted` and the spec SHALL still pass.
- WHEN a spec uses `it.each`/`describe.each` tables (7 sites) THEN it SHALL run unchanged.
- WHEN a production file uses `__dirname` (`handlebars-template-renderer.ts:14`) THEN it SHALL resolve the `templates` dir under Vitest exactly as under `node dist/`.
- WHEN the e2e tier runs with coverage THEN no file SHALL exceed the default heap (no `--max-old-space-size` needed) because each file runs in a fresh fork.
- WHEN Docker is absent THEN `pnpm test` SHALL still pass and `pnpm test:int` SHALL fail fast with the Docker-runtime message, not a hang.
- WHEN a child has not run the codemod THEN its `pnpm test` SHALL fail on the first `jest is not defined`, and the changelog note SHALL name the command.

---

## Requirement Traceability

| Requirement ID | Story | Proof | Phase | Status |
| --- | --- | --- | --- | --- |
| RUN-01 | P1 api — unit project on Vitest (AC1) | gate: `pnpm vitest run --project api` | Pending | Pending |
| RUN-02 | P1 api — one container, worker DBs, `provide`/`inject` (AC2, AC5) | test: `apps/api/test/setup/test-db.int-spec.ts` asserts DB name = `test_w${VITEST_POOL_ID}` and injected URI | Pending | Pending |
| RUN-03 | P1 api — e2e serial, fresh fork, env locks, Redis flush (AC3) | test: `apps/api/test/runner-env.e2e-spec.ts` asserts `MAIL_TRANSPORT=log`, `RESEND_API_KEY` undefined, Redis empty at start | Pending | Pending |
| RUN-04 | P1 api — scalar loads natively, stub deleted (AC4) | test: `apps/api/src/openapi/docs-reference.spec.ts` imports the real package | Pending | Pending |
| RUN-05 | P1 api — typecheck without jest types (AC6) | gate: `pnpm --filter api typecheck` | Pending | Pending |
| GAT-01 | P1 gates — `pnpm test` Docker-free unit only (AC1) | gate: `pnpm test` with `DOCKER_HOST=unix:///nonexistent` | Pending | Pending |
| GAT-02 | P1 gates — `test:coverage` merged, per-glob thresholds, exclusions (AC2) | gate: `pnpm test:coverage` | Pending | Pending |
| GAT-03 | P1 gates — `test:int`/`test:e2e`/`test:db` scripts (AC3) | test: `scripts/platform/__tests__/gates.test.mjs` parses root `package.json` | Pending | Pending |
| GAT-04 | P1 gates — Jest artefacts and packages removed (AC4) | gate: `pnpm install --frozen-lockfile && pnpm check` | Pending | Pending |
| GAT-05 | P1 gates — lefthook pre-push shape (AC5) | test: `gates.test.mjs` parses `lefthook.yml` | Pending | Pending |
| GAT-06 | P1 gates — CI jobs (AC6) | test: `gates.test.mjs` parses `.github/workflows/{ci,catalog}.yml` | Pending | Pending |
| GAT-07 | P1 gates — no `test*` in turbo/app manifests (AC7) | test: `gates.test.mjs` | Pending | Pending |
| CAT-01 | P1 catalog — codemod rewrites (AC1) | test: `scripts/platform/__tests__/jest-to-vitest.test.mjs` | Pending | Pending |
| CAT-02 | P1 catalog — no `jest.` left in api/catalog (AC2) | probe: `rg -c 'jest\.' apps/api catalog` → no output | Pending | Pending |
| CAT-03 | P1 catalog — five entries green in a rendered child (AC3) | gate: `pnpm catalog:check` | Pending | Pending |
| CAT-04 | P1 catalog — `module add` / `template-smoke` run Vitest (AC4) | test: `scripts/platform/__tests__/{template-smoke,module-add}.test.mjs` | Pending | Pending |
| CAT-05 | P1 catalog — entry version/CHANGELOG/advisory per entry (AC5) | gate: `pnpm catalog:lint` | Pending | Pending |
| CAT-06 | P1 catalog — changelog migration note (AC6) | probe: `rg -n 'jest-to-vitest' docs/dev/template-changelog.md` | Pending | Pending |
| LNT-01 | P2 lint — rule set active on api + web (AC1) | test: `packages/eslint-config/vitest.test.js` | Pending | Pending |
| LNT-02 | P2 lint — `it.only` / assertion-free fixture fails (AC2) | test: `packages/eslint-config/vitest.test.js` | Pending | Pending |
| LNT-03 | P2 lint — tree lints clean (AC3) | gate: `pnpm lint` | Pending | Pending |
| DOC-01 | P3 docs — `testing.md` rewritten (AC1) | gate: reviewed by the Verifier against the section list | Pending | Pending |
| DOC-02 | P3 docs — no stray "jest" (AC2) | probe: the `rg` in AC2 → only `jest-dom` / `jest-to-vitest` lines | Pending | Pending |
| DOC-03 | P3 docs — arch/catalog/agents docs name Vitest (AC3) | gate: covered by DOC-02's probe | Pending | Pending |

**Coverage:** 24 total, 0 mapped to tasks, 24 unmapped ⚠️ (Tasks phase pending). Probe budget: 3 of 3 (CAT-02, CAT-06, DOC-02).

---

## Success Criteria

- [ ] `pnpm test` (no Docker) and `pnpm test:coverage` (Docker) exit 0 on `main`; floors recorded in `vitest.coverage.mts`.
- [ ] `pnpm catalog:check` 5/5, `pnpm test:scripts`, `pnpm lint`, `pnpm check` exit 0.
- [ ] No `jest`, `@swc/jest`, `@types/jest`, `nyc` in any `package.json`; `pnpm-lock.yaml` regenerated.
- [ ] A child on the previous tag can run the codemod + `copier update` and its suite passes (proved by `catalog:check`, which renders a child).
- [ ] `test-suite-refactor` artifacts re-baselined (AD-023 wording, T5/T31/T37/T39, GA-5/GA-6, Gate Check Commands) in the Handoff at closeout.
