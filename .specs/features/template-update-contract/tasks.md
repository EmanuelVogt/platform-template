# template-update-contract Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its
Execute flow and Critical Rules.** Do not search for skill files by filesystem path. If the
skill cannot be activated, STOP and tell the user.

**Design**: `.specs/features/template-update-contract/design.md`
**Status**: Execute — all 3 waves DONE, 17/17 tasks, build gates green; Verifier dispatched

**Execute preconditions (hard):**
1. Clean working tree. At authoring time a parallel session holds uncommitted WIP on
   `scripts/platform/cli.mjs`, `scripts/platform/lib/exit-codes.mjs`,
   `scripts/platform/lib/catalog-source.mjs`, `scripts/platform/lib/migrations.mjs`
   (feature `platform-feedback`). That work must be committed/merged first — C6 owns
   `cli.mjs` and several tasks read the other files.
2. Design deviation recorded here: REL-05 is enforced by the **preflight only** (spec wording);
   the `runLint` wiring mentioned in design.md is dropped to keep C1/C3 file ownership disjoint.
   `lintChildMigrationSteps` lives in `lib/kernel-version.mjs` (changelog domain), not `lib/lint.mjs`.
3. `.specs/` writes (incl. AD-034) are the orchestrator's, never a worker's.

## Test Coverage Matrix

> Guidelines found: `AGENTS.md.jinja`/`docs/test/testing.md` (repo standard), existing
> `scripts/platform/__tests__/*.test.mjs` (node:test, injectable `exec`/`run`/`now`, fixture
> dirs under `__tests__/fixtures/`). This feature never touches `apps/**`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| `scripts/platform/lib/**`, `scripts/platform/*.mjs` | unit (node:test) | All branches; 1:1 to the ACs each task carries; every listed edge case | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| `.claude/hooks/*.mjs` | unit via extracted lib + hook-level test with injected env | Silent-failure paths asserted (exit 0, no output) | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| `.github/workflows/*.yml` | none — probe | `actionlint` clean + structure review (needs/permissions) | — | probe |
| `docs/**`, advisories md | none | lint gates only | — | `pnpm catalog:lint` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | after every task | `node --test scripts/platform/__tests__/<touched>.test.mjs` |
| Full | n/a (no integration/e2e layer in scope) | — |
| Build | once per wave (runner) | `pnpm test:scripts && pnpm catalog:lint` |
| Final | once, Verifier | `pnpm check && pnpm test && pnpm test:scripts && pnpm catalog:lint && pnpm catalog:typecheck` |

Suite-cost rule: `pnpm test` (full vitest) runs only at the Final gate.

## Wave Plan

