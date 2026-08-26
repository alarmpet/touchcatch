-- Android closed-beta casual play: English-only seasons and attempts without a selected pet.
-- Ranked 5+5 policy rows stay as they are. Do not flip pet economy.

-- `weekly_seasons`, `learning_attempts` and `start_learning_attempt_v1` are owned by
-- game_security_owner, and the migration role is not a member of it by default. Without this the
-- first ALTER fails with `must be owner of table weekly_seasons`, which reads like a permissions
-- bug in the schema rather than a missing line here. Every migration that touches those objects
-- opens the same way.
do $$begin execute format('grant game_security_owner to %I',current_user); end$$;

-- `alter function ... owner to game_security_owner` needs the *incoming* owner to hold CREATE on
-- the schema, and every migration since 202607300002 revokes it again on the way out. Granting
-- it here and revoking at the end is the shape the neighbouring migrations use; skipping it
-- fails late, at the ownership statement, with `permission denied for schema private`.
grant create on schema private to game_security_owner;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'private'
      and t.relname = 'weekly_seasons'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%enabled_categories%'
  loop
    execute format(
      'alter table private.weekly_seasons drop constraint %I',
      constraint_row.conname
    );
  end loop;
end
$$;

alter table private.weekly_seasons
  add constraint weekly_seasons_enabled_categories_subset_check
  check (
    enabled_categories <@ array['ENGLISH','PROVERB']::text[]
    and cardinality(enabled_categories) between 1 and 2
  );

alter table private.learning_attempts
  alter column selected_user_pet_id drop not null,
  alter column selected_pet_catalog_id drop not null;

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

  if expected_content_hash is null
     or expected_ruleset_hash is null
     or expected_hint_policy_hash is null
     or expected_competition_policy_hash is null
     or expected_pet_catalog_hash is null
     or challenge.content_hash <> expected_content_hash
     or season.ruleset_hash <> expected_ruleset_hash
     or season.hint_policy_hash <> expected_hint_policy_hash
     or season.competition_policy_hash <> expected_competition_policy_hash
     or season.pet_catalog_hash <> expected_pet_catalog_hash then
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

