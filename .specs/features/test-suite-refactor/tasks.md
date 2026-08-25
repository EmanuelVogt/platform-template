# Test Suite Refactor Tasks

## Execution Protocol (MANDATORY)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, wave dispatch, file ownership, gates, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

**Pre-flight (binding, T1):** this feature assumes the post-v1 tree — `catalog/` holds the five entries, `apps/api/src/modules/` holds only the two boundary specs, `main` is at or after `8bb606d`. T1 checks it and stops otherwise.

**Orchestrator reminders:** the planning window never implements a cluster; each wave is dispatched in one message, all clusters concurrently; the Build gate runs once per wave through the runner; the full suite runs exactly once, at the Verifier's Final gate; the orchestrator is the only writer of `.specs/**` during Execute.

---

**Design**: `.specs/features/test-suite-refactor/design.md` — **Approved 2026-08-24**, reconciled to § *Scope cut* below
**Status**: Execute — waves 1, 2 and 3 DONE, all three Build gates green. Next: wave 4 (C7 = T40, exclusive), then the Verifier.

### Execution log

| Wave | Cluster | Task | Status | Commits |
| --- | --- | --- | --- | --- |
| 1 | C1 (opus) | T1 | DONE | `d1ba876` |
| 1 | C1 | T2 | DONE | `2a22919` |
| 1 | C1 | T3 | DONE | `5bc7d7d` |
| 1 | C1 | T4 | DONE | `d1ab7d8` |
| 1 | C1 | T5 | DONE | `8456bec` |
| 1 | C1 | T6 | DONE | `856adc0` (barrel) + `6320676`, `2d3ac37`, `b36f016`, `4b3e2b8`, `a32fa08`, `b1342bd`, `d86a87a` (the entry e2e migration the Wave Plan amendment adds to T6) |
| 1 | C2 (sonnet) | T7 | DONE | `8d150c2`, `681a26c` |
| 2 | C3 (sonnet) | T17 | DONE | `7bcd56d` |
| 2 | C3 | T18 | DONE | `0b1a601` |
| 2 | C3 | T23 | DONE | `fb38c5e` |
| 3 | C4 (opus) | T31 | DONE | `00a08ba` |
| 3 | C4 | T32 | DONE | `fd050c7` |
| 3 | C4 | T33 | DONE | `53b0d72` + `54779f9` (RULE C fixtures) + `1a7588b` (the TS2532 the Build gate caught) |
| 3 | C4 | T34 | DONE | `ef9f9f8` |
| 3 | C5 (sonnet) | T37 | DONE | `8cf4686` |
| 3 | C5 | T38 | DONE | `9fa3910` (the pre-push order fix T38 needed to be able to assert anything) + `5fc3877` |
| 3 | C6 (sonnet) | T35 | DONE | `2004f8a` + `c3d0362` (REL-04 bumps) + `dcc10c8` (SEAM-03 citation) |

**Build gates.** Wave 1: `pnpm check` 0, `pnpm test` 0 — 104 files / 672 tests. Wave 2:
the same two at 0, plus `it-count.mjs --check` at 0 (335 files / 2146 tests, no drop). The unit
totals do not move between the waves because an entry's specs only run inside a rendered child;
wave 2 is certified by `pnpm catalog:check` per entry, run green by the worker on all five.

**Wave 3 Build gate: green on the second run, and the first run is the interesting one.**
Five commands, `full-unit` widened to the gates the wave itself modifies: `pnpm check` 0, `pnpm test` 0
(106 files / 711 tests), `pnpm test:scripts` 0 (639/639), `pnpm catalog:lint` 0, `it-count.mjs --check` 0
(337 files / 2185 tests, no drop). The first run failed three of the five, and **all three were wave-3
defects that two workers had reported as pre-existing** — the `git log --oneline -- <path>` the runner was
asked to attach is what separated the hypotheses:

- `harness-hygiene.spec.ts(26,27)` TS2532 — `baseline[file] ??= {}` does not narrow under
  `noUncheckedIndexedAccess`. **This one is an orchestrator defect, not C4's**: the C4 payload said
  "no project-wide typecheck", so no cluster gate could have caught it. Fixed in `1a7588b` by binding the
  inner record before mutating — no cast, no `!`, no `any`; `HYGIENE_BASELINE=write` re-emits the baseline
  byte-identical, which is what proves the rewrite behaviour-preserving.
- `catalog:lint` × 5 "mudou desde v2.4.1 sem bump de versão" — `2004f8a` edited all five entry READMEs.
  REL-04 is not about code: an entry's codebase is immutable per version (`ecba436`), README included.
  Fixed in `c3d0362`, 2.1.0 → 2.1.1 with CHANGELOG entries (patch, doc-only).
- `seam-no-edit.test.mjs` SEAM-03 — the same commit shifted the identity README and the test pins raw
  array indices. Fixed in `dcc10c8` by re-pointing the citation, assertion untouched. **Recorded for
  whoever owns that test next: pinning `lines[N]` is brittle to any earlier edit in the file; a
  marker-based lookup is the right shape, and reshaping it is not this feature's charge.**

