alter default privileges for role game_security_owner in schema public revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role game_security_owner in schema public revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role game_security_owner in schema public revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role game_security_owner in schema private revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role game_security_owner in schema private revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role game_security_owner in schema private revoke execute on functions from public, anon, authenticated, service_role;

create table private.legacy_matches_quarantine (
  legacy_match_id uuid primary key,
  match_row jsonb not null,
  player_rows jsonb not null,
  quarantine_reason text not null default 'CONTENT_REVISION_AND_PARTICIPANT_BACKFILL_REQUIRED',
  quarantined_at timestamptz not null default now()
);
insert into private.legacy_matches_quarantine(legacy_match_id, match_row, player_rows)
select m.id, to_jsonb(m), coalesce(jsonb_agg(to_jsonb(mp)) filter (where mp.match_id is not null), '[]'::jsonb)
from public.matches m
left join public.match_players mp on mp.match_id = m.id
group by m.id;
delete from public.match_players;
delete from public.matches;

alter table public.matches alter column status drop default;
alter type public.match_status rename to match_status_legacy;
create type public.match_status as enum (
  'WAITING_FOR_ASSETS','COUNTDOWN','PLAYING','FINAL_RUSH','SETTLING',
  'TIEBREAK_EVAL','SUDDEN_DEATH','FINISHED','CANCELLED'
);
alter table public.matches alter column status type public.match_status
using ((case status::text when 'WAITING' then 'WAITING_FOR_ASSETS' else status::text end)::public.match_status);
alter table public.matches alter column status set default 'WAITING_FOR_ASSETS';
drop type public.match_status_legacy;

alter table public.matches
  drop column content_id,
  drop column winner_user_id,
  add column content_revision_id uuid not null references public.game_content_revisions(content_revision_id) on delete restrict,
  add column ruleset_version text not null,
  add column ruleset_hash text not null check (ruleset_hash ~ '^[a-f0-9]{64}$'),
  add column engine_version text not null,
  add column protocol_version text not null,
  add column experiment_variant text not null,
  add column winner_participant_key uuid;
drop table public.game_contents;

alter table public.match_players drop constraint match_players_pkey;
alter table public.match_players drop constraint match_players_user_id_fkey;
alter table public.match_players alter column user_id drop not null;
alter table public.match_players
  add column participant_key uuid not null,
  add column seat_no smallint not null,
  add constraint match_players_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null,
  add constraint match_players_pkey primary key (match_id, participant_key),
  add constraint match_players_seat_range check (seat_no in (1,2)),
  add constraint match_players_score_nonnegative check (score >= 0),
  add constraint match_players_match_seat_unique unique (match_id, seat_no);
create unique index match_players_match_user_unique on public.match_players(match_id, user_id) where user_id is not null;
alter table public.matches add constraint matches_winner_participant_fkey
  foreign key (id, winner_participant_key)
  references public.match_players(match_id, participant_key)
  deferrable initially deferred;

alter table public.matches add constraint matches_terminal_shape check (
  (
    status not in ('FINISHED','CANCELLED')
    and ended_at is null and end_reason is null and winner_participant_key is null
  ) or (
    status = 'CANCELLED'
    and ended_at is not null
    and end_reason in ('NO_CONTEST_ASSET_LOAD','NO_CONTEST')
    and winner_participant_key is null
  ) or (
    status = 'FINISHED'
    and ended_at is not null
    and end_reason in ('SCORE_TARGET','TIMEOUT_TIEBREAK','SUDDEN_DEATH','FORFEIT','DRAW')
    and ((end_reason = 'DRAW' and winner_participant_key is null) or (end_reason <> 'DRAW' and winner_participant_key is not null))
  )
);

alter table public.profiles
  add constraint profiles_level_positive check (level >= 1),
  add constraint profiles_exp_nonnegative check (exp >= 0),
  add constraint profiles_points_nonnegative check (gacha_points >= 0),
  add constraint profiles_nickname_length check (char_length(nickname) between 1 and 40);
alter table public.user_pets
  add constraint user_pets_level_positive check (level >= 1),
  add constraint user_pets_exp_nonnegative check (exp >= 0),
  add constraint user_pets_copies_positive check (copies >= 1);
