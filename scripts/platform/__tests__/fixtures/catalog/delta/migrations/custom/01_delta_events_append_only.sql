-- impede update/delete em delta_events: tabela append-only
CREATE RULE delta_events_no_update AS ON UPDATE TO delta_events DO INSTEAD NOTHING;
CREATE RULE delta_events_no_delete AS ON DELETE TO delta_events DO INSTEAD NOTHING;
