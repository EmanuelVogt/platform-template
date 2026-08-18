/**
 * Visão de agregado da trilha: tabela raiz → satélites exibidas juntas na
 * listagem. Nomes de tabela são únicos entre schemas (invariante garantida
 * pelo spec de consistência contra AUDITED).
 */
export const AGGREGATE_SATELLITES: Record<string, readonly string[]> = {
  users: [
    "user_permissions",
    "user_professional_areas",
    "user_professional_services",
    "user_scheduling_areas",
    "user_professional_schedule_configs",
    "user_professional_schedule_config_slots",
    "user_professional_schedule_config_blocks",
  ],
  permission_templates: ["permission_template_permissions"],
  professional_default_hours: [],
  tags: [],
}

// Auditadas mas fora da visão de agregado: todo login escreve nelas e a trilha
// do usuário viraria ruído. Consultáveis por filtro direto de tabela.
export const TECHNICAL_TABLES: readonly string[] = [
  "devices",
  "sessions",
  "verification_tokens",
]

export function tablesForAggregate(root: string): string[] {
  const satellites = AGGREGATE_SATELLITES[root]
  if (satellites === undefined) return [root]
  return [root, ...satellites]
}
