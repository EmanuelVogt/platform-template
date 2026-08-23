# Security Audit Remediation Specification

## Problem Statement

The 2026-08-22 white-box audit of the backend (kernel + the five catalog entries) found 4 High and 9 Medium defects, all verified with a concrete repro, plus ~30 Low ones. The highest-impact ones are an unthrottled login (per-IP limits only, lockout is dead code), an unauthenticated argon2 amplification, a stored XSS through the batch upload path, and an R2 socket leak that takes the whole storage subsystem down. Evidence per finding: [spike.md](spike.md). This feature closes every High and Medium, and the Low ones that cost one or two lines; the structural Lows and the Infos go to a follow-up spec.

## Goals

- [ ] No High or Medium finding of the audit remains reproducible (spike.md repro steps fail).
- [ ] Every insecure-by-default configuration fails closed at boot instead of silently degrading.
- [ ] Each affected catalog entry ships a new version + advisory (AD-016/AD-019); the kernel ships a template tag note.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Separate DB role for migrations (DB-1) | Operational change for every child's deploy; own spec `security-hardening-2` |
| EXIF/GPS stripping via `sharp` (UPLOAD-7) | New native dependency (`onlyBuiltDependencies`), re-encode pipeline |
| Facade signatures with principal (UPLOAD-8/AUTHZ-9) | Public API change of two entries; no in-repo consumer is vulnerable today |
| Email-change cancel token for the old address (AUTH-11) | New flow + template + endpoint |
| Constant-time `forgot-password` via queue (AUTH-8) | Architectural (request path → job) |
| Access-link avatar lifecycle (UPLOAD-5) | Interacts with the set-password flow; cost-only impact |
| Session `expires_at` semantics / rememberMe TTL (AUTH-9 except touch throttle) | Entity-level redesign |
| Dead config cleanup (AUTH-16), `emailHash` HMAC (AUTH-15), parity specs for other entries (AUTHZ-5/6), per-route `requestTimeout` (KERNEL-5), SSE origin hardening beyond `Origin` check | Info / structural; follow-up spec |
| `packages/api-client` `axios` advisories | Browser bundle, not backend |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Login account bucket | 10 failures/e-mail/900 s sliding window (`LOGIN_ACCOUNT_MAX_FAILURES`, `LOGIN_ACCOUNT_WINDOW_SECONDS`); counts existing and unknown e-mails alike; a success clears the bucket | Identical for existing/unknown → no enumeration oracle; success-clear avoids locking a legit user after typos | y (user: option 1, robust) |
| Redis outage policy | Keys flagged `critical` (login account/IP, forgot/reset/verify/access-link) fall back to a per-instance in-memory window with the same limits; non-critical keys keep fail-open; one `warn` + one auth event per outage | Login stays up without Redis, brute-force protection never disabled | y |
| argon2 concurrency gate | Semaphore `PASSWORD_HASH_MAX_IN_FLIGHT` (default 8) around `hash`/`verify`; full → 503 + `Retry-After: 2` before hashing; dummy verify stays | libuv pool is 4 threads | n |
| Outbox redaction | `markPublished` and dead-lettering replace values under keys matching `link/token/password/secret/authorization/cookie` (recursive, case-insensitive substring) with `"[REDACTED]"`; `outbox_dead` purged after `OUTBOX_DEAD_RETENTION_DAYS` (default 30) by a registered job | Kernel stays module-agnostic (RULE C); shared key list with the log redactor | y |
| Insecure defaults become required | `NODE_ENV`, `DATABASE_SSL`, `BREACH_CHECK_ENABLED` lose defaults; `TRUST_PROXY_HOPS` → 0; prod rejects `redis://` unless `REDIS_ALLOW_PLAINTEXT=true`; `DOCS_ENABLED` off in prod; `DATABASE_SSL_CA` (PEM) accepted | Fail loud at boot; each a `breaking` advisory | y |
| Download inline allowlist | Inline only when stored `content_type` ∈ {`image/jpeg`,`image/png`,`image/webp`}; else (any profile incl. `legacy`) → `octet-stream` + `attachment` | Matches what the sniffer proves; profile no longer trusted | n |
| Upload quotas | `@RateLimit` 20/60 s per IP on `POST /attachments/uploads`, 300/60 s on `GET /attachments/:id`; owner pending bytes ≤ `ATTACHMENT_PENDING_QUOTA_BYTES` (2 GiB); in-flight per instance ≤ `ATTACHMENT_MAX_CONCURRENT_UPLOADS` (16) → 503 | Bounds cost and RSS without a per-user table | n |
| Master bootstrap location | `bootstrap-master` → `api/seeds/` (production code); entrypoint runs every `dist/modules/*/seeds/bootstrap.js`; dev seed reads `SEED_MASTER_PASSWORD` or prints a generated one | `testing/**` stays spec-importable (AD-023) but unemitted; kernel cannot name a module path | n |
| Permission delta rule | Every key in the symmetric difference of the target's current vs requested sets must be held by the actor (master exempt) | Closes revocation without a hierarchy concept | n |
| Child migration | Fixes reach children through advisories (`detect`/`fix`) + entry versions; no auto code change | AD-019 | y |
| Runner (added 2026-08-22) | `vitest-migration` merged into `main` (`278dde0`) during wave 2; the feature ports itself to Vitest in an exclusive wave right after wave 2 (merge `main` in, codemod the 85 Jest-authored specs, re-gate), so waves 4–6 and the Verifier run on the Vitest tree | A branch that cannot merge is not done; porting early keeps later conflicts (lockfile, changelogs, manifests) out of the way | y (user, 2026-08-22: "add the port to this spec") |

