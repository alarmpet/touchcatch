-- Attach the g3 match tables to the match they belong to.
--
-- All six were created with `match_id uuid not null` and no foreign key. Nothing in the schema
-- said the rows belonged to a person, so the account-deletion inventory derived from foreign-key
-- reachability walked straight past them, and a cascade delete would have left the journal,
-- snapshots, receipts, timers, leases and outbox behind after the match itself was gone.
--
-- Safe to add now: `apply_match_command_g3` has no caller in apps/ or packages/, so these tables
-- hold no rows in any environment. Doing it before PvP ships is the only cheap moment.
--
-- `on delete cascade` matches public.match_players, which has always cascaded from public.matches.

alter table private.g3_command_receipts
  add constraint g3_command_receipts_match_id_fkey
  foreign key (match_id) references public.matches(id) on delete cascade;

alter table private.g3_journal
  add constraint g3_journal_match_id_fkey
  foreign key (match_id) references public.matches(id) on delete cascade;

alter table private.g3_snapshots
  add constraint g3_snapshots_match_id_fkey
  foreign key (match_id) references public.matches(id) on delete cascade;

alter table private.g3_timer_intents
  add constraint g3_timer_intents_match_id_fkey
  foreign key (match_id) references public.matches(id) on delete cascade;

alter table private.g3_effect_outbox
  add constraint g3_effect_outbox_match_id_fkey
  foreign key (match_id) references public.matches(id) on delete cascade;

alter table private.g3_match_leases
  add constraint g3_match_leases_match_id_fkey
  foreign key (match_id) references public.matches(id) on delete cascade;
