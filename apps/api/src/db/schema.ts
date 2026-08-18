// Agrega TODAS as tabelas do backend (kernel e módulos) num único módulo de
// schema — é o `schema` do drizzle.config.ts e o que o AppModule entrega ao
// `DatabaseModule.forRoot` (o kernel não o importa: RULE A). Tabela nova exige
// o export aqui, senão o drizzle-kit não a enxerga (trava:
// schema-completeness.spec.ts). Imports relativos de propósito: drizzle-kit
// carrega este arquivo sem resolver o alias "@/".
export { idempotencyKeys } from "../shared/kernel/idempotency/idempotency.table"
export { outbox, outboxDead } from "../shared/kernel/outbox/outbox.table"
export { processedEvents } from "../shared/kernel/outbox/processed-events.table"
export * from "../modules/identity/infrastructure/tables/user.table"
export * from "../modules/identity/infrastructure/tables/user-permission.table"
export * from "../modules/identity/infrastructure/tables/user-professional-area.table"
export * from "../modules/identity/infrastructure/tables/user-professional-service.table"
export * from "../modules/identity/infrastructure/tables/user-scheduling-area.table"
export * from "../modules/identity/infrastructure/tables/user-professional-schedule-config.table"
export * from "../modules/identity/infrastructure/tables/professional-default-hours.table"
export * from "../modules/identity/infrastructure/tables/permission-template.table"
export * from "../modules/identity/infrastructure/tables/devices.table"
export * from "../modules/identity/infrastructure/tables/session.table"
export * from "../modules/identity/infrastructure/tables/verification-token.table"
export * from "../modules/identity/infrastructure/tables/auth-event.table"
export * from "../modules/attachment/infrastructure/tables/attachment.table"
export * from "../modules/attachment/infrastructure/tables/attachment-acl.table"
export * from "../modules/attachment/infrastructure/tables/attachment-access-log.table"
export * from "../modules/notification/infrastructure/tables/notification.table"
export * from "../modules/notification/infrastructure/tables/notification-delivery.table"
export * from "../modules/tag/infrastructure/tables/tag.table"
