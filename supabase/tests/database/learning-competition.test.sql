begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('private', 'learning_attempts', 'ranked attempts are private');
select has_table('private', 'learning_best_records', 'best-record pointers are private');
select has_table(
  'private',
  'learning_competition_policies',
  'approved competition pins and attempt TTL are private'
);
select has_table('private', 'weekly_seasons', 'weekly seasons are private');
select has_table('private', 'weekly_challenge_pins', 'weekly challenge pins are private');
select has_table('private', 'weekly_reward_settlements', 'weekly settlement leases are private');
select has_view(
  'public',
  'learning_leaderboard_entries',
  'leaderboard exposes a public-safe projection'
);
select has_function(
  'private',
  'create_weekly_season_v1',
  array['uuid','timestamp with time zone','timestamp with time zone','text','text','text','integer','text','text','jsonb'],
  'deployment creates a fully pinned weekly season'
);
select has_function(
  'private',
  'start_learning_attempt_v1',
  array['uuid','uuid','uuid','uuid','text','text','text','text','text','text','text'],
  'operation role opens or resumes a ranked reservation'
);
select has_function(
  'private',
  'attest_learning_assets_ready_v1',
  array['uuid','text','text','text','text'],
  'operation role attests asset readiness with server time'
);
select has_function(
  'private',
  'commit_learning_attempt_v1',
  array['uuid','uuid','text','text','text','text','text','integer','integer','integer','integer','text'],
  'operation role commits trusted verified metrics'
);
select has_function(
  'private',
  'acquire_weekly_settlement_lease_v1',
  array['uuid','text','uuid','bigint','integer'],
  'settlement workers acquire a durable fenced lease'
);

select has_index(
  'private',
  'learning_attempts',
  'learning_attempts_one_open',
  'a partial unique index serializes the one OPEN reservation invariant'
);
select has_trigger(
  'private',
  'learning_attempts',
  'learning_attempts_transition_guard',
  'attempt lifecycle and terminal immutability have a database guard'
);
select has_trigger(
  'private',
  'learning_best_records',
  'learning_best_records_guard',
  'best pointers reject lower replacements'
);

select is(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'learning_leaderboard_entries'
  ),
  array[
    'season_id',
    'category',
    'content_revision_id',
    'rank',
    'nickname',
    'pet_catalog_id',
    'display_score',
    'completion_ms',
    'hints_used',
    'wrong_taps',
    'wrong_answers'
  ]::text[],
  'leaderboard exposes exactly the approved public columns'
);

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_class c
    where c.oid = any(array[
      'private.learning_competition_policies'::regclass,
      'private.weekly_seasons'::regclass,
      'private.weekly_challenge_pins'::regclass,
      'private.learning_attempts'::regclass,
      'private.learning_best_records'::regclass,
      'private.weekly_reward_settlements'::regclass
    ])
  ),
  'all private competition tables have RLS enabled with no client policies'
);

select ok(
  not has_table_privilege('anon', 'private.learning_attempts', 'INSERT')
  and not has_table_privilege('authenticated', 'private.learning_attempts', 'INSERT')
  and not has_table_privilege('service_role', 'private.learning_attempts', 'INSERT')
  and not has_table_privilege('app_server', 'private.learning_attempts', 'INSERT')
  and not has_table_privilege('economy_server', 'private.learning_attempts', 'INSERT'),
  'application and service roles cannot insert attempts directly'
);
select ok(
  not has_table_privilege('anon', 'private.learning_best_records', 'INSERT')
  and not has_table_privilege('authenticated', 'private.learning_best_records', 'INSERT')
  and not has_table_privilege('service_role', 'private.learning_best_records', 'INSERT')
  and not has_table_privilege('app_server', 'private.learning_best_records', 'INSERT')
  and not has_table_privilege('economy_server', 'private.learning_best_records', 'INSERT'),
  'application and service roles cannot insert official records directly'
);
select ok(
  not has_table_privilege('anon', 'private.weekly_reward_settlements', 'UPDATE')
  and not has_table_privilege('authenticated', 'private.weekly_reward_settlements', 'UPDATE')
  and not has_table_privilege('service_role', 'private.weekly_reward_settlements', 'UPDATE')
  and not has_table_privilege('app_server', 'private.weekly_reward_settlements', 'UPDATE')
  and not has_table_privilege('economy_server', 'private.weekly_reward_settlements', 'UPDATE'),
  'application and operation roles cannot write settlement rows directly'
);
select ok(
  not has_table_privilege('economy_server', 'private.reward_ledger', 'INSERT')
  and not has_table_privilege('service_role', 'private.reward_ledger', 'INSERT'),
  'weekly workers cannot bypass the existing reward effect function'
);

