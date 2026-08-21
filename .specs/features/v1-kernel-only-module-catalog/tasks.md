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
| 4b.1 | C16a | T22d | `apps/api/src/shared/kernel/scheduling/**` | opus (AD-022 registry) · depends T22 |
| 4b.1 | C16b | T22e | `apps/api/src/{docs/**,openapi/**,main.ts}`, `apps/api/src/shared/kernel/access/decorators.ts`, `apps/api/test/openapi-contract.e2e-spec.ts` + its `__snapshots__` | sonnet · depends T22 · `/docs` remount + contract e2e restore + note 4 kernel side |
| 4b.2 | C16c | T22f | `catalog/identity/single-tenant/**` | opus (AD-021 port inversion, AD-022 adoption, restore) · depends C16a,C16b |
| 4b.2 | C16d | T22g | `catalog/{attachment,audit,notification,tag}/**` | sonnet (restore + audit purge job via the registry) · depends C16a,C16b |
| 4c.1 | C25 | T22j | `apps/api/tsconfig.catalog.json` (new), `package.json` (`catalog:typecheck`), `lefthook.yml` | sonnet · nothing type-checks `catalog/**` today |
| 4c.2 (exclusive) | C24 | T22i | `apps/api/src/shared/kernel/ports/**`, `catalog/{identity,attachment,audit,notification}/**` | opus (AD-024) · depends T22j · port tokens move to the kernel, audit binds the purger, `fake-mailer` cross-entry import, remaining entry jobs registered |
| 5 | C17 | T23 | `scripts/template-smoke.mjs`, `scripts/smoke/**` (delete) | sonnet · depends T22 |
| 5 | C18 | T24 | `scripts/platform/catalog-check.mjs`, `scripts/platform/__tests__/catalog-check.test.mjs`, `package.json` (`catalog:check`) | sonnet · depends T15,T22 |
| 5 | C19 | T25 → T26 | `docs/dev/{template.md,template-changelog.md}`, `TEMPLATE.md`, `CLAUDE.md`, `AGENTS.md.jinja`, `README.md.jinja`, `copier.yml`, `docs/back/back-arch.md`, `docs/front/front-arch.md`, `docs/test/testing.md` | sonnet (docs) · depends T22 |
| 5 | C20 | T27 | `.agents/skills/port-module-update/**`, `.agents/skills/catalog-modules/**`, `.claude/skills/*` (symlinks) | sonnet · depends T15 |
| 5 | C22 | T22a | `catalog/{identity,attachment,audit,notification,tag}/parity/contract.snapshot.json`, `catalog/{identity,attachment}/**/CHANGELOG.md` | sonnet · depends T22 · rebuild the 5 snapshots from `git show ee825dd:openapi.json` (53 ops) |
| 5 | C23 | T22h | `apps/api/src/shared/kernel/scheduling/maintenance-runtime.int-spec.ts` | sonnet · depends T22d · stale advisory-lock assertions since T22 |
| 6 | C21 | T28 | `catalog/**/README.md` `## Follow-ups absorvidos`, `docs/dev/template-changelog.md` (issue refs) | sonnet · depends T17–T21, T25 · runs `pnpm catalog:check` once via runner (heavy) |

```
Wave 1:  [C1: T1→T2] ∥ [C2: T3→T4] ∥ [C3: T5→T10→T11] ∥ [C4: T6] ∥ [C5: T7] ∥ [C6: T16→T30]   (≤4 in flight → C5,C6 queue)
Wave 2:  [C7: T8] ∥ [C8: T9] ∥ [C9: T12] ∥ [C10: T13→T14]
Wave 3:  [C11: T15] ∥ [C12: T17] ∥ [C13: T18] ∥ [C14: T19] ∥ [C15: T20→T21]   (C15 queues)
Wave 4:    [C16: T22]  (exclusive)
Wave 4b.1: [C16a: T22d] ∥ [C16b: T22e]
Wave 4b.2: [C16c: T22f] ∥ [C16d: T22g]   (only after 4b.1's Build gate)
Wave 4c.1: [C25: T22j]
Wave 4c.2: [C24: T22i]  (exclusive — kernel + four entries)
Wave 5:    [C17: T23] ∥ [C18: T24] ∥ [C19: T25→T26] ∥ [C20: T27] ∥ [C22: T22a] ∥ [C23: T22h]   (≤4 in flight → C22, C23 queue)
Wave 6:    [C21: T28]
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
**What**: `docs/dev/template.md` (kernel/catalog/child table, `module add/adopt`, lock, advisories, port skill, migrations AD-015), `docs/dev/template-changelog.md` `## v1.0.0` (breaking + child steps incl. `module adopt`, slot files retired, web removals, the kernel logger's lost `sessionId` field, and the `RouteAccess` shape change — **must NOT mention any `idempotency_keys.user_id → actor_id` rename**: that column never existed, design § 8 corrected on main at `d92f9c7`), `TEMPLATE.md`, `CLAUDE.md`, `AGENTS.md.jinja`, `README.md.jinja`, `copier.yml` (`_exclude` `catalog/`; `_skip_if_exists` `.platform-modules.lock`, `docs/advisories/APPLIED.md`).
**Touches**: listed · **Depends on**: T22 · **Requirement**: HBK-03, HBK-04, CAT-05, ADV-03
**Done when**: no v0.2 slot reference remains (`rg "product-access-profiles|product-upload-profiles|product-permission-catalogs" docs TEMPLATE.md AGENTS.md.jinja` = 0); copier renders (smoke at Final).
**Tests**: none · **Gate**: build · **Commit**: `docs(template): v1 kernel-only model, catalog, changelog v1.0.0`

### T26: Handbooks
**What**: `docs/back/back-arch.md` (kernel ports, module anatomy = entry, facades/events rule, `PLATFORM_MODULES`; **line 456 still documents "entrada em `maintenance-schedule.ts` com cron e lockId unico" — that file no longer exists after T22d, the sentence must become `registerMaintenanceJob(...)` no topo do arquivo do job**), `docs/front/front-arch.md` (raw web part, recipes), `docs/test/testing.md` (parity suites, `__parity__`, snapshot helper, `node --test`).
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

