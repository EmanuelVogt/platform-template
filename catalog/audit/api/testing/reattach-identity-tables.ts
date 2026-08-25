import type { Pool } from "pg"

/**
 * Reexecuta o passo de instalação `audit/migrations/custom/02_attach_module_hooks.sql`:
 * `audit.attach_module_hooks()` roda o hook `<schema>.attach_audit()` de cada módulo
 * instalado — para o identity, a lista declarada em
 * `identity/migrations/custom/04_audit_attach_hook.sql`, com `password_hash`,
 * `token_hash` e `cookie_token_hash` redigidos.
 *
 * Não é uma cópia da migração: é a mesma função que a migração chama, então uma
 * lista errada no arquivo do identity chega aqui como teste vermelho. Existe
 * porque `detachIdentityTables` (abaixo) derruba os triggers no `afterAll` de
 * cada suíte e o banco do `test:db` é compartilhado — sem reaplicar, a suíte
 * seguinte encontraria o que a anterior desanexou.
 */
export async function reattachIdentityTables(pool: Pool): Promise<void> {
  await pool.query("SELECT audit.attach_module_hooks()")
}

const IDENTITY_TABLES = [
  "users",
  "devices",
  "sessions",
  "verification_tokens",
  "permission_templates",
  "permission_template_permissions",
  "user_permissions",
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
