# Handoff archive — remove-child-update-bot

Closed 2026-08-23. Verifier **PASS**, 10/10 ACs, sensor 3/3 killed. Worked directly on
`main` — no worktree, nothing to merge.

## The owner decision that opened it (moved from STATE.md § Handoff)

> Owner decision, 2026-08-23, **blocks the `v2.3.0` tag until applied** — *the child never
> updates itself.* The weekly bot shipped by `template-update-contract` (spec stories
> BOT-01…BOT-07) is rejected: a product must not open its own update PR on a schedule;
> running the check is the operator's act. (The rejected trigger is a GitHub Actions
> `schedule` in the child's repo — it never ran on anyone's machine — but the objection
> stands regardless of where the runner lives.) What the owner does want is the
> **agent-facing** half, which already shipped in the same feature and stays:
> `.claude/hooks/template-behind.mjs` (SessionStart + first UserPromptSubmit) reports how
> far behind the child is, pulls `docs/advisories/` from the latest template tag through
> the remote feed, and lists each pending kernel advisory with its fix line and `overdue`
> mark — detection is automatic, applying is the session's decision (skill
> `template-update`). **Removal scope:** delete `.github/workflows/template-update.yml` and
> `scripts/platform/template-update-ci.mjs` + its test; drop the bot from `copier.yml`'s
> shipped set and flip the corresponding assertions in `copier-delivery.test.mjs`; remove
> item 5 of the v2.3.0 changelog section and the bot section of
> `docs/dev/template-update.md`; amend AD-034's child side. Do it **before** tagging —
> nothing is tagged yet, so this lands inside v2.3.0 with no advisory and no corrective
> release. The archived `spec.md`/`validation.md` of the closed feature are history: record
> the reversal in the new feature, never rewrite them.

## What shipped

Three commits, `eb907ef`…`557fef0`, on `main` (**not pushed** as of closeout).

| Commit | What |
| --- | --- |
| `eb907ef` | Deleted `.github/workflows/template-update.yml`, `scripts/platform/template-update-ci.mjs` and its 161-line test; dropped the bot from `copier.yml`'s `_exclude` comment; inverted the delivery guard in `copier-delivery.test.mjs`. |
| `0ec749a` | `docs/dev/template-update.md`'s bot section replaced; v2.3.0 changelog item 5 removed, items 6→5 and 7→6. |
| `557fef0` | `spec.md` + AD-034 child side amended. |

Gates at closeout: `pnpm check` 5/5, `pnpm test` 585/585, `pnpm test:scripts` 345/345
(baseline 355 − the bot test's 10), `catalog:lint` 0, `catalog:typecheck` 5/5.

## Two deviations from the removal scope, both deliberate

1. **The guard asserts absence, not exclusion.** Flipping `!excludes().includes(…)` to
   `excludes().includes(…)` would be dead config — a `_exclude` entry for a file that does
   not exist proves nothing and rots. The test asserts git tracks neither bot path, which
   is the property the decision actually demands. Recorded in AD-034.
2. **`docs/dev/template-update.md`'s bot section was replaced, not deleted** — it now reads
   *"The product never updates itself"*. A silent handbook invites the bot back, and this
   document is the child's copy of the two-sided contract, so the rule belongs in it.

## Findings worth keeping

- **F1 — the checkout was not single-occupancy during verification.** A parallel session
  appended a `docs-audience-contract` bullet to `.specs/STATE.md` § Handoff while the
  Verifier was running. No overlap with this feature's scope (AD-034 untouched), but the
  orchestrator's assumption that it owns `.specs/` during Execute did not hold. Same
  session also owns the v2.3.0 changelog section.
- **F2 — one `pnpm test:scripts` run exited 1 with no assertion failure** and a log cut
  mid-stream (no TAP summary), consistent with a killed process. The rerun was clean
  345/345, matching the orchestrator's independent pre-verification run. Treated as
  environmental, not a regression — but if it recurs, it is worth a look.
- **F3 — the stale worktree was removed** as part of this session's housekeeping:
  `.worktrees/security-audit-remediation` was clean and its branch
  `feat/security-audit-remediation` had zero commits absent from `main` (45 behind). The
  branch itself was left in place — fully merged, safe to delete whenever.

## Handoff entry, verbatim

Moved out of `.specs/STATE.md` § Handoff on 2026-08-24; the Handoff carries open work only.
Every item it left open is resolved — see this file's Outcome section.

- Feature `remove-child-update-bot` — **DONE (2026-08-23). Verifier PASS, 10/10 ACs, sensor 3/3 killed.** The owner decision that blocked the `v2.3.0` tag is **applied — the block is lifted.** Archive `.specs/features/done/remove-child-update-bot/` (`handoff-archive.md` carries the original decision verbatim, the commit table, the two deliberate deviations from the removal scope, and three findings). Three commits on `main`, `eb907ef`…`557fef0`, **not pushed**. AD-034's child side amended in place. Gates: `pnpm check` 5/5, `pnpm test` 585/585, `pnpm test:scripts` 345/345 (baseline 355 − the deleted bot test's 10), `catalog:lint` 0, `catalog:typecheck` 5/5. Also done as housekeeping: the stale `.worktrees/security-audit-remediation` worktree was removed (clean, branch fully merged; the branch itself was left in place).
