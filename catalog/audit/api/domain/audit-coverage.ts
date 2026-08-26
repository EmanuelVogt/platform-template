/**
 * Cobertura da trilha de auditoria (espelha os attaches da migration
 * 0003_audit_trail). Toda tabela de negócio de schema de módulo está em AUDITED
 * ou EXEMPT; o enforcement é o audit-coverage.int-spec e os specs do módulo
 * audit (aggregate-registry, table-owners). Módulo de produto novo entra aqui
 * junto com a migration que anexa o trigger.
 *
 * Por que a lista é do produto inteiro e não de cada entrada: no SQL a entrada
 * dona declara sozinha, na própria `<schema>.attach_audit()` (AD-032). No TS
 * não há esse caminho — importar `modules/<irmã>/**` daqui é aresta fora do
 * `dependsOn` (RULE C), e devolver o registro para a irmã esbarra em
 * `DuplicateAuditRegistrationError` (mesmo motivo que mantém o alvo de FK
 * `professional_user_id` no base set). A irmã declara o attach, o audit declara
 * a cobertura, e o int-spec fica vermelho se as duas divergirem.
 */
export const MODULE_SCHEMAS = [
  "attachment",
  "identity",
  "notification",
  "professional",
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
  // As oito de `professional/migrations/custom/01_audit_attach_professional.sql`:
  // as sete que saíram do `identity` no corte do agregado (AD-035) mais
  // `professional_profile`, que herdou `serves_clients`/`birth_date` de
  // `identity.users` — tabela que já era auditada antes do corte.
  "professional.professional_profile",
  "professional.user_professional_areas",
  "professional.user_professional_services",
  "professional.user_scheduling_areas",
  "professional.professional_default_hours",
  "professional.user_professional_schedule_configs",
  "professional.user_professional_schedule_config_slots",
  "professional.user_professional_schedule_config_blocks",
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