select ok(
  has_function_privilege(
    'economy_deployment_role',
    'private.create_weekly_season_v1(uuid,timestamptz,timestamptz,text,text,text,integer,text,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'economy_server',
    'private.create_weekly_season_v1(uuid,timestamptz,timestamptz,text,text,text,integer,text,text,jsonb)',
    'EXECUTE'
  ),
  'only the economy deployment role creates seasons'
);
select ok(
  has_function_privilege(
    'economy_server',
    'private.start_learning_attempt_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'economy_server',
    'private.attest_learning_assets_ready_v1(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'economy_server',
    'private.commit_learning_attempt_v1(uuid,uuid,text,text,text,text,text,integer,integer,integer,integer,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'economy_server',
    'private.acquire_weekly_settlement_lease_v1(uuid,text,uuid,bigint,integer)',
    'EXECUTE'
  ),
  'economy operation role has only function-mediated learning mutations'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.commit_learning_attempt_v1(uuid,uuid,text,text,text,text,text,integer,integer,integer,integer,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'private.commit_learning_attempt_v1(uuid,uuid,text,text,text,text,text,integer,integer,integer,integer,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'private.commit_learning_attempt_v1(uuid,uuid,text,text,text,text,text,integer,integer,integer,integer,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'app_server',
    'private.commit_learning_attempt_v1(uuid,uuid,text,text,text,text,text,integer,integer,integer,integer,text)',
    'EXECUTE'
  ),
  'clients, service_role, and general app role cannot commit attempts'
);
select ok(
  has_table_privilege('anon', 'public.learning_leaderboard_entries', 'SELECT')
  and has_table_privilege('authenticated', 'public.learning_leaderboard_entries', 'SELECT')
  and not has_table_privilege('service_role', 'public.learning_leaderboard_entries', 'SELECT')
  and not has_table_privilege('authenticated', 'public.learning_leaderboard_entries', 'INSERT'),
  'public leaderboard is read-only and unavailable to broad service credentials'
);

select ok(
  (
    select bool_and(
      p.prosecdef
      and p.proconfig = array['search_path=pg_catalog']
      and p.proowner = 'game_security_owner'::regrole
    )
    from pg_proc p
    where p.oid = any(array[
      'private.create_weekly_season_v1(uuid,timestamptz,timestamptz,text,text,text,integer,text,text,jsonb)'::regprocedure,
      'private.start_learning_attempt_v1(uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)'::regprocedure,
      'private.attest_learning_assets_ready_v1(uuid,text,text,text,text)'::regprocedure,
      'private.commit_learning_attempt_v1(uuid,uuid,text,text,text,text,text,integer,integer,integer,integer,text)'::regprocedure,
      'private.acquire_weekly_settlement_lease_v1(uuid,text,uuid,bigint,integer)'::regprocedure
    ])
  ),
  'all learning entry points are hardened game-owner security definers'
);

create function pg_temp.seed_learning_content(
  p_ordinal integer,
  p_category text
)
returns uuid
language plpgsql
as $$
declare
  v_revision_id uuid := (
    '91000000-0000-4000-8000-' || lpad(p_ordinal::text, 12, '0')
  )::uuid;
  v_content_id uuid := (
    '92000000-0000-4000-8000-' || lpad(p_ordinal::text, 12, '0')
  )::uuid;
  v_public_hash text := pg_catalog.md5('learning-public-' || p_ordinal)
    || pg_catalog.md5('learning-public-b-' || p_ordinal);
  v_private_hash text := pg_catalog.md5('learning-private-' || p_ordinal)
    || pg_catalog.md5('learning-private-b-' || p_ordinal);
  v_manifest_hash text := pg_catalog.md5('learning-rights-' || p_ordinal)
    || pg_catalog.md5('learning-rights-b-' || p_ordinal);
  v_asset_a text := pg_catalog.md5('learning-asset-a-' || p_ordinal)
    || pg_catalog.md5('learning-asset-a2-' || p_ordinal);
  v_asset_b text := pg_catalog.md5('learning-asset-b-' || p_ordinal)
    || pg_catalog.md5('learning-asset-b2-' || p_ordinal);
  v_manifest_set text := 'learning-competition-' || p_ordinal;
begin
  insert into public.game_content_revisions(
    content_revision_id,
    content_id,
    version,
    schema_version,
    asset_policy_version,
    public_content,
    public_content_hash,
    status,
    approved_at,
    rights_manifest_set_id,
    validator_version
  ) values (
    v_revision_id,
    v_content_id,
    1,
    '1.0.0',
    '1.0.0',
    pg_catalog.jsonb_build_object(
      'category', p_category,
      'imageA', pg_catalog.jsonb_build_object(
        'url', 'https://cdn.spot-learn.test/assets/' || v_asset_a || '.png',
        'sha256', v_asset_a,
        'encodedBytes', 1,
        'width', 1,
        'height', 1,
        'mimeType', 'image/png'
      ),
      'imageB', pg_catalog.jsonb_build_object(
        'url', 'https://cdn.spot-learn.test/assets/' || v_asset_b || '.png',
        'sha256', v_asset_b,
        'encodedBytes', 1,
        'width', 1,
        'height', 1,
        'mimeType', 'image/png'
      )
    ),
    v_public_hash,
    'PUBLISHED',
    pg_catalog.clock_timestamp(),
    v_manifest_set,
    '1.0.0'
  );

  insert into private.game_content_solutions(
    content_revision_id,
    private_solution,
    private_solution_hash
  ) values (
    v_revision_id,
    '{}'::jsonb,
    v_private_hash
  );

  insert into private.content_rights_manifests(
    rights_manifest_set_id,
    manifest,
    manifest_hash
  ) values (
    v_manifest_set,
    pg_catalog.jsonb_build_object(
      'entries',
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'assetSha256', v_asset_a,
          'rights', pg_catalog.jsonb_build_object('status', 'APPROVED'),
          'education', pg_catalog.jsonb_build_object(
            'status', 'APPROVED',
            'reviewedAt', '2026-07-30T00:00:00Z'
          )
        ),
        pg_catalog.jsonb_build_object(
          'assetSha256', v_asset_b,
          'rights', pg_catalog.jsonb_build_object('status', 'APPROVED'),
          'education', pg_catalog.jsonb_build_object(
            'status', 'APPROVED',
            'reviewedAt', '2026-07-30T00:00:00Z'
          )
        )
      )
    ),
    v_manifest_hash
  );

  insert into private.content_publish_attestations(
    content_revision_id,
    validator_version,
    public_content_hash,
    private_solution_hash,
    rights_manifest_hash,
    database_role,
    session_role,
    invoked_role
  ) values (
    v_revision_id,
    '1.0.0',
    v_public_hash,
    v_private_hash,
    v_manifest_hash,
    'fixture',
    'fixture',
    'fixture'
  );

  return v_revision_id;
