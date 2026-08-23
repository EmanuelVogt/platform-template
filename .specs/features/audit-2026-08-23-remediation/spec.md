# Audit 2026-08-23 Remediation (critical + high) Specification

## Problem Statement

The 2026-08-23 product-agnosticism and harness-robustness audit confirmed 195 findings; 9 are
critical and 43 are high. Together they say a product generated from the last three released tags
(`v2.0.0`–`v2.2.0`) does not boot its own tooling (`pnpm platform *` dies at import time), fails its
documented first run (wrong port, unauthenticated Redis, commands that do not exist, a crashing
formatter), and ships the owner's company inside itself — brand-prefixed cookies, a São Paulo
timezone constant named after a clinic, a hospitality issue taxonomy, and hard assertions about the
owner's AWS/Dokploy/legacy-MySQL infrastructure presented to the client as their own. The catalog's
version channel is also unsound: entry version `2.0.0` designates two different codebases across
`v2.0.0` and `v2.1.0`, and the five security advisories from 2026-08-22 use a range that excludes
exactly the children that are vulnerable.

Every one of these is charged per client. The template is sold as setup-as-a-service for any domain,
brand and locale, and today the first day of every engagement pays for them.

The finding-level evidence (`file:line`, why, recommendation, adversarial verdict) is the audit
annex: `docs/platform_template/audit-2026-08-23.{json,html}`. It is not restated here; each
requirement below cites the finding IDs it closes.

## Goals

- [ ] A child rendered from the release tag runs `pnpm platform status|add|adopt|list` and completes
      the documented first run with zero manual repair.
- [ ] Zero occurrences of the owner's brand, business domain, infrastructure or personal handle in
      anything a child receives — enforced by a gate, not by review.
- [ ] `module.json.version` + advisory `affects` identify the affected child population exactly:
      no two published tags ship different content under one entry version.
- [ ] Language, brand, timezone and storage provider are product configuration with one swap point
      each, defaulting to today's behaviour so existing children are unaffected.
- [ ] Every extension point a real product needs (raw body, tenant, web guard, providers, protected
      routes) is a product-owned file, so `copier update` never 3-way-merges a platform file.
- [ ] All 52 findings are closed or explicitly reclassified with a recorded rationale; none is
      dropped silently.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| The 77 medium + 66 low findings | This feature is scoped to critical + high. The rest stay in the audit annex as backlog and are re-triaged after the release. |
