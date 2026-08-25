# Platform template — origin, boundary and updates

This repository was born from `platform-template` via [copier](https://copier.readthedocs.io).
The `.copier-answers.yml` file at the root stores the answers and the template version
(`_commit`) — it is what allows receiving platform updates without a shared git
history. Never edit that file by hand.

## What is kernel, what is catalog, what is product

| Layer                                                                                                     | Owner                                        | Where                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| API kernel (transaction, outbox, actor ALS, tracing, idempotency, listing, health, storage, access guard) | platform                                     | `apps/api/src/shared/**`                                                                                  |
| API boot entrypoint                                                                                       | platform                                     | `apps/api/src/main.ts`                                                                                    |
| Product boot seam (runs after `mountDocs`, before `listen`)                                                | product (ships as a no-op; `_skip_if_exists`) | `apps/api/src/bootstrap.product.ts`                                                                       |
| Module catalog (versioned entries, outside copier)                                                        | platform                                     | `catalog/<entry>[/<variant>]/`                                                                            |
| Composition root                                                                                          | **product** (receives the installed entries) | `apps/api/src/app.module.ts`, `apps/api/src/platform-modules.ts` (generated), `apps/api/src/db/schema.ts` |
| Installed catalog entry                                                                                   | product (copied; owner from `module add` on) | `apps/api/src/modules/<entry>`                                                                            |
| Business modules                                                                                          | product                                      | `apps/api/src/modules/<your-module>`                                                                      |
| Kernel migrations                                                                                         | platform                                     | `apps/api/drizzle/migrations/0000_*`, `0001_*`                                                            |
| Entry migrations                                                                                          | generated in the product by `module add`     | `apps/api/drizzle/migrations` (generated)                                                                 |
| Business migrations                                                                                       | product                                      | `apps/api/drizzle/migrations` from `1000_` on                                                             |
| HTTP contract and generated client                                                                        | platform (mechanism) / product (routes)      | `openapi.json`, `packages/api-client`                                                                     |
| Headless front end (transport, CSRF, access guard, unstyled layout)                                       | platform                                     | `apps/web/src/app/**`, `shared/{config,store,lib,test}`                                                   |
| Web auth-guard registration seam                                                                          | platform (mechanism) / product (guard, registered without editing the file) | `apps/web/src/app/router/shell.tsx`                                        |
| Web provider seam                                                                                         | platform (mechanism) / product (providers, registered without editing the file) | `apps/web/src/app/providers/app-providers.tsx`                         |
| Web protected-routes registry                                                                             | platform (mechanism) / product (routes, registered without editing the file) | `apps/web/src/shared/config/routes.ts`                                    |
| Web part of an installed entry                                                                            | product (copied)                             | `apps/web/src/entities/<entry>/{core,react}`                                                              |
| Product routes and screens, UI kit                                                                        | product                                      | `apps/web/src/app/router/product-routes.tsx` and everything it imports                                    |
| Headless front end (Next)                                                                                 | platform                                     | `apps/web/app/**`, `src/_app/{config,providers,layout/{root-layout,access-slot}}`, `src/shared/**`        |
| Product layout slot (Next)                                                                                | product                                      | `src/_app/layout/product-shell.tsx`                                                                       |
| Product routes (Next)                                                                                     | product                                      | `app/<route>/page.tsx` + `src/_pages/<route>`                                                             |
| Agent harness (hooks, agents, skills, `AGENTS.md`), handbooks, CI, Docker, deploy                         | platform                                     | `.claude/`, `.agents/`, `docs/`, `.github/`, `apps/*/Dockerfile`                                          |
| ADRs, specs, README                                                                                       | product                                      | `docs/adr/`, `.specs/`, `README.md`                                                                       |

The rule that keeps `copier update` conflict-free: **the product adds files; it does not
edit platform files**. Where the platform needs to be extended, it exposes a catalog entry
(`pnpm platform module add`) or a kernel port (an interface declared next to the concept, in
`shared/kernel/`) — never an edit point. If you catch yourself editing a kernel file, the
change probably belongs in the template (open a PR there) or a port is missing.

## Receiving a platform update

```
uv tool install copier        # or pipx install copier — once per machine
git status                    # a clean working tree is mandatory
copier update                 # applies the diff template@_commit → template@latest with a 3-way merge
```

Conflicts show up as regular `<<<<<<<` markers; resolve them, run `pnpm check` and the
tests, and commit. To jump to a specific version: `copier update --vcs-ref vX.Y.Z`.
To see what would change without touching the disk: `copier update --pretend --diff`.

### The agent routine (`template-update` skill)

`pnpm platform status` prints the installed template version (`_commit`), the latest
stable `v*` tag on the source (`git ls-remote`, 8s timeout, `--offline` to skip), the
installed entries from the lock and the pending advisories — `--json` for an agent. The
`template-behind` session-start hook runs the same check (one `ls-remote` per 24h per
machine, cached in the OS temp dir) and names the skill when the product is behind.

The skill applies **one tag per cycle** in a worktree: `copier update --vcs-ref <tag>`,
the conflict rules of the ownership table above (platform path → template side; generated
files and lockfiles → regenerate, never merge), the `### Child migration steps` of that
version in [`template-changelog.md`](template-changelog.md), `pnpm install`, the gates,
one commit. Then the stale entries (`port-module-update`) and the pending advisories, one
commit each. Push and tag are the agent's to run (AD-034); deploy stays the user's act.

## Module catalog

Platform modules are no longer copied by copier — they live as versioned entries in
`catalog/<entry>[/<variant>]/`, excluded from the rendered template. The structure of an
entry, README, versioning and the raw-web rule are in
[`docs/catalog/catalog.md`](../catalog/catalog.md); here is only what the product uses
day to day.

### Commands (`pnpm platform <cmd>`)

| Command                                                                             | What it does                                                                                                                             |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `module add <entry> [--variant v] [--with-deps] [--dry-run] [--force] [--rollback]` | copies the entry into the product, generates the migrations, runs `pnpm contract` and the entry's tests; writes `.platform-modules.lock` |
| `module adopt <entry> [--variant v] [--version x.y.z]`                              | records in the lock an entry the product already had before the catalog existed (migration from v0.2) — without copying any file         |
| `module list`                                                                       | compares the lock version with the catalog HEAD                                                                                          |
| `module update <entry>`                                                             | copies nothing — prints the instructions of the `port-module-update` skill (porting is an agent's job, not a script's)                   |
| `status [--json] [--offline]`                                                       | template installed vs latest stable tag, entries in the lock, pending advisories — the entry point of the `template-update` skill        |
| `feedback <draft.md> [--json]`                                                      | validates a platform-feedback draft (platform-owned paths only, secret scan, version stamp) and prints the `gh issue create` command + prefilled URL — opening the issue stays a human act (`platform-feedback` skill) |

`module add` also deletes the template-only files (`TEMPLATE_ONLY_FILES` in `apply.mjs`) — guards
that only hold while no entry is installed, such as `template-kernel-only.spec.ts` (KRN-01) and the
OpenAPI contract (`apps/api/test/openapi-contract.e2e-spec.ts` + snapshot).

### `.platform-modules.lock`

Generated by `module add`/`module adopt`, at the product root — never edited by hand:
catalog source (`catalog.source`/`ref`) and, per entry, variant, version, install date,
copied files (with hash) and generated migrations. `apps/api/src/platform-modules.ts` and
`apps/api/src/db/platform-schema.ts` are generated from it — also never edited by hand
(the header of each one says so).

### Advisories

A retroactive fix to an entry is born as `docs/advisories/ADV-YYYYMMDD-NN.md` in the
template repository (frontmatter with id, type, affected entry, version range, severity
and detection command, plus the reference to the entry's `CHANGELOG.md`). The product
receives the file via `copier update`; a session-start hook cross-checks the lock against
the affected version range and warns which advisories have not been applied yet — ledger
in `docs/advisories/APPLIED.md`, also never rewritten by hand. Rule of the template
repository: **a fix in `catalog/**` without a corresponding advisory is not accepted\*\* (the
platform's commit-msg hook).

### Porting an entry update

`module update` always refuses to copy; follow the `port-module-update` skill: it reads the
lock, resolves the entry's diff between the installed version and the catalog HEAD, applies
on its own every file the product has not touched since installation, and stops at the ones
the product has already modified — there the port is manual.

### Gate before cutting an entry tag

`pnpm catalog:check [entry…]`, in the template repository (the product does not receive
the command), renders a kernel-only product in a throwaway directory, installs each entry
in topological order and runs the tests; it is the catalog's pre-tag gate (minutes — it is
not a commit hook). It simulates the kernel at the latest `## vX.Y.Z` of
`docs/dev/template-changelog.md`, so every entry's `kernelRange` must accept that version —
`pnpm catalog:lint` (pre-commit, CI on `main` and on every `v*` tag) checks the same rule in
seconds (AD-033). Run the gate before the tag, not after: `v2.0.0` was cut without it and
shipped entries no 2.x child could install (issue #9).

### Recipe: `/docs` protected by login

The template mounts `GET /docs` without authentication and without depending on any
module. A product that needs the login back:

1. Installs the entry that brings authentication (`pnpm platform module add <entry-with-auth>`).
2. Replaces the current `/docs` mount with a version that applies the entry's
   authentication guard/middleware before serving the documentation — reuse the session
   mechanism that already exists in the entry, do not invent a new one.
3. Covers the behavior with a product-owned e2e test — the template no longer ships an
   authenticated `/docs` test.

## Migrations (AD-015)

- Kernel: `apps/api/drizzle/migrations/0000_kernel_baseline.sql` (+ snapshot) and
  `0001_kernel_outbox_notify.sql`; `NNNN_kernel_<slug>` numbering continues from there.
- Catalog entries never bring numbered table SQL: tables come as TS
  (`infrastructure/tables/**`) and manual steps (trigger, function) in
  `migrations/custom/NN_<slug>.sql`; the product generates the real migration on
  `module add` (`drizzle-kit generate` + `--custom` per manual file) — numbering,
  `when` and the snapshot chain belong to the product.
- The product's business migrations keep the `1000_` prefix.
- Single journal (`apps/api/drizzle/migrations/meta/_journal.json`) — after a
  `copier update` that brings new kernel `0000`/`0001`, if
  `pnpm --filter api db:check:journal` fails because a platform entry "was born in the
  past" of the product's journal, re-stamp the `when` of the received entries to a value
  greater than that of the last migration already applied in the product, preserving the
  order among them.

## Giving an improvement back to the platform

A generic fix (kernel, harness, docs, infra) is born here? Reproduce it in the template
repository as a PR, publish a tag, and bring it back with `copier update`. Do not keep the
fix only locally: on the next update it becomes a conflict.

To *report* a platform defect or improvement upstream instead of fixing it yourself, the
guided flow is the `platform-feedback` skill: draft `.platform-feedback/<slug>.md`
(platform-owned paths only — the product's business code never leaves the repo), then
`pnpm platform feedback <draft>` validates the scope, scans for secrets, stamps the
installed template/module versions and prints the `gh issue create` command plus a
prefilled issue URL. Nothing is sent until a human runs one of them.
