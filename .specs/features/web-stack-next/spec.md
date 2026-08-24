# web-stack-next — Specification

**Status**: Draft (2026-08-23) · **Scope**: Large · **Owner**: template maintainer

## Problem

A product generated from this template gets one web shell: React/Vite + TanStack Router
(`apps/web`). The first real consumer of the catalog's web parts is an existing Next 16
app-router site. Catalog entries already ship "raw web" (AD-018: pure TS + query hooks,
no component/page/router), so nothing in the catalog prevents a Next product — only the
template does: it has no way to render a Next shell that honours the same platform
contract (transport, env, RFC 7807, auth store, route access vocabulary, test helpers).

## Goal

`copier copy` gets a `web_stack` question (`vite` default, `next`). Exactly one shell is
rendered to `apps/web`. Both shells expose the same platform contract so an entry's
`web/{core,react}` installs unchanged on either stack, `pnpm catalog:check` passes for
every entry on both, and an existing Vite child's `copier update` is a no-op for
`apps/web`.

## Context findings that correct the request (verified against the repo 2026-08-23)

| Request assumes | Repo reality | Consequence |
| --- | --- | --- |
| root `vitest.config.mts` / `vitest.coverage.mts`, AD-027 "90 floor" | none; thresholds live in `apps/web/vitest.config.ts` (S64/B56/F61/L64); AD-012 is the pre-push 95% bar, STATE.md ends at AD-026 | Next shell ships its own `vitest.config.ts` with thresholds ≥ Vite's; feature target ≥ 90 on the shell's own files (ACC-01); new decision is **AD-027** |
| `.github/workflows/ci.yml` | only `catalog.yml` (jobs `catalog` matrix over entries, `smoke` single) | matrix `web_stack: [vite, next]` goes on both jobs of `catalog.yml` |
| `scripts/platform/lib/child-layout.mjs` / `webRoot` | `webRoot` default `apps/web/src` in `lib/commands/{add,adopt}.mjs`, `lib/plan.mjs` | unchanged: both shells live at `apps/web/src` in the child |
| `docs-reference.spec.ts` | does not exist | no such gate; docs are checked by the Verifier's probe |
| `docs/arch/front.md` | `docs/front/front-arch.md` | edit that file |
| `## Unreleased` holding a Vitest migration | changelog top is `v1.0.0` | create `## Unreleased`; proposed tag **v1.1.0** |
| Next recipe needed in entry READMEs | only `identity/single-tenant` has a web recipe; it already has `### Receita: Next.js (middleware.ts + layout)` | align that paragraph with the shipped shell (`ROUTE_ACCESS`, `src/_app`), no other README changes |

## Copier mechanism (probed on copier 9.17.1, scratch template)

Both shells cannot be plain `apps/*` workspace members with Jinja-named directories:
turbo expands `{…}` in a path as a glob and resolves the directory to `apps/web` twice
(`Failed to add workspace "web" … already exists`), and `_exclude` matches the
**destination** path, so a literal `apps/web` source can never be suppressed for one
stack without also suppressing the other shell rendered to the same destination.

Layout that works (every line below was exercised by the probe):

```
apps/web-vite/                       real Vite shell, workspace member `web` (git mv of apps/web)
apps/web-next/                       real Next shell, workspace member `web-next`
{% if web_stack == 'vite' %}apps{% endif %}/web -> ../apps/web-vite   (symlink)
{% if web_stack == 'next' %}apps{% endif %}/web -> ../apps/web-next   (symlink)
copier.yml  _exclude: apps/web-vite, apps/web-next
            _tasks:   rename package "web-next" -> "web" in apps/web/package.json
                      when web_stack == 'next' and _copier_operation == 'copy'
```

Probe results: copier follows the symlinked directory and renders `.jinja` files inside
it; a `vite` child rendered from the new layout is byte-identical to one rendered from
the old `apps/web`; `copier update --defaults` and `--skip-answered` on an old child both
end with only `.copier-answers.yml` modified (`web_stack: vite` appended); a `next` child
gets `apps/web` = Next shell with `"name": "web"`, and a later `copier update` patches
`apps/web/**` in place and keeps the renamed package name.

## User stories

