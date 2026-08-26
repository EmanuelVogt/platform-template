import type { Pool } from "pg"

import { AUDITED } from "../domain/audit-coverage"

/**
 * Reexecuta o passo de instalação `audit/migrations/custom/02_attach_module_hooks.sql`:
 * `audit.attach_module_hooks()` descobre, por `pg_proc`/`pg_namespace`, todo schema instalado
 * que declara `<schema>.attach_audit()` e roda cada um — hoje `identity`
 * (`identity/migrations/custom/04_audit_attach_hook.sql`, com `password_hash`, `token_hash` e
 * `cookie_token_hash` redigidos) e, quando a entrada estiver instalada no mesmo banco,
 * `professional` (as oito tabelas de `AUDITED` sob o schema `professional`, ver
 * `../domain/audit-coverage`).
 *
 * Não é uma cópia das migrações: é a mesma função que elas chamam, então uma lista errada num
 * dos arquivos-fonte chega aqui como teste vermelho. Existe porque `detachAuditHookTables`
 * (abaixo) derruba os triggers no `afterAll` de cada suíte e o banco do `test:db` é
 * compartilhado — sem reaplicar, a suíte seguinte encontraria o que a anterior desanexou.
 */
export async function reattachAuditHookTables(pool: Pool): Promise<void> {
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

const PROFESSIONAL_PREFIX = "professional."

/** As tabelas de `professional` declaradas em `AUDITED`, sem o prefixo de schema — a mesma
 *  fonte que `audit-coverage.int-spec.ts` usa pra cobrança de paridade. Derivar daqui em vez de
 *  manter uma segunda lista hardcoded é o que impede esta função de divergir da cobertura
 *  declarada (a mesma classe de bug que deixou os triggers de `professional` sem desanexar). */
function professionalTables(): string[] {
  return [...AUDITED]
    .filter((table) => table.startsWith(PROFESSIONAL_PREFIX))
    .map((table) => table.slice(PROFESSIONAL_PREFIX.length))
}

/**
 * Desfaz `reattachAuditHookTables` — o trigger `audit_row` é DDL permanente na
 * conexão/banco (não é desfeito por rollback de teste), e o worker do
 * `test:db` compartilha o banco entre arquivos. Sem isto, o overhead do
 * trigger em INSERT/UPDATE/DELETE vaza para suítes que rodam no mesmo worker
 * (achado ao rodar `catalog:check audit`: latência extra derrubou timeouts de
 * e2e do identity que não tocam trilha nenhuma).
 *
 * `identity` é `dependsOn` de `audit`: sempre instalado onde `audit` está, drop incondicional.
 * `professional` não é — siblings, sem ordem forçada — e o schema só existe neste banco se a
 * entrada estiver instalada, daí o guard condicional, no mesmo estilo de
 * `reattach-tag-tables.ts`. Antes desta função cobrir as duas, `reattachAuditHookTables` (via
 * `attach_module_hooks()`, que descobre qualquer schema instalado com `attach_audit()`, sem
 * distinguir quem pediu) anexava as oito tabelas de `professional`, mas nada as desanexava —
 * sobreviviam para as suítes seguintes no mesmo worker do `test:db` compartilhado.
 */
export async function detachAuditHookTables(pool: Pool): Promise<void> {
  const identityDrops = IDENTITY_TABLES.map(
    (table) => `DROP TRIGGER IF EXISTS audit_row ON identity.${table};`
  ).join("\n")
  const professionalDrops = professionalTables()
    .map(
      (table) =>
        `EXECUTE 'DROP TRIGGER IF EXISTS audit_row ON professional.${table}';`
    )
    .join("\n      ")
  await pool.query(`
    ${identityDrops}
    DO $$
    BEGIN
      IF to_regnamespace('professional') IS NOT NULL THEN
        ${professionalDrops}
      END IF;
    END;
    $$;
  `)
}
