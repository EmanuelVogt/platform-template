# template-update-contract — Handoff archive

Moved out of `.specs/STATE.md` § Handoff at closeout (2026-08-23). The Handoff carries open work
only; the single open item left on this feature — cutting the `v2.3.0` tag, which is the user's act
through the `release` workflow — stays there until the tag exists.

## Entry 1 — after Specify (2026-08-23)

- Feature `template-update-contract` — **Specified + CONFIRMED (2026-08-23); next phase: Design.**
  Spec: 31 ACs (REL release-workflow tag gate, KADV kernel advisories incl. retroactive
  ADV-20260823-01/02, FEED remote sparse feed in the hook, CAD measured cadence, BOT weekly child
  workflow, MIG `pnpm platform template migrate`, DOC AD-034); user decisions in `context.md`
  (all-in-one scope, release workflow, recommended-not-enforced cadence, git-sparse feed); all 8
  assumption defaults approved. Seam map for Design gathered at `d52b86f`: `template-version.mjs`
  exports, `template-behind.mjs`/`pending-advisories.mjs` behavior, `computePending`
  (`advisories.mjs:48`, skips a module absent from the lock), `advisory-required` `CODE_PATH_RE` +
  the `Advisory: none —` trailer, `catalog.yml` matrix (5 entries, no release workflow existed),
  `copier.yml` `_tasks`/`_skip_if_exists` (catalog.yml excluded, ci.yml ships). Scope Large/Complex
  → `design.md` + `tasks.md` required before Execute. Origin: issue #9 + the copier-answers fixture
  leak.

## Entry 2 — mid-Execute (2026-08-23, waves 1–2)

Superseded by the closeout below; it recorded 16/17 tasks landed, `test:scripts` at 345, AD-034
written, and the two standing constraints (REL-05 preflight-only; no tracked `.copier-answers.yml`
in any fixture). Both constraints held to the end.

## Closeout (2026-08-23)

**Verifier PASS, round 2 — 33/33 ACs.** Author ≠ verifier throughout; the three round-1 gaps were
fixed by a separate worker and re-checked by the same Verifier against the real files, not against
the worker's report.

- **Execute**: 17/17 tasks, 3 waves (C1∥C2∥C3 · C4∥C5∥C6∥C7 · C8 exclusive), 8 clusters, all workers
  sonnet, one worker per cluster on a single shared checkout of `main` — no worktree.
- **Gates**: build gate per wave (349 at the last one); Final gate exit 0 — `pnpm check` 5/5,
  `pnpm test` 585/585, `pnpm test:scripts` 355/355 (pre-feature baseline **279**, +76),
  `catalog:lint` 0, `catalog:typecheck` 5/5. Sensor 3/3 mutants killed (round 1).
- **Commit range**: `db8149d` … `474f9f6`. Per-task commits, gate results and every deviation are in
  `tasks.md` § *Execution Record*; per-AC evidence in `validation.md`.
- **Decision recorded**: AD-034 (both sides of the update contract and its enforcement points).
- **Lessons**: L-025, L-026, L-027.

### What shipped

Kernel advisories matched against the installed template version instead of the module lock, plus
the two retroactive ones (ADV-20260823-01/02) and the advisory-module lint · `lib/advisory-feed.mjs`
(sparse clone of the latest tag, 24 h cache) and `lib/cadence.mjs` · `release-preflight.mjs` +
`.github/workflows/release.yml` · the `template-behind` hook feed and `status` cadence/feed
surfacing · the weekly bot (`template-update-ci.mjs` + `template-update.yml`) ·
`pnpm platform template migrate` · `docs/dev/template-update.md`, the `workflow.md` tag rule and the
v2.3.0 changelog section · `copier.yml` wiring (release.yml template-only; bot, handbook and
migrations ship).

### Two findings worth more than the code

1. **The feature caught itself.** The wave-1 build gate went red because a new hook fixture shipped a
   tracked `.copier-answers.yml` — precisely the leak class `ADV-20260823-02` documents. Fixed in
   `b2cb486` by building child fixtures at test setup under `mkdtempSync`. Any future test that needs
   a child tree must do the same.
2. **`design.md`'s conflict assumption was wrong.** Installed copier 9.17.2 defaults to
   `--conflict inline`, not `rej` (the `.rej` is transient, deleted after the 3-way `git merge-file`).
   The bot scans for the literal `<<<<<<< before updating` / `>>>>>>> after updating` markers
   (`template-update-ci.mjs:36-40`). The task had demanded that verification before trusting the
   artifact, and it paid.

### Deviations carried (all recorded in `tasks.md`)

REL-05 is preflight-only — `lintChildMigrationSteps` lives in `lib/kernel-version.mjs`, never wired
into `runLint` · `lib/commands/advisory.mjs` was never rewired because `detectCommand` does not call
`computePending` (design.md's "all three callers" did not match the code) · `templateVersion` is a
version string, not the parse object · no new exit codes in the preflight · `planUpdate` keeps an
unused `openIssues` parameter for design parity · `hashFiles()` is invalid in a job-level `if`, so
the bot's inert-in-template guard sits on every step after checkout.

### Open, and the user's act alone

`v2.3.0` is not tagged. The tag is cut by the user dispatching the `release` workflow — the agent
neither tags nor pushes (AD-034, `docs/agents/workflow.md`). Two unrelated commits ride the same
tag: `817a129` (platform-feedback) and `7ab03bd` (the `template-update` skill symlink v2.2.0 left
untracked).

## Handoff entry, verbatim

Moved out of `.specs/STATE.md` § Handoff on 2026-08-24; the Handoff carries open work only.
Every item it left open is resolved — see this file's Outcome section.

- Feature `template-update-contract` — **DONE (2026-08-23). Verifier PASS round 2, 33/33 ACs.** Archive `.specs/features/done/template-update-contract/` (`handoff-archive.md` carries the full record: what shipped, the commit range `db8149d`…`474f9f6`, every deviation, and the two findings worth keeping). 17/17 tasks in 3 waves, all workers sonnet, worked directly on `main` — no worktree, nothing to merge. Final gate exit 0: `pnpm check` 5/5, `pnpm test` 585/585, `pnpm test:scripts` 355/355 (pre-feature baseline 279), `catalog:lint` 0, `catalog:typecheck` 5/5; sensor 3/3 killed. AD-034 recorded; lessons L-025/026/027. **Still open, and the user's act alone: `v2.3.0` is not tagged** — the tag is cut by dispatching the `release` workflow (the agent neither tags nor pushes). Two unrelated commits ride the same tag: `817a129` platform-feedback and `7ab03bd`, the `.claude/skills/template-update` symlink v2.2.0 left untracked. Note for whoever tags: `docs/dev/template-changelog.md`'s v2.3.0 section is being appended to by a parallel session (dev-server hooks, item 7) — the preflight requires its `### Child migration steps` to stay the literal `None — copier update is enough.`
