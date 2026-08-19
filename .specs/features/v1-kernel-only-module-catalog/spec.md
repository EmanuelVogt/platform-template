# v1 — Kernel-only template + copyable module catalog — Specification

**Scope:** Complex (new model, new domain of tooling, ambiguity in 7 gray areas → discuss).
**Supersedes:** the v0.2 "base-set + product slots" model (AD-001..AD-011 — each superseded or narrowed by the AD-0xx entries this feature records in `.specs/STATE.md`).
**Sequencing:** planned now; executed after RituaaliOS#92 (Rituaali retrofitted as a child on the v0.2 model) lands its findings — see § Inputs consumed from #92.

## Problem Statement

In v0.2 the template ships a base-set of business-facing modules (identity, audit, attachment, notification, tag) and children receive changes to them through `copier update` 3-way merges. Every base-set change is a merge-conflict risk in every child; the kernel (`shared/kernel/access`, `shared/kernel/upload`, request context, baseline migration) is entangled with identity/attachment vocabulary, so no child can replace identity (multi-tenant, SSO) without forking the template; and the knowledge of "how a module is built here" lives implicitly in shipped code, not in a contract an agent can follow. v1 makes the template kernel-only, turns modules into a shadcn-style catalog that is copied into and owned by the child, and replaces merge-driven module updates with an advisories channel plus an agent skill that ports changes.

## Goals

- [ ] A child generated from the template with no module added boots, passes `pnpm check && pnpm test`, serves `/health`, and contains no identity/audit/attachment/notification/tag code, table, route, or vocabulary.
- [ ] Every former base-set module exists as a catalog entry (runnable code + tests + migrations + README + CHANGELOG + parity suite) and `platform module add <name>` installs it into a child in one command, with the child's `pnpm check && pnpm test` green afterwards.
- [ ] The kernel exposes abstract ports for every concept it needed from identity (access policy, actor in request/job context, route guards on web), and `module-boundaries.spec.ts` proves no module vocabulary remains in `shared/**` or web `app/**`.
- [ ] Advisories (`docs/advisories/ADV-*.md`) reach a child through `copier update`, the pending set (`advisories − ledger`) is injected by a hook at session start, and a catalog module change cannot merge without an advisory.
- [ ] `docs/dev/template-changelog.md` carries the v1.0.0 migration note for children on the v0.2 model.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Multi-tenant identity implementation | future catalog variant `identity/multi-tenant`; this feature only leaves the tenant seam in ALS |
| Any product feature, Rituaali-specific behaviour | the template has no product; Rituaali modules arrive as catalog entries via #92, re-extracted |
| Executing this feature before #92's findings land | #92 is the field research that proves the kernel×module line (§ Sequencing) |
| Follow-ups #2–#8 from the v0.2 sweep | referenced where a catalog entry absorbs one; not fixed here |
| Automatic 3-way merge of module code into children | explicitly abandoned — child owns module code; updates go through advisories + `port-module-update` |
| Rewriting already-applied migrations in existing children | never; baseline policy only affects new children and the catalog entries |
| A package registry / npm distribution of modules | catalog entries are copied source, not dependencies (shadcn model) |
| Web design system / UI kit | headless remains; only the web *structure* of a module entry is specified |

---

## Inputs consumed from RituaaliOS#92 (execution prerequisite)

Design must list these explicitly; Specify names what is expected so the spec can be checked against #92's output when it lands:

| Expected output of #92 | Used by |
| --- | --- |
| The list of kernel files Rituaali had to edit or could not avoid importing (the real kernel×module line) | KRN-* requirements; Design § Kernel ports |
| Rituaali's identity/audit/attachment/notification as they exist in the child after retrofit (code, tests, migrations) | first catalog entries (CAT-*) — re-extracted as copyable modules |
| Every `copier update` conflict on module files during the retrofit | justification + scope of the advisories channel (ADV-*) |
| Migration renumbering pain in the child's journal | `module add` renumbering rules (TLG-*) and baseline policy (MIG-*) |
| Web: which of `entities/session`, `features/login`, `app/router/guards` Rituaali changed | web shipping of a module entry (WEB-*) |

---

## Current coupling inventory (disk is truth, HEAD f5ea832)

