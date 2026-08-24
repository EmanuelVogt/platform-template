# Prettier Format Gate Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Spec**: `.specs/features/prettier-format-gate/spec.md`
**Design**: skipped (Medium scope, no architectural decision — the seam questions were resolved in the spec's Assumptions table, owner-confirmed 2026-08-23)
**Status**: Amended 2026-08-23 — Execute pending serialization

**Blocked until**: nothing on the tag. The `v2.3.0` gate is **lifted by owner decision, 2026-08-23**:
the feature ships *inside* `v2.3.0` instead of behind it. The spec's original rationale — "a repo-wide
mechanical diff inside the `template-update-contract` Verifier's range would drown its audit" — is
spent: that feature closed with Verifier PASS round 2, 33/33 ACs. The owner was shown the cost and
reaffirmed. Consequence, accepted: `release-preflight.mjs:47-55` (`entryChangedWithoutBump`) refuses a
release when a catalog entry's tree changed since the previous tag without a `module.json` bump, and
T8 changes all five entry trees — so **T12 is added** to bump them. Every child will see five modules
"behind" for a purely cosmetic change; that is the price of putting the reformat in this tag.

**Dispatch precondition (not a task).** `audit-2026-08-23-remediation` is executing in this same
checkout — 14 waves, wave 1 live as of `92b4120`. T7/T8 rewrite the whole tree, so no wave of either
feature is safe against them, and a worktree does not help: a whole-tree mechanical reformat conflicts
on merge with every file the sibling touched. The two MUST serialize and **this feature goes first** —
that feature's `tasks.md:2353` records RUN-04 as `satisfied-by-sibling` and "asserts only that
`pnpm format:check` is green at its HEAD", so its Verifier cannot pass until this one lands. Known
file collisions with it, all in its later waves: root `package.json` (its T33–T36, wave 3), the five
`module.json` + `CHANGELOG.md` (its T42, wave 4, exclusive), `lefthook-local.yml` (flagged at its
`tasks.md:93`). The double bump is correct, not a conflict: `2.0.0` -> `2.0.1` here for `v2.3.0`, then
its T42 bumps again for `v2.4.0`.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `docs/code-quality.md`, `docs/test/testing.md`, `AGENTS.md.jinja`, `vitest.coverage.mts`, and the `node:test` convention of `scripts/platform/__tests__/*.test.mjs`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Repo configuration (`.prettierrc`, `.prettierignore`, `.vscode/settings.json`, `package.json` scripts) | none | build gate only — the config either loads or it does not | — | `pnpm format:check` |
| Template tooling invariant (`scripts/platform/**`) | unit | the guard asserts the **defect class** (a config path that does not exist), never the single instance | `scripts/platform/__tests__/*.test.mjs` (`node:test` + `node:assert/strict`) | `pnpm test:scripts` |
| Copier delivery surface (`copier.yml` `_exclude`) | unit | both directions — what must not ship stays out, what must ship stays in | `scripts/platform/__tests__/copier-delivery.test.mjs` | `pnpm test:scripts` |
| Hook / CI configuration (`lefthook-local.yml`, `.github/workflows/*.yml`) | none | gate only — proven by the gate running red on an unformatted file | — | `pnpm format:check` |
| Mechanical reformat (whole tree, `catalog/**`) | none | gate only | — | `pnpm format:check` |
| Docs / changelog | none | — | — | — |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After a task with unit tests | `pnpm test:scripts` |
| Full | Not applicable — this feature has no integration/e2e surface | `pnpm test:scripts` |
| Build | Once per wave, by the orchestrator through the runner | `pnpm check && pnpm test:scripts` (waves 3–5 append `&& pnpm format:check`) |
| Final | Once, at the Verifier | `pnpm check && pnpm test && pnpm test:scripts && pnpm catalog:lint && pnpm catalog:typecheck && pnpm format:check` |

Every wave here is config/tooling/CI only, so no wave is `full-unit`: the Build gate stays `pnpm check` + the scripts suite. `pnpm test` (the Vitest projects) is untouched by this feature and runs once, at the Final gate.

---

## Wave Plan

Waves run in order (barrier + Build gate between them). Clusters inside a wave run **in parallel**, one worker each; tasks inside a cluster run in the listed order. Exclusive waves hold one task and nothing else in flight.

| Wave | Cluster | Tasks (in order) | Files (union of Touches) | Notes |
| --- | --- | --- | --- | --- |
| 1 | C1 | T1 → T2 → T3 → T4 → T5 | `.prettierrc`, `.vscode/settings.json`, `catalog/notification/api/infrastructure/mailer/email-theme.ts`, `package.json`, `.prettierignore`, `scripts/platform/__tests__/prettier-config.test.mjs` | purge the ghost + make prettier runnable · gate: scoped |
| 2 (exclusive) | C2 | T6 | `package.json`, `pnpm-lock.yaml` | lockfile · gate: scoped |
| 3 (exclusive) | C3 | T7 | everything the checked set matches **outside** `catalog/**` | mechanical reformat · gate: scoped + `format:check` |
| 4 (exclusive) | C4 | T8 → T12 | `catalog/**`, incl. the 5 `module.json` + their 5 `CHANGELOG.md` | mechanical reformat, then the version bumps it forces · advisory trailer on both commits · gate: scoped + `format:check` + `catalog:lint` |
| 5 | C5 | T13 → T9 → T10 → T11 | `lefthook-local.yml`, `.github/workflows/format.yml`, `copier.yml`, `scripts/platform/__tests__/copier-delivery.test.mjs`, `scripts/template-smoke.mjs`, `docs/dev/template-changelog.md`, `docs/agents/harness.md` | arm the gate, last · gate: scoped + `format:check` |

```
Wave 1:  [C1: T1 → T2 → T3 → T4 → T5]
Wave 2:  [C2: T6]   (exclusive)
Wave 3:  [C3: T7]   (exclusive)
Wave 4:  [C4: T8 → T12]   (exclusive)
Wave 5:  [C5: T13 → T9 → T10 → T11]
```

**On the absence of parallelism (deliberate, not an authoring miss).** Three of the five waves are exclusive by nature — a lockfile write and two whole-tree reformats admit no sibling. The remaining two waves are single clusters because their tasks share the same three files (`package.json`, `.prettierrc`, `.prettierignore`) and because the gate can only be armed after the tree is clean; splitting either into parallel clusters would manufacture a file race, not speed. Per [tasks.md](../../../.claude/skills/tlc-spec-driven/references/tasks.md) § 4 this is the "single non-exclusive cluster" shape, and it is justified here rather than restructured.

---

## Task Breakdown

### T1: Remove the Tailwind vestige from `.prettierrc`

**What**: Delete `plugins`, `tailwindStylesheet` and `tailwindFunctions` so prettier loads without the plugin that dies on a path which never existed in this repo.
**Where**: `.prettierrc`
**Touches**: `.prettierrc`
**Depends on**: None
**Exclusive**: no
**Reuses**: —
**Requirement**: FMT-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `.prettierrc` keeps `endOfLine`, `semi`, `singleQuote`, `tabWidth`, `trailingComma`, `printWidth` at their current values — no formatting rule changes in this task
- [ ] `plugins`, `tailwindStylesheet` and `tailwindFunctions` are gone
- [ ] `npx prettier --check apps/api/drizzle.config.ts` exits without a plugin-load or ENOENT error.
      **Do not probe with `package.json`** — measured 2026-08-23, it already exits 0 at HEAD, because
      JSON carries no Tailwind classes for the plugin to sort; it cannot discriminate fixed from broken.
      The real fault is `ENOENT ... packages/ui/src/styles/globals.css` raised by `loadTailwindCSS` on
      every *parsed source* file: 231 in `apps/**/*.ts`, 24 `.tsx`, 15 in `packages/**`, 571 in
      `catalog/**`; `pnpm format:check` ends with `Error occurred when checking code style in 854 files`

**Tests**: none · **Gate**: quick
**Commit**: `fix(format): drop the tailwind plugin .prettierrc could never load`

---

### T2: Remove the Tailwind vestige from `.vscode/settings.json`

**What**: Delete the whole dead Tailwind block — `tailwindCSS.experimental.classRegex`, `tailwindCSS.experimental.configFile` (the same ghost path) and `tailwindCSS.includeLanguages`.
**Where**: `.vscode/settings.json:44-52`
**Touches**: `.vscode/settings.json`
**Depends on**: None
**Exclusive**: no
**Reuses**: —
**Requirement**: FMT-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] No `tailwindCSS.*` key remains in the file
- [ ] The file still parses as JSON and no unrelated setting changed

