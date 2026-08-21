# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 — When a rename removes an enum value, fix the test fixture that still uses the old value instead of widening production code to tolerate unknown values
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `attachment` · harmful: 0
- features: v0-2-product-slots
- evidence: .specs/features/v0-2-product-slots/validation.md Fix 1 — apps/api/src/modules/attachment/api/controllers/download-attachment.controller.ts:56-58 (attachment)
- last seen: 2026-08-19T02:25:01Z

### L-002 — When the spec requires an error naming a value, assert the message with toThrow(/value/), not only the error class
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tests` · harmful: 0
- features: v0-2-product-slots
- evidence: .specs/features/v0-2-product-slots/validation.md Fix 2 — apps/api/src/modules/notification/infrastructure/channels/email.channel.spec.ts:157,169 (tests)
- last seen: 2026-08-19T02:25:04Z

### L-003 — Assert schemas as a superset check that forbids unexpected names, never as equality against a fixed list — a fresh PostgreSQL database always carries public
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `gates` · harmful: 0
- features: v1-kernel-only-module-catalog
- evidence: scripts/template-smoke.mjs:10 (gates)
- last seen: 2026-08-21T06:13:46Z

### L-004 — An acceptance criterion naming a CI job needs a committed workflow file; a gate that only a human can trigger is evidence for one run, not a standing guarantee
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `ci` · harmful: 0
- features: v1-kernel-only-module-catalog
- evidence: CAT-02 / spec.md P1 catalog entries AC2 (ci)
- last seen: 2026-08-21T06:13:46Z

### L-005 — When a manifest field restates a fact the code already contains, add a test that re-derives it from the code and asserts equality, instead of trusting the hand-written value
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `catalog` · harmful: 0
- features: v1-kernel-only-module-catalog
- evidence: catalog/attachment/module.json dependsOn -> [] survived catalog:lint and catalog:typecheck (catalog)
- last seen: 2026-08-21T06:13:47Z

### L-006 — When design is corrected because a promised column or field never existed, correct the acceptance criterion in spec.md in the same change, or the verifier reports the clause as uncovered
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: v1-kernel-only-module-catalog
- evidence: spec.md P1 kernel ports AC3 (outbox actorId) (spec)
- last seen: 2026-08-21T06:13:48Z

### L-007 — A hook file is a deliverable: test the hook's own entry point including its empty-output and event-gating paths, not only the library it calls
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `hooks` · harmful: 0
- features: v1-kernel-only-module-catalog
- evidence: .claude/hooks/pending-advisories.mjs:18-22,35 (hooks)
- last seen: 2026-08-21T06:13:49Z

### L-008 — When a user-visible literal string is specified in both spec.md and design.md, pin it with a literal assertion in a test and name one document canonical. Here the hook emitted the spec.md wording while design.md:222 carried an extra 'pnpm ' prefix; only the test naming its source (pending-advisories.test.mjs:30-33) made the drift decidable instead of a coin flip between two docs.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · harmful: 0
- features: v1-kernel-only-module-catalog
- evidence: .specs/features/v1-kernel-only-module-catalog/validation.md#round-2-no-lock-string
- last seen: 2026-08-21T14:56:46Z

### L-009 — A CI job that re-implements a per-commit git hook must iterate the PR's commits, not collapse the range. Reproducing the commit-msg check with 'git reset --soft base' plus 'git log -1 head' judges the whole PR diff against a single message, so any escape-hatch trailer on the head commit exempts every commit in the PR. Faithful for the file half, weaker for the message half.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · harmful: 0
- features: v1-kernel-only-module-catalog
- evidence: .github/workflows/catalog.yml:29-34
- last seen: 2026-08-21T14:56:46Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
