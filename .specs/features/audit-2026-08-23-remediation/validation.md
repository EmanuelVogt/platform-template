# Audit 2026-08-23 Remediation — Validation (PASS 1, `v2.4.0` scope)

**Date**: 2026-08-24
**Spec**: `.specs/features/audit-2026-08-23-remediation/spec.md`
**Diff range**: `92b4120..0422727` (main) — interleaved with `prettier-format-gate` and
`web-stack-next` commits; attribution below is by path and task, not by position.
**Verifier**: independent sub-agent (author ≠ verifier), opus tier, P0 depth
**Scope**: the 43 requirements named by `tasks.md` § *Task Breakdown — `v2.4.0`* (T1–T48).
The 8 `v3.0.0` requirements (BRAND-01, BRAND-02, TZ-01, SEAM-05, SEAM-06, IDENT-01..03) are
unstarted by design and were **not** judged — the release boundary is binding.

---

## Task Completion

T1–T48 all landed; waves 1–7 each closed on their own Build gate (Execution Log). Four tasks
carry deviations the author declared and this report adjudicates: **T16** (area-label placeholder
shipped as a `gh label list` discovery instruction, not a Jinja variable), **T43** (the
`SPEC_DEVIATION` exclusion of `docs/agents/harness.md` — confirmed **removed** at HEAD),
**T45** (`TOKEN_ALLOWLIST` exemption for `openapi-config.ts`, to be cleared by T49), and
**T46** (domain-noun scanning not wired end to end — adjudicated as a real gap, see Fix 1).
T9, T10, T12–T15 and T32 shipped as `Tests: none · Gate: build` although the spec's traceability
declares their proof as `test`; see Fix 3.

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| CLI-01 CLI runs in a child, never a module-resolution error | `discoverEntries` out of the `_exclude`d `lib/lint.mjs` | gate exit 0 + `scripts/platform/__tests__/smoke-runs-cli.test.mjs:128` — `assert.equal(code, EXIT_CODES.TEST_FAILURE)` on a reintroduced excluded import | ✅ PASS |
| CLI-02 guard fails on a `scripts/**` import of an `_exclude`d path | guard fails | `excluded-imports.test.mjs:40-46` — `assert.deepEqual(offenders, [{file:"scripts/platform/cli.mjs", specifier:"./lib/lint.mjs", …}])` | ✅ PASS |
| CLI-03 `template:smoke` executes the CLI inside the child | CLI runs with `cwd` = child | `smoke-runs-cli.test.mjs:63-80` — `assert.equal(statusCall.options.cwd, childDir)`; `pnpm template:smoke` exit 0 | ✅ PASS |
| RUN-01 exactly one API port across 10 sites | `3000` everywhere | `canonical-port.test.mjs:29-54` — per-site `assert.equal(value, canonical)`; `:65` — `assert.equal(extractPort(...), "3000")` | ✅ PASS (Dockerfile `HEALTHCHECK` site not separately asserted) |
| RUN-02 shipped `REDIS_URL` authenticates against the shipped Redis | credentials match | source only: `apps/api/.env.example:49` `REDIS_URL=redis://:redis@localhost:6379` vs `docker-compose.yml:34` `["redis-server","--requirepass","redis"]` — **no assertion ties them** | ⚠️ proof downgraded (Fix 3) |
| RUN-03 every documented first-run command exists | each resolves in a manifest | `documented-commands.test.mjs:44-61` — `assert.ok(resolved, …)` over README.md.jinja / .github/README.md / local-environment.md; `copier-questions.test.mjs:101` — `assert.ok(script in scripts, …)` for `_message_after_copy` | ✅ PASS |
| RUN-04 `format:check` completes without a plugin-load error | green at HEAD | satisfied-by-sibling (`prettier-format-gate`, `266d2fd`..`60a011a`); this feature's evidence = `pnpm check`/`format:check` exit 0 in the Final gate | ✅ PASS |
| RUN-05 fixture repair stays documented | changelog + skill state it | `fixture-repair-documented.test.mjs:13-23` — `assert.match(changelog, /Repair \`\.copier-answers\.yml\` by hand, once, before \`copier update\`/)` | ✅ PASS |
| BRAND-03 area-label list from a product-filled placeholder, closed-list rule intact, examples domain-neutral | placeholder + closed list | shipped shape `docs/agents/issue-tracker.md.jinja:33-37` (`gh label list` discovery, neutral examples); only guard = `docs-no-owner-infra.test.mjs:79` domain/infra scan. **Placeholder mechanism and closed-list rule unasserted** | ⚠️ partial (Fix 4) |
| BRAND-04 P0 taxonomy generic, points at the product's domain doc | no booking rules | `harness-taxonomy.test.mjs:22-48` — asserts "auth, payments, data integrity, …the product's own domain doc" present and `booking rules`/`availability` absent; `docs/agents/harness.md:129-130`. The wave-1 `SPEC_DEVIATION` exclusion is **gone** (`docs-no-owner-infra.test.mjs:75-84` lists `harness.md` plainly) | ✅ PASS |
| BRAND-05 infra/deploy docs carry platform-level facts only | no owner infra nouns | `docs-no-owner-infra.test.mjs:38-49` `OWNER_INFRA_TERMS` (AWS/EC2/Dokploy/Cloudflare/Resend/Traefik/Swarm/MySQL/`~/.local/bin`/us-east-2/sa-east-1) over `:76-84`, incl. `infra.md.jinja` + `deploy.md.jinja`; mutant M5 killed | ✅ PASS |
| BRAND-06 no legacy-MySQL backfill in docs, compose, entrypoint, env tables | absent everywhere | source clean (`docker-entrypoint.dev.sh`, `docker-compose.yml`, `local-environment.md` carry no `RUN_BACKFILL`/`SyncLegacyModule`/MySQL); guarded only for `docs`/`.claude`/`.github/workflows` via `/\bMySQL\b/i`. **Compose + entrypoint sites unscanned** | ⚠️ partial (Fix 3) |
| BRAND-07 boundary guard covers `test`, `openapi`, `docs`, `web/src/pages`; kernel harness holds kernel vocabulary | four roots scanned | `apps/api/src/modules/module-boundaries.spec.ts:577-586` `KERNEL_SURFACE`; assertions `:671-680`. `TOKEN_ALLOWLIST:598` exempts `openapi-config.ts` (declared `SPEC_DEVIATION`, T49 must clear) | ✅ PASS |
| BRAND-08 no workflow wired to an absent module | file not shipped | `copier-questions.test.mjs:130-140` — `assert.deepEqual(tracked(".github/workflows/feedback-triage.yml"), [])` and not in `_exclude` | ✅ PASS |
| CAT-01 every entry touched by `security-audit-remediation` carries a new version | all five bumped | gate exit 0 (`catalog:lint`, `catalog:check`); five `module.json` at `2.0.2`; `docs/advisories/ADV-20260822-0{1..5}.md:5` `affects: ">=1.0.0 <2.0.1"` | ✅ PASS |
| CAT-02 changed entry without a `module.json` bump fails lint and CI | lint red | `lib/lint.mjs:225` `lintEntryBump` wired at `catalog-lint.mjs:169`; 7 tests in `entry-bump-lint.test.mjs`; CI baseline `.github/workflows/ci.yml:124-125` `fetch-depth: 0`; mutant M3 killed | ✅ PASS |
| CAT-03 a child at `v2.0.0` is reported affected by ADV-20260822-01..05 | five advisories listed | `compute-pending-catalogref.test.mjs:123-147` — `assert.deepEqual(result.pending.map(a => a.id).sort(), [ADV-20260822-01..05])`; mutant M2 killed | ✅ PASS (no fixture pins the `#v2.0.0` boundary itself; the `<2.0.1` version half covers it) |
| CAT-04 advisory `detect`/`parity` paths are child-layout; `catalog/` rejected | lint rejects | `advisory-path-scope.test.mjs:27-34` — `assert.match(errors[0], /^detect referencia "catalog\/widget"/)` | ✅ PASS |
| CAT-05 a `catalog/<name>@x.y.z` tag exists per published entry version | tag present | probe (budget 1/3, already spent): `git tag -l 'catalog/*'` → **empty**. Owner hand-off point 2 (the owner tags after wave 7); the agent never tags (AD-006/AD-034) | ⚠️ owner-gated, not observable at HEAD |
| LOC-01 `product_locale` asked (default `pt-BR`) and threaded through the four language rules | all four files | `copier.yml:160-165`; `copier-questions.test.mjs:38-47` — `assert.equal(question.default, "pt-BR")`; `:52-59` — `assert.equal(question.choices, undefined)`. `AGENTS.md.jinja:58,81` threaded; `code-quality.md:12,47` + `communication.md:9` reference the canonical rule. **`docs/agents/issue-tracker.md.jinja:21` still hardcodes `**pt-BR**`** | ❌ FAIL (Fix 2) |
| LOC-02 the language convention stated in exactly one place, referenced from the others | one canonical home | `AGENTS.md` Tripwires → Language; `docs/code-quality.md:12,47` and `docs/agents/communication.md:9` link it. **No assertion** | ⚠️ proof downgraded (Fix 3) |
| LOC-03 `VITE_APP_NAME`/`VITE_LOCALE` drive title, `<html lang>`, `pageTitle()` | follow without a platform edit | `apps/web-vite/src/app/router/shell.test.tsx:37` — `expect(pageTitle()).toBe("Acme")`; `:42` — `expect(pageTitle("Início")).toBe("Início · Acme")`; `:96` — `expect(indexHtml).toContain('lang="%VITE_LOCALE%"')`; `:30-31` default preserved | ✅ PASS (Vite shell) |
| LOC-04 RFC 7807 title / Zod message from a `DEFAULT_LOCALE`-selected pack | pt-BR shipped as one pack | `apps/api/src/shared/kernel/i18n/message-pack.ts` + `message-pack.spec.ts`; `problem-details.filter.spec.ts` | ✅ PASS |
| LOC-05 one message table per entry; no entry hardcodes a timezone | per-entry table | `catalog/notification/api/application/catalog/notification-catalog.ts` + `.spec.ts`; `catalog/{identity/single-tenant,attachment,tag}/api/domain/errors.ts` + `.spec.ts` | ✅ PASS |
| LOC-06 `/favicon.ico` served from a shipped `apps/web/public/` | real asset, not SPA fallback | asset shipped `apps/web-vite/public/favicon.ico`, linked `apps/web-vite/index.html:6`. **No assertion**; `apps/web-next/public` holds only `.gitkeep` | ⚠️ partial (Fix 3, Fix 5) |
| SEAM-01 `rawBody: true` + product-owned `bootstrap.product.ts` before `listen` | no-op under `_skip_if_exists` | `apps/api/src/main.ts:45` `rawBody: true`; `apps/api/test/bootstrap-product.e2e-spec.ts:81-83` — `expect(order).toEqual(["mountDocs","bootstrapProduct"])`; `copier.yml:72` `_skip_if_exists` | ✅ PASS |
| SEAM-02 one-shot `setTenant`; second call throws | throws | `apps/api/src/shared/kernel/context/request-context.spec.ts:118-125` — `expect(() => { ctx.setTenant("t-2") }).toThrow(/tenantId já definido/)`; mutant M1 killed | ✅ PASS |
| SEAM-03 installing identity edits no `shell.tsx`/`main.tsx`/`app-providers.tsx` | no platform edit | mechanism asserted `apps/web-vite/src/app/router/shell.test.tsx:51-63` (`registerAppGuard` overrides `beforeLoad`); the "no edit required" claim itself is **prose** (`catalog/identity/single-tenant/README.md:315,375`) | ⚠️ partial (Fix 4) |
| SEAM-04 a product route joins last-location and post-login redirect without editing `routes.ts` | registration seam | `apps/web-vite/src/shared/config/routes.ts:54` `registerProtectedRoute`; `routes.test.ts:54-58`; `shared/lib/last-location.test.ts:31-35` | ✅ PASS (Vite shell; Fix 5) |
| SEAM-07 ownership table lists every product edit point, `main.ts` as platform | row present | `docs/dev/template.md:13` — `\| API boot entrypoint \| platform \| \`apps/api/src/main.ts\` \|`. **No assertion** | ⚠️ proof downgraded (Fix 3) |
| TOOL-01 entry point runs from a path containing a space | main body executes | `is-main.test.mjs:82-83` — `assert.equal(result.status, 0)` / `assert.equal(result.stdout, "ran\n")`; `:59` — `assert.deepEqual(offenders, [])` (no 9th raw comparison) | ✅ PASS |
| TOOL-02 lock paths relative to the child root | relative path | `lock-paths.test.mjs:42-45` — `assert.equal(nextLock.modules.alpha.files[0].path, "apps/api/src/modules/alpha/alpha.module.ts")` | ✅ PASS |
| TOOL-03 describe-style `_commit` resolves the base tag | parses through `parseInstalledVersion` | `template-version.test.mjs:353-357` — `assert.equal(readTemplateVersion(cwd), "2.2.1")` for `_commit: v2.2.1-4-gabc1234` | ✅ PASS |
| TOOL-04 `--rollback` with an unreachable catalog preserves the registry, exits non-zero | registry intact | `rollback.test.mjs:98` — `assert.equal(exitCode, EXIT_CODES.CATALOG_UNREACHABLE)`; `:107-110` — `assert.match(platformModules, /AlphaModule/)` | ✅ PASS |
| TOOL-05 `--rollback` unwinds a failed `--with-deps`, or refuses with `git` guidance | unwind or refuse | `rollback.test.mjs:139-153` — `assert.equal(lock.modules.alpha, undefined)` (whole chain unwound); `:155-182` — `assert.equal(exitCode, EXIT_CODES.DESTINATION_EXISTS)` + `assert.match(stderr, /git checkout/)` | ✅ PASS |
| TOOL-06 `advisory detect` failure gets a distinct code, never "not affected" | distinct exit code | `advisory-exit-codes.test.mjs:82-83` and `:97-98` — `assert.equal(exitCode, EXIT_CODES.ADVISORY_DETECT_FAILED)` + `assert.notEqual(exitCode, EXIT_CODES.OK)`; `:114-117` `;`-chains; `:131-136` quoting; mutant M4 killed | ✅ PASS |
| TOOL-07 a hook or handbook names only files that ship | referenced file exists | `hook-references.test.mjs:63-73` walks `.claude/hooks/**`; `contract-enum.mjs` and `edit-reminders.mjs` verified clean. **No handbook (`docs/`) reference walk** | ⚠️ partial (Fix 4) |
| TOOL-08 `pending-advisories` silent with nothing to adopt | empty stdout | `pending-advisories.test.mjs:141-142`, `:152-153`, `:180-181` — `assert.equal(result.stdout, "")` (template repo, fresh child, empty advisories) | ✅ PASS |
| TOOL-09 `workflow.md`/`deploy.md.jinja` match the real pipeline, name no Jest construct | no Jest construct | source correct: `docs/agents/workflow.md:108-109` names Vitest `include` at `apps/api/vitest.config.mts:20`, no `testRegex`. **No assertion** | ⚠️ proof downgraded (Fix 3) |
| TOOL-10 four sources state macOS / Linux / WSL2, native Windows unsupported | all four | source correct: `README.md.jinja:34`, `TEMPLATE.md:19`, `docs/dev/local-environment.md:9,11`, `copier.yml:112`. **No assertion** | ⚠️ proof downgraded (Fix 3) |
| TOOL-11 CI regenerates the contract, fails on drift, survives `module add` | check survives | `.github/workflows/ci.yml:71` `- run: pnpm contract:check` (job `quality`, no template-only `if`); `contract-check-ci.test.mjs:35-43` asserts exactly one job runs it | ✅ PASS |
| TOOL-12 503 + `Retry-After` for **both** pg timeout messages; spec latency-independent | both messages | `problem-details.filter.spec.ts:189-192` — `expect(r.status).toBe(503)` + `expect(r.headers["Retry-After"]).toBe("1")`. Only **one** pg literal exists (`application-pool.ts:19`); `tasks.md:718` declares TOOL-12 "half-refuted" and T31 keeps the 500-not-503 exclusion deliberately. `application-pool.int-spec.ts:305-317` still awaits a real `connectionTimeoutMillis: 2000` | ⚠️ declared half-refuted (Fix 6) |
| TOOL-13 `copier update` runs `pnpm install`/`skills:sync` at most once, real project only | exactly once | `copier-questions.test.mjs:78-96` — `assert.match(task.when, /_copier_operation\s*==\s*'copy'/)`; `child-lockfile.test.mjs:25-31` — `assert.equal(installs.length, 1)` | ✅ PASS |

