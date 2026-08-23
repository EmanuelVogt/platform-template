# Documentation Audience Contract Specification

## Problem Statement

`copier.yml` `_exclude` prunes only `/docs/platform_template` and `docs/catalog/README-contract.md`,
so 31 of the 35 files under `docs/` reach every generated child — including docs addressed to
whoever works in *this* repository. The confirmed instance is `docs/agents/workflow.md`, which ships
and tells its reader to dispatch the `release` workflow (`:134-135`), a file `_exclude` removes and
the child does not have.

The defect class is the **addressee**, not the lexicon. A vocabulary gate (`BRAND-*` in
`audit-2026-08-23-remediation`) scans for the owner's brand; it reads `workflow.md` clean and the
file is still wrong in the child. No brand gate can close this.

## Goals

- [ ] A doc is delivered or withheld by **where it lives**, enforced by a test — not by a per-file
      `_exclude` line someone must remember.
- [ ] No shipped doc names a repository artifact the child does not have; the check runs in
      `pnpm test:scripts`.
- [ ] `docs/agents/workflow.md` reaches the child addressed to the child.

## Out of Scope

| Item | Reason |
| --- | --- |
| Vocabulary leaks (`Rituaali`, `rit`, `dokploy`) in shipped docs | `audit-2026-08-23-remediation` owns them as the `BRAND-*` class. Independent axis — this feature never edits a word for being branded |
| Commands named in shipped docs | Remediation `RUN-01` AC 6 already imposes existence for **commands**, pinned to four files. This guard covers **paths** and never re-checks a command |
| Misaddressed prose that names no path | Not mechanically detectable. The guard closes the path-bearing half; AUD-09 removes today's only confirmed prose-only instance. Stated, not hidden — see Success Criteria |
| Files outside `docs/` (`.claude/agents/**`, `AGENTS.md.jinja`, `.github/README.md`) | Owner ruling 2026-08-23: the contract covers `docs/**` |
| Folding `docs/platform_template/` into `docs/platform/` | Two in-flight features cite `docs/platform_template/audit-2026-08-23.json` by path; fold after both close |
| Translating shipped docs, or the pt-BR of `docs/advisories/**` | Unrelated axis; `LOC-*` in the remediation owns language |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Declaration mechanism | **Directory**: template-only docs live under `docs/platform/`, excluded by the single anchor `/docs/platform` | Owner ruling 2026-08-23. Reverses the earlier front-matter lean — one `_exclude` line instead of an annotation on 35 files, at the cost of a move plus link repair | y |
| A doc both sides need | **Split** into a shipped file and a `docs/platform/` file. There is no `both` marker | The directory mechanism has no place for one; the owner ruled the split for `workflow.md`, which makes the split the general answer | y |
| Where the catcher runs | Static, inside `pnpm test:scripts` — the shipped set is derived from `copier.yml`, no copier render and no docker | Runs on every pre-push. The render-based alternative sees Jinja and `_skip_if_exists`, but only runs when someone calls `template:smoke`, so the defect passes the gate that actually fires | y |
| Contract scope | `docs/**` only | Owner ruling 2026-08-23 | y |
| Default direction | A new doc still **ships** unless someone puts it under `docs/platform/`. The directory does not invert today's default | Accepted with the ruling. The catcher, not the directory, is what closes the confirmed defect; the directory makes exclusion unambiguous and un-forgettable in one place | n |
| Shipped set | `git ls-files` minus every `copier.yml` `_exclude` match, with a trailing `.jinja` stripped (a `.jinja` renders to the bare name in the child) | The one definition both guards share; recomputed from `copier.yml`, never hard-coded, so a new `_exclude` entry cannot desynchronise it | n |
| Path token grammar | A token is a relative markdown link target (non-anchor, non-URL) or an inline-code span containing `/`. Ignore: URLs, tokens carrying `<`, `>`, `{{`, `*` or `…`, and tokens starting with `/`, `~` or `$`. A directory token exists when any shipped file sits under it | Placeholders (`.worktrees/<slug>`, `0000_*`), HTTP routes (`/health`) and shell paths (`~/.local/bin`) are not repository paths; flagging them is noise that gets the guard weakened | n |
| Excluded-workflow rule | An inline-code token **exactly equal** to the file stem of a `.github/workflows/*.yml` listed in `_exclude` fails (today `release`, `catalog`) | `workflow.md:134` names the workflow *by name, not by path* — the path grammar alone misses the marquee bug. Exact equality keeps `pnpm catalog:lint` and `` `catalog/` `` out of it | n |
| Guard location | Under `scripts/platform/__tests__/`, already a directory-level `_exclude` entry | Nothing is added to `_exclude`, and remediation `RUN-01` AC 2 (a shipped `scripts/**` file importing an excluded path) cannot fire | n |
| `docs/catalog/README-contract.md` | Moves to `docs/platform/`; its per-file `_exclude` entry is dropped | It is the one per-file `docs/` entry today; leaving it contradicts AUD-02 | n |
| Child impact | A doc leaving the shipped set is deleted by `copier update` with no manual step. Non-major, no advisory | AD-034 forbids a manual migration step on a non-major; nothing under `catalog/**` changes, so the `commit-msg` advisory hook does not apply | n |
| Changelog | Authored at Tasks against the next unreleased version. The untagged `v2.3.0` section is not touched (a parallel session owns it) and `v2.4.0` belongs to the remediation | `release-preflight` keys on the latest section (AD-034); appending above an untagged one makes it permanently untaggable | n |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: A doc is delivered by where it lives ⭐ MVP

