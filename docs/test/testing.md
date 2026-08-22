# Testing — Handbook

Vitest 4, one project per app: `api` (Node + SWC, Nest decorators) and `web` (jsdom + Testing
Library). The api's database layers (`api-int`, `api-e2e`) start a real Postgres and Redis via
testcontainers. Vitest `projects` is the monorepo's only runner — nothing outside it (AD-028).
Code rules: `docs/code-quality.md`.

Done = `pnpm check && pnpm test:coverage` passing (with Docker up).

## What counts as proof

Rules confirmed by the lessons loop (`.specs/LESSONS.md`, promoted by recurrence across distinct
features). They apply to any test in the monorepo, inside or outside the spec flow:

- **Assert the exact value the criterion or the test title promises.** `toBeDefined`, "the field
  exists" and "did not throw" are not proof (L-007).
- **Cover every input variant the criterion covers** — mixed set, alternate path, same-direction
  pair. The representative case does not prove the others (L-004).
- **Assert that a production path reaches the state that triggers the behavior.** Proving the
  handler answers correctly when called does not prove it runs (L-013).
- **Assert values that only exist as data passed along** — inline `style`, props of a mocked child.
  Without the assert, deleting the value breaks nothing (L-010).

A new lesson is born from the Verifier, not from here: `scripts/lessons.py` +
`.specs/lessons-vocabulary.md`.

## Commands

```bash
# root
pnpm test                     # unit of both apps (api, web) — no Docker
pnpm test:watch                # watch mode
pnpm test:coverage             # the four projects + report + coverage floor — needs Docker
pnpm vitest run --project api|web <path>   # one project/file in isolation, without the whole suite

pnpm test:int                  # api integration, real Postgres — needs Docker
pnpm test:e2e                  # api e2e, real Postgres — needs Docker
pnpm test:db                   # test:int + test:e2e in a single container

# root, template repository only: the product receives neither catalog/ nor these scripts
pnpm test:scripts              node --test on scripts/platform/__tests__/*.test.mjs
pnpm catalog:lint              lint of catalog/** and docs/advisories/** (pre-commit hook)
pnpm catalog:typecheck         only compiles the entries (staged mirror, runs no spec)
pnpm catalog:check             the only command that installs and runs an entry's tests
```

Coverage output: `coverage/` (gitignored; `text`, `json-summary`, `html`, `lcov` reports).

## Layout

Test next to the file under test — no `__tests__`, no separate test root. The exception is the
api's e2e layer: a test that crosses the whole app has no single file to sit next to, so it lives
in `apps/api/test/`.

```
apps/api/
  vitest.config.mts        project "api"      — unit, src/**/*.spec.ts (includes *.parity.spec.ts)
  vitest.int.config.mts    project "api-int"  — {src,test}/**/*.int-spec.ts
  vitest.e2e.config.mts    project "api-e2e"  — test/**/*.e2e-spec.ts, src/**/*.e2e-spec.ts, serial
  vitest.shared.mts        SWC plugin + defaults shared by the api's three projects
  test/setup/               see § The api harness

apps/web/
  vitest.config.ts         project "web" — src/**/<name>.test.ts(x)

vitest.config.mts          root: api + web projects, no container, no floor — pnpm test
vitest.coverage.mts        root: the four projects + container + coverage + floors — pnpm test:coverage
vitest.integration.mts     root: api-int + api-e2e, for an isolated database run
```

The `api` project's `*.spec.ts` also matches `*.parity.spec.ts` — a catalog entry's parity specs.
`module add` copies those specs into the installed module; they only run inside a rendered product
(`pnpm catalog:check`), never straight from the template root.

## The api harness

`apps/api/test/setup/` exists so that no test writes its own bootstrap.

- **`docker-runtime.ts`** — resolves the socket of the active Docker runtime (Colima, Docker
  Desktop, Rancher); called first in `global-setup.ts`, because testcontainers ignores the Docker
  CLI context and looks for the socket at fixed paths.
- **`global-setup.ts`** — runs once per execution (not per project): starts one Postgres container
  and one Redis, applies the real migrations, clones one database per worker slot
  (`CREATE DATABASE … TEMPLATE`) and publishes both URIs via `project.provide()`. With no Docker
  daemon answering, the first step fails fast with a message naming the right command — it never
  hangs waiting.
- **`container-uris.ts`** — the worker side: `inject("postgresUri")` / `inject("redisUri")`.
  Running a database spec outside its project (e.g. `--project api` on an `*.int-spec.ts`) blows
  up, because `inject()` comes back `undefined`.
- **`test-db.ts`** — each worker talks to its own database, `test_w${VITEST_POOL_ID}` (the slot id,
  `1..maxWorkers`, shared by every project of the run — not only the four of `api-int`), cloned
  from the migrated database; suites truncate freely without races.
- **`e2e-env.ts`** — locks external IO before the app boots: `MAIL_TRANSPORT=log` and the e-mail/R2
  credentials wiped from the env. The dev `.env` carries a real key and the delivery dispatcher
  runs in the background — without this lock, a flow that triggers an e-mail would actually send it.
- **`e2e-after-env.ts`** — `flushall` on Redis between tests; the e2e layer runs serially and shares
  the same Redis, so rate-limit state has to be zeroed on every file.

## The api's three layers

