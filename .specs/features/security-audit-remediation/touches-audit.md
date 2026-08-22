# Touches audit — security-audit-remediation

Input to the Tasks phase (tasks.md § 3 *Touches audit*): per vertical, every file a task must own so no worker stops on an unlisted file. Scout results of 2026-08-22; paths relative to the repo root. A stale `.worktrees/vitest-migration/` mirrors `catalog/**` — never edit there.

## Attachment vertical (design § D)

**Download**
- `catalog/attachment/api/application/use-cases/get-attachment-for-download/get-attachment-for-download.use-case.ts:21,37,51` (+ `.spec.ts:4,42,46`) — `DownloadResult` interface + class.
- `catalog/attachment/api/api/facades/attachment.facade.ts:6,7,22,38` — re-exports `DownloadResult` type (public facade surface — changing the shape is an entry API change, list in the advisory).
- `catalog/attachment/api/api/controllers/download-attachment.controller.ts:5,6,34` — no spec of its own; covered by `catalog/attachment/api/__e2e__/attachment-download.e2e-spec.ts` (header assertions at `:234,267,295`, `makeInMemoryStorage()` at `:40`).
- `catalog/attachment/api/attachment.module.ts:12,37`.
- Other e2e in the dir: `attachment-delete.e2e-spec.ts`. No upload e2e exists — the upload route is covered only indirectly.

**Upload / multipart**
- `catalog/attachment/api/api/controllers/multipart-files.ts:24` + `multipart-files.spec.ts:5,70,92,147,164,189,218`; caller `upload-attachments.controller.ts:26,70` (no spec/e2e of its own).
- `catalog/attachment/api/domain/content-type-sniff.ts` + `.spec.ts` (note: lives under `domain/`, not `application/`).
- `.../use-cases/upload-attachment/upload-attachment.use-case.ts` + `.spec.ts` + `.int-spec.ts`.
- `.../use-cases/upload-attachments-batch/upload-attachments-batch.use-case.ts` + `.spec.ts` (no int-spec).
- `.../use-cases/confirm-uploads/confirm-uploads.use-case.ts` + `.spec.ts`.
- `.../application/jobs/purge-pending-attachments.job.ts` + `.spec.ts`.

**Repository**
- Port `catalog/attachment/api/domain/ports/attachment.repository.ts`; impl `catalog/attachment/api/infrastructure/repositories/drizzle-attachment.repository.ts` + `.int-spec.ts`.
- Object-literal fakes with `deleteByIds` (must gain the new methods): `delete-attachment.use-case.spec.ts:22`, `get-attachment-for-download.use-case.spec.ts:30`, `upload-attachment.use-case.spec.ts:25`, `purge-pending-attachments.job.spec.ts:30,45,62`.

**Module / config / manifest**
- `attachment.module.ts`: `@Module` at `:49` has **no `imports:` key** — add `imports: [RateLimitModule]` before `controllers:` (`:50`); `providers:` `:51-64` (new `UploadGate` after `:63`).
- `attachment.config.ts` + `attachment.config.spec.ts` (cases `:4` defaults, `:12` coercion, `:19` old envs removed).
- `catalog/attachment/module.json`: `version` `:3`, `kernelRange` `:5`, `env` `:14-39` (4 entries).
- `catalog/attachment/README.md`: env vars in prose at `:98-99`; download mentions `:12,66,80`; no inline/Content-Type text. `CHANGELOG.md`: single `## [1.0.0]`.
- No `parity/` dir in the entry; no web package (`catalog/attachment/web/` absent; `apps/web` has no dependency on download headers).

**Kernel storage**
- `apps/api/src/shared/infra/storage/`: `object-storage.port.ts` (+`.spec.ts`), `storage.config.ts` (+`.spec.ts`), `r2-storage.adapter.ts` (+`.spec.ts`, no int-spec), `storage.module.ts:9-14` (`@Global()`, `useFactory: () => new R2StorageAdapter(loadStorageConfig())`).
- No shared `ObjectStoragePort` fake — every spec/e2e builds its own literal.
- `apps/api/src/shared/kernel/http/content-disposition.ts` + `.spec.ts`; importer `download-attachment.controller.ts:5`.

