# security-audit-remediation Validation

**Date**: 2026-08-23 — round 1, round 2 (after fix wave 7), round 3 (after fix wave 8)
**Spec**: `.specs/features/security-audit-remediation/spec.md`
**Diff range**: r1 `77d2a05..ff8c6db` · r2 `3b7554f..ca6bb6f` · r3 `ee64726..621c5da` (T69) — branch `feat/security-audit-remediation`, worktree `.worktrees/security-audit-remediation`, HEAD `621c5da`
**Verifier**: independent sub-agent (author ≠ verifier)

**Status: PASS ✅** — 51/51 requirements matched the spec outcome with `file:line` evidence; Final gate 12/12; the last surviving mutant is dead.

AC ↔ requirement map re-derived from `spec.md` alone: P1 Login AC1–7 = REM-01..07 · P1 Attach AC1–8 = REM-08..15 · P2 Secrets AC1–5 = REM-16..20 · P2 Config AC1–10 = REM-21..30 · P3 AC1–17 = REM-31..47 · P1 Port AC1–5 = REM-48..51 (REM-51 covers ACs 4–5). Proof kinds from the traceability `Proof` column: 44 `test`, 4 `gate`, 3 `probe`.

---

## Verification-integrity note (read before trusting round 2)

In this session a bare shell command runs with `pwd = /Users/emanuelvogt/Developer/platform-template` — the **primary checkout** (branch `main`) — not the worktree. Round 1 prefixed every command with `cd <worktree> &&`; **round 2 did not**, so its three mutants, the REM-48 probe and its ad-hoc greps executed against the primary checkout. Round 3 verified the consequences:

- The three files round 2 mutated are **byte-identical** between the tree it actually used (`main@89681d8`) and the feature branch at the time (`ca6bb6f`) — `git diff 89681d8 ca6bb6f --` over those paths is empty. The discrimination conclusions therefore hold for the same source.
- Every mutation was restored (`git status --short` empty after each); the primary checkout carries no residue from this verifier — its current uncommitted work (`.claude/settings.json`, `AGENTS.md.jinja`, `docs/**`, `docs-stay-lean.mjs`) was never touched here.
- Round 2's Final gate and both its scouts were dispatched with the worktree path explicitly, so they were unaffected.
- Round 3 ran entirely in the worktree with explicit paths, and re-ran the full Final gate.

No conclusion changes, but round 2's report asserted an isolation it did not have. Recorded here rather than quietly corrected.

---

## Spec-Anchored Acceptance Criteria

