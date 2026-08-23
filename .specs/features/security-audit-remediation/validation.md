# security-audit-remediation Validation

**Date**: 2026-08-23 (round 1) · 2026-08-23 (round 2, after the fix wave)
**Spec**: `.specs/features/security-audit-remediation/spec.md`
**Diff range**: round 1 `77d2a05..ff8c6db` · round 2 fix range `3b7554f..ca6bb6f` (HEAD `89681d8`), branch `feat/security-audit-remediation`, worktree `.worktrees/security-audit-remediation`
**Verifier**: independent sub-agent (author ≠ verifier)

AC ↔ requirement map re-derived from `spec.md` alone: P1 Login AC1–7 = REM-01..07 · P1 Attach AC1–8 = REM-08..15 · P2 Secrets AC1–5 = REM-16..20 · P2 Config AC1–10 = REM-21..30 · P3 AC1–17 = REM-31..47 · P1 Port AC1–5 = REM-48..51 (REM-51 covers ACs 4–5). Proof kinds from the traceability `Proof` column: 44 `test`, 4 `gate`, 3 `probe`.

**Round-2 status**: 50/51 requirements fully matched; **1 partial (REM-40)**; the round-1 spec-precision gap on REM-39 is closed by the filtered gate; the round-1 REM-48 probe fix is incomplete (cosmetic).

---

## Spec-Anchored Acceptance Criteria

