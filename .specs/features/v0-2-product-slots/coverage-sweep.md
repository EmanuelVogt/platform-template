# v0.2 — Coverage sweep (SWP-01)

Feature: `v0-2-product-slots` · Issue #1 · Sweep #1 (T1, pre-execution, base 4e5c5f7). Verdict per row: `generic ok` / `remove` / `open slot`; action = v0.2 task id or follow-up issue (AD-011). Final re-sweep + issue links land in T21.

**Test-count baseline (worktree, before wave 1):** unit 974 tests / 143 suites · int 337 / 34 · e2e 115 / 28 · web 65 / 19 files. Every gate asserts no silent deletion against these.


Repo: `/home/emanuel/Projects/platform-template`. Pattern swept: `guest|hospede|hóspede|reservation|reserva|agenda|scheduling|hospitality|accommodation|room|service|activity|credit|discount|product|clinic|feedback|report` over `apps/api/src apps/web/src docs .claude .agents AGENTS.md.jinja README.md.jinja` (excluding `node_modules`, `generated/`, lockfiles).

## Counts

- Files with at least one hit: **240**
- generic ok: **147**
- open slot: **73**
- remove: **20**

## Clusters (non-`generic ok`)

- **Identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice** (~65 files: entity, contract, access-policy, views, use-cases, professional-*.facade/port/repository/table, `db/schema.ts`) — this is a genuine platform extension point (a product plugs a "who serves whom, on what service/area" concept into identity) and is already documented as a slot in `identity.module.ts` ("Slot de produto"). Verdict `open slot`, action **T2/T3/T6**.
- **Attachment upload profiles** (`credit-receipt`, `accommodation-type-image`, `report-artifact`, `feedback-attachment` literals in `upload-profiles.ts`, `attachment.config.ts`, `attachment.contract.ts`, and ~8 dependent specs) — another real extension point (which profiles exist is product-specific). Verdict `open slot`, action **T14/T15/T16**.
- **Audit registry hard-codes identity's professional/scheduling tables** (`table-owners.ts`, `aggregate-registry.ts`, `audit-coverage.ts`) — downstream of the identity slot above; the registry needs an open registration mechanism instead of naming those tables. Verdict `open slot`, action **T11/T12/T13**.
- **`docs/back/back-arch.md`** is saturated with concrete Rituaali module names (accommodation, credit, discount, product, reservation, guest, scheduling, hospitality, room, service) used as running examples for architecture rules. Verdict `remove`, action **T18**.
- **`docs/front/front-arch.md`** carries the same disease on the front side (`ProductDrawer`, `features/guest-form`, `ListFeedbacks`/`feedbackStatus`, `GuestCreateWizard`, `agenda-generation-job`, "hospedagem/agenda/serviço" examples). Verdict `remove`, follow-up issue (companion to T18).
- **Issue-tracker taxonomy duplicated in two places**: `docs/agents/issue-tracker.md.jinja` and `.agents/skills/creating-issues/SKILL.md.jinja` both hard-code the Rituaali GitHub Area list (Agenda do Hóspede, Reservas, Acomodações, Créditos, Descontos…) and reference the `feedback-triage` workflow. Verdict `remove`, one follow-up issue covering both files.
- **Kernel/audit test fixtures leak real Rituaali data**: `drizzle-audit.repository.int-spec.ts` (services/service_rooms/Massoterapia/Fisioterapia), `drizzle-activity-stats.reader.int-spec.ts` (reservations/guests tables), `audit-trail.repository.int-spec.ts` (guests/guest_contacts), `module-boundaries.spec.ts` (dead module names scheduling/guest/service that don't exist on disk), `advisory-lock.int-spec.ts` (guest/reservation-flavored lock ids). All `remove`, separate follow-up issues (test-fixture genericization).
- **Doc/example prose leftovers**: `docs/agents/communication.md` (guest/room/reserva ELI5 examples), `docs/agents/infra.md.jinja` (guest./reservation. schema examples), `.agents/skills/tlc-spec-driven/SKILL.md` (`guest-agenda-full-load` slug), `.agents/skills/repo-discovery/SKILL.md` ("motor de agenda" file example), `notification-requested.event.ts` and `notification-template-registry.ts` comments (dead module names / ReportRendererRegistry). All `remove`, follow-up issues.
- **Trivial single-word swaps**: `bucket-sql.ts` (`CLINIC_TZ` constant name), `nested-acquisition.error.spec.ts` (`/v1/creditos/extrato` fixture URL), `specs-in-english.mjs` (hóspede diacritics example), `fixed-clock.ts` (agenda comment), `audit-trail.module.ts` (guest purge comment). All `remove`, cosmetic follow-ups.
- **False-positive noise (already excluded from `remove`/`open slot`)**: the vast majority of `reserva` hits are the Portuguese verb "preservar/preservado" (preserve), not the booking domain; `activity` is almost always the platform's own generic audit/usage-activity feature; `service`/`scheduling` inside `shared/kernel/**` are the kernel's generic DI-service and cron-maintenance-scheduling concepts, explicitly distinguished from business scheduling in `back-arch.md` itself.

## Table

| path | hit words | verdict | action |
| --- | --- | --- | --- |
| AGENTS.md.jinja | product | generic ok | — |
| .agents/skills/creating-issues/SKILL.md.jinja | agenda,feedback,hóspede,report,reserva | remove | follow-up issue: mirrors issue-tracker.md.jinja's Area taxonomy verbatim and ships Rituaali example scenarios (hóspede, reserva, crédito) — same genericization work |
| .agents/skills/feature-sliced-design/references/cross-import-patterns.md | activity,product,service | generic ok | — |
| .agents/skills/feature-sliced-design/references/excessive-entities.md | discount,product | generic ok | — |
| .agents/skills/feature-sliced-design/references/layer-structure.md | product | generic ok | — |
| .agents/skills/feature-sliced-design/references/migration-guide.md | product | generic ok | — |
| .agents/skills/feature-sliced-design/references/practical-examples.md | product | generic ok | — |
| .agents/skills/feature-sliced-design/SKILL.md | product,service | generic ok | — |
| .agents/skills/frontend-design/LICENSE.txt | product,service | generic ok | — |
| .agents/skills/frontend-design/SKILL.md | product | generic ok | — |
| .agents/skills/grilling/SKILL.md | feedback | generic ok | — |
| .agents/skills/repo-discovery/SKILL.md | agenda | remove | follow-up issue: example references Rituaali's "motor de agenda" (scheduling engine) file as a big-file-to-avoid illustration — genericize or drop if the skill is Rituaali-only |
| .agents/skills/shadcn/registry.md | product | generic ok | — |
| .agents/skills/shadcn/SKILL.md | feedback | generic ok | — |
| .agents/skills/tlc-spec-driven/references/cards/verifier.md | report | generic ok | — |
| .agents/skills/tlc-spec-driven/references/cards/worker.md | report | generic ok | — |
| .agents/skills/tlc-spec-driven/references/design.md | service | generic ok | — |
| .agents/skills/tlc-spec-driven/references/discuss.md | product | generic ok | — |
| .agents/skills/tlc-spec-driven/references/implement.md | report,service | generic ok | — |
| .agents/skills/tlc-spec-driven/references/lessons.md | report | generic ok | — |
| .agents/skills/tlc-spec-driven/references/memory.md | product,report,service | generic ok | — |
| .agents/skills/tlc-spec-driven/references/specify.md | report | generic ok | — |
| .agents/skills/tlc-spec-driven/references/sub-agents.md | report,service | generic ok | — |
| .agents/skills/tlc-spec-driven/references/tasks.md | report,service | generic ok | — |
| .agents/skills/tlc-spec-driven/references/validate.md | report,service | generic ok | — |
| .agents/skills/tlc-spec-driven/SKILL.md | agenda,guest,product,report | remove | follow-up issue: example feature slug `guest-agenda-full-load` names a real Rituaali feature — swap for a neutral example |
| .agents/skills/vercel-react-best-practices/AGENTS.md | activity,feedback,product,room,service | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/advanced-effect-event-deps.md | room | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/async-cheap-condition-before-await.md | service | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/bundle-barrel-imports.md | product | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/js-request-idle-callback.md | feedback,scheduling | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/rendering-activity.md | activity,reservation | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/rerender-split-combined-hooks.md | product | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/server-dedup-props.md | product | generic ok | — |
| .agents/skills/vercel-react-best-practices/SKILL.md | activity | generic ok | — |
| apps/api/src/db/schema.ts | scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/attachment/api/contracts/attachment.contract.ts | feedback | open slot | open slot: attachment upload profiles (`credit-receipt` / `accommodation-type-image` / `report-artifact` / `feedback-attachment`) — T14/T15/T16 |
| apps/api/src/modules/attachment/api/controllers/upload-attachments.controller.ts | service | generic ok | — |
| apps/api/src/modules/attachment/application/jobs/purge-attachment-access-logs.job.ts | scheduling | generic ok | — |
| apps/api/src/modules/attachment/application/jobs/purge-pending-attachments.job.spec.ts | feedback | open slot | open slot: attachment upload profiles (`credit-receipt` / `accommodation-type-image` / `report-artifact` / `feedback-attachment`) — T14/T15/T16 |
| apps/api/src/modules/attachment/application/jobs/purge-pending-attachments.job.ts | scheduling | generic ok | — |
| apps/api/src/modules/attachment/application/use-cases/confirm-uploads/confirm-uploads.use-case.spec.ts | feedback | open slot | open slot: attachment upload profiles (`credit-receipt` / `accommodation-type-image` / `report-artifact` / `feedback-attachment`) — T14/T15/T16 |
| apps/api/src/modules/attachment/application/use-cases/delete-attachment/delete-attachment.use-case.spec.ts | agenda | generic ok | — |
| apps/api/src/modules/attachment/application/use-cases/upload-attachments-batch/upload-attachments-batch.use-case.spec.ts | feedback,reserva | open slot | open slot: attachment upload profiles (`credit-receipt` / `accommodation-type-image` / `report-artifact` / `feedback-attachment`) — T14/T15/T16 |
| apps/api/src/modules/attachment/application/use-cases/upload-attachment/upload-attachment.use-case.spec.ts | agenda,feedback,report,reserva | open slot | open slot: attachment upload profiles (`credit-receipt` / `accommodation-type-image` / `report-artifact` / `feedback-attachment`) — T14/T15/T16 |
| apps/api/src/modules/attachment/attachment.config.ts | feedback,report | open slot | open slot: attachment upload profiles (`credit-receipt` / `accommodation-type-image` / `report-artifact` / `feedback-attachment`) — T14/T15/T16 |
| apps/api/src/modules/attachment/domain/attachment.entity.spec.ts | feedback | open slot | open slot: attachment upload profiles (`credit-receipt` / `accommodation-type-image` / `report-artifact` / `feedback-attachment`) — T14/T15/T16 |
| apps/api/src/modules/attachment/domain/format-megabytes.spec.ts | feedback | open slot | open slot: attachment upload profiles (`credit-receipt` / `accommodation-type-image` / `report-artifact` / `feedback-attachment`) — T14/T15/T16 |
| apps/api/src/modules/attachment/domain/upload-profiles.spec.ts | accommodation,credit,feedback,report | open slot | open slot: attachment upload profiles (`credit-receipt` / `accommodation-type-image` / `report-artifact` / `feedback-attachment`) — T14/T15/T16 |
| apps/api/src/modules/attachment/domain/upload-profiles.ts | accommodation,credit,feedback,report | open slot | open slot: attachment upload profiles (`credit-receipt` / `accommodation-type-image` / `report-artifact` / `feedback-attachment`) — T14/T15/T16 |
| apps/api/src/modules/attachment/infrastructure/repositories/drizzle-attachment-access-log.repository.int-spec.ts | reserva | generic ok | — |
| apps/api/src/modules/attachment/infrastructure/repositories/drizzle-attachment.repository.int-spec.ts | feedback | open slot | open slot: attachment upload profiles (`credit-receipt` / `accommodation-type-image` / `report-artifact` / `feedback-attachment`) — T14/T15/T16 |
| apps/api/src/modules/audit/api/facades/usage-activity.facade.spec.ts | activity | generic ok | — |
| apps/api/src/modules/audit/api/facades/usage-activity.facade.ts | activity | generic ok | — |
| apps/api/src/modules/audit/application/activity-area.spec.ts | activity | generic ok | — |
| apps/api/src/modules/audit/application/activity-area.ts | activity | generic ok | — |
| apps/api/src/modules/audit/application/list-audit-entries/list-audit-entries.use-case.spec.ts | service | generic ok | — |
| apps/api/src/modules/audit/audit.module.ts | activity | generic ok | — |
| apps/api/src/modules/audit/domain/aggregate-registry.ts | scheduling,service | open slot | open slot: audit registry hard-codes owners for identity's professional/scheduling tables — T11/T12/T13 |
| apps/api/src/modules/audit/domain/audit-coverage.ts | scheduling,service | open slot | open slot: audit registry hard-codes owners for identity's professional/scheduling tables — T11/T12/T13 |
| apps/api/src/modules/audit/domain/ports/activity-stats.reader.ts | activity | generic ok | — |
| apps/api/src/modules/audit/domain/table-owners.ts | scheduling,service | open slot | open slot: audit registry hard-codes owners for identity's professional/scheduling tables — T11/T12/T13 |
| apps/api/src/modules/audit/infrastructure/repositories/drizzle-activity-stats.reader.int-spec.ts | activity,guest,reservation | remove | follow-up issue: int-spec fixtures seed Rituaali tables (reservations, guests) — genericize test fixtures |
| apps/api/src/modules/audit/infrastructure/repositories/drizzle-activity-stats.reader.ts | activity | generic ok | — |
| apps/api/src/modules/audit/infrastructure/repositories/drizzle-audit.repository.int-spec.ts | room,service | remove | follow-up issue: int-spec fixtures seed Rituaali table/data names (services, service_rooms, Massoterapia, Fisioterapia) — genericize test fixtures |
| apps/api/src/modules/identity/api/contracts/identity.contract.ts | agenda,guest,hóspede,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/api/controllers/access-catalog/get-access-catalog.controller.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/access-catalog/index.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/admin/create-user.controller.ts | guest,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/api/controllers/admin/update-user.controller.ts | guest,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/api/controllers/device/list-devices.controller.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/device/revoke-device.controller.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/device/revoke-other-devices.controller.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/session/access-history.controller.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/session/change-password.controller.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/session/get-session.controller.ts | reserva,service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/session/logout.controller.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/session/request-email-change.controller.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/session/resend-verification.controller.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/session/update-my-profile.controller.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/session/upload-avatar.controller.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/facades/professional-assignment.facade.ts | service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/api/facades/professional-directory.facade.spec.ts | scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/api/facades/professional-directory.facade.ts | activity,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/api/facades/professional-tables.facade.ts | agenda | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/api/facades/usage-access.facade.ts | activity | generic ok | — |
| apps/api/src/modules/identity/api/guards/auth.guard.spec.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/guards/auth.guard.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/guards/permissions.guard.spec.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/guards/permissions.guard.ts | service | generic ok | — |
| apps/api/src/modules/identity/application/access-policy.spec.ts | agenda,guest,reserva,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/access-policy.ts | agenda,guest,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/jobs/purge-auth-events.job.ts | scheduling | generic ok | — |
| apps/api/src/modules/identity/application/jobs/revert-expired-email-changes.job.ts | scheduling | generic ok | — |
| apps/api/src/modules/identity/application/services/create-session.service.spec.ts | guest,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/services/create-session.service.ts | service | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/change-password/change-password.use-case.int-spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/change-password/change-password.use-case.spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/change-password/change-password.use-case.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/confirm-email-change/confirm-email-change.use-case.spec.ts | guest,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/confirm-email-change/confirm-email-change.use-case.ts | service | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/create-user/create-user.use-case.spec.ts | agenda,guest,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/create-user/create-user.use-case.ts | guest,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/create-user/types.ts | agenda,guest,hóspede,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/delete-user/delete-user.use-case.spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/get-current-user/get-current-user.use-case.spec.ts | guest,reserva | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/get-current-user/get-current-user.use-case.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/list-permission-templates/list-permission-templates.use-case.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/list-users/list-users.use-case.spec.ts | guest,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/login/login.use-case.spec.ts | guest,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/login/login.use-case.ts | service | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/purge-users/purge-users.use-case.spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/request-email-change/email-change-flow.int-spec.ts | guest,reserva,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/request-email-change/request-email-change.use-case.spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/request-password-reset/request-password-reset.use-case.spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/resend-verification/resend-verification.use-case.spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/reset-password/reset-password.use-case.spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/restore-users/restore-users.use-case.spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/set-password/set-password.use-case.spec.ts | guest,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/set-password/set-password.use-case.ts | service | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/update-my-profile/update-my-profile.use-case.spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/update-my-profile/update-my-profile.use-case.ts | service | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/update-permission-template/update-permission-template.use-case.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/update-user/types.ts | agenda,guest,hóspede,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/update-user/update-user.use-case.spec.ts | agenda,guest,hóspede,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/update-user/update-user.use-case.ts | guest,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/upload-avatar/upload-avatar.use-case.spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/validate-email-change/validate-email-change.use-case.spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/use-cases/verify-email/verify-email.use-case.spec.ts | guest | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/application/views.ts | activity,agenda,guest,hóspede,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/domain/entities/auth-event.entity.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/domain/entities/session.entity.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/domain/entities/user.entity.spec.ts | guest,hóspede,reserva,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/domain/entities/user.entity.ts | guest,hóspede,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/domain/entities/verification-token.entity.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/domain/errors.ts | agenda,hóspede,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/domain/permissions/permission-catalog.spec.ts | product | generic ok | — |
| apps/api/src/modules/identity/domain/permissions/permission-catalog.ts | product,reserva | generic ok | — |
| apps/api/src/modules/identity/domain/ports/device.repository.ts | activity,reserva | generic ok | — |
| apps/api/src/modules/identity/domain/ports/professional-assignment.repository.ts | service | generic ok | — |
| apps/api/src/modules/identity/domain/ports/professional-commitments.port.ts | hóspede,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/domain/ports/professional-scope.port.ts | service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/domain/ports/usage-stats.reader.ts | activity | generic ok | — |
| apps/api/src/modules/identity/domain/ports/user.repository.ts | agenda,hóspede,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/identity.module.ts | agenda,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/infrastructure/password/breach-check.spec.ts | report | generic ok | — |
| apps/api/src/modules/identity/infrastructure/professional/null-professional-adapters.ts | agenda,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/infrastructure/professional-query.helpers.ts | guest,hóspede | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-auth-event.repository.int-spec.ts | guest,reserva | generic ok | — |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-device.repository.ts | activity,reserva | generic ok | — |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-professional-assignment.repository.int-spec.ts | guest,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-professional-assignment.repository.ts | reserva,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-session.repository.int-spec.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-usage-stats.reader.int-spec.ts | activity | generic ok | — |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-usage-stats.reader.ts | activity | generic ok | — |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-user.repository.int-spec.ts | guest,hóspede,reserva | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-user.repository.scope.int-spec.ts | agenda,guest,reserva,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-user.repository.ts | guest,reserva,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/infrastructure/repositories/professional-directory.facade.int-spec.ts | guest,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/infrastructure/tables/professional-default-hours.table.ts | reservation | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice table; also carries a comment referencing a dead "reservation" module pattern — T2/T3/T6 (+ cosmetic comment cleanup) |
| apps/api/src/modules/identity/infrastructure/tables/user-professional-area.table.ts | service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/infrastructure/tables/user-professional-schedule-config.table.ts | reservation | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice table; also carries a comment referencing a dead "reservation" module pattern — T2/T3/T6 (+ cosmetic comment cleanup) |
| apps/api/src/modules/identity/infrastructure/tables/user-professional-service.table.ts | activity,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/infrastructure/tables/user-scheduling-area.table.ts | agenda,scheduling,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/infrastructure/tables/user.table.ts | guest,hóspede,service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/identity/professional-assignment.module.ts | service | open slot | open slot: identity `professional` / `attendsGuests` / `serviceIds` / `schedulingAreaIds` slice — T2/T3/T6 |
| apps/api/src/modules/module-boundaries.spec.ts | activity,agenda,guest,product,report,reservation,scheduling,service | remove | follow-up issue: boundary-lint spec fixtures reference dead Rituaali module names (scheduling, guest, service — none exist on disk) — replace with neutral placeholder module names |
| apps/api/src/modules/notification/api/controllers/feed/archive-notification.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/controllers/feed/list-notifications.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/controllers/feed/mark-all-read.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/controllers/feed/mark-all-seen.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/controllers/feed/mark-read.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/controllers/feed/unseen-count.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/controllers/stream/sse.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/events/notification-requested.event.ts | scheduling | remove | follow-up issue: comment lists dead module names (identity, scheduling) as illustrative event origins — genericize |
| apps/api/src/modules/notification/application/mappers/notification.mapper.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/notification/application/templates/notification-template-registry.ts | report | remove | follow-up issue: comment references the `ReportRendererRegistry`/ADR 0067 pattern (companion cleanup to T18) |
| apps/api/src/modules/notification/domain/entities/notification.entity.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/notification/domain/ports/mailer.ts | service | generic ok | — |
| apps/api/src/modules/notification/infrastructure/delivery/delivery.dispatcher.int-spec.ts | reserva | generic ok | — |
| apps/api/src/modules/notification/infrastructure/delivery/delivery.dispatcher.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/notification/infrastructure/delivery/delivery.dispatcher.ts | reserva,scheduling | generic ok | — |
| apps/api/src/modules/notification/notification.config.ts | product | generic ok | — |
| apps/api/src/modules/notification/notification.module.ts | product | generic ok | — |
| apps/api/src/openapi/authz-coverage.spec.ts | service | generic ok | — |
| apps/api/src/shared/config/env.spec.ts | service | generic ok | — |
| apps/api/src/shared/config/env.ts | product,service | generic ok | — |
| apps/api/src/shared/config/load-dotenv.ts | product | generic ok | — |
| apps/api/src/shared/infra/database/application-pool.ts | report | generic ok | — |
| apps/api/src/shared/infra/database/dedicated-client.factory.ts | activity | generic ok | — |
| apps/api/src/shared/infra/database/dedicated-client.int-spec.ts | activity,report | generic ok | — |
| apps/api/src/shared/infra/database/pool-metrics.ts | activity | generic ok | — |
| apps/api/src/shared/kernel/access/decorators.spec.ts | service | generic ok | — |
| apps/api/src/shared/kernel/access/decorators.ts | service | generic ok | — |
| apps/api/src/shared/kernel/access/product-permission-catalogs.ts | product | generic ok | — |
| apps/api/src/shared/kernel/audit/audit-trail.module.ts | guest | remove | follow-up issue: doc comment example mentions "purge de user/guest" — cosmetic, reword generically |
| apps/api/src/shared/kernel/audit/audit-trail.repository.int-spec.ts | guest | remove | follow-up issue: kernel audit-trail int-spec fixtures reference Rituaali tables (guests, guest_contacts) — genericize test fixtures |
| apps/api/src/shared/kernel/audit/purge-audit.job.ts | scheduling | generic ok | — |
| apps/api/src/shared/kernel/clock/bucket-sql.ts | clinic | remove | follow-up issue: `CLINIC_TZ` constant name leaks Rituaali domain into shared kernel — rename to a generic `APP_TZ`/`DEFAULT_TZ` |
| apps/api/src/shared/kernel/domain/entity-props.spec.ts | reserva | generic ok | — |
| apps/api/src/shared/kernel/errors/nested-acquisition.error.spec.ts | credit | remove | follow-up issue: trivial — swap example URL fixture (`/v1/creditos/extrato`) for a neutral path |
| apps/api/src/shared/kernel/errors/pool-saturated.error.ts | service | generic ok | — |
| apps/api/src/shared/kernel/errors/problem-details.filter.spec.ts | service | generic ok | — |
| apps/api/src/shared/kernel/health/health.controller.spec.ts | service | generic ok | — |
| apps/api/src/shared/kernel/health/health.controller.ts | service | generic ok | — |
| apps/api/src/shared/kernel/idempotency/idempotency.cleanup.ts | scheduling | generic ok | — |
| apps/api/src/shared/kernel/idempotency/idempotency.repository.ts | reserva | generic ok | — |
| apps/api/src/shared/kernel/logging/logger.factory.ts | product,reserva,service | generic ok | — |
| apps/api/src/shared/kernel/logging/log.redact.spec.ts | credit,reserva | generic ok | — |
| apps/api/src/shared/kernel/logging/log.redact.ts | credit | generic ok | — |
| apps/api/src/shared/kernel/outbox/outbox.dispatcher.ts | reserva,scheduling | generic ok | — |
| apps/api/src/shared/kernel/outbox/outbox.int-spec.ts | reserva | generic ok | — |
| apps/api/src/shared/kernel/scheduling/advisory-lock.int-spec.ts | guest,reservation,scheduling | remove | follow-up issue: cosmetic — test fixtures use guest/reservation-flavored lock ids, swap for neutral ids |
| apps/api/src/shared/kernel/scheduling/advisory-lock.ts | reserva,scheduling | generic ok | — |
| apps/api/src/shared/kernel/scheduling/maintenance-runtime.int-spec.ts | activity | generic ok | — |
| apps/api/src/shared/kernel/scheduling/scheduling.module.ts | scheduling | generic ok | — |
| apps/api/src/shared/kernel/shared-kernel.module.ts | scheduling | generic ok | — |
| apps/api/src/shared/kernel/tracing/tracing.setup.ts | service | generic ok | — |
| apps/api/src/shared/kernel/transactional/transactional.decorator.spec.ts | product | generic ok | — |
| apps/api/src/shared/kernel/transactional/transaction-context.spec.ts | product | generic ok | — |
| apps/web/src/app/router/product-routes.tsx | product | generic ok | — |
| apps/web/src/app/router/router.test.tsx | product | generic ok | — |
| apps/web/src/app/router/router.tsx | product | generic ok | — |
| apps/web/src/shared/test/fixed-clock.ts | agenda | remove | follow-up issue: trivial — comment mentions "testes de agenda", reword generically |
| .claude/agents/shell-runner.md | report | generic ok | — |
| .claude/agents/spec-verifier.md | product,report | generic ok | — |
| .claude/agents/spec-worker.md | report | generic ok | — |
| .claude/hooks/contract-enum.mjs | feedback | generic ok | — |
| .claude/hooks/specs-in-english.mjs | hóspede,product | remove | follow-up issue: trivial — swap the diacritics example word ("hóspede") in the hook comment for a neutral one |
| docs/agents/communication.md | agenda,guest,hóspede,product,reserva,room | remove | follow-up issue: ELI5 writing-style examples reference Rituaali domain (guest, front desk, room schedule, "duas reservas disputam a sala") — swap for neutral examples |
| docs/agents/harness.md | product,report | generic ok | — |
| docs/agents/infra.md.jinja | guest,product,reservation,service | remove | follow-up issue: schema list example names Rituaali business schemas (guest., reservation.) beside kernel ones — genericize |
| docs/agents/issue-tracker.md.jinja | agenda,feedback,hóspede,product,report,reserva | remove | follow-up issue: Area taxonomy (Agenda do Hóspede, Reservas, Acomodações, Créditos, Descontos…) and the feedback-triage workflow reference are Rituaali-specific — template needs a placeholder or removal |
| docs/agents/README.md | product | generic ok | — |
| docs/agents/workflow.md | product | generic ok | — |
| docs/back/back-arch.md | accommodation,activity,agenda,credit,discount,feedback,guest,hospitality,product,report,reserva,reservation,room,scheduling,service | remove | T18 — doc is full of concrete Rituaali module examples (accommodation, credit, discount, product, reservation, guest, scheduling, hospitality, room, service) used to illustrate architecture rules |
| docs/dev/ambiente-local.md | reserva,service | generic ok | — |
| docs/dev/deploy.md.jinja | service | generic ok | — |
| docs/dev/template.md | product | generic ok | — |
| docs/front/front-arch.md | agenda,feedback,guest,hospede,product,report,reserva | remove | follow-up issue: examples reference real Rituaali features (ProductDrawer, guest-form, ListFeedbacks/feedbackStatus, GuestCreateWizard, agenda-generation-job, hospedagem/agenda/serviço) — genericize (companion to T18) |