Every item below must be resolved by a KRN-* requirement (port/registry in kernel, or moves to a catalog entry). Source: `apps/api/src/modules/module-boundaries.spec.ts`, `apps/api/src/shared/kernel/**`, `apps/web/src/app/router/*`, `apps/web/src/shared/config/route-access.ts`.

### API kernel → module concepts

| Kernel location | Concept | Belongs to | Resolution (to confirm in Design) |
| --- | --- | --- | --- |
| `shared/kernel/access/access-profile.types.ts`, `permission.types.ts`, `define-access-profiles.ts`, `define-permission-catalog.ts` | `AccessProfile`, `PermissionKey`, `ModuleDef` | identity | kernel keeps an abstract `AccessPolicy` port (`can(actor, permissionKey)`) + a `PermissionKeyRegistry` interface; concrete catalog/profiles move to `identity/single-tenant` |
| `shared/kernel/access/product-access-profiles.ts`, `product-permission-catalogs.ts` (AD-001 slot files) | static slot files | identity | deleted — a child edits its own copy of identity; slot mechanism retired |
| `shared/kernel/access/decorators.ts` (`@RequirePermission`) | route metadata read by identity's `PermissionsGuard` | identity | decorator stays in kernel as a generic metadata key (`ACCESS_REQUIREMENT`) consumed by whatever guard the child installs; no identity import |
| `shared/kernel/upload/upload-profile.types.ts`, `product-upload-profiles.ts` | `UploadProfileDef` | attachment | moves to `attachment` entry; kernel keeps storage (`StorageModule`) only |
| `shared/kernel/audit/audit-trail.{repository,module}.ts`, `purge-audit.job.ts` | generic audit-trail table + purge | audit | moves to `audit` entry (kernel ships no audit tables) — unless #92 shows a kernel consumer |
| `shared/kernel/idempotency/*` (`userId` in key) | actor id | identity (actor concept) | field renamed to `actorId: string \| null`; kernel never interprets it |
| `shared/kernel/context/request-context.ts` (`RequestAccess { permissions, isMaster }`, `setAccess`, `setUserSession`), `job-context.ts` (`userId`) | actor + access in ALS | identity | kernel keeps an opaque `actor: { id, kind, tenantId? } \| null` + `setActor`; permission evaluation is the port above; `tenantId` is the multi-tenant seam |
| `apps/api/drizzle/migrations/0000_platform_baseline.sql` | creates schemas `identity`, `attachment`, `notification`, `tag` + their tables alongside `_kernel.*` | all modules | baseline becomes kernel-only (`_kernel.*`); module tables ship inside each entry's migrations (MIG-*) |
| `apps/api/src/app.module.ts` | imports `AttachmentModule`, `IdentityModule.forRoot()`, `NotificationModule`, `TagModule`, `AuditModule`, `AuditTrailModule` | all | template composition root imports kernel modules only; `module add` appends the entry's module |
| `apps/api/src/db/schema.ts` | `export *` of module tables | all | kernel tables only; `module add` appends |
| `module-boundaries.spec.ts` RULE B (`BASE_SET = identity, audit, attachment, tag, notification`) + `SAME_MODULE_ALLOWLIST` entries for attachment/identity | base-set notion | all | RULE B is removed; a new RULE C: `shared/**` and `app/**` contain none of a forbidden vocabulary list (identity, accessProfile, permission catalog names, upload profile, audit trail) |

### Cross-module dependencies that become catalog dependencies

| From | To | Via |
| --- | --- | --- |
| identity (avatar upload, access-link avatar, set-password use-cases) | attachment | `attachment/api/facades/attachment.facade.ts` |
| audit (`list-attachment-access-log`) | attachment | attachment internals (allow-listed today) |
| attachment (`upload-profiles` → `attachment.config`) | — | same-module allow-list |

Entries therefore declare `dependsOn` in their manifest (CAT-03) and `module add` enforces it (TLG-04).

### Web kernel → identity