Rows marked **R2** were re-verified against the fix range; all others are unchanged from round 1.

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| REM-01 11th failed login/900 s | 429 + `Retry-After`, no `hasher.verify`, auth event | `login.use-case.spec.ts:181-187` — `expect(t.rateLimiter.consume).toHaveBeenNthCalledWith(1, ACCOUNT_KEY, 10, 900, { critical: true })`; `:178-179` — `expect(error).toMatchObject({ status: 429, retryAfterSeconds: 42 })`; `:189` — `expect(t.hasher.verify).not.toHaveBeenCalled()`; `:190-198` auth event `eventType: "rate_limited_burst"`, `metadata: { retryAfterSeconds: 42, scope: "account" }`; header at `problem-details.filter.spec.ts:172-174` — `expect(r.headers["Retry-After"]).toBe("30")` | ✅ PASS |
| REM-02 unknown e-mail | identical 429 to an existing e-mail | `login.use-case.spec.ts:223-225` — `expect(await errorOf(unknown, "nao-existe@example.com")).toEqual(await errorOf(known, "ana@example.com"))`; `:226` — `expect(unknown.users.findByEmail).not.toHaveBeenCalled()` | ✅ PASS |
| REM-03 login succeeds | clears the e-mail bucket | `login.use-case.spec.ts:247` — `expect(t.rateLimiter.reset).toHaveBeenCalledWith(ACCOUNT_KEY)`; `:261` negative control on a failed login | ✅ PASS |
| REM-04 Redis unreachable | critical keys enforced in-memory, same limits; non-critical fail open; 1 warn + 1 auth event | `resilient-rate-limiter.spec.ts:74-75` — `expect(results.map((r) => r.allowed)).toEqual([true, true, false])`, `expect(results[2]?.retryAfterSeconds).toBe(900)`; `:82-91` — `expect(fallback.trackedKeys).toBe(0)`; `:101-103` — `expect(warns).toHaveLength(1)`, `expect(emitted[0]?.name).toBe("rate-limiter.degraded")`; `rate-limiter-outage.listener.spec.ts:91` — `expect(t.authEvents.record).toHaveBeenCalledTimes(1)` | ✅ PASS |
| REM-05 hash pool saturated | 503 + `Retry-After` before hashing; dummy verify kept | `bounded-password-hasher.spec.ts:41-43` — `expect(error).toMatchObject({ status: 503, retryAfterSeconds: 2 })`, `expect(inner.hash).toHaveBeenCalledTimes(8)`; `:54-57` — `await expect(hasher.verify("senha", "hash-dummy")).rejects.toBeInstanceOf(PasswordHashingSaturatedError)` | ✅ PASS |
| REM-06 Origin check fails | no rate-limit bucket consumed | `identity/.../__e2e__/auth-csrf-none.e2e-spec.ts:203` — `expect(consumed).toEqual([])` after 3× 403; `:209` — `expect(consumed).toHaveLength(3)` on the allowed-origin control; order at `parity/csrf.parity.spec.ts:154-156` — `expect(appGuards).toEqual([CsrfGuard, RateLimitGuard])` | ✅ PASS |
| REM-07 `BREACH_CHECK_ENABLED=true` | HIBP queried regardless of mode; `breach_check_skipped` under `fail_open`; 2 s abort | `change-password.use-case.spec.ts:234` — `expect(t.breach.check).toHaveBeenCalledWith(VALID_INPUT.newPassword)`; `:249-256` auth event `eventType: "breach_check_skipped"`, `metadata: { mode: "fail_open" }`; `breach-check.spec.ts:113-115` — `expect(verdict).toBe("skipped")`, `expect(elapsed).toBeGreaterThanOrEqual(1900)`, `expect(elapsed).toBeLessThan(2600)` | ✅ PASS |
| **R2** REM-08 batch sniff | sniff every part; 415 when null **or differing**; persist sniffed type; discard stored objects | `upload-attachments-batch.use-case.spec.ts:345` — `).rejects.toBeInstanceOf(UnsupportedMediaTypeError)` (real PNG bytes declared `image/jpeg`) + `:347` — `expect(repo.insertMany).not.toHaveBeenCalled()`; reverse case `:362` (JPEG declared `image/png`, 2nd of 2) + `:365` — `expect(storage.putStream).toHaveBeenCalledTimes(1)`, `:366` — `expect(storage.delete).toHaveBeenCalledTimes(1)`; `:310`/`:326` null-sniff cases retained; `:294` — `expect(inserted[0]?.props.contentType).toBe("image/png")`; HTTP `attachment-upload.e2e-spec.ts:146-157` — `.expect(415)` + `expect(res.body.type).toMatch(/\/unsupported-media-type$/)` | ✅ PASS — mutant 2 now killed |
| REM-09 non-allowlisted `content_type` | `octet-stream` + `attachment` + `nosniff`, every profile | `attachment-download.e2e-spec.ts:275` — `expect(res.headers["content-type"]).toBe("application/octet-stream")`; `:276` `content-disposition: attachment; filename="log.txt"`; `:279` — `expect(res.headers["x-content-type-options"]).toBe("nosniff")` | ⚠️ PASS, partial — only the default `legacy` profile is exercised; "every profile" is structural (`download-attachment.controller.ts:65` ignores profile) |
| REM-10 client aborts mid-body | storage stream destroyed, socket returned | `attachment-download.e2e-spec.ts:538` — `expect(slowStream?.destroyed).toBe(true)` | ⚠️ PASS, partial — "socket returned to the pool" not asserted |
| REM-11 `If-None-Match` matches | 304, no storage stream left open | `attachment-download.e2e-spec.ts:439` — `.expect(304)`; `:441` — `expect(getStreamCallCount()).toBe(callsAfterFirst)` | ✅ PASS |
| **R2** REM-12 stream errors after headers | destroy the response socket, log, process stays up | `attachment-download.e2e-spec.ts:685-688` — `expect(downloadFailedLogs).toHaveLength(1)` (filtered on `call.msg === "attachment.download_stream_failed"`); `:681` — `expect(failingStream?.destroyed).toBe(true)`; `:673-674` — `expect(received.bytes).toBeLessThan(PNG_1PX.byteLength)`, `expect(received.endedWithoutError).toBe(false)` (connection torn down mid-body); `:696-701` a later request `.expect(200)` (process stays up) | ✅ PASS — server-side socket `.destroyed` is not asserted directly; the outcome is proven client-side |
| REM-13 storage client timeout | explicit `STORAGE_REQUEST_TIMEOUT_MS`, default 30 000 | `storage.config.spec.ts:31` — `expect(cfg.STORAGE_REQUEST_TIMEOUT_MS).toBe(30_000)`; `r2-storage.adapter.spec.ts:68` — `requestTimeout: cfg.STORAGE_REQUEST_TIMEOUT_MS` inside `expect(S3ClientMock).toHaveBeenCalledWith({…})` | ✅ PASS |
| **R2** REM-14 upload quotas | 429 / 413 / 503, each before reading the body | 429: `attachment-upload.e2e-spec.ts:239-242` — `expect(lastStatus).toBe(429)`, `expect(lastRetryAfter).toBeDefined()`, `expect(putStream).toHaveBeenCalledTimes(20)` (the 21st never reaches storage); 413: `:309-310` — `expect(res.body.type).toMatch(/\/pending-quota-exceeded$/)`, `expect(putStream).not.toHaveBeenCalled()`; 503: `:368-370` — `expect(res.body.type).toMatch(/\/uploads-saturated$/)`, `expect(res.headers["retry-after"]).toBeDefined()`, `expect(putStream).not.toHaveBeenCalled()`; unit `upload-attachments.controller.spec.ts:51-52` (503) and `:66` (413) — `expect(executeMock).not.toHaveBeenCalled()` | ✅ PASS — mutant 6 killed |
| **R2** REM-15 busboy limits | `fileSize`, `files`, `parts`, `fields`, `fieldSize`; limit → 413/400; non-`file` part destroyed → 400 | `multipart-files.ts:58-63` — `limits: { fileSize: limits.maxBytes, files: limits.maxFiles, parts: limits.maxFiles + 1, fields: limits.fields ?? 0, fieldSize: limits.fieldSize ?? DEFAULT_FIELD_SIZE_BYTES }`; `fieldSize` `multipart-files.spec.ts:310-325` — `).rejects.toBeInstanceOf(InvalidMultipartRequestError)`; `parts` `:369-370` — `await expect(consume).rejects.toBeInstanceOf(PayloadTooLargeError)` + `expect(seen[0]?.destroyed).toBe(true)` (also closes the round-1 "part destroyed" note); `:157`/`:184`/`:147`/`:135` retained | ✅ PASS |
| REM-16 outbox published/dead-lettered | no clear value under a redacted key | `outbox.int-spec.ts:826` — `expect(stored.link).toBe("[REDACTED]")`; `:901` — `expect(stored.token).toBe("[REDACTED]")` (dead-letter) | ✅ PASS |
| REM-17 `outbox_dead` retention | registered job `outbox-dead.purge` deletes old rows | `maintenance-registry.spec.ts:85-88` — `expect(maintenanceRegistry.require("outbox-dead.purge")).toEqual({ cron: "45 3 * * *", lockId: 6 })`; effect `outbox.int-spec.ts:936` — `expect(remaining).toEqual(["dead-new"])`; wiring `outbox.dispatcher.ts:107` | ✅ PASS — `lockId: 6` confirmed |
| REM-18 permission delta | 403 `permission-grant-not-allowed`, master exempt | `access-policy.spec.ts:357` — `expect(() => …).toThrow(PermissionGrantNotAllowedError)`; `:279` — `expect(() => …).not.toThrow()` for `isMaster: true` | ✅ PASS |
| REM-19 self-edit scope fields | 403 with the existing self-edit error | `update-user.use-case.spec.ts:443,460,477,486` — `.rejects.toThrow(ForbiddenError)` | ⚠️ PASS, partial — asserts the base `ForbiddenError` (→ 403), not the `SelfEditError` subclass |
| REM-20 substring redaction | `newPassword`, `currentPassword`, `newEmail`, `pendingEmail` redacted | `log.redact.spec.ts:169` — `expect(redactValue({ [key]: "valor-cru" })).toEqual({ [key]: "[REDACTED]" })` over `it.each` at `:163-167`; `sensitive-keys.spec.ts:42-45` | ✅ PASS |
| REM-21 required env | Zod error naming the variable | `env.spec.ts:29` — `toThrow(/NODE_ENV/)`; `:34` — `toThrow(/DATABASE_SSL/)`; `identity.config.spec.ts:98-99` — `toThrow(/BREACH_CHECK_ENABLED/)` | ✅ PASS |
| REM-22 prod plaintext Redis | boot fails without `REDIS_ALLOW_PLAINTEXT=true` | `env.spec.ts:48-50` — `expect(() => parseEnv({ ...BASE, NODE_ENV: "production", DOCS_ENABLED: "true" })).toThrow(/REDIS_URL/)`; `:60` pass case | ✅ PASS |
| REM-23 `DATABASE_SSL_CA` | trusted CA + `rejectUnauthorized: true` | `connection-config.spec.ts:60-63` — `expect(config.ssl).toEqual({ rejectUnauthorized: true, ca: "-----BEGIN CERT-----\nAAA\n-----END CERT-----" })` | ✅ PASS |
| REM-24 `TRUST_PROXY_HOPS` unset | `req.ip` = socket address, XFF ignored | `security-bootstrap.e2e-spec.ts:60-61` — `expect(res.body.ip).not.toBe("203.0.113.7")`, `expect(res.body.ip).toMatch(/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/)` | ✅ PASS |
| REM-25 prod `/docs` | 404 unless `DOCS_ENABLED=true` | `docs.spec.ts:8-9` — `expect(shouldMountDocs({ NODE_ENV: "production", DOCS_ENABLED: false })).toBe(false)`; `:13-15` — `.toBe(true)` | ⚠️ PASS, partial — no e2e asserts the HTTP 404 |
| REM-26 build has no harness (probe) | `dist/` free of `testing/`, `__e2e__/`, `parity/` | Verifier probe: build exit 0; `find apps/api/dist \( -path '*/testing/*' -o -path '*/__e2e__/*' -o -path '*/parity/*' \)` empty (108 emitted `.js`) | ✅ PASS |
| REM-27 entrypoint bootstrap glob | runs every `dist/modules/*/seeds/bootstrap.js`; proceeds without the vars; `legacy-import` removed | `docker-entrypoint.test.mjs:55` — `assert.deepEqual(invoked, [path.join(distDir, "modules", "identity", "seeds", "bootstrap.js")])`; `:67` — `assert.deepEqual(invoked, [])` | ⚠️ PASS, partial — `legacy-import` removal true by grep, no regression test |
| **R2** REM-28 dev seed has no literal password | reads `SEED_MASTER_PASSWORD` or prints a generated one | `master-user.seed.spec.ts:35-38` — `expect(resolveMasterPassword()).toEqual({ password: "senha-fixa-do-env", generated: false })`; `:46`,`:49` — `expect(result.generated).toBe(true)`, `expect(result.password).toHaveLength(32)`; `:71` — `expect(generatedPasswordLines).toHaveLength(1)` | ✅ PASS |
| REM-29 `catalog-check` testing import | entry importing `api/testing/**` from production code fails | `lint.test.mjs:243-246` — `assert.equal(errors.length, 1)`, `assert.match(errors[0], /testing\/helper/)` | ✅ PASS |
| REM-30 notification `NODE_ENV=staging` | accepted | `notification.config.spec.ts:33` — `expect(parseNotificationConfig({ NODE_ENV: "staging" }).NODE_ENV).toBe("staging")` | ✅ PASS |
| REM-31 trash listings | 403 without the trash permission | `user-trash.e2e-spec.ts:237` — `.expect(403)`; `tags.e2e-spec.ts:140` — `.expect(403)` | ✅ PASS |
| REM-32 anonymous idempotency | scope includes the client IP; bad key → 400 | `idempotency.interceptor.spec.ts:230-232` — `expect(reserved.map((r) => r.scope)).toEqual(["t-1:ip:203.0.113.7", "t-1:ip:198.51.100.4"])`; `:676` — `expect((error as HttpException).getStatus()).toBe(400)` | ✅ PASS |
| REM-33 `page` > 10 000 | 400 | `listing-query.schema.spec.ts:50` — `expect(baseListingQuerySchema.safeParse({ page: "10001" }).success).toBe(false)` | ✅ PASS |
| REM-34 field length caps | email 254 / token 128 / name 200 → 400 | `identity.contract.spec.ts:66`, `:78`, `:88` — each `).toThrow()` | ✅ PASS |
| REM-35 id params DTO | `min(1).max(64)` on three routes | `identity.contract.spec.ts:134-135` — `expect(() => idParamSchema.parse({ id: "" })).toThrow()`, `… { id: rep("x", 65) })).toThrow()`; HTTP `devices.e2e-spec.ts:143` — `.expect(400)` | ✅ PASS |
| REM-36 duplicate id arrays | 400 | `identity.contract.spec.ts:104,110,113,119` — `).toThrow()` | ✅ PASS |
| REM-37 audit query bounds | non-ISO `from`/`to`, oversized `txId` → 400 | `audit.contract.spec.ts:21,22` — `.success).toBe(false)`; `:34` — `txId: Number.MAX_SAFE_INTEGER + 1` → `false` | ✅ PASS |
| REM-38 catalog `link` scheme | non-http(s) fails validation | `notification-catalog.spec.ts:42-43`, `:45-47` — `.toBe(false)` | ✅ PASS |
| **R2** REM-39 dependency audit (gate) | filtered gate exits 0 — no high/critical advisory outside the `api-client>axios` chain | gate run verbatim from `spec.md:235`: `cd apps/api && pnpm audit --prod --audit-level=high --json \| jq -e '[.advisories[] \| select(.severity=="high" or .severity=="critical") \| select(.findings[].paths[] \| test("api-client>axios") \| not)] \| length == 0'` → **exit 0**, stdout `true`. Raw audit still exits 1 with exactly the two excluded advisories: GHSA-gcfj-64vw-6mp9 (`packages__api-client>axios`), GHSA-hmw2-7cc7-3qxx (`packages__api-client>axios>form-data`). `multer` half holds: `apps/api/package.json:56` `"multer": "^2.2.0"` | ✅ PASS — round-1 spec-precision gap closed |
| **R2** REM-40 audit-trail hash redaction | the three hash columns are redacted in the trail, **by the new custom migration** | Values asserted: `audit-trigger.int-spec.ts:182` — `expect((row!.row_new as { token_hash: string }).token_hash).toBe("[REDACTED]")` (sessions); `:199` — `…cookie_token_hash).toBe("[REDACTED]")` (devices); `:216` — `…token_hash).toBe("[REDACTED]")` (verification_tokens). **But** `beforeAll:46-50` issues the three `audit.attach('identity', …, '{token_hash}')` calls inline — verbatim copies of migration 03's literals — and the test never reads or executes `03_audit_redact_token_hashes.sql` | ⚠️ **PARTIAL** — the trigger is proven, the migration is not (mutant 7 survived); see below |
| REM-41 purge / confirm bounds | delete carries `status = 'pending'`; over-`maxFiles` rejects before querying | `drizzle-attachment.repository.ts:105` proved by `…int-spec.ts:196` — `expect((await repo.findById(turnedReady.props.id))?.props.status).toBe("ready")`; `confirm-uploads.use-case.spec.ts:141`,`:143` | ✅ PASS |
| REM-42 `Content-Disposition` | `'`, `(`, `)`, `*` percent-encoded; ASCII fallback first | `content-disposition.spec.ts:25-27` — `expect(buildContentDisposition("a'b(c)d*e.txt")).toBe("attachment; filename=\"a'b(c)d*e.txt\"; filename*=UTF-8''a%27b%28c%29d%2Ae.txt")` | ✅ PASS |
| REM-43 soft-deleted user, live session | `requireAuth` throws 403 | `auth.middleware.spec.ts:299` (`deleted: true` at `:304`); `require-auth.spec.ts:71` — `expect((caught as ForbiddenError).status).toBe(403)` | ✅ PASS |
| REM-44 e-mail change in use | cooldown still recorded; same 409 `type` | `request-email-change.use-case.spec.ts:347`, `:350` — `expect(saved.props.lastEmailChangeRequestedAt).toEqual(NOW)`; `:370`/`:372` | ✅ PASS |
| REM-45 session touch throttle | no `UPDATE` below the interval | `auth.middleware.spec.ts:222` — `expect(sessions.touch).not.toHaveBeenCalled()` | ✅ PASS |
| REM-46 SSE `Origin` | 403 when not `WEB_ORIGIN` | `sse.controller.spec.ts:69-72` — `expect(() => new SseController(registry, ctx).stream(req)).toThrow(expect.objectContaining({ status: 403 }))` | ✅ PASS |
| REM-47 CI hardening (probe) | actions SHA-pinned, every workflow declares `permissions:` | Verifier probe — both greps empty | ✅ PASS |
| **R2** REM-48 no Jest artifact (probe) | no `jest.`/`@jest/globals`/`ts-jest`, no `jest-*.json`, no `test*` script | Verifier probe with the tightened expression from `spec.md:244`: arms A and B empty; arm C `grep -En '^\s*"test[^"]*":' apps/api/package.json` still returns `88:    "testcontainers": "^12.0.1",` — `[^"]*` swallows `containers`, so the devDependency still matches. AC outcome re-verified directly: `sed -n '/"scripts": {/,/^  }/p' apps/api/package.json \| grep -En '"test[^"]*":'` → empty | ✅ PASS (AC) — probe expression still imprecise, see Fix 2 |
| REM-49 runner tiers (gate) | `pnpm test && pnpm test:int && pnpm test:e2e` exit 0 | all exit 0 — 89/585, 10/123, 4/14 | ✅ PASS |
| REM-50 entry proofs (gate) | `pnpm catalog:check` green | exit 0 — every block passed | ✅ PASS |
| REM-51 coverage + scripts (gate) | floors hold, `pnpm test:scripts` green, probes REM-26/47 empty | both exit 0; coverage 96.61 / 94.25 / 95.27 / 96.91, no threshold failure | ✅ PASS |

