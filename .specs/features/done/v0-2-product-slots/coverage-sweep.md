# v0.2 — Coverage sweep (SWP-01)

Feature: `v0-2-product-slots` · Issue #1 · Sweep #1 (T1, pre-execution, base 4e5c5f7) ·
Sweep #2 (T21, final, worktree HEAD `f02cb03`, Verifier PASS). Verdict per row:
`generic ok` / `remove` / `open slot` / `resolved`. Action = `done <hash range>`
(closed by a v0.2 task) and/or `issue <url>` (follow-up, AD-011). Hits inside the five
points' files (identity `059b6c7..706cee9`, notification `ac515d5..43b8298`, audit
`60a77bc..e1840fa`, attachment `5073397..253ea0d`, docs `4cfd918..13125bc`) are fixed
in v0.2; every other `remove`/`open slot` row was linked to a follow-up issue
(#2–#8, filed 2026-08-18, since deleted — the debt below is untracked, not resolved).

**Test-count baseline (worktree, before wave 1):** unit 974 tests / 143 suites · int 337 / 34 · e2e 115 / 28 · web 65 / 19 files.
**Test-count final (worktree HEAD `f02cb03`, 2026-08-18):** unit 1000 / int 342 / e2e 123 / web 65 files. No silent deletion against the baseline.


Repo: `/home/emanuel/Projects/platform-template`. Pattern swept: `guest|hospede|hóspede|reservation|reserva|agenda|scheduling|hospitality|accommodation|room|service|activity|credit|discount|product|clinic|feedback|report` over `apps/api/src apps/web/src docs .claude .agents AGENTS.md.jinja README.md.jinja` (excluding `node_modules`, `generated/`, lockfiles).

## Counts

**T1 (pre-execution):** files with at least one hit **240** · generic ok **147** · open slot **73** · remove **20**.

**T21 (final, current sweep, 227 files with a hit):**

- generic ok: **155**
- open slot: **52** (all linked — `done <hash>` and/or follow-up issue)
- remove: **20** (all linked — `done <hash>` and/or follow-up issue)
- resolved since T1 (file no longer hits, closed by a v0.2 task): **21**

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

## T21 resolution (final sweep, closeout)

Re-ran the T1 sweep on the finished branch (worktree HEAD `f02cb03`, Verifier PASS). 24
files dropped their hits entirely (renamed/removed by the five-point work — 21 kept as
`resolved` rows below, 2 were already `generic ok` and just disappeared silently). 11
new files with hits appeared (mostly the new generic slot/registry infrastructure
itself — `product-access-profiles.ts`, `product-upload-profiles.ts`,
`base-audit-registrations.ts`, `audit-registry.facade.ts`,
`activity-area-resolver.ts(+spec)`, `list-audit-entries.use-case.ts`,
`drizzle-user.repository.profile-extension.int-spec.ts`, `attachment.config.spec.ts`,
`docs/dev/template-changelog.md`) — all `generic ok`, the platform's own vocabulary for
the extension points it now exposes.

Every remaining `remove`/`open slot` row is one of:

- **Identity `professional` slice** (~59 files + `db/schema.ts`) — mechanism built by
  T2/T3/T6 (`done 059b6c7..706cee9`); the concrete field names (`attendsGuests` etc.)
  are a contract-breaking rename deferred to v0.3 per AD-002 — tracked as issue #2,
  since deleted (410); the debt is untracked.
- **Attachment upload profiles** (11 files) — closed by T14/T15/T16
  (`done 5073397..253ea0d`), no follow-up needed.
- **Audit registry** (3 files) — closed by T11/T12/T13 (`done 60a77bc..e1840fa`), no
  follow-up needed.
- **`docs/back/back-arch.md`** — first cut done by T18 (`done 4cfd918..13125bc`); full
  example genericization deferred — tracked as issue #3, since deleted (410); the
  debt is untracked.
- **`docs/front/front-arch.md`** — tracked as issue #4, since deleted (410); the debt
  is untracked.
- **Issue-tracker Area taxonomy** (`docs/agents/issue-tracker.md.jinja` +
  `.agents/skills/creating-issues/SKILL.md.jinja`) — tracked as issue #5, since
  deleted (410); the debt is untracked.
- **Test fixtures leaking Rituaali data** (5 int-specs/boundary spec) — tracked as
  issue #6, since deleted (410); the debt is untracked.
- **Cosmetic leftovers** (11 files — comments, example slugs, constant names, fixture
  URLs) — tracked as issue #7, since deleted (410); the debt is untracked.
- **Verifier's non-blocking observation** on
  `get-attachment-for-download.use-case.ts:74-77` (access trail logs `allowed` and
  opens the storage stream before the controller's unknown-profile 404) — tracked as
  issue #8, since deleted (410); the debt is untracked.

Final table posted as a comment on
[issue #1](https://github.com/EmanuelVogt/platform-template/issues/1).

## Table

| path | hit words | verdict | action |
| --- | --- | --- | --- |
| .agents/skills/creating-issues/SKILL.md.jinja | hóspede,reserva,agenda,feedback,report | remove | issue https://github.com/EmanuelVogt/platform-template/issues/5 |
| .agents/skills/feature-sliced-design/SKILL.md | service,product | generic ok | — |
| .agents/skills/feature-sliced-design/references/cross-import-patterns.md | service,activity,product | generic ok | — |
| .agents/skills/feature-sliced-design/references/excessive-entities.md | discount,product | generic ok | — |
| .agents/skills/feature-sliced-design/references/layer-structure.md | product | generic ok | — |
| .agents/skills/feature-sliced-design/references/migration-guide.md | product | generic ok | — |
| .agents/skills/feature-sliced-design/references/practical-examples.md | product | generic ok | — |
| .agents/skills/frontend-design/LICENSE.txt | service,product | generic ok | — |
| .agents/skills/frontend-design/SKILL.md | product | generic ok | — |
| .agents/skills/grilling/SKILL.md | feedback | generic ok | — |
| .agents/skills/repo-discovery/SKILL.md | agenda | remove | issue https://github.com/EmanuelVogt/platform-template/issues/7 |
| .agents/skills/shadcn/SKILL.md | feedback | generic ok | — |
| .agents/skills/shadcn/registry.md | product | generic ok | — |
| .agents/skills/tlc-spec-driven/SKILL.md | guest,agenda,product,report | remove | issue https://github.com/EmanuelVogt/platform-template/issues/7 |
| .agents/skills/tlc-spec-driven/references/cards/verifier.md | report | generic ok | — |
| .agents/skills/tlc-spec-driven/references/cards/worker.md | report | generic ok | — |
| .agents/skills/tlc-spec-driven/references/design.md | service | generic ok | — |
| .agents/skills/tlc-spec-driven/references/discuss.md | product | generic ok | — |
| .agents/skills/tlc-spec-driven/references/implement.md | service,report | generic ok | — |
| .agents/skills/tlc-spec-driven/references/lessons.md | report | generic ok | — |
| .agents/skills/tlc-spec-driven/references/memory.md | service,product,report | generic ok | — |
| .agents/skills/tlc-spec-driven/references/specify.md | report | generic ok | — |
| .agents/skills/tlc-spec-driven/references/sub-agents.md | service,report | generic ok | — |
| .agents/skills/tlc-spec-driven/references/tasks.md | service,report | generic ok | — |
| .agents/skills/tlc-spec-driven/references/validate.md | service,report | generic ok | — |
| .agents/skills/vercel-react-best-practices/AGENTS.md | room,service,activity,product,feedback | generic ok | — |
| .agents/skills/vercel-react-best-practices/SKILL.md | activity | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/advanced-effect-event-deps.md | room | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/async-cheap-condition-before-await.md | service | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/bundle-barrel-imports.md | product | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/js-request-idle-callback.md | scheduling,feedback | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/rendering-activity.md | reservation,reserva,activity | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/rerender-split-combined-hooks.md | product | generic ok | — |
| .agents/skills/vercel-react-best-practices/rules/server-dedup-props.md | product | generic ok | — |
| .claude/agents/shell-runner.md | report | generic ok | — |
| .claude/agents/spec-verifier.md | product,report | generic ok | — |
| .claude/agents/spec-worker.md | report | generic ok | — |
| .claude/hooks/contract-enum.mjs | feedback | generic ok | — |
| .claude/hooks/specs-in-english.mjs | hóspede,product | remove | issue https://github.com/EmanuelVogt/platform-template/issues/7 |
| AGENTS.md.jinja | product | generic ok | — |
| apps/api/src/db/schema.ts | scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/attachment/api/contracts/attachment.contract.ts | feedback | resolved | done 5073397..253ea0d |
| apps/api/src/modules/attachment/api/controllers/upload-attachments.controller.ts | service | generic ok | — |
| apps/api/src/modules/attachment/application/jobs/purge-attachment-access-logs.job.ts | scheduling | generic ok | — |
| apps/api/src/modules/attachment/application/jobs/purge-pending-attachments.job.spec.ts | feedback | resolved | done 5073397..253ea0d |
| apps/api/src/modules/attachment/application/jobs/purge-pending-attachments.job.ts | scheduling | generic ok | — |
| apps/api/src/modules/attachment/application/use-cases/confirm-uploads/confirm-uploads.use-case.spec.ts | feedback | resolved | done 5073397..253ea0d |
| apps/api/src/modules/attachment/application/use-cases/delete-attachment/delete-attachment.use-case.spec.ts | agenda | generic ok | — |
| apps/api/src/modules/attachment/application/use-cases/upload-attachment/upload-attachment.use-case.spec.ts | reserva,agenda | open slot | done 5073397..253ea0d |
| apps/api/src/modules/attachment/application/use-cases/upload-attachments-batch/upload-attachments-batch.use-case.spec.ts | reserva | open slot | done 5073397..253ea0d |
| apps/api/src/modules/attachment/attachment.config.spec.ts | feedback,report | generic ok | — |
| apps/api/src/modules/attachment/attachment.config.ts | feedback,report | resolved | done 5073397..253ea0d |
| apps/api/src/modules/attachment/domain/attachment.entity.spec.ts | feedback | resolved | done 5073397..253ea0d |
| apps/api/src/modules/attachment/domain/format-megabytes.spec.ts | feedback | open slot | done 5073397..253ea0d |
| apps/api/src/modules/attachment/domain/upload-profiles.spec.ts | product | open slot | done 5073397..253ea0d |
| apps/api/src/modules/attachment/domain/upload-profiles.ts | product | open slot | done 5073397..253ea0d |
| apps/api/src/modules/attachment/infrastructure/repositories/drizzle-attachment-access-log.repository.int-spec.ts | reserva | generic ok | — |
| apps/api/src/modules/attachment/infrastructure/repositories/drizzle-attachment.repository.int-spec.ts | feedback | open slot | done 5073397..253ea0d |
| apps/api/src/modules/audit/api/facades/audit-registry.facade.ts | service | generic ok | — |
| apps/api/src/modules/audit/api/facades/usage-activity.facade.spec.ts | service,activity | generic ok | — |
| apps/api/src/modules/audit/api/facades/usage-activity.facade.ts | service,activity | generic ok | — |
| apps/api/src/modules/audit/application/list-audit-entries/list-audit-entries.use-case.spec.ts | service | generic ok | — |
| apps/api/src/modules/audit/application/list-audit-entries/list-audit-entries.use-case.ts | service | generic ok | — |
| apps/api/src/modules/audit/application/services/activity-area-resolver.spec.ts | activity | generic ok | — |
| apps/api/src/modules/audit/application/services/activity-area-resolver.ts | activity | generic ok | — |
| apps/api/src/modules/audit/audit.module.ts | service,activity | generic ok | — |
| apps/api/src/modules/audit/domain/aggregate-registry.ts | scheduling,service | resolved | done 60a77bc..e1840fa |
| apps/api/src/modules/audit/domain/audit-coverage.ts | scheduling,service | open slot | done 60a77bc..e1840fa |
| apps/api/src/modules/audit/domain/base-audit-registrations.ts | scheduling,service | generic ok | — |
| apps/api/src/modules/audit/domain/ports/activity-stats.reader.ts | activity | generic ok | — |
| apps/api/src/modules/audit/domain/table-owners.ts | scheduling,service | resolved | done 60a77bc..e1840fa |
| apps/api/src/modules/audit/infrastructure/repositories/drizzle-activity-stats.reader.int-spec.ts | guest,reservation,reserva,activity | remove | issue https://github.com/EmanuelVogt/platform-template/issues/6 |
| apps/api/src/modules/audit/infrastructure/repositories/drizzle-activity-stats.reader.ts | activity | generic ok | — |
| apps/api/src/modules/audit/infrastructure/repositories/drizzle-audit.repository.int-spec.ts | room,service | remove | issue https://github.com/EmanuelVogt/platform-template/issues/6 |
| apps/api/src/modules/identity/api/contracts/identity.contract.ts | agenda,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/api/controllers/access-catalog/get-access-catalog.controller.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/access-catalog/index.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/controllers/admin/create-user.controller.ts | scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/api/controllers/admin/update-user.controller.ts | scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
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
| apps/api/src/modules/identity/api/facades/professional-assignment.facade.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/api/facades/professional-directory.facade.spec.ts | scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/api/facades/professional-directory.facade.ts | service,activity | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/api/facades/professional-tables.facade.ts | agenda | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/api/facades/usage-access.facade.ts | activity | generic ok | — |
| apps/api/src/modules/identity/api/guards/auth.guard.spec.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/guards/auth.guard.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/guards/permissions.guard.spec.ts | service | generic ok | — |
| apps/api/src/modules/identity/api/guards/permissions.guard.ts | service | generic ok | — |
| apps/api/src/modules/identity/application/access-policy.spec.ts | reserva,agenda,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/access-policy.ts | agenda,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/jobs/purge-auth-events.job.ts | scheduling | generic ok | — |
| apps/api/src/modules/identity/application/jobs/revert-expired-email-changes.job.ts | scheduling | generic ok | — |
| apps/api/src/modules/identity/application/services/create-session.service.spec.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/services/create-session.service.ts | service | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/change-password/change-password.use-case.int-spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/use-cases/change-password/change-password.use-case.spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/use-cases/change-password/change-password.use-case.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/confirm-email-change/confirm-email-change.use-case.spec.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/use-cases/confirm-email-change/confirm-email-change.use-case.ts | service | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/create-user/create-user.use-case.spec.ts | agenda,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/use-cases/create-user/create-user.use-case.ts | scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/use-cases/create-user/types.ts | agenda,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/use-cases/delete-user/delete-user.use-case.spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/use-cases/get-current-user/get-current-user.use-case.spec.ts | reserva | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/use-cases/get-current-user/get-current-user.use-case.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/list-permission-templates/list-permission-templates.use-case.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/list-users/list-users.use-case.spec.ts | scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/use-cases/login/login.use-case.spec.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/use-cases/login/login.use-case.ts | service | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/purge-users/purge-users.use-case.spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/use-cases/request-email-change/email-change-flow.int-spec.ts | reserva,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/use-cases/request-email-change/request-email-change.use-case.spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/use-cases/request-password-reset/request-password-reset.use-case.spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/use-cases/resend-verification/resend-verification.use-case.spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/use-cases/reset-password/reset-password.use-case.spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/use-cases/restore-users/restore-users.use-case.spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/use-cases/set-password/set-password.use-case.spec.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/use-cases/set-password/set-password.use-case.ts | service | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/update-my-profile/update-my-profile.use-case.spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/use-cases/update-my-profile/update-my-profile.use-case.ts | service | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/update-permission-template/update-permission-template.use-case.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/application/use-cases/update-user/types.ts | agenda,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/use-cases/update-user/update-user.use-case.spec.ts | agenda,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/use-cases/update-user/update-user.use-case.ts | scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/application/use-cases/upload-avatar/upload-avatar.use-case.spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/use-cases/validate-email-change/validate-email-change.use-case.spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/use-cases/verify-email/verify-email.use-case.spec.ts | guest | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/application/views.ts | agenda,scheduling,service,activity | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/domain/entities/auth-event.entity.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/domain/entities/session.entity.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/domain/entities/user.entity.spec.ts | reserva,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/domain/entities/user.entity.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/domain/entities/verification-token.entity.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/domain/errors.ts | agenda,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/domain/permissions/permission-catalog.spec.ts | product | generic ok | — |
| apps/api/src/modules/identity/domain/permissions/permission-catalog.ts | reserva,product | generic ok | — |
| apps/api/src/modules/identity/domain/ports/device.repository.ts | reserva,activity | generic ok | — |
| apps/api/src/modules/identity/domain/ports/professional-assignment.repository.ts | service | generic ok | — |
| apps/api/src/modules/identity/domain/ports/professional-commitments.port.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/domain/ports/professional-scope.port.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/domain/ports/usage-stats.reader.ts | activity | generic ok | — |
| apps/api/src/modules/identity/domain/ports/user.repository.ts | agenda,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/identity.module.ts | agenda,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/password/breach-check.spec.ts | report | generic ok | — |
| apps/api/src/modules/identity/infrastructure/professional-query.helpers.ts | guest,hóspede | resolved | done 059b6c7..706cee9 |
| apps/api/src/modules/identity/infrastructure/professional/null-professional-adapters.ts | agenda,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-auth-event.repository.int-spec.ts | guest,reserva | generic ok | — |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-device.repository.ts | reserva,activity | generic ok | — |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-professional-assignment.repository.int-spec.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-professional-assignment.repository.ts | reserva,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-session.repository.int-spec.ts | reserva | generic ok | — |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-usage-stats.reader.int-spec.ts | activity | generic ok | — |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-usage-stats.reader.ts | activity | generic ok | — |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-user.repository.int-spec.ts | reserva | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-user.repository.profile-extension.int-spec.ts | product | generic ok | — |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-user.repository.scope.int-spec.ts | reserva,agenda,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/repositories/drizzle-user.repository.ts | reserva,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/repositories/professional-directory.facade.int-spec.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/tables/professional-default-hours.table.ts | reservation,reserva | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/tables/user-professional-area.table.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/tables/user-professional-schedule-config.table.ts | reservation,reserva | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/tables/user-professional-service.table.ts | service,activity | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/tables/user-scheduling-area.table.ts | agenda,scheduling,service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/infrastructure/tables/user.table.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/identity/professional-assignment.module.ts | service | open slot | done 059b6c7..706cee9 · issue #2 (v0.3 professional slice extraction, AD-002) |
| apps/api/src/modules/module-boundaries.spec.ts | guest,reservation,reserva,agenda,scheduling,service,activity,product,report | remove | issue https://github.com/EmanuelVogt/platform-template/issues/6 |
| apps/api/src/modules/notification/api/controllers/feed/archive-notification.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/controllers/feed/list-notifications.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/controllers/feed/mark-all-read.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/controllers/feed/mark-all-seen.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/controllers/feed/mark-read.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/controllers/feed/unseen-count.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/controllers/stream/sse.controller.ts | service | generic ok | — |
| apps/api/src/modules/notification/api/events/notification-requested.event.ts | scheduling | remove | issue https://github.com/EmanuelVogt/platform-template/issues/7 |
| apps/api/src/modules/notification/application/mappers/notification.mapper.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/notification/application/templates/notification-template-registry.ts | report | remove | issue https://github.com/EmanuelVogt/platform-template/issues/7 |
| apps/api/src/modules/notification/domain/entities/notification.entity.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/notification/infrastructure/delivery/delivery.dispatcher.int-spec.ts | reserva | generic ok | — |
| apps/api/src/modules/notification/infrastructure/delivery/delivery.dispatcher.spec.ts | reserva | generic ok | — |
| apps/api/src/modules/notification/infrastructure/delivery/delivery.dispatcher.ts | reserva,scheduling | generic ok | — |
| apps/api/src/modules/notification/notification.config.ts | product | generic ok | — |
| apps/api/src/modules/notification/notification.module.ts | product | generic ok | — |
| apps/api/src/openapi/authz-coverage.spec.ts | service | generic ok | — |
| apps/api/src/shared/config/env.spec.ts | service | generic ok | — |
| apps/api/src/shared/config/env.ts | service,product | generic ok | — |
| apps/api/src/shared/config/load-dotenv.ts | product | generic ok | — |
| apps/api/src/shared/infra/database/application-pool.ts | report | generic ok | — |
| apps/api/src/shared/infra/database/dedicated-client.factory.ts | activity | generic ok | — |
| apps/api/src/shared/infra/database/dedicated-client.int-spec.ts | activity,report | generic ok | — |
| apps/api/src/shared/infra/database/pool-metrics.ts | activity | generic ok | — |
| apps/api/src/shared/kernel/access/decorators.spec.ts | service | generic ok | — |
| apps/api/src/shared/kernel/access/decorators.ts | service | generic ok | — |
| apps/api/src/shared/kernel/access/permission.types.ts | product | generic ok | — |
| apps/api/src/shared/kernel/access/product-access-profiles.ts | product | generic ok | — |
| apps/api/src/shared/kernel/access/product-permission-catalogs.ts | product | generic ok | — |
| apps/api/src/shared/kernel/audit/audit-trail.module.ts | guest | remove | issue https://github.com/EmanuelVogt/platform-template/issues/7 |
| apps/api/src/shared/kernel/audit/audit-trail.repository.int-spec.ts | guest | remove | issue https://github.com/EmanuelVogt/platform-template/issues/6 |
| apps/api/src/shared/kernel/audit/purge-audit.job.ts | scheduling | generic ok | — |
| apps/api/src/shared/kernel/clock/bucket-sql.ts | clinic | remove | issue https://github.com/EmanuelVogt/platform-template/issues/7 |
| apps/api/src/shared/kernel/domain/entity-props.spec.ts | reserva | generic ok | — |
| apps/api/src/shared/kernel/errors/nested-acquisition.error.spec.ts | credit | remove | issue https://github.com/EmanuelVogt/platform-template/issues/7 |
| apps/api/src/shared/kernel/errors/pool-saturated.error.ts | service | generic ok | — |
| apps/api/src/shared/kernel/errors/problem-details.filter.spec.ts | service | generic ok | — |
| apps/api/src/shared/kernel/health/health.controller.spec.ts | service | generic ok | — |
| apps/api/src/shared/kernel/health/health.controller.ts | service | generic ok | — |
| apps/api/src/shared/kernel/idempotency/idempotency.cleanup.ts | scheduling | generic ok | — |
| apps/api/src/shared/kernel/idempotency/idempotency.repository.ts | reserva | generic ok | — |
| apps/api/src/shared/kernel/logging/log.redact.spec.ts | reserva,credit | generic ok | — |
| apps/api/src/shared/kernel/logging/log.redact.ts | credit | generic ok | — |
| apps/api/src/shared/kernel/logging/logger.factory.ts | reserva,service,product | generic ok | — |
| apps/api/src/shared/kernel/outbox/outbox.dispatcher.ts | reserva,scheduling | generic ok | — |
| apps/api/src/shared/kernel/outbox/outbox.int-spec.ts | reserva | generic ok | — |
| apps/api/src/shared/kernel/scheduling/advisory-lock.int-spec.ts | guest,reservation,reserva,scheduling | remove | issue https://github.com/EmanuelVogt/platform-template/issues/6 |
| apps/api/src/shared/kernel/scheduling/advisory-lock.ts | reserva,scheduling | generic ok | — |
| apps/api/src/shared/kernel/scheduling/maintenance-runtime.int-spec.ts | activity | generic ok | — |
| apps/api/src/shared/kernel/scheduling/scheduling.module.ts | scheduling | generic ok | — |
| apps/api/src/shared/kernel/shared-kernel.module.ts | scheduling | generic ok | — |
| apps/api/src/shared/kernel/tracing/tracing.setup.ts | service | generic ok | — |
| apps/api/src/shared/kernel/transactional/transaction-context.spec.ts | product | generic ok | — |
| apps/api/src/shared/kernel/transactional/transactional.decorator.spec.ts | product | generic ok | — |
| apps/api/src/shared/kernel/upload/product-upload-profiles.ts | product | generic ok | — |
| apps/web/src/app/router/product-routes.tsx | product | generic ok | — |
| apps/web/src/app/router/router.test.tsx | product | generic ok | — |
| apps/web/src/app/router/router.tsx | product | generic ok | — |
| apps/web/src/shared/test/fixed-clock.ts | agenda | remove | issue https://github.com/EmanuelVogt/platform-template/issues/7 |
| docs/agents/README.md | product | generic ok | — |
| docs/agents/communication.md | guest,hóspede,reserva,agenda,room,product | remove | issue https://github.com/EmanuelVogt/platform-template/issues/7 |
| docs/agents/harness.md | product,report | generic ok | — |
| docs/agents/infra.md.jinja | guest,reservation,reserva,service,product | remove | issue https://github.com/EmanuelVogt/platform-template/issues/7 |
| docs/agents/issue-tracker.md.jinja | hóspede,reserva,agenda,product,feedback,report | remove | issue https://github.com/EmanuelVogt/platform-template/issues/5 |
| docs/agents/workflow.md | product | generic ok | — |
| docs/back/back-arch.md | guest,reservation,reserva,agenda,scheduling,hospitality,accommodation,room,service,activity,credit,discount,product,feedback,report | remove | done 4cfd918..13125bc · issue #3 (full example genericization, deferred) |
| docs/dev/ambiente-local.md | reserva,service | generic ok | — |
| docs/dev/deploy.md.jinja | service | generic ok | — |
| docs/dev/template-changelog.md | guest,reserva,accommodation,credit,feedback,report | generic ok | — |
| docs/dev/template.md | reserva,product | generic ok | — |
| docs/front/front-arch.md | guest,hospede,reserva,agenda,product,feedback,report | remove | issue https://github.com/EmanuelVogt/platform-template/issues/4 |