| Location | Concept | Resolution (to confirm) |
| --- | --- | --- |
| `apps/web/src/shared/config/route-access.ts` (`PermissionKey`, `ROUTE_ACCESS`, kinds `public\|self\|permission`) | route → permission map | kernel keeps the `RouteAccess` kind type; the identity entry's `web/core` ships its fragment as data + `resolveAccess` |
| `apps/web/src/entities/session/**` (`CurrentUser` from `CurrentUserResponseDto`, `can()/useCan()` with `accessProfile === "master"`) | session shape from identity contract | moves to the identity entry's web part |
| `apps/web/src/app/router/guards.ts` (`requireAccess`, `requireAnon`, `resolveRootRedirect`) | guards over session | leaves the template; the identity entry ships `resolveAccess` (pure) + a README recipe for TanStack `beforeLoad` / Next middleware (GA-3 raw web) |
| `apps/web/src/features/login/**` | login form/hook | identity entry: `web/react` hook + README recipe for the form (no component shipped) |
| `apps/web/src/main.tsx` → `@platform/api-client` | generated client | stays; client is generated from the child's own `openapi.json` (CTR-*) |

---

## Assumptions & Open Questions

Gray areas are discussed one at a time (context.md). Rows marked **pending** are open until discussed; the closure gate fails while any remains.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| GA-1 Catalog location | `catalog/` folder in this repo, excluded from copier | one versioning stream, CI runs entries against the kernel they target; trade-off in context.md | y |
| GA-2 Entry granularity | one entry per module; variants are sub-entries (`identity/single-tenant`); bundles are not entries — `dependsOn` composes them | bundles duplicate code; deps give the same one-command install | y |
| GA-3 Web side of an entry | **raw web**: `web/core/` pure TS (types, `can`, `resolveAccess`, `ROUTE_ACCESS` data; deps only `zod` + `@platform/api-client`) + optional `web/react/` (react-query `queryOptions`/hooks only); no components, pages, router code — those are README recipes; generated client not shipped, `module add` runs `pnpm contract` | children run Vite or Next.js; only framework-neutral code can be copied | y |
| GA-4 Contract pipeline for child-owned routes | unchanged mechanism: child's `export-openapi.ts` walks the child's `AppModule`; entry only adds `*.contract.ts`; template ships kernel-only `openapi.json`; entry carries `parity/contract.snapshot.json` compared by operationId | the pipeline already derives from the composition root | y |
| GA-5 `tag` kernel or catalog | catalog entry `tag` | it owns tables, routes, a contract → module-shaped; kernel ships no tables beyond `_kernel.*` | y |
| GA-6 Baseline migration 0000 | new kernel-only `0000_kernel_baseline.sql` (+ `0001_kernel_outbox_notify`); entries ship `0000_<module>_baseline.sql` (squash) renumbered on `add`; existing children never rewritten (`module adopt`); supersedes AD-005 | keeps "applied migrations are immutable" for children, clean start for new ones | y |
| GA-7 Template smoke composition | **one profile, `kernel-only`** (existing script, `fake-product` fixture retired); the `module add` path is proven by catalog CI per entry | keep the smoke simple; CAT-02 already exercises install | y |
| `shared/kernel/audit` audit-trail infra | moves to `audit` entry | no kernel consumer known; re-check against #92 | n |
| Identity decorators (`@RequirePermission`) | stay in kernel as generic access-requirement metadata | a guard-less kernel still needs a place for route metadata the child's guard reads | n |
| Lock file name/shape | `.platform-modules.lock` (JSON): `{ catalogRef, modules: { "<name>": { variant, version, addedAt, files[] } } }` | `components.json` analogue; `files[]` lets `port-module-update` diff the right set | n |
| Advisory id format | `ADV-YYYYMMDD-NN` | sortable, no central counter | n |
| Advisory ledger | `docs/advisories/APPLIED.md` in the child (one id per line + date) | plain file, no tooling needed, survives copier | n |
| Hook mechanism for pending advisories | `.claude/hooks/pending-advisories.mjs` on `SessionStart` + `UserPromptSubmit` (first prompt) | the owner asked for a hook, not prose | n |
| Version of a catalog entry | semver in the entry's `module.json` + CHANGELOG heading; catalog tag `catalog/<name>@x.y.z` when in-repo | `affects` ranges in advisories need a module version, not a template version | n |
| `module add` runs from the child | `pnpm platform module add <name> [--variant v] [--catalog-ref <git ref\|path>]` — a script shipped by the template under `scripts/platform/` | child has pnpm; no global CLI to install | n |

**Open questions:** none — GA-1..GA-7 resolved in context.md (2026-08-19).

