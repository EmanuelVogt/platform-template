# v0.2 — Product slots in the base-set — Validation

**Date**: 2026-08-18
**Spec**: `.specs/features/v0-2-product-slots/spec.md`
**Diff range**: `main..HEAD` (`f02cb03`), worktree `.worktrees/v0-2-product-slots`, branch `feat/v0-2-product-slots`
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero
**Rounds**: round 1 at `13125bc` → FAIL (2 gaps) · fix loop 1 (`253ea0d`, `f02cb03`) → re-verified below

**Verdict**: ✅ **PASS** — both round-1 gaps are closed with evidence and both were re-killed by
fresh mutations. Every AC of the five slots is covered, the full gate was green at `13125bc` and the
two touched suites are green at `f02cb03`. The only open items are orchestrator-owned: SWP-01 (issue
#1 comment) and SWP-02 (follow-up issues) in T21, and REL-03 (tag) in T22 — recorded as *pending*,
not as failures.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T20, T23, T24 | ✅ Done | hashes recorded in `tasks.md`; all present in `main..HEAD` |
| Fix loop 1 | ✅ Done | `253ea0d` fix(attachment): unknown stored profile fails loudly on download · `f02cb03` test(notification): e-mail binding errors assert the type in the message |
| T21 | ⏳ Pending | sweep re-run, issue #1 comment, follow-up issues — orchestrator-owned (SWP-01/02) |
| T22 | ⏳ Pending | merge + tag `v0.2.0` — needs explicit user authorization (REL-03) |

---

## Spec-Anchored Acceptance Criteria

### P1: Product registers an access profile

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 product def propagates to all derived sets, no other file edited | product key present in `ACCESS_PROFILES`, `ASSIGNABLE_ACCESS_PROFILES`, `accessProfileSchema`, pgEnum | `shared/kernel/access/define-access-profiles.spec.ts:57-64` — `expect(registry.ACCESS_PROFILES).toEqual(["master","admin","professional","sample","sample_internal"])`; `:67-72` — `expect(registry.ASSIGNABLE_ACCESS_PROFILES).toEqual(["admin","professional","sample"])`; slot at `shared/kernel/access/product-access-profiles.ts:10`; pgEnum derived in `shared/kernel/access/permission.types.ts:7-19` | ✅ PASS |
| AC2 product migration `ADD VALUE` → user persisted and read back unchanged | `accessProfile = "sample"` round-trips through `DrizzleUserRepository` | `identity/infrastructure/repositories/drizzle-user.repository.profile-extension.int-spec.ts:27-29` (`ALTER TYPE identity.access_profile ADD VALUE IF NOT EXISTS 'sample'`); `:64` — `expect(found?.props.accessProfile).toBe("sample")`; `:76` — `expect(rows.rows).toEqual([{ access_profile: "sample" }])` | ✅ PASS |
| AC3 `GET /v1/access-catalog` returns `profiles: [{key,label,assignable}]` | 3 base profiles with pt-BR labels + assignable flags | `test/identity/access-catalog.e2e-spec.ts:85-89` — `expect(body.profiles).toEqual([{key:"master",label:"Master",assignable:false},{key:"admin",label:"Administrador",assignable:true},{key:"professional",label:"Profissional",assignable:true}])`; contract `identity/api/contracts/access-catalog.contract.ts:24-33` | ✅ PASS |
| AC4 `permissionFloor:false` → no module permission required; `true` → ≥1 permission of the profile's module | throw only when floor is required | `identity/application/access-policy.spec.ts:69-76` — exempt `["master","professional"]` + `expect(() => { assertProfileFloor(def.key, []) }).not.toThrow()`; `:78-87` — enforced `["admin"]` + `.toThrow('O perfil de acesso exige ao menos uma permissão do módulo "admin".')`; `define-access-profiles.spec.ts:85-87` — `requiresPermissionFloor("sample")=false` / `("sample_internal")=true` | ✅ PASS |

### P1: Product e-mail type delivered without editing notification

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 registered product type → `Mailer.send({ to: data.email, subject: subject(data), html })`, `idempotencyKey = delivery.id` | exact payload object | `notification/infrastructure/channels/email.channel.spec.ts:113-118` — `expect(send).toHaveBeenCalledWith({ to: payload.email, subject, html: "<html>ok</html>", idempotencyKey: "dlv-1" })`; e2e `test/notifications-product-extension.e2e-spec.ts:127-130` — `expect(message?.to).toBe(email)` / `expect(message?.subject).toBe(\`Bem-vindo, ${name}\`)` / `expect(message?.html).toContain(name)` / `expect(message?.idempotencyKey).toBe(delivery.id)` | ✅ PASS |
| AC2 catalog lists `email` but no binding → delivery fails with an error **naming the type**, never a silent skip | error message contains the type | `email.channel.spec.ts:157-159` — `.rejects.toThrow(EmailBindingMissingError)` **and** `:160-162` — `.rejects.toThrow(/device_revoked/)`; message built at `notification/domain/errors.ts:13` (`tipo de notificação sem binding de e-mail: ${type}`) | ✅ PASS *(round 1: ⚠️ partial — fixed by `f02cb03`)* |
| AC3 `recipient` absent and `data.email` not a string → `MissingRecipient` naming the type | error message contains the type | `email.channel.spec.ts:166-172` — `.rejects.toThrow(EmailRecipientMissingError)` **and** `:173-179` — `.rejects.toThrow(/access_link_sent/)`; guard `email.channel.ts:32-34`; message `errors.ts:21` | ✅ PASS *(round 1: ⚠️ partial — fixed by `f02cb03`)* |
| AC4 all 8 base types keep the v0.1 subject/template; no per-type method or `case` | same subject + template name, generic path | `email.channel.spec.ts:108` `it.each(BASE_EMAIL_CASES)` (table `:12-93`, 8 entries) + `:112` `expect(render).toHaveBeenCalledWith(template, expect.any(Object))` + `:113-118`; `rg 'case "|switch \(' email.channel.ts mailer/*.ts` = **0 matches**; sources data-only at `application/templates/base-template-sources.ts:13-98` | ✅ PASS |
| AC5 `MAIL_TRANSPORT=log` → `LogMailer` logs `to`, `subject`, `idempotencyKey`, every `href` | exact log payload | `notification/infrastructure/mailer/log-mailer.spec.ts:21-26` — `expect(info).toHaveBeenCalledWith("e-mail (dev)", { to:"a@b.com", subject:"Configure seu acesso à plataforma", idempotencyKey:"d1", links:["https://x.test/1","https://x.test/2"] })`; `:36-41` zero-link case `links: []`; impl `log-mailer.ts:25-31` | ✅ PASS |

AD-007 shape verified: `application/templates/notification-template-registry.ts:18-23` — `NotificationTemplateSource { type, catalog, email? }`; registry behaviour at `notification-template-registry.spec.ts:29` (10 base types), `:36` (`email` defined for the 8), `:43` (`undefined` for system-only), `:49-58` (duplicate type throws), `:70-71` (`findByTemplate`).

### P1: Product registers audit metadata

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 `registerRefTargets` → `listAuditEntries` resolves the column to the label | label, not the id | `audit/application/services/audit-registry.spec.ts:108-122` — `expect(registry.refTargetFor("thing_id")).toEqual({column:"thing_id",schema:"sample",table:"things",labelColumn:"name"})`; e2e `test/audit-product-extension.e2e-spec.ts:129-131` — `expect(items[0]?.changes.thing_id?.newLabel).toBe(THING_NAME)`; use case injects the registry at `audit/application/list-audit-entries/list-audit-entries.use-case.ts:54` | ✅ PASS |
| AC2 product table registration → owner lists the trail, `tablesForAggregate(root)` includes satellites, `activityAreaOf(table)` returns the owner's feature | all three | owner lists: `audit-product-extension.e2e-spec.ts:143-144` — `expect(items[0]?.tableName).toBe("things")`, non-owner `:147-153` — `.expect(403)`; `tablesForAggregate`: `audit-registry.spec.ts:66-69` — `expect(registry.tablesForAggregate("permission_templates")).toEqual(["permission_templates","permission_template_permissions"])`; `activityAreaOf`: `audit/application/services/activity-area-resolver.spec.ts:11-13` — `expect(resolver.activityAreaOf("permission_templates")).toEqual(expect.objectContaining({ key: "admin.permission_templates" }))` | ✅ PASS (note: no *product* entry exercises `aggregateRoot`/`technical`; base entries carry both — `audit/domain/base-audit-registrations.ts:16-70` — and enter through the same public `registerTables` (`audit-registry.ts:29`), so the path is byte-identical) |
| AC3 duplicate column or table → registration throws naming it | error names the duplicate | `audit-registry.spec.ts:127-136` — `.toThrow(DuplicateAuditRegistrationError)` + `.toThrow(/users/)`; `:141-160` — `.toThrow(DuplicateAuditRegistrationError)` + `.toThrow(/user_id/)` | ✅ PASS |
| AC4 base-set behaviour unchanged, served through the registry | same owners/satellites/technical/refs as v0.1 | `audit-registry.spec.ts:13-15` audited-table parity; `:29-30` `expect(registry.ownerOf("tags")).toBe("admin.tags.audit.read")`; `:79-81` `expect([...registry.technicalTables()].sort()).toEqual(["devices","sessions","verification_tokens"].sort())`; `:86-98` `refTargetFor("user_id")`/`("professional_user_id")`/`("template_id")` full-object equality | ✅ PASS |

### P1: `attendsGuests` → `servesClients`

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 column renamed by `0004_identity_serves_clients.sql`; zero `attendsGuests\|attends_guests\|hóspede` left | grep count 0 in `apps/api/src`, `openapi.json`, `packages/api-client`; journal `when` monotonic | `apps/api/drizzle/migrations/0004_identity_serves_clients.sql:1` — `ALTER TABLE "identity"."users" RENAME COLUMN "attends_guests" TO "serves_clients";` (journal idx 4); `rg -c "attendsGuests\|attends_guests\|hóspede\|hospede" apps/api/src openapi.json packages/api-client` → **0 files**; `pnpm --filter api db:check:journal` exit 0 | ✅ PASS |
| AC2 `createUser`/`updateUser`/`listUsers` expose `servesClients` with the same semantics/defaults | value round-trips | `test/identity/create-user-flow.e2e-spec.ts:218` — `expect(pedro.servesClients).toBe(true)`; `identity/infrastructure/repositories/drizzle-user.repository.int-spec.ts:63` — `expect((await repo.findById(user.props.id))?.props.servesClients).toBe(true)`; `:71` — `...toBe(false)` after update; entity `identity/domain/entities/user.entity.spec.ts:309/324-325` | ✅ PASS |

### P1: Generic upload profiles + product slot

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 base catalog is exactly the 5 names with design limits; the 3 product profiles gone | exact tuple + per-profile limits/visibility | `attachment/domain/upload-profiles.spec.ts:22-28` — `expect(BASE_UPLOAD_PROFILE_NAMES).toEqual(["avatar","access-link-avatar","document","image","multi"])`; `:36-43` avatar/access-link-avatar/image `{image,5_242_880,1,authenticated}`; `:47-53` document `{any,26_214_400,1,restricted}`; `:57-63` multi `{any,524_288_000,100,restricted}`; `rg` for `credit-receipt\|accommodation-type-image\|report-artifact` in `apps/api/src`, `openapi.json`, `packages/api-client` → 0 | ✅ PASS (recorded deviation T15: `document` limits inherited from the removed `report-artifact`, documented in `upload-profiles.ts:81-82`) |
| AC2 product def → `buildUploadProfiles`, `UploadProfileName`, and (if `uploadRoute`) the route enum include it | merged def + derived tuples | `upload-profiles.spec.ts:90-96` — `expect(profiles["sample-product-thing"]).toEqual({accept:"any",maxBytes:10,maxTotalBytes:10,maxFiles:1,visibility:"restricted"})`; `:115-118` — `expect(UPLOAD_PROFILE_NAMES).toEqual([...BASE_UPLOAD_PROFILE_NAMES, ...productUploadProfiles.map(d => d.key)])`; `:142-149` + `:172-173` — `expect(names).toContain("sample-routable")` / `.not.toContain("sample-internal")`; contract `attachment/api/contracts/attachment.contract.ts:11` — `profile: z.enum(ROUTE_UPLOAD_PROFILE_NAMES)`; int `attachment/application/use-cases/upload-attachment/upload-attachment.use-case.int-spec.ts:131` — `rejects.toBeInstanceOf(PayloadTooLargeError)`; `:137-138` — `expect(found?.props.profile).toBe("sample-doc")` / `expect(found?.props.visibility).toBe("restricted")` | ✅ PASS |
| AC3 migration 0005 → rows with `feedback-attachment` read `multi` | persisted value is `multi` | `apps/api/drizzle/migrations/0005_attachment_generic_upload_profiles.sql:1`; `attachment/infrastructure/repositories/drizzle-attachment.repository.int-spec.ts:113-131` — `expect(found?.props.profile).toBe("multi")` | ✅ PASS |
| AC4 `ATTACHMENT_MULTI_*` honoured; `ATTACHMENT_FEEDBACK_*`/`ATTACHMENT_REPORT_MAX_BYTES` unknown to the schema | parsed values used; old keys absent | `attachment/attachment.config.spec.ts:8-9`, `:14-16` — `expect(parseAttachmentConfig({ATTACHMENT_MULTI_MAX_FILE_BYTES:"2048"}).ATTACHMENT_MULTI_MAX_FILE_BYTES).toBe(2048)`; `:20-22` — `expect(attachmentConfigSchema.shape).not.toHaveProperty("ATTACHMENT_REPORT_MAX_BYTES")` (+ both `FEEDBACK` keys); wiring `upload-profiles.spec.ts:74-76` | ✅ PASS |

### P1: Coverage sweep + release

| Criterion | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| SWP AC1 sweep artifact, one row per file with a verdict; same table commented on issue #1 | artifact + issue comment | `.specs/features/v0-2-product-slots/coverage-sweep.md` — 240 files, 147 `generic ok` / 73 `open slot` / 20 `remove`, one row per file, actions naming T2–T16 | ⏳ Artifact ✅; issue-#1 comment **pending T21** |
| SWP AC2 every `remove`/`open slot` outside the five points links a follow-up issue | issue link per row | rows currently carry the verdict + intended issue text, no links yet | ⏳ Pending T21 |
| REL AC3 all gates green, `openapi.json` in its own regen commit | exit 0 across the gate | see *Gate Check* — 11/11 exit 0, `git diff --exit-code openapi.json packages/api-client` clean after a second `pnpm contract`; regen isolated in `2c3ec748` | ✅ PASS |
| REL AC4 changelog lists every breaking change + child steps; `template.md` lists every slot/registry/port | 5 breaking changes + steps; slots table | `docs/dev/template-changelog.md` v0.2.0 — 5 breaking changes (`servesClients`, upload names + env, `Mailer.send`, template-source shape, access-catalog `profiles`) and 7 migration steps incl. `_journal.json` `when` re-stamp; `docs/dev/template.md:41-57` — 9-row slots table, `:59-68` product `ADD VALUE` snippet + Postgres same-batch caveat, `:70-77` migration numbering (platform from `0004`, product from `1000_`) | ✅ PASS |

### P2: Template smoke

| Criterion | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| SMK AC1 `copier copy` + overlay + `pnpm check && pnpm --filter api test` exit 0 | exit 0 | `scripts/template-smoke.mjs:97-176` (copier gate, `--trust --vcs-ref HEAD`, overlay, install, `pnpm check`, `pnpm --filter api test`, journal check, exit-code propagation); overlay `scripts/smoke/fake-product/slot-appends.json` fills all 3 static slots + `app.module.ts` + `db/schema.ts`; `scripts/smoke/fake-product/files/.../sample.module.ts:30-54` registers the template source and both audit registrations; `.../1000_sample_init.sql:1-6` creates `sample.things` + `ALTER TYPE identity.access_profile ADD VALUE IF NOT EXISTS 'receptionist'`; child assertions `.../sample.spec.ts:9-23`; **`pnpm template:smoke` re-run by the Verifier: exit 0** | ✅ PASS |

**Status**: 22/24 ACs matched the spec outcome · 2 ⏳ pending T21 (orchestrator-owned) · 2 ⚠️ partial evidence (MAIL AC2/AC3)

---

## Edge Cases

- [x] Product profile key collides with a base key → `defineAccessProfiles` throws at import — `define-access-profiles.spec.ts:112-124` — `.toThrow("Perfil de acesso duplicado: admin")`
- [x] Template source registers a duplicate `template`/type → throws — `notification-template-registry.spec.ts:49-58`
- [x] Delivery payload without `locale` → rendering still succeeds — base cases in `email.channel.spec.ts:12-93` render without `locale`
- [x] Child already has migration idx 0004 → journal position decides order; `db:check:journal` guides the `when` fix — documented `docs/dev/template.md:70-77`, gate exit 0
- [x] **Stored attachment with an unknown profile after the rename → download SHALL fail loudly** — honoured as of `253ea0d`. `attachment/api/controllers/download-attachment.controller.ts:58-60` — `if (result.profile !== "legacy" && !(result.profile in this.profiles)) { throw new AttachmentNotFoundError() }`, raised **before** any header or byte is written; `forceDownload` at `:62-63` is back to the strict form (`result.profile in this.profiles` implied, `accept === "any"`). Proof: `test/attachment/attachment-download.e2e-spec.ts:241-268` — seeds `profile: "legacy-profile"`, `.expect(404)`, `expect(res.body.type).toMatch(/\/not-found$/)`, `expect(res.headers["content-disposition"]).toBeUndefined()`. The free-type test at `:208-239` now seeds `profile: "document"` (a real base profile), so it proves the path its title claims.
  - **Is 404 "loudly"? Yes — accepted, not a spec-precision gap.** The spec says "fail loudly (existing behaviour)" without naming a status. `AttachmentNotFoundError` (`attachment/domain/errors.ts:6-13`) is a deliberate `DomainError` with `status = 404` and RFC 7807 `type .../not-found`: non-2xx, no bytes served, no `Content-Disposition`, no leak of the inconsistent internal state. It is strictly better than the previous 500 (an unhandled crash) and it reuses the module's own anti-enumeration convention — the same error the use case throws for "not found" and "denied" (`get-attachment-for-download.use-case.ts:63,70`). The requirement is "does not silently serve the bytes", and that is what the assertion targets.
  - **Non-blocking observation (out of spec scope, no AC touched)**: the throw sits in the controller, so it runs after the use case already recorded the access trail as `allowed` and opened the storage stream (`get-attachment-for-download.use-case.ts:74-77`). The trail therefore logs an allowed download that served nothing, and the unconsumed `Readable` is left to GC. Worth an issue, not a fix task for this feature.

---

## Discrimination Sensor

**Sensor depth**: P0-full (auth policy + migrations + contract) — 7 mutations.

| # | File:line | Mutation | Scoped run | Killed? |
| --- | --- | --- | --- | --- |
| 1 | `notification/infrastructure/channels/email.channel.ts:38` | dropped `idempotencyKey: input.id` from `mailer.send` | `pnpm --filter api test -- email.channel` → exit 1, 8 failed / 4 passed (`Expected "idempotencyKey": "dlv-1", received nothing` at `email.channel.spec.ts:113`) | ✅ Killed |
| 2 | `email.channel.ts:31-34` | recipient fallback returns `""` instead of throwing `EmailRecipientMissingError` | same command → exit 1, 1 failed / 11 passed (`Received promise resolved instead of rejected`) | ✅ Killed |
| 3 | `audit/application/services/audit-registry.ts:35-37` | duplicate table registration no longer throws | `pnpm --filter api test -- audit-registry` → exit 1, 1 failed / 12 passed (`Expected constructor: DuplicateAuditRegistrationError; Received function did not throw`) | ✅ Killed |
| 4 | `shared/kernel/access/define-access-profiles.ts:40-42` | `ASSIGNABLE_ACCESS_PROFILES` drops the `assignable` filter (non-assignable profiles leak in) | `pnpm --filter api test -- define-access-profiles access-policy` → exit 1, 3 failed / 35 passed (`Expected ["admin","professional","sample"] but got ["master","admin","professional","sample","sample_internal"]`) | ✅ Killed |
| 5 | `attachment/domain/upload-profiles.ts:98-109` | `buildUploadProfiles` ignores `productDefs` (base catalog only) | `pnpm --filter api test -- upload-profiles` → exit 1, 2 failed / 11 passed (`Received: undefined` for the product profile) | ✅ Killed |
| 6 | `identity/api/controllers/access-catalog/get-access-catalog.controller.ts:37` | response omits non-assignable profiles from `profiles` | `pnpm --filter api test:e2e -- access-catalog` → exit 1, 1 failed / 2 passed (deep-equality diff on `body.profiles`) | ✅ Killed |
| 7 | `attachment/api/controllers/download-attachment.controller.ts:56-58` | unknown profile no longer forces `Content-Disposition: attachment` | `pnpm --filter api test:e2e -- attachment-download` → exit 1, 1 failed / 4 passed (`Expected "application/octet-stream", Received "image/png"`) | ✅ Killed — but see below |

**Round-1 result**: 7/7 killed. At the time, mutant 7 came with a caveat: it was killed by the *only*
test over that branch, and that test proved the deviated behaviour (unknown profile tolerated) rather
than the spec's — the assertion was load-bearing, the behaviour under it was not. Fix loop 1 removed
the caveat.

### Fix loop 1 — re-mutations at `f02cb03`

| # | File:line | Mutation | Scoped run | Killed? |
| --- | --- | --- | --- | --- |
| R1 | `attachment/api/controllers/download-attachment.controller.ts:58-63` | dropped the `AttachmentNotFoundError` throw; unknown profile falls back to force-download again (the exact round-1 behaviour) | `pnpm --filter api test:e2e -- attachment-download` → exit 1, 1 failed / 5 passed — `perfil desconhecido (removido/renomeado) falha alto em vez de servir octet-stream`: `expected 404 "Not Found", got 200 "OK"` at `:264` | ✅ Killed |
| R2 | `notification/domain/errors.ts:13` | `EmailBindingMissingError` message drops the interpolated type (`super("tipo de notificação sem binding de e-mail")`) | `pnpm --filter api test -- email.channel` → exit 1, 1 failed / 11 passed — `Expected pattern: /device_revoked/ · Received message: "tipo de notificação sem binding de e-mail"` | ✅ Killed |

**Result**: 9/9 mutations killed across both rounds — ✅ PASS. R1 and R2 each target exactly the code a
round-1 gap blamed, and each is now caught by an assertion that did not exist before the fix loop.

Every mutation was injected once, run once through the runner, and restored with
`git checkout -- <file>`; `git status --short` printed nothing after each restore and after the last one
(verified again at the end of fix loop 1).

---

## Gate Check

Single full-suite run, executed once through the runner from the worktree root.

| # | Command | Exit | Counts |
| --- | --- | --- | --- |
| 1 | `pnpm check` | 0 | 5/5 tasks |
| 2 | `pnpm --filter api test` | 0 | **1000 passed / 0 failed**, 144 suites |
| 3 | `pnpm --filter api test:int` | 0 | **342 passed / 0 failed**, 36 suites |
| 4 | `pnpm --filter api test:e2e` | 0 | **122 passed / 0 failed**, 31 suites |
| 5 | `pnpm --filter web test` | 0 | **65 passed / 0 failed**, 19 files |
| 6 | `pnpm --filter web build` | 0 | — |
| 7 | `pnpm --filter api db:check:journal` | 0 | journal `when` monotonic |
| 8 | `pnpm contract` | 0 | — |
| 9 | `git diff --exit-code openapi.json packages/api-client` | 0 | no drift after regen |
| 10 | `command -v copier` | 0 | `/home/emanuel/.local/bin/copier` |
| 11 | `pnpm template:smoke` | 0 | child generated, all slots extended, child gates green |

Fix loop 1 (`253ea0d`, `f02cb03`) touched two files; the two suites covering them were re-run at
`f02cb03` by the Verifier: `pnpm --filter api test -- email.channel` exit 0 (**12 passed**, was 12 with
2 new assertions inside existing tests) and `pnpm --filter api test:e2e -- attachment-download` exit 0
(**6 passed**, was 5 — `+1` for the new unknown-profile test). The worker's own full gate at `f02cb03`
reported unit 1000 / int 342 / e2e 123 / lint 0 / typecheck 0, consistent with the +1 e2e. The full
suite was **not** re-run by the Verifier — the Final gate runs once, at `13125bc`.

- **Test count before feature** (T1 baseline): unit 974 · int 337 · e2e 115 · web 65
- **Test count after**: unit 1000 · int 342 · e2e 122 · web 65
- **Delta**: +26 unit · +5 int · +7 e2e · web unchanged — no suite shrank, nothing skipped
- **Failures**: none
- `git status --short` clean before and after the sensor

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ |
| Matches patterns | ✅ |
| Spec-anchored outcome check (asserted values match spec) | ✅ (round 1 had 2 partials on MAIL AC2/AC3; closed by `f02cb03`) |
| Per-layer Coverage Expectation met | ✅ unit for every `define*`/catalog/registry, int for repositories + migrations, e2e per product-extension flow |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| `module-boundaries.spec.ts` allowlist unchanged | ✅ `git diff main..HEAD -- apps/api/src/modules/module-boundaries.spec.ts` is empty |
| No `eslint-disable`, no `any`, no new `console.` in `src/` | ✅ `console.*` added only in `scripts/template-smoke.mjs` (a Node CLI, outside `src/`); the `apps/api/src/db/*` occurrences are untouched by this branch |
| Vocabulary sweep greps | ✅ `attendsGuests\|attends_guests\|hóspede\|hospede` = 0 and `credit-receipt\|accommodation-type-image\|report-artifact` = 0 across `apps/api/src`, `openapi.json`, `packages/api-client`; `feedback-attachment` survives only in `drizzle-attachment.repository.int-spec.ts:113,119` (the 0005 proof) and in `test/attachment/attachment-download.e2e-spec.ts:224` (see Fix 1) |

Recorded deviations reviewed against the spec:

| Deviation (from `tasks.md`) | Assessment |
| --- | --- |
| T15 `document` limits inherited from the removed `report-artifact` | ✅ Acceptable — spec defers the limits to design; documented in `upload-profiles.ts:81-82` and asserted at `upload-profiles.spec.ts:47-53` |
| T15 added `buildRouteUploadProfileNames` | ✅ Acceptable — mirrors `buildUploadProfileNames`; asserted at `upload-profiles.spec.ts:142-173` |
| T19 `SAMPLE_CATALOG` inlined in the kernel slot file | ✅ Acceptable — required by "kernel never imports `modules/`"; documented as the mechanism at `docs/dev/template.md:50` |
| T19 `AuditRegistry` exposed via `audit/api/facades/audit-registry.facade.ts` | ✅ Acceptable — satisfies AD-009 through the repo's cross-module facade rule; documented at `docs/dev/template.md:53` |
| T24 base-set assertions derive from slot constants | ✅ Acceptable — exact equality kept on `BASE_*` constants, derived sets composed from `BASE + PRODUCT_*` |
| Notification registry class instead of a `NOTIFICATION_TEMPLATE_SOURCES` multi-provider (`SPEC_DEVIATION` at `notification-template-registry.ts:35-38`) | ✅ Acceptable — design-level, justified by Nest having no `multi: true`, precedent cited |
| **T23 controller treats an unknown profile as force-download** | ✅ **Reverted by `253ea0d`** — round 1 flagged it as contradicting the spec Edge Case; the controller now throws `AttachmentNotFoundError` and the e2e fixture seeds a real profile. No deviation remains. |

---

## Fix Plans — round 1 (both RESOLVED in fix loop 1)

### Fix 1 — ✅ RESOLVED by `253ea0d` — Unknown upload profile is silently served instead of failing loudly (was Blocker)

- **Root cause**: T23 (`00d23e0`) resolved the red `attachment-download` e2e by widening
  `download-attachment.controller.ts:56-58` so an unknown profile takes the force-download branch.
  The actual cause of the red test was the fixture: `test/attachment/attachment-download.e2e-spec.ts:224`
  still seeds `profile: "feedback-attachment"`, a name UPL AC1 removes. The production change makes the
  spec's Edge Case ("unknown profile → download SHALL fail loudly") false, and leaves the free-type
  download path (`document`/`multi`) without any e2e.
- **Fix task**: change the e2e fixture at `:224` to a real free-type profile (`document` or `multi`,
  both `accept: "any"`) so the test proves what its title says, and revert
  `download-attachment.controller.ts:56-58` to the strict form
  (`result.profile !== "legacy" && result.profile in this.profiles && this.profiles[result.profile].accept === "any"`,
  or the original loud failure) — mutant 7 shows the assertion kills the strict form only because the
  fixture is the removed name. If the tolerance is genuinely wanted, it needs an AD in `STATE.md` and an
  amendment of the spec's Edge Case, plus a dedicated test asserting the tolerated behaviour on a
  profile name that is not part of the contract.
- **Priority**: Blocker (a spec requirement is contradicted; also a latent gap in the download ACL story)
- **Resolution (`253ea0d`)**: both halves applied. The worker chose the loud failure over the strict
  force-download form and reused the module's existing `AttachmentNotFoundError` (404, anti-enumeration)
  instead of adding a new error class — accepted, see the Edge Cases section for why 404 satisfies "fail
  loudly". Fixture at `:224` now seeds `document`; a new e2e at `:241-268` covers the unknown profile.
  Re-mutation R1 confirms the new assertion is load-bearing.

### Fix 2 — ✅ RESOLVED by `f02cb03` — E-mail error assertions do not check that the message names the type (was Minor)

- **Root cause**: MAIL AC2/AC3 require "an error naming the type"; `email.channel.spec.ts:157` and `:169`
  assert only the error class, so a constructor that dropped the type from the message would survive.
- **Fix task**: add `.toThrow(/device_revoked/)` and `.toThrow(/access_link_sent/)` next to the existing
  class assertions, matching the pattern already used at `audit-registry.spec.ts:136` and `:160`.
- **Priority**: Minor
- **Resolution (`f02cb03`)**: exactly that — `email.channel.spec.ts:160-162` and `:173-179`. Production
  messages already carried the type, so this was a test-only change (no behaviour touched).
  Re-mutation R2 confirms the new assertion is load-bearing.

### Pending (orchestrator-owned, not defects)

- SWP-01 issue-#1 comment and SWP-02 follow-up issue links — T21.
- REL-03 tag `v0.2.0` — T22, needs explicit user authorization.

---

## Requirement Traceability Update

| Requirement | Previous | New |
| --- | --- | --- |
| PROF-01, PROF-02, PROF-03, PROF-04 | Implementing | ✅ Verified |
| MAIL-01, MAIL-02, MAIL-03, MAIL-05 | Implementing | ✅ Verified |
| MAIL-04 | Implementing | ✅ Verified (round 1: partial evidence; closed by `f02cb03`) |
| AUD-01, AUD-02, AUD-03 | Implementing | ✅ Verified |
| REN-01, REN-02 | Implementing | ✅ Verified |
| UPL-01, UPL-02, UPL-03, UPL-04 | Implementing | ✅ Verified |
| REL-01, REL-02 | Implementing | ✅ Verified |
| REL-03 | Implementing | ⏳ Pending T22 (authorization) |
| SWP-01, SWP-02 | Implementing | ⏳ Pending T21 |
| SMK-01 | Implementing | ✅ Verified |
| Edge case "unknown profile on download" | ❌ Needs Fix (round 1) | ✅ Verified (`253ea0d`) |

---

## Summary

**Overall**: ✅ Ready — both round-1 gaps closed and re-killed by fresh mutations; only the two
orchestrator-owned pendings remain (T21 sweep comment + follow-up issues, T22 tag).

**Spec-anchored check**: 22/24 ACs matched the spec outcome · 2 ⏳ pending T21 (orchestrator-owned) · 0 partial · 0 contradicted
**Sensor**: 9/9 mutations killed (7 in round 1 + 2 re-mutations in fix loop 1)
**Gate**: 11/11 commands exit 0 at `13125bc` — unit 1000, int 342, e2e 122, web 65, journal ok, contract idempotent, template smoke green; at `f02cb03` the two touched suites re-run green (email.channel 12, attachment-download 6)

**What works**: all five extension points are real slots — a fake product adds an access profile, a
permission catalog, a notification type with its own template, audit table owners + ref targets, and an
upload profile without editing a single platform file, and the template smoke proves it end to end in a
freshly generated child. The rename is complete across api/contract/client, both migrations are in a
monotonic journal, and the base-set assertions no longer break in a child that fills the slots.

**Issues found and closed**: Fix 1 (unknown-profile download tolerance contradicted the spec Edge Case
and the covering e2e seeded a removed profile name) → `253ea0d` · Fix 2 (e-mail error assertions did not
check the message names the type) → `f02cb03`. Nothing open.

**Carried forward as an issue, not a fix task**: the unknown-profile 404 is raised in the controller
after the use case logged the access as `allowed` and opened the storage stream — see the Edge Cases
section. No AC covers it.

**Next steps**: T21 (sweep comment on issue #1 + follow-up issues), then T22 (merge + tag `v0.2.0`, with
the user's explicit authorization).
