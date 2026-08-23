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

### L-010 — A per-entry catalog:check pass does not prove multi-entry compatibility — run the combined catalog:check (every entry installed together, the default no-args scope) at least once before closing a catalog change that touches more than one entry.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `catalog` · harmful: 0
- features: vitest-migration
- evidence: CAT-03 / catalog/audit/api/domain/audit-coverage.int-spec.ts:78 (Final gate: pnpm catalog:check, exit 7) (catalog)
- last seen: 2026-08-22T21:54:31Z

### L-011 — An advisory's 'Correção adicional' for a structural fix must give products already on the old version the same manual DDL step other structural corrections in the same document give, not just describe the code-side change.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `catalog` · harmful: 0
- features: vitest-migration
- evidence: tasks.md Deviation 24b / docs/advisories/ADV-20260821-03.md (missing manual ALTER COLUMN instruction) (catalog)
- last seen: 2026-08-22T21:54:31Z

### L-012 — A 'no leftover <old-tool>' grep probe must exclude prose that documents the migration itself (advisories, changelogs, absence-assertions), not just the tool's own script name, or it flags expected documentation as a failure.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: vitest-migration
- evidence: CAT-02 probe: rg -c 'jest\.' apps/api catalog (returns 5 CHANGELOG.md matches) (docs) (+1 more)
- last seen: 2026-08-22T21:54:31Z

### L-013 — When two catalog entries are siblings (install order not forced by dependsOn) and one attaches DDL that depends on the other, a combined multi-entry install can silently skip the attach — cover it with a coverage-enforcement test that simulates the documented manual re-apply, and document the manual step in both entries' advisories, not just the code comment.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `catalog` · harmful: 0
- features: vitest-migration
- evidence: catalog/audit/api/domain/audit-coverage.int-spec.ts:34-38 (SPEC_DEVIATION) / tasks.md Deviation 27 (catalog)
- last seen: 2026-08-22T22:14:32Z

### L-014 — A worker's scoped gate that runs only typecheck + the test file leaves lint to the wave gate, so a whole wave's specs land before the first lint error is seen; put the package's lint in the cluster gate whenever the cluster writes test files.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: api-coverage-to-90
- evidence: 9ff5e57 (wave-2 Build gate: pnpm check exit 1, 6 eslint errors) (testing)
- last seen: 2026-08-23T00:06:13Z

### L-015 — @typescript-eslint/no-unnecessary-condition firing on a ?? or ?. inside a test is a vacuity detector, not a style nit: an always-nullish operand usually means control-flow narrowing proved the assertion cannot see the value (a let mutated inside a nested closure), so the test asserts nothing. Fix by returning the value out of the awaited chain, never by an eslint-disable.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: api-coverage-to-90
- evidence: transaction-manager.int-spec.ts:285 (pre-9ff5e57) (testing)
- last seen: 2026-08-23T00:06:13Z

### L-016 — A rejection written as 'A or B' needs one test per disjunct: content-sniff specs that only feed bytes sniffing to null leave the 'sniffed type differs from the declared type' branch deletable with the suite still green.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `catalog/attachment` · harmful: 0
- features: security-audit-remediation
- evidence: mutant 2 — catalog/attachment/api/application/use-cases/upload-attachments-batch/upload-attachments-batch.use-case.ts:67 (catalog/attachment)
- last seen: 2026-08-23T15:33:00Z

### L-017 — Asserting a quota's config default is not proof of the quota: an AC that names a status code (429/413/503) needs an assertion on that status on the route, not on the parsed config value.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `catalog/attachment` · harmful: 0
- features: security-audit-remediation
- evidence: REM-14 (P1 Attach AC7) (catalog/attachment)
- last seen: 2026-08-23T15:33:00Z

### L-018 — A migration that registers columns for redaction is not evidence of redaction — every newly registered column needs its own read-back assertion on the trail row, since the pre-existing one covers only the column added earlier.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `migrations` · harmful: 0
- features: security-audit-remediation
- evidence: REM-40 (P3 AC10) — catalog/identity/single-tenant/migrations/custom/03_audit_redact_token_hashes.sql (migrations)
- last seen: 2026-08-23T15:33:00Z

### L-019 — An error branch whose only visible artifact is a log line stays untested unless a spec asserts that log key; grep the key across specs before calling the catch path covered.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `catalog/attachment` · harmful: 0
- features: security-audit-remediation
- evidence: REM-12 (P1 Attach AC5) — catalog/attachment/api/api/controllers/download-attachment.controller.ts:78-91 (catalog/attachment)
- last seen: 2026-08-23T15:33:00Z

### L-020 — When a spec excludes a dependency chain in Out of Scope, its audit gate cannot also demand exit 0 — state the proof as 'no advisory outside that chain' with a command that filters, or the gate is unpassable by construction.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: security-audit-remediation
- evidence: REM-39 Proof + Success Criteria #2 vs spec.md Out of Scope (spec)
- last seen: 2026-08-23T15:33:00Z

### L-021 — A blanket 'fields: 0' upload limit breaks any route that declares a required multipart field; derive the cap from the fields the route actually accepts before writing it into the design.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `catalog/identity` · harmful: 0
- features: security-audit-remediation
- evidence: catalog/identity/single-tenant/api/api/controllers/auth/upload-access-link-avatar.controller.ts:53-60 (catalog/identity)
- last seen: 2026-08-23T15:33:00Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
