# API coverage to 90 — Tasks

**Spec**: `.specs/features/api-coverage-to-90/spec.md`
**Status**: Draft
**Design**: skipped (Medium scope, no architectural decision)

## Execution Protocol (MANDATORY)

Implement with the `tlc-spec-driven` skill — activate it by name and follow its Execute flow and
Critical Rules. A worker's whole contract is `references/cards/worker.md`, resolved through the
active skill, never by filesystem path.

**Orchestrator reminders**: the planning window never implements a cluster; each wave is
dispatched in one message with all its clusters concurrent; the Build gate runs once per wave
through the runner; the orchestrator is the only writer of `.specs/**` during Execute.

## Rules that bind every task

1. **Never lower a floor.** The `thresholds` block of `vitest.coverage.mts` stays at 90/90/90/90,
   global and per glob. A task that cannot reach the floor reports it — it does not edit the bar.
2. **Never add an ignore pragma** (`c8 ignore`, `v8 ignore`, `istanbul ignore`).
3. **Never delete, skip or weaken an existing test.**
4. **Proof, not presence.** Every new test asserts the exact observable outcome the title
   promises, or the error's class **and** message. `toBeDefined`, "the field exists" and "did not
   throw" are not proof (`docs/test/testing.md` § What counts as proof).
5. **Unreachable branch → restructure the source, never ignore it.** Example: `url.split("?")[0]
   ?? url` carries a `??` branch no input can reach (`String.prototype.split` always returns at
   least one element), yet the type system requires the fallback under
   `noUncheckedIndexedAccess`. The fix is to remove the branch, not to tolerate it:
   ```ts
   const index = url.indexOf("?")
   return index === -1 ? url : url.slice(0, index)
   ```
   Both arms are now reachable and testable. Truly dead code is deleted. Whenever a task
   restructures for this reason, the commit body names the branch and why no input reaches it
   (COV-08).