create function private.publish_casual_learning_revision_v1(
  requested_public_content jsonb,
  requested_private_solution jsonb,
  requested_rights_manifest jsonb,
  expected_public_canonical_json text,
  expected_private_canonical_json text,
  expected_rights_canonical_json text,
  expected_validator_version text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  revision_id uuid;
  logical_content_id uuid;
  revision_version integer;
  manifest_set_id text;
  public_content_hash text;
  private_solution_hash text;
  rights_manifest_hash text;
  public_asset_hashes text[];
  rights_asset_hashes text[];
begin
  if requested_public_content->>'category' <> 'ENGLISH' then
    raise exception using errcode = '22023', message = 'PUBLIC_CONTENT_VALUE_INVALID';
  end if;
  if jsonb_typeof(requested_private_solution->'differences') <> 'array'
     or jsonb_array_length(requested_private_solution->'differences') < 1
     or jsonb_typeof(requested_private_solution->'finalChallenge') <> 'object'
     or nullif(requested_private_solution#>>'{finalChallenge,canonicalAnswer}', '') is null
     or exists (
       select 1
       from jsonb_array_elements(requested_private_solution->'differences') item
       where not (item ?& array['objectiveId','tier','hitboxes'])
          or not ((item#>'{hitboxes,imageA}') ?& array['cx','cy','r'])
          or not ((item#>'{hitboxes,imageB}') ?& array['cx','cy','r'])
     ) then
    raise exception using errcode = '22023', message = 'PRIVATE_CONTENT_VALUE_INVALID';
  end if;
  if jsonb_typeof(requested_rights_manifest->'entries') <> 'array'
     or jsonb_array_length(requested_rights_manifest->'entries') <> 2
     or exists (
       select 1 from jsonb_array_elements(requested_rights_manifest->'entries') entry
       where entry#>>'{rights,status}' <> 'APPROVED'
          or entry#>>'{education,status}' <> 'APPROVED'
          or nullif(entry#>>'{rights,approverId}', '') is null
          or nullif(entry#>>'{education,reviewerId}', '') is null
          or entry#>>'{rights,approverId}' ~* '^test-'
          or entry#>>'{education,reviewerId}' ~* '^test-'
     ) then
    raise exception using errcode = '22023', message = 'RIGHTS_APPROVAL_REQUIRED';
  end if;
  select array_agg(value order by value) into public_asset_hashes
  from (values
    (requested_public_content#>>'{imageA,sha256}'),
    (requested_public_content#>>'{imageB,sha256}')
  ) hashes(value);
  select array_agg(entry->>'assetSha256' order by entry->>'assetSha256') into rights_asset_hashes
  from jsonb_array_elements(coalesce(requested_rights_manifest->'entries', '[]'::jsonb)) entry;
  if public_asset_hashes is null or cardinality(public_asset_hashes) <> 2
     or public_asset_hashes[1] = public_asset_hashes[2]
     or public_asset_hashes is distinct from rights_asset_hashes then
    raise exception using errcode = '22023', message = 'RIGHTS_ASSET_BIJECTION';
  end if;

  revision_id := (requested_public_content->>'contentRevisionId')::uuid;
  logical_content_id := (requested_public_content->>'contentId')::uuid;
  revision_version := (requested_public_content->>'version')::integer;
  manifest_set_id := requested_rights_manifest->>'manifestSetId';
  if revision_id is null or logical_content_id is null
     or requested_private_solution->>'contentRevisionId' <> revision_id::text
     or revision_version is null or revision_version < 1
     or manifest_set_id is null or manifest_set_id !~ '^[a-z0-9][a-z0-9_-]{0,127}$' then
    raise exception using errcode = '22023', message = 'CONTENT_REVISION_IDENTITY_INVALID';
  end if;
  begin
    if expected_public_canonical_json::jsonb is distinct from requested_public_content
       or expected_private_canonical_json::jsonb is distinct from requested_private_solution
       or expected_rights_canonical_json::jsonb is distinct from requested_rights_manifest then
      raise exception using errcode = '22023', message = 'CANONICAL_CONTENT_BINDING_MISMATCH';
    end if;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'CANONICAL_CONTENT_BINDING_MISMATCH';
  end;

  public_content_hash := encode(extensions.digest(convert_to(expected_public_canonical_json, 'UTF8'), 'sha256'), 'hex');
  private_solution_hash := encode(extensions.digest(convert_to(expected_private_canonical_json, 'UTF8'), 'sha256'), 'hex');
  rights_manifest_hash := encode(extensions.digest(convert_to(expected_rights_canonical_json, 'UTF8'), 'sha256'), 'hex');

  insert into private.content_rights_manifests(rights_manifest_set_id, manifest, manifest_hash)
  values (manifest_set_id, requested_rights_manifest, rights_manifest_hash)
  on conflict (rights_manifest_set_id) do nothing;
  if not exists (
    select 1 from private.content_rights_manifests
    where rights_manifest_set_id = manifest_set_id and manifest_hash = rights_manifest_hash
  ) then
    raise exception using errcode = '23505', message = 'RIGHTS_MANIFEST_CONFLICT';
  end if;

  insert into public.game_content_revisions(
    content_revision_id, content_id, version, schema_version, asset_policy_version,
    public_content, public_content_hash, status, approved_at, rights_manifest_set_id, validator_version
  ) values (
    revision_id, logical_content_id, revision_version, '1.0.0', '1.0.0',
    requested_public_content, public_content_hash, 'PUBLISHED', clock_timestamp(),
    manifest_set_id, coalesce(expected_validator_version, '1.0.0')
  );
  insert into private.game_content_solutions(content_revision_id, private_solution, private_solution_hash)
  values (revision_id, requested_private_solution, private_solution_hash);
  insert into private.content_publish_attestations(
    content_revision_id, validator_version, public_content_hash, private_solution_hash,
    rights_manifest_hash, database_role, session_role, invoked_role
  ) values (
    revision_id, coalesce(expected_validator_version, '1.0.0'), public_content_hash, private_solution_hash,
    rights_manifest_hash, current_user, session_user, current_setting('role', true)
  );
  return revision_id;
end
$$;

create function private.create_casual_season_v1(
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
     or expected_pet_catalog_hash is null
     or expected_ruleset_hash !~ '^[0-9a-f]{64}$'
     or expected_hint_policy_hash !~ '^[0-9a-f]{64}$'
     or expected_competition_policy_hash !~ '^[0-9a-f]{64}$'
     or expected_pet_catalog_hash !~ '^[0-9a-f]{64}$'
     or not exists(
       select 1
       from private.learning_competition_policies p
       where p.competition_policy_hash = expected_competition_policy_hash
         and p.ruleset_hash = expected_ruleset_hash
         and p.hint_policy_hash = expected_hint_policy_hash
         and p.attempt_ttl_seconds = expected_attempt_ttl_seconds
     )
     or not exists(
       select 1
       from private.pet_catalog_revisions c
       where c.catalog_revision = expected_pet_catalog_revision
         and c.catalog_hash = expected_pet_catalog_hash
     ) then
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
alter function private.publish_casual_learning_revision_v1(
  jsonb,jsonb,jsonb,text,text,text,text
) owner to game_security_owner;
alter function private.create_casual_season_v1(
  uuid,timestamptz,timestamptz,text,text,text,integer,text,text,jsonb
) owner to game_security_owner;

revoke execute on function private.publish_casual_learning_revision_v1(
  jsonb,jsonb,jsonb,text,text,text,text
) from public, anon, authenticated, service_role, app_server, economy_server;
grant execute on function private.publish_casual_learning_revision_v1(
  jsonb,jsonb,jsonb,text,text,text,text
) to deployment_role, postgres;

revoke execute on function private.create_casual_season_v1(
  uuid,timestamptz,timestamptz,text,text,text,integer,text,text,jsonb
) from public, anon, authenticated, service_role, app_server, economy_server, admin_publish_role;
grant execute on function private.create_casual_season_v1(
  uuid,timestamptz,timestamptz,text,text,text,integer,text,text,jsonb
) to economy_deployment_role, postgres;

revoke create on schema private from game_security_owner;
