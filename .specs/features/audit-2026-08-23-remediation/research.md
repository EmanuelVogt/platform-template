# Research — HEAD re-confirmation of the 2026-08-23 audit findings

The audit ran at `ab7685f` (tag `v2.1.0`). Tag `v2.2.0` and the `template-update-contract` feature
landed afterwards, so **every finding is re-checked against the current tree before its fix is
designed**. This file is the evidence ledger Design writes against; `design.md` cites it instead of
re-deriving file:line facts.

Status vocabulary: **STILL-LIVE** (unchanged at HEAD) · **CLOSED** (already fixed; the requirement
becomes an assertion that it stays fixed) · **CHANGED** (partially fixed, moved, or a different
shape now — the requirement is re-scoped).

Sweep state: RUN and LOC clusters landed. BRAND/TZ, CAT, SEAM, TOOL and IDENT clusters were
dispatched in parallel and are **not yet recorded here** — see § *Pending*.

---

## Cluster RUN — "a generated product boots and its own tooling runs"

| Finding | Status | Evidence at HEAD |
| --- | --- | --- |
| F-copier-mechanics-1 **C** | STILL-LIVE | `scripts/platform/lib/catalog-graph.mjs:4` `import { discoverEntries } from "./lint.mjs"`; `copier.yml:54` lists `scripts/platform/lib/lint.mjs` under `_exclude`. Every `pnpm platform *` still dies at import time in a child. |
| F-api-kernel-3 | STILL-LIVE | `docker-compose.yml:59-60` `env_file: [apps/api/.env]` (carries `PORT=3222`), `:70` `ports: ["3000:3000"]`, no `PORT` in the `environment:` block; `apps/api/Dockerfile:54` `EXPOSE 3000`, `:57` healthcheck on `process.env.PORT||3000`. Container listens on 3222 while compose publishes and probes 3000. |
| F-agnostic-leaks-7 | STILL-LIVE | `apps/api/src/shared/config/env.ts:14` `PORT: z.coerce.number().int().positive().default(3222)` vs `apps/web/.env.example:2` `VITE_API_URL=http://localhost:3000`. |
| F-docs-consistency-5 | STILL-LIVE | `README.md.jinja:43` and `.github/README.md:159` say `localhost:3000`; `apps/api/.env.example:5` `PORT=3222`; `docs/dev/local-environment.md:48` documents `api (3222)` as correct. |
| F-ci-docker-infra-6 | **CHANGED** | Redis half fixed *inside compose only*: `docker-compose.yml:68` `REDIS_URL: redis://:redis@redis:6379`. Port half still live (`:70` vs `env_file` `PORT=3222`), and `apps/api/.env.example:49` still ships an unauthenticated URL for the host `pnpm dev` path. |
| F-agnostic-leaks-6 | STILL-LIVE | `apps/api/.env.example:49` `REDIS_URL=redis://localhost:6379`; `docker-compose.yml:33-34` `command: ["redis-server", "--requirepass", "redis"]`; `docs/dev/local-environment.md:32` documents `redis://:redis@localhost:6379` as "already reflected in apps/api/.env" — false against the shipped example. |
| F-agnostic-leaks-5 / F-api-kernel-1 | STILL-LIVE | `copier.yml:89` `_message_after_copy` names `pnpm --filter api db:bootstrap`. `db:bootstrap` and `db:seed:demo` exist in no manifest; `apps/api/package.json:15` `"db:seed": "ts-node src/seeds/run.ts"` targets `apps/api/src/seeds`, which does not exist. Also named at `README.md.jinja:39`, `.github/README.md:155`, `docs/dev/local-environment.md:40-42`. |
| F-web-kernel-1 | STILL-LIVE | `.prettierrc:8-9` `"plugins": ["prettier-plugin-tailwindcss"]`, `"tailwindStylesheet": "packages/ui/src/styles/globals.css"`; `packages/` holds only `api-client`, `eslint-config`, `typescript-config`. Reproduced: `pnpm exec prettier --check apps/web/src/main.tsx` → `ENOENT`. Same vestige at `.vscode/settings.json:48`. |
| F-runtime-probe-4 | **CLOSED** | `74022fe` renamed the leaked fixture to `scripts/platform/__tests__/fixtures/child/copier-answers.yml` (no leading dot); `git ls-files` shows no tracked `.copier-answers.yml`. The hand repair is documented at `docs/dev/template-changelog.md:99-107` (v2.2.0 § *Child migration steps*, step 1) and `.agents/skills/template-update/SKILL.md:29-37` (mirrored in `.claude/skills/`). |

### Facts the RUN fixes are designed against

**Port sites (single-value sweep target).** `env.ts:14` `3222` · `apps/api/.env.example:5` `3222` ·
`apps/web/.env.example:2` `3000` · `Dockerfile:54` `EXPOSE 3000` · `Dockerfile:57` healthcheck
`PORT||3000` · `Dockerfile.dev:25` `EXPOSE 3000` · `docker-compose.yml:70` `3000:3000` ·
`README.md.jinja:43` `3000` · `.github/README.md:159` `3000` · `local-environment.md:48` `3222`.

**Manifest reality.** `apps/api/package.json` scripts: `build, build:emit, dev, start, start:prod,
db:generate, db:migrate, db:push, db:studio, db:seed, db:migrate:run, db:check:journal,
outbox:replay, contract, lint, lint:fix, format, typecheck`. Root scripts include `format`,
`format:check`, `check`, `contract`, `test*`, `skills:sync`, `template:smoke`, `platform`,
`catalog:*`, `test:scripts`.

**`format:check` already exists** — `package.json:10-11` `"format:check": "prettier --check
\"**/*.{ts,tsx,js,jsx,json,md}\""` — and is wired into **no** workflow and **not** into `check`
(`"check": "turbo lint typecheck"`). RUN-04 is therefore *delete the plugin + wire the existing
script*, not *write a formatter gate*.

**`.prettierrc` is not in `copier.yml` `_exclude`** — every generated child inherits the broken
config. Confirmed against the `_exclude` list read directly.

**Consequence for the spec.** RUN-05 loses its fix and keeps only a regression assertion
(the changelog/skill text must continue to state the repair). `apps/web/.env.example` and
`apps/api/.env.example` are plain files, not `.jinja` — a per-product port cannot be templated
there, which is why AC RUN-01 asks for one literal value everywhere rather than a rendered one.

