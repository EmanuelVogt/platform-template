# Security Audit Remediation Tasks

**Design**: `.specs/features/security-audit-remediation/design.md`
**Spec**: `.specs/features/security-audit-remediation/spec.md` (REM-01..47)
**Touches audit**: `.specs/features/security-audit-remediation/touches-audit.md` (§ 3 of this file, authored separately on 2026-08-22)
**Status**: Draft

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

**Checkout**: `.worktrees/security-audit-remediation`, branch `feat/security-audit-remediation` off `main`. Never edit `.worktrees/vitest-migration/` (stale mirror of `catalog/**`).

**Advisory commit protocol**: the first commit of each entry cluster stages `docs/advisories/ADV-20260822-NN.md` with the code; every later commit touching the same entry carries the trailer `Advisory: none — covered by ADV-20260822-NN (security-audit-remediation)` (`advisory-required.mjs:8`).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `docs/test/testing.md`, `AGENTS.md.jinja:20,41,62-63`, `docs/code-quality.md:124-129`, `apps/api/jest` config trio (`package.json:test/test:int/test:e2e`, `test/jest-integration.json`, `test/jest-e2e.json`), `docs/arch/back.md`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Kernel domain / pure util (rate limiters, in-flight gate, redaction, content-disposition, listing schema, `shouldMountDocs`) | unit | All branches; 1:1 to spec ACs; every listed edge case | `apps/api/src/shared/**/*.spec.ts` | `pnpm --filter api test -- <path>` |
| Kernel config / env schema | unit | One case per required, refused and defaulted variable | `apps/api/src/shared/config/*.spec.ts` | `pnpm --filter api test -- shared/config` |
| Kernel infra with IO (Redis limiter, outbox, idempotency, storage adapter, repositories) | integration | Key paths + error handling; no DB mocks | `apps/api/src/**/*.int-spec.ts` | `pnpm --filter api test:int -- <path>` |
| Kernel HTTP surface (helmet/CORS/trust proxy/docs mount) | e2e | Happy + edge + error | `apps/api/test/*.e2e-spec.ts` | `pnpm --filter api test:e2e -- <path>` |
| Entry domain / application (use cases, policies, entities, guards) | unit | All branches; 1:1 to spec ACs; every listed edge case | `catalog/<entry>/api/**/*.spec.ts` | `pnpm --filter api test -- modules/<entry>` **in a staged child** |
| Entry infrastructure (repositories, adapters) | integration | Key query paths + error paths | `catalog/<entry>/api/**/*.int-spec.ts` | staged child → `pnpm --filter api test:int -- <path>` |
| Entry routes | e2e | Every route in scope: happy + edge + error | `catalog/<entry>/api/__e2e__/*.e2e-spec.ts` | staged child → `pnpm --filter api test:e2e -- <path>` |
| Entry parity (frozen surface) | unit (parity spec) | Re-frozen after any contract change | `catalog/<entry>/parity/*.parity.spec.ts` | staged child → `pnpm --filter api test -- parity` |
| Platform scripts (lint rules, entrypoint, child env defaults) | node:test | New rule + one regression case | `scripts/platform/__tests__/*.test.mjs` | `pnpm test:scripts` |
| Entry boot seed (`api/seeds/*.ts`) — idempotent script, no importable surface | none | Proven by the entrypoint script test (T16) and the `testing/**`-import lint rule (T17) | `catalog/<entry>/api/seeds/*.ts` | gate only |
| Custom SQL migration | none | Filename/registration check via `pnpm test:scripts`; effect proven by the owning entry's int-spec at the Final gate | `catalog/<entry>/migrations/custom/*.sql` | gate only |
| Import-path rewrite with no behaviour change | unit | The moved spec keeps its cases; the port-shape spec asserts the new token | co-located with the moved code | `pnpm --filter api test -- <path>` |
| Manifests / CHANGELOG / advisories / READMEs / docs | none | Gate only (`pnpm catalog:lint`) | — | gate only |
| CI workflows / build output | none — probe | REM-26 and REM-47 probes in `spec.md` | — | probe only |