**Open questions:** one, for release (wave 6) — `vitest-migration` already moved the five entries to `2.0.0` (`ADV-20260821-01..05`, unreleased, no kernel tag). Default: **fold** — entries stay `2.0.0` with a second advisory each (`ADV-20260822-NN`), `kernelRange` → `">=2.0.0 <3.0.0"`, kernel tag `v2.0.0` covers Vitest + security. Alternative: bump again (identity 3.0.0, attachment/notification 2.1.0, audit/tag 2.0.1). Orchestrator proceeds with the default unless the user says otherwise before wave 6.

---

## User Stories

### P1: Login and password paths resist brute force and amplification ⭐ MVP

**User Story**: As an operator, I want login throttled per account and the hashing path bounded so that credential stuffing, distributed brute force and argon2 floods cannot succeed or stall the API.

**Why P1**: AUTH-1/AUTH-2/AUTH-5 are the only High findings reachable unauthenticated.

**Acceptance Criteria**:

1. WHEN an e-mail receives its 11th failed login within 900 s (from any number of IPs) THEN system SHALL respond 429 with `Retry-After`, SHALL NOT run `hasher.verify`, and SHALL record an auth event for that e-mail/IP.
2. WHEN an e-mail is unknown THEN the 429 behaviour SHALL be identical to that of an existing e-mail (same status, same body, same timing class).
3. WHEN a login succeeds THEN system SHALL clear that e-mail's failure bucket.
4. WHEN Redis is unreachable THEN critical rate-limit keys SHALL be enforced by a per-instance in-memory window with the same limits, non-critical keys SHALL fail open, and system SHALL log one `warn` + one auth event per outage.
5. WHEN `PASSWORD_HASH_MAX_IN_FLIGHT` hashes are in flight THEN a further login SHALL respond 503 + `Retry-After` before hashing; the dummy verify for unknown e-mails SHALL remain.
6. WHEN a non-safe request fails the `Origin` check THEN system SHALL NOT consume any rate-limit bucket (CSRF guard runs before the rate-limit guard).
7. WHEN `BREACH_CHECK_ENABLED=true` THEN `set/reset/change-password` SHALL query HIBP regardless of `BREACH_CHECK_MODE`; WHEN the lookup fails THEN the adapter SHALL apply the mode and system SHALL record `breach_check_skipped` under `fail_open`; the HTTP call SHALL abort after 2 s.