**Status**: 30/43 fully covered · 1 failed (LOC-01) · 12 flagged (11 proof/coverage gaps + CAT-05
owner-gated). Plus one **success-criterion** failure proven by the sensor, see Fix 1.

---

## Discrimination Sensor

**Sensor depth**: P0-full (6 mutations, ≥5 required)

| # | File:line | Mutation | Scoped gate | Killed? |
| --- | --- | --- | --- | --- |
| 1 | `apps/api/src/shared/kernel/context/request-context.ts:77` | One-shot guard flipped `store.tenantId !== null` → `=== undefined` (second `setTenant` no longer throws) | `pnpm vitest run --project api …/request-context.spec.ts` → exit 1, 1 failed / 18 passed | ✅ Killed |
| 2 | `scripts/platform/lib/advisories.mjs:106` | `matchesCatalogRef` forced to `false` (drops the CAT-03 catalogRef fallback) | `node --test …/compute-pending-catalogref.test.mjs` → exit 1, 1 fail / 5 | ✅ Killed |
| 3 | `scripts/platform/release-preflight.mjs:83` | Bump rule inverted `currentVersion === previousVersion` → `!==` | `node --test …/entry-bump-lint.test.mjs` → exit 1, 2 fail / 7 | ✅ Killed |
| 4 | `scripts/platform/lib/commands/advisory.mjs:65` | Detect-failed return changed `ADVISORY_DETECT_FAILED` → `OK` ("not affected") | `node --test …/advisory-exit-codes.test.mjs` → exit 1, 2 fail / 6 | ✅ Killed |
| 5 | `.github/workflows/ci.yml` (seeded) | Reintroduced owner infrastructure: `# Deploy runs through Dokploy on the owner AWS EC2 VM.` | `node --test …/brand-hygiene.test.mjs` → exit 1, `.github/workflows/ci.yml carrega um substantivo de infra do dono` | ✅ Killed |
| 6 | `.github/workflows/ci.yml` (seeded) | Reintroduced **pilot-domain vocabulary**: `# Fluxo de Hospedes e Reservas: agendamento de quartos para os guests.` | `node --test …/brand-hygiene.test.mjs` → **exit 0, 8/8 passed** | ❌ **Survived** → Fix 1 |