Rows marked **R2** / **R3** were re-verified against that fix range; the rest are unchanged from round 1.

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| REM-01 11th failed login/900 s | 429 + `Retry-After`, no `hasher.verify`, auth event | `login.use-case.spec.ts:181-187` — `expect(t.rateLimiter.consume).toHaveBeenNthCalledWith(1, ACCOUNT_KEY, 10, 900, { critical: true })`; `:178-179` — `expect(error).toMatchObject({ status: 429, retryAfterSeconds: 42 })`; `:189` — `expect(t.hasher.verify).not.toHaveBeenCalled()`; `:190-198` auth event `eventType: "rate_limited_burst"`, `metadata: { retryAfterSeconds: 42, scope: "account" }`; header `problem-details.filter.spec.ts:172-174` — `expect(r.headers["Retry-After"]).toBe("30")` | ✅ PASS |
| REM-02 unknown e-mail | identical 429 to an existing e-mail | `login.use-case.spec.ts:223-225` — `expect(await errorOf(unknown, "nao-existe@example.com")).toEqual(await errorOf(known, "ana@example.com"))`; `:226` — `expect(unknown.users.findByEmail).not.toHaveBeenCalled()` | ✅ PASS |
| REM-03 login succeeds | clears the e-mail bucket | `login.use-case.spec.ts:247` — `expect(t.rateLimiter.reset).toHaveBeenCalledWith(ACCOUNT_KEY)`; `:261` negative control | ✅ PASS |
| REM-04 Redis unreachable | critical keys enforced in-memory, same limits; non-critical fail open; 1 warn + 1 auth event | `resilient-rate-limiter.spec.ts:74-75` — `expect(results.map((r) => r.allowed)).toEqual([true, true, false])`, `expect(results[2]?.retryAfterSeconds).toBe(900)`; `:82-91` — `expect(fallback.trackedKeys).toBe(0)`; `:101-103` — `expect(warns).toHaveLength(1)`, `expect(emitted[0]?.name).toBe("rate-limiter.degraded")`; `rate-limiter-outage.listener.spec.ts:91` | ✅ PASS |
| REM-05 hash pool saturated | 503 + `Retry-After` before hashing; dummy verify kept | `bounded-password-hasher.spec.ts:41-43` — `expect(error).toMatchObject({ status: 503, retryAfterSeconds: 2 })`, `expect(inner.hash).toHaveBeenCalledTimes(8)`; `:54-57` | ✅ PASS |
| REM-06 Origin check fails | no rate-limit bucket consumed | `auth-csrf-none.e2e-spec.ts:203` — `expect(consumed).toEqual([])` after 3× 403; `:209` — `expect(consumed).toHaveLength(3)` control; order `csrf.parity.spec.ts:154-156` — `expect(appGuards).toEqual([CsrfGuard, RateLimitGuard])` | ✅ PASS |
| REM-07 `BREACH_CHECK_ENABLED=true` | HIBP queried regardless of mode; `breach_check_skipped` under `fail_open`; 2 s abort | `change-password.use-case.spec.ts:234`, `:249-256`; `breach-check.spec.ts:113-115` — `expect(verdict).toBe("skipped")`, `expect(elapsed).toBeGreaterThanOrEqual(1900)`, `expect(elapsed).toBeLessThan(2600)` | ✅ PASS |
| **R2** REM-08 batch sniff | sniff every part; 415 when null **or differing**; persist sniffed type; discard stored objects | `upload-attachments-batch.use-case.spec.ts:345` — `).rejects.toBeInstanceOf(UnsupportedMediaTypeError)` (PNG bytes declared `image/jpeg`) + `:347` — `expect(repo.insertMany).not.toHaveBeenCalled()`; reverse `:362` + `:365` — `expect(storage.putStream).toHaveBeenCalledTimes(1)`, `:366` — `expect(storage.delete).toHaveBeenCalledTimes(1)`; `:294` — `expect(inserted[0]?.props.contentType).toBe("image/png")`; HTTP `attachment-upload.e2e-spec.ts:146-157` — `.expect(415)` | ✅ PASS — mutant 2 killed |
| REM-09 non-allowlisted `content_type` | `octet-stream` + `attachment` + `nosniff`, every profile | `attachment-download.e2e-spec.ts:275,276,279` — `expect(res.headers["content-type"]).toBe("application/octet-stream")`, `…["x-content-type-options"]).toBe("nosniff")` | ⚠️ PASS, partial — only the `legacy` profile exercised |
| REM-10 client aborts mid-body | storage stream destroyed, socket returned | `attachment-download.e2e-spec.ts:538` — `expect(slowStream?.destroyed).toBe(true)` | ⚠️ PASS, partial — "socket returned to the pool" not asserted |
| REM-11 `If-None-Match` matches | 304, no storage stream left open | `attachment-download.e2e-spec.ts:439` — `.expect(304)`; `:441` — `expect(getStreamCallCount()).toBe(callsAfterFirst)` | ✅ PASS |
| **R2** REM-12 stream errors after headers | destroy the response socket, log, process stays up | `attachment-download.e2e-spec.ts:685-688` — `expect(downloadFailedLogs).toHaveLength(1)`; `:681` — `expect(failingStream?.destroyed).toBe(true)`; `:673-674` — `expect(received.bytes).toBeLessThan(PNG_1PX.byteLength)`, `expect(received.endedWithoutError).toBe(false)`; `:696-701` later request `.expect(200)` | ✅ PASS — server-side socket `.destroyed` not asserted directly; outcome proven client-side |
| REM-13 storage client timeout | explicit `STORAGE_REQUEST_TIMEOUT_MS`, default 30 000 | `storage.config.spec.ts:31` — `expect(cfg.STORAGE_REQUEST_TIMEOUT_MS).toBe(30_000)`; `r2-storage.adapter.spec.ts:68` | ✅ PASS |
| **R2** REM-14 upload quotas | 429 / 413 / 503, each before reading the body | 429 `attachment-upload.e2e-spec.ts:239-242` — `expect(lastStatus).toBe(429)`, `expect(putStream).toHaveBeenCalledTimes(20)`; 413 `:309-310` — `expect(putStream).not.toHaveBeenCalled()`; 503 `:368-370` — `expect(res.headers["retry-after"]).toBeDefined()`, `expect(putStream).not.toHaveBeenCalled()`; unit `upload-attachments.controller.spec.ts:51-52`, `:66` | ✅ PASS — mutant 6 killed |
| **R2** REM-15 busboy limits | `fileSize`, `files`, `parts`, `fields`, `fieldSize`; limit → 413/400; non-`file` part destroyed → 400 | `multipart-files.ts:58-63` — `limits: { fileSize: limits.maxBytes, files: limits.maxFiles, parts: limits.maxFiles + 1, fields: limits.fields ?? 0, fieldSize: limits.fieldSize ?? DEFAULT_FIELD_SIZE_BYTES }`; `multipart-files.spec.ts:310-325` (fieldSize), `:369-370` — `.rejects.toBeInstanceOf(PayloadTooLargeError)` + `expect(seen[0]?.destroyed).toBe(true)` (parts + part destroyed); `:157`,`:184`,`:147`,`:135` | ✅ PASS |
| REM-16 outbox published/dead-lettered | no clear value under a redacted key | `outbox.int-spec.ts:826` — `expect(stored.link).toBe("[REDACTED]")`; `:901` — `expect(stored.token).toBe("[REDACTED]")` | ✅ PASS |
| REM-17 `outbox_dead` retention | registered job `outbox-dead.purge` deletes old rows | `maintenance-registry.spec.ts:85-88` — `expect(maintenanceRegistry.require("outbox-dead.purge")).toEqual({ cron: "45 3 * * *", lockId: 6 })`; `outbox.int-spec.ts:936` — `expect(remaining).toEqual(["dead-new"])` | ✅ PASS — `lockId: 6` |
| REM-18 permission delta | 403 `permission-grant-not-allowed`, master exempt | `access-policy.spec.ts:357` — `.toThrow(PermissionGrantNotAllowedError)`; `:279` — `.not.toThrow()` | ✅ PASS |
| REM-19 self-edit scope fields | 403 with the existing self-edit error | `update-user.use-case.spec.ts:443,460,477,486` — `.rejects.toThrow(ForbiddenError)` | ⚠️ PASS, partial — base class, not the `SelfEditError` subclass |
| REM-20 substring redaction | `newPassword`, `currentPassword`, `newEmail`, `pendingEmail` redacted | `log.redact.spec.ts:169` — `expect(redactValue({ [key]: "valor-cru" })).toEqual({ [key]: "[REDACTED]" })` over `it.each` `:163-167`; `sensitive-keys.spec.ts:42-45` | ✅ PASS |
| REM-21 required env | Zod error naming the variable | `env.spec.ts:29` — `toThrow(/NODE_ENV/)`; `:34` — `toThrow(/DATABASE_SSL/)`; `identity.config.spec.ts:98-99` | ✅ PASS |
| REM-22 prod plaintext Redis | boot fails without `REDIS_ALLOW_PLAINTEXT=true` | `env.spec.ts:48-50` — `toThrow(/REDIS_URL/)`; `:60` pass case | ✅ PASS |
| REM-23 `DATABASE_SSL_CA` | trusted CA + `rejectUnauthorized: true` | `connection-config.spec.ts:60-63` — `expect(config.ssl).toEqual({ rejectUnauthorized: true, ca: "-----BEGIN CERT-----\nAAA\n-----END CERT-----" })` | ✅ PASS |
| REM-24 `TRUST_PROXY_HOPS` unset | `req.ip` = socket address, XFF ignored | `security-bootstrap.e2e-spec.ts:60-61` — `expect(res.body.ip).not.toBe("203.0.113.7")`, `…toMatch(/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/)` | ✅ PASS |
| REM-25 prod `/docs` | 404 unless `DOCS_ENABLED=true` | `docs.spec.ts:8-9` — `expect(shouldMountDocs({ NODE_ENV: "production", DOCS_ENABLED: false })).toBe(false)`; `:13-15` | ⚠️ PASS, partial — no e2e for the HTTP 404 |
| REM-26 build has no harness (probe) | `dist/` free of `testing/`, `__e2e__/`, `parity/` | Verifier probe: build exit 0; `find apps/api/dist \( -path '*/testing/*' -o … \)` empty (108 emitted `.js`) | ✅ PASS |
| REM-27 entrypoint bootstrap glob | runs every `dist/modules/*/seeds/bootstrap.js`; proceeds without the vars; `legacy-import` removed | `docker-entrypoint.test.mjs:55` — `assert.deepEqual(invoked, [path.join(distDir, "modules", "identity", "seeds", "bootstrap.js")])`; `:67` — `assert.deepEqual(invoked, [])` | ⚠️ PASS, partial — `legacy-import` removal true by grep, no regression test |
| **R2** REM-28 dev seed has no literal password | reads `SEED_MASTER_PASSWORD` or prints a generated one | `master-user.seed.spec.ts:35-38` — `expect(resolveMasterPassword()).toEqual({ password: "senha-fixa-do-env", generated: false })`; `:46`,`:49` — `expect(result.generated).toBe(true)`, `expect(result.password).toHaveLength(32)`; `:71` — `expect(generatedPasswordLines).toHaveLength(1)` | ✅ PASS |
| REM-29 `catalog-check` testing import | entry importing `api/testing/**` from production code fails | `lint.test.mjs:243-246` — `assert.equal(errors.length, 1)`, `assert.match(errors[0], /testing\/helper/)` | ✅ PASS |
| REM-30 notification `NODE_ENV=staging` | accepted | `notification.config.spec.ts:33` — `expect(parseNotificationConfig({ NODE_ENV: "staging" }).NODE_ENV).toBe("staging")` | ✅ PASS |
| REM-31 trash listings | 403 without the trash permission | `user-trash.e2e-spec.ts:237` — `.expect(403)`; `tags.e2e-spec.ts:140` — `.expect(403)` | ✅ PASS |
| REM-32 anonymous idempotency | scope includes the client IP; bad key → 400 | `idempotency.interceptor.spec.ts:230-232` — `expect(reserved.map((r) => r.scope)).toEqual(["t-1:ip:203.0.113.7", "t-1:ip:198.51.100.4"])`; `:676` — `…getStatus()).toBe(400)` | ✅ PASS |
| REM-33 `page` > 10 000 | 400 | `listing-query.schema.spec.ts:50` — `expect(baseListingQuerySchema.safeParse({ page: "10001" }).success).toBe(false)` | ✅ PASS |
| REM-34 field length caps | email 254 / token 128 / name 200 → 400 | `identity.contract.spec.ts:66`, `:78`, `:88` — each `).toThrow()` | ✅ PASS |
| REM-35 id params DTO | `min(1).max(64)` on three routes | `identity.contract.spec.ts:134-135`; HTTP `devices.e2e-spec.ts:143` — `.expect(400)` | ✅ PASS |
| REM-36 duplicate id arrays | 400 | `identity.contract.spec.ts:104,110,113,119` — `).toThrow()` | ✅ PASS |
| REM-37 audit query bounds | non-ISO `from`/`to`, oversized `txId` → 400 | `audit.contract.spec.ts:21,22`; `:34` — `txId: Number.MAX_SAFE_INTEGER + 1` → `false` | ✅ PASS |
| REM-38 catalog `link` scheme | non-http(s) fails validation | `notification-catalog.spec.ts:42-43`, `:45-47` — `.toBe(false)` | ✅ PASS |
| **R2** REM-39 dependency audit (gate) | filtered gate exits 0 — no high/critical outside the `api-client>axios` chain | gate verbatim from `spec.md:235` → **exit 0**, stdout `true` (rounds 2 and 3). Raw audit still exits 1 with exactly the two excluded advisories: GHSA-gcfj-64vw-6mp9 (`packages__api-client>axios`), GHSA-hmw2-7cc7-3qxx (`…>form-data`). `multer` half holds: `apps/api/package.json:56` `"multer": "^2.2.0"` | ✅ PASS |
| **R3** REM-40 audit-trail hash redaction | the sensitive hash columns are redacted in the trail, by the new custom migration | `audit-trigger.int-spec.ts:152` — `expect((row!.row_new as { password_hash: string }).password_hash).toBe("[REDACTED]")` (users, the precedent); `:169` (sessions `token_hash`); `:186` (devices `cookie_token_hash`); `:203` (verification_tokens `token_hash`) — each `.toBe("[REDACTED]")`. `beforeAll:29-38` no longer contains any inline `audit.attach(...)`: its only setup is `reattachIdentityTables(pool)` (`:37`) = `SELECT audit.attach_module_hooks()` (`catalog/audit/api/testing/reattach-identity-tables.ts:16-18`), which replays the real `identity.attach_audit()` declared by `04_audit_attach_hook.sql:24-49` | ✅ PASS — mutant 7 now killed |
| REM-41 purge / confirm bounds | delete carries `status = 'pending'`; over-`maxFiles` rejects before querying | `drizzle-attachment.repository.ts:105` proved by `…int-spec.ts:196` — `expect((await repo.findById(turnedReady.props.id))?.props.status).toBe("ready")`; `confirm-uploads.use-case.spec.ts:141`,`:143` | ✅ PASS |
| REM-42 `Content-Disposition` | `'`, `(`, `)`, `*` percent-encoded; ASCII fallback first | `content-disposition.spec.ts:25-27` — `expect(buildContentDisposition("a'b(c)d*e.txt")).toBe("attachment; filename=\"a'b(c)d*e.txt\"; filename*=UTF-8''a%27b%28c%29d%2Ae.txt")` | ✅ PASS |
| REM-43 soft-deleted user, live session | `requireAuth` throws 403 | `auth.middleware.spec.ts:299` (`deleted: true` `:304`); `require-auth.spec.ts:71` — `expect((caught as ForbiddenError).status).toBe(403)` | ✅ PASS |
| REM-44 e-mail change in use | cooldown still recorded; same 409 `type` | `request-email-change.use-case.spec.ts:347`, `:350` — `expect(saved.props.lastEmailChangeRequestedAt).toEqual(NOW)`; `:370`/`:372` | ✅ PASS |
| REM-45 session touch throttle | no `UPDATE` below the interval | `auth.middleware.spec.ts:222` — `expect(sessions.touch).not.toHaveBeenCalled()` | ✅ PASS |
| REM-46 SSE `Origin` | 403 when not `WEB_ORIGIN` | `sse.controller.spec.ts:69-72` — `expect(() => new SseController(registry, ctx).stream(req)).toThrow(expect.objectContaining({ status: 403 }))` | ✅ PASS |
| REM-47 CI hardening (probe) | actions SHA-pinned, every workflow declares `permissions:` | Verifier probe — both greps empty | ✅ PASS |
| **R3** REM-48 no Jest artifact (probe) | no `jest.`/`@jest/globals`/`ts-jest`, no `jest-*.json`, no `test*` script | Verifier probe with the new expression (`spec.md:244`), run in the worktree: arm A `grep -rEn "\bjest\.\|@jest/globals\|ts-jest" apps/api/src apps/api/test catalog --include='*.ts'` empty; arm B `ls apps/api/test/jest-*.json` no matches; arm C `jq -r '.scripts \| keys[]' apps/api/package.json \| grep -E '^test'` **empty** | ✅ PASS — the round-2 probe-precision gap is closed |
| REM-49 runner tiers (gate) | `pnpm test && pnpm test:int && pnpm test:e2e` exit 0 | all exit 0 — 89/585, 10/123, 4/14 | ✅ PASS |
| REM-50 entry proofs (gate) | `pnpm catalog:check` green | exit 0 — `catalog:check — OK: notification, identity/single-tenant, tag, audit, attachment` | ✅ PASS |
| REM-51 coverage + scripts (gate) | floors hold, `pnpm test:scripts` green, probes REM-26/47 empty | both exit 0; coverage 96.61 / 94.25 / 95.27 / 96.91, no threshold failure | ✅ PASS |