| Cutting and pushing the release tag | AD-006 / AD-034: a tag is produced only by the `release` workflow the user dispatches. The agent never tags and never pushes. |
| Repairing already-generated child repositories | The child is updated by its owner through `copier update` + advisories. The deliverable ends at the tag, the changelog's child-migration steps and the advisories. |
| Native Windows support (symlink-free skills sync, junction fallback, `path.sep` gates) | HARNESS-05 declares the honest support matrix instead. Making native Windows work is a separate commercial decision. |
| Coverage ratchet, harness layering, RULE D | Owned by `test-suite-refactor` (AD-023). Only BRAND-07 and GATE-03, which are audit findings, are touched here. |
| Shipping a UI kit / Tailwind recipe | The broken Tailwind prettier plugin is removed by the `prettier-format-gate` feature, which owns RUN-04's fix (see § *Assumptions*). A `packages/ui` catalog entry is a separate feature. |
| An `identity/multi-tenant` entry | SEAM-02 adds the missing `setTenant` writer only. The entry that calls it is a separate feature. |
| Re-running the audit | The Verifier checks this feature's ACs, not the audit's 195 findings. The next sweep is a new `audit-<date>` annex. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Feature shape | One spec, one feature folder, waves — not three specs per axis | Keeps 1:1 traceability with the audit annex and closes with a single Verifier pass over the whole remediation | y |
| Identity clinical slice (F-catalog-entries-6) | Extract `professional-area` / `-service` / `-scheduling-area` / `-schedule-config` / `professional-default-hours` into a **separate catalog entry**; `identity/single-tenant` keeps users, sessions, permissions | AD-014 already made entry internals entry-local; a product slot would keep clinic vocabulary in the base contract and the generated client of every client | y |
| Locale (6 findings) | Copier question `product_locale` (default `pt-BR`) threading the `.jinja` language rules, plus one runtime swap point per layer (`VITE_APP_NAME`/`VITE_LOCALE`, `DEFAULT_LOCALE`, per-entry message table) | Docs-only or runtime-only closes half the cluster; changing the default to `en` would break existing pt-BR children at their next `copier update` | y |
| Catalog version collision (F-catalog-entries-1/-2/-5) | Bump every entry touched by `security-audit-remediation`, cut the `catalog/<name>@x.y.z` tags AD-016 promises, fix the advisories' `affects`, and add the CI lint that fails a content change without a bump | Only a bump restores an unambiguous address; teaching `computePending` about `catalogRef` alone leaves the ambiguity permanent | y |
| Canonical API port | `3000` everywhere (env.ts default, both `.env.example`, Dockerfile `EXPOSE`/`HEALTHCHECK`, compose, READMEs, `local-environment.md`) | `3000` is already what the Dockerfile, the READMEs and the web `.env.example` assume; only `env.ts` and `apps/api/.env.example` say `3222` | n |
| Neutral brand prefix | `__Host-app_session`, `app_csrf`, `app-last-location`, `app-auth-logout` | `app_` is domain-free and stays readable in devtools; a `{{ project_slug }}` prefix would make the api-client's literal unrenderable (it is TypeScript, not `.jinja`) | n |
| Timezone seam | `APP_TIMEZONE`, IANA, validated at boot, default `UTC` | `UTC` is the only safe default for an unknown client; validation preserves the `sql.raw` injection safety the constant had | n |
| Storage seam | `R2_*` → `STORAGE_*` with `STORAGE_REGION`; the module becomes optional via a `NullStorageAdapter` that throws `StorageUnavailable` on first use | A kernel-only product must boot without inventing credentials; `region: auto` is R2-specific and breaks genuine S3 | n |
| Supported dev platforms | macOS, Linux, WSL2. Native Windows explicitly unsupported | Under native Windows the skills symlinks vanish on clone and the hook harness no-ops; declaring it is honest and costs one paragraph | n |
| `.prettierrc` | **Delivered by the `prettier-format-gate` feature — this Design specifies no fix for it.** That feature drops the plugin, `tailwindStylesheet`, `tailwindFunctions`, the root devDependency and the `.vscode/settings.json` Tailwind block, reformats the tree, and arms CI in a **template-only** `.github/workflows/format.yml`: **nothing is added to `ci.yml`**, which ships to the child, because a red format job there is a manual migration step and AD-034 forbids one on a non-major | Resolved 2026-08-23. The overlap was real — this row and `prettier-format-gate` both planned the same removal, and they disagreed on the CI seam ("add `format:check` to CI" here vs. template-only there). That feature's four Assumption rows are owner-confirmed and this row was not, so its seam wins and executes first. RUN-04 keeps AC 7 as a regression assertion only. If this release does ship as a kernel major, promoting the check into the child's `ci.yml` becomes available as an explicit migration step — a call for **this** Design, not a `prettier-format-gate` one | y |
| Release shape | A kernel **major**. Cookie names, `R2_*` → `STORAGE_*` and the identity split are breaking; majors ship executable `scripts/platform/migrations/v<X.Y.Z>.mjs` per AD-034 | AD-031/AD-034: turning a default into a requirement or renaming an env is a `breaking` advisory per entry and a kernel major | n |
| Sequencing | Execute starts only after `template-update-contract` closes (wave 3 / T16 + Verifier) | That feature owns `copier.yml` `_exclude`, `release-preflight.mjs` and `catalog:lint`, all of which CAT-02 and COPIER-01 modify | n |
| Existing children's language | `product_locale` defaults to `pt-BR`, so a child taking this update keeps its current strings | An update that silently re-languages a running product is not acceptable | n |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: A generated product boots and its own tooling runs ⭐ MVP

