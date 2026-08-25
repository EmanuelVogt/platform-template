# Audit 2026-08-23 Remediation Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute
flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source
of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier,
discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/audit-2026-08-23-remediation/design.md`
**Spec**: `.specs/features/audit-2026-08-23-remediation/spec.md`
**Evidence ledger**: `.specs/features/audit-2026-08-23-remediation/research.md` — cite `file:line`
from it; do not re-run the sweep.
**Status**: Draft
**Base**: `v2.2.1` (`git tag -l` → `v0.1.0 … v2.2.0 v2.2.1`; `v2.3.0` authored but **untagged**)

---

## 0. Resolutions carried into Tasks

The design left four things for this phase. All four are settled here; nothing below is a guess.

### 0.1 The nine ACs of "nothing names the owner" are pinned (design.md § *Risks*, § *Execute notes*)

`spec.md`'s § Requirement Traceability table is **authoritative**. `research.md`'s narrative labels
are shifted up by one across BRAND-05/06/07 and never emit a `(BRAND-04)` label at all. Two
independent passes over the audit annex (`docs/platform_template/audit-2026-08-23.json`) agree, and
they agree by *content*, not by number.

| Story AC | Requirement | Audit finding | Anchor evidence |
| --- | --- | --- | --- |
| 1 · brand-free cookie/storage/contract defaults | BRAND-01 | F-agnostic-leaks-3 **C**, F-extensibility-any-product-4 | `apps/api/src/openapi/openapi-config.ts:48,53` |
| 2 · CSRF cookie name read from `configureClient` | BRAND-02 | F-extensibility-any-product-4 | `packages/api-client/src/client.ts:109-114` |
| 3 · validated `APP_TIMEZONE` | TZ-01 | F-api-kernel-5 **C** | `apps/api/src/shared/kernel/clock/bucket-sql.ts:11,25` |
| 4 · issue area-labels from a product placeholder | BRAND-03 | F-agents-skills-1 **C**, F-agnostic-leaks-8 **C**, F-docs-consistency-8, F-known-debt-1 | `docs/agents/issue-tracker.md.jinja:29-31` |
| 5 · harness P0 taxonomy is generic | **BRAND-04** | F-agents-skills-4 | `.claude/hooks/subagent-model-required.mjs:42` |
| 6 · `infra.md` / `deploy.md` hold platform facts only | **BRAND-05** | F-agnostic-leaks-1 **C** | `docs/agents/infra.md.jinja` (221 lines) |
| 7 · no legacy-MySQL backfill | **BRAND-06** | F-docs-consistency-2 **C** | `docs/dev/local-environment.md:59-64` |
| 8 · module-boundary guard scan coverage | BRAND-07 | F-tests-quality-gates-4 | `apps/api/src/modules/module-boundaries.spec.ts:539-545` |
| 9 · no workflow wired to a nonexistent module | BRAND-08 | F-ci-docker-infra-5 | `.github/workflows/feedback-triage.yml:37,64,161` |

**Consequence for the exclusive-task list.** `design.md` § *Execute notes* item 4 calls the
harness-taxonomy edit "BRAND-05's". Under the pinning above that task is **BRAND-04** (T43,
exclusive, wave 5). **BRAND-05** is the `infra.md.jinja` / `deploy.md.jinja` rewrite — ordinary,
clusterable (T12, T13). Both labels are carried in the task bodies so this is not re-derived wrongly.

### 0.2 RUN-04 and `.prettierrc` are not built here

`design.md` § *Execute notes* item 5 lists `.prettierrc` + the root devDependency removal as an
exclusive task of this feature. § *Components* area A and § *Tech Decisions* both say the opposite:
RUN-04 is **delegated** to `.specs/features/prettier-format-gate/`, whose four Assumption rows are
owner-confirmed and whose seam wins (`spec.md:70`, `context.md:109-119`). The traceability table
already records RUN-04 as `Phase: Verifier`.

**Therefore: no `.prettierrc` task exists in this plan.** The exclusivity fact is recorded in
§ 4 *Exclusive inventory* as *inherited, owned by the sibling*, so a later editor does not cluster a
`.prettierrc` change beside something else. The Verifier records RUN-04 **satisfied-by-sibling**
with that feature's commit as evidence, and asserts only that `pnpm format:check` is green at this
feature's HEAD.

Same resolution for a second inherited contradiction: `design.md` § *Integration Points* says
`ci.yml` gains `contract:check` **and `format:check`**. The owner-confirmed sibling seam puts the
format gate in a **template-only** `.github/workflows/format.yml` and adds **nothing** to `ci.yml`,
because `ci.yml` ships to the child and a red format job there is a manual migration step AD-034
forbids on a non-major. **`contract:check` goes into `ci.yml` (T36); `format:check` does not.**

### 0.3 Corrections to citations the design inherited (verified on disk at HEAD `38d4063`)

| Design/ledger says | On disk | Effect |
| --- | --- | --- |
| `runLint` is in `scripts/platform/lib/lint.mjs` | `runLint` is at `scripts/platform/catalog-lint.mjs:111`; `lib/lint.mjs` only exports the `lint*` helpers | Fork C's `lintEntryBump` is **exported** from `lib/lint.mjs` and **aggregated** in `catalog-lint.mjs` — two files, both in T33's `Touches` |
| `entryChangedWithoutBump` at `release-preflight.mjs:43-52` | `:47-56` (comment block inserted above) | T33 quotes the current range |
| 9 copies of the broken path guard | **8** — `scripts/platform/template-update-ci.mjs` was deleted by `eb907ef`, an ancestor of HEAD | T2 fixes 8 sites and asserts the count |
| `catalog/tag/` is 43 files | **48** | T58 builds the skeleton from the real list |
| LOC-05 slugs live in `route-access.ts` | that file does not exist; slugs are at `apps/web/src/shared/config/routes.ts:10-11` | T27/T40 target the real file |
| `apps/web/public/` ships a favicon | the directory **does not exist**; `apps/web/nginx.conf:53` returns `index.html` for `/favicon.ico` | T24 creates it |
| `apps/web/src/app/router/guards.ts` (identity README recipe) | does not exist | T25 fixes the recipe, not the file |
| `storage-unavailable.error.ts` must be created | it **already exists** at `apps/api/src/shared/infra/storage/` | T54 implements the adapter only |
| `.claude/skills/tlc-spec-driven/**` | **symlink** → `.agents/skills/tlc-spec-driven` | every task lists only the `.agents/...` path; listing both would own one file twice |
| all five `ADV-20260822-0*` `affects` | `>=1.0.0 <2.0.0` — the range that excludes the vulnerable `2.0.0` population | T42 corrects all five |

### 0.4 Cross-feature file collisions (not visible to `wave-plan-check.mjs`)

`prettier-format-gate` is `Status: Draft`, blocked on the same `v2.3.0` tag, and executes **first**
once unblocked. Its `Touches` and this plan's overlap on six files. These are **not** intra-feature
races — no hook catches them — so whichever feature lands second rebases:

`copier.yml` · `docs/dev/template-changelog.md` · `scripts/template-smoke.mjs` ·
`docs/agents/harness.md` · `package.json` · `lefthook-local.yml`

Files this plan must **never** touch (sibling-owned): `.prettierrc`, `.prettierignore`,
`.vscode/settings.json`, `.github/workflows/format.yml`,
`scripts/platform/__tests__/prettier-config.test.mjs`,
`catalog/notification/api/infrastructure/mailer/email-theme.ts`.

### 0.5 Wave-3 plan corrections (verified on disk at HEAD `616fd71`, before dispatch)

`.github/workflows/catalog.yml` **no longer exists**: commit `6b99461` deleted it and merged its jobs
into `.github/workflows/ci.yml` behind a `detect` job. Three consequences, settled here:

| Plan said | On disk | Effect |
| --- | --- | --- |
| T35 edits `.github/workflows/catalog.yml:14-31` to add `fetch-depth: 0` on `gates` | the `gates` job is `ci.yml:94`, and its `actions/checkout` **already sets `fetch-depth: 0`** (`ci.yml:100-102`) | **T35 is satisfied by a prior commit.** It becomes verify-only: confirm the two Done-when bullets against `ci.yml`, emit **no edit and no commit**, report the evidence. `Where`/`Touches` retargeted to `ci.yml` |
| T34 corrects `ADV-20260822-02:6` but its `Touches` omits that file | the Done-when needs `docs/advisories/ADV-20260822-02.md` | added to T34's `Touches` (and to C7's union). T42 (wave 4, exclusive) touches the same file — different wave, so no sibling race, and T42 still owns the `affects` field |
| T36 wires `contract:check` into `ci.yml` | the `gates` job is **template-only** (`ci.yml:98`, `if: needs.detect.outputs.template == 'true'`) | a step added to `gates` would never run in a child, contradicting T36's own AC ("survives `module add`", "must ship to the child"). T36 picks a job **without** that condition — `quality` (`:47`) or `test-unit` (`:63`) |

Two further citation drifts, verified: `copier.yml`'s `pnpm install` / `skills:sync` tasks are at
`:82-85` (not `:74,78,80`), each gated only on `not pretend`; `feedback-triage.yml`'s first API URL is
at `:37` (not `:41`). T41 works from the disk, not from those numbers.

`contract:check` is **not** added to `copier.yml`'s manifest-prune list (`:75-77`) — that list is an
allowlist of *deletions*, so leaving the key out of it is exactly what ships it to the child. C7
therefore never touches `copier.yml`; C9 owns it.

### 0.6 The AD-019 blocker on T39/T40 — adjudicated mid-wave (2026-08-24)

C8 stopped at T39 with its work code-complete, green and staged: the `commit-msg` hook refused
the commit with `advisory obrigatório ausente para: attachment, audit, identity/single-tenant,
notification, tag`. The handoff framed two remedies — pull T42 forward, or add an advisory task.
**Both are wrong, and the hook's source says why.**

**The hook, read at `scripts/platform/advisory-required.mjs`:**

| Line | Fact |
| --- | --- |
| `:11-12` | `CODE_PATH_RE` = `^catalog\/((?:[^/]+\/)??[^/]+)\/(api\|web\|migrations\|parity)\/`. Only code under those four dirs trips it — `catalog/*/module.json` and `CHANGELOG.md` do **not** |
| `:25-42` | Every touched entry must appear in `coveredModules`, built from the `module` frontmatter of the advisories **staged in this same commit** |
| `:61-89` | Staged advisories are read with `git show :<file>` — the **index**. An advisory sitting on disk, or landed in an earlier commit, is invisible to the check |
| `:14` | The only opt-out is the trailer `/^Advisory: none — .+$/m` |
| `docs/advisories/README.md:43-45` | Documents the rule as watching `catalog/**` paths; `module: kernel` advisories are never demanded by it |

**Why pulling T42 forward cannot work.** T42 stages `module.json`, `CHANGELOG.md` and four
`ADV-20260822-0*` files — no `catalog/**/api/**` path, so T42's own commit never trips the hook,
and because the check reads the **index of the commit being made** (`:61-89`), a T42 commit that
landed *earlier* covers nothing for T39. There is no ordering of the current plan that unblocks
T39, which is what C8 reported. Pulling T42 forward buys exactly nothing.

**Why a new advisory would be a false advisory.** `kind` is closed to `bug | security | breaking`
(`docs/advisories/README.md:14`). T39 is a refactor whose own AC is *"every shipped string is
byte-identical at the `pt-BR` default"*; T40's is *"no behaviour change — the contract's shape is
untouched"*. There is no defect, so there is nothing for `detect` to probe, nothing for `fix` to
link and no `parity` spec to name — three required fields with no honest value. Worse, the file
would be **immutable in the child** (`README.md:1-6`) and would fire in every child's session
start through `.claude/hooks/pending-advisories.mjs`, demanding a fix that does not exist. An
advisory channel that cries wolf stops being read.

**Ruling: T39 and T40 commit with the hook's own documented opt-out**, `Advisory: none — <reason>`,
the reason stating that strings are byte-identical at the `pt-BR` default. This is not a bypass —
a bypass is `--no-verify`, and that stays forbidden. It is the branch the hook implements at `:14`
and the repo already uses for exactly this class of change:

- `06f35fb style(catalog): format the entries with the repaired prettier config` → `Advisory: none — mechanical formatting, no behaviour change`
- `abd2caf docs(notification): stop citing a stylesheet that does not exist` → `Advisory: none — comment only, no behaviour change`
- `c9803f8 chore(catalog): bump the five entries the format pass rewrote` → same trailer

**T42 is unchanged and still owns the ledger.** It keeps its wave-4 exclusive slot, and delivery of
T39/T40 to children rides its five version bumps and CHANGELOG entries — the catalog's normal
channel. The advisory channel stays reserved for defects, which is the only thing that makes it
worth a child's attention.

### 0.7 T40s real sites, verified on disk at HEAD `dfd9076` (the plans citations are wrong)

T40 inherited four bad coordinates. A worker copying them verbatim would have edited nothing and
reported "not mine" — the silent failure wave 2 earned its dispatch rules on. Corrected here.

| Plan said | On disk | Effect |
| --- | --- | --- |
| `Touches` names `.../use-cases/update-user.use-case.ts` | the file is `.../use-cases/**update-user/**update-user.use-case.ts` (nested dir) | **path corrected in T40 and in C8s union above** — the old path matches nothing |
| `user.repository.ts:138,142` hold "motor de agendamento" twice | `:138` and `:142` carry no such text; the two real hits are **`:161` and `:168`** | Done-when bullet 1 retargeted |
| `Where`: `identity.contract.ts:44,142,179,196` | `:44` and `:142` are right (both comments); **`:179` is `name,`**, no hit; `:196` is the `updateUserSchema` opener — the real hits near it are **`:205`/`:206`** | `Where` is indicative only; work from this table |

**The finding that actually scopes T40: only ONE vocabulary-bearing identifier exists, and it is
contract-shaped.** `schedulingAreaIds` appears in three exported Zod schemas in
`identity.contract.ts` — `userListItemSchema:143`, `createUserSchema:189`, `updateUserSchema:206` —
each flowing into `openapi.json`. Load-bearing alongside it: the port method
`user.repository.ts:116` `replaceSchedulingAreas(`, and `ResolvedUserAccess.schedulingAreaIds`
(`access-policy.ts:50,89`). T40s own AC is *"no behaviour change — the contracts shape is
untouched"*, so **none of these may be renamed**. That is not a limitation to work around: T70
(IDENT-01, `v3.0.0`) deletes these fields outright, and the release boundary separating them is by
construction, as T40s own note says.

**T40 is therefore comment/JSDoc rewording ONLY**, at exactly these sites:
`identity.contract.ts:44,142,188,205` · `user.repository.ts:18,115,150,154,161,168` ·
`update-user/update-user.use-case.ts:119,123,124,125` · `access-policy.ts:99,134`.
Zero runtime effect, zero contract effect, zero deletions. Any diff touching an identifier is out
of scope — **stop and report instead**.

Verified with the same sweep: none of the four files imports another catalog entry (RULE C holds);
every import resolves to `shared/kernel/**` or within `catalog/identity/single-tenant/`.

### 0.8 Every per-task gate aimed at `catalog/**` named a project that matches zero files (found mid-wave-3, 2026-08-24)

T39a's worker ran its Done-when gate literally and it collected **0 test files**. The cause is not a
typo in one task — it is the same wrong form in every catalog-facing gate line in this plan.

| Plan said | On disk | Effect |
| --- | --- | --- |
| `pnpm vitest run --project api <catalog path>` | project `api`'s `include` is `src/**/*.spec.ts`, so it never covers `catalog/**`; the catalog tier is its own project under a **different config** (`vitest.catalog.mts`) | `--project api catalog/...` matches nothing and vitest exits **1** with `No test files found`. It does **not** silently pass — it blocks the worker, who must then improvise the real command. Both wave-3 workers hit it and both improvised correctly; a third might not, or might reach for `--passWithNoTests` and *then* get the silent green |
| the gate is a single `vitest` invocation | `catalog:test` is `node scripts/platform/catalog-stage.mjs --keep && vitest run --config vitest.catalog.mts` | catalog specs only exist once **staged**. Invoking `vitest` alone tests whatever a previous `--keep` left behind, or nothing at all |

**Corrected form for any catalog-scoped gate** (used by T39, T39a, T40):

```
pnpm catalog:test -- <catalog path>
```

**Two distinct failure modes, and this feature has now hit both — do not conflate them:**

- **Loud** (this § 0.8): the command is wrong, collects nothing, and *fails*. Costly and confusing,
  but self-announcing. A worker cannot mistake it for success.
- **Silent** (§ 0.6, T39a): the command is right and *passes green while proving nothing*, because
  the check does not reach where the work lives — `catalog:lint` cannot see type-aware rules in
  `catalog/**` until an entry is installed into a child. This is the dangerous one, and it is the
  one that has twice been caught only by `catalog:check`.

The rule that covers both: *a gate is not evidence until you know how many files it collected and
where they were.* Every Done-when asserting a gate passes should be read as also asserting **what
that run actually looked at**.

### 0.9 T42 and T48 corrections, verified on disk at HEAD `8be20f5` (before the wave-4 dispatch)

Two tasks still ahead inherited coordinates the tree has since moved past. Both were verified by
reading the tree, not by re-deriving the plan.

**Header drift, harmless but noted:** `tasks.md:19` still records `Base: v2.2.1` and calls `v2.3.0`
*"authored but untagged"*. `v2.3.0` was tagged and Released 2026-08-24 (marker `6c44937`). No task
body depends on that line.

#### T42 — half of it already landed, and the landed half carries the wrong reason

| Plan said | On disk | Effect |
| --- | --- | --- |
| Done-when 1: all five `version` fields leave `2.0.0` | **already true** — `c9803f8` bumped all five `2.0.0` → `2.0.1`, and it did so for the prettier pass (`06f35fb`), not for CAT-01 | the bullet is satisfied by a prior commit. **Do not re-bump reflexively**; decide deliberately (below) |
| Done-when 2: each `CHANGELOG.md` records the bump and why | **the `## [2.0.1]` sections exist** — `attachment:5`, `audit:5`, `identity/single-tenant:7`, `notification:5`, `tag:5` — but every one of them says *"mechanical prettier reformatting"* | formally satisfied, substantively not: the recorded *why* is the format pass, never the address collision CAT-01 names |
| Done-when 3: the five `affects` stop being `>=1.0.0 <2.0.0` | **untouched** — all five still carry `affects: ">=1.0.0 <2.0.0"` at `ADV-20260822-0{1..5}.md:5` | **this is T42's real remaining work.** It is the whole substantive half |
| Done-when 4/5: `pnpm catalog:lint` green, including T33's rule | green, and it stays green either way — see the rule's semantics below | the lint proves nothing about whether T42 ran |

**The bump rule cannot referee this decision, and that matters.** `entryChangedWithoutBump`
(`release-preflight.mjs:57-84`) runs `git diff --quiet <previousTag> HEAD -- <relDir>` at `:66` and
returns `false` immediately when the directory did not change (`:69`); it flags only *changed **and**
unbumped*. `lintEntryBump` (`lib/lint.mjs:225-245`) reuses it. So **a version bump with no tree
change is invisible to the rule** — it can neither demand nor forbid one. And
`git diff --name-only v2.3.0..HEAD -- catalog/` is **empty**: nothing under `catalog/` has moved
since the tag, so the rule is satisfied at HEAD and will remain satisfied whatever T42 does. This is
§ 0.8's *silent* mode again — a green gate that does not reach the question being asked.

**The collision CAT-01 names is now historical, and the worker must reason from that.** The defect
was that entry version `2.0.0` designated two different codebases, one under template tag `v2.0.0`
and one under `v2.1.0`. `2.0.1` designates exactly one codebase, cut at `c9803f8`, and no new content
can ever enter `2.0.0`. So the *address* is already unambiguous; what is still broken is that the
five advisories point at a range which **excludes** the population that carries the defect.

**Recommended range, to be confirmed against the tree rather than inherited:** `>=1.0.0 <2.0.1` —
it includes both `2.0.0` codebases and every `1.x`, and excludes `2.0.1`, the first version whose
address is unambiguous. If T42 does re-bump the entries, the upper bound follows the new version.
`docs/advisories/README.md` documents **no** convention for naming an ambiguous population
(`:16` shows only the plain semver-range template), so the range is a choice this task makes and
justifies in the advisory body — it is not inherited from anywhere.

**Scope this leaves T42:** correct the five `affects`; record the address disambiguation in each
entry's `CHANGELOG.md` (the `## [2.0.1]` section exists — say why the version is the one advisories
now key on); re-bump only if the worker can state on the tree why `2.0.1` is insufficient, and
**stop and report instead of guessing** if it can. `ADV-20260822-04` was edited by T20 and `-02` by
T34 — both earlier waves, so no race, but re-read them before writing.

#### T48 (area H) — unblocked, and it appends to a section that already exists

| Plan said | On disk | Effect |
| --- | --- | --- |
| `BLOCKED` until `git tag -l v2.3.0` is non-empty | returns `v2.3.0` — tagged and Released 2026-08-24 | **the block is lifted.** The Done-when bullet asserting it was checked before the first edit is satisfiable |
| *"Author `## v2.4.0`"* | `docs/dev/template-changelog.md:7` **already holds `## v2.4.0`**, created by `56ad498` for the `release` flag guard (`e2709f3`), with `### Changes` item 1 at `:14-20` and `### Child migration steps` = the literal `None — copier update is enough.` at `:22-24` | T48 **APPENDS** — new numbered items after item 1, under the existing `### Changes`. It never recreates the heading and never re-authors the section |

**Why the section exists despite the ruling that closed T13.** T13 concluded there was no `v2.4.0`
content left to write, and that was correct at the time: every commit then on `main` had shipped
inside `v2.3.0`. The flag-guard fix (`e2709f3`) landed **after** that conclusion and is kernel code
that reaches the child, so it is genuine `v2.4.0` content. The section therefore describes the flag
guard, and area H extends it — which is the protocol T13 itself specified for this shared slot.

**Three invariants for T48, all still binding:** the `## v2.3.0` section (`:26` onward) is
**untouched**; `## v2.4.0` stays the **latest** section so `release-preflight` keys on it (AD-034);
and its `### Child migration steps` stays the literal `None — copier update is enough.` — AD-034
forbids a manual step on a non-major, and waves 1–7 were authored to honour that. The agent does not
tag and does not push (AD-006/AD-034).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found:
> `docs/test/testing.md` (AD-028 single Vitest runner, layout, lint rules), `docs/code-quality.md:118-126`,
> `docs/arch/back.md:55,69,95,101`, `docs/arch/front.md:141-142,188`, `AGENTS.md.jinja:39-43`,
> `vitest.coverage.mts:45-68` (thresholds), `.github/workflows/{ci,catalog}.yml`.
> **Coverage floor is a hard gate**: 90 on statements/branches/functions/lines, globally and per
> `apps/api/src/**` and `apps/web/src/**` (AD-027).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| API kernel domain / application (`apps/api/src/shared/kernel/**`, `shared/config/**`) | unit | All branches; 1:1 to the spec AC the task closes; every listed edge case | `apps/api/src/**/*.spec.ts` | `pnpm vitest run --project api <path>` |
| API infrastructure / repositories | integration | Key query paths + error paths; **no DB mock** — testcontainers only (`docs/test/testing.md:109,121,130`) | `apps/api/{src,test}/**/*.int-spec.ts` | `pnpm vitest run --config vitest.integration.mts --project api-int <path>` |
| API routes / controllers / boot | e2e | Every route the task touches: happy + edge + error | `apps/api/test/**/*.e2e-spec.ts` | `pnpm vitest run --config vitest.integration.mts --project api-e2e <path>` |
| Web app / shared / pages | unit | All branches; every listed edge case; `@testing-library/jest-dom/vitest` | `apps/web/src/**/*.test.{ts,tsx}` | `pnpm vitest run --project web <path>` |
| Catalog entry code | unit | 1:1 to the entry AC; entry specs live beside the code | `catalog/<entry>/**/*.spec.ts`, `**/*.int-spec.ts` | `pnpm vitest run --project api <path>` |
| Catalog entry parity | parity snapshot | Snapshot regenerated **deliberately, in its own task**, never incidentally | `catalog/<entry>/parity/*.parity.spec.ts` + `contract.snapshot.json` | `pnpm catalog:check <entry>` (rendered product only) |
| Platform scripts / tooling (`scripts/**`) | unit (`node:test`) | Every branch of the repaired defect + one regression case per repaired site | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| Claude hooks (`.claude/hooks/**`) | unit (`node:test`) | Every decision branch of the hook's contract | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| Docs, `.jinja`, manifests, workflows, `copier.yml` | none — gate only | Build/lint gate; **plus** a committed guard spec wherever the AC's proof is `gate` | — | `pnpm check`, `pnpm catalog:lint`, `pnpm template:smoke` |
| Contract artefacts (`openapi.json`, `packages/api-client/src/**`) | gate | `pnpm contract` then an empty `git diff --exit-code` | — | `pnpm contract && git diff --exit-code openapi.json packages/api-client/src` |

**Provenance note.** `apps/api` and `apps/web` have **no `test` script** — the repo root is the only
runner (AD-028). `docs/agents/workflow.md:108` still cites a Jest `testRegex`; that is doc drift and
is itself repaired by TOOL-09 (T14). `scripts/platform/__tests__/*.test.mjs` runs under Node's
native `node --test`, **not** Vitest — tooling tasks therefore gate with `pnpm test:scripts`.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tasks with unit tests only | `pnpm vitest run --project api\|web <touched path>` — or `pnpm test:scripts` when the task touches `scripts/**` or `.claude/hooks/**`, or **`pnpm catalog:test -- <path>`** when it touches `catalog/**` (**§ 0.8**: `--project api` cannot match `catalog/**` and exits 1, and catalog specs must be staged first) |
| Full | Tasks with e2e/integration tests | Quick command **plus** `pnpm vitest run --config vitest.integration.mts --project api-int\|api-e2e <the spec files this task created or touched>` — never the whole suite |
| Build | Once per wave, by the orchestrator through the runner, after every cluster reported | `pnpm check` (= `turbo lint typecheck`) + unit scoped to the union of the wave's `Touches`, **plus `pnpm catalog:typecheck && pnpm catalog:lint` from wave 3 on** (see below). `full-unit` variant = `pnpm check && pnpm test`. A docs/config/CI-only wave = `pnpm check` alone, still with the two catalog commands |
| Final | Once per feature, at the Verifier's build-level gate | `pnpm check && pnpm test && pnpm test:scripts && pnpm test:coverage && pnpm catalog:lint && pnpm catalog:typecheck && pnpm template:smoke` |

**Suite-cost rule (hard).** The full unit suite and the complete integration/e2e suite each run
**once per feature**, at the Final gate. `pnpm test:coverage` (which merges unit + int + e2e in one
process and enforces the 90 floor) is a **Final-gate-only** command — never a per-task or per-wave
gate. Per-task gates stay path-scoped; the Build gate runs once per wave and never inside a worker.

**Two Final gates.** The release boundary is binding, so the Verifier runs **twice**: pass 1 after
wave 7 (scoped to the `v2.4.0` requirements), pass 2 after wave 14 (the whole feature). Both are
full-suite runs; that is the deliberate cost of shipping two tags from one spec.

---

## Wave Plan

Waves run in order (barrier + Build gate between them). Clusters inside a wave run **in parallel**,
one worker each; tasks inside a cluster run in the listed order. Exclusive waves hold one task and
nothing else in flight.

**The release boundary is binding**: `v2.4.0` (waves 1–7) and `v3.0.0` (waves 8–14) never share a
wave, and the major's waves start only after the minor's Verifier passes and the owner has tagged.

| Wave | Cluster | Tasks (in order) | Files (union of Touches) | Notes |
| ---- | ------- | ---------------- | ------------------------ | ----- |
| 1 | C1 | T1 → T2 → T3 → T4 → T5 | `scripts/platform/lib/entries.mjs`, `scripts/platform/lib/is-main.mjs`, `scripts/platform/lib/copier-exclude.mjs`, `scripts/platform/lib/lint.mjs`, `scripts/platform/lib/catalog-graph.mjs`, `scripts/platform/lib/template-version.mjs`, `scripts/platform/lib/commands/add.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/catalog-check.mjs`, `scripts/platform/catalog-stage.mjs`, `scripts/platform/advisory-required.mjs`, `scripts/platform/jest-to-vitest.mjs`, `scripts/platform/release-preflight.mjs`, `scripts/platform/cli.mjs`, `scripts/template-smoke.mjs`, `scripts/platform/__tests__/entries.test.mjs`, `scripts/platform/__tests__/is-main.test.mjs`, `scripts/platform/__tests__/excluded-imports.test.mjs`, `scripts/platform/__tests__/template-version.test.mjs`, `scripts/platform/__tests__/smoke-runs-cli.test.mjs` | platform CLI import surface · gate: scoped (`pnpm test:scripts`) |
| 1 | C2 | T6 → T7 → T8 → T9 → T10 → T11 | `apps/api/src/shared/config/env.ts`, `apps/api/src/shared/config/env.spec.ts`, `apps/api/.env.example`, `apps/web/.env.example`, `apps/api/Dockerfile`, `apps/api/Dockerfile.dev`, `apps/api/docker-entrypoint.dev.sh`, `docker-compose.yml`, `README.md.jinja`, `.github/README.md`, `docs/dev/local-environment.md`, `TEMPLATE.md`, `apps/api/package.json`, `scripts/platform/__tests__/documented-commands.test.mjs`, `scripts/platform/__tests__/canonical-port.test.mjs`, `scripts/platform/__tests__/fixture-repair-documented.test.mjs` | first-run truth · gate: **full-unit** (touches `shared/config/env.ts`) |
| 1 | C3 | T12 → T13 → T14 → T15 → T16 | `docs/agents/infra.md.jinja`, `docs/dev/deploy.md.jinja`, `docs/agents/workflow.md`, `AGENTS.md.jinja`, `docs/agents/README.md`, `docs/agents/issue-tracker.md.jinja`, `docs/agents/communication.md`, `scripts/platform/__tests__/docs-no-owner-infra.test.mjs` | product-facing docs de-branding · gate: scoped |
| 2 | C4 | T17 → T18 → T19 → T20 → T21 → T22 | `scripts/platform/lib/apply.mjs`, `scripts/platform/lib/plan.mjs`, `scripts/platform/lib/commands/add.mjs`, `scripts/platform/lib/commands/advisory.mjs`, `scripts/platform/lib/exit-codes.mjs`, `scripts/platform/lib/advisories.mjs`, `.claude/hooks/pending-advisories.mjs`, `docs/advisories/README.md`, `docs/advisories/ADV-20260822-04.md`, `.agents/skills/port-module-update/SKILL.md`, `scripts/platform/__tests__/lock-paths.test.mjs`, `scripts/platform/__tests__/rollback.test.mjs`, `scripts/platform/__tests__/advisory-exit-codes.test.mjs`, `scripts/platform/__tests__/pending-advisories-hook.test.mjs`, `scripts/platform/__tests__/compute-pending-catalogref.test.mjs` | lock / rollback / advisory truth · gate: scoped |
| 2 | C5 | T23 → T24 → T25 → T26 → T27 | `apps/web/index.html`, `apps/web/public/`, `apps/web/nginx.conf`, `apps/web/src/app/router/shell.tsx`, `apps/web/src/main.tsx`, `apps/web/src/app/providers/app-providers.tsx`, `apps/web/src/shared/config/routes.ts`, `apps/web/src/shared/lib/last-location.ts`, `apps/web/src/shared/lib/auth-redirect.ts`, `apps/web/src/app/config/zod-locale.ts`, `apps/web/src/app/router/route-pending.tsx`, `apps/web/src/pages/not-found/ui/not-found-page.tsx`, `apps/web/src/pages/error/ui/error-page.tsx`, `apps/web/src/app/router/shell.test.tsx`, `apps/web/src/shared/config/routes.test.ts`, `apps/web/src/shared/lib/last-location.test.ts`, `catalog/identity/single-tenant/README.md` | web locale + route/guard seams · gate: **full-unit** (`apps/web/src/shared/**` is kernel surface) |
| 2 | C6 | T28 → T29 → T30 → T31 → T32 | `apps/api/src/shared/kernel/errors/problem-details.filter.ts`, `apps/api/src/shared/kernel/errors/problem-details.filter.spec.ts`, `apps/api/src/shared/kernel/errors/domain.error.ts`, `apps/api/src/shared/kernel/i18n/`, `apps/api/src/main.ts`, `apps/api/src/bootstrap.product.ts`, `apps/api/src/shared/kernel/context/request-context.ts`, `apps/api/src/shared/kernel/context/request-context.spec.ts`, `apps/api/src/shared/kernel/context/request-context.middleware.ts`, `apps/api/src/shared/infra/database/application-pool.int-spec.ts`, `docs/dev/template.md`, `apps/api/test/bootstrap-product.e2e-spec.ts` | API kernel locale + boot/tenant seams · gate: **full-unit** (kernel) |
| 3 | C7 | T33 → T34 → T35 → T36 | `scripts/platform/lib/lint.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/release-preflight.mjs`, `docs/advisories/ADV-20260822-02.md`, `.github/workflows/ci.yml`, `package.json`, `docs/arch/back.md`, `scripts/platform/__tests__/entry-bump-lint.test.mjs`, `scripts/platform/__tests__/advisory-path-scope.test.mjs`, `scripts/platform/__tests__/contract-check-ci.test.mjs` | catalog version gate + contract drift gate · gate: scoped (§ 0.5) |
| 3 | C8 | T37 → T38 → T39 → T40 | `docs/code-quality.md`, `docs/agents/communication.md`, `docs/agents/issue-tracker.md.jinja`, `AGENTS.md.jinja`, `docs/arch/front.md`, `docs/adr/README.md`, `docs/advisories/README.md`, `docs/test/testing.md`, `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts`, `catalog/identity/single-tenant/api/application/access-policy.ts`, `catalog/identity/single-tenant/api/domain/ports/user.repository.ts`, `catalog/identity/single-tenant/api/application/use-cases/update-user/update-user.use-case.ts`, `catalog/identity/single-tenant/api/domain/errors.ts`, `catalog/notification/api/application/templates/base-template-sources.ts`, `catalog/notification/api/application/catalog/notification-catalog.ts`, `catalog/notification/api/infrastructure/mailer/templates/layout.hbs`, `catalog/audit/api/application/services/activity-area-resolver.ts`, `catalog/tag/api/domain/errors.ts`, `catalog/attachment/api/domain/errors.ts` | locale single source + per-entry message tables · gate: **full-unit** (catalog entries) |
| 3 | C9 | T41 | `copier.yml`, `.github/workflows/feedback-triage.yml`, `scripts/platform/__tests__/copier-questions.test.mjs` | `copier.yml` wiring task — one owner for a file four requirements edit · gate: scoped |
| 4 (exclusive) | C10 | T42 | `catalog/identity/single-tenant/module.json`, `catalog/attachment/module.json`, `catalog/audit/module.json`, `catalog/notification/module.json`, `catalog/tag/module.json`, `catalog/identity/single-tenant/CHANGELOG.md`, `catalog/attachment/CHANGELOG.md`, `catalog/audit/CHANGELOG.md`, `catalog/notification/CHANGELOG.md`, `catalog/tag/CHANGELOG.md`, `docs/advisories/ADV-20260822-01.md`, `docs/advisories/ADV-20260822-02.md`, `docs/advisories/ADV-20260822-03.md`, `docs/advisories/ADV-20260822-05.md` | five entry bumps + `affects` corrections — alone · gate: full-unit |
| 5 (exclusive) | C11 | T43 | `.agents/skills/tlc-spec-driven/SKILL.md`, `.agents/skills/tlc-spec-driven/references/validate.md`, `.agents/skills/tlc-spec-driven/references/sub-agents.md`, `.agents/skills/tlc-spec-driven/references/cards/orchestrator.md`, `.agents/skills/repo-discovery/SKILL.md`, `.claude/agents/spec-verifier.md`, `.claude/hooks/subagent-model-required.mjs`, `docs/agents/harness.md`, `scripts/platform/__tests__/harness-taxonomy.test.mjs` | BRAND-04 — **edits the rules this workflow runs under**; alone, last · gate: scoped |
| 6 | C12 | T44 → T45 → T46 → T47 | `.claude/hooks/contract-enum.mjs`, `.claude/hooks/edit-reminders.mjs`, `docs/arch/front.md`, `apps/api/src/modules/module-boundaries.spec.ts`, `apps/api/test/setup/test-db.ts`, `apps/api/test/setup/unit-env.ts`, `apps/api/test/setup/e2e-env.ts`, `scripts/platform/__tests__/brand-hygiene.test.mjs`, `scripts/platform/__tests__/hook-references.test.mjs`, `catalog/identity/single-tenant/README.md`, `.specs/features/done/v0-2-product-slots/coverage-sweep.md` | hooks truth + guard scan + the hygiene gate · gate: **full-unit** (test harness) |
| 7 (owner-gated) | C13 | T48 | `docs/dev/template-changelog.md` | **BLOCKED** until `git tag -l v2.3.0` is non-empty · gate: scoped |
| 8 | C14 | T49 → T50 → T51 → T52 → T53 | `apps/api/src/openapi/openapi-config.ts`, `apps/api/src/openapi/openapi-config.spec.ts`, `apps/web/src/app/config/api-client.ts`, `apps/web/src/shared/lib/last-location.ts`, `apps/web/src/shared/store/auth.store.ts`, `apps/api/test/setup/unit-env.ts`, `apps/api/test/setup/e2e-env.ts`, `catalog/identity/single-tenant/api/identity.config.ts`, `catalog/identity/single-tenant/api/api/guards/cookie.ts`, `packages/api-client/src/client.ts`, `apps/api/src/shared/kernel/clock/bucket-sql.ts`, `apps/api/src/shared/kernel/clock/bucket-sql.spec.ts`, `apps/api/src/shared/config/env.ts`, `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-usage-stats.reader.ts`, `catalog/audit/api/infrastructure/repositories/drizzle-activity-stats.reader.ts` | brand major: cookies, CSRF seam, SameSite, timezone · gate: **full-unit** (kernel + contract inputs) |
| 8 | C15 | T54 → T55 → T56 | `apps/api/src/shared/infra/storage/storage.config.ts`, `apps/api/src/shared/infra/storage/storage.module.ts`, `apps/api/src/shared/infra/storage/s3-storage.adapter.ts`, `apps/api/src/shared/infra/storage/null-storage.adapter.ts`, `apps/api/src/shared/infra/storage/null-storage.adapter.spec.ts`, `apps/api/src/shared/infra/storage/storage-unavailable.error.ts`, `apps/api/src/app.module.ts`, `apps/api/.env.example`, `docs/dev/local-environment.md`, `scripts/platform/__tests__/brand-hygiene.test.mjs` | storage seam + hygiene-gate extension + env wiring · gate: **full-unit** |
| 9 (exclusive) | C16 | T57 | `openapi.json`, `packages/api-client/src/` | contract regen after the cookie rename — alone · gate: full-unit |
| 10 | C17 | T58 → T59 → T60 → T61 → T62 → T63 | `catalog/professional/` | new `professional` entry (AD-035) · gate: **full-unit** |
| 10 | C18 | T64 → T65 → T66 | `catalog/audit/api/domain/base-audit-registrations.ts`, `catalog/audit/api/domain/audit-coverage.ts`, `catalog/audit/api/testing/reattach-identity-tables.ts`, `catalog/audit/api/__e2e__/audit.e2e-spec.ts`, `docs/advisories/ADV-20260824-01.md`, `docs/advisories/ADV-20260824-02.md` | audit entry + the two `breaking` advisories · gate: scoped |
| 11 | C19 | T67 → T68 → T69 → T70 → T71 → T72 | `catalog/identity/single-tenant/api/domain/entities/user.entity.ts`, `catalog/identity/single-tenant/api/domain/ports/user.repository.ts`, `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-user.repository.ts`, `catalog/identity/single-tenant/api/identity.module.ts`, `catalog/identity/single-tenant/api/infrastructure/professional/`, `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts`, `catalog/identity/single-tenant/api/domain/access/access-profile.types.ts`, `catalog/identity/single-tenant/api/domain/permissions/permission.types.ts`, `catalog/identity/single-tenant/api/infrastructure/tables/user.table.ts`, `catalog/identity/single-tenant/api/testing/seed-user.ts`, `catalog/identity/single-tenant/api/application/use-cases/create-user/`, `catalog/identity/single-tenant/api/application/use-cases/update-user/update-user.use-case.ts`, `catalog/identity/single-tenant/module.json`, `catalog/identity/single-tenant/migrations/custom/04_audit_attach_hook.sql`, `apps/api/test/setup/test-db.ts` | identity slimming · gate: **full-unit** |
| 11 | C20 | T73 → T74 → T75 | `scripts/platform/migrations/v3.0.0.mjs`, `scripts/platform/lib/commands/template.mjs`, `scripts/platform/__tests__/migration-v3.test.mjs` | executable child migration (AD-034) · gate: scoped |
| 12 (exclusive) | C21 | T76 | `openapi.json`, `packages/api-client/src/`, `catalog/identity/single-tenant/parity/`, `catalog/professional/parity/` | contract regen + parity re-snapshot — alone · gate: full-unit |
| 13 | C22 | T77 → T78 | `catalog/professional/README.md`, `catalog/professional/CHANGELOG.md`, `.specs/STATE.md`, `scripts/platform/__tests__/catalog-check-professional.test.mjs` | IDENT-02 proof + AD-035 record · gate: scoped |
| 14 (owner-gated) | C23 | T79 | `docs/dev/template-changelog.md` | **BLOCKED** until `v2.4.0` is tagged · gate: scoped |

```
─────────────────────────────── v2.4.0 ───────────────────────────────
Wave 1:  [C1: T1→T2→T3→T4→T5] ∥ [C2: T6→T7→T8→T9→T10→T11] ∥ [C3: T12→T13→T14→T15→T16]
Wave 2:  [C4: T17→…→T22]      ∥ [C5: T23→…→T27]           ∥ [C6: T28→…→T32]
Wave 3:  [C7: T33→…→T36]      ∥ [C8: T37→…→T40]           ∥ [C9: T41]
Wave 4:  [C10: T42]  (exclusive — five module.json bumps + advisory affects)
Wave 5:  [C11: T43]  (exclusive — BRAND-04 harness taxonomy)
Wave 6:  [C12: T44→T45→T46→T47]
Wave 7:  [C13: T48]  (owner-gated: v2.3.0 must be tagged)
         ► Verifier pass 1 (v2.4.0 scope) ► owner dispatches release → v2.4.0
─────────────────────────────── v3.0.0 ───────────────────────────────
Wave 8:  [C14: T49→…→T53]     ∥ [C15: T54→T55→T56]
Wave 9:  [C16: T57] (exclusive — contract regen, cookie rename)
Wave 10: [C17: T58→…→T63]     ∥ [C18: T64→T65→T66]
Wave 11: [C19: T67→…→T72]     ∥ [C20: T73→T74→T75]
Wave 12: [C21: T76] (exclusive — contract regen + parity re-snapshot)
Wave 13: [C22: T77→T78]
Wave 14: [C23: T79] (owner-gated: v2.4.0 must be tagged)
         ► Verifier pass 2 (whole feature) ► owner dispatches release → v3.0.0
```

## Exclusive inventory

| # | Subject | Task | Wave | Status |
| --- | --- | --- | --- | --- |
| 1 | Contract regen for BRAND-01 | T57 | 9 | in this plan |
| 2 | Contract regen + parity re-snapshot for G | T76 | 12 | in this plan |
| 3 | Five `module.json` bumps + advisory `affects` | T42 | 4 | in this plan |
| 4 | Harness P0 taxonomy (**BRAND-04**, not BRAND-05 — see § 0.1) | T43 | 5 | in this plan |
| 5 | `.prettierrc` + root devDependency | — | — | **inherited constraint, owned by `prettier-format-gate`** (§ 0.2). No task here; do not cluster a `.prettierrc` edit beside anything. |

## Owner hand-off points (the agent never tags and never pushes — AD-006/AD-034)

1. **Before wave 7** — the owner tags `v2.3.0`. T48 is blocked until `git tag -l v2.3.0` is non-empty.
2. **After wave 7** — the owner dispatches the `release` workflow for `v2.4.0` (+ the
   `catalog/<name>@x.y.z` tags CAT-05 observes).
3. **Before wave 14** — `v2.4.0` must be tagged, or appending `## v3.0.0` makes it untaggable under
   `release-preflight`'s latest-section rule.
4. **After wave 14** — the owner dispatches `v3.0.0`.

---

## Task Breakdown — `v2.4.0`

Every task below is reachable by a child with a plain `copier update`: **zero manual migration
steps** (AD-034). Anything that would force a child decision belongs to `v3.0.0`.

### T1: Relocate `discoverEntries` out of the excluded `lib/lint.mjs`

**What**: Move `discoverEntries` into a new shipped module so the platform CLI stops importing a file `copier.yml` `_exclude`s.
**Where**: `scripts/platform/lib/entries.mjs` (new)
**Touches**: `scripts/platform/lib/entries.mjs`, `scripts/platform/lib/lint.mjs`, `scripts/platform/lib/catalog-graph.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/release-preflight.mjs`, `scripts/platform/__tests__/entries.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: `discoverEntries` at `scripts/platform/lib/lint.mjs:145` — moved verbatim, not rewritten
**Requirement**: CLI-01 (F-copier-mechanics-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `scripts/platform/lib/catalog-graph.mjs:4` no longer imports `./lint.mjs`
- [ ] `lib/lint.mjs` re-exports from `lib/entries.mjs` so `catalog-lint.mjs` keeps working
- [ ] A rendered child (no `lib/lint.mjs` on disk) resolves `scripts/platform/cli.mjs` without throwing
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass (no silent deletions)

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T2: Fix the entrypoint path guard at all 8 sites

**What**: Replace the `import.meta.url === \`file://${process.argv[1]}\`` comparison with a shared helper that survives a path containing a space.
**Where**: `scripts/platform/lib/is-main.mjs` (new)
**Touches**: `scripts/platform/lib/is-main.mjs`, `scripts/platform/cli.mjs`, `scripts/platform/catalog-check.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/catalog-stage.mjs`, `scripts/platform/advisory-required.mjs`, `scripts/platform/jest-to-vitest.mjs`, `scripts/platform/release-preflight.mjs`, `scripts/template-smoke.mjs`, `scripts/platform/__tests__/is-main.test.mjs`
**Depends on**: T1
**Exclusive**: no
**Reuses**: `node:url` `pathToFileURL`
**Requirement**: TOOL-01 (F-platform-scripts-7)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Exactly **8** call sites use the helper — `cli.mjs:98`, `catalog-check.mjs:236`, `catalog-lint.mjs:129`, `catalog-stage.mjs:36`, `advisory-required.mjs:90`, `jest-to-vitest.mjs:406`, `release-preflight.mjs:116`, `scripts/template-smoke.mjs:339`
- [ ] A test asserts **zero** remaining raw `file://${process.argv[1]}` comparisons under `scripts/**`, so a ninth copy cannot be reintroduced
- [ ] Each entrypoint runs from a directory whose name contains a space
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 3 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

> `scripts/platform/template-update-ci.mjs` (the ledger's 9th site) was deleted by `eb907ef`. Do not recreate it.

---

### T3: `readTemplateVersion` must parse through `parseInstalledVersion`

**What**: One-line repair — `readTemplateVersion` stops doing its own `replace(/^v/, "")` and calls the correct parser, so a describe-style (off-tag) `_commit` resolves instead of failing.
**Where**: `scripts/platform/lib/commands/add.mjs:36-41`
**Touches**: `scripts/platform/lib/commands/add.mjs`, `scripts/platform/lib/template-version.mjs`, `scripts/platform/__tests__/template-version.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: `parseInstalledVersion` at `scripts/platform/lib/template-version.mjs:32-37` — already correct, never called
**Requirement**: TOOL-03 (F-platform-scripts-2)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `readTemplateVersion` delegates to `parseInstalledVersion`
- [ ] `_commit` of the form `v2.2.1-4-gabc1234` resolves to base tag `2.2.1`
- [ ] `checkKernelRange` (`lib/plan.mjs:33-36`) receives a semver, never a describe string
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 5 new tests pass (plain tag, describe ref, dirty ref, missing `_commit`, non-semver)

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T4: Guard — no `scripts/**` file imports an `_exclude`d path

**What**: A committed spec that reads `copier.yml` `_exclude` and fails when any file shipped under `scripts/**` imports a path the child will not receive. This is the gate that stops CLI-01 recurring.
**Where**: `scripts/platform/__tests__/excluded-imports.test.mjs` (new)
**Touches**: `scripts/platform/lib/copier-exclude.mjs`, `scripts/platform/__tests__/excluded-imports.test.mjs`
**Depends on**: T1
**Exclusive**: no
**Reuses**: `copier.yml` `_exclude` block (`:54-56`); `discoverEntries` scan shape
**Requirement**: CLI-02 (F-copier-mechanics-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The guard parses `_exclude` from `copier.yml`, never a hard-coded copy of the list
- [ ] It fails on a deliberately injected import of `lib/lint.mjs` from `scripts/platform/cli.mjs`
- [ ] It passes at HEAD after T1
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 3 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T5: `template:smoke` executes the platform CLI inside the rendered child

**What**: Extend the smoke harness so it runs `pnpm platform status` (and `list`) inside the child it renders, failing on a module-resolution error.
**Where**: `scripts/template-smoke.mjs`
**Touches**: `scripts/template-smoke.mjs`, `scripts/platform/__tests__/smoke-runs-cli.test.mjs`
**Depends on**: T1, T2
**Exclusive**: no
**Reuses**: the existing `template:smoke` render harness; `.github/workflows/catalog.yml:82-94` job `smoke`
**Requirement**: CLI-03 (F-copier-mechanics-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The smoke run invokes the child's own `pnpm platform status` and asserts a non-crash exit
- [ ] A deliberate reintroduction of the excluded import turns the smoke red
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 2 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `feat(platform): run the CLI inside the smoke-rendered child`

---

### T6: One canonical API port — `3000`

**What**: Collapse the two competing ports to a single `3000` across every file a child reads.
**Where**: `apps/api/src/shared/config/env.ts:14`
**Touches**: `apps/api/src/shared/config/env.ts`, `apps/api/src/shared/config/env.spec.ts`, `apps/api/.env.example`, `apps/web/.env.example`, `apps/api/Dockerfile`, `apps/api/Dockerfile.dev`, `docker-compose.yml`, `README.md.jinja`, `.github/README.md`, `docs/dev/local-environment.md`, `scripts/platform/__tests__/canonical-port.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: `apps/api/Dockerfile:54,57` already assume `3000`
**Requirement**: RUN-01 (F-api-kernel-3, F-agnostic-leaks-7, F-docs-consistency-5, F-ci-docker-infra-6)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `env.ts:14` default is `3000`; `apps/api/.env.example:5` is `PORT=3000`; `local-environment.md:48` says `3000`
- [ ] A committed test asserts exactly one port literal across the ten sites, so the pair cannot drift apart again
- [ ] `docker-compose.yml:70` port mapping and the container's `PORT` agree
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/shared/config` and `pnpm test:scripts`
- [ ] Test count: 3 new tests pass

**Tests**: unit · **Gate**: quick

---

### T7: The shipped `REDIS_URL` authenticates against the shipped Redis

**What**: `apps/api/.env.example` carries credentials matching `docker-compose.yml`'s `--requirepass`, and the doc stops claiming a repair that never happened.
**Where**: `apps/api/.env.example:49`
**Touches**: `apps/api/.env.example`, `docs/dev/local-environment.md`
**Depends on**: T6
**Exclusive**: no
**Reuses**: `docker-compose.yml:33-34` (`--requirepass redis`) and `:68` (`REDIS_URL: redis://:redis@redis:6379`, already correct on the compose side)
**Requirement**: RUN-02 (F-agnostic-leaks-6, F-ci-docker-infra-6)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `.env.example` `REDIS_URL` includes the password used by compose
- [ ] `local-environment.md:32` no longer asserts the value is "already reflected in `apps/api/.env`"
- [ ] Gate passes: build gate (docs/env only)

**Tests**: none (matrix: docs/env → gate only) · **Gate**: build

---

### T8: Every documented first-run command exists

**What**: Reconcile the command lists with `apps/api/package.json` — either the script ships or the doc stops naming it.
**Where**: `apps/api/package.json:15`
**Touches**: `apps/api/package.json`, `README.md.jinja`, `.github/README.md`, `docs/dev/local-environment.md`, `scripts/platform/__tests__/documented-commands.test.mjs`
**Depends on**: T6
**Exclusive**: no
**Reuses**: the manifest-vs-doc scan shape from T4
**Requirement**: RUN-03 (F-agnostic-leaks-5, F-api-kernel-1)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `db:bootstrap` and `db:seed:demo` either exist as scripts or are removed from every doc
- [ ] `db:seed` no longer points at the absent `apps/api/src/seeds`
- [ ] A committed test extracts every `pnpm …` command from `README.md.jinja`, `.github/README.md` and `local-environment.md` and asserts each resolves in a manifest
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

> `copier.yml` `_message_after_copy:89` names `db:bootstrap` too. That file is owned by **T41** — do not edit it here.

---

### T9: Declare the supported dev platforms

**What**: State macOS / Linux / WSL2 and that native Windows is unsupported, in the four places a reader looks.
**Where**: `docs/dev/local-environment.md:9`
**Touches**: `docs/dev/local-environment.md`, `README.md.jinja`, `TEMPLATE.md`
**Depends on**: T8
**Exclusive**: no
**Reuses**: the honest-support-matrix decision in `spec.md` § Out of Scope (HARNESS-05)
**Requirement**: TOOL-10 (F-probe-windows-client-viability-1)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] All three files state the same matrix, naming the symlink-based `scripts/sync-agent-skills.mjs` as the reason
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

> The `_message_after_copy` copy of this statement is written by **T41**.

---

### T10: Remove the legacy-MySQL backfill machinery

**What**: Delete the owner's legacy-migration story from the shipped dev environment and the entrypoint.
**Where**: `docs/dev/local-environment.md:59-64`
**Touches**: `docs/dev/local-environment.md`, `apps/api/docker-entrypoint.dev.sh`
**Depends on**: T7, T9
**Exclusive**: no
**Reuses**: —
**Requirement**: **BRAND-06** (F-docs-consistency-2 **C**) — story AC 7; see § 0.1

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `db:backfill:legacy` (a command in no manifest) appears nowhere
- [ ] `docker-entrypoint.dev.sh:8-13` no longer branches on `RUN_BACKFILL` or mentions `SyncLegacyModule`
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

> BRAND-06's third site, `docs/dev/deploy.md.jinja:18-24,73`, is removed by **T13**'s rewrite — that file has one owner.

---

### T11: Regression assertion — the fixture repair stays documented

**What**: RUN-05 has no fix left (`F-runtime-probe-4` closed by `74022fe`). Assert that the changelog and the template-update skill keep stating the repair, so the guidance cannot silently disappear.
**Where**: `scripts/platform/__tests__/fixture-repair-documented.test.mjs` (new)
**Touches**: `scripts/platform/__tests__/fixture-repair-documented.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: `docs/dev/template-changelog.md:99-107` (v2.2.0 § Child migration steps, step 1); `.agents/skills/template-update/SKILL.md:29-37`
**Requirement**: RUN-05 (F-runtime-probe-4) — **degraded to a regression assertion by design**

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The test asserts both documents still describe repairing a child's broken `.copier-answers.yml` before `copier update`
- [ ] The test asserts no `.copier-answers.yml` (leading dot) is tracked — the fixture stays `scripts/platform/__tests__/fixtures/child/copier-answers.yml`
- [ ] **Read-only**: this task must not edit `docs/dev/template-changelog.md` (owner-gated, T48)
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 2 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T12: Rewrite `docs/agents/infra.md.jinja` to platform-level facts

**What**: Full rewrite (the concrete-infra assertions span most of the 221 lines) leaving image contract, entrypoint and env matrix, plus a product-owned "your provider" section.
**Where**: `docs/agents/infra.md.jinja`
**Touches**: `docs/agents/infra.md.jinja`
**Depends on**: None
**Exclusive**: no
**Reuses**: the env matrix already in `apps/api/.env.example`
**Requirement**: **BRAND-05** (F-agnostic-leaks-1 **C**) — story AC 6; see § 0.1

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] No AWS account, region, VM name, Dokploy panel, DB role, dated owner decision or `~/.local/bin` script survives (ledger sites: `:1,27-28,38-40,49-53,58-77,85-88,95-104,111,116-118,120-122,126-163,165-193`)
- [ ] A "your provider" section exists and is marked product-owned
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T13: Rewrite `docs/dev/deploy.md.jinja`

**What**: Full rewrite on the same principle; it also carries BRAND-06's legacy-MySQL lines and TOOL-09's false CI claim, so this file's single owner removes all three.
**Where**: `docs/dev/deploy.md.jinja`
**Touches**: `docs/dev/deploy.md.jinja`
**Depends on**: T12
**Exclusive**: no
**Reuses**: T12's "your provider" shape
**Requirement**: BRAND-05 (primary) · BRAND-06 (`:18-24,73`) · TOOL-09 (`:111`)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Owner infrastructure gone (`:3,17-24,73,103-112,139-142,144-168`)
- [ ] No legacy-MySQL backfill remains
- [ ] The CI description matches the real jobs (`quality`, `test-unit`, `test-coverage`) — no Jest construct named
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T14: `docs/agents/workflow.md` describes the real pipeline

**What**: Correct the pre-push chain, the CI job list and the stale Jest `testRegex` claim; repoint the infra router line.
**Where**: `docs/agents/workflow.md:108,118-125,129`
**Touches**: `docs/agents/workflow.md`
**Depends on**: T13
**Exclusive**: no
**Reuses**: real `lefthook.yml` pre-push (`migrations → typecheck → catalog-typecheck → test-coverage`) and `.github/workflows/ci.yml:19-63`
**Requirement**: TOOL-09 (F-docs-consistency-6) · BRAND-05 (`:129` router)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `:108` no longer cites `testRegex`; it names Vitest's `include` in `apps/api/vitest.config.mts:20`
- [ ] `:118-125` matches `lefthook.yml` and the three real CI jobs
- [ ] The infra router points at the rewritten `infra.md`
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T15: Fix the doc routers that promise owner infrastructure

**What**: `AGENTS.md.jinja:23,28` and `docs/agents/README.md:17` describe `infra.md`/`deploy.md` as owner-infrastructure references; retitle them to what the rewritten docs now hold.
**Where**: `AGENTS.md.jinja:23,28`
**Touches**: `AGENTS.md.jinja`, `docs/agents/README.md`
**Depends on**: T12, T13, T14
**Exclusive**: no
**Reuses**: —
**Requirement**: BRAND-05 (F-agnostic-leaks-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Both routers describe platform-level content plus a product-owned section
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

> `AGENTS.md.jinja`'s language rule (`:58,81-82`) is edited by **T37**, in a later wave.

---

### T16: Issue taxonomy becomes a product-filled placeholder

**What**: Replace the hospitality area-labels with a `{{ … }}` placeholder the product fills, keeping the closed-list rule intact and making the worked examples domain-neutral.
**Where**: `docs/agents/issue-tracker.md.jinja:21,29-31`
**Touches**: `docs/agents/issue-tracker.md.jinja`, `docs/agents/communication.md`, `scripts/platform/__tests__/docs-no-owner-infra.test.mjs`
**Depends on**: T15
**Exclusive**: no
**Reuses**: existing copier placeholder conventions
**Requirement**: BRAND-03 (F-agents-skills-1 **C**, F-agnostic-leaks-8 **C**, F-docs-consistency-8) — story AC 4

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The area-label list is a placeholder, not a literal; the closed-list rule survives
- [ ] Worked examples name no hospitality domain
- [ ] A committed test asserts no owner-domain noun in `docs/agents/**` and `docs/dev/deploy.md.jinja` — **with the exclusion list** (`preservar`/`preservad-`, `reservado`, `state-preservation`) that accounts for ~110 of the 241 raw hits
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 5 new tests pass, including a self-test that the excluded terms do **not** trip the guard

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `feat(agents): product-filled issue taxonomy with a domain guard`

---

### T17: `.platform-modules.lock` paths are child-relative

**What**: `writeLock` records paths relative to the child root instead of the absolute `cwd`-derived ones.
**Where**: `scripts/platform/lib/apply.mjs:143-144`
**Touches**: `scripts/platform/lib/apply.mjs`, `scripts/platform/lib/plan.mjs`, `scripts/platform/lib/commands/add.mjs`, `.agents/skills/port-module-update/SKILL.md`, `scripts/platform/__tests__/lock-paths.test.mjs`
**Depends on**: None
**Exclusive**: no
**Reuses**: `childLayout(targetRoot)` at `lib/plan.mjs:85`; rollback readers at `apply.mjs:158-159`
**Requirement**: TOOL-02 (F-platform-scripts-6)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Every `files[].to` in the written lock is child-relative
- [ ] Rollback's `existsSync`/`rmSync` resolve the relative form against the child root
- [ ] `port-module-update/SKILL.md:18,22,43` now describes what the code does
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass (write, re-read, rollback, a lock written at an absolute path still readable)

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T18: `--rollback` preserves the registry and exits non-zero

**What**: A rollback against an unreachable catalog must not blank `PLATFORM_MODULES`, and must report failure.
**Where**: `scripts/platform/lib/commands/add.mjs:63,71-77,81`
**Touches**: `scripts/platform/lib/commands/add.mjs`, `scripts/platform/lib/apply.mjs`, `scripts/platform/lib/exit-codes.mjs`, `scripts/platform/__tests__/rollback.test.mjs`
**Depends on**: T17
**Exclusive**: no
**Reuses**: `EXIT_CODES` (`lib/exit-codes.mjs`)
**Requirement**: TOOL-04 (F-platform-scripts-5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] A catalog read failure no longer degrades to `entries = []`
- [ ] `writeRegistry` never emits `PLATFORM_MODULES = [] as const` when other modules are installed
- [ ] `runRollback` returns a non-OK code on failure
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T19: `--rollback` unwinds a failed `--with-deps`, or refuses

**What**: Either the whole transaction unwinds, or the command refuses on a dirty tree with `git` guidance — never a half-installed child reported as clean.
**Where**: `scripts/platform/lib/commands/add.mjs`
**Touches**: `scripts/platform/lib/commands/add.mjs`, `scripts/platform/lib/apply.mjs`, `scripts/platform/__tests__/rollback.test.mjs`
**Depends on**: T18
**Exclusive**: no
**Reuses**: `TEMPLATE_ONLY_FILES` non-restoration documented at `lib/apply.mjs:13-16` — **deliberate, do not "fix"**
**Requirement**: TOOL-05 (F-runtime-probe-3) — root cause already closed by `90f1d0d`; the structural gap survives

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] A failed multi-module add leaves either a fully unwound tree or an explicit refusal
- [ ] The refusal path names the `git` command that recovers
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 3 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T20: One exit-code convention for `advisory detect`

**What**: Define detect-failed as a distinct state from not-affected, in one place, and stop coalescing every non-1 exit (including `rg`'s 2) to "not affected".
**Where**: `scripts/platform/lib/commands/advisory.mjs:22`
**Touches**: `scripts/platform/lib/commands/advisory.mjs`, `scripts/platform/lib/exit-codes.mjs`, `docs/advisories/README.md`, `docs/advisories/ADV-20260822-04.md`, `scripts/platform/__tests__/advisory-exit-codes.test.mjs`
**Depends on**: T18
**Exclusive**: no
**Reuses**: `EXIT_CODES.ADVISORY_INVALID = 1` — the collision that makes `result.status === 1` ambiguous today
**Requirement**: TOOL-06 (F-platform-scripts-4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `rg` absent, or exiting ≥ 2, yields a detect-failed code — never "não afetado"
- [ ] `ADV-20260822-04`'s `;`-chained detect command runs correctly (quoting/chaining supported)
- [ ] `docs/advisories/README.md:32-33` documents the convention that the code implements
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 6 new tests pass (affected, not-affected, rg-missing, rg-exit-2, chained command, quoted argument)

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T21: `pending-advisories` is silent with nothing to adopt

**What**: Stop printing the adopt line in the template repo and in a fresh child whose lock is legitimately empty.
**Where**: `.claude/hooks/pending-advisories.mjs:36-38`
**Touches**: `.claude/hooks/pending-advisories.mjs`, `scripts/platform/lib/advisories.mjs`, `scripts/platform/__tests__/pending-advisories-hook.test.mjs`, `scripts/platform/__tests__/pending-advisories.test.mjs`, `scripts/platform/__tests__/fixtures/pending-advisories/no-lock/`
**Depends on**: T20
**Exclusive**: no
**Reuses**: `computePending`'s `noLock` at `lib/advisories.mjs:50`; `copier.yml:62` puts the lock under `_skip_if_exists`
**Requirement**: TOOL-08 (F-hooks-robustness-1)

**Tools**: MCP: NONE · Skill: NONE

> **Amended by the orchestrator, wave 2** — the first dispatch stopped here rather than edit a file it
> did not own, which was the correct call. Two pre-existing assertions in
> `scripts/platform/__tests__/pending-advisories.test.mjs` (`:112-121`, `:139-148`) demand the exact
> `no .platform-modules.lock — run platform module adopt` line this task removes, and cite a **closed
> feature's requirement ADV-02**. That reads as a requirement conflict and is not one.
>
> **The discriminator is `.copier-answers.yml`, and it was verified on disk, not assumed:** this
> repository has none (`ls .copier-answers.yml` → No such file) because the template is the *source*
> and never carries one; every copier-generated child does. The `no-lock` fixture holds only `docs/` —
> no lock **and** no `.copier-answers.yml` — so it is indistinguishable from the template repo. It was
> written before that distinction mattered and silently encodes "template" while asserting "child".
>
> **Therefore ADV-02 is preserved, not retired.** A real child — one with `.copier-answers.yml` and no
> lock — must still get the adopt line; ADV-02's intent is intact and this task must not weaken it.
> Silence is keyed on the **absence of `.copier-answers.yml`** (template repo), never on the absence of
> the lock alone. Do not delete the two assertions: give the `no-lock` fixture a `.copier-answers.yml`
> so it asserts the child case ADV-02 actually meant, and add template-repo coverage alongside it.

**Done when**:
- [ ] `noLock` distinguishes *missing* from *present-but-empty*
- [ ] Silence is keyed on the absence of `.copier-answers.yml`, **not** on the absence of the lock
- [ ] The hook is silent in the template repo and in a fresh child; it still speaks when a real module is installed and unadopted
- [ ] **ADV-02 still holds**: a child with `.copier-answers.yml` and no lock still emits the adopt line — the `no-lock` fixture gains a `.copier-answers.yml` and its two assertions survive, amended rather than deleted
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T22: `computePending` consults `catalogRef`

**What**: Add the entry branch beside the existing `templateVersion` branch so an already-installed `2.0.0` child is matched by the ref it was installed from.
**Where**: `scripts/platform/lib/advisories.mjs:48,58-67`
**Touches**: `scripts/platform/lib/advisories.mjs`, `scripts/platform/__tests__/compute-pending-catalogref.test.mjs`
**Depends on**: T21
**Exclusive**: no
**Reuses**: `catalogRef` already written per module at `lib/commands/add.mjs:156-162`, read nowhere outside tests; the `module: kernel` branch as the shape precedent
**Requirement**: CAT-03 (F-catalog-entries-2)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `computePending`'s signature is unchanged
- [ ] A child installed at `2.0.0` from the pre-remediation ref is reported affected by `ADV-20260822-01..05`
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 5 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `fix(platform): match advisories by the catalog ref a module was installed from`

---

### T23: Web app name and locale come from configuration

**What**: `VITE_APP_NAME` / `VITE_LOCALE` drive the browser title, `<html lang>` and `pageTitle()` without editing a platform file.
**Where**: `apps/web/src/app/router/shell.tsx:20-23,28,66`
**Touches**: `apps/web/index.html`, `apps/web/src/app/router/shell.tsx`, `apps/web/src/app/config/zod-locale.ts`, `apps/web/.env.example`, `apps/web/src/app/router/shell.test.tsx`
**Depends on**: None
**Exclusive**: no
**Reuses**: Vite's `%VITE_*%` index-html substitution
**Requirement**: LOC-03, LOC-06 (F-web-kernel-5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `index.html:2,6` use placeholders, not the literals `pt-BR` / `Platform`
- [ ] `APP_NAME` is read from configuration; `pageTitle()` follows
- [ ] **Default preserves today's behaviour**: unset vars render `pt-BR` and the current title
- [ ] Gate passes: `pnpm vitest run --project web apps/web/src/app`
- [ ] Test count: 5 new tests pass (default, overridden name, overridden locale, `lang` attribute, `pageTitle`)

**Tests**: unit · **Gate**: quick

---

### T24: A child serves a real favicon

**What**: Create `apps/web/public/` with a neutral favicon and make nginx serve it instead of the SPA fallback.
**Where**: `apps/web/public/` (new)
**Touches**: `apps/web/public/`, `apps/web/nginx.conf`, `apps/web/index.html`
**Depends on**: T23
**Exclusive**: no
**Reuses**: Vite's `publicDir` default
**Requirement**: LOC-06 (F-web-kernel-5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `apps/web/public/` exists and ships a brand-neutral favicon
- [ ] `nginx.conf:53`'s `try_files` no longer answers `/favicon.ico` with `index.html`
- [ ] Gate passes: build gate

**Tests**: none (asset/config) · **Gate**: build

---

### T25: Web guard seam — installing identity edits no platform file

**What**: Introduce product-owned extension points so `shell.tsx`, `main.tsx` and `app-providers.tsx` need no edit when the identity entry is installed.
**Where**: `apps/web/src/app/router/shell.tsx:41-60`
**Touches**: `apps/web/src/app/router/shell.tsx`, `apps/web/src/main.tsx`, `apps/web/src/app/providers/app-providers.tsx`, `apps/web/src/app/router/shell.test.tsx`, `catalog/identity/single-tenant/README.md`
**Depends on**: T23
**Exclusive**: no
**Reuses**: the existing `beforeLoad` redirect at `:41-42,47-49,52-54`
**Requirement**: SEAM-03 (F-web-kernel-3)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `appLayoutRoute` accepts a product-registered guard; `onUnauthorized` is registered, not inlined at `main.tsx:16-22`
- [ ] `app-providers.tsx` exposes a product provider slot
- [ ] `catalog/identity/single-tenant/README.md:313-347` stops prescribing `app/router/guards.ts` — **that file does not exist** — and names the real seams
- [ ] Gate passes: `pnpm vitest run --project web apps/web/src/app`
- [ ] Test count: 4 new tests pass

**Tests**: unit · **Gate**: quick

---

### T26: Protected routes join without editing `routes.ts`

**What**: Turn the non-exported `PROTECTED_ROUTES` const into a registry a product adds to, so last-location and post-login redirect pick up product routes.
**Where**: `apps/web/src/shared/config/routes.ts:18-21`
**Touches**: `apps/web/src/shared/config/routes.ts`, `apps/web/src/shared/lib/last-location.ts`, `apps/web/src/shared/lib/auth-redirect.ts`, `apps/web/src/shared/config/routes.test.ts`, `apps/web/src/shared/lib/last-location.test.ts`
**Depends on**: T25
**Exclusive**: no
**Reuses**: the two helpers `toSafeProtectedRoute` / `resolveProtectedRouteTemplate` (4 consumers)
**Requirement**: SEAM-04 (F-web-kernel-4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] A product route registered from product code participates in both helpers
- [ ] The stale `ROUTE_ACCESS` comment at `:6-7` is corrected — that symbol exists nowhere
- [ ] Gate passes: `pnpm vitest run --project web apps/web/src/shared`
- [ ] Test count: 5 new tests pass

**Tests**: unit · **Gate**: quick

---

### T27: Route slugs are configuration, not Portuguese literals

**What**: `LOGIN: "/entrar"` and `INICIO: "/inicio"` become locale-driven, defaulting to today's values.
**Where**: `apps/web/src/shared/config/routes.ts:9-11`
**Touches**: `apps/web/src/shared/config/routes.ts`, `apps/web/src/app/router/route-pending.tsx`, `apps/web/src/pages/not-found/ui/not-found-page.tsx`, `apps/web/src/pages/error/ui/error-page.tsx`, `apps/web/src/shared/config/routes.test.ts`
**Depends on**: T26
**Exclusive**: no
**Reuses**: T23's locale seam
**Requirement**: LOC-03, LOC-05 (F-web-kernel-5, F-catalog-entries-7)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Slugs resolve through the locale seam; **the `pt-BR` default yields the current strings byte-for-byte**
- [ ] The three page components read their copy from the same source
- [ ] Gate passes: `pnpm vitest run --project web apps/web/src`
- [ ] Test count: 4 new tests pass, one asserting *no change* at the default

**Tests**: unit · **Gate**: quick

**Commit**: `feat(web): locale-driven route slugs defaulting to today's values`

---

### T28: API messages come from a `DEFAULT_LOCALE`-selected pack

**What**: RFC 7807 titles and Zod messages resolve through a message pack; the pt-BR pack ships and is the default.
**Where**: `apps/api/src/shared/kernel/errors/problem-details.filter.ts:53,63,88`
**Touches**: `apps/api/src/shared/kernel/i18n/`, `apps/api/src/shared/kernel/errors/problem-details.filter.ts`, `apps/api/src/shared/kernel/errors/problem-details.filter.spec.ts`, `apps/api/src/shared/kernel/errors/domain.error.ts`, `apps/api/src/shared/config/env.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: the three existing `"pt-BR"` fallbacks in `apps/api/src/shared/kernel/context/{request-context.middleware.ts:53,event-context.ts:35,job-context.ts:42}`
**Requirement**: LOC-04 (F-agnostic-leaks-2)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `DEFAULT_LOCALE` exists in kernel env, defaulting to `pt-BR`
- [ ] `"Erro de validação"` / `"Erro interno"` come from the pack; `title: exception.title` pass-through survives
- [ ] **A test asserts the shipped default produces the current strings unchanged**
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/shared/kernel/errors`
- [ ] Test count: 6 new tests pass

**Tests**: unit · **Gate**: quick

---

### T29: Product bootstrap seam + `rawBody`

**What**: `NestFactory.create` gains `rawBody: true`, and a product-owned `bootstrap.product.ts` (no-op, `_skip_if_exists`) runs before `listen`.
**Where**: `apps/api/src/main.ts:34,61`
**Touches**: `apps/api/src/main.ts`, `apps/api/src/bootstrap.product.ts`, `apps/api/test/bootstrap-product.e2e-spec.ts`, `docs/dev/template.md`
**Depends on**: T28
**Exclusive**: no
**Reuses**: the existing boot order — `applySecurity:38`, `requestTimeout:49`, `createRequestContextMiddleware:52`, `mountDocs:54-56`
**Requirement**: SEAM-01 (F-extensibility-any-product-6)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `bootstrap.product.ts` ships as a no-op and is listed under `copier.yml` `_skip_if_exists` — **the `copier.yml` line is written by T41**; this task only creates the file and calls it
- [ ] It is invoked after `mountDocs` and before `listen`
- [ ] Gate passes: `pnpm vitest run --config vitest.integration.mts --project api-e2e apps/api/test/bootstrap-product.e2e-spec.ts`
- [ ] Test count: 3 new tests pass

**Tests**: e2e · **Gate**: full

---

### T30: One-shot `setTenant` writer

**What**: A tenancy middleware can write `tenantId` into the request context exactly once; a second call throws.
**Where**: `apps/api/src/shared/kernel/context/request-context.ts:30,57-63`
**Touches**: `apps/api/src/shared/kernel/context/request-context.ts`, `apps/api/src/shared/kernel/context/request-context.spec.ts`, `apps/api/src/shared/kernel/context/request-context.middleware.ts`
**Depends on**: T29
**Exclusive**: no
**Reuses**: `setActor`'s one-shot throw (`"actor já definido no escopo"`) — symmetric by construction
**Requirement**: SEAM-02 (F-extensibility-any-product-1)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `setTenant(tenantId: string): void` exists and throws on a second call in one request scope
- [ ] The middleware still seeds `tenantId: null` (`:49`); the nine existing readers are unaffected
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/shared/kernel/context`
- [ ] Test count: 5 new tests pass (write, read-back, double-call throws, null default, outside-scope behaviour)

**Tests**: unit · **Gate**: quick

---

### T31: Pool 503 spec stops depending on host latency

**What**: Widen only the **timing margin** of the acquire-timeout integration spec.
**Where**: `apps/api/src/shared/infra/database/application-pool.int-spec.ts:303-312,318`
**Touches**: `apps/api/src/shared/infra/database/application-pool.int-spec.ts`
**Depends on**: T30
**Exclusive**: no
**Reuses**: —
**Requirement**: TOOL-12 (F-tests-quality-gates-3) — **half-refuted**

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The `connectionTimeoutMillis: 150` margin no longer makes the assertion host-speed dependent
- [ ] `application-pool.ts:15-19`'s documented 500-not-503 exclusion is **left alone** — the code's own comment says it is deliberate
- [ ] Gate passes: `pnpm vitest run --config vitest.integration.mts --project api-int apps/api/src/shared/infra/database/application-pool.int-spec.ts`
- [ ] Test count: existing tests pass; 0 deletions

**Tests**: integration · **Gate**: full

---

### T32: The ownership table names `main.ts`

**What**: Add the missing row so a reader can tell which files a product may edit.
**Where**: `docs/dev/template.md:8-32`
**Touches**: `docs/dev/template.md`
**Depends on**: T29, T31
**Exclusive**: no
**Reuses**: the existing 14-row table and its rule at `:29-32`
**Requirement**: SEAM-07 (F-web-kernel-3, F-web-kernel-4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `main.ts` appears, marked **platform**-owned, with `bootstrap.product.ts` as the product seam
- [ ] The three web seams from T25/T26 appear with their ownership
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T33: `lintEntryBump` — the bump rule moves into `catalog:lint`

**What**: Move `entryChangedWithoutBump` out of preflight into `lib/lint.mjs` as `lintEntryBump`, aggregate it in `runLint`, and have `release-preflight.mjs` import it back so there is one implementation. A missing baseline is a **loud distinct failure**, never a pass (Fork C = C2).
**Where**: `scripts/platform/lib/lint.mjs`
**Touches**: `scripts/platform/lib/lint.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/release-preflight.mjs`, `scripts/platform/__tests__/entry-bump-lint.test.mjs`
**Depends on**: T1, T2
**Exclusive**: no
**Reuses**: `entryChangedWithoutBump` at `release-preflight.mjs:47-56` (moved verbatim), `moduleVersionAt:32-40`, `previousStableTag:26-30`, `stableTagsFromLsRemote`; `lintKernelRange` as the signature precedent
**Requirement**: CAT-02 (F-catalog-entries-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `lintEntryBump({ repoRoot, exec, entries })` is exported from `lib/lint.mjs` and aggregated by `runLint` — **which lives at `catalog-lint.mjs:111`, not in `lib/lint.mjs`** (§ 0.3)
- [ ] `resolveBaseline` returns `{ tag }` or `{ unavailable: reason }`; unavailable **fails**, with the reason in the message
- [ ] `release-preflight.mjs` imports it instead of declaring its own copy — one implementation, asserted by a test
- [ ] `pnpm catalog:lint` fails on a tree change to an entry with no `module.json` bump
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 7 new tests pass (changed+bumped, changed+unbumped, unchanged, no tags, shallow clone, not-a-repo, preflight parity)

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T34: `lintAdvisoryPathScope` rejects `catalog/`-prefixed detect paths

**What**: An advisory whose `detect` or `parity` path starts with `catalog/` can never match in a child, because `copier.yml:30` excludes that tree.
**Where**: `scripts/platform/lib/lint.mjs`
**Touches**: `scripts/platform/lib/lint.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/__tests__/advisory-path-scope.test.mjs`, `docs/advisories/ADV-20260822-02.md`, `docs/advisories/ADV-20260822-01.md`, `docs/advisories/ADV-20260822-03.md`, `docs/advisories/ADV-20260822-04.md`, `docs/advisories/ADV-20260822-05.md` — the last four **`detect`/`parity` paths only**; `affects` stays T42's (see the note below, and § 0.5)
**Depends on**: T33
**Exclusive**: no
**Reuses**: `lintAdvisoryFrontmatter:129` / `lintAdvisoryModule:139` shape, aggregated by `lintAdvisories` at `catalog-lint.mjs:82`
**Requirement**: CAT-04 (F-catalog-entries-4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] A `detect` beginning `catalog/` is a lint failure naming the child-layout path it should use
- [ ] `ADV-20260822-02:6` is corrected to a child-layout path (its `parity` twin too)
- [ ] Gate passes: `pnpm test:scripts && pnpm catalog:lint`
- [ ] Test count: 4 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

> The other four advisories' `affects` are corrected by **T42** — do not edit them here beyond the `detect`/`parity` path.

---

### T35: CI gives the bump gate a baseline

**What**: `fetch-depth: 0` on the `gates` job so `lintEntryBump` can resolve the previous stable tag.
**Where**: `.github/workflows/ci.yml` — the `gates` job (`catalog.yml` was deleted by `6b99461` and merged here; see § 0.5)
**Touches**: `.github/workflows/ci.yml` — **verify-only**, see § 0.5
**Depends on**: T33
**Exclusive**: no
**Reuses**: the existing `catalog:lint` invocation — unchanged
**Requirement**: CAT-02 (F-catalog-entries-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `actions/checkout` on `gates` uses `fetch-depth: 0`
- [ ] The "baseline unavailable" branch cannot fire in CI
- [ ] Gate passes: build gate

**Tests**: none (workflow) · **Gate**: build

---

### T36: `contract:check` becomes a CI step that survives `module add`

**What**: Regenerate the contract in CI and fail on a non-empty diff. The current detector is a **template-only** spec that `module add` deletes.
**Where**: `.github/workflows/ci.yml`
**Touches**: `.github/workflows/ci.yml`, `package.json`, `docs/arch/back.md`, `scripts/platform/__tests__/contract-check-ci.test.mjs`
**Depends on**: T35
**Exclusive**: no
**Reuses**: root `package.json:12` `contract` script, invoked by no workflow today; `TEMPLATE_ONLY_FILES` at `lib/apply.mjs:19-20` **stays as-is** (the snapshot spec asserts a template fact)
**Requirement**: TOOL-11 (F-tests-quality-gates-2)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `contract:check` = `pnpm contract && git diff --exit-code openapi.json packages/api-client/src`, wired into `ci.yml`
- [ ] A test asserts the step is **not** inside `TEMPLATE_ONLY_FILES` — it must ship to the child
- [ ] The claims at `README.md.jinja:23`, `docs/arch/back.md:78`, `.github/README.md:38` are now true
- [ ] **`format:check` is NOT added to `ci.yml`** (§ 0.2) — a test asserts its absence
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `feat(ci): fail on contract drift with a check the child keeps`

---

### T37: `product_locale` threads the language rule through the docs

**What**: The `.jinja` docs render their language convention from the copier answer.
**Where**: `AGENTS.md.jinja:58,81-82`
**Touches**: `AGENTS.md.jinja`, `docs/agents/issue-tracker.md.jinja`
**Depends on**: None
**Exclusive**: no
**Reuses**: existing `.jinja` placeholder conventions
**Requirement**: LOC-01 (F-agnostic-leaks-2, F-docs-consistency-7, F-agents-skills-3) · BRAND-08 doc-router half (`issue-tracker.md.jinja:52`)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Both `.jinja` docs render the language rule from `product_locale`
- [ ] `issue-tracker.md.jinja:52` no longer points at the nonexistent `../dev/triagem-de-feedback.md`
- [ ] **Default `pt-BR` renders today's text unchanged**
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

> The `copier.yml` question itself is added by **T41**.

---

### T38: One canonical home for the language convention

**What**: The plain `.md` docs cannot be templated, so they reference the single canonical statement instead of repeating it.
**Where**: `docs/code-quality.md:12,48`
**Touches**: `docs/code-quality.md`, `docs/agents/communication.md`, `docs/test/testing.md`, `docs/arch/front.md`, `docs/adr/README.md`, `docs/advisories/README.md`
**Depends on**: T37
**Exclusive**: no
**Reuses**: the `.jinja` statement from T37 as the single source
**Requirement**: LOC-02 (F-docs-consistency-7)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Exactly one document states the convention; the others link to it
- [ ] No plain `.md` hard-codes `pt-BR` as a rule
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

> `docs/arch/front.md`'s false conformance-spec claim (`:141,188`) is TOOL-07's, fixed in **T44** — a later wave, so no race.

---

### T39: One message table per catalog entry

**What**: Each entry reads its subjects, permission labels and error titles from one table, and no entry hard-codes a timezone.
**Where**: `catalog/*/api/**`
**Touches**: `catalog/identity/single-tenant/api/domain/errors.ts`, `catalog/notification/api/application/templates/base-template-sources.ts`, `catalog/notification/api/application/catalog/notification-catalog.ts`, `catalog/notification/api/infrastructure/mailer/templates/layout.hbs`, `catalog/audit/api/application/services/activity-area-resolver.ts`, `catalog/tag/api/domain/errors.ts`, `catalog/attachment/api/domain/errors.ts`
**Depends on**: T38
**Exclusive**: no
**Reuses**: T28's kernel message-pack shape
**Requirement**: LOC-05 (F-catalog-entries-7)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Each of the five entries exposes one message table
- [ ] `base-template-sources.ts:6,9` and `notification-catalog.ts:41,44` no longer pin `America/Sao_Paulo` — they take the kernel's timezone
- [ ] `layout.hbs:2` `lang` follows the locale
- [ ] **Every shipped string is byte-identical at the `pt-BR` default**
- [ ] Gate passes: `pnpm catalog:test -- catalog` (§ 0.8 — **not** `--project api`, which collects 0 files)
- [ ] Test count: 8 new tests pass, at least one per entry, plus a no-change-at-default assertion

**Tests**: unit · **Gate**: quick

> Do **not** touch `catalog/notification/api/infrastructure/mailer/email-theme.ts` — sibling-owned (§ 0.4).

---

### T39a: The two lint errors T39 shipped into the notification entry

**What**: `032dff5` (T39) landed a raw-env locale read and an env save/restore helper that only the **rendered child's** type-aware ESLint can see. Both fail `catalog:check` at exit 7, and they fail it at the child's `pnpm check` — one stage *before* `test:db`, so T39's actual env fix is still unproven.
**Where**: `catalog/notification/api/application/catalog/notification-catalog.ts:56` (`prefer-nullish-coalescing`), `catalog/notification/api/application/catalog/notification-catalog.spec.ts:193` (`no-dynamic-delete`)
**Touches**: `catalog/notification/api/application/catalog/notification-catalog.ts`, `catalog/notification/api/application/catalog/notification-catalog.spec.ts`
**Depends on**: T39
**Exclusive**: no
**Reuses**: the fallback contract already stated in `notification-catalog.ts`'s own comment (“vazio conta como ausente, nunca lança”)
**Requirement**: LOC-05 (F-catalog-entries-7) — aftermath of T39, not new scope

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `notification-catalog.ts:56` satisfies `@typescript-eslint/prefer-nullish-coalescing` **with no behaviour change**: `undefined` *and* `""` both fall back to `"pt-BR"`, exactly as today's `||` does and as the comment directly above it already promises
- [ ] Plain `??` is **rejected** — it lets `DEFAULT_LOCALE=""` reach `Intl.DateTimeFormat`. Mirroring the kernel's strict `z.string().min(1)` (`env.ts:66`) is **also rejected** — throwing contradicts the very purpose of `032dff5`, which is to render without a validated environment. **Owner's call, 2026-08-24**; do not re-litigate
- [ ] `notification-catalog.spec.ts:193` satisfies `@typescript-eslint/no-dynamic-delete` by restructuring the restore helper
- [ ] **No `eslint-disable` in either file** — the rule class is the one thing that catches this defect family
- [ ] T39's AC still holds: every shipped string byte-identical at the `pt-BR` default
- [ ] Gate passes: `pnpm catalog:test -- catalog/notification` (§ 0.8)
- [ ] Test count: 0 new, 0 deletions; the entry's existing tests still pass

**Tests**: unit · **Gate**: quick

> **Why the template's own gates cannot see this.** `catalog/**` is only submitted to type-aware ESLint once an entry is installed into a child and lands under `apps/api/src/**`, inside the tsconfig project. `pnpm check` and `catalog:lint` both pass in the template and are structurally incapable of catching it. This is the **second** instance in two days of “the check exists, but not where the work happens”, and `catalog:check` was again the only gate of the eight to catch it — the standing argument for keeping it in the Build gate despite its ~10 min cost.

---

### T40: Retire the owner's booking vocabulary from the identity entry

**What**: Rename the "Agendamentos"/"Recepção" vocabulary in identity's contract, policy, port and use case, and in the fixture names, without changing behaviour.
**Where**: `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts:44,142,179,196`
**Touches**: `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts`, `catalog/identity/single-tenant/api/application/access-policy.ts`, `catalog/identity/single-tenant/api/domain/ports/user.repository.ts`, `catalog/identity/single-tenant/api/application/use-cases/update-user/update-user.use-case.ts`
**Depends on**: T39
**Exclusive**: no
**Reuses**: the exclusion list from T16 so `preservar`/`reservado` are not swept
**Requirement**: BRAND-03 (F-agnostic-leaks-8 **C**) — story AC 4

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] "motor de agendamento" (2×, `user.repository.ts:138,142`) and the sibling comments are domain-neutral
- [ ] No behaviour change — the contract's shape is untouched
- [ ] Gate passes: `pnpm catalog:test -- catalog/identity` (§ 0.8)
- [ ] Test count: existing entry tests pass; 0 deletions

**Tests**: unit · **Gate**: quick

> These fields are **deleted** by IDENT-01 in `v3.0.0` (T70). The release boundary separates them; that is by construction, not by luck.

---

### T41: `copier.yml` — the single-owner wiring task

**What**: One task owns the file four requirements need to edit: the `product_locale` question, the `_message_after_copy` command list, the `_exclude` entry for the dangling workflow, and the `pnpm install` / `skills:sync` task gating. Also deletes the workflow itself.
**Where**: `copier.yml`
**Touches**: `copier.yml`, `.github/workflows/feedback-triage.yml`, `scripts/platform/__tests__/copier-questions.test.mjs`
**Depends on**: T8, T9, T23, T29
**Exclusive**: no
**Reuses**: `_exclude` already names `catalog.yml:35` and `release.yml:39`; questions end at `app_domain` (`:120`)
**Requirement**: LOC-01 · RUN-03 · TOOL-10 · TOOL-13 (F-copier-mechanics-4) · BRAND-08 (F-ci-docker-infra-5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `product_locale` exists with **default `pt-BR`**; a child whose `.copier-answers.yml` lacks the key gets that default on `copier update`
- [ ] `_message_after_copy` names only commands that exist, and states the support matrix
- [ ] `.github/workflows/feedback-triage.yml` is deleted (or `_exclude`d) — a child no longer receives a workflow curling `/v1/internal/feedback-triage/` for a module that is not in `catalog/`
- [ ] `pnpm install` / `skills:sync` run **at most once**, and only in a real project (`:74,78,80` — not merely `not _copier_conf.pretend`)
- [ ] `bootstrap.product.ts` is listed under `_skip_if_exists`
- [ ] Gate passes: `pnpm test:scripts && pnpm template:smoke`
- [ ] Test count: 7 new tests pass (locale default, locale override, pretend, `copy` vs `update`, command existence, `_exclude` membership, skip-if-exists)

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `feat(copier): product_locale, honest first-run message, no dangling workflow`

---

### T42: Bump all five entries and correct the advisory `affects`

**What**: Restore an unambiguous address: every entry touched by `security-audit-remediation` gets a new version, and the five advisories name the population that is actually vulnerable.
**Where**: `catalog/*/module.json`
**Touches**: `catalog/identity/single-tenant/module.json`, `catalog/attachment/module.json`, `catalog/audit/module.json`, `catalog/notification/module.json`, `catalog/tag/module.json`, `catalog/identity/single-tenant/CHANGELOG.md`, `catalog/attachment/CHANGELOG.md`, `catalog/audit/CHANGELOG.md`, `catalog/notification/CHANGELOG.md`, `catalog/tag/CHANGELOG.md`, `docs/advisories/ADV-20260822-01.md`, `docs/advisories/ADV-20260822-02.md`, `docs/advisories/ADV-20260822-03.md`, `docs/advisories/ADV-20260822-05.md`
**Depends on**: T33, T34
**Exclusive**: **yes** — own wave
**Reuses**: `lintEntryBump` from T33 as the proof this cannot regress
**Requirement**: CAT-01 (F-catalog-entries-1 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] All five `version` fields leave `2.0.0` — the version that today designates two different codebases across `v2.0.0` and `v2.1.0` (**183 files** differ under `catalog/` between those tags)
- [ ] Each entry's `CHANGELOG.md` records the bump and why
- [ ] All five `ADV-20260822-0*` `affects` ranges stop being `>=1.0.0 <2.0.0` — the range that excludes exactly the vulnerable children — and name the ambiguous `2.0.0` population
- [ ] `pnpm catalog:lint` is green, including T33's new rule
- [ ] Gate passes: `pnpm catalog:lint && pnpm test:scripts`
- [ ] Test count: existing tests pass; T33's 7 tests still green

**Tests**: none (manifests) · **Gate**: build (full-unit)

**Commit**: `fix(catalog): one immutable codebase per entry version`

> `ADV-20260822-04` is edited by **T20** (chained detect command) and `-02` by **T34** (path scope). Both are earlier waves, so there is no race — but re-read them before writing.

---

### T43: Make the harness P0 taxonomy domain-neutral

**What**: The model-tier and Verifier-sensor rules name booking/availability domain categories. Replace them with generic categories that point at the product's own domain doc.
**Where**: `.claude/hooks/subagent-model-required.mjs:42`
**Touches**: `.agents/skills/tlc-spec-driven/SKILL.md`, `.agents/skills/tlc-spec-driven/references/validate.md`, `.agents/skills/tlc-spec-driven/references/sub-agents.md`, `.agents/skills/tlc-spec-driven/references/cards/orchestrator.md`, `.agents/skills/repo-discovery/SKILL.md`, `.claude/agents/spec-verifier.md`, `.claude/hooks/subagent-model-required.mjs`, `docs/agents/harness.md`, `scripts/platform/__tests__/harness-taxonomy.test.mjs`, `scripts/platform/__tests__/docs-no-owner-infra.test.mjs`
**Depends on**: T16, T41
**Exclusive**: **yes** — own wave, and **last**
**Reuses**: the generic-category wording established by T16
**Requirement**: **BRAND-04** (F-agents-skills-4) — story AC 5. `design.md` § *Execute notes* calls this "BRAND-05"; see § 0.1.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] All 8 sites name generic categories (auth, payment, data integrity, …) and defer the domain list to the product's own doc — `SKILL.md:80,115`, `validate.md:114`, `sub-agents.md:59,73`, `cards/orchestrator.md:90`, `spec-verifier.md:3`, `subagent-model-required.mjs:42`, `harness.md:129`
- [ ] `SKILL.md:80`'s example slug `guest-agenda-full-load` and `repo-discovery/SKILL.md:37`'s "motor de agenda" are neutral
- [ ] **Only `.agents/skills/**` paths are edited** — `.claude/skills/tlc-spec-driven` is a symlink to it (§ 0.3); editing both would own one file twice
- [ ] The pre-edit taxonomy is quoted in the commit body, so the Verifier is judged against the contract in force at dispatch
- [ ] The `SPEC_DEVIATION` exclusion of `docs/agents/harness.md` at `scripts/platform/__tests__/docs-no-owner-infra.test.mjs:10-14` — left by T16 in wave 1 because this file was forbidden to C3 — is **removed**, so T16's guard covers the literal `docs/agents/**` its AC names. Without this, BRAND-04 ships a fix its own guard cannot see (Execution Log, wave 1, deviation 2)
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 3 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `feat(harness): generic P0 taxonomy pointing at the product's domain doc`

> **This task changes the rules this workflow runs under.** It is alone in its wave for that reason. `docs/agents/harness.md` is also sibling-owned (§ 0.4).

---

### T44: Hooks and handbooks name only files that ship

**What**: Sweep all 20 files under `.claude/hooks/` (they all ship — `copier.yml` `_exclude:40,43` excludes only `.claude/skills` and `.claude/settings.local.json`) so no hook or doc names a file, helper or conformance spec that does not exist.
**Where**: `.claude/hooks/contract-enum.mjs:104-113`
**Touches**: `.claude/hooks/contract-enum.mjs`, `.claude/hooks/edit-reminders.mjs`, `docs/arch/front.md`, `scripts/platform/__tests__/hook-references.test.mjs`
**Depends on**: T43
**Exclusive**: no
**Reuses**: the manifest-vs-doc scan shape from T8
**Requirement**: TOOL-07 (F-agents-skills-6, F-agents-skills-5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `contract-enum.mjs:104-113` stops naming `shared/lib/select-options.ts` / `enumOptions` / a `contract-enums` spec that does not exist
- [ ] `docs/arch/front.md:141,188` stops claiming that spec gates pre-push and CI
- [ ] `edit-reminders.mjs:12` stops mandating `@workspace/ui`, design tokens and Lucide on the authority of a doc that mentions none
- [ ] A committed test walks **all 20** hooks and fails on any referenced path that is absent
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 5 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T45: Widen the module-boundary guard's scan

**What**: `KERNEL_SURFACE` covers five roots today, which is why the leaks were never caught. Add the four missing ones and purge catalog vocabulary from the kernel test harness.
**Where**: `apps/api/src/modules/module-boundaries.spec.ts:539-545`
**Touches**: `apps/api/src/modules/module-boundaries.spec.ts`, `apps/api/test/setup/test-db.ts`, `apps/api/test/setup/unit-env.ts`, `apps/api/test/setup/e2e-env.ts`
**Depends on**: T44
**Exclusive**: no
**Reuses**: the existing `KERNEL_SURFACE` list and RULE C machinery
**Requirement**: BRAND-07 (F-tests-quality-gates-4) — story AC 8

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `KERNEL_SURFACE` also covers `apps/api/test`, `apps/api/src/openapi`, `apps/api/src/docs`, `apps/web/src/pages`
- [ ] The kernel test harness holds kernel vocabulary only; `test-db.ts:98-108` no longer hard-codes catalog schemas
- [ ] `test-db.ts:105` (`identity.professional_default_hours`) is **widened here, not deleted** — IDENT-01 deletes it in `v3.0.0` (T72)
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/modules`
- [ ] Test count: 4 new tests pass

**Tests**: unit · **Gate**: quick

---

### T46: The brand-hygiene gate

**What**: A committed spec that greps the rendered child for the owner's brand and infrastructure nouns and fails on any hit. This is the invariant that keeps the whole BRAND cluster from returning.
**Where**: `scripts/platform/__tests__/brand-hygiene.test.mjs` (new)
**Touches**: `scripts/platform/__tests__/brand-hygiene.test.mjs`
**Depends on**: T45
**Exclusive**: no
**Reuses**: T16's exclusion list; the `template:smoke` render harness
**Requirement**: BRAND-03…08 (the `v2.4.0` half of story AC 1–9)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Detection keys on `rit_` / `rit-` / `__Host-rit` — **never on the company name**, which appears nowhere outside `.specs/` and `docs/platform_template/`
- [ ] The exclusion list ships **with** the gate: `preservar` / `preservad-`, `reservado`, `state-preservation` — ~110 of 241 raw `reserva` hits, so the gate does not cry wolf on its first run and get disabled
- [ ] A self-test asserts each excluded term does **not** trip the gate
- [ ] Scope at this release is docs/harness/workflow; **T55 extends it** to cookies and timezone once `v3.0.0` renames them
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 8 new tests pass (one per excluded term, one per positive brand token, one end-to-end over a rendered child)

**Tests**: unit (`node:test`) · **Gate**: quick

**Commit**: `feat(gates): fail CI on any owner brand or infrastructure noun in a child`

---

### T47: State the dead follow-up debt where it is owned

**What**: Issues #2–#8 return **410 deleted**; docs still send readers to them. State the debt inline or close it — do not re-link.
**Where**: `catalog/identity/single-tenant/README.md:409-412`
**Touches**: `catalog/identity/single-tenant/README.md`, `.specs/features/done/v0-2-product-slots/coverage-sweep.md`
**Depends on**: T46
**Exclusive**: no
**Reuses**: `gh issue list --state all` → only #1, #9, #10, #11, #12 survive; all five `module.json` carry `"absorbs": []`
**Requirement**: BRAND-03 (F-known-debt-1)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `README.md:409-412`'s "seguem abertos" claim is gone
- [ ] `coverage-sweep.md:9-10,60-69` no longer links the deleted issues
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T48: Changelog section for `v2.4.0` — **OWNER-GATED**

**What**: Author `## v2.4.0` with `### Child migration steps` = the literal `None — copier update is enough.`
**Where**: `docs/dev/template-changelog.md`
**Touches**: `docs/dev/template-changelog.md`
**Depends on**: T42, T43, T47
**Exclusive**: no
**Reuses**: the v2.2.0 section's shape; `lintChildMigrationSteps` at preflight
**Requirement**: area H (release machinery) — `design.md:243-249`

**Tools**: MCP: NONE · Skill: NONE

**BLOCKED**: do not start until `git tag -l v2.3.0` is non-empty.

**Done when**:
- [ ] `git tag -l v2.3.0` returned non-empty **before** the first edit
- [ ] The existing `## v2.3.0` section (`:7`, `:27-29`) is **untouched** — a parallel session owns it, and its literal `None — copier update is enough.` must survive
- [ ] `## v2.4.0` is the latest section, so `release-preflight` keys on it (AD-034)
- [ ] Its own `### Child migration steps` is the literal `None — copier update is enough.` — AD-034 forbids a manual step on a non-major, and every task in waves 1–7 was authored to honour that
- [ ] The agent **does not tag and does not push** (AD-006/AD-034)
- [ ] Gate passes: `pnpm catalog:lint`

**Tests**: none · **Gate**: build

**Commit**: `docs(changelog): v2.4.0`

---

## Task Breakdown — `v3.0.0`

Every task below genuinely forces a child decision, which is what makes it a major (AD-031/AD-034).
Each ships its half of the idempotent `scripts/platform/migrations/v3.0.0.mjs` (T73).

### T49: Neutral cookie and storage-key defaults — kernel and web

**What**: `__Host-app_session`, `app_csrf`, `app-last-location`, `app-auth-logout` replace the brand-prefixed literals everywhere the kernel and web own them.
**Where**: `apps/api/src/openapi/openapi-config.ts:26,29,48,51,53,101`
**Touches**: `apps/api/src/openapi/openapi-config.ts`, `apps/api/src/openapi/openapi-config.spec.ts`, `apps/web/src/app/config/api-client.ts`, `apps/web/src/shared/lib/last-location.ts`, `apps/web/src/shared/store/auth.store.ts`, `apps/api/test/setup/unit-env.ts`, `apps/api/test/setup/e2e-env.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: the `COOKIE_NAME` / `DEVICE_COOKIE_NAME` env seam — two of three cookies already have it
**Requirement**: BRAND-01 (F-agnostic-leaks-3 **C**) — story AC 1

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] No `rit_` / `rit-` / `__Host-rit` literal survives in `apps/**` or `packages/**`
- [ ] `last-location.ts:5` and `auth.store.ts:5` use `app-*`
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/openapi` and `pnpm vitest run --project web apps/web/src`
- [ ] Test count: 6 new/updated tests pass

**Tests**: unit · **Gate**: quick

---

### T50: Neutral cookie defaults in the identity entry

**What**: The entry's shipped defaults follow, and `CSRF_COOKIE_NAME` stops being a bare module constant.
**Where**: `catalog/identity/single-tenant/api/identity.config.ts:20,23`
**Touches**: `catalog/identity/single-tenant/api/identity.config.ts`, `catalog/identity/single-tenant/api/api/guards/cookie.ts`
**Depends on**: T49
**Exclusive**: no
**Reuses**: `identity.config.ts:20,23`'s existing env seam as the precedent for the third cookie
**Requirement**: BRAND-01, BRAND-02 (F-extensibility-any-product-4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `identity.config.ts` defaults are `__Host-app_session` / `__Host-app_device`
- [ ] `cookie.ts:78`'s `CSRF_COOKIE_NAME` reads from config, defaulting to `app_csrf`
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity`
- [ ] Test count: 5 new tests pass

**Tests**: unit · **Gate**: quick

---

### T51: `configureClient` accepts `csrfCookieName`

**What**: `ConfigureClientOptions` gains the option so a product that renames its CSRF cookie keeps the double-submit working. This is the **only new mechanism** in the brand cluster.
**Where**: `packages/api-client/src/client.ts:109-114`
**Touches**: `packages/api-client/src/client.ts`, `apps/web/src/app/config/api-client.ts`
**Depends on**: T50
**Exclusive**: no
**Reuses**: today's hard-coded regex at `client.ts:65`
**Requirement**: BRAND-02 (F-extensibility-any-product-4) — story AC 2

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `csrfCookieName?: string` exists beside `baseURL` and `onUnauthorized`, defaulting to `app_csrf`
- [ ] The cookie read is built from the option, not a literal regex
- [ ] The dangling "ADR 0015" citations (`client.ts:62,70`, `openapi-config.ts:103`) are corrected — `docs/adr/` holds only `README.md`
- [ ] Gate passes: `pnpm vitest run --project web apps/web/src/app`
- [ ] Test count: 4 new tests pass (default, override, missing cookie, rename round-trip)

**Tests**: unit · **Gate**: quick

---

### T52: `COOKIE_SAMESITE=none` fails closed on a host mismatch

**What**: Refuse the configuration at boot when the API host differs from `WEB_ORIGIN`'s host, unless the token travels a channel the SPA can read.
**Where**: `catalog/identity/single-tenant/api/identity.config.ts:22,98-102`
**Touches**: `catalog/identity/single-tenant/api/identity.config.ts`
**Depends on**: T51
**Exclusive**: no
**Reuses**: the existing refine at `:98-102`, which checks `CSRF_SECRET` but never compares hosts; `setCsrfCookie` at `api/guards/cookie.ts:90-95` sets no `domain` (host-only)
**Requirement**: SEAM-06 (F-web-kernel-2)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `SAMESITE=none` + cross-host is refused at boot with an actionable message
- [ ] `WEB_ORIGIN`'s double declaration (`apps/api/src/shared/config/env.ts:68` and `identity.config.ts:19`) is reconciled to one source
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity`
- [ ] Test count: 5 new tests pass

**Tests**: unit · **Gate**: quick

---

### T53: `APP_TIMEZONE` — validated, IANA, default `UTC`

**What**: Replace the owner-named São Paulo constant with configuration, validated against a closed IANA set **before** it reaches `sql.raw`.
**Where**: `apps/api/src/shared/kernel/clock/bucket-sql.ts:11,25`
**Touches**: `apps/api/src/shared/kernel/clock/bucket-sql.ts`, `apps/api/src/shared/kernel/clock/bucket-sql.spec.ts`, `apps/api/src/shared/config/env.ts`, `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-usage-stats.reader.ts`, `catalog/audit/api/infrastructure/repositories/drizzle-activity-stats.reader.ts`
**Depends on**: T52
**Exclusive**: no
**Reuses**: the per-job `timeZone` field at `maintenance-job.decorator.ts:19` / `maintenance-registry.ts:10` — a config-driven precedent already in the kernel, **not** a leak; `bucket-sql.ts:8-10`'s comment documents the injection-safety property to preserve
**Requirement**: TZ-01 (F-api-kernel-5 **C**) — story AC 3

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `CLINIC_TZ` is gone; the value comes from `APP_TIMEZONE`, default `UTC`
- [ ] An unknown or non-IANA value **fails boot** with a validation error; the closed-map property that keeps `sql.raw` safe survives
- [ ] Absent value falls back to `UTC` and logs the fallback **once** at boot
- [ ] Both catalog readers follow
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/shared/kernel/clock`
- [ ] Test count: 7 new tests pass (default, valid IANA, unknown throws, injection attempt throws, fallback logged once, both readers)

**Tests**: unit · **Gate**: quick

**Commit**: `feat(kernel)!: APP_TIMEZONE replaces the hard-coded clinic timezone`

---

### T54: `STORAGE_*` and a null adapter

**What**: Provider-neutral env keys with an explicit `STORAGE_REGION`, and boot that succeeds unconfigured — the **first call** throws.
**Where**: `apps/api/src/shared/infra/storage/storage.module.ts:10`
**Touches**: `apps/api/src/shared/infra/storage/storage.config.ts`, `apps/api/src/shared/infra/storage/storage.module.ts`, `apps/api/src/shared/infra/storage/s3-storage.adapter.ts`, `apps/api/src/shared/infra/storage/null-storage.adapter.ts`, `apps/api/src/shared/infra/storage/null-storage.adapter.spec.ts`, `apps/api/src/app.module.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `storage-unavailable.error.ts` — **already exists**, waiting for this adapter; `null-professional-adapters.ts` as the null-object shape (**read it before T69 deletes it**)
**Requirement**: SEAM-05 (F-api-kernel-6)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `R2_*` becomes `STORAGE_*` with an explicit `STORAGE_REGION`; `region: "auto"` (`r2-storage.adapter.ts:36`) is gone — it is R2-specific and breaks genuine S3
- [ ] A kernel-only product boots with storage unconfigured; the first storage call throws `StorageUnavailable`
- [ ] `app.module.ts:27` no longer imports `StorageModule` in a way that demands credentials
- [ ] `PROFILE_IMAGE_STORE` (`profile-image-store.port.ts:25`, AD-024) is **untouched** — a different, entry-to-entry port
- [ ] Gate passes: `pnpm vitest run --project api apps/api/src/shared/infra/storage`
- [ ] Test count: 6 new tests pass

**Tests**: unit · **Gate**: quick

---

### T55: Extend the hygiene gate to cookies and timezone

**What**: Now that `v3.0.0` renames them, the gate from T46 also fails on a brand cookie prefix or a hard-coded owner timezone.
**Where**: `scripts/platform/__tests__/brand-hygiene.test.mjs`
**Touches**: `scripts/platform/__tests__/brand-hygiene.test.mjs`
**Depends on**: T54
**Exclusive**: no
**Reuses**: T46's exclusion list and harness — extended, not rewritten
**Requirement**: BRAND-01, BRAND-02, TZ-01 (story AC 1–3)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `__Host-rit`, `rit_`, `rit-` and `America/Sao_Paulo` all fail the gate on a rendered child
- [ ] The exclusion self-tests from T46 still pass
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 4 new tests pass on top of T46's 8

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T56: Env matrix and `.env.example` for the major's new keys

**What**: One owner for `apps/api/.env.example` in this release: `STORAGE_*`, `APP_TIMEZONE`, and the cookie-name escape hatches.
**Where**: `apps/api/.env.example`
**Touches**: `apps/api/.env.example`, `docs/dev/local-environment.md`
**Depends on**: T55
**Exclusive**: no
**Reuses**: T12's env matrix section
**Requirement**: SEAM-05, TZ-01, BRAND-01 (documentation half)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Every new key is documented with its default and its migration note
- [ ] No `R2_*` key remains
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T57: Contract regeneration after the cookie rename — **EXCLUSIVE**

**What**: Regenerate `openapi.json` and the generated client so the committed contract matches the renamed cookies.
**Where**: `openapi.json`
**Touches**: `openapi.json`, `packages/api-client/src/`
**Depends on**: T49, T50, T51, T52, T53
**Exclusive**: yes
**Reuses**: `pnpm contract` (root `package.json:12`)
**Requirement**: BRAND-01 (F-agnostic-leaks-3 **C**) — story AC 1, contract half

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `pnpm contract` run; `openapi.json:37,48,49` carry the neutral names
- [ ] `git diff --exit-code openapi.json packages/api-client/src` is empty afterwards (T36's CI step is green)
- [ ] The commit contains **only** regenerated artefacts — no hand edits
- [ ] Gate passes: `pnpm check && pnpm test`

**Tests**: none (generated) · **Gate**: build (full-unit)

**Commit**: `chore(contract): regenerate after the neutral cookie rename`

---

### T58: `catalog/professional/` skeleton

**What**: Create the new entry from the `catalog/tag/` skeleton (**48 files on disk**, not the 43 the ledger recorded): `module.json`, `README.md`, `CHANGELOG.md`, the module file.
**Where**: `catalog/professional/module.json`
**Touches**: `catalog/professional/`
**Depends on**: T57
**Exclusive**: no
**Reuses**: `catalog/tag/` — the canonical minimal entry: no `web/`, no `api/testing/`, no `api/seeds/`
**Requirement**: IDENT-01, IDENT-02 (F-catalog-entries-6 **C**) · AD-035

**Tools**: MCP: NONE · Skill: `catalog-modules`

**Done when**:
- [ ] `module.json` carries `name`, `version`, `description`, `kernelRange`, `dependsOn: ["identity"]`, `apiModule`, `schemaExports`, `customMigrations`, `env: []`, `absorbs: []`
- [ ] **No kernel port is introduced** — the aggregate cut removes the cycle, so `dependsOn` alone carries the edge (AD-025); nothing is promoted to `shared/kernel/**` (AD-021/AD-024, RULE C)
- [ ] It is a **new entry**, not a variant (AD-013)
- [ ] Gate passes: `pnpm catalog:lint`

**Tests**: none (manifest) · **Gate**: build

---

### T59: `professional_profile` and the five satellite tables

**What**: The new table that replaces two `users` columns, plus the five satellites moved verbatim.
**Where**: `catalog/professional/api/infrastructure/tables/professional-profile.table.ts`
**Touches**: `catalog/professional/`
**Depends on**: T58
**Exclusive**: no
**Reuses**: the five table files under `catalog/identity/single-tenant/api/infrastructure/tables/` — `user-professional-area`, `user-professional-service`, `user-scheduling-area`, `user-professional-schedule-config`, `professional-default-hours`
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `professional_profile` has `userId` PK + FK to `identity.users.id` `ON DELETE CASCADE`, `servesClients`, `birthDate`, `createdAt`, `updatedAt`
- [ ] The five satellites keep their columns unchanged; `areaId`/`serviceId` stay `text` with no FK (**inherited debt, declared in T63 — not silently dropped**)
- [ ] All six appear in the entry's `schemaExports`
- [ ] Migrations are generated **in the child** by `module add` (AD-015); the template ships TS tables plus `migrations/custom/*.sql`
- [ ] Gate passes: `pnpm catalog:lint && pnpm catalog:typecheck`

**Tests**: none (schema) · **Gate**: build

---

### T60: Domain — entity and ports

**What**: The new entry's own aggregate and ports, taking the fields that leave `User`.
**Where**: `catalog/professional/api/domain/`
**Touches**: `catalog/professional/`
**Depends on**: T59
**Exclusive**: no
**Reuses**: `professional-assignment.repository.ts`, `professional-commitments.port.ts`, `professional-scope.port.ts` from the identity entry
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `servesClients` and `birthDate` live on the new aggregate, with `assertValidBirthDate()` moved
- [ ] The three ports are entry-local (AD-014)
- [ ] Gate passes: `pnpm vitest run --project api catalog/professional`
- [ ] Test count: 6 new tests pass, 1:1 with IDENT-01's ACs

**Tests**: unit · **Gate**: quick

---

### T61: Repositories and query helpers

**What**: The drizzle implementations and their integration specs.
**Where**: `catalog/professional/api/infrastructure/repositories/`
**Touches**: `catalog/professional/`
**Depends on**: T60
**Exclusive**: no
**Reuses**: `drizzle-professional-assignment.repository.ts` and its `int-spec`, `professional-query.helpers.ts`, `professional-directory.facade.int-spec.ts`
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Every port from T60 has an implementation under `infrastructure/repositories/`; no SQL runs from `application/` or `api/`
- [ ] Integration specs use testcontainers, never a DB mock
- [ ] Gate passes: `pnpm vitest run --config vitest.integration.mts --project api-int catalog/professional`
- [ ] Test count: 5 new integration tests pass

**Tests**: integration · **Gate**: full

---

### T62: Facades, application and the api module

**What**: The entry's read surface and its Nest module.
**Where**: `catalog/professional/api/professional.module.ts`
**Touches**: `catalog/professional/`
**Depends on**: T61
**Exclusive**: no
**Reuses**: `professional-assignment.facade.ts`, `professional-directory.facade.ts` and its `spec`, `professional-tables.facade.ts` (which already documents itself as ready for this extraction), `professional-schedule-rows.ts`, `professional-assignment.module.ts`
**Requirement**: IDENT-01, IDENT-02 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Every cross-module read goes through a facade in the owning module
- [ ] The entry registers cleanly with `dependsOn: ["identity"]` and imports no other entry
- [ ] Gate passes: `pnpm vitest run --project api catalog/professional`
- [ ] Test count: 5 new tests pass

**Tests**: unit · **Gate**: quick

---

### T63: `attach_audit()` for the new entry and the declared debt

**What**: The entry ships its own `<schema>.attach_audit()` under the same `pg_proc` guard (AD-032), and its README records the two dangling references it inherits.
**Where**: `catalog/professional/migrations/custom/01_audit_attach_professional.sql`
**Touches**: `catalog/professional/`
**Depends on**: T62
**Exclusive**: no
**Reuses**: identity's `04_audit_attach_hook.sql` — 14 tables today, 7 core plus 7 professional; `catalog/tag/migrations/custom/01_audit_attach_tags.sql` as the per-entry shape
**Requirement**: IDENT-01, IDENT-03 (F-catalog-entries-6 **C**) · AD-032

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The new entry `PERFORM`s its own `attach_audit()` for its seven tables under the `pg_proc` guard
- [ ] The README declares, as inherited debt: `professional-assignment.module.ts` documents itself against a `ServiceModule`/`service` entry **that ships nowhere**, and `areaId`/`serviceId` are `text` with no FK pointing at `service.areas` / `service.services`
- [ ] Neither is silently dropped, and neither is presented as new
- [ ] Gate passes: `pnpm catalog:lint`

**Tests**: none (SQL/docs) · **Gate**: build

**Commit**: `feat(catalog)!: extract the professional slice into its own entry`

---

### T64: The `audit` entry stops registering identity's professional tables

**What**: `audit` names all seven professional tables; shipping the split with only an identity advisory would leave audit children silently broken.
**Where**: `catalog/audit/api/domain/base-audit-registrations.ts:24,30,36,42,48,54,60`
**Touches**: `catalog/audit/api/domain/base-audit-registrations.ts`, `catalog/audit/api/domain/audit-coverage.ts`, `catalog/audit/api/testing/reattach-identity-tables.ts`, `catalog/audit/api/__e2e__/audit.e2e-spec.ts`
**Depends on**: T57
**Exclusive**: no
**Reuses**: `audit-coverage.ts:23-29`, `reattach-identity-tables.ts:28-34`, `audit.e2e-spec.ts:178-184`
**Requirement**: IDENT-03 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] All seven professional registrations are gone from the audit entry
- [ ] `audit-coverage` still passes for the tables audit legitimately owns
- [ ] Gate passes: `pnpm vitest run --project api catalog/audit`
- [ ] Test count: existing tests pass; 4 updated

**Tests**: unit · **Gate**: quick

---

### T65: `breaking` advisory for `identity`

**What**: An advisory telling identity children what the split requires of them.
**Where**: `docs/advisories/ADV-20260824-01.md`
**Touches**: `docs/advisories/ADV-20260824-01.md`
**Depends on**: T64
**Exclusive**: no
**Reuses**: `ADV-20260823-01`'s kernel-advisory shape; `lintAdvisoryPathScope` from T34 constrains the `detect` path
**Requirement**: IDENT-03 (F-catalog-entries-6 **C**) · AD-031

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `module: identity/single-tenant`, severity `breaking`, `affects` naming the pre-split versions
- [ ] `detect`/`parity` paths are **child-layout**, never `catalog/`-prefixed (T34's rule)
- [ ] The `ALTER TYPE` story for dropping the `professional` enum literal is stated
- [ ] Gate passes: `pnpm catalog:lint`

**Tests**: none · **Gate**: build

---

### T66: `breaking` advisory for `audit`

**What**: IDENT-03's "advisory per affected entry" is **identity and audit**, minimum.
**Where**: `docs/advisories/ADV-20260824-02.md`
**Touches**: `docs/advisories/ADV-20260824-02.md`
**Depends on**: T65
**Exclusive**: no
**Reuses**: T65's shape
**Requirement**: IDENT-03 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `module: audit`, severity `breaking`, `affects` naming the pre-split versions
- [ ] It states that an audit child must drop the seven professional registrations
- [ ] Gate passes: `pnpm catalog:lint`

**Tests**: none · **Gate**: build

---

### T67: Cut `servesClients` and `birthDate` out of the `User` aggregate

**What**: The decisive edit — the fields move **out** of `User`, so identity stops calling into the slice and the identity/professional cycle never forms.
**Where**: `catalog/identity/single-tenant/api/domain/entities/user.entity.ts`
**Touches**: `catalog/identity/single-tenant/api/domain/entities/user.entity.ts`, `catalog/identity/single-tenant/api/application/use-cases/create-user/`, `catalog/identity/single-tenant/api/application/use-cases/update-user/update-user.use-case.ts`
**Depends on**: T63, T66
**Exclusive**: no
**Reuses**: the ledger's site list — `:13,29,40,77,86,99,110,119,137,145,150,213,220,229-236,325-329`, including `activate()`, `updateOwnProfile()`, `assertValidBirthDate()`
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Neither field remains on `User`
- [ ] `create-user.use-case.ts:23,83,88-90` and `update-user.use-case.ts:16,20,86-87,99,105-135` no longer set them inline
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity`
- [ ] Test count: existing entry tests pass; 8 updated

**Tests**: unit · **Gate**: quick

---

### T68: Remove the professional writers from `UserRepository`

**What**: The core port and its drizzle implementation lose `replaceProfessionalAreas` / `-Services` / `-SchedulingAreas`.
**Where**: `catalog/identity/single-tenant/api/domain/ports/user.repository.ts:16-19,103-111,152,159`
**Touches**: `catalog/identity/single-tenant/api/domain/ports/user.repository.ts`, `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-user.repository.ts`
**Depends on**: T67
**Exclusive**: no
**Reuses**: T61's new repository as the new home
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] The core port declares no professional writer
- [ ] `drizzle-user.repository.profile-extension.int-spec.ts` and `.scope.int-spec.ts` are updated or removed with their subject
- [ ] Gate passes: `pnpm vitest run --config vitest.integration.mts --project api-int catalog/identity`
- [ ] Test count: existing tests pass; 4 updated

**Tests**: integration · **Gate**: full

---

### T69: Delete the slot — it exists only to let identity call the slice

**What**: `IdentityProfessionalSlot`, `forRoot({ professional })`, `PROFESSIONAL_SCOPE`, `PROFESSIONAL_COMMITMENTS` and the null adapters are **deleted, not moved**.
**Where**: `catalog/identity/single-tenant/api/identity.module.ts:62-63,78-79,89-90,209-236`
**Touches**: `catalog/identity/single-tenant/api/identity.module.ts`, `catalog/identity/single-tenant/api/infrastructure/professional/`
**Depends on**: T68
**Exclusive**: no
**Reuses**: nothing — but **read `null-professional-adapters.ts` before deleting**: T54 copied its null-object shape
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**) · AD-035

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] All four symbols and `infrastructure/professional/` are gone
- [ ] `module-boundaries.spec.ts` RULE C passes: identity imports no catalog entry
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity apps/api/src/modules`
- [ ] Test count: existing tests pass; 0 silent deletions

**Tests**: unit · **Gate**: quick

---

### T70: Drop the three professional fields from the identity contract

**What**: `areaIds` / `serviceIds` / `schedulingAreaIds` leave five schemas. Because **no professional-named `operationId` exists**, this breaks `createUser` / `updateUser` / `listUsers` themselves — not a route group.
**Where**: `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts:140-143`
**Touches**: `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts`
**Depends on**: T69
**Exclusive**: no
**Reuses**: `createUserSchema:169-181`, `updateUserSchema:187-198`, `userListItemSchema:131-150`, `setPasswordSchema:204-211`, `updateMyProfileSchema:216-221`
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**) — AC 1

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] None of the five schemas carries the three fields
- [ ] The HTTP contract of the identity entry names nothing professional
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity`
- [ ] Test count: existing tests pass; parity specs go red **by design** and are re-snapshotted in T76

**Tests**: unit · **Gate**: quick

---

### T71: Drop the `professional` access-profile literal

**What**: Remove the profile from the code-derived enum, and with it the product-specific seed derivation.
**Where**: `catalog/identity/single-tenant/api/domain/access/access-profile.types.ts:16-21`
**Touches**: `catalog/identity/single-tenant/api/domain/access/access-profile.types.ts`, `catalog/identity/single-tenant/api/domain/permissions/permission.types.ts`, `catalog/identity/single-tenant/api/infrastructure/tables/user.table.ts`, `catalog/identity/single-tenant/api/testing/seed-user.ts`
**Depends on**: T70
**Exclusive**: no
**Reuses**: `user.table.ts:18` derives the PG enum from `permission.types.ts:7-19 defineAccessProfiles([...BASE, ...PRODUCT])`; no migration in this repo writes it — a child generates it with drizzle-kit
**Requirement**: IDENT-01 (F-catalog-entries-6 **C**) · retires the last of AD-002

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `professional` is gone from the base set; a product can still add it through `PRODUCT_ACCESS_PROFILES`
- [ ] `seed-user.ts:14-16,46` no longer derives `servesClients` from `accessProfile === "professional"`, and its comment citing **"migration 0131"** — a product-specific number that should never have been in the template — goes with it
- [ ] The `ALTER TYPE` story lives in T73's migration and T65's advisory, not in a code comment
- [ ] Gate passes: `pnpm vitest run --project api catalog/identity`
- [ ] Test count: existing tests pass; 6 updated

**Tests**: unit · **Gate**: quick

---

### T72: Identity's manifest, audit hook and the kernel harness line

**What**: Remove the five satellites from `schemaExports`, split `04_audit_attach_hook.sql` down to its 7 core tables, and delete the professional truncation line from the kernel test harness.
**Where**: `catalog/identity/single-tenant/module.json:13`
**Touches**: `catalog/identity/single-tenant/module.json`, `catalog/identity/single-tenant/migrations/custom/04_audit_attach_hook.sql`, `apps/api/test/setup/test-db.ts`
**Depends on**: T71
**Exclusive**: no
**Reuses**: T63's per-entry `attach_audit()` as the new home for the seven professional registrations
**Requirement**: IDENT-01, IDENT-02 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `schemaExports` lists only identity's own tables
- [ ] `attach_audit()` registers **7** tables, keeping the redactions for `users.password_hash`, `sessions.token_hash`, `devices.cookie_token_hash`, `verification_tokens.token_hash`
- [ ] `apps/api/test/setup/test-db.ts:105` (`identity.professional_default_hours`) is **deleted** — T45 widened the guard around it in `v2.4.0`; this is the deletion that line was waiting for
- [ ] The entry's `version` bumps for the break
- [ ] Gate passes: `pnpm catalog:lint && pnpm vitest run --project api catalog/identity`

**Tests**: none (manifest/SQL) · **Gate**: build (full-unit)

**Commit**: `feat(identity)!: users, sessions and permissions only`

---

### T73: `scripts/platform/migrations/v3.0.0.mjs`

**What**: The executable, idempotent child migration a major must ship (AD-034).
**Where**: `scripts/platform/migrations/v3.0.0.mjs`
**Touches**: `scripts/platform/migrations/v3.0.0.mjs`
**Depends on**: T56
**Exclusive**: no
**Reuses**: the `v<X.Y.Z>.mjs` convention `pnpm platform template migrate` runs ascending
**Requirement**: area H (release machinery) · AD-034

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Renames `R2_*` to `STORAGE_*` in the child's env files
- [ ] Writes `APP_TIMEZONE` preserving the child's **current** semantics rather than the new `UTC` default — a child's day boundaries must not move silently
- [ ] Offers the cookie-name escape hatch (`COOKIE_NAME`, `CSRF_COOKIE_NAME`) so live sessions are not invalidated without a choice
- [ ] Handles the `professional` enum `ALTER TYPE` explicitly (AD-004 documents the reverse hazard)
- [ ] **Idempotent**: running it twice changes nothing the second time
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T74: `platform template migrate` runs migrations ascending

**What**: Wire, or verify, the runner that applies `v<X.Y.Z>.mjs` in order.
**Where**: `scripts/platform/lib/commands/template.mjs`
**Touches**: `scripts/platform/lib/commands/template.mjs`
**Depends on**: T73
**Exclusive**: no
**Reuses**: `EXIT_CODES`; T20's exit-code convention
**Requirement**: area H · AD-034

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Migrations run ascending by semver, skipping those already applied
- [ ] A failing migration exits non-zero and names the file
- [ ] Gate passes: `pnpm test:scripts`

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T75: Idempotency and preservation tests for the migration

**What**: Prove the two properties that make the migration safe to ship.
**Where**: `scripts/platform/__tests__/migration-v3.test.mjs`
**Touches**: `scripts/platform/__tests__/migration-v3.test.mjs`
**Depends on**: T74
**Exclusive**: no
**Reuses**: the fixture child at `scripts/platform/__tests__/fixtures/child/`
**Requirement**: area H · AD-034

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Double-run produces a byte-identical tree
- [ ] A child with `R2_*` and no `APP_TIMEZONE` ends with `STORAGE_*` and its **previous** timezone semantics, not `UTC`
- [ ] Gate passes: `pnpm test:scripts`
- [ ] Test count: 6 new tests pass

**Tests**: unit (`node:test`) · **Gate**: quick

---

### T76: Contract regen and parity re-snapshot — **EXCLUSIVE**

**What**: Regenerate the contract after the split and re-snapshot the parity fixtures **as an explicit, separately-committed change**, so the diff is reviewable rather than incidental.
**Where**: `openapi.json`
**Touches**: `openapi.json`, `packages/api-client/src/`, `catalog/identity/single-tenant/parity/`, `catalog/professional/parity/`
**Depends on**: T72, T75
**Exclusive**: yes
**Reuses**: `pnpm contract`; `catalog/tag/parity/` as the shape for the new entry's snapshot
**Requirement**: IDENT-01, IDENT-02 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `profiles.parity.spec.ts` and `contract.snapshot.json` — which **fail by design** after T70/T71 — are re-snapshotted, and the diff is reviewed as the deliberate record of the break
- [ ] The new entry has its own parity snapshot
- [ ] `git diff --exit-code openapi.json packages/api-client/src` is empty afterwards
- [ ] The commit contains only regenerated artefacts
- [ ] Gate passes: `pnpm check && pnpm test`

**Tests**: parity snapshot · **Gate**: build (full-unit)

**Commit**: `chore(contract): regenerate and re-snapshot parity after the identity split`

---

### T77: IDENT-02 proof — both entries install alone in a kernel-only child

**What**: The gate IDENT-02 asks for: `catalog:check` passes for `identity` and for `professional`, each alone, in a kernel-only child.
**Where**: `scripts/platform/__tests__/catalog-check-professional.test.mjs`
**Touches**: `catalog/professional/README.md`, `catalog/professional/CHANGELOG.md`, `scripts/platform/__tests__/catalog-check-professional.test.mjs`
**Depends on**: T76
**Exclusive**: no
**Reuses**: `.github/workflows/catalog.yml:38-80`'s matrix job — `professional` joins it
**Requirement**: IDENT-02 (F-catalog-entries-6 **C**)

**Tools**: MCP: NONE · Skill: `catalog-modules`

**Done when**:
- [ ] `pnpm catalog:check identity` and `pnpm catalog:check professional` both pass in a kernel-only child
- [ ] `professional` is added to the `catalog.yml` matrix
- [ ] The entry's README and CHANGELOG are complete, including the declared debt from T63
- [ ] Gate passes: `pnpm catalog:lint && pnpm catalog:typecheck`

**Tests**: parity/integration · **Gate**: full

---

### T78: Record AD-035 and the `v2.2.1` fact

**What**: The extraction is a project-level decision; `STATE.md` also still records tags only up to `v2.2.0`.
**Where**: `.specs/STATE.md`
**Touches**: `.specs/STATE.md`
**Depends on**: T77
**Exclusive**: no
**Reuses**: the AD row format already in the Decisions section
**Requirement**: IDENT-03 (F-catalog-entries-6 **C**) · AD-035

**Tools**: MCP: NONE · Skill: `tlc-spec-driven`

**Done when**:
- [ ] AD-035 records the extraction and its conformance to AD-013, AD-014, AD-015, AD-016, AD-021/024/025 and AD-032, and that it supersedes nothing — AD-002 was already retired by AD-014
- [ ] The `v2.2.1` tag is recorded; the release shape was being derived from a stale snapshot until it was re-derived from `git tag -l`
- [ ] Written by the **orchestrator**, the only writer of `.specs/` during Execute
- [ ] Gate passes: build gate

**Tests**: none · **Gate**: build

---

### T79: Changelog section for `v3.0.0` — **OWNER-GATED**

**What**: Author the `v3.0.0` section with real child migration steps, because a major is the one release allowed to have them.
**Where**: `docs/dev/template-changelog.md`
**Touches**: `docs/dev/template-changelog.md`
**Depends on**: T78
**Exclusive**: no
**Reuses**: `lintChildMigrationSteps`; the `v2.4.0` section from T48
**Requirement**: area H (release machinery) · AD-034

**Tools**: MCP: NONE · Skill: NONE

**BLOCKED**: do not start until `v2.4.0` is tagged — `release-preflight` keys on the **latest** section, so appending `v3.0.0` before that makes `v2.4.0` untaggable.

**Done when**:
- [ ] `git tag -l v2.4.0` returned non-empty **before** the first edit
- [ ] Child migration steps cover: the cookie rename (re-login or pin the old names), `R2_*` to `STORAGE_*`, `APP_TIMEZONE`, the identity split with its `ALTER TYPE` story, and installing `professional` for a child that needs the slice
- [ ] Each step names `pnpm platform template migrate` where the migration does the work
- [ ] The agent **does not tag and does not push** (AD-006/AD-034)
- [ ] Gate passes: `pnpm catalog:lint`

**Tests**: none · **Gate**: build

**Commit**: `docs(changelog): v3.0.0`

---

## Wave Execution Map

```
Wave 1:  [C1: T1→T2→T3→T4→T5] ∥ [C2: T6→T7→T8→T9→T10→T11] ∥ [C3: T12→T13→T14→T15→T16]
Wave 2:  [C4: T17→T18→T19→T20→T21→T22] ∥ [C5: T23→T24→T25→T26→T27] ∥ [C6: T28→T29→T30→T31→T32]
Wave 3:  [C7: T33→T34→T35→T36] ∥ [C8: T37→T38→T39→T40] ∥ [C9: T41]
Wave 4:  [C10: T42]  (exclusive)
Wave 5:  [C11: T43]  (exclusive)
Wave 6:  [C12: T44→T45→T46→T47]
Wave 7:  [C13: T48]  (owner-gated)
         ► Verifier pass 1 (v2.4.0 scope) ► owner dispatches release → v2.4.0
Wave 8:  [C14: T49→T50→T51→T52→T53] ∥ [C15: T54→T55→T56]
Wave 9:  [C16: T57] (exclusive)
Wave 10: [C17: T58→T59→T60→T61→T62→T63] ∥ [C18: T64→T65→T66]
Wave 11: [C19: T67→T68→T69→T70→T71→T72] ∥ [C20: T73→T74→T75]
Wave 12: [C21: T76] (exclusive)
Wave 13: [C22: T77→T78]
Wave 14: [C23: T79] (owner-gated)
         ► Verifier pass 2 (whole feature) ► owner dispatches release → v3.0.0
```

**How wave-based execution works.** At Execute the orchestrator never implements a cluster. For each
wave it dispatches **one worker per cluster, all at once** (at most 4 in flight; more queue FIFO),
waits for every compact summary, runs the Build gate **once** through the runner (scoped or
full-unit as the Wave Plan says), records results here, and moves to the next wave. Workers own only
the files in their `Touches` union, run their own scoped gate redirected to a log, delegate an open
navigation question to a scout, and commit one atomic, pathspec-limited commit per task.

**Model tier per cluster** — judgement, passed on every dispatch, never hard-coded:

| Cluster | Tier | Why |
| --- | --- | --- |
| C1, C4, C7, C9, C20 | sonnet | tooling, CI and config — the default tier |
| C2, C3, C8, C12, C15, C18, C22 | sonnet | docs, workflows, message tables |
| C5, C6 | sonnet | kernel seams, but no domain transition |
| C10, C11, C13, C23 | sonnet | manifests, harness text, changelog |
| C14 | **opus** | contract inputs plus ADR-governed cookie and timezone rules |
| C16, C21 | **opus** | contract regeneration |
| C17, C19 | **opus** | domain entities and transitions, migrations, AD-035 |
| Verifier pass 1 | sonnet | no P0 surface in the minor |
| Verifier pass 2 | **opus** | data integrity plus a breaking contract change (P0) |

---

## Task Granularity Check

| Tasks | Scope | Status |
| --- | --- | --- |
| T1, T3, T4, T17, T20, T21, T22, T33, T34, T51, T74 | 1 function or 1 module | ✅ Granular |
| T2 | 1 helper plus its 8 call sites — mechanical, one concept | ✅ Granular |
| T5, T18, T19, T29, T30, T31, T52, T53, T54, T73 | 1 behaviour in 1 seam | ✅ Granular |
| T6, T7, T8, T9, T10, T11, T14, T15, T16, T24, T32, T35, T38, T47, T56 | 1 coherent file change | ✅ Granular |
| T12, T13 | 1 document rewrite each — the design says rewrite, not edit | ✅ Granular |
| T23, T25, T26, T27, T28, T37, T39, T40, T49, T50 | 1 seam across its consumers | ✅ Granular |
| T36, T44, T45, T46, T55, T75, T77 | 1 gate or 1 spec | ✅ Granular |
| T41 | 1 file (`copier.yml`), 4 requirements — **wiring task by design** | ✅ Granular — one owner for a shared file |
| T42, T43, T57, T76 | exclusive, 1 concern each | ✅ Granular |
| T48, T79 | 1 changelog section each | ✅ Granular |
| T58, T59, T60, T61, T62, T63 | new entry, one layer per task | ✅ Granular |
| T64, T65, T66 | 1 entry or 1 advisory each | ✅ Granular |
| T67, T68, T69, T70, T71, T72 | one identity layer per task | ✅ Granular |
| T78 | 1 STATE.md record | ✅ Granular |

No task creates multiple components across unrelated files. **0 ❌.**

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram shows | Status |
| --- | --- | --- | --- |
| T1 | None | wave 1, first in C1 | ✅ |
| T2 | T1 | after T1 in C1 | ✅ |
| T3 | None | C1, order only | ✅ |
| T4 | T1 | after T1 in C1 | ✅ |
| T5 | T1, T2 | after both in C1 | ✅ |
| T6 | None | wave 1, first in C2 | ✅ |
| T7 | T6 | after T6 in C2 | ✅ |
| T8 | T6 | after T6 in C2 | ✅ |
| T9 | T8 | after T8 in C2 | ✅ |
| T10 | T7, T9 | after both in C2 | ✅ |
| T11 | None | C2, order only | ✅ |
| T12 | None | wave 1, first in C3 | ✅ |
| T13 | T12 | after T12 in C3 | ✅ |
| T14 | T13 | after T13 in C3 | ✅ |
| T15 | T12, T13, T14 | after all three in C3 | ✅ |
| T16 | T15 | after T15 in C3 | ✅ |
| T17 | None | wave 2, first in C4 | ✅ |
| T18 | T17 | after T17 in C4 | ✅ |
| T19 | T18 | after T18 in C4 | ✅ |
| T20 | T18 | after T18 in C4 | ✅ |
| T21 | T20 | after T20 in C4 | ✅ |
| T22 | T21 | after T21 in C4 | ✅ |
| T23 | None | wave 2, first in C5 | ✅ |
| T24 | T23 | after T23 in C5 | ✅ |
| T25 | T23 | after T23 in C5 | ✅ |
| T26 | T25 | after T25 in C5 | ✅ |
| T27 | T26 | after T26 in C5 | ✅ |
| T28 | None | wave 2, first in C6 | ✅ |
| T29 | T28 | after T28 in C6 | ✅ |
| T30 | T29 | after T29 in C6 | ✅ |
| T31 | T30 | after T30 in C6 | ✅ |
| T32 | T29, T31 | after both in C6 | ✅ |
| T33 | T1, T2 | wave 3 ← wave 1 (C1) | ✅ |
| T34 | T33 | after T33 in C7 | ✅ |
| T35 | T33 | after T33 in C7 | ✅ |
| T36 | T35 | after T35 in C7 | ✅ |
| T37 | None | wave 3, first in C8 | ✅ |
| T38 | T37 | after T37 in C8 | ✅ |
| T39 | T38 | after T38 in C8 | ✅ |
| T40 | T39 | after T39 in C8 | ✅ |
| T41 | T8, T9, T23, T29 | wave 3 ← waves 1–2 | ✅ (see note) |
| T42 | T33, T34 | wave 4 ← wave 3 (C7) | ✅ |
| T43 | T16, T41 | wave 5 ← waves 1 and 3 | ✅ |
| T44 | T43 | wave 6 ← wave 5 | ✅ |
| T45 | T44 | after T44 in C12 | ✅ |
| T46 | T45 | after T45 in C12 | ✅ |
| T47 | T46 | after T46 in C12 | ✅ |
| T48 | T42, T43, T47 | wave 7 ← waves 4, 5, 6 | ✅ |
| T49 | None | wave 8, first in C14 | ✅ |
| T50 | T49 | after T49 in C14 | ✅ |
| T51 | T50 | after T50 in C14 | ✅ |
| T52 | T51 | after T51 in C14 | ✅ |
| T53 | T52 | after T52 in C14 | ✅ |
| T54 | None | wave 8, first in C15 | ✅ |
| T55 | T54 | after T54 in C15 | ✅ |
| T56 | T55 | after T55 in C15 | ✅ |
| T57 | T49, T50, T51, T52, T53 | wave 9 ← wave 8 (C14) | ✅ |
| T58 | T57 | wave 10 ← wave 9 | ✅ |
| T59 | T58 | after T58 in C17 | ✅ |
| T60 | T59 | after T59 in C17 | ✅ |
| T61 | T60 | after T60 in C17 | ✅ |
| T62 | T61 | after T61 in C17 | ✅ |
| T63 | T62 | after T62 in C17 | ✅ |
| T64 | T57 | wave 10 ← wave 9 | ✅ |
| T65 | T64 | after T64 in C18 | ✅ |
| T66 | T65 | after T65 in C18 | ✅ |
| T67 | T63, T66 | wave 11 ← wave 10 (C17 and C18) | ✅ |
| T68 | T67 | after T67 in C19 | ✅ |
| T69 | T68 | after T68 in C19 | ✅ |
| T70 | T69 | after T69 in C19 | ✅ |
| T71 | T70 | after T70 in C19 | ✅ |
| T72 | T71 | after T71 in C19 | ✅ |
| T73 | T56 | wave 11 ← wave 8 (C15) | ✅ |
| T74 | T73 | after T73 in C20 | ✅ |
| T75 | T74 | after T74 in C20 | ✅ |
| T76 | T72, T75 | wave 12 ← wave 11 (C19 and C20) | ✅ |
| T77 | T76 | wave 13 ← wave 12 | ✅ |
| T78 | T77 | after T77 in C22 | ✅ |
| T79 | T78 | wave 14 ← wave 13 | ✅ |

**Note on T41 — a same-wave dependency found and removed, not waived.** The first draft of T41 also
listed T37 (C8, wave 3) as a dependency. A task may depend only on an earlier wave or on an earlier
task **in its own cluster**; a sibling cluster of the same wave is a race, not an ordering. The
relationship is real but one-directional and file-disjoint: T37 renders the language rule inside
`AGENTS.md.jinja`, T41 adds the `product_locale` question that feeds it, and T41 reads nothing T37
writes. **T41's `Depends on` is therefore `T8, T9, T23, T29` — all in waves 1–2.** Recorded here so
the Execute-time re-validation sees the reasoning instead of re-deriving it.

---

## Test Co-location Validation

| Task | Layer created/modified | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T1, T2, T3, T4, T5 | platform scripts | unit (`node:test`) | unit | ✅ |
| T6 | API kernel config plus docs | unit | unit | ✅ |
| T7 | env and docs only | none | none | ✅ |
| T8 | manifest plus docs; AC proof is a guard | none | unit | ✅ exceeds |
| T9, T10 | docs, shell script | none | none | ✅ |
| T11 | regression assertion | unit (`node:test`) | unit | ✅ |
| T12, T13, T14, T15 | docs and `.jinja` | none | none | ✅ |
| T16 | docs plus committed guard | unit (`node:test`) | unit | ✅ |
| T17, T18, T19, T20, T21, T22 | platform scripts and one hook | unit (`node:test`) | unit | ✅ |
| T23 | web app and config | unit | unit | ✅ |
| T24 | asset and nginx config | none | none | ✅ |
| T25, T26, T27 | web app and shared | unit | unit | ✅ |
| T28 | API kernel errors | unit | unit | ✅ |
| T29 | API boot, route level | e2e | e2e | ✅ |
| T30 | API kernel context | unit | unit | ✅ |
| T31 | API infra repository | integration | integration | ✅ |
| T32 | docs | none | none | ✅ |
| T33, T34 | platform scripts | unit (`node:test`) | unit | ✅ |
| T35 | workflow | none | none | ✅ |
| T36 | workflow, manifest, guard | none | unit | ✅ exceeds |
| T37, T38 | docs and `.jinja` | none | none | ✅ |
| T39, T40 | catalog entry code | unit | unit | ✅ |
| T41 | `copier.yml` and workflow; AC proof is a gate | none | unit | ✅ exceeds |
| T42 | manifests | none | none | ✅ |
| T43 | harness files | unit (`node:test`) | unit | ✅ |
| T44 | hooks plus docs | unit (`node:test`) | unit | ✅ |
| T45 | API test harness plus guard spec | unit | unit | ✅ |
| T46, T55 | committed gate | unit (`node:test`) | unit | ✅ |
| T47 | docs | none | none | ✅ |
| T48, T79 | changelog | none | none | ✅ |
| T49, T50, T51, T52, T53 | API kernel, catalog entry, package | unit | unit | ✅ |
| T54 | API infra storage | unit | unit | ✅ |
| T56 | env and docs | none | none | ✅ |
| T57, T76 | generated artefacts | gate / parity snapshot | gate / parity | ✅ |
| T58, T59 | manifest and schema | none | none | ✅ |
| T60, T62 | entry domain and api | unit | unit | ✅ |
| T61 | entry repositories | integration | integration | ✅ |
| T63 | SQL and docs | none | none | ✅ |
| T64 | entry domain | unit | unit | ✅ |
| T65, T66 | advisories | none | none | ✅ |
| T67, T69, T70, T71 | entry domain and contract | unit | unit | ✅ |
| T68 | entry port plus repository | integration | integration | ✅ |
| T72 | manifest, SQL, harness | none | none | ✅ |
| T73, T74, T75 | platform scripts | unit (`node:test`) | unit | ✅ |
| T77 | entry parity in a rendered child | parity/integration | parity/integration | ✅ |
| T78 | `.specs/STATE.md` | none | none | ✅ |

**0 ❌ VIOLATION.** No task defers its tests to a later task. Where the matrix says `none` but the
requirement's declared proof is `gate` (T8, T36, T41), the task carries a committed guard anyway —
exceeding the matrix, never falling short of it.

---

## Wave/Cluster Cross-Check

| Wave | Cluster | Tasks | Deps outside earlier waves / own cluster? | Files shared with a sibling cluster? | Exclusive alone? | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | C1 | T1→T5 | none | none — `scripts/platform/**` is C1's alone this wave | n/a | ✅ |
| 1 | C2 | T6→T11 | none | none — C1 owns `lib/**` and five named test files; C2 names three different test files | n/a | ✅ |
| 1 | C3 | T12→T16 | none | none — C3 owns `docs/agents/**` and `docs/dev/deploy.md.jinja`; C2 owns `docs/dev/local-environment.md` | n/a | ✅ |
| 2 | C4 | T17→T22 | none | none | n/a | ✅ |
| 2 | C5 | T23→T27 | none | none — `apps/web/**` is C5's alone | n/a | ✅ |
| 2 | C6 | T28→T32 | none | none — `apps/api/src/**` is C6's alone this wave | n/a | ✅ |
| 3 | C7 | T33→T36 | T33 ← T1, T2 (wave 1) | none | n/a | ✅ |
| 3 | C8 | T37→T40 | none | none — C8 owns `docs/code-quality.md`, `AGENTS.md.jinja`, `catalog/*/api/**`; C7 owns `scripts/**`, workflows, `docs/arch/back.md` | n/a | ✅ |
| 3 | C9 | T41 | T8, T9, T23, T29 (waves 1–2) | none — `copier.yml` and `feedback-triage.yml` are C9's alone | n/a — single-task cluster justified: `copier.yml` is a shared wiring file with four editors | ✅ |
| 4 | C10 | T42 | T33, T34 (wave 3) | n/a — only cluster | **yes** | ✅ |
| 5 | C11 | T43 | T16 (wave 1), T41 (wave 3) | n/a — only cluster | **yes** | ✅ |
| 6 | C12 | T44→T47 | T43 (wave 5) | n/a — only cluster | n/a | ✅ |
| 7 | C13 | T48 | T42, T43, T47 (waves 4–6) | n/a — only cluster | n/a — single-task cluster justified: owner-gated barrier | ✅ |
| 8 | C14 | T49→T53 | none | none — C14 owns `openapi-config.ts`, `identity.config.ts`, `client.ts`, `bucket-sql.ts`, `env.ts`; C15 owns `infra/storage/**`, `app.module.ts`, `.env.example` | n/a | ✅ |
| 8 | C15 | T54→T56 | none | none — `apps/api/.env.example` and `docs/dev/local-environment.md` are C15's alone in this wave | n/a | ✅ |
| 9 | C16 | T57 | T49–T53 (wave 8) | n/a — only cluster | **yes** | ✅ |
| 10 | C17 | T58→T63 | T57 (wave 9) | none — `catalog/professional/**` is C17's alone | n/a | ✅ |
| 10 | C18 | T64→T66 | T57 (wave 9) | none — `catalog/audit/**` and the two new advisories are C18's alone | n/a | ✅ |
| 11 | C19 | T67→T72 | T63, T66 (wave 10) | none — `catalog/identity/**` and `apps/api/test/setup/test-db.ts` are C19's alone | n/a | ✅ |
| 11 | C20 | T73→T75 | T56 (wave 8) | none — `scripts/platform/migrations/**` is C20's alone | n/a | ✅ |
| 12 | C21 | T76 | T72, T75 (wave 11) | n/a — only cluster | **yes** | ✅ |
| 13 | C22 | T77→T78 | T76 (wave 12) | n/a — only cluster | n/a | ✅ |
| 14 | C23 | T79 | T78 (wave 13) | n/a — only cluster | n/a — single-task cluster justified: owner-gated barrier | ✅ |

**Cluster sizes**: 5, 6, 5 · 6, 5, 5 · 4, 4, 1 · 1 · 1 · 4 · 1 · 5, 3 · 1 · 6, 3 · 6, 3 · 1 · 2 · 1.
Every multi-task cluster sits in the 3–6 range, inside the 4–8 guidance for a vertical slice. **No
wave holds three or more single-task non-exclusive clusters** — the only ones are C9, C13 and C23,
each alone in its wave with a stated justification. **No wave exists only because of the 4-in-flight
cap**: the widest wave holds 3 clusters.

### Files with more than one editor across the plan, and their single owner per wave

| File | Editors | How single ownership is kept |
| --- | --- | --- |
| `copier.yml` | T8, T9, T23, T29, T37, T41 | **wiring task T41** owns it outright; every other task is forbidden to touch it and says so in its body |
| `docs/dev/local-environment.md` | T6, T7, T8, T9, T10 (C2, wave 1); T56 (C15, wave 8) | one cluster per wave |
| `docs/dev/deploy.md.jinja` | T13 — carries BRAND-05, BRAND-06 and TOOL-09 | one rewrite task carries all three concerns |
| `apps/api/.env.example` | T6, T7 (C2, wave 1); T56 (C15, wave 8) | one cluster per wave |
| `apps/api/src/shared/config/env.ts` | T6 (wave 1), T28 (wave 2), T53 (wave 8) | different waves |
| `apps/web/.env.example` | T6 (C2, wave 1), T23 (C5, wave 2) | different waves |
| `catalog/identity/single-tenant/README.md` | T25 (C5, wave 2), T47 (C12, wave 6) | different waves |
| `catalog/identity/single-tenant/api/identity.config.ts` | T50, T52 (both C14, wave 8) | same cluster, ordered |
| `apps/api/test/setup/{test-db,unit-env,e2e-env}.ts` | T45 (C12, wave 6), T49 (C14, wave 8), T72 (C19, wave 11) | different waves |
| `scripts/platform/lib/lint.mjs` | T1 (C1, wave 1), T33 and T34 (C7, wave 3) | different waves |
| `scripts/platform/lib/commands/add.mjs` | T3 (C1, wave 1), T17, T18, T19 (C4, wave 2) | different waves |
| `scripts/platform/__tests__/docs-no-owner-infra.test.mjs` | T16 (C3, wave 1), T43 (C11, wave 5) | different waves — T43 removes the `harness.md` exclusion T16 had to leave behind |
| `scripts/platform/__tests__/brand-hygiene.test.mjs` | T46 (wave 6), T55 (wave 8) | different waves |
| `docs/arch/front.md` | T38 (C8, wave 3), T44 (C12, wave 6) | different waves |
| `openapi.json`, `packages/api-client/src/` | T57 (wave 9), T76 (wave 12) | both exclusive, different waves |
| `docs/dev/template-changelog.md` | T48 (wave 7), T79 (wave 14) | different waves, both owner-gated |

---

## Tools — MCPs and Skills

No MCP is required by any task. Skills used: `catalog-modules` (T58 and T77 — entry authoring and
`catalog:check`) and `tlc-spec-driven` (T78 — the Decisions record). Everything else is plain file
work under the standard gates.

---

## Verifier notes (input to Execute)

- **Two passes.** Pass 1 after wave 7, scoped to the `v2.4.0` requirements. Pass 2 after wave 14,
  over the whole feature. Author ≠ verifier in both.
- **RUN-04 is `satisfied-by-sibling`**, evidence = the `prettier-format-gate` commit. This feature
  asserts only that `pnpm format:check` is green at its HEAD. Do **not** mark it unmet for lack of a
  task here (§ 0.2).
- **RUN-05 is a regression assertion**, not a fix — `F-runtime-probe-4` was closed by `74022fe`.
- **CAT-05's probe is already spent** (`git tag -l 'catalog/*'` → empty). **Probe budget 1 of 3; no
  further probes.** Every other AC proves by `test` or `gate`.
- **The locale default is load-bearing.** Verify *absence of change* at `product_locale=pt-BR`, not
  only the presence of English at `en`. A child whose `.copier-answers.yml` lacks the key must see no
  shipped string change.
- **BRAND-04 versus BRAND-05.** Judge the harness-taxonomy AC (story AC 5) against **BRAND-04** and
  the infra-docs AC (story AC 6) against **BRAND-05** — § 0.1. `design.md` § *Execute notes* uses the
  older, shifted labels.
- **T43 changes the rules this workflow runs under.** Judge it against the taxonomy in force at
  dispatch, which its commit body quotes.
- **Parity specs fail by design** after T70 and T71, and are re-snapshotted in T76. A red parity spec
  between wave 11 and wave 12 is expected, not a regression.
- **The agent never tags and never pushes** (AD-006/AD-034). The four owner hand-off points are
  listed in § *Owner hand-off points*.

---

## Execution Log

Written by the orchestrator only, after each wave's Build gate. Hashes are the workers' atomic
commits, in task order.

### Wave 1 — GATED GREEN (2026-08-23)

| Cluster | Tasks | Commits | Worker's own gate |
| --- | --- | --- | --- |
| C1 (sonnet) | T1 → T5 | `a754208`, `b4cfa63`, `72592c6`, `a16bef0`, `5f89723` | `pnpm test:scripts` exit 0 |
| C2 (sonnet) | T6 → T11 | `bd56b71`, `37c873c`, `4aeb55e`, `aa0da6b`, `f0dd838`, `2e19a04` | `pnpm vitest run --project api apps/api/src/shared/config` 27 passed; `pnpm test:scripts` exit 0 |
| C3 (sonnet) | T12 → T16 | `160bc60`, `63bb75f`, `29b3357`, `d8f036b`, `768c1ef` | `pnpm test:scripts` exit 0 |

**Build gate (`full-unit`)** — run once, through the runner, after all three clusters reported:

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm check` | 0 | 5/5 turbo tasks |
| `pnpm test` | 0 | 585 tests / 89 files — unchanged vs the pre-feature baseline |
| `pnpm test:scripts` | 0 | 376 tests / 42 files — **+31 tests, +8 files** vs baseline 345/34 |

Pre-feature baseline, measured on `92b4120` before dispatch: **930 tests / 123 files, 0 failures**
(`pnpm test` 585/89 · `pnpm test:scripts` 345/34). No count dropped — no silent deletion.

#### Deviations recorded in wave 1 (input to the Verifier)

1. **T16 — the area-label placeholder is discovery-based, not a copier variable.** The worker shipped
   a `gh label list` discovery placeholder with domain-neutral examples instead of the `{{ … }}`
   Jinja placeholder T16's body names, because such a variable must be declared in `copier.yml`, and
   that file is **T41's** alone. § *Files with more than one editor* never listed T16 as a
   `copier.yml` editor — **the plan created this gap, not the worker.** The Verifier judges story
   AC 4 ("the area-label list SHALL come from a product-filled placeholder") against the shipped
   shape; if a declared copier variable is required, the fix belongs to **T41 (wave 3)**, whose
   `Touches` already carry `copier.yml`.
2. **T16 — `SPEC_DEVIATION` at `scripts/platform/__tests__/docs-no-owner-infra.test.mjs:10-14`.** The
   guard's scan excludes `docs/agents/harness.md`, which still names booking rules. That file is
   **BRAND-04 / T43 (wave 5)** and was forbidden to C3. **T43 must remove the exclusion** so the guard
   covers the literal `docs/agents/**` its AC names — otherwise BRAND-04 ships a fix its own guard
   cannot see. Added to T43's *Done when*.
3. **T14 — this plan's own `Reuses` field was wrong.** The real `lefthook.yml` pre-push chain is three
   steps (`migrations → typecheck → test-coverage`); T14 cited a four-step chain including
   `catalog-typecheck`, which is not on disk. The worker documented the real chain. **The plan was
   wrong, the delivery is right** — no fix task.
4. **T8 — `db:seed` was removed, not repaired.** It targeted an absent `apps/api/src/seeds` with no
   replacement in scope; T8's own wording ("either the script ships or the doc stops naming it")
   permits it.
5. **T6 — four in-scope files were already correct** (`apps/web/.env.example`, both Dockerfiles,
   `docker-compose.yml` already at `3000`). No edit needed; the ten-site assertion still covers them.

#### Cross-feature facts learned during wave 1 (from the `prettier-format-gate` session)

Premises this plan recorded that have changed. **None is visible to `wave-plan-check.mjs`.**

- **The five entries will sit at `2.0.1`, not `2.0.0`, before T42 runs.** That feature's repo-wide
  reformat trips `entryChangedWithoutBump`, so it carries a bump task of its own. **T42 bumps from
  `2.0.1`.** § 0.3's advisory-`affects` row is unaffected; any reading of "all five entries sit at
  `2.0.0`" (design.md § C *Notes*) is stale from that feature's landing onward.
- **`lefthook-local.yml` gains a pre-commit format check** in **auto-fix** mode (`--write` + re-stage),
  chosen so a worker's commit is fixed rather than rejected. Asked of that session: the re-stage must
  be pathspec-limited — a `git add -A` inside the hook would sweep a sibling cluster's in-flight edits
  into an unrelated worker's commit.
- **The `v2.3.0` gate was lifted on that feature only** — it now ships *inside* `v2.3.0`. **This does
  not transfer: T48 stays blocked** until `git tag -l v2.3.0` is non-empty (AD-034, latest-section
  rule). The tag that unblocks T48 is the one their release dispatches.
- **Ordering is SETTLED — `prettier-format-gate` goes first.** Superseded by the ruling below; the
  reasoning that made it the cheaper order stands: that feature's T7/T8 reformat the whole tree and
  would rewrite any file a worker holds open, RUN-04 is `satisfied-by-sibling` here, and this
  feature's Verifier asserts `pnpm format:check` green at HEAD — which cannot hold until that feature
  lands, so the dependency runs one way only.

### Wave 2 — HELD (not started). Ordering ruled 2026-08-23

**Ruling: `prettier-format-gate` executes first.** Relayed by that session (`platform-template-3e`)
as its user's decision, and **verified on disk rather than taken on the peer's word** — the ordering
is no longer a matter of good faith between sessions, because that feature is *live in this same
checkout*:

| Evidence | State at the time of this entry |
| --- | --- |
| `5c4e76d` | `spec(prettier-format-gate): amend the plan before wave 1` — lifts its `v2.3.0` gate, adds its T12 |
| `266d2fd` | its T1 — `.prettierrc` loses the tailwind plugin |
| `a3ebba0` | its T2 — `.vscode/settings.json` loses the tailwind block |
| working tree | `catalog/notification/api/infrastructure/mailer/email-theme.ts` modified — its T3 in flight |

Wave 2 (C4 `T17→T22` ∥ C5 `T23→T27` ∥ C6 `T28→T32`, sonnet, gate `full-unit`) is **dispatched only
after that session reports the reformat has landed.** Dispatching into a live whole-tree reformat
would put C5 (`apps/web/**`) and C6 (`apps/api/**`) workers inside the exact file set its T7 rewrites.
That session will signal twice: after its waves 3/4 (T7 outside `catalog/**`, T8 the catalog, T12 the
five manifests) — the moment this checkout's on-disk world changes — and again at its Verifier PASS.

**On resume, re-measure the baseline before dispatching.** The post-wave-1 numbers in this log
(`pnpm test` 585/89, `pnpm test:scripts` 376/42) are stale by construction: that session's T5 and T10
add tests of their own (`376` was the figure this feature handed it). `pnpm test` should be untouched.
Re-measuring is the first step of the wave-2 Build gate, not an assumption.

#### Wave 3 now carries a shelf-life warning — `release-marker-commit` (`platform-template-28`)

Still at Specify, **nothing written**, so this is not yet a conflict — but its scope grew to **delete
`.github/workflows/catalog.yml`**, merge its jobs into `ci.yml`, and drop the `_exclude` entry at
`copier.yml:35`. Two wave-3 tasks are written against exactly that:

- **T35** puts `fetch-depth: 0` on the `gates` job at `.github/workflows/catalog.yml:14-31`. If that
  feature lands first, the file is gone and the baseline fix belongs on the **merged `gates` job in
  `ci.yml`** instead. The requirement (CAT-02) is unaffected — only its `Where` is.
- **T41** owns `copier.yml` and would be editing a file whose catalog-workflow `_exclude` line that
  feature removes.

Whoever reaches wave 3 first must re-read `.github/workflows/` on disk before dispatching C7/C9
rather than trusting these `Where` fields.

#### Correction to this log's own record

The dirty `.specs/STATE.md` in this checkout is **`platform-template-28`'s**, not the
`prettier-format-gate` session's — 28 claimed the `release-marker-commit` Handoff entry and its
follow-up bullet explicitly, and 3e states it has never written to `STATE.md` this session. It stays
unstaged by this feature either way (AD-006: never `git add .specs/STATE.md` without reading the
diff), and it needs to return to 28 to be committed.

### Wave 2 — GATED GREEN (2026-08-23/24)

16 tasks, 16 atomic commits, plus **3 repair commits the Build gate forced**. C4 `91ba30b`, `66c6cc5`,
`cafbe97`, `9e6bca0`, `bc75d78`, `9753b61` · C5 `799a2d4`, `1827dc9`, `68bdca5`, `377c2f0`, `fd1b48a` ·
C6 `2d30885`, `35c8a4f`, `bd215f6`, `d3741dd`, `8550f2b` · repairs `a00c493`, `2a1acc2`, `ae69b83`.

**Build gate (full-unit + format):** `pnpm check` 0 · `pnpm test` 614/614 in 90 files · `pnpm test:scripts`
453/453 · `pnpm format:check` 0, clean repo-wide. Counts are recorded as evidence, **never as thresholds** —
two sibling sessions commit to this checkout and the totals drift under everyone; every gate this wave was
read as *exit code 0 + zero failures*.

#### Two orchestrator defects — mine, not the workers'

1. **The per-task gates ran vitest and never eslint.** C5's scoped gate was
   `pnpm vitest run --project web <path>`; `pnpm check` is `turbo lint typecheck`. **No task in this wave ran
   lint**, so 19 eslint errors accumulated across five files and the Build gate was the first thing to see
   them — a sibling session's gate found them before mine did. Root cause of the errors themselves:
   `import.meta.env` types unknown `VITE_*` keys as `any`, which collapsed `RoutePath` and leaked into two
   files that never read env at all, so 14 of the 19 were cascade. **Rule for waves 3-14: a cluster whose
   `Touches` include a linted workspace gets `pnpm --filter <ws> lint` in its per-task gate, not just the
   vitest projection.**
2. **A `Touches` list retyped from memory instead of copied from this file.** The C6 repair payload omitted
   `apps/api/test/bootstrap-product.e2e-spec.ts`, so the worker correctly reported its lint error as "outside
   my ownership, likely another session's" — when T29 had created it in this very wave. **This failure mode is
   silent**: a narrow list does not error, it produces a polite "not mine" that reads like diligence. No hook
   sees it — `wave-plan-check.mjs` validates the plan, not the payload an orchestrator types out of it.
   **Payload `Touches` are copied verbatim from this file from now on.**

#### The T21 blocker, and the correction a worker made to the orchestrator's fix

C4 stopped at T21 rather than edit a file outside its ownership — the right call, and it was repeated on
request. The resolution is in T21's own block. **One part of that amendment was wrong and the worker caught
it:** it said to give the `no-lock` fixture a `.copier-answers.yml`, which would have tripped
`scripts/platform/__tests__/copier-answers-leak.test.mjs` — a guard that fails the build on **any** git-tracked
file of that name (the same fixture leak that broke earlier products). The worker wrote the file into a temp
dir at runtime via a `makeChildDir()` helper mirroring the existing `makeKernelProjectDir` pattern, kept both
pre-existing ADV-02 assertions verbatim, and the static fixture now doubles as the template-repo case.
**ADV-02 was preserved, not retired** — which was the whole point of the amendment.

#### Findings carried into wave 3

- **T35 may already be satisfied.** `release-marker-commit` deleted `.github/workflows/catalog.yml` (`6b99461`)
  and merged it into `ci.yml`, whose `gates` job already carries `fetch-depth: 0` (`ci.yml:94,98,102`, gated on
  `detect.outputs.template == 'true'`). T35's `Where` points at a file that no longer exists. **Verify at
  dispatch; it likely becomes a verification, not an edit.**
- **T36 now writes into the merged `ci.yml`.** Its assertion that `format:check` is absent from `ci.yml` was
  checked against the merged file and **still holds** — no format job was merged in, so no child inherits a red
  pipeline. That was the one way these two features could have contradicted each other without either Verifier
  noticing.
- **T41's file is settled.** That feature's T3 (`7e5a43e`) removed the single `_exclude` line for
  `catalog.yml`; nothing else in `copier.yml` moved. Owner-ruled there, and the reason is worth keeping: handing
  the deletion to T41 would have made their CI-01 unprovable inside their own commit range.
- **`apps/web/Dockerfile` is in no task's `Touches`** and bakes only `VITE_API_URL`. `%VITE_LOCALE%`,
  `%VITE_APP_NAME%` and the route placeholders stay **literal in the built HTML** — Vite leaves unmatched
  placeholders as-is. The JS layer corrects at runtime so no `Done when` was missed, but LOC-01/LOC-02 are
  half-delivered on the deploy path. **Needs a task; none exists.**
- **This file's `Commit` field is only present on the last task of a chain.** Workers authored their own
  messages for the rest. Affects every remaining wave.
- **`RoutePath` widened from a literal union to `string`** in the lint repair — honest, since those paths are
  runtime-configurable, but a loss of type precision, and it made three `as RoutePath` casts redundant.
- **Bench debris.** The lint-repair worker left an untracked `apps/web/src/shared/lib/__scratch_lint_test.ts`
  (7 lines, unreferenced), removed by the orchestrator. Untracked debris on kernel surface ships the moment
  anyone runs `git add -A`.

#### Wave 2 addendum — a regression the Build gate could not see (`36f1f9f`)

**Found after the wave was gated green, by a sibling feature's Verifier, not by this feature.**
`pnpm catalog:typecheck` was failing on `main`, caused by T29 (`35c8a4f`). The sibling's Verifier ruled out
its own repo-wide reformat before reporting — `git show 4088235 -- scripts/template-smoke.mjs` is purely
mechanical on the relevant lines — which is why this cost one round instead of a negotiation.

**Root cause, and it is a plan defect, not a worker error.** `catalog-stage.mjs` symlinks kernel files into
`.catalog-stage` so each catalog entry can be typechecked against the kernel, and which files get staged is a
hardcoded allowlist — `KERNEL_STAGE_PATHS`, defined in **`scripts/platform/lib/child-layout.mjs:7-17`**, not in
`catalog-stage.mjs`. T29 created `apps/api/src/bootstrap.product.ts` and had `main.ts` import it, but that
allowlist was never in T29's `Touches`, so the staged `main.ts` could not resolve `./bootstrap.product`
(`TS2307`). **The task could not have been completed correctly as written** — the same family as the T16 /
`copier.yml` gap in wave 1: a task tasked to create a file but never granted the file that registers it.

The repair worker stopped at its scope boundary and asked, rather than widening on its own, and it rejected the
`catalog-stage.mjs`-local workaround for the stronger reason: duplicating the canonical `KERNEL_STAGE_PATHS`
would have created a second source of truth **and** forced weakening `catalog-stage.test.mjs:24-32`, the
invariant asserting `links.length === KERNEL_STAGE_PATHS.length`. **A workaround that requires disabling the
test guarding the thing it works around is never the cheaper option.** Fix was one line; that invariant then
passed untouched, as predicted.

**Consequence — the Build gate changes for waves 3-14** (recorded in § *Gate Check Commands*): every wave's
Build gate now also runs **`pnpm catalog:typecheck` and `pnpm catalog:lint`**. Those two live only in the
*Final* gate today, which is why a wave could be gated green over a broken tree. **The argument is structural,
not economic:** `pnpm check` runs `tsconfig.json` and never `tsconfig.catalog.json`, so it *cannot* see
`.catalog-stage` — the commands do not overlap. Measured cost ~1.8s + ~0.2s beside a gate that already runs
`pnpm check` in full. Confirmed this failure would have been caught at wave 2: it is immediate and
commit-local.

**This is the third instance in one day of a single shape**, across three sessions and three surfaces, and it
is the generalisation worth keeping over any of the individual findings: **the check exists, but not at the
point where the work happens.** A per-task gate that ran the test command but not the lint command; a Build
gate that ran four commands but not the catalog ones; and a sibling's pre-commit glob that was configured
correctly and covered nothing. The third was findable only by mutating the config, never by reading it.

#### RUN-04 is now genuinely satisfied-by-sibling (2026-08-24)

**`prettier-format-gate` closed — Verifier PASS round 2, 9/9 ACs, 0 precision gaps, sensor 4/4 killed.**
Its Final gate ran whole at exit 0: `check` 5/5 · `test` 614/614 · `test:scripts` 462/462 · `catalog:lint` 0 ·
`catalog:typecheck` 0 · `format:check` 0 diffs repo-wide.

**Evidence commits for this feature's Verifier to cite for RUN-04** — do not re-derive them: `266d2fd`…
`60a011a` (the `.prettierrc` repair and the two whole-tree reformats), `8816705` / `2fa2977` / `fd6b41e`
(the proofs its own Verifier demanded on round 1). RUN-04's condition was never "the reformat happened" but
"`pnpm format:check` is green at HEAD **and** something fails if it stops being" — both now hold.

**Three standing facts for waves 3-14:**

- **The pre-commit `format` job in `lefthook-local.yml` is live**, in auto-fix mode, re-staging
  **pathspec-limited to the files it formatted** — never `git add -A`. Workers should never notice it. **If a
  worker ever reports a commit that mutated a file it did not edit, that is the pathspec limit leaking and
  the sibling session must be told immediately** — it would sweep one cluster's in-flight edits into another
  worker's commit.
- **`scripts/platform/__tests__/format-gate.test.mjs` is new** and asserts the hook's glob matches root-level
  files — the exact defect its wave-5 worker found by hand. It is deliberately class-level, so a legitimate
  edit to `lefthook-local.yml` should survive it. **Any task of this feature that touches `lefthook-local.yml`
  must keep that test green**; a failure there is a regression to the root-glob defect, not a stale assertion.
- **T48 is unchanged and still blocked.** The sibling's gate lift never transferred: `v2.3.0` remains untagged
  and tagging is the owner's act (AD-006/AD-034 — the agent never tags and never pushes). When it happens the
  five entries are at `2.0.1` and the sibling's item 7 sits inside the existing `v2.3.0` section, so
  `release-preflight` should accept it.

---

### Wave 3 — GATED GREEN (2026-08-24)

**Dispatched:** T40 (C8, identity vocabulary) and **T39a** (new mid-wave — see below). Both landed; the
eight-command Build gate closed **8/8 at exit 0**.

| Task | Commit | Evidence |
| --- | --- | --- |
| T39a | `6fb41e1` `fix(notification): satisfy the child's type-aware lint rules` | 13 tests, exit 0 |
| T40 | `10e25ba` `docs(identity): retire booking-owner vocabulary from prose` | 69 files / 609 tests, exit 0; 4 files, 15 insertions / 15 deletions, **every changed line a comment or JSDoc** |

Both committed under the § 0.6 opt-out `Advisory: none — <reason>`, never `--no-verify`, and no advisory file
was invented to satisfy the hook.

**Build gate, eight commands, HEAD `10e25ba`.** `git status` identical before and after — the tree did not
move during the run (it had to be checked: three sessions were committing to `main` this day).

`format:check` 0 · `check` 0 (5/5) · `test` **614/614** · `test:scripts` **493/493** · `catalog:lint` 0 ·
`catalog:typecheck` 0 (5 entries) · `catalog:test` **875 tests / 118 files** · `catalog:check` **0**.

`test:scripts` at 493 is **above** the 489 baseline: `aa7e4cd`/`352a376` (a sibling's `release --push`) added
tests. Drift, not regression. `catalog:test` matched its 875/118 baseline exactly.

#### The `catalog:check` run finally reached `test:db` — and `032dff5` is only now verified

Every previous `catalog:check` died in the **rendered child's** `pnpm check`, one stage before the database
tier. This run got through: child `check` 5/5 · child `test` 224 files / 1591 tests · child **`test:db` 71
files / 513 tests** · `OK: notification, identity/single-tenant, tag, audit, attachment`.

**Until this run, T39's env fix (`032dff5`) had never been exercised.** The wave-2 log recorded it as fixed;
it was in fact only *unblocked*. Do not read the earlier entry as proof — this is the run that proves it.

#### T39a: the defect T39 itself shipped, found by a sibling's `catalog:check`

`032dff5` introduced two ESLint errors invisible to this repo's own gates:
`notification-catalog.ts:56` (`prefer-nullish-coalescing`) and `notification-catalog.spec.ts:193`
(`no-dynamic-delete`). `catalog/**` only meets **type-aware** ESLint once installed into a child under
`apps/api/src/**`; `pnpm check` and `catalog:lint` pass in the template and are *structurally incapable* of
seeing it. **Fourth instance of "the check exists, but not where the work happens", and the second running
where `catalog:check` was the only one of eight to catch it.**

**Owner's ruling, 2026-08-24 — do not re-litigate.** The obvious `||` → `??` swap is **not** behaviour-preserving:
`??` falls back only on `null`/`undefined`, so `DEFAULT_LOCALE=""` would reach `Intl.DateTimeFormat`. Mirroring
the kernel's strict `z.string().min(1).default("pt-BR")` (`env.ts:66`) was also rejected — throwing contradicts
the whole purpose of `032dff5`, which exists so the entry renders *without* a validated environment. Shipped
shape is an explicit guard (`undefined` **or** `""` → `"pt-BR"`), byte-identical to the old `||`, matching the
promise the file's own comment already made. No `eslint-disable`.

#### The blocked chain nobody had connected

`catalog:check` is in the `needs` of the `tag` job in `release.yml`. While those two lint errors stood,
**`v2.3.0` was untaggable** — a `release --push` would have pushed a marker commit through a red matrix,
produced no tag, and burnt the marker. So: `T39a → catalog:check green → v2.3.0 taggable → T48 unblocked`.
T48 had been waiting on a tag that could not have been cut. **T48 remains blocked until `git tag -l v2.3.0`
returns something; the agent never tags and never pushes (AD-006/AD-034).**

#### Scope caveat — this gate measured a tree that is about to stop existing

This run is **pre-merge, T39a+T40 scope only.** A sibling is fast-forwarding `main` to the integrated tree
(`62330b6`), which brings `web-stack-next` in and renames `apps/web` → `apps/web-vite` + `apps/web-next`
(L-025: never hardcode `apps/web`). **The integrated tree is what gets tagged `v2.3.0`, so it is the one that
must be gated.** This entry is not proof of the tagged tree.

> **Amended the same day — the integrated tree IS gated, and no re-run by this session is needed.**
> `platform-template-3e` closed **nine** gates at exit 0 against `62330b6` (the integrated tree): `format:check` ·
> `check` · `test` **616/616** · `test:scripts` **510/510** · `catalog:test` **875/875 / 118 files** ·
> `catalog:lint` · `catalog:typecheck` · `template:smoke` ("the four checks are green") · **`catalog:check` 0,
> `OK: notification, identity/single-tenant, tag, audit, attachment`**. That set is a **superset of this wave's
> eight** — same commands plus `template:smoke` — so the wave-3 Build gate requirement is satisfied on the tree
> that gets tagged. Do not schedule another run for it.
>
> **`032dff5` is therefore VERIFIED, not pending.** In that run the child's `pnpm check` passed 5/5 with the
> strings `prefer-nullish-coalescing` and `no-dynamic-delete` absent from the whole log, and the child's
> `test:db` genuinely ran — **71 files / 513 tests green, 66s** (child `test`: 224 files / 1593). A sweep for
> `notification-requested.handler.int-spec`, `Configuração de ambiente inválida`, `DATABASE_URL`, `REDIS_URL`,
> `WEB_ORIGIN`, `formatDateTime`, `FAIL` and `error TS` returned **zero occurrences**. The env crash is dead on
> the tree that ships.
>
> The Docker contention rule below stands as **policy for future concurrent runs**, but it was never exercised:
> both runs passed, so there was no red to adjudicate.

**Docker contention rule, agreed with the integrating session.** Both `catalog:check` runs raise Postgres via
testcontainers for the child's `test:db`. If **only one** of two concurrent runs fails at `test:db` and the
other passes, the leading hypothesis is **contention, not defect**, and the tiebreak is to re-run **one at a
time** on the integrated tree. No `test:db` red is accepted as truth without that. Symmetrically, this run's
`test:db` green is **not** strong evidence for the integrated tree — it ran in parallel and measured the wrong
tree besides.

#### § 0.8 — every catalog-facing gate line in this plan was wrong

Both workers independently hit it: `pnpm vitest run --project api <catalog path>` cannot match `catalog/**`
(project `api`'s include is `src/**/*.spec.ts`, and catalog specs must be **staged** first). Corrected to
`pnpm catalog:test -- <path>` in T39, T39a, T40 and the canonical Quick row. It fails **loudly** (exit 1,
`No test files found`), so it blocked rather than faked a pass — the distinction matters, and § 0.8 now
separates that *loud* failure mode from the *silent* one, which is the dangerous one.

#### Sibling-reported defect this feature must not lose

`scripts/template-smoke.mjs:71-73` still swallows `stderr` and logs only the status code. `d06a1a3` fixed the
cause of one case, **not the mechanism that hid it** — the next check that fails will fail mutely. Same family
as § 0.8, and worse: a gate that knows what went wrong and does not say.

**Next:** wave 4 (T42, exclusive). The integrated-tree gate is already satisfied — see the amendment above.

### Wave 4 — GATED GREEN (2026-08-24)

**C10 = T42 (exclusive).** Landed as **`ecba436`** — **one** commit, 15 files. The session first
produced a two-commit split (`51daeb3` + a bump follow-up); it was collapsed with
`git reset --soft df8233c`. `51daeb3` was never pushed and no longer exists — do not look for it.

**Build gate 8/8 GREEN** at `ecba436`: `check` · `test` **616/616** · `test:scripts` **545/545** ·
`catalog:test` **875/875** · `catalog:check` (`OK: notification, identity/single-tenant, tag, audit,
attachment`) · `catalog:typecheck` · `catalog:lint` · `format:check`. Zero drift from the wave-3
baselines. Tree clean; `catalog:check` cleans up its own `.catalog-stage`.

**What T42 did, against § 0.9:**

- The five `affects` corrected `>=1.0.0 <2.0.0` → `>=1.0.0 <2.0.1` at
  `docs/advisories/ADV-20260822-0{1..5}.md:5`, each justified in its own `## Contexto`.
