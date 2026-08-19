# Pre-push coverage 95% — Specification

Scope: **Large** (api unit coverage + web vitest coverage + lefthook + branch metric on production TypeScript). Current floors and file counts: `spike.md`.

## Problem Statement

The template’s coverage gates sit far below 95% (api unit 43/35/40/45, web 64/56/61/64). Pre-push runs web `test:cov` but api `test` with no coverage. Branch % on the api is also poisoned by `@swc/jest` downlevel (`?.` / `??` / default params), so a 95% branch bar on emitted JS is either unreachable or bought with `istanbul ignore`. The maintainer cannot push a regression of tested behaviour, and cannot treat branch coverage as a real quality signal.

## Goals

- [ ] Pre-push fails unless **api unit** and **web** coverage are each ≥ 95% statements, branches, functions, and lines.
- [ ] Branch % is computed from production TypeScript source, not from SWC-emitted synthetic branches.
- [ ] New tests assert observable behaviour (`docs/test/testing.md`); the gate is not met by deleting code, widening ignores, or asserting implementation.

## Out of Scope

| Feature | Reason |
| --- | --- |
| 100% coverage | Bar moved to 95% on pre-push |
| `test:cov:all` (unit+int+e2e merge) on pre-push | Requires Docker; minutes per push |
| Raising the nyc combined gate (85/51/90/90) | Not the pre-push suite |
| Coverage of `packages/api-client` generated output | Generated; no app tests |
| Architectural lists (`AUDITED`/`authz-coverage`/module-boundaries) | Different kind of “coverage” |
| Weakening, skipping, or deleting tests to meet the bar | Execution contract |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Measurement suites | api **unit** `test:cov` + web `test:cov` | Pre-push must stay Docker-free; combined merge stays `test:cov:all` off-hook | y (user: 95% on pre-push; hook suite not contradicted) |
| Four metrics including branch | 95% S/B/F/L on both suites | User corrected “S/F/L only” | y |
| Branch denominator | Production TypeScript source | SWC-emitted JS invents unclosable branches | y (declared default) |
| Denominator excludes | `*.d.ts`, `*.spec.ts`/`*.int-spec.ts`/`*.e2e-spec.ts`/`*.test.ts(x)`, `main.ts`/`main.tsx`, `apps/web/src/shared/test/**`, Kubb/generated client, empty product slot files | Same classes web already excludes; slots are empty by AD-001 | n — default, user may correct |
| `istanbul ignore` / coverage pragmas | Forbidden except a documented leftover of the TS-source instrumenter | Ignore would fake 95% | n — default |
| Gate raise timing | Fill tests until the runner reports ≥95%, then raise thresholds and switch lefthook `test` → `test:cov` for api | Raising first makes every push red | n — default |
| Combined `test:cov:all` | Unchanged floors | Explicitly not this feature | y |
| Remaining implicit dimensions (auth, idempotency, concurrency, TTL, external IO, state machines) | N/A | This is a local test gate, not a runtime product flow | y |

**Open questions:** none unmarked — excludes / ignore / raise-last are defaults the user can correct on the spec.

---

## User Stories

### P1: Pre-push rejects coverage below 95% ⭐ MVP

**User Story**: As a template maintainer, I want `git push` to fail when api unit or web coverage is under 95% on any of the four metrics so that coverage cannot erode.

**Why P1**: The user’s stated bar.

**Acceptance Criteria**:

1. WHEN lefthook `pre-push` runs THEN it SHALL execute `pnpm turbo test:cov --filter=api` and `pnpm turbo test:cov --filter=web` (api unit coverage, not `turbo test`).
2. WHEN either suite’s coverage is below 95% statements **or** branches **or** functions **or** lines THEN the command SHALL exit non-zero and the push SHALL be blocked.
3. WHEN both suites are ≥95% on all four metrics THEN coverage SHALL not be the reason the push is blocked.
4. WHEN `collectCoverageFrom` / vitest `coverage.include` is evaluated THEN test files, `*.d.ts`, bootstrap `main.ts`/`main.tsx`, web `shared/test/**`, generated client, and empty product slot files SHALL be absent from the denominator.

**Independent Test**: `probe: pnpm turbo test:cov --filter=api` and `probe: pnpm turbo test:cov --filter=web` each print ≥95% on S/B/F/L; lefthook `test-api` command is `test:cov`. Proof also `gate` (pre-push).

