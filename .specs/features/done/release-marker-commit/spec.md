# Release Marker Commit + CI Consolidation Specification

## Problem Statement

Two problems, one blast radius. **(1)** A `v*` tag is cut only by a human dispatching the
`release` workflow with a hand-typed version — fiddly, and a second source of truth next to
`docs/dev/template-changelog.md`. **(2)** Three workflow files carry the same gate block:
`ci.yml` and `catalog.yml` both fire on `push: branches: [main]` and both run
`turbo lint typecheck` and `pnpm test`, so every push runs them twice (three times counting
`test:coverage`), and `release.yml` holds a third copy. The cost is drift — three lists that
must agree, with nothing asserting they do.

Fix both: **one CI workflow**, and a release that fires **only** from a pushed empty
`chore(release): vX.Y.Z` marker commit.

## Goals

- [ ] Exactly one workflow file runs gates on push and PR; `catalog.yml` is deleted.
- [ ] No command runs twice in one push.
- [ ] A pushed marker commit produces the tag with no further human action.
- [ ] The version has one source — the marker subject, itself derived from the changelog.
- [ ] A generated product inherits a CI that is green on day one.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Auto-tag on any push or any changelog change | Owner: `## vX.Y.Z` headings are authored before the work lands (v2.3.0 is the proof). |
| Chaining the release off a green CI via `workflow_run` | Owner: the release stays self-sufficient, not an interpreter of another workflow's result. |
| Changing WHICH gates exist | Consolidation moves and de-duplicates gates; it adds and removes none. |
| A GitHub Release or release notes | The tag is the contract (AD-006). |
| Cutting the pending `v2.3.0` tag | The owner's act; it happens before this ships. |
| The addressee defect in `docs/agents/workflow.md` | Owned by the `docs-audience-contract` spec; edits here stay minimal. |
| The child's CI gaining a format gate | Owned by `prettier-format-gate`, which ships a separate template-only `format.yml`. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| `ci.yml` ships, `catalog.yml` does not | Merge into `ci.yml` (which ships) and delete `catalog.yml` + its `copier.yml:35` exclude entry | A naive merge would ship `catalog:lint` / `catalog:typecheck` / the 5-entry matrix to every product, where `catalog/` does not exist — a red pipeline on day one, which AD-034 forbids on a non-major. | y |
| How the catalog jobs self-disable in a child | A first `detect` job checks out and outputs whether `catalog/` exists; the catalog jobs carry `needs: detect` + an `if` on that output | `hashFiles()` in a job-level `if` evaluates before checkout and would always be empty. The alternative — keeping two files — does not satisfy "one CI". | n — flagged |
| Scope of "one CI" | One workflow runs the **gates** on push and PR. `release.yml` stays separate (different trigger, different permissions) and the template-only `.github/workflows/format.yml` that `prettier-format-gate` T10 adds is not folded in | "One CI" is about the duplicated gate block, not a count of files. Folding a format gate into the shipped `ci.yml` would hand every product a red pipeline, which that feature already ruled against. | n — flagged |
| `v*` tag trigger | Preserved on the merged `ci.yml` | AD-033 requires `lintKernelRange` to run on every `v*` tag; losing it silently retires that enforcement. | y |
| ADV-04 step | Preserved, still `pull_request`-only | It compares the PR's commit range; it has no meaning on a push. | y |
| Release gate set | Unchanged: `verify` + the 5-entry `catalog:check` matrix, `tag` still `needs: [verify, catalog]` | Owner ruling. The tag keeps its "was green" promise, so shipped `docs/dev/template-update.md:10-12` needs no edit. | y |
| The release's own duplication survives | Yes — it is now the only remaining copy | AD-034 requires the release to be self-sufficient. Consequence: a marker push runs the 5-entry matrix twice (once in CI, once in release). Worth revisiting at Design. | n — flagged |
| `workflow_dispatch` | Deleted with its `version` input | Owner ruling: one way in. Recovery from an infra failure is "Re-run jobs", not a second marker. | y |
| Marker grammar | Subject exactly `chore(release): vX.Y.Z`, stable semver, no prerelease | Matches `stableTagsFromLsRemote`. A trailer was rejected: it needs knowing at commit time which commit is last. | y |
| Marker source | The head commit of the push, nothing else | One deterministic source; a deeper marker fails loudly instead of being silently missed. | y |
| Marker must be empty | Enforced, loud on any file change | Keeps the release a pure act; only a hand-made marker can trip it. | n — flagged |
| Marker logic seam | A tested module `scripts/platform/lib/release-marker.mjs` the workflow calls | A regex inside YAML is unprovable; the repo proves workflow behaviour with `node --test`. | n — flagged |
| Non-main ref guard step | Deleted | `on: push: branches: [main]` makes it unreachable; it existed for the dispatch. Retires that clause of REL-01. | y |
| Changelog section | Shares `v2.4.0` with `audit-2026-08-23-remediation` | Owner ruling. That task queues behind the `v2.3.0` tag, like the remediation's area H. | y |
| CLI never tags, never pushes | Enforced | AD-006/AD-034 — both are the operator's acts, and an agent may invoke the CLI. | y |

