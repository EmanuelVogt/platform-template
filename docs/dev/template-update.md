# Template update contract

The two-sided contract between this template and every product it ships to: what a tag
promises, and how promptly the product is expected to catch up. Nothing here blocks a
session — the product stays usable on any installed version; lateness only becomes
visible.

## What the template promises per tag

- The `release` workflow runs the full gate (`check`, `test`, `test:scripts`,
  `catalog:lint`, `catalog:typecheck`, `catalog:check` per entry) before it tags — a tag
  that exists was green.
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

## Bot: the product updates itself

A weekly workflow (ships via copier, inert inside the template itself) targets the
product's first behind tag: `copier update --vcs-ref <tag>`,
`pnpm platform template migrate`, `pnpm install`, then the product's own gate. Green and
conflict-free → branch + PR carrying that tag's changelog section, one per tag. A red
gate or a copier conflict opens an issue naming the blocker instead, refreshed rather
than duplicated. An unreachable origin fails naming `TEMPLATE_READ_TOKEN`.

## Commands

- `pnpm platform status` — versions behind, pending advisories, cadence.
- `pnpm platform template migrate` — runs every migration script between the installed
  and target version.
- `pnpm platform module update <name>` — see the `port-module-update` skill.
