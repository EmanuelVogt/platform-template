# Spike — evidence annex for `vitest-migration` (measured 2026-08-21)

Read by Design and by the Verifier when an AC's proof points here. Never by workers.

## Reference repo: `~/Developer/ailapidus` (the pattern to follow)

- Vitest `4.1.10`, `unplugin-swc 1.5.11`, `@vitest/coverage-v8 4.1.10`, `@vitest/eslint-plugin 1.6.27`,
  `eslint-plugin-testing-library 7.16.2`, `@swc/core 1.16.0`, `jsdom 30.0.1`, `@testcontainers/postgresql 12.1.0`.
  Nest 11, `@nestjs/testing`, supertest. No `.github/` (no CI). No Playwright e2e.
- Root configs: `vitest.config.mts` (unit `projects`, no container, no thresholds) ·
  `vitest.coverage.mts` (all projects + `globalSetup` + v8 coverage `include`/`exclude` + `thresholds`
  global and per glob, 90/90/90/90) · `vitest.integration.mts` (`api-int` + `api-e2e`, `globalSetup`).
- `apps/api/vitest.shared.mts`: `swcPlugin = () => swc.vite({ swcrc: false, module: { type: "es6" },
  jsc: { target: "es2023", parser: { syntax: "typescript", decorators: true, dynamicImport: true },
  transform: { legacyDecorator: true, decoratorMetadata: true }, keepClassNames: true } })`;
  `databaseTestDefaults = { environment: "node", globals: false, setupFiles: ["./test/setup-db.ts"],
  restoreMocks: true, testTimeout: 30_000, fileParallelism: false }`. Configs import `./vitest.shared.mjs`
  (NodeNext extension convention; the file is `.mts`).
- `apps/api/vitest.config.mts`: name `api`, `include: ["src/**/*.test.ts"]`, `setupFiles: ["./vitest.setup.ts"]`
  (`reflect-metadata` + `DATABASE_URL ??=` placeholder, `LOG_LEVEL=silent`, `OUTBOX_POLL_MS=0`).
- `apps/api/test/global-setup.ts`: `PostgreSqlContainer("postgres:17-alpine").start()` → `runMigrations` →
  `project.provide("databaseUrl", uri)`; `declare module "vitest" { interface ProvidedContext { databaseUrl: string } }`;
  returns teardown. `test/setup-db.ts`: `process.env.DATABASE_URL = inject("databaseUrl")`.
- Web/UI projects: `environment: "jsdom"`, `globals: false`, `css: false`, `pool: "threads"`, `isolate: false`,
  `restoreMocks: true`; setup = jest-dom + `cleanup()` + framework mocks.
- `packages/eslint-config/vitest.js`: `vitestNodeConfig` (files `**/*.test.{ts,tsx}` + `vitest.setup.ts` +
  `**/shared/test/**`): `vitest.configs.recommended` + errors `no-focused-tests`, `no-disabled-tests`,
  `no-standalone-expect`, `expect-expect`, `no-conditional-expect`, `no-conditional-in-test`,
  `no-identical-title`, `prefer-to-be`, `prefer-to-have-length`, `valid-expect`, `consistent-test-it`
  (`it`), `require-top-level-describe`, `max-nested-callbacks: 4`; `vitestConfig` adds
  `testing-library/flat/react` + `prefer-user-event`, `no-manual-cleanup`, `prefer-explicit-assert`,
  `prefer-presence-queries`.
- Root scripts: `test` = `vitest run`; `test:watch`; `test:coverage` = `vitest run --config vitest.coverage.mts --coverage`;
  `test:int` / `test:e2e` = `vitest run --config vitest.integration.mts --project api-int|api-e2e`; `test:db` = both.
  Tests are the only task outside Turbo (Turbo cannot merge coverage). `lefthook.yml` pre-push (parallel):
  typecheck, lint, build, `test:coverage`. `docs/testing.md` is the doc model (sections: Commands, Layout,
  api harness, three tiers, what the setup replaces, Conventions, Lint, Pre-push gate, exclusions table, Performance).
- Counts: api 71 unit / 12 int / 6 e2e; web 36; ui 7; api-client 1; content 4; publisher 28 + 2 int.

## Template today (`platform-template` @ `b07a806`)

- `apps/api`: Jest 29 + `@swc/jest`, config inline `apps/api/package.json:106-150` (`rootDir: src`,
  `setupFiles: test/setup/unit-env.ts`, `testRegex .spec.ts`, ignores `int-spec|e2e-spec|if-else.sample.uncovered.spec`,
  `maxWorkers 4`, `coverageProvider v8`, `coverageThreshold 43/35/40/45`, excludes `main.ts` + 3 retired slot files).
  `test/jest-integration.json` (`int-spec`, `globalSetup/Teardown`, `setupFiles int-env.ts`, `testTimeout 120000`,
  `maxWorkers 4`, `transformIgnorePatterns` for puppeteer). `test/jest-e2e.json` (`e2e-spec`, roots `test`+`src`,
  `moduleNameMapper @scalar/nestjs-api-reference → test/setup/scalar-stub.ts`, `setupFiles e2e-env.ts`,
  `setupFilesAfterEnv e2e-after-env.ts`, `maxWorkers 1`, `workerIdleMemoryLimit 1.5GB`).
