# Validation — v1 kernel-only template + copyable module catalog

**Feature**: `v1-kernel-only-module-catalog`
**Checkout**: `/home/emanuel/Projects/platform-template/.worktrees/v1-kernel-only-module-catalog`
**Branch / HEAD**: `feat/v1-kernel-only-module-catalog` @ `47fa6a8` — tree clean before and after
**Diff range**: `main (be3f461)..47fa6a8` — 119 commits, 1122 files, +17153 / −22066
**Verifier**: independent sub-agent (author ≠ verifier), fresh context, no worker in flight
**Verdict**: ❌ **FAIL** — 2 blocking gaps, 1 surviving mutant

---

## Method note — the spec declares no `Proof` column

`spec.md` § Requirement Traceability has columns `Requirement ID | Story | Phase | Status` only; no
per-AC `Proof` (`test` | `gate` | `probe`). The proof kind was therefore re-derived from
`tasks.md` § Test Coverage Matrix:

| Layer | Declared proof |
| --- | --- |
| Kernel API / boundaries / web kernel | unit test |
| Kernel wiring | integration |
| Catalog entries (`catalog/**`) | `catalog:lint` + `catalog:check` (gate) |
| Tooling (`scripts/platform/**`, `.claude/hooks/**`) | `pnpm test:scripts` (`node --test`) |
| Docs / config / copier / lefthook | **"none — build gate only"** |

⚠️ **Spec-precision gap (feature-wide)**: for the doc requirements the matrix declares *no* proof,
so HBK-02/03/04 were verified by direct inspection with `file:line`, not by a declared probe.
Future features should carry the `Proof` column so the verifier does not have to infer it.

---

## Gate Check

**Final gate** (`tasks.md` § Gate Check Commands), run once, per package, through the runner.

| Command | Exit | Counts |
| --- | --- | --- |
| `pnpm --filter api typecheck` | 0 | — |
| `pnpm --filter api lint` | 0 | — |
| `pnpm --filter api test` | 0 | **45 suites / 316 tests passed** |
| `pnpm --filter web typecheck` | 0 | — |
| `pnpm --filter web lint` | 0 | — |
| `pnpm --filter web test` | 0 | **24 files / 68 tests passed** |
| `pnpm test:scripts` | 0 | **166 tests, 166 pass, 0 fail** |
| `pnpm catalog:lint` | 0 | — |
| `pnpm catalog:typecheck` | 0 | 0 errors |
| `pnpm --filter api run db:check:journal` | 0 | journal ok |
| `pnpm --filter api test:int` | 0 | **8 suites / 105 tests passed** |
| `pnpm --filter api test:e2e` | 0 | **3 suites / 8 tests passed** |
| `pnpm catalog:check` | **0** | child api **167 suites / 1139 tests**, web 83; per entry: notification 26/94, identity 69/585, tag 4/10, audit 5/39, attachment 19/97 |
| `pnpm template:smoke` | **9** ❌ | **FAILS** — see Fix 1 |

- Logs: `/tmp/claude-1000/catalog-check-logs/catalog-check-verify.log` (catalog:check),
  `/tmp/claude-1000/catalog-check-logs/final-gate-verify.log` (all others).
- `catalog:check` reproduces the orchestrator's round 13 exactly (exit 0, 167/167, 1139/1139).
  This closes carry-forward **note 50** — the entry test surface now demonstrably executes.
- `template:smoke` **had never been run for real** before this validation. It was run once here.

### Test-count delta

| | main | branch |
| --- | --- | --- |
| `*.spec.ts` files | 154 | 169 |
| all `*.{test,spec}.{ts,tsx,mjs}` files | 188 | 212 |
| of which under `catalog/` | 0 | 126 |

The template's own suite drops (v0.2 1052 api unit tests → 316) because the five modules left
`apps/api/src/modules/**` for `catalog/**`. They are not lost: the rendered child runs **1139**.
**No regression** — net +24 test files, +87 executed assertions versus the v0.2 template.

---

## Spec-Anchored Acceptance Criteria

Evidence-or-zero. All `file:line` are in the worktree at `47fa6a8`.

### P1 — Kernel-only child boots green (KRN-01, KRN-02)

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| AC1 no module dir under `apps/api/src/modules/`, no product slice on web | empty module tree | `apps/api/src/modules/template-kernel-only.spec.ts:13-18,20-28` — asserts no production folder/file under `src/modules` | ✅ |
| AC2 child `pnpm install && pnpm check && pnpm test` green, zero skipped | all gates pass | `template:smoke` check 1/4 passed before the run aborted (`final-gate-verify.log`); `catalog:check` child `pnpm check` 3/3 | ✅ |
| AC3 `db:migrate` yields only `_kernel` (+`drizzle`) | exactly those schemas | `scripts/template-smoke.mjs:10` `EXPECTED_SCHEMAS` + `:133-163` `checkMigrateAndSchema` — **assertion exists and FAILS**: `encontrados [_kernel, drizzle, public], esperado [_kernel, drizzle]` | ❌ |
| AC4 `GET /health` 200 | 200 `{status:"ok"}` | `apps/api/test/health.e2e-spec.ts:58-62` — `.get("/health").expect(200, { status: "ok" })` | ✅ |
| AC4 openapi export = kernel routes only | no `/auth`,`/users`,`/attachments`,`/notifications`,`/tags` | `apps/api/test/openapi-contract.e2e-spec.ts:25` `expect(operations).toMatchSnapshot()` + `apps/api/test/__snapshots__/openapi-contract.e2e-spec.ts.snap:4-7` = `["GET /health :: liveness","GET /ready :: readiness"]` | ✅ |
| AC5 forbidden vocabulary = 0 hits over api `shared/**`, web `app/**`, web `shared/**` | zero | `apps/api/src/modules/module-boundaries.spec.ts:588` (describe), `:600-607` `expect(offenders.sort()).toEqual([])`, surface `KERNEL_SURFACE:537-543`, `FORBIDDEN_TOKENS:518-535` (16 tokens) | ✅ |

**Kernel-only invariants explicitly re-checked** (payload request):

- `apps/api/src/shared/**` contains **zero** imports of `modules/**` — grep empty.
- **No kernel file carries a module-path allowlist.** `CROSS_MODULE_ALLOWLIST` and
  `SAME_MODULE_ALLOWLIST` live in the *spec* file (`module-boundaries.spec.ts:25,28`) and are
  both `new Set<string>([])`.
- `module-boundaries.spec.ts:25` is deliberately outside RULE C's scan surface (note 25) so its
  own token list does not self-flag. Confirmed correct.

⚠️ **Spec-precision gap (AC3)**: a fresh PostgreSQL database always carries `public`. The spec's
"only schema `_kernel` (and `drizzle`) SHALL exist" is unsatisfiable as written; the AC should say
"no schema beyond `_kernel`, `drizzle` and the server's own `public`".

