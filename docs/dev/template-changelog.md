# Template changelog

Version truth = git tag + this entry (AD-006); `package.json` is not bumped on
release. Each version lists the contract-breaking changes and the steps for the child
to apply on `copier update`.

## v2.3.0

The update contract: a tag only ships green, the kernel carries advisories like any
catalog entry, and the product reads them before updating instead of after. A new copier
question also picks the product's headless front shell — additive, with no migration.

### Changes

1. **Release gate** (`release.yml` + `release-preflight.mjs`, template-only): full gate,
   version/tag/ref checks, unbumped-entry check, manual-step check on a non-major
   changelog — then tag + push.
2. **Kernel advisories** (`module: kernel` in `lib/advisories.mjs`): matched to the
   installed template version regardless of the module lock; `ADV-20260823-01`/`-02`
   cover issue #9 and the fixture leak.
3. **Remote feed** (`lib/advisory-feed.mjs`): `status`/hook read `docs/advisories/` from
   the latest tag (24 h cache) merged with local by id.
4. **Cadence** (`docs/dev/template-update.md`): `overdue` marks past each kind's
   recommended days; nothing blocks.
5. **Weekly bot** (`template-update.yml` + `template-update-ci.mjs`): PR on green, issue
   naming the blocker otherwise.
6. **Executable migrations** (`pnpm platform template migrate`): runs every
   `migrations/v<X.Y.Z>.mjs` up to target, idempotent per script.
7. **New copier question `web_stack`** (`vite` | `next`, default `vite`): picks the
   product's headless front — see [`template.md`](template.md#module-catalog). Additive:
   `copier update --defaults` (or `--skip-answered`) writes `web_stack: vite` into the
   answers file of an existing child, preserving its current Vite front with no action
   required. New decision in `.specs/STATE.md`: AD-035.

### Child migration steps

None — copier update is enough.

## v2.2.1