---

## User Stories

### P1: Kernel-only child boots green ⭐ MVP

**User Story**: As a platform owner, I want `copier copy` to produce a child with only the kernel, so that a new product starts from an identity-free base and picks modules deliberately.

**Why P1**: it is the new model; every other story builds on an empty kernel.

**Acceptance Criteria**:

1. WHEN the template is rendered with `copier copy --defaults` THEN the child SHALL contain no directory under `apps/api/src/modules/` and no slice under `apps/web/src/{entities,features,pages}` other than the kernel skeleton listed in Design.
2. WHEN the child runs `pnpm install && pnpm check && pnpm test` THEN every gate SHALL pass with zero skipped suites.
3. WHEN the child runs `db:migrate` on an empty database THEN only schema `_kernel` (and `drizzle`) SHALL exist.
4. WHEN the child starts THEN `GET /health` SHALL return 200 and the Swagger/openapi export SHALL contain only kernel routes (health; no `/auth`, `/users`, `/attachments`, `/notifications`, `/tags`).
5. WHEN a grep for the forbidden vocabulary list (`identity`, `accessProfile`, `PermissionsGuard`, `uploadProfile`, `auditTrail`, `notification`, `tag` as module names — exact list in Design) runs over `apps/api/src/shared/**`, `apps/web/src/app/**`, `apps/web/src/shared/**` THEN it SHALL return zero hits (enforced by `module-boundaries.spec.ts` RULE C).

**Independent Test**: `pnpm template:smoke --profile kernel-only`.

---

### P1: Kernel exposes ports instead of identity ⭐ MVP

**User Story**: As a module author, I want the kernel to expose abstract ports (access policy, actor context, route metadata, web guard registry) so that identity is a module like any other.

**Acceptance Criteria**:

1. WHEN a route is decorated with the kernel's access-requirement decorator and no access policy is registered THEN the request SHALL be rejected with RFC 7807 `403` (`type` = `access-policy-missing`) — fail closed.
2. WHEN a module registers an `AccessPolicy` implementation (kernel DI token) THEN the kernel guard SHALL delegate `can(actor, requirement)` to it and return 403 on `false`, 200 path on `true`.
3. WHEN `RequestContext.actor` is read outside a request THEN it SHALL be `null`; WHEN set by a module guard THEN it SHALL expose `{ id, kind, tenantId? }` and the outbox/idempotency/audit hooks SHALL record `actorId` without importing any module.
4. WHEN the identity entry's `web/core` `resolveAccess(user, routeAccess)` is called THEN it SHALL return `"anon"` for a null user on a non-public route, `"forbidden"` for a user lacking the permission, `"allow"` otherwise — pure function, tested in the entry, reproducing v0.2 `requireAccess/requireAnon` decisions; the template web kernel ships no guard.
5. WHEN `module-boundaries.spec.ts` runs THEN RULE A (`shared/**` never imports `modules/**`) SHALL still hold and RULE B (base-set) SHALL be gone.

**Independent Test**: kernel unit tests for the guard with a stub policy + the boundaries spec.

---

### P1: Catalog entries exist and are self-verifying ⭐ MVP

**User Story**: As a child's agent, I want each former base-set module as a catalog entry with code, tests, migrations, README, CHANGELOG and a parity suite, so that I can install, read, and verify it without the template's history.

**Acceptance Criteria**:

1. WHEN the catalog is listed THEN it SHALL contain at least `identity/single-tenant`, `audit`, `attachment`, `notification`, `tag`, each with `module.json` (`name, variant, version, dependsOn[], kernelRange, files, migrations, web?`), `README.md`, `CHANGELOG.md`, `api/**`, `migrations/**`, `parity/**`.
2. WHEN the catalog CI job runs for an entry THEN it SHALL render a kernel-only child, `module add` the entry (and its `dependsOn`), and pass `pnpm check && pnpm test` and the entry's parity suite — one job per entry.
3. WHEN an entry's README is linted THEN it SHALL contain the mandatory sections of the README contract (HBK-01): Contract (routes + events + facades), Kernel ports consumed, Data (schema + tables + migrations), Decisions (ADR list), Parity suite (how to run), Dependencies (other entries), Web part (if any).
4. WHEN the identity entry is installed THEN its behaviour SHALL equal v0.2's identity module for the parity suite (login, sessions, CSRF, permissions guard, profiles master/admin/professional per AD-002 — note: `professional` slice stays inside the entry until #92 says otherwise).