**Status**: ✅ **51/51 matched the spec outcome with `file:line` evidence.** Five criteria pass with a proof narrower than the AC's wording (REM-09, REM-10, REM-19, REM-25, REM-27) plus two narrow notes on REM-08 (discard proven by a call count on `storage.delete`) and REM-12 (response socket proven client-side); all were reviewed and accepted as cosmetic in rounds 1–2 and are listed under *Residual notes*.

---

## Discrimination Sensor

| # | Round | File:line | Mutation | Scoped gate | Killed? |
| --- | --- | --- | --- | --- | --- |
| 1 | r1 | `identity/.../login.use-case.ts:85` | `if (!account.allowed)` → `&& false` | `catalog:check identity` | ✅ Killed (3 tests) |
| 2 | r1 | `attachment/.../upload-attachments-batch.use-case.ts:67` | dropped the `sniffed !== file.contentType` disjunct | `catalog:check attachment` | ❌ Survived |
| 3 | r1 | `shared/kernel/redaction/sensitive-keys.ts:17` | `includes` → `===` | scoped vitest | ✅ Killed (9 tests) |
| 4 | r1 | `identity/.../access-policy.ts:73-76` | removed the revocation half of the symmetric difference | `catalog:check identity` | ✅ Killed (5 tests) |
| 5 | r1 | `shared/config/env.ts:24` | re-added `.default("require")` to `DATABASE_SSL` | scoped vitest | ✅ Killed (1 test) |
| 2′ | r2 | same as 2 | re-injected after the fix | `catalog:check attachment` | ✅ **Killed** (the two new mismatch tests) |
| 6 | r2 | `attachment/.../upload-attachments.controller.ts:93` | `pending + contentLength` → `pending + contentLength * 0` | `catalog:check attachment` | ✅ Killed — "recusa com 413 quando pendentes do dono + Content-Length estouram a cota, sem ler o corpo" |
| 7 | r2 | `identity/.../03_audit_redact_token_hashes.sql:19` | redact list → `'{}'` | `catalog:check audit` | ❌ Survived |
| 7′ | **r3** | `identity/.../04_audit_attach_hook.sql:35` | `audit.attach('identity','sessions','{id}','{token_hash}')` → redact list `'{}'` | `pnpm catalog:check audit` (exit 7) | ✅ **Killed** — `FAIL |api-int| audit-trigger.int-spec.ts > audit trigger (int) > redaction: identity.sessions.token_hash vira [REDACTED] na trilha` |