**User Story**: As the platform owner, I want a doc's directory to decide whether it reaches a child,
so that delivery stops depending on someone remembering to add a `_exclude` line.

**Why P1**: Today every new doc ships by default and the only brake is a per-file entry a human has
to write. That is how 31 files, several of them template-internal, ended up in every child.

**Acceptance Criteria**:

1. WHEN a file under `docs/` is addressed to whoever works in the template repository THEN it SHALL
   live under `docs/platform/`, and `copier.yml` `_exclude` SHALL carry the anchor `/docs/platform`.
2. WHEN `copier.yml` `_exclude` is read THEN no entry SHALL name an individual file under `docs/`;
   every `docs/` entry SHALL be a directory anchor.
3. WHEN the shipped set is computed THEN it SHALL contain no file under `docs/platform/` and SHALL
   contain every other tracked file under `docs/`.
4. WHEN a doc moves into `docs/platform/` THEN no tracked file in the repository SHALL still
   reference its old path.

**Independent Test**: compute the shipped set from `copier.yml` and assert the three set properties
plus a repository-wide absence of the old paths.

---

### P1: A shipped doc never names something the child does not have ⭐ MVP

**User Story**: As a client team reading the docs in a freshly generated repository, I want every
path and workflow the docs name to exist in my repository, so that following an instruction does not
dead-end.

**Why P1**: This is the layer that catches the defect without judging prose, and it is what makes
the directory mechanism safe despite leaving "ships" as the default.

**Acceptance Criteria**:

5. WHEN `pnpm test:scripts` runs THEN a guard SHALL derive the shipped set from `copier.yml` and
   FAIL when a shipped doc names a repository path absent from that set.
6. WHEN a shipped doc contains an inline-code token exactly equal to the file stem of a
   `.github/workflows/*.yml` listed in `_exclude` THEN the guard SHALL fail.
7. WHEN the guard fails THEN its message SHALL name the offending `file:line` and the token.
8. WHEN `copier.yml` `_exclude` changes THEN the guard SHALL recompute the shipped set from
   `copier.yml`, never from a list embedded in the test.

**Independent Test**: add a shipped doc naming `.github/workflows/release.yml` and a second naming
`` `release` ``; the guard fails on both with the file, line and token; remove them and it passes.

---

### P1: The child's workflow doc is addressed to the child ⭐ MVP