**Tests**: none · **Gate**: quick
**Commit**: `fix(vscode): drop tailwind settings for a package this repo never had`

---

### T3: Correct the stale ghost reference in the notification mailer

**What**: Rewrite the header comment of `email-theme.ts`, which cites `packages/ui/src/styles/globals.css` as the source of its literals — a file that does not exist. State where the values actually come from, or that they are the entry's own.
**Where**: `catalog/notification/api/infrastructure/mailer/email-theme.ts:1-4`
**Touches**: `catalog/notification/api/infrastructure/mailer/email-theme.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: —
**Requirement**: FMT-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The comment names no path that does not exist in the repo
- [ ] No exported value changes — comment only
- [ ] The commit carries `Advisory: none — comment only, no behaviour change`, since the AD-019 `commit-msg` hook fires on any `catalog/**` change

**Tests**: none · **Gate**: quick
**Commit**: `docs(notification): stop citing a stylesheet that does not exist`

---

### T4: Widen the checked set and the ignore list

**What**: Point `format:check` at what this repo actually authors and keep out what prettier must not touch.
**Where**: `package.json:11`, `.prettierignore`
**Touches**: `package.json`, `.prettierignore`
**Depends on**: T1
**Exclusive**: no
**Reuses**: the existing `.prettierignore` entries
**Requirement**: FMT-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The glob covers `ts`, `tsx`, `mts`, `mjs`, `cjs`, `js`, `jsx`, `json`, `yml`, `yaml`, `css`
- [ ] `md` is **absent** from the glob (owner-confirmed: prettier reflows prose and fights `docs-stay-lean.mjs`)
- [ ] `.prettierignore` additionally excludes `.worktrees/`, `openapi.json` (regenerated by `pnpm contract`),
      `packages/api-client/generated/` and `*.jinja` (prettier infers no parser for Jinja)
- [ ] `.prettierignore` also excludes **`.specs/`**. Markdown is already out of the glob, but `json` is in
      it and `.specs/lessons.json` is machine-owned — "canonical lessons state", rendered by
      `scripts/lessons.py`, with `LESSONS.md` marked do-not-hand-edit. Reformatting it churns a file no
      human owns. Found 2026-08-23 by the peer session specifying `release-marker-commit`
- [ ] `pnpm format:check` runs to completion and reports differences instead of throwing

**Tests**: none · **Gate**: quick
**Commit**: `fix(format): check what the repo authors, ignore what it generates`

---

### T5: Guard the defect class with a committed test

**What**: A `node:test` spec asserting that every filesystem path named in `.prettierrc` exists, and that every entry of `plugins` (if any returns) resolves from the root `node_modules`. This is the test that would have caught the bug the day it was introduced.
**Where**: `scripts/platform/__tests__/prettier-config.test.mjs`
**Touches**: `scripts/platform/__tests__/prettier-config.test.mjs`
**Depends on**: T1
**Exclusive**: no
**Reuses**: `scripts/platform/__tests__/copier-answers-leak.test.mjs` — same `node:test` + `node:assert/strict` style, same `ROOT` resolution three levels up
**Requirement**: FMT-02

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The test reads `.prettierrc`, collects every string value that looks like a repo path, and asserts each exists
- [ ] The test asserts every `plugins` entry is resolvable, so re-adding a plugin without its dependency fails here
- [ ] It fails when the pre-T1 `.prettierrc` is restored — verified by running it against that content once, not asserted on a fixture that mirrors the fix
- [ ] `pnpm test:scripts` passes with the new file counted

**Tests**: unit · **Gate**: quick
**Commit**: `test(format): a path named in .prettierrc must exist`

---

### T6: Drop `prettier-plugin-tailwindcss` from the dependency tree

**What**: Remove the devDependency and refresh the lockfile.
**Where**: `package.json:40`, `pnpm-lock.yaml`
**Touches**: `package.json`, `pnpm-lock.yaml`
**Depends on**: T1, T4
**Exclusive**: **yes** — lockfile
**Reuses**: —
**Requirement**: FMT-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `prettier-plugin-tailwindcss` appears in neither `package.json` nor `pnpm-lock.yaml`
- [ ] `pnpm install --frozen-lockfile` succeeds from the committed lockfile
- [ ] `pnpm format:check` still runs

**Tests**: none · **Gate**: build
**Commit**: `chore(deps): remove prettier-plugin-tailwindcss`

---

### T7: Reformat everything outside the catalog

**What**: The one-time mechanical pass — `prettier --write` over the checked set, excluding `catalog/**`, which T8 owns separately for its commit trailer.
**Where**: repo-wide minus `catalog/**`
**Touches**: every file the T4 glob matches outside `catalog/**` — notably `apps/**`, `packages/**`, `scripts/**`, `.claude/**`, `.github/**`, `*.json`, `*.mts`
**Depends on**: T6
**Exclusive**: **yes** — touches the whole tree
**Reuses**: —
**Requirement**: FMT-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Not one change is semantic — the diff is whitespace, quotes and line breaks only, verified by `git diff --stat` proportions and a spot read
- [ ] `pnpm check` and `pnpm test:scripts` pass unchanged
- [ ] `pnpm format:check` reports zero differing files outside `catalog/**`
- [ ] No `.jinja`, no generated tree and no `.md` file appears in the diff

**Tests**: none · **Gate**: build
**Commit**: `style: format the tree with the repaired prettier config`

---

### T8: Reformat the catalog

**What**: The same mechanical pass over `catalog/**`, as its own commit so the advisory trailer covers only mechanical change.
**Where**: `catalog/**`
**Touches**: `catalog/**`
**Depends on**: T7
**Exclusive**: **yes** — touches every entry
**Reuses**: —
**Requirement**: FMT-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The diff is mechanical only — no entry's behaviour, version or manifest content changes
- [ ] The commit carries `Advisory: none — mechanical formatting, no behaviour change` and the `advisory-required` hook accepts it
- [ ] `pnpm catalog:lint` and `pnpm catalog:typecheck` pass
- [ ] `pnpm format:check` now reports zero differing files repo-wide

**Tests**: none · **Gate**: build
**Commit**: `style(catalog): format the entries with the repaired prettier config`

---

### T12: Bump the five catalog manifests the reformat forces

**What**: T8 rewrites every entry's tree, which trips `entryChangedWithoutBump`
(`release-preflight.mjs:47-55`) and makes `v2.3.0` untaggable. Bump each entry's `module.json`
`version` by a patch and open the matching `CHANGELOG.md` heading — `lintChangelogVersion`
(`lib/lint.mjs:56-58`) requires a `## [<version>]` heading equal to the manifest's version, so the
manifest alone leaves `catalog:lint` red.
**Where**: the five manifests and their changelogs
**Touches**: `catalog/attachment/module.json`, `catalog/audit/module.json`,
`catalog/notification/module.json`, `catalog/tag/module.json`,
`catalog/identity/single-tenant/module.json` (the `identity` entry has **no** top-level manifest — its
manifest lives in the variant subdir), plus the `CHANGELOG.md` beside each of the five
**Depends on**: T8
**Exclusive**: **yes** — shares wave 4 with T8 only, one worker owns `catalog/**` across both
**Reuses**: the existing `## [x.y.z]` heading shape in each entry's `CHANGELOG.md`
**Requirement**: FMT-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] All five go `2.0.0` -> `2.0.1` (patch: the change is whitespace, nothing else)
- [ ] Each of the five `CHANGELOG.md` gains a `## [2.0.1]` heading whose body says the change is
      mechanical formatting only, with no behaviour change
- [ ] `pnpm catalog:lint` and `pnpm catalog:typecheck` pass
- [ ] The commit carries the literal trailer `Advisory: none — mechanical formatting, no behaviour change`.
      The regex is `/^Advisory: none — .+$/m` (`scripts/platform/advisory-required.mjs:12`) and the dash
      is an **em dash** (U+2014) — a hyphen does not match. No file under `docs/advisories/` is needed:
      the trailer alone satisfies the gate (`advisory-required.mjs:23-33`)
- [ ] No `dependsOn`, `kernelRange` or any other manifest field changes — `version` only

**Tests**: none · **Gate**: build
**Commit**: `chore(catalog): bump the five entries the format pass rewrote`

---

### T13: Keep machine-local files out of the checked set

**What**: `.prettierignore` gains `.claude/settings.local.json`. Found during wave 4 — see the
Execution Record finding. Must run **before** T9/T10 arm the gate: arming a gate that is red on day
one is exactly the failure this feature was written to prevent.
**Where**: `.prettierignore`
**Touches**: `.prettierignore`
**Depends on**: T8
**Exclusive**: no
**Reuses**: the `.specs/` entry T4 added for the same reason (`lessons.json`, machine-owned JSON)
**Requirement**: FMT-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The entry is the **file**, `.claude/settings.local.json` — **not** `.claude/`. That directory holds
      20 tracked `.mjs` hooks the glob matches and T7 formatted; a blanket entry would drop authored
      source out of the checked set
- [ ] `pnpm format:check` exits **0** repo-wide on a machine that has a local `.claude/settings.local.json`
- [ ] No tracked file leaves the checked set — compare the file count `format:check` reports before and after

**Tests**: none · **Gate**: quick
**Commit**: `fix(format): ignore machine-local claude settings`

---

### T9: Arm the pre-commit gate (template-only)

**What**: A `pre-commit` job in `lefthook-local.yml` that checks the staged files of covered extensions. `lefthook-local.yml` is already in `copier.yml` `_exclude`, so no child inherits it — which is exactly the confirmed constraint.
**Where**: `lefthook-local.yml`
**Touches**: `lefthook-local.yml`
**Depends on**: T8
**Exclusive**: no
**Reuses**: the `catalog-lint` job's `glob:` + `run:` shape in the same file
**Requirement**: FMT-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The job **formats and re-stages** (`prettier --write` + `git add`) rather than failing the commit.
      The spec's AC allows either ("SHALL fail or fix it"); fix is chosen because
      `audit-2026-08-23-remediation` is running workers in this same checkout for 13 more waves, and a
      failing commit hook would surface to them as an error with no context. Auto-fix is invisible to them
- [ ] Staging a deliberately unformatted file of a covered extension leaves it formatted in the commit,
      demonstrated once and recorded in the Execution Record
- [ ] A commit of only ignored or uncovered files is unaffected
- [ ] The existing `catalog-lint` and `advisory-required` jobs still fire

**Tests**: none · **Gate**: quick
**Commit**: `chore(hooks): check formatting of staged files before commit`

---

### T10: Arm the CI gate without shipping it to children

**What**: A template-only `.github/workflows/format.yml` running `pnpm format:check`, added to `copier.yml` `_exclude` beside `release.yml` and `catalog.yml`, with the delivery assertion extended both ways.
**Where**: `.github/workflows/format.yml`, `copier.yml`, `scripts/platform/__tests__/copier-delivery.test.mjs`, `scripts/template-smoke.mjs`
**Touches**: `.github/workflows/format.yml`, `copier.yml`, `scripts/platform/__tests__/copier-delivery.test.mjs`, `scripts/template-smoke.mjs`
**Depends on**: T9
**Exclusive**: no
**Reuses**: `.github/workflows/ci.yml:19-32` (`quality` job) for the checkout/pnpm/node step shape; `release.yml`'s `_exclude` precedent; T5's path-existence check
**Requirement**: FMT-03, FMT-08, FMT-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The workflow runs `pnpm format:check` on push to `main` and on pull requests
- [ ] **Nothing is added to `ci.yml`** — it ships to children, and a red format job there would be a manual child migration step, which AD-034 forbids on a non-major
- [ ] `copier.yml` `_exclude` lists `.github/workflows/format.yml`
- [ ] `copier-delivery.test.mjs` asserts both directions: `format.yml` is excluded, `ci.yml` still ships
- [ ] `scripts/template-smoke.mjs` asserts, on the rendered child, that every filesystem path named in its `.prettierrc` exists there — the offline half of T5's guard, so a future config that only resolves in the template cannot ship broken to products (FMT-03)
- [ ] `pnpm test:scripts` and `pnpm template:smoke` pass

**Tests**: unit · **Gate**: quick
**Commit**: `ci(format): template-only format check`

---

### T11: Record the change for the template and its children

**What**: A new numbered item **inside the existing `## v2.3.0` section** (it currently ends at item 6, "No dev server left hanging"), plus the `docs/agents/harness.md` line if the pre-commit gate warrants one; state that a child inherits a working config and no enforcement, and how a child opts in.
**Where**: `docs/dev/template-changelog.md`, `docs/agents/harness.md`
**Touches**: `docs/dev/template-changelog.md`, `docs/agents/harness.md`
**Depends on**: T10
**Exclusive**: no
**Reuses**: the changelog's `## vX.Y.Z` + `### Changes` + `### Child migration steps` shape
**Requirement**: FMT-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The entry is **item 7 inside `## v2.3.0`** — do NOT open a new `## vX.Y.Z` heading.
      `release-preflight.mjs:72-75` keys on the *latest* changelog section, so a heading above `v2.3.0`
      would make it permanently untaggable; and `v2.4.0` is owned by `audit-2026-08-23-remediation` (its T48)
- [ ] The existing `### Child migration steps` of `v2.3.0` stays the literal `None — copier update is enough.`
      — a non-major ships zero manual steps (AD-034), and this feature deliberately ships no enforcement
      to the child. Do not append to it
- [ ] The item records the five `module.json` bumps of T12 and states they carry no behaviour change
- [ ] The entry names what a child gains (a `.prettierrc` that loads) and what it does not (a gate), with the one-line opt-in
- [ ] The addition respects the `docs-stay-lean` growth cap on both files
- [ ] `pnpm catalog:lint` passes (it runs on changelog edits)

**Tests**: none · **Gate**: quick
**Commit**: `docs(changelog): record the prettier repair and the format gate`

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 file, 3 keys | ✅ Granular |
| T2 | 1 file, 1 block | ✅ Granular |
| T3 | 1 comment | ✅ Granular |
| T4 | 2 files, one concept (what is checked) | ⚠️ OK — cohesive |
| T5 | 1 test file | ✅ Granular |
| T6 | 1 dependency + lockfile | ✅ Granular |
| T7 | 1 mechanical pass | ✅ Granular |
| T8 | 1 mechanical pass | ✅ Granular |
| T9 | 1 hook job | ✅ Granular |
| T10 | 1 workflow + its delivery assertion | ⚠️ OK — cohesive |
| T11 | 2 docs, one entry | ⚠️ OK — cohesive |
| T12 | 5 manifests + 5 changelogs, one mechanical concept | ⚠️ OK — cohesive |
| T13 | 1 file, 1 line | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | wave 1, first in C1 | ✅ Match |
| T2 | None | wave 1, C1 | ✅ Match |
| T3 | None | wave 1, C1 | ✅ Match |
| T4 | T1 | wave 1, after T1 in C1 | ✅ Match |
| T5 | T1 | wave 1, after T1 in C1 | ✅ Match |
| T6 | T1, T4 | wave 2, both in wave 1 | ✅ Match |
| T7 | T6 | wave 3, T6 in wave 2 | ✅ Match |
| T8 | T7 | wave 4, T7 in wave 3 | ✅ Match |
| T9 | T8 | wave 5, T8 in wave 4 | ✅ Match |
| T10 | T9 | wave 5, after T9 in C5 | ✅ Match |
| T11 | T10 | wave 5, after T10 in C5 | ✅ Match |
| T12 | T8 | wave 4, after T8 in C4 | ✅ Match |
| T13 | T8 | wave 5, first in C5 | ✅ Match |

## Wave/Cluster Cross-Check

| Wave | Cluster | Tasks (order) | Files (union of Touches) | Deps outside earlier waves / own cluster? | Files shared with a sibling cluster? | Exclusive alone? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | C1 | T1 → T2 → T3 → T4 → T5 | `.prettierrc`, `.vscode/settings.json`, `catalog/notification/api/infrastructure/mailer/email-theme.ts`, `package.json`, `.prettierignore`, `scripts/platform/__tests__/prettier-config.test.mjs` | none | none — sole cluster | n/a | ✅ |
| 2 | C2 | T6 | `package.json`, `pnpm-lock.yaml` | none — T1/T4 in wave 1 | none — sole cluster | yes | ✅ |
| 3 | C3 | T7 | tree minus `catalog/**` | none — T6 in wave 2 | none — sole cluster | yes | ✅ |
| 4 | C4 | T8 → T12 | `catalog/**` incl. the 5 manifests + changelogs | none — T7 in wave 3 | none — sole cluster | yes | ✅ |
| 5 | C5 | T13 → T9 → T10 → T11 | `lefthook-local.yml`, `.github/workflows/format.yml`, `copier.yml`, `scripts/platform/__tests__/copier-delivery.test.mjs`, `scripts/template-smoke.mjs`, `docs/dev/template-changelog.md`, `docs/agents/harness.md` | none — T8 in wave 4 | none — sole cluster | n/a | ✅ |

`package.json` is owned by C1 in wave 1 and by C2 in wave 2 — sequential waves, never concurrent, so it is not a race. T7's union contains the files of C1 and C5 by construction; all three sit in different waves.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Repo configuration | none | none | ✅ OK |
| T2 | Repo configuration | none | none | ✅ OK |
| T3 | Docs/comment | none | none | ✅ OK |
| T4 | Repo configuration | none | none | ✅ OK |
| T5 | Template tooling invariant | unit | unit | ✅ OK |
| T6 | Repo configuration + lockfile | none | none | ✅ OK |
| T7 | Mechanical reformat | none | none | ✅ OK |
| T8 | Mechanical reformat | none | none | ✅ OK |
| T9 | Hook configuration | none | none | ✅ OK |
| T10 | Copier delivery surface | unit | unit | ✅ OK |
| T11 | Docs/changelog | none | none | ✅ OK |
| T12 | Catalog manifests | none | none | ✅ OK |
| T13 | Repo configuration | none | none | ✅ OK |

---

## Execution Record

Filled by the orchestrator during Execute — one row per task, plus the Build gate result per wave. Authoritative; never re-derived from `git log`.

| Wave | Task | Commit | Gate | Notes |
| --- | --- | --- | --- | --- |
| — | plan amendment | `5c4e76d` | — | T12 added; tag gate lifted; T1/T4/T9/T11 corrected |
| 1 | T1 | `266d2fd` | quick exit 0 (376) | plugins/tailwindStylesheet/tailwindFunctions removed |
| 1 | T2 | `a3ebba0` | quick exit 0 (376) | whole `tailwindCSS.*` block gone |
| 1 | T3 | `abd2caf` | quick exit 0 (376) | advisory trailer accepted by the commit-msg hook |
| 1 | T4 | `fa5cf45` | quick exit 0 (376) | **`pnpm format:check` now runs to completion — 547 diffs, no ENOENT.** FMT-01 proven |
| 1 | T5 | `5ac5fdf` | quick exit 0 (378) | +2 tests; confirmed failing against the pre-T1 `.prettierrc`, then restored |
| 1 | **Build gate** | — | **PASS** | `pnpm check` exit 0 · `pnpm test:scripts` 378/378 · worker: 1× sonnet · no deviations |
| 2 | T6 | `16a9e92` | quick exit 0 (378) | `prettier-plugin-tailwindcss` gone; `pnpm install --frozen-lockfile` exit 0 |
| 2 | **Build gate** | — | **PASS** | `pnpm check` exit 0 · `pnpm test:scripts` 378/378 · worker: 1× sonnet · no deviations. `format:check` reports 548 diffs, no crash — T7/T8 own that |
| 3 | T7 | `4088235` | quick exit 0 (378) | 206 files, +10820 / -6911, outside `catalog/**` |
| 3 | **Build gate** | — | **PASS** | `pnpm check` 0 · `test:scripts` 378/378 · **`pnpm test` 585/585, unchanged from pre-feature** · prettier outside `catalog/**` 0 diffs, idempotent on re-run · worker: 1× sonnet |

**Deviation, wave 3 (accepted by the orchestrator).** T7 changed one non-whitespace line:
`scripts/platform/__tests__/add-web-test-script.test.mjs:24`. The reformat wrapped the
`["vitest","run","--project","web",webRootFor(...)]` array across lines with a trailing comma, and the
test matched the source's exact single-line shape. The regex was widened by exactly `\s*` after `[`
and an optional `,?` before `]`. Verified by the orchestrator: all five tokens still required in the
same order, so it still fails on any real change to the call — no weakening. Its untouched sibling at
`:13` already used `\s*` between tokens, so this is the file's own idiom.
**Finding for the Verifier (pre-existing, out of scope):** that test asserts on the *source text* of
`add.mjs` rather than on behaviour, which is brittle against any formatter by construction.
**Also noted:** `apps/api/src/shared/kernel/transactional/transaction-manager.int-spec.ts` needed two
`prettier --write` passes (non-idempotency on a generic-typed chained call); the gate re-ran the check
twice and confirmed it settles at 0.

| 4 | T8 | `06f35fb` | build | 341 catalog files reformatted |
| 4 | T12 | `c9803f8` | build | 5 manifests `2.0.0`→`2.0.1` + 5 `## [2.0.1]` headings |
| 4 | **Build gate** | — | **PASS** | `check` 0 · `test:scripts` 378/378 · `catalog:lint` 0 · `catalog:typecheck` 0 · `format:check` red on `.claude/settings.local.json` only — known, owned by T13 · worker: 1× sonnet |

**Finding, wave 4 (from the peer session running `audit-2026-08-23-remediation`, accepted).**
`pnpm format:check` is red on `.claude/settings.local.json`. The file is untracked and ignored by the
*user's global* gitignore (`~/.config/git/ignore`), not by this repo's. Prettier reads neither — only
`.prettierignore` — so the shipped script flags a file the developer did not write and cannot commit.
CI never has the file, so `format.yml` stays green: **red locally, green in CI**, which is the shape
that gets a new gate disabled. Fixed by T13, added to wave 5 ahead of the tasks that arm the gate.
The peer's first proposal — ignore `.claude/` wholesale — was rejected and verified as wrong: that
directory holds 20 tracked `.mjs` hooks the glob matches, ten of which T7 formatted in `4088235`, and
one (`pending-advisories.mjs`) was being edited by that peer's own worker at the time. A blanket entry
would have dropped authored source out of the checked set — the very defect class this feature exists
to close.

**Lesson (candidate for the Verifier to distil).** T7's worker saw the same file and called it
"correctly excluded" because it had built its file list from `git ls-files`; the shipped
`format:check` uses a *glob*. The two agents did not disagree about the file — they disagreed about
what the gate *is*. **A gate's behaviour is confirmed by running the shipped command, never by
reconstructing its input set.**

| 5 | T13 | `259ac55` | quick exit 0 | `.claude/settings.local.json` out of the checked set |
| 5 | T9 | `6d0c6b2` + `edde664` | quick exit 0 | pre-commit format-and-re-stage, pathspec-limited |
| 5 | T10 | `a2839ff` | quick exit 0 (453) | `format.yml` template-only; `_exclude`; both-direction delivery test; `template-smoke` path check |
| 5 | T11 | `60a011a` | `catalog:lint` 0 | item 7 inside the existing `## v2.3.0` |
| 5 | **Build gate** | — | **folded into the Final gate** | last wave: the Verifier's Final gate is a strict superset and runs independently. Recorded here deliberately, not skipped |

**Defect found in wave 5 by manual verification, not by a test.** T9's first version used
`glob: "**/*.{ext}"`, copied from the shape prettier's own CLI glob uses. **Lefthook's `**/*` does not
match repository-root files**; prettier's does. The hook therefore ignored `package.json`,
`copier.yml`, `docker-compose.yml` and every other root file — the gate would have been armed with a
hole in it and nothing red to show for it. Fixed in `edde664` (`{*,**/*}.{ext}`) and verified by
running `pnpm exec lefthook run pre-commit` against disposable files: covered extensions reformatted
and re-staged (`git show :<file>` matched the working tree), an uncovered `.txt` untouched, root and
nested paths both matched. This is the second instance of the wave-4 lesson in the same feature — the
behaviour of a gate was wrong in exactly the way reading its configuration could not reveal.