Round-2 note: a first shaping of mutant 6 (deleting `contentLength` outright) was rejected by the compiler — `TS6133` — before any test ran; discarded and replaced by the arithmetic form. Round-2 mutants ran in the primary checkout against byte-identical source (see the integrity note).

Each mutant was injected once, the scoped gate run once with the log on disk (`scratchpad/mut*.log`), then restored with `git checkout -- <file>`, with `git status --short` confirmed empty.

**Sensor depth**: P0-full — 9 injections across three rounds
**Result**: **8/9 killed; the single survivor (mutant 7) is fixed and its re-injection (7′) now dies.**

### Why mutant 7′ dies where 7 survived

Round 2's test re-created the attach itself: `beforeAll` issued the three `audit.attach(...)` calls inline with the migration's literals copied by hand, so emptying the migration changed nothing observable. Wave 8 removed that circularity and, in doing so, found the hole was wider than the mutant showed — `audit` declares `dependsOn: identity`, so the installer's topological order (`scripts/platform/lib/catalog-graph.mjs`) *always* ran identity's migrations before `audit.attach` existed. Both identity guards were dead code and a fresh child had **no identity trail at all**, `users.password_hash` included.

The redesign inverts ownership: identity only *declares* its list (`identity.attach_audit()`, `04_audit_attach_hook.sql:24-49` — 14 tables, 4 redacted columns: `users.password_hash`, `sessions.token_hash`, `devices.cookie_token_hash`, `verification_tokens.token_hash`), and audit *executes* every declared hook at the end of its own install (`audit.attach_module_hooks()`, `02_attach_module_hooks.sql:17-37`, discovered by `pg_proc` lookup on `proname = 'attach_audit' AND pronargs = 0`). RULE C holds: audit never names identity. The test helper is now `SELECT audit.attach_module_hooks()`, so the assertions run against whatever the migration actually declares — which is why 7′ dies.

