# Audit 2026-08-23 Remediation Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute
flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source
of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/audit-2026-08-23-remediation/design.md`
**Spec**: `.specs/features/audit-2026-08-23-remediation/spec.md`
**Evidence ledger**: `.specs/features/audit-2026-08-23-remediation/research.md` — cite `file:line`
from it; do not re-run the sweep.
**Status**: Draft
**Base**: `v2.2.1` (`git tag -l` → `v0.1.0 … v2.2.0 v2.2.1`; `v2.3.0` authored but **untagged**)

---

## 0. Resolutions carried into Tasks

The design left four things for this phase. All four are settled here; nothing below is a guess.

### 0.1 The nine ACs of "nothing names the owner" are pinned (design.md § *Risks*, § *Execute notes*)

`spec.md`'s § Requirement Traceability table is **authoritative**. `research.md`'s narrative labels
are shifted up by one across BRAND-05/06/07 and never emit a `(BRAND-04)` label at all. Two
independent passes over the audit annex (`docs/platform_template/audit-2026-08-23.json`) agree, and
they agree by *content*, not by number.

| Story AC | Requirement | Audit finding | Anchor evidence |
| --- | --- | --- | --- |
| 1 · brand-free cookie/storage/contract defaults | BRAND-01 | F-agnostic-leaks-3 **C**, F-extensibility-any-product-4 | `apps/api/src/openapi/openapi-config.ts:48,53` |
| 2 · CSRF cookie name read from `configureClient` | BRAND-02 | F-extensibility-any-product-4 | `packages/api-client/src/client.ts:109-114` |
| 3 · validated `APP_TIMEZONE` | TZ-01 | F-api-kernel-5 **C** | `apps/api/src/shared/kernel/clock/bucket-sql.ts:11,25` |
| 4 · issue area-labels from a product placeholder | BRAND-03 | F-agents-skills-1 **C**, F-agnostic-leaks-8 **C**, F-docs-consistency-8, F-known-debt-1 | `docs/agents/issue-tracker.md.jinja:29-31` |
| 5 · harness P0 taxonomy is generic | **BRAND-04** | F-agents-skills-4 | `.claude/hooks/subagent-model-required.mjs:42` |
| 6 · `infra.md` / `deploy.md` hold platform facts only | **BRAND-05** | F-agnostic-leaks-1 **C** | `docs/agents/infra.md.jinja` (221 lines) |
| 7 · no legacy-MySQL backfill | **BRAND-06** | F-docs-consistency-2 **C** | `docs/dev/local-environment.md:59-64` |
| 8 · module-boundary guard scan coverage | BRAND-07 | F-tests-quality-gates-4 | `apps/api/src/modules/module-boundaries.spec.ts:539-545` |
| 9 · no workflow wired to a nonexistent module | BRAND-08 | F-ci-docker-infra-5 | `.github/workflows/feedback-triage.yml:37,64,161` |

**Consequence for the exclusive-task list.** `design.md` § *Execute notes* item 4 calls the
harness-taxonomy edit "BRAND-05's". Under the pinning above that task is **BRAND-04** (T43,
exclusive, wave 5). **BRAND-05** is the `infra.md.jinja` / `deploy.md.jinja` rewrite — ordinary,
clusterable (T12, T13). Both labels are carried in the task bodies so this is not re-derived wrongly.

### 0.2 RUN-04 and `.prettierrc` are not built here

`design.md` § *Execute notes* item 5 lists `.prettierrc` + the root devDependency removal as an
exclusive task of this feature. § *Components* area A and § *Tech Decisions* both say the opposite:
RUN-04 is **delegated** to `.specs/features/prettier-format-gate/`, whose four Assumption rows are
owner-confirmed and whose seam wins (`spec.md:70`, `context.md:109-119`). The traceability table
already records RUN-04 as `Phase: Verifier`.

**Therefore: no `.prettierrc` task exists in this plan.** The exclusivity fact is recorded in
§ 4 *Exclusive inventory* as *inherited, owned by the sibling*, so a later editor does not cluster a
`.prettierrc` change beside something else. The Verifier records RUN-04 **satisfied-by-sibling**
with that feature's commit as evidence, and asserts only that `pnpm format:check` is green at this
feature's HEAD.

Same resolution for a second inherited contradiction: `design.md` § *Integration Points* says
`ci.yml` gains `contract:check` **and `format:check`**. The owner-confirmed sibling seam puts the
format gate in a **template-only** `.github/workflows/format.yml` and adds **nothing** to `ci.yml`,
because `ci.yml` ships to the child and a red format job there is a manual migration step AD-034
forbids on a non-major. **`contract:check` goes into `ci.yml` (T36); `format:check` does not.**

### 0.3 Corrections to citations the design inherited (verified on disk at HEAD `38d4063`)

| Design/ledger says | On disk | Effect |
| --- | --- | --- |
| `runLint` is in `scripts/platform/lib/lint.mjs` | `runLint` is at `scripts/platform/catalog-lint.mjs:111`; `lib/lint.mjs` only exports the `lint*` helpers | Fork C's `lintEntryBump` is **exported** from `lib/lint.mjs` and **aggregated** in `catalog-lint.mjs` — two files, both in T33's `Touches` |
| `entryChangedWithoutBump` at `release-preflight.mjs:43-52` | `:47-56` (comment block inserted above) | T33 quotes the current range |
| 9 copies of the broken path guard | **8** — `scripts/platform/template-update-ci.mjs` was deleted by `eb907ef`, an ancestor of HEAD | T2 fixes 8 sites and asserts the count |
| `catalog/tag/` is 43 files | **48** | T58 builds the skeleton from the real list |
| LOC-05 slugs live in `route-access.ts` | that file does not exist; slugs are at `apps/web/src/shared/config/routes.ts:10-11` | T27/T40 target the real file |
| `apps/web/public/` ships a favicon | the directory **does not exist**; `apps/web/nginx.conf:53` returns `index.html` for `/favicon.ico` | T24 creates it |
| `apps/web/src/app/router/guards.ts` (identity README recipe) | does not exist | T25 fixes the recipe, not the file |
| `storage-unavailable.error.ts` must be created | it **already exists** at `apps/api/src/shared/infra/storage/` | T54 implements the adapter only |
| `.claude/skills/tlc-spec-driven/**` | **symlink** → `.agents/skills/tlc-spec-driven` | every task lists only the `.agents/...` path; listing both would own one file twice |
| all five `ADV-20260822-0*` `affects` | `>=1.0.0 <2.0.0` — the range that excludes the vulnerable `2.0.0` population | T42 corrects all five |

### 0.4 Cross-feature file collisions (not visible to `wave-plan-check.mjs`)

`prettier-format-gate` is `Status: Draft`, blocked on the same `v2.3.0` tag, and executes **first**
once unblocked. Its `Touches` and this plan's overlap on six files. These are **not** intra-feature
races — no hook catches them — so whichever feature lands second rebases:

`copier.yml` · `docs/dev/template-changelog.md` · `scripts/template-smoke.mjs` ·
`docs/agents/harness.md` · `package.json` · `lefthook-local.yml`

Files this plan must **never** touch (sibling-owned): `.prettierrc`, `.prettierignore`,
`.vscode/settings.json`, `.github/workflows/format.yml`,
`scripts/platform/__tests__/prettier-config.test.mjs`,
`catalog/notification/api/infrastructure/mailer/email-theme.ts`.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found:
> `docs/test/testing.md` (AD-028 single Vitest runner, layout, lint rules), `docs/code-quality.md:118-126`,
> `docs/arch/back.md:55,69,95,101`, `docs/arch/front.md:141-142,188`, `AGENTS.md.jinja:39-43`,
> `vitest.coverage.mts:45-68` (thresholds), `.github/workflows/{ci,catalog}.yml`.
> **Coverage floor is a hard gate**: 90 on statements/branches/functions/lines, globally and per
> `apps/api/src/**` and `apps/web/src/**` (AD-027).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| API kernel domain / application (`apps/api/src/shared/kernel/**`, `shared/config/**`) | unit | All branches; 1:1 to the spec AC the task closes; every listed edge case | `apps/api/src/**/*.spec.ts` | `pnpm vitest run --project api <path>` |
| API infrastructure / repositories | integration | Key query paths + error paths; **no DB mock** — testcontainers only (`docs/test/testing.md:109,121,130`) | `apps/api/{src,test}/**/*.int-spec.ts` | `pnpm vitest run --config vitest.integration.mts --project api-int <path>` |
| API routes / controllers / boot | e2e | Every route the task touches: happy + edge + error | `apps/api/test/**/*.e2e-spec.ts` | `pnpm vitest run --config vitest.integration.mts --project api-e2e <path>` |
| Web app / shared / pages | unit | All branches; every listed edge case; `@testing-library/jest-dom/vitest` | `apps/web/src/**/*.test.{ts,tsx}` | `pnpm vitest run --project web <path>` |
| Catalog entry code | unit | 1:1 to the entry AC; entry specs live beside the code | `catalog/<entry>/**/*.spec.ts`, `**/*.int-spec.ts` | `pnpm vitest run --project api <path>` |
| Catalog entry parity | parity snapshot | Snapshot regenerated **deliberately, in its own task**, never incidentally | `catalog/<entry>/parity/*.parity.spec.ts` + `contract.snapshot.json` | `pnpm catalog:check <entry>` (rendered product only) |
| Platform scripts / tooling (`scripts/**`) | unit (`node:test`) | Every branch of the repaired defect + one regression case per repaired site | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| Claude hooks (`.claude/hooks/**`) | unit (`node:test`) | Every decision branch of the hook's contract | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| Docs, `.jinja`, manifests, workflows, `copier.yml` | none — gate only | Build/lint gate; **plus** a committed guard spec wherever the AC's proof is `gate` | — | `pnpm check`, `pnpm catalog:lint`, `pnpm template:smoke` |
| Contract artefacts (`openapi.json`, `packages/api-client/src/**`) | gate | `pnpm contract` then an empty `git diff --exit-code` | — | `pnpm contract && git diff --exit-code openapi.json packages/api-client/src` |

**Provenance note.** `apps/api` and `apps/web` have **no `test` script** — the repo root is the only
runner (AD-028). `docs/agents/workflow.md:108` still cites a Jest `testRegex`; that is doc drift and
is itself repaired by TOOL-09 (T14). `scripts/platform/__tests__/*.test.mjs` runs under Node's
native `node --test`, **not** Vitest — tooling tasks therefore gate with `pnpm test:scripts`.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tasks with unit tests only | `pnpm vitest run --project api\|web <touched path>` — or `pnpm test:scripts` when the task touches `scripts/**` or `.claude/hooks/**` |
| Full | Tasks with e2e/integration tests | Quick command **plus** `pnpm vitest run --config vitest.integration.mts --project api-int\|api-e2e <the spec files this task created or touched>` — never the whole suite |
| Build | Once per wave, by the orchestrator through the runner, after every cluster reported | `pnpm check` (= `turbo lint typecheck`) + unit scoped to the union of the wave's `Touches`. `full-unit` variant = `pnpm check && pnpm test`. A docs/config/CI-only wave = `pnpm check` alone |
| Final | Once per feature, at the Verifier's build-level gate | `pnpm check && pnpm test && pnpm test:scripts && pnpm test:coverage && pnpm catalog:lint && pnpm catalog:typecheck && pnpm template:smoke` |

**Suite-cost rule (hard).** The full unit suite and the complete integration/e2e suite each run
**once per feature**, at the Final gate. `pnpm test:coverage` (which merges unit + int + e2e in one
process and enforces the 90 floor) is a **Final-gate-only** command — never a per-task or per-wave
gate. Per-task gates stay path-scoped; the Build gate runs once per wave and never inside a worker.

**Two Final gates.** The release boundary is binding, so the Verifier runs **twice**: pass 1 after
wave 7 (scoped to the `v2.4.0` requirements), pass 2 after wave 14 (the whole feature). Both are
full-suite runs; that is the deliberate cost of shipping two tags from one spec.

---

## Wave Plan

Waves run in order (barrier + Build gate between them). Clusters inside a wave run **in parallel**,
one worker each; tasks inside a cluster run in the listed order. Exclusive waves hold one task and
nothing else in flight.

**The release boundary is binding**: `v2.4.0` (waves 1–7) and `v3.0.0` (waves 8–14) never share a
wave, and the major's waves start only after the minor's Verifier passes and the owner has tagged.

| Wave | Cluster | Tasks (in order) | Files (union of Touches) | Notes |
| ---- | ------- | ---------------- | ------------------------ | ----- |
| 1 | C1 | T1 → T2 → T3 → T4 → T5 | `scripts/platform/lib/entries.mjs`, `scripts/platform/lib/is-main.mjs`, `scripts/platform/lib/copier-exclude.mjs`, `scripts/platform/lib/lint.mjs`, `scripts/platform/lib/catalog-graph.mjs`, `scripts/platform/lib/template-version.mjs`, `scripts/platform/lib/commands/add.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/catalog-check.mjs`, `scripts/platform/catalog-stage.mjs`, `scripts/platform/advisory-required.mjs`, `scripts/platform/jest-to-vitest.mjs`, `scripts/platform/release-preflight.mjs`, `scripts/platform/cli.mjs`, `scripts/template-smoke.mjs`, `scripts/platform/__tests__/entries.test.mjs`, `scripts/platform/__tests__/is-main.test.mjs`, `scripts/platform/__tests__/excluded-imports.test.mjs`, `scripts/platform/__tests__/template-version.test.mjs`, `scripts/platform/__tests__/smoke-runs-cli.test.mjs` | platform CLI import surface · gate: scoped (`pnpm test:scripts`) |
| 1 | C2 | T6 → T7 → T8 → T9 → T10 → T11 | `apps/api/src/shared/config/env.ts`, `apps/api/src/shared/config/env.spec.ts`, `apps/api/.env.example`, `apps/web/.env.example`, `apps/api/Dockerfile`, `apps/api/Dockerfile.dev`, `apps/api/docker-entrypoint.dev.sh`, `docker-compose.yml`, `README.md.jinja`, `.github/README.md`, `docs/dev/local-environment.md`, `TEMPLATE.md`, `apps/api/package.json`, `scripts/platform/__tests__/documented-commands.test.mjs`, `scripts/platform/__tests__/canonical-port.test.mjs`, `scripts/platform/__tests__/fixture-repair-documented.test.mjs` | first-run truth · gate: **full-unit** (touches `shared/config/env.ts`) |
| 1 | C3 | T12 → T13 → T14 → T15 → T16 | `docs/agents/infra.md.jinja`, `docs/dev/deploy.md.jinja`, `docs/agents/workflow.md`, `AGENTS.md.jinja`, `docs/agents/README.md`, `docs/agents/issue-tracker.md.jinja`, `docs/agents/communication.md`, `scripts/platform/__tests__/docs-no-owner-infra.test.mjs` | product-facing docs de-branding · gate: scoped |
| 2 | C4 | T17 → T18 → T19 → T20 → T21 → T22 | `scripts/platform/lib/apply.mjs`, `scripts/platform/lib/plan.mjs`, `scripts/platform/lib/commands/add.mjs`, `scripts/platform/lib/commands/advisory.mjs`, `scripts/platform/lib/exit-codes.mjs`, `scripts/platform/lib/advisories.mjs`, `.claude/hooks/pending-advisories.mjs`, `docs/advisories/README.md`, `docs/advisories/ADV-20260822-04.md`, `.agents/skills/port-module-update/SKILL.md`, `scripts/platform/__tests__/lock-paths.test.mjs`, `scripts/platform/__tests__/rollback.test.mjs`, `scripts/platform/__tests__/advisory-exit-codes.test.mjs`, `scripts/platform/__tests__/pending-advisories-hook.test.mjs`, `scripts/platform/__tests__/compute-pending-catalogref.test.mjs` | lock / rollback / advisory truth · gate: scoped |
| 2 | C5 | T23 → T24 → T25 → T26 → T27 | `apps/web/index.html`, `apps/web/public/`, `apps/web/nginx.conf`, `apps/web/src/app/router/shell.tsx`, `apps/web/src/main.tsx`, `apps/web/src/app/providers/app-providers.tsx`, `apps/web/src/shared/config/routes.ts`, `apps/web/src/shared/lib/last-location.ts`, `apps/web/src/shared/lib/auth-redirect.ts`, `apps/web/src/app/config/zod-locale.ts`, `apps/web/src/app/router/route-pending.tsx`, `apps/web/src/pages/not-found/ui/not-found-page.tsx`, `apps/web/src/pages/error/ui/error-page.tsx`, `apps/web/src/app/router/shell.test.tsx`, `apps/web/src/shared/config/routes.test.ts`, `apps/web/src/shared/lib/last-location.test.ts`, `catalog/identity/single-tenant/README.md` | web locale + route/guard seams · gate: **full-unit** (`apps/web/src/shared/**` is kernel surface) |
| 2 | C6 | T28 → T29 → T30 → T31 → T32 | `apps/api/src/shared/kernel/errors/problem-details.filter.ts`, `apps/api/src/shared/kernel/errors/problem-details.filter.spec.ts`, `apps/api/src/shared/kernel/errors/domain.error.ts`, `apps/api/src/shared/kernel/i18n/`, `apps/api/src/main.ts`, `apps/api/src/bootstrap.product.ts`, `apps/api/src/shared/kernel/context/request-context.ts`, `apps/api/src/shared/kernel/context/request-context.spec.ts`, `apps/api/src/shared/kernel/context/request-context.middleware.ts`, `apps/api/src/shared/infra/database/application-pool.int-spec.ts`, `docs/dev/template.md`, `apps/api/test/bootstrap-product.e2e-spec.ts` | API kernel locale + boot/tenant seams · gate: **full-unit** (kernel) |
| 3 | C7 | T33 → T34 → T35 → T36 | `scripts/platform/lib/lint.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/release-preflight.mjs`, `.github/workflows/catalog.yml`, `.github/workflows/ci.yml`, `package.json`, `docs/arch/back.md`, `scripts/platform/__tests__/entry-bump-lint.test.mjs`, `scripts/platform/__tests__/advisory-path-scope.test.mjs`, `scripts/platform/__tests__/contract-check-ci.test.mjs` | catalog version gate + contract drift gate · gate: scoped |
| 3 | C8 | T37 → T38 → T39 → T40 | `docs/code-quality.md`, `docs/agents/communication.md`, `docs/agents/issue-tracker.md.jinja`, `AGENTS.md.jinja`, `docs/arch/front.md`, `docs/adr/README.md`, `docs/advisories/README.md`, `docs/test/testing.md`, `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts`, `catalog/identity/single-tenant/api/application/access-policy.ts`, `catalog/identity/single-tenant/api/domain/ports/user.repository.ts`, `catalog/identity/single-tenant/api/application/use-cases/update-user.use-case.ts`, `catalog/identity/single-tenant/api/domain/errors.ts`, `catalog/notification/api/application/templates/base-template-sources.ts`, `catalog/notification/api/application/catalog/notification-catalog.ts`, `catalog/notification/api/infrastructure/mailer/templates/layout.hbs`, `catalog/audit/api/application/services/activity-area-resolver.ts`, `catalog/tag/api/domain/errors.ts`, `catalog/attachment/api/domain/errors.ts` | locale single source + per-entry message tables · gate: **full-unit** (catalog entries) |
| 3 | C9 | T41 | `copier.yml`, `.github/workflows/feedback-triage.yml`, `scripts/platform/__tests__/copier-questions.test.mjs` | `copier.yml` wiring task — one owner for a file four requirements edit · gate: scoped |
| 4 (exclusive) | C10 | T42 | `catalog/identity/single-tenant/module.json`, `catalog/attachment/module.json`, `catalog/audit/module.json`, `catalog/notification/module.json`, `catalog/tag/module.json`, `catalog/identity/single-tenant/CHANGELOG.md`, `catalog/attachment/CHANGELOG.md`, `catalog/audit/CHANGELOG.md`, `catalog/notification/CHANGELOG.md`, `catalog/tag/CHANGELOG.md`, `docs/advisories/ADV-20260822-01.md`, `docs/advisories/ADV-20260822-02.md`, `docs/advisories/ADV-20260822-03.md`, `docs/advisories/ADV-20260822-05.md` | five entry bumps + `affects` corrections — alone · gate: full-unit |
| 5 (exclusive) | C11 | T43 | `.agents/skills/tlc-spec-driven/SKILL.md`, `.agents/skills/tlc-spec-driven/references/validate.md`, `.agents/skills/tlc-spec-driven/references/sub-agents.md`, `.agents/skills/tlc-spec-driven/references/cards/orchestrator.md`, `.agents/skills/repo-discovery/SKILL.md`, `.claude/agents/spec-verifier.md`, `.claude/hooks/subagent-model-required.mjs`, `docs/agents/harness.md`, `scripts/platform/__tests__/harness-taxonomy.test.mjs` | BRAND-04 — **edits the rules this workflow runs under**; alone, last · gate: scoped |
| 6 | C12 | T44 → T45 → T46 → T47 | `.claude/hooks/contract-enum.mjs`, `.claude/hooks/edit-reminders.mjs`, `docs/arch/front.md`, `apps/api/src/modules/module-boundaries.spec.ts`, `apps/api/test/setup/test-db.ts`, `apps/api/test/setup/unit-env.ts`, `apps/api/test/setup/e2e-env.ts`, `scripts/platform/__tests__/brand-hygiene.test.mjs`, `scripts/platform/__tests__/hook-references.test.mjs`, `catalog/identity/single-tenant/README.md`, `.specs/features/done/v0-2-product-slots/coverage-sweep.md` | hooks truth + guard scan + the hygiene gate · gate: **full-unit** (test harness) |
| 7 (owner-gated) | C13 | T48 | `docs/dev/template-changelog.md` | **BLOCKED** until `git tag -l v2.3.0` is non-empty · gate: scoped |
| 8 | C14 | T49 → T50 → T51 → T52 → T53 | `apps/api/src/openapi/openapi-config.ts`, `apps/api/src/openapi/openapi-config.spec.ts`, `apps/web/src/app/config/api-client.ts`, `apps/web/src/shared/lib/last-location.ts`, `apps/web/src/shared/store/auth.store.ts`, `apps/api/test/setup/unit-env.ts`, `apps/api/test/setup/e2e-env.ts`, `catalog/identity/single-tenant/api/identity.config.ts`, `catalog/identity/single-tenant/api/api/guards/cookie.ts`, `packages/api-client/src/client.ts`, `apps/api/src/shared/kernel/clock/bucket-sql.ts`, `apps/api/src/shared/kernel/clock/bucket-sql.spec.ts`, `apps/api/src/shared/config/env.ts`, `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-usage-stats.reader.ts`, `catalog/audit/api/infrastructure/repositories/drizzle-activity-stats.reader.ts` | brand major: cookies, CSRF seam, SameSite, timezone · gate: **full-unit** (kernel + contract inputs) |
| 8 | C15 | T54 → T55 → T56 | `apps/api/src/shared/infra/storage/storage.config.ts`, `apps/api/src/shared/infra/storage/storage.module.ts`, `apps/api/src/shared/infra/storage/s3-storage.adapter.ts`, `apps/api/src/shared/infra/storage/null-storage.adapter.ts`, `apps/api/src/shared/infra/storage/null-storage.adapter.spec.ts`, `apps/api/src/shared/infra/storage/storage-unavailable.error.ts`, `apps/api/src/app.module.ts`, `apps/api/.env.example`, `docs/dev/local-environment.md`, `scripts/platform/__tests__/brand-hygiene.test.mjs` | storage seam + hygiene-gate extension + env wiring · gate: **full-unit** |
| 9 (exclusive) | C16 | T57 | `openapi.json`, `packages/api-client/src/` | contract regen after the cookie rename — alone · gate: full-unit |
| 10 | C17 | T58 → T59 → T60 → T61 → T62 → T63 | `catalog/professional/` | new `professional` entry (AD-035) · gate: **full-unit** |
| 10 | C18 | T64 → T65 → T66 | `catalog/audit/api/domain/base-audit-registrations.ts`, `catalog/audit/api/domain/audit-coverage.ts`, `catalog/audit/api/testing/reattach-identity-tables.ts`, `catalog/audit/api/__e2e__/audit.e2e-spec.ts`, `docs/advisories/ADV-20260824-01.md`, `docs/advisories/ADV-20260824-02.md` | audit entry + the two `breaking` advisories · gate: scoped |
| 11 | C19 | T67 → T68 → T69 → T70 → T71 → T72 | `catalog/identity/single-tenant/api/domain/entities/user.entity.ts`, `catalog/identity/single-tenant/api/domain/ports/user.repository.ts`, `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-user.repository.ts`, `catalog/identity/single-tenant/api/identity.module.ts`, `catalog/identity/single-tenant/api/infrastructure/professional/`, `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts`, `catalog/identity/single-tenant/api/domain/access/access-profile.types.ts`, `catalog/identity/single-tenant/api/domain/permissions/permission.types.ts`, `catalog/identity/single-tenant/api/infrastructure/tables/user.table.ts`, `catalog/identity/single-tenant/api/testing/seed-user.ts`, `catalog/identity/single-tenant/api/application/use-cases/create-user/`, `catalog/identity/single-tenant/api/application/use-cases/update-user.use-case.ts`, `catalog/identity/single-tenant/module.json`, `catalog/identity/single-tenant/migrations/custom/04_audit_attach_hook.sql`, `apps/api/test/setup/test-db.ts` | identity slimming · gate: **full-unit** |
| 11 | C20 | T73 → T74 → T75 | `scripts/platform/migrations/v3.0.0.mjs`, `scripts/platform/lib/commands/template.mjs`, `scripts/platform/__tests__/migration-v3.test.mjs` | executable child migration (AD-034) · gate: scoped |
| 12 (exclusive) | C21 | T76 | `openapi.json`, `packages/api-client/src/`, `catalog/identity/single-tenant/parity/`, `catalog/professional/parity/` | contract regen + parity re-snapshot — alone · gate: full-unit |
| 13 | C22 | T77 → T78 | `catalog/professional/README.md`, `catalog/professional/CHANGELOG.md`, `.specs/STATE.md`, `scripts/platform/__tests__/catalog-check-professional.test.mjs` | IDENT-02 proof + AD-035 record · gate: scoped |
| 14 (owner-gated) | C23 | T79 | `docs/dev/template-changelog.md` | **BLOCKED** until `v2.4.0` is tagged · gate: scoped |

```
─────────────────────────────── v2.4.0 ───────────────────────────────
Wave 1:  [C1: T1→T2→T3→T4→T5] ∥ [C2: T6→T7→T8→T9→T10→T11] ∥ [C3: T12→T13→T14→T15→T16]
Wave 2:  [C4: T17→…→T22]      ∥ [C5: T23→…→T27]           ∥ [C6: T28→…→T32]
Wave 3:  [C7: T33→…→T36]      ∥ [C8: T37→…→T40]           ∥ [C9: T41]
Wave 4:  [C10: T42]  (exclusive — five module.json bumps + advisory affects)
Wave 5:  [C11: T43]  (exclusive — BRAND-04 harness taxonomy)
Wave 6:  [C12: T44→T45→T46→T47]
Wave 7:  [C13: T48]  (owner-gated: v2.3.0 must be tagged)
         ► Verifier pass 1 (v2.4.0 scope) ► owner dispatches release → v2.4.0
─────────────────────────────── v3.0.0 ───────────────────────────────
Wave 8:  [C14: T49→…→T53]     ∥ [C15: T54→T55→T56]
Wave 9:  [C16: T57] (exclusive — contract regen, cookie rename)
Wave 10: [C17: T58→…→T63]     ∥ [C18: T64→T65→T66]
Wave 11: [C19: T67→…→T72]     ∥ [C20: T73→T74→T75]
Wave 12: [C21: T76] (exclusive — contract regen + parity re-snapshot)
Wave 13: [C22: T77→T78]
Wave 14: [C23: T79] (owner-gated: v2.4.0 must be tagged)
         ► Verifier pass 2 (whole feature) ► owner dispatches release → v3.0.0
```

## Exclusive inventory

| # | Subject | Task | Wave | Status |
| --- | --- | --- | --- | --- |
| 1 | Contract regen for BRAND-01 | T57 | 9 | in this plan |
| 2 | Contract regen + parity re-snapshot for G | T76 | 12 | in this plan |
| 3 | Five `module.json` bumps + advisory `affects` | T42 | 4 | in this plan |
| 4 | Harness P0 taxonomy (**BRAND-04**, not BRAND-05 — see § 0.1) | T43 | 5 | in this plan |
| 5 | `.prettierrc` + root devDependency | — | — | **inherited constraint, owned by `prettier-format-gate`** (§ 0.2). No task here; do not cluster a `.prettierrc` edit beside anything. |

## Owner hand-off points (the agent never tags and never pushes — AD-006/AD-034)

1. **Before wave 7** — the owner tags `v2.3.0`. T48 is blocked until `git tag -l v2.3.0` is non-empty.
2. **After wave 7** — the owner dispatches the `release` workflow for `v2.4.0` (+ the
   `catalog/<name>@x.y.z` tags CAT-05 observes).
3. **Before wave 14** — `v2.4.0` must be tagged, or appending `## v3.0.0` makes it untaggable under
   `release-preflight`'s latest-section rule.
4. **After wave 14** — the owner dispatches `v3.0.0`.

---

## Task Breakdown — `v2.4.0`

Every task below is reachable by a child with a plain `copier update`: **zero manual migration
steps** (AD-034). Anything that would force a child decision belongs to `v3.0.0`.

### T1: Relocate `discoverEntries` out of the excluded `lib/lint.mjs`

**What**: Move `discoverEntries` into a new shipped module so the platform CLI stops importing a file `copier.yml` `_exclude`s.
**Where**: `scripts/platform/lib/entries.mjs` (new)
**Touches**: `scripts/platform/lib/entries.mjs`, `scripts/platform/lib/lint.mjs`, `scripts/platform/lib/catalog-graph.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/release-preflight.mjs`, `scripts/platform/__tests__/entries.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: `discoverEntries` at `scripts/platform/lib/lint.mjs:145` — moved verbatim, not rewritten
**Requirement**: CLI-01 (F-copier-mechanics-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `scripts/platform/lib/catalog-graph.mjs:4` no longer imports `./lint.mjs`
- [ ] `lib/lint.mjs` re-exports from `lib/entries.mjs` so `catalog-lint.mjs` keeps working
- [ ] A rendered child (no `lib/lint.mjs` on disk) resolves `scripts/platform/cli.mjs` without throwing
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass (no silent deletions)

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T2: Fix the entrypoint path guard at all 8 sites

**What**: Replace the `import.meta.url === \`file://${process.argv[1]}\`` comparison with a shared helper that survives a path containing a space.
**Where**: `scripts/platform/lib/is-main.mjs` (new)
**Touches**: `scripts/platform/lib/is-main.mjs`, `scripts/platform/cli.mjs`, `scripts/platform/catalog-check.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/catalog-stage.mjs`, `scripts/platform/advisory-required.mjs`, `scripts/platform/jest-to-vitest.mjs`, `scripts/platform/release-preflight.mjs`, `scripts/template-smoke.mjs`, `scripts/platform/__tests__/is-main.test.mjs`
**Depends on**: T1
**Exclusive**: no
**Reuses**: `node:url` `pathToFileURL`
**Requirement**: TOOL-01 (F-platform-scripts-7)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Exactly **8** call sites use the helper — `cli.mjs:98`, `catalog-check.mjs:236`, `catalog-lint.mjs:129`, `catalog-stage.mjs:36`, `advisory-required.mjs:90`, `jest-to-vitest.mjs:406`, `release-preflight.mjs:116`, `scripts/template-smoke.mjs:339`
- [ ] A test asserts **zero** remaining raw `file://${process.argv[1]}` comparisons under `scripts/**`, so a ninth copy cannot be reintroduced
- [ ] Each entrypoint runs from a directory whose name contains a space
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 3 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

> `scripts/platform/template-update-ci.mjs` (the ledger's 9th site) was deleted by `eb907ef`. Do not recreate it.

---

### T3: `readTemplateVersion` must parse through `parseInstalledVersion`

**What**: One-line repair — `readTemplateVersion` stops doing its own `replace(/^v/, "")` and calls the correct parser, so a describe-style (off-tag) `_commit` resolves instead of failing.
**Where**: `scripts/platform/lib/commands/add.mjs:36-41`
**Touches**: `scripts/platform/lib/commands/add.mjs`, `scripts/platform/lib/template-version.mjs`, `scripts/platform/__tests__/template-version.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: `parseInstalledVersion` at `scripts/platform/lib/template-version.mjs:32-37` — already correct, never called
**Requirement**: TOOL-03 (F-platform-scripts-2)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `readTemplateVersion` delegates to `parseInstalledVersion`
- [ ] `_commit` of the form `v2.2.1-4-gabc1234` resolves to base tag `2.2.1`
- [ ] `checkKernelRange` (`lib/plan.mjs:33-36`) receives a semver, never a describe string
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 5 new tests pass (plain tag, describe ref, dirty ref, missing `_commit`, non-semver)

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T4: Guard — no `scripts/**` file imports an `_exclude`d path

**What**: A committed spec that reads `copier.yml` `_exclude` and fails when any file shipped under `scripts/**` imports a path the child will not receive. This is the gate that stops CLI-01 recurring.
**Where**: `scripts/platform/__tests__/excluded-imports.test.mjs` (new)
**Touches**: `scripts/platform/lib/copier-exclude.mjs`, `scripts/platform/__tests__/excluded-imports.test.mjs`
**Depends on**: T1
**Exclusive**: no
**Reuses**: `copier.yml` `_exclude` block (`:54-56`); `discoverEntries` scan shape
**Requirement**: CLI-02 (F-copier-mechanics-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The guard parses `_exclude` from `copier.yml`, never a hard-coded copy of the list
- [ ] It fails on a deliberately injected import of `lib/lint.mjs` from `scripts/platform/cli.mjs`
- [ ] It passes at HEAD after T1
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 3 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T5: `template:smoke` executes the platform CLI inside the rendered child

**What**: Extend the smoke harness so it runs `pnpm platform status` (and `list`) inside the child it renders, failing on a module-resolution error.
**Where**: `scripts/template-smoke.mjs`
**Touches**: `scripts/template-smoke.mjs`, `scripts/platform/__tests__/smoke-runs-cli.test.mjs`
**Depends on**: T1, T2
**Exclusive**: no
**Reuses**: the existing `template:smoke` render harness; `.github/workflows/catalog.yml:82-94` job `smoke`
**Requirement**: CLI-03 (F-copier-mechanics-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The smoke run invokes the child's own `pnpm platform status` and asserts a non-crash exit
- [ ] A deliberate reintroduction of the excluded import turns the smoke red
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 2 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `feat(platform): run the CLI inside the smoke-rendered child`

---

### T6: One canonical API port — `3000`

**What**: Collapse the two competing ports to a single `3000` across every file a child reads.
**Where**: `apps/api/src/shared/config/env.ts:14`
**Touches**: `apps/api/src/shared/config/env.ts`, `apps/api/src/shared/config/env.spec.ts`, `apps/api/.env.example`, `apps/web/.env.example`, `apps/api/Dockerfile`, `apps/api/Dockerfile.dev`, `docker-compose.yml`, `README.md.jinja`, `.github/README.md`, `docs/dev/local-environment.md`, `scripts/platform/__tests__/canonical-port.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: `apps/api/Dockerfile:54,57` already assume `3000`
**Requirement**: RUN-01 (F-api-kernel-3, F-agnostic-leaks-7, F-docs-consistency-5, F-ci-docker-infra-6)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `env.ts:14` default is `3000`; `apps/api/.env.example:5` is `PORT=3000`; `local-environment.md:48` says `3000`
- [ ] A committed test asserts exactly one port literal across the ten sites, so the pair cannot drift apart again
- [ ] `docker-compose.yml:70` port mapping and the container's `PORT` agree
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/shared/config` and `pnpm test:scripts`
- [ ] Test count: 3 new tests pass

**Tests**: unit · **Gate**: quick

---

### T7: The shipped `REDIS_URL` authenticates against the shipped Redis

**What**: `apps/api/.env.example` carries credentials matching `docker-compose.yml`'s `--requirepass`, and the doc stops claiming a repair that never happened.
**Where**: `apps/api/.env.example:49`
**Touches**: `apps/api/.env.example`, `docs/dev/local-environment.md`
**Depends on**: T6
**Exclusive**: no
**Reuses**: `docker-compose.yml:33-34` (`--requirepass redis`) and `:68` (`REDIS_URL: redis://:redis@redis:6379`, already correct on the compose side)
**Requirement**: RUN-02 (F-agnostic-leaks-6, F-ci-docker-infra-6)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `.env.example` `REDIS_URL` includes the password used by compose
- [ ] `local-environment.md:32` no longer asserts the value is "already reflected in `apps/api/.env`"
- [ ] Gate passes: build gate (docs/env only)

**Tests**: none (matrix: docs/env → gate only) · **Gate**: build

---

### T8: Every documented first-run command exists

**What**: Reconcile the command lists with `apps/api/package.json` — either the script ships or the doc stops naming it.
**Where**: `apps/api/package.json:15`
**Touches**: `apps/api/package.json`, `README.md.jinja`, `.github/README.md`, `docs/dev/local-environment.md`, `scripts/platform/__tests__/documented-commands.test.mjs`
**Depends on**: T6
**Exclusive**: no
**Reuses**: the manifest-vs-doc scan shape from T4
**Requirement**: RUN-03 (F-agnostic-leaks-5, F-api-kernel-1)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `db:bootstrap` and `db:seed:demo` either exist as scripts or are removed from every doc
- [ ] `db:seed` no longer points at the absent `apps/api/src/seeds`
- [ ] A committed test extracts every `pnpm …` command from `README.md.jinja`, `.github/README.md` and `local-environment.md` and asserts each resolves in a manifest
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

> `copier.yml` `_message_after_copy:89` names `db:bootstrap` too. That file is owned by **T41** — do not edit it here.

---

### T9: Declare the supported dev platforms

**What**: State macOS / Linux / WSL2 and that native Windows is unsupported, in the four places a reader looks.
**Where**: `docs/dev/local-environment.md:9`
**Touches**: `docs/dev/local-environment.md`, `README.md.jinja`, `TEMPLATE.md`
**Depends on**: T8
**Exclusive**: no
**Reuses**: the honest-support-matrix decision in `spec.md` § Out of Scope (HARNESS-05)
**Requirement**: TOOL-10 (F-probe-windows-client-viability-1)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] All three files state the same matrix, naming the symlink-based `scripts/sync-agent-skills.mjs` as the reason
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

> The `_message_after_copy` copy of this statement is written by **T41**.

---

### T10: Remove the legacy-MySQL backfill machinery

**What**: Delete the owner's legacy-migration story from the shipped dev environment and the entrypoint.
**Where**: `docs/dev/local-environment.md:59-64`
**Touches**: `docs/dev/local-environment.md`, `apps/api/docker-entrypoint.dev.sh`
**Depends on**: T7, T9
**Exclusive**: no
**Reuses**: —
**Requirement**: **BRAND-06** (F-docs-consistency-2 **C**) — story AC 7; see § 0.1

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `db:backfill:legacy` (a command in no manifest) appears nowhere
- [ ] `docker-entrypoint.dev.sh:8-13` no longer branches on `RUN_BACKFILL` or mentions `SyncLegacyModule`
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

> BRAND-06's third site, `docs/dev/deploy.md.jinja:18-24,73`, is removed by **T13**'s rewrite — that file has one owner.

---

### T11: Regression assertion — the fixture repair stays documented

**What**: RUN-05 has no fix left (`F-runtime-probe-4` closed by `74022fe`). Assert that the changelog and the template-update skill keep stating the repair, so the guidance cannot silently disappear.
**Where**: `scripts/platform/__tests__/fixture-repair-documented.test.mjs` (new)
**Touches**: `scripts/platform/__tests__/fixture-repair-documented.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: `docs/dev/template-changelog.md:99-107` (v2.2.0 § Child migration steps, step 1); `.agents/skills/template-update/SKILL.md:29-37`
**Requirement**: RUN-05 (F-runtime-probe-4) — **degraded to a regression assertion by design**

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The test asserts both documents still describe repairing a child's broken `.copier-answers.yml` before `copier update`
- [ ] The test asserts no `.copier-answers.yml` (leading dot) is tracked — the fixture stays `scripts/platform/__tests__/fixtures/child/copier-answers.yml`
- [ ] **Read-only**: this task must not edit `docs/dev/template-changelog.md` (owner-gated, T48)
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 2 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T12: Rewrite `docs/agents/infra.md.jinja` to platform-level facts

**What**: Full rewrite (the concrete-infra assertions span most of the 221 lines) leaving image contract, entrypoint and env matrix, plus a product-owned "your provider" section.
**Where**: `docs/agents/infra.md.jinja`
**Touches**: `docs/agents/infra.md.jinja`
**Depends on**: None
**Exclusive**: no
**Reuses**: the env matrix already in `apps/api/.env.example`
**Requirement**: **BRAND-05** (F-agnostic-leaks-1 **C**) — story AC 6; see § 0.1

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] No AWS account, region, VM name, Dokploy panel, DB role, dated owner decision or `~/.local/bin` script survives (ledger sites: `:1,27-28,38-40,49-53,58-77,85-88,95-104,111,116-118,120-122,126-163,165-193`)
- [ ] A "your provider" section exists and is marked product-owned
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T13: Rewrite `docs/dev/deploy.md.jinja`

**What**: Full rewrite on the same principle; it also carries BRAND-06's legacy-MySQL lines and TOOL-09's false CI claim, so this file's single owner removes all three.
**Where**: `docs/dev/deploy.md.jinja`
**Touches**: `docs/dev/deploy.md.jinja`
**Depends on**: T12
**Exclusive**: no
**Reuses**: T12's "your provider" shape
**Requirement**: BRAND-05 (primary) · BRAND-06 (`:18-24,73`) · TOOL-09 (`:111`)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Owner infrastructure gone (`:3,17-24,73,103-112,139-142,144-168`)
- [ ] No legacy-MySQL backfill remains
- [ ] The CI description matches the real jobs (`quality`, `test-unit`, `test-coverage`) — no Jest construct named
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T14: `docs/agents/workflow.md` describes the real pipeline

**What**: Correct the pre-push chain, the CI job list and the stale Jest `testRegex` claim; repoint the infra router line.
**Where**: `docs/agents/workflow.md:108,118-125,129`
**Touches**: `docs/agents/workflow.md`
**Depends on**: T13
**Exclusive**: no
**Reuses**: real `lefthook.yml` pre-push (`migrations → typecheck → catalog-typecheck → test-coverage`) and `.github/workflows/ci.yml:19-63`
**Requirement**: TOOL-09 (F-docs-consistency-6) · BRAND-05 (`:129` router)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `:108` no longer cites `testRegex`; it names Vitest's `include` in `apps/api/vitest.config.mts:20`
- [ ] `:118-125` matches `lefthook.yml` and the three real CI jobs
- [ ] The infra router points at the rewritten `infra.md`
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T15: Fix the doc routers that promise owner infrastructure

**What**: `AGENTS.md.jinja:23,28` and `docs/agents/README.md:17` describe `infra.md`/`deploy.md` as owner-infrastructure references; retitle them to what the rewritten docs now hold.
**Where**: `AGENTS.md.jinja:23,28`
**Touches**: `AGENTS.md.jinja`, `docs/agents/README.md`
**Depends on**: T12, T13, T14
**Exclusive**: no
**Reuses**: —
**Requirement**: BRAND-05 (F-agnostic-leaks-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Both routers describe platform-level content plus a product-owned section
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

> `AGENTS.md.jinja`'s language rule (`:58,81-82`) is edited by **T37**, in a later wave.

---

### T16: Issue taxonomy becomes a product-filled placeholder

**What**: Replace the hospitality area-labels with a `{{ … }}` placeholder the product fills, keeping the closed-list rule intact and making the worked examples domain-neutral.
**Where**: `docs/agents/issue-tracker.md.jinja:21,29-31`
**Touches**: `docs/agents/issue-tracker.md.jinja`, `docs/agents/communication.md`, `scripts/platform/__tests__/docs-no-owner-infra.test.mjs`
**Depends on**: T15
**Exclusive**: no
**Reuses**: existing copier placeholder conventions
**Requirement**: BRAND-03 (F-agents-skills-1 **C**, F-agnostic-leaks-8 **C**, F-docs-consistency-8) — story AC 4

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The area-label list is a placeholder, not a literal; the closed-list rule survives
- [ ] Worked examples name no hospitality domain
- [ ] A committed test asserts no owner-domain noun in `docs/agents/**` and `docs/dev/deploy.md.jinja` — **with the exclusion list** (`preservar`/`preservad-`, `reservado`, `state-preservation`) that accounts for ~110 of the 241 raw hits
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 5 new tests pass, including a self-test that the excluded terms do **not** trip the guard

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `feat(agents): product-filled issue taxonomy with a domain guard`

---

### T17: `.platform-modules.lock` paths are child-relative

**What**: `writeLock` records paths relative to the child root instead of the absolute `cwd`-derived ones.
**Where**: `scripts/platform/lib/apply.mjs:143-144`
**Touches**: `scripts/platform/lib/apply.mjs`, `scripts/platform/lib/plan.mjs`, `scripts/platform/lib/commands/add.mjs`, `.agents/skills/port-module-update/SKILL.md`, `scripts/platform/__tests__/lock-paths.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: `childLayout(targetRoot)` at `lib/plan.mjs:85`; rollback readers at `apply.mjs:158-159`
**Requirement**: TOOL-02 (F-platform-scripts-6)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Every `files[].to` in the written lock is child-relative
- [ ] Rollback's `existsSync`/`rmSync` resolve the relative form against the child root
- [ ] `port-module-update/SKILL.md:18,22,43` now describes what the code does
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass (write, re-read, rollback, a lock written at an absolute path still readable)

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T18: `--rollback` preserves the registry and exits non-zero

**What**: A rollback against an unreachable catalog must not blank `PLATFORM_MODULES`, and must report failure.
**Where**: `scripts/platform/lib/commands/add.mjs:63,71-77,81`
**Touches**: `scripts/platform/lib/commands/add.mjs`, `scripts/platform/lib/apply.mjs`, `scripts/platform/lib/exit-codes.mjs`, `scripts/platform/__tests__/rollback.test.mjs`
**Depends on**: T17
**Exclusive**: no
**Reuses**: `EXIT_CODES` (`lib/exit-codes.mjs`)
**Requirement**: TOOL-04 (F-platform-scripts-5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] A catalog read failure no longer degrades to `entries = []`
- [ ] `writeRegistry` never emits `PLATFORM_MODULES = [] as const` when other modules are installed
- [ ] `runRollback` returns a non-OK code on failure
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T19: `--rollback` unwinds a failed `--with-deps`, or refuses

**What**: Either the whole transaction unwinds, or the command refuses on a dirty tree with `git` guidance — never a half-installed child reported as clean.
**Where**: `scripts/platform/lib/commands/add.mjs`
**Touches**: `scripts/platform/lib/commands/add.mjs`, `scripts/platform/lib/apply.mjs`, `scripts/platform/__tests__/rollback.test.mjs`
**Depends on**: T18
**Exclusive**: no
**Reuses**: `TEMPLATE_ONLY_FILES` non-restoration documented at `lib/apply.mjs:13-16` — **deliberate, do not "fix"**
**Requirement**: TOOL-05 (F-runtime-probe-3) — root cause already closed by `90f1d0d`; the structural gap survives

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] A failed multi-module add leaves either a fully unwound tree or an explicit refusal
- [ ] The refusal path names the `git` command that recovers
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 3 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T20: One exit-code convention for `advisory detect`

**What**: Define detect-failed as a distinct state from not-affected, in one place, and stop coalescing every non-1 exit (including `rg`'s 2) to "not affected".
**Where**: `scripts/platform/lib/commands/advisory.mjs:22`
**Touches**: `scripts/platform/lib/commands/advisory.mjs`, `scripts/platform/lib/exit-codes.mjs`, `docs/advisories/README.md`, `docs/advisories/ADV-20260822-04.md`, `scripts/platform/__tests__/advisory-exit-codes.test.mjs`
**Depends on**: T18
**Exclusive**: no
**Reuses**: `EXIT_CODES.ADVISORY_INVALID = 1` — the collision that makes `result.status === 1` ambiguous today
**Requirement**: TOOL-06 (F-platform-scripts-4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `rg` absent, or exiting ≥ 2, yields a detect-failed code — never "não afetado"
- [ ] `ADV-20260822-04`'s `;`-chained detect command runs correctly (quoting/chaining supported)
- [ ] `docs/advisories/README.md:32-33` documents the convention that the code implements
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 6 new tests pass (affected, not-affected, rg-missing, rg-exit-2, chained command, quoted argument)

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T21: `pending-advisories` is silent with nothing to adopt

**What**: Stop printing the adopt line in the template repo and in a fresh child whose lock is legitimately empty.
**Where**: `.claude/hooks/pending-advisories.mjs:36-38`
**Touches**: `.claude/hooks/pending-advisories.mjs`, `scripts/platform/lib/advisories.mjs`, `scripts/platform/__tests__/pending-advisories-hook.test.mjs`
**Depends on**: T20
**Exclusive**: no
**Reuses**: `computePending`'s `noLock` at `lib/advisories.mjs:50`; `copier.yml:62` puts the lock under `_skip_if_exists`
**Requirement**: TOOL-08 (F-hooks-robustness-1)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `noLock` distinguishes *missing* from *present-but-empty*
- [ ] The hook is silent in the template repo and in a fresh child; it still speaks when a real module is installed and unadopted
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T22: `computePending` consults `catalogRef`

**What**: Add the entry branch beside the existing `templateVersion` branch so an already-installed `2.0.0` child is matched by the ref it was installed from.
**Where**: `scripts/platform/lib/advisories.mjs:48,58-67`
**Touches**: `scripts/platform/lib/advisories.mjs`, `scripts/platform/__tests__/compute-pending-catalogref.test.mjs`
**Depends on**: T21
**Exclusive**: no
**Reuses**: `catalogRef` already written per module at `lib/commands/add.mjs:156-162`, read nowhere outside tests; the `module: kernel` branch as the shape precedent
**Requirement**: CAT-03 (F-catalog-entries-2)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `computePending`'s signature is unchanged
- [ ] A child installed at `2.0.0` from the pre-remediation ref is reported affected by `ADV-20260822-01..05`
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 5 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `fix(platform): match advisories by the catalog ref a module was installed from`

---

### T23: Web app name and locale come from configuration

**What**: `VITE_APP_NAME` / `VITE_LOCALE` drive the browser title, `<html lang>` and `pageTitle()` without editing a platform file.
**Where**: `apps/web/src/app/router/shell.tsx:20-23,28,66`
**Touches**: `apps/web/index.html`, `apps/web/src/app/router/shell.tsx`, `apps/web/src/app/config/zod-locale.ts`, `apps/web/.env.example`, `apps/web/src/app/router/shell.test.tsx`
**Depends on**: None
**Exclusive**: no
**Reuses**: Vite's `%VITE_*%` index-html substitution
**Requirement**: LOC-03, LOC-06 (F-web-kernel-5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `index.html:2,6` use placeholders, not the literals `pt-BR` / `Platform`
- [ ] `APP_NAME` is read from configuration; `pageTitle()` follows
- [ ] **Default preserves today's behaviour**: unset vars render `pt-BR` and the current title
- [ ] Gate passes: `pnpm vitest run --project web apps/web/src/app`
- [ ] Test count: 5 new tests pass (default, overridden name, overridden locale, `lang` attribute, `pageTitle`)

**Tests**: unit · **Gate**: quick

---

### T24: A child serves a real favicon

**What**: Create `apps/web/public/` with a neutral favicon and make nginx serve it instead of the SPA fallback.
**Where**: `apps/web/public/` (new)
**Touches**: `apps/web/public/`, `apps/web/nginx.conf`, `apps/web/index.html`
**Depends on**: T23
**Exclusive**: no
**Reuses**: Vite's `publicDir` default
**Requirement**: LOC-06 (F-web-kernel-5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `apps/web/public/` exists and ships a brand-neutral favicon
- [ ] `nginx.conf:53`'s `try_files` no longer answers `/favicon.ico` with `index.html`
- [ ] Gate passes: build gate

**Tests**: none (asset/config) · **Gate**: build

---

### T25: Web guard seam — installing identity edits no platform file

**What**: Introduce product-owned extension points so `shell.tsx`, `main.tsx` and `app-providers.tsx` need no edit when the identity entry is installed.
**Where**: `apps/web/src/app/router/shell.tsx:41-60`
**Touches**: `apps/web/src/app/router/shell.tsx`, `apps/web/src/main.tsx`, `apps/web/src/app/providers/app-providers.tsx`, `apps/web/src/app/router/shell.test.tsx`, `catalog/identity/single-tenant/README.md`
**Depends on**: T23
**Exclusive**: no
**Reuses**: the existing `beforeLoad` redirect at `:41-42,47-49,52-54`
**Requirement**: SEAM-03 (F-web-kernel-3)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `appLayoutRoute` accepts a product-registered guard; `onUnauthorized` is registered, not inlined at `main.tsx:16-22`
- [ ] `app-providers.tsx` exposes a product provider slot
- [ ] `catalog/identity/single-tenant/README.md:313-347` stops prescribing `app/router/guards.ts` — **that file does not exist** — and names the real seams
- [ ] Gate passes: `pnpm vitest run --project web apps/web/src/app`
- [ ] Test count: 4 new tests pass

**Tests**: unit · **Gate**: quick

---

### T26: Protected routes join without editing `routes.ts`

**What**: Turn the non-exported `PROTECTED_ROUTES` const into a registry a product adds to, so last-location and post-login redirect pick up product routes.
**Where**: `apps/web/src/shared/config/routes.ts:18-21`
**Touches**: `apps/web/src/shared/config/routes.ts`, `apps/web/src/shared/lib/last-location.ts`, `apps/web/src/shared/lib/auth-redirect.ts`, `apps/web/src/shared/config/routes.test.ts`, `apps/web/src/shared/lib/last-location.test.ts`
**Depends on**: T25
**Exclusive**: no
**Reuses**: the two helpers `toSafeProtectedRoute` / `resolveProtectedRouteTemplate` (4 consumers)
**Requirement**: SEAM-04 (F-web-kernel-4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] A product route registered from product code participates in both helpers
- [ ] The stale `ROUTE_ACCESS` comment at `:6-7` is corrected — that symbol exists nowhere
- [ ] Gate passes: `pnpm vitest run --project web apps/web/src/shared`
- [ ] Test count: 5 new tests pass

**Tests**: unit · **Gate**: quick

---

### T27: Route slugs are configuration, not Portuguese literals

**What**: `LOGIN: "/entrar"` and `INICIO: "/inicio"` become locale-driven, defaulting to today's values.
**Where**: `apps/web/src/shared/config/routes.ts:9-11`
**Touches**: `apps/web/src/shared/config/routes.ts`, `apps/web/src/app/router/route-pending.tsx`, `apps/web/src/pages/not-found/ui/not-found-page.tsx`, `apps/web/src/pages/error/ui/error-page.tsx`, `apps/web/src/shared/config/routes.test.ts`
**Depends on**: T26
**Exclusive**: no
**Reuses**: T23's locale seam
**Requirement**: LOC-03, LOC-05 (F-web-kernel-5, F-catalog-entries-7)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Slugs resolve through the locale seam; **the `pt-BR` default yields the current strings byte-for-byte**
- [ ] The three page components read their copy from the same source
- [ ] Gate passes: `pnpm vitest run --project web apps/web/src`
- [ ] Test count: 4 new tests pass, one asserting *no change* at the default

**Tests**: unit · **Gate**: quick

**Commit**: `feat(web): locale-driven route slugs defaulting to today's values`

---

### T28: API messages come from a `DEFAULT_LOCALE`-selected pack

**What**: RFC 7807 titles and Zod messages resolve through a message pack; the pt-BR pack ships and is the default.
**Where**: `apps/api/src/shared/kernel/errors/problem-details.filter.ts:53,63,88`
**Touches**: `apps/api/src/shared/kernel/i18n/`, `apps/api/src/shared/kernel/errors/problem-details.filter.ts`, `apps/api/src/shared/kernel/errors/problem-details.filter.spec.ts`, `apps/api/src/shared/kernel/errors/domain.error.ts`, `apps/api/src/shared/config/env.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: the three existing `"pt-BR"` fallbacks in `apps/api/src/shared/kernel/context/{request-context.middleware.ts:53,event-context.ts:35,job-context.ts:42}`
**Requirement**: LOC-04 (F-agnostic-leaks-2)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `DEFAULT_LOCALE` exists in kernel env, defaulting to `pt-BR`
- [ ] `"Erro de validação"` / `"Erro interno"` come from the pack; `title: exception.title` pass-through survives
- [ ] **A test asserts the shipped default produces the current strings unchanged**
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/shared/kernel/errors`
- [ ] Test count: 6 new tests pass

**Tests**: unit · **Gate**: quick

---

### T29: Product bootstrap seam + `rawBody`

**What**: `NestFactory.create` gains `rawBody: true`, and a product-owned `bootstrap.product.ts` (no-op, `_skip_if_exists`) runs before `listen`.
**Where**: `apps/api/src/main.ts:34,61`
**Touches**: `apps/api/src/main.ts`, `apps/api/src/bootstrap.product.ts`, `apps/api/test/bootstrap-product.e2e-spec.ts`, `docs/dev/template.md`
**Depends on**: T28
**Exclusive**: no
**Reuses**: the existing boot order — `applySecurity:38`, `requestTimeout:49`, `createRequestContextMiddleware:52`, `mountDocs:54-56`
**Requirement**: SEAM-01 (F-extensibility-any-product-6)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `bootstrap.product.ts` ships as a no-op and is listed under `copier.yml` `_skip_if_exists` — **the `copier.yml` line is written by T41**; this task only creates the file and calls it
- [ ] It is invoked after `mountDocs` and before `listen`
- [ ] Gate passes: `pnpm vitest run --config vitest.integration.mts --project api-e2e apps/api/test/bootstrap-product.e2e-spec.ts`
- [ ] Test count: 3 new tests pass

**Tests**: e2e · **Gate**: full

---

### T30: One-shot `setTenant` writer

**What**: A tenancy middleware can write `tenantId` into the request context exactly once; a second call throws.
**Where**: `apps/api/src/shared/kernel/context/request-context.ts:30,57-63`
**Touches**: `apps/api/src/shared/kernel/context/request-context.ts`, `apps/api/src/shared/kernel/context/request-context.spec.ts`, `apps/api/src/shared/kernel/context/request-context.middleware.ts`
**Depends on**: T29
**Exclusive**: no
**Reuses**: `setActor`'s one-shot throw (`"actor já definido no escopo"`) — symmetric by construction
**Requirement**: SEAM-02 (F-extensibility-any-product-1)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `setTenant(tenantId: string): void` exists and throws on a second call in one request scope
- [ ] The middleware still seeds `tenantId: null` (`:49`); the nine existing readers are unaffected
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/shared/kernel/context`
- [ ] Test count: 5 new tests pass (write, read-back, double-call throws, null default, outside-scope behaviour)

**Tests**: unit · **Gate**: quick

---

### T31: Pool 503 spec stops depending on host latency

**What**: Widen only the **timing margin** of the acquire-timeout integration spec.
**Where**: `apps/api/src/shared/infra/database/application-pool.int-spec.ts:303-312,318`
**Touches**: `apps/api/src/shared/infra/database/application-pool.int-spec.ts`
**Depends on**: T30
**Exclusive**: no
**Reuses**: —
**Requirement**: TOOL-12 (F-tests-quality-gates-3) — **half-refuted**

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The `connectionTimeoutMillis: 150` margin no longer makes the assertion host-speed dependent
- [ ] `application-pool.ts:15-19`'s documented 500-not-503 exclusion is **left alone** — the code's own comment says it is deliberate
- [ ] Gate passes: `pnpm vitest run --config vitest.integration.mts --project api-int apps/api/src/shared/infra/database/application-pool.int-spec.ts`
- [ ] Test count: existing tests pass; 0 deletions

**Tests**: integration · **Gate**: full

---

### T32: The ownership table names `main.ts`

**What**: Add the missing row so a reader can tell which files a product may edit.
**Where**: `docs/dev/template.md:8-32`
**Touches**: `docs/dev/template.md`
**Depends on**: T29, T31
**Exclusive**: no
**Reuses**: the existing 14-row table and its rule at `:29-32`
**Requirement**: SEAM-07 (F-web-kernel-3, F-web-kernel-4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `main.ts` appears, marked **platform**-owned, with `bootstrap.product.ts` as the product seam
- [ ] The three web seams from T25/T26 appear with their ownership
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T33: `lintEntryBump` — the bump rule moves into `catalog:lint`

**What**: Move `entryChangedWithoutBump` out of preflight into `lib/lint.mjs` as `lintEntryBump`, aggregate it in `runLint`, and have `release-preflight.mjs` import it back so there is one implementation. A missing baseline is a **loud distinct failure**, never a pass (Fork C = C2).
**Where**: `scripts/platform/lib/lint.mjs`
**Touches**: `scripts/platform/lib/lint.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/release-preflight.mjs`, `scripts/platform/__tests__/entry-bump-lint.test.mjs`
**Depends on**: T1, T2
**Exclusive**: no
**Reuses**: `entryChangedWithoutBump` at `release-preflight.mjs:47-56` (moved verbatim), `moduleVersionAt:32-40`, `previousStableTag:26-30`, `stableTagsFromLsRemote`; `lintKernelRange` as the signature precedent
**Requirement**: CAT-02 (F-catalog-entries-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `lintEntryBump({ repoRoot, exec, entries })` is exported from `lib/lint.mjs` and aggregated by `runLint` — **which lives at `catalog-lint.mjs:111`, not in `lib/lint.mjs`** (§ 0.3)
- [ ] `resolveBaseline` returns `{ tag }` or `{ unavailable: reason }`; unavailable **fails**, with the reason in the message
- [ ] `release-preflight.mjs` imports it instead of declaring its own copy — one implementation, asserted by a test
- [ ] `pnpm catalog:lint` fails on a tree change to an entry with no `module.json` bump
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 7 new tests pass (changed+bumped, changed+unbumped, unchanged, no tags, shallow clone, not-a-repo, preflight parity)

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T34: `lintAdvisoryPathScope` rejects `catalog/`-prefixed detect paths

**What**: An advisory whose `detect` or `parity` path starts with `catalog/` can never match in a child, because `copier.yml:30` excludes that tree.
**Where**: `scripts/platform/lib/lint.mjs`
**Touches**: `scripts/platform/lib/lint.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/__tests__/advisory-path-scope.test.mjs`
**Depends on**: T33
**Exclusive**: no
**Reuses**: `lintAdvisoryFrontmatter:129` / `lintAdvisoryModule:139` shape, aggregated by `lintAdvisories` at `catalog-lint.mjs:82`
**Requirement**: CAT-04 (F-catalog-entries-4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] A `detect` beginning `catalog/` is a lint failure naming the child-layout path it should use
- [ ] `ADV-20260822-02:6` is corrected to a child-layout path (its `parity` twin too)
- [ ] Gate passes: `pnpm test:scripts && pnpm catalog:lint`
- [ ] Test count: 4 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

> The other four advisories' `affects` are corrected by **T42** — do not edit them here beyond the `detect`/`parity` path.

---

### T35: CI gives the bump gate a baseline

**What**: `fetch-depth: 0` on the `gates` job so `lintEntryBump` can resolve the previous stable tag.
**Where**: `.github/workflows/catalog.yml:14-31`
**Touches**: `.github/workflows/catalog.yml`
**Depends on**: T33
**Exclusive**: no
**Reuses**: the existing `catalog:lint` invocation — unchanged
**Requirement**: CAT-02 (F-catalog-entries-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `actions/checkout` on `gates` uses `fetch-depth: 0`
- [ ] The "baseline unavailable" branch cannot fire in CI
- [ ] Gate passes: build gate

**Tests**: none (workflow) · **Gate**: build

---

### T36: `contract:check` becomes a CI step that survives `module add`

**What**: Regenerate the contract in CI and fail on a non-empty diff. The current detector is a **template-only** spec that `module add` deletes.
**Where**: `.github/workflows/ci.yml`
**Touches**: `.github/workflows/ci.yml`, `package.json`, `docs/arch/back.md`, `scripts/platform/__tests__/contract-check-ci.test.mjs`
**Depends on**: T35
**Exclusive**: no
**Reuses**: root `package.json:12` `contract` script, invoked by no workflow today; `TEMPLATE_ONLY_FILES` at `lib/apply.mjs:19-20` **stays as-is** (the snapshot spec asserts a template fact)
**Requirement**: TOOL-11 (F-tests-quality-gates-2)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `contract:check` = `pnpm contract && git diff --exit-code openapi.json packages/api-client/src`, wired into `ci.yml`
- [ ] A test asserts the step is **not** inside `TEMPLATE_ONLY_FILES` — it must ship to the child
- [ ] The claims at `README.md.jinja:23`, `docs/arch/back.md:78`, `.github/README.md:38` are now true
- [ ] **`format:check` is NOT added to `ci.yml`** (§ 0.2) — a test asserts its absence
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `feat(ci): fail on contract drift with a check the child keeps`

---

### T37: `product_locale` threads the language rule through the docs

**What**: The `.jinja` docs render their language convention from the copier answer.
**Where**: `AGENTS.md.jinja:58,81-82`
**Touches**: `AGENTS.md.jinja`, `docs/agents/issue-tracker.md.jinja`
**Depends on**: None
**Exclusive**: no
**Reuses**: existing `.jinja` placeholder conventions
**Requirement**: LOC-01 (F-agnostic-leaks-2, F-docs-consistency-7, F-agents-skills-3) · BRAND-08 doc-router half (`issue-tracker.md.jinja:52`)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Both `.jinja` docs render the language rule from `product_locale`
- [ ] `issue-tracker.md.jinja:52` no longer points at the nonexistent `../dev/triagem-de-feedback.md`
- [ ] **Default `pt-BR` renders today's text unchanged**
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

> The `copier.yml` question itself is added by **T41**.

---

### T38: One canonical home for the language convention

**What**: The plain `.md` docs cannot be templated, so they reference the single canonical statement instead of repeating it.
**Where**: `docs/code-quality.md:12,48`
**Touches**: `docs/code-quality.md`, `docs/agents/communication.md`, `docs/test/testing.md`, `docs/arch/front.md`, `docs/adr/README.md`, `docs/advisories/README.md`
**Depends on**: T37
**Exclusive**: no
**Reuses**: the `.jinja` statement from T37 as the single source
**Requirement**: LOC-02 (F-docs-consistency-7)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Exactly one document states the convention; the others link to it
- [ ] No plain `.md` hard-codes `pt-BR` as a rule
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

> `docs/arch/front.md`'s false conformance-spec claim (`:141,188`) is TOOL-07's, fixed in **T44** — a later wave, so no race.

---

### T39: One message table per catalog entry

**What**: Each entry reads its subjects, permission labels and error titles from one table, and no entry hard-codes a timezone.
**Where**: `catalog/*/api/**`
**Touches**: `catalog/identity/single-tenant/api/domain/errors.ts`, `catalog/notification/api/application/templates/base-template-sources.ts`, `catalog/notification/api/application/catalog/notification-catalog.ts`, `catalog/notification/api/infrastructure/mailer/templates/layout.hbs`, `catalog/audit/api/application/services/activity-area-resolver.ts`, `catalog/tag/api/domain/errors.ts`, `catalog/attachment/api/domain/errors.ts`
**Depends on**: T38
**Exclusive**: no
**Reuses**: T28's kernel message-pack shape
**Requirement**: LOC-05 (F-catalog-entries-7)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Each of the five entries exposes one message table
- [ ] `base-template-sources.ts:6,9` and `notification-catalog.ts:41,44` no longer pin `America/Sao_Paulo` — they take the kernel's timezone
- [ ] `layout.hbs:2` `lang` follows the locale
- [ ] **Every shipped string is byte-identical at the `pt-BR` default**
- [ ] Gate passes: `pnpm vitest run --project api catalog`
- [ ] Test count: 8 new tests pass, at least one per entry, plus a no-change-at-default assertion

**Tests**: unit · **Gate**: quick

> Do **not** touch `catalog/notification/api/infrastructure/mailer/email-theme.ts` — sibling-owned (§ 0.4).

---

### T40: Retire the owner's booking vocabulary from the identity entry

**What**: Rename the "Agendamentos"/"Recepção" vocabulary in identity's contract, policy, port and use case, and in the fixture names, without changing behaviour.
**Where**: `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts:44,142,179,196`
**Touches**: `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts`, `catalog/identity/single-tenant/api/application/access-policy.ts`, `catalog/identity/single-tenant/api/domain/ports/user.repository.ts`, `catalog/identity/single-tenant/api/application/use-cases/update-user.use-case.ts`
**Depends on**: T39
**Exclusive**: no
**Reuses**: the exclusion list from T16 so `preservar`/`reservado` are not swept
**Requirement**: BRAND-03 (F-agnostic-leaks-8 **C**) — story AC 4

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] "motor de agendamento" (2×, `user.repository.ts:138,142`) and the sibling comments are domain-neutral
- [ ] No behaviour change — the contract's shape is untouched
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity`
- [ ] Test count: existing entry tests pass; 0 deletions

**Tests**: unit · **Gate**: quick

> These fields are **deleted** by IDENT-01 in `v3.0.0` (T70). The release boundary separates them; that is by construction, not by luck.

---

### T41: `copier.yml` — the single-owner wiring task

**What**: One task owns the file four requirements need to edit: the `product_locale` question, the `_message_after_copy` command list, the `_exclude` entry for the dangling workflow, and the `pnpm install` / `skills:sync` task gating. Also deletes the workflow itself.
**Where**: `copier.yml`
**Touches**: `copier.yml`, `.github/workflows/feedback-triage.yml`, `scripts/platform/__tests__/copier-questions.test.mjs`
**Depends on**: T8, T9, T23, T29
**Exclusive**: no
**Reuses**: `_exclude` already names `catalog.yml:35` and `release.yml:39`; questions end at `app_domain` (`:120`)
**Requirement**: LOC-01 · RUN-03 · TOOL-10 · TOOL-13 (F-copier-mechanics-4) · BRAND-08 (F-ci-docker-infra-5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `product_locale` exists with **default `pt-BR`**; a child whose `.copier-answers.yml` lacks the key gets that default on `copier update`
- [ ] `_message_after_copy` names only commands that exist, and states the support matrix
- [ ] `.github/workflows/feedback-triage.yml` is deleted (or `_exclude`d) — a child no longer receives a workflow curling `/v1/internal/feedback-triage/` for a module that is not in `catalog/`
- [ ] `pnpm install` / `skills:sync` run **at most once**, and only in a real project (`:74,78,80` — not merely `not _copier_conf.pretend`)
- [ ] `bootstrap.product.ts` is listed under `_skip_if_exists`
- [ ] Gate passes: `pnpm test:scripts && pnpm template:smoke`
- [ ] Test count: 7 new tests pass (locale default, locale override, pretend, `copy` vs `update`, command existence, `_exclude` membership, skip-if-exists)

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `feat(copier): product_locale, honest first-run message, no dangling workflow`

---

### T42: Bump all five entries and correct the advisory `affects`

**What**: Restore an unambiguous address: every entry touched by `security-audit-remediation` gets a new version, and the five advisories name the population that is actually vulnerable.
**Where**: `catalog/*/module.json`
**Touches**: `catalog/identity/single-tenant/module.json`, `catalog/attachment/module.json`, `catalog/audit/module.json`, `catalog/notification/module.json`, `catalog/tag/module.json`, `catalog/identity/single-tenant/CHANGELOG.md`, `catalog/attachment/CHANGELOG.md`, `catalog/audit/CHANGELOG.md`, `catalog/notification/CHANGELOG.md`, `catalog/tag/CHANGELOG.md`, `docs/advisories/ADV-20260822-01.md`, `docs/advisories/ADV-20260822-02.md`, `docs/advisories/ADV-20260822-03.md`, `docs/advisories/ADV-20260822-05.md`
**Depends on**: T33, T34
**Exclusive**: **yes** — own wave
**Reuses**: `lintEntryBump` from T33 as the proof this cannot regress
**Requirement**: CAT-01 (F-catalog-entries-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] All five `version` fields leave `2.0.0` — the version that today designates two different codebases across `v2.0.0` and `v2.1.0` (**183 files** differ under `catalog/` between those tags)
- [ ] Each entry's `CHANGELOG.md` records the bump and why
- [ ] All five `ADV-20260822-0*` `affects` ranges stop being `>=1.0.0 <2.0.0` — the range that excludes exactly the vulnerable children — and name the ambiguous `2.0.0` population
- [ ] `pnpm catalog:lint` is green, including T33's new rule
- [ ] Gate passes: `pnpm catalog:lint && pnpm test:scripts`
- [ ] Test count: existing tests pass; T33's 7 tests still green

**Tests**: none (manifests) · **Gate**: build (full-unit)

**Commit**: `fix(catalog): one immutable codebase per entry version`

> `ADV-20260822-04` is edited by **T20** (chained detect command) and `-02` by **T34** (path scope). Both are earlier waves, so there is no race — but re-read them before writing.

---

### T43: Make the harness P0 taxonomy domain-neutral

**What**: The model-tier and Verifier-sensor rules name booking/availability domain categories. Replace them with generic categories that point at the product's own domain doc.
**Where**: `.claude/hooks/subagent-model-required.mjs:42`
**Touches**: `.agents/skills/tlc-spec-driven/SKILL.md`, `.agents/skills/tlc-spec-driven/references/validate.md`, `.agents/skills/tlc-spec-driven/references/sub-agents.md`, `.agents/skills/tlc-spec-driven/references/cards/orchestrator.md`, `.agents/skills/repo-discovery/SKILL.md`, `.claude/agents/spec-verifier.md`, `.claude/hooks/subagent-model-required.mjs`, `docs/agents/harness.md`, `scripts/platform/__tests__/harness-taxonomy.test.mjs`, `scripts/platform/__tests__/docs-no-owner-infra.test.mjs`
**Depends on**: T16, T41
**Exclusive**: **yes** — own wave, and **last**
**Reuses**: the generic-category wording established by T16
**Requirement**: **BRAND-04** (F-agents-skills-4) — story AC 5. `design.md` § *Execute notes* calls this "BRAND-05"; see § 0.1.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] All 8 sites name generic categories (auth, payment, data integrity, …) and defer the domain list to the product's own doc — `SKILL.md:80,115`, `validate.md:114`, `sub-agents.md:59,73`, `cards/orchestrator.md:90`, `spec-verifier.md:3`, `subagent-model-required.mjs:42`, `harness.md:129`
- [ ] `SKILL.md:80`'s example slug `guest-agenda-full-load` and `repo-discovery/SKILL.md:37`'s "motor de agenda" are neutral
- [ ] **Only `.agents/skills/**` paths are edited** — `.claude/skills/tlc-spec-driven` is a symlink to it (§ 0.3); editing both would own one file twice
- [ ] The pre-edit taxonomy is quoted in the commit body, so the Verifier is judged against the contract in force at dispatch
- [ ] The `SPEC_DEVIATION` exclusion of `docs/agents/harness.md` at `scripts/platform/__tests__/docs-no-owner-infra.test.mjs:10-14` — left by T16 in wave 1 because this file was forbidden to C3 — is **removed**, so T16's guard covers the literal `docs/agents/**` its AC names. Without this, BRAND-04 ships a fix its own guard cannot see (Execution Log, wave 1, deviation 2)
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 3 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `feat(harness): generic P0 taxonomy pointing at the product's domain doc`

> **This task changes the rules this workflow runs under.** It is alone in its wave for that reason. `docs/agents/harness.md` is also sibling-owned (§ 0.4).

---

### T44: Hooks and handbooks name only files that ship

**What**: Sweep all 20 files under `.claude/hooks/` (they all ship — `copier.yml` `_exclude:40,43` excludes only `.claude/skills` and `.claude/settings.local.json`) so no hook or doc names a file, helper or conformance spec that does not exist.
**Where**: `.claude/hooks/contract-enum.mjs:104-113`
**Touches**: `.claude/hooks/contract-enum.mjs`, `.claude/hooks/edit-reminders.mjs`, `docs/arch/front.md`, `scripts/platform/__tests__/hook-references.test.mjs`
**Depends on**: T43
**Exclusive**: no
**Reuses**: the manifest-vs-doc scan shape from T8
**Requirement**: TOOL-07 (F-agents-skills-6, F-agents-skills-5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `contract-enum.mjs:104-113` stops naming `shared/lib/select-options.ts` / `enumOptions` / a `contract-enums` spec that does not exist
- [ ] `docs/arch/front.md:141,188` stops claiming that spec gates pre-push and CI
- [ ] `edit-reminders.mjs:12` stops mandating `@workspace/ui`, design tokens and Lucide on the authority of a doc that mentions none
- [ ] A committed test walks **all 20** hooks and fails on any referenced path that is absent
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 5 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T45: Widen the module-boundary guard's scan

**What**: `KERNEL_SURFACE` covers five roots today, which is why the leaks were never caught. Add the four missing ones and purge catalog vocabulary from the kernel test harness.
**Where**: `apps/api/src/modules/module-boundaries.spec.ts:539-545`
**Touches**: `apps/api/src/modules/module-boundaries.spec.ts`, `apps/api/test/setup/test-db.ts`, `apps/api/test/setup/unit-env.ts`, `apps/api/test/setup/e2e-env.ts`
**Depends on**: T44
**Exclusive**: no
**Reuses**: the existing `KERNEL_SURFACE` list and RULE C machinery
**Requirement**: BRAND-07 (F-tests-quality-gates-4) — story AC 8

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `KERNEL_SURFACE` also covers `apps/api/test`, `apps/api/src/openapi`, `apps/api/src/docs`, `apps/web/src/pages`
- [ ] The kernel test harness holds kernel vocabulary only; `test-db.ts:98-108` no longer hard-codes catalog schemas
- [ ] `test-db.ts:105` (`identity.professional_default_hours`) is **widened here, not deleted** — IDENT-01 deletes it in `v3.0.0` (T72)
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/modules`
- [ ] Test count: 4 new tests pass

**Tests**: unit · **Gate**: quick

---

### T46: The brand-hygiene gate

**What**: A committed spec that greps the rendered child for the owner's brand and infrastructure nouns and fails on any hit. This is the invariant that keeps the whole BRAND cluster from returning.
**Where**: `scripts/platform/__tests__/brand-hygiene.test.mjs` (new)
**Touches**: `scripts/platform/__tests__/brand-hygiene.test.mjs`
**Depends on**: T45
**Exclusive**: no
**Reuses**: T16's exclusion list; the `template:smoke` render harness
**Requirement**: BRAND-03…08 (the `v2.4.0` half of story AC 1–9)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Detection keys on `rit_` / `rit-` / `__Host-rit` — **never on the company name**, which appears nowhere outside `.specs/` and `docs/platform_template/`
- [ ] The exclusion list ships **with** the gate: `preservar` / `preservad-`, `reservado`, `state-preservation` — ~110 of 241 raw `reserva` hits, so the gate does not cry wolf on its first run and get disabled
- [ ] A self-test asserts each excluded term does **not** trip the gate
- [ ] Scope at this release is docs/harness/workflow; **T55 extends it** to cookies and timezone once `v3.0.0` renames them
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 8 new tests pass (one per excluded term, one per positive brand token, one end-to-end over a rendered child)

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `feat(gates): fail CI on any owner brand or infrastructure noun in a child`

---

### T47: State the dead follow-up debt where it is owned

**What**: Issues #2–#8 return **410 deleted**; docs still send readers to them. State the debt inline or close it — do not re-link.
**Where**: `catalog/identity/single-tenant/README.md:409-412`
**Touches**: `catalog/identity/single-tenant/README.md`, `.specs/features/done/v0-2-product-slots/coverage-sweep.md`
**Depends on**: T46
**Exclusive**: no
**Reuses**: `gh issue list --state all` → only #1, #9, #10, #11, #12 survive; all five `module.json` carry `"absorbs": []`
**Requirement**: BRAND-03 (F-known-debt-1)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `README.md:409-412`'s "seguem abertos" claim is gone
- [ ] `coverage-sweep.md:9-10,60-69` no longer links the deleted issues
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T48: Changelog section for `v2.4.0` — **OWNER-GATED**

**What**: Author `## v2.4.0` with `### Child migration steps` = the literal `None — copier update is enough.`
**Where**: `docs/dev/template-changelog.md`
**Touches**: `docs/dev/template-changelog.md`
**Depends on**: T42, T43, T47
**Exclusive**: no
**Reuses**: the v2.2.0 section's shape; `lintChildMigrationSteps` at preflight
**Requirement**: area H (release machinery) — `design.md:243-249`

**Tools**: MCP: NONE · Skill: NONE

**BLOCKED**: do not start until `git tag -l v2.3.0` is non-empty.

**Done when**:
- [ ] `git tag -l v2.3.0` returned non-empty **before** the first edit
- [ ] The existing `## v2.3.0` section (`:7`, `:27-29`) is **untouched** — a parallel session owns it, and its literal `None — copier update is enough.` must survive
- [ ] `## v2.4.0` is the latest section, so `release-preflight` keys on it (AD-034)
- [ ] Its own `### Child migration steps` is the literal `None — copier update is enough.` — AD-034 forbids a manual step on a non-major, and every task in waves 1–7 was authored to honour that
- [ ] The agent **does not tag and does not push** (AD-006/AD-034)
- [ ] Gate passes: `pnpm catalog:lint`

**Tests**: none · **Gate**: build

**Commit**: `docs(changelog): v2.4.0`

---

## Task Breakdown — `v3.0.0`

Every task below genuinely forces a child decision, which is what makes it a major (AD-031/AD-034).
Each ships its half of the idempotent `scripts/platform/migrations/v3.0.0.mjs` (T73).

### T49: Neutral cookie and storage-key defaults — kernel and web

**What**: `__Host-app_session`, `app_csrf`, `app-last-location`, `app-auth-logout` replace the brand-prefixed literals everywhere the kernel and web own them.
**Where**: `apps/api/src/openapi/openapi-config.ts:26,29,48,51,53,101`
**Touches**: `apps/api/src/openapi/openapi-config.ts`, `apps/api/src/openapi/openapi-config.spec.ts`, `apps/web/src/app/config/api-client.ts`, `apps/web/src/shared/lib/last-location.ts`, `apps/web/src/shared/store/auth.store.ts`, `apps/api/test/setup/unit-env.ts`, `apps/api/test/setup/e2e-env.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: the `COOKIE_NAME` / `DEVICE_COOKIE_NAME` env seam — two of three cookies already have it
**Requirement**: BRAND-01 (F-agnostic-leaks-3 **C**) — story AC 1

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] No `rit_` / `rit-` / `__Host-rit` literal survives in `apps/**` or `packages/**`
- [ ] `last-location.ts:5` and `auth.store.ts:5` use `app-*`
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/openapi` and `pnpm vitest run --project web apps/web/src`
- [ ] Test count: 6 new/updated tests pass

**Tests**: unit · **Gate**: quick

---

### T50: Neutral cookie defaults in the identity entry

**What**: The entry's shipped defaults follow, and `CSRF_COOKIE_NAME` stops being a bare module constant.
**Where**: `catalog/identity/single-tenant/api/identity.config.ts:20,23`
**Touches**: `catalog/identity/single-tenant/api/identity.config.ts`, `catalog/identity/single-tenant/api/api/guards/cookie.ts`
**Depends on**: T49
**Exclusive**: no
**Reuses**: `identity.config.ts:20,23`'s existing env seam as the precedent for the third cookie
**Requirement**: BRAND-01, BRAND-02 (F-extensibility-any-product-4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `identity.config.ts` defaults are `__Host-app_session` / `__Host-app_device`
- [ ] `cookie.ts:78`'s `CSRF_COOKIE_NAME` reads from config, defaulting to `app_csrf`
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity`
- [ ] Test count: 5 new tests pass

**Tests**: unit · **Gate**: quick

---

### T51: `configureClient` accepts `csrfCookieName`

**What**: `ConfigureClientOptions` gains the option so a product that renames its CSRF cookie keeps the double-submit working. This is the **only new mechanism** in the brand cluster.
**Where**: `packages/api-client/src/client.ts:109-114`
**Touches**: `packages/api-client/src/client.ts`, `apps/web/src/app/config/api-client.ts`
**Depends on**: T50
**Exclusive**: no
**Reuses**: today's hard-coded regex at `client.ts:65`
**Requirement**: BRAND-02 (F-extensibility-any-product-4) — story AC 2

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `csrfCookieName?: string` exists beside `baseURL` and `onUnauthorized`, defaulting to `app_csrf`
- [ ] The cookie read is built from the option, not a literal regex
- [ ] The dangling "ADR 0015" citations (`client.ts:62,70`, `openapi-config.ts:103`) are corrected — `docs/adr/` holds only `README.md`
- [ ] Gate passes: `pnpm vitest run --project web apps/web/src/app`
- [ ] Test count: 4 new tests pass (default, override, missing cookie, rename round-trip)

**Tests**: unit · **Gate**: quick

---

### T52: `COOKIE_SAMESITE=none` fails closed on a host mismatch

**What**: Refuse the configuration at boot when the API host differs from `WEB_ORIGIN`'s host, unless the token travels a channel the SPA can read.
**Where**: `catalog/identity/single-tenant/api/identity.config.ts:22,98-102`
**Touches**: `catalog/identity/single-tenant/api/identity.config.ts`
**Depends on**: T51
**Exclusive**: no
**Reuses**: the existing refine at `:98-102`, which checks `CSRF_SECRET` but never compares hosts; `setCsrfCookie` at `api/guards/cookie.ts:90-95` sets no `domain` (host-only)
**Requirement**: SEAM-06 (F-web-kernel-2)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `SAMESITE=none` + cross-host is refused at boot with an actionable message
- [ ] `WEB_ORIGIN`'s double declaration (`apps/api/src/shared/config/env.ts:68` and `identity.config.ts:19`) is reconciled to one source
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity`
- [ ] Test count: 5 new tests pass

**Tests**: unit · **Gate**: quick

---

### T53: `APP_TIMEZONE` — validated, IANA, default `UTC`

**What**: Replace the owner-named São Paulo constant with configuration, validated against a closed IANA set **before** it reaches `sql.raw`.
**Where**: `apps/api/src/shared/kernel/clock/bucket-sql.ts:11,25`
**Touches**: `apps/api/src/shared/kernel/clock/bucket-sql.ts`, `apps/api/src/shared/kernel/clock/bucket-sql.spec.ts`, `apps/api/src/shared/config/env.ts`, `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-usage-stats.reader.ts`, `catalog/audit/api/infrastructure/repositories/drizzle-activity-stats.reader.ts`
**Depends on**: T52
**Exclusive**: no
**Reuses**: the per-job `timeZone` field at `maintenance-job.decorator.ts:19` / `maintenance-registry.ts:10` — a config-driven precedent already in the kernel, **not** a leak; `bucket-sql.ts:8-10`'s comment documents the injection-safety property to preserve
**Requirement**: TZ-01 (F-api-kernel-5 **C**) — story AC 3

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `CLINIC_TZ` is gone; the value comes from `APP_TIMEZONE`, default `UTC`
- [ ] An unknown or non-IANA value **fails boot** with a validation error; the closed-map property that keeps `sql.raw` safe survives
- [ ] Absent value falls back to `UTC` and logs the fallback **once** at boot
- [ ] Both catalog readers follow
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/shared/kernel/clock`
- [ ] Test count: 7 new tests pass (default, valid IANA, unknown throws, injection attempt throws, fallback logged once, both readers)

**Tests**: unit · **Gate**: quick

**Commit**: `feat(kernel)!: APP_TIMEZONE replaces the hard-coded clinic timezone`

---

### T54: `STORAGE_*` and a null adapter

**What**: Provider-neutral env keys with an explicit `STORAGE_REGION`, and boot that succeeds unconfigured — the **first call** throws.
**Where**: `apps/api/src/shared/infra/storage/storage.module.ts:10`
**Touches**: `apps/api/src/shared/infra/storage/storage.config.ts`, `apps/api/src/shared/infra/storage/storage.module.ts`, `apps/api/src/shared/infra/storage/s3-storage.adapter.ts`, `apps/api/src/shared/infra/storage/null-storage.adapter.ts`, `apps/api/src/shared/infra/storage/null-storage.adapter.spec.ts`, `apps/api/src/app.module.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `storage-unavailable.error.ts` — **already exists**, waiting for this adapter; `null-professional-adapters.ts` as the null-object shape (**read it before T69 deletes it**)
**Requirement**: SEAM-05 (F-api-kernel-6)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `R2_*` becomes `STORAGE_*` with an explicit `STORAGE_REGION`; `region: "auto"` (`r2-storage.adapter.ts:36`) is gone — it is R2-specific and breaks genuine S3
- [ ] A kernel-only product boots with storage unconfigured; the first storage call throws `StorageUnavailable`
- [ ] `app.module.ts:27` no longer imports `StorageModule` in a way that demands credentials
- [ ] `PROFILE_IMAGE_STORE` (`profile-image-store.port.ts:25`, AD-024) is **untouched** — a different, entry-to-entry port
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/shared/infra/storage`
- [ ] Test count: 6 new tests pass

**Tests**: unit · **Gate**: quick

---

### T55: Extend the hygiene gate to cookies and timezone

**What**: Now that `v3.0.0` renames them, the gate from T46 also fails on a brand cookie prefix or a hard-coded owner timezone.
**Where**: `scripts/platform/__tests__/brand-hygiene.test.mjs`
**Touches**: `scripts/platform/__tests__/brand-hygiene.test.mjs`
**Depends on**: T54
**Exclusive**: no
**Reuses**: T46's exclusion list and harness — extended, not rewritten
**Requirement**: BRAND-01, BRAND-02, TZ-01 (story AC 1–3)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `__Host-rit`, `rit_`, `rit-` and `America/Sao_Paulo` all fail the gate on a rendered child
- [ ] The exclusion self-tests from T46 still pass
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass on top of T46's 8

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T56: Env matrix and `.env.example` for the major's new keys

**What**: One owner for `apps/api/.env.example` in this release: `STORAGE_*`, `APP_TIMEZONE`, and the cookie-name escape hatches.
**Where**: `apps/api/.env.example`
**Touches**: `apps/api/.env.example`, `docs/dev/local-environment.md`
**Depends on**: T55
**Exclusive**: no
**Reuses**: T12's env matrix section
**Requirement**: SEAM-05, TZ-01, BRAND-01 (documentation half)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Every new key is documented with its default and its migration note
- [ ] No `R2_*` key remains
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T57: Contract regeneration after the cookie rename — **EXCLUSIVE**

**What**: Regenerate `openapi.json` and the generated client so the committed contract matches the renamed cookies.
**Where**: `openapi.json`
**Touches**: `openapi.json`, `packages/api-client/src/`
**Depends on**: T49, T50, T51, T52, T53
**Exclusive**: yes
**Reuses**: `pnpm contract` (root `package.json:12`)
**Requirement**: BRAND-01 (F-agnostic-leaks-3 **C**) — story AC 1, contract half

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `pnpm contract` run; `openapi.json:37,48,49` carry the neutral names
- [ ] `git diff --exit-code openapi.json packages/api-client/src` is empty afterwards (T36's CI step is green)
- [ ] The commit contains **only** regenerated artefacts — no hand edits
- [ ] Gate passes: `pnpm check && pnpm test`

**Tests**: none (generated) · **Gate**: build (full-unit)

**Commit**: `chore(contract): regenerate after the neutral cookie rename`

---

### T58: `catalog/professional/` skeleton

**What**: Create the new entry from the `catalog/tag/` skeleton (**48 files on disk**, not the 43 the ledger recorded): `module.json`, `README.md`, `CHANGELOG.md`, the module file.
**Where**: `catalog/professional/module.json`
**Touches**: `catalog/professional/`
**Depends on**: T57
**Exclusive**: no
**Reuses**: `catalog/tag/` — the canonical minimal entry: no `web/`, no `api/testing/`, no `api/seeds/`
**Requirement**: IDENT-01, IDENT-02 (F-catalog-entries-6 **C**) · AD-035

**Tools**: MCP: NONE · Skill: `catalog-modules`

**Done when**:
- [ ] `module.json` carries `name`, `version`, `description`, `kernelRange`, `dependsOn: ["identity"]`, `apiModule`, `schemaExports`, `customMigrations`, `env: []`, `absorbs: []`
- [ ] **No kernel port is introduced** — the aggregate cut removes the cycle, so `dependsOn` alone carries the edge (AD-025); nothing is promoted to `shared/kernel/**` (AD-021/AD-024, RULE C)
- [ ] It is a **new entry**, not a variant (AD-013)
- [ ] Gate passes: `pnpm catalog:lint`

**Tests**: none (manifest) · **Gate**: build

---

### T59: `professional_profile` and the five satellite tables

**What**: The new table that replaces two `users` columns, plus the five satellites moved verbatim.
**Where**: `catalog/professional/api/infrastructure/tables/professional-profile.table.ts`
**Touches**: `catalog/professional/`
**Depends on**: T58
**Exclusive**: no
**Reuses**: the five table files under `catalog/identity/single-tenant/api/infrastructure/tables/` — `user-professional-area`, `user-professional-service`, `user-scheduling-area`, `user-professional-schedule-config`, `professional-default-hours`
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `professional_profile` has `userId` PK + FK to `identity.users.id` `ON DELETE CASCADE`, `servesClients`, `birthDate`, `createdAt`, `updatedAt`
- [ ] The five satellites keep their columns unchanged; `areaId`/`serviceId` stay `text` with no FK (**inherited debt, declared in T63 — not silently dropped**)
- [ ] All six appear in the entry's `schemaExports`
- [ ] Migrations are generated **in the child** by `module add` (AD-015); the template ships TS tables plus `migrations/custom/*.sql`
- [ ] Gate passes: `pnpm catalog:lint && pnpm catalog:typecheck`

**Tests**: none (schema) · **Gate**: build

---

### T60: Domain — entity and ports

**What**: The new entry's own aggregate and ports, taking the fields that leave `User`.
**Where**: `catalog/professional/api/domain/`
**Touches**: `catalog/professional/`
**Depends on**: T59
**Exclusive**: no
**Reuses**: `professional-assignment.repository.ts`, `professional-commitments.port.ts`, `professional-scope.port.ts` from the identity entry
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `servesClients` and `birthDate` live on the new aggregate, with `assertValidBirthDate()` moved
- [ ] The three ports are entry-local (AD-014)
- [ ] Gate passes: `pnpm vitest run --project api catalog/professional`
- [ ] Test count: 6 new tests pass, 1:1 with IDENT-01's ACs

**Tests**: unit · **Gate**: quick

---

### T61: Repositories and query helpers

**What**: The drizzle implementations and their integration specs.
**Where**: `catalog/professional/api/infrastructure/repositories/`
**Touches**: `catalog/professional/`
**Depends on**: T60
**Exclusive**: no
**Reuses**: `drizzle-professional-assignment.repository.ts` and its `int-spec`, `professional-query.helpers.ts`, `professional-directory.facade.int-spec.ts`
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Every port from T60 has an implementation under `infrastructure/repositories/`; no SQL runs from `application/` or `api/`
- [ ] Integration specs use testcontainers, never a DB mock
- [ ] Gate passes: `pnpm vitest run --config vitest.integration.mts --project api-int catalog/professional`
- [ ] Test count: 5 new integration tests pass

**Tests**: integration · **Gate**: full

---

### T62: Facades, application and the api module

**What**: The entry's read surface and its Nest module.
**Where**: `catalog/professional/api/professional.module.ts`
**Touches**: `catalog/professional/`
**Depends on**: T61
**Exclusive**: no
**Reuses**: `professional-assignment.facade.ts`, `professional-directory.facade.ts` and its `spec`, `professional-tables.facade.ts` (which already documents itself as ready for this extraction), `professional-schedule-rows.ts`, `professional-assignment.module.ts`
**Requirement**: IDENT-01, IDENT-02 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Every cross-module read goes through a facade in the owning module
- [ ] The entry registers cleanly with `dependsOn: ["identity"]` and imports no other entry
- [ ] Gate passes: `pnpm vitest run --project api catalog/professional`
- [ ] Test count: 5 new tests pass

**Tests**: unit · **Gate**: quick

---

### T63: `attach_audit()` for the new entry and the declared debt

**What**: The entry ships its own `<schema>.attach_audit()` under the same `pg_proc` guard (AD-032), and its README records the two dangling references it inherits.
**Where**: `catalog/professional/migrations/custom/01_audit_attach_professional.sql`
**Touches**: `catalog/professional/`
**Depends on**: T62
**Exclusive**: no
**Reuses**: identity's `04_audit_attach_hook.sql` — 14 tables today, 7 core plus 7 professional; `catalog/tag/migrations/custom/01_audit_attach_tags.sql` as the per-entry shape
**Requirement**: IDENT-01, IDENT-03 (F-catalog-entries-6 **C**) · AD-032

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The new entry `PERFORM`s its own `attach_audit()` for its seven tables under the `pg_proc` guard
- [ ] The README declares, as inherited debt: `professional-assignment.module.ts` documents itself against a `ServiceModule`/`service` entry **that ships nowhere**, and `areaId`/`serviceId` are `text` with no FK pointing at `service.areas` / `service.services`
- [ ] Neither is silently dropped, and neither is presented as new
- [ ] Gate passes: `pnpm catalog:lint`

**Tests**: none (SQL/docs) · **Gate**: build

**Commit**: `feat(catalog)!: extract the professional slice into its own entry`

---

### T64: The `audit` entry stops registering identity's professional tables

**What**: `audit` names all seven professional tables; shipping the split with only an identity advisory would leave audit children silently broken.
**Where**: `catalog/audit/api/domain/base-audit-registrations.ts:24,30,36,42,48,54,60`
**Touches**: `catalog/audit/api/domain/base-audit-registrations.ts`, `catalog/audit/api/domain/audit-coverage.ts`, `catalog/audit/api/testing/reattach-identity-tables.ts`, `catalog/audit/api/__e2e__/audit.e2e-spec.ts`
**Depends on**: T57
**Exclusive**: no
**Reuses**: `audit-coverage.ts:23-29`, `reattach-identity-tables.ts:28-34`, `audit.e2e-spec.ts:178-184`
**Requirement**: IDENT-03 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] All seven professional registrations are gone from the audit entry
- [ ] `audit-coverage` still passes for the tables audit legitimately owns
- [ ] Gate passes: `pnpm vitest run --project api catalog/audit`
- [ ] Test count: existing tests pass; 4 updated

**Tests**: unit · **Gate**: quick

---

### T65: `breaking` advisory for `identity`

**What**: An advisory telling identity children what the split requires of them.
**Where**: `docs/advisories/ADV-20260824-01.md`
**Touches**: `docs/advisories/ADV-20260824-01.md`
**Depends on**: T64
**Exclusive**: no
**Reuses**: `ADV-20260823-01`'s kernel-advisory shape; `lintAdvisoryPathScope` from T34 constrains the `detect` path
**Requirement**: IDENT-03 (F-catalog-entries-6 **C**) · AD-031

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `module: identity/single-tenant`, severity `breaking`, `affects` naming the pre-split versions
- [ ] `detect`/`parity` paths are **child-layout**, never `catalog/`-prefixed (T34's rule)
- [ ] The `ALTER TYPE` story for dropping the `professional` enum literal is stated
- [ ] Gate passes: `pnpm catalog:lint`

**Tests**: none · **Gate**: build

---

### T66: `breaking` advisory for `audit`

**What**: IDENT-03's "advisory per affected entry" is **identity and audit**, minimum.
**Where**: `docs/advisories/ADV-20260824-02.md`
**Touches**: `docs/advisories/ADV-20260824-02.md`
**Depends on**: T65
**Exclusive**: no
**Reuses**: T65's shape
**Requirement**: IDENT-03 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `module: audit`, severity `breaking`, `affects` naming the pre-split versions
- [ ] It states that an audit child must drop the seven professional registrations
- [ ] Gate passes: `pnpm catalog:lint`

**Tests**: none · **Gate**: build

---

### T67: Cut `servesClients` and `birthDate` out of the `User` aggregate

**What**: The decisive edit — the fields move **out** of `User`, so identity stops calling into the slice and the identity/professional cycle never forms.
**Where**: `catalog/identity/single-tenant/api/domain/entities/user.entity.ts`
**Touches**: `catalog/identity/single-tenant/api/domain/entities/user.entity.ts`, `catalog/identity/single-tenant/api/application/use-cases/create-user/`, `catalog/identity/single-tenant/api/application/use-cases/update-user.use-case.ts`
**Depends on**: T63, T66
**Exclusive**: no
**Reuses**: the ledger's site list — `:13,29,40,77,86,99,110,119,137,145,150,213,220,229-236,325-329`, including `activate()`, `updateOwnProfile()`, `assertValidBirthDate()`
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Neither field remains on `User`
- [ ] `create-user.use-case.ts:23,83,88-90` and `update-user.use-case.ts:16,20,86-87,99,105-135` no longer set them inline
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity`
- [ ] Test count: existing entry tests pass; 8 updated

**Tests**: unit · **Gate**: quick

---

### T68: Remove the professional writers from `UserRepository`

**What**: The core port and its drizzle implementation lose `replaceProfessionalAreas` / `-Services` / `-SchedulingAreas`.
**Where**: `catalog/identity/single-tenant/api/domain/ports/user.repository.ts:16-19,103-111,152,159`
**Touches**: `catalog/identity/single-tenant/api/domain/ports/user.repository.ts`, `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-user.repository.ts`
**Depends on**: T67
**Exclusive**: no
**Reuses**: T61's new repository as the new home
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The core port declares no professional writer
- [ ] `drizzle-user.repository.profile-extension.int-spec.ts` and `.scope.int-spec.ts` are updated or removed with their subject
- [ ] Gate passes: `pnpm vitest run --config vitest.integration.mts --project api-int catalog/identity`
- [ ] Test count: existing tests pass; 4 updated

**Tests**: integration · **Gate**: full

---

### T69: Delete the slot — it exists only to let identity call the slice

**What**: `IdentityProfessionalSlot`, `forRoot({ professional })`, `PROFESSIONAL_SCOPE`, `PROFESSIONAL_COMMITMENTS` and the null adapters are **deleted, not moved**.
**Where**: `catalog/identity/single-tenant/api/identity.module.ts:62-63,78-79,89-90,209-236`
**Touches**: `catalog/identity/single-tenant/api/identity.module.ts`, `catalog/identity/single-tenant/api/infrastructure/professional/`
**Depends on**: T68
**Exclusive**: no
**Reuses**: nothing — but **read `null-professional-adapters.ts` before deleting**: T54 copied its null-object shape
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**) · AD-035

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] All four symbols and `infrastructure/professional/` are gone
- [ ] `module-boundaries.spec.ts` RULE C passes: identity imports no catalog entry
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity apps/api/src/modules`
- [ ] Test count: existing tests pass; 0 silent deletions

**Tests**: unit · **Gate**: quick

---

### T70: Drop the three professional fields from the identity contract

**What**: `areaIds` / `serviceIds` / `schedulingAreaIds` leave five schemas. Because **no professional-named `operationId` exists**, this breaks `createUser` / `updateUser` / `listUsers` themselves — not a route group.
**Where**: `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts:140-143`
**Touches**: `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts`
**Depends on**: T69
**Exclusive**: no
**Reuses**: `createUserSchema:169-181`, `updateUserSchema:187-198`, `userListItemSchema:131-150`, `setPasswordSchema:204-211`, `updateMyProfileSchema:216-221`
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**) — AC 1

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] None of the five schemas carries the three fields
- [ ] The HTTP contract of the identity entry names nothing professional
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity`
- [ ] Test count: existing tests pass; parity specs go red **by design** and are re-snapshotted in T76

**Tests**: unit · **Gate**: quick

---

### T71: Drop the `professional` access-profile literal

**What**: Remove the profile from the code-derived enum, and with it the product-specific seed derivation.
**Where**: `catalog/identity/single-tenant/api/domain/access/access-profile.types.ts:16-21`
**Touches**: `catalog/identity/single-tenant/api/domain/access/access-profile.types.ts`, `catalog/identity/single-tenant/api/domain/permissions/permission.types.ts`, `catalog/identity/single-tenant/api/infrastructure/tables/user.table.ts`, `catalog/identity/single-tenant/api/testing/seed-user.ts`
**Depends on**: T70
**Exclusive**: no
**Reuses**: `user.table.ts:18` derives the PG enum from `permission.types.ts:7-19 defineAccessProfiles([...BASE, ...PRODUCT])`; no migration in this repo writes it — a child generates it with drizzle-kit
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**) · retires the last of AD-002

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `professional` is gone from the base set; a product can still add it through `PRODUCT_ACCESS_PROFILES`
- [ ] `seed-user.ts:14-16,46` no longer derives `servesClients` from `accessProfile === "professional"`, and its comment citing **"migration 0131"** — a product-specific number that should never have been in the template — goes with it
- [ ] The `ALTER TYPE` story lives in T73's migration and T65's advisory, not in a code comment
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity`
- [ ] Test count: existing tests pass; 6 updated

**Tests**: unit · **Gate**: quick

---

### T72: Identity's manifest, audit hook and the kernel harness line

**What**: Remove the five satellites from `schemaExports`, split `04_audit_attach_hook.sql` down to its 7 core tables, and delete the professional truncation line from the kernel test harness.
**Where**: `catalog/identity/single-tenant/module.json:13`
**Touches**: `catalog/identity/single-tenant/module.json`, `catalog/identity/single-tenant/migrations/custom/04_audit_attach_hook.sql`, `apps/api/test/setup/test-db.ts`
**Depends on**: T71
**Exclusive**: no
**Reuses**: T63's per-entry `attach_audit()` as the new home for the seven professional registrations
**Requirement**: IDENT-01, IDENT-02 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `schemaExports` lists only identity's own tables
- [ ] `attach_audit()` registers **7** tables, keeping the redactions for `users.password_hash`, `sessions.token_hash`, `devices.cookie_token_hash`, `verification_tokens.token_hash`
- [ ] `apps/api/test/setup/test-db.ts:105` (`identity.professional_default_hours`) is **deleted** — T45 widened the guard around it in `v2.4.0`; this is the deletion that line was waiting for
- [ ] The entry's `version` bumps for the break
- [ ] Gate passes: `pnpm catalog:lint && pnpm vitest run --project api catalog/identity`

**Tests**: none (manifest/SQL) · **Gate**: build (full-unit)

**Commit**: `feat(identity)!: users, sessions and permissions only`

---

### T73: `scripts/platform/migrations/v3.0.0.mjs`

**What**: The executable, idempotent child migration a major must ship (AD-034).
**Where**: `scripts/platform/migrations/v3.0.0.mjs`
**Touches**: `scripts/platform/migrations/v3.0.0.mjs`
**Depends on**: T56
**Exclusive**: no
**Reuses**: the `v<X.Y.Z>.mjs` convention `pnpm platform template migrate` runs ascending
**Requirement**: area H (release machinery) · AD-034

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Renames `R2_*` to `STORAGE_*` in the child's env files
- [ ] Writes `APP_TIMEZONE` preserving the child's **current** semantics rather than the new `UTC` default — a child's day boundaries must not move silently
- [ ] Offers the cookie-name escape hatch (`COOKIE_NAME`, `CSRF_COOKIE_NAME`) so live sessions are not invalidated without a choice
- [ ] Handles the `professional` enum `ALTER TYPE` explicitly (AD-004 documents the reverse hazard)
- [ ] **Idempotent**: running it twice changes nothing the second time
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T74: `platform template migrate` runs migrations ascending

**What**: Wire, or verify, the runner that applies `v<X.Y.Z>.mjs` in order.
**Where**: `scripts/platform/lib/commands/template.mjs`
**Touches**: `scripts/platform/lib/commands/template.mjs`
**Depends on**: T73
**Exclusive**: no
**Reuses**: `EXIT_CODES`; T20's exit-code convention
**Requirement**: area H · AD-034

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Migrations run ascending by semver, skipping those already applied
- [ ] A failing migration exits non-zero and names the file
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T75: Idempotency and preservation tests for the migration

**What**: Prove the two properties that make the migration safe to ship.
**Where**: `scripts/platform/__tests__/migration-v3.test.mjs`
**Touches**: `scripts/platform/__tests__/migration-v3.test.mjs`
**Depends on**: T74
**Exclusive**: no
**Reuses**: the fixture child at `scripts/platform/__tests__/fixtures/child/`
**Requirement**: area H · AD-034

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Double-run produces a byte-identical tree
- [ ] A child with `R2_*` and no `APP_TIMEZONE` ends with `STORAGE_*` and its **previous** timezone semantics, not `UTC`
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 6 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T76: Contract regen and parity re-snapshot — **EXCLUSIVE**

**What**: Regenerate the contract after the split and re-snapshot the parity fixtures **as an explicit, separately-committed change**, so the diff is reviewable rather than incidental.
**Where**: `openapi.json`
**Touches**: `openapi.json`, `packages/api-client/src/`, `catalog/identity/single-tenant/parity/`, `catalog/professional/parity/`
**Depends on**: T72, T75
**Exclusive**: yes
**Reuses**: `pnpm contract`; `catalog/tag/parity/` as the shape for the new entry's snapshot
**Requirement**: IDENT-01, IDENT-02 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `profiles.parity.spec.ts` and `contract.snapshot.json` — which **fail by design** after T70/T71 — are re-snapshotted, and the diff is reviewed as the deliberate record of the break
- [ ] The new entry has its own parity snapshot
- [ ] `git diff --exit-code openapi.json packages/api-client/src` is empty afterwards
- [ ] The commit contains only regenerated artefacts
- [ ] Gate passes: `pnpm check && pnpm test`

**Tests**: parity snapshot · **Gate**: build (full-unit)

**Commit**: `chore(contract): regenerate and re-snapshot parity after the identity split`

---

### T77: IDENT-02 proof — both entries install alone in a kernel-only child

**What**: The gate IDENT-02 asks for: `catalog:check` passes for `identity` and for `professional`, each alone, in a kernel-only child.
**Where**: `scripts/platform/__tests__/catalog-check-professional.test.mjs`
**Touches**: `catalog/professional/README.md`, `catalog/professional/CHANGELOG.md`, `scripts/platform/__tests__/catalog-check-professional.test.mjs`
**Depends on**: T76
**Exclusive**: no
**Reuses**: `.github/workflows/catalog.yml:38-80`'s matrix job — `professional` joins it
**Requirement**: IDENT-02 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: `catalog-modules`

**Done when**:
- [ ] `pnpm catalog:check identity` and `pnpm catalog:check professional` both pass in a kernel-only child
- [ ] `professional` is added to the `catalog.yml` matrix
- [ ] The entry's README and CHANGELOG are complete, including the declared debt from T63
- [ ] Gate passes: `pnpm catalog:lint && pnpm catalog:typecheck`

**Tests**: parity/integration · **Gate**: full

---

### T78: Record AD-035 and the `v2.2.1` fact

**What**: The extraction is a project-level decision; `STATE.md` also still records tags only up to `v2.2.0`.
**Where**: `.specs/STATE.md`
**Touches**: `.specs/STATE.md`
**Depends on**: T77
**Exclusive**: no
**Reuses**: the AD row format already in the Decisions section
**Requirement**: IDENT-03 (F-catalog-entries-6 **C**) · AD-035

**Tools**: MCP: NONE · Skill: `tlc-spec-driven`

**Done when**:
- [ ] AD-035 records the extraction and its conformance to AD-013, AD-014, AD-015, AD-016, AD-021/024/025 and AD-032, and that it supersedes nothing — AD-002 was already retired by AD-014
- [ ] The `v2.2.1` tag is recorded; the release shape was being derived from a stale snapshot until it was re-derived from `git tag -l`
- [ ] Written by the **orchestrator**, the only writer of `.specs/` during Execute
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T79: Changelog section for `v3.0.0` — **OWNER-GATED**

**What**: Author the `v3.0.0` section with real child migration steps, because a major is the one release allowed to have them.
**Where**: `docs/dev/template-changelog.md`
**Touches**: `docs/dev/template-changelog.md`
**Depends on**: T78
**Exclusive**: no
**Reuses**: `lintChildMigrationSteps`; the `v2.4.0` section from T48
**Requirement**: area H (release machinery) · AD-034

**Tools**: MCP: NONE · Skill: NONE

**BLOCKED**: do not start until `v2.4.0` is tagged — `release-preflight` keys on the **latest** section, so appending `v3.0.0` before that makes `v2.4.0` untaggable.

**Done when**:
- [ ] `git tag -l v2.4.0` returned non-empty **before** the first edit
- [ ] Child migration steps cover: the cookie rename (re-login or pin the old names), `R2_*` to `STORAGE_*`, `APP_TIMEZONE`, the identity split with its `ALTER TYPE` story, and installing `professional` for a child that needs the slice
- [ ] Each step names `pnpm platform template migrate` where the migration does the work
- [ ] The agent **does not tag and does not push** (AD-006/AD-034)
- [ ] Gate passes: `pnpm catalog:lint`

**Tests**: none · **Gate**: build

**Commit**: `docs(changelog): v3.0.0`

---

## Wave Execution Map

```
Wave 1:  [C1: T1→T2→T3→T4→T5] ∥ [C2: T6→T7→T8→T9→T10→T11] ∥ [C3: T12→T13→T14→T15→T16]
Wave 2:  [C4: T17→T18→T19→T20→T21→T22] ∥ [C5: T23→T24→T25→T26→T27] ∥ [C6: T28→T29→T30→T31→T32]
Wave 3:  [C7: T33→T34→T35→T36] ∥ [C8: T37→T38→T39→T40] ∥ [C9: T41]
Wave 4:  [C10: T42]  (exclusive)
Wave 5:  [C11: T43]  (exclusive)
Wave 6:  [C12: T44→T45→T46→T47]
Wave 7:  [C13: T48]  (owner-gated)
         ► Verifier pass 1 (v2.4.0 scope) ► owner dispatches release → v2.4.0
Wave 8:  [C14: T49→T50→T51→T52→T53] ∥ [C15: T54→T55→T56]
Wave 9:  [C16: T57] (exclusive)
Wave 10: [C17: T58→T59→T60→T61→T62→T63] ∥ [C18: T64→T65→T66]
Wave 11: [C19: T67→T68→T69→T70→T71→T72] ∥ [C20: T73→T74→T75]
Wave 12: [C21: T76] (exclusive)
Wave 13: [C22: T77→T78]
Wave 14: [C23: T79] (owner-gated)
         ► Verifier pass 2 (whole feature) ► owner dispatches release → v3.0.0
```

**How wave-based execution works.** At Execute the orchestrator never implements a cluster. For each
wave it dispatches **one worker per cluster, all at once** (at most 4 in flight; more queue FIFO),
waits for every compact summary, runs the Build gate **once** through the runner (scoped or
full-unit as the Wave Plan says), records results here, and moves to the next wave. Workers own only
the files in their `Touches` union, run their own scoped gate redirected to a log, delegate an open
navigation question to a scout, and commit one atomic, pathspec-limited commit per task.

**Model tier per cluster** — judgement, passed on every dispatch, never hard-coded:

| Cluster | Tier | Why |
| --- | --- | --- |
| C1, C4, C7, C9, C20 | sonnet | tooling, CI and config — the default tier |
| C2, C3, C8, C12, C15, C18, C22 | sonnet | docs, workflows, message tables |
| C5, C6 | sonnet | kernel seams, but no domain transition |
| C10, C11, C13, C23 | sonnet | manifests, harness text, changelog |
| C14 | **opus** | contract inputs plus ADR-governed cookie and timezone rules |
| C16, C21 | **opus** | contract regeneration |
| C17, C19 | **opus** | domain entities and transitions, migrations, AD-035 |
| Verifier pass 1 | sonnet | no P0 surface in the minor |
| Verifier pass 2 | **opus** | data integrity plus a breaking contract change (P0) |

---

## Task Granularity Check

| Tasks | Scope | Status |
| --- | --- | --- |
| T1, T3, T4, T17, T20, T21, T22, T33, T34, T51, T74 | 1 function or 1 module | ✅ Granular |
| T2 | 1 helper plus its 8 call sites — mechanical, one concept | ✅ Granular |
| T5, T18, T19, T29, T30, T31, T52, T53, T54, T73 | 1 behaviour in 1 seam | ✅ Granular |
| T6, T7, T8, T9, T10, T11, T14, T15, T16, T24, T32, T35, T38, T47, T56 | 1 coherent file change | ✅ Granular |
| T12, T13 | 1 document rewrite each — the design says rewrite, not edit | ✅ Granular |
| T23, T25, T26, T27, T28, T37, T39, T40, T49, T50 | 1 seam across its consumers | ✅ Granular |
| T36, T44, T45, T46, T55, T75, T77 | 1 gate or 1 spec | ✅ Granular |
| T41 | 1 file (`copier.yml`), 4 requirements — **wiring task by design** | ✅ Granular — one owner for a shared file |
| T42, T43, T57, T76 | exclusive, 1 concern each | ✅ Granular |
| T48, T79 | 1 changelog section each | ✅ Granular |
| T58, T59, T60, T61, T62, T63 | new entry, one layer per task | ✅ Granular |
| T64, T65, T66 | 1 entry or 1 advisory each | ✅ Granular |
| T67, T68, T69, T70, T71, T72 | one identity layer per task | ✅ Granular |
| T78 | 1 STATE.md record | ✅ Granular |

No task creates multiple components across unrelated files. **0 ❌.**

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram shows | Status |
| --- | --- | --- | --- |
| T1 | None | wave 1, first in C1 | ✅ |
| T2 | T1 | after T1 in C1 | ✅ |
| T3 | None | C1, order only | ✅ |
| T4 | T1 | after T1 in C1 | ✅ |
| T5 | T1, T2 | after both in C1 | ✅ |
| T6 | None | wave 1, first in C2 | ✅ |
| T7 | T6 | after T6 in C2 | ✅ |
| T8 | T6 | after T6 in C2 | ✅ |
| T9 | T8 | after T8 in C2 | ✅ |
| T10 | T7, T9 | after both in C2 | ✅ |
| T11 | None | C2, order only | ✅ |
| T12 | None | wave 1, first in C3 | ✅ |
| T13 | T12 | after T12 in C3 | ✅ |
| T14 | T13 | after T13 in C3 | ✅ |
| T15 | T12, T13, T14 | after all three in C3 | ✅ |
| T16 | T15 | after T15 in C3 | ✅ |
| T17 | None | wave 2, first in C4 | ✅ |
| T18 | T17 | after T17 in C4 | ✅ |
| T19 | T18 | after T18 in C4 | ✅ |
| T20 | T18 | after T18 in C4 | ✅ |
| T21 | T20 | after T20 in C4 | ✅ |
| T22 | T21 | after T21 in C4 | ✅ |
| T23 | None | wave 2, first in C5 | ✅ |
| T24 | T23 | after T23 in C5 | ✅ |
| T25 | T23 | after T23 in C5 | ✅ |
| T26 | T25 | after T25 in C5 | ✅ |
| T27 | T26 | after T26 in C5 | ✅ |
| T28 | None | wave 2, first in C6 | ✅ |
| T29 | T28 | after T28 in C6 | ✅ |
| T30 | T29 | after T29 in C6 | ✅ |
| T31 | T30 | after T30 in C6 | ✅ |
| T32 | T29, T31 | after both in C6 | ✅ |
| T33 | T1, T2 | wave 3 ← wave 1 (C1) | ✅ |
| T34 | T33 | after T33 in C7 | ✅ |
| T35 | T33 | after T33 in C7 | ✅ |
| T36 | T35 | after T35 in C7 | ✅ |
| T37 | None | wave 3, first in C8 | ✅ |
| T38 | T37 | after T37 in C8 | ✅ |
| T39 | T38 | after T38 in C8 | ✅ |
| T40 | T39 | after T39 in C8 | ✅ |
| T41 | T8, T9, T23, T29 | wave 3 ← waves 1–2 | ✅ (see note) |
| T42 | T33, T34 | wave 4 ← wave 3 (C7) | ✅ |
| T43 | T16, T41 | wave 5 ← waves 1 and 3 | ✅ |
| T44 | T43 | wave 6 ← wave 5 | ✅ |
| T45 | T44 | after T44 in C12 | ✅ |
| T46 | T45 | after T45 in C12 | ✅ |
| T47 | T46 | after T46 in C12 | ✅ |
| T48 | T42, T43, T47 | wave 7 ← waves 4, 5, 6 | ✅ |
| T49 | None | wave 8, first in C14 | ✅ |
| T50 | T49 | after T49 in C14 | ✅ |
| T51 | T50 | after T50 in C14 | ✅ |
| T52 | T51 | after T51 in C14 | ✅ |
| T53 | T52 | after T52 in C14 | ✅ |
| T54 | None | wave 8, first in C15 | ✅ |
| T55 | T54 | after T54 in C15 | ✅ |
| T56 | T55 | after T55 in C15 | ✅ |
| T57 | T49, T50, T51, T52, T53 | wave 9 ← wave 8 (C14) | ✅ |
| T58 | T57 | wave 10 ← wave 9 | ✅ |
| T59 | T58 | after T58 in C17 | ✅ |
| T60 | T59 | after T59 in C17 | ✅ |
| T61 | T60 | after T60 in C17 | ✅ |
| T62 | T61 | after T61 in C17 | ✅ |
| T63 | T62 | after T62 in C17 | ✅ |
| T64 | T57 | wave 10 ← wave 9 | ✅ |
| T65 | T64 | after T64 in C18 | ✅ |
| T66 | T65 | after T65 in C18 | ✅ |
| T67 | T63, T66 | wave 11 ← wave 10 (C17 and C18) | ✅ |
| T68 | T67 | after T67 in C19 | ✅ |
| T69 | T68 | after T68 in C19 | ✅ |
| T70 | T69 | after T69 in C19 | ✅ |
| T71 | T70 | after T70 in C19 | ✅ |
| T72 | T71 | after T71 in C19 | ✅ |
| T73 | T56 | wave 11 ← wave 8 (C15) | ✅ |
| T74 | T73 | after T73 in C20 | ✅ |
| T75 | T74 | after T74 in C20 | ✅ |
| T76 | T72, T75 | wave 12 ← wave 11 (C19 and C20) | ✅ |
| T77 | T76 | wave 13 ← wave 12 | ✅ |
| T78 | T77 | after T77 in C22 | ✅ |
| T79 | T78 | wave 14 ← wave 13 | ✅ |

**Note on T41 — a same-wave dependency found and removed, not waived.** The first draft of T41 also
listed T37 (C8, wave 3) as a dependency. A task may depend only on an earlier wave or on an earlier
task **in its own cluster**; a sibling cluster of the same wave is a race, not an ordering. The
relationship is real but one-directional and file-disjoint: T37 renders the language rule inside
`AGENTS.md.jinja`, T41 adds the `product_locale` question that feeds it, and T41 reads nothing T37
writes. **T41's `Depends on` is therefore `T8, T9, T23, T29` — all in waves 1–2.** Recorded here so
the Execute-time re-validation sees the reasoning instead of re-deriving it.

---

## Test Co-location Validation

| Task | Layer created/modified | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T1, T2, T3, T4, T5 | platform scripts | unit (`node:test`) | unit | ✅ |
| T6 | API kernel config plus docs | unit | unit | ✅ |
| T7 | env and docs only | none | none | ✅ |
| T8 | manifest plus docs; AC proof is a guard | none | unit | ✅ exceeds |
| T9, T10 | docs, shell script | none | none | ✅ |
| T11 | regression assertion | unit (`node:test`) | unit | ✅ |
| T12, T13, T14, T15 | docs and `.jinja` | none | none | ✅ |
| T16 | docs plus committed guard | unit (`node:test`) | unit | ✅ |
| T17, T18, T19, T20, T21, T22 | platform scripts and one hook | unit (`node:test`) | unit | ✅ |
| T23 | web app and config | unit | unit | ✅ |
| T24 | asset and nginx config | none | none | ✅ |
| T25, T26, T27 | web app and shared | unit | unit | ✅ |
| T28 | API kernel errors | unit | unit | ✅ |
| T29 | API boot, route level | e2e | e2e | ✅ |
| T30 | API kernel context | unit | unit | ✅ |
| T31 | API infra repository | integration | integration | ✅ |
| T32 | docs | none | none | ✅ |
| T33, T34 | platform scripts | unit (`node:test`) | unit | ✅ |
| T35 | workflow | none | none | ✅ |
| T36 | workflow, manifest, guard | none | unit | ✅ exceeds |
| T37, T38 | docs and `.jinja` | none | none | ✅ |
| T39, T40 | catalog entry code | unit | unit | ✅ |
| T41 | `copier.yml` and workflow; AC proof is a gate | none | unit | ✅ exceeds |
| T42 | manifests | none | none | ✅ |
| T43 | harness files | unit (`node:test`) | unit | ✅ |
| T44 | hooks plus docs | unit (`node:test`) | unit | ✅ |
| T45 | API test harness plus guard spec | unit | unit | ✅ |
| T46, T55 | committed gate | unit (`node:test`) | unit | ✅ |
| T47 | docs | none | none | ✅ |
| T48, T79 | changelog | none | none | ✅ |
| T49, T50, T51, T52, T53 | API kernel, catalog entry, package | unit | unit | ✅ |
| T54 | API infra storage | unit | unit | ✅ |
| T56 | env and docs | none | none | ✅ |
| T57, T76 | generated artefacts | gate / parity snapshot | gate / parity | ✅ |
| T58, T59 | manifest and schema | none | none | ✅ |
| T60, T62 | entry domain and api | unit | unit | ✅ |
| T61 | entry repositories | integration | integration | ✅ |
| T63 | SQL and docs | none | none | ✅ |
| T64 | entry domain | unit | unit | ✅ |
| T65, T66 | advisories | none | none | ✅ |
| T67, T69, T70, T71 | entry domain and contract | unit | unit | ✅ |
| T68 | entry port plus repository | integration | integration | ✅ |
| T72 | manifest, SQL, harness | none | none | ✅ |
| T73, T74, T75 | platform scripts | unit (`node:test`) | unit | ✅ |
| T77 | entry parity in a rendered child | parity/integration | parity/integration | ✅ |
| T78 | `.specs/STATE.md` | none | none | ✅ |

**0 ❌ VIOLATION.** No task defers its tests to a later task. Where the matrix says `none` but the
requirement's declared proof is `gate` (T8, T36, T41), the task carries a committed guard anyway —
exceeding the matrix, never falling short of it.

---

## Wave/Cluster Cross-Check

| Wave | Cluster | Tasks | Deps outside earlier waves / own cluster? | Files shared with a sibling cluster? | Exclusive alone? | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | C1 | T1→T5 | none | none — `scripts/platform/**` is C1's alone this wave | n/a | ✅ |
| 1 | C2 | T6→T11 | none | none — C1 owns `lib/**` and five named test files; C2 names three different test files | n/a | ✅ |
| 1 | C3 | T12→T16 | none | none — C3 owns `docs/agents/**` and `docs/dev/deploy.md.jinja`; C2 owns `docs/dev/local-environment.md` | n/a | ✅ |
| 2 | C4 | T17→T22 | none | none | n/a | ✅ |
| 2 | C5 | T23→T27 | none | none — `apps/web/**` is C5's alone | n/a | ✅ |
| 2 | C6 | T28→T32 | none | none — `apps/api/src/**` is C6's alone this wave | n/a | ✅ |
| 3 | C7 | T33→T36 | T33 ← T1, T2 (wave 1) | none | n/a | ✅ |
| 3 | C8 | T37→T40 | none | none — C8 owns `docs/code-quality.md`, `AGENTS.md.jinja`, `catalog/*/api/**`; C7 owns `scripts/**`, workflows, `docs/arch/back.md` | n/a | ✅ |
| 3 | C9 | T41 | T8, T9, T23, T29 (waves 1–2) | none — `copier.yml` and `feedback-triage.yml` are C9's alone | n/a — single-task cluster justified: `copier.yml` is a shared wiring file with four editors | ✅ |
| 4 | C10 | T42 | T33, T34 (wave 3) | n/a — only cluster | **yes** | ✅ |
| 5 | C11 | T43 | T16 (wave 1), T41 (wave 3) | n/a — only cluster | **yes** | ✅ |
| 6 | C12 | T44→T47 | T43 (wave 5) | n/a — only cluster | n/a | ✅ |
| 7 | C13 | T48 | T42, T43, T47 (waves 4–6) | n/a — only cluster | n/a — single-task cluster justified: owner-gated barrier | ✅ |
| 8 | C14 | T49→T53 | none | none — C14 owns `openapi-config.ts`, `identity.config.ts`, `client.ts`, `bucket-sql.ts`, `env.ts`; C15 owns `infra/storage/**`, `app.module.ts`, `.env.example` | n/a | ✅ |
| 8 | C15 | T54→T56 | none | none — `apps/api/.env.example` and `docs/dev/local-environment.md` are C15's alone in this wave | n/a | ✅ |
| 9 | C16 | T57 | T49–T53 (wave 8) | n/a — only cluster | **yes** | ✅ |
| 10 | C17 | T58→T63 | T57 (wave 9) | none — `catalog/professional/**` is C17's alone | n/a | ✅ |
| 10 | C18 | T64→T66 | T57 (wave 9) | none — `catalog/audit/**` and the two new advisories are C18's alone | n/a | ✅ |
| 11 | C19 | T67→T72 | T63, T66 (wave 10) | none — `catalog/identity/**` and `apps/api/test/setup/test-db.ts` are C19's alone | n/a | ✅ |
| 11 | C20 | T73→T75 | T56 (wave 8) | none — `scripts/platform/migrations/**` is C20's alone | n/a | ✅ |
| 12 | C21 | T76 | T72, T75 (wave 11) | n/a — only cluster | **yes** | ✅ |
| 13 | C22 | T77→T78 | T76 (wave 12) | n/a — only cluster | n/a | ✅ |
| 14 | C23 | T79 | T78 (wave 13) | n/a — only cluster | n/a — single-task cluster justified: owner-gated barrier | ✅ |

**Cluster sizes**: 5, 6, 5 · 6, 5, 5 · 4, 4, 1 · 1 · 1 · 4 · 1 · 5, 3 · 1 · 6, 3 · 6, 3 · 1 · 2 · 1.
Every multi-task cluster sits in the 3–6 range, inside the 4–8 guidance for a vertical slice. **No
wave holds three or more single-task non-exclusive clusters** — the only ones are C9, C13 and C23,
each alone in its wave with a stated justification. **No wave exists only because of the 4-in-flight
cap**: the widest wave holds 3 clusters.

### Files with more than one editor across the plan, and their single owner per wave

| File | Editors | How single ownership is kept |
| --- | --- | --- |
| `copier.yml` | T8, T9, T23, T29, T37, T41 | **wiring task T41** owns it outright; every other task is forbidden to touch it and says so in its body |
| `docs/dev/local-environment.md` | T6, T7, T8, T9, T10 (C2, wave 1); T56 (C15, wave 8) | one cluster per wave |
| `docs/dev/deploy.md.jinja` | T13 — carries BRAND-05, BRAND-06 and TOOL-09 | one rewrite task carries all three concerns |
| `apps/api/.env.example` | T6, T7 (C2, wave 1); T56 (C15, wave 8) | one cluster per wave |
| `apps/api/src/shared/config/env.ts` | T6 (wave 1), T28 (wave 2), T53 (wave 8) | different waves |
| `apps/web/.env.example` | T6 (C2, wave 1), T23 (C5, wave 2) | different waves |
| `catalog/identity/single-tenant/README.md` | T25 (C5, wave 2), T47 (C12, wave 6) | different waves |
| `catalog/identity/single-tenant/api/identity.config.ts` | T50, T52 (both C14, wave 8) | same cluster, ordered |
| `apps/api/test/setup/{test-db,unit-env,e2e-env}.ts` | T45 (C12, wave 6), T49 (C14, wave 8), T72 (C19, wave 11) | different waves |
| `scripts/platform/lib/lint.mjs` | T1 (C1, wave 1), T33 and T34 (C7, wave 3) | different waves |
| `scripts/platform/lib/commands/add.mjs` | T3 (C1, wave 1), T17, T18, T19 (C4, wave 2) | different waves |
| `scripts/platform/__tests__/docs-no-owner-infra.test.mjs` | T16 (C3, wave 1), T43 (C11, wave 5) | different waves — T43 removes the `harness.md` exclusion T16 had to leave behind |
| `scripts/platform/__tests__/brand-hygiene.test.mjs` | T46 (wave 6), T55 (wave 8) | different waves |
| `docs/arch/front.md` | T38 (C8, wave 3), T44 (C12, wave 6) | different waves |
| `openapi.json`, `packages/api-client/src/` | T57 (wave 9), T76 (wave 12) | both exclusive, different waves |
| `docs/dev/template-changelog.md` | T48 (wave 7), T79 (wave 14) | different waves, both owner-gated |

---

## Tools — MCPs and Skills

No MCP is required by any task. Skills used: `catalog-modules` (T58 and T77 — entry authoring and
`catalog:check`) and `tlc-spec-driven` (T78 — the Decisions record). Everything else is plain file
work under the standard gates.

---

## Verifier notes (input to Execute)

- **Two passes.** Pass 1 after wave 7, scoped to the `v2.4.0` requirements. Pass 2 after wave 14,
  over the whole feature. Author ≠ verifier in both.
- **RUN-04 is `satisfied-by-sibling`**, evidence = the `prettier-format-gate` commit. This feature
  asserts only that `pnpm format:check` is green at its HEAD. Do **not** mark it unmet for lack of a
  task here (§ 0.2).
- **RUN-05 is a regression assertion**, not a fix — `F-runtime-probe-4` was closed by `74022fe`.
- **CAT-05's probe is already spent** (`git tag -l 'catalog/*'` → empty). **Probe budget 1 of 3; no
  further probes.** Every other AC proves by `test` or `gate`.
- **The locale default is load-bearing.** Verify *absence of change* at `product_locale=pt-BR`, not
  only the presence of English at `en`. A child whose `.copier-answers.yml` lacks the key must see no
  shipped string change.
- **BRAND-04 versus BRAND-05.** Judge the harness-taxonomy AC (story AC 5) against **BRAND-04** and
  the infra-docs AC (story AC 6) against **BRAND-05** — § 0.1. `design.md` § *Execute notes* uses the
  older, shifted labels.
- **T43 changes the rules this workflow runs under.** Judge it against the taxonomy in force at
  dispatch, which its commit body quotes.
- **Parity specs fail by design** after T70 and T71, and are re-snapshotted in T76. A red parity spec
  between wave 11 and wave 12 is expected, not a regression.
- **The agent never tags and never pushes** (AD-006/AD-034). The four owner hand-off points are
  listed in § *Owner hand-off points*.

---

## Execution Log

Written by the orchestrator only, after each wave's Build gate. Hashes are the workers' atomic
commits, in task order.

### Wave 1 — GATED GREEN (2026-08-23)

| Cluster | Tasks | Commits | Worker's own gate |
| --- | --- | --- | --- |
| C1 (sonnet) | T1 → T5 | `a754208`, `b4cfa63`, `72592c6`, `a16bef0`, `5f89723` | `pnpm test:scripts` exit 0 |
| C2 (sonnet) | T6 → T11 | `bd56b71`, `37c873c`, `4aeb55e`, `aa0da6b`, `f0dd838`, `2e19a04` | `pnpm vitest run --project api apps/api/src/shared/config` 27 passed; `pnpm test:scripts` exit 0 |
| C3 (sonnet) | T12 → T16 | `160bc60`, `63bb75f`, `29b3357`, `d8f036b`, `768c1ef` | `pnpm test:scripts` exit 0 |

**Build gate (`full-unit`)** — run once, through the runner, after all three clusters reported:

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm check` | 0 | 5/5 turbo tasks |
| `pnpm test` | 0 | 585 tests / 89 files — unchanged vs the pre-feature baseline |
| `pnpm test:scripts` | 0 | 376 tests / 42 files — **+31 tests, +8 files** vs baseline 345/34 |

Pre-feature baseline, measured on `92b4120` before dispatch: **930 tests / 123 files, 0 failures**
(`pnpm test` 585/89 · `pnpm test:scripts` 345/34). No count dropped — no silent deletion.

#### Deviations recorded in wave 1 (input to the Verifier)

1. **T16 — the area-label placeholder is discovery-based, not a copier variable.** The worker shipped
   a `gh label list` discovery placeholder with domain-neutral examples instead of the `{{ … }}`
   Jinja placeholder T16's body names, because such a variable must be declared in `copier.yml`, and
   that file is **T41's** alone. § *Files with more than one editor* never listed T16 as a
   `copier.yml` editor — **the plan created this gap, not the worker.** The Verifier judges story
   AC 4 ("the area-label list SHALL come from a product-filled placeholder") against the shipped
   shape; if a declared copier variable is required, the fix belongs to **T41 (wave 3)**, whose
   `Touches` already carry `copier.yml`.
2. **T16 — `SPEC_DEVIATION` at `scripts/platform/__tests__/docs-no-owner-infra.test.mjs:10-14`.** The
   guard's scan excludes `docs/agents/harness.md`, which still names booking rules. That file is
   **BRAND-04 / T43 (wave 5)** and was forbidden to C3. **T43 must remove the exclusion** so the guard
   covers the literal `docs/agents/**` its AC names — otherwise BRAND-04 ships a fix its own guard
   cannot see. Added to T43's *Done when*.
3. **T14 — this plan's own `Reuses` field was wrong.** The real `lefthook.yml` pre-push chain is three
   steps (`migrations → typecheck → test-coverage`); T14 cited a four-step chain including
   `catalog-typecheck`, which is not on disk. The worker documented the real chain. **The plan was
   wrong, the delivery is right** — no fix task.
4. **T8 — `db:seed` was removed, not repaired.** It targeted an absent `apps/api/src/seeds` with no
   replacement in scope; T8's own wording ("either the script ships or the doc stops naming it")
   permits it.
5. **T6 — four in-scope files were already correct** (`apps/web/.env.example`, both Dockerfiles,
   `docker-compose.yml` already at `3000`). No edit needed; the ten-site assertion still covers them.

#### Cross-feature facts learned during wave 1 (from the `prettier-format-gate` session)

Premises this plan recorded that have changed. **None is visible to `wave-plan-check.mjs`.**

- **The five entries will sit at `2.0.1`, not `2.0.0`, before T42 runs.** That feature's repo-wide
  reformat trips `entryChangedWithoutBump`, so it carries a bump task of its own. **T42 bumps from
  `2.0.1`.** § 0.3's advisory-`affects` row is unaffected; any reading of "all five entries sit at
  `2.0.0`" (design.md § C *Notes*) is stale from that feature's landing onward.
- **`lefthook-local.yml` gains a pre-commit format check** in **auto-fix** mode (`--write` + re-stage),
  chosen so a worker's commit is fixed rather than rejected. Asked of that session: the re-stage must
  be pathspec-limited — a `git add -A` inside the hook would sweep a sibling cluster's in-flight edits
  into an unrelated worker's commit.
- **The `v2.3.0` gate was lifted on that feature only** — it now ships *inside* `v2.3.0`. **This does
  not transfer: T48 stays blocked** until `git tag -l v2.3.0` is non-empty (AD-034, latest-section
  rule). The tag that unblocks T48 is the one their release dispatches.
- **Ordering is SETTLED — `prettier-format-gate` goes first.** Superseded by the ruling below; the
  reasoning that made it the cheaper order stands: that feature's T7/T8 reformat the whole tree and
  would rewrite any file a worker holds open, RUN-04 is `satisfied-by-sibling` here, and this
  feature's Verifier asserts `pnpm format:check` green at HEAD — which cannot hold until that feature
  lands, so the dependency runs one way only.

### Wave 2 — HELD (not started). Ordering ruled 2026-08-23

**Ruling: `prettier-format-gate` executes first.** Relayed by that session (`platform-template-3e`)
as its user's decision, and **verified on disk rather than taken on the peer's word** — the ordering
is no longer a matter of good faith between sessions, because that feature is *live in this same
checkout*:

| Evidence | State at the time of this entry |
| --- | --- |
| `5c4e76d` | `spec(prettier-format-gate): amend the plan before wave 1` — lifts its `v2.3.0` gate, adds its T12 |
| `266d2fd` | its T1 — `.prettierrc` loses the tailwind plugin |
| `a3ebba0` | its T2 — `.vscode/settings.json` loses the tailwind block |
| working tree | `catalog/notification/api/infrastructure/mailer/email-theme.ts` modified — its T3 in flight |

Wave 2 (C4 `T17→T22` ∥ C5 `T23→T27` ∥ C6 `T28→T32`, sonnet, gate `full-unit`) is **dispatched only
after that session reports the reformat has landed.** Dispatching into a live whole-tree reformat
would put C5 (`apps/web/**`) and C6 (`apps/api/**`) workers inside the exact file set its T7 rewrites.
That session will signal twice: after its waves 3/4 (T7 outside `catalog/**`, T8 the catalog, T12 the
five manifests) — the moment this checkout's on-disk world changes — and again at its Verifier PASS.

**On resume, re-measure the baseline before dispatching.** The post-wave-1 numbers in this log
(`pnpm test` 585/89, `pnpm test:scripts` 376/42) are stale by construction: that session's T5 and T10
add tests of their own (`376` was the figure this feature handed it). `pnpm test` should be untouched.
Re-measuring is the first step of the wave-2 Build gate, not an assumption.

#### Wave 3 now carries a shelf-life warning — `release-marker-commit` (`platform-template-28`)

Still at Specify, **nothing written**, so this is not yet a conflict — but its scope grew to **delete
`.github/workflows/catalog.yml`**, merge its jobs into `ci.yml`, and drop the `_exclude` entry at
`copier.yml:35`. Two wave-3 tasks are written against exactly that:

- **T35** puts `fetch-depth: 0` on the `gates` job at `.github/workflows/catalog.yml:14-31`. If that
  feature lands first, the file is gone and the baseline fix belongs on the **merged `gates` job in
  `ci.yml`** instead. The requirement (CAT-02) is unaffected — only its `Where` is.
- **T41** owns `copier.yml` and would be editing a file whose catalog-workflow `_exclude` line that
  feature removes.

Whoever reaches wave 3 first must re-read `.github/workflows/` on disk before dispatching C7/C9
rather than trusting these `Where` fields.

#### Correction to this log's own record

The dirty `.specs/STATE.md` in this checkout is **`platform-template-28`'s**, not the
`prettier-format-gate` session's — 28 claimed the `release-marker-commit` Handoff entry and its
follow-up bullet explicitly, and 3e states it has never written to `STATE.md` this session. It stays
unstaged by this feature either way (AD-006: never `git add .specs/STATE.md` without reading the
diff), and it needs to return to 28 to be committed.