- **P1 — Vite child unchanged.** As the maintainer of an existing product I run
  `copier update` and nothing under `apps/web` changes.
- **P1 — Next product.** As a new product I answer `web_stack=next` and get a headless
  Next.js `apps/web` that passes `pnpm check`, `pnpm test`, `pnpm --filter web build` and
  `docker build -f apps/web/Dockerfile .`.
- **P1 — Catalog parity.** As a product on either stack I run
  `pnpm platform module add identity --variant single-tenant --with-deps` and the entry's
  web specs pass under `--project web`.
- **P2 — Docs.** As a product developer I read one front handbook with a stack-neutral
  core and one short section per stack.

## Requirements

### COP — copier mechanics

- **COP-01** `copier.yml` gains `web_stack` (`str`, choices `[vite, next]`, default
  `vite`, help as in the request) placed after `app_domain`.
- **COP-02** Template source holds both shells as described above; `_exclude` lists
  `apps/web-vite` and `apps/web-next`; the existing `apps/web/.env.local` exclusion keeps
  matching the rendered destination.
- **COP-03** `_tasks` renames the package only for `next` on `copy`, via `node -e`
  (no `sed -i`, portable).
- **COP-04** The template repo's own workspace stays `apps/*`; the root Jinja-named
  directories are outside `apps/` and ignored by prettier (`.prettierignore`).

### SHELL — Next shell contract (reference = `apps/web-vite`)

- **SHELL-01** Layout: `app/{layout,page,error,not-found}.tsx` are pure re-exports from
  `src/_pages/<page>/ui/*` (and `src/_app/layout`); `src/_app/{config,providers,layout}`,
  `src/_pages/{home,error,not-found}`, `src/shared/{config,lib,store,test}`.
  `src/app` and `src/pages` do not exist.
- **SHELL-02** Transport: `src/_app/config/api-client.ts` is the only root-level import of
  `@platform/api-client`; `packages/api-client/src/client.ts` is not modified.
- **SHELL-03** `src/shared/config/env.ts` parses `NEXT_PUBLIC_API_URL` with Zod and throws
  at module load on an invalid value; `src/_app/config/zod-locale.ts` mirrors the Vite one.
- **SHELL-04** `shared/lib/{problem-details,auth-redirect,last-location}.ts`,
  `shared/store/auth.store.ts`, `shared/config/{routes,route-access.types,password-policy}.ts`
  are copied verbatim from the Vite shell except for imports that reference the router
  (`last-location`/`auth-redirect` take a pathname string, never a TanStack type).
- **SHELL-05** Route access: `src/shared/config/route-access.ts` exports
  `ROUTE_ACCESS: Record<RoutePath, RouteAccess>` keyed by every `ROUTES` value; a spec
  fails when a `ROUTES` entry has no `ROUTE_ACCESS` row and when a row carries a
  `kind: "permission"` without `key`. `src/_app/layout/access-slot.tsx` exports a no-op
  `AccessGuard` component reading `ROUTE_ACCESS[usePathname()]`; the identity entry's
  recipe replaces it.
- **SHELL-06** Product slot: `app/layout.tsx` renders `RootLayout` from
  `src/_app/layout/root-layout.tsx`, which composes `src/_app/layout/product-shell.tsx`
  (`ProductShell` = branding/fonts/header slot, ships as a pass-through `<>{children}</>`)
  and `AccessGuard`. A product edits only `product-shell.tsx` and adds
  `app/<route>/page.tsx`; the ownership table lists exactly that.
- **SHELL-07** Providers: `src/_app/providers/app-providers.tsx` is a client component
  (`QueryClientProvider` + `CrossTabLogout`), `query-client.ts` identical to Vite's.
- **SHELL-08** Test helpers `src/shared/test/{msw-server,render-with-providers,fixed-clock}`
  mirrored; `vitest.config.ts` project name `web`, jsdom, include
  `src/**/*.{test,spec}.{ts,tsx}`, coverage v8 on `src/**` with thresholds not below the
  Vite shell's, `env.NEXT_PUBLIC_API_URL`.
- **SHELL-09** Pages home/error/not-found are unstyled; `error.tsx` is a client component
  with `reset`; `not-found.tsx` links to `ROUTES.home`.