### Reverse install order — judged, not tested

`04_audit_attach_hook.sql:52-56` self-`PERFORM`s `identity.attach_audit()` to cover the inverse path (a product that already has audit and later adds or updates identity). The design is **correct by construction**: it is the same function body proven by the forward path, differing only in the guard at `:29-32` evaluating true instead of false, and identity's own tables exist by the time its custom migrations run. But it is **unexercised** — `audit dependsOn identity` means the shipped order never reaches it, and `catalog-check.test.mjs` uses synthetic manifests with no Postgres. No test, in any tier, executes the self-`PERFORM`. Low risk, worth a follow-up (see *Residual notes*).

---

## Edge Cases

- [x] Account and IP buckets both deny → account 429 first (killed by mutant 1).
- [x] Payload with no redacted key → `markPublished` leaves it untouched — `outbox.int-spec.ts:863-864`.
- [x] Master actor → delta/self-scope rules do not apply — `access-policy.spec.ts:279`.
- [x] `DOCS_ENABLED=true` in production → `/docs` served — `docs.spec.ts:13-15`.
- [x] Storage client without a free socket → 50 `If-None-Match` requests against `maxSockets: 2`, the 51st still responds.
- [x] Batch mixing a valid image and a spoofed part → nothing persisted, already-stored object discarded — `upload-attachments-batch.use-case.spec.ts:362,365,366`.
- [ ] In-memory fallback active → Redis returns and takes over without double-counting: not verified.
- [ ] A `legacy` row that is `image/png` stays inline: not verified.