**Staged-child constraint (hard, from `touches-audit.md` § *Gate constraint*).** The template never runs an entry's `int-spec` or `__e2e__`: `apps/api/test/jest-e2e.json` roots are `test`/`src` only, and `runGates` (`scripts/platform/lib/child.mjs:70-76`) runs `pnpm check` + unit `pnpm test` on the staged child. Every entry integration/e2e proof therefore runs inside a staged child produced by `pnpm catalog:typecheck` (`scripts/platform/catalog-stage.mjs`) with `--keep`, then the runner command above **inside the staged tree**. Task gates that need this say `Gate: full (staged child)` explicitly.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After a task whose proofs are unit specs only | `pnpm --filter api test -- <path scoped to the task's Touches>` |
| Full | After a task with integration or e2e proofs (kernel) | `pnpm --filter api test -- <path>` **+** `pnpm --filter api test:int -- <path>` and/or `pnpm --filter api test:e2e -- <path>`, each path-filtered to the spec files the task created or touched |
| Full (staged child) | After a task with integration or e2e proofs **in a catalog entry** | `pnpm --filter api test -- modules/<entry>` (template tree, unit only) **then** `pnpm catalog:typecheck --keep` and, inside the staged child, `pnpm --filter api test:int -- <path>` / `pnpm --filter api test:e2e -- <path>` |
| Build | Once per wave, orchestrator only, through the runner | `pnpm --filter api typecheck` + `pnpm --filter api lint` + unit tests scoped to the union of the wave's `Touches`. **`full-unit` variant** = `pnpm --filter api typecheck && pnpm --filter api lint && pnpm --filter api test`. Any wave touching a module file, a facade or a cross-module import additionally names `src/modules/module-boundaries.spec.ts` and `src/modules/architecture.spec.ts` explicitly. Never integration/e2e. |
| Final | Once per feature, Verifier only | `pnpm --filter api build` + `pnpm check` + `pnpm --filter api test` + `pnpm --filter api test:int` + `pnpm --filter api test:e2e` + `pnpm test:scripts` + `pnpm catalog:lint` + `pnpm catalog:check` + `pnpm template:smoke` + `cd apps/api && pnpm audit --prod --audit-level=high`, plus the REM-26 and REM-47 probes from `spec.md` |

**Suite-cost rule (hard):** the complete e2e/integration suite and the full unit suite run exactly ONCE per feature, at the Final gate. Per-task gates stay path-filtered; the Build gate runs once per wave, never inside a worker.

---

## Wave Plan

Waves run in order (barrier + Build gate between them). Clusters inside a wave run **in parallel**, one worker each; tasks inside a cluster run in the listed order. Wave 2 holds five clusters: four dispatch immediately, C8 is the FIFO tail (`serial-ok: FIFO tail`), one gate at the end.

| Wave | Cluster | Tasks (in order) | Files (union of Touches) | Notes |
| --- | --- | --- | --- | --- |
| 1 | C1 | T1 → T2 → T3 → T4 → T5 → T6 → T7 | `apps/api/src/shared/kernel/rate-limit/**`, `apps/api/src/shared/kernel/errors/too-many-requests.error.ts`, `apps/api/src/shared/kernel/errors/too-many-requests.error.spec.ts`, `apps/api/src/shared/kernel/collections/in-flight-gate.ts`, `apps/api/src/shared/kernel/collections/in-flight-gate.spec.ts`, `apps/api/src/shared/infra/rate-limit/**`, `catalog/identity/single-tenant/api/domain/ports/rate-limiter.ts`, `catalog/identity/single-tenant/api/domain/ports/ports.spec.ts`, `catalog/identity/single-tenant/api/domain/errors.ts`, `catalog/identity/single-tenant/api/domain/errors.spec.ts`, `catalog/identity/single-tenant/api/infrastructure/rate-limit/**`, `catalog/identity/single-tenant/api/api/guards/rate-limit.guard.ts`, `catalog/identity/single-tenant/api/api/guards/rate-limit.guard.spec.ts`, `catalog/identity/single-tenant/api/testing/allow-all-rate-limiter.ts`, `catalog/identity/single-tenant/api/identity.module.ts`, `catalog/identity/single-tenant/api/application/use-cases/login/login.use-case.ts`, `catalog/identity/single-tenant/api/__e2e__/**`, `catalog/attachment/api/__e2e__/**`, `catalog/audit/api/__e2e__/**`, `catalog/tag/api/__e2e__/**` | kernel rate-limit seam + identity error catalog · gate: full-unit (kernel shared code + module wiring) |
| 1 | C2 | T8 → T9 → T10 → T11 → T12 | `apps/api/src/shared/config/env.ts`, `apps/api/src/shared/config/env.spec.ts`, `apps/api/src/shared/infra/database/connection-config.ts`, `apps/api/src/shared/infra/database/connection-config.spec.ts`, `apps/api/src/shared/infra/redis/redis.provider.ts`, `apps/api/src/shared/infra/redis/redis.provider.spec.ts`, `apps/api/src/docs/docs.ts`, `apps/api/src/docs/docs.spec.ts`, `apps/api/src/main.ts`, `apps/api/test/setup/unit-env.ts`, `apps/api/test/setup/int-env.ts`, `apps/api/test/setup/e2e-env.ts`, `apps/api/test/security-bootstrap.e2e-spec.ts`, `scripts/platform/lib/child.mjs`, `apps/api/.env.example`, `docker-compose.yml`, `apps/api/src/shared/kernel/redaction/sensitive-keys.ts`, `apps/api/src/shared/kernel/redaction/sensitive-keys.spec.ts` | fail-closed config + shared sensitive-key module · gate: full-unit (env read by every spec) |
| 1 | C3 | T13 → T14 → T15 → T16 → T17 → T18 | `apps/api/nest-cli.json`, `apps/api/tsconfig.build.json`, `apps/api/Dockerfile`, `apps/api/docker-entrypoint.sh`, `apps/api/docker-entrypoint.dev.sh`, `apps/api/package.json`, `catalog/identity/single-tenant/api/seeds/bootstrap.ts`, `catalog/identity/single-tenant/api/testing/seeds/bootstrap-master.ts`, `catalog/identity/single-tenant/api/testing/seeds/master-user.seed.ts`, `scripts/platform/lib/lint.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/catalog-check.mjs`, `scripts/platform/__tests__/lint.test.mjs`, `scripts/platform/__tests__/docker-entrypoint.test.mjs`, `.github/workflows/ci.yml`, `.github/workflows/catalog.yml`, `.github/workflows/feedback-triage.yml`, `apps/api/src/openapi/openapi-config.ts` | production image contract + catalog lint + CI · gate: scoped (build/scripts/CI only) |
| 2 | C4 | T19 → T20 → T21 → T22 → T23 | `apps/api/src/shared/kernel/logging/log.redact.ts`, `apps/api/src/shared/kernel/logging/log.redact.spec.ts`, `apps/api/src/shared/kernel/logging/logger.factory.ts`, `apps/api/src/shared/kernel/outbox/outbox.dispatcher.ts`, `apps/api/src/shared/kernel/outbox/outbox.int-spec.ts`, `apps/api/src/db/outbox-replay.int-spec.ts`, `apps/api/src/shared/kernel/scheduling/maintenance-registry.ts`, `apps/api/src/shared/kernel/scheduling/maintenance-registry.spec.ts`, `apps/api/src/shared/kernel/idempotency/idempotency.interceptor.ts`, `apps/api/src/shared/kernel/idempotency/idempotency.interceptor.spec.ts`, `apps/api/src/shared/kernel/listing/listing-query.schema.ts`, `apps/api/src/shared/kernel/listing/listing-query.schema.spec.ts` | kernel redaction consumers, outbox, cheap kernel batch · gate: full-unit |
| 2 | C5 | T24 → T25 → T26 → T27 → T28 → T29 → T30 | `catalog/identity/single-tenant/api/application/use-cases/login/**`, `catalog/identity/single-tenant/api/application/rate-limiter-outage.listener.ts`, `catalog/identity/single-tenant/api/application/rate-limiter-outage.listener.spec.ts`, `catalog/identity/single-tenant/api/application/password/**`, `catalog/identity/single-tenant/api/application/use-cases/set-password/**`, `catalog/identity/single-tenant/api/application/use-cases/change-password/**`, `catalog/identity/single-tenant/api/application/use-cases/reset-password/**`, `catalog/identity/single-tenant/api/infrastructure/hashing/**`, `catalog/identity/single-tenant/api/infrastructure/password/**`, `catalog/identity/single-tenant/api/domain/ports/breach-check.ts`, `catalog/identity/single-tenant/api/domain/entities/auth-event.entity.ts`, `catalog/identity/single-tenant/api/domain/entities/auth-event.entity.spec.ts`, `catalog/identity/single-tenant/api/infrastructure/tables/auth-event.table.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/login.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/forgot-password.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/reset-password.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/verify-email.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/validate-access-link.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/cancel-access-link.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/set-password.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/session/resend-verification.controller.ts`, `catalog/identity/single-tenant/api/domain/ports/breach-check.ts`, `catalog/identity/single-tenant/api/domain/ports/ports.spec.ts`, `catalog/identity/single-tenant/api/identity.config.ts`, `catalog/identity/single-tenant/api/identity.config.spec.ts`, `catalog/identity/single-tenant/api/identity.config.fixture.ts`, `catalog/identity/single-tenant/api/identity.module.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-login.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-anti-enum.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-rate-limit.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-csrf-none.e2e-spec.ts`, `catalog/identity/single-tenant/parity/csrf.parity.spec.ts`, `catalog/identity/single-tenant/parity/route-access.parity.spec.ts` | identity login hardening · gate: full-unit (identity module wiring) |
| 2 | C6 | T31 → T32 → T33 → T34 → T35 → T36 → T37 → T38 | `catalog/identity/single-tenant/api/application/assert-permission.ts`, `catalog/identity/single-tenant/api/application/assert-permission.spec.ts`, `catalog/identity/single-tenant/api/application/access-policy.ts`, `catalog/identity/single-tenant/api/application/access-policy.spec.ts`, `catalog/identity/single-tenant/api/application/require-auth.ts`, `catalog/identity/single-tenant/api/application/require-auth.spec.ts`, `catalog/identity/single-tenant/api/application/use-cases/list-users/**`, `catalog/identity/single-tenant/api/application/use-cases/update-user/**`, `catalog/identity/single-tenant/api/application/use-cases/create-user/**`, `catalog/identity/single-tenant/api/application/use-cases/request-email-change/**`, `catalog/identity/single-tenant/api/api/middleware/auth.middleware.ts`, `catalog/identity/single-tenant/api/api/middleware/auth.middleware.spec.ts`, `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts`, `catalog/identity/single-tenant/api/api/contracts/identity.contract.spec.ts`, `catalog/identity/single-tenant/api/api/controllers/admin/list-users.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/admin/delete-user.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/admin/resend-access-link.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/device/revoke-device.controller.ts`, `catalog/identity/single-tenant/api/domain/errors.ts`, `catalog/identity/single-tenant/api/domain/entities/user.entity.ts`, `catalog/identity/single-tenant/api/domain/entities/user.entity.spec.ts`, `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-session.repository.ts`, `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-session.repository.int-spec.ts`, `catalog/identity/single-tenant/api/domain/ports/session.repository.ts`, `catalog/identity/single-tenant/migrations/custom/03_audit_redact_token_hashes.sql`, `catalog/identity/single-tenant/parity/access-policy.parity.spec.ts`, `catalog/identity/single-tenant/api/__e2e__/authz.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/user-trash.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/devices.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/create-user-flow.e2e-spec.ts`, `catalog/tag/api/application/use-cases/list-tags/**`, `catalog/tag/api/api/controllers/tags/list-tags.controller.ts`, `catalog/tag/api/__e2e__/tags.e2e-spec.ts` | identity authz/input/session + tag trash · gate: full-unit |
| 2 | C7 | T39 → T40 → T41 → T42 → T43 → T44 → T45 → T46 | `catalog/attachment/api/application/use-cases/get-attachment-for-download/**`, `catalog/attachment/api/application/use-cases/upload-attachment/**`, `catalog/attachment/api/application/use-cases/upload-attachments-batch/**`, `catalog/attachment/api/application/use-cases/confirm-uploads/**`, `catalog/attachment/api/application/use-cases/delete-attachment/delete-attachment.use-case.spec.ts`, `catalog/attachment/api/application/jobs/purge-pending-attachments.job.ts`, `catalog/attachment/api/application/jobs/purge-pending-attachments.job.spec.ts`, `catalog/attachment/api/api/facades/attachment.facade.ts`, `catalog/attachment/api/api/controllers/download-attachment.controller.ts`, `catalog/attachment/api/api/controllers/upload-attachments.controller.ts`, `catalog/attachment/api/api/controllers/multipart-files.ts`, `catalog/attachment/api/api/controllers/multipart-files.spec.ts`, `catalog/attachment/api/domain/content-type-sniff.ts`, `catalog/attachment/api/domain/content-type-sniff.spec.ts`, `catalog/attachment/api/domain/errors.ts`, `catalog/attachment/api/domain/ports/attachment.repository.ts`, `catalog/attachment/api/infrastructure/repositories/drizzle-attachment.repository.ts`, `catalog/attachment/api/infrastructure/repositories/drizzle-attachment.repository.int-spec.ts`, `catalog/attachment/api/attachment.config.ts`, `catalog/attachment/api/attachment.config.spec.ts`, `catalog/attachment/api/attachment.module.ts`, `catalog/attachment/api/__e2e__/attachment-download.e2e-spec.ts`, `catalog/attachment/api/__e2e__/attachment-upload.e2e-spec.ts`, `apps/api/src/shared/kernel/http/content-disposition.ts`, `apps/api/src/shared/kernel/http/content-disposition.spec.ts`, `apps/api/src/shared/infra/storage/r2-storage.adapter.ts`, `apps/api/src/shared/infra/storage/r2-storage.adapter.spec.ts`, `apps/api/src/shared/infra/storage/storage.config.ts`, `apps/api/src/shared/infra/storage/storage.config.spec.ts`, `apps/api/src/shared/infra/storage/storage.module.ts`, `apps/api/src/shared/infra/storage/object-storage.port.ts` | attachment vertical + kernel storage/HTTP helpers · gate: full-unit |
| 2 | C8 | T47 → T48 → T49 → T50 | `catalog/notification/api/application/catalog/notification-catalog.ts`, `catalog/notification/api/application/catalog/notification-catalog.spec.ts`, `catalog/notification/api/api/controllers/stream/sse.controller.ts`, `catalog/notification/api/api/controllers/stream/sse.controller.spec.ts`, `catalog/notification/api/notification.config.ts`, `catalog/notification/api/notification.config.spec.ts`, `catalog/notification/api/infrastructure/delivery/delivery.dispatcher.ts`, `catalog/notification/api/infrastructure/delivery/delivery.dispatcher.spec.ts`, `catalog/audit/api/api/contracts/audit.contract.ts`, `catalog/audit/api/api/contracts/audit.contract.spec.ts` | notification + audit input hardening · `serial-ok: FIFO tail` · gate: full-unit |
| 3 (exclusive) | C9 | T51 | `apps/api/package.json`, `package.json`, `pnpm-lock.yaml`, `catalog/identity/single-tenant/api/api/controllers/session/upload-avatar.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/upload-access-link-avatar.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/session/upload-avatar.controller.spec.ts` | dependency bumps + `pnpm.overrides` + audit gate — lockfile, alone · gate: full-unit |
| 4 (exclusive) | C10 | T52 | `openapi.json`, `packages/api-client/**`, `catalog/identity/single-tenant/parity/contract.parity.spec.ts`, `catalog/identity/single-tenant/web/core/session.types.ts`, `catalog/identity/single-tenant/web/core/route-access.ts` | contract regen + parity re-freeze — alone · gate: full-unit |
| 5 | C11 | T53 → T54 → T55 → T56 → T57 → T58 | `catalog/identity/single-tenant/module.json`, `catalog/identity/single-tenant/CHANGELOG.md`, `catalog/identity/single-tenant/README.md`, `catalog/attachment/module.json`, `catalog/attachment/CHANGELOG.md`, `catalog/attachment/README.md`, `catalog/notification/module.json`, `catalog/notification/CHANGELOG.md`, `catalog/notification/README.md`, `catalog/audit/module.json`, `catalog/audit/CHANGELOG.md`, `catalog/audit/README.md`, `catalog/tag/module.json`, `catalog/tag/CHANGELOG.md`, `catalog/tag/README.md`, `docs/advisories/ADV-20260822-01.md`, `docs/advisories/ADV-20260822-02.md`, `docs/advisories/ADV-20260822-03.md`, `docs/advisories/ADV-20260822-04.md`, `docs/advisories/ADV-20260822-05.md`, `docs/dev/template-changelog.md`, `docs/dev/deploy.md.jinja`, `docs/dev/local-environment.md` | release plumbing: versions, advisories, docs · gate: scoped (docs/manifests → typecheck + lint + `pnpm catalog:lint`) |

```
Wave 1:  [C1: T1→T7]  ∥ [C2: T8→T12]  ∥ [C3: T13→T18]
Wave 2:  [C4: T19→T23] ∥ [C5: T24→T30] ∥ [C6: T31→T38] ∥ [C7: T39→T46] ∥ [C8: T47→T50 — FIFO tail]
Wave 3:  [C9: T51]   (exclusive — lockfile)
Wave 4:  [C10: T52]  (exclusive — contract regen)
Wave 5:  [C11: T53→T58]
```

**Kernel tag**: `v2.0.0` (user decision, 2026-08-22 — required env vars break every child's boot). All five entries bump `kernelRange` to `">=2.0.0 <3.0.0"` in T53–T56.

---

## Task Breakdown

> Every task's `Tools` are `MCP: NONE · Skill: NONE` unless the task says otherwise — this feature is in-repo TypeScript, SQL and shell.

### T1: Kernel rate-limit port, 429 error and in-flight gate

**What**: Create the kernel rate-limit port, the `TooManyRequestsError` domain error and the shared `InFlightGate` primitive — the three seams B and D both hang from.
**Where**: `apps/api/src/shared/kernel/rate-limit/rate-limiter.port.ts`
**Touches**: `apps/api/src/shared/kernel/rate-limit/rate-limiter.port.ts`, `apps/api/src/shared/kernel/errors/too-many-requests.error.ts`, `apps/api/src/shared/kernel/errors/too-many-requests.error.spec.ts`, `apps/api/src/shared/kernel/collections/in-flight-gate.ts`, `apps/api/src/shared/kernel/collections/in-flight-gate.spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `apps/api/src/shared/kernel/errors/` (`DomainError.retryAfterSeconds`, `PoolSaturatedError:6-14` is the 503 shape); `apps/api/src/shared/kernel/collections/set-equal.ts` (file layout precedent)
**Requirement**: REM-04, REM-05, REM-14

**Done when**:

- [ ] `RateLimiter` interface with `consume(key, limit, windowSeconds, opts?: { critical?: boolean })` and `reset(key)`; `RATE_LIMITER` symbol; `RateLimitResult`, `RateLimitOptions`, `RateLimitConfig` exported exactly as `design.md` § *Data Models*
- [ ] `TooManyRequestsError` extends the kernel `DomainError`, status 429, carries `retryAfterSeconds`; spec asserts the `problem-details.filter.ts:118-138` contract fields
- [ ] `InFlightGate(max)` exposes `tryAcquire(): (() => void) | null` and `inFlight`; releasing twice does not double-decrement; spec covers acquire-to-capacity, refusal at capacity, release-and-reacquire, double-release
- [ ] Gate check passes: `pnpm --filter api test -- shared/kernel/errors shared/kernel/collections`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(kernel): add rate-limit port, 429 error and in-flight gate`

---

### T2: `InMemoryRateLimiter` sliding window

**What**: Per-instance sliding-window limiter used as the critical-key fallback when Redis is unreachable.
**Where**: `apps/api/src/shared/kernel/rate-limit/in-memory-rate-limiter.ts`
**Touches**: `apps/api/src/shared/kernel/rate-limit/in-memory-rate-limiter.ts`, `apps/api/src/shared/kernel/rate-limit/in-memory-rate-limiter.spec.ts`
**Depends on**: T1
**Exclusive**: no
**Reuses**: Lua window semantics of `catalog/identity/single-tenant/api/infrastructure/rate-limit/lua-scripts.ts` (same limit/window arithmetic, in JS)
**Requirement**: REM-04

**Done when**:

- [ ] `Map<key, number[]>` pruned on every call; `consume` returns `{ allowed, retryAfterSeconds }` with the same arithmetic as the Lua script; `reset(key)` and `clear()` implemented
- [ ] Bounded at 50 000 keys, evicting the oldest-touched key — an outage cannot be turned into a memory attack; spec proves the bound
- [ ] Clock is injectable; spec drives time deterministically (no real timers)
- [ ] Spec covers: allow under limit, deny on the (limit+1)th, window slide re-allows, `reset` clears one key, `clear` clears all, eviction at the bound
- [ ] Gate check passes: `pnpm --filter api test -- shared/kernel/rate-limit`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(kernel): add in-memory sliding-window rate limiter`

---

### T3: Move the Redis limiter into `shared/infra/rate-limit/`

**What**: Move `RedisRateLimiter` + `lua-scripts` from identity into the kernel infra layer, drop the fail-open branch and add `reset`.
**Where**: `apps/api/src/shared/infra/rate-limit/redis-rate-limiter.ts`
**Touches**: `apps/api/src/shared/infra/rate-limit/redis-rate-limiter.ts`, `apps/api/src/shared/infra/rate-limit/lua-scripts.ts`, `apps/api/src/shared/infra/rate-limit/redis-rate-limiter.int-spec.ts`, `catalog/identity/single-tenant/api/infrastructure/rate-limit/redis-rate-limiter.ts`, `catalog/identity/single-tenant/api/infrastructure/rate-limit/lua-scripts.ts`, `catalog/identity/single-tenant/api/infrastructure/rate-limit/redis-rate-limiter.int-spec.ts`
**Depends on**: T1
**Exclusive**: no
**Reuses**: the moved files verbatim — the Lua script is unchanged
**Requirement**: REM-04

**Done when**:

- [ ] The three identity files are deleted and recreated under `apps/api/src/shared/infra/rate-limit/`, implementing the T1 port
- [ ] The fail-open branch (old `redis-rate-limiter.ts:52-59`) is gone: a Redis error **propagates** — the composite decides the policy, not the adapter
- [ ] `reset(key)` issues `DEL ratelimit:<key>`
- [ ] The moved int-spec passes unchanged in substance, plus a new case: Redis error propagates instead of allowing, and one for `reset`
- [ ] Gate check passes: `pnpm --filter api test:int -- shared/infra/rate-limit`

**Tests**: integration
**Gate**: full
**Commit**: `refactor(kernel): move redis rate limiter to shared/infra and let errors propagate`

---

### T4: `ResilientRateLimiter` composite

**What**: Compose Redis + in-memory with the per-call `critical` policy and the degraded/recovered outage signal.
**Where**: `apps/api/src/shared/kernel/rate-limit/resilient-rate-limiter.ts`
**Touches**: `apps/api/src/shared/kernel/rate-limit/resilient-rate-limiter.ts`, `apps/api/src/shared/kernel/rate-limit/resilient-rate-limiter.spec.ts`
**Depends on**: T2, T3
**Exclusive**: no
**Reuses**: `EventEmitter2` as wired in `apps/api/src/shared/kernel/outbox/outbox.dispatcher.ts:241`
**Requirement**: REM-04

**Done when**:

- [ ] Primary error + `critical: true` → the in-memory fallback enforces the same limit/window; primary error + non-critical → `{ allowed: true, retryAfterSeconds: 0 }`
- [ ] First error after a healthy period logs one `warn` and emits `rate-limiter.degraded` with `{ since, error }`; a second error while degraded emits nothing
- [ ] First success after degraded calls `fallback.clear()` and emits `rate-limiter.recovered` — spec proves the edge case "Redis returns → fallback state discarded, no double-count"
- [ ] `reset` mirrors `consume` (same critical/fallback policy)
- [ ] Gate check passes: `pnpm --filter api test -- shared/kernel/rate-limit`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(kernel): add resilient rate limiter with critical-key fallback`

---

### T5: Move `@RateLimit` and `RateLimitGuard` into the kernel

**What**: Move the decorator and guard class to the kernel and add a `@Global()` `RateLimitModule` providing `RATE_LIMITER` as the composite.
**Where**: `apps/api/src/shared/kernel/rate-limit/rate-limit.guard.ts`
**Touches**: `apps/api/src/shared/kernel/rate-limit/rate-limit.decorator.ts`, `apps/api/src/shared/kernel/rate-limit/rate-limit.guard.ts`, `apps/api/src/shared/kernel/rate-limit/rate-limit.guard.spec.ts`, `apps/api/src/shared/kernel/rate-limit/rate-limit.module.ts`, `catalog/identity/single-tenant/api/api/guards/rate-limit.guard.ts`, `catalog/identity/single-tenant/api/api/guards/rate-limit.guard.spec.ts`
**Depends on**: T4
**Exclusive**: no
**Reuses**: `catalog/identity/single-tenant/api/api/guards/rate-limit.guard.ts:36-65` (moved); `apps/api/src/shared/infra/storage/storage.module.ts:9-14` (`@Global()` module precedent)
**Requirement**: REM-06, REM-14

**Done when**:

- [ ] Metadata key `"kernel:rateLimit"` carries `{ limit, windowSeconds, critical? }`; the key format stays `ip:${req.ip}:${routeKey}`
- [ ] Denial throws the T1 `TooManyRequestsError` (not a bare `HttpException`), so `Retry-After` comes from the problem-details filter
- [ ] `RateLimitModule` is `@Global()`, imports `RedisModule`, provides and exports `RATE_LIMITER` = `ResilientRateLimiter(Redis, InMemory)`; **the kernel does not register the guard as `APP_GUARD`**
- [ ] The identity guard + its spec are deleted; the moved spec keeps its in-file `@RateLimit` cases and gains one asserting `critical` reaches `consume`
- [ ] Gate check passes: `pnpm --filter api test -- shared/kernel/rate-limit`

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(kernel): move rate-limit decorator and guard to the kernel`

---

### T6: Re-point every rate-limiter importer

**What**: Mechanical import rewrite — every production file, spec and e2e that imports the identity `RATE_LIMITER` token or the identity guard now imports the kernel ones.
**Where**: `catalog/identity/single-tenant/api/domain/ports/rate-limiter.ts` (delete)
**Touches**: `catalog/identity/single-tenant/api/domain/ports/rate-limiter.ts`, `catalog/identity/single-tenant/api/domain/ports/ports.spec.ts`, `catalog/identity/single-tenant/api/identity.module.ts`, `catalog/identity/single-tenant/api/application/use-cases/login/login.use-case.ts`, `catalog/identity/single-tenant/api/testing/allow-all-rate-limiter.ts`, `catalog/identity/single-tenant/api/__e2e__/notifications-inapp.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/notifications-sse.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/access-catalog.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-login.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/notifications-email.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/verify-email.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/user-trash.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/create-user-flow.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/access-link-activation.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/access-history.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-outbox-email.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-logout.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/idempotency.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-csrf-none.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/authz.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/notifications-feed.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-anti-enum.e2e-spec.ts`, `catalog/attachment/api/__e2e__/attachment-delete.e2e-spec.ts`, `catalog/attachment/api/__e2e__/attachment-download.e2e-spec.ts`, `catalog/audit/api/__e2e__/audit-product-extension.e2e-spec.ts`, `catalog/audit/api/__e2e__/audit.e2e-spec.ts`, `catalog/tag/api/__e2e__/tags.e2e-spec.ts`, `catalog/identity/single-tenant/api/api/controllers/**` (the 27 `@RateLimit` importers — added at wave 1, blocked-by-ownership #1), `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-auth-event.repository.int-spec.ts`
**Depends on**: T5
**Exclusive**: no
**Reuses**: import paths only — no behaviour change
**Requirement**: REM-04, REM-06

**Done when**:

- [ ] `catalog/identity/single-tenant/api/domain/ports/rate-limiter.ts` is deleted; `ports.spec.ts` asserts the kernel token instead
- [ ] `identity.module.ts` no longer provides `RATE_LIMITER` (the `@Global()` `RateLimitModule` does); the `RedisRateLimiter` import is gone
- [ ] `allow-all-rate-limiter.ts` implements the kernel port (including `reset`) and stays in `testing/`
- [ ] All 22 e2e `overrideProvider(RATE_LIMITER)` sites and the 5 cross-entry e2e imports point at `apps/api/src/shared/kernel/rate-limit/rate-limiter.port` — no file still imports `identity/domain/ports/rate-limiter`
- [ ] Gate check passes: `pnpm --filter api typecheck` and `pnpm --filter api test -- modules/identity`

**Tests**: unit (`ports.spec.ts` re-pointed at the kernel token; behaviour proven by the moved specs of T3/T5)
**Gate**: quick
**Commit**: `refactor(identity): point rate-limiter consumers at the kernel port`

---

### T7: Identity error catalog additions

**What**: Add the three new identity domain errors the login and authz clusters will throw, so neither W2 cluster has to own `domain/errors.ts` concurrently.
**Where**: `catalog/identity/single-tenant/api/domain/errors.ts`
**Touches**: `catalog/identity/single-tenant/api/domain/errors.ts`, `catalog/identity/single-tenant/api/domain/errors.spec.ts`
**Depends on**: T1
**Exclusive**: no
**Reuses**: `catalog/identity/single-tenant/api/domain/errors.ts:60-69` (`RateLimitedError`, the 429 + `retryAfterSeconds` shape)
**Requirement**: REM-05, REM-07, REM-18

**Done when**:

- [ ] `PasswordHashingSaturatedError` — 503, `retryAfterSeconds: 2`
- [ ] `BreachCheckUnavailableError` — 503, `retryAfterSeconds: 5`
- [ ] `PermissionGrantNotAllowedError` — 403, problem `type` `permission-grant-not-allowed`
- [ ] `EmailBelongsToDeletedUserError` is **left in place** — it is removed in T37, the only task that owns its producer and its e2e assertion
- [ ] Spec asserts status, `type` and `retryAfterSeconds` for each new error
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity/domain`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(identity): add saturation, breach-check and grant-delta domain errors`

---

### T8: `env.ts` fails closed

**What**: Remove every insecure default from the kernel env schema, add the four new variables and refuse plaintext Redis in production.
**Where**: `apps/api/src/shared/config/env.ts`
**Touches**: `apps/api/src/shared/config/env.ts`, `apps/api/src/shared/config/env.spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `apps/api/src/shared/config/env.ts:1-87` (existing zod schema and `BASE` spec fixture at `env.spec.ts:3-7`)
**Requirement**: REM-21, REM-22, REM-24, REM-30

**Done when**:

- [ ] `NODE_ENV` and `DATABASE_SSL` lose their defaults — an unset value fails with a Zod issue naming the variable
- [ ] `TRUST_PROXY_HOPS` defaults to `0`
- [ ] New: `DATABASE_SSL_CA` (optional PEM, `\n` unescaped), `REDIS_ALLOW_PLAINTEXT` (default `false`), `DOCS_ENABLED` (default `false`), `OUTBOX_DEAD_RETENTION_DAYS` (default `30`)
- [ ] `superRefine`: `NODE_ENV=production` + `REDIS_URL` starting `redis://` + `REDIS_ALLOW_PLAINTEXT` not `true` → issue on `REDIS_URL`
- [ ] `nodeEnvSchema` is exported (T49 reuses it) and accepts `development | test | staging | production`
- [ ] `env.spec.ts` has one case per rule above, including `DOCS_ENABLED=true` in production being accepted and `rediss://` in production needing no opt-in
- [ ] Gate check passes: `pnpm --filter api test -- shared/config`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(kernel)!: require NODE_ENV and DATABASE_SSL, refuse plaintext redis in production`

---

### T9: Database CA trust and Redis command timeout

**What**: Honour `DATABASE_SSL_CA` with `rejectUnauthorized: true`, and stop a half-open Redis socket from hanging the login path.
**Where**: `apps/api/src/shared/infra/database/connection-config.ts`
**Touches**: `apps/api/src/shared/infra/database/connection-config.ts`, `apps/api/src/shared/infra/database/connection-config.spec.ts`, `apps/api/src/shared/infra/redis/redis.provider.ts`, `apps/api/src/shared/infra/redis/redis.provider.spec.ts`
**Depends on**: T8
**Exclusive**: no
**Reuses**: `connection-config.ts:14-15`, `connection-config.spec.ts:36-46` (ssl on/off cases); `redis.provider.ts:20-26`
**Requirement**: REM-23, REM-04

**Done when**:

- [ ] `ssl` is `{ rejectUnauthorized: true, ...(ca && { ca }) }` when `DATABASE_SSL=require`, `false` otherwise; spec covers require-without-CA, require-with-CA, disable
- [ ] `redis.provider.ts` sets `commandTimeout: 2000` — a black-holed Redis surfaces as an error the resilient limiter can act on instead of an open wait
- [ ] `redis.provider.spec.ts` is created (the provider had no spec) and asserts the timeout option and that the plaintext/TLS URL is passed through untouched
- [ ] Gate check passes: `pnpm --filter api test -- shared/infra/database shared/infra/redis`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(kernel): trust DATABASE_SSL_CA and bound redis command time`

---

### T10: `/docs` off in production unless opted in

**What**: Gate the Scalar docs mount behind `DOCS_ENABLED` in production, proven by a pure predicate because `/docs` cannot boot under Jest.
**Where**: `apps/api/src/docs/docs.ts`
**Touches**: `apps/api/src/docs/docs.ts`, `apps/api/src/docs/docs.spec.ts`, `apps/api/src/main.ts`
**Depends on**: T8
**Exclusive**: no
**Reuses**: `apps/api/src/main.ts:54` (`mountDocs` call site); `apps/api/test/openapi-contract.e2e-spec.ts:8-10` records why `/docs` cannot run under Jest (Scalar is ESM)
**Requirement**: REM-25

**Done when**:

- [ ] `shouldMountDocs(env): boolean` is exported and pure — `true` unless `NODE_ENV === "production" && DOCS_ENABLED !== true`
- [ ] `main.ts` calls `mountDocs` only when `shouldMountDocs(env())`; unmounted means Nest answers 404
- [ ] `docs.spec.ts` covers the four combinations of `NODE_ENV` production/non-production × `DOCS_ENABLED` true/unset
- [ ] Gate check passes: `pnpm --filter api test -- src/docs`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(kernel): gate /docs behind DOCS_ENABLED in production`

---

### T11: Harness and template env fixtures follow the new contract

**What**: Give every test setup, the child harness and the env templates explicit values for the variables that just became required, so `catalog:check` / `template:smoke` / the suites still boot.
**Where**: `scripts/platform/lib/child.mjs`
**Touches**: `apps/api/test/setup/unit-env.ts`, `apps/api/test/setup/int-env.ts`, `apps/api/test/setup/e2e-env.ts`, `apps/api/test/security-bootstrap.e2e-spec.ts`, `scripts/platform/lib/child.mjs`, `apps/api/.env.example`, `docker-compose.yml`
**Depends on**: T8
**Exclusive**: no
**Reuses**: `scripts/platform/lib/child.mjs:14-21` (`CHILD_ENV_DEFAULTS`), `:25-29` (`CONTRACT_ENV_DEFAULTS`)
**Requirement**: REM-21, REM-24

**Done when**:

- [ ] The three Jest setups export `NODE_ENV`, `DATABASE_SSL=disable` and `BREACH_CHECK_ENABLED=false` (the last is inert until T30 requires it, and prevents a W2 breakage)
- [ ] `CHILD_ENV_DEFAULTS` and `CONTRACT_ENV_DEFAULTS` gain `NODE_ENV`, `DATABASE_SSL`, `TRUST_PROXY_HOPS`, `BREACH_CHECK_ENABLED`
- [ ] `apps/api/.env.example:4,13,36,38,42` and `docker-compose.yml:59-64` list every new and now-required variable with a safe local value
- [ ] `security-bootstrap.e2e-spec.ts` gains a case proving `TRUST_PROXY_HOPS` unset ⇒ `req.ip` is the socket address and `X-Forwarded-For` is ignored
- [ ] Gate check passes: `pnpm --filter api test:e2e -- test/security-bootstrap` and `pnpm test:scripts`

**Tests**: e2e
**Gate**: full
**Commit**: `chore(kernel): give harness and templates explicit values for the required env`

---

### T12: Shared sensitive-key module

**What**: One kernel home for the sensitive-key vocabulary, consumed by the log redactor, the outbox and the notification delivery redactor.
**Where**: `apps/api/src/shared/kernel/redaction/sensitive-keys.ts`
**Touches**: `apps/api/src/shared/kernel/redaction/sensitive-keys.ts`, `apps/api/src/shared/kernel/redaction/sensitive-keys.spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `apps/api/src/shared/kernel/logging/log.redact.ts:6-73` (predicate shape being generalised)
**Requirement**: REM-20, REM-16

**Done when**:

- [ ] `SENSITIVE_KEY_FRAGMENTS = ["password", "token", "secret", "authorization", "cookie", "link"]`; `isSensitiveKey(key, fragments?)` is a case-insensitive substring match
- [ ] `redactSensitive<T>(value, fragments?): { value: T; changed: boolean }` recurses through plain objects and arrays, replaces matching leaves with `"[REDACTED]"`, and returns **the same reference with `changed: false`** when nothing matched
- [ ] Spec covers: nested payload envelope (`payload.payload.link`), array of objects, no-match identity, `newPassword`/`currentPassword`/`newEmail`/`pendingEmail` matched by substring, and the non-match guard list (`recipientId`, `description`, `linkedId` is documented as an accepted over-match)
- [ ] Gate check passes: `pnpm --filter api test -- shared/kernel/redaction`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(kernel): add shared sensitive-key redaction module`

---

### T13: Keep the test harness out of `dist/`

**What**: Exclude `testing/`, `__e2e__/` and `parity/` from the emitted build while keeping them importable by specs.
**Where**: `apps/api/nest-cli.json`
**Touches**: `apps/api/nest-cli.json`, `apps/api/tsconfig.build.json`
**Depends on**: None
**Exclusive**: no
**Reuses**: `apps/api/nest-cli.json:14-19` (existing `ignore` list of test-suffix globs)
**Requirement**: REM-26

**Done when**:

- [ ] `ignore` gains `**/testing/**`, `**/__e2e__/**`, `**/parity/**`, `**/__parity__/**`; `tsconfig.build.json` `exclude` mirrors them
- [ ] Specs still import from `testing/**` — only emission changes (AD-023 stays intact)
- [ ] The REM-26 probe passes: `pnpm --filter api build && ! find apps/api/dist \( -path '*/testing/*' -o -path '*/__e2e__/*' -o -path '*/parity/*' \) -print | grep .`
- [ ] If the swc builder ignores directory globs, the task switches to per-directory `exclude` in `tsconfig.build.json` and records what worked in the commit body (design § *Spike results*, verify-at-task-time item a)
- [ ] Gate check passes: `pnpm --filter api build` plus the probe above

**Tests**: none — probe (REM-26)
**Gate**: full
**Commit**: `build(api): exclude test harness directories from the emitted bundle`

---

### T14: Identity boot seed as production code

**What**: Move the master bootstrap out of `testing/` into `api/seeds/bootstrap.ts`, the convention the entrypoint globs for (AD-031).
**Where**: `catalog/identity/single-tenant/api/seeds/bootstrap.ts`
**Touches**: `catalog/identity/single-tenant/api/seeds/bootstrap.ts`, `catalog/identity/single-tenant/api/testing/seeds/bootstrap-master.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `catalog/identity/single-tenant/api/testing/seeds/bootstrap-master.ts:1-97` (body moved verbatim — idempotent, reads `MASTER_EMAIL`/`MASTER_PASSWORD`)
**Requirement**: REM-27, REM-29

**Done when**:

- [ ] `api/seeds/bootstrap.ts` exists as production code, imports nothing from `testing/**`, and stays idempotent (re-running with the same master e-mail changes nothing)
- [ ] `testing/seeds/bootstrap-master.ts` is deleted; no production file imports it
- [ ] Running it without `MASTER_EMAIL`/`MASTER_PASSWORD` exits 0 without writing
- [ ] Gate check passes: `pnpm --filter api typecheck` and `pnpm --filter api test -- modules/identity`

**Tests**: none — the seed's behaviour is proven by the entrypoint script test (T16) and the REM-29 lint rule (T17)
**Gate**: quick
**Commit**: `refactor(identity): move the master bootstrap seed to api/seeds`

---

### T15: Dev seed carries no literal password

**What**: The development seed reads `SEED_MASTER_PASSWORD` or generates one and prints it once — no credential in the repo or the image.
**Where**: `catalog/identity/single-tenant/api/testing/seeds/master-user.seed.ts`
**Touches**: `catalog/identity/single-tenant/api/testing/seeds/master-user.seed.ts`
**Depends on**: T14
**Exclusive**: no
**Reuses**: `master-user.seed.ts:11-12` (the literal being removed); `node:crypto` `randomBytes`
**Requirement**: REM-28

**Done when**:

- [ ] No password literal remains in the file; the value comes from `SEED_MASTER_PASSWORD` or `crypto.randomBytes`
- [ ] A generated password is printed exactly once, to stdout, with a line saying it is not stored
- [ ] Gate check passes: `pnpm --filter api typecheck`

**Tests**: none — dev-only harness file; covered by the T17 lint rule and by inspection in the Verifier's probe
**Gate**: quick
**Commit**: `fix(identity): stop shipping a literal password in the dev seed`

---

### T16: Entrypoint runs every module boot seed

**What**: Replace the entrypoint's dead `bootstrap-master` path with a glob over `dist/modules/*/seeds/bootstrap.js`, and delete the `legacy-import` step.
**Where**: `apps/api/docker-entrypoint.sh`
**Touches**: `apps/api/docker-entrypoint.sh`, `apps/api/docker-entrypoint.dev.sh`, `apps/api/Dockerfile`, `apps/api/package.json`, `scripts/platform/__tests__/docker-entrypoint.test.mjs`
**Depends on**: T14
**Exclusive**: no
**Reuses**: `docker-entrypoint.sh:15-18,24-27` (blocks being replaced/removed); `scripts/platform/__tests__/lint.test.mjs` (node:test style)
**Requirement**: REM-27

**Done when**:

- [ ] With both `MASTER_EMAIL` and `MASTER_PASSWORD` set, the script runs `for f in "${DIST_DIR:-dist}"/modules/*/seeds/bootstrap.js; do [ -e "$f" ] && node "$f"; done` and then starts the server
- [ ] With either variable absent, boot proceeds and no seed runs
- [ ] The `legacy-import` block is deleted; `apps/api/package.json:16` `db:bootstrap` no longer points at the removed `src/seeds/bootstrap-master.ts`
- [ ] `scripts/platform/__tests__/docker-entrypoint.test.mjs` spawns the entrypoint with `DIST_DIR` pointing at a stub tree and a stub `node` first on `PATH`, asserting the exact invoked paths in both branches (seeds present / absent) and that a glob with no match does not fail the boot
- [ ] Gate check passes: `pnpm test:scripts`

**Tests**: node:test (platform scripts)
**Gate**: full
**Commit**: `fix(api): run every module boot seed from the entrypoint`

---

### T17: Catalog lint refuses `testing/**` imports from production code

**What**: New lint rule plus the missing wiring — `catalog-check` never actually ran the lint.
**Where**: `scripts/platform/lib/lint.mjs`
**Touches**: `scripts/platform/lib/lint.mjs`, `scripts/platform/catalog-lint.mjs`, `scripts/platform/catalog-check.mjs`, `scripts/platform/__tests__/lint.test.mjs`
**Depends on**: T14
**Exclusive**: no
**Reuses**: `scripts/platform/catalog-lint.mjs:36-71` (`lintEntry()` orchestration), `scripts/platform/lib/lint.mjs:40,52,59,74,84,95` (existing rule signatures)
**Requirement**: REM-29

**Done when**:

- [ ] `lintProductionTestingImports(entryDir)` flags any `api/**/*.ts` that is neither a test file (`.spec` / `.int-spec` / `.e2e-spec` / `.parity.spec` / `.fixture`) nor under `testing/`, `__e2e__/`, `parity/`, and imports a specifier containing `/testing/`
- [ ] The rule is called from `catalog-lint.mjs` `lintEntry()`, and `catalog-check.mjs` runs the lint before its other checks (it previously only named `pnpm catalog:lint` in an error message at `:124`)
- [ ] `lint.test.mjs` covers: a violating production file fails, a spec importing `testing/` passes, a file under `testing/` passes, and a clean entry passes
- [ ] Gate check passes: `pnpm test:scripts` and `pnpm catalog:lint`

**Tests**: node:test (platform scripts)
**Gate**: full
**Commit**: `feat(platform): fail catalog lint on testing imports from production code`

---

### T18: Pin CI actions, declare permissions, attribute CSRF

**What**: Supply-chain hygiene in the workflows plus the one-line OpenAPI description fix.
**Where**: `.github/workflows/ci.yml`
**Touches**: `.github/workflows/ci.yml`, `.github/workflows/catalog.yml`, `.github/workflows/feedback-triage.yml`, `apps/api/src/openapi/openapi-config.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `.github/workflows/feedback-triage.yml:13` (the `permissions:` block precedent)
**Requirement**: REM-47

