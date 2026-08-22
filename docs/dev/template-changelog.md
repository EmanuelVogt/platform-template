# Template changelog

Version truth = git tag + this entry (AD-006); `package.json` is not bumped on
release. Each version lists the contract-breaking changes and the steps for the child
to apply on `copier update`.

## Unreleased

Vitest replaces jest as the api runner and takes over the whole root. Breaking for
every child: the specs change runner and the five catalog entries move to `2.0.0`.

### Changes

1. **Vitest replaces jest as the api runner and runs the whole root.** One runner,
   configs and scripts at the root (`vitest.config.mts`, `vitest.coverage.mts`,
   `vitest.integration.mts`); `test:coverage` becomes the pre-push gate (it needs
   Docker); the lint rules were updated to the new runner. The five catalog entries
   (attachment, audit, identity/single-tenant, notification, tag) move to `2.0.0`, each
   with a `breaking` advisory (`ADV-20260821-01..05`). Two new decisions in
   `.specs/STATE.md`: AD-027 (pre-push gate = `test:coverage`, coverage floors per glob,
   calibrated once and ratchet-only afterwards) and AD-028 (Vitest `projects` is the
   monorepo's only runner, nothing outside it).
   The api floors were calibrated in T29 from the final migrated tree
   (`pnpm test:coverage`, `apps/api/src/**`): measured statements 87.69% / branches
   74.21% / functions 91.3% / lines 88.43%; floor = measured − 1.5 pt, rounded down to
   one decimal → statements 86.1 / branches 72.7 / functions 89.8 / lines 86.9. The web
   stays at 64/56/61/64.

### Child migration steps

1. `copier update` already brings the root runner configs (`vitest*.mts`),
   `lefthook.yml`, `ci.yml` and the eslint configs — no manual action here.
2. `node scripts/platform/jest-to-vitest.mjs apps/api/src apps/api/test apps/web/src`
   rewrites the product's specs for the new runner.
3. `pnpm lint:fix` settles what the codemod left out of order (import order and such).
4. Remove `jest`, `@swc/jest`, `@types/jest` and `nyc` from `apps/api`; remove
   `@vitest/coverage-v8` from `apps/web` (web coverage moved to the root).
5. `pnpm install`.
6. Apply the advisories of the entries already installed (`pnpm platform module …`, see
   `docs/catalog/catalog.md`).

## v1.2.0

Refactor of the platform tooling: the child layout, the install order and the child
harness each get a single owner, the advisory gate now applies per commit in CI, and
the product stops receiving the tooling that only exists with `catalog/` present. No
contract change and no migration.

### Changes

1. **Child layout in one module (`scripts/platform/lib/child-layout.mjs`).** Where an
   entry lands inside the child (`apps/api/src/modules/<name>`, `__parity__`,
   `<webRoot>/entities/<name>`, `.env`, `platform-modules.ts`, `platform-schema.ts`,
   `drizzle/migrations`) was recomputed in `plan.mjs`, `add.mjs`, `adopt.mjs` and
   `migrations.mjs`. Now they all consult `childLayout(cwd)` / `webRootFor(name)`.
2. **`catalog:typecheck` is no longer a shell one-liner.** Staging became
   `scripts/platform/catalog-stage.mjs`: it discovers the entries via `catalog/`
   (hand-written list eliminated), has teardown, accepts `--keep` and exits 0 in a
   checkout without `catalog/` — before, the child's pre-push broke at that step.
3. **One install-order resolution.** `plan.resolveDeps` delegates to
   `catalog-graph.resolveInstallOrder`. This **fixes** `module add <entry> --with-deps`
   when the dependency lives under a variant (`identity` in `identity/single-tenant/`),
   which failed with ENOENT on `catalog/identity/module.json`.
4. **Child harness (`scripts/platform/lib/child.mjs`, formerly `render-child.mjs`).**
   It absorbs the env defaults, the scratch dir, the teardown with `--keep`, the SIGINT
   handling and the `pnpm check && pnpm test` sequence, which were duplicated between
   `catalog:check` and `template:smoke`. `template:smoke` now cleans the scratch dir on
   SIGINT.
5. **Advisory gate per commit in CI.** `advisory-required.mjs` gains `--range
   <base>..<head>`; `.github/workflows/catalog.yml` calls the module instead of
   reimplementing the rule in shell. The previous `git reset --soft base` judged the
   PR's entire diff against the head's message, so an `Advisory: none` trailer on the
   last commit exempted all the others (`.specs/LESSONS.md` L-009).
6. **The catalog tooling stops leaking into the child.** `catalog/` was already out of
   the copy, but the scripts that only exist because of it were not: `catalog-check.mjs`,
   `catalog-lint.mjs`, `catalog-stage.mjs`, `advisory-required.mjs`, `template-smoke.mjs`,
   `lib/child.mjs`, `lib/lint.mjs`, `scripts/platform/__tests__/**` and
   `docs/catalog/README-contract.md` went into `_exclude`. What **broke**: the product's
   `lefthook.yml` called `catalog:typecheck` on `pre-push`, `catalog:lint` on
   `pre-commit` (with a glob on `docs/advisories/**`, which the child has) and
   `advisory-required` on `commit-msg` — template gates running on every product commit
   and push. These three moved to `lefthook-local.yml` (merged by lefthook, outside the
   copy) and call the module directly instead of the `package.json` script. The child's
   manifest is pruned by a new `_task`, before `pnpm install`: the `catalog:*`,
   `template:smoke` and `test:scripts` scripts go out, and `name` becomes the
   `project_slug` — before, every product was born with `"name": "platform-template"` at
   the root. This cannot be solved with a `package.json.jinja`: copier's `_exclude`
   matches by **destination** path, and both files land in the same `package.json`.
   `child-manifest.test.mjs` blocks any new `catalog/`-dependent script left out of the
   prune list.
7. **`_exclude: catalog/` took `docs/catalog/` along with it.** A gitignore pattern
   without a leading `/` is not anchored: it matched any directory named `catalog` at
   any depth. The child never received `docs/catalog/catalog.md` — which its own
   `AGENTS.md` lists as the "install/update a catalog entry" handbook. It became
   `/catalog`, without a trailing slash: copier tests the destination as a `Path`, which
   never carries the slash, so `/catalog/` let the root directory slip through and be
   born empty in the child. `docs/catalog/README-contract.md` stays out, now via an
   explicit entry.
8. **Public repository, with a public face.** The template becomes public on GitHub —
   `copier copy` and the catalog clone on `module add` were already HTTPS, so the
   product no longer needs an SSH key. In come `.github/README.md` (the repository page,
   since the root only has `README.md.jinja`, which renders the product's README),
   `.github/assets/banner.svg` and `LICENSE` (MIT). All three are in `_exclude`: the
   product writes its own README and decides its own license.
9. **Docs and handbooks in English; architecture handbooks consolidated.** Everything
   under `docs/`, plus `AGENTS.md`, `README.md` and the template-only handbooks, is now
   English. `docs/back/back-arch.md` and `docs/front/front-arch.md` became
   `docs/arch/back.md` and `docs/arch/front.md` — purely conceptual, at most 200 lines
   each, no code samples: mechanics live in the code and in the conformance specs, and
   the inherited ADR numbers are gone from them. The Golden Rules keep their numbering
   (back 1–32, front 1–26), so every citation by number still holds.
   `docs/dev/ambiente-local.md` became `docs/dev/local-environment.md`; the ADR
   file-name template is `NNNN-title.md`. Hooks, agent definitions, skills and code
   comments that cited the old paths were re-pointed; `.rgignore` (two dead
   `docs/superpowers/` entries) is gone. The heading literals in
   `docs/catalog/README-contract.md` stay in Portuguese on purpose — `catalog-lint`
   and the entry READMEs depend on them.

### Child migration steps

1. `copier update` — no manual action. Whoever called `render-child.mjs` directly (there
   is no known caller outside the template) now imports `lib/child.mjs`.
2. `copier update` deletes from the product the files that went into `_exclude`, rewrites
   `lefthook.yml` and prunes `package.json`. If you had edited either of the two by hand,
   copier asks before overwriting. The root package `name` changes from
   `platform-template` to the `project_slug` — the `_task` itself runs `pnpm install`
   after that.
3. `copier update` deletes `docs/back/`, `docs/front/` and `docs/dev/ambiente-local.md`
   and adds `docs/arch/` and `docs/dev/local-environment.md`. If the product edited any
   of the removed handbooks, move those edits into the new files (or into a product ADR)
   before updating — copier flags the conflict. Product ADRs, specs and comments that
   cite the old paths need re-pointing (`git grep -l "back-arch\|front-arch\|ambiente-local"`
   lists them); citations of a Golden Rule by number keep working.

## v1.1.1

Documentation only: the v1.1.0 entry of this changelog cited a product's package scope
as an example of private registry; the example is gone. No contract change,
no migration.

### Child migration steps (`copier update` from v1.1.0)

1. Clean `git status`, then `copier update` (or `copier update --vcs-ref v1.1.1`) —
   only `docs/dev/template-changelog.md` changes.

## v1.1.0

Agent harness ported from the pilot and cleanup of the private-registry leftovers
that remained in the kernel. No contract breaking change: `pnpm contract` is not
needed and there is no new migration.

### Changes

1. **Pilot harness.** New hooks `dispatch-log.mjs` (records every `Agent` call and
   every `SubagentStart`/`SubagentStop` in a `dispatch-log.jsonl` next to the
   transcripts, read by `pnpm dispatch:report`) and `wave-plan-check.mjs` (re-validates
   the wave/cluster rules on every write of `tasks.md`); `delegate-to-subagent.mjs`
   gains a direct-navigation quota per turn. Agents (`spec-worker`, `spec-verifier`,
   `repo-scout`, `shell-runner`) and the `tlc-spec-driven` skill (orchestrator card,
   vertical clusters) updated; delegation baseline documented in
   [`docs/agents/harness.md`](../agents/harness.md).
2. **CI workflows.** `.github/workflows/ci.yml` (lint/typecheck/builds, unit and
   coverage gate with testcontainers) and `feedback-triage.yml` (report triage via
   `repository_dispatch`) now come from the template.
3. **`.npmrc` removed and `Dockerfile.dev` simplified.** Mapping a package scope to a
   private registry was a product leftover; `apps/api/Dockerfile.dev` no longer
   requires a build token and the corresponding sections were removed from
   [`local-environment.md`](local-environment.md) and [`deploy.md`](deploy.md).
4. **`module add` understands copier's shorthand `_src_path`.** Copier writes
   `_src_path: gh:<org>/<repo>` in the product's `.copier-answers.yml` (even when
   generated from a local checkout, it normalizes to the origin remote); the catalog
   resolver now expands `gh:`/`gl:` to the https URL before `git clone`.
   Before, the first `pnpm platform module add` of a product generated from `gh:...`
   failed with "catálogo inacessível".

### Child migration steps (`copier update` from v1.0.0)

1. Clean `git status`, then `copier update` (or `copier update --vcs-ref v1.1.0`).
2. **If the product uses its own private registry**: keep your `.npmrc` in the merge
   (reject the deletion) and restore the secret/build-arg in your `Dockerfile.dev` —
   the template no longer ships them.
3. If the product already has its own `ci.yml`/`feedback-triage.yml` in
   `.github/workflows/`, resolve the merge by keeping your version or adopting the
   template's (`feedback-triage.yml` assumes the feedback module installed and the
   corresponding secrets in the repository).