end
$$;

grant game_security_owner to postgres;
set local role game_security_owner;
select pg_temp.seed_learning_content(i, 'ENGLISH')
from generate_series(1, 5) i;
select pg_temp.seed_learning_content(i, 'PROVERB')
from generate_series(6, 9) i;
reset role;
revoke game_security_owner from postgres;

insert into private.learning_competition_policies(
  competition_policy_hash,
  ruleset_hash,
  hint_policy_hash,
  attempt_ttl_seconds,
  enabled_categories,
  challenges_per_category
) values (
  repeat('c', 64),
  repeat('a', 64),
  repeat('b', 64),
  900,
  array['ENGLISH','PROVERB'],
  5
);

insert into private.pet_catalog_revisions(catalog_revision, catalog_hash)
values ('learning-competition-catalog-v1', repeat('d', 64));
insert into private.pet_definitions(
  pet_id,
  rarity,
  display_key,
  coach_archetype
) values (
  '93000000-0000-4000-8000-000000000001',
  'COMMON',
  'learning.pet.scout',
  'SCOUT'
);
insert into private.pet_catalog_revision_entries(
  catalog_revision,
  pet_id,
  rarity,
  ordinal
) values (
  'learning-competition-catalog-v1',
  '93000000-0000-4000-8000-000000000001',
  'COMMON',
  0
);

create temp table weekly_boundary_fixture(
  starts_at timestamptz not null,
  ends_at timestamptz not null
) on commit drop;
insert into weekly_boundary_fixture(starts_at, ends_at)
select
  date_trunc('week', pg_catalog.timezone('Asia/Seoul', pg_catalog.clock_timestamp()))
    at time zone 'Asia/Seoul',
  (
    date_trunc('week', pg_catalog.timezone('Asia/Seoul', pg_catalog.clock_timestamp()))
    + interval '7 days'
  ) at time zone 'Asia/Seoul';

create function pg_temp.insufficient_season_error()
returns jsonb
language plpgsql
as $$
declare
  v_message text;
  v_detail text;
begin
  perform private.create_weekly_season_v1(
    '94000000-0000-4000-8000-000000000001',
    (select starts_at from pg_temp.weekly_boundary_fixture),
    (select ends_at from pg_temp.weekly_boundary_fixture),
    repeat('a', 64),
    repeat('b', 64),
    repeat('c', 64),
    900,
    'learning-competition-catalog-v1',
    repeat('d', 64),
    pg_catalog.jsonb_build_object(
      'ENGLISH', pg_catalog.jsonb_build_array(
        '91000000-0000-4000-8000-000000000001',
        '91000000-0000-4000-8000-000000000002',
        '91000000-0000-4000-8000-000000000003',
        '91000000-0000-4000-8000-000000000004',
        '91000000-0000-4000-8000-000000000005'
      ),
      'PROVERB', pg_catalog.jsonb_build_array(
        '91000000-0000-4000-8000-000000000006',
        '91000000-0000-4000-8000-000000000007',
        '91000000-0000-4000-8000-000000000008',
        '91000000-0000-4000-8000-000000000009',
        '91000000-0000-4000-8000-000000000010'
      )
    )
  );
  return '{"message":"NO_ERROR"}'::jsonb;
exception
  when others then
    get stacked diagnostics
      v_message = message_text,
      v_detail = pg_exception_detail;
    return pg_catalog.jsonb_build_object(
      'message', v_message,
      'detail', v_detail
    );
end
$$;

create temp table insufficient_season_result(result jsonb) on commit drop;
insert into insufficient_season_result
select pg_temp.insufficient_season_error();