---

## Cluster LOC — "language is configuration"

| Finding | Status | Evidence at HEAD |
| --- | --- | --- |
| F-agnostic-leaks-2 | STILL-LIVE | `docs/code-quality.md:48`; `AGENTS.md.jinja:81`; `docs/agents/issue-tracker.md.jinja:21`; `apps/web/index.html:2` `lang="pt-BR"`; `apps/web/src/app/config/zod-locale.ts:10` `z.locales.pt()`; three kernel fallbacks (below). `copier.yml` questions still end at `app_domain` (line 120) — no locale question. |
| F-docs-consistency-7 | STILL-LIVE | `docs/code-quality.md:12,48`; `docs/agents/communication.md:8`; `docs/adr/README.md:7`; `docs/advisories/README.md:23`; `docs/arch/front.md:86,102,146,190`; `AGENTS.md.jinja:58,81-82`. |
| F-agents-skills-3 | STILL-LIVE | `communication.md:8`; `AGENTS.md.jinja:58,81-82`; `issue-tracker.md.jinja:21`; no copier question. |
| F-web-kernel-5 | STILL-LIVE | `apps/web/index.html:2,6`; `shell.tsx:20` `const APP_NAME = "Platform"`; `routes.ts:9-11` `LOGIN: "/entrar"`, `INICIO: "/inicio"`; `route-pending.tsx:3`, `not-found-page.tsx:10`, `error-page.tsx:24`, `zod-locale.ts:10`. |
| F-catalog-entries-7 | **CHANGED (citation only)** | Substance live: `base-template-sources.ts:6-9` and `notification-catalog.ts:44` both `Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" })`; `layout.hbs:2` `lang="pt-BR"`. The audit cited `route-access.ts` for the pt-BR slugs; that file does not exist — the slugs live at `apps/web/src/shared/config/routes.ts:10-11`. |

### Facts the LOC seams are designed against

**Kernel locale fallbacks — exactly three, all in one directory.**
`shared/kernel/context/request-context.middleware.ts:53` `locale: firstHeader(req.headers["accept-language"]) ?? "pt-BR"` ·
`shared/kernel/context/event-context.ts:35` `locale: "pt-BR"` ·
`shared/kernel/context/job-context.ts:42` `locale: "pt-BR"`.
No `DEFAULT_LOCALE`/`LOCALE` env or constant exists in `apps/api/src` today.

**RFC 7807 titles are three kernel strings plus per-entry `DomainError` subclasses.**
`shared/kernel/errors/problem-details.filter.ts:63` `"Erro de validação"`, `:88` `"Erro interno"`,
`:53` `title: exception.title` (pass-through from `shared/kernel/errors/domain.error.ts:8,16`).
The kernel API has **no** hardcoded pt-BR Zod messages — those live only on the web
(`zod-locale.ts:16-21`). So the API message pack is small; the volume is in the entries.

**Per-entry user-facing string counts (the "one message table per entry" surface).**
identity — ~24 `DomainError` titles (`domain/errors.ts:16..309`), 9 Zod messages
(`api/contracts/identity.contract.ts`, `permission-template.contract.ts:16`), 3 access-profile
labels (`access-profile.types.ts:9,12,18`), ~20 permission labels (`domain/permissions/catalog/admin.catalog.ts:5-148`) ·
notification — 8 subjects (`base-template-sources.ts:19..94`) + 9 `.hbs` templates, all pt-BR body
text, `layout.hbs:2` `lang="pt-BR"` · tag — 3 error titles + 3 Zod messages · attachment — 11 error
titles + 1 Swagger description · audit — 1 error title + `activity-area-resolver.ts:14` `label: "Outros"` ·
schema — none.

**Hardcoded timezone inside `catalog/**` — exactly two sites**, both `America/Sao_Paulo`:
`notification/api/application/templates/base-template-sources.ts:9` and
`notification/api/application/catalog/notification-catalog.ts:44`.

**Web branding surface.** `apps/web/index.html` has a literal `lang="pt-BR"` and `<title>Platform</title>`
with no `%VITE_*%` placeholder; `shell.tsx:20-23` defines `APP_NAME` and `pageTitle()`, called at
`:28` and `:66`; `apps/web/.env.example` has two lines and no locale/app-name var.
**`apps/web/public/` does not exist** and no favicon ships; `apps/web/nginx.conf:53`
`try_files $uri $uri/ /index.html;` makes `/favicon.ico` return `index.html` with 200 (LOC-06).

**Templating reality — which files can carry `{{ product_locale }}`.**
`.jinja` (renderable): `AGENTS.md.jinja`, `docs/agents/issue-tracker.md.jinja`, `README.md.jinja`.
Plain `.md` (copied literally, so the rule must move or be referenced, not templated):
`docs/code-quality.md`, `docs/agents/communication.md`, `docs/test/testing.md:131`,
`docs/arch/back.md:79,142`, `docs/arch/front.md:54,86,102,138,146,190`, `docs/adr/README.md:7`,
`docs/advisories/README.md:23`.
`.github/README.md:201` also asserts pt-BR but is in `_exclude` — it never reaches a child, so it is
a template-repo-only correction, not a child-facing one.

**Consequence for the spec.** LOC-02 ("stated in exactly one place and referenced from the others")
is doing the heavy lifting: eleven plain-`.md` files cannot each be templated, so the single
statement must live in a `.jinja` file and the rest must point at it.

---

## Cluster CAT — "the catalog identifies the affected child population exactly"

This cluster changed the most since the audit: `template-update-contract` already shipped the rule
CAT-02 asks for, but on the release path only.

