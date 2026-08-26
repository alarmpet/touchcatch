-- The half of account deletion that actually removes data.
--
-- 202608260002 made the request durable and closed the account the instant it committed. Nothing
-- advanced it: a person who asked to be deleted was locked out and still stored. This adds the
-- stage machine, the disposal itself, and the role that is allowed to run it.
--
-- Three things shape the design.
--
-- The API must not be able to do this. Accepting a request and disposing of data are different
-- authorities, and the service that faces the internet gets only the first. Everything here is
-- granted to `privacy_worker` and revoked from `economy_server`, so a compromised API can close
-- an account but cannot empty one.
--
-- A lease is not enough on its own. `for update skip locked` plus an owner token and a fence stops
-- two workers advancing the same request, but it says nothing about an external call that already
-- left the building -- an Auth Admin delete that timed out may or may not have happened. So every
-- effect is written to an immutable journal keyed `(request, stage, target)`, and a stage that
-- cannot establish its outcome goes to MANUAL_REVIEW rather than retrying blind.
--
-- Disposal order follows the foreign keys, not the table list. Children first, subject root last,
-- and `auth.users` not at all -- that one belongs to the Auth Admin API, which owns the sessions
-- and identities that no SQL here can reach.

do $$
begin
  execute format('grant economy_security_owner to %I', current_user);
  execute format('grant game_security_owner to %I', current_user);
end
$$;

grant create on schema private to economy_security_owner;

-- The role that advances requests. NOLOGIN NOINHERIT like every other privileged group here: the
-- worker's own login is provisioned per environment and is not created by a migration.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'privacy_worker') then
    create role privacy_worker nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  end if;
end
$$;

-- Disposal reaches across three ownership domains -- economy_security_owner's ledgers,
-- game_security_owner's learning tables, and postgres's public tables -- so no existing owner can
-- perform it. Rather than widen one of them to cover the others, disposal gets an owner of its
-- own whose entire privilege set is the DELETE list below. "What can a deletion touch" is then a
-- grant list in one migration instead of an emergent property of three roles.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'privacy_disposal_owner') then
    create role privacy_disposal_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  end if;
  execute format('grant privacy_disposal_owner to %I', current_user);
end
$$;

grant create on schema private to privacy_disposal_owner;
grant usage on schema private to privacy_disposal_owner;

-- The one crack in the append-only ledgers.
--
-- Five tables in the disposal set reject DELETE outright, which is correct: a tap record that a
-- player could remove is not evidence of anything. But "immutable" and "erasable on request" both
-- have to be true, and the way to have both is to make the exception impossible to reach except
-- from inside the disposal itself.
--
-- Two conditions, and neither is sufficient alone. `current_user` is only privacy_disposal_owner
-- inside that SECURITY DEFINER function, and the role cannot log in. The transaction-local setting
-- narrows it further to a transaction that is actually disposing, so a future grant of membership
-- to something else does not silently open every ledger to it.
create function private.is_privacy_disposal_v1()
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select current_user = 'privacy_disposal_owner'
     and coalesce(current_setting('touchcatch.privacy_disposal', true), '') = 'on';
$$;

alter function private.is_privacy_disposal_v1() owner to privacy_disposal_owner;
revoke execute on function private.is_privacy_disposal_v1() from public, anon, authenticated, service_role;
grant execute on function private.is_privacy_disposal_v1()
  to privacy_disposal_owner, economy_security_owner, game_security_owner;

create or replace function private.reject_learning_tap_mutation_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' and private.is_privacy_disposal_v1() then return old; end if;
  raise exception using errcode = 'P0001', message = 'IMMUTABLE_LEARNING_TAP';
end
$$;

create or replace function private.reject_command_receipt_mutation_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' and private.is_privacy_disposal_v1() then return old; end if;
  raise exception using errcode='P0001', message='IMMUTABLE_COMMAND_RECEIPT';
end
$$;

-- The remaining three guards are validators with long bodies that also police UPDATE. Rewriting
-- them here to add one branch would mean restating a hundred lines of column comparisons for the
-- sake of a two-line change, and a transcription slip in that would silently loosen an update
-- rule. So the DELETE half is split into its own trigger instead: the validator keeps its exact
-- body and its UPDATE duty, and the message each one raised on DELETE is passed through so
-- nothing observing those codes changes.
create function private.reject_delete_unless_privacy_disposal_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if private.is_privacy_disposal_v1() then return old; end if;
  raise exception using errcode = 'P0001', message = tg_argv[0];
