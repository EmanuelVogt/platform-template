# platform-template

Copier template for the platform: **only the kernel** of the NestJS API (no module at
all) + headless React/Vite front, agent harness, handbooks, CI and Docker. Platform
modules live outside the copier, as versioned entries in `catalog/`, and enter the product
via `pnpm platform module add` (see [`docs/dev/template.md`](docs/dev/template.md)). A fix
to a catalog entry without a matching advisory (`docs/advisories/ADV-*.md` or the
`Advisory: none — <reason>` trailer on the commit) is not accepted. This file and
`CLAUDE.md` exist only in the template repository (excluded in `copier.yml`), as does the
repository's public face — [`.github/README.md`](.github/README.md), `.github/assets/` and
`LICENSE`; the generated product gets its own `README.md` and `AGENTS.md`/`CLAUDE.md` and
decides its own license.

## Generating a product

The step-by-step for template consumers is in the [README](.github/README.md). The
repository is public: `copier` and `module add` clone over HTTPS, no SSH key needed.

Supported dev platforms: macOS, Linux, WSL2 on Windows. Native Windows is not supported —
`scripts/sync-agent-skills.mjs` mirrors the agent skills via symlinks.

```
pipx install copier              # or uv tool install copier
copier copy --trust gh:EmanuelVogt/platform-template ./my-product
```

## Publishing a version

Every change products should receive becomes a semver tag. Run `pnpm platform release`, review
the empty marker commit `chore(release): vX.Y.Z`, and push it; the push cuts the tag. Add `--push`
to do both in one command, skipping the review step. Either way the tag itself is cut by
`release.yml` after the full gate — never locally. The product updates with `copier update`
(see `docs/dev/template.md`).

## Testing the template

```
copier copy --defaults --data project_name=Demo --data github_org=acme . /tmp/demo
cd /tmp/demo && pnpm check && pnpm test
```

`.jinja` files are rendered; all others are copied verbatim. Keep Jinja restricted to
docs and manifests — source code carries no placeholder (it uses config/env).