Every mutation was injected once, run once, restored with `git checkout -- <file>`, and
`git status --short -- <file>` confirmed empty before the next. No `stash`, branch or worktree.

**Result**: 5/6 killed — ❌ FAIL

---

## Edge Cases

- [x] Lock reads `identity 2.0.0` with a pre-remediation `catalogRef` → treated as affected
      (`compute-pending-catalogref.test.mjs:37-56`; the `#v2.0.0` boundary itself is covered by the
      `affects: <2.0.1` version half, not by a dedicated fixture)
- [x] `product_locale` absent from an existing child → `pt-BR` default changes no shipped string:
      `AGENTS.md.jinja:58,81` went from the literal `pt-BR` to `{{ product_locale }}`, which renders
      byte-identical at the default; asserted at `copier-questions.test.mjs:38-47` with exactly that
      AD-034 rationale
- [x] Rendered child with zero modules → session hook silent (`pending-advisories.test.mjs:141-142`)
- [x] `rg` absent → distinguishable from "advisory not found" (`advisory-exit-codes.test.mjs:82-83`)
- [x] `catalog:lint` on an entry whose only change is its `CHANGELOG.md` — behaviour is the
      opposite: wave 4 Finding 1 showed a CHANGELOG-only edit **does** move the entry and fires
      `entryChangedWithoutBump`; the owner chose to bump rather than weaken the rule. The spec's
      edge case is therefore **contradicted by the shipped design**, deliberately and on record

