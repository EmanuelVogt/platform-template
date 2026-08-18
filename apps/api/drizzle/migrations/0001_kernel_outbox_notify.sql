-- NOTIFY por insert no outbox: o dispatcher escuta `outbox_new` num client
-- dedicado e acorda sem polling. Fora do alcance do drizzle-kit (função +
-- trigger não vivem no schema TypeScript).
CREATE OR REPLACE FUNCTION "_kernel".outbox_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('outbox_new', NEW.event_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE TRIGGER outbox_notify_trigger
  AFTER INSERT ON "_kernel".outbox
  FOR EACH ROW EXECUTE FUNCTION "_kernel".outbox_notify();
