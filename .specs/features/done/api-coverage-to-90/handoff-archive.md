# Handoff archive — `api-coverage-to-90`

Moved out of `.specs/STATE.md` § Handoff at closeout (2026-08-22). The Handoff carries open work
only; this is the closed record.

## Outcome

**DONE 2026-08-22, Verifier PASS at opus** — 10/10 ACs, 3 mutants injected / 3 killed, 0
spec-precision gaps (`validation.md`). Closes the STATE.md § Handoff item *"Open, blocking
pushes"*.

12 commits on `main`, range `19a26f9..cea5d1d` **excluding `510e312`** (another session's
`security-audit-remediation` record landed on `main` mid-wave and is not part of this feature).

| commit | task |
| --- | --- |
| `b30be0d` | T1 — denominator corrections |
| `188734d` | T2 — idempotency interceptor |
| `54a910b` | T5 — log interceptor |
| `2bdee72` | T4 — openapi document |
| `eabcc02` | T3 — problem details filter |
| `4aa2dfb` | T6 — logger factory |
| `b9c468a` | T7 — weekly-slot, list-query decorator |
| `d6814bc` | T8 — transaction manager, managed dedicated client |
| `2595c3e` | T9 — request-context middleware |
| `9ff5e57` | F1 — wave-2 Build gate lint fix |
| `2d8e0d5` | T10 — measurement, docs |
| `cea5d1d` | F2 — retire the stale threshold comment |

## Gates

Final gate: `pnpm check` 0 · `pnpm test:coverage` 0 (614 tests, no `ERROR:` line) · `pnpm test` 0
(490 tests, from a 399 baseline — **+91**) · `pnpm contract` 0 with no `openapi.json` drift.

Full `pre-push` chain replayed locally (`lefthook run pre-push`), exit 0:
`catalog-typecheck` ✔ · `migrations` ✔ · `typecheck` ✔ · `test-coverage` ✔.

| `apps/api/src/**` | before | after | floor |
| --- | --- | --- | --- |
| statements | 87.70 (884/1008) | **96.69** (965/998) | 90 |
| branches | 74.21 (354/477) | **95.33** (449/471) | 90 |
| functions | 91.30 (273/299) | **94.92** (280/295) | 90 |
| lines | 88.44 (849/960) | **96.84** (920/950) | 90 |

## What was not relaxed

All 12 threshold values are still `90`; no metric key and no glob key removed. No `c8`/`v8`/
`istanbul` ignore pragma anywhere under `apps/api/src/**`. No test deleted, skipped or weakened.

Two denominator corrections, reasoned in `spec.md` § Denominator decisions:
`openapi/export-openapi.ts` (a CLI entry point, already excluded in kind as `apps/api/src/db/**`)
and `shared/config/coverage-metric/*.sample.ts` (fixtures whose COV-06 contract *requires*
`if-else.sample.ts` to stay uncovered — a file whose contract is "be uncovered" cannot also be
coverage debt). Both samples were excluded, not only the red one.

## Production code changed

Four unreachable branches were deleted by restructuring rather than ignored (COV-08):

- `log.interceptor.ts`, `problem-details.filter.ts`, `idempotency.interceptor.ts` — three
  `…split("?")[0] ?? …` fallbacks → `indexOf`/`slice`. `String.prototype.split` always returns at
  least one element, so every fallback arm was dead; the type system required it under
  `noUncheckedIndexedAccess`, which is why the fix is a rewrite, not a deletion. The Verifier
  confirmed behavioural identity for `""`, `"?"`, `"?a"`, `"/a?b=1"` and a url with no `?`, and
  that the idempotency `endpoint`/scope key is unchanged.
- `list-query.decorator.ts` — `json.properties ?? {}`. Verified against the installed dependency:
  `zod@4.4.3/v4/core/json-schema-processors.js:279` sets `json.properties = {}` unconditionally
  for a `ZodObject`. `pnpm contract` regenerates a byte-identical `openapi.json`.

## Side effects worth keeping

Two pre-existing vacuous assertions were strengthened (never weakened):

- `problem-details.filter.spec.ts` — `expect(headers["Retry-After"]).toBeDefined()` → `toBe("60")`.
- `transaction-manager.int-spec.ts` (`audit_ctx`) — proved nothing at all: `observed` was a `let`
  mutated inside a doubly-nested closure, which TypeScript's control-flow narrowing does not see,
  so the checker treated it as always `null` and the `?? ""` fallback was statically dead. Now
  asserts the exact JSON stamped into Postgres.

## Lessons distilled

- **L-014** — a cluster gate that writes specs must include lint. This feature's cluster gate was
  `typecheck && vitest`, so 6 eslint errors in three new specs only surfaced at the wave-2 Build
  gate (fixed in F1 `9ff5e57`).
- **L-015** — `@typescript-eslint/no-unnecessary-condition` firing on a `??` inside a test is a
  vacuity detector, not a style nit: an always-nullish operand usually means the assertion proves
  nothing. Treat it as a defect first.

## Interaction with `test-suite-refactor`

T39/C10 of `test-suite-refactor` still owns the coverage ratchet. This feature left the
`thresholds` block's four `90`s and both glob keys untouched, so that ratchet is intact to
re-baseline. Only the stale "red on purpose" comment *inside* the block was retired (F2
`cea5d1d`), after COV-03's probe was amended from "the diff on the block is empty" to "every
threshold value is still 90 and no key was removed" — the original probe would have forced the
file to keep a statement that T10's measurement had just made false (`spec.md` § COV-03
amendment).