**Avatar / multer / overrides**
- `catalog/identity/single-tenant/api/api/controllers/session/upload-avatar.controller.ts:46` and `.../controllers/auth/upload-access-link-avatar.controller.ts:54` (`FileInterceptor`); specs `upload-avatar.controller.spec.ts`, `upload-avatar.use-case.spec.ts`, `upload-access-link-avatar.use-case.spec.ts`; e2e `access-link-activation.e2e-spec.ts`, `create-user-flow.e2e-spec.ts`.
- `apps/api/package.json:64` `multer ^2.1.1`, `:86` `@types/multer ^2.1.0`; root `package.json` has **no `pnpm.overrides`** block yet (REM-39 creates it).

## Rate-limit + login vertical (design § A/B)

`I/` = `catalog/identity/single-tenant/api/`.

**Port move — every importer of `I/domain/ports/rate-limiter.ts` (re-point to the kernel token; mechanical)**
- Production: `I/identity.module.ts:62,79,141`; `I/api/guards/rate-limit.guard.ts:10,12,36`; `I/application/use-cases/login/login.use-case.ts:21,56`; `I/infrastructure/rate-limit/redis-rate-limiter.ts:13,32` (+ `lua-scripts.ts`, only importer); `I/testing/allow-all-rate-limiter.ts:1,4`; `I/domain/ports/ports.spec.ts:6,22` (token-shape assertion).
- Specs: `I/infrastructure/rate-limit/redis-rate-limiter.int-spec.ts` (94 lines), `I/api/guards/rate-limit.guard.spec.ts` (91 lines, in-file `@RateLimit` at `:37,55`).
- Identity e2e `overrideProvider(RATE_LIMITER)` pairs (`I/__e2e__/`): `notifications-inapp:13,82`, `notifications-sse:8,83`, `access-catalog:10,49`, `auth-login:10,33`, `notifications-email:13,38`, `verify-email:12,54`, `user-trash:11,36`, `create-user-flow:18,74`, `access-link-activation:20,110`, `access-history:10,43`, `auth-outbox-email:13,61`, `auth-logout:10,53`, `idempotency:10,32`, `auth-csrf-none:12,79`, `authz:11,51`, `notifications-feed:12,61`, `auth-anti-enum:10,40` (all `.e2e-spec.ts`).
- Cross-entry e2e importing `../../identity/domain/ports/rate-limiter`: `catalog/attachment/api/__e2e__/attachment-delete.e2e-spec.ts:13,108`, `attachment-download.e2e-spec.ts:20,116`, `catalog/audit/api/__e2e__/audit-product-extension.e2e-spec.ts:12,85`, `audit.e2e-spec.ts:12,48`, `catalog/tag/api/__e2e__/tags.e2e-spec.ts:12,48`.
- READMEs naming the port: `catalog/identity/single-tenant/README.md:75,175,182,219,221`, `catalog/notification/README.md:75`, `catalog/attachment/README.md:69`, `catalog/audit/README.md:128`, `catalog/tag/README.md:62,88`.

**`@RateLimit` decorator sites (27, all import `../../guards/rate-limit.guard`; all `windowSeconds: 60`)** — `I/api/controllers/`: `auth/login:46` (30, critical), `auth/forgot-password:20` (3, critical), `auth/reset-password:18` (10, critical), `auth/verify-email:17` (5, critical), `session/resend-verification:18` (5, critical), `auth/validate-access-link:22` (20, critical), `auth/cancel-access-link:18` (5, critical), `auth/upload-access-link-avatar:48` (5, critical), `auth/set-password:48` (10, critical), `auth/validate-email-change:22` (20), `auth/confirm-email-change:47` (10), `admin/purge-users:19`, `admin/resend-access-link:16`, `admin/delete-user:16`, `admin/create-user:18`, `admin/restore-users:19`, `admin/update-user:25`, `permission-template/{create:26,update:27,delete:25}-permission-template`, `device/revoke-device:16`, `device/revoke-other-devices:16`, `session/upload-avatar:43`, `session/change-password:17`, `session/update-my-profile:17`, `session/request-email-change:33`, `session/logout:31`.

**`identity.module.ts`**: `:62,141` RATE_LIMITER provider; `:79` `RedisRateLimiter` import; `:117-129` `PASSWORD_HASHER` factory; `:132-139` `BREACH_CHECK` factory; `:208` comment — `SharedKernelModule` is `@Global`, `:243` the only `imports:` (professional variant) → make the kernel `RateLimitModule` `@Global()` like `StorageModule` so neither identity nor attachment needs an `imports:` edit; `:261-262` the two `APP_GUARD` entries (swap).

