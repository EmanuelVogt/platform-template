# web-stack-next Validation

**Date**: 2026-08-23
**Spec**: `.specs/features/web-stack-next/spec.md`
**Diff range**: `main..HEAD` (`feat/web-stack-next`, HEAD `3122156`, base `6c9b508`)
**Verifier**: independent sub-agent (author ≠ verifier)
**Checkout**: `/home/emanuel/Projects/platform-template/.worktrees/web-stack-next`

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T0–T15 | ✅ Done | all committed; wave notes list 5 `SPEC_DEVIATION`s and 5 orchestrator fixes |
| T2 (RULE C) | ⚠️ Partial | the spec it edits passes in the template but fails in every rendered child — see Gap 1 |
| T12 (Dockerfile) | ⚠️ Partial | correct image, but the AC's literal `docker build` cannot succeed — see Gap 3 |

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + evidence | Result |
| --- | --- | --- | --- |
| ACC-01 vite render HEAD vs `8c2cc0c` | diff (minus the AC's exclusions) empty **and** `apps/web/**` byte-identical | `diff -r -x node_modules <base>/apps/web <head>/apps/web` → **exit 0, no output**; full-tree diff exit 1 with 7 non-excluded paths: `packages/eslint-config/{fsd-next.js,fsd-next.test.js,package.json}`, `packages/typescript-config/{next.json,package.json}`, `pnpm-lock.yaml`, `apps/api/src/shared/kernel/access/access.guard.spec.ts` | ❌ as written (second half ✅) |
| ACC-02 `copier update` on an old vite child | status lists only `.copier-answers.yml` + ACC-01's exclusions; answers carry `web_stack: vite` | update exit 0; `.copier-answers.yml` → `web_stack: vite` ✅; `apps/web/**` absent from `git status` ✅; but `M packages/eslint-config/package.json`, `M packages/typescript-config/package.json`, `M pnpm-lock.yaml`, `M apps/api/src/shared/kernel/access/access.guard.spec.ts` + 5 `??` new files are outside the list | ❌ as written (user story ✅) |
| ACC-03 next child renders and builds | `next.config.ts` present, no `vite.config.ts`, name `web`, `pnpm install && check && test && build` exit 0 | structural half ✅ (probe: `next_config_present=yes`, `vite_config_present=no`, `pkg_name=web`); gate `pnpm template:smoke --web-stack next` → **exit 7**, `template:smoke — "pnpm test" falhou no child (código 1)` (`gate-6-smoke-next.log`) | ❌ |
| ACC-04 `docker build -f apps/web/Dockerfile .` | exit 0, image runs non-root | plain build **exit 1** — `probe-acc04-build.log:234-255` `Error occurred prerendering page "/"` + `Error [ZodError] … "NEXT_PUBLIC_API_URL" … "Invalid URL"` (from `src/shared/config/env.ts:7`). With `--build-arg NEXT_PUBLIC_API_URL=…` → exit 0, `Config.User=nextjs`, `id` → `uid=100(nextjs) gid=101(nodejs)` | ❌ (non-root half ✅) |
| ACC-05 identity entry on the next child | `catalog:check identity --web-stack next` exit 0 | **exit 7** — child `pnpm check` fails: 3× `@typescript-eslint/unbound-method` in `apps/api/src/modules/identity/application/access-policy.spec.ts:116:12,139:12,183:12` (`gate-7-catalog-identity-next.log`); all child test suites passed (94, 585) | ❌ |
| ACC-06 stack tokens absent | `VITE_`, `@tanstack/react-router`, `nginx` = 0 in the next child; `from "next` = 0 in the vite child | test: `scripts/platform/__tests__/web-shell.test.mjs:97` `assert.throws(() => assertWebShell(childDir,"next"), err instanceof WebShellMismatchError && err.message.includes("VITE_"))`, `:113` same for `from "next`, `:51/:61` happy paths, `:71` wrong config file. probe on the rendered next child: `grep_VITE_hits=0`, `grep_tanstack_router_hits=0`, `grep_nginx_hits=0` | ✅ |
| ACC-07 coverage ≥ 90 on `src/**` | S/B/F/L each ≥ 90 | gate `pnpm --filter web-next test:cov` exit 0 → S 96.74 / B 94.25 / F 97.05 / L 99.06; thresholds pinned at `apps/web-next/vitest.config.ts:25-30` | ✅ |
| ACC-08 `ROUTES` value without a `ROUTE_ACCESS` row | spec fails naming the path | `apps/web-next/src/shared/config/route-access.spec.ts:9` `expect(ROUTE_ACCESS[path], \`rota sem ROUTE_ACCESS: ${path}\`).toBeDefined()`; `:16` `expect(access.key, \`permission sem key: ${path}\`).toBeTruthy()` | ✅ |
| ACC-09 invalid/missing `NEXT_PUBLIC_API_URL` | import of `env.ts` throws `ZodError` with the pt-BR message | `apps/web-next/src/shared/config/env.test.ts:26-27` `expect(caught).toBeInstanceOf(ZodError)` + `.issues[0]?.message).toBe("Campo obrigatório.")`; `:39-40` same + `toBe("URL inválido")`; thrown at `env.ts:7` `envSchema.parse(process.env)` | ✅ |
| ACC-10 both smokes exit 0 | vite and next exit 0 | `template:smoke --web-stack vite` **exit 7**, `--web-stack next` **exit 7**, both `"pnpm test" falhou no child (código 1)` | ❌ |
| ACC-11 workflow matrix | both jobs carry `web_stack: [vite, next]` | `scripts/platform/__tests__/catalog-check.test.mjs:663` `assert.deepEqual(catalogJob.strategy.matrix.web_stack, ["vite","next"])` + same for `smokeJob`; source `.github/workflows/catalog.yml:43` and `:86`, passed through at `:78` / `:97` | ✅ |
| ACC-12 DOC-01..07 present | each listed doc change exists | DOC-01 `docs/arch/front.md` § Next shell + Stack (portado de `docs/front/front-arch.md`, removido pela renomeação em `origin/main`); DOC-02 `docs/dev/template.md:24-26`; DOC-03 `README.md.jinja:18`, `AGENTS.md.jinja:38`; DOC-04 `docs/dev/deploy.md.jinja:35,48`; DOC-05 `docs/dev/template-changelog.md:7,9`; DOC-06 `.specs/STATE.md:40` (AD-032); DOC-07 `catalog/identity/single-tenant/README.md:346,355,369` | ✅ (⚠️ DOC-03, below) |

**Status**: ❌ Gaps present — 6/12 ACs met, 6 failed, 1 spec-precision gap flagged (DOC-03).

**Spec-precision gap (DOC-03)**: the spec asks for `{% if web_stack == 'next' %}` lines for the dev URL *and the command table*; only the dev URL (`README.md.jinja:18`) and a parenthetical on one row (`AGENTS.md.jinja:38 " (front on :3001)"`) exist. Already flagged in the Wave 6 note.

---

## Supporting requirement evidence (source-level)

- COP-01 `copier.yml:91-95` — `web_stack`, `type: str`, `default: vite`, `choices: [vite, next]`, placed after `app_domain` (`:86-89`).
- COP-02 `copier.yml:25-27` — `apps/web/.env.local` kept, `apps/web-vite`, `apps/web-next` excluded.
- COP-03 `copier.yml:40-41` — `node -e` rename, `when: {{ web_stack == 'next' and _copier_operation == 'copy' and not _copier_conf.pretend }}`.
- COP-04 root symlinks `{% if web_stack == 'vite' %}apps{% endif %}/web -> ../apps/web-vite` and the `next` counterpart → `../apps/web-next`; both Jinja dirs listed in `.prettierignore`; template `apps/` = `api`, `web-vite`, `web-next` (no `apps/web`).
- SHELL-01 `apps/web-next/app/{layout,page,error,not-found}.tsx` are single re-exports (`app/layout.tsx:1`); `src/app` and `src/pages` do not exist.
- SHELL-02 `src/_app/config/api-client.ts:1` is the only root import of `@platform/api-client`.
- SHELL-05 `src/shared/config/route-access.ts:7-11`; `src/_app/layout/access-slot.tsx:13-18` fail-closed `{ kind: "authenticated" }`.
- SHELL-06 `src/_app/layout/root-layout.tsx:13-27` composes `AppProviders → ProductShell → AccessGuard`; `product-shell.tsx:5-7` is a pass-through.
- SHELL-10/11/12 `next.config.ts:4-5`; `package.json:7` `next dev -p 3001`; `Dockerfile:17,33,36,40-46`; `.env.example` `NEXT_PUBLIC_API_URL=http://localhost:3000`.
- SHELL-13 greps over `apps/web-next` (excluding `.next`): `@tanstack/react-router` 0, `nginx` 0, `VITE_` 1 — and that single hit is in the build artifact `apps/web-next/.turbo/turbo-test.log`, not source; `from "next` in `apps/web-vite` = 0.
- CAT-03 `apps/api/src/modules/module-boundaries.spec.ts:541-545,550-559,561-566`, test at `:625-634`.

---

## Discrimination Sensor

| # | File:line | Mutation | Scoped gate | Killed? |
| --- | --- | --- | --- | --- |
| 1 | `apps/web-next/src/_app/layout/access-slot.tsx:17` | fail-open: `return { kind: "authenticated" }` → `{ kind: "public" }` | `pnpm --filter web-next test` → exit 1, 1 failed / 55 passed — `resolveRouteAccess > cai fechada … : expected { kind: 'public' } to deeply equal { kind: 'authenticated' }` (`access-slot.test.tsx:20`) | ✅ Killed |
| 2 | `scripts/platform/lib/web-shell.mjs:30` | dropped `if (!VALID_WEB_STACKS.includes(value)) throw new InvalidWebStackError(value)` | `pnpm test:scripts` → exit 1, 194 pass / 2 fail — `parseWebStack rejects any other value…` and `parseArgs rejects a --web-stack value…`, both `Missing expected exception` | ✅ Killed |
| 3 | `apps/api/src/modules/module-boundaries.spec.ts:543` | `existsSync(dir)` → `existsSync(dir) \|\| dir.endsWith("/web")` (include `apps/web` unconditionally) | `pnpm --filter api test -- module-boundaries` → exit 1, 1 failed / 33 passed — `webShellRoots() … (CAT-03)`, received includes `…/apps/web` | ✅ Killed |

**Sensor depth**: default (3 mutants). **Result**: 3/3 killed — PASS ✅.
All three restored with `git checkout --`; `git status --short` on the worktree is empty.

---

## Gate Check

- **Gate command**: `pnpm check && pnpm test && pnpm test:scripts && pnpm --filter web-next test:cov && pnpm template:smoke --web-stack vite && pnpm template:smoke --web-stack next && pnpm catalog:check identity --web-stack next && pnpm catalog:check --web-stack vite` (run once, each step independently, logs in `scratchpad/verify/gate-*.log`).
- **Result**: 4/8 steps exit 0, 4/8 exit 7.

| # | Step | Exit | Detail |
| --- | --- | --- | --- |
| 1 | `pnpm check` | 0 | 7 tasks (lint + typecheck) |
| 2 | `pnpm test` | 0 | 484 passed — api 332, web(vite) 68, web-next 56, eslint-config 28 |
| 3 | `pnpm test:scripts` | 0 | 196 passed |
| 4 | `pnpm --filter web-next test:cov` | 0 | S 96.74 / B 94.25 / F 97.05 / L 99.06 |
| 5 | `template:smoke --web-stack vite` | 7 | `"pnpm test" falhou no child (código 1)` |
| 6 | `template:smoke --web-stack next` | 7 | idem |
| 7 | `catalog:check identity --web-stack next` | 7 | child `pnpm check` → 3 lint errors |
| 8 | `catalog:check --web-stack vite` | 7 | same 3 lint errors |

- **Test count after feature**: 484 (root `pnpm test`) + 196 (`test:scripts`). Pre-feature count not measured; no suite lost tests (`web` 68 and `api` 332 match the Wave 3 note).
- **Failures**: steps 5–8, root causes in Gaps 1 and 2.

---

## Fix Plans

### Fix 1 (Blocker) — RULE C spec is repo-specific, so it fails in every rendered child

- **Root cause**: `apps/api/src/modules/module-boundaries.spec.ts:615`, `:632` and `:639` assert the template's own shell names (`apps/web-vite`) unconditionally. In a rendered child `apps/` is `api` + `web` only, so `webShellRoots()` correctly returns `[…/apps/web]` and the three assertions fail. Reproduced directly in the rendered vite child: `pnpm --filter api test -- module-boundaries` → exit 1, `Tests: 3 failed, 31 passed` (`child-rulec.log`). This is what makes `template:smoke` fail for both stacks (`pnpm test` in the child), i.e. ACC-03 and ACC-10.
- **Fix task**: derive the expectations from the shells actually present (reuse `webShellRoots()`/`existsSync`), asserting the resolver's behaviour rather than the template's directory names; keep one case pinned to the template layout guarded by "if `apps/web-vite` exists".
- **Priority**: Blocker.

### Fix 2 (Blocker) — catalog entry spec fails lint under the bumped typescript-eslint

- **Root cause**: `catalog/identity/single-tenant/api/application/access-policy.spec.ts:116,139,183` (`expect(scope.assertValid)…`) trip `@typescript-eslint/unbound-method` with the `typescript-eslint` 8.60 → 8.67 / eslint 10.4 → 10.9 bump introduced by T7's lockfile. The kernel's twin (`apps/api/src/shared/kernel/access/access.guard.spec.ts`) was fixed by orchestrator commit `03f2bac`; the catalog copy was not (`git log main..HEAD` on that path is empty). Fails `catalog:check` on **both** stacks → ACC-05.
- **Fix task**: apply the same treatment as `03f2bac` to the catalog spec; a `catalog/**` change requires an advisory (commit-msg hook).
- **Priority**: Blocker.

### Fix 3 (Major) — `docker build` with no build-arg cannot succeed

- **Root cause**: `apps/web-next/Dockerfile:24` declares `ARG NEXT_PUBLIC_API_URL` with no default, and `src/shared/config/env.ts:7` throws at module load during prerender. ACC-04's literal command therefore always fails.
- **Fix task**: `ARG NEXT_PUBLIC_API_URL=http://localhost:3000` (mirrors `.env.example`), or amend ACC-04 + `docs/dev/deploy.md.jinja` to require the build-arg. With the arg the image is correct: builds clean, `Config.User=nextjs`, `uid=100`.
- **Priority**: Major.

### Fix 4 (Major) — Next build output is committed and ships to children

- **Root cause**: `git ls-files apps/web-next/.next` = **237** tracked files (of 295 tracked under `apps/web-next`), including `.next/cache/turbopack/**/*.sst`, and `.gitignore` (1-68) has no `.next` entry. Consequences measured: any `next build` leaves 203 modified files in `git status`; the rendered next child carries `apps/web/.next/**`; `copier update` in a child requires a clean tree.
- **Fix task**: add `.next/` to `.gitignore` and `git rm -r --cached apps/web-next/.next`.
- **Priority**: Major.

### Fix 5 (Minor) — ACC-01/ACC-02 exclusion lists are incomplete for this feature's legitimate changes

- **Root cause**: the feature necessarily changes `packages/eslint-config/**`, `packages/typescript-config/**`, `pnpm-lock.yaml` and `apps/api/src/shared/kernel/access/access.guard.spec.ts`; none is in the ACs' exclusion list, so both criteria fail as written even though `apps/web/**` is byte-identical (diff exit 0) and the P1 story holds.
- **Fix task**: amend ACC-01/ACC-02 to exclude those paths (or state the intended child-visible change set) — no code change.
- **Priority**: Minor.

### Fix 6 (Minor) — DOC-03 spec-precision

- **Root cause**: spec asks for next-specific lines in the README/AGENTS command table; only `AGENTS.md.jinja:38` gained `(front on :3001)`.
- **Fix task**: either extend the conditional rows or tighten DOC-03's wording.
- **Priority**: Cosmetic.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ (`apps/web` → `apps/web-vite` is a pure rename; vite render byte-identical) |
| No scope creep | ⚠️ committed `.next` build output (Fix 4) |
| Matches patterns | ✅ Next shell mirrors the Vite shell module for module |
| Spec-anchored outcome check | ⚠️ 6/12 ACs met |
| Per-layer Coverage Expectation met | ✅ web-next 96.74/94.25/97.05/99.06; scripts 196 tests; RULE C spec extended |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed | ✅ `docs/code-quality.md`, `docs/test/testing.md`, `docs/front/front-arch.md` |

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 6/12 ACs matched the spec outcome; 1 spec-precision gap (DOC-03).
**Sensor**: 3/3 mutations killed.
**Gate**: 4/8 steps exit 0 (484 unit + 196 script tests, coverage ≥ 90); steps 5–8 exit 7.

**What works**: the copier mechanism (question, symlinked shells, `_exclude`, `_tasks` rename), the Next shell contract (layout, transport, env, route access, providers, pages, test helpers), coverage ≥ 90, the `--web-stack` flag and its tests, the CI matrix, all seven doc changes, and — decisively for the P1 story — a vite child's `apps/web/**` is byte-identical to `main`'s render and untouched by `copier update`.

**Issues found**: the RULE C spec fails inside every rendered child (Fix 1), the identity entry's spec fails lint under the bumped linter (Fix 2), the Next `docker build` needs a build-arg the AC does not pass (Fix 3), and `.next` build output is committed (Fix 4).

**Next steps**: route Fixes 1–4 to an implementer, then re-verify only those rows (ACC-02..05, ACC-10) and re-run steps 5–8 of the gate.

---

## Round 2 (re-verification, 2026-08-23)

**Fix commits verified**: `d74104c` untrack `.next` · `ba0f373` Dockerfile ARG default · `4a76540` RULE C resolver assertions · `0e08d3d` catalog identity `access-policy.spec` + advisory. HEAD = `0e08d3d` on `feat/web-stack-next`.

### Final gate — re-run in full, 8/8 exit 0

| # | Step | Exit | Detail |
| --- | --- | --- | --- |
| 1 | `pnpm check` | 0 | — |
| 2 | `pnpm test` | 0 | api 332, web-next 56 (19 files), web(vite) 68, eslint-config 28 |
| 3 | `pnpm test:scripts` | 0 | 196 |
| 4 | `pnpm --filter web-next test:cov` | 0 | S 96.74 / B 94.25 / F 97.05 / L 99.06 |
| 5 | `template:smoke --web-stack vite` | 0 | 4 checks (check, test, db:migrate, /health, RULE C) |
| 6 | `template:smoke --web-stack next` | 0 | idem |
| 7 | `catalog:check identity --web-stack next` | 0 | 1009 tests |
| 8 | `catalog:check --web-stack vite` | 0 | 1155 tests |

Logs: `scratchpad/verify/r2-gate-{1..8}.log`.

### Acceptance criteria — round 2

| AC | Round 1 | Round 2 | Evidence |
| --- | --- | --- | --- |
| ACC-01 | ❌ | ⚠️ accepted | spec-precision debt (exclusion list); `apps/web/**` byte-identical (diff exit 0, round 1) |
| ACC-02 | ❌ | ⚠️ accepted | same debt; `web_stack: vite` written, `apps/web/**` untouched by `copier update` |
| ACC-03 | ❌ | ✅ | gate 6 exit 0; probe: `next.config.ts` present, no `vite.config.ts`, package name `web` |
| ACC-04 | ❌ | ✅ | bare `docker build -f apps/web/Dockerfile .` → **exit 0**; `Config.User=nextjs`; `id` → `uid=100(nextjs) gid=101(nodejs)`. Fix at `apps/web-next/Dockerfile:24` `ARG NEXT_PUBLIC_API_URL=http://localhost:3000` |
| ACC-05 | ❌ | ✅ | gate 7 exit 0 (1009 tests); advisory `docs/advisories/ADV-20260823-01.md`, identity `module.json:4` → `1.0.1` |
| ACC-06 | ✅ | ✅ | probe on the fresh next child: `VITE_` 0, `@tanstack/react-router` 0, `nginx` 0 |
| ACC-07 | ✅ | ✅ | gate 4 |
| ACC-08..09, ACC-11..12 | ✅ | ✅ | unchanged (round-1 evidence) |
| ACC-10 | ❌ | ✅ | gates 5 and 6 both exit 0 |

**Status**: 10/12 ✅, 2 ⚠️ accepted spec-precision debt (ACC-01/ACC-02 exclusion list, DOC-03 command table), 0 ❌.

### Discrimination Sensor — round 2

| # | File:line | Mutation | Scoped gate | Killed? |
| --- | --- | --- | --- | --- |
| 1 | `apps/web-next/src/_app/layout/access-slot.tsx:17` | fail-open `authenticated` → `public` | `pnpm --filter web-next test` exit 1 — 1 failed / 55 passed, `access-slot.test.tsx:20:53` `expected { kind: 'public' } to deeply equal { kind: 'authenticated' }` | ✅ Killed |
| 2 | `scripts/platform/lib/web-shell.mjs:30` | dropped the `InvalidWebStackError` throw | `pnpm test:scripts` exit 1 — 2 failed / 194 passed, `web-shell.test.mjs:36` and `template-smoke.test.mjs:51` `Missing expected exception` | ✅ Killed |
| 3 | `apps/api/src/modules/module-boundaries.spec.ts:543` | `existsSync(dir)` → `existsSync(dir) \|\| dir.endsWith("/web")` | `pnpm --filter api test -- module-boundaries` exit 1 — 1 failed / 33 passed, `module-boundaries.spec.ts:633` received `+ ".../apps/web"` | ✅ Killed |

**Result**: 3/3 killed. The rewritten CAT-03 case (`:625-634`) still discriminates: it derives `existing` from `existsSync` independently of the resolver, so a resolver that invents a root fails `toEqual`.
All three restored with `git checkout --`; `git status --short` on the worktree is **empty**.

### Fix 4 — NOT fixed (still open)

`d74104c` added `.gitignore:13 .next` but never untracked the files: `git show --stat d74104c` = `.gitignore | 1 +, 1 file changed`. At HEAD, `git ls-files apps/web-next/.next` still returns **237** files (`apps/web-next/.next/BUILD_ID`, `app-path-routes-manifest.json`, `build-manifest.json`, …), and `git cat-file -p HEAD:apps/web-next` still lists a `.next` tree. Consequence re-measured this round: a freshly rendered `web_stack=next` child still ships `apps/web/.next/` (present in `ls -a` of the child). `.gitignore` does not affect already-tracked paths.

**Fix task**: `git rm -r --cached apps/web-next/.next` and commit (the `.gitignore` half is already in place). **Priority**: Major — build output shipped to every Next child; any `next build` re-dirties the tree.

### Round 2 summary

**Overall**: ✅ Ready on the spec — 10/12 ACs met, 2 accepted as spec-precision debt, sensor 3/3, gate 8/8 exit 0 — with **one open non-AC gap**: Fix 4 (`.next` still tracked).