**Status**: ⚠️ 50/51 matched the spec outcome with `file:line` evidence; **1 partial (REM-40)**. Five criteria still pass with a narrower proof than the AC states (REM-09, REM-10, REM-19, REM-25, REM-27) — unchanged from round 1, none was in the fix scope.

---

## Discrimination Sensor

### Round 1 (5 mutants, P0-full)

| # | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `identity/.../login.use-case.ts:85` | `if (!account.allowed)` → `&& false` — account bucket never denies | ✅ Killed (3 tests) |
| 2 | `attachment/.../upload-attachments-batch.use-case.ts:67` | dropped the `sniffed !== file.contentType` disjunct | ❌ Survived |
| 3 | `apps/api/src/shared/kernel/redaction/sensitive-keys.ts:17` | `includes` → `===` | ✅ Killed (9 tests) |
| 4 | `identity/.../access-policy.ts:73-76` | removed the revocation half of the symmetric difference | ✅ Killed (5 tests) |
| 5 | `apps/api/src/shared/config/env.ts:24` | re-added `.default("require")` to `DATABASE_SSL` | ✅ Killed (1 test) |

### Round 2 (3 mutants)

| # | File:line | Description | Scoped gate | Killed? |
| --- | --- | --- | --- | --- |
| 2′ | `attachment/.../upload-attachments-batch.use-case.ts:67` | re-injected: dropped the `sniffed !== file.contentType` disjunct | `pnpm catalog:check attachment` (exit 7) | ✅ **Killed** — `upload-attachments-batch.use-case.spec.ts`, tests "recusa PNG válido declarado como image/jpeg…" and "recusa JPEG válido declarado como image/png e descarta o objeto já enviado do lote" |
| 6 | `attachment/api/api/controllers/upload-attachments.controller.ts:93` | `pending + contentLength > QUOTA` → `pending + contentLength * 0 > QUOTA` — the declared body size stops counting toward the quota | `pnpm catalog:check attachment` (exit 7) | ✅ **Killed** — `upload-attachments.controller.spec.ts`, test "recusa com 413 quando pendentes do dono + Content-Length estouram a cota, sem ler o corpo" |
| 7 | `identity/single-tenant/migrations/custom/03_audit_redact_token_hashes.sql:19` | `audit.attach('identity','sessions','{id}','{token_hash}')` → redact list `'{}'` — the migration stops redacting the session token hash | `pnpm catalog:check audit` (exit 0) | ❌ **Survived** |