**User Story**: As a client team receiving a freshly generated repository, I want the documented
first run and the `pnpm platform` commands to work, so that day one is setup and not repair.

**Why P1**: `pnpm platform module add` and `pnpm platform status` are the product's advertised value
and the entry point of both the session-start hook and the template-update skill. They are dead on
arrival in every child generated from `v2.0.0`, `v2.1.0` and `v2.2.0`. The first-run failures
(port, Redis, missing scripts, crashing formatter) hit the same client on the same day.

**Acceptance Criteria**:

1. WHEN a child is rendered from the release tag and `pnpm platform status` is run THEN the CLI SHALL
   execute and exit on its own result, never on a module-resolution error.
2. WHEN any file shipped under `scripts/**` imports a path listed in `copier.yml` `_exclude` THEN the
   guard SHALL fail.
3. WHEN `pnpm template:smoke` runs THEN it SHALL execute the platform CLI inside the rendered child.
4. WHEN a child is rendered THEN exactly one API port SHALL appear across `env.ts`, both
   `.env.example` files, the Dockerfile `EXPOSE`/`HEALTHCHECK`, `docker-compose.yml`, both READMEs
   and `local-environment.md`.
5. WHEN the shipped `REDIS_URL` is used against the shipped compose Redis THEN the connection SHALL
   authenticate.
6. WHEN a command is named in `_message_after_copy`, `README.md.jinja`, `.github/README.md` or
   `local-environment.md` THEN that command SHALL exist in the rendered child.
7. WHEN `pnpm format:check` runs in the template or in a rendered child THEN it SHALL complete
   without a plugin-load error.
8. WHEN a child generated between `v1.0.0` and `v2.1.0` carries the fixture `.copier-answers.yml`
   THEN the changelog's child-migration steps and the template-update skill SHALL state the repair
   before `copier update` is attempted.

**Independent Test**: render a child from `HEAD`, run the platform CLI, `pnpm format:check` and the
first-run command list against it — all green without touching a file by hand.

---

### P1: Nothing in a generated product names the owner ⭐ MVP

**User Story**: As the platform owner selling to any domain, I want a generated product to contain no
trace of my company, my pilot product's business or my infrastructure, so that a client never sees
another company's identity in their own repository.

**Why P1**: This is the template's first stated rule (`CLAUDE.md`) and the audit's largest confirmed
class. It reaches the client's browser devtools (`__Host-rit_session`), their business logic
(a São Paulo day boundary in every aggregate), their issue tracker (`Hóspedes`, `Reservas`), and
their operating docs, which assert the owner's AWS regions, VMs, Dokploy panel and legacy MySQL as
facts about the client's own deployment.

**Acceptance Criteria**:

1. WHEN a child is rendered THEN no cookie, storage key, header or committed contract SHALL carry the
   owner's brand prefix; the kernel defaults SHALL be `__Host-app_session`, `app_csrf` and `app-*`.
2. WHEN a product renames its CSRF cookie THEN the api-client SHALL read that name from
   `configureClient` and the double-submit SHALL keep working.
3. WHEN day/week aggregation runs THEN it SHALL use a validated `APP_TIMEZONE` (IANA, default `UTC`);
   WHEN `APP_TIMEZONE` is unknown THEN boot SHALL fail with a validation error.
4. WHEN an agent in a child creates an issue THEN the area-label list SHALL come from a
   product-filled placeholder, with the closed-list rule intact and the worked examples
   domain-neutral.
5. WHEN the harness decides a model tier or a Verifier sensor size THEN the P0 taxonomy SHALL name
   generic categories and point at the product's own domain doc, not booking rules.
6. WHEN a child reads `docs/agents/infra.md` or `docs/dev/deploy.md` THEN it SHALL find only
   platform-level facts (image contract, entrypoint, env matrix) plus a product-owned
   "your provider" section — no account, region, VM, panel, DB role, dated owner decision or
   `~/.local/bin` script.
