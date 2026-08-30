---
name: backend-architecture
description: Backend architecture handbook for apps/api — module anatomy, layer boundaries, HTTP edge, transactions, outbox and the conformance specs that enforce them. Use when writing or reviewing apps/api code, deciding where logic belongs (domain/application/infrastructure/api), wiring a use case, event, transaction or migration, or checking a change against the Golden Rules.
---

# Backend architecture

Quick-read handbook of `apps/api`, a modular monolith with spec-verified boundaries: each concept, the rules it implies
and the spec that enforces it. See [`code-quality`](../code-quality/SKILL.md), [`testing`](../testing/SKILL.md),
[`domain-modeling`](../domain-modeling/ADR-FORMAT.md), [`catalog.md`](../../../docs/catalog/catalog.md) and [`frontend-architecture`](../frontend-architecture/SKILL.md). The template ships
**only the kernel**; business modules are catalog entries installed into the product.

## Source layout, kernel and boot

Three regimes share `src/`: the **Nest runtime** (`modules/`, `shared/`, `docs/`); **CLI scripts** (`db/`,
`openapi/export-openapi.ts`) outside the module graph; and the **conformance specs**. `platform-modules.ts` and
`db/platform-schema.ts` are **generated** by `pnpm platform module`, never edited by hand; `docs/` mounts `/docs`
(Scalar) with no auth and no module dependency. Module anatomy (a folder exists only with content):

```
modules/<entry>/   <entry>.module.ts (exports facades only) · <entry>.config.ts (Zod env schema)
  api/             controllers/<action>.controller.ts · contracts/<resource>.contract.ts · guards/ · decorators/
                   facades/<operation>.facade.ts · events/<event-name>.event.ts                ← public surface
  application/     use-cases/<action>/{use-case,types}.ts · views.ts · services/ · require-*.ts · jobs/<name>.job.ts
                   event-handlers/{external,internal}/<event-name>.handler.ts
  domain/          entities/<resource>.entity.ts · ports/<resource>.repository.ts (+ token) · value-objects/ · engine/ · errors.ts
  infrastructure/  repositories/drizzle-<resource>.repository.ts (+ mapper) · tables/<module>.schema.ts · <resource>.table.ts · events/ · <adapter>/
```

