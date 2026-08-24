# Template migrations

Scripts here automate the manual steps a child product used to copy from the
changelog. `pnpm platform template migrate [--target vX.Y.Z]` runs every
`v<X.Y.Z>.mjs` in this directory, in ascending version order, up to the target
(default: the version installed in `.copier-answers.yml`). No directory or no
matching script here is a no-op success, not a failure.

## Script contract

- File name: `v<X.Y.Z>.mjs` (e.g. `v3.0.0.mjs`) — matches the tag the change
  shipped in.
- Default export: none. Named export `run({ cwd, log })`, `async` or sync.
  - `cwd`: the child product's root (where `.copier-answers.yml` lives).
  - `log(message)`: prints progress; do not use `console.*` directly.
- **Idempotent**: the runner keeps no state file — every script runs on every
  invocation up to the target, so `run` must check whether its change already
  applied and no-op if so.
- Throwing (or an async rejection) stops the whole run: the runner reports the
  script by name and never runs the ones after it.