| Layer | Scope | Postgres |
| --- | --- | --- |
| unit `*.spec.ts` | one class, or the module graph without a query | none |
| integration `*.int-spec.ts` | one provider against real SQL | testcontainers |
| e2e `*.e2e-spec.ts` | HTTP in, response out, through the real app | testcontainers |

`vitest.integration.mts` starts **one** Postgres container and one Redis in `globalSetup` and hands
the URIs to both projects via `provide`/`inject` — integration and e2e share the same instance.
Mocking the database in either layer is forbidden — that is what the unit layer is for.

The integration layer runs in parallel (`maxWorkers: 4`, one `test_w<N>` per worker); e2e runs
serially (`fileParallelism: false`, `maxWorkers: 1`) — each file boots the `AppModule` in a fresh
process fork (`isolate: true`, the default), so the heap does not pile up across files.

## What the configuration replaces

| Replaced | Why |
| --- | --- |
| module stub for `@scalar/nestjs-api-reference` | the package is pure ESM and loads natively under Vite's SSR — no stub, no transform exclusion list |
| env channel for the container URIs (variable read from the process) | `provide`/`inject` — nothing on disk, nothing inherited by the child process |
| process recycling per file in e2e | `isolate: true` (default) + `pool: "forks"` — a fresh fork per file avoids heap build-up without recycling anything |
| coverage report via an external tool | Vitest's native `v8` provider |

## Conventions

- `globals: false` in every project — import `describe`/`it`/`expect`/`vi` from `"vitest"`.
- Mock-reset flags (`restoreMocks`/`clearMocks`/`mockReset`) stay `false` — the migrated specs were
  written against those defaults; turning them on is a `test-suite-refactor` candidate, not a
  migration one.
- No database mock in integration/e2e — always a real testcontainer.
- pt-BR in `describe`/`it`; identifiers in English.
- On the back, never `@/` in a test — relative imports only.
- On the `web`, import `@testing-library/jest-dom/vitest` for the DOM matchers
  (`toBeInTheDocument`, …) — the package name is historical, it does not name the runner.

## Lint

`@workspace/eslint-config` includes the test rule set (`@vitest/eslint-plugin` `recommended` +
twelve error-level rules) on `*.spec.ts`, `*.int-spec.ts`, `*.e2e-spec.ts` and `*.test.{ts,tsx}`.
It fails the build on a `.only`, `.skip`, assertion-less or duplicate-titled test;
`max-nested-callbacks: 4`.

## Pre-push gate

`lefthook.yml` runs `migrations → typecheck → catalog-typecheck → test-coverage` on `pre-push`
(the `catalog-typecheck` step lives in `lefthook-local.yml`, outside the product's copy); any red
step — a coverage floor below the calibrated one included — aborts the push.

`test-coverage` runs `pnpm test:coverage`: it starts Postgres and Redis in `globalSetup` and
measures the four projects (`api`, `api-int`, `api-e2e`, `web`) in a single pass — which is why
pre-push and CI need a Docker daemon. `pnpm test` stays on the two unit projects, with no container
and no floor, so the inner loop does not depend on Docker.

## Coverage exclusions (table)

| Excluded | Why |
| --- | --- |
| `**/*.spec.ts`, `**/*.int-spec.ts`, `**/*.e2e-spec.ts`, `**/*.test.{ts,tsx}` | the tests themselves |
| `**/*.d.ts`, `**/*.fixture.ts` | no executable logic |
| `apps/api/src/main.ts` | process bootstrap |
| `apps/api/src/db/**` | CLI scripts |
| `apps/web/src/main.tsx` | process bootstrap |
| `**/shared/test/**` | test harness |
| `apps/api/test/**` | e2e lives outside `src/**` |
| `apps/api/src/openapi/export-openapi.ts` | CLI entry point (same nature as `apps/api/src/db/**`); the document builder it wraps stays in the denominator |
| `apps/api/src/shared/config/coverage-metric/*.sample.ts` | fixtures of the coverage-metric contract, measured by its own nested run — `if-else.sample.ts` is required to stay uncovered here |

One bar, 90 on every metric: a global threshold plus a 90 per glob (`apps/api/src/**`,
`apps/web/src/**`) — statements, branches, functions and lines alike (AD-027). A floor is never
lowered to make a push pass; the way past a red gate is covering the code. The api does not
clear the bar yet (branches 74.21 % at the time of writing), so the coverage step is red on
purpose until `test-suite-refactor` closes the gap — `pnpm test` stays the green inner loop
meanwhile.

## Performance

- `api`/`api-int` run with `maxWorkers: 4`; `api-e2e` runs serially (`fileParallelism: false`,
  `maxWorkers: 1`) with `isolate: true` — each file boots in a fresh fork, so the heap does not
  pile up across files.
- `VITEST_POOL_ID` is shared by every project of the run (`1..maxWorkers` of the root project) —
  `globalSetup` clones `max(root maxWorkers, each project's)` databases, not only the four of
  `api-int`.

## Where to create the test

```
Pure rule (domain, VO, schema, helper)?        → <name>.spec.ts next to it (api) / <name>.test.ts (web)
Repo / tx / outbox / idempotency (database)?   → <name>.int-spec.ts next to it
End-to-end HTTP flow?                          → apps/api/test/<flow>.e2e-spec.ts (a catalog entry: api/__e2e__/)
React component?                               → <name>.test.tsx next to it
Public facade between modules?                 → <facade>.spec.ts (contract snapshot)
Structural test decision (exception)?          → docs/adr/NNNN-title.md
```