- **SHELL-10** `next.config.ts` sets `output: "standalone"`, `reactStrictMode: true`; dev
  port **3001** (`next dev -p 3001`; api owns 3000, Vite keeps 5173).
- **SHELL-11** `Dockerfile`: `turbo prune web --docker` → install → `next build` →
  runner `node:22-alpine` non-root `nextjs` user, copies `.next/standalone`, `.next/static`,
  `public`, `CMD ["node","apps/web/server.js"]`, `EXPOSE 3000`; no nginx.
- **SHELL-12** `.env.example` holds `NEXT_PUBLIC_API_URL=http://localhost:3000`.
- **SHELL-13** No `VITE_` token, no `@tanstack/react-router` import, no `nginx` token in
  `apps/web-next`; no `next` import in `apps/web-vite`.

### LINT — tooling packages

- **LINT-01** `packages/eslint-config/fsd-next.js` (export `./fsd-next`): boundaries
  elements `_app: src/_app`, `_pages: src/_pages/*`, widgets/features/entities/shared as
  in `fsd.js`, plus an `app` element for `app/**` that may import only `_pages` and `_app`;
  includes `@next/eslint-plugin-next` recommended + core-web-vitals rules.
- **LINT-02** `packages/typescript-config/next.json` (bundler resolution, `jsx:
  preserve`, `plugins: [{name: "next"}]`, `paths @/* -> src/*`).
- **LINT-03** No-barrel rule stays; the `app/` re-export files are not barrels (one
  module each, re-exporting a single page) — documented in `front-arch.md`.

### CAT — catalog + scripts + CI

- **CAT-01** `renderChild` accepts `webStack` and passes `--data web_stack=<v>`;
  `scripts/template-smoke.mjs` and `scripts/platform/catalog-check.mjs` take
  `--web-stack vite|next` (default `vite`) and assert the rendered `apps/web` matches the
  stack (Next: `next.config.ts` present, no `vite.config.ts`; Vite: the reverse).
- **CAT-02** `.github/workflows/catalog.yml` jobs `catalog` and `smoke` get
  `web_stack: [vite, next]` in their matrix and pass it through.
- **CAT-03** `module-boundaries.spec.ts` RULE C scans the web shell at whichever of
  `apps/web`, `apps/web-vite`, `apps/web-next` exists (`src/_app/**` counts as `app/**`).
- **CAT-04** `pnpm catalog:check --web-stack next` passes for all five entries.

### DOC — documentation

- **DOC-01** `docs/front/front-arch.md`: stack-neutral core + `## Routing & access`
  (TanStack `staticData.access` vs `ROUTE_ACCESS` + `AccessGuard`) + `## Bootstrap`
  (`main.tsx` vs `app/layout.tsx` + providers) + the `_app`/`_pages` naming and the
  `app/` re-export rule.
- **DOC-02** `docs/dev/template.md` ownership table: Next rows (shell files, product slot,
  `app/<route>/page.tsx`).
- **DOC-03** `README.md.jinja` and `AGENTS.md.jinja`: `{% if web_stack == 'next' %}`
  lines for the dev URL (`:3001`) and command table; Vite render unchanged.
- **DOC-04** `docs/dev/deploy.md.jinja`: Next variant of "O que é buildado" under
  `{% if web_stack == 'next' %}`.
- **DOC-05** `docs/dev/template-changelog.md` `## Unreleased`: the question, default,
  "no migration step — `copier update --defaults` (or `--skip-answered`) writes
  `web_stack: vite` to the answers file".
- **DOC-06** `.specs/STATE.md` AD-027 (this mechanism) + Handoff.
- **DOC-07** `catalog/identity/single-tenant/README.md` Next recipe references
  `ROUTE_ACCESS` / `AccessGuard` slot (prose only; no `Advisory` needed — no code change;
  commit-msg hook treats README under catalog as code? → if it does, stop and report).

## Acceptance criteria