6. **Right layer for the nature of the code** (`docs/test/testing.md` § The api's three layers).
   An interceptor, filter, decorator or pure rule is a unit spec with typed mocks. A file that
   issues SQL is an `*.int-spec.ts` against the testcontainer — mocking the database in the
   integration layer is forbidden (COV-10).
7. **Conventions**: `globals: false` — import from `"vitest"`; pt-BR in `describe`/`it`,
   identifiers in English; relative imports only, never `@/`; test next to the file under test; no
   `.only`/`.skip`, no assertion-less or duplicate-titled test, `max-nested-callbacks: 4`.
8. **Out of bounds**: `catalog/**` and `.worktrees/**` are not touched by any task
   (a `security-audit-remediation` worktree is in flight in another session). A worker that
   believes it needs a file outside its cluster's ownership STOPS and reports.
9. **Commits**: one atomic commit per task, pathspec-limited to the task's own files. No
   `git stash`, no `git add -A`, no `commit -a`, no branch operation.

## Gate Check Commands

| Level | When | Command |
| --- | --- | --- |
| quick | inside a task, on the file just changed | `pnpm vitest run --project api <path>` |
| scoped | worker's cluster gate | `pnpm --filter api typecheck && pnpm vitest run --project api <cluster paths>` (+ `pnpm vitest run --config vitest.integration.mts --project api-int <path>` when the cluster added an `*.int-spec.ts`) |
| full-unit | wave Build gate for a wave touching the kernel or root config | `pnpm check && pnpm test` |
| coverage | wave 3 only — this wave *is* the gate | `pnpm test:coverage` (needs Docker) |
| final | Verifier only, once | `pnpm check && pnpm test:coverage && pnpm contract && git diff --exit-code openapi.json` |

## Wave Plan

| Wave | Cluster | Tasks (in order) | Files owned (union of Touches) | Notes |
| --- | --- | --- | --- | --- |
| 1 | C1 — denominator (exclusive) | T1 | `vitest.coverage.mts`, `docs/test/testing.md` | `Exclusive: yes` — root config; `gate: full-unit`; tier **sonnet** |
| 2 | C2 — http pipeline | T2 → T3 | `apps/api/src/shared/kernel/idempotency/**`, `apps/api/src/shared/kernel/errors/**` | `gate: scoped`; tier **opus** (T2 — idempotency replay/CAS semantics), **sonnet** (T3) |
| 2 | C3 — openapi document | T4 | `apps/api/src/openapi/**` | `gate: scoped`; tier **opus** — the document is the contract source (Kubb, `openapi.json`) |
| 2 | C4 — logging | T5 → T6 | `apps/api/src/shared/kernel/logging/**` | `gate: scoped`; tier **sonnet** |
| 2 | C5 — kernel long tail | T7 → T8 → T9 | `apps/api/src/shared/kernel/scheduling/**`, `apps/api/src/shared/kernel/listing/**`, `apps/api/src/shared/kernel/transactional/**`, `apps/api/src/shared/kernel/context/**`, `apps/api/src/shared/infra/database/**` | `gate: scoped`; tier **sonnet**, T8 **opus** if the transaction-manager gap turns out to be a rollback/ALS path |
| 3 | C6 — measure and close (exclusive) | T10 | any file with a residual gap, `docs/test/testing.md` | `Exclusive: yes`; `gate: coverage`; tier **opus** |

```
Wave 1: [C1: T1]                                        (exclusive — root config)
Wave 2: [C2: T2→T3] ∥ [C3: T4] ∥ [C4: T5→T6] ∥ [C5: T7→T8→T9]
Wave 3: [C6: T10]                                       (exclusive — the coverage gate itself)
```

**Cross-check.** Wave 2's four clusters own disjoint directory subtrees; no file appears in two
`Touches` of the same wave. `docs/test/testing.md` is touched by C1 (wave 1) and C6 (wave 3) —
different waves, never concurrent. C2 imports `logging/logger.factory.ts` (owned by C4) and C4
imports `config/env.ts`; imports are not ownership — **no cluster edits a file it does not own**.
A cluster that finds it must change another cluster's file reports it instead (rule 8); the
duplicated `split("?")` helper across `log.interceptor.ts`, `problem-details.filter.ts` and
`idempotency.interceptor.ts` is deliberately **not** consolidated here — each cluster fixes its own
copy, consolidation belongs to `test-suite-refactor`.

**Why the order.** The denominator is corrected first (wave 1) so every later measurement is
against the real bar; the test-writing clusters are independent and run concurrently (wave 2); the
measurement that decides the gate is exclusive and last (wave 3), because it may need to touch any
file that still carries a residual gap.

## Budget

After D-1/D-2 the gap is **+72 branches, +12 statements, +4 lines**. Wave 2 targets 100 branches
(the four large files carry 72, the six small ones 28), which lands branches near 96 % rather than
on the threshold. T10 exists because v8 branch accounting is not additive from a summary: it
measures and closes whatever is left.

## Progress

| Wave | Cluster | Tier | Tasks | Commit(s) | Build gate |
| --- | --- | --- | --- | --- | --- |
| 1 | C1 — denominator | sonnet | T1 done | `b30be0d` | full-unit PASS (`pnpm check` 0, `pnpm test` 0 — 76 files / 399 tests) |
| 2 | C2 — http pipeline | opus | T2, T3 done | `188734d`, `eabcc02` | scoped PASS — interceptor 48/48 br, filter 41/41 br; rule 5 applied to both `split("?")` fallbacks; a pre-existing `toBeDefined()` strengthened to `toBe("60")` (COV-07) |
| 2 | C3 — openapi document | opus | T4 done | `2bdee72` | scoped PASS — `openapi-config.ts` 38/38 st, 22/22 br, 3/3 fn, 32/32 ln (100 %); source untouched |
| 2 | C4 — logging | sonnet | T5, T6 done | `54a910b`, `4aa2dfb` | scoped PASS — 37 tests in `logging/`; rule 5 applied to `stripQuery` (`log.interceptor.ts:21-24`) |
| 2 | C5 — kernel long tail | sonnet | T7, T8, T9 done | `b9c468a`, `d6814bc`, `2595c3e` | scoped PASS — 142 tests over the five owned dirs; `managed-dedicated-client.ts` covered as **unit** (it issues no SQL — it delegates connection creation to the injected factory, so the double is a collaborator mock, not a database mock: COV-10 satisfied); rule 5 applied to `list-query.decorator.ts:26-33` (`json.properties ?? {}` unreachable — zod's `objectProcessor` always sets it) |
| 2 | Build gate | — | F1 fix | `9ff5e57` | **FAIL → PASS.** First run: `pnpm check` exit 1, 6 eslint errors in three C4/C5 specs (the cluster gates ran typecheck + vitest, not the package lint). After F1, re-run through the runner: `check` 0, `test` 0 — **80 files / 490 tests** (baseline was 76 / 399, so +91 tests). |
| 3 | C6 — measure and close | opus | T10 done | `2d8e0d5` | **coverage gate PASS** — `pnpm test:coverage` exit 0, no `ERROR:` line; `pnpm check && pnpm test` exit 0 (80 files / 490 tests) |
| 3 | F2 — retire stale comment | haiku | dispatched | — | — |

### T10 result — `apps/api/src/**` measured

| metric | covered/total | % | floor |
| --- | --- | --- | --- |
| statements | 965/998 | 96.69 | 90 |
| branches | 449/471 | 95.33 | 90 |
| functions | 280/295 | 94.92 | 90 |
| lines | 920/950 | 96.84 | 90 |

Global merged run: 96.46 / 95.19 / 95.00 / 96.81. All four clear on the **first** measurement —
waves 1–2 overshot the +72-branch budget, so no gap-closing commit was warranted; adding tests to
files already above the bar would be scope creep past COV-01.

Probes at T10: `rg 'c8 ignore|v8 ignore|istanbul ignore|node:coverage' apps/api/src` → nothing
(COV-04); `git diff --name-only 19a26f9..HEAD -- catalog .worktrees` → nothing (COV-09).

Residuals left, all far inside the floor: `scheduling/maintenance-runtime.ts` (3 br),
`tracing/event-trace-propagation.ts` (2), `outbox/outbox.dispatcher.ts` (2),
`transactional/transactional.decorator.ts` (2), `infra/database/application-pool.ts` (2).

### F2 — retire the stale threshold comment

T10 reported that `vitest.coverage.mts:53-55`, *inside* the `thresholds` block, still says the api
does not reach the bar and that pre-push is red on purpose. That is false as of T10. COV-03 as
first written forbade touching the block at all, so the criterion was amended (see `spec.md`
§ COV-03 amendment): it now asserts that every threshold **value** is still 90 and no metric or
glob key was removed, instead of demanding an empty diff. The four `90`s do not move; only the
comment is replaced.

**Resume point**: waves 1 and 2 are done and gated. The next action is to dispatch wave 3 (C6 /
T10, exclusive, opus): run `pnpm test:coverage` with Docker up, read
`coverage/coverage-summary.json`, close whatever the four metrics still miss, then update the
"red on purpose" paragraph in `docs/test/testing.md`. After T10's wave gate, dispatch the
**Verifier** (`spec-verifier`, sonnet) — always-on, never prompted — pointing it at `spec.md`
§ Acceptance criteria (COV-01…COV-10), the diff range in § Feature diff range (excluding
`510e312`), and the two candidate lessons in F1.

Expected going in: branches were the binding metric (+72 needed after the denominator fix). The
four large files reported 100 % branches in their scoped runs, and the six small ones are covered,
so the projection is comfortably above 90 — but v8 branch accounting is not additive from scoped
runs, which is exactly why T10 measures rather than assumes.

### F1 — wave-2 Build gate fix

`pnpm check` exit 1 after wave 2. Six errors, none in production code:

| file | rule |
| --- | --- |
| `shared/infra/database/managed-dedicated-client.spec.ts:72` | `unbound-method` |
| `shared/infra/database/managed-dedicated-client.spec.ts:101` | `prefer-promise-reject-errors` |
| `shared/kernel/logging/logger.factory.spec.ts:20` | `consistent-type-imports` |
| `shared/kernel/logging/logger.factory.spec.ts:88` | `unbound-method` |
| `shared/kernel/transactional/transaction-manager.int-spec.ts:244` | `no-confusing-void-expression` |
| `shared/kernel/transactional/transaction-manager.int-spec.ts:285` | `no-unnecessary-condition` — left side of `??` always nullish |

The last one is treated as a possible real defect, not a style nit: an always-nullish left operand
means the assertion may be proving nothing (COV-07). Fixed by correcting the code, never by an
`eslint-disable`, never by dropping an assertion (rule 3).

**Process gap this exposes**: the cluster gate in § Gate Check Commands is
`pnpm --filter api typecheck && pnpm vitest run …` — it does not include lint, so lint errors only
surface at the wave gate. Candidate lesson for the Verifier.

**Outcome — `9ff5e57`.** Five of the six were mechanical (capture the mock handle at creation
instead of reading back an unbound `pg.Client.end` / `pino.Logger.child`; `import type * as
PinoModule`; braces around a void-expression arrow body; `mockRejectedValueOnce("econnrefused")`
keeping the exact non-Error rejection scenario). No `eslint-disable`, no assertion dropped.

The sixth was a **real defect**, as suspected. In the `audit_ctx` test, `observed` was a `let`
mutated inside a doubly-nested closure; TypeScript's control-flow narrowing does not see a
reassignment made inside a nested function expression, so at the assertion site the checker
treated `observed` as always `null` and the `?? ""` fallback was statically dead — the assertion
was vacuous. Fixed by returning the value from the awaited call chain
(`const observed = await requestContext.run(...)`). It now proves that `app.audit_ctx` was
actually stamped inside the transaction and that the JSON written to Postgres equals
`{ actor_user_id: "user-42", correlation_id: "corr-audit", origin: "job" }` — the exact
actor/correlation/origin carried by the `RequestContext`, not "did not throw" (COV-07, L-007).

**Candidate lesson**: `@typescript-eslint/no-unnecessary-condition` firing on a `??` inside a test
is a vacuity detector, not a style nit — an always-nullish operand usually means the assertion
proves nothing. Treat it as a defect before treating it as lint.

### Feature diff range

Base `19a26f9`. This feature's commits, in order: `b30be0d` (T1), `188734d` (T2), `54a910b` (T5),
`2bdee72` (T4), `eabcc02` (T3), `4aa2dfb` (T6), `b9c468a` (T7), `d6814bc` (T8), `2595c3e` (T9).

**`510e312` is not ours** — another session (the `security-audit-remediation` worktree) committed
its own `.specs/` wave record onto `main` while wave 2 was running. It sits inside
`19a26f9..HEAD` and must be excluded from any review or diff of this feature. Our commits are
pathspec-limited, so nothing was clobbered in either direction.

### Open notes from wave 2

- **N-1 (must clear before the wave gate)** — C3 observed a package-wide `pnpm --filter api
  typecheck` exit 2 caused by C4's in-flight file:
  `src/shared/kernel/logging/logger.factory.spec.ts(21,52): TS2339: Property 'default' does not
  exist on type 'typeof pino'`. C4 owns it and its own scoped gate must clear it; the wave Build
  gate re-checks.
- **N-2 (pre-existing, not a gate risk)** — `prettier --check` fails in this checkout because
  `prettier-plugin-tailwindcss` cannot load Tailwind v4. `pnpm check` is `turbo lint typecheck`
  and does not run prettier, so no gate of this feature is affected. Not this feature's to fix.

---

## Task Breakdown

### T1: Correct the coverage denominator

**What**: exclude the two non-product files from `vitest.coverage.mts` coverage, per D-1 and D-2 of
the spec, and document both rows.
**Where**: `vitest.coverage.mts`, `docs/test/testing.md`
**Touches**: the two files above
**Depends on**: None · **Exclusive**: yes
**Requirement**: COV-03, COV-05, COV-06

Add to `coverage.exclude`, each with a short comment naming the reason:
- `apps/api/src/openapi/export-openapi.ts` — CLI entry point, same nature as the already-excluded
  `apps/api/src/db/**`; the document builder it wraps (`openapi-config.ts`) stays in the
  denominator.
- `apps/api/src/shared/config/coverage-metric/*.sample.ts` — fixtures of the coverage-metric
  contract, measured by the nested run that `coverage-metric.contract.spec.ts` spawns;
  `if-else.sample.ts` is required by COV-06 to stay uncovered.

Add the two rows to the exclusion table in `docs/test/testing.md` § Coverage exclusions. **Do not
touch the `thresholds` block** and do not touch the "the api does not clear the bar yet" paragraph
— T10 owns that sentence, once it is false.

**Verify**: `pnpm vitest run --project api apps/api/src/shared/config/coverage-metric` — both
`it`s of the contract spec green (COV-06), proving the exclusion did not break the nested run.
`git diff vitest.coverage.mts` shows no change inside `thresholds` (COV-03).

### T2: Cover `idempotency.interceptor.ts` (30 branches)

**What**: extend the existing unit spec so every decision of the interceptor is exercised.
**Where**: `apps/api/src/shared/kernel/idempotency/idempotency.interceptor.spec.ts`
**Touches**: that spec; `idempotency.interceptor.ts` only if rule 5 applies
**Depends on**: None · **Exclusive**: no
**Requirement**: COV-01, COV-07, COV-08

Typed mocks for `Reflector`, `IdempotencyRepository`, `RequestContext`, `ExecutionContext`,
`CallHandler` — the repository is mocked here because the interceptor's own logic, not its SQL, is
under test; the repository's SQL keeps its own `*.int-spec.ts`. Decisions to reach, each asserted
on its observable outcome:
- no `@Idempotent` metadata → the handler runs and its value is returned untouched;
- non-`http` execution context → same;
- missing `Idempotency-Key` header → handler runs (the header is optional by design, Stripe model);
- header arriving as `string[]` → the first element is the key actually passed to `tryReserve`;
- header arriving as a bare string → same key;
- no reservation conflict → handler runs and `complete(…, "completed", <res.statusCode>, result)`
  is called with the handler's own value;
- existing row with a different `requestHash` → `UnprocessableEntityException`, message
  `"Idempotency-Key reusada com payload diferente"`;
- existing `in_progress` → `ConflictException`, message
  `"Requisição ainda em processamento, tente novamente"`;
- existing `completed` with `responseStatus < 400` → `res.status(<persisted>)` called and the
  persisted `responseBody` returned; and the `responseStatus === null` case → 200;
- existing `completed` with `responseStatus >= 400` → `HttpException` re-thrown carrying the
  persisted body and status; and the `responseBody === null` case → body `"Erro"`;
- existing `failed` + `reopen` returns truthy → the handler re-runs;
- existing `failed` + `reopen` returns falsy → `ConflictException` with the same message;
- handler throws an `HttpException` with status < 500 → `complete(…, "completed", status,
  err.getResponse())` and the error re-thrown;
- handler throws an `HttpException` with status >= 500 → `complete(…, "failed", status, null)`;
- handler throws a non-`HttpException` → `complete(…, "failed", 500, null)`;
- request context absent (`tryGet()` → undefined) → scope `"_:_"`; context with tenant and actor →
  `"<tenantId>:<actorId>"`; and the tenant-only / actor-only mixes (L-004: the representative case
  does not prove the others);
- `hashRequest` — the same body with keys in a different order yields the same `requestHash`
  passed to `tryReserve` (that is what `sortKeys` is for), a nested object and an array included; a
  different body yields a different one; the query string is not part of the hash.
- `expiresAt` — assert the value handed to `tryReserve`, derived from `opts.ttlHours`, with a fake
  timer so the assertion is exact.

**Verify**: `pnpm vitest run --project api apps/api/src/shared/kernel/idempotency`

### T3: Cover `problem-details.filter.ts` (12 branches)

**What**: extend the existing unit spec over every problem shape and the `Retry-After` matrix.
**Where**: `apps/api/src/shared/kernel/errors/problem-details.filter.spec.ts`
**Touches**: that spec; `problem-details.filter.ts` only if rule 5 applies
**Depends on**: T2 (same cluster, ordered) · **Exclusive**: no
**Requirement**: COV-01, COV-07, COV-08

Assert the JSON body handed to `res.json` and the status handed to `res.status`, field by field:
- `DomainError` → `type`/`title`/`status`/`detail` from the error, plus `extensions` spread; and
  the `extensions === undefined` case;
- `ZodValidationException` → status 400, `errors` carrying the Zod `issues`; and the case where
  `getZodError()` returns something without `issues` → `errors` undefined;
- `HttpException` whose `getResponse()` is a string → that string as `title`;
- `HttpException` whose response object carries `message: string` → that string;
- `message: string[]` → joined with `", "`;
- `message` of another type (or absent) → falls back to `exception.message`;
- an unknown throwable → 500, `"Erro interno"`;
- `correlationId` present in the context, and `tryGet()` undefined → `null`;
- `instance` — a URL with a query string is truncated at `?`, and one without is unchanged (no PII
  echo);
- `status >= 500` → `log.error("unhandled_exception", …)` called; a 4xx → not called;
- `Retry-After`: a `DomainError` with a numeric `retryAfterSeconds` → that value; a `DomainError`
  with it undefined → 60; an `HttpException` whose response object carries a numeric `retryAfter`
  → that value; a non-numeric `retryAfter` → 60; a response that is not an object → 60; status 503
  as well as 429; and a 400 → the header is never set.

**Verify**: `pnpm vitest run --project api apps/api/src/shared/kernel/errors`

### T4: Cover `openapi-config.ts` (22 branches / 34 statements / 28 lines)

**What**: create the unit spec for `buildOpenApiDocument` — the file is at 4/38 statements today.
**Where**: `apps/api/src/openapi/openapi-config.spec.ts` (new)
**Touches**: that spec; `openapi-config.ts` only if rule 5 applies
**Depends on**: None · **Exclusive**: no
**Requirement**: COV-01, COV-07

Boot a `Test.createTestingModule` with purpose-built controllers (no database, no `AppModule`) and
call `buildOpenApiDocument(app)`. Cover, asserting the resulting document:
- a handler with `@ApiOperation({ operationId })` and a `{ kind: "public" }` access requirement →
  `security: []` on that operation;
- a handler with a non-public requirement → keeps the document's default cookie requirement;
- the requirement declared on the **controller class** rather than the handler → the handler
  inherits it (the `??` fallback in `collectPublicOperationIds`);
- a public handler **without** an `operationId` → contributes nothing, and no operation is wrongly
  opened;
- `summary: ""` injected by a bare `@ApiOperation` → the key is deleted from the operation; a real
  summary → preserved;
- a path item carrying only some of `ALL_METHODS` → the absent methods are skipped without
  throwing, and both a mutating (`post`) and a safe (`get`) method are exercised;
- a controller whose `metatype` is not a function, and one whose prototype has only
  `constructor` → skipped;
- the document head: `title`, `version`, the `__Host-rit_session` cookie security scheme and the
  default `addSecurityRequirements("cookie")` present.

Assert the document, not the call — this file's output is the contract source consumed by Kubb.

**Verify**: `pnpm vitest run --project api apps/api/src/openapi`

### T5: Cover `log.interceptor.ts` (8 branches)

**What**: extend the existing unit spec over both verbosity modes and both rxjs outcomes.
**Where**: `apps/api/src/shared/kernel/logging/log.interceptor.spec.ts`
**Touches**: that spec; `log.interceptor.ts` only if rule 5 applies
**Depends on**: None · **Exclusive**: no
**Requirement**: COV-01, COV-07, COV-08

`verbose` is read from `env().NODE_ENV` at construction, so both modes need their own instance
(stub the `../../config/env` module per instance). Assert the object handed to `log.info`/
`log.error`:
- non-`http` context → the handler's observable is returned and nothing is logged;
- success in `development` → `reqBody` and `resBody` present and redacted by `redactValue`;
- success outside `development` → neither key present, `method`/`url`/`status`/`durationMs` still
  logged;
- error path → `log.error` with `err`, and no `status` key;
- `hasBody`: `undefined`, `null`, a non-object (string/number), `{}` and a populated object — only
  the last produces `reqBody` (L-004: cover every variant, not one representative);
- `stripQuery`: a url with a query string is truncated, one without is returned unchanged. If the
  `?? url` fallback proves unreachable, apply rule 5.

**Verify**: `pnpm vitest run --project api apps/api/src/shared/kernel/logging`

### T6: Cover `logger.factory.ts` (5 branches)

**What**: create the unit spec for the logger factory.
**Where**: `apps/api/src/shared/kernel/logging/logger.factory.spec.ts` (new)
**Touches**: that spec; `logger.factory.ts` only if rule 5 applies
**Depends on**: T5 (same cluster, ordered) · **Exclusive**: no
**Requirement**: COV-01, COV-07

Read the file first and cover each decision it actually makes (transport/level/pretty selection by
env, the module-name binding of `forModule`, the context fields merged into a record). Assert the
payload the underlying logger receives, not that a logger object was returned.

**Do not change the public signature** of `LoggerFactory`/`AppLogger` — `problem-details.filter.ts`
and `log.interceptor.ts` depend on it and are owned by other clusters this wave. If a fix requires
it, STOP and report.

**Verify**: `pnpm vitest run --project api apps/api/src/shared/kernel/logging`

### T7: Cover `weekly-slot.ts` (6 branches) and `list-query.decorator.ts` (4 branches)

**What**: close the two pure-rule gaps of the kernel long tail.
**Where**: `apps/api/src/shared/kernel/scheduling/weekly-slot.spec.ts` (extend),
`apps/api/src/shared/kernel/listing/list-query.decorator.spec.ts` (new)
**Touches**: those two specs; their sources only if rule 5 applies
**Depends on**: None · **Exclusive**: no
**Requirement**: COV-01, COV-07

`weekly-slot.ts` is 41/47 branches and 11/13 functions — find the six unreached decisions
(boundary/overlap/invalid-input arms) and assert the returned value or the thrown error's class
**and** message. `list-query.decorator.ts` is 0/6 statements: it is untested end to end; exercise
the decorator through a controller handler or through its factory and assert the parsed query
object it produces, including the default and the invalid-input arms.

**Verify**: `pnpm vitest run --project api apps/api/src/shared/kernel/scheduling apps/api/src/shared/kernel/listing`

### T8: Cover `transaction-manager.ts` (5 branches) and `managed-dedicated-client.ts` (4 branches)

**What**: close the two database-adjacent gaps, each at the layer its nature demands.
**Where**: `apps/api/src/shared/kernel/transactional/transaction-manager.int-spec.ts` (extend);
for `managed-dedicated-client.ts`, the worker decides after reading it — `*.int-spec.ts` if it
issues SQL, `<name>.spec.ts` if it is pure lifecycle logic over an injected client
**Touches**: `apps/api/src/shared/kernel/transactional/**`, `apps/api/src/shared/infra/database/**`
**Depends on**: T7 (same cluster, ordered) · **Exclusive**: no
**Requirement**: COV-01, COV-07, COV-10

`transaction-manager.ts` has only an integration spec today; its five uncovered branches are the
error/rollback/nesting arms. Reach them against the real testcontainer — **never** by mocking the
database (`docs/test/testing.md`). Assert the persisted state after rollback and the error's class
**and** message, not that a call happened.

State the layer chosen for `managed-dedicated-client.ts` and the reason in the task summary
(COV-10).

**Verify**: `pnpm vitest run --project api apps/api/src/shared/infra/database` and
`pnpm vitest run --config vitest.integration.mts --project api-int apps/api/src/shared/kernel/transactional`

### T9: Cover `request-context.middleware.ts` (4 branches)

**What**: close the correlation-id / ALS entry gap.
**Where**: `apps/api/src/shared/kernel/context/request-context.middleware.spec.ts` (extend)
**Touches**: that spec; its source only if rule 5 applies
**Depends on**: T8 (same cluster, ordered) · **Exclusive**: no
**Requirement**: COV-01, COV-07

14/18 branches. Cover the header variants (present, absent → generated, array-valued) and whatever
tenant/actor arms the file carries; assert the context observed **inside** the `next()` call
(L-013: proving the handler answers correctly when called does not prove it runs), not that the
middleware returned.

**Verify**: `pnpm vitest run --project api apps/api/src/shared/kernel/context`

### T10: Measure, close the residual, and retire the red-on-purpose note

**What**: run the real gate, close whatever the four metrics still miss, and update the two
documents that assert the api is below the bar.
**Where**: any file with a residual gap; `docs/test/testing.md`
**Touches**: as measured · **Exclusive**: yes
**Depends on**: T1–T9 · **Requirement**: COV-01, COV-02, COV-03, COV-04, COV-05, COV-09

1. `pnpm test:coverage` (Docker up). Read `coverage/coverage-summary.json` for the per-file
   residual under `apps/api/src/**`.
2. If any metric is short, close the largest remaining gaps under the same rules — highest
   uncovered-branch count first. Never lower a floor (rule 1), never ignore (rule 2).
3. Re-run until `pnpm test:coverage` exits 0 with no threshold `ERROR` line, then run `pnpm test`.
4. Update `docs/test/testing.md` § Coverage exclusions: replace the "the api does not clear the bar
   yet (branches 74.21 % …) so the coverage step is red on purpose" sentence with the measured
   result. Do not touch the `thresholds` block of `vitest.coverage.mts`.
5. Report the final four numbers in the task summary.

**Verify**: `pnpm test:coverage` exit 0, no `ERROR:` line; `pnpm test` exit 0;
`rg -n 'c8 ignore|v8 ignore|istanbul ignore' apps/api/src` returns nothing;
`git diff --name-only main.. -- catalog .worktrees` returns nothing.
