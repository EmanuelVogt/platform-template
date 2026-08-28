# Catalog entry authoring

Entry authoring lives here, not in `docs/catalog/catalog.md` — that file ships to every child and
covers only what a child consumes (`pnpm platform module add`, `dependsOn`, the entry model). See
it first; this file covers the rest, for whoever works inside this repository.

## Authoring an entry

1. Code in `api/**` mirrors the structure of `apps/api/src/modules/<name>/**`, including its
   own tests (`*.spec.ts`, `*.int-spec.ts`, `*.e2e-spec.ts`).
2. The web part, if any, is `web/core` (pure TS) and `web/react` (react-query hooks/options) —
   see the raw-web rule in `docs/catalog/catalog.md`.
3. Manual migrations (triggers, functions — never table creation) live in
   `migrations/custom/NN_<slug>.sql`; the child app generates the real migrations with
   `drizzle-kit generate` at `module add` time, so the numbering, `when` and the snapshot
   chain belong to the child.
4. `README.md` follows the fixed section contract described in
   [`README-contract.md`](./README-contract.md).
5. `CHANGELOG.md` follows keep-a-changelog and cites the advisories carried by each version.
6. Parity tests in `parity/*.parity.spec.ts` compare the entry's behavior against
   `parity/contract.snapshot.json`.

## Lint and checks

- **`pnpm catalog:lint`** (`scripts/platform/catalog-lint.mjs`), triggered by the lefthook
  **pre-commit** hook in `lefthook-local.yml` on `catalog/**`, `docs/advisories/**` and
  `docs/dev/template-changelog.md`, validates: `module.json` against the schema; that every
  `kernelRange` accepts the latest `## vX.Y.Z` of the template changelog (the kernel the next
  tag carries — issue #9); presence and order of the README sections per `README-contract.md`;
  the import allow-list in `web/**`; the existence of a version title in `CHANGELOG.md`
  matching `module.json.version`; and the advisories' frontmatter.
- **entry-tag rules** (`lintEntryBump` and `lintEntryTagCoverage`, `scripts/platform/lib/lint.mjs`),
  run by `catalog:lint` — the only readers of a `catalog/*` tag in the repo, and the reason
  cutting one can stay a manual act (AD-040) without the tag drifting from
  `module.json.version`:
  - `lintEntryBump` resolves an entry against **its own tag** —
    `catalog/<name>[-<variant>]@x.y.z`, e.g. `catalog/identity-single-tenant@3.0.0` — and only
    falls back to the latest kernel tag for an entry that was never tagged. The kernel tag moves
    at every release, so an entry that changed without a bump and survived a `vX.Y.Z` used to
    become invisible after it; the entry's own tag is immovable. A version ahead of the entry's
    last tag is the normal in-flight bump and is accepted; a version below it with no tag of its
    own fails.
  - `lintEntryTagCoverage` requires a tag for every entry version **the latest kernel tag
    ships**, and that the tag be reachable from it. Measuring the release rather than `HEAD` is
    what lets the cut stay manual: the gate never blocks the commits between the bump and the
    cut, but the tag becomes mandatory the moment the version is released. Reachability, not
    equality, because the six entries anchor at `v3.0.0` while the kernel is already further
    ahead — the anchor is the release that shipped the version.
  - The `-<variant>` segment is present **iff `module.json` declares `variant`**, and both rules
    treat `catalog/identity@3.0.0` and `catalog/identity-single-tenant@3.0.0` as different
    entries: a bare-name tag neither serves as a baseline for nor satisfies the coverage of an
    entry that declares a variant.
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
