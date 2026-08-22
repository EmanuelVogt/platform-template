# Spike — audit evidence and repros (2026-08-22)

Post-verification findings. Each entry: location · what · repro. Read by Design and the Verifier only. Source: the audit's 8 discovery frontiers + 4 adversarial verifiers.

## High

### AUTH-1 (REM-01..03) — login has no per-account throttle
- `catalog/identity/single-tenant/api/application/use-cases/login/login.use-case.ts:41-42,76-80,104-131`; `api/controllers/auth/login.controller.ts:46`; `infrastructure/repositories/drizzle-user.repository.ts:560-592`.
- Both limits key on IP (`ip:<ip>:/auth/login` 30/60s; use-case `login:<ip>:<email>` 30/60s — composite, never aggregates across IPs). `registerFailedAttempt`/`isLocked`/`locked_until`/`account_locked` have zero production callers. No lockout env exists. `login.use-case.spec.ts:200-227` asserts wrong password does not increment lockout. Implicit ceiling: libuv threadpool 4.
- Repro: from N IPs, loop `POST /v1/auth/login` with `Origin: <WEB_ORIGIN>` against one e-mail; buckets never merge, no `account_locked` event.

### AUTH-2 (REM-05) — unauthenticated argon2 amplification
- `login.use-case.ts:66-68,96-101`; `identity.config.ts:55-57` (64 MiB × t=3); `apps/api/src/main.ts:49` (requestTimeout 30 min).
- Every login (incl. unknown e-mail) runs argon2 against `dummyHash`; only per-IP limit; no concurrency gate. ~20 IPs × 10 req/s saturate the 4 libuv threads → all password paths stall.

### AUTH-5 (REM-04) — rate limiter fail-open
- `catalog/identity/single-tenant/api/infrastructure/rate-limit/redis-rate-limiter.ts:52-59`; `apps/api/src/shared/infra/redis/redis.provider.ts:20-26` (`enableOfflineQueue:false`, `maxRetriesPerRequest:1`).
- On any Redis error → `{allowed:true}` + warn. Login has no DB-backed control, so a Redis outage removes 100% of login brute-force protection silently. forgot/resend/email-change keep DB cooldowns.

### UPLOAD-1 (REM-08/09) — batch upload trusts declared Content-Type → stored XSS (read)
- `catalog/attachment/api/application/use-cases/upload-attachments-batch/upload-attachments-batch.use-case.ts:59-66`; `api/controllers/multipart-files.ts:67-71`; `api/controllers/download-attachment.controller.ts:62-71`.
- `sniffImageContentType` only called from `upload-attachment.use-case.ts:47-52` (buffer/avatar path). Batch persists `info.mimeType`. Download serves stored type inline unless `accept==="any"`. `image` profile is `visibility:"authenticated"`. Requires product to call `AttachmentFacade.confirmUploads` (zero callers in repo) — latent.
- Repro: `POST /v1/attachments/uploads?profile=image` two parts (A `text/javascript`, B `text/html` with `<script src="/v1/attachments/A">`), confirm, lure logged-in victim to `/v1/attachments/B`. Helmet CSP `script-src 'self'` allows same-origin script; CsrfGuard blocks writes → impact = authenticated READ + phishing on api.<host>.

### UPLOAD-2 (REM-10..13) — download leaks R2 sockets → storage outage
- `download-attachment.controller.ts:46-52` (304 path), `:76` (`result.stream.pipe(res)`); `apps/api/src/shared/infra/storage/r2-storage.adapter.ts:20-30,43-48`; `get-attachment-for-download.use-case.ts:69-70`.
- Crash claim REFUTED (IncomingMessage suppresses error with 0 listeners). Confirmed: pipe doesn't destroy source on abort → R2 IncomingMessage stuck in keep-alive agent (`maxSockets=50` SDK default, no requestTimeout). WORSE: 304 path calls `execute()` which already opened `getStream` (use-case:70) and returns without consuming. Access log `allowed` written before bytes fetched.
- Repro: `GET /v1/attachments/<id>` once for the ETag; then 50× with `If-None-Match` → 51st storage op (download/putStream/head/delete) blocks.

## Medium

### AUTH-3 (REM-16/17) — raw tokens in `_kernel.outbox.payload`
- `request-password-reset.use-case.ts:95-103`, `create-user.use-case.ts:106-119`, `resend-access-link.use-case.ts:74-87`, `resend-verification.use-case.ts:82-89`, `request-email-change.use-case.ts:163-171` → `apps/api/src/shared/kernel/outbox/outbox.publisher.ts:44,53`; `outbox.dispatcher.ts:38,94-103,212-215,260-278`.
- `link` with raw token in jsonb payload; nothing scrubs after publish; `purgePublished` only after 30 days; no purge for `outbox_dead`. `delivery.dispatcher.ts:47-52` redacts downstream with comment "token/link nunca fica em repouso" — defeated upstream. Access link TTL 7 days.
- Repro: admin creates user → `SELECT payload->'payload'->>'link' FROM _kernel.outbox` → set password.

