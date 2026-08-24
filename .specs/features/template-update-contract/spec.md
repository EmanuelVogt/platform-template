# template-update-contract Specification

## Problem Statement

Two kernel defects shipped this week (`v2.0.0` uninstallable catalog — issue #9; the
`.copier-answers.yml` fixture leak) and in both cases no mechanism told a child product
"your version is broken, do X": the advisory ledger only matches installed catalog entries,
the changelog is read only after updating, and a `v*` tag can be cut without the gate that
would have caught the bug. Children fall behind silently and learn about defects by hitting
them. This feature fixes the update contract on both sides: the template guarantees every
tag is consumable and announces kernel defects through the ledger; the child detects,
reports and (where safe) automates the update.

## Goals

- [ ] A `v*` tag cut through the standard path is impossible with a red gate.
- [ ] A kernel defect reaches a child at the affected version within one session start (online), without the child updating first.
- [ ] A child applies a minor/patch tag with zero manual steps; majors carry scripted migrations.
- [ ] A child on the standard receives an automatic PR (or an issue naming the blocker) for each new tag.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Retroactive bump of the five entries off the colliding `2.0.0` | AD-032 residue, assigned to `security-hardening-2`; `v2.0.0` is uninstallable so no child holds the bad flavor. The new entry-change guard (REL-04) prevents recurrence instead. |
| Enforced (blocking) cadence | Decision #3 in `context.md` — recommended and measured only. |
| Published JSON advisory feed / GitHub Release assets | Decision #4 — git sparse fetch of the latest tag is the feed. |
| Adding `catalog/schema` to the CI `catalog` matrix | Pre-existing gap, unrelated to the update contract. |
| Fixing the repo-wide `prettier --check` crash | Known Handoff follow-up, not touched here. |
| Auto-merge of the bot's PR | The PR is reviewed by a human/agent in the child; merge stays their act. |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Tag pushed by the release workflow with `GITHUB_TOKEN` does not re-trigger the `Catalog` workflow on the tag event | Accept: the release run itself is the recorded evidence for that tag | GitHub Actions suppresses events from `GITHUB_TOKEN` pushes; wiring a PAT adds a secret for no new information | y |
| Private template origin in the child's bot | Optional secret `TEMPLATE_READ_TOKEN`; when absent and the origin is unreachable the bot opens/updates an issue naming the secret | Works out of the box for public origins; fails loud, not silent, for private ones | y |
| "Behind for how long" metric | Days since the advisory's id date (`ADV-YYYYMMDD-NN`) for pending kernel advisories; days since the latest tag's commit date (from the feed clone) for plain behind-ness | `git ls-remote` carries no dates; both sources are already fetched | y |
| Recommended cadence values | `security` ≤ 7 days, `breaking` ≤ 30 days, `bug`/plain behind ≤ 30 days | Matches what the user approved in conversation ("security in the week, major within the next cycle") | y |
| Migration scripts location and runner | `scripts/platform/migrations/v<X.Y.Z>.mjs`, run by `pnpm platform template migrate` (applies every script between installed and target, ascending) | `scripts/platform/**` already ships to the child; keeps steps executable instead of prose | y |
| One tag per bot run | The bot targets only the first behind tag per run (same rule as the `template-update` skill) | Keeps each PR reviewable and migrations ordered | y |
| Kernel advisory `parity` field | Stays required; points at the template test that proves the fix (e.g. `scripts/platform/__tests__/lint.test.mjs`) | One schema for all advisories | y |
| Non-major changelog sections and steps | `### Child migration steps` must be the literal `None — copier update is enough.` or numbered steps whose first token is a backticked command | Makes "no manual steps outside majors" lintable | y |

**Open questions:** none — all resolved or logged above. All assumption defaults approved by the user (2026-08-23); spec CONFIRMED.

## User Stories

### P1: A tag cannot ship broken ⭐ MVP

**User Story**: As the template maintainer, I want `v*` tags produced only by a workflow that runs the full gate first, so that no child ever receives an uninstallable or untested tag again.

**Why P1**: Root cause of issue #9 — `catalog:check` existed and was simply not run before `v2.0.0`.

**Acceptance Criteria**:

1. WHEN the user dispatches the `release` workflow with input `version` THEN the workflow SHALL fail before running any gate if `version` does not equal the latest `## vX.Y.Z` of `docs/dev/template-changelog.md`, or if tag `v<version>` already exists, or if the target ref is not `main`'s HEAD.
2. WHEN any gate step fails (`check`, `test`, `test:scripts`, `catalog:lint`, `catalog:typecheck`, `catalog:check` per entry) THEN the workflow SHALL create no tag and push no ref.
3. WHEN all gates pass THEN the workflow SHALL create an annotated tag `v<version>` on the verified commit and push it, with the tag message taken from the changelog section's first paragraph.
4. WHEN the release preflight runs THEN it SHALL fail if any catalog entry's directory tree differs from the previous stable tag while its `module.json` `version` is unchanged (entry changed without a bump — the `2.0.0` collision class).
5. WHEN the release preflight runs for a non-major `version` THEN it SHALL fail if the changelog section's `### Child migration steps` contains a manual step (per the lintable rule in Assumptions).