**Independent Test**: catalog CI matrix green for every entry.

---

### P1: `platform module add` installs an entry ⭐ MVP

**User Story**: As a child developer, I want one command to copy an entry into my tree, renumber its migrations, run its tests, and record it in the lock file.

**Acceptance Criteria**:

1. WHEN `pnpm platform module add identity --variant single-tenant` runs in a clean child THEN files SHALL be copied to the paths declared in `module.json`, the entry's migrations SHALL be appended to `apps/api/drizzle/migrations/` with indices continuing from the child's last journal entry and `when` greater than the last applied, `_journal.json` SHALL be updated, `app.module.ts` / `db/schema.ts` / web routes registry SHALL receive the entry's registration lines, and `.platform-modules.lock` SHALL gain `{ name, variant, version, catalogRef, files[] }`.
2. WHEN the entry has `dependsOn` not present in the lock THEN the command SHALL fail with the missing list before touching disk, unless `--with-deps` is passed (then installs in dependency order).
3. WHEN the entry is already in the lock THEN the command SHALL exit non-zero with `already installed <name>@<version>` and change nothing.
4. WHEN the copy succeeds THEN the command SHALL run the entry's unit tests + parity suite scoped to the copied files and report the result; a failing suite SHALL leave files in place and exit non-zero (the child decides; no automatic rollback beyond an explicit `--rollback`).
5. WHEN `kernelRange` in `module.json` does not satisfy the template version in `.copier-answers.yml` THEN the command SHALL refuse with the required range.
6. WHEN `--dry-run` is passed THEN the command SHALL print the file list, migration renumbering, and registrations, and write nothing.

**Independent Test**: script tests with a fixture catalog + the `kernel + identity` smoke child.

---

### P1: Advisories channel ⭐ MVP

**User Story**: As a child's agent, I want to learn at session start which catalog advisories (bug, security, breaking) apply to my installed modules and are not yet applied.

**Acceptance Criteria**:

