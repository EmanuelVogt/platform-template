# web-stack-next — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/web-stack-next/design.md`
**Status**: Approved (autonomous run, 2026-08-23)
**Worktree**: `.worktrees/web-stack-next`, branch `feat/web-stack-next` from local `main`

---

## Test Coverage Matrix

> Guidelines found: `docs/code-quality.md`, `docs/test/testing.md`, `apps/web/vitest.config.ts` (thresholds), `lefthook.yml`, `.github/workflows/catalog.yml`, AD-012/AD-023.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Next shell `src/**` (config, lib, store, providers, layout, pages) | unit (vitest, jsdom) | 1:1 with SHELL-* + ACC-07 (≥90 S/B/F/L); every copied module keeps its copied spec | `apps/web-next/src/**/*.{test,spec}.{ts,tsx}` | `pnpm --filter web-next test` / `test:cov` |
| `packages/eslint-config/fsd-next.js` | unit (node test runner, as `rules/*.test.js`) | element patterns + `app` policy | `packages/eslint-config/*.test.js` | `pnpm --filter @workspace/eslint-config test` (check the package's test script; add one mirroring `rules/` if missing) |
| `scripts/**` (render-child, smoke, catalog-check, workflow) | unit (node:test) | flag parsing, `assertWebShell` happy + both failure paths, workflow matrix (ACC-11) | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| `module-boundaries.spec.ts` RULE C | unit (jest, api) | resolver picks `apps/web-vite` in the repo and `apps/web` in a child; `_app` counts as kernel surface | `apps/api/src/modules/module-boundaries.spec.ts` | `pnpm --filter api test -- module-boundaries` |
| copier layout, Dockerfile, docs | none — gate/probe | `template:smoke` both stacks, `catalog:check identity` next, Verifier probes ACC-01/02/04/12 | — | see gates |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | tasks with unit tests | the layer's run command above, scoped to the touched path |
| Full | none in this feature (no e2e/integration) | — |
| Build | once per wave, through the runner | `pnpm turbo typecheck lint --filter=...touched packages` + scoped unit; wave 1 and 3 (`full-unit`): `pnpm check && pnpm test` |
| Final | Verifier only | `pnpm check && pnpm test && pnpm test:scripts && pnpm --filter web-next test:cov && pnpm template:smoke --web-stack vite && pnpm template:smoke --web-stack next && pnpm catalog:check identity --web-stack next && pnpm catalog:check --web-stack vite` + probes ACC-01/02/04/06 |

---

## Tasks

### T1 — Move Vite shell, add root Jinja symlink dirs, `web_stack` question
- **Depends on**: none · **Exclusive**: yes (repo structure + copier config)
- **Touches**: `apps/web/**` → `apps/web-vite/**` (git mv, no content change), `{% if web_stack == 'vite' %}apps{% endif %}/web` (symlink), `{% if web_stack == 'next' %}apps{% endif %}/web` (symlink → `../apps/web-next`, dangling until T7 — acceptable; copier skips the dir for vite and T7 lands before any next render), `copier.yml`, `.prettierignore`
- **Done when**: `git status` shows a pure rename for `apps/web`; `readlink` of both symlinks correct; `copier.yml` matches design § 1 (question after `app_domain`, two `_exclude` lines, rename task before `pnpm install`); `pnpm check` green in the repo; `pnpm template:smoke` (vite) green; a child rendered with `--data web_stack=vite` diffs empty against one rendered from `main` (excluding `.copier-answers.yml`) — worker runs this probe via the runner and pastes the diff exit code in the summary.
- **Tests**: none (gate + probe). Spec refs: COP-01..04, ACC-01.

### T2 — RULE C resolver for the three web roots
- **Depends on**: T1 · **Exclusive**: no
- **Touches**: `apps/api/src/modules/module-boundaries.spec.ts`
- **Done when**: `WEB_SRC_DIR` replaced by `webShellRoots()` returning every existing dir among `apps/web`, `apps/web-vite`, `apps/web-next`; kernel surface includes `src/app/**` and `src/_app/**`; spec passes in the repo now (web-next absent) and after T7+.
- **Tests**: the spec itself (it is a test); add a case asserting the resolver returns `apps/web-vite` here. Spec ref: CAT-03.

### T3 — `fsd-next` eslint config
- **Depends on**: none · **Exclusive**: no
- **Touches**: `packages/eslint-config/fsd-next.js`, `packages/eslint-config/fsd-next.test.js`, `packages/eslint-config/package.json` (export + dep `@next/eslint-plugin-next`)
- **Done when**: design § 3 shape; test asserts elements and the `app → _app,_pages` only policy; package test script runs it.
- **Tests**: unit. Spec ref: LINT-01.

### T4 — `typescript-config/next.json`
- **Depends on**: none · **Exclusive**: no
- **Touches**: `packages/typescript-config/next.json`, `packages/typescript-config/package.json` (only if `files` needs it)
- **Done when**: file per design § 3, fields consistent with `base.json`/`react-vite.json`.
- **Tests**: none (gate). Spec ref: LINT-02.

### T5 — `--web-stack` in render-child, smoke, catalog-check + `assertWebShell`
- **Depends on**: none · **Exclusive**: no
- **Touches**: `scripts/platform/lib/render-child.mjs`, `scripts/template-smoke.mjs`, `scripts/platform/catalog-check.mjs`, `scripts/platform/lib/web-shell.mjs` (new: `assertWebShell`), `scripts/platform/__tests__/template-smoke.test.mjs`, `scripts/platform/__tests__/catalog-check.test.mjs`, `scripts/platform/__tests__/web-shell.test.mjs` (new)
- **Done when**: flag defaults to `vite`, rejects other values with a pt-BR message; `assertWebShell` covers next/vite presence rules + ACC-06 greps; existing tests green.
- **Tests**: unit (node:test). Spec refs: CAT-01, ACC-06, ACC-10.

### T6 — `catalog.yml` matrix `web_stack`
- **Depends on**: T5 · **Exclusive**: no
- **Touches**: `.github/workflows/catalog.yml`, `scripts/platform/__tests__/catalog-check.test.mjs` (workflow assertion case)
- **Done when**: both jobs carry `web_stack: [vite, next]` and pass the flag; `smoke` job runs `pnpm turbo test:cov --filter=web-next`; test parses the YAML and asserts (ACC-11).
- **Tests**: unit. Spec refs: CAT-02, ACC-11.

### T7 — Next shell package skeleton + lockfile
- **Depends on**: T1, T3, T4 · **Exclusive**: yes (lockfile)
- **Touches**: `apps/web-next/{package.json,next.config.ts,next-env.d.ts,tsconfig.json,eslint.config.js,vitest.config.ts,test/setup.ts,.env.example,.dockerignore,public/.gitkeep}`, `apps/web-next/app/page.tsx` (placeholder page so `next build` has a route — replaced in T11), `pnpm-lock.yaml`
- **Done when**: `pnpm install` clean; `pnpm --filter web-next typecheck lint build` green; vitest config per design § 2 (thresholds 90 — allowed to fail `test:cov` until T8–T11 land; `test` with zero files passes via `passWithNoTests`).
- **Tests**: none (gate). Spec refs: SHELL-08, SHELL-10, SHELL-12.

### T8 — `shared/{config,lib,store,test}` mirrored
- **Depends on**: T7 · **Exclusive**: no
- **Touches**: `apps/web-next/src/shared/**`
- **Done when**: files listed in design § 2 exist with their specs; `env.test.ts` covers ACC-09 (missing + invalid → `ZodError`, pt-BR message); `route-access.spec.ts` covers ACC-08 (every `ROUTES` value has a row; permission rows have `key`); copied modules diff-clean against `apps/web-vite` except router-typed imports.
- **Tests**: unit. Spec refs: SHELL-03..05, SHELL-08, ACC-08, ACC-09.

### T9 — `_app/{config,providers}`
- **Depends on**: T7 · **Exclusive**: no
- **Touches**: `apps/web-next/src/_app/config/**`, `apps/web-next/src/_app/providers/**`
- **Done when**: `api-client.ts` is the sole `@platform/api-client` root import (spec greps `src/**`); providers test renders children with QueryClient and triggers cross-tab logout.
- **Tests**: unit. Spec refs: SHELL-02, SHELL-07.

### T10 — `_pages/{home,error,not-found}`
- **Depends on**: T7 · **Exclusive**: no
- **Touches**: `apps/web-next/src/_pages/**`
- **Done when**: three unstyled pages + tests (error page calls `reset` on click; not-found links `ROUTES.home`).
- **Tests**: unit. Spec ref: SHELL-09.

### T11 — `_app/layout` + `app/` re-exports
- **Depends on**: T8, T9, T10 · **Exclusive**: no
- **Touches**: `apps/web-next/src/_app/layout/**`, `apps/web-next/app/{layout,page,error,not-found}.tsx`
- **Done when**: `root-layout`, `product-shell` (slot), `access-slot` (`AccessGuard`, `resolveRouteAccess` fail-closed), `last-location-tracker`; `app/*.tsx` are one-line re-exports; tests for `resolveRouteAccess` (known public → entry; unknown → authenticated) and root layout composition; `pnpm --filter web-next test:cov` ≥ 90 all four; `next build` green; grep ACC-06 clean.
- **Tests**: unit. Spec refs: SHELL-01, SHELL-05, SHELL-06, SHELL-13, ACC-07.

### T12 — Next `Dockerfile`
- **Depends on**: T7 · **Exclusive**: no
- **Touches**: `apps/web-next/Dockerfile`
- **Done when**: design § 4; `docker build` is verified by the Verifier in the rendered child (ACC-04) — the worker only lints the file by eye against the Vite Dockerfile's stages.
- **Tests**: none (probe). Spec ref: SHELL-11.

### T13 — `docs/front/front-arch.md` stack split
- **Depends on**: T11 · **Exclusive**: no
- **Touches**: `docs/front/front-arch.md`
- **Done when**: design § 6 bullets 1 applied; no remaining sentence claims TanStack is the only router.
- **Tests**: none (probe ACC-12). Spec refs: DOC-01, LINT-03.

### T14 — Ownership table, README/AGENTS conditionals, deploy, changelog
- **Depends on**: T11 · **Exclusive**: no
- **Touches**: `docs/dev/template.md`, `README.md.jinja`, `AGENTS.md.jinja`, `docs/dev/deploy.md.jinja`, `docs/dev/template-changelog.md`
- **Done when**: design § 6 bullets 2–5; rendering with `vite` leaves `README.md`/`AGENTS.md` byte-identical to `main`'s render (worker probes via runner).
- **Tests**: none (probe). Spec refs: DOC-02..05.

### T15 — identity README Next recipe
- **Depends on**: T11 · **Exclusive**: no
- **Touches**: `catalog/identity/single-tenant/README.md`
- **Done when**: recipe names `src/_app/layout/access-slot.tsx` + `ROUTE_ACCESS`; commit passes the commit-msg hook (use trailer `Advisory: none — docs-only recipe update` only if the hook demands it, and say so in the summary).
- **Tests**: none. Spec ref: DOC-07.

---

## Wave Plan

| Wave | Cluster | Tasks (order) | File union | Tier | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | C1 | T1 | apps/web→web-vite, root symlinks, copier.yml, .prettierignore | sonnet | exclusive; gate `full-unit` + smoke vite |
| 2 | C2 | T2 | module-boundaries.spec.ts | sonnet | |
| 2 | C3 | T3 → T4 | packages/eslint-config/**, packages/typescript-config/** | sonnet | |
| 2 | C4 | T5 → T6 | scripts/**, .github/workflows/catalog.yml | sonnet | gate scoped: `pnpm test:scripts` |
| 3 | C5 | T7 | apps/web-next skeleton, pnpm-lock.yaml | sonnet | exclusive; gate `full-unit` |
| 4 | C6 | T8 | apps/web-next/src/shared/** | sonnet | |
| 4 | C7 | T9 | apps/web-next/src/_app/{config,providers}/** | sonnet | |
| 4 | C8 | T10 | apps/web-next/src/_pages/** | sonnet | |
| 4 | C9 | T12 | apps/web-next/Dockerfile | sonnet | |
| 5 | C10 | T11 | apps/web-next/src/_app/layout/**, apps/web-next/app/** | sonnet | gate: `pnpm --filter web-next test:cov typecheck lint build` |
| 6 | C11 | T13 | docs/front/front-arch.md | sonnet | |
| 6 | C12 | T14 | docs/dev/*, README.md.jinja, AGENTS.md.jinja | sonnet | |
| 6 | C13 | T15 | catalog/identity/single-tenant/README.md | haiku | |
| — | Verifier | — | — | sonnet | Final gate + probes ACC-01/02/04/06/12 |

## Cross-checks

**Granularity**: every task = one package/dir/config concern — ✅.

**Diagram–definition**: T2←T1 ✅(w2>w1) · T6←T5 ✅(same cluster, ordered) · T7←T1,T3,T4 ✅(w3>w1,w2) · T8/T9/T10/T12←T7 ✅ · T11←T8,T9,T10 ✅(w5>w4) · T13/T14/T15←T11 ✅(w6>w5).

**Test co-location**: T2,T3,T5,T6,T8,T9,T10,T11 carry their specs ✅; T1,T4,T7,T12,T13,T14,T15 are gate/probe layers per matrix ✅.

**Wave/cluster**: no file shared between sibling clusters in any wave (w2: api spec / packages / scripts+workflow; w4: four disjoint dirs; w6: three disjoint files) ✅; exclusive T1 and T7 alone in their waves ✅.