**Breach check**: `I/domain/ports/breach-check.ts:1,6,9`; `I/infrastructure/password/{hibp-breach-check.ts:3-18,noop-breach-check.ts:1-5,breach-check.spec.ts}`; `I/identity.config.ts:66,68` + `identity.config.spec.ts:7,31,32,85-89`; `I/identity.config.fixture.ts:1-13` (derives from `process.env`); use cases `reset-password.use-case.ts:16,58,82-83`, `set-password.use-case.ts:20,49,100-101`, `change-password.use-case.ts:21,54,97-98` + their `.spec.ts` (fake `{ isBreached }`), `change-password.use-case.int-spec.ts`, `reset-password.use-case.int-spec.ts`, `request-email-change/email-change-flow.int-spec.ts:46`, `infrastructure/repositories/drizzle-auth-event.repository.int-spec.ts:371`; `I/domain/ports/ports.spec.ts:2,20`; README `:273`; `apps/api/test/setup/unit-env.ts:5,12`, `e2e-env.ts:8,15` (set `BREACH_CHECK_MODE`, must add `BREACH_CHECK_ENABLED` + `DATABASE_SSL`).

**Password hasher fakes**: `login.use-case.spec.ts:56-58,203-205,247-249`; `set-password.use-case.spec.ts:85`; `change-password.use-case.spec.ts:50-52,173-175`; `reset-password.use-case.spec.ts:46`; `change-password.use-case.int-spec.ts:94-96`; real `Argon2PasswordHasher` in `email-change-flow.int-spec.ts:21,76,79,133`; impl `I/infrastructure/hashing/argon2-password-hasher.ts:21`.

**Auth-event literals**: `I/domain/entities/auth-event.entity.ts:3` (union), `I/infrastructure/tables/auth-event.table.ts:6` (`pgEnum`), `I/application/use-cases/list-access-history/types.ts:12-26` (`ACCESS_HISTORY_EVENT_TYPES` subset → decide whether `rate_limiter_degraded` is listed), `I/api/contracts/identity.contract.ts:9,243` (uses that list), README `:102-103`.

**e2e topics (`I/__e2e__/`, 20 files)**: `auth-login`, `auth-anti-enum`, `auth-rate-limit` (forgot-password), `auth-csrf-none`, `auth-session`, `auth-logout`, `auth-outbox-email`, `auth-reset-token-logging`, `devices`, `idempotency`, `create-user-flow`, `access-link-activation`, `verify-email`, `user-trash`, `authz`, `access-catalog`, `access-history`, `notifications-{email,feed,inapp,sse}`. Parity: `catalog/identity/single-tenant/parity/{access-policy,csrf,route-access,contract,profiles}.parity.spec.ts` (`route-access`/`csrf` may pin guard wiring — check before swapping the order).

## Kernel config / outbox / build / CI (design § C/E)

**Redaction / outbox / maintenance**
- `apps/api/src/shared/kernel/logging/log.redact.ts:6,26,36-70` + `log.redact.spec.ts`; importers `logger.factory.ts:7,20` (pino `redact`), `log.interceptor.ts:13,59,71`.
- `apps/api/src/shared/kernel/outbox/outbox.int-spec.ts` — cases `:212` (markPublished), `:260` (dead-letter after MAX_ATTEMPTS), `:410,441` (no listener → dead), `:477` (dead-letter idempotent replay), `:749` (purgePublished). **`apps/api/src/db/outbox-replay.int-spec.ts:8,66,86-87` replays `outbox_dead` rows** — after REM-16 a replayed row carries `[REDACTED]` under `link`/`token`: the replay spec must assert that (a redacted dead letter cannot be replayed into a working e-mail; replay is for non-secret events). Flag in the task and in design § Risks.
- `apps/api/src/shared/kernel/scheduling/maintenance-registry.spec.ts:74-83` asserts the kernel job list (`outbox.purge` `0 3 * * *`/1, `idempotency.purge` `15 3 * * *`/2) — add `outbox-dead.purge` (`45 3 * * *`/3); `:88-97` no duplicate lockId (generic). `maintenance-runtime.int-spec.ts` uses the two names as literals only. `docs/arch/back.md:132-136,162` describe the mechanism, no closed list.