- `apps/api/test/setup/` (14 files): `global-setup.ts` (173 l: `ensureDockerRuntimeEnv()`; `postgres:16-alpine`
  tmpfs + `fsync=off`; own `runMigrations` per journal; publishes `TC_POSTGRES_URI`; e2e mode detected by
  `projectConfig.setupFiles` containing `e2e-env` → starts `redis:7-alpine`, publishes `TC_REDIS_URI`; int mode →
  `createWorkerDatabases(uri, templateDb, maxWorkers)` = `CREATE DATABASE test_wN TEMPLATE …`; containers on
  `globalThis.__pgContainer/__redisContainer`), `global-teardown.ts`, `container-uris.ts` (env handshake, throws if
  absent), `unit-env.ts` (12 env vars), `int-env.ts` (`TEST_DB_PER_WORKER=1` + docker env), `e2e-env.ts` (DB/Redis
  URIs, OTEL off, R2 dummies, `MAIL_TRANSPORT=log`, deletes `RESEND_API_KEY`/`MAIL_FROM`), `e2e-after-env.ts`
  (module-level `beforeAll/afterEach/afterAll`: Redis `flushall` per test), `app-factory.ts` (`createE2eApp`),
  `cookies.ts`, `docker-runtime.ts` (Colima/Desktop socket + Ryuk override), `scalar-stub.ts`, `test-db.ts`
  (`testDatabaseUrl()` = `/test_w${JEST_WORKER_ID ?? "1"}` when `TEST_DB_PER_WORKER=1`; `testRedisUrl`, `flushRedis`,
  `createTestPool/Db`, `truncateKernel/Identity/Attachment/Tag`, `seedEmail`), `test-logger.ts`, `global.d.ts`.
- `apps/api/scripts/coverage-all.sh` (75 l): 3 jest runs → `test/tools/normalize-coverage.ts` → `nyc merge` →
  `nyc check-coverage --statements 85 --branches 54.5 --functions 81.5 --lines 87.5` (calibrated 2026-08-21 on
  86.47/56.36/83.33/89.22; branch low blamed on `@swc/jest` downlevel of `?.`/`??`).
- `apps/api/tsconfig.json`: extends `@workspace/typescript-config/nest.json` (NodeNext), `types: ["node","jest","multer"]`,
  `include: src/**, test/**`, `ts-node.require: tsconfig-paths/register`. `tsconfig.build.json` excludes `test`, specs, fixtures.
  `.swcrc`: `module.type commonjs`, `target es2023`, decorators + metadata, `useDefineForClassFields: true`, `keepClassNames`.
- `apps/web/vitest.config.ts` (40 l): react plugin, alias `@`→`src`, jsdom, `setupFiles ./test/setup.ts` (jest-dom,
  `cleanup`, `@/app/config/zod-locale`), `testTimeout 15_000`, `env.VITE_API_URL`, coverage v8 `include src/**`,
  exclude tests/`.d.ts`/`main.tsx`/`shared/test/**`, thresholds 64/56/61/64. `apps/web/src/shared/test/`:
  `fixed-clock.ts`, `msw-server.ts`, `render-with-providers.tsx`. No `pool`/`isolate` override. vitest `^4.1.7`.
- Root `package.json` scripts: `test` = `turbo test`, `test:int` = `turbo test:int`, `test:e2e` = `turbo test:e2e`,
  `test:scripts` = `node --test scripts/platform/__tests__/*.test.mjs`, `catalog:check/lint/typecheck`, `template:smoke`.
  `turbo.json` tasks `test` (`outputs: []`), `test:cov` (`cache:false`), `test:int`, `test:e2e` (`cache:false`).
  Root devDeps: concurrently, lefthook, prettier, prettier-plugin-tailwindcss, semver, turbo, typescript ~6, yaml.
- `lefthook.yml` pre-push piped: `migrations` (`db:check:journal`) → `typecheck` → `catalog-typecheck` →
  `test-api` (`turbo test --filter=api`) → `test-web` (`turbo test:cov --filter=web`). pre-commit `catalog-lint`;
  commit-msg `advisory-required.mjs`.
- `.github/workflows/ci.yml`: `quality` (lint+typecheck+build:emit+web build) → `test-unit`
  (`api test:cov`, `web test:cov`) and `test-coverage` (`api test:cov:all`). `catalog.yml` `gates`: `pnpm check`,
  `pnpm test`, `pnpm test:scripts`, `catalog:lint`, `catalog:typecheck`, ADV-04; `catalog` matrix ×5 entries with
  postgres+redis services → `pnpm catalog:check <entry>` (uses `pipx install copier`).
