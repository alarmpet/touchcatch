begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'private',
  'ensure_mobile_account_v1',
  array['uuid'],
  'mobile account bootstrap entry point exists'
);
select has_function(
  'private',
  'read_pet_inventory_v1',
  array['uuid','text','text'],
  'pet inventory projection entry point exists'
);
select has_function(
  'private',
  'read_weekly_category_board_v1',
  array['uuid','uuid','text','integer'],
  'weekly category board projection entry point exists'
);

select ok(
  (
    select pg_catalog.count(*) = 3
      and pg_catalog.bool_and(p.prosecdef)
      and pg_catalog.bool_and(p.proconfig = array['search_path=pg_catalog'])
      and pg_catalog.bool_and(not owner_role.rolcanlogin)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
    where n.nspname = 'private'
      and p.proname in (
        'ensure_mobile_account_v1',
        'read_pet_inventory_v1',
        'read_weekly_category_board_v1'
      )
  ),
  'mobile projection entry points are hardened non-login-owner security definers'
);

select ok(
  (
    select pg_catalog.count(*) = 3
    from information_schema.role_routine_grants grants
    where grants.routine_schema = 'private'
      and grants.grantee = 'economy_server'
      and grants.privilege_type = 'EXECUTE'
      and grants.routine_name in (
        'ensure_mobile_account_v1',
        'read_pet_inventory_v1',
        'read_weekly_category_board_v1'
      )
  ),
  'economy_server can execute exactly the three mobile projection entry points'
);

select ok(
  not exists (
    select 1
    from information_schema.role_routine_grants grants
    where grants.routine_schema = 'private'
      and grants.routine_name in (
        'ensure_mobile_account_v1',
        'read_pet_inventory_v1',
        'read_weekly_category_board_v1'
      )
      and grants.grantee in (
        'PUBLIC',
        'anon',
        'authenticated',
        'service_role',
        'app_server',
        'deployment_role',
        'economy_deployment_role',
        'admin_publish_role'
      )
  ),
  'client, service, general app, and deployment roles cannot execute mobile projections'
);

select throws_ok(
  $$select private.ensure_mobile_account_v1('81000000-0000-4000-8000-000000000099')$$,
  'P0001',
  'AUTH_USER_REQUIRED',
  'account bootstrap rejects an identifier absent from auth users'
);