**Done when**:

- [ ] `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` and `anthropics/claude-code-action` are pinned as `@<40-char sha> # vX.Y.Z` in all three workflows
- [ ] `ci.yml` and `catalog.yml` declare a top-level `permissions:` block (`contents: read` unless a job needs more)
- [ ] `openapi-config.ts:28-29` attributes CSRF protection to the identity entry rather than the kernel
- [ ] The REM-47 probe is empty on both halves: `grep -En "uses: .*@v[0-9]" .github/workflows/*.yml | grep -v '#'` and `grep -L "^permissions:" .github/workflows/*.yml`
- [ ] Gate check passes: `pnpm --filter api typecheck` plus the probe above

**Tests**: none — probe (REM-47)
**Gate**: quick
**Commit**: `ci: pin third-party actions to SHAs and declare workflow permissions`

---

### T19: Log redactor uses the shared substring matcher

**What**: Swap the exact-match key list for the shared fragment matcher plus a logging-only PII list, and extend the pino paths.
**Where**: `apps/api/src/shared/kernel/logging/log.redact.ts`
**Touches**: `apps/api/src/shared/kernel/logging/log.redact.ts`, `apps/api/src/shared/kernel/logging/log.redact.spec.ts`, `apps/api/src/shared/kernel/logging/logger.factory.ts`
**Depends on**: T12
**Exclusive**: no
**Reuses**: `log.redact.ts:6-73` (`redactValue`/`redactConfig`, API kept); `logger.factory.ts:7,20` (pino `redact`)
**Requirement**: REM-20