- **`-04` was missing from `Touches`** — neither the task body (`:1419`) nor the Wave Plan row
  (`:360`) lists it, while Done-when 3 and § 0.9 both say *five*. The orchestrator ruled it in
  scope rather than let the worker stall on a plan defect. `-04` (T20) and `-02` (T34) were
  re-read before writing; nothing clobbered.
- The five `## [2.0.1]` CHANGELOG sections gained the real reason; T42's prettier bullet kept
  verbatim. `identity/single-tenant` phrased so it does not contradict its own `Sem advisory.`
- The five entries bumped `2.0.1` → `2.0.2`, each with a new `## [2.0.2]` section. **Not in the
  original plan** — see Finding 1.
- **`affects` deliberately stays `<2.0.1` and does not follow the bump.** The bump is what
  restores `2.0.1` to a single file set, so `2.0.1` stays unambiguous and outside the affected
  population. § 0.9's *"if T42 re-bumps, the upper bound follows the new version"* assumed a
  re-bump **because `2.0.1` was itself ambiguous**; it never was.

**FINDING 1 — § 0.9 contradicted itself, and only the gate caught it.** § 0.9 stated the bump rule
*"is satisfied at HEAD and will remain satisfied whatever T42 does"*, measured from
`git diff --name-only v2.3.0..HEAD -- catalog/` being empty. That held only for a T42 that touched
nothing under `catalog/` — while the same section instructed T42 to edit five
`catalog/<entry>/CHANGELOG.md`, which live **inside** the directories the rule watches. The edits
moved all five entries, `entryChangedWithoutBump` fired, and the first Build gate returned **6/8**
(`catalog:lint` 1, `catalog:check` 7). Both halves of § 0.9 were written from measurement; the
interaction between them was not. The owner chose to bump rather than weaken the rule.