select is(
  (select result->>'message' from insufficient_season_result),
  'SEASON_CONTENT_INSUFFICIENT',
  'season creation fails closed when one enabled category has fewer than five eligible revisions'
);
select is(
  (
    select (result->>'detail')::jsonb
    from insufficient_season_result
  ),
  '{"eligibleCounts":{"ENGLISH":5,"PROVERB":4}}'::jsonb,
  'season gate reports only safe per-category eligible counts'
);
select ok(
  (select result->>'detail' from insufficient_season_result) not like '%91000000-%',
  'season gate error detail does not leak private revision identifiers'
);

grant game_security_owner to postgres;
set local role game_security_owner;
select pg_temp.seed_learning_content(10, 'PROVERB');
reset role;
revoke game_security_owner from postgres;

select throws_ok(
  $sql$
    select private.create_weekly_season_v1(
      '94000000-0000-4000-8000-000000000001',
      starts_at + interval '1 second',
      ends_at,
      repeat('a', 64),
      repeat('b', 64),
      repeat('c', 64),
      900,
      'learning-competition-catalog-v1',
      repeat('d', 64),
      '{}'::jsonb
    )
    from weekly_boundary_fixture
  $sql$,
  'P0001',
  'WEEKLY_BOUNDARY_INVALID',
  'weekly season accepts only pinned Monday KST UTC instants'
);

create temp table created_season(response jsonb) on commit drop;
insert into created_season
select private.create_weekly_season_v1(
  '94000000-0000-4000-8000-000000000001',
  (select starts_at from weekly_boundary_fixture),
  (select ends_at from weekly_boundary_fixture),
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64),
  900,
  'learning-competition-catalog-v1',
  repeat('d', 64),
  pg_catalog.jsonb_build_object(
    'ENGLISH', pg_catalog.jsonb_build_array(
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000002',
      '91000000-0000-4000-8000-000000000003',
      '91000000-0000-4000-8000-000000000004',
      '91000000-0000-4000-8000-000000000005'
    ),
    'PROVERB', pg_catalog.jsonb_build_array(
      '91000000-0000-4000-8000-000000000006',
      '91000000-0000-4000-8000-000000000007',
      '91000000-0000-4000-8000-000000000008',
      '91000000-0000-4000-8000-000000000009',
      '91000000-0000-4000-8000-000000000010'
    )
  )
);

select is(
  private.create_weekly_season_v1(
    '94000000-0000-4000-8000-000000000001',
    (select starts_at from weekly_boundary_fixture),
    (select ends_at from weekly_boundary_fixture),
    repeat('a', 64),
    repeat('b', 64),
    repeat('c', 64),
    900,
    'learning-competition-catalog-v1',
    repeat('d', 64),
    pg_catalog.jsonb_build_object(
      'ENGLISH', pg_catalog.jsonb_build_array(
        '91000000-0000-4000-8000-000000000001',
        '91000000-0000-4000-8000-000000000002',
        '91000000-0000-4000-8000-000000000003',
        '91000000-0000-4000-8000-000000000004',
        '91000000-0000-4000-8000-000000000005'
      ),
      'PROVERB', pg_catalog.jsonb_build_array(
        '91000000-0000-4000-8000-000000000006',
        '91000000-0000-4000-8000-000000000007',
        '91000000-0000-4000-8000-000000000008',
        '91000000-0000-4000-8000-000000000009',
        '91000000-0000-4000-8000-000000000010'
      )
    )
  ),
  (select response from created_season),
  'identical season creation retries replay the same response'
);
select is(
  (
    select count(*)::integer
    from private.weekly_challenge_pins
    where season_id = '94000000-0000-4000-8000-000000000001'
      and category = 'ENGLISH'
  ),
  5,
  'season pins exactly five distinct English revisions'
);
select is(
  (
    select count(*)::integer
    from private.weekly_challenge_pins
    where season_id = '94000000-0000-4000-8000-000000000001'
      and category = 'PROVERB'
  ),
  5,
  'season pins exactly five distinct proverb revisions'
);
select is(
  (
    select count(*)::integer
    from private.weekly_challenge_pins
    where season_id = '94000000-0000-4000-8000-000000000001'
      and category in ('IDIOM','GENERAL_KNOWLEDGE')
  ),
  0,
  'disabled IDIOM and GENERAL_KNOWLEDGE categories are never padded'
);
select results_eq(
  $sql$
    select starts_at, ends_at
    from private.weekly_seasons
    where season_id = '94000000-0000-4000-8000-000000000001'
  $sql$,
  $sql$
    select starts_at, ends_at
    from weekly_boundary_fixture
  $sql$,
  'season stores the KST week as exact UTC instants'
);

insert into auth.users(id, aud, role, email)
values (
  '95000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'learning-main@example.test'
);
insert into public.profiles(id, nickname)
values (
  '95000000-0000-4000-8000-000000000001',
  'learning-main'
);
insert into private.economy_subjects(subject_key, user_id)
values (
  '96000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001'
);
insert into private.pet_inventory(
  user_pet_id,
  subject_key,
  pet_id,
  rarity,
  copies,
  selected,
  acquired_catalog_revision,
  acquired_catalog_hash
) values (
  '97000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  'COMMON',
  1,
  true,
  'learning-competition-catalog-v1',
  repeat('d', 64)
);