- Non-repository ports are `<x>.port.ts` (composed readers `<x>.reader.ts`); the repository port has no suffix. Root
  files of `application/` are orchestration guards (ask a neighbour's facade, throw a domain error) and `require-*`
  helpers. Pure rule without IO → `domain/`; reusable `@Injectable` → `services/`; a helper private to one use case
  stays in its folder. A cycle between Nest modules → a leaf module both import (open-host service), never `forwardRef`.
- `shared/kernel/` (one folder per concern: context, access, transactional, outbox, idempotency, scheduling, errors,
  events, logging, tracing, listing, clock…) is aggregated by `shared-kernel.module.ts`: `@Global`, imported **only**
  by `AppModule`; a module never imports a kernel module, providers arrive through the container. Health, Storage and
  Database mount directly in `AppModule` (Database takes the aggregated schema the kernel must not import).
  `shared/infra/`: the pool (`DRIZZLE`/`PG_POOL` are **private to the kernel** — a module reaches the database only
  through `TransactionManager`), `DedicatedClientFactory` (clients outside the pool), Redis, object storage.
- **Kernel ports** exist only where an entry needs what another implements and an import would create a cycle: token +
  interface next to the concept, never a `ports/` tree; any other edge is `dependsOn` in `module.json`. Shipped:
  **access policy** (no provider → every non-public route is 403 `access-policy-missing`), **profile-image store** (no
  provider → those operations degrade), **audit-trail purger** (no provider → no-op).
- **Boot**: `tracing.bootstrap.ts`, the first import of `main.ts`, validates the env (fail-fast) and starts OTel before
  `NestFactory`; `main.ts` then wires `/v1` URI versioning, security middleware, `RequestContext` and `/docs`. The Zod
  pipe, log and idempotency interceptors and the problem-details filter are `AppModule` providers; `AccessGuard` ships
  with the kernel; every `<module>.config.ts` is validated at boot.

## Layers and boundaries

| Layer             | Knows                                                                 | Does not know                                        |
| ----------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `api/`            | application, contracts, `domain/ports` (types, tokens), domain errors | `domain/entities`, infrastructure                    |
| `application/`    | domain, ports, contracts (types via `z.infer`)                        | infrastructure (except own `infrastructure/events/`) |
| `domain/`         | its own `domain/` + `shared/kernel`                                   | everything else                                      |
| `infrastructure/` | domain, ports (implements them)                                       | own application and api                              |

`shared/*` is reachable from any layer; `domain/` reaches only `shared/kernel`. Across modules the only legal targets
are the other module's `api/facades/`, `api/events/` and `*.module.ts`. **The table is executable**:
`module-boundaries.spec.ts` resolves every production import and fails any other crossing. It also keeps the
kernel/product split — **RULE A**: `shared/**` never imports `modules/**`, type imports included; **RULE C**: no
catalog-entry vocabulary (a closed token list) survives in the template shell (`shared/**`, `app.module.ts`,
`db/schema.ts`, the web `app/` and `shared/`), in code, comment or string. The kernel learns about the product only by
a composition-root slot (the `DatabaseModule.forRoot` schema), a kernel port or the request context's extension bag.

## HTTP edge

- **Controller.** No module controller declares a version. `operationId` is the **public contract name** Kubb keys on:
  camelCase of the action from the file name, no prefix or version — changing it is a deliberate break on the front.
  One tag per module, lowercase plural. Internal routes leave the document via `@ApiExcludeEndpoint`.
- **Authorization.** Every route declares exactly one access mode, read by `AccessGuard`: `@Public`; `@Authenticated`
  or `@SelfService` (session, no permission); `@OptionalAuth` (the use case's ACL decides); `@RequirePermission(key)`;
  `@RequireAnyPermission(keys)`. `@MachineToMachine` only opts out of CSRF, paired with `@Public` and a token guard.
  Fail-closed: no declaration → authenticated, no policy provider → 403; `authz-coverage` fails an undeclared route.
  Session (cookie, not JWT), CSRF, rate limiting and the permission catalog live in the policy-providing entry.
- **Idempotency.** `Idempotency-Key` is optional (absent → no dedupe; a domain constraint guards duplicates) and the
  **only** header accepted as caller input: the same key and payload replay the stored response, a reused key with a
  different payload is rejected, a stored server failure is retryable. Never on GET or a pure-overwrite PUT.
- **Contract.** Schemas in `api/contracts/` yield DTOs (`createZodDto`) and use-case types (`z.infer`). One document
  (`openapi-config.ts`) serves `/docs` and the export; `@Public` routes get `security: []`. Transport headers
  (`Origin`, `X-CSRF-Token`, `X-Correlation-Id`) are **never** operation parameters — the api-client interceptor adds
  them. Pipeline: edit schema → `pnpm contract` (root `openapi.json` + Kubb client) → `turbo typecheck` with the web;
  CI fails on an uncommitted `openapi.json`. A contract change breaks on the **front**, never in the api.
- **Errors (RFC 7807).** A custom error extends the kernel `DomainError` (pt-BR `title`/`detail`, opt-in
  `retryAfterSeconds` and extension members). `type` is `<base>/<module>/<english-slug>`; the module's `TYPE_BASE` **is
  its folder name** (`error-namespace`); 403 and 503 have a single kernel home. `ProblemDetailsFilter` renders every
  error as `application/problem+json` with `correlationId`, `instance` without query string, `Retry-After` on 429/503,
  and never a stack, SQL or path. The front matches `type` by slug — the slug is contract.

## Use cases, transactions and persistence

- A use case is `@UseCase`, plus `@Transactional` (mutates), `@ReadOnly` (reads) or `@NonTransactional("reason")`
  (external IO, holds no connection), and `@Traced` on `execute`. A check repeated across use cases becomes **one**
  `require-*` helper with a single error — defence in depth; the guard already ran. Entity → response mapping lives
  in `application/views.ts`; `@Injectable` mappers only when DI is needed; the persistence mapper sits by the repository.
- **RequestContext.** ALS store opened by the HTTP middleware with the correlation ids (a client `X-Correlation-Id`
  counts only if a valid ULID), the actor (set once; a second `setActor` throws) and a symbol-keyed extension bag for
  what only one entry needs. **Every dispatcher opens a context before working** (event context inherits correlation
  and sets causation; job context carries the persisted actor id) — otherwise `ctx.get()` throws and logs and audit
  trail lose correlation and actor; only an integration spec with real use cases catches it.
- **Transactions.** `TransactionManager` keeps the executor in ALS; `@Transactional` opens or joins, `requires_new`
  opens a savepoint. `READ COMMITTED` by default; `REPEATABLE READ` for conditional read-then-write without a
  pessimistic lock; `SERIALIZABLE` rarely. `onCommit` is for cache, metric or webhook — never a domain event.
  `outsideTransaction()` alone reaches the root executor and throws inside a transaction: a record that must survive
  rollback is written outside, a success record inside. The manager stamps actor, correlation and origin on the
  physical transaction for a trigger-based audit trail. `transactional-coverage` fails an undeclared use case.
- **Persistence.** `_kernel` is reserved. Schema = concept, singular `snake_case` (the module name); table =
  collection, plural; columns singular; foreign keys `[<role>_]<entity>_id`; enums `<entity>_<attribute>`; indexes
  `<table>_<columns>_idx`; pattern tables (`outbox`) stay singular, other singular tables are justified in the PR. The
  aggregator `src/db/schema.ts` (kernel tables directly, installed entries via the generated `platform-schema.ts`)
  feeds Drizzle and the `DatabaseModule`; `schema-completeness` fails a table it cannot reach. A migration is
  `NNNN_<module>_<slug>.sql` plus a journal entry whose `when` exceeds every existing one; it touches one schema (two
  owners → both names); once applied it is never renamed or rewritten. `db:check:journal` (first pre-push step) checks
  journal ↔ SQL pairing, increasing `when` and a new migration against `origin/main` — one born in the past is silently
  skipped forever. `module add` generates an entry's migrations inside the product.

## Communication and asynchronous work

- **Facade (default).** `api/facades/<operation>.facade.ts`, exported by the module; the consumer imports the Nest
  module and injects it. It **shares the caller's transaction** (no `@Transactional` of its own). A per-item call in a
  loop asks the owner for a batch variant: N+1 across a boundary.
- **Event.** A contract consumed only inside its module lives in `infrastructure/events/`; one other modules consume is
  published in the owner's `api/events/` — the kernel holds only the `DomainEvent` base. An immediate answer, completion
  before returning or a fact another module owns → facade; ≥ 2 consumers, an optional, slow or decoupled consumer, or
  a cross-cutting reaction → event. An event costs debugging, ordering and versioning — never "in case someone listens".
- **Cross-module queries** (no JOIN across schemas), in order: point fact → the owner's facade; one combined detail →
  BFF composing facades in parallel, never in a paginated listing; aggregate report tolerating staleness → materialized
  view with ADR and owner; ad-hoc admin query → an ADR-documented view; cross-module listing with filter/sort → facade
  composition in the aggregating module, beyond that a read model with its own ADR, owner, schema and rebuild job.
- **Outbox.** All state is kernel-owned in `_kernel` (`outbox`, `outbox_dead`, `processed_events`). Publishing without
  an open transaction throws; correlation, causation, tenant and `traceparent` enter the envelope from the context,
  never the caller. Each handler runs in an event context and a linked span and receives the raw `EventEnvelope` under
  a **stable** consumer id (renaming re-runs history). Guarantees: **at-least-once** with backoff and a dead-letter
  table after the retry budget; a missing listener is not success; no global ordering (best-effort FIFO per aggregate);
  leases compare on the Postgres clock; published rows are purged by a kernel job; replay via `outbox:replay`; shutdown
  drains in-flight work. An IO handler accepts a duplicate in the crash window; stateful per-delivery IO uses its own queue.
- **Maintenance jobs.** `@MaintenanceJob("<scope>.<action>")`, registered via `registerMaintenanceJob` **at the top of
  the job's own file** with cron and a unique `lockId`; a duplicate name or `lockId` throws at boot — a collision
  silences a job forever. The runtime opens a job context, takes a **session** advisory lock on a dedicated client off
  the pool and runs the body in autocommit; only `atomic: true` opens a pool transaction, after the lock. A business
  queue is no kernel concern: ADR first, weigh a real queue before hand-rolling a dispatcher (`maintenance-registry`).

## Observability

- **Logging.** pino JSON via `LoggerFactory.forModule(scope)`; every line carries request, correlation and causation
  ids, tenant and actor id; `trace_id`/`span_id` come from the instrumentation, never by hand. One line per request;
  bodies only in development; PII and secrets redacted at every depth. Messages pt-BR with English technical terms;
  event names `domain.subject_action`.
- **Tracing.** OTel auto-instrumentations; exporters come from env (none → nothing exported, trace ids still reach the
  logs). `@Traced` on use cases and handlers: in-process calls are child spans; an event consumer starts a **new trace
  linked** to the parent via `traceparent`. No span per repository method; attributes are small primitives, never payloads.

## Conformance specs

One mould: filesystem sweep, a sanity `it` on the glob, offenders `toEqual([])`, an allowlist with a reason per entry
and a dead-entry `it`; a new spec lives next to the code it guards; bypassing one without a justified allowlist entry
fails the PR. Pre-push: `db:check:journal` → typecheck → `pnpm test:coverage`, one Vitest process over the four
projects (`api`, `api-int`, `api-e2e`, `web`) against real Postgres and Redis — it needs Docker, and a coverage floor
below the calibrated one aborts the push (AD-027). e2e snapshots the exported `openapi.json`; a public facade gets a
shape snapshot.

| Spec                                                       | Lives in                    | Enforces                                                                                                                 |
| ---------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `authz-coverage`, `operation-id`, `transactional-coverage` | `src/openapi/`              | one access mode per route; explicit, unique, camelCase `operationId`; declared tx participation (`.run(` does not count) |
| `module-boundaries`                                        | `src/modules/`              | layer table, cross-module surface, no root-connection import, RULE A and C                                               |
| `template-kernel-only`                                     | `src/modules/`              | the template boots with no entry; deleted by the first `module add`                                                      |
| `schema-completeness`, `check-journal`                     | `src/db/`                   | every `*.table.ts` reachable from the aggregator; journal ↔ SQL pairing, monotonic `when`, nothing born in the past      |
| `error-namespace`                                          | `shared/kernel/errors/`     | `TYPE_BASE` = module folder; 403 only in the kernel                                                                      |
| `maintenance-registry`                                     | `shared/kernel/scheduling/` | unique job name and `lockId`; an atomic job never calls `outsideTransaction()`                                           |

## Golden Rules

1. A controller only receives input, calls the use case and returns a DTO.
2. A use case never returns an entity — always a DTO via view/mapper. Holds for facades too.
3. A repository never returns a raw row — always an entity via the persistence mapper.
4. `domain/` imports no NestJS, Drizzle, Zod, `RequestContext` or logger — only itself and `shared/kernel`.
5. Modules talk only via facade or event — never a foreign repository, use case, port or **table**; even a read-only read of a foreign schema goes through the owner's facade. Exception: code outside `src/modules/`.
6. Every route: `@ApiTags`, unique `operationId`; `/v1` comes from boot.
7. Zod is the source of truth of the HTTP contract.
8. The frontend never writes an HTTP client — `@platform/api-client`.
9. A view or mapper transforms; it never decides a rule.
10. **Default = facade.** An event only with ≥ 2 consumers or legitimate decoupling.
11. Events are past facts (`invoice.paid`).
12. Event contracts: existing fields immutable; only add optional fields; bump `EVENT_VERSION` when incompatible.
13. An event leaves via `OutboxPublisher.publish` inside `@Transactional`; direct `EventEmitter.emit` is **forbidden** — the kernel dispatcher is the only emitter.
14. Event payloads are serializable (no `Date`, no class instances).
15. Transactional handler: `markIfNew` first, inside `@Transactional`. IO handler: `wasProcessed` → IO → `markIfNew`, no tx.
16. A mutating route with an external effect or aggregate creation = `@Idempotent`.
17. `@Transactional` on multi-repository writes. External IO **never** inside the transaction — `onCommit` or an event.
18. A repository takes no `tx` in its signature. It reads from `TransactionManager`.
19. Logger via `LoggerFactory.forModule`. `console.*` is forbidden (lint error; only a declared CLI script).
20. `RequestContext` over ALS. Never in a signature.
21. `application/` depends on ports. `infrastructure/` implements them.
22. Cross-module: facade (point fact), BFF (detail), MV/view + ADR (aggregate), facade aggregator (listing).
23. Structural decision or exception: an AD entry in `.ca-plans/DECISIONS.md` (`domain-modeling` skill).
24. `RequestContext` provides the actor, `correlationId` and `tenantId`. Never in a signature.
25. `throw` is the only error path. No `Result<T>`/`Either`.
26. `eventId` is a ULID. `traceparent` travels in the outbox envelope.
27. One Postgres schema per module (`pgSchema('<module>')`). No cross-schema join without an ADR.
28. `@Idempotent` is backed by the `_kernel` store: `(scope, key)` key, request hash, response snapshot, status, expiry.
29. Entities are immutable: a transition returns a new instance; `Props` are `readonly` and frozen (shallow, on purpose).
30. A facade re-exports every type it returns; a consumer never deep-imports another module, not even for a type.
31. A new table enters the aggregator `src/db/schema.ts` in the same commit.
32. Never a second pool connection inside a transaction: root only via `outsideTransaction()` outside one; `requires_new` or post-commit inside.