---

## Gate Check

Final gate per `tasks.md` § *Gate Check Commands — after T59 (Vitest)* plus the REM-39 filtered command from `spec.md:235`. Run once per round through `shell-runner`, Docker up. Round-3 logs under `scratchpad/gate3/` (`pnpm catalog:check` backgrounded — it exceeds the 600 s single-command cap).

| # | Command | r1 | r2 | r3 |
| --- | --- | --- | --- | --- |
| 1 | `pnpm --filter api build` | 0 | 0 | 0 |
| 2 | `pnpm check` | 0 | 0 | 0 |
| 3 | `pnpm test` | 0 — 89/585 | 0 — 89/585 | 0 — 89/585 |
| 4 | `pnpm test:int` | 0 — 10/123 | 0 — 10/123 | 0 — 10/123 |
| 5 | `pnpm test:e2e` | 0 — 4/14 | 0 — 4/14 | 0 — 4/14 |
| 6 | `pnpm test:coverage` | 0 — 103/722 | 0 — 103/722 | 0 — 103/722 |
| 7 | `pnpm test:scripts` | 0 | 0 | 0 |
| 8 | `pnpm catalog:lint` | 0 | 0 | 0 |
| 9 | `pnpm catalog:check` | 0 | 0 | 0 |
| 10 | `pnpm template:smoke` | 0 | 0 | 0 |
| 11 | `apps/api` raw `pnpm audit --prod --audit-level=high` | 1 | 1 | 1 — the two excluded `api-client>axios` advisories |
| 12 | REM-39 filtered gate | — | 0, `true` | **0, `true`** |