7. WHEN a child is rendered THEN it SHALL contain no legacy-MySQL backfill in docs, compose,
   `docker-entrypoint.dev.sh` or env tables.
8. WHEN the module-boundary guard runs THEN its scan SHALL cover `apps/api/test`,
   `apps/api/src/openapi`, `apps/api/src/docs` and `apps/web/src/pages`, and the kernel test harness
   SHALL hold kernel vocabulary only.
9. WHEN a child is rendered THEN it SHALL not receive a workflow wired to a module that does not
   exist in the catalog.

**Independent Test**: a committed hygiene spec greps the rendered child for the owner's brand,
pilot-domain vocabulary and infrastructure nouns and fails on any hit; it runs in CI.

---

### P1: The catalog identifies the affected child population exactly ⭐ MVP

**User Story**: As the platform owner shipping a security fix, I want an entry version to address one
immutable codebase, so that an advisory reaches every vulnerable child and no other.

**Why P1**: `security-audit-remediation` shipped inside kernel `v2.1.0` while the entries kept
`2.0.0`, so `identity 2.0.0` means two different codebases depending on the tag. Every child
installed at `v2.0.0` holds the unthrottled login and is told by the session hook that it is clean,
because `ADV-20260822-01..05` declare `affects: >=1.0.0 <2.0.0`. This defeats the security-update
promise the whole offering rests on.

**Acceptance Criteria**:

1. WHEN two published tags ship different content for one entry THEN the release SHALL be refused;
   every entry touched by `security-audit-remediation` SHALL carry a new version.
2. WHEN an entry's tree changed since the last stable tag without a `module.json` bump THEN
   `catalog:lint` and CI SHALL fail.
3. WHEN a child installed at `v2.0.0` runs `pnpm platform status` THEN it SHALL be reported as
   affected by `ADV-20260822-01..05`.
4. WHEN an advisory declares `detect` or `parity` THEN the paths SHALL be child-layout paths, and
   lint SHALL reject a path starting with `catalog/`.
5. WHEN an entry version is published THEN a `catalog/<name>[-<variant>]@x.y.z` tag SHALL exist for
   it, as AD-016 states.

**Independent Test**: install the affected entry version in a scratch child, run `pnpm platform
status`, and see the five advisories listed; then bump nothing and watch `catalog:lint` fail on a
seeded content change.

---

### P2: Language, brand and timezone are product configuration

**User Story**: As a client whose team and users are not Brazilian, I want to set my product's name,
language and timezone in one place per layer, so that I do not fork the kernel to be understood by
my own users.

**Why P2**: It does not break a product on day one — it taxes every non-pt-BR client forever, and it
is the second-largest confirmed class after the brand leaks. It ships after P1 because
`product_locale` threads through files P1 is already rewriting.

**Acceptance Criteria**:

1. WHEN `copier copy` runs THEN it SHALL ask `product_locale` (default `pt-BR`) and thread it through
   the language rules in `AGENTS.md.jinja`, `code-quality.md`, `communication.md` and
   `issue-tracker.md.jinja`.
2. WHEN a reader looks for the language convention THEN it SHALL be stated in exactly one place and
   referenced from the others.
3. WHEN a product sets `VITE_APP_NAME` and `VITE_LOCALE` THEN the browser title, `<html lang>` and
   `pageTitle()` SHALL follow without editing a platform-owned file.
4. WHEN the API renders an RFC 7807 title or a Zod message THEN the string SHALL come from a
   `DEFAULT_LOCALE`-selected pack, with pt-BR shipped as one pack.
5. WHEN a catalog entry renders an email subject, permission label or error title THEN it SHALL read
   one message table per entry, and no entry SHALL hardcode a timezone.
6. WHEN a child requests `/favicon.ico` THEN it SHALL receive an asset from a shipped
   `apps/web/public/`, not the SPA fallback.

**Independent Test**: render a child with `product_locale=en`, boot it, and read an English error
title, an English `<html lang>` and an English harness language rule.

