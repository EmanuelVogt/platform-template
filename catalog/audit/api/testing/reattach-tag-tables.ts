import type { Pool } from "pg"

/**
 * Reaplica `tag/migrations/custom/01_audit_attach_tags.sql` — o `audit.attach`
 * daquele arquivo só existe quando `audit` já está instalado, e a ordem de
 * instalação entre as duas entradas não é forçada por `dependsOn` (são
 * siblings: `tag` declara a dependência de `audit.attach` como "de ordem, não
 * de dependsOn"). Num filho que instala as duas — `resolveInstallOrder` sem
 * entrada pedida devolve `notification, identity, tag, audit, attachment` —
 * `tag` roda ANTES, o guard `pg_proc`/`pg_namespace` do arquivo não acha
 * `audit.attach` e ele sai sem anexar nada. O README da entrada `tag` e o
 * comentário da própria migration documentam a saída: "se a entrada `audit`
 * for instalada depois de `tag`, este arquivo precisa ser reaplicado
 * manualmente (não há reencaixe retroativo automático)" — reencaixe automático
 * do lado de `audit` é explicitamente recusado pelo README desta entrada
 * ("cada módulo dono... isso não é responsabilidade desta entrada"). É essa
 * reaplicação manual que o teste de cobertura simula, do mesmo jeito que
 * `reattach-identity-tables.ts` simula o passo equivalente do identity.
 *
 * Idempotente e condicional: num `catalog:check audit` standalone o schema
 * `tag` nem existe e a função não faz nada.
 */
export async function reattachTagTables(pool: Pool): Promise<void> {
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('tag.tags') IS NOT NULL THEN
        PERFORM audit.attach('tag', 'tags', '{id}', '{}');
      END IF;
    END;
    $$;
  `)
}

/**
 * Desfaz `reattachTagTables` — mesma razão do detach do identity: `audit_row` é
 * DDL permanente que não some com o fim do teste e o worker do `test:db`
 * compartilha o banco entre arquivos, então a latência extra do trigger em
 * `tag.tags` vazaria para as suítes da entrada `tag` (que rodam sem trilha
 * quando `audit` não está instalado).
 */
export async function detachTagTables(pool: Pool): Promise<void> {
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('tag.tags') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS audit_row ON tag.tags';
      END IF;
    END;
    $$;
  `)
}
