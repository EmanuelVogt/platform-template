# Release Marker Commit + CI Consolidation — Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its
Execute flow and Critical Rules.** Do not search for skill files by filesystem path.

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Spec**: `.specs/features/release-marker-commit/spec.md`
**Design**: `.specs/features/release-marker-commit/design.md`
**Status**: Draft — awaiting approval

> **The design outranks the spec where they differ.** `design.md` § *Spec corrections* records
> four: CI-03 omits `template:smoke`; DOC-03's anchors are stale; MARK-03's `tag` needs the
> superset `[marker, verify, catalog]`; and the "matrix runs twice" edge case is dead, because
> `ci.yml` no longer runs on a marker push.

---

## Test Coverage Matrix

> Generated from codebase sampling, project guidelines and the spec — confirm before Execute.
> Guidelines found: `CLAUDE.md`, `AGENTS.md.jinja`, `docs/test/testing.md`, `docs/code-quality.md`,
> `package.json:32` (`test:scripts`), the 44 existing files in `scripts/platform/__tests__/`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Workflow YAML (`.github/workflows/*.yml`) | unit (parsed with the `yaml` package, asserted as data) | Every trigger, every job's `needs`/`if`, every `run:` command the spec names; both branches of each `if` reasoned about explicitly | `scripts/platform/__tests__/{gates,release-workflow}.test.mjs` | `node --test <file>` |
| Node module under `scripts/platform/lib/**` | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `scripts/platform/__tests__/<name>.test.mjs` | `node --test <file>` |
| CLI command under `scripts/platform/lib/commands/**` | unit, deps injected (`exec`, `log`, `cwd`) — the `status.mjs:15-21` idiom | Every refusal path returns its own `EXIT_CODES` value; the happy path asserts exactly one commit, no tag, no push | `scripts/platform/__tests__/release-command.test.mjs`, `cli.test.mjs` | `node --test <file>` |
| Copier manifest (`copier.yml`) | unit | The `_exclude` list and the tracked-file set agree | `scripts/platform/__tests__/copier-delivery.test.mjs` | `node --test <file>` |
| Docs (`docs/**`, `TEMPLATE.md`) | none — guard tests only | The existing doc guards must stay green | `docs-stay-lean`, `template-internal-docs`, `documented-commands` | `node --test <file>` |
| `.specs/**` | none | — | — | — |

**No task in this feature touches `apps/**`.** `pnpm test` (Vitest, 585 tests) therefore cannot
regress before the Final gate, and no wave runs it.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After every task | `node --test <only the test files in this cluster's Touches>` — see each cluster's row in the Wave Plan |
| Full | n/a | This feature has no integration or e2e layer; Full collapses into Quick |
| Build | Once per wave, orchestrator, through the runner | `pnpm check && pnpm test:scripts` |
| Final | Once, at the Verifier | `pnpm check && pnpm test && pnpm test:scripts && pnpm catalog:lint && pnpm catalog:typecheck && pnpm template:smoke` |

> **Why Quick names files instead of running `pnpm test:scripts`.** That script is
> `node --test scripts/platform/__tests__/*.test.mjs` (`package.json:32`) — it runs **all 44
> files**. Four workers sharing one checkout would each execute their siblings' half-written
> specs. The per-cluster file list is the scoping mechanism; the whole suite runs at the wave
> barrier, where nothing is half-written.

**Baseline to preserve:** `pnpm test:scripts` = 376 tests / 42 files at `d373b72`. No task may
lower either number. `pnpm template:smoke` is in the Final gate only — it is the Independent
Test for CI-06 (render a product, assert its `ci.yml` runs no `catalog:*` command).

---

## Wave Plan

Waves run in order (barrier + Build gate between them). Clusters inside a wave run **in
parallel**, one worker each; tasks inside a cluster run in the listed order.

| Wave | Cluster | Tasks (in order) | Files (union of Touches) | Notes |
| --- | --- | --- | --- | --- |
| 1 | C1 | T1 → T2 | `.github/workflows/ci.yml`, `.github/workflows/catalog.yml`, `scripts/platform/__tests__/gates.test.mjs` | CI consolidation · gate: scoped · **sonnet** |
| 1 | C2 | T4 → T5 → T6 → T7 | `scripts/platform/lib/release-marker.mjs`, `scripts/platform/__tests__/release-marker.test.mjs`, `.github/workflows/release.yml`, `scripts/platform/__tests__/release-workflow.test.mjs` | marker vertical · gate: scoped · **sonnet** |
| 1 | C3 | T8 → T9 | `scripts/platform/lib/commands/release.mjs`, `scripts/platform/__tests__/release-command.test.mjs`, `scripts/platform/cli.mjs`, `scripts/platform/__tests__/cli.test.mjs` | CLI vertical, wiring last · gate: scoped · **sonnet** |
| 1 | C4 | T10 → T11 | `docs/agents/workflow.md`, `TEMPLATE.md`, `docs/catalog/catalog.md`, `docs/dev/template.md`, `docs/dev/deploy.md.jinja`, `.github/README.md` | docs · gate: scoped · **haiku** (prose edits, no logic) |
| 2 (exclusive) | C5 | T3 | `copier.yml`, `scripts/platform/__tests__/copier-delivery.test.mjs` | root manifest — alone · gate: scoped · **sonnet** · ⚠ cross-session single-editor collision |
| 3 (exclusive) | C6 | T12 | `.specs/STATE.md` | **orchestrator writes this, never a worker** · gate: none |
| 4 (exclusive) | C7 | T13 | `docs/dev/template-changelog.md` | ✅ **CLOSED as obsolete** — content already shipped in the v2.3.0 section (`e3ac20d`) |

```
Wave 1:  [C1: T1 → T2] ∥ [C2: T4 → T5 → T6 → T7] ∥ [C3: T8 → T9] ∥ [C4: T10 → T11]
Wave 2:  [C5: T3]    (exclusive)
Wave 3:  [C6: T12]   (exclusive, orchestrator)
Wave 4:  [C7: T13]   (exclusive, CLOSED as obsolete — never ran)
```

---

## Task Breakdown

### T1: Merge `catalog.yml` into `ci.yml` behind a `detect` job and delete it