### AUTH-4 (REM-07) — HIBP never queried in fail_open
- `reset-password.use-case.ts:82-88`, `set-password.use-case.ts:100-104`, `change-password.use-case.ts:97-103` (only callers of `isBreached`, all inside `if (MODE==="fail_closed")`); `identity.module.ts:132-139`; `hibp-breach-check.ts:34-37` (adapter already applies mode on error). AUTH-13: `hibp-breach-check.ts:22-37` fetch has no AbortSignal.
- `module.json:38-42` documents MODE as "what to do when the lookup fails"; both test envs pin fail_open.

### AUTHZ-1 (REM-19) — professional scope self-assignable
- `update-user.use-case.ts:56-67` (self-edit guard compares only accessProfile + permissions); `access-policy.ts:82` (assertCanGrant only permissions); `identity.contract.ts:162-173`; `NullProfessionalScope` accepts anything; same path in `create-user.use-case.ts:89-91`.
- Latent: in template nothing consumes scope tables as an authz gate; real in a product whose scheduling module treats scope as row-level authz.

### AUTHZ-3 (REM-18) — assertCanGrant ignores removals
- `access-policy.ts:58-68` (only `added` checked); `update-user.use-case.ts:52-67`; `access-policy.spec.ts:311` asserts removal passes deliberately. Actor can also set target `accessProfile:"professional"` + `permissions:[]` (professional has no floor) → full de-privilege of any non-master admin.

### UPLOAD-3 (REM-14) — no rate limit / quota on batch upload
- `upload-attachments.controller.ts:38-59` (only `@SelfService`); `rate-limit.guard.ts:41-47` (no-op without metadata); `upload-profiles.ts:97-103` (multi 500 MB); `purge-pending-attachments.job.ts:20-26` (24h + daily cron). Batch capped at maxTotalBytes 500 MB; multiplier is concurrency; ~16-24 MB RSS per in-flight file (`partSize 8MB × queueSize 2`).

### UPLOAD-4 (REM-15) — busboy without `limits`
- `multipart-files.ts:9-17,63-66`; busboy 1.6 defaults `Infinity` for fileSize/files/fields/parts (`multipart.js:254-265`). Part with fieldname ≠ `file` is `resume()`d with no accounting; ceiling is 30-min requestTimeout.