**Plan corrections this wave forced** (the Wave Plan's `Touches` were short in three places):

- **C5 gained `.github/workflows/release.yml`** at dispatch — T37 adds a CI job and
  `release-gate-parity.test.mjs` derives the release's required jobs from `ci.yml`, so a CI-only job fails
  `test:scripts` by design (`GT10`). Granted up front rather than paid as a `blocked-by-ownership`.
- **C5 gained `lefthook.yml` and `lefthook-local.yml`** mid-cluster. T38's Done-when attributes the order
  `migrations → typecheck → catalog-typecheck → test-coverage` to **AD-027, which decides no such thing**
  (`.specs/STATE.md:35`: the coverage gate, its Docker dependency and the flat-90 floors — no ordering).
  The cheap-first intent is in `lefthook.yml`'s own comment, and the executed order had drifted to
  alphabetical (`catalog-typecheck → migrations → test-coverage → typecheck`, measured live) because no
  `priority` was set — putting the Docker-bound step ahead of `typecheck`. `9fa3910` sets the priorities
  in both files (the child never sees `lefthook-local.yml`, so its order is fixed independently); T38 then
  asserts an order that is true, citing the config's intent and AD-027 only for the Docker-bound step.
- **C6 gained `catalog/*/module.json`, `catalog/*/CHANGELOG.md` and `seam-no-edit.test.mjs`** to repair
  its own fallout.

**C4 deviations, accepted.** (1) A single root `eslint.suppressions.json` is **impossible**: turbo runs
three separate `eslint` invocations, suppression keys are cwd-relative and ESLint fails on any entry the
current run does not use. GA-9 ships as three per-app baselines at ESLint's default auto-discovered
location — 21 entries, no flag, no CI change, and a stale count exits 2, so the file can still only shrink.
(2) The package is `@workspace/eslint-config`, not `@platform/eslint-config` as the Test Coverage Matrix
says. (3) The guard's own directory is excluded from its own scan — it names every banned token by
construction — asserted explicitly in `scan.spec.ts`. New files outside the declared `Touches`, no sibling
collision: `apps/{api,web-vite,web-next}/eslint-suppressions.json`,
`scripts/platform/__tests__/catalog-testing-imports.test.mjs`, `pnpm-lock.yaml`.

**T37 deviations, accepted.** No standalone `contract` job: `contract-env.test.mjs` and
`contract-check-ci.test.mjs` (pre-existing, not this feature's) require exactly one job — `quality` —
running `pnpm contract:check`, so AC1's contract check stays satisfied by that unchanged step; the shuffle
landed as a `pnpm test:e2e -- --sequence.shuffle` step, mirrored into `release.yml` for parity. No static
`services:` block: `apps/api/test/setup/global-setup.ts` self-provisions Postgres and Redis via
testcontainers, so a declared block would be dead weight that drifts. **T37's last Done-when — "the
workflow runs green on the feature branch (run URL in the commit body)" — is NOT satisfied**: nothing is
pushed during Execute. It is the one open bullet of this wave and the Verifier must judge it as such.

Note for the Verifier: a **concurrent session** staged eight files (`docs/advisories/**`,
`docs/dev/local-environment.md`) in this checkout during wave 3. They belong to `docs-audience-contract`,
no wave-3 commit touched them, and the tree is clean again as of the re-gate.

The C1 worker died mid-T6 on 2026-08-24 and was re-dispatched from `git log` on 2026-08-25; its
transcript did not survive, so the continuation kept the C1 label per the orchestrator card.

**`module.json.files` does not exist — the Done-when it appears in is unsatisfiable (wave 2).**
T6, T17, T18 and T23 each require `module.json.files` to list `testing/**`. No such field exists:
neither `catalog/schema/module.schema.json` nor `scripts/platform/lib/manifest.mjs` allows it, and
adding one is kernel work outside every one of those tasks. All four followed T6's own precedent
(`856adc0`) instead — bump `module.json.version` and the entry `CHANGELOG.md` (2.0.2 → 2.1.0),
which is what the `catalog-lint` pre-commit hook actually enforces (REL-04). `pnpm catalog:check`
is green for all five entries, so the barrels do reach a rendered child; the mechanism is simply
not the one the 2026-08-19 authoring assumed. **The Verifier must judge ENT-01/ENT-04 against the
green `catalog:check`, not against the missing field.**

**Open, unowned in the cut scope**: `catalog/identity/single-tenant/README.md` still points at
`api/testing/fake-mailer.ts`, which T17 deleted. It sits outside `api/**`, so it was outside C3's
ownership. Fold it into wave 3's C6 (docs).

**GA-7 removal accounted for.** `create-user-flow.e2e-spec.ts` lost `"seed master e promoção via
SQL"` — the pseudo-test that asserted `toBeTruthy()` on a seed — when `d86a87a` split the ordered
chain. It is the one removal § *Area 7* of `context.md` allows. `baseline.json` records the drop
(11 → 10) with the reason on the entry, and `it-count.mjs --check` exits 0: 335 files, 2146 tests,
no loss. T40 inherits this as the "single documented removal".

## Test Coverage Matrix

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Kernel harness helper (`mockOf`, `resetDb`, `waitFor`, `expectProblem`, `drainOutbox`) | unit | every documented behaviour incl. the failure path (unstubbed method, unknown schema, timeout) | `apps/api/src/shared/test/**/<name>.spec.ts` | `pnpm vitest run --project api apps/api/src/shared/test` |
| Guard spec scanner | unit | the scanner reports a seeded violation and ignores `.catalog-stage` | `apps/api/src/shared/test/hygiene/*.spec.ts` | `pnpm vitest run --project api apps/api/src/shared/test/hygiene` |
| Entry `testing/` barrel | none of its own | exercised by the entry's specs; excluded from the coverage denominator | `catalog/<entry>/api/testing/**` | `pnpm catalog:check` |
| Use case (entry) | unit | happy path + every `throw`; the saved entity asserted, not only the call | `catalog/<entry>/api/application/use-cases/<name>/<name>.use-case.spec.ts` | `pnpm catalog:check` (an entry's specs only run inside a rendered child) |
| Repository / trigger (entry) | integration | key query paths + conflict/error path, against the real database | `catalog/<entry>/api/infrastructure/**/*.int-spec.ts` | `pnpm catalog:check` (kernel equivalent: `pnpm test:int`) |
| Route / flow (entry, kernel) | e2e | status, problem body, persisted state; order-independent | `catalog/<entry>/api/__e2e__/*.e2e-spec.ts`, `apps/api/test/*.e2e-spec.ts` | `pnpm catalog:check` (kernel equivalent: `pnpm test:e2e`) |
| Cross-entry facade | unit | the shape each consumer relies on | `catalog/<entry>/api/api/facades/*.facade.spec.ts` | `pnpm catalog:check` |
| ESLint local rule | unit (RuleTester) | reported and exempt cases both | `packages/eslint-config/rules/*.test.js` | `pnpm --filter @platform/eslint-config test` |
| Lint configuration | unit | resolved severities for an api and a web test file | `packages/eslint-config/*.config.test.js` | `pnpm --filter @platform/eslint-config test` |
| Web component / hook | vitest | rendered outcome or navigation target, never existence | `apps/web-vite/src/**/*.test.ts(x)` **and** `apps/web-next/src/**/*.test.ts(x)` (GA-8) | `pnpm vitest run --project web <path>` |
| Repo tooling (`it-count`, gates) | node:test | exit codes and the reported drop | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| quick | inside a task, on the files just changed | `pnpm vitest run --project api <path>` · `pnpm vitest run --project web <path>` |
| scoped | worker's cluster gate, and the wave Build gate for a wave marked `scoped` | `pnpm --filter api typecheck && pnpm vitest run --project api <cluster paths>` (+ `pnpm vitest run --config vitest.integration.mts --project api-int|api-e2e <path>` when the cluster touches a database tier) |
| full-unit | wave Build gate for a wave that touches kernel, harness, lint config or root config | `pnpm check && pnpm test` (the two unit projects, Docker-free) |
| final | Verifier only, once per feature | `pnpm check && pnpm test:coverage && pnpm contract && git diff --exit-code openapi.json && pnpm catalog:check && pnpm template:smoke && pnpm test:scripts && node scripts/platform/it-count.mjs --check .specs/features/test-suite-refactor/baseline.json` (`test:coverage` covers the four projects and the floors in one run — it needs Docker) |

## Scope cut — 2026-08-24

**40 tasks / 10 clusters / 5 waves became 18 / 7 / 4.** The owner cut the scope after the
re-baseline showed the world had moved under the plan ("arranca fora e diminua o trabalho — a
duplicação de código é um problema real"). What was removed, and why:

| Removed | Tasks | Why |
| --- | --- | --- |
| The bulk migration of ~250 existing test files | T8, T9, T11–T16, T19–T22, T24–T29 | it was the majority of the cost and of the risk, for the *smallest* marginal return. Refactoring tests is dangerous in a specific way — a test broken into silence still passes. The harness plus the enforcement below stops **new** duplication from being written or copied into a child; the existing files are baselined (GA-9) and migrate when someone next touches them. |
| The coverage fills | T10, T30 | done by events. `audit-2026-08-23-remediation` closed COV-11: 96.5 / 94.4 / 94.9 / 96.8 against a 90 floor, 1212 tests. There is no gap left to fill. |
| The coverage ratchet | T39 | AD-012 is superseded by AD-027, so raising the bar above 90 is a **new owner decision on AD-027**, not this feature's work. It is cheap today and stays available; it is simply not charged here. |
| Formatting and the `api-client` no-op test | T36 | trivia; folded into T35 if it is free there, otherwise dropped. |
| The two audit gaps | GAP-01, GAP-02 (T21, T26, T16, T27) | real, but unrelated to duplication — their own follow-up. |

Recoverable in full at `ce3a0f6^`. Requirements that left scope are listed as `— cut —` in
§ *Requirement mapping*, never silently dropped.

**What the cut deliberately keeps** is everything with the template multiplier: the harness, the
entry barrels, and the enforcement. Duplication in this repository is not copied once — every
catalog entry carries its test patterns into every child that installs it, and a child cannot fix
it upstream. Stopping the source is worth more than cleaning the existing copies.

## Wave Plan

| Wave | Cluster | Tasks (in order) | Files (union of Touches) | Notes |
| --- | --- | --- | --- | --- |
| 1 | C1 — kernel harness | T1 → T2 → T3 → T4 → T5 → T6 | `scripts/platform/it-count.mjs`, `scripts/platform/__tests__/it-count.test.mjs`, `.specs/features/test-suite-refactor/baseline.json`, `apps/api/src/shared/test/{unit,int,e2e}/**`, `apps/api/test/**`, `apps/api/vitest.*.mts`, `vitest.coverage.mts`, `catalog/identity/single-tenant/api/**` | `gate: full-unit`; tier **opus** — the harness API is the contract every later cluster reuses, and RULE C is decided here |
| 1 | C2 — web harness, both shells | T7 | `apps/web-vite/src/shared/test/**`, `apps/web-next/src/shared/test/**` | `gate: scoped`; tier **sonnet**; **GA-8** — same relative path in both shells, shell-agnostic half byte-identical, the router helper the only divergence; no file in common with C1 |
| 2 | C3 — entry barrels | T17 → T18 → T23 | `catalog/notification/api/**`, `catalog/attachment/api/**`, `catalog/tag/api/**`, `catalog/audit/api/**` | `gate: full-unit`; tier **sonnet**; each task also moves **that entry's e2e files** onto the harness — the barrels prove themselves on real consumers, not on speculation |
| 3 | C4 — enforcement and baselines | T31 → T32 → T33 → T34 | `packages/eslint-config/**`, `eslint.suppressions.json`, `apps/api/src/shared/test/hygiene/**`, `apps/api/src/modules/module-boundaries.spec.ts`, `scripts/platform/catalog-lint.mjs` | `gate: full-unit`; tier **opus** for T33/T34 (RULE C/D semantics), **sonnet** for T31/T32; **GA-9** — every rule ships at full strength with a generated baseline that can only shrink |
| 3 | C5 — root gates | T37 → T38 | `.github/workflows/ci.yml`, `scripts/platform/__tests__/gates.test.mjs` | `gate: scoped`; tier **sonnet**; touches no file owned by C4 or C6 |
| 3 | C6 — docs | T35 | `docs/test/testing.md` | tier **sonnet**; single file, owned by nobody else |
| 4 | C7 — closure (exclusive) | T40 | `.specs/STATE.md`, `.specs/features/test-suite-refactor/**` | `Exclusive: yes`; `gate: quick` |

```
Wave 1: [C1: T1→T2→T3→T4→T5→T6]  ∥  [C2: T7]
Wave 2: [C3: T17→T18→T23]
Wave 3: [C4: T31→T32→T33→T34]  ∥  [C5: T37→T38]  ∥  [C6: T35]
Wave 4: [C7: T40]                                  (exclusive — closure)
```

Why the order is what it is: the harness is the contract (wave 1), the entries adopt it and prove
it on their own e2e (wave 2), enforcement can only generate an honest baseline once the tree it
measures has stopped moving (wave 3), and closure records AD-023 `active` after RULE D exists
(wave 4). Wave 2 is a single cluster on purpose — the four entries share `catalog/`, and the
parallelism the old plan bought there is not worth the merge surface for three tasks.

**Task-body amendments the cut implies** (the bodies below are otherwise unchanged from the
2026-08-19 authoring):

- **T4** migrates the kernel e2e onto the harness — a handful of files, not the tree.
- **T6, T17, T18, T23** each add their entry's `testing/` barrel **and** move that entry's e2e
  onto it. Unit and int specs of the entry are **not** migrated; they enter the GA-9 baseline.
- **T31** generates `eslint.suppressions.json` (native to ESLint 10, which this repo is on) as
  part of enabling the new rules, and CI fails on a stale suppression as well as on a new
  violation — so the file can only shrink.
- **T33** ships `harness-hygiene-baseline.json` beside the guard spec, on the same contract.
- **T40** no longer depends on T39; it depends on T38.

## Task Breakdown

### T1: Pre-flight and `it`-count baseline

**What**: verify the post-v1 tree, then write the tool and the baseline that prove no test is lost.
**Where**: `scripts/platform/it-count.mjs`, `scripts/platform/__tests__/it-count.test.mjs`, `.specs/features/test-suite-refactor/baseline.json`
**Touches**: the three files above
**Depends on**: None
**Exclusive**: no
**Reuses**: the file-walk of `scripts/platform/catalog-lint.mjs`
**Requirement**: STR-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] The pre-flight fails loudly if `catalog/` lacks any of the five entries — `attachment`, `audit`, `identity/single-tenant`, `notification`, `tag` (`catalog/schema` is the JSON schema, **not** an entry) — or if `apps/api/src/modules/` holds anything besides `module-boundaries.spec.ts`
- [ ] `--write` records `{ titles, count }` per test file; `--check` exits non-zero on a drop and names file, expected, actual
- [ ] Split files are matched by preserved `it` title, so a split is not read as a loss
- [ ] `baseline.json` committed with the counts **re-measured from the current tree** — the numbers in `design.md` § *Spike results* predate `v2.4.0` and are never to be copied (GA-7). Sanity check: the tree measures ~317 test files / ~2074 `it(`+`test(` sites on 2026-08-24; a baseline materially below that means the walk is missing an area (`apps/web-next` is easy to miss)
- [ ] The walk covers all four areas — `apps/api/**`, `catalog/**`, `apps/web-vite/**`, `apps/web-next/**` — and excludes `node_modules`, `dist`, `coverage`, `apps/api/.catalog-stage/**`
- [ ] `node --test scripts/platform/__tests__/it-count.test.mjs` passes

**Tests**: node:test · **Gate**: quick
**Commit**: `test(scripts): it-count baseline tool for the test refactor`

### T2: Unit harness

**What**: `mockOf`, `fixedClock`, `fakeRequestContext`, `fakeLogger` and the shared constants, each with its own spec.
**Where**: `apps/api/src/shared/test/unit/{mock-of,clock,request-context,logger,constants,index}.ts`
**Touches**: `apps/api/src/shared/test/unit/**`
**Depends on**: T1
**Exclusive**: no
**Reuses**: `apps/api/test/setup/test-logger.ts`
**Requirement**: UNT-01, UNT-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `mockOf<T>()` returns `Mocked<T>` (imported from `"vitest"`); a method neither supplied nor stubbed **rejects** naming itself
- [ ] `fixedClock`, `fakeRequestContext` (kernel defaults), `fakeLogger` exported with types, no `any`
- [ ] `FIXED_NOW` and `TEST_PASSWORD` are the only literals of their kind in the harness
- [ ] Each helper has a spec asserting its documented behaviour and its failure path
- [ ] No import from `catalog/**` or module vocabulary anywhere in the folder (RULE C)

**Tests**: unit · **Gate**: quick
**Commit**: `test(api): unit test harness — typed doubles, clock, request context`

### T3: Int harness

**What**: pool, `resetDb` by schema, `withTestDb`, Redis access; rewire the kernel int-specs onto it.
**Where**: `apps/api/src/shared/test/int/{db,with-test-db,redis,logger,index}.ts`, kernel `*.int-spec.ts`
**Touches**: `apps/api/src/shared/test/int/**`, `apps/api/src/shared/**/*.int-spec.ts`
**Depends on**: T2
**Exclusive**: no
**Reuses**: `apps/api/test/setup/test-db.ts`, `apps/api/test/setup/container-uris.ts`
**Requirement**: HRN-02, UNT-02

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `resetDb(pool, schemas)` truncates in one statement and throws on an unknown schema, listing the known ones
- [ ] `withTestDb({ schemas })` registers its own `beforeAll`/`beforeEach`/`afterAll` and returns `{ pool, db, txm, logger }`
- [ ] No module-named truncation helper exists anywhere in the harness
- [ ] Kernel int-specs use `withTestDb`; no `createTestPool()` inside an `it` body in this scope
- [ ] `pnpm test:int` green

**Scope note (UNT-02)**: the two *entry* int-specs that boot their own `GenericContainer` — `catalog/notification/api/infrastructure/realtime/realtime.int-spec.ts` and `catalog/identity/single-tenant/api/infrastructure/rate-limit/redis-rate-limiter.int-spec.ts` — are **not** migrated here. Entry unit and int specs left scope with the cut; they enter the GA-9 hygiene baseline under T33's `GenericContainer` ban.

**Tests**: integration · **Gate**: scoped
**Commit**: `test(api): int harness — withTestDb, resetDb by schema, shared redis`

### T4: E2E harness and the kernel e2e

**What**: the single app factory and the HTTP/outbox/problem vocabulary; migrate the kernel e2e onto it — **five files today**, not the two the 2026-08-19 audit recorded: `bootstrap-product`, `health`, `openapi-contract`, `runner-env`, `security-bootstrap`.
**Where**: `apps/api/src/shared/test/e2e/{app,http,outbox,wait-for,problem,constants,index}.ts`, `apps/api/test/{openapi-contract,security-bootstrap}.e2e-spec.ts`
**Touches**: `apps/api/src/shared/test/e2e/**`, `apps/api/test/*.e2e-spec.ts`
**Depends on**: T3
**Exclusive**: no
**Reuses**: `apps/api/test/setup/app-factory.ts`, `apps/api/test/setup/cookies.ts`
**Requirement**: HRN-01, HRN-03, HRN-04, HRN-05

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `createE2eApp` covers the three app shapes through `middleware` and `rateLimiter`; `middleware: "none"` still silences the logger and returns a closable app
- [ ] `drainOutbox` takes `dispatchers` as a `Pollable[]` option — no module dispatcher named in the kernel (RULE C) — and rejects with the timeout in the message
- [ ] `expectProblem`, `waitFor`, `cookieValue`, `cookieHeader`, `withE2ePool`, `E2E_ORIGIN` exported and specced
- [ ] **All five** kernel e2e under `apps/api/test/*.e2e-spec.ts` boot through the factory and own no pool of their own (`runner-env` and `health` may legitimately need `middleware: "none"`)
- [ ] `pnpm test:e2e` green

**Tests**: e2e + unit (helpers) · **Gate**: scoped
**Commit**: `test(api): e2e harness — one app factory, problem and outbox vocabulary`

### T5: Runner plumbing and coverage denominator

**What**: reduce `apps/api/test/setup/` to the runner allow-list and exclude the harness from coverage.
**Where**: `apps/api/test/setup/**`, `apps/api/vitest.{config,int.config,e2e.config,shared}.mts`, `vitest.coverage.mts`
**Touches**: the paths above
**Depends on**: T4
**Exclusive**: no
**Reuses**: `apps/api/test/setup/e2e-env.ts` (its env block becomes the shared one)
**Requirement**: ENT-05, COV-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `app-factory.ts`, `cookies.ts`, `test-db.ts`, `test-logger.ts` no longer exist under `test/setup/`; nothing imports them
- [ ] **`test/setup/test-db.int-spec.ts` moves with its subject** into the int harness — a spec may not live under `test/setup/`, and T33's allow-list ban will fail on it otherwise
- [ ] `unit-env.ts` imports the shared env block instead of duplicating `e2e-env.ts`
- [ ] `vitest.coverage.mts` `exclude` covers `**/shared/test/**`, `apps/api/src/modules/*/testing/**`, test files, `*.d.ts`, `apps/api/src/main.ts` (the first, third, fourth and fifth are already there — AD-027; **the entry-barrel one is the only live gap**, and it is a no-op here and load-bearing in the child, where the barrels land inside the `apps/api/src/**` include glob)
- [ ] The floors in `vitest.coverage.mts` are **not touched** — the ratchet left scope (AD-027 stands at a flat 90). `pnpm test:coverage` re-run and the post-exclude numbers reported in the commit body
- [ ] All three tiers still discover and run the same file set as before the change

**Tests**: none (config) · **Gate**: full-unit
**Commit**: `test(api): shrink runner plumbing, exclude the harness from coverage`

### T6: Identity `testing/` barrel

**What**: give identity a real barrel — it is the helper every other entry's e2e imports.
**Where**: `catalog/identity/single-tenant/api/testing/index.ts` (+ the loose files already there), `catalog/identity/single-tenant/api/module.json`
**Touches**: `catalog/identity/single-tenant/api/testing/**`, `catalog/identity/single-tenant/api/module.json`, `catalog/identity/single-tenant/api/identity.config.fixture.ts`
**Depends on**: T5
**Exclusive**: no
**Reuses**: `testing/{seed-user,allow-all-rate-limiter}.ts`, `testing/seeds/**`, `identity.config.fixture.ts`
**Requirement**: ENT-01, ENT-04, UNT-03

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `index.ts` exports `seedUser` (with `accessProfile: "master"` demoting a previous master), `loginAs`, `tokenFromMail`, `makeUser`, `makeIdentityConfig`, `emails`, `seedEmail`, `allowAllRateLimiter`
- [ ] `identity.config.fixture.ts` moved into `testing/` and re-exported
- [ ] Identity's local `FakeMailer` is deleted in T17's favour, or kept only as a re-export — no second implementation
- [ ] `module.json.files` lists `testing/**`; `pnpm catalog:check` green for identity
- [ ] The barrel imports nothing from another entry except along `dependsOn`

**Tests**: none of its own (exercised by C3) · **Gate**: scoped
**Commit**: `test(identity): testing barrel — seed, login, builders, config fixture`

### T7: Web harness additions — **both shells (GA-8)**

**What**: the missing web helpers and the deletion of the unused one, in `web-vite` **and** `web-next`.
**Where**: `apps/web-vite/src/shared/test/{create-query-wrapper,mock-router,reset-auth-state,index}.ts(x)` and the identical relative paths under `apps/web-next/src/shared/test/`
**Touches**: `apps/web-vite/src/shared/test/**`, `apps/web-next/src/shared/test/**`
**Depends on**: None
**Exclusive**: no
**Reuses**: `render-with-providers.tsx`, `msw-server.ts` — present in both shells and **byte-identical today** (verified 2026-08-24)
**Requirement**: WEB-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `createQueryWrapper`, `mockRouter` (one `vi.hoisted` shape), `resetAuthState`, `useMswServer`, `makeTestQueryClient` exported from one index **in each shell**, at the identical relative path
- [ ] The shell-agnostic half — `renderWithProviders`, `makeTestQueryClient`, `createQueryWrapper`, `resetAuthState`, `useMswServer` — is **byte-identical between the two shells**; `diff` proves it and the result goes in the commit body
- [ ] `mockRouter` is the **only** divergent file: `@tanstack/react-router` in `web-vite`, the Next router in `web-next`
- [ ] `fixed-clock.ts` deleted from **both** shells and nothing references it
- [ ] Each helper typed, no `as unknown as` outside the folder
- [ ] `pnpm vitest run --project web` green for both shells

**Note**: every `apps/web/**` path in `spec.md` P1 § *Web harness adoption* reads as both shells here (`spec.md:27-33`, GA-8). AC3 (a current-user fixture from the identity entry's web testing barrel) has **no owner in the cut scope** — no web `testing/` barrel task survived; if the fixture is needed, keep it local and report it in the summary rather than inventing a barrel.

**Tests**: unit · **Gate**: quick
**Commit**: `test(web): harness in both shells — router mock, query wrapper, auth reset`

### T17: Notification `testing/` barrel

**What**: notification becomes the single owner of `FakeMailer`.
**Where**: `catalog/notification/api/testing/index.ts`, `catalog/notification/api/module.json`
**Touches**: `catalog/notification/api/testing/**`, `catalog/notification/api/module.json`
**Depends on**: None
**Exclusive**: no
**Reuses**: `catalog/notification/api/testing/fake-mailer.ts`
**Requirement**: ENT-02, ENT-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `index.ts` exports `FakeMailer`, `findSent`, `makeNotification`, `DELIVERY_DISPATCHERS(app)`
- [ ] `module.json.files` lists `testing/**`; `pnpm catalog:check` green for notification
- [ ] The barrel names no other entry's vocabulary

**Touches correction (orchestrator, 2026-08-25)**: T17 also owns `catalog/identity/single-tenant/api/testing/**` and `catalog/identity/single-tenant/api/__e2e__/**`. T6 left identity's local `fake-mailer.ts` in place and deferred the deduplication here ("deleted in T17's favour, or kept only as a re-export — no second implementation"), so the single-owner move cannot land inside `catalog/notification/**` alone. The import crosses identity → notification, the `dependsOn` edge `context.md` § *Declined* already names.

**Tests**: none of its own · **Gate**: quick
**Commit**: `test(notification): testing barrel — mailer, findSent, dispatchers`

### T18: Attachment `testing/` barrel

**What**: storage fake, image bytes and seed, in the entry that owns them.
**Where**: `catalog/attachment/api/testing/index.ts`
**Touches**: `catalog/attachment/api/testing/**`, `catalog/attachment/api/module.json`
**Depends on**: T17
**Exclusive**: no
**Reuses**: the in-memory storage currently inlined in attachment's e2e
**Requirement**: ENT-02, ENT-04

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `inMemoryStorage()` implements the full `ObjectStoragePort` including `getStream`, and exposes its `objects` for assertions
- [ ] `PNG_1PX`, `seedAttachment`, `makeAttachment` exported; the byte literal exists in exactly one file
- [ ] `module.json.files` lists `testing/**`; `pnpm catalog:check` green for attachment

**Tests**: none of its own · **Gate**: quick
**Commit**: `test(attachment): testing barrel — in-memory storage, seeds, fixtures`

### T23: Tag and audit `testing/` barrels

**What**: the two entries that have no test vocabulary of their own.
**Where**: `catalog/tag/api/testing/index.ts`, `catalog/audit/api/testing/index.ts`
**Touches**: `catalog/{tag,audit}/api/testing/**`, both `module.json`
**Depends on**: None
**Exclusive**: no
**Reuses**: the seeds currently inlined in their e2e
**Requirement**: ENT-02, ENT-04, UNT-03

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `makeTag`/`seedTag` and `makeAuditEntry`/`seedAuditEntry` exported, typed, no `any`
- [ ] **`catalog/audit/api/testing/` already exists** with `reattach-identity-tables.ts` and `reattach-tag-tables.ts` (the 2026-08-19 audit recorded the folder as absent — it is not). Both files have live consumers: **keep them and re-export them from the index**, do not replace them. Only `catalog/tag/api/testing/` is created from nothing
- [ ] `module.json.files` lists `testing/**` for both; `pnpm catalog:check` green for both
- [ ] Neither barrel names another entry's vocabulary except along `dependsOn`

**Tests**: none of their own · **Gate**: quick
**Commit**: `test(tag,audit): testing barrels`

### T31: Test lint plugins

**What**: wire the four plugins and prove they actually resolve.
**Where**: `packages/eslint-config/{vitest.js,react.js,package.json}`, `packages/eslint-config/config.test.js`
**Touches**: the same
**Depends on**: None
**Exclusive**: no
**Reuses**: the existing flat-config shape of the package
**Requirement**: LNT-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] `@vitest/eslint-plugin` already covers the api and web test globs and `eslint-plugin-testing-library` the web ones (`packages/eslint-config/vitest.js:1-2`, vitest-migration) — this task adds `eslint-plugin-jest-dom` on the web globs and pins the versions
- [ ] `no-focused-tests`, `no-disabled-tests`, `expect-expect`, `no-conditional-expect` resolve as `error` for both an api and a web test file, asserted by the config test
- [ ] `pnpm lint` green on the whole repository — no `eslint-disable`, no allow-list

**Tests**: unit (config test) · **Gate**: full-unit
**Commit**: `chore(eslint): test lint plugins for api and web`

### T32: Local rule `no-existence-only-assert`

**What**: make lesson L-007 mechanical.
**Where**: `packages/eslint-config/rules/no-existence-only-assert.{js,test.js}`, registration in `base.js`/`react.js`
**Touches**: the same
**Depends on**: T31
**Exclusive**: no
**Reuses**: `rules/sr-only-requires-positioned-ancestor.{js,test.js}` and its registration at `react.js:9,13,66`
**Requirement**: LNT-02

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Reports a body whose every `expect` ends in `toBeDefined`/`toBeUndefined`/`toBeTruthy`/`toBeFalsy`/`resolves|rejects.toBeDefined`/argument-less `not.toThrow`
- [ ] Does not report when a concrete value is also asserted, when `expect.assertions(n)` is declared, or when `not.toThrow(matcher)` has an argument
- [ ] RuleTester suite covers both lists; the rule is registered as `error` for api and web test globs
- [ ] `pnpm lint` green on the repository

**Tests**: unit (RuleTester) · **Gate**: full-unit
**Commit**: `feat(eslint): no-existence-only-assert rule`

### T33: Guard spec

**What**: the executable form of every duplication ban — the component that keeps the refactor from decaying.
**Where**: `apps/api/src/shared/test/hygiene/{scan.ts,scan.spec.ts,harness-hygiene.spec.ts}`
**Touches**: `apps/api/src/shared/test/hygiene/**`
**Depends on**: T32
**Exclusive**: no
**Reuses**: the file-walk of `apps/api/src/modules/module-boundaries.spec.ts`
**Requirement**: HRN-01, HRN-02, HRN-05, HRN-06, UNT-01, UNT-03, ENT-05

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] One `it` per ban, each failure listing `rule · file:line · snippet`
- [ ] Bans: single `Test.createTestingModule`; no banned helper definition; no `PNG_1PX`, origin or password literal outside the harness and barrels; no `createTestPool(` inside an `it`; no `Record<string, any>` in a spec; `as never`/`as unknown as` only under `shared/test/**`; no `fromProps` in a spec; no `GenericContainer` in an int-spec; `test/setup/` matches the runner allow-list
- [ ] The scanner ignores `node_modules`, `dist`, `coverage` and `apps/api/.catalog-stage/**`, and works on both the template layout and a child's `apps/api/src/modules/*/testing/**` — asserted by `scan.spec.ts` against fixtures
- [ ] The spec is green on the tree and red on a seeded violation for every ban (verified once, reverted)

**Tests**: unit · **Gate**: full-unit
**Commit**: `test(api): harness hygiene guard spec`

### T34: RULE D for entry test imports

**What**: a `testing/` import must be backed by `dependsOn` and must not close a cycle.
**Where**: `apps/api/src/modules/module-boundaries.spec.ts`, `scripts/platform/catalog-lint.mjs`
**Touches**: the two files
**Depends on**: T33
**Exclusive**: no
**Reuses**: RULE C's implementation in the same spec, `resolveDeps` in the platform scripts
**Requirement**: ENT-03

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] An import of `catalog/<other>/api/testing/**` fails unless `<other>` is in the importer's `module.json.dependsOn`
- [ ] An import that would close a cycle in the `dependsOn` DAG fails with the cycle named (AD-025)
- [ ] `catalog-lint` reports the same violation for an entry checked outside a child
- [ ] Both rules verified against a scratch violation, reverted; `pnpm test:scripts` and `pnpm catalog:lint` green

**Tests**: unit + node:test · **Gate**: full-unit
**Commit**: `test(catalog): RULE D — testing imports follow dependsOn`

### T35: Rewrite `docs/test/testing.md`

**What**: the handbook describes the harness that now exists (absorbs v1 T26).
**Where**: `docs/test/testing.md`, `catalog/*/README.md` § *Tests*
**Touches**: the same
**Depends on**: None
**Exclusive**: no
**Reuses**: the section skeleton already in the file
**Requirement**: DOC-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Documents the three harness folders with their exported API, the entry `testing/` convention, the parity suites, RULE C and RULE D, the lint rules, the real CI, the pre-push suite and the coverage thresholds
- [ ] No reference to an inline `Test.createTestingModule` bootstrap, to `test/setup/seed-user`, to `test/setup/fake-mailer` or to any file the refactor removed
- [ ] Each entry README § *Tests* states where the entry's helpers live and what a dependent may import
- [ ] `rg -n 'Test\.createTestingModule|test/setup/seed-user' docs/test/testing.md` returns nothing

**Tests**: none (docs) · **Gate**: quick
**Commit**: `docs(test): rewrite testing.md for the shared harness`

### T37: Turbo pipelines and the CI workflow

**What**: close the gaps in the pipeline vitest-migration created.
**Where**: `.github/workflows/ci.yml`
**Touches**: the file
**Depends on**: None
**Exclusive**: **yes** — root configuration
**Reuses**: the existing `ci.yml` (jobs `quality`, `test-unit`, `test-coverage`) and `catalog.yml` as the shape reference (Node from `.nvmrc`, pnpm from `packageManager`)
**Requirement**: CI-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] On top of the existing `quality`, `test-unit` and `test-coverage` jobs: a `contract` job that fails on a dirty `openapi.json`, and `sequence.shuffle` on the `api-e2e` project in CI
- [ ] The Docker-bound job (`test-coverage`, which carries int and e2e) declares its services; jobs are independent so one red job never masks another
- [ ] `turbo.json` stays free of any `test*` task (AD-028) — tests run outside Turbo
- [ ] **`catalog.yml` no longer exists** (the workflows are `ci.yml`, `release.yml`, `format.yml`) — the stale Done-when about it is void. The live constraint is the opposite one: **any job added to `ci.yml` must also reach `release.yml`**. `release-gate-parity.test.mjs` derives the release's required jobs from the `ci.yml` jobs carrying a `web_stack` leg, so a CI-only job fails `pnpm test:scripts` by design — two gates over one tree with the weaker one holding the tag is how `v2.4.0` shipped broken (`GT10`, `186ccb3`)
- [ ] `pnpm test:scripts` green, `release-gate-parity` included
- [ ] The workflow runs green on the feature branch (run URL in the commit body)