**Independent Test**: e2e drives 11 failing logins from two IPs → 11th is 429; with Redis stopped, the 11th is still 429; a stub hasher with 8 pending promises makes the 9th login 503.

---

### P1: Attachments cannot host executable content and cannot exhaust storage sockets ⭐ MVP

**User Story**: As any authenticated user, I want uploaded files served safely and downloads to never wedge the storage client so that one user cannot attack others or the platform.

**Why P1**: UPLOAD-1 (stored XSS) and UPLOAD-2 (storage outage) are High.

**Acceptance Criteria**:

1. WHEN a batch upload targets a profile with `accept: "image"` THEN system SHALL sniff the first bytes of every part, reject the whole batch with 415 when the sniff is null or differs from the declared type, and persist the sniffed type.
2. WHEN a download's stored `content_type` is outside the inline allowlist THEN system SHALL respond `application/octet-stream` + `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`, for every profile including `legacy`.
3. WHEN a client aborts a download mid-body THEN the storage body stream SHALL be destroyed and its socket returned to the pool.
4. WHEN `If-None-Match` matches THEN system SHALL respond 304 with no storage body stream left open.
5. WHEN the storage body stream errors after headers THEN system SHALL destroy the response socket and log the error; the process SHALL stay up.
6. WHEN the storage client is constructed THEN it SHALL carry an explicit request/socket timeout (`STORAGE_REQUEST_TIMEOUT_MS`, default 30 000).
7. WHEN `POST /attachments/uploads` exceeds 20 requests/60 s per IP, or the owner's pending bytes exceed the quota, or in-flight uploads exceed the instance cap THEN system SHALL respond 429 / 413 / 503 respectively before reading the body.
8. WHEN busboy parses a batch THEN it SHALL run with `limits` derived from the profile (`fileSize`, `files`, `parts`, `fields`, `fieldSize`); a limit event SHALL end the request with 413/400; a part whose field name is not `file` SHALL be destroyed and the request rejected with 400.

**Independent Test**: e2e uploads `text/html` bytes as `profile=image` → 415; seeds a `ready` row with `content_type: text/html` → download is `octet-stream` attachment; 50 `If-None-Match` requests against a fake storage with `maxSockets: 2` → 51st request still succeeds.

---

### P2: Secrets do not persist in clear and privilege boundaries hold

**User Story**: As a security owner, I want tokens never at rest in clear and admin edits bounded by the actor's own authority.

**Why P2**: AUTH-3, AUTHZ-1, AUTHZ-3 are Medium with authenticated or DB-read preconditions.

**Acceptance Criteria**:

1. WHEN an outbox row is marked published or dead-lettered THEN its `payload` SHALL contain no value under a redacted key (`link`, `token`, …) other than `"[REDACTED]"`.
2. WHEN `outbox_dead` rows are older than `OUTBOX_DEAD_RETENTION_DAYS` THEN the registered job `outbox-dead.purge` SHALL delete them.
3. WHEN an actor updates a user and the symmetric difference of permissions contains a key the actor does not hold THEN system SHALL respond 403 `permission-grant-not-allowed` (master exempt).
4. WHEN an actor updates their own user and changes `servesClients`, `areaIds`, `serviceIds` or `schedulingAreaIds` THEN system SHALL respond 403 with the existing self-edit error.
5. WHEN the log redactor meets a key containing a sensitive token as a substring (`newPassword`, `currentPassword`, `newEmail`, `pendingEmail`) THEN it SHALL redact it.

**Independent Test**: int-spec publishes a `NotificationRequested` with a `link`, runs the dispatcher, reads the row → `[REDACTED]`; unit tests for `assertCanGrant` delta and the self-edit guard.

---

### P2: Insecure configuration fails closed and the image ships no harness

