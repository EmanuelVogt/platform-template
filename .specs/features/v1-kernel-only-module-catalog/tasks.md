# v1 — Kernel-only template + module catalog — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

**Execute precondition:** none beyond a clean `main` (sequencing reversed 2026-08-19 — RituaaliOS#92 runs *after* v1.0.0). Worktree `.worktrees/v1-kernel-only-module-catalog`, branch `feat/v1-kernel-only-module-catalog` from local `main`.

---

**Design**: `.specs/features/v1-kernel-only-module-catalog/design.md`
**Status**: Approved — ready for Execute

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `AGENTS.md.jinja` → `docs/code-quality.md`, `docs/test/testing.md`, `apps/api/package.json` (jest `testRegex: .*\.spec\.ts$`), `apps/api/test/jest-integration.json` (`.*\.int-spec\.ts$`), `apps/api/test/jest-e2e.json` (`.*\.e2e-spec\.ts$`), `apps/web/vitest.config.ts`, `lefthook.yml` (pre-push: journal check, typecheck, api test, web test:cov), AD-012 (95% pre-push bar api unit + web).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Kernel API (`apps/api/src/shared/**`: guard, ports, context, idempotency) | unit | all branches; 1:1 to KRN ACs; fail-closed paths | `apps/api/src/shared/**/*.spec.ts` | `pnpm --filter api test -- <path>` |
| Kernel API wiring (`app.module.ts`, registries, baseline) | integration | boots on empty DB, only `_kernel` schema, health 200 | `apps/api/src/**/*.int-spec.ts`, `apps/api/test/**` | `pnpm --filter api test:int -- <path>` |
| Boundaries / schema guards | unit | RULE A + RULE C, schema completeness | `apps/api/src/modules/module-boundaries.spec.ts`, `apps/api/src/db/*.spec.ts` | `pnpm --filter api test -- <path>` |
| Module code while still in `apps/api/src/modules/**` (W2 rewiring) | unit + e2e | existing suites stay green; new seam covered (middleware sets actor, policy) | `apps/api/src/modules/**/*.spec.ts`, `*.e2e-spec.ts` | `pnpm --filter api test -- <path>`, `pnpm --filter api test:e2e -- <path>` |
| Catalog entries (`catalog/**`) | lint + parity-in-child | `catalog-lint` passes; entry suites + parity green inside the rendered child (`catalog:check`) | `catalog/<entry>/**` | `pnpm catalog:lint`, `pnpm catalog:check <entry>` (Final) |
| Web kernel (`apps/web/src/app/**`, `shared/**`) | unit | router/shell tests green without session | `apps/web/src/**/*.test.tsx` | `pnpm --filter web test -- <path>` |
| Entry web core (`catalog/*/web/core/*.test.ts`) | unit (vitest, runs in child) | `resolveAccess`/`can` all branches | `catalog/<entry>/web/core/*.test.ts` | via `catalog:check` |
| Tooling (`scripts/platform/**`, `.claude/hooks/pending-advisories.mjs`) | unit (`node --test`) | every exit code + every lib function branch; pending-advisories 1:1 to ADV-02 + edge cases | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| Docs / config / copier / lefthook | none | build gate only (`pnpm check`, smoke at Final) | — | — |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | tasks with unit tests only | `pnpm --filter api test -- <paths>` · `pnpm --filter web test -- <paths>` · `pnpm test:scripts` |
| Full | tasks with int/e2e | Quick + `pnpm --filter api test:int -- <paths>` / `test:e2e -- <paths>` (path-filtered only) |
| Build | once per wave, orchestrator via runner | `pnpm typecheck && pnpm lint` + unit tests scoped to the wave's `Touches` union; `full-unit` where the Wave Plan says |
| Final | once, Verifier | `pnpm check && pnpm test && pnpm --filter api test:int && pnpm --filter api test:e2e && pnpm test:scripts && pnpm catalog:lint && pnpm template:smoke && pnpm catalog:check` |

**Suite-cost rule (hard):** full unit suite, int/e2e suites, smoke and `catalog:check` run exactly once — at Final (plus `full-unit` Build gates where marked).

---

## Wave Plan

Waves run in order (barrier + Build gate between them). Clusters inside a wave run **in parallel**, one worker each; tasks inside a cluster run in the listed order. Exclusive waves hold one task.

| Wave | Cluster | Tasks (in order) | Files (union of Touches) | Notes |
| --- | --- | --- | --- | --- |
| 1 | C1 | T1 → T2 | `apps/api/src/shared/kernel/access/{access-policy.port.ts,decorators.ts,decorators.spec.ts,access.guard.ts,access.guard.spec.ts,access.errors.ts}`, `apps/api/src/shared/kernel/shared-kernel.module.ts` | opus (ALS/guard, AD-017) · gate: scoped |
| 1 | C2 | T3 → T4 | `apps/api/src/shared/kernel/context/{request-context.ts,request-context.spec.ts,job-context.ts,job-context.spec.ts}`, `apps/api/src/shared/kernel/idempotency/**` | opus (ALS, AD-017) |
| 1 | C3 | T5 → T10 → T11 | `package.json` (root scripts/devDeps), `pnpm-lock.yaml`, `scripts/platform/{cli.mjs,lib/**,__tests__/**}`, `catalog/schema/module.schema.json` | sonnet · T5 exclusive-ish (lockfile) → **wave 1 holds no other lockfile writer**; gate: scoped |
| 1 | C4 | T6 | `scripts/platform/lib/advisories.mjs`, `scripts/platform/__tests__/advisories.test.mjs`, `.claude/hooks/pending-advisories.mjs`, `.claude/settings.json` | sonnet |
| 1 | C5 | T7 | `docs/catalog/README-contract.md`, `docs/catalog/catalog.md`, `catalog/README.md` | sonnet (docs) |
| 1 | C6 | T16 → T30 | `apps/api/src/platform-modules.ts`, `apps/api/src/db/platform-schema.ts`, `apps/api/src/app.module.ts`, `apps/api/src/db/schema.ts`, `apps/api/src/shared/test/parity/contract-snapshot.ts` (+spec) | sonnet · gate: **full-unit** (app.module wiring) |
| 2 | C7 | T8 | `apps/api/src/modules/identity/**` (auth middleware, access-policy impl, guards, specs) | opus (auth) · depends T1,T2,T3 |
| 2 | C8 | T9 | `apps/api/src/modules/{attachment,audit,notification,tag}/**` (actor/actorId consumers + specs) | sonnet · depends T3,T4 |
| 2 | C9 | T12 | `scripts/platform/lib/migrations.mjs`, `scripts/platform/__tests__/migrations.test.mjs` | sonnet · depends T5 |
| 2 | C10 | T13 → T14 | `scripts/platform/{catalog-lint.mjs,advisory-required.mjs}`, `scripts/platform/lib/{lint,frontmatter}.mjs`, `scripts/platform/__tests__/{lint,advisory-required}.test.mjs`, `lefthook.yml`, `package.json` (scripts `catalog:lint`) | sonnet · depends T5,T6,T7 |
| 3 | C11 | T15 | `scripts/platform/cli.mjs`, `scripts/platform/lib/commands/**`, `scripts/platform/__tests__/{cli,fixtures/**}` | sonnet · depends T10,T11,T12 |
| 3 | C12 | T17 | `catalog/identity/single-tenant/**` | opus (auth parity) · depends T8,T13,T30 |
| 3 | C13 | T18 | `catalog/attachment/**` | sonnet · depends T9,T13,T30 |
| 3 | C14 | T19 | `catalog/audit/**` | sonnet · depends T9,T13,T30 |
| 3 | C15 | T20 → T21 | `catalog/notification/**`, `catalog/tag/**` | sonnet · depends T9,T13,T30 (folded: same worker, disjoint dirs) |
| 4 (exclusive) | C16 | T22 | deletions under `apps/api/src/modules/**`, `apps/api/src/shared/kernel/{access,upload,audit}/**`, `apps/web/src/{entities/session,features/login,app/router/guards.ts,shared/config/route-access.ts}`, `apps/api/drizzle/migrations/**`, `apps/api/src/modules/module-boundaries.spec.ts`, `apps/api/src/db/schema-completeness.spec.ts`, `openapi.json`, `packages/api-client/generated/**`, `apps/api/.env.example`, web router files | opus (migration + contract regen) · gate: **full-unit** + `template:smoke` precheck |
| 5 | C17 | T23 | `scripts/template-smoke.mjs`, `scripts/smoke/**` (delete) | sonnet · depends T22 |
| 5 | C18 | T24 | `scripts/platform/catalog-check.mjs`, `scripts/platform/__tests__/catalog-check.test.mjs`, `package.json` (`catalog:check`) | sonnet · depends T15,T22 |
| 5 | C19 | T25 → T26 | `docs/dev/{template.md,template-changelog.md}`, `TEMPLATE.md`, `CLAUDE.md`, `AGENTS.md.jinja`, `README.md.jinja`, `copier.yml`, `docs/back/back-arch.md`, `docs/front/front-arch.md`, `docs/test/testing.md` | sonnet (docs) · depends T22 |
| 5 | C20 | T27 | `.agents/skills/port-module-update/**`, `.agents/skills/catalog-modules/**`, `.claude/skills/*` (symlinks) | sonnet · depends T15 |
| 6 | C21 | T28 | `catalog/**/README.md` `## Follow-ups absorvidos`, `docs/dev/template-changelog.md` (issue refs) | sonnet · depends T17–T21, T25 · runs `pnpm catalog:check` once via runner (heavy) |

```
Wave 1:  [C1: T1→T2] ∥ [C2: T3→T4] ∥ [C3: T5→T10→T11] ∥ [C4: T6] ∥ [C5: T7] ∥ [C6: T16→T30]   (≤4 in flight → C5,C6 queue)
Wave 2:  [C7: T8] ∥ [C8: T9] ∥ [C9: T12] ∥ [C10: T13→T14]
Wave 3:  [C11: T15] ∥ [C12: T17] ∥ [C13: T18] ∥ [C14: T19] ∥ [C15: T20→T21]   (C15 queues)
Wave 4:  [C16: T22]  (exclusive)
Wave 5:  [C17: T23] ∥ [C18: T24] ∥ [C19: T25→T26] ∥ [C20: T27]
Wave 6:  [C21: T28]
```

---

## Task Breakdown

### T1: Access-policy port + decorators
**What**: `ACCESS_POLICY` token, `AccessRequirement`, `AccessPolicy` interface; `@RequirePermission(key: string)`, `@Public()`, `@Authenticated()` writing `ACCESS_REQUIREMENT` metadata; `PermissionKey` = `string` in kernel.
**Where/Touches**: `apps/api/src/shared/kernel/access/access-policy.port.ts`, `decorators.ts`, `decorators.spec.ts`
**Depends on**: None · **Exclusive**: no · **Reuses**: existing `decorators.ts`
**Requirement**: KRN-03
**Done when**: metadata shape per design § 2.1; identity's existing `PermissionsGuard` still compiles (reads the same metadata key); unit tests cover 3 decorators + default absent. Quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(kernel): access-policy port and access decorators`

### T2: `AccessGuard` fail-closed + errors + APP_GUARD registration
**What**: global guard delegating to `ACCESS_POLICY` (`@Optional()`); missing provider → 403 `access-policy-missing`; `public` allow; absent metadata → `authenticated`.
**Touches**: `access.guard.ts`, `access.guard.spec.ts`, `access.errors.ts`, `apps/api/src/shared/kernel/shared-kernel.module.ts`
**Depends on**: T1 · **Exclusive**: no · **Reuses**: RFC 7807 error base in `shared/kernel/errors`
**Requirement**: KRN-03
**Done when**: tests: no policy + public → 200 path; no policy + permission → 403 type `access-policy-missing`; policy false → 403; policy true → next; absent metadata → authenticated requirement. Quick gate.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(kernel): fail-closed AccessGuard over ACCESS_POLICY port`

### T3: Actor + extensions in ALS; job-context `actorId`; tenant seam
**What**: replace `RequestAccess/setAccess/setUserSession` with `setActor/getActor` (one-shot) + `setExtension/getExtension`; `job-context.userId` → `actorId`; `tenantId` propagated untouched.
**Touches**: `apps/api/src/shared/kernel/context/{request-context.ts,request-context.spec.ts,job-context.ts,job-context.spec.ts}`
**Depends on**: None · **Exclusive**: no
**Requirement**: KRN-04, KRN-07
**Done when**: tests: actor null outside request; one-shot throws on second set; extensions isolated per request; tenantId round-trips to job context. Identity/other modules may break typecheck → **this task keeps temporary re-exports `setUserSession/getUserSession` as deprecated aliases over `setActor`/extensions** so W1 stays green; aliases removed in T8/T9.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(kernel): actor and extensions in request context`

### T4: Idempotency `userId` → `actorId`
**What**: rename field/column in kernel idempotency (key builder, repository, table, tests); table rename lands in the kernel baseline (T22) — here only TS + existing migration SQL is left untouched (baseline rewrite is T22).
**Touches**: `apps/api/src/shared/kernel/idempotency/**`
**Depends on**: T3 · **Exclusive**: no
**Requirement**: KRN-04
**Done when**: kernel idempotency tests green with `actorId`; no `userId` token left under `shared/kernel/idempotency`. Quick gate.
**Tests**: unit · **Gate**: quick · **Commit**: `refactor(kernel): idempotency keys carry actorId`

### T5: `scripts/platform` skeleton + manifest schema + root scripts
**What**: `scripts/platform/cli.mjs` (arg parsing, command registry, exit-code table), `lib/manifest.mjs` (read + validate `module.json` against `catalog/schema/module.schema.json`), `lib/lock.mjs` (read/write `.platform-modules.lock`), `lib/exit-codes.mjs`; root `package.json` scripts `platform`, `test:scripts` (`node --test scripts/platform/__tests__`), devDeps `semver`, `yaml` if absent; `turbo.json` test pipeline includes `test:scripts` only if turbo root tasks are used — else `pnpm test` stays app-only and Final runs `test:scripts` explicitly.
**Touches**: `package.json`, `pnpm-lock.yaml`, `turbo.json` (if needed), `scripts/platform/cli.mjs`, `scripts/platform/lib/{manifest,lock,exit-codes}.mjs`, `scripts/platform/__tests__/{manifest,lock}.test.mjs`, `catalog/schema/module.schema.json`
**Depends on**: None · **Exclusive**: yes (lockfile) — but sole lockfile writer in wave 1, allowed in C3 by plan
**Requirement**: TLG-01, CAT-01
**Done when**: `pnpm test:scripts` runs; manifest validation rejects missing `name/version/kernelRange`, bad semver, unknown fields; lock read/write round-trips. 
**Tests**: unit (`node --test`) · **Gate**: quick · **Commit**: `feat(platform): scripts/platform skeleton, manifest schema, lock`

### T6: Advisories lib + `pending-advisories` hook
**What**: `lib/advisories.mjs`: `parseAdvisory(md)` (frontmatter schema), `computePending(lock, advisories, ledger)`; hook `.claude/hooks/pending-advisories.mjs` for `SessionStart` + first `UserPromptSubmit`; register in `.claude/settings.json`.
**Touches**: `scripts/platform/lib/advisories.mjs`, `scripts/platform/__tests__/advisories.test.mjs`, `.claude/hooks/pending-advisories.mjs`, `.claude/settings.json`
**Depends on**: None (uses `semver` from T5 — T5 installs it first in C3; if C4 starts earlier, the test imports fail → **C4 is dispatched after C3's T5 commit** — orchestrator note)
**Requirement**: ADV-01, ADV-02, ADV-03
**Done when**: tests 1:1 to ADV-02 AC + edge cases (no lock line, no dir silent, ledger filters, range mismatch excluded, invalid frontmatter → error); hook prints one line per pending id.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(advisories): pending-advisories hook and lib`

### T7: Catalog docs — README contract, catalog guide, catalog index
**What**: `docs/catalog/README-contract.md` (mandatory H2 list, pt-BR), `docs/catalog/catalog.md` (model, authoring, lint/check, advisory rule, raw-web rule), `catalog/README.md` (index placeholder table).
**Touches**: `docs/catalog/README-contract.md`, `docs/catalog/catalog.md`, `catalog/README.md`
**Depends on**: None · **Requirement**: HBK-01, CAT-05
**Done when**: headings exactly as design § 4; `catalog-lint` (T13) will read the list from this file (single source).
**Tests**: none · **Gate**: build · **Commit**: `docs(catalog): README contract and catalog guide`

### T8: Identity on the new seam (still in `apps/`)
**What**: auth middleware sets `Actor` (`kind: "user"`), permission set cached in `extensions`; `AccessPolicy` implementation bound to `ACCESS_POLICY` (logic from `PermissionsGuard`, master bypass included); `PermissionsGuard` removed; rate-limit guard untouched; drop use of deprecated aliases from T3.
**Touches**: `apps/api/src/modules/identity/**` (+ specs, e2e for guarded route)
**Depends on**: T1, T2, T3 · **Exclusive**: no
**Requirement**: KRN-03, KRN-04, CAT-04
**Done when**: identity unit + e2e suites green; e2e proves middleware-before-guard (guarded route 200 with session, 403 without permission, 401/anon path unchanged); no import of removed kernel symbols.
**Tests**: unit + e2e (path-filtered) · **Gate**: full · **Commit**: `refactor(identity): auth middleware sets actor, AccessPolicy binding`

### T9: attachment/audit/notification/tag on `actor`/`actorId`
**What**: replace `getUserSession`/`userId` reads with `getActor()`/`actorId`; drop deprecated aliases.
**Touches**: `apps/api/src/modules/{attachment,audit,notification,tag}/**`
**Depends on**: T3, T4 · **Requirement**: KRN-04
**Done when**: the four module suites green; grep `getUserSession|setUserSession` in `apps/api/src` = 0 after T8+T9.
**Tests**: unit · **Gate**: quick · **Commit**: `refactor(modules): read actor from kernel context`

### T10: `module add` planning lib
**What**: `lib/catalog-source.mjs` (`resolveCatalog(ref)`: local path | git sparse clone to cache; default from `.copier-answers.yml`), `lib/plan.mjs` (`checkKernelRange`, `checkLock`, `resolveDeps` topo, `planCopy` by convention + conflicts).
**Touches**: `scripts/platform/lib/{catalog-source,plan}.mjs`, `scripts/platform/__tests__/{catalog-source,plan}.test.mjs`, `scripts/platform/__tests__/fixtures/catalog/**` (mini catalog: `alpha`, `beta` dependsOn alpha, `gamma/variant-x`)
**Depends on**: T5 · **Requirement**: TLG-02, TLG-03, TLG-05
**Done when**: tests: missing deps list; topo order; already installed; kernelRange fail; conflicts; dry plan shape. Git path tested with a local bare repo fixture.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): module add planning (deps, lock, kernel range, copy plan)`

### T11: `module add` apply lib — copy, env, registries, lock, rollback
**What**: `lib/apply.mjs` (`copyFiles`, `writeEnv` append-only, `writeRegistry` generating `platform-modules.ts` + `platform-schema.ts` from lock, `writeLock` with sha256 `files[]`, `rollback`).
**Touches**: `scripts/platform/lib/apply.mjs`, `scripts/platform/__tests__/apply.test.mjs`
**Depends on**: T5 · **Requirement**: TLG-01, TLG-06, TLG-08
**Done when**: tests on a tmp child: files copied; `.env.example` block appended once, existing `.env` value preserved; registries regenerated idempotently; rollback removes exactly lock `files[]` + registry lines + env block.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): module add apply (copy, env, registries, lock, rollback)`

### T12: Migrations generation lib
**What**: `lib/migrations.mjs`: `generateForModule(child, manifest)` → `drizzle-kit check` (abort on drift, exit 9), `drizzle-kit generate --name <module>_baseline`, then `--custom` per `customMigrations` with shipped SQL written in, `db:check:journal`; returns generated names for the lock.
**Touches**: `scripts/platform/lib/migrations.mjs`, `scripts/platform/__tests__/migrations.test.mjs`
**Depends on**: T5 · **Requirement**: MIG-01, MIG-02
**Done when**: tests with a stubbed command runner assert the exact drizzle-kit invocations, ordering, abort-on-drift, journal check; custom SQL lands in the generated file.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): generate entry migrations in the child via drizzle-kit`

### T13: `catalog-lint`
**What**: `catalog-lint.mjs`: manifest schema, README H2 contract (read from `docs/catalog/README-contract.md`), CHANGELOG heading for version, `web/**` import allow-list, advisory frontmatter; root script `catalog:lint`.
**Touches**: `scripts/platform/catalog-lint.mjs`, `scripts/platform/lib/{lint,frontmatter}.mjs`, `scripts/platform/__tests__/lint.test.mjs`, `package.json` (script)
**Depends on**: T5, T7 · **Requirement**: HBK-01, CAT-01, ADV-01
**Done when**: fixture entries pass/fail per rule; web import of `@tanstack/react-router` fails; missing H2 fails.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): catalog-lint`

### T14: Advisory-required commit-msg hook + lefthook wiring
**What**: `advisory-required.mjs` (staged catalog code paths ⇒ staged ADV for that module or trailer `Advisory: none — …`); `lefthook.yml`: `commit-msg` → advisory-required; `pre-commit` → `catalog:lint` on `catalog/**`, `docs/advisories/**`.
**Touches**: `scripts/platform/advisory-required.mjs`, `scripts/platform/__tests__/advisory-required.test.mjs`, `lefthook.yml`
**Depends on**: T6, T13 · **Requirement**: ADV-04
**Done when**: tests: code change w/o advisory → 1; with matching ADV → 0; docs/tests-only → 0; trailer → 0; wrong module ADV → 1.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): reject catalog fixes without an advisory`

### T15: CLI commands `module add|adopt|list`, `advisory detect`
**What**: wire libs into commands with flags (`--variant --catalog-ref --with-deps --dry-run --force --rollback --web-root --no-web-react --skip-tests`); `adopt` (lock from present files); `list`; `advisory detect <id>`; `module update` prints skill pointer; end-to-end tests on a tmp child fixture with the mini catalog (command runner stubbed for drizzle/pnpm).
**Touches**: `scripts/platform/cli.mjs`, `scripts/platform/lib/commands/{add,adopt,list,advisory}.mjs`, `scripts/platform/__tests__/cli.test.mjs`, `scripts/platform/__tests__/fixtures/child/**`
**Depends on**: T10, T11, T12 · **Requirement**: TLG-01..06, TLG-08, ADV-05
**Done when**: every exit code (3–9) asserted; `--dry-run` writes nothing; `--with-deps` installs alpha before beta; adopt writes lock without copying; detect runs the advisory command.
**Tests**: unit (`node --test`) · **Gate**: quick · **Commit**: `feat(platform): module add/adopt/list and advisory detect commands`

### T16: Generated registries in the kernel composition root
**What**: ship `apps/api/src/platform-modules.ts` (`PLATFORM_MODULES = []`, generated header) and `apps/api/src/db/platform-schema.ts` (empty); `app.module.ts` spreads `...PLATFORM_MODULES` (existing explicit module imports stay until T22); `db/schema.ts` re-exports.
**Touches**: `apps/api/src/platform-modules.ts`, `apps/api/src/db/platform-schema.ts`, `apps/api/src/app.module.ts`, `apps/api/src/db/schema.ts`
**Depends on**: None · **Requirement**: KRN-01 (AD-020)
**Done when**: app boots in the existing int test; `schema-completeness.spec.ts` green.
**Tests**: integration (existing boot spec, path-filtered) · **Gate**: full · **Commit**: `feat(kernel): platform-modules and platform-schema registries`

### T30: Contract-snapshot parity helper
**What**: `apps/api/src/shared/test/parity/contract-snapshot.ts`: `expectContractSubset(openapiPath, snapshot)` comparing by operationId (missing op / incompatible schema → diff message).
**Touches**: `apps/api/src/shared/test/parity/contract-snapshot.ts`, `contract-snapshot.spec.ts`
**Depends on**: None · **Requirement**: CTR-01
**Done when**: tests: identical → pass; removed op → fail naming it; changed required field → fail; extra ops in child → pass.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(kernel): contract snapshot parity helper`

### T17: Catalog entry `identity/single-tenant`
**What**: copy `apps/api/src/modules/identity/**` → `catalog/identity/single-tenant/api/**` (paths inside unchanged); `module.json`; README per contract (decisions from AD-002/003/004 entry-local; `## Follow-ups absorvidos` placeholder); CHANGELOG 1.0.0; `web/core` (`session.types`, `permissions`, `route-access` data, `resolve-access` + vitest tests) and `web/react` (queries) extracted from `apps/web/src/entities/session` + `features/login`; README § Parte web recipes (TanStack `beforeLoad` from `guards.ts`, Next middleware, login form from `login-form.tsx`); `parity/*.parity.spec.ts` (login, session, CSRF, guarded route via policy, profiles); `parity/contract.snapshot.json` (identity operations from current `openapi.json`); `migrations/custom/01_auth_events_append_only.sql` (from `0002`).
**Touches**: `catalog/identity/single-tenant/**`
**Depends on**: T8, T13, T30 · **Requirement**: CAT-01, CAT-03, CAT-04, WEB-01, CTR-01
**Done when**: `pnpm catalog:lint` passes for the entry; `web/core` tests pass when run with vitest directly (`pnpm --filter web exec vitest run ../../catalog/identity/single-tenant/web/core` or a temporary vitest root — worker picks the cheapest that runs); parity specs compile against the copied module (tsc on the entry dir via a scratch tsconfig — not in apps/).
**Tests**: lint + entry unit (web core) · **Gate**: quick (`catalog:lint` + vitest on web/core) · **Commit**: `feat(catalog): identity/single-tenant entry`

### T18: Catalog entry `attachment`
**What**: copy module + fold `shared/kernel/upload/**` into `api/domain/upload/**` (imports rewritten inside the copy); `module.json` (env: `ATTACHMENT_*`); README; CHANGELOG; parity (upload profile rules, access log); `contract.snapshot.json`.
**Touches**: `catalog/attachment/**`
**Depends on**: T9, T13, T30 · **Requirement**: CAT-01, CAT-03
**Done when**: `catalog:lint` passes; no import of `shared/kernel/upload` inside the entry.
**Tests**: lint · **Gate**: quick · **Commit**: `feat(catalog): attachment entry`

### T19: Catalog entry `audit`
**What**: copy module + fold `shared/kernel/audit/**` (trail module, repository, purge job) into `api/infrastructure/trail/**`; replace the access-log internal import with the attachment facade (or document the facade gap in README § Decisões if the facade lacks it — then the entry adds the facade method to **its copy of attachment? no** → adds a `dependsOn: attachment` + README note; the facade method is added in T18); `module.json`; README; CHANGELOG; parity; snapshot.
**Touches**: `catalog/audit/**`
**Depends on**: T9, T13, T30 · **Requirement**: CAT-01, CAT-03
**Done when**: `catalog:lint` passes; no `shared/kernel/audit` import inside the entry.
**Tests**: lint · **Gate**: quick · **Commit**: `feat(catalog): audit entry`

### T20: Catalog entry `notification`
**What**: copy module; `module.json`; README (AD-007/AD-008 entry-local); CHANGELOG; parity (template registry, mailer transport-only); snapshot.
**Touches**: `catalog/notification/**` · **Depends on**: T9, T13, T30 · **Requirement**: CAT-01
**Done when**: `catalog:lint` passes. **Tests**: lint · **Gate**: quick · **Commit**: `feat(catalog): notification entry`

### T21: Catalog entry `tag`
**What**: copy module; `module.json`; README; CHANGELOG; parity; snapshot.
**Touches**: `catalog/tag/**` · **Depends on**: T9, T13, T30 · **Requirement**: CAT-01
**Done when**: `catalog:lint` passes. **Tests**: lint · **Gate**: quick · **Commit**: `feat(catalog): tag entry`

### T22: Cutover — kernel-only template (exclusive)
**What**: delete `apps/api/src/modules/{identity,attachment,audit,notification,tag}`; delete `shared/kernel/{access/*types,define-*,product-*}`, `shared/kernel/upload/**`, `shared/kernel/audit/**`; `app.module.ts` kernel modules + `...PLATFORM_MODULES` only; `db/schema.ts` kernel tables + `platform-schema`; rewrite migrations to `0000_kernel_baseline.sql` + `0001_kernel_outbox_notify.sql` (+ snapshots, journal; `idempotency_keys.actor_id`); `module-boundaries.spec.ts`: drop RULE B + base-set allow-list rows, add RULE C (token list from design § 2.4); `schema-completeness.spec.ts` kernel-only; web: delete `entities/session`, `features/login`, `app/router/guards.ts`, route-access content (keep `route-access.types.ts`), `authenticated-layout` → `app-layout` without session, router tests updated; `.env.example` kernel vars only; `pnpm contract` → kernel-only `openapi.json` + regenerated client (**separate commit** `chore(contract): regenerate kernel-only client`).
**Touches**: see Wave Plan row C16
**Depends on**: T8, T9, T16, T17, T18, T19, T20, T21 · **Exclusive**: yes
**Requirement**: KRN-01, KRN-02, KRN-05, KRN-06, MIG-01, CTR-01
**Done when**: `pnpm check` green; api unit + web unit green; int boot test: empty DB → only `_kernel`; RULE C zero hits; `db:check:journal` green; openapi has only kernel operations. Two commits (cutover, contract regen).
**Tests**: unit + integration (path-filtered boot) · **Gate**: full (+ wave Build full-unit) · **Commit**: `feat!: kernel-only template — modules move to the catalog`

### T23: Template smoke kernel-only
**What**: rewrite `scripts/template-smoke.mjs` per design § 5.5; delete `scripts/smoke/fake-product/`.
**Touches**: `scripts/template-smoke.mjs`, `scripts/smoke/**`
**Depends on**: T22 · **Requirement**: SMK-01
**Done when**: script asserts the four checks; a dry run of the script (`--help`/plan) is unit-tested if the script exposes pure helpers; the real run happens at Final.
**Tests**: unit (helpers) · **Gate**: quick · **Commit**: `feat(smoke): kernel-only profile, fake-product fixture removed`

### T24: `catalog-check` script
**What**: `catalog-check.mjs` (`pnpm catalog:check [entry…]`): render kernel-only child to scratch, install, topo `module add` each entry (cumulative), scoped tests per entry, final `check && test` + parity; reuses smoke render helpers.
**Touches**: `scripts/platform/catalog-check.mjs`, `scripts/platform/__tests__/catalog-check.test.mjs`, `package.json` (script)
**Depends on**: T15, T22 · **Requirement**: CAT-02
**Done when**: planning/topo/arg handling unit-tested with stubbed runner; real run at T28/Final.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): catalog-check pre-tag gate`

### T25: Template docs + copier + changelog v1.0.0
**What**: `docs/dev/template.md` (kernel/catalog/child table, `module add/adopt`, lock, advisories, port skill, migrations AD-015), `docs/dev/template-changelog.md` `## v1.0.0` (breaking + child steps incl. `module adopt`, `idempotency_keys.user_id → actor_id` snippet, slot files retired, web removals), `TEMPLATE.md`, `CLAUDE.md`, `AGENTS.md.jinja`, `README.md.jinja`, `copier.yml` (`_exclude` `catalog/`; `_skip_if_exists` `.platform-modules.lock`, `docs/advisories/APPLIED.md`).
**Touches**: listed · **Depends on**: T22 · **Requirement**: HBK-03, HBK-04, CAT-05, ADV-03
**Done when**: no v0.2 slot reference remains (`rg "product-access-profiles|product-upload-profiles|product-permission-catalogs" docs TEMPLATE.md AGENTS.md.jinja` = 0); copier renders (smoke at Final).
**Tests**: none · **Gate**: build · **Commit**: `docs(template): v1 kernel-only model, catalog, changelog v1.0.0`

### T26: Handbooks
**What**: `docs/back/back-arch.md` (kernel ports, module anatomy = entry, facades/events rule, `PLATFORM_MODULES`), `docs/front/front-arch.md` (raw web part, recipes), `docs/test/testing.md` (parity suites, `__parity__`, snapshot helper, `node --test`).
**Touches**: the three files · **Depends on**: T22 · **Requirement**: HBK-02
**Done when**: each file has the sections named in design § 9; RULE C vocabulary appears only in `docs/catalog/**`.
**Tests**: none · **Gate**: build · **Commit**: `docs(handbooks): kernel ports, module anatomy, parity`

### T27: Skills `port-module-update` + `catalog-modules`
**What**: `.agents/skills/port-module-update/SKILL.md` (steps per design § 7, English), `.agents/skills/catalog-modules/SKILL.md`; `pnpm skills:sync`.
**Touches**: `.agents/skills/{port-module-update,catalog-modules}/**`, `.claude/skills/*` symlinks
**Depends on**: T15 · **Requirement**: TLG-07
**Done when**: skills list in `.claude/skills`; dry-run narrative tested manually against the mini catalog fixture is documented in the SKILL.
**Tests**: none · **Gate**: build · **Commit**: `feat(skills): port-module-update and catalog-modules`

### T28: Follow-ups absorption + first catalog-check run
**What**: fill `## Follow-ups absorvidos` in each entry README from issues #2–#8 (`module.json.absorbs`); run `pnpm catalog:check` once through the runner; fix nothing here — failures become fix tasks.
**Touches**: `catalog/**/README.md`, `catalog/**/module.json`, `docs/dev/template-changelog.md`
**Depends on**: T17–T21, T24, T25 · **Requirement**: CAT-02, CAT-03
**Done when**: every entry README lists its absorbed issues; `catalog:check` log saved and linked in tasks.md.
**Tests**: lint · **Gate**: build (+ heavy run via runner) · **Commit**: `docs(catalog): absorbed follow-ups per entry`

---

## Requirement Coverage

| Req | Tasks | | Req | Tasks |
| --- | --- | --- | --- | --- |
| KRN-01 | T16, T22 | | TLG-01 | T5, T11, T15 |
| KRN-02 | T22 | | TLG-02 | T10, T15 |
| KRN-03 | T1, T2, T8 | | TLG-03 | T10, T15 |
| KRN-04 | T3, T4, T8, T9 | | TLG-04 | T15 |
| KRN-05 | T22 (web) + T17 (resolveAccess) | | TLG-05 | T10, T15 |
| KRN-06 | T22 | | TLG-06 | T11, T15 |
| KRN-07 | T3 | | TLG-07 | T27 |
| CAT-01 | T5, T13, T17–T21 | | TLG-08 | T11, T15 |
| CAT-02 | T24, T28 | | ADV-01 | T6, T13 |
| CAT-03 | T17–T19, T28 | | ADV-02 | T6 |
| CAT-04 | T8, T17 | | ADV-03 | T6, T25 |
| CAT-05 | T7, T25 | | ADV-04 | T14 |
| HBK-01 | T7, T13 | | ADV-05 | T15 |
| HBK-02 | T26 | | MIG-01 | T12, T22 |
| HBK-03 | T25 | | MIG-02 | T12 |
| HBK-04 | T25 | | WEB-01 | T17 |
| CTR-01 | T30, T17, T22 | | SMK-01 | T23 |

**Coverage:** 34 total, 34 mapped, 0 unmapped.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1, T2, T3, T4, T30 | one kernel file pair (+spec) each | ✅ |
| T5, T10, T11, T12, T13, T14, T15 | one lib/command each (+tests) | ✅ |
| T6 | lib + hook (cohesive: hook is a 20-line wrapper) | ⚠️ OK |
| T7, T25, T26, T27, T28 | docs clusters, same area | ⚠️ OK (docs) |
| T8, T9 | one module / one rename across 4 modules | ⚠️ OK (single rename) |
| T16 | 2 generated files + 2 one-line edits | ⚠️ OK |
| T17–T21 | one entry each | ✅ |
| T22 | cutover — one tight dependency chain (deletions + baseline + boundaries + contract) | ⚠️ legitimate fat exclusive task |
| T23, T24 | one script each | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends on (body) | Wave Plan | Status |
| --- | --- | --- | --- |
| T1, T3, T5, T6, T7, T16, T30 | none (T6 needs T5's deps — dispatch note) | wave 1 | ✅ |
| T2 | T1 | C1 after T1 | ✅ |
| T4 | T3 | C2 after T3 | ✅ |
| T10, T11 | T5 | C3 after T5 | ✅ |
| T8 | T1, T2, T3 | wave 2 | ✅ |
| T9 | T3, T4 | wave 2 | ✅ |
| T12 | T5 | wave 2 | ✅ |
| T13 | T5, T7 | wave 2 | ✅ |
| T14 | T6, T13 | C10 after T13 | ✅ |
| T15 | T10, T11, T12 | wave 3 | ✅ |
| T17 | T8, T13, T30 | wave 3 | ✅ |
| T18–T21 | T9, T13, T30 | wave 3 | ✅ |
| T22 | T8, T9, T16, T17–T21 | wave 4 | ✅ |
| T23 | T22 | wave 5 | ✅ |
| T24 | T15, T22 | wave 5 | ✅ |
| T25, T26 | T22 | wave 5 | ✅ |
| T27 | T15 | wave 5 | ✅ |
| T28 | T17–T21, T24, T25 | wave 6 | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T1–T4, T30 | kernel API | unit | unit | ✅ |
| T16 | kernel wiring | integration | integration | ✅ |
| T8 | module code | unit + e2e | unit + e2e | ✅ |
| T9 | module code | unit | unit | ✅ |
| T5, T6, T10–T15, T23, T24 | tooling | unit (`node --test`) | unit | ✅ |
| T17–T21, T28 | catalog entries | lint + parity-in-child | lint (+ web core unit for T17); parity in child at Final/T28 | ✅ |
| T22 | kernel wiring + boundaries + web kernel | unit + integration | unit + integration | ✅ |
| T7, T25, T26, T27 | docs/config | none | none | ✅ |

## Wave/Cluster Cross-Check

| Cluster | Deps earlier wave / earlier in cluster | Files disjoint from siblings | Exclusive alone | Status |
| --- | --- | --- | --- | --- |
| C1..C6 (w1) | all `none` or intra-cluster | C3 owns `package.json`; C4/C5/C6 do not touch it; C6 owns `app.module.ts`/`schema.ts` | T5 lockfile — only writer in w1 | ✅ |
| C7..C10 (w2) | T8←T1,T2,T3 (w1); T9←T3,T4; T12←T5; T13←T5,T7; T14←T6,T13 | identity vs other modules vs scripts vs lint — disjoint; C10 owns `package.json` script edit (no other w2 writer) | — | ✅ |
| C11..C15 (w3) | T15←w1/w2; entries←T8/T9/T13/T30 | `scripts/platform/**` vs five `catalog/<entry>/**` dirs | — | ✅ |
| C16 (w4) | all | alone | yes | ✅ |
| C17..C20 (w5) | ←T22/T15 | smoke vs catalog-check (C18 owns `package.json` script) vs docs vs skills | — | ✅ |
| C21 (w6) | ←w3, w5 | alone | — | ✅ |

---

## Execution Log

Worktree `.worktrees/v1-kernel-only-module-catalog`, branch `feat/v1-kernel-only-module-catalog` (from `main` @ `3fd0f95`).

### Wave 1 — DONE (all 6 clusters)

| Cluster | Task | Commit | Result |
| --- | --- | --- | --- |
| C1 | T1 | `abe1a6f` | access-policy port + `@RequirePermission`/`@Public`/`@Authenticated` writing `ACCESS_REQUIREMENT` |
| C1 | T2 | `add1343` | fail-closed `AccessGuard` registered as `APP_GUARD` in `SharedKernelModule` — 41 tests / 4 suites |
| C2 | T3 | `0f67fcd` | `Actor` + `setActor`/`getActor` (one-shot) + `setExtension`/`getExtension`; job-context `actorId` + `tenantId` |
| C2 | T4 | `d175ae3` | idempotency scope key from `actor.id`; 0 `userId` tokens left under `shared/kernel/idempotency` — 32 tests / 4 suites |
| C3 | T5 | `04032f2` | `scripts/platform` skeleton, `catalog/schema/module.schema.json`, root `platform` + `test:scripts`, devDeps `semver`/`yaml` |
| C3 | T10 | `d9a650e` | `catalog-source.mjs` + `plan.mjs` + mini fixture catalog (`alpha`, `beta`, `gamma/variant-x`) |
| C3 | T11 | `261d522` | `apply.mjs` (copy, env, registries, lock w/ sha256, rollback) — 30 tests |
| C4 | T6 | `aa2edfa` | `lib/advisories.mjs` + `.claude/hooks/pending-advisories.mjs` + settings registration — 46 tests total |
| C5 | T7 | `09a377e` | `docs/catalog/README-contract.md`, `docs/catalog/catalog.md`, `catalog/README.md` |
| C6 | T16 | `118c3e5` | `platform-modules.ts` + `platform-schema.ts`; `app.module.ts` spreads `...PLATFORM_MODULES` |
| C6 | T30 | `b2adf66` | `expectContractSubset` parity helper — 4 tests |

**Wave 1 Build gate — PASS (second run).**

First run FAILED: `pnpm typecheck` exit 2, `pnpm lint` OOM-crashed under the combined turbo run. Split per package, the real picture was two disjoint sets:

- **Ours** — `access.guard.ts:10` imported `getActor` from `../context/request-context`, which never exported it (it existed only as a `RequestContext` class method). The unit suite missed it because `access.guard.spec.ts` mocks that module and `@swc/jest` strips types without typechecking. Plus an orphaned `@ts-expect-error` in `permission-catalog.spec.ts:170` (kernel `PermissionKey` is now `string`) and 86 api lint errors, 69 of them `@typescript-eslint/no-deprecated` fired by T3's `@deprecated` tags.
- **Not ours** — 6 web typecheck + 20 web lint errors, byte-identical on `main` (debt from `dca3188`, feature `pre-push-coverage-95`). The branch touches zero files under `apps/web`.

Fixes: `99db93e` on the branch (ALS hoisted to module scope, `setActor`/`getActor`/`setExtension`/`getExtension` exported as free functions, class delegates — 43 injectors unaffected; `@deprecated` tags dropped from the transitional surface, members kept; regression test at `request-context.spec.ts:80` asserting the unmocked `getActor()` is `null` outside a request). `d4f5fe1` on `main` for the web baseline, merged into the branch as `848079b`.

Gate results after the fixes: `pnpm --filter api typecheck` 0 · `pnpm --filter api lint` 0 (86 → 0) · `pnpm --filter api test` **1047 passed / 150 suites** · `pnpm --filter web typecheck` 0 · `pnpm --filter web lint` 0 · `pnpm --filter web test` **108 passed / 34 files**.

Lesson for later waves: a spec that mocks the module it depends on hides a missing export from the unit gate entirely — the Build gate's typecheck is the only thing that catches a cross-cluster export mismatch, so it must run before a wave is called done.

Extra deviation from the fix: `setExtension`/`getExtension` take `ExtensionKey<T> = symbol & { readonly __extension?: T }` rather than a bare `symbol` (the only shape that keeps the generic and satisfies `no-unnecessary-type-parameters`); a plain `symbol` stays assignable, so no call site changed.

**Carry-forward notes (must reach the tasks named below):**

1. **T8/T9** — T3 kept a wider deprecated surface than design § 2.2 states: `userId`, `sessionId`, `deviceId`, `access`, `RequestAccess`, `setAccess`, `setUserSession`, `getUserSession` all remain in `request-context.ts` (JSDoc `@deprecated`), and `actor`/`extensions` are **optional** store fields. Reason: ~20 unowned files read `store.userId`/`store.access` directly, including kernel `shared/kernel/transactional/transaction-manager.ts:154`, `context/request-context.middleware.ts` and `context/event-context.ts`. T8/T9 delete the deprecated fields and flip `actor`/`extensions` to required.
2. **T8/T9** — spec-precision gap: the actor rebuilt in `buildJobContextStore` uses `kind: "job"` (design only says `actor?.id` is copied). Change to `"user"` only if the identity policy needs it.
3. **T22** — `db/schema.ts` did NOT get `export * from "./platform-schema"` (design § 5.3): `db/schema-completeness.spec.ts` runs a regex dangling-import check over every `from "…"` in `schema.ts` against on-disk `*.table.ts` files, so the line fails unconditionally until that spec is made kernel-only aware. T22 owns the spec — it must land the re-export line and the spec update together.
4. **T22** — T1 could not delete `shared/kernel/access/permission.types.ts` (registry still load-bearing: `declare module` augmentation in identity `permission-catalog.ts` + 4 importers). Kernel `PermissionKey = string` lives in `access-policy.port.ts`; `decorators.ts` imports it from there. Legacy metadata keys are still written so identity's `PermissionsGuard` keeps working. T22 removes both.
5. **T4 is a no-op on SQL** — `idempotency_keys` has no `user_id` column; the actor lives inside the composite `scope` text column. T22's baseline rewrite is unaffected on this point.
6. **T15** — `writeRegistry`/`rollback` in `apply.mjs` take registry `entries` (`{name, apiModule, schemaExports}`) as an explicit parameter; the lock shape in design § 7 does not carry `apiModule`/`schemaExports`, so the command layer must supply them from the manifests it holds.
7. **Tooling** — `test:scripts` is `node --test scripts/platform/__tests__/*.test.mjs` (glob, not bare dir: Node 24 fails to resolve a directory test path). `turbo.json` untouched — root tasks are not turbo-orchestrated, so Final runs `test:scripts` explicitly. `lib/manifest.mjs` validates by hand against `module.schema.json` (no JSON-Schema dependency added).
8. **Standing condition** — `AccessGuard` is globally registered and fail-closed with no `ACCESS_POLICY` provider bound until T8. Every non-`@Public` route answers 403 `access-policy-missing` in the meantime; e2e/integration red in that window is expected, not a regression. **Lifted by T8 (`90233b9`).**

### Wave 2 — all 4 clusters committed; Build gate NOT run (blocked, see below)

| Cluster | Task | Commit | Result |
| --- | --- | --- | --- |
| C7 | T8 | `90233b9` | `AuthMiddleware` publishes `Actor{kind:"user"}` + `IDENTITY_SESSION`/`IDENTITY_ACCESS` extensions; `IdentityAccessPolicy` bound to `ACCESS_POLICY`, exported from the global `IdentityModule`; `AuthGuard` + `PermissionsGuard` deleted — 509 tests / 62 suites |
| C8 | T9 | `c8d176b` | attachment use-cases on `getActor()`; audit/notification/tag had no `getUserSession`/`store.userId` hits — 220 tests / 45 suites |
| C9 | T12 | `acfdb12` | `lib/migrations.mjs` — `drizzle-kit check` → baseline `generate` → `--custom` per `customMigrations` → `db:check:journal`, abort → exit 9; returns generated names for the lock — 4 tests |
| C10 | T13 | `838149f` | `catalog-lint`: manifest, README H2 order (source `docs/catalog/README-contract.md`), CHANGELOG version heading, `web/**` import allow-list, advisory frontmatter — 14 tests |
| C10 | T14 | `5115162` | `advisory-required.mjs` + lefthook `commit-msg`/`pre-commit` wiring — 7 tests (advisories 16 unchanged) |

### Wave 2b — authorization fixes (both DONE)

| Task | Commit | Result |
| --- | --- | --- |
| T8a | `fa4484a` | `@OptionalAuth()` emits `{ kind: "public" }`; `{ kind: "anyPermission"; keys }` added to the port + decorator + an OR branch in `IdentityAccessPolicy` (master bypass hoisted, applies to both kinds). `access.guard.ts` needed **zero** edits — it already forwards the requirement verbatim. — 560 tests / 66 suites |
| T9a | `f583b0d` | **PARTIAL by design.** `setUserSession`/`getUserSession`/`setAccess` removed (0 callers repo-wide); `logger.factory.ts` and `transaction-manager.ts` read `actor.id`. Deletion of the rest deferred — see note 15. — 206 tests / 29 suites |

T8a ran the delete-the-branch sensor by hand: removing the OR branch turns `IdentityAccessPolicy › requisito OR › libera com uma única das chaves exigidas` red (expected true, received false). The silent privilege widening is now covered by a test that kills it.

**Wave 2 Build gate — PASS.** `pnpm --filter api typecheck` 0 · `pnpm --filter api lint` 0 · `pnpm --filter api test` **1052 passed / 151 suites** · `pnpm test:scripts` **71 passed / 0 failed**. Zero failures. `apps/web` not run: wave 2 touched no file under it (full web suite runs at Final).

**Original blocking-fix specification (both now landed, kept for traceability):**

- **T8a (opus, auth) — `@OptionalAuth()` / `@RequireAnyPermission()` lost their enforcement.** Both decorators predate T1 and emit no `ACCESS_REQUIREMENT`, so with `PermissionsGuard` deleted they now fall through to the kernel default.
  - `@OptionalAuth()` → default `authenticated` → **anonymous access is now 401**. Breaks `modules/attachment/api/controllers/download-attachment.controller.ts:39` and the assertion at `apps/api/test/identity/authz.e2e-spec.ts:394` (left red by T8 on purpose). Fix: emit `{ kind: "public" }`.
  - `@RequireAnyPermission([...])` → default `authenticated` → **OR-permission enforcement silently disappears**; `modules/audit/api/controllers/audit.controller.ts:43` degrades to "any authenticated user". Fix: new `{ kind: "anyPermission"; keys: string[] }` in `access-policy.port.ts` + `decorators.ts` + a branch in `IdentityAccessPolicy`. Needs a spec that fails when the branch is absent (no existing test catches this).
  - Touches: `shared/kernel/access/{decorators.ts,access-policy.port.ts,access.guard.ts}` (+specs), `modules/identity/api/access/identity-access.policy.ts` (+spec).
- **T9a (sonnet) — transitional surface removal, deferred by C8 as designed.** After T8a, migrate the last unowned readers onto `actor` and delete the deprecated surface. Remaining consumers at C8's grep: all of `modules/identity/**` (now migrated by T8 — re-grep), plus `shared/kernel/logging/logger.factory.ts:54` (`store.userId`), and the three kernel readers left untouched (`transactional/transaction-manager.ts`, `context/request-context.middleware.ts`, `context/event-context.ts`). Then delete `userId`, `sessionId`, `deviceId`, `access`, `RequestAccess`, `setAccess`, `setUserSession`, `getUserSession` from `request-context.ts` and flip `actor`/`extensions` to **required**. Closes KRN-04's "grep = 0" clause.
  - T8a and T9a are file-disjoint and can run in parallel.

**Carry-forward from wave 2:**

9. **T8 e2e was not run** — `test:e2e` needs a live Postgres (`createTestPool`), unavailable in the worker environment. Compensation shipped: `modules/identity/api/middleware/auth-seam.spec.ts`, a DB-free Nest boot spec that mounts the real kernel `AccessGuard` + `ACCESS_POLICY` and proves middleware-before-guard (guarded 200 with session, 401 anon, 401 stale cookie, public 200) and that the `{*splat}` route pattern boots on Express 5. **The e2e claim in T8's Done-when is still unverified — the Verifier must run it at Final.**
10. **T8 behaviour deviations (accepted, documented):** a DB failure during session lookup is now 503 for every request carrying a cookie (v0.2 degraded `@OptionalAuth` to anonymous); a 401 on a request with *no* cookie no longer emits the clearing `Set-Cookie` (stale/expired cookies still are cleared by the middleware).
11. **T12** — the exact invocation shapes for `drizzle-kit check` and `db:check:journal` were not in design § 5.2; the worker extended the `pnpm --filter api exec drizzle-kit …` pattern the design gives for the baseline `generate`. **T15 owns the real command line** and must confirm these against the child's actual scripts.
12. **T13/T14** — `parseAdvisory`/`AdvisoryParseError` were extracted from `lib/advisories.mjs` into new `lib/frontmatter.mjs`; `advisories.mjs` re-exports both, T6's 16 tests unchanged. T15/T24 import from whichever they prefer.
13. **C8 note** — audit's use of `RequestAccess` is permission-scoping, unrelated to actor/userId; T9 correctly left it. It dies with T22.
14. **T8a** — `anyPermission.keys` is typed `readonly PermissionKey[]`, not design § 2.1's `string[]` (`PermissionKey = string` in the kernel; `readonly` is what accepts the decorator's readonly param without a cast). Not a semantic change.
15. **T22 absorbs T9a's residual — binding.** T9a stopped short of deleting `userId`, `sessionId`, `deviceId`, `access`, `RequestAccess` from `request-context.ts` and of flipping `actor`/`extensions` to required, because ~12 files outside its ownership still depend on them. A dedicated T9b was **not** dispatched: 8 of those files live under `apps/api/src/modules/**`, which T22 deletes wholesale, and the rest are in `shared/kernel/{audit,errors,outbox}` which T22 already rewrites (audit leaves the kernel in the same task). Migrating spec literals in files that are about to be deleted is churn. **T22 must therefore also:**
    - migrate the surviving readers `modules/audit/application/list-audit-entries/list-audit-entries.use-case.ts:62` (`.access`) and `modules/notification/application/require-recipient.ts:10` (`store.userId`) — or delete them with their modules;
    - update the store literals in `shared/kernel/audit/audit-trigger.int-spec.ts:190`, `shared/kernel/errors/problem-details.filter.spec.ts:101`, `shared/kernel/outbox/outbox.int-spec.ts:78` (they build `RequestContextStore` without `actor`/`extensions`);
    - **remove the shim**: `setActor` currently still writes `store.userId` for unmigrated readers. This is live kernel code, not a spec — if T22 misses it, the shim ships to children;
    - then delete the five remaining transitional fields and flip `actor`/`extensions` to **required**. Only then is KRN-04's "grep = 0" clause satisfied.
16. **Accepted consequence, not a deviation** — `logger.factory.ts` no longer logs `sessionId`. Under AD-017 the kernel cannot read identity's `IDENTITY_SESSION` extension (kernel never imports a module), so no kernel-safe source for it exists. T9a flagged it `SPEC_DEVIATION`; the orchestrator reclassified it as the correct consequence of the seam. **T25 must carry it as a v1.0.0 changelog note for children** ("kernel logs lose `sessionId`; re-add it from your own module if you need it").

---

## Tools per task

- MCP: none required. Workers nest `repo-scout` (haiku/sonnet) and `shell-runner` (haiku).
- Skills: `tlc-spec-driven` (workers read `references/cards/worker.md`); T17–T21 may use `domain-modeling` for README § Decisões; T27 authors skills by hand.
- Model per cluster as in the Wave Plan `Notes` (opus only: C1, C2, C7, C12, C16).