end
$$;

-- Owned by the disposal role rather than the tables' owner: it is not SECURITY DEFINER, so
-- ownership only says who may alter it, and that belongs with the rest of this migration's
-- objects. game_security_owner holds no CREATE on the schema here and granting it some just to
-- park a function would widen a role for bookkeeping.
alter function private.reject_delete_unless_privacy_disposal_v1() owner to privacy_disposal_owner;

drop trigger learning_attempts_transition_guard on private.learning_attempts;
create trigger learning_attempts_transition_guard
  before update on private.learning_attempts
  for each row execute function private.validate_learning_attempt_transition_v1();
create trigger learning_attempts_delete_guard
  before delete on private.learning_attempts
  for each row execute function private.reject_delete_unless_privacy_disposal_v1('IMMUTABLE_LEARNING_ATTEMPT');

drop trigger learning_best_records_guard on private.learning_best_records;
create trigger learning_best_records_guard
  before insert or update on private.learning_best_records
  for each row execute function private.validate_learning_best_record_v1();
create trigger learning_best_records_delete_guard
  before delete on private.learning_best_records
  for each row execute function private.reject_delete_unless_privacy_disposal_v1('IMMUTABLE_LEARNING_BEST_KEY');

drop trigger match_request_receipts_transition on private.match_request_receipts;
create trigger match_request_receipts_transition
  before update on private.match_request_receipts
  for each row execute function private.validate_request_receipt_transition_v1();
create trigger match_request_receipts_delete_guard
  before delete on private.match_request_receipts
  for each row execute function private.reject_delete_unless_privacy_disposal_v1('INVALID_REQUEST_RECEIPT_TRANSITION');

-- Exactly what disposal may touch, stated once. Reads are needed too: the function finds rows by
-- subquery (attempts of a subject, pets of a subject, participations of a user).
grant select, delete on
  private.learning_attempt_taps,
  private.learning_attempts,
  private.learning_best_records,
  private.learning_progression_ledgers,
  private.weekly_reward_settlements,
  private.accepted_objective_claims,
  private.match_command_receipts,
  private.match_request_receipts,
  private.daily_pet_claims,
  private.daily_pet_draw_history,
  private.duplicate_promotion_entitlements,
  private.duplicate_promotion_history,
  private.duplicate_promotion_receipts,
  private.economy_subjects,
  private.fusion_history,
  private.gacha_history,
  private.gacha_pity_state,
  private.idempotency_requests,
  private.outbox_events,
  private.pet_inventory,
  private.pet_loop_outbox_events,
  private.reward_ledger,
  public.profiles,
  public.user_pets
to privacy_disposal_owner;

-- Read-only: the joint match record is REDACT, not DELETE. Disposal reads it to find the
-- subject's own participant rows and must not be able to remove it.
grant select on public.match_players to privacy_disposal_owner;

-- RLS applies to a non-owner, so each row-secured table needs a policy naming the new role.
-- Written out per table rather than looped so that the list is greppable.
create policy learning_attempt_taps_privacy_disposal on private.learning_attempt_taps
  for all to privacy_disposal_owner using (true) with check (false);
create policy learning_attempts_privacy_disposal on private.learning_attempts
  for all to privacy_disposal_owner using (true) with check (false);
create policy learning_best_records_privacy_disposal on private.learning_best_records
  for all to privacy_disposal_owner using (true) with check (false);
create policy learning_progression_ledgers_privacy_disposal on private.learning_progression_ledgers
  for all to privacy_disposal_owner using (true) with check (false);
create policy weekly_reward_settlements_privacy_disposal on private.weekly_reward_settlements
  for all to privacy_disposal_owner using (true) with check (false);
create policy match_players_privacy_disposal on public.match_players
  for select to privacy_disposal_owner using (true);
create policy profiles_privacy_disposal on public.profiles
  for all to privacy_disposal_owner using (true) with check (false);