**Done when**:

- [ ] `redactValue` uses `isSensitiveKey(k, LOG_FRAGMENTS) || LOG_EXACT.has(k)` with `LOG_FRAGMENTS = [...SENSITIVE_KEY_FRAGMENTS, "email", "cpf", "phone", "creditcard", "useragent", "user_agent", "set-cookie"]` and `LOG_EXACT = {ip, ip_address, ipaddress}` — `ip` stays exact so `recipientId` survives
- [ ] `redactConfig.paths` gains `newPassword`, `currentPassword`, `newEmail`, `pendingEmail`, `passwordHash`, `tokenHash`, `cookieTokenHash`
- [ ] Spec proves each of the four keys named in the spec AC is redacted, and lists the allowed-through keys (`recipientId`, `description`) as explicit non-match cases
- [ ] Gate check passes: `pnpm --filter api test -- shared/kernel/logging`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(kernel): redact sensitive log keys by substring`

---

### T20: Outbox redacts on publish and on dead-letter

**What**: No token survives at rest in `outbox` or `outbox_dead` once a row leaves the pending state.
**Where**: `apps/api/src/shared/kernel/outbox/outbox.dispatcher.ts`
**Touches**: `apps/api/src/shared/kernel/outbox/outbox.dispatcher.ts`, `apps/api/src/shared/kernel/outbox/outbox.int-spec.ts`, `apps/api/src/db/outbox-replay.int-spec.ts`
**Depends on**: T12
**Exclusive**: no
**Reuses**: `outbox.dispatcher.ts:213-216` (`markPublished`), `:258-285` (dead-letter insert); `outbox.int-spec.ts:212,260,410,441,477`
**Requirement**: REM-16

**Done when**:

- [ ] `markPublished` writes `set({ publishedAt, ...(changed && { payload }) })` — an untouched payload is not rewritten (spec edge case)
- [ ] The dead-letter insert stores `redactSensitive(row.payload).value`; the whole envelope is scanned, so a domain payload nested under `payload.payload` is covered
- [ ] `outbox.int-spec.ts` gains: publish a `NotificationRequested` carrying a `link`, run the dispatcher, read the row → `"[REDACTED]"`; and a no-redacted-key payload is byte-identical after publish
- [ ] `outbox-replay.int-spec.ts:66-87` is updated to assert the redacted payload and carries a comment that a secret-bearing dead letter is re-issued by the owning flow, never replayed (design § *Risks*)
- [ ] Gate check passes: `pnpm --filter api test:int -- shared/kernel/outbox src/db/outbox-replay`

**Tests**: integration
**Gate**: full
**Commit**: `fix(kernel): redact sensitive keys when an outbox row is published or dead-lettered`

---

### T21: `outbox-dead.purge` maintenance job

**What**: Dead letters stop accumulating forever.
**Where**: `apps/api/src/shared/kernel/outbox/outbox.dispatcher.ts`
**Touches**: `apps/api/src/shared/kernel/scheduling/maintenance-registry.ts`, `apps/api/src/shared/kernel/scheduling/maintenance-registry.spec.ts`, `apps/api/src/shared/kernel/outbox/outbox.dispatcher.ts`, `apps/api/src/shared/kernel/outbox/outbox.int-spec.ts`
**Depends on**: T20
**Exclusive**: no
**Reuses**: `maintenance-registry.ts:85-92`, `maintenance-job.decorator.ts:16`, `outbox.dispatcher.ts:94-103` (`purgePublished`, the body this one sits beside)
**Requirement**: REM-17

**Done when**:

- [ ] `@MaintenanceJob("outbox-dead.purge") purgeDeadLetters()` deletes `_kernel.outbox_dead` rows older than `OUTBOX_DEAD_RETENTION_DAYS` (from T8)
- [ ] Registered in `KERNEL_MAINTENANCE_JOBS` with `{ cron: "45 3 * * *", lockId: 3 }`
- [ ] `maintenance-registry.spec.ts:74-83` is extended to expect the third job; the existing no-duplicate-`lockId` assertion at `:88-97` still passes
- [ ] `outbox.int-spec.ts` gains a case: a dead letter older than the retention is deleted, a newer one survives
- [ ] Gate check passes: `pnpm --filter api test -- shared/kernel/scheduling` and `pnpm --filter api test:int -- shared/kernel/outbox`

**Tests**: unit + integration
**Gate**: full
**Commit**: `feat(kernel): purge outbox dead letters on a retention window`

---

### T22: Idempotency key format and anonymous scope

**What**: Reject malformed idempotency keys and stop anonymous callers sharing one bucket.
**Where**: `apps/api/src/shared/kernel/idempotency/idempotency.interceptor.ts`
**Touches**: `apps/api/src/shared/kernel/idempotency/idempotency.interceptor.ts`, `apps/api/src/shared/kernel/idempotency/idempotency.interceptor.spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `idempotency.interceptor.ts:81,102`; `idempotency.interceptor.spec.ts:66-95`
**Requirement**: REM-32

**Done when**:

- [ ] A key not matching `^[A-Za-z0-9_-]{1,200}$` produces 400 before any store lookup
- [ ] An anonymous request scopes the key with `ip:<req.ip>`; an authenticated one keeps its current scope
- [ ] Spec covers: valid key passes, 201-char key rejected, key with `/` rejected, two anonymous callers from different IPs do not collide, same IP does collide
- [ ] Gate check passes: `pnpm --filter api test -- shared/kernel/idempotency`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(kernel): validate idempotency keys and scope anonymous ones by IP`

---

### T23: Bound the listing `page` parameter

**What**: A deep-page request stops being a cheap way to make the database sort the world.
**Where**: `apps/api/src/shared/kernel/listing/listing-query.schema.ts`
**Touches**: `apps/api/src/shared/kernel/listing/listing-query.schema.ts`, `apps/api/src/shared/kernel/listing/listing-query.schema.spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `listing-query.schema.ts:13`; `listing-query.schema.spec.ts:18,34,40`
**Requirement**: REM-33

**Done when**:

- [ ] `page` is `.max(10_000)`; `page=10001` yields 400 and `page=10000` passes
- [ ] Gate check passes: `pnpm --filter api test -- shared/kernel/listing`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(kernel): cap the listing page parameter at 10000`

---

### T24: Per-account login bucket

**What**: Throttle login by e-mail, before the user lookup, so distributed brute force and enumeration both fail.
**Where**: `catalog/identity/single-tenant/api/application/use-cases/login/login.use-case.ts`
**Touches**: `catalog/identity/single-tenant/api/application/use-cases/login/login.use-case.ts`, `catalog/identity/single-tenant/api/application/use-cases/login/login.use-case.spec.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-login.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-anti-enum.e2e-spec.ts`
**Depends on**: T6, T7
**Exclusive**: no
**Reuses**: `login.use-case.ts:41-42,76-131` (existing per-IP burst and dummy verify); `domain/errors.ts:60-69` (`RateLimitedError`); `auth-event.factory.ts:19-35`
**Requirement**: REM-01, REM-02, REM-03

**Done when**:

- [ ] Order is: ① `consume("login:acct:<normalised email>", LOGIN_ACCOUNT_MAX_FAILURES, LOGIN_ACCOUNT_WINDOW_SECONDS, { critical: true })` **before the user lookup** ② existing per-IP burst `login:<ip>:<email>` now `critical: true` ③ lookup + verify ④ on success `reset(acctKey)`
- [ ] Denial records a `rate_limited_burst` auth event with `metadata.scope = "account"` and throws `RateLimitedError(retryAfter)` — no `hasher.verify` call happens (spec asserts the hasher fake was not called)
- [ ] The account key uses the same normalised e-mail the repository queries with
- [ ] Unit spec: 11th failure denied, unknown e-mail denied identically (same error type, same body, dummy verify still on the pre-denial path), success clears the bucket, both buckets denying returns the **account** 429 (edge case)
- [ ] `auth-login.e2e-spec.ts` drives 11 failing logins from two different IPs and asserts 429 + `Retry-After` on the 11th; `auth-anti-enum.e2e-spec.ts` asserts the unknown-e-mail response is byte-identical to the existing-e-mail one
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity/application/use-cases/login`; e2e in a staged child
- [ ] Test count: existing login specs still pass, none deleted

**Tests**: unit + e2e
**Gate**: full (staged child)
**Commit**: `feat(identity): throttle login per account before the user lookup`

---

### T25: `BoundedPasswordHasher`

**What**: Cap concurrent argon2 work so an unauthenticated flood cannot stall the libuv pool.
**Where**: `catalog/identity/single-tenant/api/infrastructure/hashing/bounded-password-hasher.ts`
**Touches**: `catalog/identity/single-tenant/api/infrastructure/hashing/bounded-password-hasher.ts`, `catalog/identity/single-tenant/api/infrastructure/hashing/bounded-password-hasher.spec.ts`, `catalog/identity/single-tenant/api/identity.module.ts`
**Depends on**: T1, T7
**Exclusive**: no
**Reuses**: `domain/ports/password-hasher.ts:1-7`; `identity.module.ts:117-128` (the `PASSWORD_HASHER` factory); `InFlightGate` from T1
**Requirement**: REM-05

**Done when**:

- [ ] `BoundedPasswordHasher` decorates `PasswordHasher` with `InFlightGate(PASSWORD_HASH_MAX_IN_FLIGHT)`; `hash` and `verify` throw `PasswordHashingSaturatedError` **before** delegating when the gate is full; `needsRehash` passes through ungated
- [ ] The permit is released in a `finally`, including when the inner hasher throws
- [ ] The dummy verify for unknown e-mails goes through the same gate
- [ ] Wired in the `PASSWORD_HASHER` factory so every consumer is bounded
- [ ] Spec: 8 pending promises → the 9th call throws 503 with `retryAfterSeconds: 2` and the inner hasher was never called; a resolved permit lets the next call through
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity/infrastructure/hashing`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(identity): bound concurrent password hashing`

---

### T26: Rate-limiter outage is recorded as an auth event

**What**: The kernel signals degradation; identity turns it into exactly one auditable event per outage.
**Where**: `catalog/identity/single-tenant/api/application/rate-limiter-outage.listener.ts`
**Touches**: `catalog/identity/single-tenant/api/application/rate-limiter-outage.listener.ts`, `catalog/identity/single-tenant/api/application/rate-limiter-outage.listener.spec.ts`, `catalog/identity/single-tenant/api/domain/entities/auth-event.entity.ts`, `catalog/identity/single-tenant/api/domain/entities/auth-event.entity.spec.ts`, `catalog/identity/single-tenant/api/infrastructure/tables/auth-event.table.ts`, `catalog/identity/single-tenant/api/identity.module.ts`
**Depends on**: T4, T6
**Exclusive**: no
**Reuses**: `auth-event.entity.ts:3-30` (union), `auth-event.table.ts:6,24,40` (`pgEnum`, nullable `user_id`); `@OnEvent` usage elsewhere in the entry
**Requirement**: REM-04

**Done when**:

- [ ] `rate_limiter_degraded` is added to the auth-event union and the `pgEnum`
- [ ] It is **not** added to `ACCESS_HISTORY_EVENT_TYPES` (`list-access-history/types.ts:12-26`) — it is a system event with a null `userId`, and keeping it out leaves `identity.contract.ts` untouched by this cluster
- [ ] `@OnEvent("rate-limiter.degraded")` records one event with `userId: null` and `metadata: { since }`; the listener is registered in `identity.module.ts`
- [ ] Spec: one event per outage (two degraded emissions in one outage still record once, because the composite only emits on the transition)
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity/application modules/identity/domain/entities`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(identity): record a rate-limiter outage as an auth event`

---

### T27: Breach-check verdict port and adapters

**What**: Replace the boolean port with a three-state verdict and give HIBP a hard 2 s abort.
**Where**: `catalog/identity/single-tenant/api/domain/ports/breach-check.ts`
**Touches**: `catalog/identity/single-tenant/api/domain/ports/breach-check.ts`, `catalog/identity/single-tenant/api/domain/ports/ports.spec.ts`, `catalog/identity/single-tenant/api/infrastructure/password/hibp-breach-check.ts`, `catalog/identity/single-tenant/api/infrastructure/password/noop-breach-check.ts`, `catalog/identity/single-tenant/api/infrastructure/password/breach-check.spec.ts`, `catalog/identity/single-tenant/api/identity.module.ts`
**Depends on**: T7
**Exclusive**: no
**Reuses**: `hibp-breach-check.ts:22-37` (the current lookup); `identity.module.ts:132-139` (the `BREACH_CHECK` factory); Node 22 `AbortSignal.timeout`
**Requirement**: REM-07

**Done when**:

- [ ] Port is `check(password): Promise<"clear" | "breached" | "skipped">`; the stale doc comment claiming it throws is gone
- [ ] `HibpBreachCheck` calls `fetch(url, { signal: AbortSignal.timeout(2000) })`; on error or non-2xx it returns `"skipped"` under `fail_open` and throws `BreachCheckUnavailableError` under `fail_closed`
- [ ] `NoopBreachCheck` returns `"clear"`
- [ ] Spec: breached hash → `"breached"`; clean hash → `"clear"`; network error under each mode; a lookup exceeding 2 s aborts and is treated as an error (not as "clear")
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity/infrastructure/password modules/identity/domain/ports`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(identity): give the breach check a verdict port and a 2s abort`

---

### T28: Password flows always consult the breach check

**What**: `BREACH_CHECK_ENABLED` decides whether HIBP is queried; `BREACH_CHECK_MODE` only decides what happens when the lookup fails.
**Where**: `catalog/identity/single-tenant/api/application/password/check-breach.ts`
**Touches**: `catalog/identity/single-tenant/api/application/password/check-breach.ts`, `catalog/identity/single-tenant/api/application/password/check-breach.spec.ts`, `catalog/identity/single-tenant/api/application/use-cases/set-password/set-password.use-case.ts`, `catalog/identity/single-tenant/api/application/use-cases/set-password/set-password.use-case.spec.ts`, `catalog/identity/single-tenant/api/application/use-cases/change-password/change-password.use-case.ts`, `catalog/identity/single-tenant/api/application/use-cases/change-password/change-password.use-case.spec.ts`, `catalog/identity/single-tenant/api/application/use-cases/change-password/change-password.use-case.int-spec.ts`, `catalog/identity/single-tenant/api/application/use-cases/reset-password/reset-password.use-case.ts`, `catalog/identity/single-tenant/api/application/use-cases/reset-password/reset-password.use-case.spec.ts`, `catalog/identity/single-tenant/api/application/use-cases/reset-password/reset-password.use-case.int-spec.ts`
**Depends on**: T27
**Exclusive**: no
**Reuses**: `set-password.use-case.ts:100-104`, `change-password.use-case.ts:97-103`, `reset-password.use-case.ts:82-88` (the `if (MODE === "fail_closed")` wrappers being removed)
**Requirement**: REM-07