1. WHEN a file `docs/advisories/ADV-<id>.md` exists THEN it SHALL have frontmatter `id, kind (bug|security|breaking), module, affects (semver range), severity (low|medium|high|critical), detect, fix, parity` — validated by a unit test over the folder (schema-invalid file fails the template's own test suite).
2. WHEN the SessionStart hook runs in a child THEN it SHALL compute `pending = {adv ∈ docs/advisories | adv.module ∈ lock ∧ semver(lock[module].version) ∈ adv.affects} − APPLIED ledger` and emit one line per pending id (`ADV-… <kind> <severity> <module>`), or nothing when empty; the UserPromptSubmit variant fires only on the first prompt of the session.
3. WHEN the child marks an advisory applied THEN the id SHALL be appended to `docs/advisories/APPLIED.md`; advisory files are never deleted/moved by the child (copier would restore them; rule documented in the file header).
4. WHEN a catalog entry's code changes in a commit and no advisory with `module = <entry>` is added in the same change THEN the catalog lint (lefthook pre-commit + CI) SHALL fail, unless the commit only touches `README.md`/`CHANGELOG.md`/tests or carries the trailer `Advisory: none — <reason>`.
5. WHEN `detect` is a command THEN running it in an affected child SHALL exit non-zero (affected) / zero (not affected) — advisory authors ship a detect the parity suite can run.

**Independent Test**: hook unit tests with fixture lock + advisories; lint test with a fixture commit.

---

### P2: `port-module-update` agent skill

**User Story**: As a child's agent, I want a skill that reads the catalog CHANGELOG between my locked version and HEAD, applies the changes to my owned copy, runs the parity suite and bumps the lock.

**Acceptance Criteria**:

1. WHEN the skill runs for `<module>` THEN it SHALL resolve `lock.version → catalog HEAD` from the entry's CHANGELOG, list the entries in between, and refuse if the CHANGELOG lacks a heading for the locked version.
2. WHEN the diff is applied THEN the skill SHALL run the entry's parity suite from the catalog against the child's copy and only then bump `.platform-modules.lock` and append applied advisory ids to the ledger.
3. WHEN a change conflicts with a child edit THEN the skill SHALL stop with the file list and leave the tree unchanged for that file (no partial apply inside a file).

**Independent Test**: skill dry-run on the smoke child after bumping a fixture entry.

---

### P2: Handbooks and migration note

**User Story**: As a platform owner, I want the handbooks to be the knowledge base for building/porting a module and the changelog to tell v0.2 children how to move.

**Acceptance Criteria**:

1. WHEN `docs/back/back-arch.md`, `docs/front/front-arch.md`, `docs/test/testing.md` are read THEN they SHALL describe the kernel ports, the module anatomy (api/domain/infrastructure + web part), the parity-suite convention, and contain no base-set assumption (lint: forbidden vocabulary in handbooks limited to the catalog doc).
2. WHEN `docs/dev/template.md` is read THEN the v0.2 slot table SHALL be replaced by the catalog table (where entries live, `module add`, lock, advisories, `port-module-update`).
3. WHEN `docs/dev/template-changelog.md` is read THEN it SHALL contain a `## v1.0.0` entry with breaking changes and child migration steps from v0.2.0 (keep or re-extract modules; slot files retired; kernel ports).
4. WHEN a README contract doc exists (`docs/catalog/README-contract.md`) THEN the catalog lint SHALL enforce it on every entry.

---

### P2: Template smoke stays kernel-only

**User Story**: As a platform owner, I want `pnpm template:smoke` to stay one simple profile that proves the kernel-only child.

**Acceptance Criteria**:

1. WHEN `template:smoke` runs THEN it SHALL render one `kernel-only` child and pass `pnpm check && pnpm test`, `db:migrate` on an empty database yielding only `_kernel`, `GET /health` 200, and RULE C zero hits; the `fake-product` fixture is removed.
2. WHEN the `module add` install path needs proof THEN it SHALL be the catalog CI matrix (CAT-02), not a second smoke profile.

---

### P3: Tenant seam

**Acceptance Criteria**:

1. WHEN `RequestContext.actor` is set THEN `tenantId` SHALL be an optional string the kernel stores and propagates to job/outbox context unchanged, with no kernel behaviour depending on it.

---

## Edge Cases

- WHEN `module add` is interrupted mid-copy THEN re-running SHALL detect partial files (lock absent, files present) and offer `--force` to overwrite or `--rollback` to remove the listed files.
- WHEN a child renamed an entry's file THEN `port-module-update` SHALL treat it as a conflict (file missing) and stop for that file.
- WHEN two entries ship a migration with the same index THEN renumbering SHALL assign sequential indices in install order and the journal SHALL stay monotonic (`db:check:journal` passes).
- WHEN an advisory `affects` range does not parse THEN the template's advisory test SHALL fail at the template, never at the child.
- WHEN the lock is missing in a child (pre-v1 child) THEN the advisories hook SHALL emit one line `no .platform-modules.lock — run platform module adopt` and nothing else; `adopt` (writes a lock for modules already present, version from the v1.0.0 changelog) is part of TLG.
- WHEN `copier update` brings new advisory files to a child whose ledger already lists them THEN nothing is emitted.

---

## Implicit-requirement dimensions

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | `module add` validates name/variant against the catalog index and `module.json` against a JSON schema; advisory frontmatter validated by test (ADV-01) |
| Failure / partial-failure | `module add` copy is not transactional; partial state is detectable and `--rollback` removes listed files (edge case); `port-module-update` never partially applies inside a file |
| Idempotency / retry | `module add` refuses a second install (TLG-03); advisory hook is pure (same input → same lines); ledger append is idempotent by id |
| Auth boundaries & rate limits | kernel guard fails closed without a policy (KRN-01); rate-limit guard leaves with identity (entry), kernel has no rate-limit — N/A because no kernel route needs it (health is public) |
| Concurrency / ordering | migrations renumbered in install order; `dependsOn` forces order; N/A for runtime concurrency (no new runtime path) |
| Data lifecycle / expiry | advisories immutable; ledger append-only; N/A for runtime data |
| Observability | `module add` prints a plan + result; hook output is the observability of advisories; kernel logger unchanged |
| External-dependency failure | `--catalog-ref` pointing at a git ref that cannot be fetched fails before touching disk |
| State-transition integrity | lock transitions: absent → installed → bumped; `adopt` only when absent; `add` only when absent; `port-module-update` only when installed |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| KRN-01 | P1 kernel-only child boots (AC1–4) | Design | Pending |
| KRN-02 | P1 kernel-only child — forbidden vocabulary RULE C (AC5) | Design | Pending |
| KRN-03 | P1 ports — access policy port + fail-closed guard (AC1–2) | Design | Pending |
| KRN-04 | P1 ports — actor in request/job context, actorId in idempotency/outbox (AC3) | Design | Pending |
| KRN-05 | P1 ports — web RouteAccess registry + guard port (AC4) | Design | Pending |
| KRN-06 | P1 ports — boundaries spec RULE A kept, RULE B removed (AC5) | Design | Pending |
| KRN-07 | P3 tenant seam | Design | Pending |
| CAT-01 | P1 entries — five entries with manifest + mandatory files (AC1) | Design | Pending |
| CAT-02 | P1 entries — catalog CI per entry (AC2) | Design | Pending |
| CAT-03 | P1 entries — `dependsOn` manifest + cross-entry deps from inventory | Design | Pending |
| CAT-04 | P1 entries — identity parity with v0.2 (AC4) | Design | Pending |
| CAT-05 | P1 entries — catalog location / copier exclusion (GA-1) | Design | Pending |
| HBK-01 | P1 entries — README contract doc + lint (AC3, P2 handbooks AC4) | Design | Pending |
| HBK-02 | P2 handbooks — back/front/testing updated (AC1) | Design | Pending |
| HBK-03 | P2 handbooks — `docs/dev/template.md` catalog table (AC2) | Design | Pending |
| HBK-04 | P2 handbooks — changelog v1.0.0 migration note (AC3) | Design | Pending |
| TLG-01 | P1 add — copy + renumber + registrations + lock (AC1) | Design | Pending |
| TLG-02 | P1 add — `dependsOn` enforcement / `--with-deps` (AC2) | Design | Pending |
| TLG-03 | P1 add — refuse reinstall (AC3) | Design | Pending |
| TLG-04 | P1 add — run tests + parity after copy (AC4) | Design | Pending |
| TLG-05 | P1 add — `kernelRange` check (AC5) | Design | Pending |
| TLG-06 | P1 add — `--dry-run`, `--force`, `--rollback`, `adopt` (AC6 + edge cases) | Design | Pending |
| TLG-07 | P2 `port-module-update` skill (AC1–3) | Design | Pending |
| TLG-08 | P1 add — `module.json.env[]` appended to `.env.example`/`.env` without overwriting (context.md § Env) | Design | Pending |
| ADV-01 | P1 advisories — file format + validation test (AC1) | Design | Pending |
| ADV-02 | P1 advisories — pending computation hook (AC2 + edge cases) | Design | Pending |
| ADV-03 | P1 advisories — APPLIED ledger rule (AC3) | Design | Pending |
| ADV-04 | P1 advisories — "no fix without advisory" lint (AC4) | Design | Pending |
| ADV-05 | P1 advisories — executable `detect` (AC5) | Design | Pending |
| MIG-01 | baseline policy: kernel-only 0000, entries ship their own baseline (GA-6) | Design | Pending |
| MIG-02 | renumbering + journal monotonicity (TLG-01 edge case) | Design | Pending |
| WEB-01 | web part of an entry: shipped files + registrations (GA-3) | Design | Pending |
| CTR-01 | contract pipeline with child-owned routes (GA-4) | Design | Pending |
| SMK-01 | P2 smoke — single `kernel-only` profile, fixture retired (AC1–2) | Design | Pending |

**Coverage:** 34 total, 0 mapped to tasks, 34 unmapped ⚠️ (Tasks phase pending).

---

## Success Criteria

- [ ] `pnpm template:smoke` (kernel-only) green on the v1.0.0 tag.
- [ ] Catalog CI matrix green for the five entries.
- [ ] Rituaali (post-#92) can `module adopt` its four modules and the advisories hook reports zero pending on day one.
- [ ] A fresh agent, given only the kernel handbooks + one entry's README/ADRs/code, builds a new catalog-shaped module that passes the README lint and the boundaries spec (manual acceptance, once).
