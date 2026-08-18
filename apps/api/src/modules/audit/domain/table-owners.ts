import type { PermissionKey } from "../../../shared/kernel/access/permission.types"

/**
 * Dono de cada tabela auditada: a chave "Ver logs" que libera a leitura da
 * trilha daquela tabela (ADR 0049). Nome de tabela não-qualificado — nomes são
 * únicos entre schemas (invariante do aggregate-registry). Consistência com
 * AUDITED garantida pelo spec.
 */
export const AUDIT_TABLE_OWNERS: Record<string, PermissionKey> = {
  users: "admin.users.audit.read",
  user_permissions: "admin.users.audit.read",
  user_professional_areas: "admin.users.audit.read",
  user_professional_services: "admin.users.audit.read",
  user_scheduling_areas: "admin.users.audit.read",
  user_professional_schedule_configs: "admin.users.audit.read",
  user_professional_schedule_config_slots: "admin.users.audit.read",
  user_professional_schedule_config_blocks: "admin.users.audit.read",
  professional_default_hours: "admin.users.audit.read",
  devices: "admin.users.audit.read",
  sessions: "admin.users.audit.read",
  verification_tokens: "admin.users.audit.read",
  permission_templates: "admin.permission_templates.audit.read",
  permission_template_permissions: "admin.permission_templates.audit.read",
  tags: "admin.tags.audit.read",
}

export function auditOwnerOf(table: string): PermissionKey | undefined {
  return Object.hasOwn(AUDIT_TABLE_OWNERS, table)
    ? AUDIT_TABLE_OWNERS[table]
    : undefined
}

export function allowedAuditTables(owned: ReadonlySet<string>): string[] {
  return Object.entries(AUDIT_TABLE_OWNERS)
    .filter(([, key]) => owned.has(key))
    .map(([table]) => table)
}