insert into auth.users(id, aud, role, email) values
  ('81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'mobile-runtime-1@example.test'),
  ('81000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'mobile-runtime-2@example.test');

create temp table mobile_account_fixture(response jsonb) on commit drop;
insert into mobile_account_fixture
select private.ensure_mobile_account_v1('81000000-0000-4000-8000-000000000001');

select is(
  private.ensure_mobile_account_v1('81000000-0000-4000-8000-000000000001'),
  (select response from mobile_account_fixture),
  'account bootstrap replays the same opaque subject'
);
select is(
  (select count(*)::integer from public.profiles where id = '81000000-0000-4000-8000-000000000001'),
  1,
  'account bootstrap creates exactly one profile'
);
select is(
  (select count(*)::integer from private.economy_subjects where user_id = '81000000-0000-4000-8000-000000000001'),
  1,
  'account bootstrap creates exactly one subject mapping'
);

insert into private.pet_catalog_revisions(catalog_revision, catalog_hash)
values ('mobile-runtime-catalog-v1', repeat('a', 64));
insert into private.pet_definitions(pet_id, rarity, display_key, coach_archetype) values
  ('82000000-0000-4000-8000-000000000001', 'COMMON', 'mobile.pet.common', 'CHEER'),
  ('82000000-0000-4000-8000-000000000002', 'RARE', 'mobile.pet.rare', 'SCOUT'),
  ('82000000-0000-4000-8000-000000000003', 'LEGENDARY', 'mobile.pet.legendary', 'SAGE');
insert into private.pet_catalog_revision_entries(catalog_revision, pet_id, rarity, ordinal) values
  ('mobile-runtime-catalog-v1', '82000000-0000-4000-8000-000000000001', 'COMMON', 0),
  ('mobile-runtime-catalog-v1', '82000000-0000-4000-8000-000000000002', 'RARE', 0),
  ('mobile-runtime-catalog-v1', '82000000-0000-4000-8000-000000000003', 'LEGENDARY', 0);

insert into private.pet_inventory(
  user_pet_id,
  subject_key,
  pet_id,
  rarity,
  copies,
  selected,
  locked,
  acquired_catalog_revision,
  acquired_catalog_hash,
  level,
  xp,
  acquired_at
) values
  (
    '83000000-0000-4000-8000-000000000001',
    ((select response #>> '{}' from mobile_account_fixture))::uuid,
    '82000000-0000-4000-8000-000000000001',
    'COMMON',
    2,
    true,
    false,
    'mobile-runtime-catalog-v1',
    repeat('a', 64),
    9,
    321,
    '2026-08-01T00:00:00Z'
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    ((select response #>> '{}' from mobile_account_fixture))::uuid,
    '82000000-0000-4000-8000-000000000002',
    'RARE',
    1,
    false,
    true,
    'mobile-runtime-catalog-v1',
    repeat('a', 64),
    7,
    111,
    null
  ),
  (
    '83000000-0000-4000-8000-000000000003',
    ((select response #>> '{}' from mobile_account_fixture))::uuid,
    '82000000-0000-4000-8000-000000000003',
    'LEGENDARY',
    0,
    false,
    false,
    'mobile-runtime-catalog-v1',
    repeat('a', 64),
    1,
    0,
    '2026-08-03T00:00:00Z'
  );

create temp table mobile_pet_projection(response jsonb) on commit drop;
insert into mobile_pet_projection
select private.read_pet_inventory_v1(
  ((select response #>> '{}' from mobile_account_fixture))::uuid,
  'mobile-runtime-catalog-v1',
  repeat('a', 64)
);

select is(
  (select response->>'catalogRevision' from mobile_pet_projection),
  'mobile-runtime-catalog-v1',
  'pet projection returns the validated catalog revision pin'
);
select is(
  (select response->>'catalogHash' from mobile_pet_projection),
  repeat('a', 64),
  'pet projection returns the validated catalog hash pin'
);
select is(
  (select (response->>'ownedCount')::integer from mobile_pet_projection),
  2,
  'pet projection counts only positive-copy catalog pets'
);
select is(
  (select (response->>'totalCount')::integer from mobile_pet_projection),
  3,
  'pet projection counts every pet in the pinned catalog'
);
select is(
  (select pg_catalog.jsonb_array_length(response->'pets') from mobile_pet_projection),
  2,
  'pet projection excludes zero-copy tombstones'
);
select is(
  (select response#>>'{pets,0,userPetId}' from mobile_pet_projection),
  '83000000-0000-4000-8000-000000000001',
  'pet projection keeps stable catalog order and user-pet identity'
);
select is(
  (select response#>>'{pets,0,level}' from mobile_pet_projection),
  '1',
  'pet projection remains level one until progression policy approval'
);
select is(
  (select response#>>'{pets,0,xp}' from mobile_pet_projection),
  '0',
  'pet projection remains zero XP until progression policy approval'
);
select is(
  (select response#>>'{pets,0,selected}' from mobile_pet_projection),
  'true',
  'pet projection restores selected state'
);
select is(
  (select response#>>'{pets,1,locked}' from mobile_pet_projection),
  'true',
  'pet projection restores locked state'
);
select is(
  (select response#>>'{pets,0,acquisitionDateStatus}' from mobile_pet_projection),
  'KNOWN',
  'pet projection identifies a known acquisition date'
);
select is(
  (select response#>>'{pets,1,acquisitionDateStatus}' from mobile_pet_projection),
  'UNAVAILABLE_LEGACY',
  'pet projection preserves an unavailable legacy acquisition date'
);
select is(
  (select response#>>'{pets,1,acquiredAt}' from mobile_pet_projection),
  null,
  'pet projection returns null for an unavailable legacy acquisition date'
);
select is(
  (select response#>>'{rarityProgress,COMMON,ownedCount}' from mobile_pet_projection),
  '1',
  'pet projection reports common ownership progress'
);
select is(
  (select response#>>'{rarityProgress,LEGENDARY,ownedCount}' from mobile_pet_projection),
  '0',
  'pet projection does not count legendary tombstones as owned'
);

create temp table mobile_projection_write_count(count bigint) on commit drop;
insert into mobile_projection_write_count
select count(*) from private.pet_inventory;
select throws_ok(
  $$select private.read_pet_inventory_v1(
    ((select response #>> '{}' from mobile_account_fixture))::uuid,
    'mobile-runtime-catalog-v1',
    repeat('b', 64)
  )$$,
  'P0001',
  'POLICY_MISMATCH',
  'pet projection rejects a wrong catalog hash'
);
select is(
  (select count(*) from private.pet_inventory),
  (select count from mobile_projection_write_count),
  'rejected pet projection performs zero inventory writes'
);

insert into auth.users(id, aud, role, email) values
  ('81000000-0000-4000-8000-000000000011', 'authenticated', 'authenticated', 'mobile-rank-a@example.test'),
  ('81000000-0000-4000-8000-000000000012', 'authenticated', 'authenticated', 'mobile-rank-b@example.test'),
  ('81000000-0000-4000-8000-000000000013', 'authenticated', 'authenticated', 'mobile-rank-c@example.test');

create temp table mobile_rank_subjects(
  label text primary key,
  subject_key uuid not null
) on commit drop;
insert into mobile_rank_subjects(label, subject_key) values
  ('rank-a', (private.ensure_mobile_account_v1('81000000-0000-4000-8000-000000000011') #>> '{}')::uuid),
  ('rank-b', (private.ensure_mobile_account_v1('81000000-0000-4000-8000-000000000012') #>> '{}')::uuid),
  ('rank-c', (private.ensure_mobile_account_v1('81000000-0000-4000-8000-000000000013') #>> '{}')::uuid);
update public.profiles profiles
set nickname = subjects.label
from mobile_rank_subjects subjects
join private.economy_subjects economy
  on economy.subject_key = subjects.subject_key
where profiles.id = economy.user_id;

grant game_security_owner to postgres;
set local role game_security_owner;
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
)
select
  ('84000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  ('84100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  1,
  '1.0.0',
  '1.0.0',
  pg_catalog.jsonb_build_object('fixture', i),
  pg_catalog.md5('mobile-rank-content-' || i)
    || pg_catalog.md5('mobile-rank-content-b-' || i),
  'PUBLISHED',
  '2026-08-10T00:00:00Z',
  'mobile-rank-' || i,
  '1.0.0'
from pg_catalog.generate_series(1, 5) i;
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
  repeat('f', 64),
  repeat('d', 64),
  repeat('e', 64),
  900,
  array['ENGLISH','PROVERB'],
  5
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
  '86000000-0000-4000-8000-000000000001',
  '2026-08-10T15:00:00Z',
  '2026-08-17T15:00:00Z',
  repeat('d', 64),
  repeat('e', 64),
  repeat('f', 64),
  900,
  array['ENGLISH','PROVERB'],
  5,
  'mobile-runtime-catalog-v1',
  repeat('a', 64),
  '{}'::jsonb
);
insert into private.weekly_challenge_pins(
  season_id,
  category,
  challenge_ordinal,
  content_revision_id,
  content_hash
)
select
  '86000000-0000-4000-8000-000000000001',
  'ENGLISH',
  i,
  ('84000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  pg_catalog.md5('mobile-rank-content-' || i)
    || pg_catalog.md5('mobile-rank-content-b-' || i)
from pg_catalog.generate_series(1, 5) i;

create function pg_temp.seed_mobile_rank_attempt(
  p_subject_key uuid,
  p_attempt_number integer,
  p_challenge_ordinal integer,
  p_score integer,
  p_hints integer,
  p_status text,
  p_make_best boolean,
  p_accepted_at timestamptz
)
returns void
language plpgsql
as $$
declare
  v_attempt_id uuid := pg_catalog.md5(
    p_subject_key::text || ':attempt:' || p_attempt_number
  )::uuid;
  v_content_revision_id uuid := (
    '84000000-0000-4000-8000-' || lpad(p_challenge_ordinal::text, 12, '0')
  )::uuid;
  v_content_hash text := pg_catalog.md5('mobile-rank-content-' || p_challenge_ordinal)
    || pg_catalog.md5('mobile-rank-content-b-' || p_challenge_ordinal);
begin
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
  ) values (
    v_attempt_id,
    p_subject_key,
    '86000000-0000-4000-8000-000000000001',
    'ENGLISH',
    v_content_revision_id,
    v_content_hash,
    'RANKED',
    '2026-08-11T00:00:00Z',
    '2026-08-11T01:00:00Z',
    '2026-08-11T00:00:01Z',
    p_accepted_at,
    p_accepted_at,
    1000 + p_attempt_number,
    p_score,
    p_hints,
    0,
    0,
    '83000000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    'mobile-runtime-catalog-v1',
    repeat('a', 64),
    repeat('d', 64),
    repeat('e', 64),
    repeat('f', 64),
    pg_catalog.md5(v_attempt_id::text || ':event')
      || pg_catalog.md5(v_attempt_id::text || ':event-b'),
    p_status,
    pg_catalog.md5(v_attempt_id::text || ':start')::uuid,
    pg_catalog.md5(v_attempt_id::text || ':start-hash')
      || pg_catalog.md5(v_attempt_id::text || ':start-hash-b'),
    pg_catalog.md5(v_attempt_id::text || ':complete')::uuid,
    pg_catalog.md5(v_attempt_id::text || ':complete-hash')
      || pg_catalog.md5(v_attempt_id::text || ':complete-hash-b'),
    pg_catalog.jsonb_build_object('status', p_status),
    p_accepted_at
  );

  if p_make_best then
    insert into private.learning_best_records(
      subject_key,
      season_id,
      content_revision_id,
      attempt_id
    ) values (
      p_subject_key,
      '86000000-0000-4000-8000-000000000001',
      v_content_revision_id,
      v_attempt_id
    );
  end if;
end
$$;

select pg_temp.seed_mobile_rank_attempt(
  (select subject_key from mobile_rank_subjects where label = 'rank-a'),
  i,
  i,
  100,
  1,
  'COMPLETED_VERIFIED',
  true,
  '2026-08-11T00:10:00Z'::timestamptz + i * interval '1 second'
)
from pg_catalog.generate_series(1, 5) i;
select pg_temp.seed_mobile_rank_attempt(
  (select subject_key from mobile_rank_subjects where label = 'rank-b'),
  10 + i,
  i,
  120,
  0,
  'COMPLETED_VERIFIED',
  true,
  '2026-08-11T00:20:00Z'::timestamptz + i * interval '1 second'
)
from pg_catalog.generate_series(1, 4) i;
select pg_temp.seed_mobile_rank_attempt(
  (select subject_key from mobile_rank_subjects where label = 'rank-c'),
  21,
  1,
  500,
  0,
  'COMPLETED_VERIFIED',
  true,
  '2026-08-11T00:30:00Z'
);

-- These larger scores must never affect the board because they are not the
-- verified best pointer: one is an unpointed replay and one is quarantined.
select pg_temp.seed_mobile_rank_attempt(
  (select subject_key from mobile_rank_subjects where label = 'rank-b'),
  31,
  5,
  9999,
  0,
  'COMPLETED_VERIFIED',
  false,
  '2026-08-11T00:40:00Z'
);
select pg_temp.seed_mobile_rank_attempt(
  (select subject_key from mobile_rank_subjects where label = 'rank-b'),
  32,
  5,
  9999,
  0,
  'QUARANTINED',
  false,
  '2026-08-11T00:41:00Z'
);

insert into private.economy_subjects(subject_key, user_id)
values ('87000000-0000-4000-8000-000000000001', null);
select pg_temp.seed_mobile_rank_attempt(
  '87000000-0000-4000-8000-000000000001',
  41,
  1,
  9999,
  0,
  'COMPLETED_VERIFIED',
  true,
  '2026-08-11T00:50:00Z'
);

create temp table mobile_weekly_projection(response jsonb) on commit drop;
insert into mobile_weekly_projection
select private.read_weekly_category_board_v1(
  (select subject_key from mobile_rank_subjects where label = 'rank-b'),
  '86000000-0000-4000-8000-000000000001',
  'ENGLISH',
  2
);

select is(
  (select response->>'seasonId' from mobile_weekly_projection),
  '86000000-0000-4000-8000-000000000001',
  'weekly board returns the requested approved season'
);
select is(
  (select response->>'category' from mobile_weekly_projection),
  'ENGLISH',
  'weekly board returns the requested category'
);
select ok(
  (select pg_catalog.length(response->>'snapshotRevision') > 0 from mobile_weekly_projection),
  'weekly board returns a non-empty snapshot revision'
);
select is(
  (select pg_catalog.jsonb_array_length(response->'rows') from mobile_weekly_projection),
  2,
  'weekly board enforces the requested top-row limit'
);
select is(
  (select response#>>'{rows,0,nickname}' from mobile_weekly_projection),
  'rank-c',
  'weekly board sums the five pinned challenges and applies hint tie-breaks'
);
select is(
  (select response#>>'{rows,0,displayScore}' from mobile_weekly_projection),
  '500',
  'weekly board exposes only the aggregate display score'
);
select is(
  (select response#>>'{rows,1,nickname}' from mobile_weekly_projection),
  'rank-a',
  'weekly board keeps stable aggregate ordering after the tie-break'
);
select is(
  (select response#>>'{myRank,rank}' from mobile_weekly_projection),
  '3',
  'weekly board returns the caller rank outside the public row limit'
);
select is(
  (select response#>>'{myRank,totalCompetitors}' from mobile_weekly_projection),
  '3',
  'weekly board excludes unlinked subjects from competitor counts'
);
select is(
  (select response#>>'{myRank,displayScore}' from mobile_weekly_projection),
  '480',
  'weekly board ignores unpointed and quarantined replay scores'
);
select is(
  (select response#>>'{myRank,percentile}' from mobile_weekly_projection),
  '0.00',
  'weekly board reports deterministic bottom percentile'
);
select ok(
  not ((select response#>'{rows,0}' from mobile_weekly_projection) ? 'subjectKey')
    and not ((select response#>'{rows,0}' from mobile_weekly_projection) ? 'userId')
    and not ((select response#>'{rows,0}' from mobile_weekly_projection) ? 'email'),
  'weekly board exposes no subject, auth-user, or email identifiers'
);

create temp table mobile_ranking_write_count(count bigint) on commit drop;
insert into mobile_ranking_write_count
select (select count(*) from private.learning_attempts)
  + (select count(*) from private.learning_best_records);
select throws_ok(
  $$select private.read_weekly_category_board_v1(
    (select subject_key from mobile_rank_subjects where label = 'rank-b'),
    '86000000-0000-4000-8000-000000000099',
    'ENGLISH',
    2
  )$$,
  'P0001',
  'RANKING_POLICY_NOT_APPROVED',
  'weekly board fails closed for an unknown or unapproved season'
);
select throws_ok(
  $$select private.read_weekly_category_board_v1(
    (select subject_key from mobile_rank_subjects where label = 'rank-b'),
    '86000000-0000-4000-8000-000000000001',
    'SPLIT_DIFFERENCE',
    2
  )$$,
  'P0001',
  'INVALID_CATEGORY',
  'weekly board rejects categories outside the approved contract'
);
select throws_ok(
  $$select private.read_weekly_category_board_v1(
    (select subject_key from mobile_rank_subjects where label = 'rank-b'),
    '86000000-0000-4000-8000-000000000001',
    'ENGLISH',
    11
  )$$,
  'P0001',
  'INVALID_LIMIT',
  'weekly board caps public output at ten rows'
);
select is(
  (select (select count(*) from private.learning_attempts)
    + (select count(*) from private.learning_best_records)),
  (select count from mobile_ranking_write_count),
  'rejected weekly reads perform zero attempt or best-record writes'
);

delete from auth.users where id = '81000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select private.read_pet_inventory_v1(
    ((select response #>> '{}' from mobile_account_fixture))::uuid,
    'mobile-runtime-catalog-v1',
    repeat('a', 64)
  )$$,
  'P0001',
  'AUTH_SUBJECT_REQUIRED',
  'pet projection rejects a deleted or unlinked subject'
);

select * from finish();
rollback;
