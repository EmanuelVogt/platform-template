# Testing — Handbook

Operational testing guide for the monorepo. Source of the pyramid: `docs/arch/back.md`. This document describes the **actual setup** (runners, testcontainers, conventions) and how to write each kind of test.

## Principles

1. **Pyramid, not hourglass.** Many unit tests (fast, pure), enough integration tests (real database), few e2e (expensive).
2. **No database mock.** Integration and e2e run against a real Postgres (testcontainers). Mocking the database is forbidden — it hides SQL/migration/transaction bugs.
3. **Test the behavior, not the implementation.** Assert on the observable effect (row in the database, HTTP response, emitted event), not on internal calls.
4. **pt-BR** in `describe`/`it`. Identifiers in English.
5. **Isolation.** Every test starts from a clean state (`truncateKernel` between integration tests; ephemeral container per suite).

## What counts as proof

Rules confirmed by the lessons loop (`.specs/LESSONS.md`, promoted by recurrence across distinct features). They apply to any test in the monorepo, inside or outside the spec flow:

- **Assert the exact value the criterion or the test title promises.** `toBeDefined`, "the field exists" and "did not throw" are not proof (L-007).
- **Cover every input variant the criterion covers** — mixed set, alternate path, same-direction pair. The representative case does not prove the others (L-004).
- **Assert that a production path reaches the state that triggers the behavior.** Proving the handler answers correctly when called does not prove it runs (L-013).
- **Assert values that only exist as data passed along** — inline `style`, props of a mocked child. Without the assert, deleting the value breaks nothing (L-010).

A new lesson is born from the Verifier, not from here: `scripts/lessons.py` + `.specs/lessons-vocabulary.md`.

## Pyramid

| Type            | Scope                                               | Database      | Runner / suffix                       |
| --------------- | --------------------------------------------------- | ------------- | ------------------------------------- |
| **Unit**        | pure function/class (domain, VO, schema, helper)    | none          | jest `*.spec.ts` / vitest `*.test.ts` |
| **Integration** | `application` + `infrastructure` (repo, tx, outbox) | real Postgres | jest `*.int-spec.ts`                  |
| **E2E**         | controller → use case → database → outbox → handler | real Postgres | jest `*.e2e-spec.ts`                  |
| **Contract**    | exposed facade (format snapshot)                    | none          | jest `*.spec.ts`                      |
| **OpenAPI**     | `openapi.json` snapshot in CI                       | —             | `pnpm contract` + `git diff`          |

## Runners

- **`apps/api` → jest + @swc/jest.** Transform without typecheck (orders of magnitude faster than ts-jest); decorators via `legacyDecorator` + `decoratorMetadata` in the inline config of each jest config, `module.type: commonjs`. Spec typing is guaranteed by `tsc --noEmit` (the api tsconfig includes `src/**` and `test/**`) — runs on pre-push and in CI.
- **`apps/web` → vitest + Testing Library + jsdom.** Native to the Vite ecosystem; fast; same alias resolver as the app.

> On the back, do **not** use the `@/` alias in code or in tests — relative imports only (the Nest builder and jest's CommonJS do not rewrite the alias at runtime).

## Structure and naming

```
apps/api/
├── src/**/<name>.spec.ts          Unit — next to the code
├── src/**/<name>.int-spec.ts      Integration — next to the code
├── test/
│   ├── <flow>.e2e-spec.ts         E2E — app boot + supertest
│   ├── jest-integration.json      jest config for *.int-spec
│   ├── jest-e2e.json              jest config for *.e2e-spec
│   └── setup/
│       ├── global-setup.ts        starts the container + applies migrations
│       ├── global-teardown.ts     tears the container down
│       ├── e2e-env.ts             points DATABASE_URL at the container (e2e)
│       ├── test-db.ts             test pool/drizzle + truncateKernel
│       └── test-logger.ts         silent LoggerFactory to instantiate the kernel

apps/web/
├── src/**/<name>.test.ts(x)       Unit/component — next to the code
├── vitest.config.ts
└── test/setup.ts                  jest-dom matchers
```

`*.spec.ts` (unit) runs in `pnpm test` and **ignores** `*.int-spec.ts`/`*.e2e-spec.ts` (they require Docker).

## Commands

```
# apps/api
pnpm --filter api test        unit (fast, no Docker)
pnpm --filter api test:int    integration (testcontainers)
pnpm --filter api test:e2e    e2e (testcontainers)
pnpm --filter api test:all    unit + int + e2e

# apps/web
pnpm --filter web test        vitest (jsdom)

# root
pnpm test                     turbo: runs each app's `test` (unit) — does NOT cover catalog/**

# root, template repository only: the product receives neither `catalog/` nor these scripts
pnpm test:scripts             node --test on scripts/platform/__tests__/*.test.mjs
pnpm catalog:lint             lint of catalog/** and docs/advisories/** (pre-commit hook)
pnpm catalog:typecheck        only compiles the entries (staged mirror, runs no spec)
pnpm catalog:check            the only command that installs and runs an entry's tests
```

`pnpm test:scripts` uses Node's native runner (`node --test`) — there is no jest/vitest
configured for `scripts/`; it is the only place in the monorepo that uses that runner.

`test:int` runs **in parallel** (`maxWorkers: 4`): each worker uses its own database (`test_w<N>`, a clone of the migrated DB via `CREATE DATABASE ... TEMPLATE`), so suites can truncate freely without races. `test:e2e` runs **serially** (`maxWorkers: 1`) — the app boots on the base DB and the suites share Redis (rate-limit state).

**No `--runInBand` on e2e.** Serialization already comes from `maxWorkers: 1`; `--runInBand` only removes the child worker, and it is the worker that holds the memory. Each e2e file boots the `AppModule` in a new realm, and jest-circus retains the file's describe/hook tree — the `beforeAll` closure holds the entire Nest app. `app.close()` releases sockets and timers, **not** the object graph. In-band the realms pile up in a single process: ~3.5 GB at the end of the tier without coverage (Node's default ceiling is ~4 GB) and OOM with coverage, which ~triples the cost per file. In a worker, `workerIdleMemoryLimit` (`1.5GB`, in `jest-e2e.json`) recycles the process between files and the peak stays bounded. Detail: jest's `shouldRunInBand` only honors `workerIdleMemoryLimit` when `--runInBand` is absent.

