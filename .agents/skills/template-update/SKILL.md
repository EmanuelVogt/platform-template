---
name: template-update
description: Bring a child product up to date with platform-template — copier update one tag at a time, the changelog's child migration steps, then stale catalog entries and pending advisories, gated and committed. Use when the session-start hook says the template is behind, when `pnpm platform status` lists versions behind, or when the user asks to update/pull/sync the platform, the template or the upstream ("atualizar o template", "puxar a plataforma", "copier update").
---

# Template Update

## Input

Optional `<target>` — a template tag (`v2.1.0`). Default: every stable tag after the
installed one, applied in order.

## What this routine covers (and the three layers it crosses)

A product receives platform changes through three channels, each with its own tool; this
skill runs them in order and stops at the same place every time:

| Layer                                  | Tool                                      | Unit             |
| -------------------------------------- | ----------------------------------------- | ---------------- |
| Kernel, harness, handbooks, CI, Docker | `copier update --vcs-ref <tag>`           | one template tag |
| Installed catalog entries              | `port-module-update` skill                | one entry        |
| Retroactive fixes on entries           | `docs/advisories/ADV-*.md` + `APPLIED.md` | one advisory     |

Push, release and deploy are the user's acts (`docs/agents/workflow.md`); this routine
ends at a local branch that passes the gates.

## Preconditions

1. `.copier-answers.yml` exists at the root (otherwise this is not a generated product —
   stop) **and carries the answers** (`project_name`, `project_slug`, `github_org`,
   `github_repo`, `root_domain`, `app_domain`) plus a `_commit` that is the tag the
   product was really generated from. A product born before template v2.2.0 has only
   `_src_path` and `_commit: v1.0.0` (a test fixture leaked over the rendered file):
   repair it once, by hand, before anything else — the answers from `AGENTS.md`/
   `package.json`/`README.md`, `_commit` from `docs/dev/template-changelog.md`'s top
   entry in the product — commit it, and only then continue. Apart from that repair,
   never edit it by hand; copier owns `_commit`.
2. `copier --version` ≥ 9.4 — install once per machine with `uv tool install copier` (or
   `pipx install copier`).
3. `git status --short` is clean and HEAD is local `main`. An untracked file you did not
   create is another session in flight — do not clean it, stop and say so.
4. `pnpm platform status` — read `installed`, `latest` and the ordered list of tags
   behind. `--json` gives the same as data. Nothing behind → report "up to date" and stop.

## Steps

1. **Worktree.** A template update crosses apps, can bring migrations and touches the
   harness: it is never a small task. Branch from local `main`, inside a worktree:
   `git worktree add .worktrees/template-update-<target> -b chore/template-update-<target> main`.
   Everything below runs inside that worktree.
2. **One tag per cycle.** For each tag behind, in ascending order:
   1. `copier update --trust --vcs-ref <tag>` (add `--pretend --diff` first when the tag
      is a major bump, to read the blast radius before touching the disk).
   2. **Resolve conflicts** — inline `<<<<<<<` markers and `*.rej` files. The rules are in
      the next section; a `.rej` is applied by hand and deleted, never committed.
   3. **Read the child migration steps** — `docs/dev/template-changelog.md` just arrived
      updated; run the `### Child migration steps` of that version verbatim (codemods,
      dependency removals, `pnpm install`, journal re-stamp). A version without that
      section has no manual step.
   4. `pnpm install`, then `pnpm skills:sync` (the skills are symlinks relinked by copier's
      post-task; re-run it if `.claude/skills` shows broken links).
   5. **Gate** — `pnpm check`, `pnpm test`, `pnpm --filter api db:check:journal`. A red
      gate is fixed inside the cycle, never carried to the next tag.
   6. **Commit** — `chore(template): update to <tag>`, the contract regen (if
      `pnpm contract` changed `openapi.json` or `packages/api-client`) in its own commit.
3. **Catalog entries.** `pnpm platform module list` — every entry whose `lock=` is below
   `catalog=` goes through the `port-module-update` skill, one entry per commit
   (`chore(catalog): port <entry> to <version>`).
4. **Advisories.** The pending list is in the session-start context or in
   `pnpm platform status`; for each: `pnpm platform advisory detect <id>`, apply the `fix`
   declared in the advisory's frontmatter when affected, append the ledger line to
   `docs/advisories/APPLIED.md` (`- ADV-YYYYMMDD-NN — YYYY-MM-DD — <commit>`). One commit
   per advisory.
5. **Final gate** — `pnpm check` and `pnpm test` on the whole branch; `pnpm test:coverage`
   is the pre-push gate (needs Docker) — run it once so the user is not surprised at push.
6. **Report** (pt-BR to the user, see below) and close the worktree per
   `docs/agents/workflow.md` — local merge into `main`; the push is theirs.

## Conflict rules

The table in `docs/dev/template.md` § "What is kernel, what is catalog, what is product"
decides every conflict; the rule behind it is **the product adds files; it does not edit
platform files**.

- **Platform-owned path** (kernel `shared/**`, `.claude/`, `.agents/`, `docs/` handbooks,
  `.github/`, Dockerfiles, root configs) → take the template side. If the product had
  edited that file, the edit is a smell: port what the product needed to a kernel port or
  to a PR upstream, and say so in the report. Do not keep a local fork of a platform file.
- **Product-owned path** (business modules, `product-routes.tsx`, UI kit, `docs/adr/`,
  `.specs/`, `README.md`, `APPLIED.md`, `.platform-modules.lock`) → copier does not
  touch these (`_skip_if_exists`); a conflict there means the product put code in a
  platform file — move it.
- **Composition root** (`app.module.ts`, `db/schema.ts`, `platform-modules.ts`) → product
  side; `platform-modules.ts` and `platform-schema.ts` are regenerated, never merged.
- **`package.json`** → keep both: the template's scripts/devDependencies and the product's
  additions. Copier's post-task prunes the `catalog:*` scripts again.
- **Lockfiles and generated files** (`pnpm-lock.yaml`, `openapi.json`,
  `packages/api-client/src/generated/**`) → never merge by hand; take either side and
  regenerate (`pnpm install`, `pnpm contract`).
- **Migrations** → a kernel `0000_`/`0001_` that "was born in the past" of the product's
  journal is re-stamped (`docs/dev/template.md` § Migrations); product migrations keep
  `1000_`.
- **`AGENTS.md`/`CLAUDE.md`** → template side; `CLAUDE.md` stays the symlink.

## Report

What the user reads, in pt-BR: installed → target, one line per tag applied, the
conflicts and the side taken on each (platform-file edits found in the product are the
headline), entries ported, advisories applied, the gate results with numbers, and what is
left for them — the push, any platform-file edit that needs an upstream PR. A `.rej`
resolved by hand is named file by file.

## Caveats that bite

- `copier update` refuses a dirty tree, including untracked files — commit or stop.
- `.copier-answers.yml` moves with the update; it is part of the cycle's commit.
- Skipping tags (straight to latest) merges several versions' diffs at once and makes a
  conflict impossible to attribute to a changelog entry — one tag per cycle, even when
  it is slower.
- `docs/dev/template-changelog.md` is the template's own truth about versions; the
  product's `package.json` version never tells where it is — `_commit` does.