**What**: Rewrite `ci.yml` as the single gate workflow — `detect` + the three existing jobs +
the three template-only jobs — and delete `catalog.yml`.
**Where**: `.github/workflows/ci.yml`
**Touches**: `.github/workflows/ci.yml`, `.github/workflows/catalog.yml` (deleted)
**Depends on**: None
**Exclusive**: no
**Reuses**: `catalog.yml:14-95` verbatim for the three template-only jobs (services block, env
block, pinned action SHAs); `ci.yml:19-63` verbatim for `quality` / `test-unit` / `test-coverage`.
**Requirement**: CI-01, CI-02, CI-03, CI-04, CI-05, CI-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `on:` = `push: branches: [main]` **+** `push: tags: ["v*"]` (inherited from `catalog.yml:7-8`) **+** `pull_request`
- [ ] A `detect` job whose job-level `if` is exactly the branch-scoped form from `design.md`:
      `!(github.event_name == 'push' && github.ref == 'refs/heads/main' && startsWith(github.event.head_commit.message, 'chore(release): '))`
      — **the `github.ref` clause is load-bearing**: without it the `v*` tag push, whose head
      commit *is* the marker, skips too and silently retires AD-033
- [ ] `detect` checks out and writes `template=true|false` to `$GITHUB_OUTPUT` from `[ -d catalog ]`
- [ ] Every other job carries `needs: detect` (so the marker skip cascades from one condition)
- [ ] `quality`, `test-unit`, `test-coverage` keep their exact commands: `pnpm turbo lint typecheck`, `pnpm --filter api build:emit`, `pnpm turbo build --filter=web`, `pnpm test`, `pnpm test:coverage`
- [ ] Three jobs carry `if: needs.detect.outputs.template == 'true'` — `gates` (`pnpm test:scripts`, `pnpm catalog:lint`, `pnpm catalog:typecheck`, the ADV-04 step), `catalog` (the 5-entry matrix), `smoke` (`pnpm template:smoke`)
- [ ] `gates` keeps `fetch-depth: 0` on its checkout (`catalog.yml:19-20`) — `lintEntryBump` resolves the previous stable tag from it, and the sibling feature's T35 depends on it surviving
- [ ] The ADV-04 step keeps its own `if: github.event_name == 'pull_request'` **nested inside** the template gate
- [ ] `pnpm check` and `pnpm test` from `catalog.yml:27-28` are **gone** — `quality` and `test-unit` already run them (this is the whole of CI-02)
- [ ] `.github/workflows/catalog.yml` no longer exists
- [ ] A comment block above `detect.if` states, in English, that this file ships to the child and that a product using the `chore(release): ` subject gets no CI run — the owner-accepted risk from `design.md` § *Risks & Concerns*
- [ ] Gate check passes: `node --test scripts/platform/__tests__/gates.test.mjs` (will fail until T2 — commit T1 and T2 separately, T2's gate is the binding one)

**Tests**: unit (written in T2, same cluster, same worker — not deferred across clusters)
**Gate**: quick
**Commit**: `ci(platform): merge the catalog workflow into ci.yml behind a detect job`

---

### T2: Rewrite `gates.test.mjs` against the merged workflow

**What**: Replace every `catalog.yml` assertion with assertions on the merged `ci.yml`, and add
the ones the six new ACs need.
**Where**: `scripts/platform/__tests__/gates.test.mjs`
**Touches**: `scripts/platform/__tests__/gates.test.mjs`
**Depends on**: T1
**Exclusive**: no
**Reuses**: the file's own `readYaml` idiom (`:23-25`, `parse as parseYaml` from the `yaml`
package); its existing path constants (`:10-17`) minus `catalog.yml`.
**Requirement**: CI-02, CI-03, CI-04, CI-05, CI-06, DOC-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `catalog.yml` is no longer read (the file is gone; a read would throw)
- [ ] **CI-01** — a test asserts `.github/workflows/catalog.yml` does not exist on disk
- [ ] **CI-02** — a test collects every `run:` string across all jobs of `ci.yml` and asserts `pnpm turbo lint typecheck` and `pnpm test` each appear **exactly once**
- [ ] **CI-03** — a test asserts all **nine** commands are present: `turbo lint typecheck`, `--filter api build:emit`, `turbo build --filter=web`, `pnpm test`, `pnpm test:coverage`, `pnpm test:scripts`, `pnpm catalog:lint`, `pnpm catalog:typecheck`, `pnpm catalog:check`, `pnpm template:smoke` — and that no command appears which neither source file ran. **`template:smoke` is the one CI-03's prose omits; it is required** (`design.md` § *Spec corrections*)
- [ ] **CI-04** — a test asserts `on.push.tags` contains `v*`
- [ ] **CI-05** — a test asserts the ADV-04 step's `if` contains `github.event_name == 'pull_request'` and that no other step carries it
- [ ] **CI-06** — a test asserts every job running a `catalog:*`, `test:scripts` or `template:smoke` command carries `needs: detect` **and** an `if` referencing `needs.detect.outputs.template`
- [ ] A test asserts `detect.if` contains `refs/heads/main` — the regression guard for the AD-033 trap in T1
- [ ] A test asserts the merged `gates` job's checkout carries `fetch-depth: 0`
- [ ] Gate check passes: `node --test scripts/platform/__tests__/gates.test.mjs`
- [ ] Test count: the file's count rises; no existing assertion is deleted without its subject being deleted too

**Tests**: unit
**Gate**: quick
**Commit**: `test(platform): assert the merged ci.yml shape and the detect gate`

---

### T3: Drop the `catalog.yml` exclusion from `copier.yml`

**What**: Remove `.github/workflows/catalog.yml` from `copier.yml` `_exclude` and update the
delivery test to assert absence rather than exclusion.
**Where**: `copier.yml:35`
**Touches**: `copier.yml`, `scripts/platform/__tests__/copier-delivery.test.mjs`
**Depends on**: T1
**Exclusive**: **yes** — root manifest, and a cross-session single-editor claim (see § *Cross-feature collisions*)
**Reuses**: `copier-delivery.test.mjs:16` (`_exclude` via yaml parse) and its `git ls-files -z`
call; the AD-034 precedent of asserting **absence, not exclusion** — "an exclusion entry for a
nonexistent file proves nothing".
**Requirement**: CI-01, DOC-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Line 35 (`- .github/workflows/catalog.yml`) is gone from `_exclude`; nothing else in the list moves
- [ ] The `.github/workflows/release.yml` exclusion assertion (`:18-23`) still passes untouched
- [ ] A new test asserts `git ls-files` does not track `.github/workflows/catalog.yml` **and** that the string does not appear in `_exclude`
- [ ] A test asserts `.github/workflows/ci.yml` **is** tracked and is **not** in `_exclude` — it must keep shipping to the child
- [ ] Gate check passes: `node --test scripts/platform/__tests__/copier-delivery.test.mjs scripts/platform/__tests__/child-manifest.test.mjs`

