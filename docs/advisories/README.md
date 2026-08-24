<!--
Platform advisory channel. The `ADV-YYYYMMDD-NN.md` files in this folder
are immutable in the child — never edit, delete or move them; `copier update`
rewrites the template's content on every release. Applied the fix?
Add a line to `APPLIED.md`; never edit the advisory.
-->

# docs/advisories

Each advisory is a file `ADV-<YYYYMMDD>-<NN>.md` with frontmatter:

```yaml
id: ADV-20260901-01
kind: bug | security | breaking
module: <entry>/<variant> | kernel
affects: ">=1.0.0 <1.2.0" # semver range
severity: low | medium | high | critical
detect: "pnpm platform advisory detect ADV-20260901-01"
fix: "summary + link to the changelog"
parity: "path/to/the.parity.spec.ts"
```

Body in the product's language (see [`AGENTS.md`](../../AGENTS.md), Two standing rules):
context, impact, steps.

`module: kernel` is for defects in the template itself — the kernel, the platform
scripts, the harness hooks, copier — not in a catalog entry. Its `affects` matches
the child's installed template version (`_commit` in `.copier-answers.yml`)
instead of a `.platform-modules.lock` entry; it is reported even when the child
has no lock yet. `pnpm catalog:lint` accepts `kernel` or any entry name discovered
under `catalog/` (`<name>` or `<name>/<variant>`) as `module` — nothing else.

- `pnpm platform advisory detect <id>` runs the advisory's `detect` and maps its
  exit status to three distinct outcomes: **1 = child affected**, **0 = not
  affected**, **anything else (missing binary, status ≥ 2) = detection
  failed** — never silently reported as "not affected". A `detect` containing
  `;` runs through a shell, so quoting and chained probes (multiple commands
  in one `detect`) work as written.
- At session start, `.claude/hooks/pending-advisories.mjs` computes which
  advisories affect the installed modules (`.platform-modules.lock`) and the
  installed template version, that are not yet listed in `APPLIED.md`, and shows
  a summary.
- A fix in `catalog/**` without a matching advisory is blocked at commit time
  (`scripts/platform/advisory-required.mjs`); `module: kernel` advisories are
  never demanded by this rule (it only watches `catalog/**` paths).
- **Remote feed**: `.claude/hooks/template-behind.mjs` also fetches the advisories
  published at the latest template tag (merged with the child's local copy, the
  remote version winning by id) and reports pending `kernel` advisories even
  before the child runs `copier update` — a defect can reach the child without
  it updating first. `pnpm platform status` surfaces a feed fetch error or a
  skipped, unparseable remote file instead of failing silently.