- **Round-3 result**: **12/12 pass.** The raw audit's exit 1 is not a gate — REM-39 is proven by the filtered command, which exits 0 because both highs sit exclusively under `packages__api-client>axios`.
- **Coverage**: All files 96.61 % stmt / 94.25 % br / 95.27 % fn / 96.91 % lines; no threshold-failure line (AD-027 ratchet respected).
- **`catalog:check` blocks (r3, in order)**: notification 26/99 · identity 74/677 then 3/15 · tag 4/13 · audit 6/44 · attachment **20/117** (19/111 in r1) · child final `pnpm test` **221/1548** · child `pnpm test:db` **70/510**.
- **Test counts**: template tree steady at 89/585 unit and 103/722 with coverage — expected, since every fix from waves 7–8 lives under `catalog/**`, which only runs inside the rendered child. Pre-feature baseline 51 files / 330 tests (Jest, at `77d2a05`). **No test lost, skipped or disabled in any round.**
- **Failures**: none.

---

## Release artefacts (Success Criteria #3–#4)

- All five entries at `module.json` `version: "2.0.0"`, `kernelRange: ">=2.0.0 <3.0.0"`.
- `docs/advisories/ADV-20260822-01..05` present, one per touched entry, full frontmatter, alongside the kept `ADV-20260821-01..05`. `ADV-20260822-01` and `-04` were updated by wave 8 for the migration redesign. `pnpm catalog:lint` exit 0.
- `docs/dev/template-changelog.md` lists the kernel changes for the 2026-08-22 remediation.
- Custom-migration manifests consistent: identity `["01_auth_events_append_only.sql", "04_audit_attach_hook.sql"]`, audit `["01_audit_trail_capture.sql", "02_attach_module_hooks.sql"]`; the deleted `02_audit_attach.sql` / `03_audit_redact_token_hashes.sql` are gone from disk and from both lists, and no live code or manifest references them. Guarded by `scripts/platform/__tests__/catalog-custom-migrations.test.mjs:57` in `pnpm test:scripts`.