**Tests**: unit
**Gate**: quick
**Commit**: `chore(platform): stop excluding a workflow that no longer exists`

---

### T4: `release-marker.mjs` — the pure grammar and decision functions

**What**: A new module with three pure functions and no I/O, plus its test file.
**Where**: `scripts/platform/lib/release-marker.mjs`
**Touches**: `scripts/platform/lib/release-marker.mjs`, `scripts/platform/__tests__/release-marker.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: `lib/exit-codes.mjs`, `lib/is-main.mjs` (the `isMain` entry idiom every script here
uses); `stableTagsFromLsRemote` in `lib/template-version.mjs` as the grammar reference — the
marker's version must be exactly what that function would accept as a stable tag.
**Requirement**: MARK-02, MARK-06, MARK-07, MARK-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `parseMarkerSubject(subject)` → `{ ok: true, version }` | `{ ok: false, reason }`; grammar `^chore\(release\): v(\d+)\.(\d+)\.(\d+)$` — stable semver, no prerelease, exactly one space
- [ ] `isMarkerSubject(subject)` → boolean, the loose `chore(release):` prefix
- [ ] `decideRelease({ headSubject, subjects, changedFiles })` → `{ action: "release", version }` | `{ action: "skip" }` | `{ action: "fail", reason }`
- [ ] Failure precedence is asserted in that order: malformed head (MARK-06) → a marker subject exists but is not the head (MARK-07) → the head marker changed ≥1 file (MARK-08)
- [ ] `{ action: "skip" }` is returned when **no** subject is a marker — the loose CI filter matched a body line. It must be silent and exit 0, never a failure
- [ ] Every `fail` reason names what is wrong and what the expected form is; MARK-08's names the file count
- [ ] Tests cover the spec's Independent Test verbatim: `chore(release): v2.4.0` ✓, `chore(release): 2.4.0` ✗, `chore(release):v2.4.0` ✗, `chore(release): v2.4.0-rc.1` ✗
- [ ] Tests cover the edge case "two markers ride one push — only the head counts, the earlier trips MARK-07"
- [ ] Gate check passes: `node --test scripts/platform/__tests__/release-marker.test.mjs`
- [ ] Test count: ≥ 12 tests pass

**Tests**: unit
**Gate**: quick
**Commit**: `feat(platform): a tested grammar for the release marker commit`

---

### T5: `--decide` — the git-facing entry that feeds `decideRelease`

**What**: The `isMain` CLI entry that collects the three git facts, calls `decideRelease` and
writes `$GITHUB_OUTPUT`.
**Where**: `scripts/platform/lib/release-marker.mjs`
**Touches**: `scripts/platform/lib/release-marker.mjs`, `scripts/platform/__tests__/release-marker.test.mjs`
**Depends on**: T4
**Exclusive**: no
**Reuses**: `release-preflight.mjs:15-18` (`defaultExec` via `spawnSync`, injectable) and
`:117-127` (the `isMain` + `process.exit` shape).
**Requirement**: MARK-01, MARK-02, MARK-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Collects `git log -1 --format=%s` (head subject), `git log --format=%s <before>..<sha>` (the push's subjects) and `git diff-tree --no-commit-id --name-only -r HEAD` (the head's files)
- [ ] `exec` is injectable, so every test runs without a real repository
- [ ] **Fallback**: when `before` is the all-zeros SHA, or the range `git log` exits non-zero, fall back to `HEAD~1..HEAD`. A range that cannot be resolved must never fail the release
- [ ] Writes `release=true|false` and `version=<x.y.z>` to the file named by `$GITHUB_OUTPUT`
- [ ] Exits `EXIT_CODES.USAGE_ERROR` on `fail`, printing the reason; exits 0 on both `release` and `skip`
- [ ] Tests cover: the all-zeros fallback, a range `git log` failure, `$GITHUB_OUTPUT` unset (must not throw), and each of the three `action` values
- [ ] Gate check passes: `node --test scripts/platform/__tests__/release-marker.test.mjs`
- [ ] Test count: ≥ 8 further tests pass

**Tests**: unit
**Gate**: quick
**Commit**: `feat(platform): decide the release from the pushed commit range`

---

### T6: Rewrite `release.yml` as a marker-driven workflow

**What**: Drop `workflow_dispatch`, its `version` input and the ref guard; trigger on a push to
`main`; add the `marker` job and rewire the `needs` graph.
**Where**: `.github/workflows/release.yml`
**Touches**: `.github/workflows/release.yml`
**Depends on**: T5
**Exclusive**: no
**Reuses**: `release.yml:43-113` verbatim for the `catalog` matrix and the `tag` job body (only
the `VERSION` source changes); `concurrency: release` (`:11`) unchanged.
**Requirement**: MARK-01, MARK-03, MARK-04, MARK-05, MARK-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `on:` is exactly `push: branches: [main]`; `workflow_dispatch` and `inputs.version` are gone
- [ ] The non-main ref guard step (`:21-26`) is gone — `on: push: branches: [main]` makes it unreachable
- [ ] A `marker` job runs first, with `fetch-depth: 0`, calling `node scripts/platform/lib/release-marker.mjs --decide`; outputs `release` and `version`
- [ ] `marker.if` is the **loose** two-clause form from `design.md` — `startsWith(github.event.head_commit.message, 'chore(release):') || contains(join(github.event.commits.*.message, '|'), 'chore(release):')`. **It must not be the strict grammar**: a strict `if` turns a typo into a silent skip, which is exactly what MARK-06 exists to prevent
- [ ] `verify` is `needs: marker` + `if: needs.marker.outputs.release == 'true'`; its six steps are unchanged except `${{ inputs.version }}` → `${{ needs.marker.outputs.version }}`
- [ ] `catalog` is `needs: [marker, verify]` with the same `if`; the matrix and services blocks are byte-identical to today
- [ ] `tag` is `needs: [marker, verify, catalog]` — the **superset** MARK-03 requires, because a job reads outputs only from a direct need — and stays the only job with `permissions: contents: write`
- [ ] `release-preflight.mjs` is untouched: same invocation, same exit codes, same messages (MARK-09)
- [ ] Gate check passes: `node --test scripts/platform/__tests__/release-workflow.test.mjs` (will fail until T7 — same cluster, same worker)

**Tests**: unit (written in T7)
**Gate**: quick
**Commit**: `feat(platform): cut the tag from a pushed release marker, not a dispatch`

---

### T7: Rewrite `release-workflow.test.mjs` against the marker shape

**What**: Replace the dispatch-shape assertions with the marker ones, keeping every guarantee
the old file protected.
**Where**: `scripts/platform/__tests__/release-workflow.test.mjs`
**Touches**: `scripts/platform/__tests__/release-workflow.test.mjs`
**Depends on**: T6
**Exclusive**: no
**Reuses**: its own `readWorkflow` idiom (`:12-14`).
**Requirement**: MARK-01, MARK-03, MARK-04, MARK-05, DOC-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] **MARK-05** — tests assert `workflow_dispatch` is absent, `inputs` is absent, and no step's `run` matches `github.ref` + `refs/heads/main` + `exit 1` (the deleted guard, `:21-29`)
- [ ] **MARK-04** — a test asserts `jobs.marker.if` exists and references `head_commit.message`, so an ordinary push starts no runner
- [ ] A test asserts `marker.if` does **not** contain a `\d` / `[0-9]` version pattern — the regression guard against someone tightening the loose filter and reintroducing the silent skip
- [ ] **MARK-01** — a test asserts `verify` and `catalog` are gated on `needs.marker.outputs.release == 'true'`
- [ ] **MARK-03** — the old equality assertion (`:33`) becomes a **superset** assertion: `tag.needs` contains `verify` and `catalog`. The rationale (a job reads outputs only from a direct need) goes in a comment so nobody "restores" the equality
- [ ] The `contents: write` exclusivity assertion (`:57-63`) survives unchanged
- [ ] A test asserts the preflight step still runs before `pnpm check` / `test` / `test:scripts` / `catalog:lint` / `catalog:typecheck` — the old `:36-55` ordering, with the version now sourced from `needs.marker.outputs.version`
- [ ] Gate check passes: `node --test scripts/platform/__tests__/release-workflow.test.mjs`
- [ ] Test count: ≥ the file's current count; nothing dropped without its subject

**Tests**: unit
**Gate**: quick
**Commit**: `test(platform): assert the marker-driven release workflow`

---

### T8: `pnpm platform release [version]` — the command module

**What**: A new command that refuses locally, then creates exactly one empty marker commit.
**Where**: `scripts/platform/lib/commands/release.mjs`
**Touches**: `scripts/platform/lib/commands/release.mjs`, `scripts/platform/__tests__/release-command.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: `lib/commands/status.mjs:15-21,120-145` for the shape (a pure `plan*` with injected
deps + a thin `*Command` returning `EXIT_CODES`); `runPreflight` from `release-preflight.mjs:58`;
`readLatestChangelogVersion` from `lib/kernel-version.mjs:24`.
**Requirement**: MARK-10, MARK-11, MARK-12, MARK-13, MARK-14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] **MARK-10** — no argument → version = `readLatestChangelogVersion`; an explicit argument overrides it
- [ ] **MARK-13** — refuses when `git rev-parse --abbrev-ref HEAD` is not `main`, or `git status --porcelain` is non-empty. **Both checks run before anything else**, so no commit can exist when it refuses
- [ ] **MARK-11** — calls `runPreflight({ version })` and, on non-zero, returns that **exact** exit code and lets the preflight's own message stand. Do not translate or rewrite it: local and CI must be indistinguishable
- [ ] **MARK-12** — on success runs `git commit --allow-empty -m "chore(release): v<version>"` exactly once and creates no tag. **By default** it pushes nothing and prints `git push origin main` as the operator's next act
- [ ] **MARK-12b** (amended 2026-08-24, owner's call) — under an explicit `--push`, and only then, it also runs `git push origin main` once, after the commit; a failed push returns `EXIT_CODES.PUSH_FAILED` rather than reporting success, because the marker is then local and no tag was triggered. `--push` never bypasses MARK-13's refusals. The no-tag half of MARK-12 is unconditional: the tag is always the CI's act (AD-006/AD-034)
- [ ] `exec` and `log` are injectable; every test runs without touching a real repository or the network
- [ ] Tests assert the Independent Test: a temp fixture with a stale changelog exits non-zero and `git log` is unchanged
- [ ] Tests assert the ordering guarantee: for every refusal path, no `git commit` call was ever issued
- [ ] **MARK-14 (probe, 1 of the 2 budgeted)** — record in the commit body the result of `git commit --allow-empty -m "chore(release): v9.9.9"` followed by `git reset --hard HEAD~1`, proving the `commit-msg` hook accepts it without an `Advisory:` trailer. Expected pass by construction: `advisory-required.mjs:24-35` derives `touchedEntries` from `git diff --cached --name-only`, empty for an empty commit; the only `pre-commit` hook (`lefthook-local.yml:12-18`) is glob-gated and does not fire
- [ ] Gate check passes: `node --test scripts/platform/__tests__/release-command.test.mjs`
- [ ] Test count: ≥ 10 tests pass

**Tests**: unit
**Gate**: quick
**Commit**: `feat(platform): compose the release marker with pnpm platform release`

---

### T9: Register `release` in the CLI

**What**: Wire the new command into `cli.mjs` and assert it from the CLI's own test file.
**Where**: `scripts/platform/cli.mjs`
**Touches**: `scripts/platform/cli.mjs`, `scripts/platform/__tests__/cli.test.mjs`
**Depends on**: T8
**Exclusive**: no
**Reuses**: `cli.mjs:65` (`registerCommand("status", ...)`) as the exact registration shape.
**Requirement**: MARK-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `registerCommand("release", ...)` sits next to `status`, passing `positionals[0]` as the version and spreading `deps`
- [ ] The import is added alongside the other `lib/commands/*` imports (`:3-9`)
- [ ] `cli.test.mjs` asserts `pnpm platform release` resolves to the handler and that an unknown subcommand still returns `EXIT_CODES.USAGE_ERROR`
- [ ] No new `package.json` script is added — `release` is a subcommand of the existing `platform` script (`package.json:28`), so `child-manifest.test.mjs:8`'s `TEMPLATE_ONLY_SCRIPTS` is untouched
- [ ] Gate check passes: `node --test scripts/platform/__tests__/cli.test.mjs scripts/platform/__tests__/release-command.test.mjs`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(platform): register the release command in the platform CLI`

---

### T10: Retire the dispatch and the hand-written tag from the docs

**What**: Rewrite the two places that tell a reader how to cut a tag.
**Where**: `docs/agents/workflow.md:135-136`, `TEMPLATE.md:29`
**Touches**: `docs/agents/workflow.md`, `TEMPLATE.md`
**Depends on**: None
**Exclusive**: no
**Reuses**: the surrounding prose voice of each file; the AD-034 phrasing for "the agent never
tags and never pushes".
**Requirement**: DOC-03, DOC-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `docs/agents/workflow.md:135-136` no longer says "dispatching the `release` workflow". It says: the user runs `pnpm platform release`, reviews the empty marker commit, and pushes it; the push cuts the tag
- [ ] **DOC-05** — the same paragraph still states that the agent never tags and never pushes, and now covers `pnpm platform release` explicitly: the command commits **locally** and stops
- [ ] `TEMPLATE.md:29`'s `git tag v1.2.0 && git push --tags` is replaced by the marker ritual. A hand-written `git tag` must not survive as an instruction
- [ ] **DOC-03 (probe, 2 of the 2 budgeted)** — `grep -rn "dispatch\|git tag v" docs/ TEMPLATE.md AGENTS.md.jinja` returns no hit that instructs a reader to release. Expected surviving hits, all legitimate: `docs/agents/harness.md` (agent dispatch, unrelated) and historical `docs/dev/template-changelog.md` sections, which **must not be rewritten**
- [ ] Gate check passes: `node --test scripts/platform/__tests__/docs-stay-lean.test.mjs scripts/platform/__tests__/template-internal-docs.test.mjs scripts/platform/__tests__/documented-commands.test.mjs`

**Tests**: none (docs layer — guard tests only)
**Gate**: quick
**Commit**: `docs(platform): release by pushing a marker, not by dispatching a workflow`

---

### T11: Correct the docs that describe the old CI shape

**What**: Five places describe a workflow layout that this feature changes or deletes.
**Where**: `docs/agents/workflow.md:124-126`, `docs/catalog/catalog.md:87`, `docs/dev/template.md`, `docs/dev/deploy.md.jinja`, `.github/README.md`
**Touches**: `docs/agents/workflow.md`, `docs/catalog/catalog.md`, `docs/dev/template.md`, `docs/dev/deploy.md.jinja`, `.github/README.md`
**Depends on**: T10 (shares `docs/agents/workflow.md` — same worker, ordered)
**Exclusive**: no
**Reuses**: the merged `ci.yml` from T1 as the source of truth for the job list.
**Requirement**: CI-01, DOC-03

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `docs/agents/workflow.md:124-126` lists the merged job set, not just `quality` / `test-unit` / `test-coverage`, and says the template-only jobs are inert in a product
- [ ] `docs/catalog/catalog.md:87` no longer names `.github/workflows/catalog.yml` — it names the merged `ci.yml` job
- [ ] The three remaining files' references to `.github/workflows/ci.yml` are checked against the merged file and corrected only where they became false. **Do not rewrite prose that is still true**
- [ ] `docs/dev/template-update.md:10-12` is verified untouched and still correct — the tag keeps its "was green" promise because `tag` still needs `verify` + `catalog`
- [ ] Historical `docs/dev/template-changelog.md` sections are not rewritten
- [ ] Gate check passes: `node --test scripts/platform/__tests__/docs-stay-lean.test.mjs scripts/platform/__tests__/template-internal-docs.test.mjs scripts/platform/__tests__/docs-no-owner-infra.test.mjs`

**Tests**: none (docs layer — guard tests only)
**Gate**: quick
**Commit**: `docs(platform): describe one CI workflow with inert catalog jobs`

---

### T12: Amend AD-034 and record AD-036

**What**: The decision log catches up with the new release act and the single gate workflow.
**Where**: `.specs/STATE.md` § Decisions
**Touches**: `.specs/STATE.md`
**Depends on**: T1, T3, T6, T10
**Exclusive**: **yes**
**Owner**: **the orchestrator writes this task, never a worker** — the orchestrator is the only
writer of `.specs/` during Execute (skill rule).
**Reuses**: the AD row format; AD-034's existing text, amended in place.
**Requirement**: DOC-01, DOC-02

**Tools**: MCP: NONE · Skill: `tlc-spec-driven` (memory)

**Done when**:

- [ ] **DOC-01** — AD-034's clause "a tag is cut only by the `release` workflow the user dispatches" becomes the pushed marker. The deleted `workflow_dispatch` and ref guard are named as **superseding that clause of REL-01** (`template-update-contract`). The rest of AD-034 — preflight refusals, `tag` on green needs, the advisory contract, the child never updating itself — is left byte-identical
- [ ] **DOC-05** — the amended AD-034 states that `pnpm platform release` commits locally and never tags or pushes, so AD-006/AD-034's standing rule is unchanged and now covers the new command
- [ ] **DOC-02** — a new `AD-036 | active (release-marker-commit, 2026-08-23)` row records: `ci.yml` is the single workflow that runs code gates; it **ships**; its template-only jobs are inert in a product behind a `detect` job probing `catalog/`; `hashFiles()` in a job-level `if` is forbidden (it evaluates before checkout); and the marker skip must stay scoped to `refs/heads/main` or AD-033's tag enforcement dies silently
- [ ] The `release-marker-commit` Handoff entry is updated to Execute state in the same commit

**Tests**: none
**Gate**: none (no code)
**Commit**: `spec(release-marker-commit): amend AD-034 and record AD-036`

---

### T13: The `v2.4.0` changelog section ✅ CLOSED — obsolete, not executed

**What**: This feature's entry in the shared `v2.4.0` section.
**Where**: `docs/dev/template-changelog.md`
**Touches**: `docs/dev/template-changelog.md`
**Depends on**: T12
**Exclusive**: **yes**
**Requirement**: none directly — no AC covers it. It is the spec's confirmed Assumption row
("Changelog section — shares `v2.4.0` with `audit-2026-08-23-remediation`") and it is what makes
the work releasable.

**✅ CLOSED 2026-08-24 — obsolete, deliberately not executed, on the owner's ruling.**

Both blockers are gone, and the task went with them. Blocker 1 was cleared by the tag itself:
marker `6c44937`, annotated tag `73ea22c`, Release published and Latest. Blocker 2 never had
to be arbitrated, because the entry this task was to write **already exists** — in the
**v2.3.0** section, `docs/dev/template-changelog.md:9-19`, item 1 *"Release gate, cut from a
marker commit"*. It records both halves this task owed: the marker release **and**
`catalog.yml` merged into `ci.yml` with AD-036 — which is exactly the `Commit:` subject below,
in the wrong section with the right content. Provenance, do not re-derive: the text entered at
the merge `e3ac20d` and is absent from `8ee1323`, `60a011a` and `0ec749a`, so the session that
reconciled `main` folded it into v2.3.0 instead of v2.4.0.

Consequence: **there is no v2.4.0 content left to write.** Every commit on `main` is an
ancestor of the marker and therefore shipped as v2.3.0. Writing an empty `## v2.4.0` would
also be actively harmful — `release-preflight` keys on the *latest* section (AD-034), so it
would silently become the default target of the next `pnpm platform release`.

The `## v2.4.0` section does exist now (`56ad498`), but **not** for this task's content: it
describes the `release` flag guard (`e2709f3`), a kernel fix made later in the same session
and one that genuinely ships to the child. `audit-2026-08-23-remediation`'s area H appends to
that section rather than creating it — the protocol this task specified for the shared slot.

`docs/dev/template-changelog.md` carries no entry for this task, by decision.

**Done when** (superseded — none of these were executed):

- [ ] A `## v2.4.0` section exists with this feature's entry
- [ ] Its `### Child migration steps` is the literal `None — copier update is enough.` — a
      non-major admits zero manual steps (AD-034), and the child's `ci.yml` changes are inert
      there by construction
- [ ] The `## v2.3.0` section is untouched, including its `### Child migration steps`
- [ ] Gate check passes: `node --test scripts/platform/__tests__/kernel-version.test.mjs scripts/platform/__tests__/release-preflight.test.mjs`

**Tests**: unit (existing guards)
**Gate**: quick
**Commit**: `docs(platform): record one CI and the marker release in v2.4.0`

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 workflow file rewritten + 1 deleted (the deletion is the same edit) | ✅ Granular |
| T2 | 1 test file | ✅ Granular |
| T3 | 1 manifest line + its guard test | ✅ Granular |
| T4 | 3 pure functions, 1 module | ✅ Granular |
| T5 | 1 CLI entry in the same module | ✅ Granular |
| T6 | 1 workflow file | ✅ Granular |
| T7 | 1 test file | ✅ Granular |
| T8 | 1 command module | ✅ Granular |
| T9 | 1 registration + its assertion | ✅ Granular |
| T10 | 2 prose edits, one concern (how to release) | ✅ Granular |
| T11 | 5 prose edits, one concern (the CI shape) — cohesive, mechanical | ⚠️ OK if cohesive |
| T12 | 2 decision rows | ✅ Granular |
| T13 | 1 changelog section | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram shows | Status |
| --- | --- | --- | --- |
| T1 | None | wave 1, first in C1 | ✅ |
| T2 | T1 | after T1 in C1 | ✅ |
| T3 | T1 | wave 2, after wave 1 | ✅ |
| T4 | None | wave 1, first in C2 | ✅ |
| T5 | T4 | after T4 in C2 | ✅ |
| T6 | T5 | after T5 in C2 | ✅ |
| T7 | T6 | after T6 in C2 | ✅ |
| T8 | None | wave 1, first in C3 | ✅ |
| T9 | T8 | after T8 in C3 | ✅ |
| T10 | None | wave 1, first in C4 | ✅ |
| T11 | T10 | after T10 in C4 | ✅ |
| T12 | T1, T3, T6, T10 | wave 3 — all four in waves 1–2 | ✅ |
| T13 | T12 | wave 4 — T12 in wave 3 | ✅ |

No task depends on a later wave or on a sibling cluster of its own wave.

---

## Wave/Cluster Cross-Check

| Wave | Cluster | Tasks | Files (union of Touches) | Deps outside earlier waves / own cluster? | Files shared with a sibling cluster? | Exclusive alone? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | C1 | T1 → T2 | `.github/workflows/ci.yml`, `.github/workflows/catalog.yml`, `scripts/platform/__tests__/gates.test.mjs` | none | none | n/a | ✅ |
| 1 | C2 | T4 → T5 → T6 → T7 | `scripts/platform/lib/release-marker.mjs`, `scripts/platform/__tests__/release-marker.test.mjs`, `.github/workflows/release.yml`, `scripts/platform/__tests__/release-workflow.test.mjs` | none | none | n/a | ✅ |
| 1 | C3 | T8 → T9 | `scripts/platform/lib/commands/release.mjs`, `scripts/platform/__tests__/release-command.test.mjs`, `scripts/platform/cli.mjs`, `scripts/platform/__tests__/cli.test.mjs` | none | none | n/a | ✅ |
| 1 | C4 | T10 → T11 | `docs/agents/workflow.md`, `TEMPLATE.md`, `docs/catalog/catalog.md`, `docs/dev/template.md`, `docs/dev/deploy.md.jinja`, `.github/README.md` | none | none | n/a | ✅ |
| 2 | C5 | T3 | `copier.yml`, `scripts/platform/__tests__/copier-delivery.test.mjs` | T1 — wave 1 | none (alone) | yes | ✅ |
| 3 | C6 | T12 | `.specs/STATE.md` | T1, T3, T6, T10 — waves 1–2 | none (alone) | yes | ✅ |
| 4 | C7 | T13 | `docs/dev/template-changelog.md` | T12 — wave 3 | none (alone) | yes | ✅ |

**Wave 1 sibling-overlap proof:** the four unions are pairwise disjoint. `.github/workflows/`
is split cleanly — C1 owns `ci.yml` + `catalog.yml`, C2 owns `release.yml`.
`scripts/platform/__tests__/` is split by file, never by directory.

**Why C3 and C4 are two-task clusters rather than merged:** C3 is a vertical of its own (a
command module plus its wiring) and shares no file with C2; merging them would serialise six
tasks into one worker. C4 is prose only and is dispatched at a cheaper tier. Neither is a
single-task cluster, so the "three or more single-task non-exclusive clusters" smell does not
apply.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Workflow YAML | unit | unit (written in T2, same cluster, same worker) | ✅ OK |
| T2 | Workflow YAML test | unit | unit | ✅ OK |
| T3 | Copier manifest | unit | unit | ✅ OK |
| T4 | `lib/**` module | unit | unit | ✅ OK |
| T5 | `lib/**` module | unit | unit | ✅ OK |
| T6 | Workflow YAML | unit | unit (written in T7, same cluster, same worker) | ✅ OK |
| T7 | Workflow YAML test | unit | unit | ✅ OK |
| T8 | `lib/commands/**` | unit | unit | ✅ OK |
| T9 | `lib/commands/**` wiring | unit | unit | ✅ OK |
| T10 | Docs | none | none | ✅ OK |
| T11 | Docs | none | none | ✅ OK |
| T12 | `.specs/**` | none | none | ✅ OK |
| T13 | Docs (changelog) | none — existing guards cover it | unit (existing guards) | ✅ OK |

**On T1/T6 "tests written in the next task":** this is *not* test deferral. Both pairs sit in
the same cluster, run on the same worker, and the second task's gate is the binding one. A
workflow file cannot be asserted before it exists, and splitting the YAML edit from its
assertions keeps each commit revertable on its own. No task in a *different* cluster carries
another task's tests.

---

## Requirement Traceability

| Requirement | Tasks | Proof |
| --- | --- | --- |
| CI-01 | T1, T2, T3, T11 | test |
| CI-02 | T1, T2 | test |
| CI-03 | T1, T2 | test (nine commands — `template:smoke` included) |
| CI-04 | T1, T2 | test |
| CI-05 | T1, T2 | test |
| CI-06 | T1, T2 | test + `pnpm template:smoke` at the Final gate |
| MARK-01 | T5, T6, T7 | test |
| MARK-02 | T4, T5, T6 | test |
| MARK-03 | T6, T7 | test (superset) |
| MARK-04 | T5, T6, T7 | test |
| MARK-05 | T6, T7 | test |
| MARK-06 | T4 | test |
| MARK-07 | T4, T5 | test |
| MARK-08 | T4, T5 | test |
| MARK-09 | T6 | test |
| MARK-10 | T8, T9 | test |
| MARK-11 | T8 | test |
| MARK-12 | T8 | test |
| MARK-13 | T8 | test |
| MARK-14 | T8 | **probe** 1/2 |
| DOC-01 | T12 | gate |
| DOC-02 | T12 | gate |
| DOC-03 | T10, T11 | **probe** 2/2 |
| DOC-04 | T2, T3, T7 | gate |
| DOC-05 | T10, T12 | gate |

**Coverage:** 25 of 25 ACs mapped to tasks, 0 unmapped. **Probe budget: 2 of 3 spent**
(MARK-14, DOC-03) — matching the spec.

---

## Execution Log

### Wave 1 — DONE, 11 tasks in 4 clusters, 2026-08-23

| Cluster | Tier | Task | Commit | Result |
| --- | --- | --- | --- | --- |
| C1 | sonnet | T1 merge `catalog.yml` into `ci.yml` | `6b99461` | gate deferred to T2 by design |
| C1 | sonnet | T2 rewrite `gates.test.mjs` | `529ad5c` | 9 → 16 tests, exit 0 |
| C2 | sonnet | T4 `release-marker.mjs` grammar | `f3b5635` | 16 tests, exit 0 |
| C2 | sonnet | T5 `--decide` entry | `dc1e3c7` | 24 tests, exit 0 |
| C2 | sonnet | T6 rewrite `release.yml` | `2c21355` | YAML parse verified; asserted in T7 |
| C2 | sonnet | T7 rewrite `release-workflow.test.mjs` | `3ced718` | 5 → 9 tests; cluster gate 33/33 exit 0 |
| C3 | sonnet | T8 `pnpm platform release` | `c3f3690` | 10 tests, exit 0 |
| C3 | sonnet | T9 register in `cli.mjs` | `e1e2c8c` | 42 tests, exit 0 |
| C4 | haiku | T10 retire the dispatch from the docs | `c4ea19e` | probe DOC-03 clean |
| C4 | haiku | T11 correct the stale CI shape | `7550d88` | guards exit 0 |

**Build gate: `pnpm test:scripts` exit 0 — 446 tests / 49 files, up from the 376 / 42 baseline.
Nothing dropped. `pnpm check` exit 1 — FOREIGN, see below.**

**`git diff HEAD -- .github/workflows/` is empty**, so the working-tree revert the C1 worker hit
mid-T1 left no residue: disk matches the commits. The sibling session independently read the
merged file on disk (`gates:` at `:94`, `fetch-depth: 0` at `:102`) and confirmed the same.

#### The `pnpm check` failure is not this feature's — do not "fix" it

19 `apps/web` lint errors plus an `api#lint` failure. Attribution, verified read-only:

- `git log 0358bd4..HEAD --name-only -- apps/` → **empty**. No commit of this feature touches `apps/`.
- The failing files (`app/router/shell.tsx`, `shared/config/routes.ts`, `shared/lib/auth-redirect.ts`,
  `shared/lib/last-location.ts` + two test files) were last edited by `fd1b48a`, `377c2f0`,
  `68bdca5` — all **before** `0358bd4`, all from `audit-2026-08-23-remediation`'s web work.
- `git stash list` empty; no lost state.

**Rule for the rest of this feature:** never edit `apps/**` to make the Build gate green. That
area belongs to a live sibling session, and a fix here would land inside their in-flight range.
The Verifier's Final gate inherits the same constraint — if `pnpm check` is still red at that
point for the same foreign reason, it is recorded as an external blocker, not a feature failure.

#### Shared-checkout hazard, confirmed

Three foreign commits landed inside this feature's range (`259ac55`, `bc75d78`, and the
`apps/web` work above), and `scripts/platform/lib/advisories.mjs` carried an uncommitted foreign
edit during the gate. **This checkout is shared with live sibling sessions.** Every commit stays
pathspec-limited; `git add -A`, `git add .specs/`, `git stash` and branch operations are
forbidden for every worker in this feature.