**User Story**: As an agent operating a generated product, I want the workflow doc I am told to read
to describe *my* repository, so that I do not follow a rule that belongs to the template.

**Why P1**: `docs/agents/workflow.md` is the confirmed instance and the reason the feature exists. A
gate that passes only because the offending file was excluded wholesale would leave the child with no
branch, commit or spec rule at all.

**Acceptance Criteria**:

9. WHEN a child reads its workflow doc THEN it SHALL contain no instruction that depends on a
    template-only artifact — specifically no `release`-workflow dispatch, no `.worktrees/`
    shared-checkout rule, no "no pull requests for our own work", and no `origin/main` staleness
    anecdote.
10. WHEN whoever works in the template needs those mechanics THEN they SHALL find them under
    `docs/platform/`, and that file SHALL NOT be in the shipped set.
11. WHEN `docs/agents/README.md` is read in a child THEN every row of its file table SHALL point at a
    file present in the shipped set.

**Independent Test**: run the AUD-05 guard over the repaired tree — it passes; assert the four named
strings are absent from the shipped workflow doc and present under `docs/platform/`.

---

## Edge Cases

- WHEN a shipped doc links to a `.jinja` file by its rendered name (`infra.md`) THEN the guard SHALL
  treat it as present, because `.jinja` is stripped when the shipped set is computed.
- WHEN a shipped doc names a directory (`apps/api/src/shared/**`) THEN the guard SHALL treat it as
  present when any shipped file sits under it.
- WHEN a token carries a placeholder (`catalog/<entry>`, `0000_*`, `{{ project_slug }}`) THEN the
  guard SHALL ignore it rather than resolve it.
- WHEN `docs/platform/` is empty or absent THEN AUD-01 SHALL fail loudly rather than pass on a
  vacuous set — a missing directory is not a clean result.
- WHEN a doc under `docs/platform/` links to a shipped doc THEN the guard SHALL NOT check it: the
  rule constrains what the child is sent to, and the template has every file.

---

## Requirement Traceability

| Requirement ID | Story | Proof | Phase | Status |
| --- | --- | --- | --- | --- |
| AUD-01 | P1: Delivered by where it lives | test | Tasks | Pending |
| AUD-02 | P1: Delivered by where it lives | test | Tasks | Pending |
| AUD-03 | P1: Delivered by where it lives | test | Tasks | Pending |
| AUD-04 | P1: Delivered by where it lives | test | Tasks | Pending |
| AUD-05 | P1: Never names what the child lacks | test | Tasks | Pending |
| AUD-06 | P1: Never names what the child lacks | test | Tasks | Pending |
| AUD-07 | P1: Never names what the child lacks | test | Tasks | Pending |
| AUD-08 | P1: Never names what the child lacks | test | Tasks | Pending |
| AUD-09 | P1: Workflow doc addressed to the child | test | Tasks | Pending |
| AUD-10 | P1: Workflow doc addressed to the child | test | Tasks | Pending |
| AUD-11 | P1: Workflow doc addressed to the child | test | Tasks | Pending |

**ID format:** `AUD-[NUMBER]`.

**Proof:** every AC is a `test` under `pnpm test:scripts`. **Probe budget used: 0 of 3** — the whole
contract is assertable from `copier.yml` plus `git ls-files`, with no act reserved to the user.

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 11 requirements total, 0 mapped to tasks (Tasks phase not run), 0 unmapped.

---

## Success Criteria

- [ ] The shipped set contains zero files addressed to a template worker, and `docs/platform/` is the
      only place such a file can live.
- [ ] `pnpm test:scripts` fails on a shipped doc that names an absent path or an excluded workflow,
      and reports the `file:line` and token.
- [ ] `docs/agents/workflow.md` in a rendered child carries no template-only instruction.
- [ ] **Known residual:** misaddressed prose that names no path and no excluded workflow stays
      undetected. The guard closes the path-bearing half of the class; the remaining half is a review
      concern, and this feature removes its only confirmed instance rather than claiming the class is
      closed.