**Env / config**
- `apps/api/src/shared/config/env.ts:5-7` (`NODE_ENV` default), `:18` (`DATABASE_SSL` default); `env.spec.ts:12` (NODE_ENV default), `:17` (TRUST_PROXY_HOPS default) — both flip to "required"/`0`; `BASE` fixture `:3-7` must add `NODE_ENV`, `DATABASE_SSL`.
- `connection-config.spec.ts:36-46` (ssl off/on); `redis.provider.ts` has **no spec** (`redis.module.spec.ts:23-32` only shutdown) — the `commandTimeout`/plaintext rule gets its own spec; `apps/api/src/docs/docs.ts` (`mountDocs`) has **no spec** and `apps/api/test/openapi-contract.e2e-spec.ts:8-10` states `/docs` cannot run under Jest (Scalar ESM) → REM-25 proves via a pure `shouldMountDocs(env)` unit + `main.ts` wiring; `apps/api/test/security-bootstrap.e2e-spec.ts:25,30` (helmet/CORS) is the e2e home for trust-proxy assertions.
- Non-test `NODE_ENV` readers: `load-dotenv.ts:4`, `transactional.decorator.ts:24`, `logger.factory.ts:16-17`, `log.interceptor.ts:39`.
- Env templates: `apps/api/.env.example:4,13,36,38,42`; `docker-compose.yml:59-64`; no `.env.test`. **`scripts/platform/lib/child.mjs:14-21` `CHILD_ENV_DEFAULTS` / `:25-29` `CONTRACT_ENV_DEFAULTS` carry no `NODE_ENV`/`DATABASE_SSL`/`TRUST_PROXY_HOPS`/`BREACH_CHECK_ENABLED`** — must gain them or `catalog:check`/`template:smoke` fail to boot the child. Jest setups `apps/api/test/setup/{unit-env,int-env,e2e-env}.ts` (e2e sets `NODE_ENV=test`, `DATABASE_URL`, `LOG_LEVEL`) need `DATABASE_SSL=disable`; identity's `identity.config.fixture.ts` needs `BREACH_CHECK_ENABLED`.
- Docs: `docs/dev/deploy.md.jinja:32,45,50-51,57,65,68,79-80,108-109,158`; `docs/dev/local-environment.md` mentions none of the vars.

**Idempotency / listing / content-disposition**
- `apps/api/src/shared/kernel/idempotency/{idempotency.interceptor.ts,idempotency.interceptor.spec.ts:66-95,idempotent.decorator.ts,idempotency.int-spec.ts}`.
- `apps/api/src/shared/kernel/listing/listing-query.schema.spec.ts:18,34,40`; `apps/api/src/shared/kernel/http/content-disposition.spec.ts`.

**Build / entrypoint / scripts / CI**
- `apps/api/nest-cli.json` (23 lines, builder `ignore` = four test globs); `apps/api/tsconfig.build.json` (8 lines); `apps/api/src/modules/module-boundaries.spec.ts:44-52` `isProductionFile`, RULE C `:513,588`.
- `apps/api/Dockerfile:52,59`; `apps/api/docker-entrypoint.sh:17,21,24,26`; `apps/api/docker-entrypoint.dev.sh:8,11` (`RUN_BACKFILL` too); `apps/api/package.json:16` `db:bootstrap` → `src/seeds/bootstrap-master.ts` (kernel-only tree has no such file — make it `src/modules/identity/seeds/bootstrap.ts` in the child docs, drop from the template).
- `pnpm test:scripts` = `node --test scripts/platform/__tests__/*.test.mjs` (root `package.json:29`); lint test `scripts/platform/__tests__/lint.test.mjs`. Entrypoint test → `scripts/platform/__tests__/docker-entrypoint.test.mjs`.
- **`scripts/platform/catalog-check.mjs` never invokes the lint** (only names `pnpm catalog:lint` in an error at `:124`); `catalog-lint.mjs:36-71` `lintEntry()` orchestrates `lib/lint.mjs` exports (`lintReadmeHeadings:40`, `lintChangelogVersion:52`, `lintWebImports:59`, `lintManifest:74`, `lintAdvisoryFrontmatter:84`, `discoverEntries:95`). REM-29 = new `lintProductionTestingImports` in `lib/lint.mjs` + call in `catalog-lint.mjs` + `catalog-check.mjs` runs the lint first.
- Workflows: `catalog.yml:15,18-19,69-71,83-85`, `ci.yml:20-22,36-38,51-53` (no `permissions:`); `feedback-triage.yml:13` (`permissions:`), `:28`, `:70`.
- `lefthook.yml` has only `pre-push`; the advisory rule runs in CI `catalog.yml` (`--range`) and wherever the local `commit-msg` hook is wired (`docs/catalog/catalog.md`) — verify before relying on it.