---

### P2: A product extends the platform by adding files

**User Story**: As a product built on the template, I want every extension point to be a file I own,
so that `copier update` never 3-way-merges a platform file I had to edit.

**Why P2**: The conflict-free `copier update` is the core selling point, and today the first module
every real product installs (identity) forces edits to `shell.tsx`, `main.tsx` and
`app-providers.tsx`. Payments, multi-tenancy, non-R2 storage and custom protected routes have no
seam at all. The cost lands on the second update, not the first day.

**Acceptance Criteria**:

1. WHEN a product needs the raw request body or extra bootstrap wiring THEN it SHALL use
   `rawBody: true` plus a product-owned `bootstrap.product.ts` (shipped as a no-op under
   `_skip_if_exists`) called before `listen`.
2. WHEN a tenancy middleware resolves a tenant THEN it SHALL write it through a one-shot
   `setTenant(tenantId)` symmetric to `setActor`; WHEN called twice THEN it SHALL throw.
3. WHEN the identity entry is installed THEN no edit to `shell.tsx`, `main.tsx` or
   `app-providers.tsx` SHALL be required.
4. WHEN a product adds a route THEN it SHALL participate in last-location and post-login redirect
   without editing `shared/config/routes.ts`.
5. WHEN storage is unconfigured THEN boot SHALL succeed and the first storage call SHALL throw
   `StorageUnavailable`; WHEN storage is configured THEN the vars SHALL be provider-neutral
   `STORAGE_*` with an explicit `STORAGE_REGION`.
6. WHEN `COOKIE_SAMESITE=none` is set and the API host differs from `WEB_ORIGIN`'s host THEN the
   configuration SHALL be refused unless the token is delivered through a channel the SPA can read.
7. WHEN a reader consults the ownership table THEN it SHALL list every intended product edit point,
   including `main.ts` as platform.

**Independent Test**: in a scratch child, install identity, add a product route and a product
provider, and run `copier update` — the diff shows no platform file modified.

---

### P2: The platform tooling and the harness tell the truth

**User Story**: As an agent working inside a child repository, I want hooks, gates and handbooks to
describe what actually exists, so that I do not act on instructions pointing at files and gates that
ship nowhere.

**Why P2**: These are silent-wrong-answer failures rather than crashes: a CLI that exits 0 having
done nothing when the path contains a space, a lock full of another developer's absolute paths, a
`--rollback` that empties the registry of unrelated modules, an `advisory detect` that reports the
opposite of reality, and hooks that mandate a design system and a helper the kernel does not ship.

**Acceptance Criteria**:

1. WHEN a `scripts/**` entry point runs from a path containing a space THEN it SHALL execute its main
   body and exit on its own result.
2. WHEN `module add` writes `.platform-modules.lock` THEN every recorded path SHALL be relative to
   the child root.
3. WHEN `_commit` is a describe-style ref (off-tag) THEN `module add` SHALL resolve the base tag and
   the catalog ref instead of failing.
4. WHEN `--rollback` runs with an unreachable catalog THEN the registry of other installed modules
   SHALL be preserved and the command SHALL exit non-zero.
5. WHEN `--rollback` follows a failed `--with-deps` add THEN it SHALL unwind the whole transaction,
   or refuse to start on a dirty tree and print `git` guidance instead.
6. WHEN `advisory detect` cannot run (`rg` absent, exit ≥ 2) THEN it SHALL exit with a distinct
   detect-failed code, never "not affected"; quoting and `;` chains SHALL work and the exit
   convention SHALL be defined in one place.
7. WHEN a hook or handbook names a file, helper or conformance spec THEN that file SHALL ship.
8. WHEN a session starts in the template repo or in a fresh child with nothing to adopt THEN
   `pending-advisories` SHALL be silent.
9. WHEN `workflow.md` or `deploy.md.jinja` describes the pre-push gate or the CI jobs THEN it SHALL
   match the real pipeline and name no Jest construct.
