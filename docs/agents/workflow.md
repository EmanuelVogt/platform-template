# Workflow: branches, worktrees, commits, specs

How a change gets from idea to `main` in this repo. Code rules live in
[`../code-quality.md`](../code-quality.md); this file is only about the mechanics around
them.

## Commit scope

**One scope per commit.** `feat` / `fix` / `refactor` never mix in one commit or one
merge. Surgical edit, never a rewrite.

**Contract regen gets its own commit.** `pnpm contract` reorders imports across ~749
files in `generated/`; mixed into the commit of the real change, that churn buries the
diff any reviewer — human or agent — has to read.

## Sizing a task

**Small — commit straight to `main`, no worktree.** Requires **all** of: ≤ ~5 files; one
area only (one `api` module **or** one `web` slice, never crossing apps); one atomic
commit; no migration; no contract (Zod/OpenAPI) or DB schema change; trivially
reversible.

**Medium/large — isolated worktree with its own branch.** **Any** of: crosses `web` +
`api`; touches contract, migration or schema; new module or feature; cross-module
refactor; doesn't fit one clean commit.

## A branch is only born inside a worktree

Lock: the PreToolUse hook `.claude/hooks/branch-only-in-worktree.mjs` blocks
`checkout -b`/`-B`, `switch -c`/`-C` and `git branch <name>` outside a worktree.

**One location: `.worktrees/<slug>` at the repo root.** It is the only path covered by
the **versioned** `.gitignore`, so it holds on any machine for any agent. Not
`.claude/worktrees/` (ignored only through the local `.git/info/exclude`, which no clone <!-- audience-contract: .claude/worktrees/ — anti-example naming the wrong location, not a path that should exist -->
inherits) and not a sibling directory. Cursor and Claude Code use the same place.

```bash
git worktree add .worktrees/<slug> -b <branch> main
git worktree move <src> <dst>     # moving an existing one
```

**Closing a worktree:** merge locally into `main`, then **move** the feature folder from
`.specs/features/<feature>/` to `.specs/features/done/<feature>/`, keeping the name.
**Never** rename it to `<feature>-done` — the suffix leaves finished work sitting among
the active ones, and the next agent copies the wrong pattern.

## Specs live in `.specs/`, on `main`

TLC framework (`tlc-spec-driven` skill): in flight at
`.specs/features/<feature>/{spec,design,tasks,validation}.md`, finished at
`.specs/features/done/<feature>/`, project decisions in `.specs/STATE.md`.

**Every spec artifact is born in the main checkout's `.specs/` and committed to `main`
as soon as it is written** — plain docs clear the small-task bar, and untracked files on
`main` have already been lost to another session's checkout. Never in a worktree's
`.specs/`, where they stay invisible to other sessions until the merge; the worktree
carries code only.

Spec artifacts are written in **English** — every file under `.specs/`, including `STATE.md`
decisions and handoff, lessons, and the feature slug itself — and so is every payload to a
worker, scout, runner or Verifier. Agents are the only readers, and each artifact is re-read on
every turn for the life of the spec; pt-BR is for the chat reply, never for disk. A decision
discussed in pt-BR is recorded in English; only a product string (UI label, error message) or a
domain term with no English equivalent is quoted as is. The `specs-in-english` hook blocks a
`.specs/` write that reads as pt-BR prose.

**A handoff says what is left, not what was done.** Every agent that picks up the spec
re-reads the handoff whole, every session, for the life of the spec — context that
doesn't change a decision is a permanent tax. Move finished-work narrative to the
validation doc or delete it; at closeout the feature's Handoff entries move to
`.specs/features/done/<feature>/handoff-archive.md`. Workers and the Verifier never read
`STATE.md` — the orchestrator pastes any decision they need as one line.

**Execute is delegated and parallel.** The window that wrote the spec orchestrates; cheap
workers implement, one per cluster, all clusters of a wave at once, in the feature's
worktree (or the main checkout for a small change). A cluster is a **vertical slice of
4–8 tasks** — the domain, ports, repositories, api and tests of one area, wiring last —
and a wave holds 2–4 of them: a worker pays ~20 turns of warm-up before its first edit,
so one worker per task pays that warm-up once per task. A plan of **≤3 tasks** is the
exception — the planning window implements it inline and still dispatches the Verifier. Several workers commit into the same
checkout, so a worker's commit is always pathspec-limited to the files it owns and never
`stash`es, `add -A`s or touches a branch; `tasks.md` and the rest of `.specs/` are written
only by the orchestrator. Mechanics in
[`harness.md`](harness.md#token-economy) and the skill's `references/sub-agents.md`.

## Never scratch inside `apps/`

The `api` Vitest project collects **every** `*.spec.ts` under `src/` (`include` in
`apps/api/vitest.config.mts:20`), so a forgotten probe joins the real suite and shifts the count,
breaking any gate that relies on a stable one. Probes, throwaway scripts and temp files
go to the session scratchpad or to a worktree.

**Before measuring test counts, confirm `git status --short` is clean.** An untracked
file you didn't create signals another session in flight, not your mess to delete.

## Gates

**Pre-push (lefthook).** `git push` runs, in order, `migrations` (journal check) →
`typecheck` (`turbo typecheck`) → `test-coverage` (`pnpm test:coverage`, all four Vitest
projects), and fails on the first failing step — it blocks before the Docker build.
Self-installs on `pnpm install` (`prepare` script). Emergency escape: `git push --no-verify`
(the prod build still typechecks).

**CI.** `.github/workflows/ci.yml` — a single workflow that runs: `quality` (lint + typecheck +
builds) / `test-unit` (api + web) / `test-coverage` (api integration + e2e, testcontainers) for
every push and PR, plus `detect` (checks if `catalog/` exists) <!-- audience-contract: catalog/ — names what the CI `detect` job checks for; absent by design in a generated product -->
and the three template-only catalog jobs (`catalog:lint`, `catalog:typecheck`, `catalog:check`
matrix) which are inert in a generated product. The full `build` lives in `quality`.

A **local commit triggers neither gate.** Run `pnpm check` before asking for review.

**Deploy.** A push to `main` fires whatever hook the product's environment configures —
push = deploy ([`../dev/deploy.md`](../dev/deploy.md#deploy-flow), operational access in
[`infra.md`](infra.md)). An agent may push `main` and cut release tags (AD-034, owner
ruling 2026-08-25). Moving a deploy branch stays the user's act.