---

### P1: Branch percent is TypeScript-source truth

**User Story**: As a template maintainer, I want branch coverage to count branches I wrote so that 95% branch is a real signal.

**Why P1**: User required branch 95%; SWC downlevel makes emitted-JS branch 95% unreachable without ignores (`apps/api/scripts/coverage-all.sh`).

**Acceptance Criteria**:

1. WHEN api unit coverage is collected THEN a `?.` / `??` / default-parameter that is not a source-level branch SHALL NOT lower the reported branch percent.
2. WHEN a production TypeScript source branch (if/else, switch case, ternary, catch, `&&`/`||` used as control flow) is not taken by any unit test THEN that branch SHALL count as uncovered and SHALL keep the suite below 95% until a test takes it or the code is removed.
3. WHEN a coverage pragma (`istanbul ignore`, `v8 ignore`, equivalent) is added to production source to meet the bar THEN that is a spec miss — the gate SHALL be met by tests or by deleting dead code, not by ignore.

**Independent Test**: a fixture with only `foo?.bar` (no other branches) reports 100% branch under the api unit coverage command; a fixture with `if (x) a; else b;` and tests only the true path reports branch < 100%.

---

### P1: Tests that close the gap stay behavioural

**User Story**: As a template maintainer, I want the new tests that bring each suite to 95% to lock observable behaviour so that the number is not bought with spies on internals.

**Why P1**: Handbook + L-002 (assert the promised value).

**Acceptance Criteria**:

1. WHEN a new test is added for this feature THEN it SHALL assert an observable outcome (return value, thrown error message, HTTP/problem body, rendered text, persisted row) — not that a private method was called.
2. WHEN the only way to hit a branch is an error path THEN the test SHALL assert the error the production code already throws (class **and** message fragment when the code names a value), not a new swallowed branch.
3. WHEN code is unreachable or dead THEN it SHALL be deleted (or extracted to an unexported helper that is not in the denominator) rather than ignored.

**Independent Test**: sample of new specs in the diff; Verifier rejects spy-only or ignore-only closures.

---

## Edge Cases

- WHEN coverage is 94.9% on one metric THEN the gate SHALL fail (no rounding up).
- WHEN api `test:cov` and web `test:cov` would race on a shared `coverage/` directory THEN each app SHALL write under its own directory (`apps/api/coverage`, `apps/web/coverage`) as today.
- WHEN Docker is unavailable THEN pre-push SHALL still be able to pass (unit + vitest only).
- WHEN `test:cov:all` is run manually THEN its floors SHALL remain 85/51/90/90 (unchanged).

---

## Requirement Traceability

| Requirement ID | Story | Proof | Phase | Status |
| --- | --- | --- | --- | --- |
| COV-01 | P1: pre-push runs both `test:cov` | gate | Tasks | In Tasks (T11) |
| COV-02 | P1: <95% any metric fails the push | gate | Tasks | In Tasks (T11) |
| COV-03 | P1: ≥95% all four does not block on coverage | gate | Tasks | In Tasks (T11) |
| COV-04 | P1: excludes out of the denominator | probe: coverage include/exclude in api jest + web vitest configs | Tasks | In Tasks (T1, T10, T11) |
| COV-05 | P1: SWC-synthetic branches do not count | test | Tasks | In Tasks (T2) |
| COV-06 | P1: untested source branch keeps suite <95% | test | Tasks | In Tasks (T2) |
| COV-07 | P1: no ignore-pragma to meet the bar | probe: `rg 'istanbul ignore\|v8 ignore' apps/api/src apps/web/src` empty of new pragmas | Tasks | In Tasks (T3–T11) |
| COV-08 | P1: new tests assert observable outcomes | test | Tasks | In Tasks (T3–T10) |
| COV-09 | P1: error paths assert class + message when named | test | Tasks | In Tasks (T3–T10) |
| COV-10 | P1: dead code deleted, not ignored | gate | Tasks | In Tasks (T3–T10) |

**ID format:** `COV-NN`

**Coverage:** 10 total, 10 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] `pnpm turbo test:cov --filter=api` and `--filter=web` each report ≥95% S/B/F/L.
- [ ] lefthook `pre-push` `test-api` is `test:cov`; a push with eroded coverage is blocked.
- [ ] Branch % matches TypeScript-source branches (COV-05 fixture).
