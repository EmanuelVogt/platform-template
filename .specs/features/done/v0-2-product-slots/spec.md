# v0.2 — Product slots in the base-set — Specification

Issue: EmanuelVogt/platform-template#1. Scope: **Large** (5 points, api + contract + migrations + docs; web headless must stay green).

## Problem Statement

`v0.1.0` ships kernel + base-set (identity, audit, attachment, tag, notification) free of product modules, but five places still carry a product decision inside a platform file. A product that needs them edits the platform file and every later `copier update` conflicts there. Template contract: **a product adds files, never edits platform files** — where the platform must be extended it exposes a slot, a registry or a port.

## Goals

- [ ] Each of the 5 points ends as a slot/registry/port a product fills from its own module (or is removed), each with a test proving extension without touching the platform file.
- [ ] `openapi.json` regenerated, Kubb client rebuilt, `apps/web` typecheck/lint/test/build green; `module-boundaries.spec.ts` green.
- [ ] Vocabulary sweep recorded (artifact + comment on issue #1) with a verdict per hit: generic ok / remove / open slot.
- [ ] Tag `v0.2.0` + migration note for children (`copier update` from v0.1.0) in `docs/dev/template-changelog.md`.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Extracting the identity professional slice (scope/commitments ports, assignment/directory facades, 5 satellite tables, `areaIds/serviceIds/schedulingAreaIds`) | v0.3-size change with its own migration story; profile registry makes it a later deletion (AD-002) |
| Fixing every sweep hit outside the five points | verdict + follow-up issue is the deliverable (AD-011) |
| Push channel, per-user notification preferences | untouched seams |
| Rewriting baseline migration 0000 | never rewrite applied migrations |
| Web UI for profiles/uploads | web is headless; product-owned |
| Bumping `package.json` versions | AD-006 |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| `professional` stays a base-set profile in v0.2 | yes (AD-002) | the slice around it is v0.3-size; registry makes later removal a deletion | **n — ask user** |
| Neutral name for `attendsGuests` | `servesClients` / `serves_clients` (AD-003) | issue's own suggestion, verb-phrase boolean style already in use, no product word | n (decided; user may correct) |
| DB representation of access profile | keep DB enum + product `ALTER TYPE … ADD VALUE` (AD-004) | zero platform data migration; trade-off table in design | n |
| Platform post-baseline migrations | 0004+, products from 1000_ (AD-005) | drizzle single journal; `when` re-stamp documented | n |
| Template source shape change | `{ type, catalog, email? }` (AD-007) — breaking for v0.1 products | system-only product types must not need a template | n |
| `access-link-avatar` upload profile | keep (generic identity flow) | identical to `avatar`, distinct ACL story; YAGNI to merge | n |
| Removed upload profiles have no rows in children | true for fresh v0.1.0 products | placeholders were never wired to a route | n |
| Kernel hosts vocabulary + slot for upload profiles (`shared/kernel/upload/`) | yes | domain may import kernel; mirrors `access/` precedent | n |

**Open questions:** none unmarked — the first row is the only one that needs the user before Execute.

## User Stories

### P1: Product registers an access profile ⭐ MVP
As a product developer, I want to add an access profile from my own code so that user management supports my roles without editing identity.
1. WHEN a product appends an `AccessProfileDef` to `PRODUCT_ACCESS_PROFILES` THEN `ACCESS_PROFILES`, `AccessProfile`, `ASSIGNABLE_ACCESS_PROFILES`, `accessProfileSchema` and the pgEnum SHALL include it with no other file edited.
2. WHEN a product migration runs `ALTER TYPE identity.access_profile ADD VALUE IF NOT EXISTS 'x'` THEN a user with `access_profile='x'` SHALL be persisted and read back by `DrizzleUserRepository` unchanged.
3. WHEN `GET /v1/access-catalog` is called THEN the response SHALL contain `profiles: [{ key, label, assignable }]` for every registered profile (base + product).
4. WHEN a profile def has `permissionFloor: false` THEN `assertProfileFloor` SHALL not require a module permission; WHEN `true` it SHALL require ≥1 permission whose module key equals the profile key.
Independent test: unit for `defineAccessProfiles` with a fake def; int-spec ADD VALUE + repository round-trip; e2e access-catalog lists 3 base profiles with pt-BR labels.

### P1: Product e-mail type is delivered without editing notification
1. WHEN a product module registers `{ type, catalog, email: { template, templateDir, subject } }` in `NotificationTemplateSourceRegistry` and a `notification.requested` of that type is published THEN `Mailer.send` SHALL receive `{ to: data.email, subject: subject(data), html }` where html contains the rendered product template inside the shared layout, `idempotencyKey = delivery.id`.
2. WHEN the type has no `email` binding but the catalog lists channel `email` THEN the delivery SHALL fail with an error naming the type (retry/dead-letter path), never a silent skip.
3. WHEN `recipient` is absent and `data.email` is not a string THEN the send SHALL throw a `MissingRecipient` error naming the type.
4. WHEN any of the 8 base e-mail types is delivered THEN the same generic path SHALL produce the same subject/template as v0.1 (`email.channel.ts` and `mailer.ts` contain no per-type method or `case`).
5. WHEN `MAIL_TRANSPORT=log` THEN `LogMailer` SHALL log `to`, `subject`, `idempotencyKey` and every `href` found in the html.
Independent test: e2e with a `FakeProductModule` + fake `MAILER`; unit for `EmailChannel` (binding resolution, defaults, errors); existing e2e updated to the one-method fake.

### P1: Product registers audit metadata
1. WHEN a product module calls `AuditRegistry.registerRefTargets([{ column, schema, table, labelColumn }])` THEN `listAuditEntries` SHALL resolve that column's values to the label.
2. WHEN a product registers `{ schema, table, owner, aggregateRoot?, technical? }` THEN a user holding `owner` SHALL list that table's trail, `tablesForAggregate(root)` SHALL include registered satellites, and `activityAreaOf(table)` SHALL return the owner's feature.
3. WHEN the same column or table is registered twice THEN registration SHALL throw naming it.
4. Base-set behaviour (identity/tag owners, satellites, technical tables, `user_id`/`professional_user_id`/`template_id` refs) SHALL be unchanged and served through the registry.
Independent test: e2e/int with `FakeProductModule` + a `sample.things` table created in the test DB.

### P1: `attendsGuests` renamed to `servesClients`
1. WHEN v0.2 is applied THEN column `identity.users.attends_guests` SHALL be renamed to `serves_clients` by migration `0004_identity_serves_clients.sql` (journal `when` monotonic) and no `attendsGuests|attends_guests|hóspede` remains in `apps/api/src`, `openapi.json`, `packages/api-client`.
2. WHEN `createUser`/`updateUser`/`listUsers` are called THEN the field SHALL be `servesClients` with the same semantics and defaults as before.
Independent test: grep count = 0; existing identity specs pass renamed; e2e create-user round-trip.

### P1: Generic upload profiles + product slot
1. WHEN v0.2 is applied THEN the base catalog SHALL be exactly `avatar`, `access-link-avatar`, `document`, `image`, `multi` with the limits/visibility in design; `credit-receipt`, `accommodation-type-image`, `report-artifact` SHALL not exist.
2. WHEN a product appends an `UploadProfileDef` to `PRODUCT_UPLOAD_PROFILES` THEN `buildUploadProfiles` SHALL include it, `UploadProfileName` SHALL include its key, and (if `uploadRoute: true`) `uploadAttachmentsQuerySchema.profile` SHALL accept it — no other file edited.
3. WHEN migration `0005_attachment_generic_upload_profiles.sql` runs THEN rows with `profile='feedback-attachment'` SHALL read `multi`.
4. WHEN env `ATTACHMENT_MULTI_MAX_FILE_BYTES`/`ATTACHMENT_MULTI_MAX_TOTAL_BYTES` are set THEN `multi` SHALL use them; `ATTACHMENT_FEEDBACK_*`/`ATTACHMENT_REPORT_MAX_BYTES` SHALL be unknown to the config schema.
Independent test: unit for catalog + derived enums with a fake def; int-spec upload use case honoring an injected catalog with a fake profile.

### P1: Coverage sweep + release
1. WHEN the sweep task runs `rg -i` for `guest|hospede|reservation|reserva|agenda|scheduling|hospitality|accommodation|room|service|activity|credit|discount|product|clinic|feedback|report` over `apps/api/src`, `apps/web/src`, `docs`, `.claude`, `.agents`, `AGENTS.md.jinja` THEN `.specs/features/v0-2-product-slots/coverage-sweep.md` SHALL hold one row per file (path, hit words, verdict ∈ {generic ok, remove, open slot}, action/issue) and the same table SHALL be posted as a comment on issue #1 before close.
2. WHEN a verdict is `remove`/`open slot` outside the five points THEN a follow-up issue SHALL exist and be linked in the row.
3. WHEN all tasks are done THEN `pnpm contract`, `pnpm --filter @platform/api-client generate && build`, `pnpm check`, `pnpm test`, `pnpm --filter api test:int`, `pnpm --filter api test:e2e`, `pnpm --filter web build` SHALL be green and `openapi.json` committed in its own regen commit.
4. WHEN v0.2.0 is tagged THEN `docs/dev/template-changelog.md` SHALL list every breaking change and the child migration steps (contract renames, template source shape, `Mailer` port, env renames, journal `when` re-stamp, product migration numbering) and `docs/dev/template.md` SHALL list every slot/registry/port.

### P2: Template smoke proves a fake product extends everything
1. WHEN `scripts/template-smoke.mjs` runs THEN it SHALL `copier copy` into a temp dir, overlay `scripts/smoke/fake-product/` (module registering a profile, permission catalog, notification type + template, ref target + table owner, upload profile, migration `1000_sample_init.sql`), and `pnpm check && pnpm --filter api test` SHALL exit 0.

## Edge Cases

- WHEN a product profile key collides with a base key THEN `defineAccessProfiles` SHALL throw at import.
- WHEN a template source registers a `template` name already used THEN registration SHALL throw (existing behaviour, kept).
- WHEN a delivery payload lacks `locale` THEN rendering SHALL still succeed (locale unused by templates today).
- WHEN a child already has migration idx 0004 THEN both files coexist; order = journal position; `db:check:journal` guides the `when` fix.
- WHEN a stored attachment has an unknown profile after the rename THEN download SHALL fail loudly (existing behaviour) — the data migration prevents it for `feedback-attachment`.

## Implicit-requirement dimensions

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | profile/upload keys via Zod enums; upload limits per def |
| Failure / partial-failure | e-mail errors propagate to delivery retry/dead-letter (existing); registry duplicates throw at boot |
| Idempotency / retry | unchanged: delivery id as provider idempotency key |
| Auth boundaries | audit owner keys gate trail reads; access-catalog stays `@SelfService` |
| Concurrency / ordering | N/A — registrations happen at boot |
| Data lifecycle | migrations 0004/0005 only; no purge changes |
| Observability | LogMailer fields; `notification.requested_handled` log unchanged |
| External-dependency failure | Resend errors → `MailDeliveryError` (unchanged) |
| State-transition integrity | N/A — no state machine touched |

## Requirement Traceability

| ID | Story | Phase | Status |
| --- | --- | --- | --- |
| PROF-01 slot + derived sets | P1 profiles AC1 | Design | Pending |
| PROF-02 DB extension by product migration | AC2 | Design | Pending |
| PROF-03 access-catalog exposes profiles | AC3 | Design | Pending |
| PROF-04 floor policy from def | AC4 | Design | Pending |
| MAIL-01 generic dispatch, no per-type code | P1 e-mail AC1,4 | Design | Pending |
| MAIL-02 transport-only Mailer + LogMailer links | AC5 | Design | Pending |
| MAIL-03 base types via registry, source shape | AC2,4 | Design | Pending |
| MAIL-04 recipient/binding errors | AC2,3 | Design | Pending |
| MAIL-05 fake product e2e | AC1 | Design | Pending |
| AUD-01 ref target registry | P1 audit AC1 | Design | Pending |
| AUD-02 owners/satellites/technical registry | AC2 | Design | Pending |
| AUD-03 duplicates throw, base unchanged | AC3,4 | Design | Pending |
| REN-01 rename api/domain/contract | P1 rename AC1,2 | Design | Pending |
| REN-02 migration 0004 | AC1 | Design | Pending |
| UPL-01 generic base catalog | P1 upload AC1 | Design | Pending |
| UPL-02 slot + derived enums | AC2 | Design | Pending |
| UPL-03 env rename | AC4 | Design | Pending |
| UPL-04 migration 0005 | AC3 | Design | Pending |
| SWP-01 sweep artifact + issue comment | P1 sweep AC1 | Design | Pending |
| SWP-02 follow-up issues | AC2 | Design | Pending |
| REL-01 regen + all gates green | AC3 | Design | Pending |
| REL-02 changelog/migration note + slots doc | AC4 | Design | Pending |
| REL-03 tag v0.2.0 (needs authorization) | AC4 | Design | Pending |
| SMK-01 template smoke | P2 | Design | Pending |

Coverage: 24 total, 0 mapped to tasks (tasks.md pending).

## Success Criteria

- [ ] A fake product module + slot one-liners extend all five points; no platform file besides slot files/composition root touched (smoke green).
- [ ] `module-boundaries.spec.ts` green with no new allowlist entry.
- [ ] Sweep table on issue #1; every non-`generic ok` row links an issue or a v0.2 commit.