#### Wave 1 repair — formatting, `6e63888`

`pnpm format:check` was red on four files this wave wrote: `gates.test.mjs`, `release-marker.test.mjs`,
`release-command.test.mjs`, `lib/commands/release.mjs`. Reported by the sibling session, which
verified per-file authorship with `git log -1` rather than inferring from paths — the finding is
this feature's, and it was fixed here.

**Root cause, and the lesson for every remaining wave:** `prettier-format-gate` has taken the tree
to zero formatting diffs, but **its pre-commit auto-fix hook (its T9) has not landed yet**, so
nothing catches an unformatted file at commit time. Until it does, **every worker payload in this
feature must instruct the worker to run `npx prettier --write` on what it touched before
committing.** Wave 1's payloads did not, which is an orchestrator defect, not a worker's.

`npx prettier --check` exit 0 on all four; `node --test` over the three test files exit 0 at 50
tests (16 + 24 + 10), so the reformat changed no behaviour.

### Wave 2 — DONE, 2026-08-24

Owner ruled this feature goes first on `copier.yml`. Reasoning, recorded because it is the
transferable part: either order works mechanically, but handing the one-line `_exclude` deletion
to the sibling's T41 would make **CI-01 unprovable inside this feature's own commit range** —
turning an acceptance criterion into a cross-feature dependency for one line. The sibling session
agreed and T41 now inherits a settled file.

