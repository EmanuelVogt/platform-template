# Module catalog

The template ships only the kernel; the modules that used to form the base-set (identity,
attachment, audit, notification, tag, …) live as **catalog entries** in `catalog/`,
outside the copier. A child app adds an entry with `pnpm platform module add <name>
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

`module.json` is validated by `catalog/schema/module.schema.json` and follows convention over
configuration: `api/**` maps to `apps/api/src/modules/<name>/**`; `web/core|react` maps
to `<webRoot>/core|react`; `parity/*.parity.spec.ts` maps to
`apps/api/src/modules/<name>/__parity__/`, together with `parity/contract.snapshot.json`. Only
the fields described in the schema are explicit — the rest is path convention.

Each entry is versioned via `module.json.version` and gets a tag `catalog/<name>[-<variant>]@x.y.z`
in the template repository when a version is cut (AD-016). The `CHANGELOG.md` follows
keep-a-changelog; every version title that carries code also lists the ids of the advisories
it carries.

## Authoring an entry

1. Code in `api/**` mirrors the structure of `apps/api/src/modules/<name>/**`, including its
   own tests (`*.spec.ts`, `*.int-spec.ts`, `*.e2e-spec.ts`).
2. The web part, if any, is `web/core` (pure TS) and `web/react` (react-query hooks/options) —
   see the raw-web rule below.
3. Manual migrations (triggers, functions — never table creation) live in
   `migrations/custom/NN_<slug>.sql`; the child app generates the real migrations with
   `drizzle-kit generate` at `module add` time, so the numbering, `when` and the snapshot
   chain belong to the child.
4. `README.md` follows the fixed section contract described in
   [`README-contract.md`](./README-contract.md).
5. `CHANGELOG.md` follows keep-a-changelog and cites the advisories carried by each version.
6. Parity tests in `parity/*.parity.spec.ts` compare the entry's behavior against
   `parity/contract.snapshot.json`.

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

## Lint and checks

- **`pnpm catalog:lint`** (`scripts/platform/catalog-lint.mjs`), triggered by the lefthook
  **pre-commit** hook in `lefthook-local.yml` on `catalog/**`, `docs/advisories/**` and
  `docs/dev/template-changelog.md`, validates: `module.json` against the schema; that every
  `kernelRange` accepts the latest `## vX.Y.Z` of the template changelog (the kernel the next
  tag carries — issue #9); presence and order of the README sections per `README-contract.md`;
  the import allow-list in `web/**`; the existence of a version title in `CHANGELOG.md`
  matching `module.json.version`; and the advisories' frontmatter.
- **advisory-required rule** (`scripts/platform/advisory-required.mjs`): if any path is under
  `catalog/<entry>/(api|web|migrations|parity)/**`, a
  `docs/advisories/ADV-*.md` with `module: <entry>` must exist in the same commit, or that
  commit's message must carry the trailer `Advisory: none — <reason>`; otherwise it fails
  (exit 1) with the rule printed. Two triggers, one module: the lefthook **commit-msg** hook in
  `lefthook-local.yml` (local commit, staged files) and the `gates` job of
  `.github/workflows/ci.yml`, which calls
  `--range <base>..<head>` and judges **each commit of the PR by its own message** — a trailer
  in the last commit does not exempt the previous ones.
- **`pnpm catalog:check [entry…]`** (`scripts/platform/catalog-check.mjs`) is not a git hook
  (it takes minutes): it renders a kernel-only child via copier into a scratch directory, runs
  `pnpm install`, and for each entry in topological order does a cumulative `module add` +
  scoped tests; at the end it runs `pnpm check && pnpm test` plus parity. It is the **pre-tag
  gate**, documented here and triggered manually or in CI before cutting an entry tag.

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
