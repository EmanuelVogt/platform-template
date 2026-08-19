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

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