**Tests**: none (CI config) · **Gate**: scoped
**Commit**: `ci: pipeline for check, unit, int, e2e, contract and coverage`

### T38: Gate shape test

**What**: keep the local gates from silently drifting.
**Where**: `scripts/platform/__tests__/gates.test.mjs`
**Touches**: the new file
**Depends on**: T37
**Exclusive**: **yes**
**Reuses**: the existing `node --test` suites under `scripts/platform/__tests__/`
**Requirement**: CI-02

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] Asserts pre-push runs `migrations → typecheck → catalog-typecheck → test-coverage` (AD-027) and that `test-coverage` is the only Docker-bound step
- [ ] Asserts `turbo.json` and the app manifests carry no `test*` task or script (AD-028) — GAT-07 already asserts the api side
- [ ] `pnpm test:scripts` green

**Tests**: node:test · **Gate**: scoped
**Commit**: `test(scripts): assert the pre-push and turbo gate shape`

### T40: Closure

**What**: record the decision and hand the feature to the Verifier.
**Where**: `.specs/STATE.md`, `.specs/features/test-suite-refactor/**`
**Touches**: the same
**Depends on**: T38
**Exclusive**: **yes**
**Reuses**: the AD block drafted in `design.md` § *Tech Decisions*
**Requirement**: DOC-01