---

## Gate Check

- **Gate command**: `pnpm check && pnpm test && pnpm test:scripts && pnpm test:coverage &&
  pnpm catalog:lint && pnpm catalog:typecheck && pnpm template:smoke` (plus `pnpm catalog:check`)
- **Result**: 8/8 steps **exit 0**. `pnpm test` 620 tests / 90 files · `pnpm test:scripts` 561/561 ·
  `pnpm test:coverage` 760 tests / 105 files, v8 statements 96.51 / branches 94.42 / functions 94.93 /
  lines 96.81 — all above the 90 floor, no threshold violation
- **Test count before feature**: 930 (585/89 + 345/34 at `92b4120`)
- **Test count after feature**: 1181 (620 + 561) — **delta +251**, no drop
- **Skipped tests**: none reported
- **Failures**: none

**Working-tree caveat.** The gate ran on a checkout carrying a concurrent session's uncommitted
changes (`AGENTS.md.jinja`, `README.md.jinja`, staged `.specs/features/done/**` renames, two
untracked `handoff-archive.md`). Those files are **not** this feature's and were neither reverted
nor staged. All 8 steps were green regardless, and **none of the findings below is attributable to
them** — every finding was derived from `git show 0422727:<path>` or from a file the concurrent
session does not touch.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ (the `v3.0.0` boundary held — T49–T79 untouched) |
| Matches patterns | ✅ |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ 11 requirements proved by gate/inspection where the spec declared `test` |
| Per-layer Coverage Expectation met | ✅ |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| Documented guidelines followed | ✅ `docs/test/testing.md`, `docs/code-quality.md`, `AGENTS.md.jinja` |

