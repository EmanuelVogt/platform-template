-- Append-only enforçado para identity.auth_events, com escape hatch de retention.
-- Defesa em profundidade: REVOKE remove o grant; o trigger barra mesmo se um
-- grant for reintroduzido por engano ou via SECURITY DEFINER. UPDATE sempre
-- bloqueado; DELETE só quando o job de purge liga o GUC transaction-scoped
-- app.auth_events_purge=on — SQLi precisaria do set_config na mesma tx.
REVOKE UPDATE, TRUNCATE ON identity.auth_events FROM CURRENT_USER;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION identity.auth_events_no_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'identity.auth_events e append-only: UPDATE bloqueado'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF current_setting('app.auth_events_purge', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'identity.auth_events e append-only: DELETE exige app.auth_events_purge=on'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS auth_events_append_only ON identity.auth_events;
--> statement-breakpoint
CREATE TRIGGER auth_events_append_only
  BEFORE UPDATE OR DELETE ON identity.auth_events
  FOR EACH ROW
  EXECUTE FUNCTION identity.auth_events_no_mutation();