| Wave | Cluster | Tasks (in order) | Files (union of Touches) | Notes |
| --- | --- | --- | --- | --- |
| 1 | C1 ledger | T1 → T3 → T2 → T4 | `scripts/platform/lib/advisories.mjs`, `scripts/platform/lib/lint.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/lib/commands/status.mjs`, `scripts/platform/lib/commands/advisory.mjs`, `.claude/hooks/pending-advisories.mjs`, `scripts/platform/__tests__/advisories.test.mjs`, `scripts/platform/__tests__/lint.test.mjs`, `scripts/platform/__tests__/pending-advisories.test.mjs`, `scripts/platform/__tests__/cli.test.mjs`, `docs/advisories/ADV-20260823-01.md`, `docs/advisories/ADV-20260823-02.md`, `docs/advisories/README.md` | kernel advisories vertical · gate: scoped |
| 1 | C2 feed+cadence libs | T5 → T6 | `scripts/platform/lib/advisory-feed.mjs`, `scripts/platform/lib/cadence.mjs`, `scripts/platform/__tests__/advisory-feed.test.mjs`, `scripts/platform/__tests__/cadence.test.mjs` | pure libs, injectable exec/now · gate: scoped |
| 1 | C3 release core | T9 → T10 → T11 | `scripts/platform/lib/kernel-version.mjs`, `scripts/platform/__tests__/kernel-version.test.mjs`, `scripts/platform/release-preflight.mjs`, `scripts/platform/__tests__/release-preflight.test.mjs`, `.github/workflows/release.yml` | preflight + workflow · gate: scoped |
| 2 | C4 observability | T7 → T8 | `.claude/hooks/template-behind.mjs`, `scripts/platform/lib/template-version.mjs`, `scripts/platform/lib/commands/status.mjs`, `scripts/platform/__tests__/template-version.test.mjs`, `scripts/platform/__tests__/template-behind.test.mjs`, `scripts/platform/__tests__/cli.test.mjs` | hook feed + status cadence · gate: scoped |
| 2 | C5 bot | T12 → T13 → T14 | `scripts/platform/template-update-ci.mjs`, `scripts/platform/__tests__/template-update-ci.test.mjs`, `.github/workflows/template-update.yml` | plan/run split · gate: scoped |
| 2 | C6 migrate | T15 | `scripts/platform/lib/commands/template-migrate.mjs`, `scripts/platform/cli.mjs`, `scripts/platform/migrations/README.md`, `scripts/platform/__tests__/template-migrate.test.mjs` | isolated vertical (route asserted in its own test file, never `cli.test.mjs`) · gate: scoped |
| 2 | C7 docs | T17 | `docs/dev/template-update.md`, `docs/agents/workflow.md`, `docs/dev/template-changelog.md` | AD-034 is appended by the orchestrator when recording this wave · gate: scoped |
| 3 (exclusive) | C8 copier wiring | T16 | `copier.yml`, `scripts/platform/__tests__/copier-delivery.test.mjs` | root config — alone · gate: scoped |

```
Wave 1:  [C1: T1→T3→T2→T4] ∥ [C2: T5→T6] ∥ [C3: T9→T10→T11]
Wave 2:  [C4: T7→T8] ∥ [C5: T12→T13→T14] ∥ [C6: T15] ∥ [C7: T17]
Wave 3:  [C8: T16]  (exclusive)
```

## Task Breakdown

### T1: computePending kernel branch

**What**: `computePending(lock, advisories, ledger, { templateVersion } = {})` — `module: "kernel"` matches `affects` against `templateVersion` (skip lock entirely; absent `templateVersion` → not pending), ledger still silences; entry behavior unchanged.
**Touches**: `scripts/platform/lib/advisories.mjs`, `scripts/platform/__tests__/advisories.test.mjs`
**Depends on**: None · **Exclusive**: no
**Reuses**: existing `computePending` loop (`advisories.mjs:48`), semver.
**Requirement**: KADV-01, KADV-02 (function level), KADV-04
**Done when**: kernel advisory pending at matching version / silent when ledgered / silent when `templateVersion` absent / entry advisories byte-identical behavior (existing tests untouched, still green); quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(advisories): kernel advisories match the installed template version`

### T3: advisory module lint

**What**: `lintAdvisoryModule(advisory, entryNames)` in `lib/lint.mjs` — `module` must be `kernel` or a `discoverEntries`-derived name (`name`/`name/variant`); wired in `runLint` next to `lintKernelRange`.
**Touches**: `scripts/platform/lib/lint.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/__tests__/lint.test.mjs`
**Depends on**: None · **Exclusive**: no
**Reuses**: `lintKernelRange` shape (`lib/lint.mjs:120`), `discoverEntries`.
**Requirement**: KADV-05
**Done when**: unknown module → 1 error naming file+module; `kernel` and the 5 real entries pass; `pnpm catalog:lint` green on HEAD; quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(catalog-lint): advisory module must be kernel or an existing entry`

### T2: callers pass templateVersion