10. WHEN a reader looks for supported dev platforms THEN `README.md.jinja`,
    `docs/dev/local-environment.md`, `TEMPLATE.md` and `_message_after_copy` SHALL state
    macOS / Linux / WSL2 and that native Windows is not supported.
11. WHEN CI runs THEN it SHALL regenerate the contract and fail on a dirty `openapi.json` or
    generated client, and that check SHALL survive the first `module add`.
12. WHEN the application pool cannot acquire a connection THEN the API SHALL answer 503 with
    `Retry-After` for both pg timeout messages, and the integration spec SHALL not depend on host
    latency.
13. WHEN `copier update` runs THEN `pnpm install` and `skills:sync` SHALL run at most once, in the
    real project only.

**Independent Test**: run the platform test suite from a directory whose path contains a space, with
`rg` uninstalled, against a lock written on another machine — every command reports its real result.

---

### P3: The identity entry is domain-free

**User Story**: As a client with no professionals and no scheduling, I want the identity entry to
give me users, sessions and permissions only, so that my users table, HTTP contract and generated
client do not model a health clinic.

**Why P3**: Severity-critical, but it is the one finding whose fix is a catalog-shaped change of its
own — a new entry, its migration story, a contract regeneration and a `breaking` advisory per entry
— and it depends on the version/tag machinery of the third P1 story landing first. Deferring it
leaves no client product broken; it leaves them carrying empty tables.

**Acceptance Criteria**:

1. WHEN `identity/single-tenant` is installed THEN the users schema and the HTTP contract SHALL carry
   no `serves_clients`, `birth_date`, `areaIds`, `serviceIds` or `schedulingAreaIds`, and no
   `professional` profile literal.
2. WHEN the professional/scheduling slice is needed THEN it SHALL install as its own catalog entry
   with `dependsOn` on identity, its own migrations, README and CHANGELOG, and `catalog:check` SHALL
   pass for both entries alone in a kernel-only child.
3. WHEN the extraction ships THEN a new AD SHALL record it and a `breaking` advisory SHALL ship per
   affected entry.

---

## Edge Cases

- WHEN a child's lock reads `identity 2.0.0` but its `catalogRef` ends in `#v2.0.0` THEN
  `computePending` SHALL treat it as affected by the 2026-08-22 advisories.
- WHEN a product already renamed its session cookie through `COOKIE_NAME` THEN the rename to
  `__Host-app_session` SHALL not override it.
- WHEN `APP_TIMEZONE` is absent THEN the kernel SHALL use `UTC` and log the fallback once at boot.
- WHEN `product_locale` is absent from an existing child's `.copier-answers.yml` THEN `copier update`
  SHALL apply the `pt-BR` default and change no shipped string.
- WHEN storage is unconfigured and a product never uploads THEN no boot-time validation SHALL run for
  `STORAGE_*`.
- WHEN a rendered child has zero modules THEN the session-start hook SHALL emit nothing about
  `.platform-modules.lock`.
- WHEN `rg` is absent THEN `advisory detect` SHALL be distinguishable from "advisory not found"
  (today both are exit 1).
- WHEN `catalog:lint` runs on an entry whose only change is its `CHANGELOG.md` THEN it SHALL NOT
  demand a version bump.

---

## Requirement Traceability

Each requirement gets a unique ID for tracking across design, tasks, and validation. The `Findings`
column is the link back to `docs/platform_template/audit-2026-08-23.json` (`confirmed[].id`);
**C** marks a critical.

