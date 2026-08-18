-- Trilha de auditoria por trigger genérica (spec 2026-07-07-audit-log-module-design).
-- Captura no banco, não app-layer: parte dos writes não passa pela entidade
-- (update em massa, replace DELETE+INSERT, backfill) — captura app-layer ficaria
-- cega ou fabricaria histórico. A aplicação só LÊ a trilha. Ver ADR 0040.

-- 1) Schema dedicado da trilha.
CREATE SCHEMA IF NOT EXISTS "audit";
--> statement-breakpoint

-- 2) Tabela append-only. row_old/row_new completos (não só o diff): reprocessável
--    sem migração; changed_keys dá o campo-a-campo indexável. seq (identity) fixa
--    a ordem intra-tx estável; tx_id agrupa a ação composta.
CREATE TABLE "audit"."entries" (
	"seq" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"schema_name" text NOT NULL,
	"table_name" text NOT NULL,
	"entity_id" text NOT NULL,
	"op" text NOT NULL,
	"row_old" jsonb,
	"row_new" jsonb,
	"changed_keys" text[] DEFAULT '{}' NOT NULL,
	"actor_user_id" text,
	"correlation_id" text,
	"origin" text DEFAULT 'unknown' NOT NULL,
	"tx_id" bigint NOT NULL,
	CONSTRAINT "audit_entries_op_check" CHECK ("op" IN ('insert','update','delete'))
);
--> statement-breakpoint
CREATE INDEX "audit_entries_table_time_idx" ON "audit"."entries" ("table_name","occurred_at" DESC,"seq" DESC);
--> statement-breakpoint
CREATE INDEX "audit_entries_entity_idx" ON "audit"."entries" ("table_name","entity_id","occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX "audit_entries_actor_idx" ON "audit"."entries" ("actor_user_id","occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX "audit_entries_tx_idx" ON "audit"."entries" ("tx_id");
--> statement-breakpoint
CREATE INDEX "audit_entries_occurred_brin" ON "audit"."entries" USING brin ("occurred_at");
--> statement-breakpoint

-- 3) Append-only com escape hatch (retention/purge LGPD). UPDATE sempre bloqueado;
--    DELETE só quando o job liga o GUC transaction-scoped app.audit_maintenance=on.
--    O trigger é a barreira real — SQLi precisaria do set_config na mesma tx.
CREATE OR REPLACE FUNCTION "audit".restrict_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit.entries e append-only: UPDATE bloqueado'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF current_setting('app.audit_maintenance', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'audit.entries e append-only: DELETE exige app.audit_maintenance=on'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_entries_append_only
  BEFORE UPDATE OR DELETE ON "audit"."entries"
  FOR EACH ROW
  EXECUTE FUNCTION "audit".restrict_mutation();
--> statement-breakpoint
-- Defesa em profundidade: remove UPDATE/TRUNCATE da role da aplicação. INSERT e
-- DELETE seguem (DELETE gateado pelo trigger acima); o trigger barra mesmo se um
-- grant for reintroduzido por engano.
REVOKE UPDATE, TRUNCATE ON "audit"."entries" FROM CURRENT_USER;
--> statement-breakpoint

-- 4) Captura genérica: AFTER INSERT/UPDATE/DELETE FOR EACH ROW. TG_ARGV[0] = colunas
--    de PK (text[], juntadas com ':' — suporta PK composta); TG_ARGV[1] = colunas
--    redigidas (valor vira "[REDACTED]" antes de gravar).
CREATE OR REPLACE FUNCTION "audit".record_row_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pk_cols  text[] := TG_ARGV[0]::text[];
  v_redacted text[] := TG_ARGV[1]::text[];
  v_old      jsonb;
  v_new      jsonb;
  v_changed  text[] := '{}';
  v_entity   text;
  v_ctx      jsonb;
  v_key      text;
  v_col      text;