**FINDING 2 — REL-04 is blind inside a pre-commit hook. This is a latent trap for everyone, not a
T42 artefact, and it needs its own task.** `lefthook-local.yml` runs `catalog-lint` on `pre-commit`
for glob `{catalog/**,docs/advisories/**,docs/dev/template-changelog.md}`.
`entryChangedWithoutBump` reads **`HEAD`** (`release-preflight.mjs:66,80`) — correct from CI and
from `release-preflight`, **wrong** in a pre-commit hook, where `HEAD` is the *parent* and the
staged fix is invisible. So a commit that edits an entry's `CHANGELOG.md` without moving its
version leaves the repo in a state where the **next** commit staging `catalog/**` cannot pass —
and the commit that repairs it is precisely the one blocked. `51daeb3` created that state; the
bump could not be committed on top of it. **Escaped without a bypass:** `git reset --soft df8233c`
put `HEAD` on a parent where `catalog/` is clean against `v2.3.0`, so `git diff --quiet` exits 0,
the rule returns `false` at `:69`, and the hook **ran and passed on its own merits** — no
`--no-verify`, no edit under `scripts/platform/**`. A session that had already pushed would have
had no clean exit. Fix belongs beside T33's 7 tests in
`scripts/platform/__tests__/entry-bump-lint.test.mjs`, which pin the `HEAD` semantics — **do not
fold it into another wave.**