## testcontainers — how it works

1. `global-setup.ts` starts `postgres:16-alpine`, applies the real migrations (`drizzle-orm/.../migrator`) and publishes the URI in `process.env.TC_POSTGRES_URI` (same for Redis, in `TC_REDIS_URI`).
2. Workers inherit that env on fork and read it through the helpers in `test/setup/container-uris.ts` (`globalThis` does not cross processes; env does). Because the handshake is per process and not per file on disk, **two simultaneous runs on the same checkout do not step on each other** — each one talks only to its own containers.
3. `global-teardown.ts` tears the container down (the testcontainers reaper covers failures).
4. Between tests, `truncateKernel(pool)` wipes the `_kernel` schema.

Requires **Docker** on the machine and in CI. Each `test:int`/`test:e2e` is one suite with one container.

**Runtime in a VM (Colima, Docker Desktop, Rancher):** nothing to configure.
testcontainers looks for the socket at fixed paths and ignores the Docker CLI
context — hence the "Could not find a working container runtime strategy" even
with `docker` responding. `test/setup/docker-runtime.ts` resolves the socket from
the active context and points Ryuk's bind mount at `/var/run/docker.sock` (the
path that is valid inside the VM; without it the reaper dies on the mount and the
alternative would be disabling it, leaking Postgres/Redis when the suite gets
killed). `DOCKER_HOST` or `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` coming from the
environment always win, and with a native daemon (Linux/CI) the detection is a
no-op.

## Unit

Pure, no IO. Instantiate and assert the effect.

```typescript
// src/shared/config/env.spec.ts
import { parseEnv } from "./env"

it("fails (fail-fast) without DATABASE_URL", () => {
  expect(() => parseEnv({})).toThrow(/DATABASE_URL/)
})
```

For what is private (e.g. `hashRequest`), extract an exportable pure function or test through the public behavior — do not expose internals just for the test without need.

## Integration (real database)