### P1 — Kernel exposes ports instead of identity (KRN-03..KRN-07)

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| AC1 no policy registered → RFC 7807 403 `access-policy-missing` (fail closed) | 403 + that `type` | `apps/api/src/shared/kernel/access/access.guard.spec.ts:96-100` — `rejects.toBeInstanceOf(AccessPolicyMissingError)` + `rejects.toMatchObject({ status: 403, type: "https://errors.example.com/access-policy-missing" })` | ✅ |
| AC2 policy registered → delegate `can(actor, requirement)`; 403 on false, allow on true | both branches | `access.guard.spec.ts:120-126` `resolves.toBe(true)`; `:128-135` `ForbiddenError` + `status: 403`; `:152-155` `expect(policy.can).toHaveBeenCalledWith(actor, { kind: "permission", key: "admin.users.read" })` | ✅ |
| AC3 `RequestContext.actor` null outside a request; `{id, kind, tenantId?}` when set | exact shape | `request-context.spec.ts:35` `expect(new RequestContext().getActor()).toBeNull()`; `:48` `toEqual({ id:"a-2", kind:"service" })`; `:62` `toEqual({ id:"a-1", kind:"user", tenantId:"t-1" })` | ✅ |
| AC3 outbox/idempotency/audit hooks record `actorId` | `actorId` persisted | idempotency only, and inside a composite key: `idempotency.interceptor.spec.ts:73` `expect(reserved[0]?.scope).toBe("t-1:a-1")`. **Outbox: ZERO** — neither `outbox.table.ts` nor `idempotency.table.ts` has an `actorId`/`userId` column | ⚠️ |
| AC4 `resolveAccess` → `"anon"`/`"forbidden"`/`"allow"`, pure, entry-owned; template web ships no guard | three outcomes | `catalog/identity/single-tenant/web/core/resolve-access.test.ts:16` anon, `:38` forbidden (`kind:"permission", key:"admin.users.delete"`), `:8` allow; real data exercised at `route-access.test.ts:15-22`; kernel side is type-only (`apps/web/src/shared/config/route-access.types.ts:8-11`, `apps/web/src/app/router/access.d.ts:3-6`) | ✅ |
| AC5 RULE A holds, RULE B gone | RULE A green, RULE B absent | RULE A `module-boundaries.spec.ts:454` (describe), `:474-480` `expect(offenders.sort()).toEqual([])`; RULE B / `BASE_SET` **absent from the file** | ✅ |
| P3 tenant seam: `tenantId` stored and propagated unchanged | opaque passthrough | `job-context.spec.ts:26-27` `expect(store.tenantId).toBe("t-1")` + actor carries it; `:36-39` propagation to the dispatcher intact | ✅ |

⚠️ **Spec-precision gap (AC3, outbox clause)**: carry-forward note 63 records that design § 2.2's
`user_id → actor_id` column rename was fiction — the column never existed. The design was
corrected on main (`2cfd1d5`); **`spec.md` AC3 was not**. As written, the outbox half of AC3 is
uncovered. Either drop the outbox from the AC or add the column and an assertion.

### P1 — Catalog entries exist and are self-verifying (CAT-01..CAT-05, HBK-01)

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| AC1 ≥5 entries, each with manifest + mandatory files | identity/single-tenant, audit, attachment, notification, tag | all five present with `module.json`, `README.md`, `CHANGELOG.md`, `api/**`, `migrations/**`, `parity/**`; manifests at `catalog/identity/single-tenant/module.json:2-8`, `catalog/attachment/module.json:2-6`, `catalog/audit/module.json:2-6`, `catalog/notification/module.json:2-6`, `catalog/tag/module.json:2-6` | ✅ |
| AC1 manifest key `files` | `module.json.files` | **does not exist** — schema is `additionalProperties:false` without it (note 37); the catalog is convention-over-config | ⚠️ |
| AC2 catalog CI job per entry (matrix) | one CI job per entry | **ZERO** — no `.github/` directory, no workflow file, no `matrix` key in any YAML, `git ls-files \| grep -i github` empty | ❌ |
| AC3 README lint enforces the contract sections | 8 mandatory headings | `docs/catalog/README-contract.md:13-20` is the source of truth, parsed by `scripts/platform/lib/lint.mjs:30-37` `extractContractHeadings`, called at `scripts/platform/catalog-lint.mjs:90`; missing-section test `scripts/platform/__tests__/lint.test.mjs:64-69`; real-contract read `:54-56` | ✅ |
| AC4 identity parity equals v0.2 (login, sessions, CSRF, permissions guard, profiles) | profiles master/admin/professional | `catalog/identity/single-tenant/parity/profiles.parity.spec.ts:7` — `expect([...accessProfile.enumValues]).toEqual(["master","admin","professional"])`; 5 parity specs (access-policy, csrf, route-access, profiles, contract), all green inside the child (identity 585/585 in `catalog:check`) | ✅ |
| CAT-03 `dependsOn` declared per entry | matches the real edge set | declared: identity→notification, attachment→identity, audit→identity, tag→identity, notification→∅. **Diverges from `spec.md` § Cross-module dependencies** (identity→attachment, audit→attachment) — superseded by AD-025/AD-026 (notes 51, 56, T22l `b16e1ec`); the spec was never updated | ⚠️ |
| CAT-05 catalog excluded from copier | `catalog/` not rendered | `copier.yml:21` — `- catalog/` under `_exclude` (`.specs` at `:20`) | ✅ |
| CTR-01 parity compares by operation, dereferences `$ref`, compares field types | type change caught | `apps/api/src/shared/test/parity/contract-snapshot.ts:165` `expectContractSubset`; `$ref` resolution `:63-79` `resolveSchema`; type comparison `:104` `if (pinned.type !== undefined && pinned.type !== actual.type)` | ✅ |
| WEB-01 entry web part shipped + registered | `web/core` pure TS, optional `web/react` | identity only: `catalog/identity/single-tenant/module.json:206` `"web": { "defaultRoot": "apps/web/src/entities/identity", "react": true }`; `web/core` 8 files (3 `.test.ts`), `web/react` 2 files. attachment/audit/notification/tag ship no web part (allowed by GA-3) | ✅ |

**`tag.dependsOn` omits `audit` — reviewed and APPROVED.** `catalog/tag/module.json:6` declares
only `identity`; `catalog/tag/README.md:47-51` documents the coupling as install-order-optional and
`migrations/custom/01_audit_attach_tags.sql` guards on `pg_proc`/`pg_namespace` before calling
`audit.attach`, so tag installs cleanly in a child without audit. `README.md:86-91` confirms no TS
import of audit. Consistent with note 19 (no entry declares `dependsOn: audit`). Declaring it would
force audit into every child that wants tags — the omission is correct.

### P1 — `platform module add` installs an entry (TLG-01..TLG-08, MIG-02)

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| AC1 files copied to manifest paths | copy happens | `scripts/platform/__tests__/apply.test.mjs:22` — `assert.equal(readFileSync(destFile,"utf8"), "export class AlphaModule {}\n")` | ✅ |
| AC1 migrations appended, indices continue from the child's last journal entry, `when` greater than the last applied | monotonic renumber | **ZERO at unit level** — no test reads `_journal.json` after `module add`; `migrations.test.mjs:48-49` covers source-side generation only (`assert.deepEqual(generated, ["0002_alpha_baseline.sql"])`). Covered end-to-end by `catalog:check` (5 entries installed, child gate green) | ⚠️ gate-only |
| AC1 `app.module.ts` registration | import line emitted | `apply.test.mjs:80-81` — `assert.match(firstModules, /import { IdentityModule } from ".\/modules\/identity\/identity.module"/)` | ✅ |
| AC1 `db/schema.ts` registration | re-export emitted | `apply.test.mjs:82` — `assert.match(firstSchema, /export \* from "..\/modules\/identity\/infrastructure\/tables\/users.table"/)` | ✅ |
| AC1 **web routes registry** registration | registry line emitted | **ZERO** — no test references a web routes registry | ❌ |
| AC1 `.platform-modules.lock` gains `{name,variant,version,catalogRef,files[]}` | lock shape | `apply.test.mjs:169-170` — `assert.equal(nextLock.modules.alpha.files[0].path, filePath)` + `assert.match(...sha256, /^[0-9a-f]{64}$/)`; `cli.test.mjs:80-81` — `assert.equal(lock.modules.alpha.version, "1.0.0")` | ✅ |
| AC2 missing `dependsOn` → fail with the list, nothing on disk; `--with-deps` installs in order | both branches | `cli.test.mjs:142-144` — `assert.match(output, /alpha@\^1\.0\.0/)` + `assert.equal(existsSync(...lock), false)`; order `:177` — `assert.ok(alphaIdx < betaIdx)` | ✅ |
| AC3 reinstall → non-zero + `already installed <name>@<version>`, no change | exact message | `cli.test.mjs:130-131` — `assert.equal(exitCode, EXIT_CODES.ALREADY_INSTALLED)` + `assert.match(output, /already installed alpha@1\.0\.0/)` | ✅ |
| AC4 runs unit tests **+ parity suite** scoped to copied files; failure leaves files, exits non-zero | both suites | `cli.test.mjs:212-215` — `assert.equal(exitCode, EXIT_CODES.TEST_FAILURE)`, files present, lock kept. **Parity is not distinguished from unit** — the test asserts a generic `modules/alpha` scope (`:228`) | ⚠️ |
| AC5 `kernelRange` unsatisfied → refuse **with the required range** | range printed | `cli.test.mjs:238-239` — exit `KERNEL_RANGE_UNSATISFIED`, no lock written. **The message is never captured or asserted**, so "with the required range" is unproven | ⚠️ |
| AC6 `--dry-run` prints file list, migration renumbering and registrations; writes nothing | all three printed | `cli.test.mjs:267-268` — `assert.equal(calls.length, 0)` + `assert.match(output, /alpha\.module\.ts/)`. **Renumbering and registrations in the dry-run output: ZERO** | ⚠️ |
| Edge `--force` / `--rollback` / `adopt` | each behaves | `--force` `cli.test.mjs:198-201`; `--rollback` `:282-283` + `apply.test.mjs:210-213`; `adopt` `:295-296` | ✅ |
| TLG-08 `module.json.env[]` appended without overwriting | idempotent, never clobbers | `apply.test.mjs:36-38` — `assert.equal(afterFirst, afterSecond)` + `assert.match(afterFirst, /IDENTITY_SESSION_TTL_SECONDS=86400\n/)`; `:54-56` — existing `=999` preserved, `doesNotMatch(/=86400/)`; `cli.test.mjs:97-98` writes to `apps/api/.env` | ✅ |
| ADV-05 `detect` non-zero when affected, zero when not | both exits | `cli.test.mjs:340` `assert.equal(exitCode, 1)` + `:343-344` `assert.equal(calls[0].command, "meu-detector")`; clean case `:372` `EXIT_CODES.OK` | ✅ |

