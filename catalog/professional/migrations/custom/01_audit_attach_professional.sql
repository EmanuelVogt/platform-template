-- Declara, num único ponto, quais tabelas desta entrada vão para a trilha da
-- entrada `audit` e quais colunas viajam REDIGIDAS. Mesmo mecanismo do
-- `identity/migrations/custom/04_audit_attach_hook.sql` (AD-032): a entrada
-- auditada só DECLARA a lista, numa função idempotente; quem a executa é
-- `audit/migrations/custom/02_attach_module_hooks.sql`, que descobre cada
-- `<schema>.attach_audit()` instalada via `pg_proc` e a roda no fim da própria
-- instalação — o audit nunca nomeia uma entrada (RULE C).
--
-- Por que a chamada direta não serviria: esta entrada declara
-- `dependsOn: identity`, e o `audit` também; a ordem topológica do instalador
-- pode gerar as migrações deste recorte ANTES das do audit, e aí `audit.attach`
-- ainda não existe — o guard sairia sem anexar nada e o filho nasceria com a
-- trilha VAZIA para o recorte inteiro. O `PERFORM` no fim deste arquivo cobre o
-- caminho inverso: produto que já tem audit instalado e adiciona esta entrada
-- depois anexa na hora.
--
-- São OITO tabelas, não sete: as sete que vieram do identity mais
-- `professional_profile`, que é nova e recebeu `serves_clients` e `birth_date`
-- de `identity.users` — tabela auditada. Deixá-la de fora perderia trilha que o
-- filho tinha antes do corte.
CREATE OR REPLACE FUNCTION professional.attach_audit()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regprocedure('audit.attach(text,text,text[],text[])') IS NULL THEN
    RAISE NOTICE 'entrada audit ausente: tabelas do professional nao anexadas a trilha';
    RETURN;
  END IF;

  PERFORM audit.attach('professional', 'professional_profile', '{user_id}', '{}');
  PERFORM audit.attach('professional', 'user_professional_areas', '{user_id,area_id}', '{}');
  PERFORM audit.attach('professional', 'user_professional_services', '{user_id,service_id}', '{}');
  PERFORM audit.attach('professional', 'user_scheduling_areas', '{user_id,area_id}', '{}');
  PERFORM audit.attach('professional', 'professional_default_hours', '{id}', '{}');
  PERFORM audit.attach('professional', 'user_professional_schedule_configs', '{user_id}', '{}');
  PERFORM audit.attach('professional', 'user_professional_schedule_config_slots', '{id}', '{}');
  PERFORM audit.attach('professional', 'user_professional_schedule_config_blocks', '{id}', '{}');
END;
$$;
--> statement-breakpoint

DO $$
BEGIN
  PERFORM professional.attach_audit();
END;
$$;
