# Context — security-audit-remediation

User decisions captured at Specify (2026-08-22), before the spec was written.

| Gray area | Decision | Consequence |
| --- | --- | --- |
| Scope of "resolve everything" | High + Medium + the Low findings that cost one or two lines. Structural Lows and Infos go to a follow-up spec (`security-hardening-2`). | Spec has 5 stories / 47 requirements; Out of Scope table lists the deferred items. |
| Login protection (AUTH-1 + AUTH-5) | Option 1, done robustly: per-account sliding-window limiter in Redis, independent of IP; when Redis is unreachable, critical auth keys fall back to a per-instance in-memory window with the same limits (never fail open). No DB-backed lockout revival. | New limiter keys + `critical` flag on the rate-limiter port; in-memory fallback implementation; guard order change (CSRF before rate limit). |
| Raw tokens in the outbox (AUTH-3) | Redact on publish: `markPublished` and dead-lettering scrub sensitive keys in `payload`; new maintenance job purges `outbox_dead`. The alternative (publish token id, resolve link at render) was rejected as a contract change of `NotificationRequested`. | Kernel-only change; shared redaction key list with the log redactor. |
| Insecure defaults in already-installed children | Change the defaults (fail closed at boot) and ship `breaking` advisories per entry; no "warn-only" mode. | `NODE_ENV`, `DATABASE_SSL`, `BREACH_CHECK_ENABLED` required; `TRUST_PROXY_HOPS` → 0; `redis://` rejected in production without explicit opt-out; `DOCS_ENABLED` off in production. |

Source: chat session of 2026-08-22 (audit + `AskUserQuestion`).