Tooling suite: 16 files, 2627 lines, all run by `package.json:28` —
`"test:scripts": "node --test scripts/platform/__tests__/*.test.mjs"`.

### P1 — Advisories channel (ADV-01..ADV-04)

| Criterion | Spec outcome | Evidence | Result |
| --- | --- | --- | --- |
| AC1 frontmatter schema `id,kind,module,affects,severity,detect,fix,parity`, validated by a unit test **over the folder** | schema-invalid file fails the template suite | Parser: `scripts/platform/lib/frontmatter.mjs:5` `REQUIRED_FIELDS=[...]`, `:35-41` throws `AdvisoryParseError` on bad `kind`/`severity`/`affects`; test `advisories.test.mjs:49-59` `assert.throws(... /severity/)`. **The folder half is ZERO**: `docs/advisories/` does not exist and there are 0 `ADV-*.md` files — nothing scans a real folder, and the template ships the channel without its directory | ⚠️ |
| AC2 SessionStart hook computes `pending = (module ∈ lock ∧ version ∈ affects) − APPLIED` and emits one line per id | per-id line, nothing when empty, UserPromptSubmit only on first prompt | Lib only: `scripts/platform/lib/advisories.mjs:43-71` `computePending`, ledger case `advisories.test.mjs:91-95` (`pending: []`), no-lock case `:115-120`. **The hook itself has NO test**: `.claude/hooks/pending-advisories.mjs:35` (empty → exit 0) and `:18-22` (tmpdir state file keyed by `session_id`, gated on `hookEventName === "UserPromptSubmit"`) are both unexercised | ⚠️ |
| Edge: lock missing → exactly one line `no .platform-modules.lock — run platform module adopt` | that literal | `pending-advisories.mjs:31-32` emits `no .platform-modules.lock — run pnpm platform module adopt` — **extra `pnpm`** vs the spec text | ⚠️ cosmetic |
| AC3 APPLIED ledger append-only; advisory files never deleted/moved by the child | documented rule | `docs/catalog/catalog.md:96` "o app filho nunca apaga ou move advisories"; format `:97-98`; `copier.yml:32` lists `docs/advisories/APPLIED.md` under `_skip_if_exists`. Documentation only — no executable proof | ⚠️ |
| AC4 entry code changed without an advisory → lint fails; exempt for README/CHANGELOG/**tests** or the `Advisory: none — <reason>` trailer | lint red + 3 exemptions | Impl `scripts/platform/advisory-required.mjs:19-30` (path regex `:6`, trailer regex `:8`); tests `advisory-required.test.mjs:5-13` (fails), `:33-41` (trailer exempt), `:63-75` (partial cover). **Two deviations**: wired at `lefthook.yml:24-27` as **commit-msg**, not pre-commit — sound, since the trailer is only readable there — but **the CI half is ZERO** (no CI exists); and `CODE_PATH_RE` *includes* `parity/`, so the spec's "or tests" exemption is **not implemented** for tests living inside an entry | ⚠️ |

### P2 — `port-module-update` skill (TLG-07)

| Criterion | Evidence | Result |
| --- | --- | --- |
| AC1–3 resolve lock→HEAD from CHANGELOG, refuse without a heading, run parity before bumping, stop on conflict | `.agents/skills/port-module-update/SKILL.md` exists (symlinked into `.claude/skills/`). **ZERO executable proof** — `SKILL.md:53` labels its only worked example "Illustrative only (not performed — no second version exists to test against)". The spec's Independent Test (dry-run on the smoke child after bumping a fixture entry) was never run | ❌ |

The skill documents its own gaps honestly (note 62): design § 7's repo-wide `catalog: {source, ref}`
lock block does not exist — `scripts/platform/lib/apply.mjs::writeLock` writes a per-module
`catalogRef` — and **no `catalog/<entry>@x.y.z` git tag has ever been created**, so AD-016's
tagging path is entirely unexercised. Recording fiction was correctly refused.

### P2 — Handbooks and migration note (HBK-02..HBK-04)

| Criterion | Evidence | Result |
| --- | --- | --- |
| HBK-02 handbooks describe kernel ports, module anatomy, parity convention, **and contain no base-set assumption** | Positive half ✅: `docs/back/back-arch.md:82` `## Portas do kernel`; `:104-112` `## Entrada do catálogo (anatomia)` incl. "Comunicação entre entradas"; `docs/test/testing.md:186-198` `## Parity (catálogo)` — and `:197-198` states outright that an entry's specs run only inside a rendered child via `catalog:check` (note 50 written into the handbook); `docs/front/front-arch.md:399` covers the entry's web part (`module add` copying `web/core`/`web/react` into `apps/web/src/entities/<entry>`). Negative half ❌: **`docs/back/back-arch.md:399` still reads `- **RULE B** — módulos da **base-set** (identity, audit, attachment, tag, notification, coexistence)…`** while RULE B was deleted from `module-boundaries.spec.ts` | ❌ |
| HBK-03 `docs/dev/template.md` slot table replaced by the catalog table | `docs/dev/template.md:46` `## Catálogo de módulos`, `:54 ### Comandos` (`module add/adopt/list/update`), `:63 ### .platform-modules.lock`, `:71 ### Advisories`, `:82 ### Portar uma atualização de entrada`, `:89 ### Gate antes de cortar uma tag`. grep `slot` → **zero matches** | ✅ |
| HBK-04 `## v1.0.0` with breaking changes + v0.2 migration steps | `docs/dev/template-changelog.md:7` `## v1.0.0`, `:14 ### Breaking changes` with 7 items: slot files retired `:16`, access seam `:20`, kernel log loses `sessionId` `:26`, `/docs` remounted `:29`, web kernel loses session `:33`, actor shape `:36`, migration numbering reset `:40`. **Missing**: the exact `RouteAccess` shape change (`self` → `authenticated`, `permission` → `key`) that note 27 explicitly owed | ⚠️ |

### P2 — Template smoke stays kernel-only (SMK-01)

| Criterion | Evidence | Result |
| --- | --- | --- |
| AC1 one `kernel-only` profile, `fake-product` fixture removed | `package.json:23` `"template:smoke": "node scripts/template-smoke.mjs"`; `scripts/template-smoke.mjs:221` renders exactly one child, no profile branching; `fake-product` has **zero hits** outside `.specs/**` | ✅ |
| AC1 smoke passes `check && test`, `db:migrate` → only `_kernel`, `/health` 200, RULE C zero hits | all four assertions exist (`:236`,`:241`; `:10` + `:133-163`; `:171-193`; `:195-204`) but the run **exits 9 at check 2/4**; checks 3/4 and 4/4 never execute | ❌ |
| AC2 the `module add` path is proven by the catalog CI matrix, not a second profile | the matrix does not exist (CAT-02) — the install path is proven only by a hand-run `catalog:check` | ❌ |

### MIG-01 / MIG-02

| Criterion | Evidence | Result |
| --- | --- | --- |
| MIG-01 kernel-only baseline; entries ship their own | `apps/api/drizzle/migrations/` = `0000_kernel_baseline.sql`, `0001_kernel_outbox_notify.sql`; `0000_platform_baseline.sql` gone; the only `CREATE SCHEMA` in the tree is `0000_kernel_baseline.sql:1` `CREATE SCHEMA "_kernel";` — no `identity`/`attachment`/`notification`/`tag` schema in any template migration | ✅ |
| MIG-02 sequential indices in install order, journal monotonic | no unit assertion (see TLG-01); proven by `catalog:check` exit 0 with `db:check:journal` green in the child | ⚠️ gate-only |

Note 26's second half is **superseded**: T22's hand-bumped `when` values (2027) were corrected by
T28c to `1787062300194`/`1787062360194` precisely because they broke `module add`. The first half —
`drizzle-kit generate` not emitting `CREATE SCHEMA "_kernel"`, hand-prepended — still stands and
remains a silent trap for the next baseline regeneration. Non-blocking; worth a comment in the file.

---

## Discrimination Sensor

Sensor depth: **5 mutants** (large multi-wave feature touching tooling, kernel security seam and
catalog contracts). Each: `git status --short` clean → inject → run the scoped gate once through the
runner → `git checkout -- <file>` → `git status --short -- <file>` empty. No `stash`, no branch, no
worktree operation. `catalog:check` was **not** re-run for any mutant.

| # | File:line | Mutation | Scoped gate | Killed? |
| --- | --- | --- | --- | --- |
| 1 | `apps/api/src/shared/kernel/access/access.guard.ts` | `throw new AccessPolicyMissingError()` → `return true;` (fail-open when no policy is registered) | `pnpm --filter api test -- access.guard` → exit 1, **2 failed / 10 passed** | ✅ Killed — `AccessGuard › sem provider de ACCESS_POLICY › nega a rota de permissão com 403 access-policy-missing` and `› nega a rota autenticada — ausência de política não libera` |
| 2 | `apps/api/src/shared/kernel/logging/logger.factory.ts` (appended) | injected module vocabulary into the kernel: `const auditTrail = "identity";` | `pnpm --filter api test -- module-boundaries` → exit 1, **1 failed / 31 passed** | ✅ Killed — `RULE C › nenhum token de módulo sobrevive na casca do template`, offenders `logger.factory.ts:91 — auditTrail` and `:91 — identity` |
| 3 | `catalog/tag/module.json` | `customMigrations: ["01_audit_attach_tags.sql"]` → `["migrations/custom/01_audit_attach_tags.sql"]` (the T28n/T28o defect) | `pnpm test:scripts` → exit 1, **165 pass / 1 fail** (`catalog:lint` stayed 0) | ✅ Killed — `customMigrations de cada entrada real do catálogo é nome de arquivo puro e existe em migrations/custom/` |
| 4 | `apps/api/src/shared/test/parity/contract-snapshot.ts:104` | `pinned.type !== actual.type` → `false` (retyped field no longer detected) | `pnpm --filter api test -- contract-snapshot` → exit 1, **1 failed / 7 passed** | ✅ Killed — `expectContractSubset › falha nomeando a operação e o campo quando o tipo por trás de um $ref muda` |
| 5 | `catalog/attachment/module.json` | `dependsOn: [{identity, ">=1.0.0 <2.0.0"}]` → `[]` (declared graph now lies about a real source edge) | `pnpm catalog:lint` → exit **0**; `pnpm catalog:typecheck` → exit **0** | ❌ **SURVIVED** |

**Result: 5 injected, 4 killed, 1 survived — ❌ FAIL.**

Mutant 5 analysis: `module.json.dependsOn` is hand-maintained. Note 51 built the real edge
inventory by hand and T22l (`b16e1ec`) hand-wrote it into the manifests; **nothing re-derives it**.
`catalog:lint` validates the manifest's *shape*, `catalog:typecheck` compiles entries against a
staged kernel where all entries coexist, so neither can see a missing edge. `attachment` injects
`UserDirectoryFacade` from identity in `list-attachment-access-log.use-case.ts`, so with
`dependsOn: []` a child could `module add attachment` alone and get a tree that does not boot —
exactly the failure TLG-02 exists to prevent. Restored, tree clean.

Logs: `/tmp/claude-1000/catalog-check-logs/mut-m{1,2,3,4,5}.log`.

---

## Reviewed judgement calls (payload requests)

**T28x — identity `professional-tables.facade` narrowed to row-shape types: APPROVED.**
`catalog/identity/single-tenant/api/application/professional-schedule-rows.ts:7-33` exports 4 row
types; `api/api/facades/professional-tables.facade.ts:9-15` re-exports exactly those. This matches
`docs/back/back-arch.md:350` — "Facade reexporta todo tipo que devolve … consumidor nunca faz deep
import em port/use case alheio, nem para tipo" — and `:170`, which makes `api/facades/` the only
legal cross-module target. `api/facades` importing `infrastructure/tables` was the layer violation
being fixed; Drizzle tables correctly stay in `infrastructure/tables/`.
*Residual (non-blocking)*: the facade has **zero consumers repo-wide** and no runtime member. A
type-only facade nobody imports is dead surface — either delete it or name the intended consumer in
identity's README § Dependências.

**Note 67 — kernel guards as invariants over 0..N entries: APPROVED.**
`scripts/platform/lib/apply.mjs:17` `TEMPLATE_ONLY_FILES = ["apps/api/src/modules/template-kernel-only.spec.ts"]`,
removed by `:19-28` `removeTemplateOnlyFiles`; `:149-172` `rollback()` deliberately does not
recreate it, with the reason in the code at `:15-16` ("um repositório que já instalou não volta a
ser o template"). No AC is violated — the spec's `--rollback` only promises removing the *listed*
files. *Residual (non-blocking)*: after a **failed first** install, `--rollback` leaves a child that
is neither template nor installed. Either restore `TEMPLATE_ONLY_FILES` on a rollback that empties
the lock, or lift the code comment into `docs/dev/template.md`.

**Note 69 — no lint path for `catalog/**` in the template: CONFIRMED, real debt.**
`package.json:27` `catalog:typecheck` stages and runs `tsc --noEmit` only; api ESLint ignores
`.catalog-stage/**` and no tsconfig project covers `catalog/**`, so entry sources are lint-checked
only inside a rendered child. Measured cost in this feature: two extra `catalog:check` rounds
(~10 min each) spent on `import-x/order`. Recommend a `catalog:lint` ESLint stage mirroring
`catalog:typecheck`. Not a v1.0.0 blocker.

**Note 70 — literal-only `@NonTransactional` marker: APPROVED, sharp edge documented.**
`apps/api/src/openapi/transactional-coverage.spec.ts:17-18`
`TX_MARKER = /@Transactional\(|@ReadOnly\(|@NonTransactional\(\s*"[^"]+"\s*\)|txManager\.run\(|txm\.run\(/`;
decorator `apps/api/src/shared/kernel/transactional/transactional.decorator.ts:47-52` throws on an
empty reason. The regex/runtime disagreement fails **loud** (guard red), never silent, and the
grep-ability requirement is real. `:69,71,73-74` cover literal-passes / `()` fails / `("")` fails.
*Nit*: `@NonTransactional(" ")` passes the regex and throws at runtime — the two checks disagree on
exactly one input.

**T28s — `process.stdout.write` in seeds and `.bind(prototype)` in parity specs: CONFORMS.**
`docs/code-quality.md:133` is the only relevant rule ("CI cobre … `console.log` …"); there is no
rule about `process.stdout` or `.bind` in `code-quality.md` or `testing.md`. The four
`process.stdout.write` sites (`…/api/testing/seeds/master-user.seed.ts:49,52`,
`…/seeds/bootstrap-master.ts:83,86`) are CLI seed scripts whose output is the point — the documented
escape from `no-console`. The four `.bind(Class.prototype)` sites
(`catalog/tag/parity/facade.parity.spec.ts:8,12`, `catalog/attachment/parity/access-log.parity.spec.ts:10`,
`catalog/notification/parity/mailer.parity.spec.ts:10`) are the standard
`@typescript-eslint/unbound-method` workaround.
*Residual (non-blocking, coverage quality)*: all four assert only **arity** (`toHaveLength(1)`).
A method could be rewritten entirely and parity would stay green — these are the weakest four
assertions in the parity layer.

**T28p — English commit subject (`b1c3ee1`): cosmetic, unfixable.**
`fix(catalog/audit): update stale fake context in trilha completa specs` is mixed EN/pt-BR in a
range whose other 118 subjects are pt-BR. `--amend` is forbidden by the protocol, so this cannot be
corrected without a rewrite. Note only.

**`SPEC_DEVIATION` markers — 4 in the tree, not the 3 note 45 predicted.** All carry an in-file reason:

| File:line | Deviation | Assessment |
| --- | --- | --- |
| `scripts/platform/lib/manifest.mjs:4` | hand-written validation mirroring `catalog/schema/module.schema.json`, no ajv | **new since note 45.** The mirror can drift from the schema file it duplicates; the spec's implicit-requirement dimension asks for "`module.json` against a JSON schema". Low risk, real. |
| `catalog/notification/api/application/templates/notification-template-registry.ts:37` | design C-NTPL wants a `NOTIFICATION_TEMPLATE_SOURCES` registry | open design debt, unchanged |
| `catalog/notification/parity/template-registry.parity.spec.ts:18` | keys accepted as a subset of `["catalog","email","type"]` | T28h corrected a wrong assertion; `email` is genuinely optional for system-only channels |
| `apps/api/src/shared/kernel/logging/logger.factory.ts:55` | `sessionId` dropped from the log | correct consequence of the seam (note 16) and **carried into the changelog** at `docs/dev/template-changelog.md:26` ✅ |

**Note 57 — kernel harness naming entries: CONFIRMED, and it is a hole in RULE C's surface.**
`apps/api/test/setup/test-db.ts` exports `truncateIdentity`/`truncateTag`/`truncateAttachment`.
RULE C's `KERNEL_SURFACE` (`module-boundaries.spec.ts:537-543`) covers api `shared/**`,
`app.module.ts`, `db/schema.ts` and web `app/**` + `shared/**` — **not `apps/api/test/**`**. So the
kernel-only invariant is genuinely unenforced over the test harness, and there is entry vocabulary
sitting in it. Correctly deferred to `test-suite-refactor` (note 44); recorded here so it is read as
known debt, not a regression.

**Note 49 — RULE C token list narrower than its intent: RULED, non-blocking.**
`FORBIDDEN_TOKENS` (`:518-535`) matches design § 2.4 **exactly** (16 tokens), so AC5 is satisfied
*as specified*. But it catches `auditTrail`/`audit_trail`/`AuditRegistry` and not PascalCase,
SCREAMING_SNAKE or kebab forms, which is why AD-024's kernel ports —
`shared/kernel/audit-trail/audit-trail-purger.port.ts`, `AuditTrailPurger`, `AUDIT_TRAIL_PURGER` —
entered the kernel untripped. This is a **design-precision gap, not an implementation failure**:
the story's intent ("audit trail" is module vocabulary) is broader than the list the design wrote.
Resolve it one way or the other before v1.1 — either widen the list and rename the ports to
module-agnostic names, or write into `docs/back/back-arch.md` that kernel ports may carry a module's
concept name because a port *is* the kernel's own vocabulary. Do not leave it undecided.

**Note 34 — `/docs` mount unverified.** `apps/api/test/setup/scalar-stub.ts` is wired through jest
`moduleNameMapper`, so the restored `openapi-contract.e2e-spec.ts` validates the static snapshot,
never a live `GET /docs`. No AC covers `/docs` (it was a T22e addition), so this is not a gap
against the spec — but the mount ships untested. Non-blocking.

**Notes 50 / 66 — CLOSED by this validation.** `catalog:check` exit 0 executed 1139 entry
assertions in a rendered child, including the contract parity that is the only thing able to see an
empty registry. The headline risk is retired *for this commit* — but see Fix 2: nothing runs it
automatically, so it is evidence for one run, not a standing guarantee.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ — workers repeatedly refused to invent (`files` key, README follow-ups, `MAILER` as a kernel port, cutting a real dependency edge) |
| No scope creep | ✅ |
| Matches patterns | ✅ — AD-024 ports landed beside the concept (`shared/kernel/<concept>/*.port.ts`) rather than in a second `ports/` tree, honouring AD-009 |
| Spec-anchored outcome check | ⚠️ — 6 criteria assert an exit code or a call without asserting the spec-named value (TLG-05 range message, TLG-06 dry-run detail, AC1 web registry, ADV-02 hook output) |
| Per-layer Coverage Expectation met | ⚠️ — kernel 1:1; tooling has exit-code coverage but thin message coverage; advisories hook layer uncovered |
| Every test maps to a requirement | ✅ |
| Documented guidelines followed | ✅ — `docs/code-quality.md`, `docs/back/back-arch.md`, `docs/test/testing.md` checked against the four flagged spots; all conform |

---

## Edge Cases

- [x] `module add` interrupted mid-copy → `--force` / `--rollback` (`cli.test.mjs:198-201`, `:282-283`)
- [ ] `port-module-update` treats a renamed file as a conflict — **no executable proof** (TLG-07)
- [x] two entries with the same migration index → sequential renumber, journal monotonic — via `catalog:check` only
- [ ] advisory `affects` fails to parse → fails at the template — parser throws (`frontmatter.mjs:35-41`) but **no folder-level test and no advisory files exist**
- [x] lock missing → one adopt line (`pending-advisories.mjs:31-32`, text differs by one word)
- [x] `copier update` brings advisories already in the ledger → nothing emitted (`advisories.test.mjs:91-95`)

---

## Fix Plans

### Fix 1 — `pnpm template:smoke` fails (BLOCKER)

- **Root cause**: `scripts/template-smoke.mjs:10` `EXPECTED_SCHEMAS` is compared for **equality**
  against the schemas found after `db:migrate`, and omits `public`, which PostgreSQL creates in
  every fresh database. Observed: `schemas após "db:migrate" divergem do esperado: encontrados
  [_kernel, drizzle, public], esperado [_kernel, drizzle]` → exit 9.
- **Impact**: SMK-01 AC1, the P1-MVP story's Independent Test
  (`pnpm template:smoke --profile kernel-only`), and Success Criterion #1 ("green on the v1.0.0
  tag"). Because the run aborts at check 2/4, checks 3/4 (`GET /health` 200) and 4/4 (RULE C) never
  execute in a rendered child at all.
- **Fix task**: make the assertion a *superset* check — fail on any schema outside
  `{_kernel, drizzle, public}` rather than requiring exact equality — and update `spec.md` KRN-01
  AC3 to name `public`. Then re-run `pnpm template:smoke` and confirm all 4 checks report.
- **Priority**: **Blocker**

### Fix 2 — the catalog CI matrix does not exist (BLOCKER)

- **Root cause**: CAT-02 was mapped to T24/T28, which delivered the `catalog:check` *script*.
  No workflow was ever written; the repository has **no `.github/` directory at all**.
- **Impact**: CAT-02 AC2 ("one job per entry"), Success Criterion #2, and P2 SMK-01 AC2 — which
  explicitly delegates proof of the `module add` path to this matrix. Combined with note 50
  (`catalog:check` is the only thing in the repo that can execute an entry's specs), the 1139
  entry assertions are protected by nothing that runs automatically. ADV-04's CI half is blocked
  on the same absence.
- **Fix task**: add `.github/workflows/catalog.yml` with `strategy.matrix.entry: [identity,
  attachment, audit, notification, tag]` running `pnpm catalog:check <entry>`, plus a job running
  the per-package gates and `scripts/platform/advisory-required.mjs`. If CI is deliberately out of
  scope for this repo, amend CAT-02 and the Success Criteria to say so instead of leaving them
  unmet.
- **Priority**: **Blocker**

### Fix 3 — surviving mutant: `dependsOn` is unverified (MAJOR)

- **Root cause**: no gate re-derives the declared dependency graph from the code. Emptying
  `catalog/attachment/module.json`'s `dependsOn` passes both `catalog:lint` and `catalog:typecheck`.
- **Fix task**: add a test in `scripts/platform/__tests__/manifest.test.mjs` (next to the
  `customMigrations` test that killed mutant 3) that, for every real entry, scans
  `catalog/<entry>/(<variant>/)?api/**` for imports resolving into another entry and asserts the
  resulting name set equals `module.json.dependsOn` — the computation note 51 did by hand. Keep the
  test-only edges (AD-026) out of the production set explicitly.
- **Priority**: **Major**

### Fix 4 — `docs/back/back-arch.md:399` documents the deleted RULE B (MAJOR)

- **Root cause**: T26 rewrote the handbook's kernel/anatomy sections but left the boundaries section
  describing `RULE B — módulos da base-set`, a rule removed from `module-boundaries.spec.ts`.
- **Impact**: HBK-02 AC1 says the handbooks "contain no base-set assumption". They do.
- **Fix task**: replace `docs/back/back-arch.md:399` with RULE C's description and its 16-token
  list. This is the **only** base-set survivor: the other `slot` hits in the handbooks
  (`back-arch.md:405` composition-root registration, `back-arch.md:505` and
  `front-arch.md:477` the `schedule-slot` domain term) are unrelated senses of the word, and
  `docs/dev/template.md` has zero `slot` matches.
- **Priority**: **Major**

### Fix 5 — the advisories channel has no folder and the hook has no test (MAJOR)

- **Root cause**: ADV-01's validation lives in the parser; nothing scans `docs/advisories/`, and the
  directory does not exist, so a child rendered today receives no advisories folder and no
  `APPLIED.md` for `copier.yml:32`'s `_skip_if_exists` to protect. ADV-02's hook entry point is
  untested — the empty-output path (`pending-advisories.mjs:35`) and the first-prompt gate (`:18-22`).
- **Fix task**: (a) create `docs/advisories/` with `APPLIED.md` and a `README.md` carrying the
  immutability header; (b) add a test that parses **every** file in that folder and fails on a
  schema-invalid one; (c) add `scripts/platform/__tests__/pending-advisories.test.mjs` driving the
  hook with a fixture lock + advisories for the four ADV-02 branches; (d) align the no-lock string
  with `spec.md` or amend the spec.
- **Priority**: **Major**

### Fix 6 — TLG assertion gaps (MINOR)

- **Root cause**: several ACs name a value the tests never assert.
- **Fix task**: assert (a) `_journal.json` contents and `when` monotonicity after `module add`;
  (b) the web routes registry registration line; (c) the required range in the
  `KERNEL_RANGE_UNSATISFIED` message (capture stdout, as the `already installed` test does);
  (d) migration renumbering and registration lines in `--dry-run` output; (e) parity suite invoked
  distinctly from unit tests in TLG-04.
- **Priority**: **Minor**

### Fix 7 — spec/design corrections owed (MINOR)

- `spec.md` KRN-01 AC3 → name `public` (Fix 1).
- `spec.md` P1-ports AC3 → drop the outbox from "record `actorId`", or add the column (note 63).
- `spec.md` § Cross-module dependencies → replace the stale inventory with the AD-025/AD-026 graph.
- `spec.md` CAT-01 AC1 → drop `files` from the `module.json` key list (note 37).
- `docs/dev/template-changelog.md` § v1.0.0 → add the `RouteAccess` shape line note 27 owed.
- Resolve note 49 explicitly (widen `FORBIDDEN_TOKENS` or document the port exemption).
- **Priority**: **Minor**

---

## Requirement Traceability Update

| Requirement | New status |
| --- | --- |
| KRN-02, KRN-03, KRN-05, KRN-06, KRN-07, CAT-01, CAT-04, CAT-05, HBK-01, HBK-03, CTR-01, WEB-01, TLG-02, TLG-03, TLG-08, ADV-05, MIG-01 | ✅ Verified (17) |
| KRN-01, KRN-04, CAT-03, HBK-04, TLG-01, TLG-04, TLG-05, TLG-06, ADV-01, ADV-02, ADV-03, ADV-04, MIG-02 | ⚠️ Partial / spec-precision gap (13) |
| CAT-02, TLG-07, HBK-02, SMK-01 | ❌ Needs fix (4) |

**Coverage: 34 requirements — 17 verified, 13 partial, 4 failing.**

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 17/34 requirements fully evidenced · 13 partial · 4 failing ·
9 spec-precision gaps flagged
**Gate**: 13 of 14 commands exit 0 — `catalog:check` **exit 0** (167 suites / 1139 tests, 5/5
entries), `template:smoke` **exit 9**
**Sensor**: 5 injected, **4 killed, 1 survived**
**Worktree**: clean at `47fa6a8`, no stash, no untracked files — verified after the last mutant

**What works**: the kernel-only cutover is real and provable — zero `modules/**` imports from
`apps/api/src/shared/**`, no module-path allowlist anywhere in the kernel, RULE B gone, RULE C
green over 16 tokens, the fail-closed access guard rejecting with RFC 7807 `access-policy-missing`,
a 2-operation kernel contract, a kernel-only baseline creating only `_kernel`, five self-contained
catalog entries that install and pass 1139 assertions in a rendered child, and a parity helper that
now genuinely catches a retyped field behind a `$ref`. Four of five mutants died to precise,
well-named tests.

**Issues found**: the feature's own MVP Independent Test (`template:smoke`) fails on a schema
allow-list that forgot `public`; the catalog CI matrix that every "self-verifying" claim rests on
was never written; and the dependency graph the installer enforces is hand-maintained with no gate
behind it.

**Next steps**: Fix 1 and Fix 2 are blockers and must land before a v1.0.0 tag. Fix 3 closes the
surviving mutant. Fixes 4–7 are follow-ups the orchestrator can batch into one wave.

---
---

# Round 2 (2026-08-21, `e42ab2a`)

Re-verification after wave 7 (T29–T35), commits `47fa6a8..e42ab2a`, branch
`feat/v1-kernel-only-module-catalog`. Round-1 content above is unchanged. Fresh verifier context —
every row below was re-derived from `spec.md` and proved with `file:line` or a command exit code.

## Wave 7 commits under review

| Commit | Subject |
| --- | --- |
| `0fbfb44` | `docs(back-arch)`: RULE C replaces RULE B; changelog `RouteAccess` |
| `f59651a` | `ci`: catalog matrix, per-package gates, `template:smoke` |
| `011a035` | `chore(copier)`: exclude the workflow from the rendered template |
| `b2a378a` | `test(advisories)`: `docs/advisories/` folder + hook coverage |
| `4b7445e` | `fix(scripts)`: `template:smoke` tolerates the `public` schema |
| `f1849f2` | `test(scripts)`: `dependsOn` derived from imports |
| `5027c21` | `fix(advisories)`: loader ignores README/APPLIED; hook follows the spec format |
| `e42ab2a` | `fix(scripts)`: `template:smoke` keeps Postgres, starts Redis, passes env to the child |

## Fix Plan status

| Fix | Round-1 priority | Round-2 status | Evidence |
| --- | --- | --- | --- |
| **Fix 1** — `template:smoke` fails | Blocker | ✅ **Closed** | `pnpm template:smoke` **exit 0**, all four checks reported (`1/4 pnpm check && pnpm test`, `2/4 db:migrate … só _kernel + drizzle`, `3/4 GET /health`, `4/4 RULE C`) → `Smoke do template passou: as quatro checagens ficaram verdes.` Log `/tmp/claude-1000/catalog-check-logs/template-smoke-r2.log`. Root cause fixed as a **superset** check, not by loosening: `template-smoke.mjs:10-11` `EXPECTED_SCHEMAS = ["_kernel","drizzle"]` + `ALLOWED_EXTRA_SCHEMAS = ["public"]`, `schemasMatchExpected` at `:62-73` checks both directions (every expected present **and** nothing outside expected∪allowed). `spec.md:131` now names `public` explicitly. |
| **Fix 2** — catalog CI matrix missing | Blocker | ✅ **Closed** (static; see caveat) | `.github/workflows/catalog.yml` exists. Job `catalog` `:36-77` — `strategy.matrix.entry: [identity, attachment, audit, notification, tag]` `:42`, `fail-fast: false` `:40`, Postgres 16 + Redis 7 services `:43-59`, `pnpm catalog:check ${{ matrix.entry }}` `:77` ⇒ one job per entry, 5 jobs. Job `gates` `:11-34` runs the **per-package** gates, never turbo: `pnpm check` `:24`, `pnpm test` `:25`, `pnpm test:scripts` `:26`, `pnpm catalog:lint` `:27`, `pnpm catalog:typecheck` `:28`. Job `smoke` `:79-90` runs `pnpm template:smoke`. ADV-04 job at `:29-34`. `copier.yml` `_exclude` gained `.github/workflows/catalog.yml` so the child does not inherit the template's own CI. |
| **Fix 3** — surviving `dependsOn` mutant | Major | ✅ **Closed** | `scripts/platform/__tests__/catalog-custom-migrations.test.mjs:74-95` re-derives the graph from `catalog/<entry>/api/**` imports and asserts `assert.deepEqual([...derived].sort(), [...declared].sort())` against `module.json.dependsOn`. Test-only edges are excluded explicitly at `:15-19` (`*.spec.ts`, `*.int-spec.ts`) and `:30` (`testing/`), with `:12-14` recording that e2e edges still count (AD-026). Re-injected mutant **killed** — see Mutant A. |
| **Fix 4** — `back-arch.md` documents RULE B | Major | ✅ **Closed** | `grep "RULE B" docs/back/back-arch.md` → **no match**. `docs/back/back-arch.md:399-407` documents RULE C with the closed 16-token list, matching `apps/api/src/modules/module-boundaries.spec.ts:518-535` `FORBIDDEN_TOKENS` label-for-label (`identity`, `IdentityModule`, `accessProfile`, `access_profile`, `AccessProfile`, `PermissionsGuard`, `permissionCatalog`, `uploadProfile`, `UploadProfile`, `auditTrail`, `audit_trail`, `AuditRegistry`, `NotificationModule`, `notification_`, `TagModule`, `tag.`) = 16. |
| **Fix 5** — advisories channel has no folder / hook untested | Major | ✅ **Closed** (one doc item open) | (a) `docs/advisories/APPLIED.md:1-7` immutability header + ledger format `:11`; `docs/advisories/README.md:1-6` immutability header, frontmatter schema `:12-21`. (b) `scripts/platform/__tests__/pending-advisories.test.mjs:65-83` parses **every** `ADV-*.md` in the real folder with `parseAdvisory` and asserts `README.md`/`APPLIED.md` throw `AdvisoryParseError`; `:85-96` fails a schema-invalid advisory (`kind inválido`). (c) `pending-advisories.test.mjs` drives the hook through all four ADV-02 branches — `:25-34` no-lock line, `:36-40` no pending ⇒ empty stdout, `:42-50` `ADV-… <kind> <severity> <module>`, `:52-63` `UserPromptSubmit` fires only on the first prompt of a session — over committed fixtures in `__tests__/fixtures/pending-advisories/{no-lock,no-pending,pending}/`. (d) loader filter `lib/advisories.mjs:7,11-13` `ADVISORY_FILENAME_RE = /^ADV-\d{8}-\d{2}\.md$/` + `isAdvisoryFilename`, reused by `catalog-lint.mjs:77`; covered by `advisories.test.mjs` (`ignora README.md e APPLIED.md`, `ADV-*.md com schema inválido falha alto`). **Open**: `design.md:222` — see *No-lock string* below. |
| **Fix 6** — TLG assertion gaps | Minor | ⏸️ **Accepted debt** (deliberately not done) | Not attempted in wave 7, per the orchestrator's decision. The five sub-items (a)–(e) stand as recorded in round 1; they downgrade evidence quality on TLG-01/04/05/06, none of them regresses behaviour. Not a v1.0.0 blocker. |
| **Fix 7** — spec/design corrections owed | Minor | ⚠️ **5 of 6 done** | ① `spec.md:131` names `public` ✅. ② `spec.md:147` clarifies the outbox carries no actor column (note 63) ✅. ③ `spec.md:70-79` carries the measured AD-025/AD-026 graph, not the stale inventory ✅. ④ `spec.md:161` lists `name, variant, version, dependsOn[], kernelRange, migrations, web?` — `files` dropped, with note 37 cited ✅. ⑤ `docs/dev/template-changelog.md:25-29` (worktree) documents the `RouteAccess` shape change `{ kind: "public" } | { kind: "authenticated" } | { kind: "permission"; key: string }` ✅. ⑥ **note 49 not propagated** — resolved only in `tasks.md:748` (the intent is the narrower one; kernel ports from AD-022/AD-024 are reviewed by name, not by regex). `spec.md` has zero occurrences of `FORBIDDEN_TOKENS`/exemption text ❌. |

### Fix 2 caveat — the ADV-04 CI simulation

`.github/workflows/catalog.yml:29-34` reproduces the commit-msg hook in CI by capturing the PR head
commit message and running `git reset --soft "$base.sha"` before `advisory-required.mjs`.

**Mechanically faithful.** `advisory-required.mjs:45-49` reads staged files with
`git diff --cached --name-only` and `:32-42` reads advisory bodies with `git show :<file>`. After a
soft reset from the merge ref to the base SHA the index still holds the merge tree, so the staged
set equals the full PR diff and `git show :` resolves. The `fetch-depth: 0` at `:16-17` makes
`base.sha` reachable. The reset is the last step of the job, so it corrupts nothing downstream.

**Where it is weaker than the local hook** (residual gap, not a regression):

1. `git log -1` at `:32` takes **only the PR head commit's message**, then judges the **whole PR
   diff** against it. The local hook judges one commit's files against that same commit's message.
   Consequently the escape hatch `TRAILER_RE` (`advisory-required.mjs:8`, `Advisory: none — …`)
   placed on the head commit exempts **every** `catalog/**` change in the PR, not one commit's.
   The same widening applies in the safe direction: a per-commit advisory added in commit 2 of 5
   still covers the aggregate, which is correct.
2. The step is gated on `if: github.event_name == 'pull_request'` `:30`, so a direct push to `main`
   or a tag push never runs it. The local commit-msg hook remains the enforcement for that path.

Verdict: CAT-02/ADV-04's CI half is **present and sound**; the trailer's blast radius widening from
one commit to one PR is a documented follow-up, not a blocker.

### No-lock string — `design.md` is the one to align

| Source | Literal |
| --- | --- |
| Code — `.claude/hooks/pending-advisories.mjs:32` | `no .platform-modules.lock — run platform module adopt` |
| `spec.md:251` (ADV-02 edge case) | `no .platform-modules.lock — run platform module adopt` |
| `design.md:222` | `no .platform-modules.lock — run pnpm platform module adopt` |

**The code implements `spec.md`.** The assertion is pinned literally at
`pending-advisories.test.mjs:30-33`, whose name states the alignment
(`…alinhada ao spec.md ADV-02 (sem prefixo pnpm)`). **`design.md:222` is the stale one** — drop the
`pnpm ` prefix there. Recommendation stands: align `design.md`, never the code or the spec.

## Gate results (all per-package, never turbo, run in the worktree at `e42ab2a`)

| Command | Exit | Result | Log |
| --- | --- | --- | --- |
| `pnpm template:smoke` | **0** | 4/4 checks green | `/tmp/claude-1000/catalog-check-logs/template-smoke-r2.log` |
| `pnpm test:scripts` | **0** | **tests 179 · pass 179 · fail 0** | `…/test-scripts-r2-baseline.log` |
| `pnpm catalog:lint` | **0** | 0 errors, 0 warnings | `…/catalog-lint-r2.log` |
| `pnpm catalog:typecheck` | **0** | 0 errors, 0 warnings | `…/catalog-typecheck-r2.log` |
| `pnpm catalog:check` (round 14) | **0** | 5/5 entries, 167 suites / 1139 tests | `…/catalog-check-r14.log` |

`test:scripts` moved from the expected 176 to **179**: no test was lost, wave 7 added three
(`dependsOn` derivation + the two advisory-loader tests) on top of the round-1 baseline; the
`pending-advisories` suite is counted inside the same total. No count regression anywhere.

## Discrimination sensor — 3 mutations, 3 killed, 0 survived

Every mutation: `git status --short` clean beforehand → edit the real file → run only
`pnpm test:scripts` → restore with `git checkout -- <file>` → `git status --short` empty. No stash,
no branch, no worktree operation.

| # | Mutation | Result | Killed by |
| --- | --- | --- | --- |
| **A** | `catalog/attachment/module.json:6` — `dependsOn` emptied (`[{ "name": "identity", … }]` → `[]`). Re-injection of round-1's **surviving** mutant. | ☠️ **KILLED** — exit 1, 179 tests / 178 pass / **1 fail** | `catalog-custom-migrations.test.mjs:74` — `dependsOn de cada entrada real do catálogo é derivado dos imports que cruzam para outra entrada`. Log `…/mutant-A-dependsOn.log`. |
| **B** | `scripts/template-smoke.mjs:11` — `ALLOWED_EXTRA_SCHEMAS = ["public"]` → `[]`, i.e. undo Fix 1's allow-list entry. | ☠️ **KILLED** — exit 1, 179 / 177 / **2 fail** | `template-smoke.test.mjs:66` (`schemasMatchExpected … tolerates Postgres's own public schema`) and `:192` (`runTemplateSmoke does not fail on schema check when Postgres's own public schema is present`). Log `…/mutant-B-public-schema.log`. |
| **C** | `scripts/platform/lib/advisories.mjs:7` — `ADVISORY_FILENAME_RE` `/^ADV-\d{8}-\d{2}\.md$/` → `/\.md$/`, i.e. undo Fix 5(d)'s loader filter. | ☠️ **KILLED** — exit 1, 179 / 175 / **4 fail** | `advisories.test.mjs` (`loadAdvisories: ignora README.md e APPLIED.md…`) plus three `pending-advisories.test.mjs` hook branches (no-lock line, pending line, `UserPromptSubmit` first-prompt gate). Log `…/mutant-C-advisory-filename.log`. |

Mutant A is the decisive one: round 1's only survivor now dies to a named assertion. Mutants B and
C confirm the wave-7 code is guarded by tests that fail for the right reason, not by tests that
merely execute it — B proves Fix 1 widened the allow-list by exactly one member (a schema named
`identity` is still rejected, `template-smoke.test.mjs:173-189`), and C proves the loader's filter is
load-bearing across both the CLI lint path and the session hook.

## Requirement Traceability — Round 2 (34 requirements)

| Requirement | Round 1 | Round 2 | Why it moved |
| --- | --- | --- | --- |
| KRN-01 | ⚠️ Partial | ✅ Verified | `spec.md:131` names `public`; `schemasMatchExpected` `template-smoke.mjs:62-73`; smoke exit 0 |
| CAT-02 | ❌ Failing | ✅ Verified | `catalog.yml:36-77` matrix over the 5 entries; the command it runs proved locally (`catalog:check` exit 0, 5/5) |
| HBK-02 | ❌ Failing | ✅ Verified | no `RULE B` left in `back-arch.md`; RULE C + 16 tokens at `:399-407` |
| SMK-01 | ❌ Failing | ✅ Verified | AC1 `pnpm template:smoke` exit 0, 4/4; AC2's delegate (the CI matrix) now exists |
| ADV-01 | ⚠️ Partial | ✅ Verified | `docs/advisories/` shipped; folder-level parse test `pending-advisories.test.mjs:65-83`; invalid schema fails at the template `:85-96` |
| ADV-02 | ⚠️ Partial | ✅ Verified | all four hook branches asserted, no-lock literal matches `spec.md:251` |
| ADV-04 | ⚠️ Partial | ⚠️ Partial | CI half added (`catalog.yml:29-34`) but PR-wide trailer scope — see the Fix 2 caveat |
| TLG-07 | ❌ Failing | ⚠️ Partial | untouched by wave 7; `port-module-update`'s rename-as-conflict path still has **no executable proof** — accepted debt |
| KRN-02, KRN-03, KRN-05, KRN-06, KRN-07, CAT-01, CAT-04, CAT-05, HBK-01, HBK-03, CTR-01, WEB-01, TLG-02, TLG-03, TLG-08, ADV-05, MIG-01 | ✅ Verified | ✅ Verified | unchanged; CAT-01 additionally strengthened by the `dependsOn` derivation test |
| KRN-04, CAT-03, HBK-04, TLG-01, TLG-04, TLG-05, TLG-06, ADV-03, MIG-02 | ⚠️ Partial | ⚠️ Partial | Fix 6 deliberately skipped + carried-over spec-precision gaps |

**Coverage: 34 requirements — 23 verified ✅, 11 partial ⚠️, 0 failing ❌.**

Movement from round 1: **+6 verified** (KRN-01, CAT-02, HBK-02, SMK-01, ADV-01, ADV-02),
**4 → 0 failing**.

---

## Round 2 Summary

**Overall**: ✅ **Ready** (with documented, non-blocking debt)

**Spec-anchored check**: 23/34 requirements fully evidenced · 11 partial · **0 failing** ·
both round-1 blockers closed
**Gate**: 5 of 5 commands exit 0 — `template:smoke` **exit 0** (4/4 checks), `test:scripts`
**exit 0** (179/179), `catalog:lint` **exit 0**, `catalog:typecheck` **exit 0**,
`catalog:check` **exit 0** (5/5 entries, 1139 assertions)
**Sensor**: **3 injected, 3 killed, 0 survived** — including the re-injection of round 1's survivor
**Worktree**: clean at `e42ab2a` — `git status --short` empty after each of the three restores and
at the end of the round; no stash, no branch, no untracked file

**What changed since round 1**: the feature's own MVP Independent Test now passes end to end in a
rendered child — all four smoke checks execute, and the schema assertion became a genuine superset
check that still rejects a module schema rather than a blanket relaxation. The catalog CI matrix
exists with one job per entry, per-package gates and the ADV-04 job. The dependency graph is no
longer hand-maintained: a test re-derives it from the real imports and kills the mutant that
survived round 1. RULE B is gone from the handbook, RULE C is documented against the exact 16
tokens the spec enforces, and the advisories channel ships as a real folder with a hook covered on
all four of its branches.

**Residual debt (none blocking a v1.0.0 tag)**:

1. **`design.md:222`** — no-lock string still carries the `pnpm ` prefix the code and `spec.md` do
   not. One-word doc edit; the code is correct.
2. **ADV-04 in CI** — `catalog.yml:29-34` judges the whole PR diff against the head commit's
   message, so the `Advisory: none — …` trailer exempts a PR rather than a commit; and the step is
   PR-only. The per-commit local hook is unaffected.
3. **Fix 6 (TLG minors)** — accepted debt by decision; TLG-01/04/05/06 keep partial evidence.
4. **TLG-07** — `port-module-update`'s renamed-file conflict has no executable proof.
5. **Note 49** — resolved in `tasks.md:748` only; not propagated to `spec.md` or the handbooks.
6. **`docs/advisories/` holds no `ADV-*.md` yet** (correct for v1.0.0), so the folder-scan loop in
   `pending-advisories.test.mjs:65-73` is vacuous over advisories today; the invalid-schema branch
   is covered by the temp fixture at `:85-96` and by `advisories.test.mjs`, so the behaviour is
   guarded — the loop only starts earning its keep with the first real advisory.
7. **The CI workflow has never executed.** Judged statically only; its first real run happens on the
   first PR against this repo. The commands it invokes are all individually proven green locally.

**Next steps**: items 1 and 5 are one-line doc edits; item 2 deserves a follow-up ticket (compare
each commit in the PR range, not just the head). None gates the v1.0.0 tag.
