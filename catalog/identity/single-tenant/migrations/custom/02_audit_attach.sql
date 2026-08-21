-- Anexa as tabelas do identity à trilha de auditoria da entrada `audit`. Cada
-- módulo anexa as SUAS tabelas na própria migração — a entrada `audit` entrega o
-- schema, a tabela e o helper `audit.attach`, nunca a lista de quem é auditado.
--
-- `identity.auth_events` fica de fora de propósito: já é append-only por trigger
-- própria (01_auth_events_append_only.sql) e duplicaria a trilha.
--
-- A entrada `audit` é OPCIONAL: sem ela `audit.attach` não existe e o bloco sai
-- sem anexar nada, em vez de quebrar a migração. Instalar `audit` depois do
-- identity exige reexecutar este passo (o `module add` do audit não conhece as
-- tabelas do identity) — o helper é idempotente, então reaplicar é seguro.
DO $$
BEGIN
  IF to_regprocedure('audit.attach(text,text,text[],text[])') IS NULL THEN
    RAISE NOTICE 'entrada audit ausente: tabelas do identity nao anexadas a trilha';
    RETURN;
  END IF;

  PERFORM audit.attach('identity', 'users', '{id}', '{password_hash}');
  PERFORM audit.attach('identity', 'devices', '{id}', '{}');
  PERFORM audit.attach('identity', 'sessions', '{id}', '{}');
  PERFORM audit.attach('identity', 'verification_tokens', '{id}', '{}');
  PERFORM audit.attach('identity', 'permission_templates', '{id}', '{}');
  PERFORM audit.attach('identity', 'permission_template_permissions', '{template_id,permission}', '{}');
  PERFORM audit.attach('identity', 'user_permissions', '{user_id,permission}', '{}');
  PERFORM audit.attach('identity', 'user_professional_areas', '{user_id,area_id}', '{}');
  PERFORM audit.attach('identity', 'user_professional_services', '{user_id,service_id}', '{}');
  PERFORM audit.attach('identity', 'user_scheduling_areas', '{user_id,area_id}', '{}');
  PERFORM audit.attach('identity', 'professional_default_hours', '{id}', '{}');
  PERFORM audit.attach('identity', 'user_professional_schedule_configs', '{user_id}', '{}');
  PERFORM audit.attach('identity', 'user_professional_schedule_config_slots', '{id}', '{}');
  PERFORM audit.attach('identity', 'user_professional_schedule_config_blocks', '{id}', '{}');
END;
$$;