Instantiate the kernel classes **manually** (without Nest's DI container) with the test pool and `makeTestLogger`. Use `TransactionManager.run` to open a tx.

```typescript
// src/shared/kernel/transactional/transaction-manager.int-spec.ts
beforeAll(() => {
  pool = createTestPool()
  db = createTestDb(pool)
  txm = new TransactionManager(db, makeTestLogger().loggerFactory)
})
afterAll(async () => { await pool.end() })
beforeEach(async () => { await truncateKernel(pool) })

it("rolls back when run throws", async () => {
  await expect(
    txm.run(async () => { await insert("e2"); throw new Error("boom") })
  ).rejects.toThrow("boom")
  expect(await ids()).toEqual([])
})
```

Cover the critical invariants: commit/rollback, join vs `requires_new` (savepoint), `onCommit`, dedupe (`markIfNew`), idempotency reclaim by expiration, outbox retry/dead-letter.

To exercise the dispatcher without waiting for the poll, register a listener on `EventEmitter2` and call `dispatcher.poll()` directly (public method).

## E2E

Boot the real `AppModule` via `@nestjs/testing` + `supertest`, against the container. Mirror the `main.ts` setup (versioning + context middleware).

```typescript
// test/health.e2e-spec.ts
beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication()
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" })
  app.use(createRequestContextMiddleware(app.get(RequestContext)))
  await app.init()
})
afterAll(async () => { await app.close() })   // closes pool + LISTEN client + intervals

it("unknown route → 404 RFC 7807 with the correlationId from the header", async () => {
  const res = await request(app.getHttpServer())
    .get("/v1/nope").set("X-Correlation-Id", "corr-e2e").expect(404)
  expect(res.headers["content-type"]).toContain("application/problem+json")
  expect(res.body.correlationId).toBe("corr-e2e")
})
```

`e2e-env.ts` sets `DATABASE_URL` (container), `NODE_ENV=test`, `LOG_LEVEL=silent` before boot. Always `app.close()` in `afterAll` — otherwise the pool/LISTEN client/intervals leak handles.

**External IO is never real in e2e.** `e2e-env.ts` forces `MAIL_TRANSPORT=log` (LogMailer) and removes `RESEND_API_KEY`/`MAIL_FROM` — the dev `.env` uses `MAIL_TRANSPORT=resend` with a **REAL key**, and `DeliveryDispatcher` runs in the background (`@Interval`), so a flow that triggers an e-mail (create-user, forgot-password, lockout) **would actually send it** without this safeguard. Same logic for R2 (dummy credentials). To **assert** the effect of a send, use `.overrideProvider(MAILER).useValue(fake)` in `Test.createTestingModule` (same for `OBJECT_STORAGE` for storage) — never rely on the real provider nor on remembering the override per test: the `e2e-env` safeguard is the safety net.

## Contract / OpenAPI snapshot

- **Facade contract:** when there is a public facade between modules, snapshot the format each consumer expects (`*.spec.ts`, no database).
- **OpenAPI:** CI runs `pnpm contract` and fails if `openapi.json` diverges (`git diff --exit-code openapi.json`). Changed the contract → regenerate and commit.
- **`/docs` cannot be exercised over HTTP in e2e.** `test/setup/scalar-stub.ts` neutralizes `@scalar/nestjs-api-reference` via jest's `moduleNameMapper` (the package is pure ESM, incompatible with jest's CJS) — the contract e2e asserts the static `openapi.json`, not the rendered `/docs` page.

## Parity (catalog)

Every catalog entry carries `parity/*.parity.spec.ts` + `parity/contract.snapshot.json`
next to the code — they compare the entry's observable behavior (route, event, facade)
against the snapshot recorded at the entry's version. `module add` copies the parity specs to
`apps/api/src/modules/<entry>/__parity__/` (path convention from `module.json`), where the
product's jest sees them like any other `*.spec.ts`.

**No gate in this repository runs a catalog spec in isolation.** `pnpm --filter api
test` does not see `catalog/**` (outside jest's `rootDir`); `pnpm catalog:typecheck` only
proves the entries compile, via a staged, gitignored mirror in
`apps/api/.catalog-stage/`. An entry's unit/integration/e2e/parity specs only run
**inside a rendered product**, after `module add` — that is, via
`pnpm catalog:check`. Whoever wants to prove an entry passes its own tests runs
`catalog:check`, never a command at the template root.

## Web (vitest + RTL)

```typescript
// pure schema
import { loginSchema } from "./login.schema"
it("rejects an invalid e-mail", () => {
  expect(loginSchema.safeParse({ email: "nope", password: "x", rememberMe: false }).success).toBe(false)
})

// component
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
render(<Greeting name="World" />)
expect(screen.getByText("Hello, World")).toBeInTheDocument()
```

Explicit import from `vitest` (`describe`/`it`/`expect`) — no `globals`, so as not to touch the web tsconfig. Forms that depend on router/query: wrap them in the minimal providers.

## CI

```
1. pnpm check               lint + typecheck (all packages)
2. pnpm --filter api test   unit (no Docker)
3. pnpm --filter web test   vitest
4. [Docker] pnpm --filter api test:int
5. [Docker] pnpm --filter api test:e2e
6. pnpm --filter api contract && git diff --exit-code openapi.json
```

`test:int`/`test:e2e` require a runner with Docker (testcontainers).

## Anti-patterns

- Database mock in integration/e2e (use testcontainers).
- Asserts on internal calls / spies where the observable effect can be checked.
- `@/` in back tests (use relative).
- Forgetting `app.close()` in e2e (leaks handles).
- Integration test without `truncate` between cases (leaks state).
- Waiting based on the JS clock for an effect recorded by Postgres (`new Date()` vs `now()` — ms vs µs precision; compare in SQL).
- e2e without Docker in CI marked as mandatory in the fast pipeline (separate the stage).

## Where to create the test

```
Pure rule (domain, VO, schema, helper)?        → <name>.spec.ts next to it (api) / <name>.test.ts (web)
Repo / tx / outbox / idempotency (database)?   → <name>.int-spec.ts next to it
End-to-end HTTP flow?                          → test/<flow>.e2e-spec.ts
React component?                               → <name>.test.tsx next to it
Public facade between modules?                 → <facade>.spec.ts (contract snapshot)
Structural test decision (exception)?          → docs/adr/NNNN-title.md
```
