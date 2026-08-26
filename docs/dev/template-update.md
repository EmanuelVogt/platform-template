# Template update contract

The two-sided contract between this template and every product it ships to: what a tag
promises, and how promptly the product is expected to catch up. Nothing here blocks a
session — the product stays usable on any installed version; lateness only becomes
visible.

## What the template promises per tag

- The `release` workflow runs the full gate (`check`, `test`, `test:scripts`,
  `catalog:lint`, `catalog:typecheck`, `catalog:eslint`, `catalog:check` per entry) before
  it tags — a tag that exists was green. <!-- audience-contract: release — names the template's own release workflow and explains why an existing tag is trustworthy; it does not instruct the child to run or look at anything -->
- Every non-major version documents `### Child migration steps` in
  [`template-changelog.md`](template-changelog.md): the literal sentence
  `None — copier update is enough.`, or a numbered list whose steps start with a
  backtick-quoted command. The release preflight refuses a manual step on a
  minor/patch.
- A defect in the kernel itself (scripts, hooks, copier, CI) is announced through the
  same advisory ledger as a catalog entry defect, under `module: kernel`, matched to the
  product's installed template version regardless of its `.platform-modules.lock`.

## Cadence (recommended, never enforced)

| Advisory kind | Recommended cadence |
| --- | --- |
| security | 7 days |
| breaking | 30 days |
| bug | 30 days |

`pnpm platform status` and the `template-behind` session hook print, per pending
advisory, the days elapsed since its id date, marking it `overdue` past the cadence for
its kind — a signal, never a blocker.

## Feed: advisories before you update

`platform status` and the session hook fetch `docs/advisories/` from the latest stable
tag of the template origin via a sparse git checkout, cached 24 h next to the tags
cache. Remote and local advisories merge by id (remote wins on a duplicate id), so a
defect published after the product's installed tag still reaches it.

## The product never updates itself

Detection is automatic; applying is the operator's act. No workflow, in the product's
repository or anywhere else, opens an update PR on a schedule — the lag and the pending
advisories surface in the session (`template-behind` hook) and in `pnpm platform status`,
and a human decides when to run the update, through the `template-update` skill.

## Commands

- `pnpm platform status` — versions behind, pending advisories, cadence.
- `pnpm platform template migrate` — runs every migration script between the installed
  and target version.
- `pnpm platform module update <name>` — see the `port-module-update` skill.
