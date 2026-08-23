# Feature: remove-child-update-bot

**Scope:** Medium (reversal, 3 tasks) · **Design:** skipped (no architecture decision — a
deletion plus one inverted guard) · **Tasks:** skipped (inline execution plan below)

## Problem

`template-update-contract` (closed 2026-08-23, `db8149d`…`474f9f6`) shipped two halves of
the update contract. The **agent-facing** half — automatic detection — is what the owner
wanted. The **bot** half is rejected: stories BOT-01…BOT-07 gave every generated product a
GitHub Actions `schedule` that runs `copier update` against the next template tag and opens
its own PR. *A product must not update itself on a schedule; running the check is the
operator's act.* The objection is about the act, not the runner — moving the schedule
elsewhere would not answer it.

Nothing is tagged yet: `v2.3.0` exists only as an authored changelog section. The reversal
therefore lands **inside** `v2.3.0`, so no advisory and no corrective release are owed. The
archived `spec.md` / `validation.md` of the closed feature are history and are **not**
rewritten — this document is the record of the reversal.

## Kept, deliberately — the detection half is not in scope

| Kept | Why |
| --- | --- |
| `.claude/hooks/template-behind.mjs` (SessionStart + first UserPromptSubmit) | Reports how far behind the child is, per-advisory fix line and `overdue` mark. Detection is automatic; applying is the session's decision. |
| Remote advisory feed (`lib/advisory-feed.mjs`, sparse checkout of `docs/advisories/` from the latest tag, 24 h cache) | A child on a broken tag learns about its own defect without updating first. |
| `pnpm platform status`, the `template-update` skill, `pnpm platform template migrate` and `scripts/platform/migrations/**` | The operator-driven routine that replaces the bot. |
| `docs/dev/template-update.md` itself, minus its bot section | The child's handbook for the two-sided contract. |

## Requirements

| ID | Requirement |
| --- | --- |
| REV-01 | The scheduled workflow `.github/workflows/template-update.yml` no longer exists in the template, so no child can receive it. |
| REV-02 | `scripts/platform/template-update-ci.mjs` and `scripts/platform/__tests__/template-update-ci.test.mjs` no longer exist; the script suite stays green with no dangling import. |
| REV-03 | `copier.yml` carries no reference to the bot, and the rest of its `_exclude` contract is unchanged — `release.yml` still template-only, `docs/dev/template-update.md` and `scripts/platform/migrations/**` still ship to the child. |
| REV-04 | A regression guard asserts the bot cannot come back: neither bot path is tracked by git. |
| REV-05 | The `## v2.3.0` changelog section no longer advertises the bot; its numbered list has no gap; `### Child migration steps` is still the literal `None — copier update is enough.` |
| REV-06 | `docs/dev/template-update.md` has no *"Bot: the product updates itself"* section; its other four sections are intact. **Deviation from the Handoff's removal scope, deliberate:** the section is *replaced*, not deleted — *"The product never updates itself"* states the contract term positively. A silent doc invites the bot back; this document is the child's handbook for the two-sided contract, so the rule belongs in it. |
| REV-07 | AD-034's child side records that the child never updates itself, and names the detection half as what ships instead. |

## Acceptance criteria

| AC | Requirement | Proof | Evidence |
| --- | --- | --- | --- |
| AC-1 | REV-01 | test | `copier-delivery.test.mjs`: `git ls-files .github/workflows/template-update.yml` returns nothing. |
| AC-2 | REV-02 | test | Same guard covers `scripts/platform/template-update-ci.mjs`. |
| AC-3 | REV-02 | gate | `pnpm test:scripts` exits 0; the suite no longer contains `template-update-ci.test.mjs` and its 161 lines are gone from the count. |
| AC-4 | REV-03 | probe | `grep -n "template-update.yml\|template-update-ci" copier.yml` returns nothing. |
| AC-5 | REV-03 | test | `copier-delivery.test.mjs`'s `release.yml`, `docs/dev/template-update.md` and `scripts/platform/migrations` tests still pass unchanged. |
| AC-6 | REV-04 | test | The new guard fails if either file is restored (discrimination sensor target). |
| AC-7 | REV-05 | probe | The `## v2.3.0` section (`template-changelog.md:7-34` after the edit; `7-36` before) contains no `Weekly bot`; items run `1.`…`6.` with no gap; `### Child migration steps` is still the literal `None — copier update is enough.` |
| AC-8 | REV-06 | probe | `docs/dev/template-update.md` headings are exactly: `# Template update contract`, `## What the template promises per tag`, `## Cadence (recommended, never enforced)`, `## Feed: advisories before you update`, `## The product never updates itself`, `## Commands` — no `Bot`, no `weekly`, no `schedule`. |
| AC-9 | REV-06 | gate | `pnpm test:scripts` — `template-behind.test.mjs` and `template-version.test.mjs` green (detection half untouched). |
| AC-10 | REV-07 | probe | `.specs/STATE.md` AD-034 child side states the child never updates itself and no longer describes a weekly PR bot. |

## Out of scope

- Tagging or pushing `v2.3.0` — the user's act, via the `release` workflow (AD-006/AD-034).
- The `prettier-format-gate` and `audit-2026-08-23-remediation` features queued behind the
  same tag.
- Rewriting `.specs/features/done/template-update-contract/**` — history stays.
- Any change to `docs/dev/template-changelog.md` outside item 5 and the renumbering: a
  parallel session owns the same v2.3.0 section (it authored item 7, dev-server hooks).

## Assumptions

1. **The inverted guard asserts absence, not exclusion.** Flipping `!excludes().includes(…)`
   to `excludes().includes(…)` would be dead config — a `_exclude` entry for a file that
   does not exist proves nothing and would rot. The guard asserts instead that git tracks
   neither bot path, which is the property the owner's decision actually demands.
2. **Renumbering is required, not cosmetic.** Dropping item 5 from an ordered list leaves
   `1,2,3,4,6,7`. Items 6 and 7 become 5 and 6; their text is untouched.
