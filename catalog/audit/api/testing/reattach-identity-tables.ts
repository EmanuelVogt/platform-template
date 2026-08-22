import type { Pool } from "pg"

/**
 * Reaplica `identity/migrations/custom/02_audit_attach.sql` — o `audit.attach`
 * daquele arquivo só existe quando `audit` já está instalado, e no
 * `catalog:check audit` (identity primeiro, audit depois: `dependsOn`) ele
 * roda ANTES de `audit.attach` existir, então sai sem anexar nada (guard
 * documentado no próprio arquivo, `to_regprocedure(...) IS NULL`). O mesmo
 * arquivo documenta a saída: "instalar audit depois do identity exige
 * reexecutar este passo... o helper é idempotente, então reaplicar é
 * seguro" — é exatamente essa reaplicação que um produto real faria depois
 * de instalar audit, e que os testes de audit precisam simular para exercitar
 * o trigger contra tabelas do identity.
 */
export async function reattachIdentityTables(pool: Pool): Promise<void> {
  await pool.query(`
    SELECT audit.attach('identity', 'users', '{id}', '{password_hash}');
    SELECT audit.attach('identity', 'devices', '{id}', '{}');
    SELECT audit.attach('identity', 'sessions', '{id}', '{}');
    SELECT audit.attach('identity', 'verification_tokens', '{id}', '{}');
    SELECT audit.attach('identity', 'permission_templates', '{id}', '{}');
    SELECT audit.attach('identity', 'permission_template_permissions', '{template_id,permission}', '{}');
    SELECT audit.attach('identity', 'user_permissions', '{user_id,permission}', '{}');
    SELECT audit.attach('identity', 'user_professional_areas', '{user_id,area_id}', '{}');
    SELECT audit.attach('identity', 'user_professional_services', '{user_id,service_id}', '{}');
    SELECT audit.attach('identity', 'user_scheduling_areas', '{user_id,area_id}', '{}');
    SELECT audit.attach('identity', 'professional_default_hours', '{id}', '{}');
    SELECT audit.attach('identity', 'user_professional_schedule_configs', '{user_id}', '{}');
    SELECT audit.attach('identity', 'user_professional_schedule_config_slots', '{id}', '{}');
    SELECT audit.attach('identity', 'user_professional_schedule_config_blocks', '{id}', '{}');
  `)
}

const IDENTITY_TABLES = [
  "users",
  "devices",
  "sessions",
  "verification_tokens",
  "permission_templates",
  "permission_template_permissions",
  "user_permissions",
  "user_professional_areas",
  "user_professional_services",
  "user_scheduling_areas",
  "professional_default_hours",
  "user_professional_schedule_configs",
  "user_professional_schedule_config_slots",
  "user_professional_schedule_config_blocks",
]

/**
 * Desfaz `reattachIdentityTables` — o trigger `audit_row` é DDL permanente na
 * conexão/banco (não é desfeito por rollback de teste), e o worker do
 * `test:db` compartilha o banco entre arquivos. Sem isto, o overhead do
 * trigger em INSERT/UPDATE/DELETE vaza para suítes do identity que rodam no
 * mesmo worker (achado ao rodar `catalog:check audit`: latência extra
 * derrubou timeouts de e2e do identity que não tocam trilha nenhuma).
 */
export async function detachIdentityTables(pool: Pool): Promise<void> {
  const drops = IDENTITY_TABLES.map(
    (table) => `DROP TRIGGER IF EXISTS audit_row ON identity.${table};`
  ).join("\n")
  await pool.query(drops)
}