### Recorded deviations (all accepted)

1. `identity/.../auth/upload-access-link-avatar.controller.ts:60` — `fields: 1` instead of the design's `fields: 0`, because the pre-auth access-link route consumes a required `token` multipart field. `spec.md` P3 AC9 only requires "`limits.fields` set on both avatar interceptors", so the AC text is satisfied.
2. `catalog/audit/api/infrastructure/trail/audit-trigger.int-spec.ts:60-65` — the audit-mechanism test vehicle is `identity.permission_templates` rather than `tag.tags`, because audit does not depend on tag and a standalone `catalog:check audit` has no `tag` schema. Unrelated to the attach mechanism.
   *The round-2 deviation on this file (inline re-attach mirroring migration 03) is gone — wave 8 removed it.*

---

## Residual notes (cosmetic, not blocking; carried for the follow-up spec)

- **Reverse install order untested** — nothing executes `PERFORM identity.attach_audit()` at `04_audit_attach_hook.sql:52-56`. A script-level test that installs audit and then adds identity would close it.
- **No enforcement of the hook contract** — `audit.attach_module_hooks()` finds hooks by name, so a future auditable entry that forgets to declare `<schema>.attach_audit()` silently gets no trail: exactly the failure class wave 8 just fixed. A `catalog:lint` rule or a coverage test would prevent the regression.
- **Narrower-than-stated proofs** — REM-09 (only the `legacy` profile), REM-10 ("socket returned to the pool"), REM-12 (server-side socket `.destroyed`), REM-19 (base `ForbiddenError`, not the subclass), REM-25 (no e2e for the `/docs` 404), REM-27 (`legacy-import` removal has no regression test), REM-08 (discard proven by a call count on `storage.delete`).
- **Stale planning reference** — `touches-audit.md:100` still names `02_audit_attach.sql` in a `Touches` list. Planning artifact only.
- **Two edge cases unverified** — Redis fallback handover without double-counting; a `legacy` row that is `image/png` staying inline.

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 51/51 requirements matched the spec outcome with `file:line` evidence
**Sensor**: 8/9 killed across three rounds; the one survivor is fixed and its re-injection dies
**Gate**: 12/12 green — 722 tests passed, 0 failed, 0 skipped; REM-39 filtered gate exits 0

**What works**: every High and Medium the audit found now has a discriminating proof. Login is throttled per account with an enumeration-safe 429, an in-memory fallback that survives a Redis outage, and a bounded argon2 path; attachments sniff every part and reject a valid PNG declared as `image/jpeg`, enforce 429/413/503 before reading a body, tear down and log a stream that fails after headers, and carry the full busboy limit set; secrets are redacted in the outbox and the log by a shared key vocabulary; the env contract fails closed; the audit trail redacts the four credential-hash columns. The Vitest port is complete and every proof this feature wrote runs in the runner the template ships.

The round-3 fix is the substantive one: wave 8 found that the ordering hole was wider than mutant 7 exposed — a fresh child had no identity trail at all, `users.password_hash` included — and replaced two dead-code guards with a declare/execute split that runs in the real install order. The mutant that survived two rounds now dies.

**Issues found**: none blocking. The residual notes above are cosmetic and belong to the follow-up spec.

**Next steps**: closeout. The residual notes and the two unverified edge cases carry to `security-hardening-2`.