select throws_ok(
  $sql$
    select private.start_learning_attempt_v1(
      '96000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000001',
      repeat('1', 64),
      'RANKED',
      (
        select public_content_hash
        from public.game_content_revisions
        where content_revision_id = '91000000-0000-4000-8000-000000000001'
      ),
      repeat('0', 64),
      repeat('b', 64),
      repeat('c', 64),
      repeat('d', 64)
    )
  $sql$,
  'P0001',
  'POLICY_MISMATCH',
  'attempt start fails closed when a policy pin does not match the season'
);

create temp table first_attempt_start(response jsonb) on commit drop;
insert into first_attempt_start
select private.start_learning_attempt_v1(
  '96000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001',
  repeat('1', 64),
  'RANKED',
  (
    select public_content_hash
    from public.game_content_revisions
    where content_revision_id = '91000000-0000-4000-8000-000000000001'
  ),
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64),
  repeat('d', 64)
);

select is(
  private.start_learning_attempt_v1(
    '96000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-000000000002',
    repeat('2', 64),
    'RANKED',
    (
      select public_content_hash
      from public.game_content_revisions
      where content_revision_id = '91000000-0000-4000-8000-000000000001'
    ),
    repeat('a', 64),
    repeat('b', 64),
    repeat('c', 64),
    repeat('d', 64)
  )->>'attemptId',
  (select response->>'attemptId' from first_attempt_start),
  'another start request resumes the same unexpired OPEN attempt'
);
select is(
  (
    select count(*)::integer
    from private.learning_attempts
    where subject_key = '96000000-0000-4000-8000-000000000001'
      and season_id = '94000000-0000-4000-8000-000000000001'
      and content_revision_id = '91000000-0000-4000-8000-000000000001'
      and verification_status = 'OPEN'
  ),
  1,
  'one subject has exactly one OPEN reservation for a season challenge'
);
select throws_ok(
  $sql$
    select private.start_learning_attempt_v1(
      '96000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      '98000000-0000-4000-8000-000000000001',
      repeat('9', 64),
      'RANKED',
      (
        select public_content_hash
        from public.game_content_revisions
        where content_revision_id = '91000000-0000-4000-8000-000000000001'
      ),
      repeat('a', 64),
      repeat('b', 64),
      repeat('c', 64),
      repeat('d', 64)
    )
  $sql$,
  'P0001',
  'IDEMPOTENCY_CONFLICT',
  'same start idempotency key with a different request hash conflicts'
);
select throws_like(
  $sql$
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
    )
    select
      '99000000-0000-4000-8000-000000000001',
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
      '98000000-0000-4000-8000-000000000099',
      repeat('9', 64)
    from private.learning_attempts
    where attempt_id = (
      select (response->>'attemptId')::uuid
      from first_attempt_start
    )
  $sql$,
  '%learning_attempts_one_open%',
  'the partial unique constraint closes concurrent duplicate OPEN inserts'
);

create temp table first_assets_ready(response jsonb) on commit drop;
insert into first_assets_ready
select private.attest_learning_assets_ready_v1(
  (select (response->>'attemptId')::uuid from first_attempt_start),
  (
    select public_content_hash
    from public.game_content_revisions
    where content_revision_id = '91000000-0000-4000-8000-000000000001'
  ),
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64)
);
select is(
  private.attest_learning_assets_ready_v1(
    (select (response->>'attemptId')::uuid from first_attempt_start),
    (
      select public_content_hash
      from public.game_content_revisions
      where content_revision_id = '91000000-0000-4000-8000-000000000001'
    ),
    repeat('a', 64),
    repeat('b', 64),
    repeat('c', 64)
  ),
  (select response from first_assets_ready),
  'asset readiness attestation is idempotent and keeps its first server timestamp'
);
select pg_catalog.pg_sleep(0.55);

create temp table first_attempt_completion(response jsonb) on commit drop;
insert into first_attempt_completion
select private.commit_learning_attempt_v1(
  (select (response->>'attemptId')::uuid from first_attempt_start),
  '98000000-0000-4000-8000-000000000011',
  repeat('3', 64),
  (
    select public_content_hash
    from public.game_content_revisions
    where content_revision_id = '91000000-0000-4000-8000-000000000001'
  ),
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64),
  100,
  2,
  3,
  1,
  repeat('e', 64)
);
select is(
  (select response->>'status' from first_attempt_completion),
  'COMPLETED_VERIFIED',
  'trusted server metrics commit the OPEN attempt'
);
select ok(
  (select (response->>'completionMs')::bigint >= 500 from first_attempt_completion),
  'completion time is derived from server-attested assets_ready_at'
);
select is(
  (select response->>'bestChanged' from first_attempt_completion),
  'true',
  'first verified completion installs the best pointer'
);
select is(
  private.commit_learning_attempt_v1(
    (select (response->>'attemptId')::uuid from first_attempt_start),
    '98000000-0000-4000-8000-000000000011',
    repeat('3', 64),
    (
      select public_content_hash
      from public.game_content_revisions
      where content_revision_id = '91000000-0000-4000-8000-000000000001'
    ),
    repeat('a', 64),
    repeat('b', 64),
    repeat('c', 64),
    100,
    2,
    3,
    1,
    repeat('e', 64)
  ),
  (select response from first_attempt_completion),
  'same completion retry replays the exact stored response'
);
select throws_ok(
  $sql$
    select private.commit_learning_attempt_v1(
      (select (response->>'attemptId')::uuid from first_attempt_start),
      '98000000-0000-4000-8000-000000000011',
      repeat('4', 64),
      (
        select public_content_hash
        from public.game_content_revisions
        where content_revision_id = '91000000-0000-4000-8000-000000000001'
      ),
      repeat('a', 64),
      repeat('b', 64),
      repeat('c', 64),
      100,
      2,
      3,
      1,
      repeat('e', 64)
    )
  $sql$,
  'P0001',
  'IDEMPOTENCY_CONFLICT',
  'same completion key with a different request hash conflicts'
);
select throws_ok(
  $sql$
    update private.learning_attempts
    set display_score = display_score + 1
    where attempt_id = (
      select (response->>'attemptId')::uuid
      from first_attempt_start
    )
  $sql$,
  'P0001',
  'IMMUTABLE_LEARNING_ATTEMPT',
  'completed attempts cannot be rewritten'
);
select throws_ok(
  $sql$
    delete from private.learning_attempts
    where attempt_id = (
      select (response->>'attemptId')::uuid
      from first_attempt_start
    )
  $sql$,
  'P0001',
  'IMMUTABLE_LEARNING_ATTEMPT',
  'completed attempts cannot be deleted'
);

