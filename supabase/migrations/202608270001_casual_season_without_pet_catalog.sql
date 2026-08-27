-- Casual seasons no longer require a pet catalog revision.
--
-- 202608240001 opened casual play by dropping NOT NULL from
-- private.learning_attempts.selected_user_pet_id and .selected_pet_catalog_id, because a casual
-- attempt has no pet. It left the season's own pet columns NOT NULL, and
-- private.weekly_seasons.pet_catalog_revision is a foreign key into private.pet_catalog_revisions.
--
-- The only writer of that table is private.publish_economy_bundle_v1, which refuses anything not
-- stamped 'TEST-DECISION' / 'test-approver' -- by its own comment, "deliberately test-only until a
-- product approval workflow exists". So no casual season could be created outside a test fixture,
-- on any environment: a migration-only database fails at the foreign key. Pet economy is not in
-- the Android closed-beta scope and its catalog is DRAFT, so waiting on that approval workflow
-- would block play on a dependency the beta does not ship.
--
-- This finishes the 08-24 change on the season side. A season may now pin no pet catalog, and the
-- pin is compared only when it carries one -- a season that does pin a catalog is checked exactly
-- as strictly as before, so a ranked season keeps the guarantee that an attempt cannot start
-- against a catalog the API did not agree to.

do $$begin execute format('grant game_security_owner to %I',current_user); end$$;
grant create on schema private to game_security_owner;

alter table private.weekly_seasons
  alter column pet_catalog_revision drop not null,
  alter column pet_catalog_hash drop not null;

alter table private.learning_attempts
  alter column pet_catalog_revision drop not null,
  alter column pet_catalog_hash drop not null;

-- Revision and hash travel together or not at all; half a pin is not a state anything should read.
alter table private.weekly_seasons
  add constraint weekly_seasons_pet_catalog_pair_check
  check ((pet_catalog_revision is null) = (pet_catalog_hash is null));

