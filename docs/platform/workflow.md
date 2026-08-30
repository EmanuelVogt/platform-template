# Workflow: template-only mechanics

Mechanics that apply only inside `platform-template` itself, split out of
[`dev-workflow`](../../.agents/skills/dev-workflow/SKILL.md) — a generated product never ships this
file. Read that one first for branch, commit, worktree and spec rules shared by both.

## No pull requests for our own work

Work merges **locally into `main`** — no PR, no push-then-review. The recent history is
all `merge:` commits made on this machine.

PRs still exist in two narrow roles, and neither changes the flow above:

- **CI trigger** — `.github/workflows/ci.yml` runs on `pull_request` as well as on push
  to `main`.
- **External contributors** — see [`issue-tracker`](../../.agents/skills/issue-tracker/SKILL.md.jinja).

## Branching in the shared checkout

The main checkout is **shared between agents**: creating or switching a branch there
moves HEAD under whoever is working on `main` in parallel. There is no middle ground —
either the task is small and the commit goes straight to `main`, or it gets a worktree
and the branch is born in the `git worktree add` command.

**Branch from local `main`, never `origin/main`.** The flow is local merge without push,
so `origin/main` runs dozens of commits behind — it has been 53 behind, with a whole
feature living only locally. Check with `git rev-list --count origin/main..main`; `> 0`
means it is stale. A worktree already born from the wrong base, carrying only spec/doc
commits, is fixed with `git rebase main` inside it.

## Releases are cut here, never in a product

`pnpm platform release` ships with the CLI but refuses to run in a product (it probes
for `catalog/`, which only the template has) — a product consumes versions with
`copier update`, it does not publish them.

In the template, the command composes the empty marker commit `chore(release): vX.Y.Z`
and stops; the push is what cuts the tag. `--push` does both, and an agent may run it
here on its own — the clause reserving tag and push to the owner was lifted on
2026-08-25 (see the decisions log). That grant is template-only: in a product, push is
deploy and stays the user's act. The tag itself is never local: `release.yml`
cuts it after the full gate, so a tag that exists was green; the same job publishes the
GitHub Release from the changelog section.

Concurrent sessions serialize through the **release lease** —
`<git common dir>/platform/release-lease.json`, acquired by `pnpm platform release` and
self-cleared once the tag exists. From the marker commit until the tag, `main` is frozen
for everyone but the holder (lefthook pre-push guard + Claude hook).
`pnpm platform release --status` reports the window; `--abort` recovers a stranded one.
Mechanics: [`release-coordination.md`](release-coordination.md); contract: AD-039.