create temp table lower_attempt_start(response jsonb) on commit drop;
insert into lower_attempt_start
select private.start_learning_attempt_v1(
  '96000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000021',
  repeat('5', 64),
  'RANKED',
  (
    select public_content_hash
    from public.game_content_revisions
    where content_revision_id = '91000000-0000-4000-8000-000000000001'
  ),
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64),
  repeat('d', 64)
);
update private.learning_attempts
set assets_ready_at = pg_catalog.clock_timestamp() - interval '1 second'
where attempt_id = (
  select (response->>'attemptId')::uuid
  from lower_attempt_start
);
create temp table lower_attempt_completion(response jsonb) on commit drop;
insert into lower_attempt_completion
select private.commit_learning_attempt_v1(
  (select (response->>'attemptId')::uuid from lower_attempt_start),
  '98000000-0000-4000-8000-000000000022',
  repeat('6', 64),
  (
    select public_content_hash
    from public.game_content_revisions
    where content_revision_id = '91000000-0000-4000-8000-000000000001'
  ),
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64),
  99,
  0,
  0,
  0,
  repeat('f', 64)
);
select is(
  (select response->>'bestChanged' from lower_attempt_completion),
  'false',
  'a lower retry remains immutable without replacing the better best'
);
select is(
  (
    select attempt_id
    from private.learning_best_records
    where subject_key = '96000000-0000-4000-8000-000000000001'
      and season_id = '94000000-0000-4000-8000-000000000001'
      and content_revision_id = '91000000-0000-4000-8000-000000000001'
  ),
  (select (response->>'attemptId')::uuid from first_attempt_start),
  'best pointer remains on the higher canonical tuple'
);
select throws_ok(
  $sql$
    update private.learning_best_records
    set
      attempt_id = (
        select (response->>'attemptId')::uuid
        from lower_attempt_start
      ),
      updated_at = pg_catalog.clock_timestamp()
    where subject_key = '96000000-0000-4000-8000-000000000001'
      and season_id = '94000000-0000-4000-8000-000000000001'
      and content_revision_id = '91000000-0000-4000-8000-000000000001'
  $sql$,
  'P0001',
  'BEST_RECORD_REGRESSION',
  'database guard rejects a lower best-pointer replacement'
);

create temp table quarantined_attempt_start(response jsonb) on commit drop;
insert into quarantined_attempt_start
select private.start_learning_attempt_v1(
  '96000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000031',
  repeat('7', 64),
  'RANKED',
  (
    select public_content_hash
    from public.game_content_revisions
    where content_revision_id = '91000000-0000-4000-8000-000000000001'
  ),
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64),
  repeat('d', 64)
);
update private.learning_attempts
set assets_ready_at = pg_catalog.clock_timestamp() + interval '1 hour'
where attempt_id = (
  select (response->>'attemptId')::uuid
  from quarantined_attempt_start
);
select is(
  private.commit_learning_attempt_v1(
    (select (response->>'attemptId')::uuid from quarantined_attempt_start),
    '98000000-0000-4000-8000-000000000032',
    repeat('8', 64),
    (
      select public_content_hash
      from public.game_content_revisions
      where content_revision_id = '91000000-0000-4000-8000-000000000001'
    ),
    repeat('a', 64),
    repeat('b', 64),
    repeat('c', 64),
    1000,
    0,
    0,
    0,
    repeat('0', 64)
  )->>'status',
  'QUARANTINED',
  'impossible server-event ordering becomes terminal QUARANTINED'
);
select is(
  (
    select count(*)::integer
    from private.learning_best_records
    where attempt_id = (
      select (response->>'attemptId')::uuid
      from quarantined_attempt_start
    )
  ),
  0,
  'quarantined attempts never publish a best record'
);

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
  '99000000-0000-4000-8000-000000000041',
  '96000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  'ENGLISH',
  '91000000-0000-4000-8000-000000000001',
  (
    select public_content_hash
    from public.game_content_revisions
    where content_revision_id = '91000000-0000-4000-8000-000000000001'
  ),
  'RANKED',
  pg_catalog.clock_timestamp() - interval '1000 seconds',
  pg_catalog.clock_timestamp() - interval '100 seconds',
  '97000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  'learning-competition-catalog-v1',
  repeat('d', 64),
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64),
  'OPEN',
  '98000000-0000-4000-8000-000000000041',
  repeat('1', 64)
);
create temp table after_expiry_start(response jsonb) on commit drop;
insert into after_expiry_start
select private.start_learning_attempt_v1(
  '96000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000042',
  repeat('2', 64),
  'RANKED',
  (
    select public_content_hash
    from public.game_content_revisions
    where content_revision_id = '91000000-0000-4000-8000-000000000001'
  ),
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64),
  repeat('d', 64)
);
select is(
  (
    select verification_status
    from private.learning_attempts
    where attempt_id = '99000000-0000-4000-8000-000000000041'
  ),
  'EXPIRED',
  'start atomically closes an expired OPEN reservation'
);
select isnt(
  (select response->>'attemptId' from after_expiry_start),
  '99000000-0000-4000-8000-000000000041',
  'a new reservation opens after the policy-pinned TTL expires'
);

