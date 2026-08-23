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
module: <entry>/<variant>
affects: ">=1.0.0 <1.2.0" # semver range
severity: low | medium | high | critical
detect: "pnpm platform advisory detect ADV-20260901-01"
fix: "summary + link to the changelog"
parity: "path/to/the.parity.spec.ts"
```

Body in pt-BR: context, impact, steps.

- `pnpm platform advisory detect <id>` runs the advisory's `detect` (exit 1 =
  child affected).
- At session start, `.claude/hooks/pending-advisories.mjs` computes which
  advisories affect the installed modules (`.platform-modules.lock`) and are not
  yet listed in `APPLIED.md`, and shows a summary.
- A fix in `catalog/**` without a matching advisory is blocked at commit time
  (`scripts/platform/advisory-required.mjs`).