| Finding | Status | Evidence at HEAD |
| --- | --- | --- |
| F-catalog-entries-1 **C** | **CHANGED** | The historical collision is unrepaired — `catalog/identity/single-tenant/module.json:4` is still `"version": "2.0.0"` at `v2.0.0`, `v2.1.0`, `v2.2.0` and HEAD, while `kernelRange` (`>=1.0.0 <2.0.0` → `>=2.0.0 <3.0.0`), `customMigrations` (`02_audit_attach.sql` → `04_audit_attach_hook.sql`) and env keys changed under it. But the forward gap is closed: `scripts/platform/release-preflight.mjs:43-52` `entryChangedWithoutBump()` diffs each entry against the previous stable tag and fails the release at `:82-90`. The stopgap (`computePending` reading `lock.catalogRef`) was **not** implemented. |
| F-catalog-entries-2 | **CHANGED** | `ADV-20260822-01..05` still declare `affects: ">=1.0.0 <2.0.0"` and `computePending` still does a bare `semver.satisfies(installed.version, advisory.affects)` (`lib/advisories.mjs:79`) with no `catalogRef` awareness. Partially mitigated by a post-audit companion: `docs/advisories/ADV-20260823-01.md` (`module: kernel`, `affects: ">=2.0.0 <2.1.0"`) reaches those children through the *template* version instead (`advisories.mjs:58-66`). |
| F-catalog-entries-4 | STILL-LIVE | `ADV-20260822-02.md:6` `detect: "rg -l 'INLINE_CONTENT_TYPES' catalog/attachment"` and the `parity` fields of -01..-05 still name `catalog/**`, which `copier.yml:30` excludes from every child. No lint rule rejects a `catalog/`-prefixed path. Compounded by `lib/commands/advisory.mjs:22` coalescing every non-1 exit — including `rg`'s exit 2 on a missing path — to `"não afetado"`. |
| F-catalog-entries-5 | STILL-LIVE | `git tag -l 'catalog/*'` is empty; `docs/catalog/catalog.md:29-30` still promises the tags per AD-016. Unchanged. |

### Facts the CAT fixes are designed against

**All five entries sit at `2.0.0`** with `kernelRange >=2.0.0 <3.0.0` and empty `absorbs`:
`attachment` (dependsOn identity + notification), `audit` (identity), `identity/single-tenant`
(notification), `notification` (none), `tag` (identity).

**Tags.** `v0.1.0, v0.2.0, v1.0.0, v1.1.0, v1.1.1, v1.2.0, v2.0.0, v2.1.0, v2.2.0, v2.2.1` —
note **`v2.2.1` exists and is not recorded in `STATE.md`**. `v2.0.0`→`115f7ed`, `v2.1.0`→`2bd4da3`,
`v2.2.0`→`b266210`, `v2.2.1`→`56a9276`. `git diff --name-only v2.0.0 v2.1.0 -- catalog/` = **183
files** — the collision measured. `v2.2.0..v2.2.1` touched 0 catalog files.

**The rule CAT-02 asks for already exists, in the wrong place.** `entryChangedWithoutBump` lives in
`release-preflight.mjs`, which runs only on `workflow_dispatch` via `.github/workflows/release.yml`.
`scripts/platform/lib/lint.mjs` exports `lintReadmeHeadings`, `lintChangelogVersion`,
`lintWebImports`, `lintProductionTestingImports`, `lintManifest`, `lintKernelRange`,
`lintAdvisoryFrontmatter`, `lintAdvisoryModule`, `discoverEntries` — and **no** tree-vs-tag rule.
The spec's AC ("`catalog:lint` **and** CI SHALL fail") is therefore a *relocation/duplication*
decision, not a new algorithm — and it collides with AD-034's standing constraint that the
migration-steps rule stays preflight-only. Design must rule on whether the entry-bump rule follows
the same preflight-only pattern or is genuinely lifted into `runLint`.

**`computePending` signature** (`lib/advisories.mjs:48-86`) takes `(lock, advisories, ledger,
{ templateVersion })`. The `module: kernel` branch keys on `templateVersion`; the entry branch keys
on `installedModules[name].version` + `variant`. `catalogRef` **is** recorded per module
(`lib/commands/add.mjs:156-162` writes `{version, variant, installedAt, catalogRef, files}`,
`lib/apply.mjs:143-151` adds `sha256` per file) but is read nowhere outside tests — CAT-03 is
plumbing an existing field into an existing branch.

**Gate wiring.** `catalog:lint` → `catalog-lint.mjs`; run by `.github/workflows/catalog.yml` job
`gates` on `pull_request` + `push` to `main`/`v*`, and by `release.yml` job `verify`. Locally it is
`lefthook-local.yml` `pre-commit.catalog-lint` over
`{catalog/**,docs/advisories/**,docs/dev/template-changelog.md}` — **template-only**, excluded from
the child. `lefthook.yml` `pre-push` (shipped) is `migrations`, `typecheck`, `test-coverage` only.

---

## Cluster SEAM — "a product extends the platform by adding files"

All six findings are STILL-LIVE; only line numbers drifted.

| Finding | Status | Evidence at HEAD |
| --- | --- | --- |
| F-extensibility-any-product-6 | STILL-LIVE | `apps/api/src/main.ts:34` `NestFactory.create(AppModule, { logger: ["error", "warn"] })` — no `rawBody`. `listen` at `:61`. `apps/api/src/*.ts` holds only `app.module.ts`, `main.ts`, `platform-modules.ts`, `tracing.bootstrap.ts` — no product hook file, and `main.ts` is not in `_skip_if_exists`. |
| F-extensibility-any-product-1 | STILL-LIVE | `request-context.ts:30` `readonly tenantId: string \| null`; `setActor` (`:57-63`) writes only `store.actor` and never copies `actor.tenantId` (which exists at `:14`); middleware seeds `tenantId: null` (`request-context.middleware.ts:49`). |
| F-web-kernel-3 | STILL-LIVE | Comments drifted to `shell.tsx:41-42` and `:52-54`, `main.tsx:16-19`; content identical. |
| F-web-kernel-4 | STILL-LIVE | `routes.ts:6` comment cites `ROUTE_ACCESS` (drifted from `:7`); `PROTECTED_ROUTES` still a non-exported `const` at `:18-21`; `ROUTE_ACCESS` exists nowhere in the kernel. |
| F-api-kernel-6 | STILL-LIVE | `storage.module.ts:10` `useFactory: () => new R2StorageAdapter(loadStorageConfig())`; `r2-storage.adapter.ts:36` `region: "auto"`; `app.module.ts:27` imports `StorageModule` unconditionally. |
| F-web-kernel-2 | STILL-LIVE | `client.ts:65` `document.cookie.match(/(?:^\|;\s*)rit_csrf=([^;]*)/)`; `catalog/identity/single-tenant/api/api/guards/cookie.ts:90-95` `setCsrfCookie` sets no `domain` — host-only on the API host. **New since the audit:** `client.ts:62,70` and `openapi-config.ts:103` now cite "ADR 0015", but `docs/adr/` contains only `README.md` — a dangling reference, not a resolved decision. |