**What**: `status.mjs:39`, `commands/advisory.mjs`, `.claude/hooks/pending-advisories.mjs:29` pass `templateVersion: parseInstalledVersion(answers._commit)`; hook reordered so `noLock` no longer short-circuits kernel advisories (kernel lines first, then noLock notice/entry lines); `--json` keys unchanged.
**Touches**: `scripts/platform/lib/commands/status.mjs`, `scripts/platform/lib/commands/advisory.mjs`, `.claude/hooks/pending-advisories.mjs`, `scripts/platform/__tests__/pending-advisories.test.mjs`, `scripts/platform/__tests__/cli.test.mjs`
**Depends on**: T1 · **Exclusive**: no
**Reuses**: `parseInstalledVersion` (`template-version.mjs:32`), `readTemplateOrigin`.
**Requirement**: KADV-02, KADV-03, KADV-07 (gate: advisory-required tests untouched)
**Done when**: fixture child `_commit: v2.0.0` + no lock → hook prints the kernel advisory line; with lock → kernel + entry lines; `--json` shape asserted; quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): status, advisory and the session hook report kernel advisories`

### T4: retroactive kernel advisories + ledger README

**What**: `ADV-20260823-01.md` (kernel, bug, `affects ">=2.0.0 <2.1.0"`, issue #9, fix = `copier update` to ≥ v2.1.0, parity `scripts/platform/__tests__/lint.test.mjs`) and `ADV-20260823-02.md` (kernel, bug, `affects ">=1.0.0 <2.2.0"`, fixture leak, fix = repair answers per v2.2.0 changelog then `copier update`, parity `scripts/platform/__tests__/copier-answers-leak.test.mjs`); `README.md` documents `module: kernel` + the feed (DOC-03).
**Touches**: `docs/advisories/ADV-20260823-01.md`, `docs/advisories/ADV-20260823-02.md`, `docs/advisories/README.md`
**Depends on**: T3 (lint must accept `kernel`) · **Exclusive**: no
**Reuses**: `ADV-20260822-*` frontmatter format.
**Requirement**: KADV-06, DOC-03
**Done when**: `pnpm catalog:lint` green; probe: hook against `_commit: v2.0.0` fixture prints `ADV-20260823-01 bug <severity> kernel`.
**Tests**: none (lint + T2's hook tests cover) · **Gate**: quick (`catalog:lint`) · **Commit**: `docs(advisories): retroactive kernel advisories for issue #9 and the answers-file leak`

### T5: advisory-feed lib

**What**: `lib/advisory-feed.mjs` — `fetchRemoteAdvisories(source, tag, { cacheRoot, ttlMs=24h, timeoutMs=8000, exec, now })` (sparse clone `docs/advisories` at tag; `tagDate` via `git log -1 --format=%cI`; unparseable file → `skipped[]`; JSON cache keyed source+tag at `platform-template-feed-<hashRef>.json`; throws `FeedUnreachableError`), `mergeAdvisories(local, remote)` by id, remote wins.
**Touches**: `scripts/platform/lib/advisory-feed.mjs`, `scripts/platform/__tests__/advisory-feed.test.mjs`
**Depends on**: None · **Exclusive**: no
**Reuses**: clone recipe of `catalog-source.mjs:resolveCatalog` (read-only reference — file is foreign-WIP dirty; do not edit it), `hashRef` pattern, `loadAdvisories`.
**Requirement**: FEED-01, FEED-03 (lib level), unparseable edge
**Done when**: fresh fetch populates cache / TTL hit skips exec / corrupt cache + failing exec throws / merge prefers remote by id; all with fake exec/now; quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): advisory feed fetched from the latest template tag`

### T6: cadence lib

**What**: `lib/cadence.mjs` — `advisoryIdDate(id)`, `ageDays(iso, now)`, `isOverdue(kind, days)` table `{security:7, breaking:30, bug:30}`.
**Touches**: `scripts/platform/lib/cadence.mjs`, `scripts/platform/__tests__/cadence.test.mjs`
**Depends on**: None · **Exclusive**: no
**Reuses**: none needed.
**Requirement**: CAD-01 (helpers)
**Done when**: id date parsed; boundary days (7/8, 30/31) asserted per kind; malformed id → null, never throws; quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): cadence helpers for advisory age and overdue`

