# v0.2 — Product slots — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/v0-2-product-slots/design.md` · **Status**: Executing — Verifier PASS at `f02cb03` (round 2); T21 → T22 left (2026-08-18)
Repo: `~/Projects/platform-template`, worktree `.worktrees/v0-2-product-slots` (crosses api + contract + migrations). Spec artifacts stay on `main`.

## Test Coverage Matrix

> Guidelines found: `docs/code-quality.md` (§Testes), `docs/test/testing.md`, `docs/back/back-arch.md` (§Testes, §Travas), `apps/api/package.json`, `lefthook.yml`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| kernel helpers / domain (`define*`, catalogs, policies) | unit | all branches; 1:1 to spec ACs; fake product entry in every slot test | `apps/api/src/**/<name>.spec.ts` | `pnpm --filter api test` |
| application services / registries / channel | unit | 1:1 ACs + listed edge cases (duplicates, missing binding/recipient) | same | `pnpm --filter api test` |
| repositories / use cases with DB | integration | key paths + product-extension path (ADD VALUE, injected catalog) | `apps/api/src/**/<name>.int-spec.ts` | `pnpm --filter api test:int` |
| controllers / product-extension flows | e2e | happy + error path per new route/flow; FakeProductModule proofs | `apps/api/test/<flow>.e2e-spec.ts` | `pnpm --filter api test:e2e` |
| contract / generated client / web | none — build gate | typecheck + web vitest + build | — | `pnpm contract && pnpm --filter @platform/api-client build && pnpm check && pnpm --filter web test && pnpm --filter web build` |
| migrations | none — gate | journal check + int suite boots migrations | — | `pnpm --filter api db:check:journal` |
| docs / specs / scripts | none | — | — | build gate |

## Gate Check Commands

| Gate | When | Command (from repo root) |
| --- | --- | --- |
| Quick | unit-only tasks | `pnpm --filter api test` |
| Full | tasks with int/e2e | `pnpm --filter api test && pnpm --filter api test:int && pnpm --filter api test:e2e` |
| Build | contract/config/docs tasks, end of phase | `pnpm check && pnpm test && pnpm --filter api db:check:journal` |
| Contract | after regen | `pnpm contract && pnpm --filter @platform/api-client build && pnpm check && pnpm --filter web test && pnpm --filter web build && git diff --exit-code openapi.json` |

Heavy commands go through `shell-runner`. Test counts: record baseline at T1 (`pnpm --filter api test` total) and assert no silent deletion at each gate.

---

## Execution Plan — waves of parallel clusters

Execute is delegated and parallel (`docs/agents/workflow.md`): the orchestrator dispatches **one `spec-worker` per cluster, all clusters of a wave at once**, in the same worktree; each cluster owns disjoint files and commits pathspec-limited. A wave starts only when the previous wave's workers all reported.

