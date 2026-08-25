# Authoring an advisory

The advisory's shape — the `ADV-<YYYYMMDD>-<NN>.md` filename, the frontmatter fields, the
body language — is documented for whoever reads one in
[`docs/advisories/README.md`](../advisories/README.md). This page covers what only the
template repository enforces when one is authored.

`pnpm catalog:lint` validates the `module` field: it accepts `kernel` or any entry name
discovered under `catalog/` (`<name>` or `<name>/<variant>`) as `module` — nothing else.

A fix in `catalog/**` without a matching advisory is blocked at commit time
(`scripts/platform/advisory-required.mjs`); `module: kernel` advisories are never demanded
by this rule (it only watches `catalog/**` paths).