| Cluster | Tier | Task | Commit | Result |
| --- | --- | --- | --- | --- |
| C5 | sonnet | T3 drop the `catalog.yml` exclusion | `7e5a43e` | 10 tests, exit 0 |

Build gate: **`pnpm check` exit 0** (it was exit 1 at wave 1 for the foreign `apps/**` reason,
since repaired by the sibling session) · `pnpm test:scripts` **454 / 49**. The `copier.yml` diff
is exactly one removed line, verified by `git show`.

### Wave 3 — DONE, 2026-08-24

| Cluster | Tier | Task | Commit | Result |
| --- | --- | --- | --- | --- |
| C6 | orchestrator | T12 amend AD-034, record AD-036 | `b9afc82` | no code — decision log |

### Verification — PASS (round 2), 2026-08-24

`validation.md`. Round 1 returned FAIL on a single Minor gap: the MARK-08 emptiness guard's
mutant (`changedFiles.length > 0` → `> 1`) survived, because the suite exercised 0 and 2 changed
files but never **exactly 1**. Fixed in `9820444` — test-only; the Verifier independently
confirmed `release-marker.mjs:60` is absent from that commit's diff and was already correct, so
the new test closes a gap rather than papering over a defect.

Round 2: **25/25 ACs**, sensor **3 injected / 3 killed** (M3 re-injected post-fix and killed).
Final gate: `pnpm check` 5/5, `pnpm test` 614/614, `pnpm test:scripts` 454/454, `catalog:lint`
clean. `catalog:typecheck` and `template:smoke` failed and were root-caused by `git blame` to
foreign commits `35c8a4f` / `5f89723`, outside this feature's 15-commit range — **real, and
someone's, but not this feature's**. Lessons L-028 / L-029 recorded.

