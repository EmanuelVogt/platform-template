# security-audit-remediation Validation

**Date**: 2026-08-23
**Spec**: `.specs/features/security-audit-remediation/spec.md`
**Diff range**: `77d2a05..ff8c6db` (branch `feat/security-audit-remediation`, worktree `.worktrees/security-audit-remediation`; includes merges `aeedbfd` and `ff8c6db` of `main`)
**Verifier**: independent sub-agent (author ≠ verifier)

AC ↔ requirement map re-derived from `spec.md` alone: P1 Login AC1–7 = REM-01..07 · P1 Attach AC1–8 = REM-08..15 · P2 Secrets AC1–5 = REM-16..20 · P2 Config AC1–10 = REM-21..30 · P3 AC1–17 = REM-31..47 · P1 Port AC1–5 = REM-48..51 (REM-51 covers ACs 4–5). Proof kinds taken from the traceability `Proof` column: 44 `test`, 4 `gate`, 3 `probe`.

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| REM-01 11th failed login/900 s | 429 + `Retry-After`, no `hasher.verify`, auth event | `login.use-case.spec.ts:181-187` — `expect(t.rateLimiter.consume).toHaveBeenNthCalledWith(1, ACCOUNT_KEY, 10, 900, { critical: true })`; `:178-179` — `expect(error).toMatchObject({ status: 429, retryAfterSeconds: 42 })`; `:189` — `expect(t.hasher.verify).not.toHaveBeenCalled()`; `:190-198` auth event `eventType: "rate_limited_burst"`, `metadata: { retryAfterSeconds: 42, scope: "account" }`; header at `problem-details.filter.spec.ts:172-174` — `expect(r.headers["Retry-After"]).toBe("30")` | ✅ PASS |
| REM-02 unknown e-mail | identical 429 to an existing e-mail | `login.use-case.spec.ts:223-225` — `expect(await errorOf(unknown, "nao-existe@example.com")).toEqual(await errorOf(known, "ana@example.com"))`; `:226` — `expect(unknown.users.findByEmail).not.toHaveBeenCalled()` | ✅ PASS |
| REM-03 login succeeds | clears the e-mail bucket | `login.use-case.spec.ts:247` — `expect(t.rateLimiter.reset).toHaveBeenCalledWith(ACCOUNT_KEY)`; `:261` negative control on a failed login | ✅ PASS |
| REM-04 Redis unreachable | critical keys enforced in-memory, same limits; non-critical fail open; 1 warn + 1 auth event | `resilient-rate-limiter.spec.ts:74-75` — `expect(results.map((r) => r.allowed)).toEqual([true, true, false])`, `expect(results[2]?.retryAfterSeconds).toBe(900)`; `:82-91` — `expect(fallback.trackedKeys).toBe(0)`; `:101-103` — `expect(warns).toHaveLength(1)`, `expect(emitted[0]?.name).toBe("rate-limiter.degraded")`; `rate-limiter-outage.listener.spec.ts:91` — `expect(t.authEvents.record).toHaveBeenCalledTimes(1)` | ✅ PASS |
| REM-05 hash pool saturated | 503 + `Retry-After` before hashing; dummy verify kept | `bounded-password-hasher.spec.ts:41-43` — `expect(error).toMatchObject({ status: 503, retryAfterSeconds: 2 })`, `expect(inner.hash).toHaveBeenCalledTimes(8)`; `:54-57` — `await expect(hasher.verify("senha", "hash-dummy")).rejects.toBeInstanceOf(PasswordHashingSaturatedError)` | ✅ PASS |
| REM-06 Origin check fails | no rate-limit bucket consumed | `identity/.../__e2e__/auth-csrf-none.e2e-spec.ts:203` — `expect(consumed).toEqual([])` after 3× 403; `:209` — `expect(consumed).toHaveLength(3)` on the allowed-origin control; order at `parity/csrf.parity.spec.ts:154-156` — `expect(appGuards).toEqual([CsrfGuard, RateLimitGuard])` | ✅ PASS |
| REM-07 `BREACH_CHECK_ENABLED=true` | HIBP queried regardless of mode; `breach_check_skipped` under `fail_open`; 2 s abort | `change-password.use-case.spec.ts:234` — `expect(t.breach.check).toHaveBeenCalledWith(VALID_INPUT.newPassword)`; `:249-256` auth event `eventType: "breach_check_skipped"`, `metadata: { mode: "fail_open" }`; `breach-check.spec.ts:113-115` — `expect(verdict).toBe("skipped")`, `expect(elapsed).toBeGreaterThanOrEqual(1900)`, `expect(elapsed).toBeLessThan(2600)` | ✅ PASS |
| REM-08 batch sniff | sniff every part; 415 when null **or differing**; persist sniffed type | `upload-attachments-batch.use-case.spec.ts:310` — `.rejects.toBeInstanceOf(UnsupportedMediaTypeError)`; `:326` 2nd-of-2 spoofed → whole batch rejected; `:294` — `expect(inserted[0]?.props.contentType).toBe("image/png")`; HTTP `attachment-upload.e2e-spec.ts:137` — `.expect(415)` | ⚠️ PASS, weak — the "differs from the declared type" branch is not discriminated (mutant 2 survived) |
| REM-09 non-allowlisted `content_type` | `octet-stream` + `attachment` + `nosniff`, every profile | `attachment-download.e2e-spec.ts:275` — `expect(res.headers["content-type"]).toBe("application/octet-stream")`; `:276` `content-disposition: attachment; filename="log.txt"`; `:279` — `expect(res.headers["x-content-type-options"]).toBe("nosniff")` | ⚠️ PASS, partial — only the default `legacy` profile is exercised; "every profile" is structural (`download-attachment.controller.ts:65` ignores profile) |
| REM-10 client aborts mid-body | storage stream destroyed, socket returned | `attachment-download.e2e-spec.ts:538` — `expect(slowStream?.destroyed).toBe(true)` | ⚠️ PASS, partial — "socket returned to the pool" not asserted |
| REM-11 `If-None-Match` matches | 304, no storage stream left open | `attachment-download.e2e-spec.ts:439` — `.expect(304)`; `:441` — `expect(getStreamCallCount()).toBe(callsAfterFirst)` (no additional storage stream opened) | ✅ PASS |
| REM-12 stream errors after headers | destroy the response socket, log, process stays up | no evidence — `download-attachment.controller.ts:78-91` logs `attachment.download_stream_failed` and returns (teardown delegated to `pipeline`); no spec/e2e references that log key or asserts socket destruction | ❌ NOT COVERED |
| REM-13 storage client timeout | explicit `STORAGE_REQUEST_TIMEOUT_MS`, default 30 000 | `storage.config.spec.ts:31` — `expect(cfg.STORAGE_REQUEST_TIMEOUT_MS).toBe(30_000)`; `r2-storage.adapter.spec.ts:59-75` (line 68) — `requestTimeout: cfg.STORAGE_REQUEST_TIMEOUT_MS` inside `expect(S3ClientMock).toHaveBeenCalledWith({…})` | ✅ PASS |
| REM-14 upload quotas | 429 (20/60 s per IP) / 413 (pending-bytes quota) / 503 (in-flight cap), before reading the body | no evidence — only the config defaults are asserted (`attachment.config.spec.ts:12` `expect(c.ATTACHMENT_PENDING_QUOTA_BYTES).toBe(2_147_483_648)`, `:13` `…MAX_CONCURRENT_UPLOADS).toBe(16)`). No 429/413/503 assertion exists anywhere under `catalog/attachment`; `UploadsSaturatedError` (`errors.ts:68`), `PendingQuotaExceededError` (`errors.ts:79`) and `@RateLimit({ limit: 20, windowSeconds: 60 })` (`upload-attachments.controller.ts:72`) are referenced by no test | ❌ NOT COVERED |
| REM-15 busboy limits | `fileSize`, `files`, `parts`, `fields`, `fieldSize`; limit → 413/400; non-`file` part destroyed → 400 | `multipart-files.spec.ts:157` — `.rejects.toBeInstanceOf(PayloadTooLargeError)` (fileSize); `:184` same (files); `:147` — `.rejects.toBeInstanceOf(InvalidMultipartRequestError)` (fields); `:135` — `.rejects.toBeInstanceOf(UnexpectedMultipartFieldError)` (non-`file` part, 400) | ⚠️ PARTIAL — `fieldSize` is absent from the limits object (`multipart-files.ts:50-55`), so neither implemented nor tested; `parts` untested; "part destroyed" state not asserted |
| REM-16 outbox published/dead-lettered | no clear value under a redacted key | `outbox.int-spec.ts:826` — `expect(stored.link).toBe("[REDACTED]")`; `:901` — `expect(stored.token).toBe("[REDACTED]")` (dead-letter) | ✅ PASS |
| REM-17 `outbox_dead` retention | registered job `outbox-dead.purge` deletes old rows | `maintenance-registry.spec.ts:85-88` — `expect(maintenanceRegistry.require("outbox-dead.purge")).toEqual({ cron: "45 3 * * *", lockId: 6 })`; effect `outbox.int-spec.ts:936` — `expect(remaining).toEqual(["dead-new"])`; wiring `outbox.dispatcher.ts:107` `@MaintenanceJob("outbox-dead.purge")` | ✅ PASS — `lockId: 6` confirmed (design § C correction, no collision with 3) |
| REM-18 permission delta | 403 `permission-grant-not-allowed`, master exempt | `access-policy.spec.ts:357` — `expect(() => …).toThrow(PermissionGrantNotAllowedError)`; `:279` — `expect(() => …).not.toThrow()` for `isMaster: true` | ✅ PASS |
| REM-19 self-edit scope fields | 403 with the existing self-edit error | `update-user.use-case.spec.ts:443,460,477,486` — `.rejects.toThrow(ForbiddenError)` for `servesClients`/`areaIds`/`serviceIds`/`schedulingAreaIds` | ⚠️ PASS, partial — asserts the base `ForbiddenError` (→ 403), not the `SelfEditError` subclass (`update-user.use-case.ts:33`, unexported) |
| REM-20 substring redaction | `newPassword`, `currentPassword`, `newEmail`, `pendingEmail` redacted | `log.redact.spec.ts:169` — `expect(redactValue({ [key]: "valor-cru" })).toEqual({ [key]: "[REDACTED]" })` over `it.each([...])` at `:163-167`; `sensitive-keys.spec.ts:42-45` — `expect(isSensitiveKey("newPassword", fragments)).toBe(true)` (and the other three) | ✅ PASS |
| REM-21 required env | Zod error naming `NODE_ENV` / `DATABASE_SSL` / `BREACH_CHECK_ENABLED` | `env.spec.ts:29` — `expect(() => parseEnv(semNodeEnv)).toThrow(/NODE_ENV/)`; `:34` — `toThrow(/DATABASE_SSL/)`; `identity.config.spec.ts:98-99` — `toThrow(/BREACH_CHECK_ENABLED/)` | ✅ PASS |
| REM-22 prod plaintext Redis | boot fails without `REDIS_ALLOW_PLAINTEXT=true` | `env.spec.ts:48-50` — `expect(() => parseEnv({ ...BASE, NODE_ENV: "production", DOCS_ENABLED: "true" })).toThrow(/REDIS_URL/)`; `:60` — `expect(e.REDIS_URL).toBe(BASE.REDIS_URL)` with the opt-in | ✅ PASS |
| REM-23 `DATABASE_SSL_CA` | trusted CA + `rejectUnauthorized: true` | `connection-config.spec.ts:60-63` — `expect(config.ssl).toEqual({ rejectUnauthorized: true, ca: "-----BEGIN CERT-----\nAAA\n-----END CERT-----" })` | ✅ PASS |
| REM-24 `TRUST_PROXY_HOPS` unset | `req.ip` = socket address, XFF ignored | `apps/api/test/security-bootstrap.e2e-spec.ts:60-61` — `expect(res.body.ip).not.toBe("203.0.113.7")`, `expect(res.body.ip).toMatch(/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/)` | ✅ PASS |
| REM-25 prod `/docs` | 404 unless `DOCS_ENABLED=true` | `docs.spec.ts:8-9` — `expect(shouldMountDocs({ NODE_ENV: "production", DOCS_ENABLED: false })).toBe(false)`; `:13-15` — `.toBe(true)` for the opt-in | ⚠️ PASS, partial — the pure predicate is asserted; no e2e asserts the HTTP 404 the AC states |
| REM-26 build has no harness (probe) | `dist/` free of `testing/`, `__e2e__/`, `parity/` | probe run by the Verifier: `pnpm --filter api build` exit 0; `find apps/api/dist \( -path '*/testing/*' -o -path '*/__e2e__/*' -o -path '*/parity/*' \)` → empty (108 emitted `.js`). Log `scratchpad/probe-rem26.log` | ✅ PASS |
| REM-27 entrypoint bootstrap glob | runs every `dist/modules/*/seeds/bootstrap.js`; proceeds without the vars; `legacy-import` removed | `scripts/platform/__tests__/docker-entrypoint.test.mjs:55` — `assert.deepEqual(invoked, [path.join(distDir, "modules", "identity", "seeds", "bootstrap.js")])`; `:67` — `assert.deepEqual(invoked, [])` | ⚠️ PASS, partial — the `legacy-import` removal is true by grep (no occurrence in `scripts/`, `apps/api/`, `catalog/`) but has no regression test |
| REM-28 dev seed has no literal password | reads `SEED_MASTER_PASSWORD` or prints a generated one | no evidence — implementation at `catalog/identity/single-tenant/api/testing/seeds/master-user.seed.ts:18-24,31-35`; no spec anywhere references `masterUserSeed`, `resolveMasterPassword` or `SEED_MASTER_PASSWORD`. The `Proof` column declares `test` | ❌ NOT COVERED |
| REM-29 `catalog-check` testing import | entry importing `api/testing/**` from production code fails | `scripts/platform/__tests__/lint.test.mjs:243-246` — `assert.equal(errors.length, 1)`, `assert.match(errors[0], /testing\/helper/)` | ✅ PASS |
| REM-30 notification `NODE_ENV=staging` | accepted | `notification.config.spec.ts:33` — `expect(parseNotificationConfig({ NODE_ENV: "staging" }).NODE_ENV).toBe("staging")` | ✅ PASS |
| REM-31 trash listings | 403 without `admin.{users,tags}.trash.read` | `identity/.../__e2e__/user-trash.e2e-spec.ts:237` — `.expect(403)`; `catalog/tag/api/__e2e__/tags.e2e-spec.ts:140` — `.expect(403)` | ✅ PASS |
| REM-32 anonymous idempotency | scope includes the client IP; bad key → 400 | `idempotency.interceptor.spec.ts:230-232` — `expect(reserved.map((r) => r.scope)).toEqual(["t-1:ip:203.0.113.7", "t-1:ip:198.51.100.4"])`; `:676` — `expect((error as HttpException).getStatus()).toBe(400)` | ✅ PASS |
| REM-33 `page` > 10 000 | 400 | `listing-query.schema.spec.ts:50` — `expect(baseListingQuerySchema.safeParse({ page: "10001" }).success).toBe(false)` | ✅ PASS |
| REM-34 field length caps | email 254 / token 128 / name 200 → 400 | `identity.contract.spec.ts:66` (email 255), `:78` (token 129), `:88` (name 201) — each `).toThrow()` | ✅ PASS |
| REM-35 id params DTO | `min(1).max(64)` on three routes | `identity.contract.spec.ts:134-135` — `expect(() => idParamSchema.parse({ id: "" })).toThrow()`, `… parse({ id: rep("x", 65) })).toThrow()`; wired at `delete-user.controller.ts:19`, `resend-access-link.controller.ts:19`, `revoke-device.controller.ts:19`; HTTP proof `devices.e2e-spec.ts:143` — `.expect(400)` | ✅ PASS |
| REM-36 duplicate id arrays | 400 | `identity.contract.spec.ts:104,110,113,119` — `).toThrow()` for `permissions`/`areaIds`/`serviceIds`/`schedulingAreaIds` | ✅ PASS |
| REM-37 audit query bounds | non-ISO `from`/`to` and oversized `txId` → 400 | `audit.contract.spec.ts:21,22` — `expect(listAuditEntriesQuerySchema.safeParse({ from: "2026-01-01" }).success).toBe(false)` (and `to`); `:34` — `txId: Number.MAX_SAFE_INTEGER + 1` → `false` | ✅ PASS |
| REM-38 catalog `link` scheme | non-http(s) fails validation | `notification-catalog.spec.ts:42-43` — `link: "javascript:alert(1)"` → `.toBe(false)`; `:45-47` — `data:text/html,…` → `.toBe(false)` | ✅ PASS |
| REM-39 dependency audit (gate) | `cd apps/api && pnpm audit --prod --audit-level=high` exits 0 | gate **exit 1**. Residue is exactly the chain `spec.md` § Out of Scope excludes: `packages__api-client>axios` — GHSA-gcfj-64vw-6mp9 (axios) and GHSA-hmw2-7cc7-3qxx (form-data, via `api-client>axios>form-data`). No backend dependency is flagged. `multer` half of the AC holds: `apps/api/package.json:56` `"multer": "^2.2.0"`, `limits.fields` set on both avatar interceptors | ⚠️ Spec-precision gap — the spec contradicts itself (Out of Scope excludes the chain; Success Criteria #2 + this `Proof` demand exit 0) |
| REM-40 audit-trail hash redaction | `sessions.token_hash`, `devices.cookie_token_hash`, `verification_tokens.token_hash` redacted | no evidence — migration exists (`catalog/identity/single-tenant/migrations/custom/03_audit_redact_token_hashes.sql:19-21`, `audit.attach('identity','sessions','{id}','{token_hash}')` …) but the only trail-content assertion is `catalog/audit/api/infrastructure/trail/audit-trigger.int-spec.ts:144` — `expect((row!.row_new as { password_hash: string }).password_hash).toBe("[REDACTED]")`, i.e. `identity.users.password_hash`, none of the three required columns | ❌ NOT COVERED |
| REM-41 purge / confirm bounds | delete carries `status = 'pending'`; over-`maxFiles` rejects before querying | `drizzle-attachment.repository.ts:105` — `.where(and(inArray(attachments.id, ids), eq(attachments.status, "pending")))`, proved by `drizzle-attachment.repository.int-spec.ts:196` — `expect((await repo.findById(turnedReady.props.id))?.props.status).toBe("ready")`; `confirm-uploads.use-case.spec.ts:141` — `.rejects.toBeInstanceOf(UploadQuotaExceededError)` + `:143` — `expect(repo.findByIds).not.toHaveBeenCalled()` | ✅ PASS |
| REM-42 `Content-Disposition` | `'`, `(`, `)`, `*` percent-encoded; ASCII fallback first | `content-disposition.spec.ts:25-27` — `expect(buildContentDisposition("a'b(c)d*e.txt")).toBe("attachment; filename=\"a'b(c)d*e.txt\"; filename*=UTF-8''a%27b%28c%29d%2Ae.txt")` | ✅ PASS |
| REM-43 soft-deleted user, live session | `requireAuth` throws 403 | `auth.middleware.spec.ts:299` — test "usuário excluído com sessão viva não publica NADA e perde o cookie" (`deleted: true`, `:304`); `require-auth.spec.ts:71` — `expect((caught as ForbiddenError).status).toBe(403)` | ✅ PASS |
| REM-44 e-mail change in use | cooldown still recorded; same 409 `type` both cases | `request-email-change.use-case.spec.ts:347` — `.rejects.toBeInstanceOf(EmailAlreadyInUseError)`, `:350` — `expect(saved.props.lastEmailChangeRequestedAt).toEqual(NOW)`; `:370`/`:372` deleted-owner case, same type + cooldown | ✅ PASS |
| REM-45 session touch throttle | no `UPDATE` below the interval | `auth.middleware.spec.ts:222` — `expect(sessions.touch).not.toHaveBeenCalled()` | ✅ PASS |
| REM-46 SSE `Origin` | 403 when not `WEB_ORIGIN` | `sse.controller.spec.ts:69-72` — `expect(() => new SseController(registry, ctx).stream(req)).toThrow(expect.objectContaining({ status: 403 }))` | ✅ PASS |
| REM-47 CI hardening (probe) | actions SHA-pinned, every workflow declares `permissions:` | probe run by the Verifier — both greps empty (exit 1 each). Log `scratchpad/probe-rem47.log` | ✅ PASS |
| REM-48 no Jest artifact (probe) | no `jest.`/`@jest/globals`/`ts-jest`, no `jest-*.json`, no `test*` script | probe run by the Verifier — grep over `apps/api/src`, `apps/api/test`, `catalog` empty; `ls apps/api/test/jest-*.json` → no matches; the `grep -n '"test' apps/api/package.json` arm returns `:22` (the `format` glob `"test/**/*.ts"`) and `:88` (devDependency `"testcontainers"`) — neither is a script key, and the scripts block (`apps/api/package.json:5-23`) has none. Log `scratchpad/probe-rem48.log` | ✅ PASS (probe expression imprecise, AC outcome verified directly) |
| REM-49 runner tiers (gate) | `pnpm test && pnpm test:int && pnpm test:e2e` exit 0, no test lost | all exit 0 — 89/585, 10/123, 4/14 | ✅ PASS |
| REM-50 entry proofs (gate) | `pnpm catalog:check` green | exit 0 — `catalog:check — OK: notification, identity/single-tenant, tag, audit, attachment` | ✅ PASS |
| REM-51 coverage + scripts (gate) | `pnpm test:coverage` floors hold, `pnpm test:scripts` green, probes REM-26/47 empty | both exit 0; coverage 96.61 % stmt / 94.25 % br / 95.27 % fn / 96.91 % lines, no threshold failure; both probes empty | ✅ PASS |

**Status**: ❌ Gaps present — 45/51 fully matched the spec outcome, 4 not covered (REM-12, REM-14, REM-28, REM-40), 1 partial (REM-15), 1 spec-precision gap (REM-39). Six further criteria pass with a narrower proof than the AC states (REM-08, REM-09, REM-10, REM-19, REM-25, REM-27).

---

## Discrimination Sensor

| Mutation | File:line | Description | Scoped gate | Killed? |
| --- | --- | --- | --- | --- |
| 1 | `catalog/identity/single-tenant/api/application/use-cases/login/login.use-case.ts:85` | `if (!account.allowed)` → `if (!account.allowed && false)` — account bucket never denies | `pnpm catalog:check identity` (exit 7) | ✅ Killed — 3 tests (`login.use-case.spec.ts`: 429-before-lookup, unknown-e-mail parity, both-buckets edge case) |
| 2 | `catalog/attachment/api/application/use-cases/upload-attachments-batch/upload-attachments-batch.use-case.ts:67` | `if (sniffed === null \|\| sniffed !== file.contentType)` → `if (sniffed === null)` — drop the declared-type mismatch rejection | `pnpm catalog:check attachment` (exit 0) | ❌ **Survived** → fix task |
| 3 | `apps/api/src/shared/kernel/redaction/sensitive-keys.ts:17` | `lowerKey.includes(fragment)` → `lowerKey === fragment` — substring match becomes exact | `pnpm vitest run --project api src/shared/kernel/{redaction,logging,outbox}` (exit 1) | ✅ Killed — 9 tests in 2 files |
| 4 | `catalog/identity/single-tenant/api/application/access-policy.ts:73-76` | removed the revocation half of the symmetric difference | `pnpm catalog:check identity` (exit 7) | ✅ Killed — 5 tests across `access-policy.spec.ts`, `access-policy.parity.spec.ts`, `update-user.use-case.spec.ts` |
| 5 | `apps/api/src/shared/config/env.ts:24` | re-added `.default("require")` to `DATABASE_SSL` — fail-closed becomes fail-open | `pnpm vitest run --project api src/shared/config` (exit 1) | ✅ Killed — 1 test |

Each mutant was injected once into the real file, the scoped gate run once with the log on disk (`scratchpad/mut{1c,2,3,4,5}.log`), then restored with `git checkout -- <file>` and `git status --short -- <file>` confirmed empty. Tree verified clean after mutant 5.

**Sensor depth**: P0-full (5 mutants, spread across rate-limit/login, attachment upload, redaction, identity authz, env fail-closed)
**Result**: 4/5 killed — ❌ FAIL (mutant 2)

Mutant 2 is the same weakness the coverage table flags on REM-08: every batch-upload test feeds bytes that sniff to `null` (HTML), so the `sniffed !== file.contentType` branch — real image bytes declared as a different image type — is never exercised. The stored-XSS defence is one condition wider than the tests can see.

---

## Edge Cases

- [x] Account and IP buckets both deny → account 429 returned first — `login.use-case.spec.ts`, test "os dois buckets negando devolve o 429 da conta (edge case)" (killed by mutant 1).
- [x] Payload with no redacted key → `markPublished` leaves it untouched — `outbox.int-spec.ts:863-864` — `expect(JSON.stringify(after[0]?.payload)).toBe(JSON.stringify(before[0]?.payload))`.
- [x] Master actor → delta/self-scope rules do not apply — `access-policy.spec.ts:279`.
- [x] `DOCS_ENABLED=true` in production → `/docs` served — `docs.spec.ts:13-15`.
- [x] Storage client without a free socket → the download suite runs 50 `If-None-Match` requests against a fake storage with `maxSockets: 2` and asserts the 51st still responds (`attachment-download.e2e-spec.ts:444+`).
- [ ] Batch mixing a valid image and a spoofed part → "nothing persisted **and every stored object discarded**": rejection is proven (`:326`), the discard of already-stored objects is not asserted.
- [ ] In-memory fallback active → Redis returns and takes over without double-counting: not verified.
- [ ] A `legacy` row that is `image/png` stays inline: not verified (only the octet-stream direction is exercised).

---

## Gate Check

- **Gate command**: `tasks.md` § *Gate Check Commands — after T59 (Vitest)*, Final row — `pnpm --filter api build` + `pnpm check` + `pnpm test` + `pnpm test:int` + `pnpm test:e2e` + `pnpm test:coverage` + `pnpm test:scripts` + `pnpm catalog:lint` + `pnpm catalog:check` + `pnpm template:smoke` + `cd apps/api && pnpm audit --prod --audit-level=high`. Run once, through `shell-runner`, Docker up. Logs under `scratchpad/gate/`.

| # | Command | Exit |
| --- | --- | --- |
| 1 | `pnpm --filter api build` | 0 |
| 2 | `pnpm check` | 0 |
| 3 | `pnpm test` | 0 — Test Files 89 passed (89) / Tests 585 passed (585) |
| 4 | `pnpm test:int` | 0 — Test Files 10 passed (10) / Tests 123 passed (123) |
| 5 | `pnpm test:e2e` | 0 — Test Files 4 passed (4) / Tests 14 passed (14) |
| 6 | `pnpm test:coverage` | 0 — Test Files 103 passed (103) / Tests 722 passed (722) |
| 7 | `pnpm test:scripts` | 0 |
| 8 | `pnpm catalog:lint` | 0 |
| 9 | `pnpm catalog:check` | 0 — notification 26/99, identity/single-tenant 73/674 + 3/15, tag 4/13, audit 6/44, attachment 19/111; child final gate 219/1539 then 70/502 |
| 10 | `pnpm template:smoke` | 0 |
| 11 | `cd apps/api && pnpm audit --prod --audit-level=high` | **1** |

- **Result**: 10 of 11 commands green; 722 tests passed, 0 failed, 0 skipped in the coverage run.
- **Coverage**: statements 96.61 % (1254/1298), branches 94.25 % (607/644), functions 95.27 % (363/381), lines 96.91 % (1194/1232). No threshold-failure line — the `vitest.coverage.mts` floors hold (AD-027 ratchet respected).
- **Test count before feature**: 51 files / 330 tests (Jest, at `77d2a05`).
- **Test count after feature**: 103 files / 722 tests (the merged tree also carries `main`'s `api-coverage-to-90` tests from `ff8c6db`). **Delta +52 files / +392 tests, no drop.**
- **Failures**: command 11 only — 2 high advisories, both rooted in `packages__api-client>axios` (GHSA-gcfj-64vw-6mp9 axios; GHSA-hmw2-7cc7-3qxx form-data via `api-client>axios>form-data`). Totals reported: 2 low, 12 moderate, 2 high. This is the residue `spec.md` § Out of Scope explicitly excludes ("`packages/api-client` `axios` advisories — browser bundle, not backend"); no backend dependency is flagged.

---

## Release artefacts (Success Criteria #3–#4)

- Version fold applied as decided: all five entries at `module.json` `version: "2.0.0"`, `kernelRange: ">=2.0.0 <3.0.0"`.
- `docs/advisories/ADV-20260822-01..05` present — identity/single-tenant (breaking, high), attachment (security, high), notification (security, medium), audit (bug, low), tag (security, low) — each with `id`/`kind`/`module`/`affects`/`severity`/`detect`/`fix`/`parity` frontmatter, alongside the kept `ADV-20260821-01..05`. `pnpm catalog:lint` exit 0.
- `docs/dev/template-changelog.md` lists the kernel changes for the 2026-08-22 remediation (item 2).

### Recorded deviation

`catalog/identity/single-tenant/api/api/controllers/auth/upload-access-link-avatar.controller.ts:60` — `limits: { fileSize: MAX_UPLOAD_BYTES, fields: 1 }`, with an in-code `SPEC_DEVIATION` note (lines 53-58): the pre-auth access-link route consumes a required `token` multipart field, so `fields: 0` would reject every legitimate call. The sibling `session/upload-avatar.controller.ts:47` keeps `fields: 0`. `spec.md` P3 AC9 only requires "`limits.fields` set on both avatar interceptors", so the AC text is satisfied; the deviation is against `tasks.md`/`design.md`, and is accepted.

---

## Fix Plans

### Fix 1 — REM-14: upload quotas have no proof at all (Blocker)

- **Root cause**: the 429 (`@RateLimit` 20/60 s on `POST /attachments/uploads`), 413 (`PendingQuotaExceededError`) and 503 (`UploadsSaturatedError`) paths carry no assertion; only the two config defaults are asserted.
- **Fix task**: add e2e/unit proofs in `catalog/attachment` for each of the three responses, asserting the status **and** that the body was not read (the AC says "before reading the body"). `InFlightGate` already has a unit spec — the missing link is the route wiring.
- **Priority**: Blocker (P1 MVP acceptance criterion, unauthenticated cost/DoS surface).

### Fix 2 — REM-08 / mutant 2: the sniff mismatch branch is undiscriminated (Blocker)

- **Root cause**: every batch test uses HTML bytes, which sniff to `null`; removing `sniffed !== file.contentType` keeps the whole suite green.
- **Fix task**: add a batch case with valid PNG bytes declared as `image/jpeg` (and the reverse) asserting `UnsupportedMediaTypeError` / HTTP 415 and that nothing is persisted.
- **Priority**: Blocker (the High stored-XSS finding this feature exists to close).

### Fix 3 — REM-40: audit-trail redaction of the three hash columns is unproven (Major)

- **Root cause**: `03_audit_redact_token_hashes.sql` registers the columns but no int-spec reads back an `audit.entries` row for `sessions.token_hash`, `devices.cookie_token_hash` or `verification_tokens.token_hash`.
- **Fix task**: extend `catalog/audit/api/infrastructure/trail/audit-trigger.int-spec.ts` (or an identity int-spec) with one assertion per column, mirroring the existing `password_hash` case at `:144`.
- **Priority**: Major (Medium audit finding; a silent migration regression would restore clear hashes in the trail).

### Fix 4 — REM-12: post-header stream failure is unproven (Major)

- **Root cause**: `download-attachment.controller.ts:78-91` logs and returns; no test asserts the log, the socket teardown, or that the process survives.
- **Fix task**: e2e that makes the storage stream error after headers are sent, asserting the connection is torn down and `attachment.download_stream_failed` is logged.
- **Priority**: Major.

### Fix 5 — REM-15: `fieldSize` is neither implemented nor tested (Minor)

- **Root cause**: `multipart-files.ts:50-55` sets `fileSize`, `files`, `parts`, `fields` — `fieldSize` is missing from the profile-derived limits the AC enumerates. `parts` also has no test.
- **Fix task**: either add `fieldSize` to the limits object with a spec, or amend the AC to drop it (with `fields: 0` on the batch route it is unreachable there, but the avatar route accepts one field).
- **Priority**: Minor.

### Fix 6 — REM-28: the dev seed has no proof (Minor)

- **Root cause**: `master-user.seed.ts` reads `SEED_MASTER_PASSWORD` or generates one, but the traceability `Proof` column says `test` and no test references it.
- **Fix task**: a unit spec over `resolveMasterPassword` (env set → that value, `generated: false`; env absent → generated, `generated: true`), or change the `Proof` column to `gate`/`none` consistently with the Test Coverage Matrix row for boot seeds.
- **Priority**: Minor.

### Fix 7 — REM-39: the spec contradicts itself on the audit gate (Spec fix)

- **Root cause**: § Out of Scope excludes the `packages/api-client` `axios` advisories, but Success Criteria #2 and the REM-39 `Proof` require `pnpm audit --prod --audit-level=high` to exit 0 — impossible while that chain exists.
- **Fix task**: restate the criterion as "no high advisory outside the `packages/api-client > axios` chain", with a filtered command the gate can actually run (or an `--ignore`/allowlist).
- **Priority**: Minor (spec precision, not a code defect).

### Fix 8 — narrower-than-stated proofs (Cosmetic, batchable)

REM-09 (only the `legacy` profile is exercised for the octet-stream path) · REM-10 ("socket returned to the pool" unasserted) · REM-19 (base `ForbiddenError`, not the self-edit subclass) · REM-25 (no e2e for the `/docs` 404) · REM-27 (`legacy-import` removal has no regression test) · REM-48 (the probe's third grep matches a glob argument and a devDependency name; tighten it to `'"test[^"]*":'`).

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 45/51 requirements matched the spec outcome with `file:line` evidence; 4 not covered; 1 partial; 1 spec-precision gap
**Sensor**: 4/5 mutations killed
**Gate**: 10/11 commands green — 722 tests passed, 0 failed; the single non-zero is the audit residue the spec places out of scope

**What works**: the whole login/brute-force story (account bucket, enumeration parity, bucket clearing, Redis-outage fallback, argon2 saturation, CSRF-before-rate-limit, HIBP), outbox and log redaction with the shared key vocabulary and the `outbox-dead.purge` job at `lockId: 6`, the permission-delta and self-edit authz rules, the whole fail-closed env contract, the entrypoint bootstrap glob, all seventeen P3 hardening criteria bar REM-40, and the complete Vitest port — the four root gates plus `catalog:check` are green with no spec deleted or skipped and +392 tests versus the pre-feature Jest tree.

**Issues found**: attachments carry the weight of the failure — REM-14 (quotas: 429/413/503) has no proof whatsoever, and the REM-08 stored-XSS defence survives having its mismatch branch deleted. REM-12 and REM-40 are unproven Medium findings; REM-15 is one limit short of the spec; REM-28 lacks the test its `Proof` column promises; REM-39's gate can never exit 0 as written.

**Next steps**: route Fixes 1–4 as worker tasks (Blocker/Major) before merge; Fixes 5–8 can follow in the same wave or move to the follow-up spec. Re-verification should re-check only those rows and re-run mutant 2.