create or replace function private.start_learning_attempt_v1(
  requested_subject_key uuid,
  requested_season_id uuid,
  requested_content_revision_id uuid,
  requested_idempotency_key uuid,
  requested_request_hash text,
  requested_mode text,
  expected_content_hash text,
  expected_ruleset_hash text,
  expected_hint_policy_hash text,
  expected_competition_policy_hash text,
  expected_pet_catalog_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_attempt private.learning_attempts%rowtype;
  season private.weekly_seasons%rowtype;
  challenge private.weekly_challenge_pins%rowtype;
  selected_pet record;
  now_at timestamptz := pg_catalog.clock_timestamp();
  new_attempt_id uuid := extensions.uuid_generate_v4();
begin
  if requested_request_hash is null
     or requested_request_hash !~ '^[0-9a-f]{64}$'
     or requested_mode <> 'RANKED' then
    raise exception using errcode = 'P0001', message = 'INVALID_ATTEMPT_START';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requested_subject_key::text, 43)
  );

  if not exists(
    select 1
    from private.economy_subjects s
    where s.subject_key = requested_subject_key
      and s.user_id is not null
  ) then
    raise exception using errcode = 'P0001', message = 'AUTH_SUBJECT_REQUIRED';
  end if;

  select *
    into existing_attempt
    from private.learning_attempts a
    where a.subject_key = requested_subject_key
      and a.start_idempotency_key = requested_idempotency_key;
  if found then
    if existing_attempt.start_request_hash <> requested_request_hash then
      raise exception using
        errcode = 'P0001',
        message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'attemptId', existing_attempt.attempt_id,
      'status', existing_attempt.verification_status,
      'startedAt', existing_attempt.started_at,
      'expiresAt', existing_attempt.expires_at,
      'contentRevisionId', existing_attempt.content_revision_id
    );
  end if;

  select *
    into season
    from private.weekly_seasons s
    where s.season_id = requested_season_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'SEASON_NOT_FOUND';
  end if;

  select *
    into challenge
    from private.weekly_challenge_pins p
    where p.season_id = requested_season_id
      and p.content_revision_id = requested_content_revision_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'CHALLENGE_PIN_MISMATCH';
  end if;

  if now_at < season.starts_at
     or now_at >= season.ends_at then
    raise exception using errcode = 'P0001', message = 'SEASON_NOT_OPEN';
  end if;

  -- The catalog pin is compared only when the season carries one. A season that pins a catalog
  -- is checked exactly as before, including that the caller sent a hash at all.
  if expected_content_hash is null
     or expected_ruleset_hash is null
     or expected_hint_policy_hash is null
     or expected_competition_policy_hash is null
     or challenge.content_hash <> expected_content_hash
     or season.ruleset_hash <> expected_ruleset_hash
     or season.hint_policy_hash <> expected_hint_policy_hash
     or season.competition_policy_hash <> expected_competition_policy_hash
     or (season.pet_catalog_hash is not null
          and (expected_pet_catalog_hash is null
               or season.pet_catalog_hash <> expected_pet_catalog_hash)) then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  update private.learning_attempts a
  set
    verification_status = 'EXPIRED',
    terminal_at = now_at
  where a.subject_key = requested_subject_key
    and a.season_id = requested_season_id
    and a.content_revision_id = requested_content_revision_id
    and a.verification_status = 'OPEN'
    and a.expires_at <= now_at;

  select *
    into existing_attempt
    from private.learning_attempts a
    where a.subject_key = requested_subject_key
      and a.season_id = requested_season_id
      and a.content_revision_id = requested_content_revision_id
      and a.verification_status = 'OPEN'
      and a.expires_at > now_at;
  if found then
    return pg_catalog.jsonb_build_object(
      'attemptId', existing_attempt.attempt_id,
      'status', existing_attempt.verification_status,
      'startedAt', existing_attempt.started_at,
      'expiresAt', existing_attempt.expires_at,
      'contentRevisionId', existing_attempt.content_revision_id
    );
  end if;

  -- With no catalog pinned this join matches nothing and the attempt records no pet, which is
  -- exactly what a casual attempt is.
  select
    i.user_pet_id,
    i.pet_id
    into selected_pet
    from private.pet_inventory i
    join private.pet_catalog_revision_entries e
      on e.catalog_revision = season.pet_catalog_revision
     and e.pet_id = i.pet_id
    where i.subject_key = requested_subject_key
      and i.selected
      and i.copies > 0;

  insert into private.learning_attempts(
    attempt_id,
    subject_key,
    season_id,
    category,
    content_revision_id,
    content_hash,
    mode,
    started_at,
    expires_at,
    selected_user_pet_id,
    selected_pet_catalog_id,
    pet_catalog_revision,
    pet_catalog_hash,
    ruleset_hash,
    hint_policy_hash,
    competition_policy_hash,
    verification_status,
    start_idempotency_key,
    start_request_hash
  ) values (
    new_attempt_id,
    requested_subject_key,
    requested_season_id,
    challenge.category,
    requested_content_revision_id,
    challenge.content_hash,
    requested_mode,
    now_at,
    now_at + (season.attempt_ttl_seconds::text || ' seconds')::interval,
    selected_pet.user_pet_id,
    selected_pet.pet_id,
    season.pet_catalog_revision,
    season.pet_catalog_hash,
    season.ruleset_hash,
    season.hint_policy_hash,
    season.competition_policy_hash,
    'OPEN',
    requested_idempotency_key,
    requested_request_hash
  );

  return pg_catalog.jsonb_build_object(
    'attemptId', new_attempt_id,
    'status', 'OPEN',
    'startedAt', now_at,
    'expiresAt',
      now_at + (season.attempt_ttl_seconds::text || ' seconds')::interval,
    'contentRevisionId', requested_content_revision_id
  );
end
$$;