**User Story**: As an operator, I want the API to refuse to boot with an unsafe configuration and the production image to carry no test code or default credential.

**Why P2**: AUTH-6, SUPPLY-1, SUPPLY-2/3, NOTIF-3, KERNEL-3/4.

**Acceptance Criteria**:

1. WHEN `NODE_ENV`, `DATABASE_SSL` or `BREACH_CHECK_ENABLED` is unset THEN boot SHALL fail with a Zod error naming the variable.
2. WHEN `NODE_ENV=production` and `REDIS_URL` is `redis://` without `REDIS_ALLOW_PLAINTEXT=true` THEN boot SHALL fail.
3. WHEN `DATABASE_SSL=require` and `DATABASE_SSL_CA` is set THEN the pool SHALL use it as the trusted CA with `rejectUnauthorized: true`.
4. WHEN `TRUST_PROXY_HOPS` is unset THEN `req.ip` SHALL be the socket address and `X-Forwarded-For` SHALL be ignored; deploy docs SHALL state `2` for Cloudflare → Traefik.
5. WHEN `NODE_ENV=production` and `DOCS_ENABLED` is not `true` THEN `/docs` SHALL respond 404.
6. WHEN the API is built THEN `dist/` SHALL contain no file under `testing/`, `__e2e__/` or `parity/`, and `testing/**` SHALL remain importable by specs.
7. WHEN the image boots with `MASTER_EMAIL`/`MASTER_PASSWORD` THEN the entrypoint SHALL run every `dist/modules/*/seeds/bootstrap.js` and start the server; WHEN the variables are absent THEN boot SHALL proceed; the `legacy-import` step SHALL be removed.
8. WHEN the dev seed runs THEN it SHALL contain no literal password (reads `SEED_MASTER_PASSWORD` or prints a generated one).
9. WHEN `catalog-check` runs THEN an entry whose production code imports from `api/testing/**` SHALL fail the check.
10. WHEN the notification config parses `NODE_ENV=staging` THEN it SHALL accept it (same enum as the kernel).

**Independent Test**: `env.spec.ts` cases for each variable; build probe on `dist`; entrypoint script test with a stub `dist`.

---

### P3: Cheap hardening batch

**User Story**: As a maintainer, I want the one-to-two-line Low findings closed in the same release.

**Why P3**: Individually low impact; together they remove most of the Low list.

**Acceptance Criteria**:

1. WHEN `GET /admin/users?deleted=true` or `GET /admin/tags?deleted=true` is called without `admin.users.trash.read` / `admin.tags.trash.read` THEN system SHALL respond 403.
2. WHEN an anonymous request carries `Idempotency-Key` THEN the scope SHALL include the client IP; WHEN the key is not `^[A-Za-z0-9_-]{1,200}$` THEN system SHALL respond 400.
3. WHEN listing `page` > 10 000 THEN system SHALL respond 400.
4. WHEN `email` > 254, `token` > 128 or `name` > 200 characters THEN system SHALL respond 400.
5. WHEN `DELETE /admin/users/:id`, `POST /admin/users/:id/resend-access-link`, `DELETE /auth/devices/:id` receive an id THEN it SHALL be validated by a params DTO (`min(1).max(64)`).
6. WHEN a permission/area/service id array contains duplicates THEN system SHALL respond 400.
7. WHEN audit `from`/`to` are not ISO datetimes, or `txId` exceeds `Number.MAX_SAFE_INTEGER` THEN system SHALL respond 400.
8. WHEN a notification catalog `link` is not `http(s)` THEN the event data SHALL fail validation.
9. WHEN `multer` is resolved THEN it SHALL be ≥ 2.2.0 with `limits.fields` set on both avatar interceptors; WHEN `pnpm audit --prod --audit-level=high --json` runs on `apps/api` THEN every `high`/`critical` advisory it reports SHALL root in the Out-of-Scope `packages/api-client > axios` chain — no backend dependency is flagged (the raw exit code is 1 while that chain exists; precision fix after Verifier round 1, 2026-08-23).
10. WHEN a sensitive hash column (`sessions.token_hash`, `devices.cookie_token_hash`, `verification_tokens.token_hash`) is captured by the audit trail THEN it SHALL be redacted (new custom migration).
11. WHEN `purge-pending-attachments` deletes THEN the delete SHALL carry `status = 'pending'`; WHEN `confirmUploads` receives more ids than `maxFiles` THEN it SHALL reject before querying.
12. WHEN `Content-Disposition` is built THEN `'`, `(`, `)`, `*` SHALL be percent-encoded and an ASCII `filename=` fallback SHALL precede `filename*`.
13. WHEN a soft-deleted user presents a live session THEN `requireAuth` SHALL throw 403.
14. WHEN `request-email-change` is rejected for an in-use address THEN the cooldown SHALL still be recorded and the 409 `type` SHALL be the same for in-use and deleted-owner cases.
15. WHEN a session is touched less than `SESSION_TOUCH_INTERVAL_SECONDS` after `lastSeenAt` THEN no `UPDATE` SHALL be issued.
16. WHEN `GET /notifications/stream` carries an `Origin` that is not `WEB_ORIGIN` THEN system SHALL respond 403.
17. WHEN CI workflows run THEN every third-party action SHALL be pinned to a commit SHA and each workflow SHALL declare `permissions:`; the OpenAPI description SHALL attribute CSRF to the identity entry.