## Identity authz/input + tag/audit/notification (design § F)

**Authz**: `I/application/access-policy.ts:58` (`assertCanGrant`, called from `create-user`/`update-user` use cases only) + `access-policy.spec.ts:97,275,284,293,304,314,322` (removal cases) + `catalog/identity/single-tenant/parity/access-policy.parity.spec.ts`; `I/application/use-cases/update-user/update-user.use-case.ts` + `.spec.ts`; `.../create-user/create-user.use-case.ts` + `.spec.ts`; e2e `I/__e2e__/authz.e2e-spec.ts:102-123` (list users), `:190-304` (PUT `/admin/users/:id`), `create-user-flow.e2e-spec.ts:118-278`, `user-trash.e2e-spec.ts:69,99,139`.
**REM-31 — no imperative permission check exists in any use case**: enforcement is `@RequirePermission` (`apps/api/src/shared/kernel/access/decorators.ts:40`) read by `access.guard.ts:26`. The task creates `I/application/assert-permission.ts` (reads `IDENTITY_ACCESS` from ALS, throws `ForbiddenError`) + spec; `list-users.use-case.ts` + `.spec.ts` + `list-users.controller.ts:36`; tag: `catalog/tag/api/application/use-cases/list-tags/list-tags.use-case.ts` + `.spec.ts`, `catalog/tag/api/api/controllers/tags/list-tags.controller.ts`, `catalog/tag/api/__e2e__/tags.e2e-spec.ts` (tag has no own permission catalog — keys live in `I/domain/permissions/catalog/admin.catalog.ts:28,110`).
**Middleware / sessions**: `I/api/middleware/auth.middleware.ts` + `auth.middleware.spec.ts` (soft-deleted scenario `:265`; no int-spec); `I/application/require-auth.ts` (**no spec** — create one); `I/infrastructure/repositories/drizzle-session.repository.ts:47` `touch` (port `I/domain/ports/session.repository.ts:7`; `drizzle-session.repository.int-spec.ts` has no `touch` case); only `user-trash.e2e-spec.ts:80,95` mention deleted users.
**Email change**: `I/application/use-cases/request-email-change/request-email-change.use-case.ts` + `.spec.ts`; `I/domain/errors.ts:85` (`email-already-in-use`), `:93` (`EmailBelongsToDeletedUserError`); **`user-trash.e2e-spec.ts:104` asserts `/email-belongs-to-deleted-user$/`** → flips to `email-already-in-use`; `I/domain/entities/user.entity.ts:252` + `user.entity.spec.ts`; no web/docs references to either type.
**Contract / params**: `I/api/contracts/identity.contract.ts` — `email :16`, `permissionSetSchema :22`, `areaIdsSchema :31`, `serviceIdsSchema :32`, `token :49,59,180,220,228,252,264`, `name :64,108,145,163,182,192,257`, `listUsersQuerySchema :97-104`, per-DTO id arrays `:113-118,150-155,167-172`; `identity.contract.spec.ts:11-38` covers only auth schemas; `catalog/identity/single-tenant/parity/contract.parity.spec.ts:26` (34-operation freeze) and `:33` (openapi field parity) catch drift → update with the regen; controllers `I/api/controllers/admin/delete-user.controller.ts`, `admin/resend-access-link.controller.ts` (no e2e), `device/revoke-device.controller.ts` (`devices.e2e-spec.ts:122,142`); no controller-level specs exist in identity. Web consumers of the contract: `catalog/identity/single-tenant/web/core/{session.types.ts,route-access.ts}`. `pnpm contract` (root `package.json:12`, `apps/api/package.json:20`) regenerates `./openapi.json` (repo root) + `packages/api-client`.
**Audit**: `catalog/audit/api/api/contracts/audit.contract.ts` (consumer `audit.controller.ts`; no contract/controller spec; no web); e2e `catalog/audit/api/__e2e__/{audit,audit-product-extension}.e2e-spec.ts`; int-spec `catalog/audit/api/infrastructure/repositories/drizzle-audit.repository.int-spec.ts:86,114,126`.
**Notification**: `catalog/notification/api/application/catalog/notification-catalog.ts` + `notification-catalog.spec.ts:12-38`; identity `link` producers `create-user.use-case.ts:106,115`, `resend-access-link.use-case.ts:74,83`, `request-email-change.use-case.ts:163,169`, `request-password-reset.use-case.ts:95,101`, `resend-verification.use-case.ts:82,88` (only `resend-access-link` and `request-email-change` specs assert http(s) links — check the other three fixtures against the `protocol` refine); `catalog/notification/api/api/controllers/stream/sse.controller.ts` + `.spec.ts` (no SSE e2e; only `__e2e__/notifications-product-extension.e2e-spec.ts`); `notification.config.ts` + `.spec.ts`; `infrastructure/delivery/delivery.dispatcher.ts:48,178,238` + `delivery.dispatcher.spec.ts:12-19`; `module.json:3` version, `:13` env.
**Custom migrations**: `catalog/identity/single-tenant/migrations/custom/{01_auth_events_append_only,02_audit_attach}.sql`, `module.json:23`; generated into a child by `scripts/platform/lib/migrations.mjs:63-85`; filename check `scripts/platform/__tests__/catalog-custom-migrations.test.mjs:57-68`.
**Gate constraint (affects the Test Coverage Matrix):** the template never runs an entry's `int-spec`/`__e2e__` — `apps/api/test/jest-e2e.json` roots are `test`/`src`, `runGates` (`scripts/platform/lib/child.mjs:70-76`) runs `pnpm check` + `pnpm test` (unit) on the staged child, and `module add` runs `pnpm --filter api test -- modules/<name>` (unit). Entry int/e2e proofs therefore run **inside a staged child** (`pnpm catalog:typecheck --keep`-style staging, then `pnpm --filter api test:int|test:e2e -- <path>` there) — the Final gate and every `Full` task gate of an entry cluster must say so explicitly. Versions: `catalog/tag/module.json:3`, `catalog/audit/module.json:3` (`1.0.0`); CHANGELOG heads `:1-5`.

