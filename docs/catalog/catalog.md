# Module catalog

The template ships only the kernel; the modules that used to form the base-set (identity,
attachment, audit, notification, tag, …) live as **catalog entries** in `catalog/`, outside the
copier. <!-- audience-contract: catalog/ — named to explain it is not shipped -->
A child app adds an entry with `pnpm platform module add <name>
[--variant]`, which copies the code into the child and records the version in
`.platform-modules.lock`. One entry per module; variants (e.g. `single-tenant`,
`multi-tenant`) are sub-entries; there are no bundles — composition comes from `dependsOn`.

## Model of an entry

```
catalog/
  README.md                       # index: entries, versions, how to add/author
  schema/module.schema.json       # JSON schema of module.json
  identity/single-tenant/
    module.json  README.md  CHANGELOG.md
    api/         # mirrors apps/api/src/modules/identity/** (code + *.spec.ts + *.int-spec.ts + *.e2e-spec.ts)
    web/core/  web/react/
    migrations/custom/NN_<slug>.sql   # only manual SQL steps (triggers, functions); tables come from api/**/tables
    parity/      # *.parity.spec.ts (copied next to the module, run with `pnpm vitest run --project api <path>` in the child) + contract.snapshot.json
```

`module.json` is validated by `catalog/schema/module.schema.json`. <!-- audience-contract: catalog/schema/module.schema.json — the schema lives with the excluded catalog/ tree -->
It follows convention over
configuration: `api/**` maps to `apps/api/src/modules/<name>/**`; `web/core|react` maps
to `<webRoot>/core|react`; `parity/*.parity.spec.ts` maps to
`apps/api/src/modules/<name>/__parity__/`, together with `parity/contract.snapshot.json`. Only
the fields described in the schema are explicit — the rest is path convention.

Each entry is versioned via `module.json.version` and gets a tag `catalog/<name>[-<variant>]@x.y.z`
in the template repository when a version is cut (AD-016). The `CHANGELOG.md` follows
keep-a-changelog; every version title that carries code also lists the ids of the advisories
it carries.

Entry authoring (code layout, the README/CHANGELOG contract, the lint and pre-tag checks) is
documented for the template's own contributors, not for a child app.

## Raw-web rule

To keep entries portable across child apps with different web stacks (Vite, Next…):

- **`web/core/**`**: pure TypeScript only. Allowed imports: `zod`, `@platform/api-client`,
  relative imports. No components, pages or routers.
- **`web/react/**`**: in addition to the `web/core` imports, also `react` and
  `@tanstack/react-query`. Only react-query hooks and options — never components, pages or
  routers.
- **Exception in test files** (`*.test.ts(x)`): `web/core` adds `vitest`; `web/react`
  adds `vitest` + `@testing-library/react` (for `renderHook`) — the rest of the list stays
  forbidden even in tests.
- Any other import (`@tanstack/react-router`, `next/*`, component libraries) fails
  in `catalog-lint`. UI/router integration is the child app's responsibility, documented
  as a recipe in the `## Parte web` section of the entry's README.
- The generated HTTP client is never versioned in the entry; `module add` runs `pnpm contract`
  in the child to generate it.
- `--web-root` defaults to `apps/web/src/entities/<module>/` (so `core/` becomes
  `entities/<module>/core/` and `react/` becomes `entities/<module>/react/`); Next children
  pass their own `src/` root.

## Advisories

Fixes, security flaws and breaking changes in an already-tagged entry are
documented as advisories in `docs/advisories/ADV-YYYYMMDD-NN.md`, with frontmatter
`id, kind (bug|security|breaking), module, affects (semver range on the entry version),
severity, detect, fix, parity`. The body, in pt-BR, describes context, impact and steps. Once
tagged, the file is immutable — the child app never deletes or moves advisories. The child keeps
a ledger in `docs/advisories/APPLIED.md` (`- ADV-… — YYYY-MM-DD — <commit>`), listed in
`_skip_if_exists` in `copier.yml`. The hook `.claude/hooks/pending-advisories.mjs` prints the
difference between advisories and ledger, filtered by the versions pinned in the lockfile.

See the full details of the advisory flow in [`../advisories/`](../advisories/).