create unique index user_pets_one_selected_per_user on public.user_pets(user_id) where selected;

create table private.accepted_objective_claims (
  match_id uuid not null references public.matches(id) on delete cascade,
  objective_id text not null check (objective_id ~ '^[a-z0-9][a-z0-9_-]{0,127}$'),
  participant_key uuid not null,
  claimed_at timestamptz not null,
  primary key(match_id, objective_id),
  foreign key(match_id, participant_key) references public.match_players(match_id, participant_key)
);

create table private.match_request_receipts (
  match_id uuid not null,
  participant_key uuid not null,
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('PENDING','COMPLETED')),
  response_status integer,
  response_body jsonb,
  command_seq bigint,
  owner_token uuid,
  lease_until timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(match_id, participant_key, request_id),
  foreign key(match_id, participant_key) references public.match_players(match_id, participant_key) on delete cascade,
  check (substring(request_id::text, 15, 1) = '4' and substring(request_id::text, 20, 1) in ('8','9','a','b')),
  check (
    (status='PENDING' and owner_token is not null and lease_until is not null and response_status is null and response_body is null and completed_at is null)
    or
    (status='COMPLETED' and owner_token is null and lease_until is null and response_status is not null and response_body is not null and completed_at is not null)
  )
);

create table private.match_command_receipts (
  match_id uuid not null references public.matches(id) on delete cascade,
  command_seq bigint not null check (command_seq >= 1),
  command_id text not null constraint match_command_receipts_command_id_ascii
    check (char_length(command_id) between 1 and 512 and command_id collate "C" ~ '^[ -~]+$'),
  source text not null check (source in ('PLAYER','SYSTEM','TIMER')),
  request_id uuid,
  participant_key uuid,
  command_hash text not null check (command_hash ~ '^[a-f0-9]{64}$'),
  decision text not null,
  received_at timestamptz not null,
  primary key(match_id, command_seq),
  unique(match_id, command_id),
  foreign key(match_id, participant_key, request_id)
    references private.match_request_receipts(match_id, participant_key, request_id),
  check ((source='PLAYER' and request_id is not null and participant_key is not null) or (source<>'PLAYER' and request_id is null and participant_key is null))
);

alter table private.match_request_receipts add constraint match_request_receipts_command_fkey
  foreign key(match_id, command_seq)
  references private.match_command_receipts(match_id, command_seq)
  deferrable initially deferred;

create table private.match_events (
  event_id text primary key check (char_length(event_id) between 1 and 64),
  match_id uuid not null references public.matches(id) on delete cascade,
  event_seq bigint not null check (event_seq >= 1),
  caused_by_command_seq bigint not null,
  state_revision bigint not null check (state_revision >= 1),
  phase public.match_status not null,
  event_type text not null check (char_length(event_type) between 1 and 120),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  unique(match_id, event_seq),
  foreign key(match_id, caused_by_command_seq) references private.match_command_receipts(match_id, command_seq),
  check (event_id = match_id::text || ':' || event_seq::text)
);

create function private.reject_match_event_mutation_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode='P0001', message='IMMUTABLE_MATCH_EVENT';
end
$$;
revoke execute on function private.reject_match_event_mutation_v1() from public, anon, authenticated, service_role, app_server, deployment_role;
create trigger match_events_immutable before update or delete on private.match_events
for each row execute function private.reject_match_event_mutation_v1();

create function private.reject_command_receipt_mutation_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode='P0001', message='IMMUTABLE_COMMAND_RECEIPT';
end
$$;
revoke execute on function private.reject_command_receipt_mutation_v1() from public, anon, authenticated, service_role, app_server, deployment_role;
create trigger match_command_receipts_immutable before update or delete on private.match_command_receipts
for each row execute function private.reject_command_receipt_mutation_v1();

create function private.validate_request_receipt_transition_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE'
     or old.status = 'COMPLETED'
     or new.status <> 'COMPLETED'
     or new.match_id is distinct from old.match_id
     or new.participant_key is distinct from old.participant_key
     or new.request_id is distinct from old.request_id
     or new.request_hash is distinct from old.request_hash
     or new.created_at is distinct from old.created_at then
    raise exception using errcode='P0001', message='INVALID_REQUEST_RECEIPT_TRANSITION';
  end if;
  return new;