create policy user_pets_privacy_disposal on public.user_pets
  for all to privacy_disposal_owner using (true) with check (false);
-- The disposal role's access to the request row and the journal is granted further down, once
-- those two objects exist. Everything above this line predates them in this file.

-- Lease, ownership and fencing. `fence` only ever increases, so a worker that lost its lease and
-- came back cannot complete a stage another worker has since taken over.
alter table private.account_deletion_requests
  add column owner_token uuid,
  add column fence bigint not null default 0,
  add column lease_until timestamptz,
  add column last_error text
    check (last_error is null or length(last_error) <= 500);

-- Whether an effect happened is a fact about the world, so it is recorded as one: append-only,
-- unique per target, never updated. A retry that finds its row here knows the work is done even
-- though the response that would have told it never arrived.
create table private.account_deletion_effects (
  request_id uuid not null references private.account_deletion_requests(request_id) on delete restrict,
  stage text not null check (stage in ('APP_DATA','PROVIDERS','AUTH','NOTIFICATION')),
  -- A table name, a provider name, or the literal 'auth-user'. Never a row identifier: this
  -- journal outlives the rows it describes and must not become a copy of them.
  target text not null check (target ~ '^[a-z][a-z0-9_.-]{2,63}$'),
  outcome text not null check (outcome in ('COMPLETED','NOT_APPLICABLE','UNKNOWN_OUTCOME')),
  affected_rows bigint check (affected_rows is null or affected_rows >= 0),
  recorded_at timestamptz not null default now(),
  primary key (request_id, stage, target)
);

alter table private.account_deletion_effects enable row level security;
alter table private.account_deletion_requests
  alter column fence set not null;

grant select, insert on private.account_deletion_effects to economy_security_owner;
grant select on private.account_deletion_effects to privacy_operator;

create policy account_deletion_effects_owner_all
on private.account_deletion_effects
for all
to economy_security_owner
using (true)
with check (true);

create policy account_deletion_effects_privacy_read
on private.account_deletion_effects
for select
to privacy_operator
using (true);

-- Disposal updates the request's stage and writes one journal row. Nothing more: it cannot insert
-- a request, and the journal trigger below stops it rewriting what it wrote.
grant select, update on private.account_deletion_requests to privacy_disposal_owner;
grant select, insert on private.account_deletion_effects to privacy_disposal_owner;

create policy account_deletion_requests_privacy_disposal on private.account_deletion_requests
  for all to privacy_disposal_owner using (true) with check (true);
create policy account_deletion_effects_privacy_disposal on private.account_deletion_effects
  for all to privacy_disposal_owner using (true) with check (true);

-- An append-only journal that can be updated is a log. The trigger is what makes the word
-- "immutable" in the comment above true.
create function private.reject_account_deletion_effect_mutation_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = 'P0001', message = 'EFFECT_JOURNAL_IMMUTABLE';
end
$$;

create trigger account_deletion_effects_immutable
before update or delete on private.account_deletion_effects
for each row execute function private.reject_account_deletion_effect_mutation_v1();