### Facts the SEAM designs are built on

**`main.ts` boot order** (72 lines): `applySecurity` at `:38` (exported, already reused by e2e —
the precedent for a named seam), `requestTimeout` `:49`, `createRequestContextMiddleware` `:52`,
`mountDocs` `:54-56`, `listen` `:61`, guarded by `require.main === module` at `:70`. The
`/docs`-behind-login recipe (`docs/dev/template.md:120-130`, step 2) tells the product to "replace
the current `/docs` mount" — which is `main.ts:54-56`. SEAM-01's `bootstrap.product.ts` must be
called between `:52` and `:61` to cover both the raw-body and the docs-guard cases.

**`tenantId` consumers — 9 sites**, so the missing writer silently poisons all of them:
`outbox.publisher.ts:42,56` (event envelope), `idempotency.interceptor.ts:113` (key scope),
`logger.factory.ts:53` (log field), `event-context.ts:31`, `job-context.ts:11,24,31,39` (build their
own from the envelope/input, independent of the HTTP store), and
`catalog/identity/.../auth.middleware.ts:155,159`, which reads `this.ctx.get().tenantId` into the
auth event and therefore always records `null`. `setActor`'s one-shot throw (`"actor já definido no
escopo"`) is the exact precedent SEAM-02's `setTenant` must mirror.

**Web edit points are three literals, not three files.** `shell.tsx:47-49`
`indexRoute.beforeLoad` (throws `redirect({ to: ROUTES.INICIO })`) and `appLayoutRoute:55-60`
(no `beforeLoad` at all) are exported `const`s with no override seam; `main.tsx:16-22`
`onUnauthorized` is an inline callback the identity entry is documented to amend in place
(`main.tsx:19`). `app-providers.tsx` has no product slot for extra providers.
**`catalog/identity/single-tenant/README.md` never names `shell.tsx`, `main.tsx` or
`app-providers`** — it ships a `requireAccess(queryClient, access, intendedPath)` recipe
(`:313-347`) for an `app/router/guards.ts` that no longer exists. So SEAM-03 must invent the seam
*and* fix the recipe; there is no current instruction to preserve.

**`PROTECTED_ROUTES` has exactly 4 consumers**, all through two exported helpers:
`last-location.ts:10,17,24` and `auth-redirect.ts:10` — via `toSafeProtectedRoute` /
`resolveProtectedRouteTemplate`. A product-owned registry only has to feed that one Set.

**Storage config is already module-private, not kernel env.** `R2_*` is **not** in
`shared/config/env.ts`; it lives in `shared/infra/storage/storage.config.ts:4-9`
(`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`),
documented at `apps/api/.env.example:53-58`. `storage-unavailable.error.ts` **already exists** —
SEAM-05's `NullStorageAdapter` has its error class waiting. Distinct from AD-024's
`PROFILE_IMAGE_STORE` (`shared/kernel/profile-image/profile-image-store.port.ts:25`), which is an
entry-to-entry port and unrelated to `OBJECT_STORAGE`.

**CSRF cross-host validation does not exist.** `identity.config.ts:22`
`COOKIE_SAMESITE: z.enum(["lax","none","strict"]).default("lax")`; the only related refine
(`:98-102`) checks that `CSRF_SECRET` is set when `SAMESITE=none`, never comparing hosts.
`WEB_ORIGIN` is declared **twice** — kernel `env.ts:68` and `identity.config.ts:19` — which is where
SEAM-06's validation has to choose a home.

**Ownership table** is `docs/dev/template.md:8-27` (14 rows) plus the rule at `:29-32`. `main.ts`
is **absent**: it is neither `apps/api/src/shared/**` nor one of the three composition-root files.
The three web files *are* covered (platform-owned, `apps/web/src/app/**` and
`shared/{config,store,lib,test}`) — so SEAM-07 is one new row plus a re-reading of the web rows
against the new seams.

---

## Cluster TOOL — "the platform tooling and the harness tell the truth"