**Done when**:

- [ ] `check-breach.ts` takes the port verdict, throws the existing breached error on `"breached"`, and returns `"skipped"` so the caller can record it
- [ ] All three use cases drop the mode wrapper and call the helper whenever `BREACH_CHECK_ENABLED` is true, regardless of `BREACH_CHECK_MODE`
- [ ] Each records `breach_check_skipped` with `metadata.mode = "fail_open"` and its own `userId` when the verdict is `"skipped"`
- [ ] Specs (unit + the two int-specs) prove: enabled + `fail_open` + lookup failure → flow continues **and** the event is recorded; enabled + `fail_closed` + failure → 503; disabled → no lookup at all; breached → the existing error
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity/application/use-cases`; int-specs in a staged child
- [ ] Test count: the three use-case specs keep every existing case

**Tests**: unit + integration
**Gate**: full (staged child)
**Commit**: `fix(identity): query the breach check whenever it is enabled`

---

### T29: Guard order and critical rate-limit keys

**What**: CSRF runs before the rate limiter (a bad `Origin` must not spend a bucket), and the unauthenticated auth routes are marked `critical`.
**Where**: `catalog/identity/single-tenant/api/identity.module.ts`
**Touches**: `catalog/identity/single-tenant/api/identity.module.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/login.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/forgot-password.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/reset-password.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/verify-email.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/validate-access-link.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/cancel-access-link.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/set-password.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/session/resend-verification.controller.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-csrf-none.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/auth-rate-limit.e2e-spec.ts`, `catalog/identity/single-tenant/parity/csrf.parity.spec.ts`, `catalog/identity/single-tenant/parity/route-access.parity.spec.ts`
**Depends on**: T6
**Exclusive**: no
**Reuses**: `identity.module.ts:257-262` (the two `APP_GUARD` entries)
**Requirement**: REM-06

**Done when**:

- [ ] `APP_GUARD` order is `CsrfGuard` then the kernel `RateLimitGuard`
- [ ] `critical: true` is set on `login`, `forgot-password`, `reset-password`, `resend-verification`, `verify-email`, `set-password` and the `access-link/*` routes; the remaining 19 decorator sites keep their current metadata
- [ ] An identity spec resolves the guard list from the Nest container and asserts the order (the design's mitigation for "`APP_GUARD` order is implicit")
- [ ] `auth-csrf-none.e2e-spec.ts` proves a bad `Origin` returns 403 **and leaves the bucket untouched** (a following valid request from the same IP is not throttled)
- [ ] `csrf.parity.spec.ts` / `route-access.parity.spec.ts` are checked for pinned guard wiring and updated if they pin it
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity`; e2e + parity in a staged child

**Tests**: unit + e2e
**Gate**: full (staged child)
**Commit**: `fix(identity): run the CSRF guard before the rate limiter`

---

### T30: Identity configuration for the new limits

**What**: Declare the login/hashing knobs and make `BREACH_CHECK_ENABLED` required.
**Where**: `catalog/identity/single-tenant/api/identity.config.ts`
**Touches**: `catalog/identity/single-tenant/api/identity.config.ts`, `catalog/identity/single-tenant/api/identity.config.spec.ts`, `catalog/identity/single-tenant/api/identity.config.fixture.ts`
**Depends on**: T24, T25, T27
**Exclusive**: no
**Reuses**: `identity.config.ts:66,68` (breach-check keys); `identity.config.fixture.ts:1-13`
**Requirement**: REM-21

**Done when**:

- [ ] `LOGIN_ACCOUNT_MAX_FAILURES` (10), `LOGIN_ACCOUNT_WINDOW_SECONDS` (900), `PASSWORD_HASH_MAX_IN_FLIGHT` (8) are declared with coercion and defaults
- [ ] `BREACH_CHECK_ENABLED` loses its default — unset fails with a Zod issue naming it
- [ ] `identity.config.fixture.ts` supplies `BREACH_CHECK_ENABLED` so every spec deriving from it still boots
- [ ] `identity.config.spec.ts` covers defaults, coercion of the three new numbers, and the required-variable failure
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(identity)!: require BREACH_CHECK_ENABLED and declare the login limits`

---

### T31: Imperative permission check helper

**What**: The entry has no way to assert a permission inside a use case — enforcement today is only the `@RequirePermission` decorator. This creates the missing helper.
**Where**: `catalog/identity/single-tenant/api/application/assert-permission.ts`
**Touches**: `catalog/identity/single-tenant/api/application/assert-permission.ts`, `catalog/identity/single-tenant/api/application/assert-permission.spec.ts`
**Depends on**: T7
**Exclusive**: no
**Reuses**: `apps/api/src/shared/kernel/access/decorators.ts:40` and `access.guard.ts:26` (the permission vocabulary); the ALS accessor identity already uses for `IDENTITY_ACCESS`
**Requirement**: REM-31

**Done when**:

- [ ] `assertPermission(key: string): void` reads `IDENTITY_ACCESS` from the ALS and throws the entry's `ForbiddenError` when the actor lacks the key; master is exempt on the same rule the guard uses
- [ ] Throws (never silently passes) when no access context is present — a use case called outside a request must not read as authorised
- [ ] Spec: actor holds the key → passes; lacks it → 403; master → passes; no ALS context → throws
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity/application`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(identity): add an imperative permission assertion helper`

---

### T32: Trash listings require the trash permission

**What**: `?deleted=true` stops being a free upgrade from read to trash-read, in both identity and tag.
**Where**: `catalog/identity/single-tenant/api/application/use-cases/list-users/list-users.use-case.ts`
**Touches**: `catalog/identity/single-tenant/api/application/use-cases/list-users/list-users.use-case.ts`, `catalog/identity/single-tenant/api/application/use-cases/list-users/list-users.use-case.spec.ts`, `catalog/identity/single-tenant/api/api/controllers/admin/list-users.controller.ts`, `catalog/tag/api/application/use-cases/list-tags/list-tags.use-case.ts`, `catalog/tag/api/application/use-cases/list-tags/list-tags.use-case.spec.ts`, `catalog/tag/api/api/controllers/tags/list-tags.controller.ts`, `catalog/tag/api/__e2e__/tags.e2e-spec.ts`, `catalog/identity/single-tenant/api/__e2e__/user-trash.e2e-spec.ts`
**Depends on**: T31
**Exclusive**: no
**Reuses**: T31's `assertPermission`; `catalog/identity/single-tenant/api/domain/permissions/catalog/admin.catalog.ts:28,110` (where both trash keys live — tag has no catalog of its own); `list-users.use-case.ts:16` (the stale `MasterGuard` comment to delete)
**Requirement**: REM-31

**Done when**:

- [ ] `if (query.deleted) assertPermission(actor, "admin.users.trash.read")` in `list-users`, and `"admin.tags.trash.read"` in `list-tags`
- [ ] `tag` reaches the helper along its declared `dependsOn: identity` — verify the manifest before importing; if the dependency is absent, STOP and report rather than adding a cross-entry import
- [ ] The stale `MasterGuard` comment is removed
- [ ] Unit specs: `deleted=true` without the key → 403; with the key → passes; `deleted=false` never asserts
- [ ] `user-trash.e2e-spec.ts` and `tags.e2e-spec.ts` each gain a 403 case for a user holding only the plain read permission
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity modules/tag`; e2e in a staged child

**Tests**: unit + e2e
**Gate**: full (staged child)
**Commit**: `fix(identity,tag): require the trash permission for deleted listings`

---

### T33: Permission grant delta

**What**: An admin can no longer grant or revoke a permission they do not hold themselves.
**Where**: `catalog/identity/single-tenant/api/application/access-policy.ts`
**Touches**: `catalog/identity/single-tenant/api/application/access-policy.ts`, `catalog/identity/single-tenant/api/application/access-policy.spec.ts`, `catalog/identity/single-tenant/parity/access-policy.parity.spec.ts`, `catalog/identity/single-tenant/api/application/use-cases/update-user/update-user.use-case.ts`, `catalog/identity/single-tenant/api/application/use-cases/update-user/update-user.use-case.spec.ts`, `catalog/identity/single-tenant/api/application/use-cases/create-user/create-user.use-case.ts`, `catalog/identity/single-tenant/api/application/use-cases/create-user/create-user.use-case.spec.ts`, `catalog/identity/single-tenant/api/__e2e__/authz.e2e-spec.ts`
**Depends on**: T7
**Exclusive**: no
**Reuses**: `access-policy.ts:58` (`assertCanGrant`, called only from create-user/update-user); `access-policy.spec.ts:97,275,284,293,304,314,322` (the removal cases that currently pass wrongly); `PermissionGrantNotAllowedError` from T7
**Requirement**: REM-18

**Done when**:

- [ ] `assertCanGrant` compares the **symmetric difference** of the target's current and requested permission sets; every key in that difference must be held by the actor; master is exempt
- [ ] Revocation is covered, not only granting — the audit's actual finding
- [ ] 403 carries `type` `permission-grant-not-allowed`
- [ ] Unit spec: grant of an unheld key → 403; revoke of an unheld key → 403; grant of a held key → passes; no change → passes; master does anything; the parity spec is updated to the new rule
- [ ] `authz.e2e-spec.ts:190-304` gains a `PUT /admin/users/:id` case revoking a key the actor does not hold → 403
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity/application`; e2e + parity in a staged child

**Tests**: unit + e2e
**Gate**: full (staged child)
**Commit**: `fix(identity): bound permission edits by the actor's own grants`

---

### T34: Self-edit scope guard

**What**: An actor editing their own user cannot widen their own scope fields.
**Where**: `catalog/identity/single-tenant/api/application/use-cases/update-user/update-user.use-case.ts`
**Touches**: `catalog/identity/single-tenant/api/application/use-cases/update-user/update-user.use-case.ts`, `catalog/identity/single-tenant/api/application/use-cases/update-user/update-user.use-case.spec.ts`, `catalog/identity/single-tenant/api/__e2e__/authz.e2e-spec.ts`
**Depends on**: T33
**Exclusive**: no
**Reuses**: the existing self-edit error and guard in the same use case
**Requirement**: REM-19

**Done when**:

- [ ] Changing `servesClients`, `areaIds`, `serviceIds` or `schedulingAreaIds` on one's own user returns 403 with the existing self-edit error type
- [ ] Master is exempt (edge case in the spec)
- [ ] Unit spec: one case per field, plus an unchanged-value no-op that must still pass
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity/application/use-cases/update-user`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(identity): refuse self-edits that widen the actor's own scope`

---

### T35: Contract input bounds and params DTOs

**What**: Length caps, duplicate rejection and validated path params across the identity contract.
**Where**: `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts`
**Touches**: `catalog/identity/single-tenant/api/api/contracts/identity.contract.ts`, `catalog/identity/single-tenant/api/api/contracts/identity.contract.spec.ts`, `catalog/identity/single-tenant/api/api/controllers/admin/delete-user.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/admin/resend-access-link.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/device/revoke-device.controller.ts`, `catalog/identity/single-tenant/api/__e2e__/devices.e2e-spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `identity.contract.ts:16,22-24,31-32,49,59,64` (the schemas gaining bounds); `list-users.controller.ts:39-41` (the `createZodDto` idiom)
**Requirement**: REM-34, REM-35, REM-36

**Done when**:

- [ ] `email.max(254)`, `token.max(128)`, `name.max(200)` at every declaration site listed in `touches-audit.md` § *Contract / params*
- [ ] `IdParamDto = createZodDto(z.object({ id: z.string().min(1).max(64) }))` is exported and used by `delete-user`, `resend-access-link` and `revoke-device` via `@Param()`
- [ ] Permission, area, service and scheduling-area id arrays reject duplicates (`.refine(noDuplicates)`) with 400
- [ ] `identity.contract.spec.ts` gains a case per bound (at-limit passes, over-limit 400) and per duplicate array
- [ ] `devices.e2e-spec.ts:122,142` proves an over-long `id` is 400 rather than reaching the repository
- [ ] The contract change is **not** regenerated here — T52 owns `openapi.json` and the api-client
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity/api/contracts`; e2e in a staged child

**Tests**: unit + e2e
**Gate**: full (staged child)
**Commit**: `fix(identity): bound contract inputs and validate path params`

---

### T36: Deleted users lose their session; session touch is throttled

**What**: A soft-deleted user with a live cookie is refused, and a session write stops happening on every request.
**Where**: `catalog/identity/single-tenant/api/api/middleware/auth.middleware.ts`
**Touches**: `catalog/identity/single-tenant/api/api/middleware/auth.middleware.ts`, `catalog/identity/single-tenant/api/api/middleware/auth.middleware.spec.ts`, `catalog/identity/single-tenant/api/application/require-auth.ts`, `catalog/identity/single-tenant/api/application/require-auth.spec.ts`, `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-session.repository.ts`, `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-session.repository.int-spec.ts`, `catalog/identity/single-tenant/api/domain/ports/session.repository.ts`, `catalog/identity/single-tenant/api/__e2e__/user-trash.e2e-spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `auth.middleware.ts:102-152` (actor publication), `:108` (the unconditional touch); `require-auth.ts:20-31`; `identity.config.ts:34` (`SESSION_TOUCH_INTERVAL_SECONDS`, already declared)
**Requirement**: REM-43, REM-45

**Done when**:

- [ ] Access is loaded **before** the actor is published; a soft-deleted user publishes nothing, so `requireAuth` throws 403 on every authenticated route
- [ ] `touch` is issued only when `now − lastSeenAt ≥ SESSION_TOUCH_INTERVAL_SECONDS`; below the interval no `UPDATE` is issued
- [ ] `require-auth.spec.ts` is created (the file had no spec): present actor passes, absent actor throws 403
- [ ] `auth.middleware.spec.ts:265` is extended for the deleted-user path; the repository int-spec gains a `touch` case proving the write is skipped under the interval and issued above it
- [ ] `user-trash.e2e-spec.ts` proves a soft-deleted user's live session gets 403
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity`; int + e2e in a staged child

**Tests**: unit + integration + e2e
**Gate**: full (staged child)
**Commit**: `fix(identity): refuse deleted users and throttle session touches`

---

### T37: Email-change cooldown and a single 409 type

**What**: The rejected-address branches stop leaking whether an address belongs to a deleted user, and stop bypassing the cooldown.
**Where**: `catalog/identity/single-tenant/api/application/use-cases/request-email-change/request-email-change.use-case.ts`
**Touches**: `catalog/identity/single-tenant/api/application/use-cases/request-email-change/request-email-change.use-case.ts`, `catalog/identity/single-tenant/api/application/use-cases/request-email-change/request-email-change.use-case.spec.ts`, `catalog/identity/single-tenant/api/application/use-cases/request-email-change/email-change-flow.int-spec.ts`, `catalog/identity/single-tenant/api/domain/errors.ts`, `catalog/identity/single-tenant/api/domain/entities/user.entity.ts`, `catalog/identity/single-tenant/api/domain/entities/user.entity.spec.ts`, `catalog/identity/single-tenant/api/__e2e__/user-trash.e2e-spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `request-email-change.use-case.ts:99-107,144`; `user.entity.ts:252` (`recordEmailChangeAttempt`); `domain/errors.ts:85,93-98`
**Requirement**: REM-44

**Done when**:

- [ ] Both the in-use and the deleted-owner branches persist `lastEmailChangeRequestedAt` before throwing
- [ ] Both throw `EmailAlreadyInUseError` — the 409 `type` is identical for the two cases
- [ ] `EmailBelongsToDeletedUserError` is deleted from `domain/errors.ts` (no in-repo consumer remains; the removal is listed in ADV-20260822-01 by T53)
- [ ] `user-trash.e2e-spec.ts:104` no longer asserts `/email-belongs-to-deleted-user$/` and asserts `email-already-in-use` instead
- [ ] Unit + int specs prove the cooldown is recorded on both rejected branches, so a caller cannot probe addresses for free
- [ ] Gate check passes: `pnpm --filter api test -- modules/identity`; int + e2e in a staged child

**Tests**: unit + integration + e2e
**Gate**: full (staged child)
**Commit**: `fix(identity): record the cooldown and unify the email-change conflict type`

---

### T38: Redact token hashes from the audit trail

**What**: The audit triggers stop copying session, device and verification token hashes into the trail.
**Where**: `catalog/identity/single-tenant/migrations/custom/03_audit_redact_token_hashes.sql`
**Touches**: `catalog/identity/single-tenant/migrations/custom/03_audit_redact_token_hashes.sql`
**Depends on**: None
**Exclusive**: no
**Reuses**: `catalog/audit/migrations/custom/01_audit_trail_capture.sql:162-176` (`audit.attach` is idempotent — `DROP TRIGGER IF EXISTS`); `catalog/identity/single-tenant/migrations/custom/02_audit_attach.sql:14` (the guard idiom)
**Requirement**: REM-40

**Done when**:

- [ ] The file re-attaches with redact lists: `sessions` → `{token_hash}`, `devices` → `{cookie_token_hash}`, `verification_tokens` → `{token_hash}`
- [ ] It is guarded exactly like `02_audit_attach.sql:14`, so a child without the audit entry is a no-op rather than an error
- [ ] Re-running the migration is idempotent
- [ ] `module.json.customMigrations` registration is **not** done here — T53 owns the manifest
- [ ] Gate check passes: `pnpm test:scripts` (the filename check at `scripts/platform/__tests__/catalog-custom-migrations.test.mjs:57-68`)

**Tests**: none — SQL migration; proven by the audit repository int-spec run in the staged child at the Final gate
**Gate**: quick
**Commit**: `fix(identity): redact token hashes from the audit trail`

---

### T39: Download opens its stream lazily

**What**: `DownloadResult` stops carrying an open stream, so nothing is opened before the controller has decided whether it will send a body.
**Where**: `catalog/attachment/api/application/use-cases/get-attachment-for-download/get-attachment-for-download.use-case.ts`
**Touches**: `catalog/attachment/api/application/use-cases/get-attachment-for-download/get-attachment-for-download.use-case.ts`, `catalog/attachment/api/application/use-cases/get-attachment-for-download/get-attachment-for-download.use-case.spec.ts`, `catalog/attachment/api/api/facades/attachment.facade.ts`, `catalog/attachment/api/application/use-cases/delete-attachment/delete-attachment.use-case.spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `get-attachment-for-download.use-case.ts:21-28,48-79` (the access-log write at `:69` stays where it is); `attachment.facade.ts:6,7,22,38` (re-exports the type — a public entry surface)
**Requirement**: REM-11

**Done when**:

- [ ] `DownloadResult` drops `stream` and gains `openStream(): Promise<NodeJS.ReadableStream>`; nothing opens inside `execute`
- [ ] The facade re-export follows; the shape change is recorded for ADV-20260822-02 (T54)
- [ ] The object-literal repository fakes in the sibling specs listed in `touches-audit.md` § *Repository* are updated so they still satisfy the port
- [ ] Spec: `execute` resolves without calling the storage adapter; calling `openStream()` calls it exactly once
- [ ] Gate check passes: `pnpm --filter api test -- modules/attachment/application`

**Tests**: unit
**Gate**: quick
**Commit**: `refactor(attachment)!: open the download stream lazily`

---

### T40: Download responds safely and never leaks a socket

**What**: The four download defects in one controller pass — inline allowlist, `nosniff`, 304 before opening, and `pipeline` ownership of the body.
**Where**: `catalog/attachment/api/api/controllers/download-attachment.controller.ts`
**Touches**: `catalog/attachment/api/api/controllers/download-attachment.controller.ts`, `catalog/attachment/api/__e2e__/attachment-download.e2e-spec.ts`
**Depends on**: T39
**Exclusive**: no
**Reuses**: `download-attachment.controller.ts:46-76`; `attachment-download.e2e-spec.ts:40` (`makeInMemoryStorage()`), header assertions at `:234,267,295`; `node:stream/promises` `pipeline`
**Requirement**: REM-09, REM-10, REM-11, REM-12

**Done when**:

- [ ] The ETag/304 branch returns **before** `openStream()` is called
- [ ] `inline` is decided by `INLINE_CONTENT_TYPES = {"image/jpeg","image/png","image/webp"}` against the **stored** `content_type` — the profile is no longer consulted, so a `legacy` row with `image/png` is still inline and a `legacy` row with `text/html` is not
- [ ] Non-inline responses carry `application/octet-stream` + `Content-Disposition: attachment`; `X-Content-Type-Options: nosniff` is set on every response
- [ ] The body is sent with `await pipeline(await result.openStream(), res)`: a client abort destroys the source and frees the socket; a source error after headers destroys the response and logs at `error` without killing the process; a source error before headers reaches the problem-details filter
- [ ] `attachment-download.e2e-spec.ts` covers: a seeded `ready` row with `content_type: text/html` → octet-stream attachment; a `legacy` png → inline; a mid-body abort → the fake storage records the stream as destroyed; 50 `If-None-Match` requests against a storage fake with `maxSockets: 2` → the 51st still succeeds
- [ ] Gate check passes: `pnpm --filter api test -- modules/attachment`; e2e in a staged child

**Tests**: e2e
**Gate**: full (staged child)
**Commit**: `fix(attachment): serve downloads safely and release storage sockets`

---

### T41: Storage client carries explicit timeouts

**What**: The S3/R2 client stops relying on defaults that never time out.
**Where**: `apps/api/src/shared/infra/storage/r2-storage.adapter.ts`
**Touches**: `apps/api/src/shared/infra/storage/r2-storage.adapter.ts`, `apps/api/src/shared/infra/storage/r2-storage.adapter.spec.ts`, `apps/api/src/shared/infra/storage/storage.config.ts`, `apps/api/src/shared/infra/storage/storage.config.spec.ts`, `apps/api/src/shared/infra/storage/storage.module.ts`, `apps/api/src/shared/infra/storage/object-storage.port.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `r2-storage.adapter.ts:20-28`; `storage.config.ts:4-10`; `storage.module.ts:9-14`; verified in design § *Spike results*: `NodeHttpHandlerOptions` is accepted as a plain object and `send(cmd, { abortSignal })` exists
**Requirement**: REM-13

**Done when**:

- [ ] `requestHandler: { requestTimeout: STORAGE_REQUEST_TIMEOUT_MS, connectionTimeout: 5000, httpsAgent: new https.Agent({ keepAlive: true, maxSockets: STORAGE_MAX_SOCKETS }) }` — no new dependency
- [ ] `head`, `put`, `putStream` and `delete` pass `{ abortSignal: AbortSignal.timeout(...) }`; **`getStream` does not** (a long download must not be cut at 30 s; the socket-level `requestTimeout` covers a stalled peer) — the reason is a comment in the file
- [ ] SDK `TimeoutError`/`AbortError` map to the kernel `StorageUnavailableError` (503, `retryAfterSeconds: 5`)
- [ ] `storage.config.ts` gains `STORAGE_REQUEST_TIMEOUT_MS` (30 000) and `STORAGE_MAX_SOCKETS` (50) with spec cases for defaults and coercion
- [ ] Adapter spec: the handler options reach the client constructor; a timeout on a non-stream op surfaces as 503; `getStream` is called without an abort signal
- [ ] Gate check passes: `pnpm --filter api test -- shared/infra/storage`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(kernel): give the storage client explicit request and socket timeouts`

---

### T42: RFC 5987 `Content-Disposition`

**What**: Filenames stop being able to break out of the header.
**Where**: `apps/api/src/shared/kernel/http/content-disposition.ts`
**Touches**: `apps/api/src/shared/kernel/http/content-disposition.ts`, `apps/api/src/shared/kernel/http/content-disposition.spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `content-disposition.ts:6-10`
**Requirement**: REM-42

**Done when**:

- [ ] Output is `attachment; filename="<ascii fallback>"; filename*=UTF-8''<rfc5987>` — the ASCII `filename=` precedes `filename*`
- [ ] The rfc5987 encoding is `encodeURIComponent` plus percent-encoding of `'`, `(`, `)` and `*`
- [ ] The ASCII fallback strips non-ASCII characters and `"`
- [ ] Spec: plain ASCII name, name with accents, name with `"`, name with `'()*`, empty name
- [ ] Gate check passes: `pnpm --filter api test -- shared/kernel/http`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(kernel): percent-encode filenames in Content-Disposition`

---

### T43: busboy runs with profile-derived limits

**What**: Multipart parsing gets bounds and rejects foreign parts instead of trusting the client.
**Where**: `catalog/attachment/api/api/controllers/multipart-files.ts`
**Touches**: `catalog/attachment/api/api/controllers/multipart-files.ts`, `catalog/attachment/api/api/controllers/multipart-files.spec.ts`, `catalog/attachment/api/domain/errors.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `multipart-files.ts:9-17,59-73`; `multipart-files.spec.ts:5,70,92,147,164,189,218`; busboy `^1.6.0` limit events
**Requirement**: REM-15

**Done when**:

- [ ] `readMultipartFiles(req, res, fieldName, limits)` passes `{ fileSize: profile.maxBytes, files: profile.maxFiles, parts: profile.maxFiles, fields: 0 }` to busboy
- [ ] `file.on("limit")`, `filesLimit` and `partsLimit` end the request with `PayloadTooLargeError` (413); `fieldsLimit` ends it with 400
- [ ] A part whose field name is not `file` is destroyed and the request rejected with 400 `UnexpectedMultipartFieldError`
- [ ] The generator rejects on its next `yield` after a limit event, so the use case's existing `catch` discards every stored object
- [ ] Spec: over-size file, too many files, too many parts, a field part, a foreign file field, and a clean batch that still succeeds
- [ ] Gate check passes: `pnpm --filter api test -- modules/attachment/api`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(attachment): bound multipart parsing and reject foreign parts`

---

### T44: Batch uploads sniff every part

**What**: The stored-XSS path closes — an `accept: "image"` profile now proves each part is really an image.
**Where**: `catalog/attachment/api/domain/content-type-sniff.ts`
**Touches**: `catalog/attachment/api/domain/content-type-sniff.ts`, `catalog/attachment/api/domain/content-type-sniff.spec.ts`, `catalog/attachment/api/application/use-cases/upload-attachments-batch/upload-attachments-batch.use-case.ts`, `catalog/attachment/api/application/use-cases/upload-attachments-batch/upload-attachments-batch.use-case.spec.ts`, `catalog/attachment/api/application/use-cases/upload-attachment/upload-attachment.use-case.ts`, `catalog/attachment/api/application/use-cases/upload-attachment/upload-attachment.use-case.spec.ts`, `catalog/attachment/api/application/use-cases/upload-attachment/upload-attachment.use-case.int-spec.ts`, `catalog/attachment/api/__e2e__/attachment-upload.e2e-spec.ts`
**Depends on**: T43
**Exclusive**: no
**Reuses**: `content-type-sniff.ts:7` (`sniffImageContentType`); `upload-attachments-batch.use-case.ts:52-109,117-121,137` (the discard loop and the single `insertMany` already give the "nothing persisted" edge for free); the 415 error the single-file path already throws
**Requirement**: REM-08

**Done when**:

- [ ] `sniffImageStream(stream)` peeks 16 bytes with `readable` + `read(n)` and `unshift`s them back — never `for await`, which would destroy a busboy stream on `break`
- [ ] For `profile.accept === "image"` every part is sniffed; a `null` sniff or a sniff differing from the declared type rejects the **whole batch** with 415
- [ ] The **sniffed** type is persisted, not the declared one
- [ ] Spec/int-spec: a 2-chunk PNG uploads with the stored checksum intact (proving `unshift` did not truncate); `text/html` bytes declared as `image/png` → 415; a batch mixing one valid image and one spoofed part persists nothing and discards every stored object
- [ ] `attachment-upload.e2e-spec.ts` is created (no upload e2e exists today) and drives the 415 case end to end
- [ ] Gate check passes: `pnpm --filter api test -- modules/attachment`; int + e2e in a staged child

**Tests**: unit + integration + e2e
**Gate**: full (staged child)
**Commit**: `fix(attachment): sniff every part of an image batch upload`

---

### T45: Upload quota, concurrency gate and rate limit

**What**: Three cheap bounds in front of the body so an authenticated user cannot exhaust storage or RSS.
**Where**: `catalog/attachment/api/api/controllers/upload-attachments.controller.ts`
**Touches**: `catalog/attachment/api/api/controllers/upload-attachments.controller.ts`, `catalog/attachment/api/api/controllers/download-attachment.controller.ts`, `catalog/attachment/api/domain/ports/attachment.repository.ts`, `catalog/attachment/api/infrastructure/repositories/drizzle-attachment.repository.ts`, `catalog/attachment/api/infrastructure/repositories/drizzle-attachment.repository.int-spec.ts`, `catalog/attachment/api/attachment.config.ts`, `catalog/attachment/api/attachment.config.spec.ts`, `catalog/attachment/api/attachment.module.ts`, `catalog/attachment/api/domain/errors.ts`
**Depends on**: T40, T43
**Exclusive**: no
**Reuses**: kernel `@RateLimit` (T5) and `InFlightGate` (T1); `attachment.repository.ts:3-15`; `attachment.module.ts:49-64` (the `@Module` has **no `imports:` key** — none is needed, `RateLimitModule` is `@Global()`); `upload-attachments.controller.ts:32,57-61`
**Requirement**: REM-14

**Done when**:

- [ ] `@RateLimit({ limit: 20, windowSeconds: 60 })` on `POST /attachments/uploads` and `@RateLimit({ limit: 300, windowSeconds: 60 })` on `GET /attachments/:id`
- [ ] New port + repository method `sumPendingBytesByOwner(ownerId)` (`SUM(size_bytes) … status = 'pending'`) with an int-spec case
- [ ] Handler order is guard → `UploadGate` → quota → busboy, all **before the body is read**: gate full → 503 `UploadsSaturatedError` (`retryAfterSeconds: 2`, released in `finally`); `pending + (Content-Length ?? 0) > ATTACHMENT_PENDING_QUOTA_BYTES` → 413 `PendingQuotaExceededError`
- [ ] `attachment.config.ts` gains `ATTACHMENT_PENDING_QUOTA_BYTES` (2 GiB) and `ATTACHMENT_MAX_CONCURRENT_UPLOADS` (16); `attachment.config.spec.ts:4,12,19` extended
- [ ] `UploadGate` is provided in `attachment.module.ts` after the existing providers
- [ ] Gate check passes: `pnpm --filter api test -- modules/attachment`; int-spec in a staged child

**Tests**: unit + integration
**Gate**: full (staged child)
**Commit**: `feat(attachment): bound uploads by rate, owner quota and concurrency`

---

### T46: Purge and confirm are bounded

**What**: Two one-line correctness bounds on the attachment lifecycle jobs.
**Where**: `catalog/attachment/api/application/jobs/purge-pending-attachments.job.ts`
**Touches**: `catalog/attachment/api/application/jobs/purge-pending-attachments.job.ts`, `catalog/attachment/api/application/jobs/purge-pending-attachments.job.spec.ts`, `catalog/attachment/api/application/use-cases/confirm-uploads/confirm-uploads.use-case.ts`, `catalog/attachment/api/application/use-cases/confirm-uploads/confirm-uploads.use-case.spec.ts`
**Depends on**: T45
**Exclusive**: no
**Reuses**: `purge-pending-attachments.job.ts:63`; `confirm-uploads.use-case.ts:42-44`
**Requirement**: REM-41

**Done when**:

- [ ] The purge deletes through `deletePendingByIds(ids)`, whose SQL carries `AND status = 'pending'` — a row that turned `ready` between selection and deletion survives
- [ ] `confirmUploads` rejects when `ids.length` exceeds the maximum `maxFiles` across route profiles, **before** `findByIds`
- [ ] Specs cover both bounds plus the unchanged happy paths
- [ ] Gate check passes: `pnpm --filter api test -- modules/attachment/application`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(attachment): bound the pending purge and the confirm batch`

---

### T47: Notification catalog links must be http(s)

**What**: A template link can no longer carry a `javascript:` or `data:` URL into an e-mail.
**Where**: `catalog/notification/api/application/catalog/notification-catalog.ts`
**Touches**: `catalog/notification/api/application/catalog/notification-catalog.ts`, `catalog/notification/api/application/catalog/notification-catalog.spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `notification-catalog.ts:51,56,61,77`; `notification-catalog.spec.ts:12-38`
**Requirement**: REM-38

**Done when**:

- [ ] Every `link` field is `z.url({ protocol: /^https?$/ })`
- [ ] Spec: an `https` link passes, an `http` link passes, `javascript:` and `data:` fail validation
- [ ] The five identity link producers named in `touches-audit.md` § *Notification* are checked against the new refine; any fixture producing a non-http(s) link is fixed in this task
- [ ] Gate check passes: `pnpm --filter api test -- modules/notification modules/identity`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(notification): require http(s) links in the catalog`

---

### T48: SSE stream checks its `Origin`

**What**: A cross-origin page can no longer open the notification stream.
**Where**: `catalog/notification/api/api/controllers/stream/sse.controller.ts`
**Touches**: `catalog/notification/api/api/controllers/stream/sse.controller.ts`, `catalog/notification/api/api/controllers/stream/sse.controller.spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `sse.controller.ts:26-34`; the kernel `env().WEB_ORIGIN`
**Requirement**: REM-46

**Done when**:

- [ ] A request whose `Origin` is present and differs from `WEB_ORIGIN` gets 403; an absent `Origin` keeps today's behaviour (same-origin and non-browser clients)
- [ ] Spec: matching origin passes, mismatched origin 403, absent origin passes
- [ ] Gate check passes: `pnpm --filter api test -- modules/notification/api`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(notification): reject foreign origins on the SSE stream`

---

### T49: Notification config and delivery redaction align with the kernel

**What**: One `NODE_ENV` enum across kernel and entry, and one redaction implementation.
**Where**: `catalog/notification/api/notification.config.ts`
**Touches**: `catalog/notification/api/notification.config.ts`, `catalog/notification/api/notification.config.spec.ts`, `catalog/notification/api/infrastructure/delivery/delivery.dispatcher.ts`, `catalog/notification/api/infrastructure/delivery/delivery.dispatcher.spec.ts`
**Depends on**: T8, T12
**Exclusive**: no
**Reuses**: `notification.config.ts:6`; `delivery.dispatcher.ts:47-51` (`redactPayload`, which today redacts only `link`)
**Requirement**: REM-30, REM-20

**Done when**:

- [ ] `notification.config.ts` imports the kernel `nodeEnvSchema`, so `NODE_ENV=staging` parses instead of failing
- [ ] `redactPayload` delegates to `redactSensitive`, so tokens and secrets are covered, not only `link`
- [ ] Specs: `staging` accepted; a delivery payload with `token` and `link` comes back fully redacted; a payload with neither is unchanged
- [ ] Gate check passes: `pnpm --filter api test -- modules/notification`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(notification): share the kernel NODE_ENV enum and redaction list`

---

### T50: Audit query bounds

**What**: Audit filters stop accepting values the database has to reject.
**Where**: `catalog/audit/api/api/contracts/audit.contract.ts`
**Touches**: `catalog/audit/api/api/contracts/audit.contract.ts`, `catalog/audit/api/api/contracts/audit.contract.spec.ts`
**Depends on**: None
**Exclusive**: no
**Reuses**: `audit.contract.ts:19-20`; `createZodDto` idiom
**Requirement**: REM-37

**Done when**:

- [ ] `from` and `to` are `z.iso.datetime()`; `txId` is capped at `Number.MAX_SAFE_INTEGER`
- [ ] `audit.contract.spec.ts` is created (the contract had no spec): valid ISO passes, `2026-13-01` 400, a bare date 400, `txId` above the cap 400, at the cap passes
- [ ] The contract change is **not** regenerated here — T52 owns `openapi.json`
- [ ] Gate check passes: `pnpm --filter api test -- modules/audit`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(audit): validate the from/to and txId query bounds`

---

### T51: Dependency bumps and a clean production audit

**What**: Raise `multer`, add the transitive overrides and bound the avatar interceptors, until `pnpm audit --prod --audit-level=high` exits 0.
**Where**: `apps/api/package.json`
**Touches**: `apps/api/package.json`, `package.json`, `pnpm-lock.yaml`, `catalog/identity/single-tenant/api/api/controllers/session/upload-avatar.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/auth/upload-access-link-avatar.controller.ts`, `catalog/identity/single-tenant/api/api/controllers/session/upload-avatar.controller.spec.ts`
**Depends on**: T45
**Exclusive**: **yes** — lockfile and root manifest
**Reuses**: `apps/api/package.json:64` (`multer ^2.1.1`), `:86` (`@types/multer ^2.1.0`); root `package.json` has no `pnpm.overrides` block yet
**Requirement**: REM-39

**Done when**:

- [ ] `multer` resolves to ≥ 2.2.0 (and `@types/multer` follows)
- [ ] `limits: { fields: 0 }` is set on both `FileInterceptor` configurations (`upload-avatar.controller.ts:47`, `upload-access-link-avatar.controller.ts:55`)
- [ ] Remaining transitive high advisories are pinned through a root `pnpm.overrides` block, each entry carrying a one-line comment naming the advisory it closes
- [ ] `packages/api-client`'s browser-side `axios` advisories are **not** touched (spec Out of Scope)
- [ ] Gate check passes: `cd apps/api && pnpm audit --prod --audit-level=high` exits 0, and `pnpm --filter api test -- modules/identity`
- [ ] Test count: the avatar controller and use-case specs still pass

**Tests**: unit
**Gate**: full
**Commit**: `chore(deps): raise multer and pin the high-severity transitives`

---

### T52: Contract regeneration and parity re-freeze

**What**: Regenerate the OpenAPI document and the typed client for the contract changes of T35 and T50, then re-freeze the parity specs.
**Where**: `openapi.json`
**Touches**: `openapi.json`, `packages/api-client/**`, `catalog/identity/single-tenant/parity/contract.parity.spec.ts`, `catalog/identity/single-tenant/web/core/session.types.ts`, `catalog/identity/single-tenant/web/core/route-access.ts`
**Depends on**: T35, T50
**Exclusive**: **yes** — regenerates the contract and the generated client
**Reuses**: root `pnpm contract` (`pnpm --filter api contract && pnpm --filter @platform/api-client generate`); `contract.parity.spec.ts:26` (34-operation freeze), `:33` (openapi field parity)
**Requirement**: REM-34, REM-35, REM-36, REM-37

**Done when**:

- [ ] `pnpm contract` runs clean and the regenerated `openapi.json` carries the new maxima, the params DTOs and the audit datetime formats
- [ ] `contract.parity.spec.ts` is updated: the operation count is unchanged (no route added or removed) and the field parity assertions match the regenerated document
- [ ] The two web consumers still typecheck against the regenerated client
- [ ] No behavioural edit rides along — this task regenerates and re-freezes only
- [ ] Gate check passes: `pnpm check` and `pnpm --filter api test`

**Tests**: unit (parity)
**Gate**: full
**Commit**: `chore(contract): regenerate openapi and client for the input bounds`

---

### T53: Identity 2.0.0 — manifest, changelog, advisory

**What**: Ship the identity entry as a breaking release with its advisory.
**Where**: `catalog/identity/single-tenant/module.json`
**Touches**: `catalog/identity/single-tenant/module.json`, `catalog/identity/single-tenant/CHANGELOG.md`, `catalog/identity/single-tenant/README.md`, `docs/advisories/ADV-20260822-01.md`
**Depends on**: T30, T38, T51, T52
**Exclusive**: no
**Reuses**: `docs/advisories/README.md` (body language and structure); required frontmatter keys `id, kind, module, affects, severity, detect, fix, parity` (`scripts/platform/lib/frontmatter.mjs:5`)
**Requirement**: Goal 3

**Done when**:

- [ ] `version` → `2.0.0`; `kernelRange` → `">=2.0.0 <3.0.0"`; `env` gains `LOGIN_ACCOUNT_MAX_FAILURES`, `LOGIN_ACCOUNT_WINDOW_SECONDS`, `PASSWORD_HASH_MAX_IN_FLIGHT`, `BREACH_CHECK_ENABLED` (required), `SEED_MASTER_PASSWORD`; `customMigrations` gains `03_audit_redact_token_hashes.sql`
- [ ] `CHANGELOG.md` gains a `## [2.0.0]` section listing every breaking item: required `BREACH_CHECK_ENABLED`, the `RATE_LIMITER` path move, the `BreachCheck` verdict port, the removed `EmailBelongsToDeletedUserError`, the new `rate_limiter_degraded` enum value, the boot seed move
- [ ] `README.md` port/permission/env prose is corrected at the lines named in `touches-audit.md`
- [ ] `ADV-20260822-01.md` is `kind: breaking`, `severity: high`, with a runnable `detect`, a `fix` that includes `drizzle-kit generate` for the new enum value (AD-015), and a `parity` pointer; the body is pt-BR per `docs/advisories/README.md`
- [ ] This is the **first** commit of the cluster touching identity, so it stages the advisory with the code
- [ ] Gate check passes: `pnpm catalog:lint`

**Tests**: none — manifest/docs (matrix says gate only)
**Gate**: quick
**Commit**: `feat(identity)!: release 2.0.0 with the security audit remediation`

---

### T54: Attachment 1.1.0 — manifest, changelog, advisory

**What**: Ship the attachment entry with its advisory.
**Where**: `catalog/attachment/module.json`
**Touches**: `catalog/attachment/module.json`, `catalog/attachment/CHANGELOG.md`, `catalog/attachment/README.md`, `docs/advisories/ADV-20260822-02.md`
**Depends on**: T46, T52
**Exclusive**: no
**Reuses**: `catalog/attachment/module.json:3,5,14-39`; `catalog/attachment/README.md:69,98-99`
**Requirement**: Goal 3

**Done when**:

- [ ] `version` → `1.1.0`; `kernelRange` → `">=2.0.0 <3.0.0"`; `env` gains `ATTACHMENT_PENDING_QUOTA_BYTES` and `ATTACHMENT_MAX_CONCURRENT_UPLOADS`
- [ ] `CHANGELOG.md` gains `## [1.1.0]` naming the `DownloadResult` shape change (a public facade surface), the inline allowlist, the sniffing batch path and the new bounds
- [ ] `README.md` download and env prose updated at `:12,66,80,98-99`
- [ ] `ADV-20260822-02.md` is `kind: security`, `severity: high` — stored XSS and the storage socket leak — with `detect`, `fix` and `parity`
- [ ] Gate check passes: `pnpm catalog:lint`

**Tests**: none — manifest/docs
**Gate**: quick
**Commit**: `feat(attachment): release 1.1.0 with the upload and download hardening`

---

### T55: Notification 1.1.0 — manifest, changelog, advisory

**What**: Ship the notification entry with its advisory.
**Where**: `catalog/notification/module.json`
**Touches**: `catalog/notification/module.json`, `catalog/notification/CHANGELOG.md`, `catalog/notification/README.md`, `docs/advisories/ADV-20260822-03.md`
**Depends on**: T49, T52
**Exclusive**: no
**Reuses**: `catalog/notification/module.json:3,13`; `catalog/notification/README.md:75`
**Requirement**: Goal 3

**Done when**:

- [ ] `version` → `1.1.0`; `kernelRange` → `">=2.0.0 <3.0.0"`
- [ ] `CHANGELOG.md` gains `## [1.1.0]` naming the `http(s)` link refine, the SSE origin check, the shared `NODE_ENV` enum and the widened delivery redaction
- [ ] `ADV-20260822-03.md` is `kind: security`, `severity: medium` with `detect`, `fix`, `parity`
- [ ] Gate check passes: `pnpm catalog:lint`

**Tests**: none — manifest/docs
**Gate**: quick
**Commit**: `feat(notification): release 1.1.0 with the link and origin hardening`

---

### T56: Audit 1.0.1 and tag 1.0.1 — manifests, changelogs, advisories

**What**: Ship the two small entries with their advisories.
**Where**: `catalog/audit/module.json`
**Touches**: `catalog/audit/module.json`, `catalog/audit/CHANGELOG.md`, `catalog/audit/README.md`, `catalog/tag/module.json`, `catalog/tag/CHANGELOG.md`, `catalog/tag/README.md`, `docs/advisories/ADV-20260822-04.md`, `docs/advisories/ADV-20260822-05.md`
**Depends on**: T32, T50, T52
**Exclusive**: no
**Reuses**: `catalog/audit/module.json:3,5`; `catalog/tag/module.json:3,5`; `catalog/audit/README.md:128`, `catalog/tag/README.md:62,88`
**Requirement**: Goal 3

**Done when**:

- [ ] Both `version` → `1.0.1`; both `kernelRange` → `">=2.0.0 <3.0.0"`
- [ ] `catalog/audit/CHANGELOG.md` names the query bounds; `catalog/tag/CHANGELOG.md` names the trash permission check
- [ ] `ADV-20260822-04.md` — audit, `kind: bug`, `severity: low`; `ADV-20260822-05.md` — tag, `kind: security`, `severity: low`; both with `detect`, `fix`, `parity`
- [ ] Gate check passes: `pnpm catalog:lint`

**Tests**: none — manifest/docs
**Gate**: quick
**Commit**: `feat(audit,tag): release 1.0.1 with the input and permission fixes`

---

### T57: Kernel v2.0.0 template changelog

**What**: Record the kernel's breaking changes for children applying `copier update`.
**Where**: `docs/dev/template-changelog.md`
**Touches**: `docs/dev/template-changelog.md`
**Depends on**: T53, T54, T55, T56
**Exclusive**: no
**Reuses**: `docs/dev/template-changelog.md:3` — version truth is the git tag plus this entry (AD-006); `package.json` is not bumped
**Requirement**: Goal 3

**Done when**:

- [ ] A `v2.0.0` section lists, each with the child's action: `NODE_ENV`/`DATABASE_SSL` now required, `BREACH_CHECK_ENABLED` required (identity), `TRUST_PROXY_HOPS` default `0`, `redis://` refused in production without `REDIS_ALLOW_PLAINTEXT`, `/docs` off in production without `DOCS_ENABLED`, swc `ignore` for harness directories, the entrypoint seed glob, the `@RateLimit` import path move, the widened redaction list, `outbox-dead.purge` with `lockId` 3
- [ ] The section states the tag is applied by the maintainer after merge (`git tag v2.0.0`), not by this task
- [ ] Gate check passes: `pnpm catalog:lint`

**Tests**: none — docs
**Gate**: quick
**Commit**: `docs(template): record the v2.0.0 kernel changes`

---

### T58: Deploy and environment documentation

**What**: Tell operators what the new fail-closed configuration expects.
**Where**: `docs/dev/deploy.md.jinja`
**Touches**: `docs/dev/deploy.md.jinja`, `docs/dev/local-environment.md`
**Depends on**: T57
**Exclusive**: no
**Reuses**: `docs/dev/deploy.md.jinja:32,45,50-51,57,65,68,79-80,108-109,158`
**Requirement**: REM-24

**Done when**:

- [ ] `TRUST_PROXY_HOPS=2` is documented for the Cloudflare → Traefik chain, with the reason the default is `0`
- [ ] `DOCS_ENABLED`, `REDIS_ALLOW_PLAINTEXT`, `DATABASE_SSL_CA`, `OUTBOX_DEAD_RETENTION_DAYS`, `STORAGE_REQUEST_TIMEOUT_MS`, `STORAGE_MAX_SOCKETS` and the identity/attachment variables are listed with their defaults and their production guidance
- [ ] The `legacy-import` entrypoint step is removed from the deploy prose; the seed glob replaces it (`:50,158`)
- [ ] `docs/dev/local-environment.md` gains the variables a developer must now set explicitly
- [ ] Gate check passes: `pnpm catalog:lint` and `pnpm template:smoke`

**Tests**: none — docs
**Gate**: full
**Commit**: `docs(deploy): document the fail-closed configuration`

---

## Wave Execution Map

```
Wave 1:  [C1: T1→T2→T3→T4→T5→T6→T7]  ∥  [C2: T8→T9→T10→T11→T12]  ∥  [C3: T13→T14→T15→T16→T17→T18]
Wave 2:  [C4: T19→T20→T21→T22→T23]  ∥  [C5: T24→T25→T26→T27→T28→T29→T30]
         ∥ [C6: T31→…→T38]  ∥  [C7: T39→…→T46]  ∥  [C8: T47→T48→T49→T50 — FIFO tail]
Wave 3:  [C9:  T51]   (exclusive — lockfile + root manifest)
Wave 4:  [C10: T52]   (exclusive — contract regen)
Wave 5:  [C11: T53→T54→T55→T56→T57→T58]
```

At Execute the orchestrator never implements a cluster. Per wave it dispatches one worker per cluster in a single message (≤4 in flight, the rest FIFO), waits for every compact summary, runs the Build gate once through the runner, records results here, and moves on. After wave 5 it dispatches the Verifier (**opus** — auth, data integrity, P0). See `references/cards/orchestrator.md`.

### Execution record

**Wave 1 — DONE (2026-08-22), Build gate PASS** (`full-unit`: typecheck 0 · lint 0 · unit 60 suites / 395 tests, baseline 51 / 330 · `module-boundaries.spec.ts` 32/32 · `test:scripts` 200/200 · `catalog:typecheck` 0). Commit range `77d2a05..8f9c8ee`, 20 commits.

| Cluster | Tier | Tasks → commits | Notes |
| --- | --- | --- | --- |
| C1 | opus | T1 `0050f42` · T2 `381ad0c` · T3 `1b2d447` · T4 `588d13e` · T5 `7b8050d` · T6 `d3e377b` + `b6f91d9` · T7 `ca30d62` | **blocked-by-ownership #1 (T6)**: deleting the identity guard (T5) orphaned 27 controller imports + one int-spec double outside every `Touches`; grant expanded and fixed in `b6f91d9` (T6 `Touches` corrected below). SPEC_DEVIATION `resilient-rate-limiter.ts:59`: `reset(key)` takes no options (design § Data Models) — on primary error it always clears the local key instead of gating on `critical`; accepted (clearing a fallback key is harmless). |
| C2 | sonnet | T8 `0d8720b` · T9 `8b880cd` · T10 `25bb234` · T11 `eea217b` · T12 `fc7b44b` · gate fix `8f9c8ee` | Gate failed once (2 typecheck + 2 lint errors in C2 files), fixed by the same worker. Deviations: `docs.ts` `mountDocs` is async with a dynamic `import("@scalar/nestjs-api-reference")` (static import breaks the unit spec without an ESM stub); `security-bootstrap.e2e-spec.ts` registers its probe route before `app.init()`; `createRedis(config: Env = env())` injectable (mirrors `connection-config.ts`). |
| C3 | sonnet | T13 `2e9dfbc` · T14 `1b96e43` · T15 `742ee2c` · T16 `39897fc` · T17 `71a28e7` · T18 `ec58740` | `Dockerfile` and `docker-entrypoint.dev.sh` needed no change. `catalog-check.mjs` shells `pnpm catalog:lint` after install, before module-add. REM-26 and REM-47 probes run and empty. |

Plan corrections from wave 1: (a) T6 `Touches` gains `catalog/identity/single-tenant/api/api/controllers/**` (the 27 `@RateLimit` importers) and `catalog/identity/single-tenant/api/infrastructure/repositories/drizzle-auth-event.repository.int-spec.ts`; (b) the Build gate's `src/modules/architecture.spec.ts` does not exist in this tree — only `src/modules/module-boundaries.spec.ts` is named from wave 2 on; (c) wave-1 workers touching `catalog/**` used the trailer `Advisory: none — covered by ADV-20260822-NN (security-audit-remediation)` (advisory files themselves land in wave 5, C11).

---

## Task Granularity Check

| Task group | Scope | Status |
| --- | --- | --- |
| T1, T2, T4, T12, T23, T31, T42, T48 | one module/function + its spec | ✅ Granular |
| T3, T5, T14 | one move (delete + recreate), no behaviour change | ✅ Granular |
| T6 | one mechanical import rewrite across a closed, enumerated file list | ✅ Granular (atomic by nature — a partial rewrite does not typecheck) |
| T7, T35, T50 | one contract/error surface, cohesive edits in one file + spec | ✅ Granular |
| T8, T30, T41, T45 (config halves) | one config schema + its spec | ✅ Granular |
| T9, T19, T36, T37, T46, T49 | 2–3 related things in the same vertical, one commit's worth | ⚠️ OK — cohesive (each pair shares a single behaviour statement) |
| T13, T18, T26, T29 | one cross-cutting switch (build ignore / CI pinning / enum + listener / guard order) | ✅ Granular |
| T16, T17 | one script + its `node:test` file | ✅ Granular |
| T20, T21, T22, T24, T25, T27, T28, T32, T33, T34, T39, T40, T43, T44, T47 | one behaviour, one owner file + spec | ✅ Granular |
| T51, T52 | one exclusive operation each (lockfile, regen) | ✅ Granular |
| T53–T58 | one release surface each (per entry / kernel / docs) | ✅ Granular |

No task creates more than one vertical slice; nothing needs splitting.

---

## Diagram-Definition Cross-Check

| Task | Depends on (body) | Map shows | Status |
| --- | --- | --- | --- |
| T1 | None | C1 root | ✅ |
| T2, T3 | T1 | after T1 in C1 | ✅ |
| T4 | T2, T3 | after T3 in C1 | ✅ |
| T5 | T4 | after T4 in C1 | ✅ |
| T6 | T5 | after T5 in C1 | ✅ |
| T7 | T1 | after T6 in C1 (order is legal: dep is earlier) | ✅ |
| T8 | None | C2 root | ✅ |
| T9, T10, T11 | T8 | after T8 in C2 | ✅ |
| T12 | None | C2 (independent root, ordered last) | ✅ |
| T13, T14, T18 | None | C3 roots | ✅ |
| T15, T16, T17 | T14 | after T14 in C3 | ✅ |
| T19, T20 | T12 | wave 1 → wave 2 | ✅ |
| T21 | T20 | after T20 in C4 | ✅ |
| T22, T23 | None | C4 roots | ✅ |
| T24 | T6, T7 | wave 1 (C1) → wave 2 (C5) | ✅ |
| T25 | T1, T7 | wave 1 (C1) → wave 2 (C5) | ✅ |
| T26 | T4, T6 | wave 1 (C1) → wave 2 (C5) | ✅ |
| T27 | T7 | wave 1 (C1) → wave 2 (C5) | ✅ |
| T28 | T27 | after T27 in C5 | ✅ |
| T29 | T6 | wave 1 (C1) → wave 2 (C5) | ✅ |
| T30 | T24, T25, T27 | after all three in C5 | ✅ |
| T31 | T7 | wave 1 (C1) → wave 2 (C6) | ✅ |
| T32 | T31 | after T31 in C6 | ✅ |
| T33 | T7 | wave 1 (C1) → wave 2 (C6) | ✅ |
| T34 | T33 | after T33 in C6 | ✅ |
| T35–T38 | None | C6 roots, ordered after T34 | ✅ |
| T39, T41, T42, T43, T47, T48, T50 | None | C7 / C8 roots | ✅ |
| T40 | T39 | after T39 in C7 | ✅ |
| T44 | T43 | after T43 in C7 | ✅ |
| T45 | T40, T43 | after both in C7 | ✅ |
| T46 | T45 | after T45 in C7 | ✅ |
| T49 | T8, T12 | wave 1 (C2) → wave 2 (C8) | ✅ |
| T51 | T45 | wave 2 (C7) → wave 3 | ✅ |
| T52 | T35, T50 | wave 2 (C6, C8) → wave 4 | ✅ |
| T53 | T30, T38, T51, T52 | waves 2, 3, 4 → wave 5 | ✅ |
| T54 | T46, T52 | waves 2, 4 → wave 5 | ✅ |
| T55 | T49, T52 | waves 2, 4 → wave 5 | ✅ |
| T56 | T32, T50, T52 | waves 2, 4 → wave 5 | ✅ |
| T57 | T53, T54, T55, T56 | after all four in C11 | ✅ |
| T58 | T57 | after T57 in C11 | ✅ |

**No task depends on a later wave, and no task depends on a sibling cluster of its own wave.** The two cross-cluster edges inside wave 2 that would have existed were removed at authoring time: the identity error catalog moved to wave 1 (T7, so C5 and C6 only read it) and the kernel `sensitive-keys` module moved to wave 1 (T12, so C4 and C8 only read it).

---

## Test Co-location Validation

| Task | Code layer created/modified | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T1, T2, T4, T5 | Kernel domain / pure util | unit | unit | ✅ |
| T3 | Kernel infra with IO (Redis) | integration | integration | ✅ |
| T6 | Import-path rewrite | unit | unit | ✅ |
| T7 | Entry domain (error catalog) | unit | unit | ✅ |
| T8 | Kernel config / env schema | unit | unit | ✅ |
| T9 | Kernel config + infra provider | unit | unit | ✅ |
| T10 | Kernel domain (pure predicate) + wiring | unit | unit | ✅ |
| T11 | Kernel HTTP surface (trust proxy) + harness | e2e | e2e | ✅ |
| T12 | Kernel domain / pure util | unit | unit | ✅ |
| T13 | Build output | none — probe | none — probe | ✅ |
| T14, T15 | Entry boot seed | none | none | ✅ |
| T16, T17 | Platform scripts | node:test | node:test | ✅ |
| T18 | CI workflows | none — probe | none — probe | ✅ |
| T19 | Kernel domain / pure util | unit | unit | ✅ |
| T20 | Kernel infra with IO (outbox) | integration | integration | ✅ |
| T21 | Kernel domain (registry) + infra (outbox) | unit + integration | unit + integration | ✅ |
| T22, T23 | Kernel domain / pure util | unit | unit | ✅ |
| T24 | Entry application + routes | unit + e2e | unit + e2e | ✅ |
| T25, T26, T27 | Entry application / infrastructure | unit | unit | ✅ |
| T28 | Entry application + infrastructure IO | unit + integration | unit + integration | ✅ |
| T29 | Entry api (guards) + routes | unit + e2e | unit + e2e | ✅ |
| T30 | Entry config | unit | unit | ✅ |
| T31 | Entry application | unit | unit | ✅ |
| T32 | Entry application + routes (two entries) | unit + e2e | unit + e2e | ✅ |
| T33 | Entry application + routes | unit + e2e | unit + e2e | ✅ |
| T34 | Entry application | unit | unit | ✅ |
| T35 | Entry api contract + routes | unit + e2e | unit + e2e | ✅ |
| T36 | Entry api + application + repository + routes | unit + integration + e2e | unit + integration + e2e | ✅ |
| T37 | Entry application + domain + routes | unit + integration + e2e | unit + integration + e2e | ✅ |
| T38 | Custom SQL migration | none | none | ✅ |
| T39 | Entry application + facade | unit | unit | ✅ |
| T40 | Entry routes | e2e | e2e | ✅ |
| T41 | Kernel infra (storage adapter) + config | unit | unit | ✅ |
| T42 | Kernel domain / pure util | unit | unit | ✅ |
| T43 | Entry api (multipart reader) | unit | unit | ✅ |
| T44 | Entry domain + application + routes | unit + integration + e2e | unit + integration + e2e | ✅ |
| T45 | Entry api + repository | unit + integration | unit + integration | ✅ |
| T46 | Entry application (jobs, use case) | unit | unit | ✅ |
| T47, T48, T49, T50 | Entry application / api / config | unit | unit | ✅ |
| T51 | Root manifests + entry api | unit | unit | ✅ |
| T52 | Contract + parity | unit (parity) | unit (parity) | ✅ |
| T53–T58 | Manifests / CHANGELOG / advisories / docs | none | none | ✅ |

**No `Tests: none` is a deferral.** Every `none` maps to a matrix row that says `none` for that layer: build output and CI (probe), entry boot seeds, custom SQL migrations, and manifests/docs. The three matrix rows covering them were added during this authoring pass, not to excuse a task, but because those layers genuinely have no importable surface — each names the gate that does prove it.

---

## Wave/Cluster Cross-Check

| Wave | Cluster | Tasks (order) | Deps outside earlier waves / own cluster? | Files shared with a sibling cluster? | Exclusive alone? | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | C1 | T1→T2→T3→T4→T5→T6→T7 | none | none — kernel `rate-limit`/`errors`/`collections`/`infra/rate-limit` + enumerated identity/cross-entry importer files; C2 owns `shared/config` + `shared/kernel/redaction`, C3 owns build/scripts/CI | n/a | ✅ |
| 1 | C2 | T8→T9→T10→T11→T12 | none | none — `shared/config`, `shared/infra/database`, `shared/infra/redis`, `src/docs`, `src/main.ts`, `test/setup/**`, `lib/child.mjs`, `.env.example`, `docker-compose.yml`, `shared/kernel/redaction` | n/a | ✅ |
| 1 | C3 | T13→T14→T15→T16→T17→T18 | none | none — `nest-cli.json`, `tsconfig.build.json`, Dockerfile + entrypoints, `apps/api/package.json`, identity `api/seeds` + `testing/seeds`, `lib/lint.mjs`, `catalog-lint.mjs`, `catalog-check.mjs`, `__tests__/**`, `.github/workflows/**`, `openapi-config.ts` | n/a | ✅ |
| 2 | C4 | T19→T20→T21→T22→T23 | T12 (wave 1) | none — kernel `logging`, `outbox`, `scheduling`, `idempotency`, `listing`, `src/db/outbox-replay.int-spec.ts` | n/a | ✅ |
| 2 | C5 | T24→…→T30 | T1, T4, T6, T7 (wave 1) | none — identity login/password/hashing/auth-event/config + the 8 critical auth controllers + 4 e2e + 2 parity specs; C6 owns authz/contract/middleware/session and the other 4 e2e | n/a | ✅ |
| 2 | C6 | T31→…→T38 | T7 (wave 1) | none — identity access-policy/assert-permission/require-auth/list-users/update-user/create-user/request-email-change/middleware/contract/session-repo/errors/user-entity + custom migration + tag | n/a | ✅ |
| 2 | C7 | T39→…→T46 | none | none — attachment entry + kernel `http/content-disposition` + `infra/storage` (no sibling touches either kernel path) | n/a | ✅ |
| 2 | C8 | T47→T48→T49→T50 | T8, T12 (wave 1) | none — notification entry + `audit.contract.ts` | n/a | ✅ |
| 3 | C9 | T51 | T45 (wave 2) | none — alone in the wave | yes — only cluster in wave 3 | ✅ |
| 4 | C10 | T52 | T35, T50 (wave 2) | none — alone in the wave | yes — only cluster in wave 4 | ✅ |
| 5 | C11 | T53→…→T58 | T30, T32, T38, T46, T49, T50 (wave 2), T51 (wave 3), T52 (wave 4) | none — alone in the wave | n/a (not exclusive) | ✅ |

**Cluster sizes**: 7, 5, 6 · 5, 7, 8, 8, 4 · 1 (exclusive) · 1 (exclusive) · 6 — all within 4–8 except the two exclusive single-task waves, which the rules allow. No wave holds three or more single-task non-exclusive clusters. Wave 2 holds five clusters at one dependency level: that is one wave with a FIFO tail, not two waves.

**Shared files that forced the ordering** (design § *Execute notes*): `catalog/identity/single-tenant/api/domain/errors.ts` → additions in wave 1 (T7), removal in wave 2 by its only producer (T37). `apps/api/src/shared/kernel/redaction/sensitive-keys.ts` → created in wave 1 (T12) so C4 and C8 only consume it. `identity.module.ts` → C1 in wave 1, C5 in wave 2, never two clusters at once. `module.json` and `CHANGELOG.md` of every entry → wave 5 only, so no entry cluster owns a manifest.

---

## Requirement Coverage

All 47 requirements map to at least one task; every task names at least one requirement.

| REM | Task(s) | REM | Task(s) | REM | Task(s) |
| --- | --- | --- | --- | --- | --- |
| 01–03 | T24 | 17 | T21 | 33 | T23 |
| 04 | T2, T3, T4, T9, T26 | 18 | T7, T33 | 34–36 | T35, T52 |
| 05 | T1, T7, T25 | 19 | T34 | 37 | T50, T52 |
| 06 | T5, T6, T29 | 20 | T12, T19, T49 | 38 | T47 |
| 07 | T7, T27, T28 | 21 | T8, T11, T30 | 39 | T51 |
| 08 | T44 | 22 | T8 | 40 | T38 |
| 09 | T40 | 23 | T9 | 41 | T46 |
| 10 | T40 | 24 | T8, T11, T58 | 42 | T42 |
| 11 | T39, T40 | 25 | T10 | 43 | T36 |
| 12 | T40 | 26 | T13 | 44 | T37 |
| 13 | T41 | 27 | T14, T16 | 45 | T36 |
| 14 | T1, T5, T45 | 28 | T15 | 46 | T48 |
| 15 | T43 | 29 | T14, T17 | 47 | T18 |
| 16 | T12, T20 | 30 | T8, T49 | Goal 3 | T53–T57 |
| | | 31 | T31, T32 | | |
| | | 32 | T22 | | |