A first shaping of mutant 6 (deleting `contentLength` from the comparison outright) was rejected by the compiler — `TS6133: 'contentLength' is declared but its value is never read` — before any test ran; it was discarded and replaced by the arithmetic form above, which compiles and reaches the suite.

Each mutant was injected once into the real file, the scoped gate run once with the log on disk (`scratchpad/mut2-r2.log`, `mut6b.log`, `mut7.log`), then restored with `git checkout -- <file>` and `git status --short` confirmed empty. Tree verified clean after mutant 7.

**Sensor depth**: P0-full — 8 mutants across both rounds
**Result**: round 2 → 2/3 killed; cumulative 6/8 killed (mutant 2 was fixed and now dies; mutant 7 is new and survives)

### What mutant 7 establishes about REM-40

Emptying migration 03's redact list for `sessions` leaves the entire `pnpm catalog:check audit` green. The reason is in the test itself: `audit-trigger.int-spec.ts` `beforeAll:46-50` re-attaches the three tables with hardcoded, correct redact lists, overwriting whatever the migration did (`audit.attach` is idempotent). The assertions therefore prove **the audit trigger redacts a column when it is attached with that column in its redact list** — a property of the `audit` entry — and say nothing about migration 03.

The test's own `SPEC_DEVIATION` note (`:39-45`) goes further and concedes the substantive problem: `catalog:check audit` installs identity *before* audit, so identity's custom migration hits its own "audit entry absent" guard (`03_audit_redact_token_hashes.sql:14-17`) and — the authors' words — *"nunca redige os hashes num catalog:check real"*. Migration 03 is registered (`module.json:27`, guarded by `pnpm test:scripts`), but in the shipped install order it is a no-op; the redaction only exists if a product manually re-runs `audit.attach` after installing audit. REM-40's spec outcome ("WHEN a sensitive hash column is captured by the audit trail THEN it SHALL be redacted") is therefore not established for the path the template actually ships. The same ordering caveat pre-dates this feature (it is why the shared `reattachIdentityTables` helper exists for migration 02), so this is an inherited architectural limitation that REM-40 inherits rather than a regression this feature introduced — but the AC claims a redaction the install order does not deliver.