create or replace function private.create_casual_season_v1(
  requested_season_id uuid,
  requested_starts_at timestamp with time zone,
  requested_ends_at timestamp with time zone,
  expected_ruleset_hash text,
  expected_hint_policy_hash text,
  expected_competition_policy_hash text,
  expected_attempt_ttl_seconds integer,
  expected_pet_catalog_revision text,
  expected_pet_catalog_hash text,
  requested_english_pins jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_season private.weekly_seasons%rowtype;
  response jsonb;
  pin_count integer;
  distinct_pin_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requested_season_id::text, 41)
  );

  if expected_ruleset_hash is null
     or expected_hint_policy_hash is null
     or expected_competition_policy_hash is null
     or expected_ruleset_hash !~ '^[0-9a-f]{64}$'
     or expected_hint_policy_hash !~ '^[0-9a-f]{64}$'
     or expected_competition_policy_hash !~ '^[0-9a-f]{64}$'
     or (expected_pet_catalog_revision is null) <> (expected_pet_catalog_hash is null)
     or (expected_pet_catalog_hash is not null
         and expected_pet_catalog_hash !~ '^[0-9a-f]{64}$')
     or not exists(
       select 1
       from private.learning_competition_policies p
       where p.competition_policy_hash = expected_competition_policy_hash
         and p.ruleset_hash = expected_ruleset_hash
         and p.hint_policy_hash = expected_hint_policy_hash
         and p.attempt_ttl_seconds = expected_attempt_ttl_seconds
     )
     or (expected_pet_catalog_revision is not null
         and not exists(
           select 1
           from private.pet_catalog_revisions c
           where c.catalog_revision = expected_pet_catalog_revision
             and c.catalog_hash = expected_pet_catalog_hash
         )) then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  if requested_starts_at is null
     or requested_ends_at is null
     or requested_starts_at <> (
       pg_catalog.date_trunc(
         'week',
         pg_catalog.timezone('Asia/Seoul', requested_starts_at)
       ) at time zone 'Asia/Seoul'
     )
     or requested_ends_at <> (
       (
         pg_catalog.date_trunc(
           'week',
           pg_catalog.timezone('Asia/Seoul', requested_starts_at)
         ) + interval '7 days'
       ) at time zone 'Asia/Seoul'
     ) then
    raise exception using errcode = 'P0001', message = 'WEEKLY_BOUNDARY_INVALID';
  end if;

  if pg_catalog.jsonb_typeof(requested_english_pins) <> 'array' then
    raise exception using errcode = 'P0001', message = 'SEASON_CONTENT_INSUFFICIENT';
  end if;

  select count(*)::integer, count(distinct pin_value)::integer
    into pin_count, distinct_pin_count
    from pg_catalog.jsonb_array_elements_text(requested_english_pins) pin(pin_value);

  if pin_count <> 5 or distinct_pin_count <> 5
     or exists(
       select 1
       from pg_catalog.jsonb_array_elements_text(requested_english_pins) pin(pin_value)
       where pin_value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or not private.learning_content_eligible_v1(pin.pin_value::uuid, 'ENGLISH')
     ) then
    raise exception using errcode = 'P0001', message = 'SEASON_CONTENT_INSUFFICIENT';
  end if;

  select * into existing_season from private.weekly_seasons s where s.season_id = requested_season_id;
  if found then
    raise exception using errcode = 'P0001', message = 'SEASON_CONFLICT';
  end if;

  response := pg_catalog.jsonb_build_object(
    'seasonId', requested_season_id,
    'startsAt', requested_starts_at,
    'endsAt', requested_ends_at,
    'challengeCount', 5
  );

  insert into private.weekly_seasons(
    season_id, starts_at, ends_at, ruleset_hash, hint_policy_hash, competition_policy_hash,
    attempt_ttl_seconds, enabled_categories, challenges_per_category,
    pet_catalog_revision, pet_catalog_hash, response_body
  ) values (
    requested_season_id, requested_starts_at, requested_ends_at,
    expected_ruleset_hash, expected_hint_policy_hash, expected_competition_policy_hash,
    expected_attempt_ttl_seconds, array['ENGLISH']::text[], 5,
    expected_pet_catalog_revision, expected_pet_catalog_hash, response
  );

  insert into private.weekly_challenge_pins(
    season_id, category, challenge_ordinal, content_revision_id, content_hash
  )
  select
    requested_season_id,
    'ENGLISH',
    pin.ordinality::integer,
    pin.pin_value::uuid,
    r.public_content_hash
  from pg_catalog.jsonb_array_elements_text(requested_english_pins)
    with ordinality pin(pin_value, ordinality)
  join public.game_content_revisions r
    on r.content_revision_id = pin.pin_value::uuid;

  insert into private.weekly_reward_settlements(season_id, category)
  values (requested_season_id, 'ENGLISH');

  return response;
end
$$;

alter function private.start_learning_attempt_v1(
  uuid,uuid,uuid,uuid,text,text,text,text,text,text,text
) owner to game_security_owner;
alter function private.create_casual_season_v1(
  uuid,timestamptz,timestamptz,text,text,text,integer,text,text,jsonb
) owner to game_security_owner;

revoke execute on function private.create_casual_season_v1(
  uuid,timestamptz,timestamptz,text,text,text,integer,text,text,jsonb
) from public, anon, authenticated, service_role, app_server, economy_server, admin_publish_role;
grant execute on function private.create_casual_season_v1(
  uuid,timestamptz,timestamptz,text,text,text,integer,text,text,jsonb
) to economy_deployment_role, postgres;

revoke create on schema private from game_security_owner;