### T9: changelog section helpers + migration-steps rule

**What**: In `lib/kernel-version.mjs`: `readChangelogSection(path, version)` (heading → next-heading slice), `sectionFirstParagraph(section)`, `lintChildMigrationSteps(section, version)` — non-major: every numbered step starts with a backticked command, or section is exactly `None — copier update is enough.`.
**Touches**: `scripts/platform/lib/kernel-version.mjs`, `scripts/platform/__tests__/kernel-version.test.mjs`
**Depends on**: None · **Exclusive**: no
**Reuses**: `CHANGELOG_HEADING` regex.
**Requirement**: REL-05 (rule), MIG-03 (rule it will be checked by)
**Done when**: major with manual steps passes; minor with manual step fails naming the step; sentinel line passes; quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): changelog section helpers and the non-major migration-steps rule`

### T10: release-preflight script

**What**: `scripts/platform/release-preflight.mjs` — `runPreflight({version, repoRoot, exec, log})`: version === latest changelog heading; `git tag -l v<version>` empty; entry-change guard vs previous stable tag (`git diff --quiet` per `discoverEntries` dir + `module.json` version comparison); non-major → `lintChildMigrationSteps`; `--message <version>` prints the section's first paragraph. Named messages, `EXIT_CODES`.
**Touches**: `scripts/platform/release-preflight.mjs`, `scripts/platform/__tests__/release-preflight.test.mjs`
**Depends on**: T9 · **Exclusive**: no
**Reuses**: `readLatestChangelogVersion`, T9 helpers, `discoverEntries`, `stableTagsFromLsRemote` sort for previous-tag pick, injectable `exec`.
**Requirement**: REL-01, REL-04, REL-05
**Done when**: each failure mode → distinct exit + message (fixture repo with fake exec); green path exit 0; `--message` prints exactly the first paragraph; quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): release preflight — version, tag, entry-bump and migration-steps checks`

### T11: release workflow

**What**: `.github/workflows/release.yml` — `workflow_dispatch` input `version`; `concurrency: release`; ref guard `refs/heads/main`; job `verify` (setup block from `catalog.yml` + preflight + `check`/`test`/`test:scripts`/`catalog:lint`/`catalog:typecheck`); job `catalog` (5-entry matrix `pnpm catalog:check <entry>`, needs verify); job `tag` (needs both, `permissions: contents: write`, annotated tag with `--message` output, push).
**Touches**: `.github/workflows/release.yml`
**Depends on**: T10 · **Exclusive**: no
**Reuses**: `catalog.yml` setup + matrix.
**Requirement**: REL-02 (structural: `needs`), REL-03
**Done when**: `actionlint` clean (probe); `tag` job reachable only via green `needs`; no step invents checks the preflight already owns.
**Tests**: none (probe) · **Gate**: quick (actionlint) · **Commit**: `feat(ci): release workflow — gates first, tag last`

### T7: template-behind feed integration

