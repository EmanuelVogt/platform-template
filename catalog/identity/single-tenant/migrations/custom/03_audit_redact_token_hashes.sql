-- Reanexa as tabelas de credencial do identity à trilha com a coluna de hash
-- REDIGIDA. Sem isto, `sessions.token_hash`, `devices.cookie_token_hash` e
-- `verification_tokens.token_hash` viajavam em claro para `audit.entries` a
-- cada INSERT/UPDATE/DELETE: quem lê a trilha ganhava material para sequestrar
-- sessão ou queimar um token de verificação, e o hash ficava fora da retenção
-- da própria credencial. As demais tabelas seguem como estão em
-- 02_audit_attach.sql — este passo só troca a lista de redação destas três.
--
-- Mesmo guard de 02_audit_attach.sql: a entrada `audit` é OPCIONAL, então sem
-- ela o bloco sai sem anexar nada em vez de quebrar a migração. `audit.attach`
-- é idempotente (DROP TRIGGER IF EXISTS + CREATE), então reexecutar é seguro.
DO $$
BEGIN
  IF to_regprocedure('audit.attach(text,text,text[],text[])') IS NULL THEN
    RAISE NOTICE 'entrada audit ausente: hashes de token do identity nao redigidos na trilha';
    RETURN;
  END IF;

  PERFORM audit.attach('identity', 'sessions', '{id}', '{token_hash}');
  PERFORM audit.attach('identity', 'devices', '{id}', '{cookie_token_hash}');
  PERFORM audit.attach('identity', 'verification_tokens', '{id}', '{token_hash}');
END;
$$;
