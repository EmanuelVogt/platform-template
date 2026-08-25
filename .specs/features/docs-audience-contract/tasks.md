# Documentation Audience Contract Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute
flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source
of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Spec**: `.specs/features/docs-audience-contract/spec.md`
**Design**: skipped at Specify (Medium; seam questions closed in the spec's Assumptions)
**Status**: Approved 2026-08-25 — inline-waiver grammar pinned below before the first dispatch.
**Pre-feature test count**: 630 passing (`pnpm test:scripts`, 0 failing, tree clean at `aae08e6`).

---

## Measurement that produced this plan

A throwaway prototype of the spec's grammar was run against the tree at `main` before authoring, because
the spec sizes the repair as two files and that number had to be confirmed. It is not: the guard as
literally specified reports **400 findings**; with inline-code tokens resolved repo-root-relative
(rather than doc-relative) it reports **93**. Every number below is measured, not estimated.

Three owner rulings taken on that evidence (2026-08-25) shape the plan:

1. **Guard scope** — covers every shipped doc (AUD-05 unchanged), with three principled exemption
   rules rather than a pinned file list.
2. **Changelog** — the entry is appended to the existing untagged `v2.4.1` section.
3. Rejected: full repair with no exemptions, a pinned guard list, and reopening Specify.

**The 93 reduce to 37 under the three rules**, and the 35 enumerated of those classify as
**20 REAL / 1 AMBIGUOUS / 14 NOISE**. The guard produces the authoritative list at Execute; these
counts are the plan's input, not an acceptance criterion.

### Two spec claims the measurement contradicts

- **`context.md` § 3** states the static mode's fidelity loss is bounded because "the shipped-set
  computation strips a trailing `.jinja`, which covers the only rendered-name difference that affects
  paths." **False as of `web-stack-next`.** Verified by running `copier copy` against this template
  and instrumenting copier 9.17.2: the child receives `apps/web/` populated from whichever stack it
  answered for, and **not** through `_exclude` and **not** through a `_tasks` rename. Two repo-root
  directories are literally named with a Jinja conditional, each holding a `web` symlink (git mode
  120000):

  ```
  "{% if web_stack == 'next' %}apps{% endif %}/web"  ->  ../apps/web-next
  "{% if web_stack == 'vite' %}apps{% endif %}/web"  ->  ../apps/web-vite
  ```

  Copier renders **every** path segment through Jinja (`_render_parts`, `_main.py:1061-1150`); a
  segment rendering to the empty string skips that whole branch (`_main.py:1131,1140`), and the
  matching one yields the destination `apps/web`, whose content copier reads through the symlink.
  `apps/web-vite` and `apps/web-next` stay excluded under their own literal names; the symlink path is
  a different, non-excluded destination. Without modelling this the guard reports 8 false positives on
  correct prose (`docs/dev/template.md:24-28`, `docs/arch/front.md:3,6`, `docs/dev/deploy.md.jinja:30,41`).
  T8 models it; the spec's Assumptions row for the shipped set is amended by T8's `Done when`.
- **AUD-06's grammar** ("an inline-code token **exactly equal** to the file stem") was written against
  `workflow.md:134-135` in a wording that no longer exists. The file was rewritten by
  `release-marker-commit`; the token today is `` `release.yml` `` (`docs/agents/workflow.md:144`),
  which is neither a path token (no `/` in the span) nor equal to the stem `release`. **The marquee
  defect currently evades both rules.** T10 extends the rule to `<stem>`, `<stem>.yml` and
  `<stem>.yaml` — the same intent, a wider spelling. Also measured: the excluded workflow stems today
  are `release` and `format`, not the `release`/`catalog` the spec's parenthetical names
  (`catalog.yml` was deleted under AD-036, `format.yml` was added).

### A second confirmed instance of the defect class

`docs/agents/issue-tracker.md.jinja:51` sends the child reader to
`.github/workflows/feedback-triage.yml`, which is tracked nowhere in the repo. Independent of
`workflow.md`, same class, found by the prototype. Repaired in T4.

### The four legitimate answers to "this path is absent"

The residual is not 37 defects. It is four distinct situations, and the guard needs a mechanism for
each — this is the plan's core design decision.

| # | Situation | Mechanism | Task | Measured examples |
| - | --------- | --------- | ---- | ----------------- |
| 1 | Present once rendered | shipped set models the `.jinja` strip **and** the Jinja-conditional root directories that resolve to `apps/web` | T8 | `infra.md`, `apps/web/**` |
| 2 | The child's own tooling or the reader creates it | a short justified list in the guard, one comment per entry | T9 | `.specs/` (child runs the skill), `.claude/skills/` (`pnpm skills:sync`), `generated/` (`pnpm contract`), `apps/api/.env` (`cp` per `local-environment.md:14`) |
| 3 | Named **in order to explain it is absent** | inline waiver the doc author writes, read by the guard | T9 | `docs/catalog/catalog.md:4` "in `catalog/`, outside the copier"; `workflow.md:48` `.claude/worktrees/` cited as the wrong location |
| 4 | Genuinely wrong | repair the doc | T1-T6 | the 20 REAL |

Situation 3 is a new mechanism, not in the spec. It is proposed rather than assumed: **an inline
waiver is the only one of the four that puts the justification in the diff a reviewer reads.** The
alternative — a per-file allowlist in the guard — hides the reason in the test and rots silently,
which is the failure `context.md` warns about ("flagging them is noise that gets the guard
weakened"). It is *not* the dated waiver list `context.md` rejected: that one deferred the
`workflow.md` repair; this one annotates a mention that is correct as written.

### Known coverage hole, stated not hidden

The grammar reads markdown link targets and **inline** code spans. A path inside a fenced code block
carries no backticks and is invisible to the guard (`docs/test/testing.md:40-44` names `catalog/**`
that way). This widens the spec's declared residual; it is recorded here and in T9's `Done when`, and
is not closed by this feature.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found:
> `docs/test/testing.md` (tiers at `:36-44`, coverage floor at `:168`), `docs/code-quality.md`,
> `AGENTS.md.jinja`, `package.json:34`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Guard module (`scripts/platform/__tests__/lib/*.mjs`) | unit | All branches; 1:1 to spec ACs; every edge case in spec § Edge Cases has a test | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| `copier.yml` `_exclude` contract | unit | AUD-01..04 asserted from the parsed file, never from a list embedded in the test | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| Shipped doc prose | unit (grep-style assertion) | **L-027**: an AC requiring a doc to state or omit specific content needs a literal assertion on that file's text — correct prose with nothing guarding it is zero evidence | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| Rendered child | integration | Final gate only — one run per feature | `scripts/template-smoke.mjs` | `pnpm template:smoke` |

`scripts/**` sits outside the 90 % coverage floor (`docs/test/testing.md:168`); `test:scripts` runs
uninstrumented under Node's runner. Depth here comes from the AC mapping, not from a threshold.

**Runner conventions, measured** (`package.json:34` = `node --test scripts/platform/__tests__/*.test.mjs`):
`node:test` + `node:assert/strict`, never Vitest — `scripts/**` is in no Vitest project. Root via
`path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")`
(`copier-questions.test.mjs:9-13`). YAML through the `yaml` package
(`copier-questions.test.mjs:19-20`); it is a real root dependency (`package.json`). Tracked files via
`execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })` split on `"\0"`
(`copier-answers-leak.test.mjs:20`). There is no shared test helper; tests import the production
module they exercise.

**Why the guard module lives at `scripts/platform/__tests__/lib/`**: the spec's Assumptions pin the
guard inside `scripts/platform/__tests__/`, already a directory-level `_exclude` entry, so nothing is
added to `_exclude` and remediation `RUN-01` AC 2 cannot fire. The `test:scripts` glob is flat and
matches only `*.test.mjs`, so a module in a `lib/` subdirectory is not collected as a test — verified
against the existing `fixtures/` subdirectory, which the glob likewise ignores.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task with unit tests only | `node --test scripts/platform/__tests__/<file>.test.mjs` |
| Full | After a task whose assertions span the tier | `pnpm test:scripts` |
| Build | Once per wave, orchestrator, through the runner | `pnpm format:check && pnpm test:scripts` — every wave here touches only `docs/**`, `scripts/platform/__tests__/**`, `copier.yml` and `.claude/hooks/**`; nothing under `apps/**` or `packages/**`, so `turbo lint typecheck` has no input and is not run between waves |
| Final | Once per feature, Verifier | `pnpm format:check && pnpm check && pnpm test && pnpm test:scripts && pnpm template:smoke` |

**Suite-cost rule:** `template:smoke` renders a real child and is the only faithful proof that the
`_exclude` change delivers what the guard predicts statically. It runs **once**, at the Final gate.
No worker runs it.

**All waves are `gate: scoped`** — no task touches a shared package, a domain entity, module wiring or
the contract. `copier.yml` (T7) is root config and gets an exclusive wave for ownership, not because
it needs the full unit suite.

---

## Inline waiver — pinned grammar

**Pinned with the owner 2026-08-25, before wave 1, because waves 1 and 3 both depend on it.** T2, T3,
T5 and T6 *write* waivers; T9 *reads* them. The spelling could not be left to T9's implementation as
originally drafted: three parallel wave-1 workers would each have invented one.

A waiver is an HTML comment at the **end of the line that carries the token**:

```
An entry lives in `catalog/`, outside the copier. <!-- audience-contract: catalog/ — named to explain it is not shipped -->
```

Rules, obeyed by the doc author (T2, T3, T5, T6) and enforced by the guard (T9):

- **Marker prefix exactly `audience-contract:`**, then the token verbatim as it appears in the doc,
  then ` — `, then the reason.
- **One token, one paragraph.** The comment names the token literally, so a paragraph carrying two
  absent tokens needs two comments. A waiver never covers a file. *(Amended at wave 3: this read
  "one line" until hard-wrapped prose proved a token and the sentence's end sit on different source
  lines. See § Wave 3 deviations, item 2.)*
- **End of the same line only.** A comment on its own line does **not** count: in CommonMark an HTML
  block interrupts the paragraph it sits inside, so a waiver written that way would silently change
  how the doc renders. Trailing inline raw HTML renders as nothing and keeps the paragraph intact.
- **The reason is what a reviewer reads in the diff** — that is the whole argument for this mechanism
  over an allowlist inside the guard. "see above" is not a reason; name what makes the absence correct.

---

## Wave Plan

Waves run in order (barrier + Build gate between them). Clusters inside a wave run **in parallel**,
one worker each; tasks inside a cluster run in the listed order.

**The repair precedes the guard, and that ordering is load-bearing.** `pnpm test:scripts` runs on
every pre-push (`docs/agents/workflow.md:118-122`), so a guard landing before the docs are repaired
would leave the tree red for every other session sharing this checkout. Waves 1-2 make the tree
satisfy the contract; wave 3 makes it enforceable. The guard's *failure* cases are proved against
fixtures inside its own tests, never against the live tree, so nothing is left unproven by this order.

| Wave | Cluster | Tasks (in order) | Files (union of Touches) | Notes |
| ---- | ------- | ---------------- | ------------------------ | ----- |
| 1 | C1 | T1 → T2 | `docs/catalog/README-contract.md`, `docs/platform/README-contract.md`, `docs/catalog/catalog.md`, `docs/platform/catalog-authoring.md`, `catalog/README.md`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/__tests__/lint.test.mjs` | catalog vertical · gate: scoped |
| 1 | C2 | T3 → T4 | `docs/agents/workflow.md`, `docs/platform/workflow.md`, `docs/agents/README.md`, `docs/agents/harness.md`, `docs/agents/issue-tracker.md.jinja`, `docs/arch/front.md`, `AGENTS.md.jinja`, `scripts/platform/__tests__/docs-no-owner-infra.test.mjs`, `scripts/platform/__tests__/docs-stay-lean.test.mjs`, `scripts/platform/__tests__/workflow-doc-pipeline-parity.test.mjs`, `.claude/hooks/specs-in-english.mjs` | agents + arch vertical, disjoint from C1 · gate: scoped |
| 1 | C3 | T5 → T6 | `docs/advisories/README.md`, `docs/platform/advisory-authoring.md`, `docs/advisories/ADV-20260821-01.md`, `docs/advisories/ADV-20260822-01.md`, `docs/advisories/ADV-20260822-02.md`, `docs/advisories/ADV-20260822-03.md`, `docs/advisories/ADV-20260822-04.md`, `docs/advisories/ADV-20260822-05.md`, `docs/advisories/ADV-20260823-02.md`, `docs/dev/local-environment.md` | advisories vertical, disjoint from C1 and C2 · gate: scoped |
| 2 (exclusive) | C4 | T7 | `copier.yml` | root config — alone · gate: scoped |
| 3 | C5 | T8 → T9 → T10 → T11 → T12 | `scripts/platform/__tests__/lib/audience-contract.mjs`, `scripts/platform/__tests__/shipped-set.test.mjs`, `scripts/platform/__tests__/docs-shipped-paths.test.mjs`, `scripts/platform/__tests__/docs-workflow-names.test.mjs`, `scripts/platform/__tests__/docs-audience-contract.test.mjs`, `scripts/platform/__tests__/fixtures/audience-contract/**`, `docs/dev/template-changelog.md` | guard vertical + changelog last · gate: scoped |

```
Wave 1:  [C1: T1 → T2]  ∥  [C2: T3 → T4]  ∥  [C3: T5 → T6]
Wave 2:  [C4: T7]  (exclusive)
Wave 3:  [C5: T8 → T9 → T10 → T11 → T12]
```

---

## Execution Record

### Wave 1 — DONE, Build gate GREEN (2026-08-25)

Gate: `pnpm format:check` exit 0 · `pnpm test:scripts` **639 pass / 0 fail**.
Pre-feature floor was **630 pass / 0 fail** at `aae08e6`; the delta includes commits from a parallel
session sharing this checkout, not this feature alone.

| Cluster | Task | Commit | Note |
| ------- | ---- | ------ | ---- |
| C1 | T1 | `aea599b` | 2 inline waivers in `docs/catalog/catalog.md:5,:25` |
| C1 | T2 | `aaa203d` | |
| C2 | T3 | `89c165f` | see correction 3 |
| C2 | T4 | `2f3ac8d` | `front.md:184` `packages/ui` → `shared/ui/` |
| C2 | — | `68f01d1` | **regression repair, not one of the 12 tasks** — see correction 4 |
| C3 | T5 | `6dd7c14` | |
| C3 | T6 | `44f53d6` | 3 inline waivers in `ADV-20260821-01:45,:59`, `ADV-20260823-02:16` |

### Wave 2 — DONE, Build gate GREEN (2026-08-25)

Gate: `pnpm format:check` exit 0 · `pnpm test:scripts` **639 pass / 0 fail**.

| Cluster | Task | Commit | Note |
| ------- | ---- | ------ | ---- |
| C4 | T7 | `203f448` | `/docs/platform` anchored; the per-file `docs/catalog/README-contract.md` entry removed; `/docs/platform_template` left in place |

### Wave 3 — DONE, Build gate GREEN (2026-08-25)

Gate: `pnpm format:check` exit 0 · `pnpm test:scripts` **681 pass / 0 fail** (floor was 630).
Shipped set measures 663 of 1551 tracked files; the guard runs over 159 shipped docs.

| Cluster | Task | Commit | Note |
| ------- | ---- | ------ | ---- |
| C5 | T8 | `df41664` | shipped set 663/1551, floor of 500 asserted |
| C5 | T9 | `83cd9fc` | guard green over 159 shipped docs |
| C5 | T10 | `2629248` | |
| C5 | T11 | `79d17e9`, `2e0c31d` | the grep had to exclude its own file once tracked |
| C5 | T12 | `95b02b0` | new `## v2.5.0` above `v2.4.1`, migration steps `None` |
| C5 | T10 close-out | `5d86d8b` | **orchestrator follow-up** — see deviation 3 |

### Wave 3 deviations, all accepted

**1. `.agents/skills/**` is outside the guard's scope** (`audience-contract.mjs:172`). 19 of the 22
live findings sat there: synced third-party payload that no wave repairs and no task owns. This
moves the guard back toward the scope the owner actually ruled (`docs/**`); the plan had widened it
to "every shipped doc". Blast radius is pinned by assertion: with the exemption off, zero findings
fall outside that prefix.

**2. A waiver matches over its paragraph, not one source line — my pinned grammar was wrong.** I
pinned "one token, one line". It broke immediately on hard-wrapped prose: wave 1 correctly wrote
`docs/catalog/catalog.md`'s waiver at `:5` for a token sitting on `:4`. C5 widened the match to the
paragraph and kept the part that carries the guarantee — an own-line comment still waives nothing,
asserted for both the adjacent and the separated case. The spelling is unchanged. Amend § *Inline
waiver — pinned grammar* to read "paragraph" wherever it reads "line".

**3. T10 shipped a ratchet over a REAL live defect, and the orchestrator closed it.** C5's new stem
rule found `docs/dev/template-update.md:10` — "The `release` workflow runs the full gate" — a REAL
AUD-06 finding that did not exist as a finding when the tree was measured, because the rule did not
exist then. It sat outside C5's `Touches`, so C5 pinned it as an expected finding rather than
silently exempting it. Correct call, wrong end state: the guard would have shipped green while
tolerating exactly the defect it exists to catch. Closed in `5d86d8b` with an inline waiver — the
sentence sits under "What the template promises per tag", describes the template's own machinery and
instructs the child to do nothing — and the assertion was shrunk to expect **zero** live findings.

**Also recorded:** `ADV-YYYYMMDD-NN.md` is read as a spec § Edge-Cases placeholder; AUD-04 exempts the
two historical records (the changelog and `docs/platform_template/`), blast radius pinned.

### Residual discovered at Execute, not closed by this feature

**The module installer is a second delivery channel the guard does not model.** The shipped set is
`git ls-files` minus `copier.yml` `_exclude`, so `/catalog` puts every `catalog/*/README.md` outside
it and the guard skips them. But those READMEs reach the child anyway, vendored by
`pnpm platform module add`. An entry README naming `.github/workflows/release.yml` misleads a child
reader exactly as much as a `docs/` file would, and nothing catches it.

Surfaced 2026-08-25 by a parallel session whose `test-suite-refactor` rewrote the § *Tests* section
of all five entry READMEs and asked which side of the boundary they fell on. The honest answer is
that the spec's `docs/**` scope ruling does not cover the question — it settles which *directory*
the contract governs, not which *channels* deliver to a child. Both AUD-03 and AUD-05 are written
against the copier shipped set alone.

**Corroborating instance, measured the same night.** That session's T35 rewrote the § *Tests* section
of all five entry READMEs, and two of them now describe the kernel harness at
`apps/api/src/shared/test/**` — a path the child receives by copier, never by `module add`, which
vendors an entry into `apps/api/src/modules/<entry>/`. Cite
`catalog/identity/single-tenant/README.md` § *Tests*. So the exact failure this feature exists to
catch — a shipped doc sending a child reader to a path it does not have — was written that night,
into files the guard structurally cannot reach. Two independent features demonstrated the same hole
within hours of each other, which is the argument for closing it rather than living with it.

**Not fixed here** — closing it means teaching `shippedSet()` about `.platform-modules.lock` and the
installer's copy semantics, which is a feature, not a task. Recorded so the next session does not
read the guard's green as covering catalog entries.

### Corrections this wave forced on the plan

**1. T12's premise is void — `v2.4.1` is tagged.** A parallel session pushed the marker commit
`3bef437 chore(release): v2.4.1` to `origin/main` *during wave 1*, and the tag `v2.4.1` now exists.
The owner ruling of 2026-08-25 ("append to `v2.4.1`, it is the only untagged section") rested on a
fact that no longer holds — **every** changelog section is now tagged. T12 must open a **new**
section above `v2.4.1`. Version: T7 ships as `feat(template):` and a doc leaving the shipped set is
delivered by `copier update` with no manual step, so the mechanical read is **`v2.5.0`**, non-major,
no advisory (spec § Assumptions, AD-034). **Confirm with the owner before T12 runs** — this reopens
a ruling, it does not merely apply one.

**2. T6's finding count was 9, not 10.** The task body claims "10 REAL"; only 9 distinct citations
are enumerated in it. All 9 were closed and the eight target files were swept for further dead
paths. A count slip in the plan, not a missed finding.

**3. T3 left `.worktrees/` in the shipped half, deliberately — and this changes what T11 may
assert.** The task table said the `.worktrees/` shared-checkout rule (`:36-60`) moves wholesale.
C2 moved the shared-checkout *framing*, the no-PR policy and the `origin/main` anecdote, but kept
the `.worktrees/<slug>` naming convention and the `.claude/hooks/branch-only-in-worktree.mjs` lock
in the child's doc, because `docs/agents/harness.md` and `AGENTS.md.jinja` cross-reference them and
the child has both. That is the right call — the child really does use worktrees — but it means
**AUD-09/T11 must assert the absence of the shared-checkout *rule*, not the absence of the string
`.worktrees/`**. A literal `assert(!shipped.includes(".worktrees/"))` will fail against a correct
tree. Pick the four assertion strings from what `docs/platform/workflow.md` actually holds at
`89c165f`, not from the spec's prose.

**4. The feature created one instance of its own defect class, and it is repaired.** T3's move left
`docs/agents/issue-tracker.md.jinja:62-63` telling the child "our own work never opens a PR … See
workflow.md" while the no-PR policy had moved to the unshipped `docs/platform/workflow.md`. C2
flagged it rather than widening scope on its own; the orchestrator ruled it **in scope** — the
spec's accepted "misaddressed prose" residual covers instances that *pre-existed* the feature, and
shipping a fresh one would contradict the feature's whole purpose. Repaired in `68f01d1`.

**5. Out-of-feature, for the record:** `seam-no-edit.test.mjs` SEAM-03 went red mid-wave when a
parallel session's `2004f8a` shifted lines in `catalog/identity/single-tenant/README.md`, which the
test indexed by hardcoded position. It was fixed **twice** — `dcc10c8` (parallel session) and
`a2716e7` (a worker this session dispatched). Redundant work: the breaking commit's owner was
already on it. Both are green; nothing in this feature touches `catalog/**`.

### Wave 2 readiness

`copier.yml` is **free**: its declared single owner, `audit-2026-08-23-remediation` T41, is DONE at
`0dd2348`, and the prior `web_stack` × `product_locale` conflict resolution was accepted. Re-verify
immediately before dispatch — this checkout is shared and a parallel session commits into it.

---

## Task Breakdown

### T1: Move the catalog README contract into `docs/platform/`

**What**: `git mv docs/catalog/README-contract.md docs/platform/README-contract.md` and repoint every
inbound reference.
**Where**: `docs/platform/README-contract.md`
**Touches**: `docs/catalog/README-contract.md`, `docs/platform/README-contract.md`,
`catalog/README.md`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/__tests__/lint.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: the existing file verbatim — this is a move plus reference repair, not a rewrite
**Requirement**: AUD-02, AUD-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The file exists only at `docs/platform/README-contract.md`; `git ls-files` shows no
      `docs/catalog/README-contract.md`
- [ ] `catalog/README.md`, `scripts/platform/catalog-lint.mjs` and
      `scripts/platform/__tests__/lint.test.mjs` name the new path; no tracked file outside `.specs/`
      still names the old one
- [ ] `copier.yml` is **not** edited here — the stale `_exclude` entry is T7's, and copier tolerates
      an entry matching nothing
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit (the existing `lint.test.mjs` assertion moves with the path) · **Gate**: full

**Commit**: `docs(platform): move the catalog README contract out of the shipped set`

---

### T2: Split `docs/catalog/catalog.md` — consuming half ships, authoring half does not

**What**: keep the child-facing half (what an entry is, `pnpm platform module add`, `dependsOn`,
`.platform-modules.lock`) in place; move the authoring half (`## Authoring an entry`, the
`scripts/platform/catalog-*.mjs` tooling, `advisory-required.mjs`) to
`docs/platform/catalog-authoring.md`, cross-linked from the platform side only.
**Where**: `docs/catalog/catalog.md`, `docs/platform/catalog-authoring.md`
**Touches**: `docs/catalog/catalog.md`, `docs/platform/catalog-authoring.md`
**Depends on**: T1
**Exclusive**: no
**Reuses**: the split shape ruled for `workflow.md` (`context.md` § 2) — a doc both sides need is
split, never marked
**Requirement**: AUD-01, AUD-05

**Measured findings this task closes** (6 REAL): `:4` `catalog/`, `:24`
`catalog/schema/module.schema.json`, `:46` link to `./README-contract.md` (dangling after T1), `:74`
`scripts/platform/catalog-lint.mjs`, `:81` `scripts/platform/advisory-required.mjs`, `:90`
`scripts/platform/catalog-check.mjs`.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The shipped half names no path absent from the shipped set, **except** where it explains the
      catalog's absence — those mentions carry the inline waiver of § *Inline waiver — pinned grammar*,
      and the waiver text says why
- [ ] `:99`'s `docs/advisories/ADV-YYYYMMDD-NN.md` is left as written: it is a naming pattern, not a
      file, and T9's grammar ignores it
- [ ] `docs/platform/catalog-authoring.md` holds the authoring half and is not in the shipped set
- [ ] No tracked file links to a heading that moved
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit (asserted by T9/T11 in wave 3) · **Gate**: full

**Commit**: `docs(platform): split the catalog doc by audience`

---

### T3: Split `docs/agents/workflow.md` — the confirmed instance

**What**: move the template-only mechanics to `docs/platform/workflow.md` and leave the child a
workflow doc that still carries its branch, commit, worktree and spec rules.
**Where**: `docs/agents/workflow.md`, `docs/platform/workflow.md`
**Touches**: `docs/agents/workflow.md`, `docs/platform/workflow.md`,
`scripts/platform/__tests__/docs-no-owner-infra.test.mjs`,
`scripts/platform/__tests__/docs-stay-lean.test.mjs`,
`scripts/platform/__tests__/workflow-doc-pipeline-parity.test.mjs`,
`.claude/hooks/specs-in-english.mjs`, `docs/agents/harness.md`, `AGENTS.md.jinja`
**Depends on**: None
**Exclusive**: no
**Reuses**: the four strings AUD-09 names are quoted from the current file at the lines below
**Requirement**: AUD-09, AUD-10, AUD-11

**The four template-only mechanics, at their current lines** (the spec cites `:134-135`, which the
`release-marker-commit` rewrite invalidated — read the file, never the spec's line numbers):

| Mechanic | Current location | Goes to |
| -------- | ---------------- | ------- |
| "No pull requests for our own work" | `:7-23` (heading + section) | `docs/platform/workflow.md` |
| `.worktrees/` shared-checkout rule | `:36-60` | `docs/platform/workflow.md` |
| `origin/main` staleness anecdote ("it has been 53 behind") | `:51-55` | `docs/platform/workflow.md` |
| `release` workflow dispatch | `:137-145`, the `` `release.yml` `` at `:144` | `docs/platform/workflow.md` |

**Four dependents break on the split and travel in this task**: the three tests above and
`.claude/hooks/specs-in-english.mjs` all reference `docs/agents/workflow.md` by path.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A literal assertion (added in T11) proves the four strings are **absent** from the shipped half
      and **present** under `docs/platform/` — per L-027, correct prose with no assertion is zero
      evidence
- [ ] The shipped half still tells the child how to size a task, branch, commit and write a spec
- [ ] `docs/agents/README.md:14` resolves inside the shipped set (AUD-11) — its row still points at
      `workflow.md`, which still ships
- [ ] The three dependent tests and the hook pass against the new layout
- [ ] `workflow.md:126`'s `catalog/` and `:48`'s `.claude/worktrees/` are resolved — the first by
      moving or waiving, the second by an inline waiver per § *Inline waiver — pinned grammar* (it is an anti-example, not
      a pointer)
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit · **Gate**: full

**Commit**: `docs(platform): split the workflow doc by audience`

---

### T4: Repair the remaining agents and arch dead references

**What**: fix the REAL findings in `docs/arch/front.md` and `docs/agents/issue-tracker.md.jinja`, and
disambiguate `docs/agents/README.md:9`.
**Where**: as listed
**Touches**: `docs/agents/README.md`, `docs/arch/front.md`, `docs/agents/issue-tracker.md.jinja`,
`docs/agents/harness.md`
**Depends on**: T3
**Exclusive**: no
**Reuses**: —
**Requirement**: AUD-05

**Measured findings this task closes**:

| Finding | Verdict | Action |
| ------- | ------- | ------ |
| `issue-tracker.md.jinja:51` `.github/workflows/feedback-triage.yml` | REAL — tracked nowhere; removed by `0dd2348` | Delete or rewrite the sentence. **Second confirmed instance of the defect class.** |
| `front.md:184` `packages/ui` | REAL — origin-product residue; UI ships as a catalog entry per AD-013 | Remove the reference |
| `agents/README.md:9` `catalog/` | AMBIGUOUS — means `docs/catalog/`, sits in a list of `docs/` subdirectories | Write it `docs/catalog/` so the grammar cannot misread it |
| `harness.md:196,202` `.claude/skills/` | NOISE — recreated by `pnpm skills:sync` | Leave as written; T9's child-created list covers it |
| `front.md:3,6` `apps/web` | NOISE — `:6` already says "both render to `apps/web`" | Leave as written; T8's rename modelling covers it |

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Every REAL row above is repaired; every NOISE row is left byte-identical
- [ ] No new path token is introduced that the shipped set lacks
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit (asserted by T9 in wave 3) · **Gate**: full

**Commit**: `docs: repair dead references in the agent and arch docs`

---

### T5: Split `docs/advisories/README.md` by audience

**What**: the child half explains what an advisory is and how to apply one; the template half (the
`commit-msg` hook, `scripts/platform/advisory-required.mjs`, authoring an advisory) moves to
`docs/platform/advisory-authoring.md`.
**Where**: `docs/advisories/README.md`, `docs/platform/advisory-authoring.md`
**Touches**: `docs/advisories/README.md`, `docs/platform/advisory-authoring.md`
**Depends on**: None
**Exclusive**: no
**Reuses**: the split shape from `context.md` § 2
**Requirement**: AUD-01, AUD-05

**Measured findings this task closes** (2 REAL): `:31` `catalog/`, `:44`
`scripts/platform/advisory-required.mjs`.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `docs/advisories/APPLIED.md` and the `.claude/hooks/pending-advisories.mjs` reference still
      resolve — neither is moved
- [ ] The shipped half names no absent path except under an inline waiver (§ *Inline waiver —
      pinned grammar*)
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit · **Gate**: full

**Commit**: `docs(platform): split the advisory doc by audience`

---

### T6: Repair the advisory entries and the local-environment doc

**What**: close the REAL findings in the seven `ADV-*` files and `docs/dev/local-environment.md`.
**Where**: as listed
**Touches**: `docs/advisories/ADV-20260821-01.md`, `docs/advisories/ADV-20260822-01.md`,
`docs/advisories/ADV-20260822-02.md`, `docs/advisories/ADV-20260822-03.md`,
`docs/advisories/ADV-20260822-04.md`, `docs/advisories/ADV-20260822-05.md`,
`docs/advisories/ADV-20260823-02.md`, `docs/dev/local-environment.md`
**Depends on**: T5
**Exclusive**: no
**Reuses**: the five `ADV-20260822-*` findings are the same "affects" paragraph shape — one decision
applies to all five
**Requirement**: AUD-05

**Measured findings** (10 REAL, 1 NOISE): the bare `catalog/` in `ADV-20260822-0{1..5}` and
`local-environment.md:17`; `ADV-20260821-01.md:45`
`apps/api/drizzle/migrations/0005_attachment_generic_upload_profiles.sql` (the file's own text says it
was removed in `e30648f`) and `:59`
`scripts/platform/__tests__/catalog-custom-migrations.test.mjs`; `ADV-20260823-02.md:16`
`scripts/platform/__tests__/fixtures/child/.copier-answers.yml`. `local-environment.md:14`
`apps/api/.env` is NOISE — a `cp` instruction — and stays byte-identical.

**An advisory names where a fix landed in the template, which is information the child wants.** Do not
delete those paths: waive them inline with the reason, or phrase them as the template-side origin of a
fix the child applies to its own vendored copy. **Out of scope, do not touch**: the pt-BR of these
files (`LOC-*` in `audit-2026-08-23-remediation` owns language) and any `BRAND-*` vocabulary.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Each REAL finding is repaired or carries an inline waiver stating why the path is named
      (§ *Inline waiver — pinned grammar*)
- [ ] `local-environment.md:14` is unchanged
- [ ] No advisory's `Advisory:` frontmatter or ID changes — the `commit-msg` hook and
      `pending-advisories.mjs` key on them
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit (asserted by T9 in wave 3) · **Gate**: full

**Commit**: `docs: repair dead references in the advisories and local-environment doc`

---

### T7: Anchor `docs/platform/` in `copier.yml` `_exclude`

**What**: add the `/docs/platform` anchor with the same comment shape as `/catalog` and
`/docs/platform_template`; remove the per-file `docs/catalog/README-contract.md` entry.
**Where**: `copier.yml`
**Touches**: `copier.yml`
**Depends on**: T1, T2, T3, T4, T5, T6
**Exclusive**: **yes** — root config, and `audit-2026-08-23-remediation` also edits this file
**Reuses**: `copier.yml:26-34` — the existing anchor comments explain why the leading slash is
mandatory and the trailing one is forbidden
**Requirement**: AUD-01, AUD-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `_exclude` carries `/docs/platform`, anchored, no trailing slash, with a comment saying why
- [ ] `_exclude` carries no entry naming an individual file under `docs/` (AUD-02) — the
      `docs/catalog/README-contract.md` line is gone
- [ ] `/docs/platform_template` is left in place — folding it in is out of scope while two in-flight
      features cite it by path
- [ ] `pnpm test:scripts` passes, `copier-delivery.test.mjs` included
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit (AUD-01/02 asserted by T11) · **Gate**: full

**Commit**: `feat(template): exclude docs/platform from the shipped set`

---

### T8: Shipped-set module

**What**: `shippedSet()` — `git ls-files` minus every `copier.yml` `_exclude` match, with rendered
names resolved; plus `excludedWorkflowStems()`.
**Where**: `scripts/platform/__tests__/lib/audience-contract.mjs`
**Touches**: `scripts/platform/__tests__/lib/audience-contract.mjs`,
`scripts/platform/__tests__/shipped-set.test.mjs`
**Depends on**: T7
**Exclusive**: no
**Reuses**: `copier-questions.test.mjs:9-13,19-20` (root resolution, `yaml` parse),
`copier-answers-leak.test.mjs:20` (`git ls-files -z`)
**Requirement**: AUD-03, AUD-08

**Two things this module must get right, both measured:**

- **`_exclude` matching is gitwildmatch, not `String.includes`.** A leading `/` anchors; an inner `/`
  anchors; a bare name matches a basename at any depth; matching an ancestor excludes the subtree.
  Getting this wrong silently *shrinks* the shipped set and makes every downstream assertion vacuous —
  `/catalog` must exclude `catalog/**` and must **not** touch `docs/catalog/**`.
- **Rendered names.** Strip a trailing `.jinja`, **and** resolve the Jinja-conditional root
  directories. Do not write this as a hard-coded `web-vite|web-next -> web` rename: that is not the
  mechanism, and a comment claiming it would be wrong. The tracked entries are
  `{% if web_stack == 'next' %}apps{% endif %}/web` and its `vite` twin, each a symlink into
  `apps/web-next` / `apps/web-vite`. The faithful static model is: a tracked path segment holding a
  Jinja conditional contributes `apps/web/**` to the shipped set for the stack that satisfies it,
  sourced from the symlink target. Modelling it as "`apps/web/**` is present when the corresponding
  `apps/web-vite/**` **or** `apps/web-next/**` file exists" is acceptable and is stack-agnostic, which
  the guard must be — it runs in the template, where no `web_stack` answer exists.
  `copier.yml:85-86` is **not** part of this: it only patches the `name` field of an
  already-rendered `apps/web/package.json`.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `shippedSet()` is recomputed from `copier.yml` on every call, never from a list in the test
      (AUD-08); a test adds a synthetic `_exclude` entry to a fixture and proves the set changes
- [ ] Matcher tests cover: anchored vs unanchored, subtree exclusion, `/catalog` not matching
      `docs/catalog/`, `*.py[co]`-style character classes, and a bare name at depth
- [ ] `.jinja` and the Jinja-conditional root directories both resolve; `docs/agents/infra.md` and
      `apps/web/Dockerfile` are both members. Proof for the second: `assertWebShell`
      (`scripts/platform/lib/web-shell.mjs:70-106`) already asserts a rendered child has
      `apps/web/` with the right config file and `package.json.name === "web"` — the guard's static
      model must agree with what that assertion sees
- [ ] A guard test fails loudly if the shipped set is empty or smaller than a sane floor — a vacuous
      set must never read as a clean result
- [ ] Test count recorded; no existing test deleted
- [ ] Gate passes: `node --test scripts/platform/__tests__/shipped-set.test.mjs`

**Tests**: unit · **Gate**: quick

**Commit**: `test(platform): derive the shipped set from copier.yml`

---

### T9: Path-token grammar and the shipped-docs guard

**What**: extract path tokens from every shipped doc, resolve them, fail on any absent from the
shipped set, reporting `file:line` and the token.
**Where**: `scripts/platform/__tests__/lib/audience-contract.mjs`,
`scripts/platform/__tests__/docs-shipped-paths.test.mjs`
**Touches**: `scripts/platform/__tests__/lib/audience-contract.mjs`,
`scripts/platform/__tests__/docs-shipped-paths.test.mjs`,
`scripts/platform/__tests__/fixtures/audience-contract/**`
**Depends on**: T8
**Exclusive**: no
**Reuses**: T8's `shippedSet()`
**Requirement**: AUD-05, AUD-07

**Grammar, as measured rather than as first specified:**

- A token is a relative markdown link target (non-anchor, non-URL) **resolved against the doc's own
  directory**, or an inline-code span containing `/` **resolved against the repo root**. That
  distinction is not decorative: resolving code spans doc-relative was the single change that took the
  prototype from 400 findings to 93.
- An inline-code span whose first segment is not a tracked top-level entry is ignored — it is
  `app/`, `entities/`, `shared/config/routes.ts` or `React/Next.js`, not a repo path.
- Ignore: URLs, and any token carrying `<`, `>`, `{{`, `*`, `{` or `…`, or starting with `/`, `~`, `$`
  or `@`, or containing a space.
- Strip a trailing `:NN` or `:NN-MM` — `docs/agents/workflow.md:109` cites
  `apps/api/vitest.config.mts:20`.
- A directory token exists when any shipped file sits under it.
- **Child-created allowance** (situation 2): `.specs/`, `.claude/skills/`, `generated/`,
  `.worktrees/`, `apps/api/.env`. One comment per entry naming what creates it. This list is the
  guard's blast radius — a wrong entry blinds it, so each needs a reason, not a shrug.
- **Inline waiver** (situation 3): the grammar is **pinned** in § *Inline waiver — pinned grammar* —
  a trailing `<!-- audience-contract: <token> — <reason> -->` on the token's own line, one token per
  comment, reason mandatory. Do not re-pick the spelling here: wave 1 already wrote waivers in it.
  Parse it, and assert that a comment on its own line does **not** waive the line below it.
- `docs/dev/template-changelog.md` is exempt as a historical record — it names paths that were correct
  at `v1.x` and exist nowhere now (39 of the 93). Assert the exemption is that one file, so it cannot
  quietly widen.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Spec § Edge Cases each have a test: `.jinja` rendered name present; directory token present when
      a shipped file sits under it; placeholder ignored; a doc under `docs/platform/` is not checked
- [ ] The spec's Independent Test passes: a **fixture** doc naming `.github/workflows/release.yml`
      fails, and removing it passes — the failure case never runs against the live tree
- [ ] The failure message names `file:line` and the token (AUD-07), asserted literally
- [ ] The guard is green against the live tree after waves 1-2
- [ ] The child-created list and the changelog exemption are each asserted, so neither widens silently
- [ ] The fenced-code-block hole is recorded as a comment citing `docs/test/testing.md:40-44`
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit · **Gate**: full

**Commit**: `test(platform): fail when a shipped doc names a path the child lacks`

---

### T10: Excluded-workflow rule

**What**: fail on an inline-code token naming a `.github/workflows/*.yml` that `_exclude` removes.
**Where**: `scripts/platform/__tests__/docs-workflow-names.test.mjs`
**Touches**: `scripts/platform/__tests__/lib/audience-contract.mjs`,
`scripts/platform/__tests__/docs-workflow-names.test.mjs`,
`scripts/platform/__tests__/fixtures/audience-contract/**`
**Depends on**: T9
**Exclusive**: no
**Reuses**: T8's `excludedWorkflowStems()`
**Requirement**: AUD-06

**The rule is wider than the spec's wording, for a measured reason.** AUD-06 says "exactly equal to
the file stem". Today's marquee token is `` `release.yml` `` (`docs/agents/workflow.md:144`) — not the
stem, and not a path token either, since the span holds no `/`. Matching `<stem>`, `<stem>.yml` and
`<stem>.yaml` is the same intent with the spelling the file actually uses. Exact equality against
those three forms still keeps `pnpm catalog:lint` and `` `catalog/` `` out of it.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Stems are derived from `_exclude` at run time, never hard-coded — measured today as `release`
      and `format`, **not** the `release`/`catalog` the spec's parenthetical names
- [ ] Fixtures prove all three spellings fail and that `pnpm catalog:lint` and `` `catalog/` `` do not
- [ ] A test pins that `` `format` `` — a plausible token for a real job — is handled deliberately;
      `docs/dev/template-changelog.md:157` already contains one, and it is exempt, but the collision
      is documented rather than discovered later
- [ ] The message names `file:line` and the token
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit · **Gate**: full

**Commit**: `test(platform): fail when a shipped doc names an excluded workflow`

---

### T11: Delivery-contract assertions

**What**: the AUD-01..04 and AUD-09..11 set assertions over `copier.yml` and the shipped set.
**Where**: `scripts/platform/__tests__/docs-audience-contract.test.mjs`
**Touches**: `scripts/platform/__tests__/docs-audience-contract.test.mjs`
**Depends on**: T10
**Exclusive**: no
**Reuses**: T8's `shippedSet()`
**Requirement**: AUD-01, AUD-02, AUD-03, AUD-04, AUD-09, AUD-10, AUD-11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] AUD-01: `_exclude` carries `/docs/platform`, and `docs/platform/` is non-empty — an empty or
      absent directory **fails loudly**, never passes on a vacuous set
- [ ] AUD-02: no `_exclude` entry names an individual file under `docs/`
- [ ] AUD-03: the shipped set contains no file under `docs/platform/` and every other tracked file
      under `docs/`
- [ ] AUD-04: no tracked file outside `.specs/` references a moved doc's old path
- [ ] AUD-09/AUD-10: literal assertions that the four named strings are **absent** from the shipped
      workflow doc and **present** under `docs/platform/` (L-027)
- [ ] AUD-11: every row of `docs/agents/README.md`'s file table resolves inside the shipped set,
      derived from the table, not a copy of it
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit · **Gate**: full

**Commit**: `test(platform): assert the docs delivery contract`

---

### T12: Changelog entry

**What**: open a new `## v2.5.0` section above `v2.4.1` and add the item to it.
**Where**: `docs/dev/template-changelog.md`
**Touches**: `docs/dev/template-changelog.md`
**Depends on**: T11
**Exclusive**: no
**Reuses**: `docs/dev/template-changelog.md:7-36` — the section's existing item shape
**Requirement**: spec § Assumptions (Changelog)

**The 2026-08-25 ruling is VOID — superseded 2026-08-25 during wave 1.** That ruling said "append
to `v2.4.1`, not a new section" because `v2.4.1` was then the only untagged section and opening one
above it would strand it. While wave 1 ran, a parallel session pushed `3bef437 chore(release):
v2.4.1` to `origin/main` and the tag `v2.4.1` now exists. Every changelog section is tagged, so the
reason to append is gone and appending to a *released* section would misreport what shipped in it.

**Decision taken by the orchestrator, owner asleep, under a standing instruction to finish all waves
without stopping: the new section is `v2.5.0`.** The reasoning, so it can be reverted in one edit if
the owner disagrees: T7 lands as `feat(template):`, which is a minor under conventional commits; the
spec's Assumptions row rules the child impact non-major with no manual migration step (a doc leaving
the shipped set is deleted by `copier update`), and AD-034 forbids a manual step on a non-major. A
patch (`v2.4.2`) would understate a change to what the template delivers. **If the owner prefers
`v2.4.2`, only the section heading changes — no other task is affected.**

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A new `## v2.5.0` section sits directly above `## v2.4.1`, matching the shape of the sections
      already in the file (same subsection headings, same item style)
- [ ] One item under its `### Changes`, naming `docs/platform/` and the guard
- [ ] `### Child migration steps` stays `None` — a doc leaving the shipped set is deleted by
      `copier update` with no manual step, and AD-034 forbids a manual step on a non-major
- [ ] No other version section is touched — `v2.4.1` and below are released history now
- [ ] No advisory is filed: nothing under `catalog/**` changes, so the `commit-msg` hook does not apply
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: none (matrix: prose asserted by T9/T11) · **Gate**: full

**Commit**: `docs(template): record the docs audience contract in v2.4.1`

---

## Wave Execution Map

```
Wave 1:  [C1: T1 → T2]  ∥  [C2: T3 → T4]  ∥  [C3: T5 → T6]
Wave 2:  [C4: T7]  (exclusive)
Wave 3:  [C5: T8 → T9 → T10 → T11 → T12]
```

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Move README contract | 1 move + 3 reference sites | ✅ Granular |
| T2: Split catalog.md | 1 file split into 2 | ✅ Granular |
| T3: Split workflow.md | 1 file split into 2 + 4 dependents | ✅ Granular (dependents are one-line path edits that cannot be separated) |
| T4: Repair agents/arch refs | 3 one-line edits, one area | ✅ Granular |
| T5: Split advisories/README.md | 1 file split into 2 | ✅ Granular |
| T6: Repair advisory entries | 8 files, one repeated finding shape | ⚠️ OK — the five `ADV-20260822-*` are the same paragraph; one decision applies to all |
| T7: copier.yml anchor | 1 file, 2 lines | ✅ Granular |
| T8: Shipped-set module | 1 module + its test | ✅ Granular |
| T9: Path grammar guard | 1 grammar + its test | ✅ Granular |
| T10: Workflow-name rule | 1 rule + its test | ✅ Granular |
| T11: Contract assertions | 1 test file | ✅ Granular |
| T12: Changelog | 1 section item | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | wave 1, first in C1 | ✅ Match |
| T2 | T1 | after T1 in C1 | ✅ Match |
| T3 | None | wave 1, first in C2 | ✅ Match |
| T4 | T3 | after T3 in C2 | ✅ Match |
| T5 | None | wave 1, first in C3 | ✅ Match |
| T6 | T5 | after T5 in C3 | ✅ Match |
| T7 | T1..T6 | wave 2, after wave 1 | ✅ Match |
| T8 | T7 | wave 3, after wave 2 | ✅ Match |
| T9 | T8 | after T8 in C5 | ✅ Match |
| T10 | T9 | after T9 in C5 | ✅ Match |
| T11 | T10 | after T10 in C5 | ✅ Match |
| T12 | T11 | after T11 in C5 | ✅ Match |

No task depends on a later wave or on a sibling cluster of its own wave.

---

## Wave/Cluster Cross-Check

| Wave | Cluster | Tasks (order) | Files (union of Touches) | Deps outside earlier waves / own cluster? | Files shared with a sibling cluster? | Exclusive alone? | Status |
| ---- | ------- | ------------- | ------------------------ | --- | --- | --- | ------ |
| 1 | C1 | T1 → T2 | `docs/catalog/README-contract.md`, `docs/platform/README-contract.md`, `docs/catalog/catalog.md`, `docs/platform/catalog-authoring.md`, `catalog/README.md`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/__tests__/lint.test.mjs` | none | none | n/a | ✅ |
| 1 | C2 | T3 → T4 | `docs/agents/workflow.md`, `docs/platform/workflow.md`, `docs/agents/README.md`, `docs/agents/harness.md`, `docs/agents/issue-tracker.md.jinja`, `docs/arch/front.md`, `AGENTS.md.jinja`, `scripts/platform/__tests__/docs-no-owner-infra.test.mjs`, `scripts/platform/__tests__/docs-stay-lean.test.mjs`, `scripts/platform/__tests__/workflow-doc-pipeline-parity.test.mjs`, `.claude/hooks/specs-in-english.mjs` | none | none | n/a | ✅ |
| 1 | C3 | T5 → T6 | `docs/advisories/README.md`, `docs/platform/advisory-authoring.md`, `docs/advisories/ADV-20260821-01.md`, `docs/advisories/ADV-20260822-01.md`, `docs/advisories/ADV-20260822-02.md`, `docs/advisories/ADV-20260822-03.md`, `docs/advisories/ADV-20260822-04.md`, `docs/advisories/ADV-20260822-05.md`, `docs/advisories/ADV-20260823-02.md`, `docs/dev/local-environment.md` | none | none | n/a | ✅ |
| 2 | C4 | T7 | `copier.yml` | T1..T6 all in wave 1 | none | yes — only task in wave 2 | ✅ |
| 3 | C5 | T8 → T9 → T10 → T11 → T12 | `scripts/platform/__tests__/lib/audience-contract.mjs`, `scripts/platform/__tests__/shipped-set.test.mjs`, `scripts/platform/__tests__/docs-shipped-paths.test.mjs`, `scripts/platform/__tests__/docs-workflow-names.test.mjs`, `scripts/platform/__tests__/docs-audience-contract.test.mjs`, `scripts/platform/__tests__/fixtures/audience-contract/**`, `docs/dev/template-changelog.md` | T7 in wave 2 | none | n/a | ✅ |

Sibling unions in wave 1 are pairwise disjoint: C1 owns `docs/catalog/**` plus the catalog tooling,
C2 owns `docs/agents/**` plus `docs/arch/front.md`, C3 owns `docs/advisories/**` plus
`docs/dev/local-environment.md`. All three write into `docs/platform/`, but each to its **own new
files** — no shared path. No wave exists only because of the 4-in-flight cap. No task reads or
persists data, so the layer-completeness rule does not apply.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | -------------------------- | --------------- | --------- | ------ |
| T1 | Shipped doc prose | unit (grep-style) | unit — `lint.test.mjs` assertion moves with the path | ✅ OK |
| T2 | Shipped doc prose | unit | unit — asserted by T9/T11 | ✅ OK |
| T3 | Shipped doc prose | unit | unit — literal string assertions added in T11 (L-027) | ✅ OK |
| T4 | Shipped doc prose | unit | unit — asserted by T9 | ✅ OK |
| T5 | Shipped doc prose | unit | unit — asserted by T9 | ✅ OK |
| T6 | Shipped doc prose | unit | unit — asserted by T9 | ✅ OK |
| T7 | `copier.yml` `_exclude` | unit | unit — asserted by T11 | ✅ OK |
| T8 | Guard module | unit | unit, co-located | ✅ OK |
| T9 | Guard module | unit | unit, co-located | ✅ OK |
| T10 | Guard module | unit | unit, co-located | ✅ OK |
| T11 | `copier.yml` contract | unit | unit, co-located | ✅ OK |
| T12 | Shipped doc prose (exempt file) | none | none | ✅ OK |

**On T1-T7 saying "asserted by T9/T11":** this is the one case the matrix's "tested in another task
is not a valid justification" rule does not cover, and the reason is structural. The guard is a single
assertion over the **whole** shipped corpus; it cannot be written per repaired file without writing it
twelve times. Writing it in wave 1 would land it red, because the corpus is not repaired until wave 1
finishes — the exact broken-gate-between-waves failure. Waves 1-2 repair, wave 3 asserts, and the
Verifier's Final gate proves the pair against a rendered child. Every repair task still carries its
own `Done when` and its own scoped gate; none produces unverified code, and the Verifier will not find
a task whose outcome nothing checks.

---

## Open item for the orchestrator

**T7 shares `copier.yml` with `audit-2026-08-23-remediation` (T41).** That feature's session is the
declared single owner of the file, and the reconciliation entry in `STATE.md` records a prior conflict
there resolved by hand. Confirm ownership is free before dispatching wave 2, or the exclusive wave
races a sibling session rather than a sibling cluster.