### Wave 4 — ⛔ still BLOCKED, the only open work

T3 (`copier.yml`) collides with `audit-2026-08-23-remediation` T41, a declared single-editor
task on the same file. The edit here is one line. The owner rules the order; no peer can decide
it. Waves 3 and 4 queue behind wave 2 (T12 depends on T3).

---

## Cross-feature collisions — read before dispatching any wave

Live 2026-08-23. Relayed by the `audit-2026-08-23-remediation` session and verified on disk.
**Whoever reaches a contended file first re-reads it on disk rather than trusting these notes.**

| File | Other owner | Rule for this feature |
| --- | --- | --- |
| `copier.yml` | that feature's **T41**, a declared single-editor task | **T3 must be sequenced against T41 before wave 2 runs.** The edit here is one line. If T41 lands first, hand it the deletion; otherwise T41 rebases. Do not run wave 2 until the owner rules on the order. |
| `.github/workflows/ci.yml` | its **T36** adds a `contract:check` step and asserts `format:check` is **absent** from `ci.yml` | Both hold. T1 adds no format job — `format:check` stays in the template-only `format.yml` owned by `prettier-format-gate` T10. `contract:check` belongs in `quality` (always runs, ships). Whoever lands second rebases onto the merged file. |
| `.github/workflows/catalog.yml` | its **T35** adds `fetch-depth: 0` to the `gates` job | **Already satisfied on disk** (`catalog.yml:18-20`). T1's obligation is to *preserve* it on the merged `gates` job. T35 becomes a no-op once this feature lands. |
| `docs/dev/template-changelog.md` | that feature's area H, same `v2.4.0` section | T13, blocked. See its blockers. |
| every `.yml` | `prettier-format-gate` **T7** reformats the whole tree | Deletion wins for `catalog.yml`. Whoever goes second re-runs the formatter over the merged `ci.yml` and `release.yml`. |

**Untracked/dirty state this feature owns:** `.specs/STATE.md` (modified) and
`.specs/features/release-marker-commit/` (untracked). `.specs/features/prettier-format-gate/tasks.md`
is **another session's** and must never be staged here — every commit is pathspec-limited, and
`git add .specs/` is forbidden.

---

## Standing constraints

- **The agent never tags and never pushes** (AD-006 / AD-034). `pnpm platform release` commits
  locally and stops. `v2.3.0` is still untagged and `main` is unpushed.
- **`hashFiles()` in a job-level `if` is forbidden** — it evaluates before checkout and is always
  empty. This is why `detect` exists.
- **The five closed assumption rows** live in `design.md` § *Decisions locked at Design*. Execute
  does not reopen them.
