-- Declara, num único ponto, quais tabelas do identity vão para a trilha da
-- entrada `audit` e quais colunas viajam REDIGIDAS. Substitui as chamadas
-- diretas de 02_audit_attach.sql e 03_audit_redact_token_hashes.sql (removidos).
--
-- Por que a chamada direta não servia: a entrada `audit` declara
-- `dependsOn: identity`, então a ordem topológica do instalador
-- (`scripts/platform/lib/catalog-graph.mjs`) SEMPRE gera as migrações do
-- identity antes das do audit. `audit.attach` ainda não existe quando aquelas
-- rodam: o guard saía sem anexar nada e o filho nascia com a trilha VAZIA para
-- todo o identity — inclusive sem a redação de `users.password_hash`,
-- `sessions.token_hash`, `devices.cookie_token_hash` e
-- `verification_tokens.token_hash`, que é o que impede a trilha de virar
-- material para sequestrar sessão ou queimar um token de verificação.
--
-- Agora o identity só DECLARA a lista, numa função idempotente; quem a executa
-- é `audit/migrations/custom/02_attach_module_hooks.sql`, no fim da instalação
-- do audit — a entrada audit entrega o mecanismo (`audit.attach` + o replay dos
-- hooks), nunca a lista de quem é auditado. O `PERFORM` no fim deste arquivo
-- cobre o caminho inverso: produto que já tem audit instalado e adiciona ou
-- atualiza o identity depois anexa na hora.
--
-- `identity.auth_events` fica de fora de propósito: já é append-only por trigger
-- própria (01_auth_events_append_only.sql) e duplicaria a trilha.
CREATE OR REPLACE FUNCTION identity.attach_audit()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regprocedure('audit.attach(text,text,text[],text[])') IS NULL THEN
    RAISE NOTICE 'entrada audit ausente: tabelas do identity nao anexadas a trilha';
    RETURN;
  END IF;

  PERFORM audit.attach('identity', 'users', '{id}', '{password_hash}');
  PERFORM audit.attach('identity', 'sessions', '{id}', '{token_hash}');
  PERFORM audit.attach('identity', 'devices', '{id}', '{cookie_token_hash}');
  PERFORM audit.attach('identity', 'verification_tokens', '{id}', '{token_hash}');
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
--> statement-breakpoint

DO $$
BEGIN
  PERFORM identity.attach_audit();
END;
$$;