### SUPPLY-1 (REM-26..29) — test harness + master credential in image; bootstrap path broken
- `scripts/platform/lib/plan.mjs:88-91` (unfiltered copy); `nest-cli.json:14-19` (swc `ignore` only *.spec/*.int-spec/*.e2e-spec/*.fixture — tsconfig.build exclude irrelevant to emit); `catalog/identity/single-tenant/api/testing/seeds/master-user.seed.ts:11-12` (`admin@example.com` / `Trocar-Esta-Senha-No-1o-Login!2026`); `Dockerfile:48`.
- minimatch proof: master-user.seed.ts, run.ts, bootstrap-master.ts, allow-all-rate-limiter.ts, fake-mailer.ts all EMITTED to `dist/modules/identity/testing/**`. Password inert (run.ts:22-27 refuses NODE_ENV≠dev/test; Dockerfile:36 pins production) but readable + `dist/.../seeds/run.js` is a ready master-escalation tool.
- Secondary: `docker-entrypoint.sh:17` `node dist/seeds/bootstrap-master` + `package.json:15-16` `src/seeds/*` + `deploy.md.jinja:50,158` — installer places at `src/modules/identity/testing/seeds/` → with MASTER_* set and `set -e`, container fails to boot (MODULE_NOT_FOUND). Same for `docker-entrypoint.sh:26` `dist/legacy-import/run` with RUN_BACKFILL=true.

### AUTH-6 / KERNEL-2 (REM-24) — TRUST_PROXY_HOPS default 1 wrong both ways
- `apps/api/src/shared/config/env.ts:54`; `main.ts:27`; consumed at `request-context.middleware.ts:54` → `rate-limit.guard.ts:53`, `login.use-case.ts:77`, `auth-event.factory.ts:28`, `create-session.service.ts:82`.
- Documented topology Cloudflare → Traefik = 2 hops (`deploy.md.jinja:5`): with 1, `req.ip` = edge → all users share buckets (self-DoS on forgot-password 3/min), wrong IP in auth_events/sessions/new-device email. Without a proxy: XFF controls req.ip.

## Low (in scope)

- AUTHZ-2 (REM-31): `list-users.controller.ts:36`, `list-tags.controller.ts:34`, `identity.contract.ts:101` — `trash.read` defined in `admin.catalog.ts:28,110` but never enforced; `?deleted=true` needs only `*.read`. Stale "MasterGuard" comment `list-users.use-case.ts:16`.
- KERNEL-1/INPUT-6 (REM-32): `idempotency.interceptor.ts:102` scope `_:_` for anonymous; `idempotent.decorator.ts:31` maxLength:200 doc-only, `interceptor.ts:81` uses raw.
- KERNEL-6 (REM-33): `listing-query.schema.ts:13` `page` no `.max()`.
- INPUT-5 (REM-34): `identity.contract.ts:16` email/token/name no `.max()`.
- INPUT-4 (REM-35): `delete-user.controller.ts:18`, `resend-access-link.controller.ts:18`, `revoke-device.controller.ts:18` plain `@Param("id") id: string`.
- INPUT-3 (REM-36): `identity.contract.ts:22-24,31-32` id arrays not deduped → composite PK 23505 → 500.
- INPUT-7/8 (REM-37): `audit.contract.ts:19-20` from/to `z.string().min(1)` → `new Date(invalid)` → 500 (`drizzle-audit.repository.ts:81-86`); `txId` coerce no max.
- NOTIF-2 (REM-38): `notification-catalog.ts:51,56,61,77` `link: z.url()` any scheme; `button.hbs:4` `{{{link}}}`.
- SUPPLY-4/5 (REM-39): `multer@2.1.1` (GHSA-72gw-mp4g-v24j applies, limits.fields unset; GHSA-3p4h-7m6x-2hcm does NOT apply — memoryStorage). `@opentelemetry/core`<2.8.0, `propagator-jaeger`<2.9.0, `js-yaml` via `@nestjs/swagger`, `body-parser`<2.3.0, `nanoid` via `@scalar`. `pnpm-audit-prod.json` in the 2026-08-22 scratchpad.
- DB-2/AUTHZ-4 (REM-40): `02_audit_attach.sql:19-22` token_hash/cookie_token_hash unredacted (password_hash is redacted). New custom migration to add them.
- UPLOAD-9/DB-5 (REM-41): `purge-pending-attachments.job.ts:47-64` deleteByIds no status re-check; `confirm-uploads.use-case.ts:39-48` findByIds before maxFiles.
- UPLOAD-10 (REM-42): `content-disposition.ts:6-10` encodeURIComponent leaves `'()*`; no ASCII fallback (CR/LF/quote already stripped — no injection).
- AUTHZ-8 (REM-43): `auth.middleware.ts:122-153` sets actor regardless of deleted; `require-auth.ts:20-31` doesn't check. API path closed (DeleteUser revokes sessions).
- AUTH-10 (REM-44): `request-email-change.use-case.ts:95-110,144` two 409 types + cooldown only on success.
- AUTH-9 (REM-45): `auth.middleware.ts:89-109` touch on every request ignoring `SESSION_TOUCH_INTERVAL_SECONDS`. (Only the touch throttle is in scope; expires_at/rememberMe deferred.)
- NOTIF-1 (REM-46): `sse.controller.ts:26-34`, `csrf.guard.ts:22,40-42` GET exempt; only exploitable with `COOKIE_SAMESITE=none`; login oracle REFUTED. Add unconditional `Origin` check on the stream route.
- SUPPLY-6/7 + KERNEL-7 (REM-47): `feedback-triage.yml:70-97` `anthropics/claude-code-action@v1` unpinned + `issues:write`; `ci.yml`/`catalog.yml` no `permissions:`; `openapi-config.ts:28-29` claims CSRF as kernel guarantee.

## Refuted / out of scope (do not implement)
- UPLOAD-6: `legacy` inline served, but no code path produces a `legacy` row (entity always sets profile). Covered defensively by REM-09 (allowlist), no separate task.
- Crash-on-stream-error (UPLOAD-2 half): refuted empirically; REM-12 still destroys the socket for correctness.
- Login oracle via SSE (NOTIF-1 half): refuted; REM-46 is the nuisance-eviction fix only.
- DB-1 (append-only trigger bypass): needs arbitrary SQL already; separate DB-role spec.

## Adjacent operational bugs (fold into REM-27 where they share a file)
- `docker-entrypoint.sh:26` `dist/legacy-import/run` dead path (RUN_BACKFILL boot failure).
- `notification.config.ts:6` NODE_ENV enum lacks `staging` → REM-30.
- `identity.module.ts:261-262` RateLimitGuard before CsrfGuard → REM-06.
- `log.redact.ts:26,44,65-73` exact-match key redaction misses newPassword/currentPassword/newEmail/pendingEmail → REM-20.
- `connection-config.ts:14-15` no `ca`/`servername` → REM-23.