end
$$;
revoke execute on function private.validate_request_receipt_transition_v1() from public, anon, authenticated, service_role, app_server, deployment_role;
create trigger match_request_receipts_transition before update or delete on private.match_request_receipts
for each row execute function private.validate_request_receipt_transition_v1();

grant select on public.matches, public.match_players, public.profiles to game_security_owner;
grant insert on public.match_players to game_security_owner;

create or replace function private.join_match_participant_v1(
  requested_match_id uuid,
  requested_participant_key uuid,
  requested_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  selected_seat smallint;
  existing_user uuid;
begin
  if requested_match_id is null or requested_participant_key is null or requested_user_id is null then
    raise exception using errcode='22023', message='JOIN_ARGUMENT_REQUIRED';
  end if;
  if requested_participant_key = requested_user_id
     or substring(requested_participant_key::text, 15, 1) <> '4'
     or substring(requested_participant_key::text, 20, 1) not in ('8','9','a','b') then
    raise exception using errcode='22023', message='PARTICIPANT_KEY_INVALID';
  end if;
  perform 1 from public.profiles where id = requested_user_id;
  if not found then
    raise exception using errcode='23503', message='JOIN_PROFILE_NOT_FOUND';
  end if;
  perform 1 from public.matches where id = requested_match_id and status = 'WAITING_FOR_ASSETS' for update;
  if not found then
    raise exception using errcode='P0002', message='MATCH_NOT_JOINABLE';
  end if;
  select user_id into existing_user
  from public.match_players
  where match_id = requested_match_id and participant_key = requested_participant_key;
  if found then
    if existing_user = requested_user_id then return true; end if;
    raise exception using errcode='23505', message='PARTICIPANT_KEY_CONFLICT';
  end if;
  if exists (select 1 from public.match_players where match_id=requested_match_id and user_id=requested_user_id) then
    raise exception using errcode='23505', message='MATCH_USER_ALREADY_JOINED';
  end if;
  if not exists (select 1 from public.match_players where match_id=requested_match_id and seat_no=1) then
    selected_seat := 1;
  elsif not exists (select 1 from public.match_players where match_id=requested_match_id and seat_no=2) then
    selected_seat := 2;
  else
    return false;
  end if;
  insert into public.match_players(match_id,user_id,participant_key,seat_no)
  values (requested_match_id,requested_user_id,requested_participant_key,selected_seat);
  return true;
end
$$;
alter function private.join_match_participant_v1(uuid,uuid,uuid) owner to game_security_owner;
revoke execute on function private.join_match_participant_v1(uuid,uuid,uuid) from public, anon, authenticated, service_role, deployment_role;
grant execute on function private.join_match_participant_v1(uuid,uuid,uuid) to app_server;

alter table public.pet_catalog enable row level security;
alter table public.profiles enable row level security;
alter table public.user_pets enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;

create policy pet_catalog_public_read on public.pet_catalog for select to anon, authenticated using (active);
create policy profiles_self_read on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_self_nickname_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy user_pets_self_read on public.user_pets for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_security_owner_read on public.profiles for select to game_security_owner using (true);
create policy matches_security_owner_all on public.matches for all to game_security_owner using (true) with check (true);
create policy match_players_security_owner_all on public.match_players for all to game_security_owner using (true) with check (true);

revoke all on public.pet_catalog, public.profiles, public.user_pets, public.matches, public.match_players from public, anon, authenticated, service_role;
grant select on public.pet_catalog to anon, authenticated;
grant select(id,nickname,level,exp,gacha_points,created_at), update(nickname) on public.profiles to authenticated;
grant select on public.user_pets to authenticated;
grant select, update on public.matches to game_security_owner;
grant select, insert on public.match_players to game_security_owner;
grant select on public.profiles to game_security_owner;

revoke all on all tables in schema private from public, anon, authenticated, service_role, app_server, deployment_role;
revoke all on all sequences in schema private from public, anon, authenticated, service_role, app_server, deployment_role;
revoke execute on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text) to deployment_role;
grant execute on function private.join_match_participant_v1(uuid,uuid,uuid) to app_server;
grant usage on schema private to app_server, deployment_role;

revoke create on schema public, private from game_security_owner;
revoke game_security_owner from postgres;