| Finding | Status | Evidence at HEAD |
| --- | --- | --- |
| F-platform-scripts-7 | STILL-LIVE, **worse** | The `import.meta.url === \`file://${process.argv[1]}\`` guard now has **9** sites: `cli.mjs:98`, `catalog-check.mjs:236`, `catalog-lint.mjs:129`, `catalog-stage.mjs:36`, `advisory-required.mjs:90`, `jest-to-vitest.mjs:406`, `scripts/template-smoke.mjs:339`, plus two added since the audit by `template-update-contract` — `template-update-ci.mjs:148`, `release-preflight.mjs:116`. |
| F-platform-scripts-6 | STILL-LIVE | `apply.mjs:143-144` `writeLock` hashes `entry.files`; `add.mjs:160-161` `files: files.map((file) => file.to)` where `to` derives from `plan.mjs:85` `childLayout(targetRoot)` with `targetRoot = cwd` — absolute, never normalised. |
| F-platform-scripts-2 | STILL-LIVE, **one line from fixed** | `add.mjs:36-41` `readTemplateVersion` does `String(answers._commit).replace(/^v/, "")` and hands that to `checkKernelRange` (`plan.mjs:33-36`). `parseInstalledVersion` (`lib/template-version.mjs:32-37`) **already** parses describe refs via `/^v?(\d+)\.(\d+)\.(\d+)(?:-(\d+)-g[0-9a-f]+)?$/` — `readTemplateVersion` simply never calls it. |
| F-platform-scripts-5 | STILL-LIVE | `add.mjs:71-77` swallows a catalog failure to `entries = []`, then `applyRollback` runs unconditionally and `apply.mjs:169-175` `writeRegistry` emits `PLATFORM_MODULES = [] as const`. `runRollback` **always returns `EXIT_CODES.OK`** (`add.mjs:63,81`) — there is no rollback-failure code. |
| F-runtime-probe-3 | **CHANGED** | Root cause (migration corruption) fixed in `90f1d0d`; `TEMPLATE_ONLY_FILES` non-restoration is deliberate and documented (`apply.mjs:13-16`). Structural gap survives: `runRollback` reverts only the named module, never re-runs `pnpm contract`, leaves dep files/env/lock untouched. |
| F-platform-scripts-4 | STILL-LIVE, verbatim | `lib/commands/advisory.mjs` is 25 lines: `const [command, ...args] = advisory.detect.split(" ")` then `spawnSync(command, args)` — no shell, so single quotes are passed literally and `;` chains are unexecutable; ENOENT gives `status: null ?? 0` → "não afetado". `affected = result.status === 1`, which **collides with `EXIT_CODES.ADVISORY_INVALID = 1`**. `docs/advisories/README.md:32-33` documents "exit 1 = child affected" — the inverse of `rg`'s own convention. 12 advisories now; `ADV-20260822-04` still `;`-chains. |
| F-agents-skills-6 | STILL-LIVE | `contract-enum.mjs:104-113` names `shared/lib/select-options.ts` / `enumOptions` and a `contract-enums` spec; `docs/arch/front.md:141,188` claims that spec gates pre-push and CI. None exists. |
| F-agents-skills-5 | STILL-LIVE | `edit-reminders.mjs:12` mandates `@workspace/ui` primitives, design tokens and Lucide, attributed to `docs/arch/front.md` — which mentions none of them. |
| F-hooks-robustness-1 | STILL-LIVE | `pending-advisories.mjs:36-38` prints the adopt line whenever `computePending` returns `noLock`, and `advisories.mjs:50` sets `noLock` for *both* a missing lock and an empty one. `.platform-modules.lock` is under `_skip_if_exists` (`copier.yml:62`), so the template repo and a fresh child hit the same branch. |
| F-docs-consistency-6 | STILL-LIVE | `workflow.md:108` cites `testRegex` (no Jest config exists), `:118-119` claims pre-push is `turbo typecheck` + `turbo test`, `:123` names CI jobs `quality`/`test-unit`/`test-integration`/`test-e2e`; `deploy.md.jinja:111` repeats it. Real `lefthook.yml` pre-push: `migrations` → `typecheck` → `test-coverage`. Real `ci.yml` jobs: `quality`, `test-unit`, `test-coverage` — no integration/e2e jobs. |
| F-probe-windows-client-viability-1 | STILL-LIVE | `local-environment.md:9` "Docker Desktop (with WSL2 enabled on Windows)." is the **only** OS mention repo-wide. |
| F-tests-quality-gates-2 | STILL-LIVE, **and the premise is wrong** | `README.md.jinja:23` (also `docs/arch/back.md:78`, `.github/README.md:38`) promises CI fails on an uncommitted contract. `package.json:12` `contract` is invoked by no workflow and no hook. **`openapi.json` is git-ignored and untracked** — so "diff the committed contract" cannot be the fix as written; the gate must generate and compare, and `apply.mjs:19-20` lists `openapi.json` + its snapshot in `TEMPLATE_ONLY_FILES`, removed on the first `module add` (which is what AC TOOL-11's "survive the first `module add`" clause is about). |
| F-tests-quality-gates-3 | STILL-LIVE (narrowed) | Flake mechanism intact: `application-pool.int-spec.ts:303-312` `connectionTimeoutMillis: 150, max: 1`, assertion at `:318`. The "production 500-not-503" half is **refuted by the code's own comment** — `application-pool.ts:15-19` documents excluding the second pg message deliberately, `:117-118` `translateAcquireError`. Fix is the spec's margin only. |
| F-copier-mechanics-4 | STILL-LIVE | `copier.yml:78,80` gate `pnpm install` and `pnpm skills:sync` on `not _copier_conf.pretend` only, while `git init -q` (`:74`) additionally gates on `_copier_operation == 'copy'` — the idiom already present in the file. No test references `pretend`, `_copier_operation`, `old_copy` or `new_copy`. |

### Facts the TOOL fixes are designed against

**The hook surface is bigger than the two findings.** All 20 `.claude/hooks/*.mjs` ship to the child
— only `.claude/skills` and `.claude/settings.local.json` are excluded (`copier.yml:40,43`).
Beyond `contract-enum` and `edit-reminders`, the shipped set includes `delegate-to-subagent`,
`wave-plan-check`, `specs-in-english`, `subagent-model-required`, `dispatch-log`,
`session-context-checkpoint`, `docs-stay-lean`, `comment-policy`, `branch-only-in-worktree`,
`no-huge-reads`, `reinject-tripwires`, `template-behind`, `pending-advisories`,
`kill-orphan-dev-servers`, `no-servers-left-behind`, `contract-consumers`, plus
`lib/dev-servers.mjs` and `lib/transcript-context.mjs`. TOOL-07's "names a file that ships" sweep
must cover all of them, not the two the audit sampled.

**`skills:sync` is symlink-based** (`scripts/sync-agent-skills.mjs`, 46 lines: it links
`.agents/skills/<name>` → `.claude/skills/<name>` via `join("..","..",".agents","skills",skill)`,
replacing loose copies and pruning orphans). This is the mechanism TOOL-10's Windows statement is
about, and it runs as a copier `_task`, which is why TOOL-13 and TOOL-10 touch the same lines.

**`port-module-update` already assumes the shape the lock does not have.**
`.agents/skills/port-module-update/SKILL.md:18,22,43` documents child-relative paths
(`"apps/api/src/modules/notification/notification.module.ts"`); the lock writes absolute ones.
TOOL-02 fixes the writer, and the only reader to migrate is `apply.mjs:158-159` (`rollback`'s
`existsSync`/`rmSync`).

---

## Cluster IDENT — "the identity entry is domain-free"

**F-catalog-entries-6 — STILL-LIVE** at `474f9f6`. `module.json:13` still lists the five
professional/scheduling `schemaExports`; `user.table.ts:32` `servesClients`; `:48` `birthDate`;
`identity.contract.ts:140-143` `areaIds`/`serviceIds`/`schedulingAreaIds`;
`access-profile.types.ts:17` `key: "professional"`.

### The extraction is materially harder than the spec assumed — read this before designing P3

The spec's P3 reads as "move five tables into a new entry". The tree says otherwise: the slice is
**fused into the core aggregate and its port**, not bolted beside it.

- **`servesClients` and `birthDate` are fields of the `User` aggregate itself** —
  `api/domain/entities/user.entity.ts` touches them at `:13,29,40,77,86,99,110,119,137,145,150,213,220,229-236,325-329`, including `activate()`, `updateOwnProfile()` and `assertValidBirthDate()`.
- **`UserRepository` — the core port — declares the professional writers**:
  `api/domain/ports/user.repository.ts:16-19,103-111,152,159` (`replaceProfessionalAreas`,
  `replaceProfessionalServices`, `replaceSchedulingAreas` plus scope reads).
- **Core use cases call them inline**: `create-user.use-case.ts:23,83,88-90`;
  `update-user.use-case.ts:16,20,86-87,99,105-135`, where a `servesClients` change triggers
  `ProfessionalCommitments.listFuture` before the profile may change — a cross-field business rule
  fused into the generic update-user flow. `application/access-policy.ts` also references the ports.
- **No professional-named `operationId` exists.** The data rides inside `createUser`, `updateUser`
  and `listUsers` DTOs (`identity.contract.ts` `createUserSchema:169-181`, `updateUserSchema:187-198`,
  `userListItemSchema:131-150`, `setPasswordSchema:204-211`, `updateMyProfileSchema:216-221`), so the
  extraction is a **contract break on core operations**, not the removal of a route group.

**The slot mechanism already exists and is the intended seam.** `identity.module.ts:62-63,78-79,89-90,209-236` defines `IdentityProfessionalSlot` and `forRoot({ professional })` binding
`PROFESSIONAL_SCOPE` / `PROFESSIONAL_COMMITMENTS`, with
`infrastructure/professional/null-professional-adapters.ts` as the null object.
`api/api/facades/professional-tables.facade.ts` says in-code that the tables are "ready for a
dedicated repository when the `professional` module (owner of the slice) has its queries defined" —
the extraction is anticipated by the code.

**Two dangling references to a module that does not exist.**
`api/professional-assignment.module.ts` documents itself against a `ServiceModule` / `service`
entry, and the professional tables' `areaId`/`serviceId` are `text` columns with **no FK**, pointing
at `service.areas` / `service.services` — a schema that ships nowhere. `catalog/` holds only
`attachment`, `audit`, `identity`, `notification`, `schema`, `tag`.

**The extraction is not identity-local — `audit` names all seven tables in four files:**
`catalog/audit/api/domain/base-audit-registrations.ts:24,30,36,42,48,54,60`;
`audit-coverage.ts:23-29` (schema-qualified `identity.user_professional_areas`, …);
`api/testing/reattach-identity-tables.ts:28-34`; `api/__e2e__/audit.e2e-spec.ts:178-184`.
So IDENT-03's "a `breaking` advisory per affected entry" is at minimum identity **and** audit.

**`04_audit_attach_hook.sql` must be split.** Identity's `attach_audit()` registers 14 tables —
7 core (redacting `users.password_hash`, `sessions.token_hash`, `devices.cookie_token_hash`,
`verification_tokens.token_hash`) and the 7 professional ones. Under AD-032 the new entry must ship
its own `<schema>.attach_audit()` and `PERFORM` it under the same `pg_proc` guard.

**Kernel is clean, with one exception.** `apps/api/src/**` and `apps/web/src/**` contain zero
references. The only hit is **kernel test infra**: `apps/api/test/setup/test-db.ts:105`
`identity.professional_default_hours` in the truncation list — the same file
F-tests-quality-gates-4 (BRAND-07) targets, so the two requirements collide on one line.

**Web slice is already free.** `catalog/identity/single-tenant/web/` (10 files) has **no**
`areaIds`/`serviceIds`/`schedulingAreaIds`/`servesClients`; the only touches are fixtures
(`session.fixture.ts:15` `birthDate: null`, and `accessProfile: "professional"` used as a generic
non-privileged role in three `.test.ts`). The web side costs almost nothing.

**Test blast radius: 35 spec files** under the entry mention the slice, including the parity guard
(`parity/profiles.parity.spec.ts` + `parity/contract.snapshot.json`), which exists precisely to fail
on contract drift — it will fail by design and must be re-snapshotted as part of the change.
`api/testing/seed-user.ts:14-16,46` derives `servesClients` from `accessProfile === "professional"`
and its comment still cites "migration 0131", a product-specific number that should not be here.

**The access-profile enum is code-derived, not SQL.** `user.table.ts:18`
`accessProfile = identitySchema.enum("access_profile", ACCESS_PROFILES)`, where `ACCESS_PROFILES`
comes from `permission.types.ts:7-19` `defineAccessProfiles([...BASE_ACCESS_PROFILES,
...PRODUCT_ACCESS_PROFILES])` and `BASE_ACCESS_PROFILES` holds `professional` at
`access-profile.types.ts:16-21`. No migration in this repo writes the enum — a child generates it
with drizzle-kit. Dropping the literal is therefore a code edit **plus** an `ALTER TYPE` story for
existing children, which AD-004's recorded caveat (a value added inside a migration transaction
cannot be used by DML in the same batch) already half-documents in reverse.