## Test commands and testing rules (for the Test Coverage Matrix)

- Guidelines: `docs/test/testing.md` (headings `:5` Principles, `:13` proof, `:24` pyramid, `:41` structure/naming, `:66` commands, `:115` unit, `:130` integration, `:156` e2e, `:189` parity, `:236` anti-patterns, `:246` where to create); `AGENTS.md.jinja:20,41,62-63`; `docs/code-quality.md:124-129` (single scope per commit, `feat`/`fix`/`refactor` never mixed).
- Rules: unit `*.spec.ts` and integration `*.int-spec.ts` beside the source; e2e `*.e2e-spec.ts` (kernel under `apps/api/test/`, entries under `api/__e2e__/` per AD-026); e2e boots the real `AppModule` with `@nestjs/testing` + `supertest`, fakes external IO with `.overrideProvider()`; no DB mocks in int/e2e; `domain/` ≥ 80 % coverage (`:115-122`).
- Runners (Jest): unit `pnpm --filter api test -- <path>` (`testRegex .*\.spec\.ts$`, `rootDir src`, setup `test/setup/unit-env.ts`); integration `pnpm --filter api test:int -- <path>` (`test/jest-integration.json`, `globalSetup test/setup/global-setup.ts`, `int-env.ts`); e2e `pnpm --filter api test:e2e -- <path>` (`test/jest-e2e.json`, roots `test` + `src`, `e2e-env.ts`). Scripts: `pnpm test:scripts` (`node --test scripts/platform/__tests__/*.test.mjs`).
- Gates: `pnpm --filter api typecheck` (`tsc --noEmit`), `pnpm --filter api lint`, `pnpm check` (`turbo lint typecheck`), `pnpm contract` (`api contract` + `@platform/api-client generate`), `pnpm catalog:lint`, `pnpm catalog:check`, `pnpm template:smoke`, `pnpm --filter api build` (`typecheck && nest build`), `cd apps/api && pnpm audit --prod --audit-level=high`. Pre-push: `db:check:journal`, `turbo typecheck`, `turbo test --filter=api`, `turbo test:cov --filter=web`.