| Requirement ID | Story | Findings | Proof | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| CLI-01 | P1: Boots and runs | F-copier-mechanics-1 **C** | gate | Design | Pending |
| CLI-02 | P1: Boots and runs | F-copier-mechanics-1 **C** | test | Design | Pending |
| CLI-03 | P1: Boots and runs | F-copier-mechanics-1 **C** | gate | Design | Pending |
| RUN-01 | P1: Boots and runs | F-api-kernel-3, F-agnostic-leaks-7, F-docs-consistency-5, F-ci-docker-infra-6 | test | Design | Pending |
| RUN-02 | P1: Boots and runs | F-agnostic-leaks-6, F-ci-docker-infra-6 | test | Design | Pending |
| RUN-03 | P1: Boots and runs | F-agnostic-leaks-5, F-api-kernel-1 | test | Design | Pending |
| RUN-04 | P1: Boots and runs | F-web-kernel-1 | gate | Verifier | Delivered by `prettier-format-gate` — AC 7 stays as this feature's regression assertion; Design specifies no fix |
| RUN-05 | P1: Boots and runs | F-runtime-probe-4 | test | Design | Pending |
| BRAND-01 | P1: Nothing names the owner | F-agnostic-leaks-3 **C**, F-extensibility-any-product-4 | test | Design | Pending |
| BRAND-02 | P1: Nothing names the owner | F-extensibility-any-product-4 | test | Design | Pending |
| BRAND-03 | P1: Nothing names the owner | F-agents-skills-1 **C**, F-agnostic-leaks-8 **C**, F-docs-consistency-8, F-known-debt-1 | test | Design | Pending |
| BRAND-04 | P1: Nothing names the owner | F-agents-skills-4 | test | Design | Pending |
| BRAND-05 | P1: Nothing names the owner | F-agnostic-leaks-1 **C** | test | Design | Pending |
| BRAND-06 | P1: Nothing names the owner | F-docs-consistency-2 **C** | test | Design | Pending |
| BRAND-07 | P1: Nothing names the owner | F-tests-quality-gates-4 | test | Design | Pending |
| BRAND-08 | P1: Nothing names the owner | F-ci-docker-infra-5 | test | Design | Pending |
| TZ-01 | P1: Nothing names the owner | F-api-kernel-5 **C** | test | Design | Pending |
| CAT-01 | P1: Catalog identifies the population | F-catalog-entries-1 **C** | gate | Design | Pending |
| CAT-02 | P1: Catalog identifies the population | F-catalog-entries-1 **C** | gate | Design | Pending |
| CAT-03 | P1: Catalog identifies the population | F-catalog-entries-2 | test | Design | Pending |
| CAT-04 | P1: Catalog identifies the population | F-catalog-entries-4 | gate | Design | Pending |
| CAT-05 | P1: Catalog identifies the population | F-catalog-entries-5 | probe: `git tag -l 'catalog/*'` | Design | Pending |
| LOC-01 | P2: Language is configuration | F-agnostic-leaks-2, F-docs-consistency-7, F-agents-skills-3 | test | Design | Pending |
| LOC-02 | P2: Language is configuration | F-docs-consistency-7 | test | Design | Pending |
| LOC-03 | P2: Language is configuration | F-web-kernel-5 | test | Design | Pending |
| LOC-04 | P2: Language is configuration | F-agnostic-leaks-2 | test | Design | Pending |
| LOC-05 | P2: Language is configuration | F-catalog-entries-7 | test | Design | Pending |
| LOC-06 | P2: Language is configuration | F-web-kernel-5 | test | Design | Pending |
| SEAM-01 | P2: Extends by adding files | F-extensibility-any-product-6 | test | Design | Pending |
| SEAM-02 | P2: Extends by adding files | F-extensibility-any-product-1 | test | Design | Pending |
| SEAM-03 | P2: Extends by adding files | F-web-kernel-3 | test | Design | Pending |
| SEAM-04 | P2: Extends by adding files | F-web-kernel-4 | test | Design | Pending |
| SEAM-05 | P2: Extends by adding files | F-api-kernel-6 | test | Design | Pending |
| SEAM-06 | P2: Extends by adding files | F-web-kernel-2 | test | Design | Pending |
| SEAM-07 | P2: Extends by adding files | F-web-kernel-3, F-web-kernel-4 | test | Design | Pending |
| TOOL-01 | P2: Tooling tells the truth | F-platform-scripts-7 | test | Design | Pending |
| TOOL-02 | P2: Tooling tells the truth | F-platform-scripts-6 | test | Design | Pending |
| TOOL-03 | P2: Tooling tells the truth | F-platform-scripts-2 | test | Design | Pending |
| TOOL-04 | P2: Tooling tells the truth | F-platform-scripts-5 | test | Design | Pending |
| TOOL-05 | P2: Tooling tells the truth | F-runtime-probe-3 | test | Design | Pending |
| TOOL-06 | P2: Tooling tells the truth | F-platform-scripts-4 | test | Design | Pending |
| TOOL-07 | P2: Tooling tells the truth | F-agents-skills-6, F-agents-skills-5 | test | Design | Pending |
| TOOL-08 | P2: Tooling tells the truth | F-hooks-robustness-1 | test | Design | Pending |
| TOOL-09 | P2: Tooling tells the truth | F-docs-consistency-6 | test | Design | Pending |
| TOOL-10 | P2: Tooling tells the truth | F-probe-windows-client-viability-1 | test | Design | Pending |
| TOOL-11 | P2: Tooling tells the truth | F-tests-quality-gates-2 | gate | Design | Pending |
| TOOL-12 | P2: Tooling tells the truth | F-tests-quality-gates-3 | test | Design | Pending |
| TOOL-13 | P2: Tooling tells the truth | F-copier-mechanics-4 | test | Design | Pending |
| IDENT-01 | P3: Identity is domain-free | F-catalog-entries-6 **C** | test | Design | Pending |
| IDENT-02 | P3: Identity is domain-free | F-catalog-entries-6 **C** | gate | Design | Pending |
| IDENT-03 | P3: Identity is domain-free | F-catalog-entries-6 **C** | test | Design | Pending |