select is(
  private.acquire_weekly_settlement_lease_v1(
    '94000000-0000-4000-8000-000000000001',
    'ENGLISH',
    '9a000000-0000-4000-8000-000000000001',
    0,
    1000
  ),
  1::bigint,
  'first settlement worker acquires fence 1'
);
select is(
  private.acquire_weekly_settlement_lease_v1(
    '94000000-0000-4000-8000-000000000001',
    'ENGLISH',
    '9a000000-0000-4000-8000-000000000001',
    1,
    1000
  ),
  1::bigint,
  'same settlement owner renews the current fence'
);
update private.weekly_reward_settlements
set lease_until = pg_catalog.clock_timestamp() - interval '1 second'
where season_id = '94000000-0000-4000-8000-000000000001'
  and category = 'ENGLISH';
select is(
  private.acquire_weekly_settlement_lease_v1(
    '94000000-0000-4000-8000-000000000001',
    'ENGLISH',
    '9a000000-0000-4000-8000-000000000002',
    1,
    1000
  ),
  2::bigint,
  'expired settlement lease takeover advances the durable fence'
);
select throws_ok(
  $sql$
    select private.acquire_weekly_settlement_lease_v1(
      '94000000-0000-4000-8000-000000000001',
      'ENGLISH',
      '9a000000-0000-4000-8000-000000000001',
      1,
      1000
    )
  $sql$,
  'P0001',
  'STALE_SETTLEMENT_LEASE',
  'an old settlement fence cannot reacquire or mutate the row'
);
select results_eq(
  $sql$
    select owner_token, fence
    from private.weekly_reward_settlements
    where season_id = '94000000-0000-4000-8000-000000000001'
      and category = 'ENGLISH'
  $sql$,
  $sql$
    values ('9a000000-0000-4000-8000-000000000002'::uuid, 2::bigint)
  $sql$,
  'settlement owner and fencing generation persist durably'
);