---

## Fix Plans

### Fix 1: the hygiene gate does not scan pilot-domain vocabulary end to end — **Blocker**

- **Root cause**: `scripts/platform/__tests__/brand-hygiene.test.mjs` defines `OWNER_DOMAIN_TERMS`
  (`:27-35`) and `domainHits` (`:75-86`), but the end-to-end test (`:183-198`) calls only
  `brandHits` and `infraHits`. A rendered child carrying `Hospedes`, `Reservas`, `agendamento`,
  `quartos`, `guests` passes the gate — proven by surviving mutant 6.
  `docs-no-owner-infra.test.mjs:85-92` does scan domain nouns, but only over 7 named template
  docs — not the rendered child, not `.claude/**`, not `.github/workflows/**`.
- **Why it is a gap and not the declared deviation**: wave 6 deviation 3 asked the Verifier to rule
  whether the AC demands domain coverage end to end. It does — spec § *Success Criteria*: "the
  brand/domain hygiene gate fails on a seeded reintroduction of the owner's brand, **pilot domain**
  or infrastructure"; and the P1-brand *Independent Test*: "greps the rendered child for the
  owner's brand, **pilot-domain vocabulary** and infrastructure nouns and fails on any hit".
- **Fix task**: add `withoutKnownExceptions(domainHits(text), rel)` to the end-to-end loop; the
  known blocker is `.claude/hooks/specs-in-english.mjs`, whose illustrative comment quotes domain
  nouns in Portuguese — either reword it or add a scoped `KNOWN_EXCEPTIONS` entry.

