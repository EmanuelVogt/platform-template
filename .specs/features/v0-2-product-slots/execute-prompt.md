# Execute prompt — v0-2-product-slots

Paste into a fresh session opened at `~/Projects/platform-template`.

```
You are in the repo `EmanuelVogt/platform-template` (local: ~/Projects/platform-template, branch main).
Feature `v0-2-product-slots` (GitHub issue #1) is fully planned; your job is EXECUTE only, via
`tlc-spec-driven` — activate the skill by name and follow its Execute flow, Critical Rules and
sub-agent mechanics.

Read first, in this order, completely: CLAUDE.md, TEMPLATE.md, docs/dev/template.md,
docs/agents/workflow.md, docs/agents/harness.md, .specs/STATE.md (Decisions AD-001..011 are binding;
AD-002 and AD-003 are confirmed by the user), .specs/features/v0-2-product-slots/{spec,design,tasks}.md.
Do not re-open decisions; do not rewrite the plan. If a task proves impossible as written, record a
SPEC_DEVIATION in tasks.md with the reason and continue.

Setup (before wave 0):
- Create the worktree from local main:
  `git worktree add .worktrees/v0-2-product-slots -b feat/v0-2-product-slots main`.
  Code lives in the worktree; every `.specs/**` write happens in the main checkout and is committed
  to main immediately (docs(specs) commits).
- Record the unit/int/e2e test-count baseline (shell-runner) in coverage-sweep.md header (T1).

Execution model — waves of PARALLEL clusters (tasks.md "Execution Plan — waves of parallel clusters"):
- Wave 0: you run T1 (sweep artifact) yourself.
- Wave 1: dispatch FOUR `spec-worker` agents in ONE message, all in the same worktree:
    A identity (T2→T3→T5→T6, model opus), C notification (T7→T8→T9, sonnet),
    D audit (T11→T12→T13, sonnet), E attachment (T14→T15→T16, sonnet).
  Each worker gets: its tasks pasted whole (What/Where/Depends/Requirement/Done when/Tests/Gate/
  Commit), the design.md section for its point, the one-line STATE decisions it needs, its
  owned-files list, and the rule "commit only pathspec-limited to owned files; never stash/add -A/
  switch branch; never touch .specs; run gates through shell-runner; return the compact summary
  (tasks done, commit hashes, test counts, deviations)". Only shared file in wave 1 is
  drizzle/migrations/meta/_journal.json: A commits 0004 first; E adds its 0005 journal entry only
  after A's commit lands (re-read the file right before editing; `when` = max + 10_000_000).
- Wave 2 starts only after all four wave-1 summaries: dispatch THREE workers in one message:
    F e2e mailer fakes + product e-mail e2e (T10), G contract regen + web green (T17, its own
    commit), H docs/changelog (T4→T18).
- Wave 3: worker I smoke (T19→T20). Then dispatch the `spec-verifier` (model opus — feature touches
  auth policy + migrations) with the spec-anchored check + discrimination sensor; gaps → fix tasks,
  ≤3 loops. Then you run T21 (final sweep, follow-up issues via `creating-issues`, comment on
  issue #1).
- Between waves: update tasks.md status, re-run `pnpm --filter api test` count via shell-runner, and
  keep `apps/api/src/modules/module-boundaries.spec.ts` green with NO new allowlist entry.

Hard rules (CLAUDE.md / docs/code-quality.md / docs/agents/workflow.md):
- Identifiers English; comments and user-facing strings pt-BR; comments default zero (4 exceptions);
  no `any`; no `eslint-disable`; throw is the only error path; entities immutable; kernel never
  imports modules; base-set never imports product; Zod is contract truth → `pnpm contract` +
  api-client `generate && build`, regen in its own commit; verify contract changes on the web
  (typecheck/test/build).
- One scope per commit; Conventional Commits; NO Co-Authored-By or AI attribution of any kind.
- Heavy commands (test/typecheck/lint/build/contract) always via shell-runner; navigation via
  repo-scout.
- Never scratch inside apps/ (every *.spec.ts under src is collected).
- Migrations: hand-written, journal `when` monotonic, `pnpm --filter api db:check:journal` green.

Stop points that need the user's explicit "sim":
- T22: local merge into main is fine after the Verifier PASS; `git tag v0.2.0` and any `git push`
  only after the user authorizes. Report the closeout (moved .specs/features/v0-2-product-slots →
  .specs/features/done/, handoff archived) and stop.

Reply to the user in pt-BR, terse; think and write specs/prompts in English.
```
