-- Align the admitted pet catalog with the durable economy identity contract.
do $$begin execute format('grant economy_security_owner to %I', current_user); end$$;

alter table private.pet_definitions
  add column coach_archetype text not null default 'CHEER';

alter table private.pet_definitions
  alter column coach_archetype drop default;

alter table private.pet_definitions
  add constraint pet_definitions_coach_archetype_valid
  check (coach_archetype in ('SCOUT', 'LINGUIST', 'SAGE', 'CHEER'));

create or replace function private.publish_economy_bundle_v1(economy jsonb,catalog jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare guard private.economy_series_guard%rowtype; entry jsonb; existing private.pet_definitions%rowtype;
begin
  -- This publisher is deliberately test-only until a product approval workflow exists.
  if economy->>'status'<>'APPROVED' or catalog->>'status'<>'APPROVED'
     or economy->>'approvalDecisionId'<>'TEST-DECISION' or catalog->>'approvalDecisionId'<>'TEST-DECISION'
     or economy->>'approvedBy'<>'test-approver' or catalog->>'approvedBy'<>'test-approver' then
    raise exception 'APPROVED_TEST_FIXTURE_REQUIRED' using errcode='22023';
  end if;
  if (select array_agg(key order by key) from jsonb_object_keys(economy) key) <>
     array['approvalDecisionId','approvedAt','approvedBy','catalogHash','catalogRevision','draw','economyHash','economyVersion','exp','fusion','pitySemantics','pitySemanticsHash','pitySeriesId','rewardPolicies','schemaVersion','simulationPolicy','status']::text[]
     or (select array_agg(key order by key) from jsonb_object_keys(catalog) key) <>
     array['approvalDecisionId','approvedAt','approvedBy','catalogArtifactHash','catalogHash','catalogRevision','entries','schemaVersion','status']::text[] then
    raise exception 'BUNDLE_SCHEMA_INVALID' using errcode='22023';
  end if;
  if economy->>'schemaVersion'<>'1' or catalog->>'schemaVersion'<>'1'
     or economy->>'catalogRevision'<>catalog->>'catalogRevision' or economy->>'catalogHash'<>catalog->>'catalogHash'
     or economy#>>'{draw,cost}'<>'100' or economy#>>'{fusion,materialCount}'<>'5'
     or economy#>>'{fusion,excludeSelected}'<>'true' or economy#>>'{fusion,excludeLocked}'<>'true'
     or economy#>>'{exp,win}'<>'100' or economy#>>'{exp,loss}'<>'60' or economy#>>'{exp,perfectWordMeaning}'<>'40'
     or economy#>>'{draw,probabilities,COMMON}'<>'0.8' or economy#>>'{draw,probabilities,RARE}'<>'0.18' or economy#>>'{draw,probabilities,LEGENDARY}'<>'0.02' then
    raise exception 'BUNDLE_PROJECTION_INVALID' using errcode='22023';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(economy->'draw') k)<>array['cost','probabilities']::text[]
     or (select array_agg(k order by k) from jsonb_object_keys(economy#>'{draw,probabilities}') k)<>array['COMMON','LEGENDARY','RARE']::text[]
     or (select array_agg(k order by k) from jsonb_object_keys(economy->'fusion') k)<>array['excludeLocked','excludeSelected','materialCount']::text[]
     or (select array_agg(k order by k) from jsonb_object_keys(economy->'exp') k)<>array['loss','perfectWordMeaning','win']::text[]
     or (select array_agg(k order by k) from jsonb_object_keys(economy->'pitySemantics') k)<>array['counterIncrementSources','counterIncrementTiming','eligibleResultSemantics','fusionAffectsPity','hardPityOverlapPrecedence','legendaryOverrideRule','legendaryResetRule','rareOverrideRule','rareResetRule','thresholds','transformAlgorithmVersion']::text[]
     or economy#>>'{pitySemantics,counterIncrementTiming}'<>'BEFORE_DRAW' or economy#>>'{pitySemantics,hardPityOverlapPrecedence}'<>'LEGENDARY'
     or (select array_agg(value#>>'{}' order by ordinality) from jsonb_array_elements(economy#>'{pitySemantics,counterIncrementSources}') with ordinality)<>'{DIRECT_DRAW}'::text[]
     or economy#>>'{pitySemantics,thresholds,rareOrBetter}'<>'50' or economy#>>'{pitySemantics,thresholds,legendary}'<>'150'
     or (select array_agg(k order by k) from jsonb_object_keys(economy#>'{pitySemantics,thresholds}') k)<>array['legendary','rareOrBetter']::text[]
     or economy#>>'{pitySemantics,transformAlgorithmVersion}'<>'simulation-policy-v0'
     or economy#>>'{pitySemantics,rareOverrideRule}'<>'COMMON_TO_RARE' or economy#>>'{pitySemantics,legendaryOverrideRule}'<>'ALWAYS_LEGENDARY'
     or economy#>>'{pitySemantics,rareResetRule}'<>'RARE_OR_BETTER' or economy#>>'{pitySemantics,legendaryResetRule}'<>'LEGENDARY_RESETS_BOTH'
     or economy#>'{pitySemantics,fusionAffectsPity}'<>'false'::jsonb or economy#>>'{pitySemantics,eligibleResultSemantics}'<>'UNIFORM_WITHIN_RARITY' then
    raise exception 'BUNDLE_NESTED_SCHEMA_INVALID' using errcode='22023';
  end if;
  if private.canonical_json_sha256_v1(economy-'economyHash')<>economy->>'economyHash'
     or private.canonical_json_sha256_v1(jsonb_build_object('schemaVersion',catalog->'schemaVersion','catalogRevision',catalog->'catalogRevision','entries',catalog->'entries'))<>catalog->>'catalogHash'
     or private.canonical_json_sha256_v1(catalog-'catalogArtifactHash')<>catalog->>'catalogArtifactHash'
     or private.canonical_json_sha256_v1(economy->'pitySemantics')<>economy->>'pitySemanticsHash' then
    raise exception 'BUNDLE_HASH_INVALID' using errcode='22023';
  end if;
  select * into guard from private.economy_series_guard where singleton for update;
  if guard.pity_semantics_hash is not null and (guard.supported_pity_series_id <> economy->>'pitySeriesId' or guard.pity_semantics_hash <> economy->>'pitySemanticsHash' or guard.pity_semantics_projection <> economy->'pitySemantics') then return jsonb_build_object('code','UNSUPPORTED_SERIES_MIGRATION'); end if;
  if jsonb_array_length(catalog->'entries') <> 50 or (select count(distinct e->>'petId') from jsonb_array_elements(catalog->'entries') e)<>50 then raise exception 'CATALOG_COUNT_INVALID' using errcode='22023'; end if;
  if (select count(distinct e->>'petId') from jsonb_array_elements(catalog->'entries') e where e->>'rarity'='COMMON')<>30 or (select count(distinct e->>'petId') from jsonb_array_elements(catalog->'entries') e where e->>'rarity'='RARE')<>15 or (select count(distinct e->>'petId') from jsonb_array_elements(catalog->'entries') e where e->>'rarity'='LEGENDARY')<>5 then raise exception 'CATALOG_GROUPING_INVALID' using errcode='22023'; end if;
  for entry in select value from jsonb_array_elements(catalog->'entries') loop
    if jsonb_typeof(entry)<>'object'
       or (select array_agg(k order by k) from jsonb_object_keys(entry) k)<>array['coachArchetype','displayKey','petId','rarity']::text[]
       or jsonb_typeof(entry->'coachArchetype')<>'string' or entry->>'coachArchetype' not in ('SCOUT','LINGUIST','SAGE','CHEER')
       or jsonb_typeof(entry->'displayKey')<>'string' or entry->>'displayKey'=''
       or jsonb_typeof(entry->'petId')<>'string' or not (entry->>'petId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       or jsonb_typeof(entry->'rarity')<>'string' or entry->>'rarity' not in ('COMMON','RARE','LEGENDARY') then
      raise exception 'CATALOG_ENTRY_INVALID' using errcode='22023';
    end if;
    select * into existing from private.pet_definitions where pet_id=(entry->>'petId')::uuid;
    if found and (existing.rarity::text<>entry->>'rarity' or existing.display_key<>entry->>'displayKey' or existing.coach_archetype<>entry->>'coachArchetype') then raise exception 'PET_IDENTITY_DRIFT' using errcode='22023'; end if;
  end loop;
  if exists(select 1 from private.pet_catalog_revisions c where c.catalog_revision=catalog->>'catalogRevision' and c.catalog_hash<>catalog->>'catalogHash') then raise exception 'CATALOG_REVISION_CONFLICT' using errcode='22023'; end if;
  insert into private.pet_catalog_revisions values(catalog->>'catalogRevision',catalog->>'catalogHash',clock_timestamp()) on conflict do nothing;
  for entry in select value from jsonb_array_elements(catalog->'entries') loop
    insert into private.pet_definitions(pet_id,rarity,display_key,coach_archetype) values((entry->>'petId')::uuid,(entry->>'rarity')::public.pet_rarity,entry->>'displayKey',entry->>'coachArchetype') on conflict do nothing;
    insert into private.pet_catalog_revision_entries(catalog_revision,pet_id,rarity,ordinal) values(catalog->>'catalogRevision',(entry->>'petId')::uuid,(entry->>'rarity')::public.pet_rarity,(select count(*) from private.pet_catalog_revision_entries where catalog_revision=catalog->>'catalogRevision' and rarity=(entry->>'rarity')::public.pet_rarity)) on conflict do nothing;
  end loop;
  insert into private.economy_policy_revisions(economy_version,economy_hash,pity_series_id,pity_semantics_hash,pity_semantics,draw_cost,reward_policies) values(economy->>'economyVersion',economy->>'economyHash',economy->>'pitySeriesId',economy->>'pitySemanticsHash',economy->'pitySemantics',(economy#>>'{draw,cost}')::int,coalesce(economy->'rewardPolicies','{}'));
  if guard.pity_semantics_hash is null then update private.economy_series_guard set pity_semantics_projection=economy->'pitySemantics',pity_semantics_hash=economy->>'pitySemanticsHash' where singleton; end if;
  return jsonb_build_object('status','APPROVED','economyVersion',economy->>'economyVersion','catalogRevision',catalog->>'catalogRevision');
end$$;

do $$begin execute format('revoke economy_security_owner from %I', current_user); end$$;