**Tools**: MCP NONE · Skill NONE

**Done when**:

- [ ] AD-023 appended to `.specs/STATE.md` § *Decisions* with status `active`, dated, RULE D included
- [ ] The Handoff entry for this feature reflects the wave plan actually executed
- [ ] `node scripts/platform/it-count.mjs --check .specs/features/test-suite-refactor/baseline.json` passes with the single documented removal accounted for

**Tests**: none · **Gate**: quick
**Commit**: `docs(specs): AD-023 active, test-suite-refactor closeout`

## Wave Execution Map

```
Wave 1  C1 kernel harness (opus)      T1 → T2 → T3 → T4 → T5 → T6
        C2 web harness, 2 shells      T7
        Build gate: full-unit
Wave 2  C3 entry barrels (sonnet)     T17 → T18 → T23
        Build gate: full-unit
Wave 3  C4 enforcement (opus/sonnet)  T31 → T32 → T33 → T34
        C5 root gates (sonnet)        T37 → T38
        C6 docs (sonnet)              T35
        Build gate: full-unit
Wave 4  C7 closure (sonnet)           T40                       [exclusive]
        Build gate: quick
Verifier (fresh, sonnet; opus if the sensor targets the access guard or the session cookie)
```

## Task Granularity Check

| Tasks | Why they are separate | OK |
| --- | --- | --- |
| T1, T2, T3, T4 | baseline, then one harness tier each — different files, each independently verifiable | ✅ |
| T5, T6 | runner plumbing vs the first entry barrel — different ownership lines | ✅ |
| T7 | one task for both shells on purpose: the GA-8 parity assertion is only meaningful if both land together | ✅ |
| T17, T18, T23 | one entry per task (T23 pairs tag + audit, same shape, two small entries) | ✅ |
| T31, T32 | plugin wiring vs a local rule with its own RuleTester suite | ✅ |
| T33, T34 | the guard spec scans test files; RULE D is a boundaries assertion over imports — different mechanisms | ✅ |
| T37, T38 | the workflow vs the test that pins its shape | ✅ |
| T35, T40 | docs vs the decision record | ✅ |