**Independent Test**: Dispatch preflight locally against a fixture repo: wrong version → exit ≠ 0 naming the mismatch; entry edited without bump → exit ≠ 0 naming the entry; green fixture → exit 0.

---

### P1: Kernel advisories reach the affected child ⭐ MVP

**User Story**: As a child product, I want defects of the template itself (kernel, scripts, hooks, copier) announced through the same advisory ledger as entry defects, matched against my installed template version, so that I learn "my version is broken and the fix is X" at session start.

**Why P1**: Issue #9 and the fixture leak had no channel; `computePending` skips any module absent from the lock.

**Acceptance Criteria**:

1. WHEN an advisory declares `module: kernel` THEN `computePending` SHALL match its `affects` range against the child's installed template version (`parseInstalledVersion` of `_commit`), ignoring the module lock.
2. WHEN the child has no `.platform-modules.lock` THEN kernel advisories SHALL still be computed and reported (entry advisories keep requiring the lock).
3. WHEN `pnpm platform status` (plain and `--json`) or the `pending-advisories` hook runs THEN pending kernel advisories SHALL appear with id, kind, severity and module `kernel`, and the `--json` shape SHALL keep its current keys.
4. WHEN a kernel advisory id is recorded in `docs/advisories/APPLIED.md` THEN it SHALL no longer be pending.
5. WHEN `catalog:lint` runs THEN it SHALL fail an advisory whose `module` is neither `kernel` nor an existing catalog entry (`<name>` or `<name>/<variant>`).
6. WHEN the feature ships THEN two retroactive kernel advisories SHALL exist: `ADV-20260823-01` (bug, `affects >=2.0.0 <2.1.0`, issue #9, fix = `copier update` to ≥ v2.1.0) and `ADV-20260823-02` (bug, `affects >=1.0.0 <2.2.0`, `.copier-answers.yml` fixture leak, fix = repair answers per the v2.2.0 changelog then `copier update`).
7. WHEN `advisory-required` (commit-msg) runs THEN its rule SHALL be unchanged (kernel advisories are never demanded by path).

**Independent Test**: Fixture child with `_commit: v2.0.0` and no lock → hook prints `ADV-20260823-01 bug <severity> kernel`; same child with `_commit: v2.1.0` → only `ADV-20260823-02`; ledger entry silences it.

---

### P1: The child learns about defects without updating first (remote feed) ⭐ MVP

**User Story**: As a child product on an old tag, I want my session-start hook to read the advisories of the latest template tag from the remote, so that a defect published after my tag still reaches me.

**Why P1**: Advisories travel by copier today — the child at the broken version is exactly the one that does not have the file describing its defect.

**Acceptance Criteria**:

1. WHEN the `template-behind` hook (or `platform status`) runs online THEN it SHALL fetch `docs/advisories/` from the latest stable tag of `_src_path` via sparse git checkout, cache it for 24 h keyed by source+tag next to the existing tags cache, and merge remote advisories with local ones by id (remote version of a duplicated id wins).
2. WHEN the merged set yields pending kernel advisories for the installed version THEN the hook SHALL print them (id, kind, severity, one-line `fix`) in addition to the existing behind message.
3. WHEN the remote is unreachable or the fetch exceeds its timeout (8 s, same budget as `ls-remote`) THEN the hook SHALL stay silent about the feed and never fail the session (exit 0, cached data used if present).
4. WHEN the repo is the template itself (no `.copier-answers.yml` `_src_path`) THEN the feed SHALL not run (hook silent, as today).

**Independent Test**: Fixture child pointing `_src_path` at a local bare repo with tags: hook run 1 populates the cache and prints the pending kernel advisory that only exists at the latest tag; disconnect (invalid source) → run 2 still prints from cache; corrupt cache + invalid source → silent.

---

### P2: Measured cadence

**User Story**: As the maintainer, I want `status` and the hook to show how far behind a child is and for how long, against a written recommended cadence, so that lateness is visible without being enforced.

**Why P2**: Makes the standard observable; no behavior is blocked.

**Acceptance Criteria**:

1. WHEN `platform status` runs with pending kernel advisories THEN it SHALL print, per advisory, the days elapsed since the advisory's id date and mark it `overdue` when the elapsed days exceed the cadence for its kind (security 7, breaking 30, bug 30).
2. WHEN the child is behind and the feed cache holds the latest tag's commit date THEN `status` SHALL print `latest <tag> published <N> days ago`.
3. WHEN the child is up to date with no pending advisories THEN `status` SHALL print its current OK output unchanged.
4. WHEN the cadence document is read THEN `docs/dev/template-update.md` (shipped to the child) SHALL state the contract: what the template promises per tag, the recommended cadence per kind, and that nothing blocks.

**Independent Test**: Freeze `now`; fixture with a security kernel advisory dated 10 days ago → `overdue`; dated 3 days ago → no mark.

---

### P2: The child updates itself (weekly bot)

**User Story**: As a child product, I want a weekly workflow that tries the next tag on a branch and opens a PR when green (or an issue naming the blocker), so that staying current is the default instead of an errand.

**Why P2**: This is what delivers "always up to date"; everything else supports it.

**Acceptance Criteria**:

1. WHEN the workflow runs (weekly cron or manual dispatch) in a repo with no behind tags THEN it SHALL exit success without creating branches, PRs or issues.
2. WHEN behind THEN it SHALL target only the first behind tag: branch `chore/template-update-<tag>`, `copier update --trust --vcs-ref <tag>`, `pnpm platform template migrate`, `pnpm install`, then the child gate (`pnpm check && pnpm test`).
3. WHEN the gate passes with no copier conflicts THEN it SHALL push the branch and open a PR titled `chore(template): update to <tag>` whose body carries that tag's changelog section; WHEN a PR for that tag already exists THEN it SHALL do nothing (idempotent).
4. WHEN copier reports conflicts or the gate fails THEN it SHALL open (or update, never duplicate) an issue titled `template update to <tag> blocked`, containing the conflicting files or the failing step's tail, and push no branch.
5. WHEN the workflow file lands in the template repository itself THEN it SHALL be inert there (guard on the presence of root `.copier-answers.yml` answers), and it SHALL ship to the child via copier (not excluded).
6. WHEN the template origin is unreachable THEN the run SHALL fail with a message naming `TEMPLATE_READ_TOKEN` as the likely fix for private origins.
7. WHEN the decision logic runs (target selection, idempotency, blocked-vs-PR outcome) THEN it SHALL live in a node script under `scripts/platform/` with an injectable runner, unit-tested; the workflow file SHALL stay thin.

**Independent Test**: Unit-test the script with a fake runner: up-to-date → no-op plan; behind+green → PR plan; behind+conflict → issue plan; existing PR → no-op.

---

### P2: Executable migrations

**User Story**: As a child product, I want manual migration prose replaced by scripts I can run, so that minors/patches apply hands-free and majors are one command.

**Why P2**: The cadence is only realistic if updates are cheap.

**Acceptance Criteria**:

1. WHEN `pnpm platform template migrate` runs in a child THEN it SHALL execute every `scripts/platform/migrations/v<X.Y.Z>.mjs` with installed < X.Y.Z ≤ target (ascending), skipping versions with no script, and SHALL be idempotent per script (a re-run of an applied script is a no-op — each script owns its check).
2. WHEN a migration script fails THEN the runner SHALL stop at that script, report it by name, and leave later scripts unrun.
3. WHEN this feature's own version ships THEN its changelog section SHALL satisfy REL-05 (`None — copier update is enough.` for the child, the bot workflow arriving by copier) — the contract dogfoods itself.

**Independent Test**: Fixture with scripts v2.9.0/v3.0.0 and installed v2.8.0, target v3.0.0 → both run in order; failing first script → second never runs.

---

### P3: The standard is written

**User Story**: As any future session (human or agent), I want the contract recorded once, so that it is applied instead of re-derived.

**Acceptance Criteria**:

1. WHEN the feature closes THEN AD-034 SHALL exist in `.specs/STATE.md` § Decisions stating both sides of the contract (template obligations, child cadence) and naming the enforcement points.
2. WHEN `docs/agents/workflow.md` is read THEN the tag rule SHALL say: tags are cut by the user dispatching the `release` workflow; the agent still never tags or pushes.
3. WHEN `docs/advisories/README.md` is read THEN it SHALL document `module: kernel` and the feed.

## Edge Cases

- WHEN the changelog's latest section is for an already-tagged version THEN the release preflight SHALL fail (nothing new to release) — covers double-dispatch.
- WHEN `_commit` carries copier's `-N-gHASH` suffix (child ahead of a tag) THEN kernel advisory matching SHALL use the base tag version, as `parseInstalledVersion` already does.
- WHEN two sessions/machines race the 24 h feed cache THEN last write wins; the cache is advisory-only data and self-heals on TTL.
- WHEN an advisory file at the remote tag fails to parse THEN the feed SHALL skip that file silently (hook never breaks a session) and `status` SHALL surface the parse error.
- WHEN the bot's branch exists but its PR was closed without merge THEN a new run SHALL NOT reopen it for the same tag (closed PR = human said no; the issue path applies on the next tag).

## Requirement Traceability

| Requirement ID | Story | Proof | Phase | Status |
| --- | --- | --- | --- | --- |
| REL-01 | P1: tag gate | test | - | Pending |
| REL-02 | P1: tag gate | test | - | Pending |
| REL-03 | P1: tag gate | probe: `actionlint .github/workflows/release.yml` + workflow steps review against `release-preflight` exit codes | - | Pending |
| REL-04 | P1: tag gate | test | - | Pending |
| REL-05 | P1: tag gate | test | - | Pending |
| KADV-01 | P1: kernel advisories | test | - | Pending |
| KADV-02 | P1: kernel advisories | test | - | Pending |
| KADV-03 | P1: kernel advisories | test | - | Pending |
| KADV-04 | P1: kernel advisories | test | - | Pending |
| KADV-05 | P1: kernel advisories | test | - | Pending |
| KADV-06 | P1: kernel advisories | probe: run `pending-advisories` hook against a `_commit: v2.0.0` fixture child | - | Pending |
| KADV-07 | P1: kernel advisories | gate (`pnpm test:scripts` — existing advisory-required tests unchanged) | - | Pending |
| FEED-01 | P1: remote feed | test | - | Pending |
| FEED-02 | P1: remote feed | test | - | Pending |
| FEED-03 | P1: remote feed | test | - | Pending |
| FEED-04 | P1: remote feed | test | - | Pending |
| CAD-01 | P2: cadence | test | - | Pending |
| CAD-02 | P2: cadence | test | - | Pending |
| CAD-03 | P2: cadence | test | - | Pending |
| CAD-04 | P2: cadence | probe: `test -f docs/dev/template-update.md` + not in copier `_exclude` | - | Pending |
| BOT-01 | P2: bot | test | - | Pending |
| BOT-02 | P2: bot | test | - | Pending |
| BOT-03 | P2: bot | test | - | Pending |
| BOT-04 | P2: bot | test | - | Pending |
| BOT-05 | P2: bot | test | - | Pending |
| BOT-06 | P2: bot | test | - | Pending |
| BOT-07 | P2: bot | gate (`pnpm test:scripts`) | - | Pending |
| MIG-01 | P2: migrations | test | - | Pending |
| MIG-02 | P2: migrations | test | - | Pending |
| MIG-03 | P2: migrations | test (changelog section passes the REL-05 lint) | - | Pending |
| DOC-01 | P3: standard | test (grep-style assertion in a spec, AD-034 present with both sides) | - | Pending |
| DOC-02 | P3: standard | test | - | Pending |
| DOC-03 | P3: standard | test | - | Pending |

**Coverage:** 31 total, 0 mapped to tasks, 31 unmapped ⚠️ (pre-Tasks)

## Implicit-Requirement Dimensions (sweep)

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | REL-01 (version/ref/tag validation); KADV-05 (module enum); FEED edge (unparseable advisory skipped) |
| Failure / partial-failure | REL-02 (no tag on red); MIG-02 (stop at failing script); BOT-04 (issue on blocker) |
| Idempotency / retry / duplicates | BOT-03/BOT-04 (no duplicate PR/issue); MIG-01 (idempotent scripts); KADV-04 (ledger) |
| Auth boundaries & rate limits | Bot permissions minimal (`contents/pull-requests/issues: write`); `TEMPLATE_READ_TOKEN` optional (BOT-06). N/A beyond — no end-user surface |
| Concurrency / ordering | MIG-01 (ascending order); one tag per bot run; feed cache last-write-wins (edge case) |
| Data lifecycle / expiry | Feed cache TTL 24 h; APPLIED.md ledger is the terminal state of an advisory |
| Observability | CAD-01/02 (age + overdue in `status`); wave of hook output is the observable |
| External-dependency failure | FEED-03 (offline silent); BOT-06 (unreachable origin fails loud) |
| State-transition integrity | Advisory states pending → applied only via ledger append (KADV-04); closed PR never reopened (edge case) |

## Success Criteria

- [ ] Replaying the v2.0.0 scenario (changelog bumped, ranges closed) against the release preflight fails before any tag exists.
- [ ] A fixture child at `_commit: v2.0.0` learns about ADV-20260823-01 at session start, online, without updating.
- [ ] The `neonex-erp` receives a PR for the next real tag with no human initiating it.