**Canonical skeleton for the new entry — `catalog/tag/` (43 files)**: `module.json`, `README.md`,
`CHANGELOG.md`, `api/{__e2e__,api/{contracts,controllers,events,facades},application/{use-cases},domain/{entities,ports},infrastructure/{repositories,tables}}`, `api/<name>.module.ts`,
`migrations/custom/01_audit_attach_tags.sql`, `parity/{contract.parity.spec.ts,contract.snapshot.json,facade.parity.spec.ts}`. It ships **no** `web/`, **no** `api/testing/`,
**no** `api/seeds/` — so the new entry needs only what it actually uses. Its `module.json` is the
minimal shape: `name`, `version`, `description`, `kernelRange`, `dependsOn`, `apiModule`,
`schemaExports`, `customMigrations`, `env: []`, `absorbs: []`.

---

## Cluster BRAND / TZ — "nothing in a generated product names the owner"

**All 12 findings STILL-LIVE.** Nothing in this cluster was fixed by `v2.2.0` or
`template-update-contract`. Evidence per finding is in the audit annex and re-verified; below is
only what changes the design.

### The brand sweep is bigger and narrower than the spec assumed

**`Rituaali` as a literal word appears nowhere** outside `.specs/` and `docs/platform_template/`.
The leak is entirely the **`rit` prefix** — so the hygiene gate (BRAND's Independent Test) must key
on `rit_` / `rit-` / `__Host-rit`, not on the company name.

**Production sites — 8.** `openapi-config.ts:26,29,48,51,53,101`; `packages/api-client/src/client.ts:61,65,69` (`rit_csrf` regex); `apps/web/src/app/config/api-client.ts:11`;
`apps/web/src/shared/lib/last-location.ts:5` `"rit-last-location"`;
`apps/web/src/shared/store/auth.store.ts:5` `"rit-auth-logout"`;
`catalog/identity/.../identity.config.ts:20,23` (defaults `__Host-rit_session` / `__Host-rit_device`);
`catalog/identity/.../api/guards/cookie.ts:78` `CSRF_COOKIE_NAME = "rit_csrf"`; and the root
`openapi.json:37,48,49`. **No other catalog entry has a single hit.**

**Test sites — ~50**, concentrated in `catalog/identity/**` (18 files) plus
`apps/api/test/setup/{unit-env,e2e-env}.ts:23-24/25-26`, `openapi-config.spec.ts:148`, and four web
tests. These are mechanical renames but they dominate the diff, so BRAND-01 is a large-but-shallow
task, not a risky one.

**Two of the three cookie names already have a seam; the CSRF one has none.**
`COOKIE_NAME` and `DEVICE_COOKIE_NAME` are env-configurable (`identity.config.ts:20,23`).
`CSRF_COOKIE_NAME` is a bare module constant, and `ConfigureClientOptions`
(`client.ts:109-114`) exposes only `baseURL` and `onUnauthorized`. **BRAND-02 is therefore the only
new mechanism in this cluster** — one config field on each side; everything else is a default change.

### TZ

`bucket-sql.ts` is 26 lines; `CLINIC_TZ = sql.raw("'America/Sao_Paulo'")` at `:11`, used twice at
`:25`. Its own comment (`:8-10`) explains the `sql.raw` + closed-map design — "no text from outside
becomes SQL" — which is exactly the safety property TZ-01's validated `APP_TIMEZONE` must preserve.
Two consumers: `catalog/identity/.../drizzle-usage-stats.reader.ts:35` and
`catalog/audit/.../drizzle-activity-stats.reader.ts:30`. `maintenance-job.decorator.ts:19` /
`maintenance-registry.ts:10` already carry a per-job `timeZone` field — a config-driven precedent,
not a leak. Plus the two `Intl.DateTimeFormat` sites in `notification` already recorded under LOC.

### Domain vocabulary — the gate needs an exclusion list, and one whole sub-feature survives

**False positives dominate a naive grep**: the Portuguese verb `preservar`/`preservad-` and the
generic `reservado` account for ~110 of 241 raw `reserva` hits (idempotency keys, kernel-reserved
IDs), plus `state-preservation` in a vendored skill. The hygiene gate must exclude them by design or
it will be disabled on its first run.

**A real surviving sub-feature**: `catalog/identity/**` carries an "Agendamentos profile" across
`identity.contract.ts:44,142,179,196`, `access-policy.ts:99,134`, `user.repository.ts:18,106,138,142,149,156` (twice "motor de agendamento"), `update-user.use-case.ts:112,117,118`, and more — this is
the **same surface P3/IDENT extracts**, so BRAND-03 and IDENT-01 must be sequenced, not run in
parallel.

**Fixture-only domain words** (rename cheaply, no logic): `advisory-lock.int-spec.ts` lock ids
`guest-a`/`reservation-1`…; `module-boundaries.spec.ts` fake module names `agenda/`, `guest/`;
`error-namespace.spec.ts`; `problem-details.filter.spec.ts:317,346,348`;
`catalog/audit/.../drizzle-activity-stats.reader.int-spec.ts` fixture table `"reservations"` (15×);
"Recepção" as an example permission-template name across 7 identity spec files.

**Harness P0 taxonomy — 8 sites, not 1** (BRAND-05): `.claude/hooks/subagent-model-required.mjs:42`,
`.claude/agents/spec-verifier.md:3`, `.agents/skills/tlc-spec-driven/SKILL.md:80,115`,
`references/validate.md:114`, `references/sub-agents.md:59,73`, `references/cards/orchestrator.md:90`,
`docs/agents/harness.md:129`. Also `.agents/skills/tlc-spec-driven/SKILL.md:80` uses
`guest-agenda-full-load` as its example slug, and `.agents/skills/repo-discovery/SKILL.md:37` still
says "motor de agenda". Note these are **skill files this very workflow reads** — editing them
changes the harness under the feature that edits it.

### Infrastructure

`docs/agents/infra.md.jinja` is **221 lines** and `docs/dev/deploy.md.jinja` **168 lines**, of which
the concrete-infra assertions are `infra.md.jinja:1,27-28,38-40,49-53,58-77,85-88,95-104,111,116-118,120-122,126-163,165-193` and `deploy.md.jinja:3,17-24,73,103-112,139-142,144-168`. That is most
of both files — BRAND-06 is a **rewrite**, not an edit. Routers into them also need fixing:
`AGENTS.md.jinja:23,28`, `docs/agents/README.md:17`, `docs/agents/workflow.md:129`
("push = deploy" via a Dokploy webhook). `.github/README.md:101,184` contradicts itself on this but
is `_exclude`d — template-facing only.

**Legacy MySQL (BRAND-07)** is live in three shipped places: `docs/dev/local-environment.md:59-64`
(citing `pnpm --filter api db:backfill:legacy`, which exists in no manifest),
`apps/api/docker-entrypoint.dev.sh:8-13` (runs it under `RUN_BACKFILL=true`, mentions
`SyncLegacyModule`), and `deploy.md.jinja:18-24,73`.

### RULE C's blind spot, measured

`module-boundaries.spec.ts:539-545` `KERNEL_SURFACE` is exactly five roots: `apps/api/src/shared`,
`app.module.ts`, `db/schema.ts`, `apps/web/src/app`, `apps/web/src/shared`. Confirmed out of scope:
`apps/api/test`, `apps/api/src/openapi`, `apps/api/src/docs`, `apps/web/src/pages` — which is why
`test-db.ts:98-108` (hardcoding `identity.*`, `attachment.*`, `tag.*` truncations, including
`identity.professional_default_hours` at `:105`) and `unit-env.ts` / `e2e-env.ts` brand cookies
were never caught.

### Broken follow-up chain (F-known-debt-1) — confirmed dead

All five `module.json` files carry `"absorbs": []`. `catalog/identity/single-tenant/README.md:409-412` still claims the sweep follow-ups "seguem abertos nos próprios issues", but
`gh api …/issues/2` and `…/issues/5` both return **410 deleted**, and `gh issue list --state all`
shows only #1, #9, #10, #11, #12. Issues #2–#8 no longer exist, and
`.specs/features/done/v0-2-product-slots/coverage-sweep.md:9-10,60-69` still links them.

### `feedback-triage.yml` ships to every child

`.github/workflows/` has five files; `copier.yml` `_exclude` names only `catalog.yml` (`:35`) and
`release.yml` (`:39`). So `feedback-triage.yml`, `ci.yml` and `template-update.yml` all ship.
`feedback-triage.yml:37,64,161` curls `$API_BASE_URL/v1/internal/feedback-triage/…` — no `feedback`
entry exists in `catalog/`; `docs/agents/issue-tracker.md.jinja:52` points at
`../dev/triagem-de-feedback.md`, which does not exist; and
`docs/dev/template-changelog.md:339` already admits the dependency. The other four workflows carry
no dangling reference.

---

## Open conflict — must be settled before TOOL-11 is designed

The two scouts disagree about whether the contract is tracked, and the requirement's shape depends
on the answer:

- **TOOL scout:** "`openapi.json` is git-ignored (`git check-ignore` confirms), not tracked
  (`git ls-files openapi.json` empty)" — while also calling it "the already-committed file" in the
  next sentence, and noting `apply.mjs:19-20` lists it in `TEMPLATE_ONLY_FILES`.
- **BRAND scout:** "`openapi.json:48-49` … (tracked: `git ls-files` → `openapi.json`, 3 hits)".

Both refer to the repo-root `openapi.json`, so one is wrong. Likely cause: a root `openapi.json` is
tracked while a generated copy under `apps/api/src/openapi/` is ignored (or vice versa), and each
scout resolved a different path. **Design must verify this directly** — `git ls-files '*openapi.json'`
plus `git check-ignore -v` on each hit — because it decides whether TOOL-11's gate *diffs a
committed artefact* (spec's wording, and BRAND-01's "committed contract") or *regenerates and
compares against a build output*, and whether the root file is part of the BRAND-01 rename diff.

---

## Design contract (skill reference, for the artifact this research feeds)

`design.md` section order is fixed: **Architecture Overview** (mermaid) → **Code Reuse Analysis**
(Existing Components to Leverage · Integration Points) → **Components** (Purpose / Location /
Interfaces / Dependencies / Reuses each) → **Data Models** → **Error Handling Strategy** → **Risks &
Concerns** (Concern · `file:line` · Impact · **Mitigation** — every concern must carry one) → **Tech
Decisions**. Large/Complex keeps the full template and must present 2–3 approaches with trade-offs
and confirm the chosen one with the user before detailing components. A project-level decision is
appended to `.specs/STATE.md` § Decisions as the next `AD-NNN`; conflicting with an `active` AD
requires an explicit supersede (set the old row to `superseded by AD-NNN`), never silence.

**Confirmed lessons: none** (`python3 .agents/skills/tlc-spec-driven/scripts/lessons.py list
--status confirmed` → `(no confirmed lessons)`). Note the script path — it is under
`.agents/skills/tlc-spec-driven/scripts/`, not `scripts/`.

The nearest precedent for a feature of this size is
`.specs/features/done/security-audit-remediation/design.md` (40.7 kB), which groups Components into
lettered work areas (A…H) and closes with an `## Execute notes (input to Tasks)` section.

---

## Sweep result — all 52 findings re-checked

| Status | Count | Findings |
| --- | --- | --- |
| STILL-LIVE | 46 | everything not listed below |
| CLOSED | 1 | F-runtime-probe-4 (fixture removed in `74022fe`; repair documented) |
| CHANGED | 5 | F-ci-docker-infra-6 (Redis fixed in compose only) · F-catalog-entries-1 (forward rule shipped in `release-preflight.mjs`; history unrepaired) · F-catalog-entries-2 (mitigated by the kernel advisory `ADV-20260823-01`) · F-runtime-probe-3 (root cause fixed in `90f1d0d`; structural gap survives) · F-catalog-entries-7 (substance live, audit cited a file that no longer exists) |

Two findings were narrowed by evidence rather than re-scoped: **F-tests-quality-gates-3**'s
"production returns 500 not 503" half is refuted by `application-pool.ts:15-19`, whose comment
documents the exclusion as deliberate — only the spec's timing margin is a defect; and
**F-platform-scripts-7** grew from 7 sites to **9**, because `template-update-contract` added two
more copies of the broken guard.

### Requirement-level consequences Design must carry

1. **RUN-05 has no fix left** — only a regression assertion that the changelog/skill keep stating
   the repair.
2. **CAT-02's rule already exists** in `release-preflight.mjs:43-52`; the open question is
   relocation into `runLint` versus staying preflight-only, which collides with AD-034's standing
   "REL-05 stays preflight-only" constraint. This is a decision, not an implementation.
3. **TOOL-03 is one line** — `readTemplateVersion` (`add.mjs:36-41`) must call the already-correct
   `parseInstalledVersion` (`lib/template-version.mjs:32-37`).
4. **TOOL-11's premise is contested** — see § *Open conflict*.
5. **BRAND-03 and IDENT-01 touch the same surface** (identity's "Agendamentos" vocabulary) and must
   be sequenced.
6. **BRAND-07 and IDENT-01 collide on one line** — `apps/api/test/setup/test-db.ts:105`.
7. **P3 is not a table move.** `servesClients`/`birthDate` are `User`-aggregate fields, the
   professional writers sit on the core `UserRepository` port, the data rides inside
   `createUser`/`updateUser`/`listUsers`, and `audit` names all seven tables in four files. The
   extraction is a contract break on core operations plus a two-entry advisory.
8. **`v2.2.1` exists** and is absent from `STATE.md` — the release-shape assumption (kernel major)
   should be re-derived from the real tag list, not from the spec's snapshot.