## Dependency Cross-Check

| Task | Depends on | Cluster chain | OK |
| --- | --- | --- | --- |
| T1 | None | first in C1 | ✅ |
| T2–T6 | T1 → T2 → T3 → T4 → T5 | the same chain in C1 | ✅ |
| T7 | None (wave 1, independent of C1 — web imports no api harness) | alone in C2 | ✅ |
| T17, T18, T23 | wave-1 output only, then the chain in C3 | ✅ |
| T31 | wave-2 output (the tree it baselines must have stopped moving) | first in C4 | ✅ |
| T32–T34 | T31 → T32 → T33 | the same chain in C4 | ✅ |
| T37, T38 | None → T37 | C5 | ✅ |
| T35 | wave-2 output (it documents the harness that exists) | alone in C6 | ✅ |
| T40 | T38 (**amended** — the old T39 is cut) | C7, exclusive wave | ✅ |

## Wave/Cluster Cross-Check

| Wave | Cluster | Tasks | Files | Overlap with a sibling cluster | Exclusive | OK |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | C1 | T1→…→T6 | `apps/api/**`, `catalog/identity/single-tenant/api/**`, root vitest configs | no | no | ✅ |
| 1 | C2 | T7 | `apps/web-vite/**`, `apps/web-next/**` | no | no | ✅ |
| 2 | C3 | T17→T18→T23 | `catalog/{notification,attachment,tag,audit}/api/**` | alone in the wave | no | ✅ |
| 3 | C4 | T31→…→T34 | `packages/eslint-config/**`, `apps/api/src/shared/test/hygiene/**`, `module-boundaries.spec.ts`, `catalog-lint.mjs` | no | no | ✅ |
| 3 | C5 | T37→T38 | `.github/workflows/**`, `scripts/platform/__tests__/**` | no | no | ✅ |
| 3 | C6 | T35 | `docs/test/testing.md` | no | no | ✅ |
| 4 | C7 | T40 | `.specs/**` | n/a | yes — alone in wave 4 | ✅ |