| ID | WHEN / THEN / SHALL | Proof |
| --- | --- | --- |
| ACC-01 | WHEN `copier copy --defaults --data web_stack=vite` renders a child from this feature's HEAD and from `main@8c2cc0c` THEN `diff -r` excluding `.copier-answers.yml`, `docs/`, `AGENTS.md`, `CLAUDE.md`, `scripts/`, `apps/api/src/modules/module-boundaries.spec.ts`, `apps/api/src/shared/config/load-dotenv.spec.ts`, `.prettierignore`, `README.md` SHALL be empty, and `apps/web/**` SHALL be byte-identical | probe (Verifier) |
| ACC-02 | WHEN an old Vite child (rendered from `8c2cc0c`, committed) runs `copier update --defaults --vcs-ref <feature HEAD>` THEN `git status --short` SHALL list only `.copier-answers.yml` plus the paths excluded in ACC-01, and the answers file SHALL contain `web_stack: vite` | probe |
| ACC-03 | WHEN `copier copy --defaults --data web_stack=next` renders a child THEN `apps/web/next.config.ts` SHALL exist, `apps/web/vite.config.ts` SHALL NOT, `apps/web/package.json` name SHALL be `web`, and `pnpm install && pnpm check && pnpm test && pnpm --filter web build` SHALL exit 0 | gate (`pnpm template:smoke --web-stack next`) |
| ACC-04 | WHEN `docker build -f apps/web/Dockerfile .` runs in the Next child THEN it SHALL exit 0 and the image SHALL run as a non-root user | probe |
| ACC-05 | WHEN `pnpm platform module add identity --variant single-tenant --with-deps` runs in the Next child THEN it SHALL exit 0 and `pnpm --filter web test` SHALL pass including `src/entities/identity/**` specs | gate (`pnpm catalog:check identity --web-stack next`) |
| ACC-06 | WHEN grep runs over the Next child's `apps/web` THEN `VITE_`, `@tanstack/react-router`, `nginx` SHALL have zero hits; over the Vite child's `apps/web`, `from "next` SHALL have zero hits | test (`scripts/platform/__tests__/template-smoke.test.mjs`) + probe |
| ACC-07 | WHEN `pnpm --filter web-next test:cov` runs in the template repo THEN statements/branches/functions/lines on `src/**` SHALL each be ≥ 90 | gate |
| ACC-08 | WHEN a `ROUTES` value has no `ROUTE_ACCESS` row THEN `route-access.spec.ts` SHALL fail naming the path | test |
| ACC-09 | WHEN `NEXT_PUBLIC_API_URL` is missing or not a URL THEN importing `env.ts` SHALL throw a `ZodError` with the pt-BR locale message | test |
| ACC-10 | WHEN `pnpm template:smoke --web-stack vite` and `--web-stack next` run THEN both SHALL exit 0 | gate |
| ACC-11 | WHEN `catalog.yml` is parsed THEN both jobs SHALL carry `web_stack: [vite, next]` | test (`scripts/platform/__tests__/catalog-check.test.mjs` reads the workflow) |
| ACC-12 | WHEN the Verifier reads the docs in DOC-01..07 THEN each listed change SHALL be present | probe |

## Implicit-requirement dimensions

- Input validation: copier `choices` rejects other values (COP-01); env Zod (SHELL-03).
- Failure states: `_tasks` rename runs only on `copy`; a failed task aborts copier with
  its own error — no partial handling needed.
- Idempotency/retry: `copier update` re-runs are idempotent by construction (probe).
- Auth boundaries: N/A — guard arrives with the identity entry (AD-017/018); the shell
  ships the vocabulary only.
- Concurrency, data lifecycle, observability, external-dependency failure,
  state-transition integrity: N/A because the feature is template scaffolding with no
  runtime state.

## Assumptions

- A-1 "Zero diff" for Vite children is read as `apps/web/**` and root manifests
  byte-identical; docs, `AGENTS.md`, `scripts/**` and the RULE C spec may change (the
  request itself mandates edits there).
- A-2 Coverage target is ≥ 90 on the Next shell's own `src/**` (ACC-07); the Vite shell's
  thresholds are not touched.
- A-3 Next version: `next@16`, `react@19`, `@next/eslint-plugin-next@16`; `eslint-plugin-boundaries` already in the repo.
- A-4 Dev port 3001 for Next (api = 3000, Vite = 5173).
- A-5 Tag proposal `v1.1.0` (no `Unreleased` section exists today).

## Out of scope

UI kit, Tailwind, shadcn, SSR data patterns, converting a product, catalog entry code,
i18n, middleware-based guard (README recipe only).
