/**
 * Cobertura da trilha de auditoria (espelha os attaches da migration
 * 0003_audit_trail). Toda tabela de negócio de schema de módulo está em AUDITED
 * ou EXEMPT; o enforcement é o audit-coverage.int-spec e os specs do módulo
 * audit (aggregate-registry, table-owners). Módulo de produto novo entra aqui
 * junto com a migration que anexa o trigger.
 */
export const MODULE_SCHEMAS = [
  "attachment",
  "identity",
  "notification",
  "tag",
] as const

export const AUDITED: ReadonlySet<string> = new Set([
  "identity.users",
  "identity.devices",
  "identity.sessions",
  "identity.verification_tokens",
  "identity.permission_templates",
  "identity.permission_template_permissions",
  "identity.user_permissions",
  "identity.user_professional_areas",
  "identity.user_professional_services",
  "identity.user_scheduling_areas",
  "identity.professional_default_hours",
  "identity.user_professional_schedule_configs",
  "identity.user_professional_schedule_config_slots",
  "identity.user_professional_schedule_config_blocks",
  "tag.tags",
])

export const EXEMPT: ReadonlySet<string> = new Set([
  "identity.auth_events",
  "attachment.attachments",
  "attachment.attachment_acls",
  "attachment.attachment_access_logs",
  "notification.notifications",
  "notification.notification_deliveries",
])