**Open questions:** none — all resolved or logged above. Four rows marked `n` are flagged for
the owner and must be settled before or during Tasks.

---

## User Stories

### P1: One CI workflow ⭐ MVP

**User Story**: As the template owner, I want a single workflow to run the gates, so that no
command runs twice and no gate list can drift from another.

**Acceptance Criteria**:

1. WHEN the feature lands THEN `.github/workflows/catalog.yml` SHALL NOT exist, and its `copier.yml` `_exclude` entry SHALL be removed with it.
2. WHEN a push to `main` or a pull request lands THEN `turbo lint typecheck` and `pnpm test` SHALL each be requested exactly once across all workflows that trigger on that event.
3. WHEN the merged `ci.yml` runs THEN it SHALL request every command the two files ran between them — `turbo lint typecheck`, `api build:emit`, `web build`, `pnpm test`, `pnpm test:coverage`, `test:scripts`, `catalog:lint`, `catalog:typecheck` and the 5-entry `catalog:check` matrix — and no command that neither ran.
4. WHEN a `v*` tag is pushed THEN `ci.yml` SHALL run, preserving the enforcement AD-033 places on every tag.
5. WHEN the event is a pull request THEN the ADV-04 advisory-range step SHALL run; on any other event it SHALL NOT.
6. WHEN `ci.yml` runs in a generated product, where `catalog/` does not exist THEN every catalog job SHALL be skipped and the workflow SHALL succeed.

**Independent Test**: render a product with `pnpm template:smoke` and assert its `ci.yml` has no job that would run a `catalog:*` command.

---

### P1: A pushed marker becomes a tag ⭐ MVP

**User Story**: As the template owner, I want a pushed `chore(release): vX.Y.Z` commit to cut
the tag, so that I never open the Actions UI to release.

**Acceptance Criteria**:

1. WHEN a push to `main` lands whose head commit subject is exactly `chore(release): vX.Y.Z` THEN the Release workflow SHALL run and, once `verify` and `catalog` are green, create and push the annotated tag `vX.Y.Z`.
2. WHEN the workflow releases THEN the version SHALL come from the head commit subject and no other source, and the tag message SHALL remain the changelog section's first paragraph.
3. WHEN any gate or the preflight fails THEN no tag SHALL be created — `tag` keeps `needs: [verify, catalog]` and stays the only job with `contents: write`.
4. WHEN a push to `main` carries no `chore(release):` subject THEN the Release workflow SHALL start no runner.
5. WHEN the feature lands THEN `release.yml` SHALL carry no `workflow_dispatch` trigger, no `version` input and no non-main ref guard step.

**Independent Test**: an empty `chore(release): v9.9.9` push on a scratch fork — run starts, preflight refuses, no tag.

---

### P1: A malformed marker fails loudly ⭐ MVP

**User Story**: As the template owner, I want a wrong marker to stop with a message naming
what is wrong, so that a typo never silently skips or mis-publishes a release.

**Why P1**: Removing the human from the loop removes the human who noticed the typo.

**Acceptance Criteria**:

1. WHEN the head subject starts with `chore(release):` but does not match the grammar THEN the workflow SHALL fail before any gate runs, naming the expected form.
2. WHEN a commit in the push carries a marker subject and is not the head THEN the workflow SHALL fail, saying the marker must be the last commit pushed.
3. WHEN the marker commit changes at least one file THEN the workflow SHALL fail, saying the marker carries no content.
4. WHEN the version is not the changelog's latest, or its tag exists, or a catalog entry changed since the previous stable tag without a `module.json` bump, or a non-major's `### Child migration steps` carries a manual step THEN `release-preflight.mjs` SHALL refuse with its existing exit code and no tag SHALL be created.

**Independent Test**: unit-run the module over `chore(release): v2.4.0`, `chore(release): 2.4.0`, `chore(release):v2.4.0`, `chore(release): v2.4.0-rc.1`.

---

### P1: One command composes the marker ⭐ MVP

**User Story**: As the template owner, I want `pnpm platform release` to compose the marker,
so that a bad version is refused on my machine instead of in a red pipeline.

**Acceptance Criteria**:

1. WHEN `pnpm platform release` runs with no argument THEN the version SHALL be the latest `## vX.Y.Z` section of the changelog; an explicit argument SHALL override it.
2. WHEN it runs THEN it SHALL run the release preflight locally and, on refusal, exit with the preflight's exit code and message and create no commit.
3. WHEN the preflight passes THEN it SHALL create exactly one empty commit subject `chore(release): vX.Y.Z`, create no tag, push nothing, and print the push command as the operator's next act.
4. WHEN the tree carries uncommitted changes, or HEAD is not on `main` THEN it SHALL refuse and create no commit.
5. WHEN the marker commit is created THEN it SHALL pass the repo's `commit-msg` hook without an `Advisory:` trailer.

**Independent Test**: run it in a temp git fixture with a stale changelog — non-zero exit, `git log` unchanged.