**Independent Test**: one spec per AC in the owning entry/kernel; `pnpm audit` gate.

---

### P1: The feature lands on the Vitest-only `main` (added 2026-08-22, user decision)

**User Story**: As the template maintainer, I want this branch to merge into `main` after `vitest-migration` landed there, so that no Jest artifact survives and every proof this feature wrote runs in the runner the template ships.

**Why P1**: `main` moved to Vitest (`278dde0`, merge of `feat/vitest-migration`) while waves 1–2 were authored in Jest. Without the port the branch cannot merge, none of its 85 spec files run, and the Final gate would validate nothing.

**Acceptance Criteria**:

1. WHEN `main` (`278dde0` or later) is merged into `feat/security-audit-remediation` THEN the tree SHALL carry no Jest artifact: no `jest.` call and no `@jest/globals` / `ts-jest` import under `apps/api/src`, `apps/api/test`, `catalog/**`; no `apps/api/test/jest-*.json`; no `test*` script in `apps/api/package.json`.
2. WHEN a spec authored by this feature runs THEN it SHALL import `describe/it/expect/vi` from `vitest` (`globals: false`) and `pnpm test`, `pnpm test:int`, `pnpm test:e2e` SHALL exit 0 with at least the wave-2 test count carried over (no spec deleted or skipped to pass).
3. WHEN `pnpm catalog:check` runs (Docker up) THEN every entry's unit, integration and e2e specs SHALL pass inside the rendered child — this is the only place entry `int-spec`/`__e2e__` proofs execute.
4. WHEN `pnpm test:coverage` runs THEN the per-glob floors in `vitest.coverage.mts` SHALL hold; the feature never lowers a floor (AD-027, ratchet-only).
5. WHEN the feature's fail-closed env contract (REM-21..24) meets `main`'s `apps/api/test/setup/{unit,int,e2e}-env.ts` THEN the merged setup files SHALL set every variable the merged `env.ts` and `identity.config.ts` require explicitly, and the six tooling files changed on both sides (`.github/workflows/ci.yml`, `apps/api/package.json`, `apps/api/test/setup/unit-env.ts`, `apps/api/tsconfig.build.json`, `scripts/platform/catalog-check.mjs`, `scripts/platform/lib/child.mjs`) SHALL keep both intents (REM-26, REM-47 probes still empty; `pnpm test:scripts` green).