BEGIN
  -- Escape hatch: carga sintética (seed demo) liga app.audit_skip e não gera trilha.
  IF current_setting('app.audit_skip', true) = 'on' THEN
    RETURN NULL;
  END IF;

  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

  -- changed_keys no UPDATE: chaves com valor distinto, exceto updated_at (a entidade
  -- sempre carimba updatedAt — sem a exclusão todo save full-row vira ruído).
  IF TG_OP = 'UPDATE' THEN
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key <> 'updated_at'
         AND (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
        v_changed := array_append(v_changed, v_key);
      END IF;
    END LOOP;
    -- No-op (só updated_at ou nada mudou): não grava.
    IF array_length(v_changed, 1) IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;

  -- entity_id = valores das colunas de PK juntados com ':' (ordem estável).
  SELECT string_agg(coalesce(coalesce(v_new, v_old) ->> col, ''), ':' ORDER BY ord)
    INTO v_entity
  FROM unnest(v_pk_cols) WITH ORDINALITY AS t(col, ord);

  -- Redaction antes de gravar: o dado sensível nunca persiste na trilha.
  IF array_length(v_redacted, 1) IS NOT NULL THEN
    FOREACH v_col IN ARRAY v_redacted LOOP
      IF v_old ? v_col THEN
        v_old := jsonb_set(v_old, ARRAY[v_col], '"[REDACTED]"'::jsonb);
      END IF;
      IF v_new ? v_col THEN
        v_new := jsonb_set(v_new, ARRAY[v_col], '"[REDACTED]"'::jsonb);
      END IF;
    END LOOP;
  END IF;

  -- Contexto do ator (set_config app.audit_ctx pela TransactionManager). Ausente/
  -- vazio → actor NULL, origin 'unknown' (a linha existe mesmo assim).
  v_ctx := nullif(current_setting('app.audit_ctx', true), '')::jsonb;

  INSERT INTO "audit"."entries" (
    schema_name, table_name, entity_id, op,
    row_old, row_new, changed_keys,
    actor_user_id, correlation_id, origin, tx_id
  ) VALUES (
    TG_TABLE_SCHEMA, TG_TABLE_NAME, v_entity, lower(TG_OP),
    v_old, v_new, v_changed,
    v_ctx ->> 'actor_user_id',
    v_ctx ->> 'correlation_id',
    coalesce(v_ctx ->> 'origin', 'unknown'),
    txid_current()
  );
  RETURN NULL;
END;
$$;
--> statement-breakpoint

-- 5) Helper de attach: anexar tabela nova = 1 linha de SQL. Recria o trigger
--    audit_row (idempotente) com as colunas de PK e as redigidas por argumento.
CREATE OR REPLACE FUNCTION "audit".attach(
  p_schema text, p_table text, p_pk_cols text[], p_redacted text[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS audit_row ON %I.%I', p_schema, p_table);
  EXECUTE format(
    'CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
    || 'FOR EACH ROW EXECUTE FUNCTION audit.record_row_change(%L, %L)',
    p_schema, p_table, p_pk_cols, p_redacted
  );
END;
$$;
--> statement-breakpoint

-- 6) Cobertura: toda tabela de negócio dos schemas de módulo. EXEMPT (sem
--    attach): _kernel.*, identity.auth_events, notification.*, attachment.* —
--    decisão consciente. Módulo de produto novo anexa as suas em migration própria.
SELECT audit.attach('identity', 'users', '{id}', '{password_hash}');
--> statement-breakpoint
SELECT audit.attach('identity', 'devices', '{id}', '{}');
--> statement-breakpoint
SELECT audit.attach('identity', 'sessions', '{id}', '{}');
--> statement-breakpoint
SELECT audit.attach('identity', 'verification_tokens', '{id}', '{}');
--> statement-breakpoint
SELECT audit.attach('identity', 'permission_templates', '{id}', '{}');
--> statement-breakpoint
SELECT audit.attach('identity', 'permission_template_permissions', '{template_id,permission}', '{}');
--> statement-breakpoint
SELECT audit.attach('identity', 'user_permissions', '{user_id,permission}', '{}');
--> statement-breakpoint
SELECT audit.attach('identity', 'user_professional_areas', '{user_id,area_id}', '{}');
--> statement-breakpoint
SELECT audit.attach('identity', 'user_professional_services', '{user_id,service_id}', '{}');
--> statement-breakpoint
SELECT audit.attach('identity', 'user_scheduling_areas', '{user_id,area_id}', '{}');
--> statement-breakpoint
SELECT audit.attach('identity', 'professional_default_hours', '{id}', '{}');
--> statement-breakpoint
SELECT audit.attach('identity', 'user_professional_schedule_configs', '{user_id}', '{}');
--> statement-breakpoint
SELECT audit.attach('identity', 'user_professional_schedule_config_slots', '{id}', '{}');
--> statement-breakpoint
SELECT audit.attach('identity', 'user_professional_schedule_config_blocks', '{id}', '{}');
--> statement-breakpoint
SELECT audit.attach('tag', 'tags', '{id}', '{}');
--> statement-breakpoint

-- 7) Busca da trilha por `q` (autor/entidade/alterações). O trgm no conteúdo
-- concatenado das alterações torna o ILIKE performático — sem ele, o scan
-- casta jsonb->text linha a linha. Mesma expressão do WHERE do repositório.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "audit_entries_changes_trgm" ON "audit"."entries"
  USING gin ((coalesce("row_old"::text, '') || coalesce("row_new"::text, '')) gin_trgm_ops);
