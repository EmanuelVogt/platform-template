-- Encaixa a tabela `tags` na trilha de auditoria genérica, extraído de
-- apps/api/drizzle/migrations/0003_audit_trail.sql (linha "SELECT audit.attach('tag', 'tags', ...)").
-- audit.attach só existe quando a entrada `audit` está instalada no app filho — dependência de
-- ordem, não de dependsOn (tag não exige audit). O guard abaixo faz este arquivo instalar sem
-- erro num filho sem a entrada `audit`; rodar `platform module add audit` depois não reencaixa
-- retroativamente — reaplique este arquivo manualmente se a ordem de instalação for invertida.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'audit' AND p.proname = 'attach'
  ) THEN
    PERFORM audit.attach('tag', 'tags', '{id}', '{}');
  END IF;
END;
$$;