**Next:** wave 5 (C11 = T43, exclusive — BRAND-04 harness taxonomy; it edits the rules this
workflow runs under).

### Wave 5 — GATED GREEN (2026-08-24)

**C11 = T43 (exclusive, sonnet).** Landed as **`b7a065e`** — one commit, 10 files, all inside T43's
`Touches`. Only `.agents/skills/**` paths were edited; the `.claude/skills/tlc-spec-driven` symlink
target was left alone (§ 0.3).

**Build gate 5/5 GREEN** at `b7a065e`: `check` (7/7 turbo tasks) · `test:scripts` **548/548**
(**+3** vs wave 4's 545 — the three new `harness-taxonomy.test.mjs` tests) · `catalog:typecheck`
(5 entries) · `catalog:lint` · `format:check`. The wave touches no `catalog/**` file, no module file
and no facade, so `full-unit` was not required and no conformance spec applies.

**What T43 did, against BRAND-04:**

- The pre-edit taxonomy is quoted in the commit body, as the task required: *"opus — only when the
  spec touches auth, payment, availability/booking rules, or data integrity (P0)."*
- All 8 sites now read *"auth, payment(s), data integrity, or a rule the product's own domain doc
  marks critical (P0)"* — the domain list is deferred to the product, not enumerated in the harness.
- **Done-when 5 executed**: the `SPEC_DEVIATION` exclusion of `docs/agents/harness.md` at
  `scripts/platform/__tests__/docs-no-owner-infra.test.mjs:10-14` is **removed**. Wave 1's
  deviation 2 is closed — T16's guard now scans the literal `docs/agents/**` its AC names.

#### Deviation recorded in wave 5 (input to the Verifier)

1. **`docs/agents/harness.md:31-33` — the rtk install instructions were reworded.** Unexcluding the
   file (Done-when 5) exposed a false positive: the instructions named the literal `~/.local/bin`,
   which `OWNER_INFRA_TERMS` flags. Reworded to *"onto your PATH"*. It is a generic tool-install
   path, unrelated to owner infrastructure, and the alternative — keeping the exclusion — is exactly
   what Done-when 5 forbids. The guard now runs with no exclusion at all.

**Next:** wave 6 (C12 = T44 → T45 → T46 → T47 — hooks truth + guard scan + the hygiene gate;
gate `full-unit`).

### Wave 6 — GATED GREEN (2026-08-24)

**C12 = T44 → T47 (sonnet).** Four atomic commits: T44 `a27613b` (5 tests), T45 `bb7b618`
(4 tests), T46 `98bd92f` (8 tests), T47 `f25f675` (docs, no test). Every path inside C12's
ownership; the foreign staged renames under `.specs/features/done/**` were left untouched.

**Build gate 6/6 GREEN** at `f25f675` (`full-unit`, the wave touches the test harness):
`check` (7/7 turbo tasks) · `test` **620/620 / 90 files** (+4 vs wave 4's 616) · `test:scripts`
**561/561** (+13 vs wave 5's 548) · `catalog:typecheck` (5 entries) · `catalog:lint` ·
`format:check`. No count dropped — no silent deletion.

#### Deviations recorded in wave 6 (input to the Verifier)

1. **`apps/api/src/modules/module-boundaries.spec.ts:587-598` — `SPEC_DEVIATION`.** Widening
   `KERNEL_SURFACE` to `apps/api/src/openapi` surfaced a pre-existing `identity` mention at
   `openapi-config.ts:29`. That file belongs to **T49 (BRAND-01, wave 8, `v3.0.0`)**, so C12 could
   not edit it; the worker allowlisted it through the same `TOKEN_ALLOWLIST` machinery already used
   for `test-db.ts`. **T49 must clear the allowlist entry when it renames the cookie** — otherwise
   `v3.0.0` ships a guard carrying a stale exemption.
2. **`scripts/platform/__tests__/brand-hygiene.test.mjs:61-69` — `SPEC_DEVIATION`.**
   `docs/dev/template-changelog.md:163`'s generic *"Cloudflare → Traefik"* example tripped the
   infra-noun scan. The file is unowned by C12 (it is T48's, wave 7), so the worker added a scoped
   `KNOWN_EXCEPTIONS` entry instead of editing it.
3. **Domain-noun scanning is live only in the self-tests, not in the end-to-end check.** Enabling it
   end to end tripped on `.claude/hooks/specs-in-english.mjs`, whose illustrative comment quotes
   domain nouns in Portuguese — again unowned by C12. T46's own *What* and commit message scope the
   active check to **brand + infra**, so the delivery matches the task; the Verifier must judge
   whether the requirement's AC demands domain coverage end to end. **If it does, this is a fix
   task, not a deviation.**

**Next:** wave 7 (C13 = T48, owner-gated — `git tag -l v2.3.0` now returns `v2.3.0`, so the
precondition is satisfied), then Verifier pass 1 over the `v2.4.0` scope.

### Wave 7 — GATED GREEN (2026-08-24). `v2.4.0` scope complete

**C13 = T48 (exclusive, owner-gated, sonnet).** Landed as **`5ea3e31`**. The precondition was
re-checked before the first edit: `git tag -l v2.3.0` returns `v2.3.0`. No tag, no push (AD-006).

**Build gate 5/5 GREEN** at `5ea3e31`: `check` (7/7 turbo tasks) · `test:scripts` **561/561**
(unchanged vs wave 6) · `catalog:typecheck` (5 entries) · `catalog:lint` · `format:check`.

**The three invariants held**, verified on the diff: `## v2.3.0` is byte-identical, `## v2.4.0`
remains the latest section (`release-preflight`, AD-034), and `### Child migration steps` is still
the literal `None — copier update is enough.` The task appended items 3–14 after the existing
item 1; it did not re-author the section.

#### Deviations recorded in wave 7 (input to the Verifier)

1. **`5ea3e31` carries one hunk that is not this feature's.** A concurrent session working in the
   same checkout had an uncommitted item 2 (the `AGENTS.md.jinja` / `README.md.jinja` Next-vs-Vite
   entry) sitting in `docs/dev/template-changelog.md`'s working tree. A pathspec-limited commit
   limits by **file**, not by hunk, so it landed inside T48's commit. The text was preserved
   verbatim and nothing was overwritten. **That session must be told its changelog line is already
   on `main` in `5ea3e31`**, or it will re-add a duplicate.
2. **T48's drafted item 4 named `MySQL` and `brand-hygiene.test.mjs` rejected it — correctly**, that
   is genuine owner infrastructure per T10. Reworded to `SyncLegacyModule` / `RUN_BACKFILL`. The
   guard shipped in wave 6 caught a real leak on its first live use.
3. **`KNOWN_EXCEPTIONS` anchor repaired**, `docs/dev/template-changelog.md:163` → `:228`: the append
   shifted the Cloudflare/Traefik row. Nothing else in that test file changed.

**Wave 7 closes the `v2.4.0` scope (T1–T48).** Next: Verifier pass 1 over the `v2.4.0` requirements,
then owner hand-off point 2 — the owner dispatches the release. Waves 8–14 (`v3.0.0`) do not start
until that tag exists (release boundary, § *Wave Plan*).

#### Open follow-up, deliberately NOT turned into a task in this feature

**The REL-04 pre-commit blindness (wave 4, Finding 2) is still live.** It is no AC of this spec, so
adding it here would have moved the `v2.4.0` boundary. It stays recorded in wave 4's Finding 2 and
in `.specs/STATE.md`, and it wants its own task beside T33's tests in
`scripts/platform/__tests__/entry-bump-lint.test.mjs`.

---

## Fix Round 1 (`v2.4.0` scope) — authored 2026-08-24 after Verifier pass 1 FAIL

Source: `validation.md` § *Fix Plans*. Two clusters, dispatched in parallel, then one Build gate,
then the **same Verifier resumed** with the fix range (round 2 of a 3-round bound).

**Fix 5 is deliberately NOT in this round.** The Verifier itself marked it *"Major, cross-feature —
ownership sits on the boundary between the two features; route it deliberately."* `apps/web-next`
belongs to the sibling feature `web-stack-next`, and that session holds uncommitted edits in this
same checkout. It gates no blocker: the default `web_stack=vite` path is unaffected. It needs an
owner ruling, not a worker. **Fix 6 is informational** — recorded so the `v3.0.0` pass does not
re-litigate TOOL-12 as new; no task.

### Cluster CF1 — the platform guard surface (sonnet)

Owns `scripts/platform/__tests__/**` **except** `hook-references.test.mjs` (CF2's), plus
`.claude/hooks/specs-in-english.mjs`.

#### FT1: The hygiene gate scans pilot-domain vocabulary end to end — **Blocker**

**What**: `brand-hygiene.test.mjs` defines `OWNER_DOMAIN_TERMS` (`:27-35`) and `domainHits`
(`:75-86`) but never calls them from the end-to-end loop (`:183-198`), which runs `brandHits` and
`infraHits` only. A rendered child carrying `Hospedes`, `Reservas`, `agendamento`, `quartos`,
`guests` passes the gate — that is Verifier mutant 6, the one that survived.
**Where**: `scripts/platform/__tests__/brand-hygiene.test.mjs:183-198`
**Touches**: `scripts/platform/__tests__/brand-hygiene.test.mjs`, `.claude/hooks/specs-in-english.mjs`
**Done when**:
- [ ] The end-to-end loop calls `withoutKnownExceptions(domainHits(text), rel)` alongside the brand
      and infra scans
- [ ] The known blocker is resolved: `.claude/hooks/specs-in-english.mjs`'s illustrative comment
      quotes domain nouns in Portuguese. **Reword it if the hook still reads as its own
      documentation without them; add a scoped `KNOWN_EXCEPTIONS` entry only if it does not** — that
      hook's purpose is to demonstrate non-English prose, so an exception may be the honest answer.
      Whichever is chosen, justify it in the commit body.
- [ ] A new test seeds each of the five nouns above into a rendered child and asserts the gate fails
      on every one — the mutant must die
- [ ] Gate passes: `pnpm test:scripts`
**Gate**: quick · **Commit**: `fix(hygiene): scan pilot-domain vocabulary end to end`

#### FT2 – FT8: one guard assertion per proof-downgraded requirement — **Major**

**What**: the spec's traceability declares `test` for RUN-02, LOC-02, LOC-06, SEAM-07, TOOL-09,
TOOL-10 and (partly) BRAND-06, but T7, T9, T10, T14, T15, T24, T32 and T38 shipped
`Tests: none · Gate: build`. Every outcome is correct on disk today — the Verifier confirmed each by
inspection — but nothing fails if it regresses. One atomic commit per requirement.

| Task | Requirement | The assertion to write |
| --- | --- | --- |
| FT2 | BRAND-06 | the compose / `docker-entrypoint.dev.sh` half of the backfill scan |
| FT3 | RUN-02 | the Redis credential match |
| FT4 | LOC-02 | the single-language-home reference set |
| FT5 | LOC-06 | the favicon route |
| FT6 | SEAM-07 | the `main.ts` ownership row |
| FT7 | TOOL-09 | the workflow / deploy doc-vs-pipeline cross-check |
| FT8 | TOOL-10 | the four-source platform matrix |

**Touches**: files under `scripts/platform/__tests__/` — co-locate with the existing guard of the
same requirement where one exists, otherwise name a new file. **Never `hook-references.test.mjs`.**
**Done when** (each): the assertion fails when the shipped outcome is reverted by hand — prove it,
do not assume it · `pnpm test:scripts` green · one commit per task.
**Gate**: quick · **Commit**: `test(<area>): guard <REQ-ID>`

### Cluster CF2 — LOC-01 and the half-guarded ACs (sonnet)

Owns `docs/agents/issue-tracker.md.jinja`, `scripts/platform/__tests__/hook-references.test.mjs`,
and any new test file it names under `scripts/platform/__tests__/` that CF1's table does not claim.

#### FT9: LOC-01 — `issue-tracker.md.jinja` stops hardcoding the locale — **Blocker**

**What**: `:21` reads *"Issue titles and bodies are in **pt-BR**"*. LOC-01 names this file as one of
the four the locale must thread through, and it is a `.jinja` file, so it can interpolate. A
`product_locale=en` child is told to file issues in pt-BR.
**Where**: `docs/agents/issue-tracker.md.jinja:21`
**Done when**:
- [ ] The literal is replaced by `{{ product_locale }}`, or the sentence points at the canonical
      statement the way `code-quality.md:12,47` and `communication.md:9` already do — match whichever
      shape those two files established; do not invent a third
- [ ] The assertion LOC-01 lacks is added, and it covers **all four** files the requirement names
- [ ] **Verify the absence of change at `product_locale=pt-BR`** — a child without the key must see
      no shipped string move (Verifier notes, the locale-default rule)
- [ ] Gate passes: `pnpm test:scripts`
**Gate**: quick · **Commit**: `fix(docs): thread product_locale through issue-tracker`

#### FT10 – FT12: the three half-guarded ACs — **Minor**

| Task | AC | What is missing |
| --- | --- | --- |
| FT10 | BRAND-03 | the `gh label list` discovery placeholder satisfies the shipped shape (wave-1 deviation 1, adjudicated) but nothing asserts the placeholder mechanism or the closed-list rule |
| FT11 | SEAM-03 | `registerAppGuard` is tested; the "no edit to `shell.tsx` / `main.tsx` / `app-providers.tsx`" claim lives only in `catalog/identity/single-tenant/README.md:315,375` |
| FT12 | TOOL-07 | `hook-references.test.mjs` walks hooks only; the AC also says "or handbook" |

**Done when** (each): one commit · `pnpm test:scripts` green · **if an assertion cannot be written
without editing `apps/web*/**` or a catalog entry's source, STOP and report instead of expanding** —
that is a plan decision, not a worker's.
**Gate**: quick · **Commit**: `test(<area>): guard <AC-ID>`

### Cluster CF3 — FT13: the stale handbook reference the new guard found (haiku)

**What**: FT12's guard, run against real repo content, surfaced two pre-existing stale handbook
references and parked both as named `KNOWN_HANDBOOK_EXCEPTIONS`. One is a genuine defect:
`docs/test/testing.md:24` names `scripts/lessons.py`, whose real path is
`.agents/skills/tlc-spec-driven/scripts/lessons.py`. Leaving it excepted turns a real defect into
permanent debt inside the guard that was written to catch it.
**Where**: `docs/test/testing.md:24`
**Touches**: `docs/test/testing.md`, `scripts/platform/__tests__/hook-references.test.mjs`
**Done when**:
- [ ] `docs/test/testing.md:24` names the path that exists on disk — confirm it before writing
- [ ] That file's `KNOWN_HANDBOOK_EXCEPTIONS` entry is **removed**, so the guard covers it for real
- [ ] The `docs/advisories/README.md:20` entry **stays** — it is a YAML-example placeholder, not a
      stale reference, and its exception is the correct answer
- [ ] Gate passes: `pnpm test:scripts`
**Gate**: quick · **Commit**: `fix(docs): name the real lessons.py path in testing.md`

### Fix Round 1 — GATED GREEN (2026-08-24)

Authored after Verifier pass 1 FAIL. Three clusters, 13 atomic commits, `ac679f5..bace8cc`.

| Cluster | Tasks | Commits | Worker's own gate |
| --- | --- | --- | --- |
| CF1 (sonnet) | FT1 → FT8 | `be83c29`, `f25c6d7`, `cfaa67d`, `6642416`, `0af4f1f`, `a78f80b`, `ae02a10`, `b69eb3a` | `pnpm test:scripts` 592/592 |
| CF2 (sonnet) | FT9 → FT12 | `8ea4a96`, `4dadc14`, `6e17d14`, `41e1e83` | `pnpm test:scripts` exit 0 |
| CF3 (haiku) | FT13 | `bace8cc` | `pnpm test:scripts` 592/592 |

**Build gate 5/5 GREEN** at `bace8cc`: `check` (7/7 turbo tasks) · `test:scripts` **592/592**
(**+31** vs wave 7's 561) · `catalog:typecheck` (5 entries) · `catalog:lint` · `format:check`.

**Both blockers are closed.**

- **FT1 (`be83c29`) kills surviving mutant 6.** The end-to-end loop now runs
  `withoutKnownExceptions(domainHits(text), rel)` beside the brand and infra scans, and a new test
  seeds all five nouns (`Hospedes`, `Reservas`, `agendamento`, `quartos`, `guests`) and asserts the
  gate fails on every one. **This resolves wave-6 deviation 3 the way the Verifier ruled it** — the
  AC did demand domain coverage end to end.
- **FT9 (`8ea4a96`) closes LOC-01.** `docs/agents/issue-tracker.md.jinja:21` now points at the
  canonical rule in `AGENTS.md` instead of hardcoding `pt-BR` — the shape `code-quality.md:12,47`
  and `communication.md:9` already used, not a third invention. The new `locale-threading.test.mjs`
  covers all four LOC-01 files, two of them by render, and proves **no string moves at
  `product_locale=pt-BR`** (the locale-default rule from the Verifier notes).

**Every new assertion was proven by hand-reverting the shipped outcome and watching it go red**,
across all 13 tasks — mutation-style proof, not assumption.

#### Deviations recorded in Fix Round 1 (input to the Verifier)

1. **FT1 — `docs/dev/template-changelog.md` added to `KNOWN_EXCEPTIONS`.** Switching the domain scan
   on end to end produced one genuine hit: the word *"booking"*. The file is a meta-document about
   the template's own history, not shipped product prose, so it was excepted rather than reworded.
   **Judge the exception, not just the fix** — it is the one place the new scan is deliberately
   blind.
2. **FT12 surfaced two pre-existing stale handbook references**, both parked as named
   `KNOWN_HANDBOOK_EXCEPTIONS`. **FT13 (`bace8cc`) fixed the real one** —
   `docs/test/testing.md:24` named `scripts/lessons.py` whose real path is
   `.agents/skills/tlc-spec-driven/scripts/lessons.py` — and removed its exception, so the guard now
   covers that file for real. The second, `docs/advisories/README.md:20`, is a YAML-example
   placeholder; its exception stays and is correct.
3. **FT11 proves SEAM-03 statically.** A full `module add` needs `pnpm install` + `pnpm contract`
   and costs minutes, so the guard asserts instead that the identity entry ships no `shell.tsx` /
   `main.tsx` / `app-providers.tsx` and that `webRootFor` never resolves there.

**Not fixed in this round, by decision:** *Fix 5* (this feature's web seams exist only in the Vite
shell, so a `web_stack=next` child loses LOC-03/LOC-06/SEAM-04) — the Verifier marked it
*cross-feature* and asked for it to be routed deliberately; `apps/web-next` is the sibling feature's
surface and gates no blocker, the default `web_stack=vite` path being unaffected. **It needs an
owner ruling.** *Fix 6* (TOOL-12) is informational and was recorded, not worked.

**Next:** Verifier pass 1, round 2 — the same Verifier resumed with the fix range `ac679f5..bace8cc`.

### Verifier pass 1, round 2 — PASS (2026-08-24). `v2.4.0` is verification-clean

**41/43 ACs covered, 0 failed, 2 flagged** (CAT-05 owner-gated, TOOL-12 spec-adjudicated); 11
requirements moved from flagged/failed to covered. **Final gate 8/8 exit 0**: `test:scripts` **592**
(+31), `test` 620/90, coverage 760/105 at 96.5/94.4/94.9/96.8 over a floor of 90. **1212 tests
against a 930 pre-feature baseline.** **Sensor 7 injected, 7 killed** — cumulative 12/13 across both
rounds. Report: `validation.md`.

**Both blockers closed by mutation, not by assertion.**

- Round 1's surviving mutant 6 was re-run verbatim and now **dies**. FT1's seeded-noun test shares
  the same `violationsIn()` path as the end-to-end scan, so the blindness pattern cannot recur.
- Reverting `issue-tracker.md.jinja:21` to the hardcoded locale goes red. The default-render
  assertion at `locale-threading.test.mjs:125-129` upgrades the pt-BR absence-of-change edge case
  from inferred to asserted.

**The workers' hand-revert claims were spot-checked, not taken on faith** — redis credential,
`RUN_BACKFILL`, lefthook chain order, the nginx favicon block and FT13's `lessons.py` path were each
reverted independently, and each went red.

**The `booking` exception is ACCEPTED, with a caveat that is now an owner follow-up.** It is that
file's only domain hit (`:515`'s `attends_guests` does not match `/\bguests?\b/i`, so nothing is
masked), it is meta-prose about the template's own history, and it is scoped to one file and one
term. **But wave-7 deviation 2 set the opposite precedent** — there the worker reworded `MySQL`
rather than excepting it — **and the changelog grows every release, so the exception is a widening
blanket.** Follow-up: reword `docs/dev/template-changelog.md:67` and drop the exception.

**Open, and deliberately not counted against this pass:** *Fix 5* — confirmed that no `v2.4.0` AC
fails because of it; LOC-03, LOC-06 and SEAM-04 all pass on the default `vite` shell. It still needs
an owner ruling before a `web_stack=next` child is shipped. *CAT-05* — owner hand-off point 2.
*TOOL-12* — spec-adjudicated, recorded so the `v3.0.0` pass does not re-litigate it.

**Execute is complete for the `v2.4.0` scope. The next act is the owner's**: dispatch the release
(an empty `chore(release): v2.4.0` marker; the agent never tags and never pushes — AD-006/AD-034).
Waves 8-14 (`v3.0.0`) do not start until that tag exists.

---

## Fix Round 2 — the three items left open at the `v2.4.0` tag (authored 2026-08-24)

Authored on the owner's instruction after `v2.4.0` was dispatched (marker `aed1802`). None of these
gated the tag; all three land after it and ship in the next release. Three clusters, disjoint file
sets, dispatched in parallel.

### Cluster CG1 — the Next shell gets the seams the Vite shell already has (sonnet)

`validation.md` § *Fix 5*. `copier.yml:154-158` offers `web_stack` (default `vite`, choices
`[vite, next]`), but T23–T27 built the seams in `apps/web-vite` only, so a `web_stack=next` child
loses **LOC-03, LOC-06 and SEAM-04**. Mirror the seam, not the implementation: Next has its own
router and its own env convention (`NEXT_PUBLIC_*`, not `VITE_*`). Read the Vite shell first and
carry across **what the requirement asks for**, not the file layout.

Owns `apps/web-next/**` and the new parity test.

| Task | Requirement | What is missing in `apps/web-next` |
| --- | --- | --- |
| GT1 | LOC-06 | no favicon — `public/` holds only `.gitkeep` |
| GT2 | SEAM-04 | no `product-routes.tsx`, no `registerProtectedRoute` |
| GT3 | LOC-03 | no `VITE_APP_NAME` / `VITE_LOCALE` equivalent; `apps/web-next/src/shared/config/routes.ts:6` tells the product to edit `routes.ts` directly, which is the seam the requirement exists to remove |
| GT4 | all three | a guard asserting the two shells stay at parity on these three seams, so the next shell cannot silently drift again |

**Done when** (each): the seam works in the Next shell the way the requirement words it · one commit
per task · GT4's guard fails when any one of GT1–GT3 is reverted — prove it.
**Gate**: `pnpm test:scripts`, plus the web-next unit project if the task adds a component test.

### Cluster CG2 — the `booking` exception stops being a widening blanket (sonnet)

`validation.md` § round 2. FT1 excepted `docs/dev/template-changelog.md` from the domain scan for a
genuine `booking` hit. The Verifier accepted it but flagged the precedent: **wave-7 deviation 2 did
the opposite in an identical case** — the worker reworded `MySQL` rather than excepting it — and the
changelog grows every release, so the exception widens with it.

#### GT5: reword the hit and drop the exception

**Where**: `docs/dev/template-changelog.md:67`
**Touches**: `docs/dev/template-changelog.md`, `scripts/platform/__tests__/brand-hygiene.test.mjs`
**Done when**:
- [ ] `:67` no longer contains the domain term, and the sentence still says what it said — this is a
      historical record; **do not restate the history, only de-brand the wording**
- [ ] The file's `KNOWN_EXCEPTIONS` entry is removed and the end-to-end scan covers it for real
- [ ] `:515`'s `attends_guests` is confirmed still not matching `/\bguests?\b/i` — if the reword
      changes that, say so rather than widening the pattern
- [ ] Gate passes: `pnpm test:scripts`
**Commit**: `fix(changelog): de-brand the v2.4.0 entry and drop its hygiene exception`

### Cluster CG3 — REL-04 stops being blind inside a pre-commit hook (opus)

Wave 4, Finding 2, and the last item the handoff carried with no task. `lefthook-local.yml` runs
`catalog-lint` on `pre-commit` for `{catalog/**,docs/advisories/**,docs/dev/template-changelog.md}`.
`entryChangedWithoutBump` reads **`HEAD`** (`release-preflight.mjs:66,80`) — right from CI and from
`release-preflight`, **wrong** in a pre-commit hook, where `HEAD` is the *parent* and the staged fix
is invisible. **A commit that edits an entry's `CHANGELOG.md` without moving its version leaves the
repo in a state where the next commit staging `catalog/**` cannot pass — and the commit that would
repair it is precisely the one blocked.** `51daeb3` created that state on 2026-08-24; the escape was
`git reset --soft` onto a parent where `catalog/` was clean, not a bypass.

#### GT6: the bump rule reads the state being committed, not the parent

**Where**: `scripts/platform/release-preflight.mjs:66,80`
**Touches**: `scripts/platform/release-preflight.mjs`,
`scripts/platform/__tests__/entry-bump-lint.test.mjs`, `lefthook-local.yml` if the fix needs it
**Done when**:
- [ ] The rule compares against the state actually being committed when it runs inside a hook, and
      keeps its current `HEAD` semantics from CI and from `release-preflight` — **both callers stay
      correct; do not fix one by breaking the other**
- [ ] A test reproduces the trap as it happened: an entry `CHANGELOG.md` edited with no version
      move, then a second commit staging `catalog/**` — it must pass now and must fail against the
      unfixed rule. Put it beside T33's 7 tests, which pin the `HEAD` semantics
- [ ] Gate passes: `pnpm test:scripts` and `pnpm catalog:lint`
**Commit**: `fix(release): make the entry-bump rule see staged state in a pre-commit hook`

### Cluster CG4 — every job that runs `pnpm test:scripts` provisions `copier` (sonnet)

**Found by the failed `v2.4.0` release run `32795089578`**, which is the only reason this is known:
`Verify` returned `pnpm test:scripts` **577/592, 15 failures**, every one of them
`copier copy falhou: undefined` with `status === null` — the binary is absent, so the spawn never
ran. The 15 are the render-based tests **Fix Round 1 itself added**: `brand-hygiene.test.mjs`
(64-72, whose `before` hook renders the child, so even its self-tests fail) and
`locale-threading.test.mjs` (363-368). Local runs are green because the workstation has `copier`
installed. **The gate was green locally and red in CI for one reason: an unprovisioned tool.**

#### GT7: install `copier` wherever `pnpm test:scripts` runs, and guard it

**Where**: `.github/workflows/release.yml:50` (`verify` job) and `.github/workflows/ci.yml:132`
(`gates` job) — both run `pnpm test:scripts`; neither installs `copier`. Only `ci.yml:187`
(`catalog`), `ci.yml:207` (`smoke`) and `release.yml:99` (`catalog`) do.
**Touches**: `.github/workflows/release.yml`, `.github/workflows/ci.yml`,
`scripts/platform/__tests__/workflow-copier-provisioning.test.mjs` (new)
**Done when**:
- [ ] Both jobs install `copier` before the step that needs it, matching the existing
      `- run: pipx install copier` line verbatim — do not introduce a second provisioning style
- [ ] A guard asserts the invariant rather than the two line numbers: **every workflow job whose
      steps run a command that renders a child must provision `copier`**. Derive the set from the
      workflow files, so a job added later is covered without editing the test
- [ ] The guard fails when either `pipx install copier` line is removed — prove it
- [ ] Gate passes: `pnpm test:scripts`
**Commit**: `fix(ci): provision copier in every job that runs the script tests`

### Fix Round 2 — GATED GREEN (2026-08-24/25)

Four clusters, 11 commits, `bb65eb0..eda2a12`. Authored on the owner's instruction after `v2.4.0`
was dispatched; CG4 was added mid-round because the release itself found the defect.

| Cluster | Tasks | Commits | Worker's own gate |
| --- | --- | --- | --- |
| CG1 (sonnet) | GT1 → GT4 | `62c7775`, `97d6cab`, `f50b511`, `eda2a12` | web-next unit + `pnpm test:scripts` 605/605 |
| CG2 (sonnet) | GT5 | `bb65eb0` | `pnpm test:scripts` 592/592 |
| CG3 (opus) | GT6 | `15a4fc2` | `pnpm test:scripts` 600/600 · `catalog:lint` exit 0 |
| CG4 (sonnet) | GT7 | `a77d17c` | `pnpm test:scripts` 594/594 |

**Build gate 6/6 GREEN** at `eda2a12`: `check` (7/7) · `test` **620/620 / 90 files** · `test:scripts`
**605/605** (+13 vs the round's start) · `catalog:typecheck` · `catalog:lint` · `format:check`.

**All three open items are closed, and a fourth was found by shipping.**

- **GT5 (`bb65eb0`)** de-branded `docs/dev/template-changelog.md:67` and removed its `KNOWN_EXCEPTIONS`
  entry, so the domain scan now covers the file for real. `:515`'s `attends_guests` was re-checked
  and still does not match `/\bguests?\b/i` — no pattern was widened.
- **GT6 (`15a4fc2`)** closed the REL-04 trap. `entryChangedWithoutBump` gained a
  `"head" | "staged"` mode; staged compares with `git diff --cached <tag>` and reads the index via
  `git show :<path>`. The default comes from an unset `PLATFORM_ENTRY_BUMP_STATE`, so **CI and
  `release-preflight` are byte-identical to before**; an unknown value throws rather than falling
  back silently. `lefthook-local.yml` sets the variable only on the `pre-commit` catalog-lint
  command. The test builds a real git repo and reproduces the 2026-08-24 incident; three of its six
  new tests go red against the unfixed rule while T33's seven stay green.
- **GT1–GT4 (`62c7775`…`eda2a12`)** gave the Next shell the three seams it lacked, mirroring the
  requirement rather than the Vite file layout: `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_LOCALE` instead
  of a port of `import.meta.env`, and Next's own `title.template` composition instead of Vite's
  `pageTitle()` helper. GT4's parity guard was proved by reverting each of the three seams in turn.

#### FINDING — the local gate and the CI gate were not measuring the same machine

**The `v2.4.0` release run `32795089578` FAILED, and it failed on this feature's own work.** `Verify`
returned `pnpm test:scripts` **577/592, 15 failures**, every one `copier copy falhou: undefined` with
`status === null` — the binary was absent, so the spawn never ran. The 15 were exactly the
render-based tests **Fix Round 1 added**: `brand-hygiene.test.mjs` 64-72 (its `before` hook renders,
so even the self-tests fell) and `locale-threading.test.mjs` 363-368. No product defect was involved.

`copier` was provisioned only in `ci.yml:187` (`catalog`), `ci.yml:207` (`smoke`) and
`release.yml:99` (`catalog`) — **not** in the two jobs that actually run `pnpm test:scripts`
(`release.yml` `verify`, `ci.yml` `gates`). **GT7 (`a77d17c`)** installs it in both and guards the
invariant by deriving the set of jobs from the workflow files rather than pinning line numbers.

**Two things this cost, both worth keeping:**

1. **Every Build gate and the Final gate in this feature ran only on the workstation**, where
   `copier` sits at `/opt/homebrew/bin/copier` (9.17.2) — Homebrew, outside any repo-managed
   toolchain. A gate that is green locally and red in CI is not noise; it is the gate measuring the
   wrong machine. The Verifier's Final gate had the same blind spot.
2. **Follow-up, no task**: the failure surfaced as `copier copy falhou: undefined` instead of
   "copier is not installed". Nothing in the repo declares `copier` a prerequisite for
   `pnpm test:scripts`, so a fresh developer machine reproduces these 15 failures with the same
   unhelpful message. A named precondition check would have turned a release failure into one line.

### Cluster CG5 — GT8: pin the copier CI provisions (sonnet)

**Found by Verifier round 3, item 4 — a risk GT7 introduced while fixing a different one.** GT7
installs `copier` **unpinned** (`pipx install copier`) in every job that renders a child, while
**TOOL-13's guarantee was derived empirically from copier 9.17.2**
(`scripts/platform/__tests__/copier-questions.test.mjs:78`). A copier release that changes render
behaviour would break the pipeline, or worse, silently shift what a rendered child contains — and the
test that would notice is the one whose expectations came from the old version.

**Touches**: `.github/workflows/ci.yml`, `.github/workflows/release.yml`,
`scripts/platform/__tests__/workflow-copier-provisioning.test.mjs`
**Done when**:
- [ ] Every `pipx install copier` in both workflows pins the version — `pipx install 'copier==9.17.2'`
      — matching the version the workstation validated against and TOOL-13 derived from
- [ ] The provisioning guard from GT7 additionally asserts the pin is present and that **all**
      provisioning sites agree on one version, so a future job cannot be added at a different one
- [ ] The guard goes red when any pin is dropped or made to disagree — prove both
- [ ] Gate passes: `pnpm test:scripts`
**Commit**: `fix(ci): pin copier to the version TOOL-13 was derived from`

### Fix Round 2, addendum — GT8 (2026-08-25)

**CG5 = GT8 (sonnet), `0e01a00`.** `pnpm test:scripts` **607/607**. Verifier round 3 item 4: GT7 had
fixed one risk and introduced another by installing `copier` unpinned, while TOOL-13's guarantee was
derived empirically from **9.17.2** (`copier-questions.test.mjs:78`, provenance comment at `:62`).

**All five provisioning sites** — `ci.yml` (`gates`, `catalog`, `smoke`) and `release.yml`
(`verify`, `catalog`) — are pinned to `'copier==9.17.2'`. GT7's guard was **extended in place**, not
duplicated: it now also asserts a pin exists at every site and that all sites agree on one version,
scanning every job rather than only the ones matching the render pattern. Proved red both ways —
a dropped pin gives 3 failures, two sites disagreeing gives 2.

### Verifier round 3 (post-hoc) — PASS

Judged `bb65eb0..6813df7`, work that **was already inside the `v2.4.0` tag**. Sensor 6 injected,
6 killed (cumulative 19/18). The Verifier **deliberately did not re-run the workstation Final gate**
— that instrument is what over-reported — and took CI at `6813df7` (8/8, copier provisioned) as the
authority for a shipped tag.

**Fix 5 is closed**: LOC-03, LOC-06 and SEAM-04 hold on `web_stack=next`. The favicon is
byte-identical to Vite's (md5 `563abc664dca79dd4f09faa8d6b5350a`, 137 B); `NEXT_PUBLIC_*` is
build-time-inlined exactly as Vite's `import.meta.env.VITE_*`, so mirroring rather than porting was
the right call; `registerProtectedRoute` reaches both consumers the AC names (`last-location.ts:10,17,24`,
`auth-redirect.ts:14`). GT5 and GT6 confirmed — GT6's head-mode git arguments are byte-identical to
pre-GT6, and `attends_guests` is proven not to match `/\bguests?\b/i`.

**On the environment finding, the Verifier's own judgement:**

1. **Reproduced.** Stripping `/opt/homebrew/bin` from `PATH` gives **605 / 590 pass / 15 fail**. The
   failing set is the **entirety of two files**, including their copier-independent assertions — a
   dead `test.before()` takes the whole file down.
2. **It does not invalidate the other 41 requirements** (the 590 copier-independent tests ran the
   same in CI). **It does invalidate a sentence round 2 asserted**: *"the pattern that let round 1's
   mutant survive cannot recur."* Both round-2 blocker closures were **100 % dark in CI** for the
   whole window until GT7. The assertions were sound; the enforcement was absent.
3. **Nothing else is exposed.** `renderChild` takes an injectable `run`, so only 2 of the 7 files
   referencing it hit the real binary; the rest stub it.
4. **A workstation Final gate is structurally blind to provisioning gaps**, and the countermeasure
   costs one command: hide the binary and re-run. That is how the Verifier reproduced it.

Lessons L-038, L-039, L-040 recorded.

### Fix Round 3 — what shipped broken in `v2.4.0`, and the gate that let it (2026-08-25)

**CI run `32797563529` on `53c11a6` FAILED, and the pattern is exact: every `next` variant red,
every `vite` variant green.** `template:smoke (next)` exit 7:
`apps/web (--web-stack next) não deveria conter "VITE_" — encontrado em
apps/web/src/_app/layout/root-layout.tsx`. The five `catalog:check (* / next)` entries fell for the
same reason. **This is inside the `v2.4.0` tag** — GT3 (`f50b511`) shipped it.

#### GT9: the Next shell carries no `VITE_` literal, comment or not (haiku)

**What**: `apps/web-next/src/_app/layout/root-layout.tsx:11` documents the parallel to the Vite shell
in a comment — *"Mesmo seam de `VITE_APP_NAME`/`VITE_LOCALE`"*. `assertWebShell` (ACC-06) rejects any
`VITE_` occurrence in a rendered `next` child, comments included, and it is right to: the string is
what a product greps for. **The code was correct; the comment was the defect.**
**Touches**: `apps/web-next/**`
**Done when**:
- [ ] No `VITE_` literal survives anywhere under `apps/web-next/**` — sweep, do not fix only `:11`
- [ ] The comment still explains the seam; name the Vite variables without writing the prefix, or
      point at the Vite file instead of quoting it
- [ ] `node scripts/template-smoke.mjs --web-stack next` exits 0 — **run it, this is the gate that
      caught it and the unit tests did not**
**Commit**: `fix(web-next): drop the VITE_ literal the next shell must never carry`

#### GT10: the release gate stops being weaker than CI (sonnet)

**What**: **`release.yml` never runs `template:smoke` and its `catalog:check` matrix has no
`web_stack` dimension**, while `ci.yml` has both. So the release Verify job cannot see a defect that
only affects the non-default shell — which is precisely how GT3's leak reached a tag while its own
release run reported 8/8 green. **A release gate weaker than the branch gate certifies less than the
branch it ships.**
**Touches**: `.github/workflows/release.yml`, a new guard under `scripts/platform/__tests__/`
**Done when**:
- [ ] The release `verify` job runs `template:smoke` for **every** `web_stack` choice, and
      `catalog:check` gains the same `web_stack` dimension `ci.yml` uses
- [ ] A guard asserts the invariant, not the current lists: **every check `ci.yml` performs on
      `push: main`, the release workflow also performs**, across both the command set and the matrix
      dimensions. Derive both from the workflow files so a check added to CI later cannot silently
      go missing from the release
- [ ] The guard goes red when a command or a matrix dimension is removed from the release side —
      prove both
- [ ] Gate passes: `pnpm test:scripts`
**Commit**: `fix(ci): the release gate covers everything the branch gate covers`