-- Takes the oldest workable request and leases it.
--
-- `skip locked` is what lets more than one worker run without them queueing behind each other on
-- the same row. The transaction is deliberately tiny: it takes the lease and commits, and the
-- external calls happen outside it, because holding a database transaction open across a network
-- call to a provider is how a slow provider becomes a database outage.
create function private.claim_account_deletion_v1(
  p_owner_token uuid,
  p_lease_seconds integer,
  p_max_attempts integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_request private.account_deletion_requests%rowtype;
begin
  if p_owner_token is null or p_lease_seconds is null or p_lease_seconds <= 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST';
  end if;

  select * into v_request
  from private.account_deletion_requests
  where state in ('ACCESS_BLOCKED','APP_DATA_DISPOSED','PROVIDERS_REVOKED','AUTH_DELETED','FAILED_RETRYABLE')
    and (lease_until is null or lease_until <= pg_catalog.now())
    and attempts < p_max_attempts
  order by updated_at
  for update skip locked
  limit 1;

  if not found then
    return pg_catalog.jsonb_build_object('claimed', false);
  end if;

  update private.account_deletion_requests
  set owner_token = p_owner_token,
      fence = fence + 1,
      lease_until = pg_catalog.now() + (p_lease_seconds::text || ' seconds')::interval,
      attempts = attempts + 1,
      updated_at = pg_catalog.now()
  where request_id = v_request.request_id
  returning * into v_request;

  return pg_catalog.jsonb_build_object(
    'claimed', true,
    'requestId', v_request.request_id::text,
    'subjectKey', v_request.subject_key::text,
    'authenticatedUserId', v_request.authenticated_user_id::text,
    'state', v_request.state,
    'fence', v_request.fence,
    'attempts', v_request.attempts,
    'leaseUntil', pg_catalog.to_char(v_request.lease_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
end
$$;

-- Deletes everything the subject owns, in foreign-key order.
--
-- The table list here is the DELETE half of docs/legal/data-disposition.v1.json and
-- tests/contracts/deletion-disposition-coverage.test.ts fails if the two drift. That test is the
-- reason a new feature cannot quietly add a table that survives a deletion request: the
-- disposition file is derived from the schema, and this function is compared against it.
--
-- Not here, on purpose:
--   * auth.users and everything under it -- the Auth Admin API owns sessions and identities;
--   * the joint match record -- see the REDACT rationale in the disposition file. The subject's
--     link is severed by public.match_players.user_id going NULL with the profile.
create function private.dispose_account_app_data_v1(
  p_request_id uuid,
  p_owner_token uuid,
  p_fence bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_request private.account_deletion_requests%rowtype;
  v_subject uuid;
  v_user uuid;
  v_deleted bigint;
  v_total bigint := 0;
begin
  select * into v_request
  from private.account_deletion_requests
  where request_id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'DELETION_REQUEST_NOT_FOUND';
  end if;

  -- Compare-and-set. Owner, fence and an unexpired lease all have to hold, or this worker is no
  -- longer the one doing the work and must not write.
  if v_request.owner_token is distinct from p_owner_token
     or v_request.fence <> p_fence
     or v_request.lease_until is null
     or v_request.lease_until <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'LEASE_LOST';
  end if;

  if v_request.stage_app_data = 'COMPLETED' then
    return pg_catalog.jsonb_build_object('alreadyDone', true, 'deletedRows', 0);
  end if;

  -- Opens the append-only ledgers for this transaction only. `true` is the local flag: it reverts
  -- at commit or rollback, so a disposal that fails halfway does not leave the guards down.
  perform pg_catalog.set_config('touchcatch.privacy_disposal', 'on', true);

  v_subject := v_request.subject_key;
  v_user := v_request.authenticated_user_id;

  -- Depth 3: rows hanging off an attempt or an owned pet.
  delete from private.learning_attempt_taps
    where attempt_id in (select attempt_id from private.learning_attempts where subject_key = v_subject);
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.learning_progression_ledgers where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.learning_best_records where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.weekly_reward_settlements where winner_subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.duplicate_promotion_entitlements
    where target_user_pet_id in (select user_pet_id from private.pet_inventory where subject_key = v_subject);
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.duplicate_promotion_history where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.fusion_history where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.gacha_history where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.daily_pet_draw_history where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  -- Per-participant rows inside a joint match. These key on participant_key and belong to one
  -- person, unlike the match itself.
  delete from private.accepted_objective_claims
    where participant_key in (select participant_key from public.match_players where user_id = v_user);
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.match_request_receipts
    where participant_key in (select participant_key from public.match_players where user_id = v_user);
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.match_command_receipts
    where participant_key in (select participant_key from public.match_players where user_id = v_user);
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  -- Depth 2 and 1.
  delete from private.learning_attempts where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.pet_inventory where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.daily_pet_claims where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.duplicate_promotion_receipts where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.gacha_pity_state where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.idempotency_requests where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.pet_loop_outbox_events where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.reward_ledger where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from private.outbox_events where aggregate_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from public.user_pets where user_id = v_user;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  delete from public.profiles where id = v_user;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  -- Subject root last. The tombstone keys on subject_key and has no foreign key to this row, so
  -- access stays closed after it is gone.
  delete from private.economy_subjects where subject_key = v_subject;
  get diagnostics v_deleted = row_count; v_total := v_total + v_deleted;

  insert into private.account_deletion_effects(request_id, stage, target, outcome, affected_rows)
  values (p_request_id, 'APP_DATA', 'app-data', 'COMPLETED', v_total)
  on conflict (request_id, stage, target) do nothing;

  update private.account_deletion_requests
  set stage_app_data = 'COMPLETED',
      state = 'APP_DATA_DISPOSED',
      last_error = null,
      updated_at = pg_catalog.now()
  where request_id = p_request_id;

  return pg_catalog.jsonb_build_object('alreadyDone', false, 'deletedRows', v_total);
end
$$;

-- Records the outcome of a stage the worker performed outside the database.
--
-- `UNKNOWN_OUTCOME` is a first-class result, not an error: a provider call that timed out may have
-- succeeded, and the only safe thing to do with it is stop and let a person look.
create function private.complete_deletion_stage_v1(
  p_request_id uuid,
  p_owner_token uuid,
  p_fence bigint,
  p_stage text,
  p_target text,
  p_outcome text,
  p_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_request private.account_deletion_requests%rowtype;
  v_state text;
begin
  if p_stage not in ('PROVIDERS','AUTH','NOTIFICATION') then
    raise exception using errcode = 'P0001', message = 'INVALID_STAGE';
  end if;
  if p_outcome not in ('COMPLETED','NOT_APPLICABLE','UNKNOWN_OUTCOME','FAILED_RETRYABLE','FAILED_PERMANENT') then
    raise exception using errcode = 'P0001', message = 'INVALID_OUTCOME';
  end if;

  select * into v_request
  from private.account_deletion_requests
  where request_id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'DELETION_REQUEST_NOT_FOUND';
  end if;

  if v_request.owner_token is distinct from p_owner_token
     or v_request.fence <> p_fence
     or v_request.lease_until is null
     or v_request.lease_until <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'LEASE_LOST';
  end if;

  if p_outcome in ('COMPLETED','NOT_APPLICABLE','UNKNOWN_OUTCOME') then
    insert into private.account_deletion_effects(request_id, stage, target, outcome)
    values (p_request_id, p_stage, p_target, p_outcome)
    on conflict (request_id, stage, target) do nothing;
  end if;

  -- An outcome nobody can vouch for stops the machine. Retrying a provider delete that may have
  -- already run is how one ambiguous call becomes several.
  if p_outcome = 'UNKNOWN_OUTCOME' then
    update private.account_deletion_requests
    set state = 'MANUAL_REVIEW',
        last_error = p_failure_code,
        lease_until = null,
        owner_token = null,
        updated_at = pg_catalog.now()
    where request_id = p_request_id;
    return pg_catalog.jsonb_build_object('state', 'MANUAL_REVIEW');
  end if;

  if p_outcome in ('FAILED_RETRYABLE','FAILED_PERMANENT') then
    update private.account_deletion_requests
    set state = case when p_outcome = 'FAILED_RETRYABLE' then 'FAILED_RETRYABLE' else 'FAILED_PERMANENT' end,
        stage_providers = case when p_stage = 'PROVIDERS' then p_outcome else stage_providers end,
        stage_auth = case when p_stage = 'AUTH' then p_outcome else stage_auth end,
        stage_notification = case when p_stage = 'NOTIFICATION' then p_outcome else stage_notification end,
        failure_code = p_failure_code,
        lease_until = null,
        owner_token = null,
        updated_at = pg_catalog.now()
    where request_id = p_request_id;
    return pg_catalog.jsonb_build_object('state', p_outcome);
  end if;

  update private.account_deletion_requests
  set stage_providers = case when p_stage = 'PROVIDERS' then p_outcome else stage_providers end,
      stage_auth = case when p_stage = 'AUTH' then p_outcome else stage_auth end,
      stage_notification = case when p_stage = 'NOTIFICATION' then p_outcome else stage_notification end,
      last_error = null,
      updated_at = pg_catalog.now()
  where request_id = p_request_id
  returning * into v_request;

  -- COMPLETED is the only terminal success, and it is reached exactly once: when every stage has
  -- an outcome. Notification is a stage of its own so that a failed email cannot un-delete data.
  if v_request.stage_app_data = 'COMPLETED'
     and v_request.stage_providers <> 'PENDING'
     and v_request.stage_auth <> 'PENDING'
     and v_request.stage_notification <> 'PENDING' then
    v_state := 'COMPLETED';
  elsif v_request.stage_auth <> 'PENDING' then
    v_state := 'AUTH_DELETED';
  elsif v_request.stage_providers <> 'PENDING' then
    v_state := 'PROVIDERS_REVOKED';
  else
    v_state := v_request.state;
  end if;

  update private.account_deletion_requests
  set state = v_state,
      completed_at = case when v_state = 'COMPLETED' then pg_catalog.now() else completed_at end,
      lease_until = case when v_state = 'COMPLETED' then null else lease_until end,
      owner_token = case when v_state = 'COMPLETED' then null else owner_token end,
      updated_at = pg_catalog.now()
  where request_id = p_request_id;

  return pg_catalog.jsonb_build_object('state', v_state);
end
$$;

-- Extends a lease that is still held. A stage that legitimately takes a while should not lose its
-- claim to a worker that thinks it crashed.
create function private.extend_account_deletion_lease_v1(
  p_request_id uuid,
  p_owner_token uuid,
  p_fence bigint,
  p_lease_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_updated integer;
begin
  update private.account_deletion_requests
  set lease_until = pg_catalog.now() + (p_lease_seconds::text || ' seconds')::interval,
      updated_at = pg_catalog.now()
  where request_id = p_request_id
    and owner_token = p_owner_token
    and fence = p_fence
    and lease_until > pg_catalog.now();
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end
$$;

alter function private.claim_account_deletion_v1(uuid,integer,integer) owner to economy_security_owner;
-- Disposal alone runs as the cross-domain role. Everything else stays with economy_security_owner,
-- so the role that can reach the learning tables and the public tables exists for one function.
alter function private.dispose_account_app_data_v1(uuid,uuid,bigint) owner to privacy_disposal_owner;
alter function private.complete_deletion_stage_v1(uuid,uuid,bigint,text,text,text,text) owner to economy_security_owner;
alter function private.extend_account_deletion_lease_v1(uuid,uuid,bigint,integer) owner to economy_security_owner;
alter function private.reject_account_deletion_effect_mutation_v1() owner to economy_security_owner;

-- The API role is named explicitly in every revoke. `economy_server` holds the credentials that
-- face the internet; if it could call these, accepting a deletion request and carrying one out
-- would be the same authority, and the 202 would stop meaning anything.
revoke execute on function private.claim_account_deletion_v1(uuid,integer,integer)
  from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role, economy_server, privacy_operator;
revoke execute on function private.dispose_account_app_data_v1(uuid,uuid,bigint)
  from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role, economy_server, privacy_operator;
revoke execute on function private.complete_deletion_stage_v1(uuid,uuid,bigint,text,text,text,text)
  from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role, economy_server, privacy_operator;
revoke execute on function private.extend_account_deletion_lease_v1(uuid,uuid,bigint,integer)
  from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role, economy_server, privacy_operator;
-- Trigger functions default to EXECUTE for PUBLIC. Harmless in isolation -- calling one outside a
-- trigger raises -- but `private` is asserted to expose nothing to PUBLIC or the client roles, and
-- that assertion is worth more than the exception for these three.
revoke execute on function private.reject_account_deletion_effect_mutation_v1()
  from public, anon, authenticated, service_role;
revoke execute on function private.reject_delete_unless_privacy_disposal_v1()
  from public, anon, authenticated, service_role;
revoke execute on function private.is_privacy_disposal_v1()
  from public, anon, authenticated, service_role;

grant execute on function private.claim_account_deletion_v1(uuid,integer,integer) to privacy_worker;
grant execute on function private.dispose_account_app_data_v1(uuid,uuid,bigint) to privacy_worker;
grant execute on function private.complete_deletion_stage_v1(uuid,uuid,bigint,text,text,text,text) to privacy_worker;
grant execute on function private.extend_account_deletion_lease_v1(uuid,uuid,bigint,integer) to privacy_worker;
grant execute on function private.read_account_deletion_status_v1(text) to privacy_worker;

grant usage on schema private to privacy_worker;

revoke create on schema private from economy_security_owner;
revoke create on schema private from privacy_disposal_owner;
