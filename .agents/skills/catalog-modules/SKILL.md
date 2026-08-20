---
name: catalog-modules
description: How to consume the platform's module catalog from a child repo — `pnpm platform module add|adopt|list`, when to reach for the `port-module-update` skill instead, and the advisory ledger. Use when installing a module from the catalog, recognizing an already-vendored module, listing what's installed, or deciding whether to add, adopt, or port.
---

# Catalog Modules

## The catalog

Five entries at `catalog/<name>[/<variant>]/` in this template repo: `identity/single-tenant`, `attachment`, `audit`, `notification`, `tag`. Each has `module.json` (`name`, `version`, `kernelRange`, `dependsOn`, `apiModule`, `env`, `web`, `customMigrations` — schema at `catalog/schema/module.schema.json`, `additionalProperties: false`; there is **no `files` property** — installed files are discovered by directory convention, never listed in `module.json`), `README.md`, `CHANGELOG.md`, `api/`, optionally `web/`, `migrations/custom/`, `parity/`.

Install convention: `api/**` → `apps/api/src/modules/<name>/**`; `web/core|react` → `<webRoot>/core|react`; `parity/*.parity.spec.ts` and `parity/contract.snapshot.json` → `apps/api/src/modules/<name>/__parity__/`.

Dependency graph (after wave 4d, all ranges `>=1.0.0 <2.0.0`): `notification: []`, `identity: [notification]`, `audit/attachment/tag: [identity]` — acyclic, topological install order `notification, identity, audit, attachment, tag`. `resolveDeps` (`scripts/platform/lib/plan.mjs`) computes this order from the child's lock and the target's manifest, and rejects a cycle with exit code 5 (`EXIT_CODES.MISSING_DEPS`, shared with the "missing dependency" case).

## Commands

- `pnpm platform module add <name>` — fresh install: resolves the catalog entry and its deps, copies `api/`/`web/`/`parity/` into the child, writes `.platform-modules.lock` (with per-file sha256), regenerates the module registry, generates migrations, regenerates the contract, and runs the api/web tests. Options: `--variant`, `--catalog-ref`, `--with-deps`, `--no-web-react`, `--web-root`, `--force`, `--dry-run`, `--skip-tests`, `--rollback`.
- `pnpm platform module adopt <name>` — for a module already vendored by hand (files copied outside the CLI): writes the lock entry only (files list + sha256, `migrations: []`) so tooling knows about it. Does **not** copy files, run migrations, regenerate the registry, or run tests.
- `pnpm platform module list` — prints each installed module as `<name>[/<variant>]: lock=<lock version> catalog=<current catalog version>`, so a stale install is visible at a glance.
- `pnpm platform module update <name>` — intentional stub. It prints a message pointing at the `port-module-update` skill and exits 0; it does no diffing itself.
- `pnpm platform advisory detect <id>` — runs the advisory's declared detection command against the child repo and reports affected/not affected.

## When to use which

- Never installed before → `module add`.
- Files already sitting in the tree from a manual copy, just need the lock to catch up → `module adopt`.
- Already installed and the catalog has a newer version → the `port-module-update` skill (`module update` deliberately stops short and points here — see that skill for the full procedure).
- Just checking what's installed and whether it's behind → `module list`.

## Advisories

Downstream (child repo): the ledger is `docs/advisories/APPLIED.md`, one line per applied advisory in the form `- ADV-YYYYMMDD-NN ...` (the format `readLedger` in `scripts/platform/lib/advisories.mjs` parses).

Upstream (authoring a catalog entry in this template repo): the repo's own `commit-msg` hook rejects a commit that stages `catalog/<entry>/(api|web|migrations|parity)/**` without also staging a corresponding advisory — the authoring-side counterpart of the same ledger discipline children keep on the other end.

## Two standing decisions worth knowing before touching an entry

- **AD-025**: port inversion (breaking a real dependency edge by inverting who calls whom) is only justified where an actual cycle exists; every other cross-entry relationship is a plain declared `dependsOn`.
- **AD-026**: a cross-entry end-to-end test lives in the entry that is *downstream* in the dependency graph (the dependent), never in the dependency it reaches into.