Two `module add` fixes (issues #10, #11). No contract change; migration = re-run
what failed.

### Changes

1. **Second `module add` on the same machine died on the catalog cache** (issue #10,
   `scripts/platform/lib/catalog-source.mjs`): `resolveCatalog` cloned into the cache
   dir without ever reading it — the second call hit `destination path already exists`,
   mislabeled "catálogo inacessível". Now: intact clone of an immutable ref (tag) is
   reused; mutable ref (branch) or corrupted/half clone is discarded and re-cloned.
   A real access failure still reports as unreachable.
2. **Custom migration SQL written outside the journal** (issue #11,
   `scripts/platform/lib/migrations.mjs`): destination names were computed from a
   predicted index, so an entry with no schema diff (no baseline) shifted every custom
   SQL one file above the one drizzle registered — the journaled file kept the empty
   stub (for `identity`, the `auth_events` append-only control). Names are now read
   from the journal after each `generate`; the shipped SQL overwrites the registered
   file and the lock only lists files that exist.

### Child migration steps (`copier update` from v2.2.0)

1. Clean `git status`, then `copier update` (or `--vcs-ref v2.2.1`) — only
   `scripts/platform/**` and this changelog change.
2. If a previous add left stub-in-journal / orphan-outside, `--rollback` (or remove
   the orphans) and re-run the add. No manual cache cleanup is needed anymore.

## v2.2.0

The product gains the routine that brings the template forward, and the answers file it
was born with is repaired. No contract change and no migration; one manual step.

### Changes

1. **`pnpm platform status`** (`scripts/platform/lib/commands/status.mjs`): installed
   template version (`_commit`) vs the latest stable `v*` tag on `_src_path` via
   `git ls-remote` (8s timeout, `--offline`), the entries in the lock, the pending
   advisories; `--json` for agents. Shared lib `scripts/platform/lib/template-version.mjs`.
2. **Harness: `template-behind` hook** (`.claude/hooks/template-behind.mjs`, on
   `SessionStart` and the first `UserPromptSubmit`): same check, one `ls-remote` per 24h
   per machine cached in the OS temp dir, silent offline and silent in the template
   repository. Names the skill when the product is behind.
3. **Skill `template-update`** (`.agents/skills/template-update/`): one tag per cycle in
   a worktree, conflict rules by ownership, the changelog's child migration steps, then
   stale entries (`port-module-update`) and advisories, gates and commits; push stays the
   user's act. `module update` now also points at it.

4. **Fix: the product's `.copier-answers.yml` was a test fixture.** copier writes any
   tracked file named like `_answers_file` to the product root, before `_exclude`:
   `scripts/platform/__tests__/fixtures/child/.copier-answers.yml` overwrote the rendered
   answers with `_commit: v1.0.0` and no answers. Every product born from v1.0.0 to
   v2.1.0 cannot `copier update` ("Question project_name is required") and
   `module add` cloned the catalog at v1.0.0. The fixture is renamed;
   `copier-answers-leak.test.mjs` guards it.
5. **Guard for issue #9 (`kernelRange` not opened on the bump).** `v2.0.0` shipped the
   five entries at `2.0.0` with `kernelRange ">=1.0.0 <2.0.0"`, so no `v2.0.0` child
   could `module add` anything (exit 8); `v2.1.0` already carries `">=2.0.0 <3.0.0"`.
   `pnpm catalog:lint` now fails when an entry's `kernelRange` excludes the latest
   version of this changelog (the version `catalog:check` simulates and the next tag
   carries); the pre-commit glob includes this file. Template-only, nothing for the child.

### Child migration steps

1. **Repair `.copier-answers.yml` by hand, once, before `copier update`**: add the
   answers (`project_name`, `project_slug`, `github_org`, `github_repo`, `root_domain`,
   `app_domain` — from `AGENTS.md`, `package.json`, `README.md`) and set `_commit` to
   the tag the product was really generated from (the top entry of the product's copy
   of this changelog). Commit, then `copier update`.
2. `copier update` brings the command, the hook (in `.claude/settings.json`) and the
   skill; copier's post-task `pnpm skills:sync` links it — nothing else manual.

## v2.1.0

Security audit remediation (2026-08-22 white-box audit, 4 High / 9 Medium). Breaking for
every child despite the minor: several kernel defaults changed from "silently degrade" to
"fail closed at boot" — `v2.0.0` was tagged before this landed, so it ships on its own tag.

### Changes

1. **Fail-closed kernel configuration; hardened identity, attachment, notification, audit, tag.**
   The five catalog entries stay at `2.0.0` (`kernelRange` `">=2.0.0 <3.0.0"` covers this
   tag) and each ships a second advisory (`ADV-20260822-01..05`). An entry's audit trail is
   now attached by a hook the entry declares (`<schema>.attach_audit()`, run by
   `audit.attach_module_hooks()` at the end of audit's install — AD-032).

   | Change                                              | Child action                                                                                                                                                               |
   | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `NODE_ENV` and `DATABASE_SSL` lose their default    | Set both explicitly in every environment — the boot now fails fast instead of guessing                                                                                     |
   | `BREACH_CHECK_ENABLED` (identity) loses its default | Set it explicitly — a missing value no longer silently means "don't check for breached passwords"                                                                          |
   | `TRUST_PROXY_HOPS` default changes to `0`           | Set the real hop count explicitly (e.g. `2` for a Cloudflare → Traefik chain) — `0` alone means "trust nothing in front", every request looks like it comes from the edge  |
   | `redis://` in production                            | Refused unless `REDIS_ALLOW_PLAINTEXT=true` — use `rediss://` or set the flag deliberately                                                                                 |
   | `/docs` in production                               | Off unless `DOCS_ENABLED=true` — was reachable by default before                                                                                                           |
   | `nest-cli.json` swc `ignore`                        | `copier update` brings the new ignore globs for `testing/`, `__e2e__/`, `parity/`, `__parity__/` — no manual action                                                        |
   | Boot seed                                           | The entrypoint now discovers `dist/modules/*/seeds/bootstrap.js` by glob (one per installed module) instead of a single template script — no product action, informational |
   | `@RateLimit` import path                            | Moves to `shared/kernel/rate-limit/rate-limit.decorator` — the codemod/`copier update` updates in-kernel usages; a product importing it directly updates the path by hand  |
   | Redaction list (`sensitive-keys.ts`)                | Widens to include `cookie` and `link` — a product with its own redaction allowlist built on the same fragments picks up the wider default on `copier update`               |
   | `outbox-dead.purge` maintenance job                 | Registers with `lockId` **6** (`maintenance-registry.ts`) — a product with a custom job must not reuse this id                                                             |

   **DX note**: `pnpm contract` (`apps/api` `ts-node src/openapi/export-openapi.ts`, boots the
   Nest app to introspect routes) now needs the kernel's env loaded — `NODE_ENV`/`DATABASE_SSL`
   and the rest of `env.ts` no longer have defaults, so running it with an incomplete `.env`
   fails at boot instead of generating a partial contract.

### Child migration steps

1. `copier update` brings the swc `ignore` globs and the entrypoint's seed glob — no manual action.
2. Set `NODE_ENV`, `DATABASE_SSL`, `TRUST_PROXY_HOPS` and, if the `identity` entry is
   installed, `BREACH_CHECK_ENABLED` explicitly in every environment — the boot now fails
   fast when any of these is absent. Set `REDIS_ALLOW_PLAINTEXT`/`DOCS_ENABLED` if production
   needs `redis://` or `/docs` on.
3. Apply the `ADV-20260822-*` advisories of the entries already installed
   (`pnpm platform module …`, see `docs/catalog/catalog.md`).

## v2.0.0

The Jest → Vitest port (item 1) and the lean-docs harness hook (item 2). Breaking for every
child: the specs change runner and the five catalog entries move to `2.0.0`.

### Changes

1. **Vitest replaces jest as the api runner and runs the whole root.** One runner,
   configs and scripts at the root (`vitest.config.mts`, `vitest.coverage.mts`,
   `vitest.integration.mts`); `test:coverage` becomes the pre-push gate (it needs
   Docker); the lint rules were updated to the new runner. The five catalog entries
   (attachment, audit, identity/single-tenant, notification, tag) move to `2.0.0`, each
   with a `breaking` advisory (`ADV-20260821-01..05`). Two new decisions in
   `.specs/STATE.md`: AD-027 (pre-push gate = `test:coverage`, coverage floors of 90
   on every metric, global and per glob, never lowered to pass) and AD-028 (Vitest `projects` is the
   monorepo's only runner, nothing outside it).
   The floors are a flat **90** on statements, branches, functions and lines — a global
   threshold plus one per glob (`apps/api/src/**`, `apps/web/src/**`). The template's own
   api does not clear it yet (measured 87.70 / 74.21 / 91.30 / 88.44 at the merge), so the
   coverage step is red until that gap is covered; the web clears it (94.78 / 94.51 /
   95.56 / 96.58). A floor is never lowered to make a push pass.
2. **Harness: `docs-stay-lean` hook** (`.claude/hooks/docs-stay-lean.mjs`, wired in
   `.claude/settings.json` on `Edit|Write|MultiEdit` and `Bash`). A handbook edit that
   grows the file by more than 30 lines, a new handbook over 80 / ADR over 60, rationale
   prose outside `docs/adr` or a shell write into `docs/` is refused;
   `PLATFORM_DOCS_LEAN_OFF=1` disables it. Rule in `docs/code-quality.md § Documentation`,
   tripwire in `AGENTS.md`. `docs/agents/workflow.md` now states that push, release,
   `v*` tag and deploy-branch moves are the user's acts. Not breaking.

### Child migration steps

1. `copier update` already brings the root runner configs (`vitest*.mts`),
   `lefthook.yml`, `ci.yml`, the eslint configs, the swc `ignore` globs and the entrypoint's
   seed glob — no manual action for any of those.
2. `node scripts/platform/jest-to-vitest.mjs apps/api/src apps/api/test apps/web/src`
   rewrites the product's specs for the new runner.
3. `pnpm lint:fix` settles what the codemod left out of order (import order and such).
4. Remove `jest`, `@swc/jest`, `@types/jest` and `nyc` from `apps/api`; remove
   `@vitest/coverage-v8` from `apps/web` (web coverage moved to the root).
5. `pnpm install`.
6. Apply the `ADV-20260821-*` advisories of the entries already installed
   (`pnpm platform module …`, see `docs/catalog/catalog.md`).
7. Run `pnpm test:coverage` once and read the gap: the coverage floors are 90 on all four
   metrics, and a product whose tree does not clear them will have `pre-push` blocked until
   it does. Cover the gap — do not lower the floor.

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