- `packages/eslint-config`: `base.js`, `react.js`, `nest.js`, `fsd.js`, `rules/sr-only-requires-positioned-ancestor.{js,test.js}`;
  `scripts.test = node --test rules/*.test.js`; **no test-file rule set** (no `@vitest/eslint-plugin`, no
  `eslint-plugin-jest`, no `eslint-plugin-testing-library`). `apps/api/eslint.config.mjs` (14 l) and
  `apps/web/eslint.config.js` (8 l) spread `@workspace/eslint-config/{nest,react,fsd}`.
- Scripts that run tests: `scripts/platform/catalog-check.mjs:235` → `pnpm test` in the child;
  `scripts/platform/lib/commands/add.mjs:215,225` → `pnpm --filter api test -- modules/<name>` and
  `pnpm --filter web test -- entities/<name>`; `scripts/template-smoke.mjs:253` →
  `pnpm --filter api exec jest src/modules/module-boundaries.spec.ts` (mocked in
  `scripts/platform/__tests__/template-smoke.test.mjs:285,308`; fixture `__tests__/fixtures/child/apps/api/package.json:7`
  `"test": "jest"`).

## Migration surface (grep, excluding node_modules/.catalog-stage)

| Scope | spec | int-spec | e2e-spec | parity | `jest.*` calls | `jest.Mock`/`Mocked` types |
| --- | --- | --- | --- | --- | --- | --- |
| `apps/api` | 161 | 36 | 30 | — | 40 (fn 24, spyOn 5, mock 5, mocked 4, requireActual 1, restoreAllMocks 1) | 10 / 0 |
| `catalog/` | 123 | 28 | 27 | 14 | 719 (fn 712, spyOn 1, mock 1, setTimeout 1, useFakeTimers 1, useRealTimers 1, advanceTimersByTime 2) | 14 / 6 |

- No file imports `@jest/globals` or any `jest-*` helper package — globals only, so the codemod is prefix + import.
- `jest.mock(` ×6, all with a factory: `apps/api/src/shared/infra/storage/r2-storage.adapter.spec.ts:13`,
  `shared/kernel/tracing/tracing.setup.spec.ts:3`, `shared/kernel/tracing/traced.decorator.spec.ts:14` (**factory
  references outer `mockSpan` declared at :6 → needs `vi.hoisted`**), `shared/kernel/access/access.guard.spec.ts:20`,
  `shared/kernel/scheduling/maintenance-registry.spec.ts:16`, `catalog/notification/api/infrastructure/mailer/resend-mailer.spec.ts:3`.
  Targets: relative ×2 (`../../config/env`, `../context/request-context`), packages ×4 (`@aws-sdk/client-s3`,
  `@opentelemetry/api`, `@nestjs/schedule`, `resend`).
- `.each(` ×7 (same API in Vitest). No `done` callbacks, no `expect.assertions`, no `.only/.skip/.todo`.
- `__dirname`/`import.meta` users: production `catalog/notification/api/infrastructure/mailer/handlebars-template-renderer.ts:14`
  (`join(__dirname, "templates")`); 19 spec files (conformance specs under `apps/api/src/{db,modules,openapi,shared}`,
  parity specs, `notification` e2e/guards). ailapidus' api uses `__dirname` in `src/shared/test/source-tree.ts:5` and
  `src/openapi/export-openapi.ts:11` under Vitest — proven to work.
- Other "jest" mentions outside specs: `docs/back/back-arch.md:49,612`, `docs/catalog/catalog.md:21`,
  `docs/agents/harness.md:21,147,186`, `docs/dev/template-changelog.md:142,161` (history — keep), catalog READMEs
  (`attachment:77`, `identity/single-tenant:218`, `notification:85`, `tag:71`), `.claude/agents/shell-runner.md:46`,
  `.claude/hooks/delegate-to-subagent.mjs:81` (RUN_CMDS set), `.agents/skills/tlc-spec-driven/references/cards/orchestrator.md:72`,
  `scripts/token-report.mjs:38`, `apps/web/package.json:31` (`@testing-library/jest-dom` — keep).

## Overlap with the in-flight feature `test-suite-refactor` (Specified+Designed+Tasked, not executed)

- AD-023 (planned) says "runner plumbing (jest configs, …) lives in `apps/api/test/`" → reword to Vitest configs.
- T5 (runner plumbing, `apps/api/test/jest-*.json`, `apps/api/package.json`), T31 (test lint plugins — GA-5 chose
  `eslint-plugin-jest` for api), T37 (CI: jobs incl. `coverage-all`), T39 (jest thresholds, lefthook "still Docker-free"),
  GA-6 ("pre-push stays Docker-free") and the Gate Check Commands all assume Jest. Re-baseline at this feature's closeout.
