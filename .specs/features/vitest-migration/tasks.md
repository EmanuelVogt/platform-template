# Vitest Migration Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

Checkout for every worker: `/Users/emanuelvogt/Developer/platform-template/.worktrees/vitest-migration`, branch `feat/vitest-migration` (from `main` at `e167341`). Docker must be running for every DB-tier gate. Reference implementation: `~/Developer/ailapidus` (root `vitest*.mts`, `apps/api/vitest*.mts`, `packages/eslint-config/vitest.js`, `docs/testing.md`) — copy shapes, not product content.

**Tools**: MCP none · Skills none beyond the worker card. Docs under `docs/**`, catalog READMEs/CHANGELOGs and advisories stay in pt-BR (product text); everything under `.specs/` is English.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `docs/test/testing.md`, `AGENTS.md.jinja`, `apps/web/vitest.config.ts` (web floors 64/56/61/64), `apps/api/package.json` `jest` block (unit floors 43/35/40/45, replaced by AD-027's per-glob floors), `.claude/hooks/wave-plan-check.mjs`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Codemod (`scripts/platform/jest-to-vitest.mjs`) | unit (node:test) | one fixture per rewrite rule of spec P1-catalog AC1, the `traced.decorator` outer-binding shape, `it.each` pass-through, idempotency, `--check` exit codes | `scripts/platform/__tests__/jest-to-vitest.test.mjs` | `node --test scripts/platform/__tests__/jest-to-vitest.test.mjs` |
| Gate shape (root manifests, hook, CI) | unit (node:test) | GAT-03, GAT-05, GAT-06, GAT-07 each asserted against the real files | `scripts/platform/__tests__/gates.test.mjs` | `node --test scripts/platform/__tests__/gates.test.mjs` |
| Platform scripts (`add.mjs`, `child.mjs`, `template-smoke.mjs`) | unit (node:test) | every changed command string asserted by the existing test of that script | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| ESLint config (`@workspace/eslint-config/vitest`) | unit (node:test + `Linter`) | LNT-01 rule ids active at `error` on api and web file shapes; LNT-02 `it.only` and an `expect`-less `it` each error | `packages/eslint-config/vitest.test.js` | `pnpm --filter @workspace/eslint-config test` |
| Api harness — worker DB handshake | integration proof spec | RUN-02: DB name = `test_w${VITEST_POOL_ID}`, URI comes from `inject` | `apps/api/test/setup/test-db.int-spec.ts` | `pnpm vitest run --config vitest.integration.mts --project api-int <path>` |
| Api harness — e2e env locks | e2e proof spec | RUN-03: `MAIL_TRANSPORT=log`, `RESEND_API_KEY`/`MAIL_FROM` unset, R2 dummies, Redis empty at start | `apps/api/test/runner-env.e2e-spec.ts` | `pnpm vitest run --config vitest.integration.mts --project api-e2e <path>` |
| Api — scalar loads natively | unit proof spec | RUN-04: real `@scalar/nestjs-api-reference` import | `apps/api/src/openapi/docs-reference.spec.ts` | `pnpm vitest run --project api <path>` |
| Vitest configs, tsconfig, turbo, lefthook, workflows | none | — (build gate + `gates.test.mjs`) | — | build gate only |
| Catalog entries (specs migrated) | rendered-child run | every entry green in the child: `check → test → test:db` | `catalog/<entry>/**` | `pnpm catalog:check <entry>` |
| Docs, cards, changelog | none | Verifier review (DOC-01) + the DOC-02 probe | — | probe only |

## Gate Check Commands

> Generated from codebase — confirm before Execute. All commands run at the worktree root.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | scripts / eslint-config / api-unit tasks | `node --test <file>` · `pnpm --filter @workspace/eslint-config test` · `pnpm vitest run --project api <path>` (from T15) · `pnpm vitest run --project web <path>` (from T15; before that `pnpm --filter web test -- <path>`) |
| Full | tasks that create or touch DB-tier specs | `pnpm vitest run --config vitest.integration.mts --project api-int <path>` / `--project api-e2e <path>` (Docker). T16/T17 are the runner itself: each runs its whole tier once (9 int files / 4 e2e files) — the one sanctioned exception to the suite-cost rule, the tier being the unit under test. Catalog entry tasks: `pnpm catalog:check <entry>` |
| Build | once per wave, orchestrator via the runner | `pnpm turbo typecheck lint --filter=<touched packages>` (+ `pnpm test:scripts` when `scripts/**` was touched). `full-unit` waves: wave 3 adds `pnpm test` (root, Docker-free) and `pnpm --filter api typecheck`; wave 5 adds `pnpm install --frozen-lockfile && pnpm check && pnpm test`; wave 6 is config-only (typecheck + lint). Never int/e2e between waves |
| Final | once, Verifier | `pnpm install --frozen-lockfile && pnpm check && pnpm test && pnpm test:coverage && pnpm test:scripts && pnpm catalog:lint && pnpm catalog:typecheck && pnpm catalog:check && pnpm template:smoke` (Docker) plus the probes in spec.md's traceability table |

---

## Pre-feature baseline (filled by T1)

| Measure | Value |
| --- | --- |
| `apps/api` unit files / tests (jest) | _T1_ |
| `apps/api` int files / e2e files | 8 / 3 (audit 2026-08-21; all int under `src/`, all e2e under `test/`) |
| `apps/web` tests (vitest) | _T1_ |
| `pnpm test:scripts` tests | _T1_ |
| `jest.` sites | `apps/api`: 54 in 12 files · `catalog`: 753 (identity 608, attachment 76, notification 51, audit 10, tag 8) |

## Deviations recorded at Tasks

1. Spec P1-api AC1 says "161 files": the kernel-only tree holds **52** `*.spec.ts` (+ `if-else.sample.uncovered.spec.ts`, excluded); the 161 counted the pre-v1 tree. The proof is "every file of the T1 baseline runs and passes", not the number.
2. Spec P1-gates AC5 names `catalog-typecheck` in the pre-push chain; since `0fc3dca` that step lives in `lefthook-local.yml` (template-only, merged by lefthook). `lefthook.yml` carries `migrations → typecheck → test-coverage`; `gates.test.mjs` asserts both files.
3. `api-int` `include` is `{src,test}/**/*.int-spec.ts` (design said `src/**`) so the RUN-02 proof spec can live at the spec's path `apps/api/test/setup/test-db.int-spec.ts`; AD-028's wording is corrected at T30.
4. The DOC-02 probe (spec P3 AC2) is run with `--glob '!**/jest-to-vitest*'`: the codemod and its fixtures mention `jest` by nature.
5. `dependsOn` ranges must follow the majors: identity's `notification >=1.0.0 <2.0.0` and attachment/audit/tag's `identity >=1.0.0 <2.0.0` become `>=2.0.0 <3.0.0`, so the five entries migrate in topological order inside one cluster (notification → identity → attachment → audit → tag); each `catalog:check` installs the already-migrated dependencies.
6. `docs/advisories/` has no `ADV-*.md` yet; the frontmatter contract is `scripts/platform/lib/frontmatter.mjs:5-7` (keys `id, kind, module, affects, severity, detect, fix, parity`; `kind` ∈ bug|security|breaking; `severity` ∈ low|medium|high|critical; `affects` = semver range). Advisory numbers follow the design (alphabetical): 01 attachment, 02 audit, 03 identity/single-tenant, 04 notification, 05 tag.
7. `.github/workflows/ci.yml` already has jobs `test-unit` and `test-coverage` (running the jest scripts); T13 changes their `run` lines, it does not add jobs.
8. `.agents/skills` is a real directory, not a symlink: the docs task edits `.claude/skills/...` and mirrors it (`pnpm skills:sync` or the same edit).

---

## Wave Plan

| Wave | Cluster | Tasks (in order) | Files (union of Touches) | Notes |
| --- | --- | --- | --- | --- |
| 0 | C0 — pre-flight (orchestrator) | T1 | none (records into this file) | no worker, no commit; stops Execute if an assertion fails |
| 1 | C1 — toolchain deps (exclusive) | T2 | `package.json`, `apps/api/package.json`, `apps/web/package.json`, `packages/eslint-config/package.json`, `pnpm-lock.yaml` | `Exclusive: yes` — lockfile; `gate: scoped` (`pnpm install --frozen-lockfile`); tier **haiku** — surgical edits, versions given |
| 2 | C2 — codemod | T3 → T4 → T5 | `scripts/platform/jest-to-vitest.mjs`, `scripts/platform/__tests__/jest-to-vitest.test.mjs` | `gate: scoped`; tier **sonnet** |
| 2 | C3 — lint | T6 → T7 → T8 | `packages/eslint-config/vitest.js`, `packages/eslint-config/vitest.test.js`, `packages/eslint-config/package.json`, `packages/eslint-config/nest.js`, `packages/eslint-config/base.js`, `apps/web/eslint.config.js`, `apps/web/src/**/*.test.{ts,tsx}`, `apps/web/test/setup.ts` | tier **sonnet** |
| 2 | C4 — platform scripts | T9 → T10 → T11 | `scripts/platform/lib/commands/add.mjs`, `scripts/platform/lib/child.mjs`, `scripts/platform/catalog-check.mjs`, `scripts/template-smoke.mjs`, `scripts/token-report.mjs`, `.claude/hooks/delegate-to-subagent.mjs`, `scripts/platform/__tests__/add-web-test-script.test.mjs`, `scripts/platform/__tests__/cli.test.mjs`, `scripts/platform/__tests__/apply.test.mjs`, `scripts/platform/__tests__/catalog-check.test.mjs`, `scripts/platform/__tests__/template-smoke.test.mjs`, `scripts/platform/__tests__/fixtures/child/apps/api/package.json` | tier **sonnet** |
| 2 | C5 — root manifests, hook, CI | T12 → T13 | `package.json` (scripts), `turbo.json`, `apps/web/package.json` (scripts), `lefthook.yml`, `.github/workflows/ci.yml`, `.github/workflows/catalog.yml`, `scripts/platform/__tests__/gates.test.mjs` | tier **sonnet**; its gate is `gates.test.mjs` — the scripts it writes are exercised by the wave-3 gate |
| 3 | C6 — api runner vertical | T14 → T15 → T16 → T17 → T18 → T19 | `apps/api/**` (specs, `test/**`, `vitest*.mts`, `tsconfig*.json`, `eslint.config.mjs`, `package.json` scripts/jest block, `scripts/coverage-all.sh`), `vitest.config.mts`, `vitest.integration.mts`, `vitest.coverage.mts`, `apps/web/vitest.config.ts`, `scripts/platform/__tests__/gates.test.mjs` | `gate: full-unit` (`pnpm test` + api typecheck/lint); tier **opus** — AD-027/AD-028 foundation: swc decorators, Nest DI, containers, provide/inject |
| 3 | C7 — docs and cards | T20 → T21 → T22 | `docs/test/testing.md`, `docs/back/back-arch.md`, `docs/catalog/catalog.md`, `docs/agents/harness.md`, `AGENTS.md.jinja`, `.claude/agents/shell-runner.md`, `.claude/skills/tlc-spec-driven/references/cards/orchestrator.md`, `.agents/skills/tlc-spec-driven/references/cards/orchestrator.md`, `docs/dev/template-changelog.md` | tier **sonnet**; no file in common with the api vertical |
| 4 | C8 — catalog entries | T23 → T24 → T25 → T26 → T27 | `catalog/notification/**`, `catalog/identity/single-tenant/**`, `catalog/attachment/**`, `catalog/audit/**`, `catalog/tag/**`, `docs/advisories/ADV-20260821-01.md`, `docs/advisories/ADV-20260821-02.md`, `docs/advisories/ADV-20260821-03.md`, `docs/advisories/ADV-20260821-04.md`, `docs/advisories/ADV-20260821-05.md` | `gate: scoped` (`catalog:lint`, `catalog:typecheck`); tier **sonnet**; topological order is a dependency, one worker |
| 5 | C9 — jest toolchain removal (exclusive) | T28 | `apps/api/package.json` (devDeps), `apps/web/package.json` (devDeps), `pnpm-lock.yaml` | `Exclusive: yes` — lockfile; `gate: full-unit`; tier **sonnet** |
| 6 | C10 — floor calibration | T29 | `vitest.coverage.mts`, `docs/dev/template-changelog.md` | needs the final tree (every dep removed, every entry migrated); `gate: scoped`; tier **sonnet**; single task by nature (calibrate once) |

```
Wave 0: [C0: T1]                                    (orchestrator pre-flight)
Wave 1: [C1: T2]                                    (exclusive — lockfile)
Wave 2: [C2: T3→T4→T5] ∥ [C3: T6→T7→T8] ∥ [C4: T9→T10→T11] ∥ [C5: T12→T13]
Wave 3: [C6: T14→T15→T16→T17→T18→T19] ∥ [C7: T20→T21→T22]
Wave 4: [C8: T23→T24→T25→T26→T27]
Wave 5: [C9: T28]                                   (exclusive — lockfile)
Wave 6: [C10: T29]                                  (calibration on the final tree)
Verifier → T30 closeout (orchestrator)
```

---

## Tasks

### T1: Pre-flight and baseline

**What**: assert the worktree preconditions and record the pre-feature counts the Verifier compares against.
**Where**: this file (§ Pre-feature baseline)
**Touches**: none
**Depends on**: None
**Exclusive**: no
**Requirement**: —

**Done when**:

- [ ] `git ls-files --error-unmatch scripts/platform/catalog-stage.mjs` exits 0 in the worktree (the `catalog-typecheck` pre-push step must exist on the branch)
- [ ] `docker info` succeeds; `git status --short` is clean; `pnpm install --frozen-lockfile` exits 0
- [ ] Runner records: api unit files/tests (`pnpm --filter api test`), web tests (`pnpm --filter web test`), `pnpm test:scripts` tests — written into § Pre-feature baseline
- [ ] Any failure stops Execute before wave 1

**Tests**: none · **Gate**: none (runner, read-only)
**Commit**: none

### T2: Add the Vitest toolchain to the manifests

**What**: declare every new dependency once, regenerate the lockfile once; Jest stays until T28.
**Where**: `package.json`, `apps/api/package.json`, `apps/web/package.json`, `packages/eslint-config/package.json`, `pnpm-lock.yaml`
**Touches**: `package.json`, `apps/api/package.json`, `apps/web/package.json`, `packages/eslint-config/package.json`, `pnpm-lock.yaml`
**Depends on**: T1
**Exclusive**: yes
**Requirement**: RUN-01, LNT-01 (prerequisite)

**Done when**:

- [ ] root devDependencies gain `vitest ^4.1.10`, `@vitest/coverage-v8 ^4.1.10`; `apps/api` gains `vitest ^4.1.10`, `unplugin-swc ^1.5.11`; `apps/web` bumps `vitest` and `@vitest/coverage-v8` to `^4.1.10`; `packages/eslint-config` gains `@vitest/eslint-plugin ^1.6`, `eslint-plugin-testing-library ^7.16` (same lines as `~/Developer/ailapidus`)
- [ ] `pnpm install` run once; `pnpm install --frozen-lockfile` exits 0; `pnpm exec vitest --version` prints 4.1.x
- [ ] nothing removed, no other manifest field touched

**Tests**: none · **Gate**: quick (`pnpm install --frozen-lockfile`)
**Commit**: `build(deps): vitest 4 toolchain alongside jest`

### T3: Codemod CLI and the `jest.*` call rules

**What**: `scripts/platform/jest-to-vitest.mjs` on the TypeScript compiler API — walker, edit application, rules 1–3 of design § Components 6.
**Where**: `scripts/platform/jest-to-vitest.mjs`, `scripts/platform/__tests__/jest-to-vitest.test.mjs`
**Touches**: `scripts/platform/jest-to-vitest.mjs`, `scripts/platform/__tests__/jest-to-vitest.test.mjs`
**Depends on**: None
**Exclusive**: no
**Requirement**: CAT-01

**Done when**:

- [ ] `node scripts/platform/jest-to-vitest.mjs <path…> [--check] [--quiet]` walks `*.{spec,int-spec,e2e-spec,test}.{ts,tsx}` under each path (parity specs match `*.spec.ts`), parses with `typescript` from the workspace, collects `Edit{start,end,text}` and applies them highest-start-first, writes in place
- [ ] rule 1: `jest.<m>(` → `vi.<m>(` for `fn, spyOn, mock, unmock, doMock, mocked, restoreAllMocks, resetAllMocks, clearAllMocks, useFakeTimers, useRealTimers, advanceTimersByTime, advanceTimersByTimeAsync, runAllTimers, runOnlyPendingTimers, setSystemTime, getRealSystemTime, isMockFunction, resetModules`; any other `jest.<x>` is reported, never rewritten
- [ ] rule 2: `jest.requireActual(x)` → `await vi.importActual(x)` and the enclosing function/factory becomes `async`; `jest.requireMock(x)` → `await vi.importMock(x)` likewise; a site with no enclosing function is reported under "manual review" and left untouched
- [ ] rule 3: `jest.setTimeout(n)` → `vi.setConfig({ testTimeout: n })`
- [ ] one `node:test` fixture per rule (input string → expected output string), plus the "reported, not rewritten" case

**Tests**: node:test · **Gate**: quick
**Commit**: `feat(scripts): jest-to-vitest codemod — cli and the jest.* call rules`

### T4: Codemod type, hoisting and import rules

**What**: rules 4–6 — type references, `vi.hoisted` for factories closing over file-level bindings, the single `vitest` import.
**Where**: `scripts/platform/jest-to-vitest.mjs`, `scripts/platform/__tests__/jest-to-vitest.test.mjs`
**Touches**: `scripts/platform/jest-to-vitest.mjs`, `scripts/platform/__tests__/jest-to-vitest.test.mjs`
**Depends on**: T3
**Exclusive**: no
**Requirement**: CAT-01

**Done when**:

- [ ] rule 4: `jest.Mock` / `jest.Mocked` / `jest.MockedFunction` / `jest.MockedClass` / `jest.SpyInstance` → `Mock` / `Mocked` / `MockedFunction` / `MockedClass` / `MockInstance`, added to the `vitest` import as types
- [ ] rule 5: a `jest.mock(path, factory)` whose factory references a file-level `const`/`let` has that declaration wrapped in `const { name } = vi.hoisted(() => { …; return { name } })` — fixture reproduces the shape of `apps/api/src/shared/kernel/tracing/traced.decorator.spec.ts:20`
- [ ] rule 6: the free test globals the file uses (`describe, it, test, expect, beforeAll, beforeEach, afterAll, afterEach, vi`) plus rule-4 types are merged into one `import { … } from "vitest"` placed after the last import; an existing `vitest` import is merged, never duplicated; names not used are never imported
- [ ] `it.each` / `describe.each` tables pass through unchanged (fixture)

**Tests**: node:test · **Gate**: quick
**Commit**: `feat(scripts): jest-to-vitest codemod — types, vi.hoisted and the vitest import`

### T5: Codemod idempotency, `--check` and the report

**What**: the second run is a no-op; `--check` is the gate children and CI can call.
**Where**: `scripts/platform/jest-to-vitest.mjs`, `scripts/platform/__tests__/jest-to-vitest.test.mjs`
**Touches**: `scripts/platform/jest-to-vitest.mjs`, `scripts/platform/__tests__/jest-to-vitest.test.mjs`
**Depends on**: T4
**Exclusive**: no
**Requirement**: CAT-01

**Done when**:

- [ ] running the codemod twice over a fixture tree yields zero edits on the second run (byte-identical files)
- [ ] `--check` writes nothing, exits 1 when any file would change or carries a manual-review site (prints `file:line` per site), exits 0 otherwise; `--quiet` keeps only the summary
- [ ] summary lists files rewritten / unchanged / manual review; a file with no test globals and no `jest.` is left byte-identical (no import added)
- [ ] usage header at the top of the script names the child command from spec P1-catalog AC6

**Tests**: node:test · **Gate**: quick
**Commit**: `feat(scripts): jest-to-vitest codemod — idempotent runs and --check`

### T6: `@workspace/eslint-config/vitest` and its tests

**What**: the shared rule set for api (`vitestNodeConfig`) and web (`vitestConfig`).
**Where**: `packages/eslint-config/vitest.js`, `packages/eslint-config/vitest.test.js`, `packages/eslint-config/package.json`
**Touches**: `packages/eslint-config/vitest.js`, `packages/eslint-config/vitest.test.js`, `packages/eslint-config/package.json`
**Depends on**: T2
**Exclusive**: no
**Requirement**: LNT-01, LNT-02

**Done when**:

- [ ] `vitest.js` exports `vitestNodeConfig` and `vitestConfig`; both apply `@vitest/eslint-plugin` `recommended` plus, as `error`: `no-focused-tests`, `no-disabled-tests`, `no-standalone-expect`, `expect-expect` (`assertFunctionNames: ["expect", "expect*", "**.expect"]`), `no-conditional-expect`, `no-conditional-in-test`, `no-identical-title`, `prefer-to-be`, `prefer-to-have-length`, `valid-expect`, `consistent-test-it` (`it`), `require-top-level-describe`, `max-nested-callbacks` 4 — on `TEST_FILES = ["**/*.{spec,int-spec,e2e-spec,test}.{ts,tsx}"]`; `TEST_SUPPORT_FILES = ["**/vitest.setup.ts", "**/shared/test/**/*.{ts,tsx}", "test/**/*.ts"]` get `recommended` only
- [ ] `vitestConfig` adds `testing-library/flat/react` and, as `error`, `prefer-user-event`, `no-manual-cleanup`, `prefer-explicit-assert`, `prefer-presence-queries`
- [ ] `package.json` exports gain `"./vitest"`; the `test` script also runs `vitest.test.js`
- [ ] `vitest.test.js` (node:test + eslint `Linter`): LNT-01 — each rule id above reports at `error` for `x.spec.ts` under `vitestNodeConfig` and for `x.test.tsx` under `vitestConfig`; LNT-02 — `it.only(…)` errors, an `it` without `expect` errors, an `it` with `expect` passes

**Tests**: node:test · **Gate**: quick (`pnpm --filter @workspace/eslint-config test`)
**Commit**: `feat(eslint-config): vitest and testing-library rule sets`

### T7: Drop the Jest globals and ignores from the shared configs

**What**: the shared configs stop describing a Jest world.
**Where**: `packages/eslint-config/nest.js:11`, `packages/eslint-config/base.js:22`
**Touches**: `packages/eslint-config/nest.js`, `packages/eslint-config/base.js`
**Depends on**: T6
**Exclusive**: no
**Requirement**: LNT-03

**Done when**:

- [ ] `nest.js` `globals` = `globals.node` only
- [ ] `base.js` ignore list: `**/jest.config.*` replaced by `**/vitest.*.mts` (root and api config files are not linted, as in ailapidus)
- [ ] `pnpm --filter @workspace/eslint-config test` and `pnpm --filter api lint` still pass (api specs are not yet on the vitest rules — that is T19)

**Tests**: node:test (existing) · **Gate**: quick
**Commit**: `chore(eslint-config): no jest globals, ignore vitest configs`

### T8: Web lint on the Vitest rule set

**What**: `apps/web` adopts `vitestConfig`; existing violations fixed at the source.
**Where**: `apps/web/eslint.config.js`, `apps/web/src/**/*.test.{ts,tsx}`, `apps/web/test/setup.ts`
**Touches**: `apps/web/eslint.config.js`, `apps/web/src/**/*.test.{ts,tsx}`, `apps/web/test/setup.ts`
**Depends on**: T6
**Exclusive**: no
**Requirement**: LNT-01, LNT-03

**Done when**:

- [ ] `apps/web/eslint.config.js` spreads `vitestConfig` from `@workspace/eslint-config/vitest` after `fsdConfig`
- [ ] every violation in the existing web tests fixed in the test (no `eslint-disable`, no rule downgrade); assertions keep their meaning
- [ ] `pnpm --filter web lint` exits 0; `pnpm --filter web test` passes with the T1 web test count

**Tests**: existing web tests · **Gate**: quick (`pnpm --filter web lint && pnpm --filter web test`)
**Commit**: `refactor(web): tests lint clean under the vitest rule set`

### T9: `module add` post-install commands target the Vitest projects

**What**: the command `module add` runs after installing an entry.
**Where**: `scripts/platform/lib/commands/add.mjs:216,226` and the `__tests__` file asserting those commands
**Touches**: `scripts/platform/lib/commands/add.mjs`, `scripts/platform/__tests__/add-web-test-script.test.mjs`, `scripts/platform/__tests__/cli.test.mjs`, `scripts/platform/__tests__/apply.test.mjs`
**Depends on**: None
**Exclusive**: no
**Requirement**: CAT-04

**Done when**:

- [ ] api: `pnpm vitest run --project api apps/api/src/modules/<name>` (run at the child root); web: `pnpm vitest run --project web <webRootFor(name)>` (`apps/web/src/entities/<name>` by default, from `child-layout.mjs`)
- [ ] any printed "next step" names the same commands; the test that asserted `--filter api test` now asserts the vitest command (locate it with `rg -n 'filter.*api.*test|modules/\$\{name\}' scripts/platform/__tests__`; it is one of the three files listed, or report `blocked-by-ownership`)
- [ ] `pnpm test:scripts` green

**Tests**: node:test · **Gate**: quick (`pnpm test:scripts`)
**Commit**: `feat(scripts): module add runs the entry specs through vitest projects`

### T10: `catalog:check` gates become `check → test → test:db`

**What**: the rendered child proves the DB tiers too (spec P1-catalog AC3).
**Where**: `scripts/platform/lib/child.mjs:70-76`, `scripts/platform/catalog-check.mjs:205`, `scripts/platform/__tests__/catalog-check.test.mjs`
**Touches**: `scripts/platform/lib/child.mjs`, `scripts/platform/catalog-check.mjs`, `scripts/platform/__tests__/catalog-check.test.mjs`
**Depends on**: None
**Exclusive**: no
**Requirement**: CAT-03

**Done when**:

- [ ] `runGates` runs `pnpm check`, `pnpm test`, `pnpm test:db` in that order and stops at the first failure; the `catalog-check.mjs` log line names the three
- [ ] without Docker the third step fails with the Docker-runtime message from `global-setup` (no hang) — documented in the script header
- [ ] tests assert the new sequence; `pnpm test:scripts` green

**Tests**: node:test · **Gate**: quick (`pnpm test:scripts`)
**Commit**: `feat(scripts): catalog:check runs the DB tiers in the rendered child`

### T11: Template smoke, fixtures and the tooling allow-lists name Vitest

**What**: every remaining `jest` string in the platform tooling.
**Where**: `scripts/template-smoke.mjs:48,249,293`, `scripts/platform/__tests__/template-smoke.test.mjs:285,308`, `scripts/platform/__tests__/fixtures/child/apps/api/package.json:7`, `.claude/hooks/delegate-to-subagent.mjs:81`, `scripts/token-report.mjs:38`
**Touches**: `scripts/template-smoke.mjs`, `scripts/platform/__tests__/template-smoke.test.mjs`, `scripts/platform/__tests__/fixtures/child/apps/api/package.json`, `.claude/hooks/delegate-to-subagent.mjs`, `scripts/token-report.mjs`
**Depends on**: None
**Exclusive**: no
**Requirement**: CAT-04

**Done when**:

- [ ] smoke check runs `pnpm vitest run --project api apps/api/src/modules/module-boundaries.spec.ts` at the child root; the mocked command map in the test uses the same string; log lines name `pnpm check && pnpm test`
- [ ] fixture child manifest carries no `test` script (`child-manifest.test.mjs` still green)
- [ ] `RUN_CMDS` drops `jest`; the `token-report` category regex drops `jest`
- [ ] `rg -n 'jest' scripts .claude/hooks --glob '!**/jest-to-vitest*'` → no output; `pnpm test:scripts` green

**Tests**: node:test · **Gate**: quick (`pnpm test:scripts`)
**Commit**: `chore(scripts): smoke and tooling speak vitest`

### T12: Root test scripts, Turbo and the web manifest

**What**: the six root scripts of AD-028; Turbo and the web app stop owning tests.
**Where**: `package.json` (scripts), `turbo.json:37-49`, `apps/web/package.json:14-16`, `scripts/platform/__tests__/gates.test.mjs`
**Touches**: `package.json`, `turbo.json`, `apps/web/package.json`, `scripts/platform/__tests__/gates.test.mjs`
**Depends on**: None
**Exclusive**: no
**Requirement**: GAT-03, GAT-07

**Done when**:

- [ ] root scripts: `test: vitest run`, `test:watch: vitest`, `test:coverage: vitest run --config vitest.coverage.mts --coverage`, `test:int: vitest run --config vitest.integration.mts --project api-int`, `test:e2e: vitest run --config vitest.integration.mts --project api-e2e`, `test:db: vitest run --config vitest.integration.mts`; `test:scripts`, `check`, everything else unchanged
- [ ] `turbo.json` has no `test`, `test:cov`, `test:int`, `test:e2e` task
- [ ] `apps/web/package.json` has no `test`, `test:watch`, `test:cov` script (dependencies untouched)
- [ ] `gates.test.mjs` (new, node:test) asserts GAT-03 (the six scripts, exact commands) and GAT-07 for `turbo.json` and `apps/web/package.json` (the `apps/api` half is added when its scripts go, in the api vertical)

**Tests**: node:test · **Gate**: quick (`node --test scripts/platform/__tests__/gates.test.mjs`)
**Commit**: `feat(root): vitest scripts replace the turbo test tasks`

### T13: Pre-push hook and CI on the new gates

**What**: AD-027's gate wired into lefthook and the workflows.
**Where**: `lefthook.yml`, `.github/workflows/ci.yml:31-61`, `.github/workflows/catalog.yml:23-33`, `scripts/platform/__tests__/gates.test.mjs`
**Touches**: `lefthook.yml`, `.github/workflows/ci.yml`, `.github/workflows/catalog.yml`, `scripts/platform/__tests__/gates.test.mjs`
**Depends on**: T12
**Exclusive**: no
**Requirement**: GAT-05, GAT-06

**Done when**:

- [ ] `lefthook.yml` pre-push (`piped: true`): `migrations` → `typecheck` → `test-coverage: pnpm test:coverage`; `test-api` and `test-web` gone; `lefthook-local.yml` untouched (keeps `catalog-typecheck`, see Deviations 2)
- [ ] `ci.yml`: `test-unit` runs `pnpm install --frozen-lockfile` then `pnpm test`; `test-coverage` runs `pnpm test:coverage`; both keep `needs: quality`; `catalog.yml` `gates` keeps `pnpm check`, `pnpm test`, `pnpm test:scripts`
- [ ] `gates.test.mjs` asserts GAT-05 (hook commands and order, absence of `test-api`/`test-web`, `lefthook-local.yml` carrying `catalog-typecheck`) and GAT-06 (the CI `run` lines)

**Tests**: node:test · **Gate**: quick (`node --test scripts/platform/__tests__/gates.test.mjs`)
**Commit**: `ci: pre-push and workflows gate on pnpm test and test:coverage`

### T14: Run the codemod over `apps/api` and hand-fix the outliers

**What**: the kernel's specs import from `vitest`; the one top-level `requireMock` and the one production comment are fixed by hand.
**Where**: `apps/api/src/**/*.spec.ts`, `apps/api/src/**/*.int-spec.ts`, `apps/api/test/**/*.e2e-spec.ts`, `apps/api/src/shared/kernel/tracing/tracing.setup.spec.ts:7`, `apps/api/src/shared/kernel/transactional/transaction-manager.ts:1`
**Touches**: `apps/api/src/**/*.spec.ts`, `apps/api/src/**/*.int-spec.ts`, `apps/api/test/**/*.e2e-spec.ts`, `apps/api/src/shared/kernel/transactional/transaction-manager.ts`
**Depends on**: T5
**Exclusive**: no
**Requirement**: CAT-02, RUN-05

**Done when**:

- [ ] `node scripts/platform/jest-to-vitest.mjs apps/api/src apps/api/test` run once (12 files with `jest.` sites, every spec gains its `vitest` import)
- [ ] `tracing.setup.spec.ts:7` rewritten by hand to `const { env } = await vi.importMock<typeof import("../../config/env")>("../../config/env")` (top-level await is fine: specs compile as ESM under unplugin-swc); `transaction-manager.ts:1` comment reworded without `jest`
- [ ] `node scripts/platform/jest-to-vitest.mjs --check apps/api/src apps/api/test` exits 0; `rg -c 'jest\.' apps/api/src apps/api/test` → no output
- [ ] `pnpm --filter api typecheck` exits 0 (jest types still declared; `vitest` resolves from T2)

**Tests**: none new · **Gate**: quick (`--check` + typecheck; the runner lands next)
**Commit**: `refactor(api): specs import from vitest (codemod)`

### T15: The api unit project and the root `projects` config

**What**: `pnpm vitest run --project api` replaces `jest`; the root config lists api + web.
**Where**: `apps/api/vitest.shared.mts`, `apps/api/vitest.config.mts`, `apps/api/test/setup/unit-env.ts`, `apps/api/tsconfig.json:6,11`, `apps/api/tsconfig.build.json:7`, `vitest.config.mts`, `apps/web/vitest.config.ts`
**Touches**: `apps/api/vitest.shared.mts`, `apps/api/vitest.config.mts`, `apps/api/test/setup/unit-env.ts`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `vitest.config.mts`, `apps/web/vitest.config.ts`
**Depends on**: T14
**Exclusive**: no
**Requirement**: RUN-01, RUN-05, GAT-01

**Done when**:

- [ ] `vitest.shared.mts` exports `swcPlugin()` (`unplugin-swc`, `swcrc: false`, the `.swcrc` options inline with `module.type: "es6"`, `jsc.target es2023`, decorators + `decoratorMetadata`, `keepClassNames`), `apiDefaults` (`environment: "node"`, `globals: false`) and `dbTierDefaults` (`testTimeout`/`hookTimeout` 120_000)
- [ ] `vitest.config.mts` project `api`: `include: ["src/**/*.spec.ts"]`, `exclude: ["**/if-else.sample.uncovered.spec.ts", ".catalog-stage/**", "**/node_modules/**"]`, `setupFiles: ["./test/setup/unit-env.ts"]`, `maxWorkers: 4`; `unit-env.ts` starts with `import "reflect-metadata"`
- [ ] `tsconfig.json` `types: ["node", "multer"]`, `include` gains `"*.mts"`; `tsconfig.build.json` `exclude` gains `"*.mts"`
- [ ] root `vitest.config.mts`: `projects: ["apps/api/vitest.config.mts", "apps/web/vitest.config.ts"]`, no `globalSetup`, no `coverage`; `apps/web/vitest.config.ts` gains `name: "web"` and loses its `coverage` block, nothing else changes
- [ ] `pnpm vitest run --project api` green: every file of the T1 api unit baseline runs and passes (52 files; `coverage-metric.contract.spec.ts` included); `pnpm vitest run --project web` green with the T1 web count; `pnpm --filter api typecheck` exits 0; `DOCKER_HOST=unix:///nonexistent pnpm vitest run` exits 0 (no container)

**Tests**: existing api/web suites · **Gate**: quick (`pnpm vitest run --project api && pnpm vitest run --project web && pnpm --filter api typecheck`)
**Commit**: `feat(api): unit tier on vitest — shared swc plugin, api project, root projects`

### T16: The integration tier — `globalSetup` port, worker DBs, `provide`/`inject`

**What**: one Postgres + Redis start for the run; URIs reach workers only through `inject`.
**Where**: `apps/api/test/setup/global-setup.ts`, `apps/api/test/setup/container-uris.ts`, `apps/api/test/setup/test-db.ts:14-20`, `apps/api/vitest.int.config.mts`, `vitest.integration.mts`, `apps/api/test/setup/test-db.int-spec.ts`; deletes `apps/api/test/setup/global-teardown.ts`, `apps/api/test/setup/global.d.ts`, `apps/api/test/jest-integration.json`
**Touches**: `apps/api/test/setup/global-setup.ts`, `apps/api/test/setup/container-uris.ts`, `apps/api/test/setup/test-db.ts`, `apps/api/vitest.int.config.mts`, `vitest.integration.mts`, `apps/api/test/setup/test-db.int-spec.ts`, `apps/api/test/setup/global-teardown.ts`, `apps/api/test/setup/global.d.ts`, `apps/api/test/jest-integration.json`
**Depends on**: T15
**Exclusive**: no
**Requirement**: RUN-02

**Done when**:

- [ ] `global-setup.ts`: `export default async function setup(project)` returning the teardown; always starts Postgres and Redis, applies the real migrations, clones `test_w1..test_wN` with `N = Math.max(1, root.maxWorkers, ...projects.map(p => p.config.maxWorkers ?? 0))` (fallback `os.availableParallelism()`), calls `project.provide("postgresUri", …)` and `project.provide("redisUri", …)`, declares `ProvidedContext { postgresUri: string; redisUri: string }`; Docker-runtime detection and its message kept
- [ ] `container-uris.ts`: `containerPostgresUri()` / `containerRedisUri()` read `inject(...)`; `POSTGRES_URI_ENV` / `REDIS_URI_ENV` gone — no env var, no file carries a URI; `test-db.ts` uses `process.env.VITEST_POOL_ID ?? "1"`
- [ ] `vitest.int.config.mts` project `api-int`: `include: ["src/**/*.int-spec.ts", "test/**/*.int-spec.ts"]`, `setupFiles: ["./test/setup/int-env.ts"]`, `maxWorkers: 4`, `dbTierDefaults`; root `vitest.integration.mts`: `projects: ["apps/api/vitest.int.config.mts"]` (the e2e path is appended by the next task), `globalSetup: ["apps/api/test/setup/global-setup.ts"]`
- [ ] `test-db.int-spec.ts` (RUN-02): `current_database()` equals `test_w${process.env.VITEST_POOL_ID}` and the pool's host/port match `inject("postgresUri")`
- [ ] `global-teardown.ts`, `global.d.ts`, `jest-integration.json` deleted; `pnpm vitest run --config vitest.integration.mts --project api-int` green (9 files)

**Tests**: int proof spec + existing int specs · **Gate**: full (the int tier once, Docker)
**Commit**: `feat(api): integration tier on vitest — globalSetup with provide/inject and worker dbs`

### T17: The e2e tier, native scalar and the proof specs

**What**: serial forks, the scalar stub gone, the env-lock proof.
**Where**: `apps/api/vitest.e2e.config.mts`, `vitest.integration.mts`, `apps/api/test/setup/e2e-after-env.ts`, `apps/api/test/openapi-contract.e2e-spec.ts:9`, `apps/api/test/__snapshots__/openapi-contract.e2e-spec.ts.snap`, `apps/api/test/runner-env.e2e-spec.ts`, `apps/api/src/openapi/docs-reference.spec.ts`; deletes `apps/api/test/setup/scalar-stub.ts`, `apps/api/test/jest-e2e.json`
**Touches**: `apps/api/vitest.e2e.config.mts`, `vitest.integration.mts`, `apps/api/test/setup/e2e-after-env.ts`, `apps/api/test/openapi-contract.e2e-spec.ts`, `apps/api/test/__snapshots__/openapi-contract.e2e-spec.ts.snap`, `apps/api/test/runner-env.e2e-spec.ts`, `apps/api/src/openapi/docs-reference.spec.ts`, `apps/api/test/setup/scalar-stub.ts`, `apps/api/test/jest-e2e.json`
**Depends on**: T16
**Exclusive**: no
**Requirement**: RUN-03, RUN-04

**Done when**:

- [ ] `vitest.e2e.config.mts` project `api-e2e`: `include: ["test/**/*.e2e-spec.ts", "src/**/*.e2e-spec.ts"]`, `setupFiles: ["./test/setup/e2e-env.ts", "./test/setup/e2e-after-env.ts"]`, `fileParallelism: false`, `maxWorkers: 1`, default `isolate` and `pool: "forks"`, `dbTierDefaults`; root `vitest.integration.mts` `projects` gains it
- [ ] `e2e-after-env.ts` imports `afterAll, afterEach, beforeAll` from `vitest`; `scalar-stub.ts` and `jest-e2e.json` deleted, the comment at `openapi-contract.e2e-spec.ts:9` gone; `@scalar/nestjs-api-reference` loads natively (`server.deps.inline` only if the native load fails — record which in the summary)
- [ ] snapshot header rewritten by Vitest (one `-u` run; the diff is the header line only)
- [ ] `runner-env.e2e-spec.ts` (RUN-03): `MAIL_TRANSPORT === "log"`, `RESEND_API_KEY` and `MAIL_FROM` undefined, the R2 dummies set, Redis `DBSIZE` 0 at test start; `docs-reference.spec.ts` (RUN-04): imports the real package and asserts the export the docs module uses
- [ ] `pnpm vitest run --config vitest.integration.mts --project api-e2e` green (4 files, no `--max-old-space-size`); `pnpm vitest run --project api src/openapi/docs-reference.spec.ts` green

**Tests**: e2e + unit proof specs · **Gate**: full (the e2e tier once, Docker)
**Commit**: `feat(api): e2e tier on vitest — serial forks, native scalar, env-lock proofs`

### T18: The combined coverage config

**What**: `vitest.coverage.mts` — four projects, one v8 report, per-glob floors (api floors left for calibration).
**Where**: `vitest.coverage.mts`
**Touches**: `vitest.coverage.mts`
**Depends on**: T17
**Exclusive**: no
**Requirement**: GAT-02

**Done when**:

- [ ] `projects`: the four config files; `globalSetup: ["apps/api/test/setup/global-setup.ts"]`; `coverage`: `provider: "v8"`, `reporter: ["text", "json-summary", "html", "lcov"]`, `reportsDirectory: "coverage"`, `include: ["apps/api/src/**/*.ts", "apps/web/src/**/*.{ts,tsx}"]`, `exclude: ["**/*.spec.ts", "**/*.int-spec.ts", "**/*.e2e-spec.ts", "**/*.test.{ts,tsx}", "**/*.d.ts", "**/*.fixture.ts", "apps/api/src/main.ts", "apps/api/src/db/**", "apps/web/src/main.tsx", "**/shared/test/**", "apps/api/test/**"]`
- [ ] `thresholds: { "apps/web/src/**": { statements: 64, branches: 56, functions: 61, lines: 64 } }` plus the comment `// "apps/api/src/**": calibrated once at the migration (AD-027)` where the api entry goes
- [ ] `pnpm vitest run --config vitest.coverage.mts --coverage` exits 0 and prints the api and web rows; the api statements/branches/functions/lines measured in this run are in the compact summary

**Tests**: none · **Gate**: full (`pnpm vitest run --config vitest.coverage.mts --coverage`, Docker)
**Commit**: `feat(root): vitest.coverage.mts — one process, v8 merged, per-glob floors`

### T19: Api manifest cleanup and lint on the Vitest rule set

**What**: the Jest scripts, config and coverage scripts go; the api lints under `vitestNodeConfig`.
**Where**: `apps/api/package.json:25-31,106-150`, `apps/api/scripts/coverage-all.sh`, `apps/api/test/tools/normalize-coverage.ts`, `apps/api/eslint.config.mjs`, api specs, `scripts/platform/__tests__/gates.test.mjs`
**Touches**: `apps/api/package.json`, `apps/api/scripts/coverage-all.sh`, `apps/api/test/tools/normalize-coverage.ts`, `apps/api/eslint.config.mjs`, `apps/api/src/**/*.spec.ts`, `apps/api/src/**/*.int-spec.ts`, `apps/api/test/**/*.ts`, `scripts/platform/__tests__/gates.test.mjs`
**Depends on**: T18, T7
**Exclusive**: no
**Requirement**: GAT-04, GAT-07, LNT-03, DOC-02

**Done when**:

- [ ] `apps/api/package.json`: `test`, `test:watch`, `test:cov`, `test:cov:all`, `test:int`, `test:e2e`, `test:all` scripts and the `jest` block removed; devDependencies untouched (T28 owns them)
- [ ] `coverage-all.sh` and `normalize-coverage.ts` deleted
- [ ] `eslint.config.mjs` spreads `vitestNodeConfig` (turn `import-x/no-default-export` off for `*.mts` only if the rule fires); every violation fixed at the source, none suppressed
- [ ] `rg -in 'jest' apps/api --glob '!package.json' --glob '!node_modules'` → no output
- [ ] `gates.test.mjs` gains the `apps/api/package.json` half of GAT-07
- [ ] `pnpm --filter api lint`, `pnpm --filter api typecheck`, `pnpm vitest run --project api`, `node --test scripts/platform/__tests__/gates.test.mjs` green

**Tests**: existing + gates.test.mjs · **Gate**: quick
**Commit**: `refactor(api): jest scripts and coverage-all gone, specs lint clean`

### T20: `docs/test/testing.md` describes the Vitest setup

**What**: the handbook rewritten in the ailapidus structure with the kernel specifics (pt-BR).
**Where**: `docs/test/testing.md`
**Touches**: `docs/test/testing.md`
**Depends on**: None
**Exclusive**: no
**Requirement**: DOC-01

**Done when**:

- [ ] sections in this order: Comandos · Layout · O harness da api · As três camadas da api · O que a configuração substitui · Convenções · Lint · Gate de pre-push · Exclusões de cobertura (tabela) · Performance — mirroring `~/Developer/ailapidus/docs/testing.md`
- [ ] kernel specifics kept and correct: worker DBs `test_w${VITEST_POOL_ID}` cloned by `globalSetup`, Redis container, mail/R2 locks in e2e, Docker-runtime detection, URIs by `provide`/`inject`, `pnpm test` Docker-free vs `pnpm test:coverage` with Docker, `pnpm vitest run --project api|web <path>`, parity specs in the child, the template-only command block (`test:scripts`, `catalog:*`) from `0fc3dca`, AD-027 floor rule (calibrated once, never lowered)
- [ ] no Jest-era section: `--runInBand`, `workerIdleMemoryLimit`, `scalar-stub`, nyc, `jest-*.json`; `rg -in 'jest' docs/test/testing.md` hits only `@testing-library/jest-dom`

**Tests**: none · **Gate**: probe (`rg`)
**Commit**: `docs(test): testing.md describes the vitest setup`

### T21: Handbooks and agent cards name Vitest

**What**: every other doc and card that still says jest.
**Where**: `docs/back/back-arch.md:49,612`, `docs/catalog/catalog.md:21`, `docs/agents/harness.md:21,147,186`, `AGENTS.md.jinja` (commands block), `.claude/agents/shell-runner.md:46`, `.claude/skills/tlc-spec-driven/references/cards/orchestrator.md:72`, `.agents/skills/tlc-spec-driven/references/cards/orchestrator.md`
**Touches**: `docs/back/back-arch.md`, `docs/catalog/catalog.md`, `docs/agents/harness.md`, `AGENTS.md.jinja`, `.claude/agents/shell-runner.md`, `.claude/skills/tlc-spec-driven/references/cards/orchestrator.md`, `.agents/skills/tlc-spec-driven/references/cards/orchestrator.md`
**Depends on**: T20
**Exclusive**: no
**Requirement**: DOC-02, DOC-03

**Done when**:

- [ ] each listed line names Vitest and the root commands (`rootDir do jest` → the project `include`; "jest do filho" → `pnpm vitest run --project api <path>`)
- [ ] `AGENTS.md.jinja` command block lists `pnpm test`, `pnpm test:coverage`, `pnpm test:int|test:e2e|test:db`, `pnpm vitest run --project api|web <path>`
- [ ] `.agents/skills/.../orchestrator.md` matches `.claude/skills/...` (via `pnpm skills:sync` or the same edit)
- [ ] probe: `rg -in 'jest' docs .claude/agents .claude/hooks .agents/skills/tlc-spec-driven/references/cards scripts catalog/*/README.md apps packages --glob '!docs/dev/template-changelog.md' --glob '!pnpm-lock.yaml' --glob '!**/jest-to-vitest*' --glob '!**/node_modules/**'` hits only `@testing-library/jest-dom` lines, `catalog/*/README.md` lines and `apps/api/package.json` devDependencies (those fall to the catalog and finalization waves)

**Tests**: none · **Gate**: probe (`rg`)
**Commit**: `docs: handbooks and agent cards name vitest`

### T22: Template changelog migration note

**What**: what a child does after `copier update` to this tag.
**Where**: `docs/dev/template-changelog.md` (§ Não publicado)
**Touches**: `docs/dev/template-changelog.md`
**Depends on**: None
**Exclusive**: no
**Requirement**: CAT-06

**Done when**:

- [ ] "Mudanças" gains one numbered item describing the move (one runner, root configs and scripts, `test:coverage` as the pre-push gate needing Docker, lint rules, catalog entries at 2.0.0 with `ADV-20260821-01..05`; AD-027/AD-028)
- [ ] "Passos de migração do filho" gains the steps in order: `copier update` (root `vitest*.mts`, `lefthook.yml`, `ci.yml`, eslint configs), `node scripts/platform/jest-to-vitest.mjs apps/api/src apps/api/test apps/web/src`, `pnpm lint:fix`, remove `jest`, `@swc/jest`, `@types/jest`, `nyc` from `apps/api` and `@vitest/coverage-v8` from `apps/web`, `pnpm install`, apply the advisories of installed entries (`pnpm platform module …` per `docs/catalog/catalog.md`)
- [ ] a line `pisos da api: calibrados na T29` that the calibration task replaces with the numbers
- [ ] `rg -n 'jest-to-vitest' docs/dev/template-changelog.md` hits

**Tests**: none · **Gate**: probe (`rg`)
**Commit**: `docs(dev): changelog — migration note for the vitest move`

### T23: Catalog entry `notification` on Vitest — 2.0.0 + ADV-20260821-04

**What**: first entry of the topological order (no dependencies).
**Where**: `catalog/notification/**`, `docs/advisories/ADV-20260821-04.md`
**Touches**: `catalog/notification/**`, `docs/advisories/ADV-20260821-04.md`
**Depends on**: T19, T13, T10
**Exclusive**: no
**Requirement**: CAT-02, CAT-03, CAT-05, LNT-03

**Done when**:

- [ ] `node scripts/platform/jest-to-vitest.mjs catalog/notification` run once; `--check` exits 0 afterwards; `rg -c 'jest\.' catalog/notification` → no output
- [ ] lint violations under the vitest rule set fixed at the source (seen through the child's `pnpm check`)
- [ ] `module.json.version` → `2.0.0`; `CHANGELOG.md` gains `## [2.0.0]` with a **Breaking** bullet naming the codemod; `README.md:85` names Vitest (`pnpm vitest run --project api apps/api/src/modules/notification`)
- [ ] `docs/advisories/ADV-20260821-04.md`: `id: "ADV-20260821-04"`, `kind: "breaking"`, `module: "notification"`, `affects: ">=1.0.0 <2.0.0"`, `severity: "high"`, `detect: "rg -l 'jest\\.' apps/api/src/modules/notification"`, `fix: "node scripts/platform/jest-to-vitest.mjs apps/api/src/modules/notification"`, `parity: "apps/api/src/modules/notification/__parity__/"`, body in pt-BR (context, impact, steps)
- [ ] `pnpm catalog:lint` exits 0; `pnpm catalog:check notification` exits 0 (child: `check → test → test:db`, Docker); one commit carrying the advisory (commit-msg hook)

**Tests**: rendered child · **Gate**: full (`pnpm catalog:check notification`)
**Commit**: `feat(catalog/notification)!: specs on vitest — 2.0.0 (ADV-20260821-04)`

### T24: Catalog entry `identity/single-tenant` on Vitest — 2.0.0 + ADV-20260821-03

**What**: the largest entry (608 sites, 44 files; api, web and parity dirs), depends on notification 2.0.0.
**Where**: `catalog/identity/single-tenant/**`, `docs/advisories/ADV-20260821-03.md`
**Touches**: `catalog/identity/single-tenant/**`, `docs/advisories/ADV-20260821-03.md`
**Depends on**: T23
**Exclusive**: no
**Requirement**: CAT-02, CAT-03, CAT-05, LNT-03

**Done when**:

- [ ] codemod run over `catalog/identity/single-tenant` (api, web, parity); `--check` exits 0; `rg -c 'jest\.' catalog/identity` → no output; lint violations fixed at the source
- [ ] `module.json`: `version` → `2.0.0`, `dependsOn` notification → `>=2.0.0 <3.0.0`; `CHANGELOG.md` `## [2.0.0]` Breaking bullet; `README.md:218` names Vitest (`test/jest-e2e.json` → the `api-e2e` project)
- [ ] `ADV-20260821-03.md` as in the previous task with `module: "identity/single-tenant"`, `detect`/`fix` on `apps/api/src/modules/identity` and `apps/web/src/entities/identity`, `parity: "apps/api/src/modules/identity/__parity__/"`
- [ ] `pnpm catalog:lint` exits 0; `pnpm catalog:check identity` exits 0; one commit with the advisory

**Tests**: rendered child · **Gate**: full (`pnpm catalog:check identity`)
**Commit**: `feat(catalog/identity)!: specs on vitest — 2.0.0 (ADV-20260821-03)`

### T25: Catalog entry `attachment` on Vitest — 2.0.0 + ADV-20260821-01

**What**: depends on identity 2.0.0.
**Where**: `catalog/attachment/**`, `docs/advisories/ADV-20260821-01.md`
**Touches**: `catalog/attachment/**`, `docs/advisories/ADV-20260821-01.md`
**Depends on**: T24
**Exclusive**: no
**Requirement**: CAT-02, CAT-03, CAT-05, LNT-03

**Done when**:

- [ ] codemod run over `catalog/attachment`; `--check` exits 0; `rg -c 'jest\.' catalog/attachment` → no output; lint violations fixed at the source
- [ ] `module.json`: `version` → `2.0.0`, `dependsOn` identity → `>=2.0.0 <3.0.0`; `CHANGELOG.md` `## [2.0.0]` Breaking bullet; `README.md:77` names Vitest
- [ ] `ADV-20260821-01.md` (`module: "attachment"`, paths on `apps/api/src/modules/attachment`); `pnpm catalog:lint` and `pnpm catalog:check attachment` exit 0; one commit with the advisory

**Tests**: rendered child · **Gate**: full (`pnpm catalog:check attachment`)
**Commit**: `feat(catalog/attachment)!: specs on vitest — 2.0.0 (ADV-20260821-01)`

### T26: Catalog entry `audit` on Vitest — 2.0.0 + ADV-20260821-02

**What**: depends on identity 2.0.0.
**Where**: `catalog/audit/**`, `docs/advisories/ADV-20260821-02.md`
**Touches**: `catalog/audit/**`, `docs/advisories/ADV-20260821-02.md`
**Depends on**: T24
**Exclusive**: no
**Requirement**: CAT-02, CAT-03, CAT-05, LNT-03

**Done when**:

- [ ] codemod run over `catalog/audit`; `--check` exits 0; `rg -c 'jest\.' catalog/audit` → no output; lint violations fixed at the source
- [ ] `module.json`: `version` → `2.0.0`, `dependsOn` identity → `>=2.0.0 <3.0.0`; `CHANGELOG.md` `## [2.0.0]` Breaking bullet (title stays `# Changelog`); README has no jest line — add the Vitest test command where the other READMEs have it
- [ ] `ADV-20260821-02.md` (`module: "audit"`); `pnpm catalog:lint` and `pnpm catalog:check audit` exit 0; one commit with the advisory

**Tests**: rendered child · **Gate**: full (`pnpm catalog:check audit`)
**Commit**: `feat(catalog/audit)!: specs on vitest — 2.0.0 (ADV-20260821-02)`

### T27: Catalog entry `tag` on Vitest — 2.0.0 + ADV-20260821-05

**What**: last entry; closes CAT-02 for `catalog/`.
**Where**: `catalog/tag/**`, `docs/advisories/ADV-20260821-05.md`
**Touches**: `catalog/tag/**`, `docs/advisories/ADV-20260821-05.md`
**Depends on**: T24
**Exclusive**: no
**Requirement**: CAT-02, CAT-03, CAT-05, LNT-03

**Done when**:

- [ ] codemod run over `catalog/tag`; `--check` exits 0; `rg -c 'jest\.' catalog` → no output (all five entries); lint violations fixed at the source
- [ ] `module.json`: `version` → `2.0.0`, `dependsOn` identity → `>=2.0.0 <3.0.0`; `CHANGELOG.md` `## [2.0.0]` Breaking bullet; `README.md:71` names Vitest
- [ ] `ADV-20260821-05.md` (`module: "tag"`); `pnpm catalog:lint` and `pnpm catalog:check tag` exit 0; one commit with the advisory

**Tests**: rendered child · **Gate**: full (`pnpm catalog:check tag`)
**Commit**: `feat(catalog/tag)!: specs on vitest — 2.0.0 (ADV-20260821-05)`

### T28: Remove the Jest toolchain and regenerate the lockfile

**What**: GAT-04 and GAT-01 proved on the final dependency set.
**Where**: `apps/api/package.json` (devDependencies), `apps/web/package.json` (devDependencies), `pnpm-lock.yaml`
**Touches**: `apps/api/package.json`, `apps/web/package.json`, `pnpm-lock.yaml`
**Depends on**: T27, T22, T11
**Exclusive**: yes
**Requirement**: GAT-01, GAT-04

**Done when**:

- [ ] `jest`, `@swc/jest`, `@types/jest`, `nyc` removed from `apps/api` (keep `ts-node`, `@swc/core`); `@vitest/coverage-v8` removed from `apps/web` (root owns it); `pnpm install` run once
- [ ] `pnpm install --frozen-lockfile && pnpm check` exits 0; `DOCKER_HOST=unix:///nonexistent pnpm test` exits 0; `pnpm test:scripts` green
- [ ] `rg -n '"(jest|@swc/jest|@types/jest|nyc)"' package.json apps/*/package.json packages/*/package.json` → no output

**Tests**: existing · **Gate**: full-unit (`pnpm install --frozen-lockfile && pnpm check && pnpm test && pnpm test:scripts`)
**Commit**: `build(deps): jest, @swc/jest, @types/jest and nyc removed`

### T29: Calibrate the api coverage floors once (AD-027)

**What**: measure on the migrated tree, floor = measured − 1.5 per metric, never lowered afterwards.
**Where**: `vitest.coverage.mts`, `docs/dev/template-changelog.md`
**Touches**: `vitest.coverage.mts`, `docs/dev/template-changelog.md`
**Depends on**: T28
**Exclusive**: no
**Requirement**: GAT-02

**Done when**:

- [ ] `pnpm test:coverage` run; the `apps/api/src/**` statements/branches/functions/lines from the `text` reporter recorded
- [ ] `thresholds["apps/api/src/**"]` = each measured value − 1.5, rounded down to one decimal; web floors untouched; the placeholder comment replaced
- [ ] `pnpm test:coverage` exits 0 and prints the threshold table; a deliberate `statements` floor of `measured + 5` makes it exit non-zero (tried once, reverted — proves the gate bites)
- [ ] the changelog line `pisos da api: calibrados na T29` replaced with measured values and floors; the compact summary returns both for `design.md` § Spike results

**Tests**: none · **Gate**: full (`pnpm test:coverage`, Docker)
**Commit**: `chore(coverage): api floors calibrated to the vitest measurement`

### T30: Closeout (orchestrator, after the Verifier's PASS)

**What**: decisions flipped, `test-suite-refactor` re-baselined, feature archived, branch merged.
**Where**: `.specs/STATE.md`, `.specs/features/test-suite-refactor/{spec,design,tasks}.md`, `.specs/features/vitest-migration/design.md`
**Touches**: `.specs/STATE.md`, `.specs/features/test-suite-refactor/spec.md`, `.specs/features/test-suite-refactor/design.md`, `.specs/features/test-suite-refactor/tasks.md`, `.specs/features/vitest-migration/design.md`
**Depends on**: T29
**Exclusive**: no
**Requirement**: — (spec § Success Criteria, last bullet)

**Done when**:

- [ ] AD-027 and AD-028 `active` (AD-028 wording: `api-int` include `{src,test}/**/*.int-spec.ts`); AD-012 marked superseded by AD-027
- [ ] `design.md` § Spike results carries the measured numbers and floors from T29
- [ ] `test-suite-refactor`: T5/T31/T37/T39, GA-5/GA-6, AD-023 wording, Test Coverage Matrix and Gate Check Commands re-baselined to the Vitest commands; the "blocked behind vitest-migration" note removed from its Handoff entry
- [ ] feature folder moved to `.specs/features/done/vitest-migration/`, Handoff entries to `handoff-archive.md`; `feat/vitest-migration` merged into `main` (`--no-ff`); the semver tag is the owner's call

**Tests**: none · **Gate**: none
**Commit**: `docs(specs): vitest-migration closeout — AD-027/AD-028 active, test-suite-refactor re-baselined`

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram shows | Status |
| --- | --- | --- | --- |
| T1 | None | wave 0 | ✅ |
| T2 | T1 | wave 1, after wave 0 | ✅ |
| T3, T9, T10, T11, T12 | None | wave 2 | ✅ |
| T4 → T5 | T3 → T4 | C2 order | ✅ |
| T6 | T2 | wave 2, after wave 1 | ✅ |
| T7, T8 | T6 | C3 order | ✅ |
| T13 | T12 | C5 order | ✅ |
| T14 | T5 | wave 3, after wave 2 | ✅ |
| T15 → T16 → T17 → T18 | T14 → T15 → T16 → T17 | C6 order | ✅ |
| T19 | T18, T7 | C6 last; T7 in wave 2 | ✅ |
| T20 | None | wave 3 (docs describe the designed end state) | ✅ |
| T21 | T20 | C7 order | ✅ |
| T22 | None | wave 3 | ✅ |
| T23 | T19, T13, T10 | wave 4, after wave 3 | ✅ |
| T24 | T23 | C8 order | ✅ |
| T25, T26, T27 | T24 | C8 order (serial by ownership of the identity range bump) | ✅ |
| T28 | T27, T22, T11 | wave 5, after wave 4 | ✅ |
| T29 | T28 | wave 6, after wave 5 | ✅ |
| T30 | T29 | after the Verifier | ✅ |

## Wave/Cluster Cross-Check

| Wave | Cluster | Tasks (order) | Files (union of Touches) | Deps outside earlier waves / own cluster? | Files shared with a sibling cluster? | Exclusive alone? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | C0 | T1 | none | no | — | n/a | ✅ |
| 1 | C1 | T2 | four manifests + lockfile | no (T1) | — | yes | ✅ |
| 2 | C2 | T3→T4→T5 | codemod + its test | no | no (C3 packages/web, C4 other scripts files, C5 manifests/hook/CI) | n/a | ✅ |
| 2 | C3 | T6→T7→T8 | eslint-config files, web eslint config, web tests | no (T2 in wave 1) | no | n/a | ✅ |
| 2 | C4 | T9→T10→T11 | add/child/catalog-check/smoke/token-report/hook + their tests + fixture | no | no (`gates.test.mjs` is C5's, `jest-to-vitest.test.mjs` is C2's) | n/a | ✅ |
| 2 | C5 | T12→T13 | root package.json, turbo, web package.json scripts, lefthook, workflows, gates test | no | no | n/a | ✅ |
| 3 | C6 | T14→…→T19 | `apps/api/**`, root vitest configs, web vitest config, gates test | no (T5, T7 in wave 2) | no (C7 touches docs/cards only) | n/a | ✅ |
| 3 | C7 | T20→T21→T22 | docs, AGENTS.md.jinja, cards, changelog | no | no | n/a | ✅ |
| 4 | C8 | T23→…→T27 | five entries + five advisories | no (T19, T13, T10 earlier) | — (alone) | n/a | ✅ |
| 5 | C9 | T28 | api/web devDeps, lockfile | no (T27, T22, T11 earlier) | — (alone) | yes | ✅ |
| 6 | C10 | T29 | coverage config, changelog | no (T28 in wave 5) | — (alone) | n/a | ✅ |

## Test Co-location Validation

| Task | Code layer created/modified | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T3, T4, T5 | codemod | node:test fixtures per rule, idempotency, `--check` | same file, same task | ✅ |
| T6 | eslint config | node:test + Linter (LNT-01/02) | `vitest.test.js` in task | ✅ |
| T7, T8 | shared config / web tests | existing tests keep passing, lint green | gate in task | ✅ |
| T9, T10, T11 | platform scripts | existing `__tests__` updated | named per task | ✅ |
| T12, T13 | gate shape | `gates.test.mjs` GAT-03/05/06/07 | in task | ✅ |
| T14 | api specs (codemod) | none new; `--check` + typecheck | gate in task | ✅ |
| T15 | configs | none (build gate) + existing suites | gate in task | ✅ |
| T16 | harness (int) | RUN-02 proof spec | `test-db.int-spec.ts` in task | ✅ |
| T17 | harness (e2e) + scalar | RUN-03, RUN-04 proof specs | both in task | ✅ |
| T18, T29 | coverage config | none (gate) | gate in task | ✅ |
| T19 | api manifest/lint | existing suites + gates test | gate in task | ✅ |
| T20–T22 | docs | none (probe) | probes in task | ✅ |
| T23–T27 | catalog entries | rendered child | `catalog:check <entry>` in task | ✅ |
| T28 | manifests/lockfile | none (gate) | full-unit gate in task | ✅ |
| T30 | `.specs` | none | — | ✅ |

## Requirement → tasks

RUN-01 T15 · RUN-02 T16 · RUN-03 T17 · RUN-04 T17 · RUN-05 T14, T15 · GAT-01 T15, T28 · GAT-02 T18, T29 · GAT-03 T12 · GAT-04 T19, T28 · GAT-05 T13 · GAT-06 T13 · GAT-07 T12, T19 · CAT-01 T3, T4, T5 · CAT-02 T14, T23–T27 · CAT-03 T10, T23–T27 · CAT-04 T9, T11 · CAT-05 T23–T27 · CAT-06 T22 · LNT-01 T6, T8 · LNT-02 T6 · LNT-03 T7, T8, T19, T23–T27 · DOC-01 T20 · DOC-02 T19, T21 · DOC-03 T21. **24 of 24 mapped.**

---

## Execution log

| Wave | Clusters (tier) | Result | Commits |
| --- | --- | --- | --- |
| 0 | — | pending | — |