---

## Edge Cases

- [x] Account and IP buckets both deny → account 429 first (killed by mutant 1).
- [x] Payload with no redacted key → `markPublished` leaves it untouched — `outbox.int-spec.ts:863-864`.
- [x] Master actor → delta/self-scope rules do not apply — `access-policy.spec.ts:279`.
- [x] `DOCS_ENABLED=true` in production → `/docs` served — `docs.spec.ts:13-15`.
- [x] Storage client without a free socket → 50 `If-None-Match` requests against `maxSockets: 2`, the 51st still responds (`attachment-download.e2e-spec.ts:444+`).
- [x] **R2** Batch mixing a valid image and a spoofed part → nothing persisted and the already-stored object discarded — `upload-attachments-batch.use-case.spec.ts:362,365,366`.
- [ ] In-memory fallback active → Redis returns and takes over without double-counting: not verified.
- [ ] A `legacy` row that is `image/png` stays inline: not verified.

---

## Gate Check

- **Gate command**: `tasks.md` § *Gate Check Commands — after T59 (Vitest)*, Final row, plus the REM-39 filtered command from `spec.md:235`. Run once per round through `shell-runner`, Docker up. Round-2 logs under `scratchpad/gate2/`.

| # | Command | R1 exit | R2 exit |
| --- | --- | --- | --- |
| 1 | `pnpm --filter api build` | 0 | 0 |
| 2 | `pnpm check` | 0 | 0 |
| 3 | `pnpm test` | 0 — 89/585 | 0 — 89/585 |
| 4 | `pnpm test:int` | 0 — 10/123 | 0 — 10/123 |
| 5 | `pnpm test:e2e` | 0 — 4/14 | 0 — 4/14 |
| 6 | `pnpm test:coverage` | 0 — 103/722 | 0 — 103/722 |
| 7 | `pnpm test:scripts` | 0 | 0 |
| 8 | `pnpm catalog:lint` | 0 | 0 |
| 9 | `pnpm catalog:check` | 0 | 0 |
| 10 | `pnpm template:smoke` | 0 | 0 |
| 11 | `cd apps/api && pnpm audit --prod --audit-level=high` (raw) | 1 | 1 — the two excluded `api-client>axios` advisories |
| 12 | REM-39 filtered gate | — | **0**, stdout `true` |