**Independent Test**: probe for AC 1; the four root gates for ACs 2–4; `pnpm test:scripts` + the two probes for AC 5.

---

## Edge Cases

- WHEN the in-memory fallback is active and Redis returns THEN the Redis bucket SHALL take over, fallback state discarded (no double-count).
- WHEN account and IP buckets both deny THEN the account 429 SHALL be returned (checked first).
- WHEN a batch mixes a valid image and a spoofed part THEN nothing SHALL be persisted and every stored object SHALL be discarded.
- WHEN a `legacy` row is `image/png` THEN it SHALL still be inline (allowlist, not profile).
- WHEN the storage client has no free socket THEN a download SHALL fail 503 within the request timeout, not hang.
- WHEN a payload has no redacted key THEN `markPublished` SHALL leave it untouched; WHEN the actor is master THEN delta/self-scope rules SHALL not apply.
- WHEN `DOCS_ENABLED=true` in production THEN `/docs` SHALL be served (explicit opt-in).

---

## Requirement Traceability

| Requirement ID | Audit ID | Story | Proof | Phase | Status |
| --- | --- | --- | --- | --- | --- |
| REM-01 | AUTH-1 | P1 Login | test | Tasks | Pending |
| REM-02 | AUTH-1 | P1 Login | test | Tasks | Pending |
| REM-03 | AUTH-1 | P1 Login | test | Tasks | Pending |
| REM-04 | AUTH-5 | P1 Login | test | Tasks | Pending |
| REM-05 | AUTH-2 | P1 Login | test | Tasks | Pending |
| REM-06 | adj. guard order | P1 Login | test | Tasks | Pending |
| REM-07 | AUTH-4, AUTH-13 | P1 Login | test | Tasks | Pending |
| REM-08 | UPLOAD-1 | P1 Attach | test | Tasks | Pending |
| REM-09 | UPLOAD-1, UPLOAD-6 | P1 Attach | test | Tasks | Pending |
| REM-10 | UPLOAD-2 | P1 Attach | test | Tasks | Pending |
| REM-11 | UPLOAD-2 (304) | P1 Attach | test | Tasks | Pending |
| REM-12 | UPLOAD-2 | P1 Attach | test | Tasks | Pending |
| REM-13 | UPLOAD-2 adj. | P1 Attach | test | Tasks | Pending |
| REM-14 | UPLOAD-3 | P1 Attach | test | Tasks | Pending |
| REM-15 | UPLOAD-4 | P1 Attach | test | Tasks | Pending |
| REM-16 | AUTH-3 | P2 Secrets | test | Tasks | Pending |
| REM-17 | AUTH-3 | P2 Secrets | test | Tasks | Pending |
| REM-18 | AUTHZ-3 | P2 Secrets | test | Tasks | Pending |
| REM-19 | AUTHZ-1 | P2 Secrets | test | Tasks | Pending |
| REM-20 | KERNEL-3 adj. | P2 Secrets | test | Tasks | Pending |
| REM-21 | KERNEL-3, SUPPLY-2, SUPPLY-3 | P2 Config | test | Tasks | Pending |
| REM-22 | NOTIF-3 | P2 Config | test | Tasks | Pending |
| REM-23 | SUPPLY-2 adj. | P2 Config | test | Tasks | Pending |
| REM-24 | AUTH-6 | P2 Config | test | Tasks | Pending |
| REM-25 | KERNEL-4 | P2 Config | test | Tasks | Pending |
| REM-26 | SUPPLY-1 | P2 Config | probe: `pnpm --filter api build && ! find apps/api/dist \( -path '*/testing/*' -o -path '*/__e2e__/*' -o -path '*/parity/*' \) -print \| grep .` | Tasks | Pending |
| REM-27 | SUPPLY-1 | P2 Config | test | Tasks | Pending |
| REM-28 | SUPPLY-1 | P2 Config | test | Tasks | Pending |
| REM-29 | SUPPLY-1 | P2 Config | test | Tasks | Pending |
| REM-30 | adj. notif NODE_ENV | P2 Config | test | Tasks | Pending |
| REM-31 | AUTHZ-2 | P3 | test | Tasks | Pending |
| REM-32 | KERNEL-1, INPUT-6 | P3 | test | Tasks | Pending |
| REM-33 | KERNEL-6 | P3 | test | Tasks | Pending |
| REM-34 | INPUT-5 | P3 | test | Tasks | Pending |
| REM-35 | INPUT-4 | P3 | test | Tasks | Pending |
| REM-36 | INPUT-3 | P3 | test | Tasks | Pending |
| REM-37 | INPUT-7, INPUT-8 | P3 | test | Tasks | Pending |
| REM-38 | NOTIF-2 | P3 | test | Tasks | Pending |
| REM-39 | SUPPLY-4, SUPPLY-5 | P3 | gate: `cd apps/api && pnpm audit --prod --audit-level=high --json \| jq -e '[.advisories[] \| select(.severity=="high" or .severity=="critical") \| select(.findings[].paths[] \| test("api-client>axios") \| not)] \| length == 0'` (exit 0 = only the Out-of-Scope chain remains) | Tasks | Pending |
| REM-40 | DB-2 | P3 | test | Tasks | Pending |
| REM-41 | UPLOAD-9, DB-5 | P3 | test | Tasks | Pending |
| REM-42 | UPLOAD-10 | P3 | test | Tasks | Pending |
| REM-43 | AUTHZ-8 | P3 | test | Tasks | Pending |
| REM-44 | AUTH-10 | P3 | test | Tasks | Pending |
| REM-45 | AUTH-9 | P3 | test | Tasks | Pending |
| REM-46 | NOTIF-1 | P3 | test | Tasks | Pending |
| REM-47 | SUPPLY-6/7, KERNEL-7 | P3 | probe: `grep -En "uses: .*@v[0-9]" .github/workflows/*.yml \| grep -v '#' ; grep -L "^permissions:" .github/workflows/*.yml` (both empty) | Tasks | Pending |
| REM-48 | — (Vitest port, AC 1) | P1 Port | probe: `grep -rEn "\bjest\.|@jest/globals|ts-jest" apps/api/src apps/api/test catalog --include='*.ts' ; ls apps/api/test/jest-*.json ; grep -En '^\s*"test[^"]*":' apps/api/package.json` (all empty — the last grep matches script keys only, not the `format` glob or the `testcontainers` devDependency) | Tasks | Pending |
| REM-49 | — (Vitest port, AC 2) | P1 Port | gate: `pnpm test && pnpm test:int && pnpm test:e2e` | Tasks | Pending |
| REM-50 | — (Vitest port, AC 3) | P1 Port | gate: `pnpm catalog:check` | Tasks | Pending |
| REM-51 | — (Vitest port, ACs 4–5) | P1 Port | gate: `pnpm test:coverage` + `pnpm test:scripts`; probes REM-26, REM-47 | Tasks | Pending |

Proofs: `test` = assertion in a spec/int-spec/e2e file of the owning entry or kernel; 1 gate; 2 probes.

**Coverage:** 47 total, 47 mapped to tasks (T1–T52; see `tasks.md` § *Requirement Coverage*), 0 unmapped ✅

---

## Success Criteria

- [ ] Every repro in spike.md for a High/Medium finding fails against the fixed code.
- [ ] `pnpm audit --prod --audit-level=high` in `apps/api` reports no high/critical advisory outside the Out-of-Scope `packages/api-client > axios` chain (REM-39 filtered gate exits 0).
- [ ] A kernel-only child boots only with an explicit `NODE_ENV`, `DATABASE_SSL`, `TRUST_PROXY_HOPS` intent; an identity child additionally with `BREACH_CHECK_ENABLED`.
- [ ] Each touched entry has a CHANGELOG entry, version bump and advisory; `docs/dev/template-changelog.md` lists the kernel changes.
