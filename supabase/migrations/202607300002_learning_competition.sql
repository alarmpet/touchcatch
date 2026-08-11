-- Task 4: server-authoritative ranked learning attempts and weekly competition
-- storage. No policy row is seeded here: the repository competition artifact is
-- still DRAFT, so season creation remains fail-closed until a controlled
-- migration admits an approved immutable hash/TTL tuple.

grant game_security_owner to postgres;
grant economy_security_owner to postgres;
grant usage, create on schema private to game_security_owner;
grant usage, create on schema public to game_security_owner;

-- The game owner is NOLOGIN/NOINHERIT. These narrow read grants let hardened
-- learning functions validate the existing authenticated economy subject and
-- selected-pet authority without granting either operation role table access.
set role economy_security_owner;
grant select(subject_key, user_id)
  on private.economy_subjects to game_security_owner;
grant select(
  user_pet_id,
  subject_key,
  pet_id,
  copies,
  selected,
  acquired_catalog_revision,
  acquired_catalog_hash
)
  on private.pet_inventory to game_security_owner;
grant select(catalog_revision, catalog_hash)
  on private.pet_catalog_revisions to game_security_owner;
grant select(catalog_revision, pet_id)
  on private.pet_catalog_revision_entries to game_security_owner;
grant select(pet_id)
  on private.pet_definitions to game_security_owner;
reset role;
revoke economy_security_owner from postgres;

create table private.learning_competition_policies (
  competition_policy_hash text primary key
    check (competition_policy_hash ~ '^[0-9a-f]{64}$'),
  ruleset_hash text not null
    check (ruleset_hash ~ '^[0-9a-f]{64}$'),
  hint_policy_hash text not null
    check (hint_policy_hash ~ '^[0-9a-f]{64}$'),
  attempt_ttl_seconds integer not null
    check (attempt_ttl_seconds between 30 and 86400),
  enabled_categories text[] not null
    check (enabled_categories = array['ENGLISH','PROVERB']::text[]),
  challenges_per_category integer not null
    check (challenges_per_category = 5),
  approved_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(
    competition_policy_hash,
    ruleset_hash,
    hint_policy_hash,
    attempt_ttl_seconds
  )
);