### T22d: Maintenance jobs become a runtime registry (AD-022)
**What**: replace the closed `MAINTENANCE_SCHEDULE` const with a kernel `MaintenanceRegistry` (same shape as AD-009's `AuditRegistry`): entries register at boot; duplicate name and colliding `lockId` both throw; the kernel's own two jobs (`outbox.purge`, `idempotency.purge`) register through the same path. `@MaintenanceJob(name)` must stop requiring a name already present in a kernel union.
**Touches**: `apps/api/src/shared/kernel/scheduling/**` · **Depends on**: T22 · **Requirement**: AD-022, CAT-01
**Readers to migrate**: `maintenance-runtime.ts:14,135,174`, `maintenance-job.decorator.ts:5,22`, `maintenance-schedule.spec.ts:8,17,30,141,145,150`, `maintenance-runtime.int-spec.ts:20,116`.
**Done when**: no kernel file has to change for a catalog entry to register a job; `maintenance-schedule.spec.ts:138-146` ("varredura resolve exatamente um arquivo de corpo por job do registro") is registry-driven or explicitly scoped to kernel jobs.
**Tests**: unit (duplicate name throws, colliding `lockId` throws, kernel jobs still register) · **Gate**: scoped + `pnpm --filter api typecheck` · **Commit**: `refactor(kernel): maintenance jobs via runtime registry`

### T22e: Kernel-only `/docs`, contract e2e, legacy access metadata
**What**: (i) remount the Scalar UI at `/docs` with **no module coupling** — T22 deleted `apps/api/src/docs/**` and the route from `main.ts`; the pre-cutover mount at `ee825dd:apps/api/src/main.ts:8-9,55-58,66` went through `setupDocsAuth(app, document)`, which depended on identity's session. The login-gated variant becomes a recipe in the identity entry's README, not kernel code. (ii) restore `apps/api/test/openapi-contract.e2e-spec.ts` with its snapshot rebuilt for the 2-operation kernel contract. (iii) close note 4's residual: `kernel/access/decorators.ts` still writes the legacy metadata keys because `openapi/openapi-config.ts`, `authz-coverage.spec.ts` and identity's guard chain read them — remove the kernel side here (the entry side is T22f's).
**Touches**: `apps/api/src/{docs/**,openapi/**,main.ts}`, `apps/api/src/shared/kernel/access/decorators.ts`, `apps/api/test/openapi-contract.e2e-spec.ts` + `__snapshots__` · **Depends on**: T22 · **Requirement**: HBK-01, CAT-01
**Done when**: `/docs` serves the kernel contract in a kernel-only tree; no kernel file writes or reads a legacy access metadata key.
**Tests**: e2e (contract snapshot) · **Gate**: scoped + `pnpm --filter api typecheck` · **Commit**: `feat(api): kernel-only /docs and contract e2e`

### T22f: Identity entry — AD-021 port inversion, AD-022 adoption, restore
**What**: (i) **AD-021 violation**: `api/application/use-cases/purge-users/purge-users.use-case.ts:1` imports the audit entry directly, so identity cannot install alone; invert it to an `@Optional()` port the audit entry binds, exactly like T17c's `ProfileImageStore`/`PROFILE_IMAGE_STORE`, and remove the in-file `SPEC_DEVIATION` marker. (ii) adopt the AD-022 registry for `purge-users`. (iii) stop reading the legacy access metadata keys T22e removed. (iv) restore the identity-owned content T22 deleted (note 29) under AD-021's test layering (`api/testing/` + the entry's e2e dir) and add every restored path to `module.json.files`.
**Touches**: `catalog/identity/single-tenant/**` · **Depends on**: T22d, T22e · **Requirement**: CAT-01, CAT-04, AD-021, AD-022
**Done when**: identity has no import of another entry; every restored path is listed in `module.json.files`.
**Tests**: the restored e2e specs + existing parity · **Gate**: scoped + `pnpm --filter api typecheck` + `pnpm catalog:lint` · **Commit**: `fix(catalog): identity installs alone — ports and restored tests`

### T22g: Restore attachment/audit/notification/tag content
**What**: restore the entry-owned content T22 deleted (note 29) into each entry under AD-021's test layering, listing every path in the entry's `module.json.files`; register audit's purge job through the AD-022 registry.
**Touches**: `catalog/{attachment,audit,notification,tag}/**` · **Depends on**: T22d, T22e · **Requirement**: CAT-01, CAT-04, AD-022
**Done when**: the 8 restored specs live under their entry; `catalog:lint` passes; audit's purge job registers without a kernel edit.
**Tests**: the restored e2e specs · **Gate**: scoped + `pnpm catalog:lint` · **Commit**: `fix(catalog): restore entry-owned tests and audit purge job`

### T22a: Rebuild parity snapshots from the real pre-cutover contract
**What**: rebuild the five `catalog/*/parity/contract.snapshot.json` from the real pre-cutover contract — `git show ee825dd:openapi.json`, **53 operations** (notes 18 + 24). They are currently derived only from `@ApiOperation`/`@HttpCode` decorators with response bodies reduced to status codes, so a changed field schema passes parity undetected. Also record T17c's port inversion as an `### Alterado` line in identity's and attachment's unreleased `1.0.0` CHANGELOG.
**Touches**: `catalog/{identity,attachment,audit,notification,tag}/parity/contract.snapshot.json`, `catalog/{identity,attachment}/**/CHANGELOG.md` · **Depends on**: T22 · **Requirement**: CAT-03, PAR-01
**Done when**: each snapshot carries the real request/response schemas for that entry's operations; `expectContractSubset` fails on a mutated field type.
**Tests**: parity · **Gate**: scoped · **Commit**: `test(catalog): parity snapshots from the real contract`

### T22h: Fix the stale assertions in `maintenance-runtime.int-spec.ts`
**What**: the spec still asserts advisory-lock holders 4/5/6/7/8 and the application names `api:job:email-change.revert`, `api:job:auth-events.purge`, `api:job:attachment-access-log.purge` while running `outbox.purge`/`idempotency.purge`, which hold lockIds 1 and 2. Stale since T22 moved those jobs to `catalog/**`; it compiles (T22d migrated its registry reads) but fails on a real database. Re-anchor every assertion to the two kernel jobs.
**Touches**: `apps/api/src/shared/kernel/scheduling/maintenance-runtime.int-spec.ts` · **Depends on**: T22d · **Requirement**: AD-022, CAT-01
**Done when**: no assertion references a job or lockId that left the kernel. The spec cannot be executed without Postgres — the Verifier runs it at the Final gate.
**Tests**: int (not runnable in the worker env) · **Gate**: `pnpm --filter api typecheck` + `pnpm --filter api lint` · **Commit**: `test(kernel): re-anchor maintenance int-spec to kernel jobs`

### T22j: Type-check `catalog/**`
**What**: nothing type-checks the catalog today. `apps/api/tsconfig.json` includes only `src/**/*` and `test/**/*`; `catalog:lint` validates `module.json` and the README contract shape, nothing more. Every entry's TypeScript — including the 27 e2e specs restored in wave 4b, whose relative import paths were rewritten by hand — is unverified by construction. Add a tsconfig that compiles `catalog/**` against the kernel's paths (`noEmit`), expose it as `pnpm catalog:typecheck`, and wire it into the pre-push hook next to the other gates.
**Touches**: `apps/api/tsconfig.catalog.json` (new), `package.json`, `lefthook.yml` · **Depends on**: T22f, T22g · **Requirement**: CAT-01, CAT-03
**Done when**: `pnpm catalog:typecheck` compiles every entry and reports the real errors. **Expect it to fail on first run** — report the full error list; fixing it is T22i's job, not this task's.
**Tests**: none (the command is the test) · **Gate**: `pnpm catalog:typecheck` (may exit non-zero — that is the deliverable) + `pnpm --filter api typecheck` + `pnpm catalog:lint` · **Commit**: `build(catalog): type-check catalog entries`

### T22i: Entry-to-entry ports move to the kernel (AD-024)
**What**: (i) implement **AD-024** — move the token + interface of every entry-to-entry port into the kernel (`apps/api/src/shared/kernel/ports/`), mirroring `ACCESS_POLICY`: `AuditTrailPurger`/`AUDIT_TRAIL_PURGER` (declared by identity in `53417b2`) and T17c's `ProfileImageStore`/`PROFILE_IMAGE_STORE`. Consumer and provider then both import from the kernel and neither imports the other. (ii) bind `AUDIT_TRAIL_PURGER` in the audit entry — `AuditTrailRepository.purgeEntities` at `catalog/audit/api/infrastructure/trail/audit-trail.repository.ts:40-51` already matches structurally. (iii) fix the cross-entry import in the test layer: `catalog/identity/single-tenant/api/testing/fake-mailer.ts` and 6 restored e2e (`access-link-activation`, `auth-outbox-email`, `authz`, `create-user-flow`, `user-trash`, `verify-email`) import `MAILER`/`Mailer` (2 also `delivery.dispatcher`) from `catalog/notification/api/domain/ports/mailer.ts`, so identity's e2e suite cannot run in a kernel-only child — the `SPEC_DEVIATION` marker in `fake-mailer.ts:1` comes out when it is fixed. (iv) fix everything `pnpm catalog:typecheck` (T22j) reports. (v) register any remaining entry-owned maintenance job through the AD-022 registry — wave 4b registered identity's two and audit's one; notification (historic lockId 3) and attachment (7, 8) were never checked.
**Touches**: `apps/api/src/shared/kernel/ports/**`, `catalog/{identity,attachment,audit,notification,tag}/**`, `apps/api/test/setup/**` · **Depends on**: T22j · **Requirement**: CAT-01, CAT-04, AD-021, AD-024
**Scope widened after T22j (wave 4c.1)**: `catalog:typecheck` reports 2 errors in `catalog/tag/**` and 8 errors that resolve against the legacy harness `apps/api/test/setup/**` (`allowAllRateLimiter` no longer exported by `app-factory`, `seed-user` does not exist there). Neither path was in the original `Touches`; both are in scope for sub-item (iv).
**Done when**: no entry imports another entry, in source or in test code; `pnpm catalog:typecheck` exits 0; no `SPEC_DEVIATION` marker for AD-021 remains.
**Tests**: unit for the kernel ports + the restored specs · **Gate**: `pnpm catalog:typecheck` + `pnpm --filter api typecheck` + `lint` + `test` + `pnpm catalog:lint` · **Commit**: one per sub-item, all carrying `Advisory: none — entrada ainda nao publicada, correcao interna do v1.0.0`

### T22k: `apps/api` lint must ignore the `catalog:typecheck` stage
**What**: `catalog:typecheck` leaves `apps/api/.catalog-stage/` on disk; eslint then walks files outside every tsconfig `project` and `pnpm --filter api lint` exits 1 with ~532 parsing errors. The lefthook pre-push gate runs the two in sequence, so it was red on ordering alone.
**Touches**: `apps/api/eslint.config.mjs` · **Depends on**: T22j · **Requirement**: CAT-03
**Done when**: `pnpm --filter api lint` exits 0 with `apps/api/.catalog-stage/` present on disk.
**Tests**: none (the command is the test) · **Gate**: `catalog:typecheck` then `pnpm --filter api lint` + `typecheck` · **Commit**: `build(api): eslint ignora o stage do catalog:typecheck`

### T22m: Break the `identity ↔ notification` cycle and close `catalog:typecheck` (AD-025)
**What**: the only cycle in the entry graph is closed by **test-only** imports of identity's `RATE_LIMITER` — 5 in `catalog/notification/api/__e2e__/notifications-{email,feed,inapp,product-extension,sse}.e2e-spec.ts` and 1 in `catalog/tag/api/__e2e__/tags.e2e-spec.ts`, all via `../../../../src/modules/identity/domain/ports/rate-limiter`. Audit's 2 and attachment's 2 `RATE_LIMITER` e2e imports do not close a cycle (both already declare `dependsOn: identity`) but travel with the same fix. The same 16 remaining `catalog:typecheck` errors are one cluster with them: 7× `TS2305 allowAllRateLimiter` (a helper that has never existed — `app-factory.ts` exports only `createE2eApp`) and 9× `TS2307 test/setup/seed-user` (a file that has never existed; identity ships its own `api/testing/seed-user.ts`). Per **AD-025**, invert only what closes the cycle; per **note 44**, do not build the `apps/api/src/shared/test/**` layer — that is `test-suite-refactor`'s. The 8 e2e that need a seeded user are cross-entry integration tests presupposing identity; decide their home and record it in the affected entries' README § Decisões.
**Touches**: `catalog/{identity,attachment,audit,notification,tag}/**`, `apps/api/test/setup/**`, `apps/api/src/shared/kernel/**` (only if a kernel-side rate-limit seam proves necessary) · **Depends on**: T22i, T22k · **Requirement**: CAT-01, CAT-04, AD-021, AD-025 · **Exclusive**: yes
**Done when**: `pnpm catalog:typecheck` exits **0**; no entry graph cycle remains including test files; the `SPEC_DEVIATION` at `catalog/identity/single-tenant/api/testing/fake-mailer.ts:1-14` is resolved or restated to match what actually remains.
**Tests**: the restored specs must compile; unit for any new kernel seam · **Gate**: `pnpm catalog:typecheck` + `pnpm --filter api typecheck` + `lint` + `test` + `pnpm catalog:lint` · **Commit**: one per sub-item, each carrying `Advisory: none — entrada ainda não publicada, correção interna do v1.0.0`

### T22l: `module.json.dependsOn` tells the truth (AD-025)
**What**: `identity.dependsOn` is `[]` while identity imports `NotificationRequested` from notification in **10 production use-cases** — the manifest lies, and `resolveDeps` would install identity into a child with no notification entry. Add it. `attachment` declares `[{name:"identity",range:">=1.0.0 <2.0.0"}]` and `audit` declares `[{name:"identity",range:"^1.0.0"}]` — same intent, two syntaxes; normalize. Then reflect every declared edge in each entry's README § Dependências, and state in § Decisões that per AD-025 the edge is a declared dependency rather than an inverted port because it does not close a cycle.
**Touches**: `catalog/*/module.json`, `catalog/*/README.md` · **Depends on**: T22m · **Requirement**: CAT-01, CAT-04, AD-025
**Done when**: every production cross-entry edge in the inventory (note 51) appears in the importing entry's `dependsOn`; `pnpm catalog:lint` exits 0; `resolveDeps` topo-sorts the five entries without a cycle.
**Tests**: `catalog:lint` + the `resolveDeps` unit tests · **Gate**: `pnpm catalog:lint` + `pnpm test:scripts` · **Commit**: `fix(catalog): dependsOn declara as arestas reais entre entradas`

### T22n: Refresh the kernel OpenAPI contract snapshot
**What**: the first-ever `pnpm --filter api test:e2e` run (at `b16e1ec`) failed one test — `apps/api/test/openapi-contract.e2e-spec.ts:25`, `expect(operations).toMatchSnapshot()`. The diff is a jest snapshot-serializer format change only (`Array [` → `[`); the two operations are byte-identical in meaning. Regenerate that one snapshot after **confirming** the operation set is still exactly `GET /health :: liveness` + `GET /ready :: readiness` — blindly running `-u` on a contract snapshot is how a real regression gets laundered into a format fix.
**Touches**: `apps/api/test/__snapshots__/openapi-contract.e2e-spec.ts.snap` · **Depends on**: T22e · **Requirement**: CTR-01
**Done when**: `pnpm --filter api test:e2e` exits 0, 8 passed / 8.
**Tests**: e2e · **Gate**: `pnpm --filter api test:e2e` + `typecheck` + `lint` · **Commit**: `test(api): atualiza snapshot do contrato do kernel`

### T22o: `expectContractSubset` must dereference `$ref` and compare field types
**What**: T22a proved, by running the helper, that parity could not meet its own acceptance criterion. `expectContractSubset` matched operations by `operationId` alone, unioned `schema.required` name arrays at the literal JSON position, **never dereferenced `$ref` and never compared `type`** — while `export-openapi.ts` writes the child's contract with `$ref`s intact. So parity proved a route still existed and still returned the same required field names for inline bodies, and nothing about field types or about any DTO behind a `$ref`. Teach the helper to resolve `$ref` **on both sides** and compare field types, keeping subset semantics (the child may add operations and optional fields).
**Touches**: `apps/api/src/shared/test/parity/contract-snapshot.ts`, `contract-snapshot.spec.ts` · **Depends on**: T22e · **Requirement**: CAT-03, PAR-01
**Done when**: unmutated real contract passes on both sides; a mutated field `type` fails naming operation and field; a removed required field fails; an extra optional field or extra operation still passes. One unit test each.
**Tests**: unit · **Gate**: `pnpm --filter api typecheck` + `lint` + `test` + `pnpm catalog:typecheck` · **Commit**: `fix(parity): resolve $ref e compara tipos no contrato`

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

### Wave 3 — 5 clusters + 2 fix tasks; C12 follow-up in flight, Build gate pending

| Cluster | Task | Commit | Result |
| --- | --- | --- | --- |
| C11 | T15 | `a92f61a` | `module add\|adopt\|list` + `advisory detect` wired to the libs; exit codes 3–9 all asserted — 22 tests |
| C12 | T17 | `33a5bd4` | `catalog/identity/single-tenant`: `api/**` verbatim (34 routes), `web/core` (session.types, permissions, route-access, resolve-access + 3 test files), `web/react` (session.queries, use-can), 5 parity specs, snapshot 34 ops, `migrations/custom/01` from `0002` — web/core vitest 15 passed, parity `tsc` 0 |
| C13 | T18 | `a69ddf3` | `catalog/attachment`: 55 files, `shared/kernel/upload/**` folded into `api/domain/upload/**` (0 occurrences left), 4 parity specs, snapshot 2 ops |
| C14 | T19 | `dd60720` | `catalog/audit`: 31 files, `shared/kernel/audit/**` folded into `api/infrastructure/trail/**` (0 occurrences left), 1 parity spec, snapshot 1 op |
| C14 | T19 fix | `6b1ccc4` | audit trail SQL shipped as `migrations/custom/01_audit_trail_capture.sql`; phantom `dependsOn: attachment` removed |
| C15 | T20 | `5ddaec6` | `catalog/notification`: 97 files, `dependsOn: []`, 3 parity specs (contract, template registry AD-007, mailer AD-008), snapshot 6 ops |
| C15 | T21 | `8a8ab4a` | `catalog/tag`: 40 files, `dependsOn: []`, 2 parity specs, snapshot 8 ops, guarded `audit.attach` migration |
| — | T13a | `acc542f` | linter fix: `vitest` allowed in `web/**/*.test.ts(x)`, `@testing-library/react` in `web/react` tests only — 19 tests |

**T13a was not in the plan.** `catalog-lint`'s `web/**` allow-list (design § 3) rejected `vitest` in `web/core/*.test.ts`, but the same design section *mandates* `core/*.test.ts (vitest, pure)` as an entry deliverable. The two rules contradicted for the first entry that shipped web tests. Workers were told to report linter defects rather than edit the linter, so C12 reported and the orchestrator dispatched the fix. Forbidden packages (router, `next/*`, component libs) stay forbidden even in test files.

**`dependsOn` graph as first built — contained a cycle.** The wave-3 gate read the five manifests: `identity → attachment`, `attachment → identity`, `audit → identity`, `notification → ∅`, `tag → ∅`. The first two form a cycle, and `resolveDeps` topo-sorts, so `pnpm platform module add identity --with-deps` would loop or fail opaquely. The orchestrator's instruction to verify the edge reached C12 only after it had already written the manifest. Two fixes dispatched:

- **T17b** — drop the `identity → attachment` edge (avatar path, degrades gracefully when attachment is absent) and document the optional coupling in README § Dependências. `attachment → identity` stays: it injects `UserDirectoryFacade` in `list-attachment-access-log.use-case.ts`.
- **T10a** (`8324fc6`) — **premise was wrong, and the worker checked instead of "fixing".** `resolveDeps` already had cycle detection since T10 (`plan.mjs:71-94`, DFS with `visiting`/`visited`, throws `CyclicDependencyError` naming the chain, handles diamonds). What was missing were the *tests*: T10's fixtures are acyclic, so the path was never exercised. T10a added fixtures + cases for self-edge, two-node, three-node, cycle reachable only from a non-target node, and a diamond that must not false-positive — 99 tests.
- **T15a** (`fa1014a`) — real gap T10a found and reported rather than fixed (no ownership): `lib/commands/add.mjs:131-136` caught only `MissingDepsError`, so `CyclicDependencyError` escaped as an **uncaught stack trace to the CLI user**, violating the no-leaked-internals rule and bypassing the exit-code contract. Now exit 5 with `ciclo de dependências detectado: cycle-a -> cycle-b -> cycle-a` on stderr, no trace. `resolveDeps` is called only from `add.mjs`, so no sibling hole — 100 tests.
- **T17b** (no commit) — **STOPPED correctly on a wrong premise.** The orchestrator assumed the `identity → attachment` edge was an optional avatar path. Verification found the opposite: `identity.module.ts:5,244` imports `AttachmentModule` unconditionally and three use cases inject `AttachmentFacade` as required constructor deps with no `@Optional()`, no nullable type, no fallback — `upload-avatar.use-case.ts:34-40,53,66`, `upload-access-link-avatar.use-case.ts:22-29,51`, `set-password.use-case.ts:39-53,117`. Without attachment, `IdentityModule` fails to **resolve at boot**. The worker refused to cut a real edge to make the graph look clean, which is the correct call and is why the next task exists.
- **T17c** (`ee825dd`) — **implements AD-021**, recorded on `main` as a result of T17b's finding (the task proved the plan wrong; the plan was fixed). Identity declares `ProfileImageStore` / `PROFILE_IMAGE_STORE` (`api/domain/ports/profile-image-store.ts`) with `upload`/`delete`/`exists` narrowed to what identity needs; attachment binds it (`AttachmentProfileImageStore`). Missing provider → `ProfileImageStoreMissingError` (501, RFC 7807) **at the call site**, never at construction; `set-password` without `avatarAttachmentId` never touches the port. Proof: `identity.module.spec.ts:47` asserts `IdentityModule.forRoot().imports === []`, `:50-59` compiles Nest with no provider bound and resolves both upload use cases. Worker ran its own mutation sensor — neutralising the null guard was killed by exactly the 3 new tests, 37 others green. `dependsOn`: identity `[]`, attachment `[identity]` — **cycle gone**.

**Open note from T17c for the Verifier:** `AttachmentModule` became `@Global()` so identity's injector can see the token without an import edge. It mirrors what `IdentityModule` already does for `ACCESS_POLICY`, but it also widens `AttachmentFacade`'s visibility beyond the token. Worth checking against RULE A inside a rendered child; the narrower alternative is a dedicated global sub-module exporting only the token. Neither CHANGELOG records the port inversion yet — arguably a `### Alterado` line in identity's unreleased `1.0.0`.

**Carry-forward from wave 3:**

17. **T22 — binding, entries do not build in a kernel-only child yet.** The identity entry's copied `api/**` still imports `shared/kernel/access/{permission.types,access-profile.types,define-permission-catalog,product-permission-catalogs}` and `shared/kernel/audit/audit-trail.repository` (in `purge-users`). This is correct under T17's copy-not-refactor rule, but T22 must relocate the first group into the identity entry and the second into the audit entry, or `pnpm platform module add identity` produces a tree that cannot compile. Documented in the entry's README § Portas do kernel consumidas.
18. **T22/T28 — binding, parity snapshots are shallow.** The repo has **no static `openapi.json`** (Swagger generates it at runtime), so all five `contract.snapshot.json` were derived from controller `@ApiOperation`/`@HttpCode` decorators, with response bodies reduced to status codes. `expectContractSubset` (T30) was designed to diff against the generated contract, so as it stands a changed field schema passes parity undetected. T22 runs `pnpm contract` and produces the kernel-only `openapi.json`; **after that, the five snapshots must be rebuilt from the real generated contract** before T28's `catalog:check` is treated as meaningful. Not fixed earlier on purpose: rebuilding snapshots before T22 regenerates the contract is discarded work.
19. **`audit.attach()` is per-entry, guarded.** The audit entry ships the `audit` schema, `audit.entries`, the append-only guard, `record_row_change` and the `audit.attach()` helper. The per-table `SELECT audit.attach(...)` statements belong to each table-owning entry (tag shipped `01_audit_attach_tags.sql`; identity's is in its follow-up). They are wrapped in a `DO $$` block guarded on the function existing, so an entry installs cleanly in a child that never adds audit — **no entry declares `dependsOn: audit`**. Notification is EXEMPT from audit at the source (`0003_audit_trail.sql:171`).
20. **T25 — `docs/catalog/catalog.md` lines 55–59** document the `web/**` allow-list without the test-file carve-out T13a added. Update it there; it was out of the fix worker's ownership.
21. **T12's inferred commands were correct.** T15 verified against `apps/api/package.json`: `drizzle-kit` runs via `pnpm --filter api exec drizzle-kit …` (no `db:check` wrapper exists) and `db:check:journal` is a real script run via `pnpm --filter api run db:check:journal`. `lib/migrations.mjs` needed no change — note 11 is closed.

### Wave 4 — DONE (C16 / T22, the cutover). Build gate full-unit PASS.

| Task | Commit | Result |
| --- | --- | --- |
| T22 | `e30648f` | `feat!: kernel-only template — modules move to the catalog` · trailer `Advisory: none — entrada ainda nao publicada, relocacao interna do v1.0.0` |
| T22 | `9b308cd` | `chore(contract): regenerate kernel-only client` |
| T22 | `3dba9b0` | `fix(web): desacopla bootstrap e teste de transporte do contrato de identidade` — unplanned third commit: the client regen deleted the identity hooks that `main.tsx` and `app/config/transport.test.ts` imported, and `--amend` is forbidden |

**Build gate (per package, all exit 0):** `pnpm --filter api typecheck` · `lint` · `test` **1052/151 → 297 passed / 42 suites** · `pnpm --filter web typecheck` · `lint` · `test` **108/34 → 68 passed / 24 files** · `pnpm test:scripts` 100/100 · `pnpm catalog:lint` · `pnpm --filter api run db:check:journal` (`journal ok — 2 migrations`). **Int/e2e NOT run** — no Postgres in the worker env; feeds note 9.

Kernel-only `openapi.json` now holds exactly **2 operations**: `GET /health :: liveness`, `GET /ready :: readiness`. RULE C: 16 tokens exactly as design § 2.4 lists, case-sensitive, `tag.` implemented as `/"?\btag"?\.[a-z_]/`, allow-list `shared/test/**/*.fixture.ts`, scanning api `shared/**` + `app.module.ts` + `db/schema.ts` and web `app/**` + `shared/**` — **0 hits**.

**Carry-forward closure:**

- **3 — DONE.** `export * from "./platform-schema"` landed; the spec now follows the re-export chain and ignores the generated specifier.
- **4 — PARTIAL.** `kernel/access/decorators.ts` still writes the legacy metadata keys because `openapi/openapi-config.ts`, `authz-coverage.spec.ts` and identity's guard chain read them. Kernel side → T22e; entry side → T22f.
- **5 — CONFIRMED-NEGATIVE.** Nothing to change.
- **13 — DONE.**
- **15 — DONE.** Shim removed, 5 fields deleted, `actor`/`extensions` now required, all store literals migrated.
- **17 — DONE.**
- **19 — N/A.**
- **9 — still open and now larger.** T8's e2e was never run (no live Postgres in any worker env) and the 26 e2e specs restored in wave 4b have never been executed either. The Verifier must actually run int+e2e; if Docker/testcontainers will not start, it reports a **PARTIAL** verdict naming every unverified assertion, starting with `apps/api/test/identity/authz.e2e-spec.ts:394`.

**Carry-forward from wave 4 (binding, do not re-derive):**

22. **The payload's ownership list was incomplete.** T22 also had to touch, legitimately in an exclusive wave: `apps/api/src/{main.ts,seeds/**,docs/**,openapi/transactional-coverage.spec.ts}`, `apps/api/src/shared/{config/env.ts,kernel/scheduling/**,kernel/logging/logger.factory.ts,kernel/shared-kernel.module.ts}`, `apps/api/test/**`, `apps/web/src/{main.tsx,pages/home/**,app/config/transport.test.ts}`. Widen the `Touches` union in later payloads.
23. **`pnpm --filter api contract` fails silently.** It is `ts-node apps/api/src/openapi/export-openapi.ts`; it needs **no** Postgres/Redis and fails only on missing env, but `NestFactory.create(…, { logger: false })` swallows the error through ExceptionsZone, so it exits 1 with an **empty log**. Pass `DATABASE_URL`/`REDIS_URL`/`WEB_ORIGIN`/`R2_*` inline. Tell every worker — the silent failure costs a long debug otherwise.
24. **Note 18 was wrong on one point: `openapi.json` *is* a static git-tracked file at the repo root.** Pre-cutover contract = **53 operations**, recoverable with `git show ee825dd:openapi.json`, so T22a has no scratchpad dependency. The rest of note 18 stands.
25. **`module-boundaries.spec.ts` stayed at `apps/api/src/modules/module-boundaries.spec.ts`.** The `modules/` dir survives holding only that file — deliberate: it sits outside RULE C's scan set so it does not flag its own token list, and it gives RULE A a resolvable target. RULE B, `BASE_SET` and the allow-list rows are gone.
26. **Two fragile spots in the baseline migration — flag to the Verifier.** `drizzle-kit generate` did **not** emit `CREATE SCHEMA "_kernel";` (T22 prepended it by hand), and the journal `when` values had to be bumped past `origin/main`'s max (`0000` = 1807072480194, `0001` = 1817072480194) or `db:check:journal` fails.
27. **`RouteAccess` is a breaking shape change for children.** `apps/web/src/shared/config/route-access.types.ts` did not exist and was created; the type now matches design § 3 exactly (`self` → `authenticated`, `permission` → `key: string`). T25 owes it a v1.0.0 changelog line.
28. **`/docs` is gone, not merely unmounted — and is remounted kernel-only.** T22 removed the route from `main.ts` and deleted `apps/api/src/docs/**`; nothing is exposed, but the kernel-only template lost its contract UI. At `ee825dd:apps/api/src/main.ts:8-9,55-58,66` it was mounted through `setupDocsAuth(app, document)`, a login gate depending on identity's session. **Decision:** the kernel remounts the Scalar UI at `/docs` with no module coupling (T22e); the login-gated variant becomes a recipe in the identity entry's README.
29. **T22 deleted entry-owned content that no entry carries** (a T17/T18 gap; all recoverable at `ee825dd`) — restored in wave 4b:
    - **identity** (T22f): `apps/api/test/identity/{access-catalog,access-history,access-link-activation,auth-anti-enum,auth-csrf-none,auth-login,auth-logout,auth-outbox-email,auth-rate-limit,auth-reset-token-logging,auth-session,authz,create-user-flow,devices,docs-login,idempotency,user-trash,verify-email}.e2e-spec.ts` (18) · `apps/api/test/setup/seed-user.ts` · `apps/api/src/seeds/{bootstrap-master,master-user.seed,run,types}.ts`
    - **attachment** (T22g): `apps/api/test/attachment/{attachment-delete,attachment-download}.e2e-spec.ts`
    - **audit** (T22g): `apps/api/test/{audit-product-extension.e2e-spec.ts,audit/audit.e2e-spec.ts}`
    - **notification** (T22g): `apps/api/test/{notifications-email,notifications-feed,notifications-inapp,notifications-product-extension,notifications-sse}.e2e-spec.ts` · `apps/api/test/setup/fake-mailer.ts` · `apps/api/test/fixtures/sample-templates/sample-welcome.hbs`
    - **tag** (T22g): `apps/api/test/tag/tags.e2e-spec.ts`
    - **kernel** (T22e): `apps/api/src/docs/{docs-auth,docs-login.template}.ts` · `apps/api/test/openapi-contract.e2e-spec.ts` + its snapshot
    `apps/api/test/setup/app-factory.ts` was modified, not deleted — confirm it still serves the restored specs.
30. **AD-021 violation still open in the identity entry.** `catalog/identity/single-tenant/api/application/use-cases/purge-users/purge-users.use-case.ts:1` imports the audit entry directly, so identity cannot install alone. The T22 worker marked it `SPEC_DEVIATION` in-file. → T22f.
31. **AD-022 recorded in `STATE.md`.** Maintenance jobs are a closed kernel union today, so no catalog entry can register one and identity's `purge-users` is dead code in every child. → T22d.

### Wave 4b.1 — DONE (C16a / T22d ∥ C16b / T22e). Build gate PASS, 9/9 exit 0.

| Task | Cluster | Commit | Result |
| --- | --- | --- | --- |
| T22d | C16a | `70e5517` | `refactor(kernel): maintenance jobs via runtime registry` |
| T22d | C16a | `04cd952` | `style(kernel): chaves no arrow void do spec de manutencao` — lint fixup, `--amend` forbidden |
| T22e | C16b | `ed5d0e1` | `feat(api): kernel-only /docs mount` — new `apps/api/src/docs/docs.ts` + `main.ts` |
| T22e | C16b | `9c5118f` | `test(api): restore kernel contract e2e` — spec + snapshot for the 2-operation contract |
| T22e | C16b | `dd52317` | `refactor(kernel): drop legacy access metadata keys` — `decorators.ts`, `decorators.spec.ts`, `openapi/openapi-config.ts`, `openapi/authz-coverage.spec.ts` |

**Build gate (per package, all exit 0):** `pnpm --filter api typecheck` · `lint` · `test` **299 passed / 42 suites** · `pnpm --filter web typecheck` · `lint` · `test` **68 passed / 24 files** · `pnpm test:scripts` 100/100 · `pnpm catalog:lint` · `pnpm --filter api run db:check:journal` (`journal ok — 2 migrations em ordem`). Tree clean at `dd52317`. Int/e2e not run (no Postgres/Docker in the worker env).

**T22d design.** `MaintenanceRegistry` is a process-level singleton in a new `maintenance-registry.ts` (`register`/`require`/`has`/`names`/`entries`), throwing on a duplicate name and on a colliding `lockId` (the message names the current owner). The kernel's two jobs register in that same file through the public `registerMaintenanceJob`, so the import graph guarantees they exist before any `@MaintenanceJob` class is evaluated. **No DI provider on purpose**: the decorator runs at class-definition time, before a Nest container exists, and a second lookup path would break AD-009's "one lookup path". `maintenance-schedule.ts` and its spec are deleted; `maintenance-registry.spec.ts` supersedes them with 15 unit tests. All T22d payload premises verified correct.

**T22e premise corrections.** `env.ts` requires only `DATABASE_URL`/`REDIS_URL`/`WEB_ORIGIN` — **no `R2_*`**; note 23's env list is wider than reality. `IS_MACHINE_TO_MACHINE_KEY` is **not** a legacy access-requirement key (it is a CSRF opt-out flag) and stays in `decorators.ts`. `apps/api/test/setup/app-factory.ts` was **not** modified by T22 and needed nothing. `openapi.json` was regenerated to verify and came out byte-identical, so it was left untouched.

**Carry-forward from wave 4b.1:**

32. **`docs/back/back-arch.md:456` is stale.** It documents "entrada em `maintenance-schedule.ts` com cron e lockId unico"; that file no longer exists. Must become `registerMaintenanceJob(...)` no topo do arquivo do job. Folded into the T26 card (C19, wave 5).
33. **`maintenance-runtime.int-spec.ts` has been asserting dead jobs since T22.** It expects advisory-lock holders 4/5/6/7/8 and the application names `api:job:email-change.revert`, `api:job:auth-events.purge`, `api:job:attachment-access-log.purge`, while the runtime it drives now runs only `outbox.purge` (lockId 1) and `idempotency.purge` (lockId 2). It compiles — T22d migrated its registry reads — but it will fail on a real database. → new task **T22h** (C23, wave 5).
34. **`/docs` cannot be exercised over HTTP in the e2e suite.** `apps/api/test/setup/scalar-stub.ts` is wired through jest `moduleNameMapper` because the real `@scalar/nestjs-api-reference` is ESM/CJS-incompatible under jest, so the package is a no-op there. The restored `openapi-contract.e2e-spec.ts` validates the contract against the static `openapi.json` snapshot, **not** a live `GET /docs` call. The mount itself is therefore unverified by automated tests — flag to the Verifier.
35. **`authz-coverage.spec.ts` lost its "no duplicate declaration" check.** Once the legacy keys collapse into the single `ACCESS_REQUIREMENT` key, `SetMetadata` silently overwrites, so a double declaration is undetectable at that layer. `SelfService()` and `OptionalAuth()` now write `ACCESS_REQUIREMENT` directly (`authenticated` / `public`) instead of a bare legacy flag with no kernel-readable equivalent.
36. **`MaintenanceJobName` is now `string`** (open namespace), and the old "lockId é único por job, salvo compartilhamento declarado" test lost its `declaredShares` escape hatch — AD-022 makes a shared `lockId` a hard throw, so declared sharing is no longer expressible. `maintenance-schedule.spec.ts:138-146` survives inside `maintenance-registry.spec.ts` as "varredura resolve exatamente um arquivo de corpo por job do kernel", scoped to `KERNEL_MAINTENANCE_JOBS` (catalog job bodies live outside `apps/api/src`, so the scan cannot see them) and strengthened: it also asserts the scan finds no `@MaintenanceJob` name in `apps/api/src` outside the kernel set.

### Wave 4b.2 — DONE (C16c / T22f ∥ C16d / T22g). Build gate PASS, 9/9 exit 0.

| Task | Cluster | Commit | Result |
| --- | --- | --- | --- |
| T22f | C16c | `53417b2` | `fix(catalog): identity declares a port for the audit trail` — AD-021 inversion, `SPEC_DEVIATION` removed, +1 unit test |
| T22f | C16c | `0f1332e` | `feat(catalog): identity registers its jobs via the maintenance registry` — +3 tests |
| T22f | C16c | `7fbffda` | `refactor(catalog): identity reads ACCESS_REQUIREMENT` — csrf guard + 2 specs + 2 parity specs |
| T22f | C16c | `db182fd` | `test(catalog): restore identity-owned specs and seeds` — 17 e2e + `api/testing/{seed-user,fake-mailer,seeds/*}` |
| T22f | C16c | `52d4d3a` | `docs(catalog): identity README and CHANGELOG for the v1 cutover` |
| T22g | C16d | `7aea2ec` | `test(catalog): restore attachment e2e specs` — 2 specs into `api/__e2e__/` |
| T22g | C16d | `5572519` | `test(catalog): restore audit e2e specs` — the 2 specs already existed since `dd60720` but with unresolvable imports; repaired |
| T22g | C16d | `6414c4a` | `test(catalog): restore notification specs and fixtures` — 5 e2e + `fake-mailer.ts` + `sample-welcome.hbs` |
| T22g | C16d | `6199fa0` | `test(catalog): restore tag e2e spec` |
| T22g | C16d | `4004124` | `feat(catalog): audit registers its purge job via the maintenance registry` |

**Build gate (per package, all exit 0):** api typecheck · lint · test **299 passed / 42 suites** · web typecheck · lint · test **68 passed / 24 files** · `test:scripts` 100/100 · `catalog:lint` · `db:check:journal` ok. Tree clean at `4004124`. Int/e2e not run (no Postgres/Docker in the worker env).

**Maintenance `lockId` ledger after AD-022** (a collision throws at boot — keep this current): kernel **1** `outbox.purge`, **2** `idempotency.purge`; identity **4** `email-change.revert`, **5** `auth-events.purge`; audit **10** `audit.purge` (the v0.2 value was 6; C16d chose 10 deliberately to stay clear of the low range). Notification's historic **3** and attachment's **7**/**8** were never checked — see T22i (v).

**Carry-forward from wave 4b.2:**

37. **`module.json.files` does not exist.** `catalog/schema/module.schema.json:6` is `additionalProperties: false` with no `files` property, and no entry has one — the catalog is convention-over-config (design § 4), files are discovered by directory. Both workers correctly refused to add it. **The instruction to "add every restored path to `module.json.files`" in the T22f/T22g cards was wrong** and is void; `catalog:lint` confirms the restores are complete without it.
38. **AD-022's motivating example was wrong: `purge-users` is not a maintenance job** — it is an admin route plus a use case. The jobs that were actually dead code in every child are identity's **`auth-events.purge`** and **`email-change.revert`**, whose `@MaintenanceJob(name)` threw at class-evaluation time without a prior registration. The decision itself is unaffected and AD-022 has been corrected in `.specs/STATE.md`.
39. **Nothing type-checks `catalog/**` — the largest verification hole in this feature.** No tsconfig `include` reaches it (`apps/api/tsconfig.json` is `src/**/*` + `test/**/*`) and `catalog:lint` only validates `module.json` and README shape. So the four catalog commits of C16c and the five of C16d **provably could not move typecheck, lint or test**, and the 27 e2e specs restored in wave 4b — whose relative import paths were all rewritten by hand — are unverified by construction. → new task **T22j** (C25, wave 4c.1).
40. **AD-021 has a hole its own precedent shares: a port's token cannot live in the consumer entry.** C16c declared `AUDIT_TRAIL_PURGER` inside `catalog/identity/**`; C16d then could not bind it from `catalog/audit/**` without importing the type from identity — an AD-021 violation in the reverse direction — and correctly refused to guess. T17c's `PROFILE_IMAGE_STORE` has the same shape. The `ACCESS_POLICY` precedent works only because its token lives in the **kernel**. → **AD-024**: entry-to-entry port tokens and interfaces move to `apps/api/src/shared/kernel/ports/`. → new task **T22i** (C24, wave 4c.2, exclusive).
41. **The restored identity test layer imports the notification entry.** `catalog/identity/single-tenant/api/testing/fake-mailer.ts:1` and 6 restored e2e (`access-link-activation`, `auth-outbox-email`, `authz`, `create-user-flow`, `user-trash`, `verify-email`) import `MAILER`/`Mailer` from `catalog/notification/api/domain/ports/mailer.ts`; 2 of them also pull `delivery.dispatcher`. Identity's e2e suite therefore cannot run in a kernel-only child. Marked `SPEC_DEVIATION` in `fake-mailer.ts:1`. → folded into **T22i (iii)**.
42. **`docs-login.e2e-spec.ts` was dropped, not restored** — 17 identity e2e, not 18. Its target `apps/api/src/docs/docs-auth` ceased to exist in `ed5d0e1`, and the identity README has no `/docs` recipe to re-target it at (zero hits). Recorded in the entry's README § Paridade and CHANGELOG. **The login-gated `/docs` recipe is still owed** — note 28 promised it; T25 or the entry README must deliver it, otherwise the behaviour is simply gone.
43. **A missing `AUDIT_TRAIL_PURGER` degrades to a no-op, not to an RFC 7807 501** — deliberately unlike `PROFILE_IMAGE_STORE`. Without the audit entry there is no trail holding the subject's PII, so the purge is already complete; a 501 would kill trash-purge in a valid kernel-only install. Rationale is in the port's docstring and the README § Dependências.
44. **The e2e specs still import the legacy harness at `apps/api/test/setup/*`.** The AD-021 test-harness layer (`apps/api/src/shared/test/{unit,int,e2e}`) does not exist yet — only `parity/` does — and the kernel was frozen for this sub-wave, so both workers rewrote relative paths against the legacy location. That is `test-suite-refactor`'s work, not this feature's; it is recorded here so the Verifier does not read it as a regression.
45. **Three `SPEC_DEVIATION` markers remain in the tree** (`rg -n SPEC_DEVIATION catalog apps`): `catalog/notification/api/application/templates/notification-template-registry.ts:37` (design C-NTPL wants a `NOTIFICATION_TEMPLATE_SOURCES` registry), `catalog/identity/single-tenant/api/testing/fake-mailer.ts:1` (note 41 → T22i), `apps/api/src/shared/kernel/logging/logger.factory.ts:55` (`sessionId` dropped from the log → note 16, T25's changelog line). The Verifier must account for all three.

### Wave 4c.1 — DONE (C25 / T22j, alone). Build gate PASS.

| Task | Cluster | Commit | Result |
| --- | --- | --- | --- |
| T22j | C25 | `7791a19` | `build(catalog): type-check catalog entries` — new `apps/api/tsconfig.catalog.json`, root `catalog:typecheck` script, `lefthook.yml` pre-push wiring, `.gitignore` |

**Build gate:** `pnpm catalog:typecheck` **exit 1 — the expected deliverable** · `pnpm --filter api typecheck` exit 0 · `pnpm catalog:lint` exit 0 · `pnpm test:scripts` 100/100 · `pnpm --filter api run db:check:journal` (`journal ok — 2 migrations em ordem`). Tree clean at `7791a19`.

**T22j design — staging, not `rootDirs`.** Option 1 (compile `catalog/**` in place with `paths`/`rootDirs`) was tried and **proved impossible**: under both `NodeNext` and `bundler` moduleResolution the same 609–610 `TS2307 shared/kernel` errors persisted, because `rootDirs` does not honour a relative import that escapes *above* the declared root into a sibling root's real ancestor; and files physically under `catalog/` cannot reach `apps/api/node_modules` by walk-up, so `@nestjs/*`, `supertest` and `pg` failed to resolve as well. The script therefore stages: `apps/api/.catalog-stage/` (gitignored) symlinks `apps/api/src/{db,docs,openapi,shared,app.module.ts,main.ts,platform-modules.ts,tracing.bootstrap.ts}` and `apps/api/test`, copies `catalog/<entry>/(<variant>/)?api` into `.catalog-stage/src/modules/<entry>`, then runs `pnpm --filter api exec tsc -p tsconfig.catalog.json --noEmit` against that real installed layout. Zero path noise: every one of the 30 errors is a real type error. The staging chain is inline in the root `package.json` script (the task owned no `scripts/platform/*` file). Wired into lefthook **pre-push**, next to `typecheck` — **pre-push is red until T22i lands**, by design.

**The 30 errors — T22j's deliverable, and T22i (iv)'s work list:**

| Entry | Count | Errors |
| --- | --- | --- |
| attachment | 4 | `__e2e__/attachment-delete.e2e-spec.ts` TS2305 no export `allowAllRateLimiter` from `test/setup/app-factory` + TS2307 `test/setup/seed-user` · `__e2e__/attachment-download.e2e-spec.ts` TS2307 `test/setup/seed-user` · `upload-attachment.use-case.int-spec.ts:62` TS2353 `userId` not in `RequestContextStore` |
| audit | 10 | `__e2e__/audit-product-extension.e2e-spec.ts` + `__e2e__/audit.e2e-spec.ts` — TS2305 `allowAllRateLimiter` + TS2307 `seed-user` · `list-audit-entries.use-case.spec.ts:6` TS2305 no export `RequestAccess` from `shared/kernel/context/request-context` · `list-audit-entries.use-case.ts:62` TS2339 `access` not on `RequestContextStore` · `activity-area-resolver.ts:24,25` TS2345 string not assignable to the permission-key union · `audit-trigger.int-spec.ts:198` TS2353 `userId` |
| identity | 7 | `__e2e__/verify-email.e2e-spec.ts` TS2305 `allowAllRateLimiter` · TS2353 `userId` at `identity-access.policy.spec.ts:37`, `auth.middleware.spec.ts:40`, `change-password.use-case.int-spec.ts:51`, `email-change-flow.int-spec.ts:62` and `:313`, `drizzle-auth-event.repository.int-spec.ts:331` · `permission-catalog.spec.ts:4` TS2724 no export `REQUIRE_PERMISSION_KEY` (suggests `RequirePermission`) |
| notification | 7 | TS2307 `seed-user` in `__e2e__/notifications-{email,feed,inapp}.e2e-spec.ts` · TS2305 `allowAllRateLimiter` in `__e2e__/notifications-{product-extension,sse}.e2e-spec.ts` · `require-recipient.ts:10` TS2339 `userId` not on `RequestContextStore` |
| tag | 2 | `__e2e__/tags.e2e-spec.ts` TS2305 `allowAllRateLimiter` + TS2307 `seed-user` |

Four root causes: (a) `apps/api/test/setup/seed-user.ts` does not exist; (b) `app-factory` no longer exports `allowAllRateLimiter`; (c) the kernel's `RequestContextStore` / `request-context` shape changed — `userId` and `access` are gone and `RequestAccess` is no longer exported; (d) `REQUIRE_PERMISSION_KEY` was renamed to `RequirePermission`. All four are entry code written against a pre-cutover kernel; **none is path noise**, which is exactly what note 39 predicted.

**Carry-forward from wave 4c.1:**

46. **`catalog:typecheck` covers `catalog/<entry>/(<variant>/)?api/**` only.** `web/**` and `parity/**` are excluded — the first is frontend TypeScript with a different tsconfig, the second is compiled only once copied next to the module in a child. The worker flagged this rather than dropping it silently. **`parity/**` is a real remaining hole**: those specs are hand-maintained TypeScript with rewritten imports and nothing compiles them either. → folded into **T22a** (C22, wave 5), which already owns `parity/`.
47. **The staging chain lives inline in the root `package.json` script.** It uses `ln -s`/`cp`, so it is POSIX-only, and it rebuilds `.catalog-stage/` on every invocation. Acceptable for a template repo whose other gates are already POSIX shell, but it is a wart: if `catalog:typecheck` ever needs to become cross-platform or incremental, it should move to `scripts/platform/catalog-typecheck.mjs` next to the other tooling. Not blocking v1.0.0.
48. **T22i's `Touches` was too narrow.** The 30 errors reach `catalog/tag/**` (2) and the legacy harness `apps/api/test/setup/**` (8, causes (a) and (b) above), neither of which the T22i card listed. The card has been widened in § Task Breakdown. The `seed-user` fix carries a real AD-021 decision: identity already ships its own `api/testing/seed-user.ts` (`db182fd`), so four other entries cannot simply import it — that would be the entry-to-entry violation of note 41 in a new place.

### Wave 4c.2 — DONE, PARTIAL by design (C24 / T22i, exclusive; + C26 / T22k follow-up). Build gate PASS 9/9.

| Task | Cluster | Commit | Result |
| --- | --- | --- | --- |
| T22i (i) | C24 | `2fa2794` | AD-024 port move — `shared/kernel/profile-image/profile-image-store.port.ts` and `shared/kernel/audit-trail/audit-trail-purger.port.ts`; killed 2 attachment→identity **source** imports |
| T22i (ii) | C24 | `327d6ba` | `AuditTrailRepository implements AuditTrailPurger`; the already-`@Global()` `AuditTrailModule` binds `useExisting` and exports the token |
| T22i (iii) | C24 | — | **BLOCKED at the declared harness boundary** — `MAILER` does *not* become a kernel port |
| T22i (iv) | C24 | `2b196d4` | `catalog:typecheck` **30 → 16**; every non-e2e error fixed |
| T22i (v) | C24 | `16f4bb9` | 3 missing `registerMaintenanceJob` added, historic lockIds recovered from `550f5b2:…/maintenance-schedule.ts` |
| T22i | C24 | `eb0b8e5` | corrected the `fake-mailer.ts:1` `SPEC_DEVIATION` — its proposed fix was wrong, moving the specs into notification only reverses the edge |
| T22k | C26 | `0ca7e32` | `build(api): eslint ignora o stage do catalog:typecheck` — flat-config `{ ignores: [".catalog-stage/**"] }` |

**Build gate (per package, all exit 0):** api typecheck · lint · test **299 passed / 42 suites** · web typecheck · lint · test **68 passed / 24 files** · `test:scripts` 100/100 · `catalog:lint` · `db:check:journal` ok. `pnpm catalog:typecheck` **exit 1, 16 errors** — 7× TS2305 `allowAllRateLimiter`, 9× TS2307 `test/setup/seed-user`, every one in an `__e2e__` file. Tree clean at `0ca7e32`.

**AD-024 landed beside the concept, not in a `ports/` tree.** `apps/api/src/shared/kernel/ports/` never existed; the kernel's actual convention is `access/access-policy.port.ts`. A second `ports/` tree would be a second lookup path for the same kind of thing (AD-009), so the ports went to `shared/kernel/{profile-image,audit-trail}/*.port.ts`. `requireProfileImageStore` and `ProfileImageStoreMissingError` stayed in identity — degradation policy is the consumer's, not the port's. AD-024 in `.specs/STATE.md` has been corrected to match.

**RULE C did not force a rename.** The token list is at `apps/api/src/modules/module-boundaries.spec.ts:522-539`, scanning the raw text of `apps/api/src/shared/**`, case-sensitive. Its audit tokens are `auditTrail`, `audit_trail`, `AuditRegistry` — **not** `audit` — so `AUDIT_TRAIL_PURGER`/`AuditTrailPurger` pass, as does `ProfileImageStore`. Nothing was weakened. See note 49.

**Carry-forward from wave 4c.2:**

49. **The RULE C token list is narrower than its intent.** It catches `auditTrail`/`audit_trail`/`AuditRegistry` but not the PascalCase, SCREAMING_SNAKE or kebab forms of the same concept, so `AuditTrailPurger` and `AUDIT_TRAIL_PURGER` entered the kernel without tripping it. Either the list gains those forms — and then AD-024's ports need module-agnostic names — or the intent is genuinely narrower than it reads. **Unresolved; decide it in T24 or at the Verifier**, do not silently rely on the gap.
50. **No gate anywhere executes a single catalog spec.** `pnpm --filter api test` does not see `catalog/**` at all — jest's roots are `apps/api/src` + `apps/api/test`. The entries' unit, int and e2e specs only run inside a rendered child after `module add`, which means `pnpm catalog:check` (T27/T28) is the **only** thing in this repo that can ever execute them. `catalog:typecheck` proves they compile; nothing proves they pass. This is note 9 generalised from e2e to the entire catalog test surface and it is the single most important thing to tell the Verifier.
51. **Full entry-to-entry inventory (measured at `eb0b8e5`), the basis of AD-025.** Production-source edges: `identity → notification` ×10 (`NotificationRequested`, in `change-password`, `create-user`, `login`, `request-email-change`, `request-password-reset`, `resend-access-link`, `resend-verification`, `reset-password`, `revoke-device`, `set-password`); `audit → identity` ×7 (`audit.module.ts:3` imports `IdentityModule`; `UserDirectoryFacade` ×2; `permission-catalog.facade` ×3; `IDENTITY_ACCESS`/`IdentityAccess`); `attachment → identity` ×1 (`UserDirectoryFacade`). **That subgraph is acyclic** — topo order `notification, identity, audit, attachment, tag`. Test-only edges add `notification → identity` ×5 and `tag → identity` ×1 (all `RATE_LIMITER`), plus identity→notification ×12, audit→identity ×7, attachment→identity ×3. **The only cycle in the whole graph is `identity ↔ notification`, and it is closed exclusively by test files.** → **AD-025**, → T22m, T22l.
52. **Rate limiting is identity's, not the kernel's.** `RATE_LIMITER` is declared at `catalog/identity/single-tenant/api/domain/ports/rate-limiter` and the guard at `…/api/api/guards/rate-limit.guard.ts`. The pre-dispatch assumption that `allowAllRateLimiter` belonged in the kernel harness `app-factory.ts` was **wrong** — putting it there would make the kernel test harness import an entry token, the exact violation being fixed. T22m must find another seam.
53. **`api/api/` nesting inside every entry is intentional, not a restore artefact.** `catalog/<entry>/api/` is the install root; the inner `api/` is the HTTP layer (`controllers`, `contracts`, `facades`). All five entries share it. Nothing to fix.
54. **`apps/api/src/modules/` still exists and holds exactly one file** — `module-boundaries.spec.ts`. The cutover deleted the module trees but kept the boundary spec there. Payloads that call the directory non-existent are wrong.

### Wave 4d — DONE (C27 / T22m exclusive, then C28 / T22l). Build gate PASS 10/10, **and int + e2e ran for the first time**.

| Task | Cluster | Commit | Result |
| --- | --- | --- | --- |
| T22m | C27 | `e805f03` | `allowAllRateLimiter` created in identity's testing layer — it had never existed anywhere; identity's own `verify-email.e2e-spec.ts` rewired |
| T22m | C27 | `f0e7c26` | audit ×2, attachment ×2, tag ×1 import `seedUser`/`allowAllRateLimiter` from identity's testing layer along a declared edge; `catalog/tag/module.json` gains `dependsOn: identity` |
| T22m | C27 | `5ef5e9e` | 4 cross-entry e2e moved verbatim into identity (**AD-026**); `notifications-product-extension` keeps its home, its `RATE_LIMITER` override dropped as dead weight; the `fake-mailer` `SPEC_DEVIATION` replaced by a note stating the edge is legal under AD-025 |
| T22l | C28 | `b16e1ec` | `dependsOn` declares the real edges; range syntax normalised to `">=1.0.0 <2.0.0"` to match every entry's `kernelRange`; three README/manifest contradictions fixed |

**Build gate (per package, all exit 0):** api typecheck · lint · test **299 passed / 42 suites** · web typecheck · lint · test **68 passed / 24 files** · `test:scripts` 100/100 · `catalog:lint` · **`catalog:typecheck` 0 errors (was 16)** · `db:check:journal` ok. Tree clean at `b16e1ec`.

**The first int + e2e run in this repo's history.** Docker turned out to be available on the host (daemon 29.6.1, `postgres_dev` live; the suites provision their own testcontainers through `apps/api/test/setup/docker-runtime.ts`), so the assumption carried since wave 2 — "no Postgres/Docker in any worker env" — was true only of the sandboxes, never of the machine. Results at `b16e1ec`:
- `pnpm --filter api test:int` → **exit 1**, Suites 1 failed / 7 passed / 8, Tests **10 failed / 95 passed / 105**. All 10 in `maintenance-runtime.int-spec.ts`, at lines 204, 233, 266, 291, 310, 351, 387, 454, 471, 522. Failure shapes: `expected "failed", received "skipped"` and `toHaveLength 1 → 0`, i.e. the job bodies never ran. **Exactly what note 33 predicted** → T22h.
- `pnpm --filter api test:e2e` → **exit 1**, Suites 1 failed / 2 passed / 3, Tests **1 failed / 7 passed / 8**. `openapi-contract.e2e-spec.ts:25` snapshot, diff `Array [` → `[`, content identical → new task **T22n**.

**Carry-forward from wave 4d:**

55. **Note 9 is closed for the kernel suites, and only for those.** int and e2e now demonstrably run on this machine, and 102 of 113 assertions pass with both failures diagnosed and assigned. What is still unproven is the entire catalog test surface — see note 50, which is now the headline risk of the feature. The Verifier must run int + e2e (they work) **and** `pnpm catalog:check` (T28), and must not treat a green kernel suite as evidence about the entries.
56. **Cross-entry e2e placement is now a rule, not a judgement call** — AD-026. The rule is directional: downstream in the `dependsOn` DAG. It also means an entry's e2e count is not a measure of its own coverage: identity now carries 21 e2e, four of which primarily exercise notification.
57. **The kernel test harness still knows entry schema names.** `apps/api/test/setup/test-db.ts` exports `truncateIdentity` / `truncateTag` / `truncateAttachment` — kernel-side code naming three entries. T22m found it and correctly left it alone: it is `test-suite-refactor`'s AD-021 harness-layering work (note 44), not a v1 regression. Flag to the Verifier so it is not read as one.

### Wave 5 — DONE (C17, C18, C19, C20, C22, C23, C29, C30; ≤4 in flight). Build gate PASS **12/12**, int and e2e included.

| Task | Cluster | Commit | Result |
| --- | --- | --- | --- |
| T22n | C29 | `c37da6f` | `test(api): atualiza snapshot do contrato do kernel` — serializer-only diff, operation set confirmed still exactly the 2 kernel ops before regenerating |
| T22h | C23 | `909aff1` | `test(kernel): re-anchor maintenance int-spec to kernel jobs` — int **95/105 → 105/105** |
| T24 | C18 | `845d369` | `feat(platform): catalog-check pre-tag gate` — +16 unit tests (`test:scripts` 100 → 116); new `lib/catalog-graph.mjs` and `lib/render-child.mjs` |
| T22a (½) | C22 | `1079dcd` | `docs(catalog): registra a inversão da porta de imagem de perfil` — T17c in identity's and attachment's `1.0.0` |
| T25 | C19 | `a6f347d` | `docs(template): v1 kernel-only model, catalog, changelog v1.0.0` |
| T26 | C19 | `1b63264` | `docs(handbooks): kernel ports, module anatomy, parity` |
| T27 | C20 | `e1a4f6f` | `feat(skills): port-module-update e catalog-modules` — 11 symlinks under `.claude/skills/` |
| T23 | C17 | `e6cb737` | `feat(smoke): kernel-only profile, fake-product fixture removed` — +17 tests (`test:scripts` 116 → 133) |
| T22o | C30 | `b01cd3a` | `fix(parity): resolve $ref e compara tipos no contrato` — api test 299 → **303** |
| T22a (½) | C22b | `48e6855` | `test(catalog): parity snapshots from the real contract` — all five rebuilt with their `components.schemas` closure |

**Build gate, 12/12 exit 0:** api typecheck · lint · test **303 / 42 suites** · web typecheck · lint · test **68 / 24** · `test:scripts` **133/133** · `catalog:lint` · `catalog:typecheck` **0 errors** · `db:check:journal` ok · **`test:int` 105/105, 8 suites** · **`test:e2e` 8/8, 3 suites**. Tree clean at `48e6855`.

**Carry-forward from wave 5:**

58. **Parity was structurally incapable of catching a retyped field, and now is not.** T22a refused to rebuild the snapshots and reported why, having executed the helper rather than reasoned about it: `expectContractSubset` keyed on `operationId` alone, unioned `schema.required` name arrays at the literal JSON position, and never dereferenced `$ref` or compared `type` — while the child's `openapi.json` keeps `$ref`s verbatim. Dereferencing one side only made the **unmutated** baseline throw (`perdeu o campo obrigatório "email"`). → **T22o**, which resolves `$ref` on both sides against each document's own `components`, guards cycles twice (a pointer set per chain, plus a memoised `snapshotPointer::childPointer` pair per operation), and **changed the matching key from `operationId` to `METHOD path`** with `operationId` asserted as an equality check on the matched route — two entries can collide on an id in a merged child, and the old key made a re-path invisible.
59. **All five snapshots pinned nothing but the route.** They carried `$ref`s and **no `components` section at all**, so every reference dangled; a dangling snapshot-side `$ref` pins nothing and is skipped. Identity's looked like a full real-schema copy and discriminated exactly as little as the four status-only ones. T22a's rebuild carries the transitive closure: identity 34 ops / 27 schemas, tag 8/8, notification 6/2, attachment 2/1, audit 1/1 — 51 entry operations plus the kernel's 2 = 53, no leftovers, no `allOf` anywhere in the real contract. Discrimination is proven per entry by a real mutation run, e.g. `contract-snapshot: operação "uploadAttachments" mudou o tipo do campo "responses.201.uploads[].attachmentId" de "string" para "number"`.
60. **`maintenance-runtime.int-spec.ts` had no runtime defect behind it.** Every one of the 10 failures was a stale fixture: holder locks used identity's and attachment's lockIds (4/5/6/7/8) for what are now the kernel's two jobs (1, 2), so the test-held locks never actually conflicted and leaked detached jobs cascaded into later tests. One genuine test bug was found and fixed on the way — the `tryStartDetached` in-flight assertion was reading `outbox.purge`'s carried-over `"skipped"` outcome from the previous test, so it could only pass while locking was broken; it now uses a throwaway `detached-probe` job on free lockId 6.
61. **`template-smoke.mjs` exported nothing** — a monolithic top-level script, not a library with helpers to extract. T24 therefore created `scripts/platform/lib/render-child.mjs` (`renderChild`, `installChild`) mirroring its copier invocation, and T23 consumed it unchanged. It is now shared by `catalog-check.mjs` and `template-smoke.mjs`: **changing it changes both gates.** T23's Postgres provisioning uses the raw `docker` CLI rather than `@testcontainers/postgresql`, which is an `apps/api` devDependency and unreachable from root scripts — no new dependency was added.
62. **Design § 7's lock shape does not match the code.** It shows a repo-wide `catalog: { source, ref }` block; `scripts/platform/lib/apply.mjs::writeLock` actually writes only a per-module `catalogRef`. Also **no `catalog/<entry>@x.y.z` git tag exists anywhere** — AD-016's tagging has never been exercised. T27 documented both as gaps inside `port-module-update`'s SKILL rather than silently writing fiction. Neither is a v1 blocker; both are real debt.
63. **`d92f9c7` corrected design § 8 but missed § 2.2.** Line 87 still promised `shared/kernel/idempotency/*`: `user_id` → `actor_id`, on **main** as well as on the branch — the same non-existent column the whole feature has been told not to mention. Found by the T25/T26 worker checking a payload premise. Fixed on main at `2cfd1d5`. `job-context.ts`'s `userId` → `actorId` **is** a real rename and stays.

### Wave 6 — IN PROGRESS (C31 `catalog:check` drive-to-completion; one worker per defect, sequential). Headline: note 50.

| Task | Cluster | Commit | Result |
| --- | --- | --- | --- |
| T28 | C31 | `58f8bb8` | `## Follow-ups absorvidos` — all five `absorbs` genuinely `[]`; nothing from issues #2–#8 was ever absorbed (attachment still has #8's access-trail/404 ordering, audit still has #6's leaked fixtures). Worker refused to invent lines |
| T28a | C31 | `47b2a2e` + `450f277` | `catalog-source.mjs`: `<path>#<ref>` was one literal path; `defaultCatalogRef` never descended into `catalog/` for a local source. `test:scripts` 133 → 141 |
| T28b | C31 | `e3b31e2` | `catalog:check` simulates kernel **1.0.0** (highest `## vX.Y.Z` in `docs/dev/template-changelog.md`) by patching `_commit` in the child's `.copier-answers.yml`. No tag is created. `test:scripts` → 149 |
| T28c | C31 | `77593aa` | kernel journal `when` 1807072480194/1817072480194 → 1787062300194/1787062360194 — T22 had hand-bumped them into 2027, so every child-generated migration was born out of order and `module add` could never succeed |
| T28d | C31 | `f125204` | `check-journal.ts` recognises a **baseline reset** (added migration at idx 0 + vanished base entries), loud pt-BR notice. api unit 303 → **308 / 43**; `db:check:journal` exit 0 |
| T28e | C31 | `f0ff79b` | `export-openapi.ts` passes `abortOnError: false` — Nest no longer swallows bootstrap failures into an empty log; error text is `message`, not `stack` |
| T28e | C31 | `d629b37` | `catalog-check.mjs::withContractEnv` supplies inert `DATABASE_URL`/`REDIS_URL`/`WEB_ORIGIN` to the `contract` step. **Deviation from the card**: injected at the call site instead of `cp .env.example .env`; accepted — never overrides a present value, unit-tested. `test:scripts` → 150 |
| T28f | C31 | `422f12a` | `catalog-check.mjs`: per-step timeout (3 min contract, 10 min others) killing the process group → exit 7 naming the step; scratch dir cleaned on every exit path unless `--keep`. `test:scripts` 150 → 156 |
| T28f | C31 | `6058988` | `createRedis()` (`shared/infra/redis/redis.provider.ts`) gets `lazyConnect: true` — `RedisModule`'s `useFactory` built `new Redis(...)` eagerly at `NestFactory.create`. Nothing in boot relied on an eager connection (health pings Postgres only). Root `openapi.json` byte-identical after the export |
| T28f | C31 | `bd6bbf7` | `storage.config.ts` validates `R2_*` synchronously via Zod (fail-fast, no I/O) — the card's "needs no `R2_*`" premise was wrong; `CONTRACT_ENV_DEFAULTS` now covers them |
| T28g | C31 | `fc40483` | `catalog/notification/api/infrastructure/realtime/redis-subscriber.provider.ts` — same eager `new Redis(env().REDIS_URL)`; now lazy, subscription still happens at app start |
| T28h | C31 | `537a199` | **first failures from ever-executed entry specs**: 12/14 were `ctx.getActor is not a function` — the **specs' fakes** were stale (`{ get: () => ({ userId }) }`); kernel `RequestContext.getActor(): Actor \| null` (`request-context.ts:82`) and `require-recipient.ts` were already right. 8 spec files |
| T28h | C31 | `d638865` | `template-registry.parity.spec.ts` asserted `email` present while its own name says `email?` — `device_revoked`/`password_set` are system-only channels. Assertion now requires `catalog`+`type`, `email` optional subset; `SPEC_DEVIATION` comment at lines 18-23 |
| T28j | C31 | — | **STOPPED, correctly**: handler, module registration and snapshot for `deletePermissionTemplate` are all right; the child's `openapi.json` had **zero identity routes**, not one. Routed to T28k |
| T28k | C31 | `49689c1` | `apply.mjs::renderPlatformModules` emitted bare class references; `IdentityModule` is a Nest dynamic module (`@Module({})` empty, everything inside `forRoot()`), so **no child ever registered an identity route** and `NestFactory.create` never complained. Registry now emits `resolvePlatformModule()` calling `forRoot()` when present. Proven in a kept child: 36 paths / **42 operations** (identity 34 + notification 6 + kernel 2). `test:scripts` 156 → 157. Design § 5.3 had the wrong example (§ 2.3 had it right) — fixed on main |
| T28i | C31 | `f10b3d9` | all five `contract.parity.spec.ts` resolved `openapi.json` wrongly (4× `join(cwd, "openapi.json")`, identity a 6-level `__dirname` walk); now the same `join(process.cwd(), "..", "..", "openapi.json")` the export uses. The helper `shared/test/parity/contract-snapshot.ts` only consumes a path |
| T28w | C31 | `10abfe2` | `@NonTransactional(reason)` beside `@Transactional`/`@ReadOnly` (metadata only, throws without a reason); `TX_MARKER` accepts `@NonTransactional("…")` with a single string literal only — the marker must stay greppable. Kernel allowlist stays empty by design (no module paths in kernel files) |
| T28x | C31 | `37c8a9a` `96b5181` `08837ac` `e21469a` + `f7bf3db` `ef1007f` `a312e62` `47fa6a8` | 6 boundary violations: attachment `multipart-files.ts` relocated infra → `api/controllers` (pure HTTP glue); `upload-profiles.ts` takes a local `UploadProfileConfig` instead of the root config; notification `ConnectionRegistryPort`/`CONNECTION_REGISTRY` in `domain/ports`, `SseConnectionRegistry` implements it, module wires `useExisting`; identity `professional-tables.facade` narrowed to row-shape types via `application/professional-schedule-rows.ts` (Drizzle tables stay in infrastructure, no consumer exists — **worker judgment call, review**), new `identity-access.facade.ts` exposes `IDENTITY_ACCESS`; audit imports it through that facade. `@NonTransactional` on `get-attachment-for-download` and `upload-access-link-avatar`. Three fix-up commits for `import-x/order` (eslint cannot run on `catalog/**` in the worktree — `.catalog-stage` ignored, no tsconfig project; only the child sees lint) and one for the reason written as `"a" + "b"` (regex wants one literal) |

**`catalog:check` progression:** exit 3 (source resolution, T28a) → 8 (kernel range, T28b) → 9 (journal order, T28c/T28d) → 7 (contract step, empty log, T28e) → **hang** at `d629b37`: `module add notification` installs (migrations `notifications` 12 cols, `notification_deliveries` 12 cols applied), then `pnpm contract` in the child loops forever on `[ioredis] Unhandled error event: ReplyError: NOAUTH Authentication required.` (~2 lines/s, host Redis at the placeholder `redis://localhost:6379` demands AUTH). Two orphan runs and ~10 `/tmp/catalog-check-*` dirs were found — the script cleans nothing on failure. → **T28f**. **Round 2 at `fc40483`: the `contract` step passed and notification's specs executed for the first time** — `jest modules/notification`: Suites 10 failed / 16 passed / 26, Tests **14 failed / 80 passed / 94**; three shapes → T28h (×13), T28i (×1). Exit 7 at `module add notification`. **Round 3 at `d638865`: notification 94/94; identity 584/585** — the one failure was contract parity, which correctly caught an openapi with no identity routes at all (→ T28j → T28k). Round 4 at `49689c1`: identity contract fails on missing `PASSWORD_PEPPER`/`BREACH_CHECK_MODE` → T28l `1cbbeaa` (`writeEnv` wrote `<root>/.env`, child reads `apps/api/.env`; also skipped when the file did not exist). Round 5 `1cbbeaa`: identity 585/585, web-tests step `pnpm --filter web vitest` → no such script → T28m `afdcebc` (`test --`). Round 6 `afdcebc`: identity web 83/83; `module add tag` crashes on doubled `migrations/custom/` → T28n `8a49150`+`f0fddc0` (manifest carried the prefix; `migrations.mjs` now fails typed exit 9), T28o `1c8afb3` (same prefix in audit + manifest lint test; `tag.dependsOn` stays without audit — optional coupling by README, `IF EXISTS`). Round 7 `1c8afb3`: tag 10/10, audit 36/39 `ctx.getExtension is not a function` → T28p `b1c3ee1` (stale spec fake; kernel exposes it at `request-context.ts:107`). **Round 8 `b1c3ee1`: all 5 entries green (94/585/10/39/97)**; child final gate `pnpm check` fails on web typecheck/lint of identity's web part → T28q `afe93f3`; parity specs type errors under `tsc` (jest is transpile-only) → T28r `478331f`+`12644e0`+`20f6454`. Round 9 `20f6454`: `api:lint` 168 errors in copied entry files + generated registry → T28s `7cb656b`…`647bc5b` (5 commits, one per entry; `.bind(prototype)` for unbound-method, seeds `console`→`process.stdout.write`), T28t `5be2914` (registry imports sorted, `import type` last). **Round 10 `647bc5b`: gate `check` 5/5, web 83/83, `api:test` 6 kernel suites red — they asserted template state ("no module installed") instead of invariants** → T28u `edb0906`+`513fed4`+`b08ec1f` (design correction, see note 67) ∥ T28v `286785c`+`0b0f69c`+`7bfc2ca`+`84b2498` (`schemaExports` listed `.schema` namespaces; identity `TYPE_BASE` still `/auth`; `list-notifications` `@ReadOnly()`). T28u probe at its tip: child api test **2 failed / 164 passed suites** — both entry-side (see Handoff). Counts at `84b2498`: api unit 44 suites / 313 tests, `test:scripts` 166, `catalog:typecheck` 0. Round 11 `a312e62`: boundaries green, child `api:lint` 6 `import-x/order` in T28x files → fix-ups. Round 12 `a312e62`: check 5/5, api 166/167 — `transactional-coverage` still flags attachment (reason as `"a" + "b"`) → `47fa6a8`. **Round 13 `47fa6a8`: `pnpm catalog:check` exit 0** — 5/5 entries install, child `pnpm check` 3/3, child `pnpm test` api **167/167 suites, 1139/1139 tests**, web 27/27 files, 83/83 tests (per-entry: notification 94, identity 585 + web 83, tag 10, audit 39, attachment 97). Log `/tmp/claude-1000/catalog-check-logs/catalog-check-r13.log`. **Wave 6 gate DONE.**

**Carry-forward from wave 6 (so far):**

64. **The `contract` step is not side-effect free.** `d629b37`'s premise — "only builds the Nest graph, opens no connection" — is false: a kernel provider constructs an ioredis client eagerly at instantiation, so `NestFactory.create` alone connects. With no Redis reachable the export would have failed fast; with a Redis that demands AUTH it retries forever. Any gate that boots `AppModule` without infrastructure (contract export, `catalog:check`, future smoke) depends on that seam being lazy.
65. **`catalog-check.mjs` had no step timeout and no cleanup on failure**, so a hung child step hangs the gate and every failed run leaks a rendered child under `/tmp`. Fixed by T28f (timeout → exit 7 with the step named; cleanup on every exit path unless `--keep`).
66. **Entry specs pass, the contract can still be empty.** Identity's 584 scoped specs build the module through `IdentityModule.forRoot()` themselves; only the *generated registry* took the bare class. The parity spec was the single thing in the gate able to see that the child served no identity route — exactly the kind of gap note 50 warned about, one level up: tests of the entry prove the entry, not the wiring the installer generates. Any future dynamic-module entry relies on `resolvePlatformModule`.
67. **Kernel specs a product inherits must hold with 0..N entries installed.** Six kernel suites (`module-boundaries`, `maintenance-registry`, `check-journal`, `transactional-coverage`, `schema-completeness`, `error-namespace`) asserted *template state* — empty scans, exactly two kernel jobs, exactly two journal tags — so the first `module add` turned the product's own suite red. Design § 2.4 did not anticipate it. Fixed by T28u: each spec now asserts an invariant over whatever exists (kernel names ⊆ registered; kernel tags = ordered journal prefix; every use-case transactional-or-marked; aggregation resolved transitively through re-exports); the "template ships empty" fact lives in one dedicated `apps/api/src/modules/template-kernel-only.spec.ts`, deleted by `module add` (`apply.mjs::removeTemplateOnlyFiles`, `TEMPLATE_ONLY_FILES`). `--rollback` does not recreate it (documented). Lesson for any future kernel guard: write it as "for all present", never "none present".
68. **Two installer/entry contracts only `catalog:check` could see**: `customMigrations` must be bare filenames (manifest lint test now enforces over real entries); `schemaExports` must list `*.table.ts`, never the pgSchema namespace barrel. Both passed every unit gate and failed only in the rendered child.
69. **Lint only exists for `catalog/**` in the rendered child.** `apps/api/eslint.config.mjs` ignores `.catalog-stage/**` and `projectService` has no tsconfig covering it, so a worker cannot run `import-x/order` (or any rule) on entry sources in the template; two extra rounds were spent on that. `catalog:typecheck` covers types only. Candidate follow-up (not in this feature): a `catalog:lint` stage mirroring `catalog:typecheck`.
70. **Greppable markers are literal-only.** `TX_MARKER` regex accepts `@NonTransactional("…")` with a single string literal — a concatenated reason passes tsc and the decorator's runtime check yet fails the guard. The spec for the marker should say so explicitly (T28w's JSDoc does).

---

## Tools per task

- MCP: none required. Workers nest `repo-scout` (haiku/sonnet) and `shell-runner` (haiku).
- Skills: `tlc-spec-driven` (workers read `references/cards/worker.md`); T17–T21 may use `domain-modeling` for README § Decisões; T27 authors skills by hand.
- Model per cluster as in the Wave Plan `Notes` (opus only: C1, C2, C7, C12, C16).
