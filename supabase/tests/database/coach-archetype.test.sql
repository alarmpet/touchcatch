begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.task0c_canonical_json(value jsonb) returns text
language sql
immutable
set search_path=pg_catalog
as $$
  select case jsonb_typeof(value)
    when 'object' then
      '{' || coalesce(
        (
          select string_agg(
            to_jsonb(key)::text || ':' || pg_temp.task0c_canonical_json(value->key),
            ','
            order by key
          )
          from jsonb_object_keys(value) key
        ),
        ''
      ) || '}'
    when 'array' then
      '[' || coalesce(
        (
          select string_agg(
            pg_temp.task0c_canonical_json(element),
            ','
            order by ordinal
          )
          from jsonb_array_elements(value) with ordinality a(element, ordinal)
        ),
        ''
      ) || ']'
    else value::text
  end
$$;

create function pg_temp.task0c_canonical_sha256(value jsonb) returns text
language sql
immutable
set search_path=pg_catalog
as $$
  select encode(
    extensions.digest(
      convert_to(pg_temp.task0c_canonical_json(value), 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$$;

create function pg_temp.task0c_catalog(
  p_catalog_revision text,
  p_override_ordinal integer default null,
  p_override_archetype jsonb default null
) returns jsonb
language sql
set search_path=pg_catalog
as $$
  with catalog_entries as (
    select jsonb_agg(
      jsonb_build_object(
        'coachArchetype',
          case
            when ordinal = p_override_ordinal then p_override_archetype
            else to_jsonb(
              (array['SCOUT','LINGUIST','SAGE','CHEER']::text[])[1 + ((ordinal - 1) % 4)]
            )
          end,
        'displayKey', format('pet.task0c.%s', ordinal),
        'petId', format(
          '00000000-0000-4000-8000-%s',
          lpad((1000 + ordinal)::text, 12, '0')
        ),
        'rarity',
          case
            when ordinal <= 30 then 'COMMON'
            when ordinal <= 45 then 'RARE'
            else 'LEGENDARY'
          end
      )
      order by ordinal
    ) as entries
    from generate_series(1, 50) ordinal
  ),
  catalog_core as (
    select jsonb_build_object(
      'schemaVersion', 1,
      'catalogRevision', p_catalog_revision,
      'entries', entries
    ) as document
    from catalog_entries
  ),
  approved_catalog as (
    select document || jsonb_build_object(
      'catalogHash', pg_temp.task0c_canonical_sha256(document),
      'status', 'APPROVED',
      'approvalDecisionId', 'TEST-DECISION',
      'approvedBy', 'test-approver',
      'approvedAt', '2026-07-30T00:00:00.000Z'
    ) as document
    from catalog_core
  )
  select document || jsonb_build_object(
    'catalogArtifactHash', pg_temp.task0c_canonical_sha256(document)
  )
  from approved_catalog
$$;

create function pg_temp.task0c_economy(
  p_economy_version text,
  p_catalog jsonb
) returns jsonb
language sql
set search_path=pg_catalog
as $$
  with pity_semantics as (
    select jsonb_build_object(
      'counterIncrementSources', jsonb_build_array('DIRECT_DRAW'),
      'counterIncrementTiming', 'BEFORE_DRAW',
      'eligibleResultSemantics', 'UNIFORM_WITHIN_RARITY',
      'fusionAffectsPity', false,
      'hardPityOverlapPrecedence', 'LEGENDARY',
      'legendaryOverrideRule', 'ALWAYS_LEGENDARY',
      'legendaryResetRule', 'LEGENDARY_RESETS_BOTH',
      'rareOverrideRule', 'COMMON_TO_RARE',
      'rareResetRule', 'RARE_OR_BETTER',
      'thresholds', jsonb_build_object(
        'rareOrBetter', 50,
        'legendary', 150
      ),
      'transformAlgorithmVersion', 'simulation-policy-v0'
    ) as document
  ),
  approved_economy as (
    select jsonb_build_object(
      'schemaVersion', 1,
      'economyVersion', p_economy_version,
      'catalogRevision', p_catalog->>'catalogRevision',
      'catalogHash', p_catalog->>'catalogHash',
      'draw', jsonb_build_object(
        'cost', 100,
        'probabilities', jsonb_build_object(
          'COMMON', 0.6,
          'UNCOMMON', 0.25,
          'RARE', 0.1,
          'EPIC', 0.04,
          'LEGENDARY', 0.01
        )
      ),
      'fusion', jsonb_build_object(
        'materialCount', 5,
        'excludeSelected', true,
        'excludeLocked', true
      ),
      'exp', jsonb_build_object(
        'win', 100,
        'loss', 60,
        'perfectWordMeaning', 40
      ),
      'pitySeriesId', 'pity-50-150-v1',
      'pitySemanticsHash', pg_temp.task0c_canonical_sha256(document),
      'pitySemantics', document,
      'rewardPolicies', jsonb_build_object('MATCH_GACHA_POINTS', 1),
      'simulationPolicy', jsonb_build_object(),
      'status', 'APPROVED',
      'approvalDecisionId', 'TEST-DECISION',
      'approvedBy', 'test-approver',
      'approvedAt', '2026-07-30T00:00:00.000Z'
    ) as document
    from pity_semantics
  )
  select document || jsonb_build_object(
    'economyHash', pg_temp.task0c_canonical_sha256(document)
  )
  from approved_economy
$$;

select has_column(
  'private',
  'pet_definitions',
  'coach_archetype',
  'pet definitions durably store the coach archetype'
);

select is(
  (
    select column_default::text
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'pet_definitions'
      and column_name = 'coach_archetype'
  ),
  null::text,
  'durable coach archetype storage has no admission fallback default'
);

select is(
  (
    select c.relowner::regrole::text
    from pg_class c
    where c.oid = 'private.pet_definitions'::regclass
  ),
  'economy_security_owner',
  'adding coach storage preserves the pet definitions owner'
);

create temp table task0c_valid_bundle on commit drop as
select
  catalog,
  pg_temp.task0c_economy('task0c-economy-v1', catalog) as economy
from (select pg_temp.task0c_catalog('task0c-catalog-v1') as catalog) fixture;

select lives_ok(
  $$
    select private.publish_economy_bundle_v1(economy, catalog)
    from task0c_valid_bundle
  $$,
  'a valid admitted catalog publishes with explicit coach archetypes'
);

select is(
  (
    select count(*)::integer
    from private.pet_definitions p
    where p.display_key like 'pet.task0c.%'
      and to_jsonb(p)->>'coach_archetype' is not null
  ),
  50,
  'valid publication stores every explicit coach archetype'
);

select is(
  (
    select array_agg(distinct to_jsonb(p)->>'coach_archetype' order by to_jsonb(p)->>'coach_archetype')
    from private.pet_definitions p
    where p.display_key like 'pet.task0c.%'
  ),
  array['CHEER','LINGUIST','SAGE','SCOUT']::text[],
  'publication stores the exact four admitted coach archetypes'
);

select is(
  (
    select count(*)::integer
    from task0c_valid_bundle bundle
    cross join lateral jsonb_array_elements(bundle.catalog->'entries') entry
    left join private.pet_definitions pet
      on pet.pet_id = (entry->>'petId')::uuid
    where pet.coach_archetype is distinct from entry->>'coachArchetype'
  ),
  0,
  'each published petId stores its own explicit catalog archetype'
);

select throws_ok(
  $$
    insert into private.pet_definitions(pet_id, rarity, display_key)
    values (
      '00000000-0000-4000-8000-000000009999',
      'COMMON',
      'pet.task0c.missing-archetype'
    )
  $$,
  '23502',
  null,
  'future durable inserts require an explicit coach archetype'
);

insert into private.pet_definitions(pet_id, rarity, display_key, coach_archetype)
values (
  '00000000-0000-4000-8000-000000009997',
  'COMMON',
  'pet.task0c.explicit',
  'CHEER'
);

select throws_ok(
  $$
    insert into private.pet_definitions(
      pet_id,
      rarity,
      display_key,
      coach_archetype
    )
    values (
      '00000000-0000-4000-8000-000000009998',
      'COMMON',
      'pet.task0c.invalid-storage',
      'TUTOR'
    )
  $$,
  '23514',
  null,
  'coach storage rejects values outside the exact admitted set'
);

select throws_ok(
  $$
    update private.pet_definitions
    set coach_archetype = 'SCOUT'
    where pet_id = '00000000-0000-4000-8000-000000009997'
  $$,
  'P0001',
  'IMMUTABLE_ECONOMY_REVISION',
  'coach archetype storage remains immutable'
);

create temp table task0c_before_rejections on commit drop as
select jsonb_build_object(
  'policies', (select count(*) from private.economy_policy_revisions),
  'catalogs', (select count(*) from private.pet_catalog_revisions),
  'entries', (select count(*) from private.pet_catalog_revision_entries),
  'pets', (select count(*) from private.pet_definitions)
)::text as counts;

create temp table task0c_invalid_bundles on commit drop as
select
  invalid_kind,
  catalog,
  pg_temp.task0c_economy('task0c-invalid-' || invalid_kind, catalog) as economy
from (
  values
    (
      'value',
      pg_temp.task0c_catalog(
        'task0c-invalid-value',
        1,
        '"TUTOR"'::jsonb
      )
    ),
    (
      'type',
      pg_temp.task0c_catalog(
        'task0c-invalid-type',
        1,
        '7'::jsonb
      )
    )
) invalid(invalid_kind, catalog);

select throws_ok(
  $$
    select private.publish_economy_bundle_v1(economy, catalog)
    from task0c_invalid_bundles
    where invalid_kind = 'value'
  $$,
  '22023',
  'CATALOG_ENTRY_INVALID',
  'publisher rejects an unknown coach archetype'
);

select throws_ok(
  $$
    select private.publish_economy_bundle_v1(economy, catalog)
    from task0c_invalid_bundles
    where invalid_kind = 'type'
  $$,
  '22023',
  'CATALOG_ENTRY_INVALID',
  'publisher rejects a non-string coach archetype'
);

select is(
  jsonb_build_object(
    'policies', (select count(*) from private.economy_policy_revisions),
    'catalogs', (select count(*) from private.pet_catalog_revisions),
    'entries', (select count(*) from private.pet_catalog_revision_entries),
    'pets', (select count(*) from private.pet_definitions)
  )::text,
  (select counts from task0c_before_rejections),
  'invalid coach archetypes write zero economy or catalog rows'
);

create temp table task0c_drift_bundle on commit drop as
select
  catalog,
  pg_temp.task0c_economy('task0c-economy-v2', catalog) as economy
from (
  select pg_temp.task0c_catalog(
    'task0c-catalog-v2',
    1,
    '"CHEER"'::jsonb
  ) as catalog
) fixture;

select throws_ok(
  $$
    select private.publish_economy_bundle_v1(economy, catalog)
    from task0c_drift_bundle
  $$,
  '22023',
  'PET_IDENTITY_DRIFT',
  'republishing an existing petId with a changed coach archetype is identity drift'
);

select is(
  jsonb_build_object(
    'policies', (select count(*) from private.economy_policy_revisions),
    'catalogs', (select count(*) from private.pet_catalog_revisions),
    'entries', (select count(*) from private.pet_catalog_revision_entries),
    'pets', (select count(*) from private.pet_definitions)
  )::text,
  (select counts from task0c_before_rejections),
  'coach archetype identity drift writes zero rows'
);

select ok(
  (
    select p.prosecdef
      and p.proconfig = array['search_path=pg_catalog']::text[]
      and p.proowner::regrole::text = 'economy_security_owner'
    from pg_proc p
    where p.oid = 'private.publish_economy_bundle_v1(jsonb,jsonb)'::regprocedure
  ),
  'publisher preserves security definer, fixed search path, and owner'
);

select is(
  (
    select array_agg(role_name order by role_name)
    from (
      select coalesce(roles.rolname::text, 'PUBLIC') as role_name
      from pg_proc function
      cross join lateral aclexplode(
        coalesce(function.proacl, acldefault('f', function.proowner))
      ) grant_entry
      left join pg_roles roles on roles.oid = grant_entry.grantee
      where function.oid =
        'private.publish_economy_bundle_v1(jsonb,jsonb)'::regprocedure
        and grant_entry.privilege_type = 'EXECUTE'
    ) publisher_execute_roles
  ),
  array['economy_deployment_role','economy_security_owner']::text[],
  'publisher EXECUTE ACL contains exactly its owner and economy deployment role'
);

select * from finish();
rollback;