**What**: Extend `.claude/hooks/template-behind.mjs`: when behind, fetch feed (T5) for the latest tag, merge with local advisories, `computePending` with `templateVersion`, print `<id> <kind> <severity> kernel — fix: <first fix line>` per pending; all failures silent exit 0; template repo (no `_src_path`) → no feed. Extract the report builder into `lib/template-version.mjs` (pure, testable); new hook-level test runs the hook as a child process against fixtures (online-fake via exec env indirection, offline, template repo).
**Touches**: `.claude/hooks/template-behind.mjs`, `scripts/platform/lib/template-version.mjs`, `scripts/platform/__tests__/template-version.test.mjs`, `scripts/platform/__tests__/template-behind.test.mjs`
**Depends on**: T1, T5 (wave 1) · **Exclusive**: no
**Reuses**: hook skeleton + dedup, `cachedRemoteStableTags`.
**Requirement**: FEED-02, FEED-03, FEED-04
**Done when**: behind+pending → advisory lines present; feed failure → behind message only, exit 0; template repo → silent; cache-only (exec failing) still prints from cache; quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(harness): template-behind reports kernel advisories from the remote feed`

### T8: status cadence + feed surfacing

**What**: `status.mjs` prints per pending kernel advisory `(<n>d, overdue?)` (T6), `latest <tag> published <n> days ago` from feed `tagDate`, surfaces feed `error`/`skipped`; OK output unchanged; `--json` gains `advisories.pending[].ageDays/overdue` and `template.latestPublishedDaysAgo` (additive keys only).
**Touches**: `scripts/platform/lib/commands/status.mjs`, `scripts/platform/__tests__/cli.test.mjs`
**Depends on**: T2, T5, T6 (wave 1) · **Exclusive**: no
**Reuses**: T5/T6 libs.
**Requirement**: CAD-01, CAD-02, CAD-03, KADV-03
**Done when**: frozen `now` fixtures — 10-day security advisory → `overdue`; 3-day → not; up-to-date child → byte-identical current OK output; quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): status measures advisory age and template staleness`

### T12: bot plan