- **Result (round 2)**: all twelve checks pass. The raw audit's exit 1 is no longer a gate — `spec.md` now proves REM-39 with the filtered command, which exits 0.
- **Coverage**: All files 96.61 % stmt / 94.25 % br / 95.27 % fn / 96.91 % lines; no threshold-failure line (AD-027 ratchet respected).
- **Test counts**: template tree unchanged at 89/585 unit, 103/722 with coverage — expected, since all six fixes live under `catalog/**`, which only runs inside the rendered child. Inside `pnpm catalog:check` the counts rose: identity 73/674 → 74/677, child final unit 219/1539 → 221/1548, child db tier 70/502 → 70/510. Pre-feature baseline 51 files / 330 tests (Jest, at `77d2a05`). **No test lost or skipped in either round.**
- **Failures**: none.

---

## Release artefacts (Success Criteria #3–#4)

- All five entries at `module.json` `version: "2.0.0"`, `kernelRange: ">=2.0.0 <3.0.0"`.
- `docs/advisories/ADV-20260822-01..05` present — identity/single-tenant (breaking, high), attachment (security, high), notification (security, medium), audit (bug, low), tag (security, low) — full frontmatter, alongside the kept `ADV-20260821-01..05`. `pnpm catalog:lint` exit 0.
- `docs/dev/template-changelog.md` lists the kernel changes for the 2026-08-22 remediation.