| Wave | Cluster | Tasks (in order) | Files owned | Worker tier |
| --- | --- | --- | --- | --- |
| 0 | orchestrator | T1 | `.specs/**` | — |
| 1 | A identity | T2 → T3 → T5 → T6 | `shared/kernel/access/**`, `modules/identity/**`, `src/seeds/**`, `drizzle/migrations/0004_*` + journal, `test/identity/access-catalog.e2e-spec.ts` | opus (migration + policy) |
| 1 | C notification | T7 → T8 → T9 | `modules/notification/**` (src only), `test/setup/fake-mailer.ts` | sonnet |
| 1 | D audit | T11 → T12 → T13 | `modules/audit/**`, `test/audit-product-extension.e2e-spec.ts`, `test/setup/app-factory.ts` (adds `extraModules`) | sonnet |
| 1 | E attachment | T14 → T15 → T16 | `shared/kernel/upload/**`, `modules/attachment/**`, `attachment.config`, `.env.example`, `docs/dev/ambiente-local.md`, `docs/dev/deploy.md.jinja`, `drizzle/migrations/0005_*` + journal (**journal shared with A → E appends its entry after A's; orchestrator serialises the journal edit: A commits 0004 first, E rebases its journal line**) | sonnet |
| 2 | F e2e mailer | T10 | `test/**` mailer fakes (identity e2e files already renamed by A), `test/notifications-product-extension.e2e-spec.ts`, `test/fixtures/**` | sonnet |
| 2 | G contract | T17 | `openapi.json`, `packages/api-client/generated/**`, `apps/web/**` | sonnet |
| 2 | H docs | T4 → T18 | `docs/dev/template.md`, `docs/dev/template-changelog.md`, `docs/back/back-arch.md`, `AGENTS.md.jinja` | sonnet |
| 2.5 | J gate fix | T23 | `apps/api/src/modules/attachment/**`, `apps/api/src/modules/audit-registration/**` (+ the file behind the attachment-download 500) | sonnet |
| 3 | I smoke | T19 → T20 | `scripts/smoke/**`, `scripts/template-smoke.mjs`, `package.json` | sonnet |
| 3→ | orchestrator | Verifier → T21 → T22 | `.specs/**`, GitHub, tag | — |

Only shared file across wave-1 clusters is `drizzle/migrations/meta/_journal.json` (A + E) — resolved by ordering above. Wave 2 waits on wave 1 because T10 edits e2e files A renamed, T17 needs every contract change, T18 documents the final shapes.

```
Wave 0: T1
Wave 1: [A: T2→T3→T5→T6] ‖ [C: T7→T8→T9] ‖ [D: T11→T12→T13] ‖ [E: T14→T15→T16]
Wave 2: [F: T10] ‖ [G: T17] ‖ [H: T4→T18]
Wave 2.5: [J: T23]  (gate debt found by wave 2)
Wave 3: [I: T19→T20] (T24 fix between T19 and T20) → Verifier → T21 → T22
```

---

## Task Breakdown

### T1: Coverage sweep artifact + test baseline
**Status**: ✅ Done — `84cc2c2` (main) — baseline unit 974 / int 337 / e2e 115 / web 65
**What**: run the vocabulary `rg -i` (spec SWP AC1) over `apps/api/src apps/web/src docs .claude .agents AGENTS.md.jinja README.md.jinja`; write `.specs/features/v0-2-product-slots/coverage-sweep.md` with one row per file: path · hit words · verdict (`generic ok` / `remove` / `open slot`) · action (v0.2 task id, or "follow-up issue"). Record unit test count baseline in the file header.
**Where**: `.specs/features/v0-2-product-slots/coverage-sweep.md` (main checkout) · **Depends on**: none · **Requirement**: SWP-01
**Tools**: shell-runner (rg → file), no MCP.
**Done when**: [ ] every file with a hit has exactly one verdict; [ ] hits inside the five points' files reference T2–T16; [ ] `docs/back/back-arch.md` product-module references marked `remove`; [ ] baseline counts recorded.
**Tests**: none · **Gate**: none (artifact) · **Commit**: `docs(specs): coverage sweep for v0.2 product slots`

### T2: Access profile types + `defineAccessProfiles` + slot file
**Status**: ✅ Done — `059b6c7`
**What**: create `shared/kernel/access/access-profile.types.ts` (`AccessProfileDef`, `BASE_ACCESS_PROFILES`), `define-access-profiles.ts` (per design §1, duplicate → throw), `product-access-profiles.ts` slot; derive `ACCESS_PROFILES`/`ASSIGNABLE_ACCESS_PROFILES`/types in `permission.types.ts` keeping export names.
**Where**: `apps/api/src/shared/kernel/access/` · **Depends on**: T1 · **Reuses**: `define-permission-catalog.ts` · **Requirement**: PROF-01, PROF-04
**Done when**: [ ] `define-access-profiles.spec.ts`: base tuples equal today's, fake def `{key:"sample",assignable:true,permissionFloor:false}` appears in both tuples, duplicate throws, `requiresPermissionFloor` per def; [ ] `pnpm --filter api test` green, count ≥ baseline+4.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(kernel): access profile registry with product slot`

### T3: Identity consumes the profile registry + access-catalog exposes profiles
**Status**: ✅ Done — `3244d2e`
**What**: `user.table.ts` pgEnum from `ACCESS_PROFILES`; `access-policy.assertProfileFloor` via `requiresPermissionFloor`; `access-catalog.contract.ts` + controller add `profiles: [{key,label,assignable}]`; int-spec `drizzle-user.repository.profile-extension.int-spec.ts`: `ALTER TYPE identity.access_profile ADD VALUE IF NOT EXISTS 'sample'` (own connection, outside tx), insert via repository with `accessProfile: "sample" as AccessProfile`, read back equal.
**Where**: `apps/api/src/modules/identity/{infrastructure/tables/user.table.ts,application/access-policy.ts,api/contracts/access-catalog.contract.ts,api/controllers/access-catalog/get-access-catalog.controller.ts,infrastructure/repositories/}` · **Depends on**: T2 · **Requirement**: PROF-02, PROF-03, PROF-04
**Done when**: [ ] `access-policy.spec.ts` covers floor true/false via defs; [ ] int-spec above green; [ ] e2e `test/identity/access-catalog.e2e-spec.ts` asserts 3 base profiles with labels `Master|Administrador|Profissional` and `assignable` flags; [ ] full gate green.
**Tests**: integration + e2e · **Gate**: full · **Commit**: `feat(identity): profiles from registry; access-catalog lists profiles`

### T4: Slots doc — profiles + permission catalogs section
**Status**: ✅ Done — `4cfd918`
**What**: add "Slots e registries" table to `docs/dev/template.md` with the profile + permission rows (other rows filled by later tasks), incl. product migration snippet and the `ADD VALUE` same-batch caveat.
**Where**: `docs/dev/template.md` · **Depends on**: T3 · **Requirement**: REL-02
**Done when**: [ ] section present, pt-BR, ≤ 30 lines; [ ] `pnpm format:check` passes for the file.
**Tests**: none · **Gate**: build (docs only → prettier) · **Commit**: `docs(template): slots table — access profiles, permission catalogs`

### T5: Migration 0004 rename column
**Status**: ✅ Done — `0ba7607` (journal idx 4, when 1797062480194)
**What**: `apps/api/drizzle/migrations/0004_identity_serves_clients.sql` (`ALTER TABLE "identity"."users" RENAME COLUMN "attends_guests" TO "serves_clients";`) + journal entry idx 4, `when` = previous + 10_000_000.
**Where**: `apps/api/drizzle/migrations/` · **Depends on**: T1 · **Requirement**: REN-02
**Done when**: [ ] `pnpm --filter api db:check:journal` green; [ ] `pnpm --filter api test:int` boots migrations green (before T6 the drizzle column still says `attends_guests` → run T5+T6 gates together: this task's gate is journal only).
**Tests**: none · **Gate**: `pnpm --filter api db:check:journal` · **Commit**: `feat(identity): migration 0004 rename attends_guests to serves_clients`

### T6: Rename `attendsGuests` → `servesClients` across api
**Status**: ✅ Done — `700d443` + `706cee9` (orchestrator: `test/setup/seed-user.ts` rename, outside A ownership)
**What**: rename prop/column/contract/use-case/facade/seed/spec occurrences (≈39 files); reword `user.table.ts` comment (no "hóspede"); keep semantics/defaults.
**Where**: `apps/api/src/modules/identity/**`, `apps/api/src/seeds/*` · **Depends on**: T5 · **Requirement**: REN-01
**Done when**: [ ] `rg -c "attendsGuests|attends_guests|hóspede|hospede" apps/api/src` = 0; [ ] full gate green with test count unchanged; [ ] `test/identity/create-user-flow.e2e-spec.ts` round-trips `servesClients: true`.
**Tests**: existing unit + int + e2e renamed · **Gate**: full · **Commit**: `refactor(identity): rename attendsGuests to servesClients`

### T7: `Mailer.send` transport port + Resend/Log adapters
**Status**: ✅ Done — `ac515d5`
**What**: `EmailMessage` + one-method `Mailer`; `ResendMailer.send` (no renderer, keeps idempotency + `MailDeliveryError`); `LogMailer.send` logs `to, subject, idempotencyKey, links[]`; MAILER factory drops renderer inject; shared `test/setup/fake-mailer.ts` (`fakeMailer(): Mailer & { sent: EmailMessage[] }`).
**Where**: `notification/domain/ports/mailer.ts`, `infrastructure/mailer/{resend-mailer,log-mailer}.ts`, `notification.module.ts`, `apps/api/test/setup/fake-mailer.ts` · **Depends on**: T1 · **Requirement**: MAIL-02
**Done when**: [ ] `resend-mailer.spec.ts`: sends `{from,to,subject,html}` + idempotencyKey option, error → `MailDeliveryError`; [ ] `log-mailer.spec.ts`: log fields incl. extracted hrefs (2 links case, 0 links case); [ ] typecheck of api may be red until T9 → this task's gate is unit only for the two specs (`pnpm --filter api test -- mailer`).
**Tests**: unit · **Gate**: quick (scoped) · **Commit**: `refactor(notification): mailer is transport-only`

### T8: Template source shape `{type,catalog,email?}` + base sources via registry + renderer resolve
**Status**: ✅ Done — `4837b35`
**What**: port types per design §2; registry seeded from `application/templates/base-template-sources.ts` (8 e-mail + 2 system-only); handler resolves catalog via registry only; renderer drops `BODIES`, resolves via `findByTemplate` with default dir.
**Where**: `notification/domain/ports/notification-template-source.port.ts`, `application/templates/{notification-template-registry,base-template-sources}.ts`, `application/event-handlers/external/notification-requested.handler.ts`, `infrastructure/mailer/handlebars-template-renderer.ts` · **Depends on**: T7 · **Requirement**: MAIL-03
**Done when**: [ ] `notification-template-registry.spec.ts`: 10 base types present, e-mail types have `email`, system-only don't, duplicate type throws, `findByTemplate`; [ ] `handlebars-template-renderer.spec.ts`: base template via default dir, product template via `templateDir`, unknown throws; [ ] handler spec: product type resolved through registry, unknown type throws.
**Tests**: unit · **Gate**: quick · **Commit**: `feat(notification): base e-mail types registered as template sources`

### T9: Generic `EmailChannel` + delete per-type payloads
**Status**: ✅ Done — `9d1666c` — e2e mailer fakes in 10 files broken until T10 (expected)
**What**: `EmailChannel.send` per design §2 (binding → recipient → subject → render → `mailer.send`); errors `EmailBindingMissingError`, `EmailRecipientMissingError` in `domain/errors.ts`; delete `domain/notification-payloads.ts`.
**Where**: `notification/infrastructure/channels/email.channel.ts`, `notification/domain/errors.ts` · **Depends on**: T8 · **Requirement**: MAIL-01, MAIL-04
**Done when**: [ ] `email.channel.spec.ts`: each of the 8 base types yields the v0.1 subject + template name (table-driven), `recipient` override, `view` applied, missing binding throws, non-string recipient throws, `idempotencyKey = input.id`; [ ] `rg -c "case \"" email.channel.ts` = 0; [ ] api typecheck green.
**Tests**: unit · **Gate**: quick + `pnpm --filter api typecheck` · **Commit**: `feat(notification): generic e-mail dispatch from template source`

### T10: E2E — one-method fakes + product extension proof
**Status**: ✅ Done — `bf73446` — unit 999 / int 342 / e2e 121 passed; typecheck green; `sent[]` filtered by recipient(+subject) in create-user-flow/verify-email (concurrent `device_new_login` mail); surfaced pre-existing failure `test/attachment/attachment-download.e2e-spec.ts:231` (500 vs 200, "perfil de tipo livre") → fix task before wave 3
**What**: switch 10 e2e files to `fakeMailer()`; `notifications-email.e2e-spec.ts` asserts `sent[]` (to/subject/idempotencyKey); new `test/notifications-product-extension.e2e-spec.ts` with `FakeProductModule` (`declare module` adds `"sample_welcome"`; registers source with `templateDir` = `test/fixtures/sample-templates`, `sample-welcome.hbs`) using `createE2eApp({ extraModules })` from T13.
**Where**: `apps/api/test/**`, `apps/api/test/fixtures/sample-templates/` · **Depends on**: T9, T6, T13 · **Requirement**: MAIL-05
**Done when**: [ ] product e2e: mailer receives `{to: data.email, subject: "Bem-vindo, Ana", html ⊃ "Ana", idempotencyKey = delivery id}`; [ ] full gate green; e2e count ≥ baseline+1.
**Tests**: e2e · **Gate**: full · **Commit**: `test(notification): product module registers an e-mail type end to end`

### T11: `AuditRegistry` service with base registrations
**Status**: ✅ Done — `60a77bc`
**What**: `audit/application/services/audit-registry.ts` per design §3; `audit/domain/base-audit-registrations.ts` (data of today's 4 constants); `audit.module.ts` provides + exports it.
**Where**: `apps/api/src/modules/audit/` · **Depends on**: T1 · **Requirement**: AUD-01, AUD-02, AUD-03
**Done when**: [ ] `audit-registry.spec.ts`: base parity for `ownerOf`/`allowedTables`/`tablesForAggregate`/`technicalTables`/`refTargetFor` (values copied from today's specs), product entries (`sample.things` + `thing_id`), duplicate table and duplicate column throw, AUDITED consistency (every AUDITED table has an owner).
**Tests**: unit · **Gate**: quick · **Commit**: `feat(audit): registry for table owners, aggregates and ref targets`

### T12: Audit consumers read the registry
**Status**: ✅ Done — `b4e202f`
**What**: `list-audit-entries.use-case.ts` injects registry; `activity-area.ts` → `ActivityAreaResolver` service consumed by `usage-activity.facade` + `drizzle-activity-stats.reader`; delete `ref-columns.ts`, `table-owners.ts`, `aggregate-registry.ts` and move their specs' cases into T11's spec.
**Where**: `audit/application/**`, `audit/api/facades/usage-activity.facade.ts`, `audit/infrastructure/repositories/drizzle-activity-stats.reader.ts` · **Depends on**: T11 · **Requirement**: AUD-03
**Done when**: [ ] `list-audit-entries.use-case.spec.ts` + `usage-activity.facade.spec.ts` green with registry doubles; [ ] `module-boundaries.spec.ts` green; [ ] full gate green (int specs of activity stats).
**Tests**: unit + integration (existing) · **Gate**: full · **Commit**: `refactor(audit): consumers resolve owners and refs through the registry`

### T13: E2E — product registers audit metadata
**Status**: ✅ Done — `0972321` — e2e was red only via seed-user (fixed 706cee9)
**What**: `createE2eApp` gains `extraModules?: Type<unknown>[]` (imported alongside `AppModule`); `test/audit-product-extension.e2e-spec.ts` with `FakeProductModule` (`OnModuleInit` registers `sample.things` owned by `admin.users.audit.read`, ref `thing_id → sample.things.name`); test creates schema/table + `audit.audit_entries` row via raw SQL; master lists it with label; user with the owner key lists; user without → 403.
**Where**: `apps/api/test/setup/app-factory.ts`, `apps/api/test/audit-product-extension.e2e-spec.ts` · **Depends on**: T12 · **Requirement**: AUD-01, AUD-02
**Done when**: [ ] 3 assertions above green; [ ] full gate green.
**Tests**: e2e · **Gate**: full · **Commit**: `test(audit): product module registers owner and ref target end to end`

### T14: Upload profile kernel types + slot
**Status**: ✅ Done — `5073397`
**What**: `shared/kernel/upload/upload-profile.types.ts` (`UploadProfileDef`), `product-upload-profiles.ts` slot.
**Where**: `apps/api/src/shared/kernel/upload/` · **Depends on**: T1 · **Requirement**: UPL-02
**Done when**: [ ] files exist with doc comment mirroring `product-permission-catalogs.ts`; [ ] `pnpm --filter api typecheck` green.
**Tests**: none (types) · **Gate**: build (typecheck) · **Commit**: `feat(kernel): upload profile slot`

### T15: Generic base upload catalog + derived contract enum + env rename
**Status**: ✅ Done — `30fd7f7` — deviations: `document` limits taken from former report-artifact (any/26_214_400/1/restricted); added `buildRouteUploadProfileNames(productDefs?)`; no env docs needed edits (no old vars mentioned)
**What**: `upload-profiles.ts` per design §5 (`BASE_UPLOAD_PROFILE_NAMES`, `UPLOAD_PROFILE_NAMES`, `ROUTE_UPLOAD_PROFILE_NAMES`, `buildUploadProfiles(config, productDefs = PRODUCT_UPLOAD_PROFILES)`); contract `profile: z.enum(ROUTE_UPLOAD_PROFILE_NAMES)`; `attachment.config.ts` env renames; `.env.example`, `docs/dev/ambiente-local.md`, `docs/dev/deploy.md.jinja` updated.
**Where**: `attachment/domain/upload-profiles.ts`, `attachment/api/contracts/attachment.contract.ts`, `attachment/attachment.config.ts`, env/docs · **Depends on**: T14 · **Requirement**: UPL-01, UPL-02, UPL-03
**Done when**: [ ] `upload-profiles.spec.ts`: catalog keys exactly the 5 base, limits/visibility per design, fake product def merged and `ROUTE_UPLOAD_PROFILE_NAMES` includes it iff `uploadRoute`, `isUploadProfileName`; [ ] `attachment.config.spec` rejects old env names? (no — unknown env ignored) → asserts new names parsed and `ATTACHMENT_REPORT_MAX_BYTES` absent from schema; [ ] `rg -c "credit-receipt|accommodation-type-image|report-artifact|feedback-attachment" apps/api/src` = 0 (except 0005 migration + changelog); [ ] int-spec `upload-attachment.use-case.int-spec.ts` with injected catalog containing `sample-doc` (any, 10 bytes, 1 file, restricted): 11-byte upload → `PayloadTooLargeError`, 10-byte ok with `visibility: restricted`.
**Tests**: unit + integration · **Gate**: full · **Commit**: `feat(attachment): generic upload profiles with product slot`

### T16: Migration 0005 profile data rename
**Status**: ✅ Done — `291d7d3` (journal idx 5)
**What**: `0005_attachment_generic_upload_profiles.sql` (`UPDATE "attachment"."attachments" SET "profile"='multi' WHERE "profile"='feedback-attachment';`) + journal idx 5.
**Where**: `apps/api/drizzle/migrations/` · **Depends on**: T15 · **Requirement**: UPL-04
**Done when**: [ ] `db:check:journal` green; [ ] int-spec `drizzle-attachment.repository.int-spec.ts` case: row inserted as `feedback-attachment` before running the 0005 SQL reads `multi` after (execute the migration file's SQL in the test).
**Tests**: integration · **Gate**: full · **Commit**: `feat(attachment): migration 0005 renames feedback-attachment rows to multi`

### T17: Contract regen + web green
**Status**: ✅ Done — `2c3ec748` — no web fallout (skeleton web); needed local `apps/api/.env` (gitignored); note: `pnpm check` red on 14 api lint errors (attachment/audit/notification + 1 e2e) → fix task before wave 3
**What**: `pnpm contract`, `pnpm --filter @platform/api-client build`; fix web fallout (`router.test.tsx` fixture if any); commit `openapi.json` + `generated/` alone.
**Where**: `openapi.json`, `packages/api-client/generated/**`, `apps/web/**` · **Depends on**: T3, T6, T15 · **Requirement**: REL-01
**Done when**: [ ] contract gate green; [ ] `rg -c "attendsGuests|feedback-attachment" openapi.json packages/api-client/generated` = 0; [ ] `access-catalog` schema has `profiles`; [ ] `git diff --exit-code openapi.json` after a second `pnpm contract`.
**Tests**: none (build gate) · **Gate**: contract · **Commit**: `chore(contract): regenerate openapi + api-client for v0.2`

### T18: Slots table complete + template changelog with child migration note
**Status**: ✅ Done — `a8eea19` — back-arch.md unchanged (no `remove` hit inside the five points' sections; whole-doc verdict → follow-up issue in T21); AGENTS.md.jinja outside prettier scope
**What**: finish `docs/dev/template.md` slots table (notification, audit, upload, routes, identity forRoot, schema aggregator, migrations numbering AD-005); create `docs/dev/template-changelog.md` `v0.2.0`: breaking (`servesClients`, upload profile names/env, `Mailer.send`, template source shape, access-catalog `profiles`), steps (`copier update`, resolve `_journal.json` merge + `when` re-stamp, `pnpm install`, `pnpm contract`, update mailer fakes/sources, env vars, run migrations); update `docs/back/back-arch.md` lines flagged `remove` in T1 that sit inside the five points' sections; `AGENTS.md.jinja` mention of the changelog.
**Where**: `docs/dev/template.md`, `docs/dev/template-changelog.md`, `docs/back/back-arch.md`, `AGENTS.md.jinja` · **Depends on**: T17 · **Requirement**: REL-02
**Done when**: [ ] every slot/registry/port from design has a row; [ ] changelog lists all 5 breaking changes with a step each; [ ] prettier passes.
**Tests**: none · **Gate**: build · **Commit**: `docs(template): v0.2.0 slots table and child migration note`

### T23: Wave-2 gate fixes — api lint + attachment-download 500
**Status**: ✅ Done — `00d23e0` (controller treated unknown/renamed profile as force-download instead of throwing) `68ae46f` `4d848f4` (UploadProfileName derived from tuple `[...BASE, ...ProductKey[]]`, no never-union; sonnet first attempt dropped the product key → redone by opus) `a61a24f` — lint 0, unit 1000, int 342, e2e 122/122; actual paths were `modules/audit/**` (no `audit-registration` module)
**What**: (a) `pnpm --filter api lint` = 13 errors, all in `apps/api/src/modules/attachment/attachment.config.ts` (import order L4/L5/L17; `never` overridden in union L12; unnecessary assertion L105) and `apps/api/src/modules/audit-registration/audit-registration.{resolver,types}.ts` (import order; void expression in arrow shorthand L50/128/133/142/152; template literal with `unknown` L143) — fix without `eslint-disable`; (b) e2e `test/attachment/attachment-download.e2e-spec.ts:231` "força download e nosniff em anexo de perfil de tipo livre" gets 500 instead of 200 — reproduces alone (`pnpm --filter api test:e2e -- attachment-download`, log `/tmp/claude-1000/w2-attach.log`); pre-existing since wave 1 E (T15 `document` profile: accept `any`, forced download + nosniff), root cause in `apps/api/src/modules/attachment/**` — do NOT weaken the test.
**Where**: files above · **Depends on**: T10, T17 · **Requirement**: REL-01 (gates green)
**Done when**: [ ] `pnpm --filter api lint` exit 0; [ ] `pnpm --filter api test:e2e` 122/122; [ ] unit ≥ 999, int ≥ 342, `module-boundaries.spec.ts` green with NO new allowlist entry.
**Tests**: existing · **Gate**: full · **Commit**: two commits — `fix(attachment): download of free-type profile returns the file` (+ `style(api): lint fixes in attachment config and audit registration` — or `fix(...)` if a lint error is a real bug)

### T19: Template smoke — fake product overlay
**Status**: ✅ Done — `af7253f` `7dc95a7` `295c3ed` `b8edcff` + `e1840fa` fix(audit): `AuditRegistry` re-exported via `audit/api/facades/audit-registry.facade.ts` (cross-module rule; AD-009 "exported by AuditModule" satisfied through the facade); SPEC_DEVIATION: `SAMPLE_CATALOG` declared inline in the kernel slot file (kernel never imports `modules/`); copier needs `--trust --vcs-ref HEAD`
**What**: `scripts/smoke/fake-product/` overlay: `apps/api/src/modules/sample/sample.module.ts` (+ template source, audit registrations, `declare module` augmentations, permission catalog `SAMPLE_CATALOG`), `sample-welcome.hbs`, `1000_sample_init.sql` (`CREATE SCHEMA sample; CREATE TABLE sample.things…; ALTER TYPE identity.access_profile ADD VALUE IF NOT EXISTS 'receptionist';`), `slot-appends.json` (lines to append to the 3 slot files + `app.module.ts` import + `db/schema.ts` export + journal entry), `sample.spec.ts` asserting the derived sets contain the sample entries.
**Where**: `scripts/smoke/fake-product/**` · **Depends on**: T18 · **Requirement**: SMK-01
**Done when**: [ ] overlay files lint-clean when copied into a child (verified by T20).
**Tests**: none here (verified by T20) · **Gate**: build · **Commit**: `chore(smoke): fake product overlay for template smoke`

### T24: Base-set assertions extension-agnostic (found by T20 smoke)
**Status**: ✅ Done — `d192bf9` — base exact-equality moved to BASE constants; derived sets = `[...BASE, ...PRODUCT_*]`; unit 1000/0, lint 0, typecheck 0
**What**: 8 platform unit assertions equal DERIVED sets to base literals, so they fail in a child with product entries: `shared/kernel/access/define-access-profiles.spec.ts:29,33`, `identity/application/access-policy.spec.ts:71`, `identity/domain/permissions/permission-catalog.spec.ts:136`, `attachment/domain/upload-profiles.spec.ts:113,143`. Keep exact equality on BASE constants (spec), derive expected DERIVED sets from `BASE + PRODUCT_*` slot constants.
**Where**: those 4 spec files · **Depends on**: T19 · **Requirement**: SMK-01
**Done when**: [ ] unit ≥ 1000 / 0 failed; [ ] no assertion depends on empty slots; [ ] nothing deleted/skipped.
**Tests**: unit · **Gate**: quick · **Commit**: `test(api): base-set assertions derive from slot constants`

### T20: Template smoke runner
**Status**: ✅ Done — `3e1b22d` — smoke exit 0 (child unit 1004 = 1000 + 4 sample.spec), negative check exit 2, ~50s/run; docs follow-up commit in worktree: template.md rows → facade paths + inline catalog
**What**: `scripts/template-smoke.mjs`: requires `copier`; `copier copy --defaults --data project_name=Demo --data github_org=acme . <tmp>`; applies overlay (copy files, append slot lines, add journal entry with `when` = max+10_000_000); runs `pnpm check && pnpm --filter api test` in the child; exit code propagates; root `package.json` script `template:smoke`.
**Where**: `scripts/template-smoke.mjs`, `package.json` · **Depends on**: T19 · **Requirement**: SMK-01
**Done when**: [ ] `pnpm template:smoke` exits 0 locally (shell-runner, ≥ 5 min); [ ] failure of any child gate exits ≠ 0 (verify by breaking one slot line once, then restore).
**Tests**: none (script is the test) · **Gate**: `pnpm template:smoke` · **Commit**: `chore(smoke): template smoke generates a child and extends every slot`

### T25: Verifier round-1 gaps — fail-loudly download + typed error messages
**Status**: ✅ Done — `253ea0d` (controller widening of T23 reverted; unknown stored profile → `AttachmentNotFoundError` 404, anti-enumeration; e2e fixture `feedback-attachment` → `document`; new e2e for unknown profile) `f02cb03` (email.channel.spec asserts type in message) — unit 1000 / int 342 / e2e 123
**What**: Verifier gap 1 (spec Edge Case "unknown profile after rename → download SHALL fail loudly" contradicted by T23; real cause = stale fixture) and gap 2 (MAIL AC2/AC3 assertions did not check the type in the message).
**Where**: `attachment/api/controllers/download-attachment.controller.ts`, `test/attachment/attachment-download.e2e-spec.ts`, `notification/infrastructure/channels/email.channel.spec.ts` · **Depends on**: Verifier round 1 · **Requirement**: UPL edge case, MAIL-02/03
**Done when**: [x] full gate green; [x] fail-loudly e2e; [x] type in error assertions.
**Tests**: e2e + unit · **Gate**: full · **Commit**: two, above

### T21: Final sweep + issue comment + follow-up issues
**Status**: ✅ Done — issues #2–#8 (identity professional v0.3, back-arch, front-arch, issue-tracker taxonomy, test fixtures, cosmetic leftovers, download trail/stream before 404), comment https://github.com/EmanuelVogt/platform-template/issues/1#issuecomment-5336905460; sweep 227 files (was 240), 21 resolved
**What**: re-run T1's sweep on the finished branch; update `coverage-sweep.md` (v0.2 rows → commit hashes); create one GitHub issue per remaining `remove`/`open slot` cluster (identity professional slice → v0.3; docs product references; others) via `gh issue create` (creating-issues skill), link in rows; post the table as a comment on issue #1 (`gh issue comment 1 -F`).
**Where**: `.specs/features/v0-2-product-slots/coverage-sweep.md`, GitHub · **Depends on**: T20 · **Requirement**: SWP-01, SWP-02
**Done when**: [ ] comment visible on #1; [ ] every non-`generic ok` row has an issue link or commit hash.
**Tests**: none · **Gate**: none · **Commit**: `docs(specs): final coverage sweep verdicts`

### T22: Merge + tag v0.2.0 (needs explicit user authorization)
**What**: merge worktree branch into `main` locally (`merge:` commit), verify build gate on `main`, then — only with the user's explicit ok — `git tag v0.2.0` and `git push --tags` (+ push main).
**Where**: repo root · **Depends on**: T21 · **Requirement**: REL-03
**Done when**: [ ] build + contract gates green on `main`; [ ] tag exists and is pushed after authorization; [ ] `.specs/features/v0-2-product-slots/` moved to `.specs/features/done/`.
**Tests**: none · **Gate**: build + contract · **Commit**: `merge: feat/v0-2-product-slots — five product slots, sweep, v0.2.0`

---

## Phase Execution Map

See "Execution Plan — waves of parallel clusters" above. Wave 1 = 4 workers in parallel (A/C/D/E), wave 2 = 3 (F/G/H), wave 3 = 1 (I) then Verifier (`spec-verifier`, opus — touches auth/policy + migrations) and the orchestrator-only T21/T22. Worker payload = the cluster's tasks pasted whole + the one-line decisions it needs from STATE.md; workers never read STATE.md, never touch `.specs/`, commit pathspec-limited to their owned files.

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 artifact | ✅ |
| T2 | 3 kernel files, one concept | ✅ cohesive |
| T3 | identity consumers of one registry + 2 tests | ⚠️ cohesive (single concept) |
| T4, T18 | docs | ✅ |
| T5, T16 | 1 migration each | ✅ |
| T6 | one rename across a module | ✅ (rename = one commit by rule) |
| T7 | one port + 2 adapters + fake | ✅ cohesive |
| T8 | registry shape + base sources + renderer | ⚠️ one dependency chain (shape change forces all three) |
| T9 | 1 class | ✅ |
| T10, T13 | e2e | ✅ |
| T11 | 1 service | ✅ |
| T12 | consumers of one service | ✅ |
| T14 | 2 kernel files | ✅ |
| T15 | catalog + contract + config/env | ⚠️ cohesive (env names feed the catalog) |
| T17 | regen | ✅ |
| T19, T20 | overlay / runner | ✅ |
| T21, T22 | sweep / release | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends on (body) | Diagram | Status |
| --- | --- | --- | --- |
| T1 | — | start | ✅ |
| T2 | T1 | P1→P2 | ✅ |
| T3 | T2 | T2→T3 | ✅ |
| T4 | T3 | T3→T4 | ✅ |
| T5 | T1 | P1→P3 | ✅ |
| T6 | T5 | T5→T6 | ✅ |
| T7 | T1 | P1→P4 | ✅ |
| T8 | T7 | ✅ | ✅ |
| T9 | T8 | ✅ | ✅ |
| T10 | T9, T6, T13 | wave 2 after A/C/D | ✅ |
| T11 | T1 | P1→P5 | ✅ |
| T12 | T11 | ✅ | ✅ |
| T13 | T12 | ✅ | ✅ |
| T14 | T1 | P1→P6 | ✅ |
| T15 | T14 | ✅ | ✅ |
| T16 | T15 | ✅ | ✅ |
| T17 | T3, T6, T15 | P2/P3/P6→P7 | ✅ |
| T18 | T17 | ✅ | ✅ |
| T19 | T18 | ✅ | ✅ |
| T20 | T19 | ✅ | ✅ |
| T21 | T20 | ✅ | ✅ |
| T22 | T21 | ✅ | ✅ |

## Test Co-location Validation

| Task | Layer | Matrix requires | Task says | Status |
| --- | --- | --- | --- | --- |
| T1 | artifact | none | none | ✅ |
| T2 | kernel helper | unit | unit | ✅ |
| T3 | table/policy/controller/repo | int + e2e | integration + e2e | ✅ |
| T4, T18 | docs | none | none | ✅ |
| T5 | migration | gate | journal gate | ✅ |
| T6 | module rename | existing unit/int/e2e | existing renamed | ✅ |
| T7 | port + adapters | unit | unit | ✅ |
| T8 | registry/renderer/handler | unit | unit | ✅ |
| T9 | channel | unit | unit | ✅ |
| T10 | e2e flow | e2e | e2e | ✅ |
| T11 | service | unit | unit | ✅ |
| T12 | use case/facade/reader | unit + int (existing) | unit + integration | ✅ |
| T13 | e2e flow | e2e | e2e | ✅ |
| T14 | types | none | none | ✅ |
| T15 | domain + contract + config + use case | unit + int | unit + integration | ✅ |
| T16 | migration | int proof | integration | ✅ |
| T17 | contract/client/web | build gate | contract gate | ✅ |
| T19, T20 | scripts | none / script | T20 gate | ✅ |
| T21, T22 | docs/release | none | none | ✅ |

## Requirement coverage

PROF-01/04 → T2, T3 · PROF-02/03 → T3 · MAIL-01/04 → T9 · MAIL-02 → T7 · MAIL-03 → T8 · MAIL-05 → T10 · AUD-01/02/03 → T11–T13 · REN-01 → T6 · REN-02 → T5 · UPL-01/02/03 → T15 (T14) · UPL-04 → T16 · SWP-01 → T1, T21 · SWP-02 → T21 · REL-01 → T17 · REL-02 → T4, T18 · REL-03 → T22 · SMK-01 → T19, T20. **24/24 mapped, 0 unmapped.**

## Tools per task

MCP: none. Skills: `tlc-spec-driven` (all), `creating-issues` (T21), `caveman:caveman-commit` (commit messages). Sub-agents: `repo-scout` for navigation, `shell-runner` for every gate, `spec-worker` per batch, `spec-verifier` after T21 (before merge/tag).
