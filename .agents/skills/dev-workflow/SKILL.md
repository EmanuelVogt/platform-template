---
name: dev-workflow
description: How a change gets from idea to main in this repo — sizing a task, branches and worktrees, commit scope, where specs live, and gates. Use when creating a branch, sizing a task, opening a worktree, committing, or writing a spec.
---

# Workflow: branches, worktrees, commits, specs

How a change gets from idea to `main` in this repo. Code rules live in
`.agents/skills/code-quality/SKILL.md`; this file is only about the mechanics around
them.

## Commands (from the repo root)

```
pnpm dev                    turbo dev — brings everything up (:3001 on the Next.js stack; the Vite stack resolves its own dev port)
pnpm check                  lint + typecheck — run before asking for review
pnpm build | typecheck | lint:fix | format | clean
pnpm test | test:coverage | test:int | test:e2e | test:db
pnpm vitest run --project api|web <path>   run one file/dir, skip the full suite
pnpm contract               Zod → openapi.json → Kubb client
pnpm contract:consumers     which screens consume an operationId/route
pnpm contract:diff          readable pt-BR summary of an openapi.json change
pnpm skills:sync            re-link .claude/skills → .agents/skills
pnpm platform module add    install a catalog entry into this product
pnpm platform status        template installed vs latest tag, lock modules, pending advisories
pnpm platform feedback      prepare an upstream issue for a platform defect (skill platform-feedback)
```

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

**Closing a worktree:** merge locally into `main`; the run's own closeout — `.ca-plans/<feature>/`
stays where it is, `plan.md`'s header flips to `Status: Done`, and `.ca-plans/RUNS.md` gains the
closing entry — happens in place. **Never** move or rename the run's folder: nothing moves,
nothing renames — a finished run is found by its `Status:` line, not by which directory it sits in.

## Run artifacts live in `.ca-plans/`, on `main`

Every run lives at `.ca-plans/<feature>/{research,plan,review}.md` (segmented runs: `plan-NN.md`)
from Research through Done — completion is a `Status: Done` line plus a closing entry in
`.ca-plans/RUNS.md`, never a move. Project decisions in `.ca-plans/DECISIONS.md`.

**Every run artifact is born in the main checkout's `.ca-plans/` and committed to `main`
as soon as it is written** — plain docs clear the small-task bar, and untracked files on
`main` have already been lost to another session's checkout. Never in a worktree's
`.ca-plans/`, where they stay invisible to other sessions until the merge; the worktree
carries code only.

Run artifacts are written in **English** — every file under `.ca-plans/`, including
`DECISIONS.md` entries and Handoff, lessons, and the feature slug itself — and so is every
payload to a worker, scout, runner, wave verifier or Reviewer. Agents are the only readers, and
each artifact is re-read on every turn for the life of the run; pt-BR is for the chat reply,
never for disk. A decision discussed in pt-BR is recorded in English; only a product string (UI
label, error message) or a domain term with no English equivalent is quoted as is. The
`plans-in-english` hook blocks a `.ca-plans/` write that reads as pt-BR prose.

**A handoff says what is left, not what was done.** Every agent that picks up the run re-reads
the `## Handoff` section of `plan.md` whole — context that doesn't change a decision is a
permanent tax. Act on it, then delete it: it describes a moment, not the run, and is never
archived. Workers and the wave verifier never read `DECISIONS.md` — the orchestrator pastes any
decision they need as one line.

**Execute is delegated and parallel.** The window that ran Research and Plan orchestrates; cheap
workers implement, one per cluster, all clusters of a wave at once, in the feature's
worktree (or the main checkout for a small change). A cluster is a **vertical slice of
4–8 tasks** — the domain, ports, repositories, api and tests of one area, wiring last —
and a wave holds 2–4 of them: a worker pays ~20 turns of warm-up before its first edit,
so one worker per task pays that warm-up once per task. A plan of **≤3 tasks** is the
exception — the planning window implements it inline and still dispatches the wave verifier
and the Reviewer. Several workers commit into the same
checkout, so a worker's commit is always pathspec-limited to the files it owns and never
`stash`es, `add -A`s or touches a branch; `plan.md` and the rest of `.ca-plans/` are written
only by the orchestrator during Implement. Mechanics in
`.agents/skills/agent-harness/SKILL.md#token-economy` and `ca-full-cycle`'s own
`SKILL.md § Sub-Agent Delegation`.

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
and the four template-only catalog jobs (`catalog:lint`, `catalog:typecheck`, `catalog:eslint`,
`catalog:check` matrix) which are inert in a generated product. The full `build` lives in
`quality`.

A **local commit triggers neither gate.** Run `pnpm check` before asking for review.

**Deploy.** A push to `main` fires whatever hook the product's environment configures —
push = deploy (`docs/dev/deploy.md#deploy-flow`, operational access in
`.agents/skills/infra/SKILL.md.jinja`). An agent never pushes `main` on its own and never moves a deploy
branch — those are the user's acts; the agent stops at the local commit and says so.