### Recorded deviations

1. `identity/.../auth/upload-access-link-avatar.controller.ts:60` — `limits: { fileSize: MAX_UPLOAD_BYTES, fields: 1 }` with an in-code `SPEC_DEVIATION` (lines 53-58): the pre-auth access-link route consumes a required `token` multipart field, so `fields: 0` would reject every legitimate call. `spec.md` P3 AC9 only requires "`limits.fields` set on both avatar interceptors", so the AC text is satisfied. **Accepted.**
2. `catalog/audit/api/infrastructure/trail/audit-trigger.int-spec.ts:32-45` — two `SPEC_DEVIATION` notes covering the inline re-attach of the identity tables. The first (mirroring migration 02 via `reattachIdentityTables`) is pre-existing and accepted. The second (mirroring migration 03's redact lists) is **not accepted as proof of REM-40** — see Fix 1.

---

## Fix Plans

### Fix 1 — REM-40: the migration is unproven and, in the shipped install order, inert (Major)

- **Root cause**: two separate problems wearing one deviation note. (a) The int-spec hardcodes migration 03's `audit.attach` calls in `beforeAll`, so the test cannot fail when the migration is wrong — mutant 7 proved it. (b) By the note's own admission, `catalog:check` installs identity before audit, so migration 03's guard makes it a no-op in a real install; the redaction only materialises if a product re-runs `audit.attach` manually.
- **Fix task**: fix the ordering so the attach actually runs — e.g. move the identity↔audit attach into an audit-side install step (or a post-install hook) that runs once both entries are present, and drop the inline re-attach from the test so the assertions exercise the shipped path. If the ordering cannot change in this feature, restate REM-40 to describe the manual step and document it in the identity advisory, so the AC stops claiming a redaction the install does not deliver.
- **Verification**: mutant 7 must die — emptying the redact list in `03_audit_redact_token_hashes.sql` must fail `pnpm catalog:check audit`.
- **Priority**: Major (Medium audit finding DB-5; currently the trail can still carry clear session/device/verification hashes in a stock install).

### Fix 2 — REM-48: the tightened probe still matches `testcontainers` (Cosmetic)

- **Root cause**: `^\s*"test[^"]*":` — `[^"]*` matches `containers`, so the devDependency at `apps/api/package.json:88` satisfies the pattern. The spec's parenthetical claim that it "matches script keys only" is wrong.
- **Fix task**: scope the grep to the scripts block, e.g. `sed -n '/"scripts": {/,/^  }/p' apps/api/package.json | grep -En '"test[^"]*":'`, and update the parenthetical.
- **Priority**: Cosmetic — the AC outcome is verified; only the probe expression is wrong.

### Fix 3 — narrower-than-stated proofs (Cosmetic, batchable, carried from round 1)

REM-09 (only the `legacy` profile is exercised for the octet-stream path) · REM-10 ("socket returned to the pool" unasserted) · REM-12 (server-side response socket `.destroyed` unasserted; outcome proven client-side) · REM-19 (base `ForbiddenError`, not the self-edit subclass) · REM-25 (no e2e for the `/docs` 404) · REM-27 (`legacy-import` removal has no regression test) · REM-08 (the discard proof is a call count on `storage.delete`, not an assertion on the deleted key).

---

## Summary

**Overall**: ⚠️ Issues — one Major gap left

**Spec-anchored check**: 50/51 requirements matched the spec outcome with `file:line` evidence; 1 partial (REM-40); 0 open spec-precision gaps blocking (REM-48's probe expression is cosmetic)
**Sensor**: round 2 → 2/3 killed; cumulative 6/8
**Gate**: 12/12 green — 722 tests passed, 0 failed, 0 skipped; the REM-39 filtered gate exits 0

**What works**: the fix wave closed five of the six round-1 gaps with real, discriminating evidence. REM-08 now rejects a valid PNG declared as `image/jpeg` and the reverse, and discards the already-uploaded part — the mutant that survived round 1 now dies. REM-14 asserts all three of 429/413/503 with `putStream` never reached, and a fresh mutant on the quota arithmetic dies on a dedicated unit test. REM-12, REM-15 (`fieldSize` + `parts`, plus the part-destroyed state) and REM-28 all carry assertions on values. REM-39's spec contradiction is resolved by a filtered gate that genuinely exits 0. Everything green from round 1 stayed green; no test was lost or skipped.

**Issues found**: REM-40 alone. The three new per-column assertions are real, but the test re-attaches the tables itself with migration 03's literals copied inline, so it proves the audit trigger rather than the migration — mutant 7 (emptying the migration's redact list) leaves `catalog:check audit` fully green. The deviation note attached to that setup also concedes that in the shipped install order migration 03 never runs its attach at all, which means the Medium finding it was written to close is not closed in a stock install.

**Next steps**: one fix task (Fix 1) for round 3 — make the attach run in the real install path and delete the inline re-attach so mutant 7 dies, or restate REM-40 to match what ships. Fixes 2 and 3 are cosmetic and can ride along or move to the follow-up spec. Re-verification needs only the REM-40 row and mutant 7; the Final gate does not need a third run unless Fix 1 touches the install path (it will).