### Fix 2: LOC-01 — `issue-tracker.md.jinja` still hardcodes the locale — **Blocker**

- **Root cause**: `docs/agents/issue-tracker.md.jinja:21` reads "Issue titles and bodies are in
  **pt-BR** (same language rule as [`communication.md`](communication.md))". LOC-01 names this file
  as one of the four the locale must thread through, and it is a `.jinja` file, so it can
  interpolate. A `product_locale=en` child is told to file issues in pt-BR.
- **Fix task**: replace the literal with `{{ product_locale }}`, or point the sentence at the
  canonical statement the way `code-quality.md:12,47` and `communication.md:9` already do; add the
  assertion LOC-01 lacks.

### Fix 3: seven requirements shipped with the proof the spec declared downgraded — **Major**

- **Root cause**: the spec's traceability declares `test` for RUN-02, LOC-02, LOC-06, SEAM-07,
  TOOL-09, TOOL-10 and (partly) BRAND-06; `tasks.md` gave T7, T9, T10, T14, T15, T24, T32 and T38
  `Tests: none · Gate: build`. Each outcome is correct on disk today (verified by inspection, cited
  in the AC table) but nothing fails if it regresses.
- **Fix task**: one guard assertion per requirement — the Redis credential match, the
  single-language-home reference set, the favicon route, the `main.ts` ownership row, the
  workflow/deploy doc-vs-pipeline cross-check, the four-source platform matrix, and the compose /
  `docker-entrypoint.dev.sh` half of the backfill scan.

