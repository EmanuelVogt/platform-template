-- Executa o hook de anexação de cada módulo já instalado, no fim da instalação
-- do audit.
--
-- Por que existe: um módulo com tabela auditável chama `audit.attach` na própria
-- migração, mas só consegue se o audit já estiver instalado — e os módulos que a
-- trilha audita são justamente os `dependsOn` desta entrada, ou seja, instalam
-- ANTES dela (ordem topológica de `scripts/platform/lib/catalog-graph.mjs`).
-- A chamada deles caía no guard "audit ausente" e o filho recém-gerado nascia
-- sem trilha nenhuma, sem que nada reclamasse.
--
-- O contrato é: quem tem tabela auditável declara `<schema>.attach_audit()` — sem
-- argumentos, idempotente, com a lista das SUAS tabelas e das SUAS colunas
-- redigidas (ex.: `identity.attach_audit()` em
-- `identity/migrations/custom/04_audit_attach_hook.sql`) — e esta migração
-- executa todos os hooks que encontrar. A entrada audit segue sem conhecer quem
-- é auditado: conhece só o nome do hook.
CREATE OR REPLACE FUNCTION "audit".attach_module_hooks()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_schema text;
BEGIN
  FOR v_schema IN
    SELECT n.nspname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'attach_audit'
      AND p.pronargs = 0
      AND n.nspname NOT IN ('audit', 'pg_catalog', 'information_schema')
    ORDER BY n.nspname
  LOOP
    EXECUTE format('SELECT %I.attach_audit()', v_schema);
    RAISE NOTICE 'trilha: hook %.attach_audit() aplicado', v_schema;
  END LOOP;
END;
$$;
--> statement-breakpoint

DO $$
BEGIN
  PERFORM "audit".attach_module_hooks();
END;
$$;