**What**: `scripts/platform/template-update-ci.mjs` — pure `planUpdate({status, openPrs, closedPrs, openIssues})` → `{action: "none"|"update", tag, reason}`: up-to-date → none; open PR for tag → none; closed-unmerged PR for tag → none; else first behind tag.
**Touches**: `scripts/platform/template-update-ci.mjs`, `scripts/platform/__tests__/template-update-ci.test.mjs`
**Depends on**: None · **Exclusive**: no
**Reuses**: `status --json` shape.
**Requirement**: BOT-01, BOT-03 (idempotency), closed-PR edge, BOT-07
**Done when**: the four plan outcomes asserted; quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): template-update bot decision plan`

### T13: bot run

**What**: Same file: `runUpdate({tag, run, log})` — branch, `copier update --trust --vcs-ref <tag>`, conflict scan (`**/*.rej`; FIRST verify the artifact against the installed copier's conflict behavior and the `template-update` skill's Conflict rules — adjust scan if inline markers), `pnpm platform template migrate`, `pnpm install`, `pnpm check && pnpm test`, then PR (`gh pr create`, body = changelog section) or create-or-comment issue `template update to <tag> blocked` with conflicts/failing tail; origin clone auth failure → non-zero naming `TEMPLATE_READ_TOKEN`.
**Touches**: `scripts/platform/template-update-ci.mjs`, `scripts/platform/__tests__/template-update-ci.test.mjs`
**Depends on**: T12 · **Exclusive**: no
**Reuses**: `catalog-check.mjs` injectable-run shape, `readChangelogSection` (T9).
**Requirement**: BOT-02, BOT-03, BOT-04, BOT-06, BOT-07
**Done when**: fake-run scenarios — green → PR call sequence; conflict → issue + no push; red gate → issue with tail; unreachable → exit non-zero + hint; existing issue → comment not duplicate; quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): template-update bot execution — PR on green, issue on blocked`

### T14: bot workflow

**What**: `.github/workflows/template-update.yml` — weekly cron + dispatch; `if: hashFiles('.copier-answers.yml') != ''`; installs copier (pipx) + pnpm; runs `node scripts/platform/template-update-ci.mjs`; permissions `contents: write, pull-requests: write, issues: write`; optional `TEMPLATE_READ_TOKEN` env.
**Touches**: `.github/workflows/template-update.yml`
**Depends on**: T13 · **Exclusive**: no
**Reuses**: `ci.yml` setup block.
**Requirement**: BOT-05 (inert-in-template guard; shipping is T16)
**Done when**: `actionlint` clean (probe); guard present; minimal permissions.
**Tests**: none (probe) · **Gate**: quick (actionlint) · **Commit**: `feat(ci): weekly template-update workflow for the child`

### T15: template migrate command

**What**: `lib/commands/template-migrate.mjs` + `cli.mjs` route `template migrate [--target vX.Y.Z]` — runs `scripts/platform/migrations/v*.mjs` (each exports `run({cwd, log})`, owns its idempotency) ascending, ≤ target (default `_commit`); stops at first failure naming the script; no dir → success no-op. `migrations/README.md` states the script contract. Route asserted in `template-migrate.test.mjs` via exported `run` — `cli.test.mjs` untouched.
**Touches**: `scripts/platform/lib/commands/template-migrate.mjs`, `scripts/platform/cli.mjs`, `scripts/platform/migrations/README.md`, `scripts/platform/__tests__/template-migrate.test.mjs`
**Depends on**: None (wave 2 by the tree-cleanliness precondition on `cli.mjs`) · **Exclusive**: no
**Reuses**: `registerCommand` pattern (`cli.mjs:46-69`), `parseInstalledVersion`.
**Requirement**: MIG-01, MIG-02
**Done when**: fixture scripts v2.9.0/v3.0.0, installed v2.8.0 target v3.0.0 → ordered run; failing first → second unrun + named; re-run of applied → no-op; no dir → exit 0; quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(platform): template migrate runs versioned migration scripts`

### T17: contract docs + changelog

**What**: `docs/dev/template-update.md` (new, ≤80 lines: the two-sided contract, cadence table, feed, bot; ships to child); `docs/agents/workflow.md` tag rule → "the user dispatches the release workflow; the agent still never tags/pushes"; `docs/dev/template-changelog.md` gains `## v2.3.0` (satisfying T9's rule: `None — copier update is enough.`). AD-034 (both sides + enforcement points) is appended to `.specs/STATE.md` **by the orchestrator** when recording this wave.
**Touches**: `docs/dev/template-update.md`, `docs/agents/workflow.md`, `docs/dev/template-changelog.md`
**Depends on**: T9 (rule the changelog section must satisfy) · **Exclusive**: no
**Reuses**: changelog section format.
**Requirement**: CAD-04, DOC-01 (via orchestrator), DOC-02, MIG-03
**Done when**: `pnpm catalog:lint` green (changelog glob triggers it); `node -e` probe of `lintChildMigrationSteps` on the new section passes; docs-stay-lean hook not tripped (new handbook ≤80 lines).
**Tests**: none · **Gate**: quick (`catalog:lint`) · **Commit**: `docs: template update contract — cadence, release path, v2.3.0 section`

### T16: copier delivery wiring

**What**: `copier.yml` — add `.github/workflows/release.yml` to `_exclude` (next to `catalog.yml` at `copier.yml:31`); assert `template-update.yml`, `docs/dev/template-update.md`, `scripts/platform/migrations/**` are NOT excluded. New `copier-delivery.test.mjs` asserts the exclude list both ways (pattern: `copier-answers-leak.test.mjs`).
**Touches**: `copier.yml`, `scripts/platform/__tests__/copier-delivery.test.mjs`
**Depends on**: T11, T14, T15, T17 (files must exist) · **Exclusive**: **yes** (root config)
**Reuses**: `copier-answers-leak.test.mjs` approach.
**Requirement**: BOT-05 (ships), CAD-04 (ships), REL — release.yml template-only
**Done when**: test red if `release.yml` missing from `_exclude` or `template-update.yml` wrongly excluded; quick gate passes.
**Tests**: unit · **Gate**: quick · **Commit**: `chore(copier): ship the update contract to the child, keep release template-only`

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram | Status |
| --- | --- | --- | --- |
| T1 none · T3 none · T5 none · T6 none · T9 none · T12 none · T15 none | — | wave-1/2 roots | ✅ |
| T2 | T1 | C1 order T1→T3→T2 | ✅ |
| T4 | T3 | C1 order …T3→…→T4 | ✅ |
| T10 | T9 | C3 T9→T10 | ✅ |
| T11 | T10 | C3 T10→T11 | ✅ |
| T7 | T1, T5 (wave 1) | wave 2 after wave 1 | ✅ |
| T8 | T2, T5, T6 (wave 1) | C4 T7→T8 | ✅ |
| T13 | T12 · T14 | T13 | C5 order | ✅ |
| T17 | T9 (wave 1) | wave 2 | ✅ |
| T16 | T11, T14, T15, T17 (waves 1–2) | wave 3 | ✅ |

## Wave/Cluster Cross-Check

| Wave | Cluster | Tasks | Deps outside earlier waves / own cluster? | Files shared with sibling? | Exclusive alone? | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | C1 | T1→T3→T2→T4 | none | none (C2/C3 disjoint) | n/a | ✅ |
| 1 | C2 | T5→T6 | none | none | n/a | ✅ |
| 1 | C3 | T9→T10→T11 | none | none | n/a | ✅ |
| 2 | C4 | T7→T8 | wave-1 only | none (`cli.test.mjs` only here in wave 2; `status.mjs` only here) | n/a | ✅ |
| 2 | C5 | T12→T13→T14 | T13 uses T9 (wave 1) | none | n/a | ✅ |
| 2 | C6 | T15 | none | none (`cli.mjs` only here; own test file) | n/a | ✅ |
| 2 | C7 | T17 | T9 (wave 1) | none | n/a | ✅ |
| 3 | C8 | T16 | waves 1–2 | — | yes — only task | ✅ |

Granularity: every task = one script/lib/workflow/doc set with its tests; none spans verticals.

## Test Co-location Validation

| Task | Layer | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T1,T2,T3,T5,T6,T9,T10,T12,T13,T15,T16 | scripts lib/CLI | unit | unit | ✅ |
| T7,T8 | hook + scripts | unit | unit | ✅ |
| T11,T14 | workflow yml | none (probe) | none (probe) | ✅ |
| T4,T17 | docs/advisories md | none (lint gate) | none | ✅ |

## Coverage

31 ACs → all mapped: REL-01/04/05→T10 (REL-05 rule T9), REL-02/03→T11, KADV-01/02/04→T1(+T2), KADV-03→T2/T8, KADV-05→T3, KADV-06→T4, KADV-07→T2, FEED-01/03→T5(+T7), FEED-02/04→T7, CAD-01→T6/T8, CAD-02/03→T8, CAD-04→T17+T16, BOT-01/03→T12, BOT-02/04/06→T13, BOT-05→T14+T16, BOT-07→T12/T13, MIG-01/02→T15, MIG-03→T17, DOC-01→orchestrator@wave-2 record, DOC-02→T17, DOC-03→T4. 0 unmapped.

## Execution Record

| Wave | Cluster | Task | Commit | Status |
| --- | --- | --- | --- | --- |
| 1 | C1 | T1 | `db8149d` | DONE |
| 1 | C1 | T3 | `779eb8a` | DONE |
| 1 | C1 | T2 | `484326b` | DONE |
| 1 | C1 | T4 | `73ddcbd` | DONE |
| 1 | C1 | gate fix | `b2cb486` | DONE |
| 1 | C2 | T5 | `34f7d1a` | DONE |
| 1 | C2 | T6 | `fc3b249` | DONE |
| 1 | C3 | T9 | `057aad6` | DONE |
| 1 | C3 | T10 | `03bfaa1` | DONE |
| 1 | C3 | T11 | `fd5fb30` | DONE |

**Wave 1 Build gate**: `pnpm test:scripts` 314/314 pass (pre-feature baseline 279), `pnpm catalog:lint` exit 0.
First run failed on `copier-answers-leak.test.mjs` — C1's new hook fixtures shipped a tracked
`.copier-answers.yml` (the leak class `ADV-20260823-02` documents); fixed in `b2cb486` by building
those fixtures at test setup in a temp dir. All workers sonnet.

**Wave 1 deviations recorded**
- T2: `lib/commands/advisory.mjs` untouched — it only exports `detectCommand`, which never calls
  `computePending`; design.md's "all three callers" does not match the current code, so there was
  nothing to wire (the two real callers, `status.mjs` and the hook, do pass `templateVersion`).
- T2: `templateVersion` is passed as `parseInstalledVersion(...)?.version` (a string) rather than the
  parse object design.md names in shorthand — required by `semver.satisfies`.
- T10: no new exit codes; reuses `USAGE_ERROR` (version mismatch), `ALREADY_INSTALLED` (tag exists),
  `TEST_FAILURE` (entry changed without bump), `MIGRATION_FAILURE` (manual step in a non-major).
- T5: unparseable remote advisories are collected by a per-file scan catching `AdvisoryParseError`
  into `skipped[]`, not by `loadAdvisories` (which throws on the first bad file) — satisfies the
  FEED unparseable edge case.

### Wave 2

| Wave | Cluster | Task | Commit | Status |
| --- | --- | --- | --- | --- |
| 2 | C4 | T7 | `1520338` | DONE |
| 2 | C4 | T8 | `ff592f2` + `6e82a92` | DONE |
| 2 | C5 | T12 | `038e54f` | DONE |
| 2 | C5 | T13 | `b4eedd3` | DONE |
| 2 | C5 | T14 | `82cbe41` | DONE |
| 2 | C6 | T15 | `68da35e` | DONE |
| 2 | C7 | T17 | `8ee1323` | DONE |

**Wave 2 Build gate**: `pnpm test:scripts` 345/345 pass, `pnpm catalog:lint` exit 0. All workers sonnet.
**AD-034 appended to `.specs/STATE.md` § Decisions at this record (DOC-01).**

**Wave 2 deviations recorded**
- T8 was returned DONE with the feed `error`/`skipped` surfacing unwritten (the worker read no AC as
  naming it). Not accepted: tasks.md T8 *What* and spec.md § Edge Cases both require `status` to
  surface the parse error. Worker resumed; closed in `6e82a92` with additive keys
  `template.feedError` and `advisories.feedSkipped[]` plus plain-text lines; hook stays silent.
- T13: **design.md's conflict assumption was wrong.** Installed copier 9.17.2 defaults to
  `--conflict inline`, not `rej` (a `.rej` is transient, deleted after the 3-way `git merge-file`).
  The scan is `git grep` for the literal `<<<<<<< before updating` / `>>>>>>> after updating`
  markers, not `**/*.rej` (`template-update-ci.mjs:36-40`). This is the verification the task
  demanded before trusting the artifact.
- T13: `runUpdate` also configures `git user.name/email` and commits before pushing — the task text
  omitted the commit step and the PR branch would otherwise carry no diff.
- T14: `hashFiles()` is not valid in a job-level `if` (actionlint). The BOT-05 inert-in-template
  guard moved to every step after checkout.
- T12: `openIssues` stays in `planUpdate`'s signature for design parity but is unused — the four
  tested outcomes need only `status`/`openPrs`/`closedPrs`.
- T7/T8/C1: no fixture ever commits a literal `.copier-answers.yml`; all child fixtures are built at
  test setup under `mkdtempSync`.

### Wave 3 (exclusive)

| Wave | Cluster | Task | Commit | Status |
| --- | --- | --- | --- | --- |
| 3 | C8 | T16 | `12b6207` | DONE |

**Wave 3 Build gate**: `pnpm test:scripts` 349/349 pass, `pnpm catalog:lint` exit 0. Worker sonnet.
No deviations. The worker verified all four red directions by hand before committing (release.yml
absent from `_exclude`; template-update.yml, the handbook and `scripts/platform/migrations/**`
wrongly excluded).

**Execute complete — 17/17 tasks.** Test count 279 (pre-feature) → 349. Verifier dispatched next.