### Fix 4: three ACs half-guarded — **Minor**

- **BRAND-03**: the `gh label list` discovery placeholder satisfies the AC's shipped shape (wave-1
  deviation 1 adjudicated), but nothing asserts the placeholder mechanism or the closed-list rule.
- **SEAM-03**: `registerAppGuard` is tested; the "no edit to `shell.tsx`/`main.tsx`/
  `app-providers.tsx`" claim lives only in `catalog/identity/single-tenant/README.md:315,375`.
- **TOOL-07**: `hook-references.test.mjs` walks hooks only; the AC also says "or handbook".

### Fix 5: this feature's web seams exist only in the Vite shell — **Major, cross-feature**

- **Root cause**: `copier.yml:154-158` `web_stack` (default `vite`, choices `[vite, next]`) landed
  from the sibling `web-stack-next` while T23–T27 built the seams in `apps/web-vite`.
  `apps/web-next` has no favicon (`public/.gitkeep` only), no `product-routes.tsx`, no
  `registerProtectedRoute`, and no `VITE_APP_NAME`/`VITE_LOCALE` equivalent
  (`apps/web-next/src/shared/config/routes.ts:6` tells the product to edit `routes.ts` directly).
- **Impact**: a `web_stack=next` child does not get LOC-03, LOC-06 or SEAM-04. The default path is
  unaffected. Ownership sits on the boundary between the two features — route it deliberately.

### Fix 6: TOOL-12 — **Minor, informational**

- `tasks.md:718` declares TOOL-12 "half-refuted" and T31 Done-when 2 keeps the documented
  500-not-503 exclusion deliberately, so only one pg literal is matched where the AC says both. The
  latency half is mitigated by a 2000 ms margin (`application-pool.int-spec.ts:305-317`), not
  eliminated. Recorded so the `v3.0.0` pass does not re-litigate it as new.

---

## Summary

**Overall**: ❌ Not Ready — two blockers before the `v2.4.0` tag

**Spec-anchored check**: 30/43 covered · 1 failed · 12 flagged (11 proof/coverage, 1 owner-gated)
**Sensor**: 5/6 killed — mutation 6 survived
**Gate**: 8/8 steps exit 0, 1181 tests, +251, coverage above the 90 floor

**What works**: the whole platform-scripts surface (CLI-01..03, TOOL-01..06, TOOL-08, TOOL-11,
TOOL-13) is tightly asserted and discriminates — four of four code mutations died on their scoped
gates. The catalog version/advisory machinery (CAT-01..04) is the strongest area in the feature.
The kernel seams (SEAM-01, SEAM-02, SEAM-04) carry real value assertions, not spy counts. BRAND-04
closed its own wave-1 `SPEC_DEVIATION`, and the hygiene gate genuinely catches owner infrastructure
in a rendered child.

**Issues found**: the hygiene gate is blind to the pilot-domain half it was built to catch (Fix 1);
`issue-tracker.md.jinja` still ships a hardcoded locale (Fix 2); seven requirements have no
regression assertion (Fix 3); the web seams do not reach a `web_stack=next` child (Fix 5).

**Next steps**: Fixes 1 and 2 before the tag — both are small and both are proven, not suspected.
Fix 3 and Fix 5 should be tasks before pass 2. CAT-05 stays open until owner hand-off point 2.