create table private.weekly_seasons (
  season_id uuid primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone_name text not null default 'Asia/Seoul'
    check (timezone_name = 'Asia/Seoul'),
  ruleset_hash text not null
    check (ruleset_hash ~ '^[0-9a-f]{64}$'),
  hint_policy_hash text not null
    check (hint_policy_hash ~ '^[0-9a-f]{64}$'),
  competition_policy_hash text not null
    check (competition_policy_hash ~ '^[0-9a-f]{64}$'),
  attempt_ttl_seconds integer not null,
  enabled_categories text[] not null
    check (enabled_categories = array['ENGLISH','PROVERB']::text[]),
  challenges_per_category integer not null
    check (challenges_per_category = 5),
  pet_catalog_revision text not null
    references private.pet_catalog_revisions(catalog_revision),
  pet_catalog_hash text not null
    check (pet_catalog_hash ~ '^[0-9a-f]{64}$'),
  response_body jsonb not null
    check (pg_catalog.jsonb_typeof(response_body) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(starts_at),
  check (ends_at = starts_at + interval '7 days'),
  foreign key (
    competition_policy_hash,
    ruleset_hash,
    hint_policy_hash,
    attempt_ttl_seconds
  ) references private.learning_competition_policies(
    competition_policy_hash,
    ruleset_hash,
    hint_policy_hash,
    attempt_ttl_seconds
  )
);

create table private.weekly_challenge_pins (
  season_id uuid not null
    references private.weekly_seasons(season_id),
  category text not null
    check (category in ('ENGLISH','PROVERB')),
  challenge_ordinal integer not null
    check (challenge_ordinal between 1 and 5),
  content_revision_id uuid not null
    references public.game_content_revisions(content_revision_id),
  content_hash text not null
    check (content_hash ~ '^[0-9a-f]{64}$'),
  primary key(season_id, category, challenge_ordinal),
  unique(season_id, category, content_revision_id),
  unique(season_id, category, content_revision_id, content_hash)
);

create table private.learning_attempts (
  attempt_id uuid primary key default extensions.uuid_generate_v4(),
  subject_key uuid not null
    references private.economy_subjects(subject_key),
  season_id uuid not null,
  category text not null
    check (category in ('ENGLISH','PROVERB')),
  content_revision_id uuid not null,
  content_hash text not null
    check (content_hash ~ '^[0-9a-f]{64}$'),
  mode text not null
    check (mode = 'RANKED'),
  started_at timestamptz not null,
  expires_at timestamptz not null,
  assets_ready_at timestamptz,
  completed_at timestamptz,
  accepted_at timestamptz,
  completion_ms bigint
    check (completion_ms is null or completion_ms >= 0),
  display_score integer
    check (display_score is null or display_score >= 0),
  hints_used integer
    check (hints_used is null or hints_used >= 0),
  wrong_taps integer
    check (wrong_taps is null or wrong_taps >= 0),
  wrong_answers integer
    check (wrong_answers is null or wrong_answers >= 0),
  selected_user_pet_id uuid not null,
  selected_pet_catalog_id uuid not null
    references private.pet_definitions(pet_id),
  pet_catalog_revision text not null,
  pet_catalog_hash text not null
    check (pet_catalog_hash ~ '^[0-9a-f]{64}$'),
  ruleset_hash text not null
    check (ruleset_hash ~ '^[0-9a-f]{64}$'),
  hint_policy_hash text not null
    check (hint_policy_hash ~ '^[0-9a-f]{64}$'),
  competition_policy_hash text not null
    check (competition_policy_hash ~ '^[0-9a-f]{64}$'),
  event_digest text
    check (event_digest is null or event_digest ~ '^[0-9a-f]{64}$'),
  verification_status text not null
    check (
      verification_status in (
        'OPEN',
        'COMPLETED_VERIFIED',
        'ABANDONED',
        'EXPIRED',
        'QUARANTINED'
      )
    ),
  start_idempotency_key uuid not null,
  start_request_hash text not null
    check (start_request_hash ~ '^[0-9a-f]{64}$'),
  completion_idempotency_key uuid,
  completion_request_hash text
    check (
      completion_request_hash is null
      or completion_request_hash ~ '^[0-9a-f]{64}$'
    ),
  terminal_response jsonb
    check (
      terminal_response is null
      or pg_catalog.jsonb_typeof(terminal_response) = 'object'
    ),
  terminal_at timestamptz,
  unique(subject_key, start_idempotency_key),
  unique(attempt_id, subject_key, season_id, content_revision_id),
  foreign key (
    season_id,
    category,
    content_revision_id,
    content_hash
  ) references private.weekly_challenge_pins(
    season_id,
    category,
    content_revision_id,
    content_hash
  ),
  foreign key (pet_catalog_revision, selected_pet_catalog_id)
    references private.pet_catalog_revision_entries(
      catalog_revision,
      pet_id
    ),
  check (expires_at > started_at),
  check (
    (completed_at is null and accepted_at is null)
    or completed_at = accepted_at
  ),
  check (
    (completion_idempotency_key is null)
    = (completion_request_hash is null)
  ),
  check (
    (
      verification_status = 'OPEN'
      and terminal_at is null
      and completed_at is null
      and completion_ms is null
      and display_score is null
      and hints_used is null
      and wrong_taps is null
      and wrong_answers is null
      and event_digest is null
      and completion_idempotency_key is null
      and terminal_response is null
    )
    or (
      verification_status = 'COMPLETED_VERIFIED'
      and terminal_at is not null
      and completed_at is not null
      and accepted_at is not null
      and assets_ready_at is not null
      and completion_ms is not null
      and display_score is not null
      and hints_used is not null
      and wrong_taps is not null
      and wrong_answers is not null
      and event_digest is not null
      and completion_idempotency_key is not null
      and terminal_response is not null
    )
    or (
      verification_status in ('ABANDONED','EXPIRED')
      and terminal_at is not null
      and completed_at is null
      and accepted_at is null
      and completion_ms is null
      and display_score is null
      and hints_used is null
      and wrong_taps is null
      and wrong_answers is null
      and event_digest is null
    )
    or (
      verification_status = 'QUARANTINED'
      and terminal_at is not null
      and completed_at is not null
      and accepted_at is not null
      and display_score is not null
      and hints_used is not null
      and wrong_taps is not null
      and wrong_answers is not null
      and event_digest is not null
      and completion_idempotency_key is not null
      and terminal_response is not null
    )
  )
);

create unique index learning_attempts_one_open
  on private.learning_attempts(
    subject_key,
    season_id,
    content_revision_id
  )
  where verification_status = 'OPEN';
create unique index learning_attempts_completion_idempotency
  on private.learning_attempts(subject_key, completion_idempotency_key)
  where completion_idempotency_key is not null;

create table private.learning_best_records (
  subject_key uuid not null,
  season_id uuid not null,
  content_revision_id uuid not null,
  attempt_id uuid not null unique,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(subject_key, season_id, content_revision_id),
  foreign key (
    attempt_id,
    subject_key,
    season_id,
    content_revision_id
  ) references private.learning_attempts(
    attempt_id,
    subject_key,
    season_id,
    content_revision_id
  )
);

create table private.weekly_reward_settlements (
  season_id uuid not null
    references private.weekly_seasons(season_id),
  category text not null
    check (category in ('ENGLISH','PROVERB')),
  reward_type text not null default 'RARE_ONLY_TICKET_V1'
    check (reward_type = 'RARE_ONLY_TICKET_V1'),
  status text not null default 'PENDING'
    check (status in ('PENDING','LEASED','COMPLETED','FAILED')),
  owner_token uuid,
  fence bigint not null default 0
    check (fence >= 0),
  lease_until timestamptz,
  winner_subject_key uuid
    references private.economy_subjects(subject_key),
  winner_attempt_id uuid
    references private.learning_attempts(attempt_id),
  response_body jsonb
    check (
      response_body is null
      or pg_catalog.jsonb_typeof(response_body) = 'object'
    ),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  settled_at timestamptz,
  primary key(season_id, category),
  check (
    (owner_token is null and lease_until is null)
    or (owner_token is not null and lease_until is not null)
  ),
  check (
    (status = 'PENDING' and fence = 0 and owner_token is null)
    or status <> 'PENDING'
  )
);

create function private.reject_learning_competition_pin_mutation_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'IMMUTABLE_LEARNING_COMPETITION_PIN';
end
$$;

create trigger learning_competition_policies_immutable
before update or delete on private.learning_competition_policies
for each row execute function private.reject_learning_competition_pin_mutation_v1();
create trigger weekly_seasons_immutable
before update or delete on private.weekly_seasons
for each row execute function private.reject_learning_competition_pin_mutation_v1();
create trigger weekly_challenge_pins_immutable
before update or delete on private.weekly_challenge_pins
for each row execute function private.reject_learning_competition_pin_mutation_v1();

create function private.validate_learning_attempt_transition_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' or old.verification_status <> 'OPEN' then
    raise exception using
      errcode = 'P0001',
      message = 'IMMUTABLE_LEARNING_ATTEMPT';
  end if;

  if row(
    new.attempt_id,
    new.subject_key,
    new.season_id,
    new.category,
    new.content_revision_id,
    new.content_hash,
    new.mode,
    new.started_at,
    new.expires_at,
    new.selected_user_pet_id,
    new.selected_pet_catalog_id,
    new.pet_catalog_revision,
    new.pet_catalog_hash,
    new.ruleset_hash,
    new.hint_policy_hash,
    new.competition_policy_hash,
    new.start_idempotency_key,
    new.start_request_hash
  ) is distinct from row(
    old.attempt_id,
    old.subject_key,
    old.season_id,
    old.category,
    old.content_revision_id,
    old.content_hash,
    old.mode,
    old.started_at,
    old.expires_at,
    old.selected_user_pet_id,
    old.selected_pet_catalog_id,
    old.pet_catalog_revision,
    old.pet_catalog_hash,
    old.ruleset_hash,
    old.hint_policy_hash,
    old.competition_policy_hash,
    old.start_idempotency_key,
    old.start_request_hash
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'IMMUTABLE_LEARNING_ATTEMPT';
  end if;

  if new.verification_status = 'OPEN' then
    if old.assets_ready_at is not null
       or new.assets_ready_at is null
       or row(
         new.completed_at,
         new.accepted_at,
         new.completion_ms,
         new.display_score,
         new.hints_used,
         new.wrong_taps,
         new.wrong_answers,
         new.event_digest,
         new.completion_idempotency_key,
         new.completion_request_hash,
         new.terminal_response,
         new.terminal_at
       ) is distinct from row(
         old.completed_at,
         old.accepted_at,
         old.completion_ms,
         old.display_score,
         old.hints_used,
         old.wrong_taps,
         old.wrong_answers,
         old.event_digest,
         old.completion_idempotency_key,
         old.completion_request_hash,
         old.terminal_response,
         old.terminal_at
       ) then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_LEARNING_ATTEMPT_TRANSITION';
    end if;
    return new;
  end if;

  if new.verification_status not in (
    'COMPLETED_VERIFIED',
    'ABANDONED',
    'EXPIRED',
    'QUARANTINED'
  ) or new.assets_ready_at is distinct from old.assets_ready_at then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_LEARNING_ATTEMPT_TRANSITION';
  end if;

  return new;
end
$$;

create trigger learning_attempts_transition_guard
before update or delete on private.learning_attempts
for each row execute function private.validate_learning_attempt_transition_v1();

create function private.learning_rank_better_v1(
  candidate_score integer,
  candidate_hints integer,
  candidate_wrong_answers integer,
  candidate_wrong_taps integer,
  candidate_completion_ms bigint,
  candidate_accepted_at timestamptz,
  candidate_attempt_id uuid,
  incumbent_score integer,
  incumbent_hints integer,
  incumbent_wrong_answers integer,
  incumbent_wrong_taps integer,
  incumbent_completion_ms bigint,
  incumbent_accepted_at timestamptz,
  incumbent_attempt_id uuid
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select row(
    -candidate_score,
    candidate_hints,
    candidate_wrong_answers,
    candidate_wrong_taps,
    candidate_completion_ms,
    candidate_accepted_at,
    candidate_attempt_id
  ) < row(
    -incumbent_score,
    incumbent_hints,
    incumbent_wrong_answers,
    incumbent_wrong_taps,
    incumbent_completion_ms,
    incumbent_accepted_at,
    incumbent_attempt_id
  )
$$;

create function private.validate_learning_best_record_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  candidate private.learning_attempts%rowtype;
  incumbent private.learning_attempts%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'P0001',
      message = 'IMMUTABLE_LEARNING_BEST_KEY';
  end if;

  select *
    into candidate
    from private.learning_attempts a
    where a.attempt_id = new.attempt_id;
  if not found
     or candidate.verification_status <> 'COMPLETED_VERIFIED'
     or candidate.subject_key <> new.subject_key
     or candidate.season_id <> new.season_id
     or candidate.content_revision_id <> new.content_revision_id then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_LEARNING_BEST_ATTEMPT';
  end if;

  if tg_op = 'UPDATE' then
    if row(new.subject_key, new.season_id, new.content_revision_id)
       is distinct from
       row(old.subject_key, old.season_id, old.content_revision_id) then
      raise exception using
        errcode = 'P0001',
        message = 'IMMUTABLE_LEARNING_BEST_KEY';
    end if;

    select *
      into incumbent
      from private.learning_attempts a
      where a.attempt_id = old.attempt_id;
    if not private.learning_rank_better_v1(
      candidate.display_score,
      candidate.hints_used,
      candidate.wrong_answers,
      candidate.wrong_taps,
      candidate.completion_ms,
      candidate.accepted_at,
      candidate.attempt_id,
      incumbent.display_score,
      incumbent.hints_used,
      incumbent.wrong_answers,
      incumbent.wrong_taps,
      incumbent.completion_ms,
      incumbent.accepted_at,
      incumbent.attempt_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'BEST_RECORD_REGRESSION';
    end if;
  end if;

  return new;
end
$$;

create trigger learning_best_records_guard
before insert or update or delete on private.learning_best_records
for each row execute function private.validate_learning_best_record_v1();

create function private.learning_content_eligible_v1(
  requested_content_revision_id uuid,
  requested_category text
)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select exists(
    select 1
    from public.game_content_revisions r
    join private.game_content_solutions s
      on s.content_revision_id = r.content_revision_id
    join private.content_publish_attestations a
      on a.content_revision_id = r.content_revision_id
     and a.public_content_hash = r.public_content_hash
     and a.private_solution_hash = s.private_solution_hash
    join private.content_rights_manifests m
      on m.rights_manifest_set_id = r.rights_manifest_set_id
     and m.manifest_hash = a.rights_manifest_hash
    where r.content_revision_id = requested_content_revision_id
      and requested_category in ('ENGLISH','PROVERB')
      and r.status = 'PUBLISHED'
      and r.approved_at is not null
      and r.public_content->>'category' = requested_category
      and pg_catalog.jsonb_typeof(r.public_content->'imageA') = 'object'
      and pg_catalog.jsonb_typeof(r.public_content->'imageB') = 'object'
      and r.public_content#>>'{imageA,sha256}' ~ '^[0-9a-f]{64}$'
      and r.public_content#>>'{imageB,sha256}' ~ '^[0-9a-f]{64}$'
      and r.public_content#>>'{imageA,sha256}'
        <> r.public_content#>>'{imageB,sha256}'
      and r.public_content#>>'{imageA,url}' is not null
      and r.public_content#>>'{imageB,url}' is not null
      and r.public_content#>>'{imageA,mimeType}' in (
        'image/png',
        'image/webp',
        'image/jpeg'
      )
      and r.public_content#>>'{imageB,mimeType}' in (
        'image/png',
        'image/webp',
        'image/jpeg'
      )
      and pg_catalog.jsonb_typeof(r.public_content#>'{imageA,encodedBytes}')
        = 'number'
      and pg_catalog.jsonb_typeof(r.public_content#>'{imageB,encodedBytes}')
        = 'number'
      and pg_catalog.jsonb_typeof(r.public_content#>'{imageA,width}')
        = 'number'
      and pg_catalog.jsonb_typeof(r.public_content#>'{imageB,width}')
        = 'number'
      and pg_catalog.jsonb_typeof(r.public_content#>'{imageA,height}')
        = 'number'
      and pg_catalog.jsonb_typeof(r.public_content#>'{imageB,height}')
        = 'number'
      and case
        when pg_catalog.jsonb_typeof(m.manifest->'entries') = 'array'
          then pg_catalog.jsonb_array_length(m.manifest->'entries') = 2
        else false
      end
      and not exists(
        select 1
        from pg_catalog.jsonb_array_elements(
          case
            when pg_catalog.jsonb_typeof(m.manifest->'entries') = 'array'
              then m.manifest->'entries'
            else '[]'::jsonb
          end
        ) entry
        where entry#>>'{rights,status}' <> 'APPROVED'
           or entry#>>'{education,status}' <> 'APPROVED'
           or nullif(entry#>>'{education,reviewedAt}', '') is null
           or entry->>'assetSha256' !~ '^[0-9a-f]{64}$'
      )
      and (
        select pg_catalog.array_agg(asset_hash order by asset_hash)
        from (
          values
            (r.public_content#>>'{imageA,sha256}'),
            (r.public_content#>>'{imageB,sha256}')
        ) assets(asset_hash)
      ) = (
        select pg_catalog.array_agg(
          entry->>'assetSha256'
          order by entry->>'assetSha256'
        )
        from pg_catalog.jsonb_array_elements(
          case
            when pg_catalog.jsonb_typeof(m.manifest->'entries') = 'array'
              then m.manifest->'entries'
            else '[]'::jsonb
          end
        ) entry
      )
  )
$$;

create function private.create_weekly_season_v1(
  requested_season_id uuid,
  requested_starts_at timestamptz,
  requested_ends_at timestamptz,
  expected_ruleset_hash text,
  expected_hint_policy_hash text,
  expected_competition_policy_hash text,
  expected_attempt_ttl_seconds integer,
  expected_pet_catalog_revision text,
  expected_pet_catalog_hash text,
  requested_challenge_pins jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_season private.weekly_seasons%rowtype;
  eligible_english integer;
  eligible_proverb integer;
  category_name text;
  pin_count integer;
  distinct_pin_count integer;
  invalid_pin_count integer;
  response jsonb;
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
         and p.enabled_categories = array['ENGLISH','PROVERB']::text[]
         and p.challenges_per_category = 5
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
    raise exception using
      errcode = 'P0001',
      message = 'WEEKLY_BOUNDARY_INVALID';
  end if;

  select count(*)::integer
    into eligible_english
    from public.game_content_revisions r
    where private.learning_content_eligible_v1(
      r.content_revision_id,
      'ENGLISH'
    );
  select count(*)::integer
    into eligible_proverb
    from public.game_content_revisions r
    where private.learning_content_eligible_v1(
      r.content_revision_id,
      'PROVERB'
    );

  if eligible_english < 5 or eligible_proverb < 5 then
    raise exception using
      errcode = 'P0001',
      message = 'SEASON_CONTENT_INSUFFICIENT',
      detail = pg_catalog.jsonb_build_object(
        'eligibleCounts',
        pg_catalog.jsonb_build_object(
          'ENGLISH', eligible_english,
          'PROVERB', eligible_proverb
        )
      )::text;
  end if;

  if pg_catalog.jsonb_typeof(requested_challenge_pins) <> 'object'
     or (
       select pg_catalog.array_agg(key order by key)
       from pg_catalog.jsonb_object_keys(requested_challenge_pins) key
     ) is distinct from array['ENGLISH','PROVERB']::text[] then
    raise exception using
      errcode = 'P0001',
      message = 'SEASON_CONTENT_INSUFFICIENT',
      detail = pg_catalog.jsonb_build_object(
        'eligibleCounts',
        pg_catalog.jsonb_build_object(
          'ENGLISH', eligible_english,
          'PROVERB', eligible_proverb
        )
      )::text;
  end if;

  foreach category_name in array array['ENGLISH','PROVERB']::text[]
  loop
    if pg_catalog.jsonb_typeof(requested_challenge_pins->category_name)
       <> 'array' then
      raise exception using
        errcode = 'P0001',
        message = 'SEASON_CONTENT_INSUFFICIENT',
        detail = pg_catalog.jsonb_build_object(
          'eligibleCounts',
          pg_catalog.jsonb_build_object(
            'ENGLISH', eligible_english,
            'PROVERB', eligible_proverb
          )
        )::text;
    end if;

    select
      count(*)::integer,
      count(distinct pin_value)::integer,
      count(*) filter (
        where pin_value !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )::integer
      into pin_count, distinct_pin_count, invalid_pin_count
      from pg_catalog.jsonb_array_elements_text(
        requested_challenge_pins->category_name
      ) pin(pin_value);

    if pin_count <> 5
       or distinct_pin_count <> 5
       or invalid_pin_count <> 0
       or exists(
         select 1
         from pg_catalog.jsonb_array_elements_text(
           requested_challenge_pins->category_name
         ) pin(pin_value)
         where not private.learning_content_eligible_v1(
           pin.pin_value::uuid,
           category_name
         )
       ) then
      raise exception using
        errcode = 'P0001',
        message = 'SEASON_CONTENT_INSUFFICIENT',
        detail = pg_catalog.jsonb_build_object(
          'eligibleCounts',
          pg_catalog.jsonb_build_object(
            'ENGLISH', eligible_english,
            'PROVERB', eligible_proverb
          )
        )::text;
    end if;
  end loop;

  select *
    into existing_season
    from private.weekly_seasons s
    where s.season_id = requested_season_id;
  if found then
    if existing_season.starts_at <> requested_starts_at
       or existing_season.ends_at <> requested_ends_at
       or existing_season.ruleset_hash <> expected_ruleset_hash
       or existing_season.hint_policy_hash <> expected_hint_policy_hash
       or existing_season.competition_policy_hash
          <> expected_competition_policy_hash
       or existing_season.attempt_ttl_seconds
          <> expected_attempt_ttl_seconds
       or existing_season.pet_catalog_revision
          <> expected_pet_catalog_revision
       or existing_season.pet_catalog_hash <> expected_pet_catalog_hash
       or exists(
         select 1
         from (
           select
             requested_category.category as category,
             pin.ordinality::integer as challenge_ordinal,
             pin.pin_value::uuid as content_revision_id
           from unnest(array['ENGLISH','PROVERB']::text[])
             as requested_category(category)
           cross join lateral pg_catalog.jsonb_array_elements_text(
             requested_challenge_pins->requested_category.category
           ) with ordinality pin(pin_value, ordinality)
         ) expected
         full join private.weekly_challenge_pins actual
           on actual.season_id = requested_season_id
          and actual.category = expected.category
          and actual.challenge_ordinal = expected.challenge_ordinal
          and actual.content_revision_id = expected.content_revision_id
         where expected.content_revision_id is null
            or actual.content_revision_id is null
       ) then
      raise exception using errcode = 'P0001', message = 'SEASON_CONFLICT';
    end if;
    return existing_season.response_body;
  end if;

  response := pg_catalog.jsonb_build_object(
    'seasonId', requested_season_id,
    'startsAt', requested_starts_at,
    'endsAt', requested_ends_at,
    'challengeCount', 10
  );

  insert into private.weekly_seasons(
    season_id,
    starts_at,
    ends_at,
    ruleset_hash,
    hint_policy_hash,
    competition_policy_hash,
    attempt_ttl_seconds,
    enabled_categories,
    challenges_per_category,
    pet_catalog_revision,
    pet_catalog_hash,
    response_body
  ) values (
    requested_season_id,
    requested_starts_at,
    requested_ends_at,
    expected_ruleset_hash,
    expected_hint_policy_hash,
    expected_competition_policy_hash,
    expected_attempt_ttl_seconds,
    array['ENGLISH','PROVERB']::text[],
    5,
    expected_pet_catalog_revision,
    expected_pet_catalog_hash,
    response
  );

  insert into private.weekly_challenge_pins(
    season_id,
    category,
    challenge_ordinal,
    content_revision_id,
    content_hash
  )
  select
    requested_season_id,
    requested_category.category,
    pin.ordinality::integer,
    pin.pin_value::uuid,
    r.public_content_hash
  from unnest(array['ENGLISH','PROVERB']::text[])
    as requested_category(category)
  cross join lateral pg_catalog.jsonb_array_elements_text(
    requested_challenge_pins->requested_category.category
  ) with ordinality pin(pin_value, ordinality)
  join public.game_content_revisions r
    on r.content_revision_id = pin.pin_value::uuid;

  insert into private.weekly_reward_settlements(season_id, category)
  values
    (requested_season_id, 'ENGLISH'),
    (requested_season_id, 'PROVERB');

  return response;
end
$$;

create function private.start_learning_attempt_v1(
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
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SELECTED_PET_REQUIRED';
  end if;

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

create function private.attest_learning_assets_ready_v1(
  requested_attempt_id uuid,
  expected_content_hash text,
  expected_ruleset_hash text,
  expected_hint_policy_hash text,
  expected_competition_policy_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  attempt private.learning_attempts%rowtype;
  now_at timestamptz := pg_catalog.clock_timestamp();
begin
  select *
    into attempt
    from private.learning_attempts a
    where a.attempt_id = requested_attempt_id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ATTEMPT_NOT_FOUND';
  end if;

  if expected_content_hash is null
     or expected_ruleset_hash is null
     or expected_hint_policy_hash is null
     or expected_competition_policy_hash is null
     or attempt.content_hash <> expected_content_hash
     or attempt.ruleset_hash <> expected_ruleset_hash
     or attempt.hint_policy_hash <> expected_hint_policy_hash
     or attempt.competition_policy_hash <> expected_competition_policy_hash then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  if attempt.assets_ready_at is not null then
    return pg_catalog.jsonb_build_object(
      'attemptId', attempt.attempt_id,
      'status', attempt.verification_status,
      'assetsReadyAt', attempt.assets_ready_at
    );
  end if;

  if attempt.verification_status <> 'OPEN' then
    raise exception using errcode = 'P0001', message = 'ATTEMPT_TERMINAL';
  end if;

  if attempt.expires_at <= now_at then
    update private.learning_attempts
    set
      verification_status = 'EXPIRED',
      terminal_at = now_at
    where attempt_id = attempt.attempt_id;
    return pg_catalog.jsonb_build_object(
      'attemptId', attempt.attempt_id,
      'status', 'EXPIRED'
    );
  end if;

  update private.learning_attempts
  set assets_ready_at = now_at
  where attempt_id = attempt.attempt_id;

  return pg_catalog.jsonb_build_object(
    'attemptId', attempt.attempt_id,
    'status', 'OPEN',
    'assetsReadyAt', now_at
  );
end
$$;

create function private.commit_learning_attempt_v1(
  requested_attempt_id uuid,
  requested_completion_idempotency_key uuid,
  requested_request_hash text,
  expected_content_hash text,
  expected_ruleset_hash text,
  expected_hint_policy_hash text,
  expected_competition_policy_hash text,
  trusted_display_score integer,
  trusted_hints_used integer,
  trusted_wrong_taps integer,
  trusted_wrong_answers integer,
  trusted_event_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  attempt private.learning_attempts%rowtype;
  incumbent private.learning_attempts%rowtype;
  now_at timestamptz := pg_catalog.clock_timestamp();
  derived_completion_ms bigint;
  best_changed boolean := false;
  response jsonb;
begin
  select *
    into attempt
    from private.learning_attempts a
    where a.attempt_id = requested_attempt_id
    for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ATTEMPT_NOT_FOUND';
  end if;

  if attempt.verification_status <> 'OPEN' then
    if attempt.completion_idempotency_key
       = requested_completion_idempotency_key then
      if attempt.completion_request_hash <> requested_request_hash then
        raise exception using
          errcode = 'P0001',
          message = 'IDEMPOTENCY_CONFLICT';
      end if;
      return attempt.terminal_response;
    end if;
    raise exception using errcode = 'P0001', message = 'ATTEMPT_TERMINAL';
  end if;

  if requested_request_hash is null
     or requested_request_hash !~ '^[0-9a-f]{64}$'
     or trusted_event_digest is null
     or trusted_event_digest !~ '^[0-9a-f]{64}$'
     or trusted_display_score is null
     or trusted_hints_used is null
     or trusted_wrong_taps is null
     or trusted_wrong_answers is null
     or trusted_display_score < 0
     or trusted_hints_used < 0
     or trusted_wrong_taps < 0
     or trusted_wrong_answers < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_VERIFIED_METRICS';
  end if;

  if expected_content_hash is null
     or expected_ruleset_hash is null
     or expected_hint_policy_hash is null
     or expected_competition_policy_hash is null
     or attempt.content_hash <> expected_content_hash
     or attempt.ruleset_hash <> expected_ruleset_hash
     or attempt.hint_policy_hash <> expected_hint_policy_hash
     or attempt.competition_policy_hash <> expected_competition_policy_hash then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  if attempt.expires_at <= now_at then
    response := pg_catalog.jsonb_build_object(
      'attemptId', attempt.attempt_id,
      'status', 'EXPIRED'
    );
    update private.learning_attempts
    set
      verification_status = 'EXPIRED',
      completion_idempotency_key = requested_completion_idempotency_key,
      completion_request_hash = requested_request_hash,
      terminal_response = response,
      terminal_at = now_at
    where attempt_id = attempt.attempt_id;
    return response;
  end if;

  if attempt.assets_ready_at is not null
     and attempt.assets_ready_at <= now_at then
    derived_completion_ms := pg_catalog.floor(
      extract(epoch from (now_at - attempt.assets_ready_at)) * 1000
    )::bigint;
  end if;

  if attempt.assets_ready_at is null
     or attempt.assets_ready_at > now_at
     or derived_completion_ms < 500 then
    response := pg_catalog.jsonb_build_object(
      'attemptId', attempt.attempt_id,
      'status', 'QUARANTINED',
      'completionMs', derived_completion_ms,
      'bestChanged', false
    );
    update private.learning_attempts
    set
      completed_at = now_at,
      accepted_at = now_at,
      completion_ms = derived_completion_ms,
      display_score = trusted_display_score,
      hints_used = trusted_hints_used,
      wrong_taps = trusted_wrong_taps,
      wrong_answers = trusted_wrong_answers,
      event_digest = trusted_event_digest,
      verification_status = 'QUARANTINED',
      completion_idempotency_key = requested_completion_idempotency_key,
      completion_request_hash = requested_request_hash,
      terminal_response = response,
      terminal_at = now_at
    where attempt_id = attempt.attempt_id;
    return response;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(attempt.subject_key::text, 43)
  );

  select incumbent_attempt.*
    into incumbent
    from private.learning_best_records best
    join private.learning_attempts incumbent_attempt
      on incumbent_attempt.attempt_id = best.attempt_id
    where best.subject_key = attempt.subject_key
      and best.season_id = attempt.season_id
      and best.content_revision_id = attempt.content_revision_id
    for update of best;

  if not found then
    best_changed := true;
  else
    best_changed := private.learning_rank_better_v1(
      trusted_display_score,
      trusted_hints_used,
      trusted_wrong_answers,
      trusted_wrong_taps,
      derived_completion_ms,
      now_at,
      attempt.attempt_id,
      incumbent.display_score,
      incumbent.hints_used,
      incumbent.wrong_answers,
      incumbent.wrong_taps,
      incumbent.completion_ms,
      incumbent.accepted_at,
      incumbent.attempt_id
    );
  end if;

  response := pg_catalog.jsonb_build_object(
    'attemptId', attempt.attempt_id,
    'status', 'COMPLETED_VERIFIED',
    'completionMs', derived_completion_ms,
    'acceptedAt', now_at,
    'bestChanged', best_changed
  );

  update private.learning_attempts
  set
    completed_at = now_at,
    accepted_at = now_at,
    completion_ms = derived_completion_ms,
    display_score = trusted_display_score,
    hints_used = trusted_hints_used,
    wrong_taps = trusted_wrong_taps,
    wrong_answers = trusted_wrong_answers,
    event_digest = trusted_event_digest,
    verification_status = 'COMPLETED_VERIFIED',
    completion_idempotency_key = requested_completion_idempotency_key,
    completion_request_hash = requested_request_hash,
    terminal_response = response,
    terminal_at = now_at
  where attempt_id = attempt.attempt_id;

  if best_changed and incumbent.attempt_id is null then
    insert into private.learning_best_records(
      subject_key,
      season_id,
      content_revision_id,
      attempt_id
    ) values (
      attempt.subject_key,
      attempt.season_id,
      attempt.content_revision_id,
      attempt.attempt_id
    );
  elsif best_changed then
    update private.learning_best_records
    set
      attempt_id = attempt.attempt_id,
      updated_at = now_at
    where subject_key = attempt.subject_key
      and season_id = attempt.season_id
      and content_revision_id = attempt.content_revision_id;
  end if;

  return response;
end
$$;

create function private.acquire_weekly_settlement_lease_v1(
  requested_season_id uuid,
  requested_category text,
  requested_owner_token uuid,
  expected_fence bigint,
  requested_lease_ms integer
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  settlement private.weekly_reward_settlements%rowtype;
  now_at timestamptz := pg_catalog.clock_timestamp();
  new_lease_until timestamptz;
begin
  if requested_owner_token is null
     or requested_category not in ('ENGLISH','PROVERB')
     or requested_lease_ms not between 100 and 60000 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_SETTLEMENT_LEASE';
  end if;

  select *
    into settlement
    from private.weekly_reward_settlements s
    where s.season_id = requested_season_id
      and s.category = requested_category
    for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'SETTLEMENT_NOT_FOUND';
  end if;

  if settlement.status = 'COMPLETED' then
    raise exception using
      errcode = 'P0001',
      message = 'SETTLEMENT_COMPLETED';
  end if;
  if settlement.fence <> expected_fence then
    raise exception using
      errcode = 'P0001',
      message = 'STALE_SETTLEMENT_LEASE';
  end if;

  new_lease_until :=
    now_at + (requested_lease_ms::text || ' milliseconds')::interval;

  if settlement.owner_token is null then
    update private.weekly_reward_settlements
    set
      status = 'LEASED',
      owner_token = requested_owner_token,
      fence = 1,
      lease_until = new_lease_until,
      updated_at = now_at
    where season_id = requested_season_id
      and category = requested_category;
    return 1;
  end if;

  if settlement.owner_token = requested_owner_token
     and settlement.lease_until > now_at then
    update private.weekly_reward_settlements
    set
      lease_until = new_lease_until,
      updated_at = now_at
    where season_id = requested_season_id
      and category = requested_category;
    return settlement.fence;
  end if;

  if settlement.lease_until > now_at then
    raise exception using
      errcode = 'P0001',
      message = 'SETTLEMENT_LEASE_HELD';
  end if;

  update private.weekly_reward_settlements
  set
    status = 'LEASED',
    owner_token = requested_owner_token,
    fence = settlement.fence + 1,
    lease_until = new_lease_until,
    updated_at = now_at
  where season_id = requested_season_id
    and category = requested_category;
  return settlement.fence + 1;
end
$$;

create view public.learning_leaderboard_entries
with (security_barrier = true)
as
select
  attempt.season_id,
  attempt.category,
  attempt.content_revision_id,
  pg_catalog.row_number() over (
    partition by attempt.season_id, attempt.content_revision_id
    order by
      attempt.display_score desc,
      attempt.hints_used asc,
      attempt.wrong_answers asc,
      attempt.wrong_taps asc,
      attempt.completion_ms asc,
      attempt.accepted_at asc,
      attempt.attempt_id asc
  ) as rank,
  profile.nickname,
  pet.pet_id as pet_catalog_id,
  attempt.display_score,
  attempt.completion_ms,
  attempt.hints_used,
  attempt.wrong_taps,
  attempt.wrong_answers
from private.learning_best_records best
join private.learning_attempts attempt
  on attempt.attempt_id = best.attempt_id
 and attempt.subject_key = best.subject_key
 and attempt.season_id = best.season_id
 and attempt.content_revision_id = best.content_revision_id
join private.economy_subjects subject
  on subject.subject_key = attempt.subject_key
 and subject.user_id is not null
join public.profiles profile
  on profile.id = subject.user_id
join private.pet_definitions pet
  on pet.pet_id = attempt.selected_pet_catalog_id
where attempt.verification_status = 'COMPLETED_VERIFIED';

alter table private.learning_competition_policies owner to game_security_owner;
alter table private.weekly_seasons owner to game_security_owner;
alter table private.weekly_challenge_pins owner to game_security_owner;
alter table private.learning_attempts owner to game_security_owner;
alter table private.learning_best_records owner to game_security_owner;
alter table private.weekly_reward_settlements owner to game_security_owner;
alter view public.learning_leaderboard_entries owner to game_security_owner;

alter function private.reject_learning_competition_pin_mutation_v1()
  owner to game_security_owner;
alter function private.validate_learning_attempt_transition_v1()
  owner to game_security_owner;
alter function private.learning_rank_better_v1(
  integer,
  integer,
  integer,
  integer,
  bigint,
  timestamptz,
  uuid,
  integer,
  integer,
  integer,
  integer,
  bigint,
  timestamptz,
  uuid
) owner to game_security_owner;
alter function private.validate_learning_best_record_v1()
  owner to game_security_owner;
alter function private.learning_content_eligible_v1(uuid,text)
  owner to game_security_owner;
alter function private.create_weekly_season_v1(
  uuid,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  integer,
  text,
  text,
  jsonb
) owner to game_security_owner;
alter function private.start_learning_attempt_v1(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) owner to game_security_owner;
alter function private.attest_learning_assets_ready_v1(
  uuid,
  text,
  text,
  text,
  text
) owner to game_security_owner;
alter function private.commit_learning_attempt_v1(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  text
) owner to game_security_owner;
alter function private.acquire_weekly_settlement_lease_v1(
  uuid,
  text,
  uuid,
  bigint,
  integer
) owner to game_security_owner;

alter table private.learning_competition_policies enable row level security;
alter table private.weekly_seasons enable row level security;
alter table private.weekly_challenge_pins enable row level security;
alter table private.learning_attempts enable row level security;
alter table private.learning_best_records enable row level security;
alter table private.weekly_reward_settlements enable row level security;

revoke all on
  private.learning_competition_policies,
  private.weekly_seasons,
  private.weekly_challenge_pins,
  private.learning_attempts,
  private.learning_best_records,
  private.weekly_reward_settlements
from
  public,
  anon,
  authenticated,
  service_role,
  app_server,
  deployment_role,
  economy_server,
  economy_deployment_role,
  admin_publish_role;

grant all on
  private.learning_competition_policies,
  private.weekly_seasons,
  private.weekly_challenge_pins,
  private.learning_attempts,
  private.learning_best_records,
  private.weekly_reward_settlements
to postgres;

revoke all on public.learning_leaderboard_entries
from
  public,
  service_role,
  app_server,
  deployment_role,
  economy_server,
  economy_deployment_role,
  admin_publish_role;
grant select on public.learning_leaderboard_entries to anon, authenticated;
grant select on public.learning_leaderboard_entries to postgres;

revoke execute on function
  private.reject_learning_competition_pin_mutation_v1(),
  private.validate_learning_attempt_transition_v1(),
  private.learning_rank_better_v1(
    integer,
    integer,
    integer,
    integer,
    bigint,
    timestamptz,
    uuid,
    integer,
    integer,
    integer,
    integer,
    bigint,
    timestamptz,
    uuid
  ),
  private.validate_learning_best_record_v1(),
  private.learning_content_eligible_v1(uuid,text),
  private.create_weekly_season_v1(
    uuid,
    timestamptz,
    timestamptz,
    text,
    text,
    text,
    integer,
    text,
    text,
    jsonb
  ),
  private.start_learning_attempt_v1(
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text
  ),
  private.attest_learning_assets_ready_v1(uuid,text,text,text,text),
  private.commit_learning_attempt_v1(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    integer,
    integer,
    integer,
    integer,
    text
  ),
  private.acquire_weekly_settlement_lease_v1(
    uuid,
    text,
    uuid,
    bigint,
    integer
  )
from
  public,
  anon,
  authenticated,
  service_role,
  app_server,
  deployment_role,
  economy_server,
  economy_deployment_role,
  admin_publish_role;

grant execute on function
  private.reject_learning_competition_pin_mutation_v1(),
  private.validate_learning_attempt_transition_v1(),
  private.learning_rank_better_v1(
    integer,
    integer,
    integer,
    integer,
    bigint,
    timestamptz,
    uuid,
    integer,
    integer,
    integer,
    integer,
    bigint,
    timestamptz,
    uuid
  ),
  private.validate_learning_best_record_v1(),
  private.learning_content_eligible_v1(uuid,text)
to game_security_owner, postgres;

grant execute on function private.create_weekly_season_v1(
  uuid,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  integer,
  text,
  text,
  jsonb
) to economy_deployment_role, postgres;

grant execute on function
  private.start_learning_attempt_v1(
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text
  ),
  private.attest_learning_assets_ready_v1(uuid,text,text,text,text),
  private.commit_learning_attempt_v1(
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    text,
    integer,
    integer,
    integer,
    integer,
    text
  ),
  private.acquire_weekly_settlement_lease_v1(
    uuid,
    text,
    uuid,
    bigint,
    integer
  )
to economy_server, postgres;

grant usage on schema private to economy_server, economy_deployment_role;
revoke create on schema private from game_security_owner;
revoke create on schema public from game_security_owner;
revoke game_security_owner from postgres;