**Deliberate non-delivery, T11.** `docs/agents/harness.md` was left untouched. The task said to add a
line "**if** the pre-commit gate warrants one"; the worker judged it does not, because that document
scopes itself to Claude Code mechanisms and this is a plain git hook with no agent-specific
behaviour — its own "Off-pattern" section excludes it. Recorded as a judgement the task permitted,
not as an omission. The Verifier should confirm FMT-09 is still satisfied by the changelog entry alone.

| 6 | T14 | `8816705` | quick exit 0 | 3 tests; **mutant killed** — reverted glob produced `not ok 1 ... at the repo root`, `expected: true actual: false` |
| 6 | T15 | `2fa2977` | quick exit 0 | 2 tests; the **literal** AC, not the fallback — `installChild` already runs `pnpm install`, so the rendered child runs real `pnpm format:check` |
| 6 | T16 | `fd6b41e` | quick exit 0 | 2 tests; extension/ignore membership asserted as a class, not string equality |
| 6 | fix-up | `583c758` | quick exit 0 | disclosed deviation: a JSON-escape artifact wrote a literal NUL byte into the new test file, making it diff as binary |
| 6 | **Build gate** | — | **folded into the Final gate** | `test:scripts` 461/461 · `format:check` exit 0 |

**Verifier round 1 — FAIL, and worth recording why it was the useful kind.** All three gaps were
*missing proof*, not broken behaviour: the feature did what it promised and could not show it would
keep doing so. The decisive one came from the sensor, not from reading code — reverting
`lefthook-local.yml:24` to the historical root-glob defect left all 454 tests green. A feature whose
stated purpose is "it cannot rot again" had no net at the exact place it had already rotted once.
The wave-5 worker found that defect by hand, fixed it, and did not write the test; T14 is that test.

**Sibling breakage, resolved.** `catalog:typecheck` failed during round 1's Final gate. The Verifier
traced it out of this feature's range to `35c8a4f` (sibling feature) before judging, ruling out the
reformat by confirming `git show 4088235 -- scripts/template-smoke.mjs` was mechanical on those lines.
Reported across, repaired there at `36f1f9f`. Root cause worth keeping: `catalog-stage.mjs` stages via
`KERNEL_STAGE_PATHS` in `scripts/platform/lib/child-layout.mjs:7-17`, a file that was not in the
sibling task's `Touches` — the task was not completable as written. Same family as the gaps that
forced T12 and T13 into this plan: a `Touches` list that omits the file the change structurally
requires.