---

### P2: The record and the docs name the new shape

**User Story**: As an agent or a new contributor, I want the decision log and the docs to
describe one CI and a marker release, so that nobody looks for a file or a button that no
longer exists.

**Acceptance Criteria**:

1. WHEN the feature lands THEN AD-034 SHALL be amended: the release act is a pushed marker, not a dispatch; the deleted `workflow_dispatch` and ref guard SHALL be named as superseding that clause of REL-01.
2. WHEN the feature lands THEN a project decision SHALL record that `ci.yml` is the single gate workflow, that it ships, and that its catalog jobs are inert in a product.
3. WHEN the feature lands THEN no document instructing a reader how to cut a tag SHALL still name a dispatch or a hand-written `git tag` — at minimum `docs/agents/workflow.md:131-135`, `TEMPLATE.md:26`, `docs/dev/template.md:58`. Historical changelog sections SHALL NOT be rewritten.
4. WHEN the feature lands THEN `gates.test.mjs`, `release-workflow.test.mjs` and `copier-delivery.test.mjs` SHALL assert the new shape, and `pnpm test:scripts` SHALL pass.
5. WHEN the feature lands THEN "the agent never tags and never pushes" SHALL still hold in every edited document — the marker commit is local, the push is the operator's.

**Independent Test**: no instruction to release survives a `dispatch` grep over `docs/` and `TEMPLATE.md`.

---

## Edge Cases

- WHEN two markers ride one push THEN only the head counts; the earlier trips the not-the-head failure.
- WHEN two markers are pushed in succession THEN `concurrency: release` SHALL serialise them and the second SHALL be refused as already tagged.
- WHEN a marker is pushed to a branch other than `main` THEN the release workflow SHALL not trigger.
- WHEN the local clone's tags are stale THEN the CLI's preflight MAY pass and the workflow's preflight (`fetch-depth: 0`) SHALL remain authoritative.
- WHEN a marker push lands THEN CI and the release run concurrently and the 5-entry matrix runs twice — accepted, and the subject of a flagged assumption.

---

## Requirement Traceability

| Requirement ID | Story | Proof | Phase | Status |
| --- | --- | --- | --- | --- |
| CI-01 | P1: one CI workflow | test | Design | Pending |
| CI-02 | P1: one CI workflow | test | Design | Pending |
| CI-03 | P1: one CI workflow | test | Design | Pending |
| CI-04 | P1: one CI workflow | test | Design | Pending |
| CI-05 | P1: one CI workflow | test | Design | Pending |
| CI-06 | P1: one CI workflow | test | Design | Pending |
| MARK-01 | P1: marker becomes a tag | test | Design | Pending |
| MARK-02 | P1: marker becomes a tag | test | Design | Pending |
| MARK-03 | P1: marker becomes a tag | test | Design | Pending |
| MARK-04 | P1: marker becomes a tag | test | Design | Pending |
| MARK-05 | P1: marker becomes a tag | test | Design | Pending |
| MARK-06 | P1: malformed marker fails loudly | test | Design | Pending |
| MARK-07 | P1: malformed marker fails loudly | test | Design | Pending |
| MARK-08 | P1: malformed marker fails loudly | test | Design | Pending |
| MARK-09 | P1: malformed marker fails loudly | test | Design | Pending |
| MARK-10 | P1: one command composes the marker | test | Design | Pending |
| MARK-11 | P1: one command composes the marker | test | Design | Pending |
| MARK-12 | P1: one command composes the marker | test | Design | Pending |
| MARK-13 | P1: one command composes the marker | test | Design | Pending |
| MARK-14 | P1: one command composes the marker | probe: `git commit --allow-empty -m "chore(release): v9.9.9"` then `git reset --hard HEAD~1` | Design | Pending |
| DOC-01 | P2: record and docs | gate | Design | Pending |
| DOC-02 | P2: record and docs | gate | Design | Pending |
| DOC-03 | P2: record and docs | probe: `grep -rn "dispatch\|git tag v" docs/ TEMPLATE.md AGENTS.md.jinja` | Design | Pending |
| DOC-04 | P2: record and docs | gate | Design | Pending |
| DOC-05 | P2: record and docs | gate | Design | Pending |

**ID map:** CI-01..06 = story A · MARK-01..05 = story B · MARK-06..09 = story C ·
MARK-10..14 = story D · DOC-01..05 = story E, in AC order.

**Coverage:** 25 total, 0 mapped to tasks (Tasks not run), 0 unmapped.
**Probe budget:** 2 of 3 (MARK-14, DOC-03).

---

## Success Criteria

- [ ] One workflow file runs the gates; `catalog.yml` is gone and nothing runs twice on a push.
- [ ] A rendered product's CI is green with no catalog job attempted.
- [ ] Releasing is one command plus one push; the Actions UI is never opened.
- [ ] No path exists by which a mistyped version reaches a tag.
- [ ] `pnpm test:scripts` covers the merged workflow's shape, the marker grammar and the CLI.