4. `pnpm install`.

## v1.0.0

The template now distributes only the kernel; the modules that used to come via copier
become versioned catalog entries (`catalog/<entry>[/<variant>]/`, outside the rendered
template), installed with `pnpm platform module add` — see
[`template.md`](template.md#module-catalog).

### Breaking changes

1. **Kernel-only; modules become catalog entries (AD-013).** Slot files
   (access profiles, permission catalogs, upload profiles) were removed —
   AD-001 retired. Extension is now `dependsOn` between entries or a kernel port,
   never again a slot edited by the product.
2. **The kernel access seam changes shape.** `ACCESS_REQUIREMENT` (metadata
   `{ kind: "public" | "authenticated" | "permission", key? }`) is the only source read
   by the kernel access guard; the old access metadata keys go out of circulation.
   `SelfService()`/`OptionalAuth()` now write `ACCESS_REQUIREMENT` directly.
   `IS_MACHINE_TO_MACHINE_KEY` survives — it is a CSRF opt-out, not an access requirement.
   Any product-owned guard or decorator that read the old keys breaks. On the web, the
   `RouteAccess` type (`apps/web/src/shared/config/route-access.types.ts`) changes shape:
   `{ kind: "public" } | { kind: "authenticated" } | { kind: "permission"; key: string }` —
   the `self` variant becomes `authenticated` and `permission` gains `key: string`. A
   product that consumes `RouteAccess` directly needs to update the literals.
3. **The kernel log loses the `sessionId` field.** The session surface left the kernel;
   the logger no longer has a kernel-safe source to rebuild that field. A product that
   relied on a correlated `sessionId` in the structured log needs to rebuild it in its
   own entry.
4. **`/docs` remounted without authentication.** `GET /docs` no longer requires login
   nor depends on a module — it is just the documentation served on top of
   `openapi.json`. A product that needs the login back uses the recipe in
   [`template.md`](template.md#recipe-docs-protected-by-login).
5. **The kernel web loses session/login.** The session entity, the login flow, the
   route guard and the login page leave the template — they become part of the
   corresponding entry, installed via `module add` (the entry's web part + integration
   recipe in its README).
6. **The actor in ALS changes shape.** The old access/session functions of the context
   go out; in come `setActor(actor)`/`getActor()` (once, throws on the second call) and
   `setExtension`/`getExtension` (a generic bag keyed by symbol, owned by the entry that
   writes it). In the job context, the user field becomes `actorId: string | null`.
7. **Kernel migration numbering restarts.** The kernel baseline restarts at
   `0000_kernel_baseline.sql`; entries now generate their own migrations in the product
   (`drizzle-kit generate`, tables as TS + manual SQL only for trigger/function) instead
   of bringing ready-made numbered SQL.

### Child migration steps (`copier update` from v0.2.x)

1. Clean `git status`, then `copier update` (or `copier update --vcs-ref v1.0.0`).
2. For each platform module already present in the product: `pnpm platform module adopt
<entry> --version <current-version>` — records the `.platform-modules.lock` without
   touching any file.
3. Resolve the `_journal.json` merge as usual (see
   [`migration numbering`](template.md#migrations-ad-015)).
4. `pnpm install`.
5. `pnpm contract` (regenerates `openapi.json` + client with the new
   `ACCESS_REQUIREMENT` format and the affected routes).
6. Rewrite any product-owned guard/decorator that read the old access keys to use
   `ACCESS_REQUIREMENT`.
7. If the product correlates logs by `sessionId`, add your own extension in the request
   context and register it explicitly in the log fields — the kernel no longer restores
   that field on its own.
8. If `/docs` must stay behind login, apply the recipe from
   [`template.md`](template.md#recipe-docs-protected-by-login).
9. Run the migrations (`pnpm --filter api db:migrate:run`).

## v0.2.0

The five points that used to require editing a platform file are now
slot/registry/port — see [`template.md`](template.md).

### Breaking changes

1. **`attendsGuests` → `servesClients`** — column `identity.users.attends_guests` becomes
   `serves_clients` (migration `0004_identity_serves_clients.sql`). Step: rename the
   field in every `createUser`/`updateUser`/`listUsers` call in your product.
2. **Upload profile names** — `feedback-attachment` becomes `multi` (migration
   `0005_attachment_generic_upload_profiles.sql`); `credit-receipt`,
   `accommodation-type-image` and `report-artifact` cease to exist. Renamed env vars:
   `ATTACHMENT_FEEDBACK_MAX_FILE_BYTES`/`ATTACHMENT_FEEDBACK_MAX_TOTAL_BYTES` →
   `ATTACHMENT_MULTI_MAX_FILE_BYTES`/`ATTACHMENT_MULTI_MAX_TOTAL_BYTES`;
   `ATTACHMENT_REPORT_MAX_BYTES` was removed. Step: update the `.env` and any upload
   in your product that still uses the old names.
3. **`Mailer` became a transport-only port** — `send({ to, subject, html,
idempotencyKey? })`; rendering left the mailer. Step: if your product has its own
   `Mailer`, implement only `send`; switch test fakes to
   `{ send: jest.fn() }`.
4. **Template source shape changed** — from a loose `{ template, templateDir, subject }`
   to `{ type, catalog, email? }` (`email` carries `template`, `templateDir?`,
   `subject`, `recipient?`, `view?`). Step: rewrite every `register(...)` your
   product makes on `NotificationTemplateSourceRegistry` to the new shape.
5. **`access-catalog` gained `profiles`** — `GET /v1/access-catalog` now also responds
   with `profiles: [{ key, label, assignable }]`. Step: regenerate the client
   (`pnpm contract`) before consuming the route.

### Child migration steps (`copier update` from v0.1.0)

1. Clean `git status`, then `copier update` (or `copier update --vcs-ref v0.2.0`).
2. Resolve the `apps/api/drizzle/migrations/meta/_journal.json` merge: if
   `pnpm --filter api db:check:journal` fails because of the `0004`/`0005` entries
   received from the platform, re-stamp their `when` to a value greater than that of the
   last migration already applied in the child, preserving the order between `0004` and
   `0005` (see [`template.md`](template.md#migrations-ad-015)).
3. `pnpm install`.
4. `pnpm contract` (regenerates `openapi.json` + the Kubb client with the `profiles` field).
5. Update the mailer fakes in the product's tests to `{ send: jest.fn() }` and the
   registered template sources to `{ type, catalog, email? }`.
6. Update the product's upload env vars (`ATTACHMENT_MULTI_MAX_FILE_BYTES`/
   `ATTACHMENT_MULTI_MAX_TOTAL_BYTES`; remove `ATTACHMENT_FEEDBACK_*` and
   `ATTACHMENT_REPORT_MAX_BYTES`).
7. Run the migrations (`pnpm --filter api db:migrate:run`) to apply `0004`/`0005`.