**ID format:** `[CATEGORY]-[NUMBER]` — `CLI`, `RUN`, `BRAND`, `TZ`, `CAT`, `LOC`, `SEAM`, `TOOL`,
`IDENT`.

**Proof (one per AC — how the Verifier will check it):** `test` — an assertion in a spec file
(the default); `gate` — the exit code of a named gate is the evidence; `probe: <command>` — a
one-off command whose output is the evidence. **Probe budget used: 1 of 3** (CAT-05, because
cutting a git tag is the user's act per AD-006/AD-034 and cannot be asserted from inside the run).

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 51 requirements total, 0 mapped to tasks (Tasks phase not run), 0 unmapped.
Findings covered: 52 of 52 (9 critical + 43 high). Every `confirmed[]` entry of the audit annex whose
`final_severity` is `critical` or `high` appears at least once in the Findings column; a finding
whose fix spans two surfaces (for example F-web-kernel-5 across `LOC-03` and `LOC-06`) is cited by
each requirement that closes part of it, and is closed only when all of them are.

---

## Success Criteria

How we know the feature is successful:

- [ ] `pnpm check && pnpm test && pnpm test:scripts && pnpm catalog:lint && pnpm catalog:typecheck &&
      pnpm catalog:check && pnpm template:smoke` all green at the feature's HEAD.
- [ ] A child rendered from that HEAD runs the platform CLI, `pnpm format:check` and every command
      named in its own first-run docs, without a hand edit.
- [ ] The brand/domain hygiene gate fails on a seeded reintroduction of the owner's brand, pilot
      domain or infrastructure, and passes on the tree.
- [ ] A scratch child installed at `identity 2.0.0` / `catalogRef #v2.0.0` is listed as affected by
      `ADV-20260822-01..05`; a child on the new entry version is not.
- [ ] `catalog:lint` fails on a seeded entry content change with no `module.json` bump.
- [ ] Rendering with `product_locale=en` produces an English `<html lang>`, error title and harness
      language rule; rendering with the default changes no shipped string versus today.
- [ ] The changelog section for the release lists the child migration steps, and majors ship the
      executable `scripts/platform/migrations/v<X.Y.Z>.mjs` AD-034 requires.
- [ ] All 52 findings are marked closed in the Verifier's report, or reclassified with a recorded
      rationale — none silently dropped.
