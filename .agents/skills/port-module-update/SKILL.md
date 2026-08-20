---
name: port-module-update
description: Port a newer catalog version of an already-installed module into a child repo, file by file, without clobbering local edits. Use when a module installed from the platform catalog has a newer version available, or when `pnpm platform module update <name>` tells you to use this skill instead (it is a deliberate stub — see below).
---

# Port Module Update

## Input

`<module>` — the installed module's catalog name, including variant if it has one (e.g. `identity/single-tenant`).

## Why this is a skill, not a CLI command

`pnpm platform module update <name>` is a deliberate stub (`scripts/platform/cli.mjs`, `updateCommand`): it prints a pointer to this skill and exits 0. It does no diffing. Porting a version bump requires judgment a script can't safely automate — whether a locally-edited file can be overwritten, which migrations must run, whether parity still holds — so it is agent/human work by design.

## Steps

1. **Read the child's lock.** `.platform-modules.lock` at the child repo's root, key `modules.<module>`. Pull `version`, `catalogRef`, `files: [{ path, sha256 }]`, `migrations: []`. (This is the shape `scripts/platform/lib/apply.mjs`'s `writeLock` actually produces — per-module `catalogRef`, no repo-wide `catalog.source/ref` block exists in the lock today.)
2. **Resolve the catalog ref.** The git tag `catalog/<name>[-<variant>]@<version>` on the catalog source (`gh:EmanuelVogt/platform-template` per AD-016), where `<version>` is the lock's recorded `version`. No such tag → stop, report `no-catalog-tag`.
3. **Diff the entry.** `git diff <resolved-ref>..HEAD -- catalog/<name>/{api,web,migrations/custom,parity}` (restrict to the directories that actually get installed; `module.json`/`README.md` changes alone don't need porting).
4. **Read the CHANGELOG range.** `catalog/<name>/CHANGELOG.md`, every version heading strictly between the lock's `version` and the catalog's current `module.json.version`. A version with committed code but no heading → stop, report `changelog-gap`.
5. **Per changed file, hash-gate it.** Map catalog path to installed path (`api/**` → `apps/api/src/modules/<name>/**`; `web/core|react` → `<webRoot>/core|react`; `parity/*.parity.spec.ts` and `parity/contract.snapshot.json` → `apps/api/src/modules/<name>/__parity__/`). Hash the child's current file and compare to the lock's `files[].sha256` for that path:
   - Unchanged since install → apply the catalog version.
   - Changed → do not overwrite; stop for *that file*, add it to a manual-merge list, and keep going with the rest of the diff.
6. **Migrations.** If any changed/ported file touches a Drizzle table definition, run `drizzle-kit generate` for the child's api app.
7. **Parity.** Run the entry's parity spec (`apps/api/src/modules/<name>/__parity__/*.parity.spec.ts`) so a drift the diff missed still fails loudly.
8. **Bump the lock.** Update `modules.<name>.version`, `.catalogRef`, refresh `files[].sha256` for every applied file, append any new migration filenames to `migrations[]`.
9. **Ledger.** Append every advisory id listed by the CHANGELOG headings in the ported range to the child's `docs/advisories/APPLIED.md`.

## Known gaps (as of 2026-08-20)

- `pnpm platform module update` does none of this — see above.
- No `catalog/<entry>[-<variant>]@x.y.z` git tags exist in this repo yet (`git tag -l 'catalog/notification*'` → empty). AD-016's tagging step hasn't been exercised for any entry, so step 2 has nothing to resolve against today; until a tag is cut, treat the catalog's current `module.json.version` as a stand-in and say so explicitly rather than pretending a tag was resolved.
- No child repo exists inside this template to read a real `.platform-modules.lock` from — the worked example below assumes a plausible post-`module add` lock state.

## Worked example (dry run against `catalog/notification`)

Performed against the real catalog, not the synthetic `scripts/platform/__tests__/fixtures/catalog/` fixture used by `resolveDeps`'s unit tests: that fixture (`alpha/beta/gamma/delta/diamond-*/cycle-*`) has no `CHANGELOG.md`, no version history and no git tags per entry — it exists to test dependency resolution and cycle detection, not version porting, so it cannot exercise steps 2–4 of this procedure. The real catalog is the only thing versioned enough to try, even though only one version has ever shipped.

Assumed child lock (plausible post-`module add notification` state; no real instance to read):
```json
{ "modules": { "notification": { "version": "1.0.0", "catalogRef": "v1.0.0",
  "files": [{ "path": "apps/api/src/modules/notification/notification.module.ts", "sha256": "<hash-at-install>" }],
  "migrations": [] } } }
```

- Step 1: `version` 1.0.0, `catalogRef` v1.0.0.
- Step 2: resolve tag `catalog/notification@1.0.0` → no such tag exists. Fall back to `catalog/notification/module.json`'s current `version` (also `1.0.0`) as a stand-in, per the gap noted above.
- Step 3: diff `catalog/notification/{api,web,migrations/custom,parity}` between that ref and HEAD → empty (there is only one version — `CHANGELOG.md` has a single heading, `## [1.0.0]`, listing AD-007 and AD-008).
- Step 4: CHANGELOG headings strictly between 1.0.0 and 1.0.0 → none. No gap.
- **Outcome: nothing to port.** Correct, if unexciting, for a module that has never been re-versioned since install — steps 5–9 don't run.

Illustrative only (not performed — no second version exists to test against): if a future `1.1.0` changed `catalog/notification/api/notification.module.ts` and the child had never touched its local copy, step 5 would hash the local file, match it against the lock's recorded sha256, and apply the catalog version. If the child *had* edited it, step 5 stops for that one file and lists it for manual merge, while any other file in the same diff that is still hash-clean gets applied normally.