insert into auth.users(id, aud, role, email)
select
  ('95100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'learning-rank-' || i || '@example.test'
from generate_series(1, 8) i;
insert into public.profiles(id, nickname)
select
  ('95100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'rank-' || chr(96 + i)
from generate_series(1, 8) i;
insert into private.economy_subjects(subject_key, user_id)
select
  ('96100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('95100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid
from generate_series(1, 8) i;
insert into private.pet_inventory(
  user_pet_id,
  subject_key,
  pet_id,
  rarity,
  copies,
  selected,
  acquired_catalog_revision,
  acquired_catalog_hash
)
select
  ('97100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('96100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '93000000-0000-4000-8000-000000000001',
  'COMMON',
  1,
  true,
  'learning-competition-catalog-v1',
  repeat('d', 64)
from generate_series(1, 8) i;

with ranked_fixture(
  ordinal,
  attempt_id,
  display_score,
  hints_used,
  wrong_answers,
  wrong_taps,
  completion_ms,
  accepted_at
) as (
  values
    (1, 'a1000000-0000-4000-8000-000000000001'::uuid, 101, 9, 9, 9, 9000::bigint, '2026-07-01T01:00:08Z'::timestamptz),
    (2, 'a1000000-0000-4000-8000-000000000002'::uuid, 100, 0, 9, 9, 9000::bigint, '2026-07-01T01:00:07Z'::timestamptz),
    (3, 'a1000000-0000-4000-8000-000000000003'::uuid, 100, 1, 0, 9, 9000::bigint, '2026-07-01T01:00:06Z'::timestamptz),
    (4, 'a1000000-0000-4000-8000-000000000004'::uuid, 100, 1, 1, 0, 9000::bigint, '2026-07-01T01:00:05Z'::timestamptz),
    (5, 'a1000000-0000-4000-8000-000000000005'::uuid, 100, 1, 1, 1,  500::bigint, '2026-07-01T01:00:04Z'::timestamptz),
    (6, 'a1000000-0000-4000-8000-000000000006'::uuid, 100, 1, 1, 1,  600::bigint, '2026-07-01T01:00:01Z'::timestamptz),
    (7, 'a1000000-0000-4000-8000-000000000007'::uuid, 100, 1, 1, 1,  600::bigint, '2026-07-01T01:00:02Z'::timestamptz),
    (8, 'a1000000-0000-4000-8000-000000000008'::uuid, 100, 1, 1, 1,  600::bigint, '2026-07-01T01:00:02Z'::timestamptz)
)
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
  assets_ready_at,
  completed_at,
  accepted_at,
  completion_ms,
  display_score,
  hints_used,
  wrong_taps,
  wrong_answers,
  selected_user_pet_id,
  selected_pet_catalog_id,
  pet_catalog_revision,
  pet_catalog_hash,
  ruleset_hash,
  hint_policy_hash,
  competition_policy_hash,
  event_digest,
  verification_status,
  start_idempotency_key,
  start_request_hash,
  completion_idempotency_key,
  completion_request_hash,
  terminal_response,
  terminal_at
)
select
  f.attempt_id,
  ('96100000-0000-4000-8000-' || lpad(f.ordinal::text, 12, '0'))::uuid,
  '94000000-0000-4000-8000-000000000001',
  'ENGLISH',
  '91000000-0000-4000-8000-000000000002',
  (
    select public_content_hash
    from public.game_content_revisions
    where content_revision_id = '91000000-0000-4000-8000-000000000002'
  ),
  'RANKED',
  '2026-07-01T00:00:00Z',
  '2026-07-01T02:00:00Z',
  '2026-07-01T00:00:01Z',
  f.accepted_at,
  f.accepted_at,
  f.completion_ms,
  f.display_score,
  f.hints_used,
  f.wrong_taps,
  f.wrong_answers,
  ('97100000-0000-4000-8000-' || lpad(f.ordinal::text, 12, '0'))::uuid,
  '93000000-0000-4000-8000-000000000001',
  'learning-competition-catalog-v1',
  repeat('d', 64),
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64),
  pg_catalog.md5('rank-event-' || f.ordinal)
    || pg_catalog.md5('rank-event-b-' || f.ordinal),
  'COMPLETED_VERIFIED',
  ('98100000-0000-4000-8000-' || lpad(f.ordinal::text, 12, '0'))::uuid,
  pg_catalog.md5('rank-start-' || f.ordinal)
    || pg_catalog.md5('rank-start-b-' || f.ordinal),
  ('98200000-0000-4000-8000-' || lpad(f.ordinal::text, 12, '0'))::uuid,
  pg_catalog.md5('rank-complete-' || f.ordinal)
    || pg_catalog.md5('rank-complete-b-' || f.ordinal),
  pg_catalog.jsonb_build_object('status', 'COMPLETED_VERIFIED'),
  f.accepted_at
from ranked_fixture f;

insert into private.learning_best_records(
  subject_key,
  season_id,
  content_revision_id,
  attempt_id
)
select
  subject_key,
  season_id,
  content_revision_id,
  attempt_id
from private.learning_attempts
where content_revision_id = '91000000-0000-4000-8000-000000000002';

select results_eq(
  $sql$
    select nickname
    from public.learning_leaderboard_entries
    where season_id = '94000000-0000-4000-8000-000000000001'
      and content_revision_id = '91000000-0000-4000-8000-000000000002'
    order by rank
  $sql$,
  $sql$
    values
      ('rank-a'::text),
      ('rank-b'::text),
      ('rank-c'::text),
      ('rank-d'::text),
      ('rank-e'::text),
      ('rank-f'::text),
      ('rank-g'::text),
      ('rank-h'::text)
  $sql$,
  'leaderboard uses score, hints, wrong answers, wrong taps, time, accepted time, then attempt ID'
);
select results_eq(
  $sql$
    select rank, pet_catalog_id
    from public.learning_leaderboard_entries
    where season_id = '94000000-0000-4000-8000-000000000001'
      and content_revision_id = '91000000-0000-4000-8000-000000000002'
    order by rank
  $sql$,
  $sql$
    select i::bigint, '93000000-0000-4000-8000-000000000001'::uuid
    from generate_series(1, 8) i
  $sql$,
  'public projection exposes deterministic rank and pinned catalog identity only'
);

select throws_ok(
  $sql$
    update private.weekly_seasons
    set competition_policy_hash = repeat('0', 64)
    where season_id = '94000000-0000-4000-8000-000000000001'
  $sql$,
  'P0001',
  'IMMUTABLE_LEARNING_COMPETITION_PIN',
  'season policy pins are immutable'
);
select throws_ok(
  $sql$
    delete from private.weekly_challenge_pins
    where season_id = '94000000-0000-4000-8000-000000000001'
      and category = 'ENGLISH'
      and challenge_ordinal = 1
  $sql$,
  'P0001',
  'IMMUTABLE_LEARNING_COMPETITION_PIN',
  'season challenge pins are immutable'
);

select * from finish();
rollback;