## Test Co-location Validation

| Tasks | Subject | Tier the subject demands | Tier the task writes | OK |
| --- | --- | --- | --- | --- |
| T2, T3, T4 | harness helpers | the harness gets its own failure-path specs | unit + int on the helper itself | ✅ |
| T4, T17, T18, T23 | the e2e each moves | e2e, order-independent | e2e + `--sequence.shuffle` | ✅ |
| T6, T17, T18, T23 | entry barrels | proved by their own entry's e2e | e2e through the barrel | ✅ |
| T5 | runner plumbing and denominator | gate result | `pnpm test:coverage` named in Done-when | ✅ |
| T7 | web harness | component render through the harness, in both shells | vitest, both projects | ✅ |
| T31, T32 | lint rules | RuleTester | `node --test` in `packages/eslint-config` | ✅ |
| T33, T34 | guard spec, RULE D | the spec is the test | vitest, seeded-violation proof | ✅ |
| T37, T38 | repo tooling | node:test | node:test | ✅ |
| T35, T40 | docs, decision record | none / gate | gate result named in Done-when | ✅ |

## Requirement mapping

| Requirement | Tasks |
| --- | --- |
| HRN-01 | T4, T33 |
| HRN-02 | T3, T33 |
| HRN-03 | T4 |
| HRN-04 | T4 |
| HRN-05 | T4, T33 |
| HRN-06 | T4, T17, T18, T23, T33 |
| ENT-01 | T6 |
| ENT-02 | T17, T18, T23 |
| ENT-03 | T34 |
| ENT-04 | T6, T17, T18, T23 |
| ENT-05 | T5, T33 |
| UNT-01 | T2, T33 |
| UNT-02 | T3 |
| UNT-03 | T6, T17, T18, T23, T33 |
| UNT-04 | T2 |
| LNT-01 | T31 |
| LNT-02 | T32 |
| WEB-01 | T7 |
| CI-01 | T37 |
| CI-02 | T38 |
| DOC-01 | T35, T40 |
| STR-04 | **T1 — NOT cut.** (Corrected 2026-08-24: the row below originally read `STR-01, STR-02, STR-03, STR-04 — cut`, which contradicted T1's own `Requirement: STR-04`, `design.md` § *Components 10*, the `final` gate, T40's Done-when, § *Success Criteria* and the probe budget. The `it`-count non-weakening probe is the feature's central safeguard and cutting it would also contradict GA-7.) |
| STR-01, STR-02, STR-03 | — cut — the weak asserts of files nobody is migrating stay weak until the file is next touched; T32's rule blocks a *new* existence-only assert and T33's baseline records the existing ones, so the count can only fall |
| WEB-02, WEB-03 | — cut — the web migration; baselined by GA-9, enforced forward by T7's harness plus the lint rules. **WEB-03's AC3 needs no work under any scope**: the fixture it asks for already exists (`catalog/identity/single-tenant/web/core/session.fixture.ts` → `makeCurrentUser()`), the "web testing barrel" it named may not be built (`docs/arch/front.md` forbids front `index` barrels), and it is unprovable in the template — the shells have no identity entry installed. See the amendment in `spec.md` P1 § *Web harness adoption* |
| COV-01..COV-11 | — cut — satisfied by `audit-2026-08-23-remediation` (96.5 / 94.4 / 94.9 / 96.8 over a 90 floor). The denominator half of COV-04 survives inside T5, because the entry-barrel exclude is still a live defect **in the child** |
| GAP-01, GAP-02 | — cut — real gaps, but unrelated to duplication; their own follow-up |
| DOC-02 | — cut — the `api-client` no-op test; folded into T35 if free |

**32 requirements: 22 mapped, 10 cut with a reason. None dropped silently.** (Corrected 2026-08-24 from "21 mapped, 11 cut" — that arithmetic was derived from the STR-04 lump fixed above. `.specs/STATE.md` § *Handoff* carries the same stale "11 of the 32" and is corrected at T40.)

## Tips

- The harness is a product with users: every helper gets a spec for its failure path, because a harness that fails silently poisons every suite that uses it.
- Migrate a file in two steps inside the same task — first swap the helper, run the file, then strengthen the assertions. Doing both blind makes a red suite ambiguous.
- Preserve `it` titles verbatim when splitting a file; the baseline matches by title and a rename reads as a deletion.
- A strengthened assertion is worth what it rejects: prove it once against a scratch mutation of the production file, then revert. Never commit the mutation.
- When a migration reveals a real bug, stop and report it in the wave summary — do not fix production code inside a test task.
- `pnpm catalog:check` installs the entry into a scratch child; it is the only proof that `module.json.files` really carries `testing/**`.

## Task Verification Standards

- A task is done when its gate passes — the runner decides, never self-assessment. Tests are never weakened, skipped or deleted to make a gate pass.
- One atomic commit per task, pathspec-limited to the task's `Touches`. No `git add -A`, no `commit -a`, no `stash`, no branch operations inside a worker.
- A worker that needs a file it does not own stops and reports; it never edits across the ownership line.
- Every migration task states the `it` count before and after in its commit body; a drop is a failure, not a note.
- The full suite runs exactly once, at the Verifier's Final gate. Wave Build gates are scoped unless the wave is marked `full-unit`.
- The Verifier is dispatched automatically after wave 5 — fresh, author ≠ verifier, evidence-or-zero — and writes `validation.md`.
