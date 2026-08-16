-- Five-tier pet rarity: draw distribution, promotion chain, and empty-tier resolution.
--
-- Admitted draw distribution (config/economy.v1.json, config/daily-pet-loop.v1.json):
--   COMMON 60% · UNCOMMON 25% · RARE 10% · EPIC 4% · LEGENDARY 1%
-- Promotion chain (10 spare copies): COMMON→UNCOMMON→RARE→EPIC→LEGENDARY.
--
-- UNCOMMON and EPIC are admitted tiers with no admitted art yet. Rather than
-- letting a roll resolve to an empty pool, resolution is explicit and total:
--   * draws step DOWN the ladder to the nearest populated tier
--   * promotions step UP the ladder to the nearest populated tier
-- Once art is admitted into those tiers the resolvers become no-ops.

do $$begin execute format('grant economy_security_owner to %I', current_user); end$$;

create or replace function private.resolve_drawable_rarity_v1(p_catalog_revision text, p_rarity public.pet_rarity)
returns public.pet_rarity
language plpgsql stable set search_path = pg_catalog as $$
declare
  v_ladder public.pet_rarity[] := array['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY']::public.pet_rarity[];
  v_index integer := array_position(v_ladder, p_rarity);
  v_candidate public.pet_rarity;
begin
  if v_index is null then raise exception 'UNKNOWN_PET_RARITY' using errcode = '22023'; end if;
  while v_index >= 1 loop
    v_candidate := v_ladder[v_index];
    if exists (
      select 1 from private.pet_catalog_revision_entries e
      where e.catalog_revision = p_catalog_revision and e.rarity = v_candidate
    ) then return v_candidate; end if;
    v_index := v_index - 1;
  end loop;
  return null;
end$$;

create or replace function private.resolve_promotion_rarity_v1(p_catalog_revision text, p_rarity public.pet_rarity)
returns public.pet_rarity
language plpgsql stable set search_path = pg_catalog as $$
declare
  v_ladder public.pet_rarity[] := array['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY']::public.pet_rarity[];
  v_index integer := array_position(v_ladder, p_rarity);
  v_candidate public.pet_rarity;
begin
  if v_index is null then raise exception 'UNKNOWN_PET_RARITY' using errcode = '22023'; end if;
  v_index := v_index + 1;
  while v_index <= array_length(v_ladder, 1) loop
    v_candidate := v_ladder[v_index];
    if exists (
      select 1 from private.pet_catalog_revision_entries e
      where e.catalog_revision = p_catalog_revision and e.rarity = v_candidate
    ) then return v_candidate; end if;
    v_index := v_index + 1;
  end loop;
  return null;
end$$;

-- Promotion output may now land on any tier above COMMON.
alter table private.duplicate_promotion_entitlements
  drop constraint if exists duplicate_promotion_entitlements_target_rarity_check;
alter table private.duplicate_promotion_entitlements
  add constraint duplicate_promotion_entitlements_target_rarity_check
  check (target_rarity in ('UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'));

alter table private.duplicate_promotion_history
  drop constraint if exists duplicate_promotion_history_output_rarity_check;
alter table private.duplicate_promotion_history
  add constraint duplicate_promotion_history_output_rarity_check
  check (output_rarity in ('UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'));

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
     or economy#>>'{draw,probabilities,COMMON}'<>'0.6' or economy#>>'{draw,probabilities,UNCOMMON}'<>'0.25'
     or economy#>>'{draw,probabilities,RARE}'<>'0.1' or economy#>>'{draw,probabilities,EPIC}'<>'0.04'
     or economy#>>'{draw,probabilities,LEGENDARY}'<>'0.01' then
    raise exception 'BUNDLE_PROJECTION_INVALID' using errcode='22023';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(economy->'draw') k)<>array['cost','probabilities']::text[]
     or (select array_agg(k order by k) from jsonb_object_keys(economy#>'{draw,probabilities}') k)<>array['COMMON','EPIC','LEGENDARY','RARE','UNCOMMON']::text[]
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
  -- UNCOMMON and EPIC are admitted tiers awaiting art; both must stay empty until a new grouping is approved.
  if (select count(distinct e->>'petId') from jsonb_array_elements(catalog->'entries') e where e->>'rarity'='COMMON')<>30
     or (select count(distinct e->>'petId') from jsonb_array_elements(catalog->'entries') e where e->>'rarity'='UNCOMMON')<>0
     or (select count(distinct e->>'petId') from jsonb_array_elements(catalog->'entries') e where e->>'rarity'='RARE')<>15
     or (select count(distinct e->>'petId') from jsonb_array_elements(catalog->'entries') e where e->>'rarity'='EPIC')<>0
     or (select count(distinct e->>'petId') from jsonb_array_elements(catalog->'entries') e where e->>'rarity'='LEGENDARY')<>5 then
    raise exception 'CATALOG_GROUPING_INVALID' using errcode='22023';
  end if;
  for entry in select value from jsonb_array_elements(catalog->'entries') loop
    if jsonb_typeof(entry)<>'object'
       or (select array_agg(k order by k) from jsonb_object_keys(entry) k)<>array['coachArchetype','displayKey','petId','rarity']::text[]
       or jsonb_typeof(entry->'coachArchetype')<>'string' or entry->>'coachArchetype' not in ('SCOUT','LINGUIST','SAGE','CHEER')
       or jsonb_typeof(entry->'displayKey')<>'string' or entry->>'displayKey'=''
       or jsonb_typeof(entry->'petId')<>'string' or not (entry->>'petId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       or jsonb_typeof(entry->'rarity')<>'string' or entry->>'rarity' not in ('COMMON','UNCOMMON','RARE','EPIC','LEGENDARY') then
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

create or replace function private.draw_pet_v1(subject_key uuid,idempotency_key uuid,request_hash text,expected_economy_version text,expected_economy_hash text,expected_catalog_revision text,expected_catalog_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$declare receipt private.idempotency_requests%rowtype; policy private.economy_policy_revisions%rowtype; selected_rarity public.pet_rarity; chosen uuid; userpet uuid; history_id bigint; response jsonb; rarec int; legc int; ladder public.pet_rarity[]:=array['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY']::public.pet_rarity[]; roll bigint; begin
  select * into receipt from private.idempotency_requests r where r.subject_key=draw_pet_v1.subject_key and scope='DRAW_V1' and r.idempotency_key=draw_pet_v1.idempotency_key; if found then if receipt.request_hash<>draw_pet_v1.request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return receipt.response_body; end if;
  perform 1 from private.economy_subjects s where s.subject_key=draw_pet_v1.subject_key for update; if not found then raise exception 'NOT_OWNED'; end if;
  select * into receipt from private.idempotency_requests r where r.subject_key=draw_pet_v1.subject_key and scope='DRAW_V1' and r.idempotency_key=draw_pet_v1.idempotency_key; if found then if receipt.request_hash<>draw_pet_v1.request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return receipt.response_body; end if;
  select * into policy from private.economy_policy_revisions where economy_version=expected_economy_version and economy_hash=expected_economy_hash; if not found or not exists(select 1 from private.pet_catalog_revisions where catalog_revision=expected_catalog_revision and catalog_hash=expected_catalog_hash) then raise exception 'POLICY_MISMATCH'; end if;
  insert into private.gacha_pity_state(subject_key,pity_series_id,pity_semantics_hash,economy_version,economy_hash,catalog_revision,catalog_hash) values(subject_key,policy.pity_series_id,policy.pity_semantics_hash,policy.economy_version,policy.economy_hash,expected_catalog_revision,expected_catalog_hash) on conflict do nothing;
  select rare_counter,legendary_counter into rarec,legc from private.gacha_pity_state p where p.subject_key=draw_pet_v1.subject_key and p.pity_series_id=policy.pity_series_id for update;
  if (select pity_semantics_hash from private.gacha_pity_state p where p.subject_key=draw_pet_v1.subject_key and p.pity_series_id=policy.pity_series_id)<>policy.pity_semantics_hash then raise exception 'POLICY_MISMATCH'; end if;
  if (select gacha_points from private.economy_subjects s where s.subject_key=draw_pet_v1.subject_key)<policy.draw_cost then raise exception 'INSUFFICIENT_FUNDS'; end if;
  -- 60/25/10/4/1 over a uniform 0..99 roll.
  if legc+1 >= (policy.pity_semantics#>>'{thresholds,legendary}')::int then selected_rarity:='LEGENDARY';
  elsif rarec+1 >= (policy.pity_semantics#>>'{thresholds,rareOrBetter}')::int then selected_rarity:='RARE';
  else
    roll:=private.secure_random_below_v1(100);
    selected_rarity:=case
      when roll < 1 then 'LEGENDARY'::public.pet_rarity
      when roll < 5 then 'EPIC'::public.pet_rarity
      when roll < 15 then 'RARE'::public.pet_rarity
      when roll < 40 then 'UNCOMMON'::public.pet_rarity
      else 'COMMON'::public.pet_rarity
    end;
  end if;
  selected_rarity:=private.resolve_drawable_rarity_v1(expected_catalog_revision,selected_rarity);
  if selected_rarity is null then raise exception 'POLICY_MISMATCH'; end if;
  select pet_id into chosen from private.pet_catalog_revision_entries e where e.catalog_revision=expected_catalog_revision and e.rarity=selected_rarity order by ordinal offset private.secure_random_below_v1((select count(*) from private.pet_catalog_revision_entries x where x.catalog_revision=expected_catalog_revision and x.rarity=selected_rarity)) limit 1;
  if chosen is null then raise exception 'POLICY_MISMATCH'; end if;
  update private.economy_subjects s set gacha_points=gacha_points-policy.draw_cost where s.subject_key=draw_pet_v1.subject_key;
  if selected_rarity='LEGENDARY' then rarec:=0;legc:=0;
  elsif array_position(ladder,selected_rarity) >= array_position(ladder,'RARE'::public.pet_rarity) then rarec:=0;legc:=legc+1;
  else rarec:=rarec+1;legc:=legc+1;end if;
  update private.gacha_pity_state p set rare_counter=rarec,legendary_counter=legc,economy_version=policy.economy_version,economy_hash=policy.economy_hash,catalog_revision=expected_catalog_revision,catalog_hash=expected_catalog_hash where p.subject_key=draw_pet_v1.subject_key and p.pity_series_id=policy.pity_series_id;
  insert into private.pet_inventory(subject_key,pet_id,rarity,acquired_catalog_revision,acquired_catalog_hash) values(subject_key,chosen,selected_rarity,expected_catalog_revision,expected_catalog_hash) returning user_pet_id into userpet;
  response:=jsonb_build_object('userPetId',userpet,'petId',chosen,'rarity',selected_rarity,'pointsRemaining',(select gacha_points from private.economy_subjects s where s.subject_key=draw_pet_v1.subject_key),'rareCounter',rarec,'legendaryCounter',legc,'economyVersion',policy.economy_version,'economyHash',policy.economy_hash,'catalogRevision',expected_catalog_revision,'catalogHash',expected_catalog_hash,'pitySeriesId',policy.pity_series_id,'pitySemanticsHash',policy.pity_semantics_hash);
  insert into private.idempotency_requests(subject_key,scope,idempotency_key,request_hash,response_status,response_body) values(subject_key,'DRAW_V1',idempotency_key,request_hash,200,response) returning * into receipt;
  insert into private.gacha_history(idempotency_request_id,subject_key,user_pet_id,pet_id,rarity,point_cost,economy_version,economy_hash,catalog_revision,catalog_hash,pity_series_id,pity_semantics_hash) values(receipt.id,subject_key,userpet,chosen,selected_rarity,policy.draw_cost,policy.economy_version,policy.economy_hash,expected_catalog_revision,expected_catalog_hash,policy.pity_series_id,policy.pity_semantics_hash) returning gacha_history_id into history_id;
  insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,gacha_history_id,economy_version,economy_hash,catalog_revision,catalog_hash) values('DRAW_COMMITTED','DRAW_V1',encode(extensions.digest(convert_to(format('{"idempotencyUuid":"%s","scope":"DRAW_V1","subjectKey":"%s"}',idempotency_key,subject_key),'UTF8'),'sha256'),'hex'),subject_key,response,history_id,policy.economy_version,policy.economy_hash,expected_catalog_revision,expected_catalog_hash); return response;
exception when unique_violation then select * into receipt from private.idempotency_requests r where r.subject_key=draw_pet_v1.subject_key and scope='DRAW_V1' and r.idempotency_key=draw_pet_v1.idempotency_key; if receipt.request_hash<>draw_pet_v1.request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return receipt.response_body; end$$;

create or replace function private.fuse_pets_impl_v1(p_subject uuid,p_key uuid,p_hash text,p_materials jsonb,p_economy_version text,p_economy_hash text,p_catalog_revision text,p_catalog_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $$
declare source_rarity public.pet_rarity;target_rarity public.pet_rarity;output_pet uuid;output_user_pet uuid;history_id bigint;receipt_id bigint;response jsonb;
begin
  perform 1 from private.economy_subjects s where s.subject_key=p_subject for update;if not found then raise exception 'NOT_OWNED';end if;
  if not exists(select 1 from private.economy_policy_revisions where economy_version=p_economy_version and economy_hash=p_economy_hash)
    or not exists(select 1 from private.pet_catalog_revisions where catalog_revision=p_catalog_revision and catalog_hash=p_catalog_hash) then raise exception 'POLICY_MISMATCH';end if;
  perform 1 from private.pet_inventory p join jsonb_array_elements(p_materials)m on p.user_pet_id=(m->>'userPetId')::uuid where p.subject_key=p_subject order by p.user_pet_id for update;
  if (select count(*) from private.pet_inventory p join jsonb_array_elements(p_materials)m on p.user_pet_id=(m->>'userPetId')::uuid where p.subject_key=p_subject)<>jsonb_array_length(p_materials)
    or exists(select 1 from private.pet_inventory p join jsonb_array_elements(p_materials)m on p.user_pet_id=(m->>'userPetId')::uuid where p.subject_key<>p_subject or p.selected or p.locked or p.copies<(m->>'count')::int) then raise exception 'INVALID_MATERIALS';end if;
  select p.rarity into source_rarity from private.pet_inventory p join jsonb_array_elements(p_materials)m on p.user_pet_id=(m->>'userPetId')::uuid limit 1;
  if source_rarity is null or source_rarity='LEGENDARY' or exists(select 1 from private.pet_inventory p join jsonb_array_elements(p_materials)m on p.user_pet_id=(m->>'userPetId')::uuid where p.rarity<>source_rarity) then raise exception 'INVALID_MATERIALS';end if;
  target_rarity:=private.resolve_promotion_rarity_v1(p_catalog_revision,source_rarity);
  if target_rarity is null then raise exception 'INVALID_MATERIALS';end if;
  select pet_id into output_pet from private.pet_catalog_revision_entries e where e.catalog_revision=p_catalog_revision and e.rarity=target_rarity order by ordinal offset private.secure_random_below_v1((select count(*) from private.pet_catalog_revision_entries x where x.catalog_revision=p_catalog_revision and x.rarity=target_rarity)) limit 1;
  if output_pet is null then raise exception 'POLICY_MISMATCH';end if;
  delete from private.pet_inventory p using jsonb_array_elements(p_materials)m where p.user_pet_id=(m->>'userPetId')::uuid and p.copies=(m->>'count')::int;
  update private.pet_inventory p set copies=copies-(m->>'count')::int from jsonb_array_elements(p_materials)m where p.user_pet_id=(m->>'userPetId')::uuid and p.copies>(m->>'count')::int;
  insert into private.pet_inventory(subject_key,pet_id,rarity,acquired_catalog_revision,acquired_catalog_hash) values(p_subject,output_pet,target_rarity,p_catalog_revision,p_catalog_hash) returning user_pet_id into output_user_pet;
  response:=jsonb_build_object('consumed',p_materials,'output',jsonb_build_object('userPetId',output_user_pet,'petId',output_pet,'rarity',target_rarity),'economyVersion',p_economy_version,'economyHash',p_economy_hash,'catalogRevision',p_catalog_revision,'catalogHash',p_catalog_hash);
  insert into private.idempotency_requests(subject_key,scope,idempotency_key,request_hash,response_status,response_body) values(p_subject,'FUSION_V1',p_key,p_hash,200,response) returning id into receipt_id;
  insert into private.fusion_history(idempotency_request_id,subject_key,materials,output_user_pet_id,output_pet_id,economy_version,economy_hash,catalog_revision,catalog_hash) values(receipt_id,p_subject,p_materials,output_user_pet,output_pet,p_economy_version,p_economy_hash,p_catalog_revision,p_catalog_hash) returning fusion_history_id into history_id;
  insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,fusion_history_id,economy_version,economy_hash,catalog_revision,catalog_hash) values('FUSION_COMMITTED','FUSION_V1',private.operation_key_v1(jsonb_build_object('idempotencyUuid',p_key,'scope','FUSION_V1','subjectKey',p_subject)),p_subject,response,history_id,p_economy_version,p_economy_hash,p_catalog_revision,p_catalog_hash);
  return response;
end$$;

create or replace function private.claim_daily_free_draw_v1(
  p_subject_key uuid,
  p_expected_economy_hash text,
  p_expected_catalog_revision text,
  p_expected_catalog_hash text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_claim_date date := (pg_catalog.timezone('Asia/Seoul', pg_catalog.clock_timestamp()))::date;
  v_existing private.daily_pet_claims%rowtype;
  v_policy private.economy_policy_revisions%rowtype;
  v_rarity public.pet_rarity;
  v_pet_id uuid;
  v_user_pet_id uuid;
  v_copies integer;
  v_claim_id bigint;
  v_response jsonb;
  v_roll bigint;
begin
  perform 1
    from private.economy_subjects s
    where s.subject_key = p_subject_key and s.user_id is not null
    for update of s;
  if not found then raise exception 'AUTH_SUBJECT_REQUIRED'; end if;

  select * into v_existing
    from private.daily_pet_claims c
    where c.subject_key = p_subject_key
      and c.claim_date = v_claim_date
      and c.series_id = 'DAILY_FREE_DRAW_V1';
  if found then return v_existing.response_body; end if;

  select * into v_policy
    from private.economy_policy_revisions p
    where p.economy_hash = p_expected_economy_hash;
  if not found or not exists (
    select 1 from private.pet_catalog_revisions c
    where c.catalog_revision = p_expected_catalog_revision
      and c.catalog_hash = p_expected_catalog_hash
  ) then raise exception 'POLICY_MISMATCH'; end if;

  -- This series is intentionally independent from private.gacha_pity_state.
  -- 60/25/10/4/1 over a uniform 0..99 roll, then resolved down to a populated tier.
  v_roll := private.secure_random_below_v1(100);
  v_rarity := case
    when v_roll < 1 then 'LEGENDARY'::public.pet_rarity
    when v_roll < 5 then 'EPIC'::public.pet_rarity
    when v_roll < 15 then 'RARE'::public.pet_rarity
    when v_roll < 40 then 'UNCOMMON'::public.pet_rarity
    else 'COMMON'::public.pet_rarity
  end;
  v_rarity := private.resolve_drawable_rarity_v1(p_expected_catalog_revision, v_rarity);
  if v_rarity is null then raise exception 'POLICY_MISMATCH'; end if;

  select e.pet_id into v_pet_id
    from private.pet_catalog_revision_entries e
    where e.catalog_revision = p_expected_catalog_revision and e.rarity = v_rarity
    order by e.ordinal
    offset private.secure_random_below_v1((
      select count(*) from private.pet_catalog_revision_entries x
      where x.catalog_revision = p_expected_catalog_revision and x.rarity = v_rarity
    ))
    limit 1;
  if v_pet_id is null then raise exception 'POLICY_MISMATCH'; end if;

  select i.user_pet_id, i.copies into v_user_pet_id, v_copies
    from private.pet_inventory i
    where i.subject_key = p_subject_key and i.pet_id = v_pet_id
      and i.copies > 0
    order by i.user_pet_id
    limit 1
    for update;
  if found then
    update private.pet_inventory
      set copies = copies + 1
      where user_pet_id = v_user_pet_id
      returning copies into v_copies;
  else
    insert into private.pet_inventory(
      subject_key, pet_id, rarity, acquired_catalog_revision, acquired_catalog_hash
    ) values (
      p_subject_key, v_pet_id, v_rarity, p_expected_catalog_revision, p_expected_catalog_hash
    ) returning user_pet_id, copies into v_user_pet_id, v_copies;
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'claimDate', v_claim_date,
    'seriesId', 'DAILY_FREE_DRAW_V1',
    'pet', pg_catalog.jsonb_build_object(
      'userPetId', v_user_pet_id,
      'petId', v_pet_id,
      'rarity', v_rarity,
      'copies', v_copies
    ),
    'economyVersion', v_policy.economy_version,
    'economyHash', v_policy.economy_hash,
    'catalogRevision', p_expected_catalog_revision,
    'catalogHash', p_expected_catalog_hash
  );
  insert into private.daily_pet_claims(
    subject_key, claim_date, series_id, response_body,
    economy_version, economy_hash, catalog_revision, catalog_hash
  ) values (
    p_subject_key, v_claim_date, 'DAILY_FREE_DRAW_V1', v_response,
    v_policy.economy_version, v_policy.economy_hash,
    p_expected_catalog_revision, p_expected_catalog_hash
  ) returning daily_claim_id into v_claim_id;
  insert into private.daily_pet_draw_history(
    daily_claim_id, subject_key, user_pet_id, pet_id, rarity,
    economy_version, economy_hash, catalog_revision, catalog_hash
  ) values (
    v_claim_id, p_subject_key, v_user_pet_id, v_pet_id, v_rarity,
    v_policy.economy_version, v_policy.economy_hash,
    p_expected_catalog_revision, p_expected_catalog_hash
  );
  insert into private.pet_loop_outbox_events(
    event_type, subject_key, daily_claim_id, payload,
    economy_version, economy_hash, catalog_revision, catalog_hash
  ) values (
    'DAILY_FREE_DRAW_COMMITTED', p_subject_key, v_claim_id, v_response,
    v_policy.economy_version, v_policy.economy_hash,
    p_expected_catalog_revision, p_expected_catalog_hash
  );
  return v_response;
end
$$;

create or replace function private.promote_duplicate_cards_v1(
  p_subject_key uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_materials jsonb,
  p_expected_economy_hash text,
  p_expected_catalog_revision text,
  p_expected_catalog_hash text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_receipt private.duplicate_promotion_receipts%rowtype;
  v_policy private.economy_policy_revisions%rowtype;
  v_source_user_pet_id uuid;
  v_source_pet_id uuid;
  v_source_rarity public.pet_rarity;
  v_row record;
  v_take integer;
  v_total_copies integer;
  v_eligible_copies integer;
  v_remaining_to_consume integer := 10;
  v_consumed_rows jsonb := '[]'::jsonb;
  v_target_rarity public.pet_rarity;
  v_target_pet_id uuid;
  v_target_user_pet_id uuid;
  v_target_copies integer;
  v_remaining integer;
  v_receipt_id bigint;
  v_history_id bigint;
  v_response jsonb;
begin
  perform 1
    from private.economy_subjects s
    where s.subject_key = p_subject_key and s.user_id is not null
    for update;
  if not found then raise exception 'AUTH_SUBJECT_REQUIRED'; end if;

  select * into v_receipt
    from private.duplicate_promotion_receipts r
    where r.subject_key = p_subject_key and r.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_receipt.response_body;
  end if;

  if pg_catalog.jsonb_typeof(p_materials) <> 'array'
    or pg_catalog.jsonb_array_length(p_materials) <> 1
    or pg_catalog.jsonb_typeof(p_materials->0) <> 'object'
    or (select pg_catalog.array_agg(k order by k) from pg_catalog.jsonb_object_keys(p_materials->0) k)
      <> array['count','petId']::text[]
    or pg_catalog.jsonb_typeof(p_materials#>'{0,count}') <> 'number'
    or not (p_materials#>>'{0,petId}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  then raise exception 'INVALID_MATERIALS'; end if;
  if (p_materials#>>'{0,count}')::numeric <> 10
    or pg_catalog.trunc((p_materials#>>'{0,count}')::numeric) <> (p_materials#>>'{0,count}')::numeric
  then raise exception 'INVALID_MATERIALS'; end if;
  v_source_pet_id := (p_materials#>>'{0,petId}')::uuid;
  if (get_byte(uuid_send(v_source_pet_id), 6) >> 4) <> 4
    or (get_byte(uuid_send(v_source_pet_id), 8) & 192) <> 128
  then raise exception 'INVALID_MATERIALS'; end if;

  select * into v_receipt
    from private.duplicate_promotion_receipts r
    where r.subject_key = p_subject_key and r.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_receipt.response_body;
  end if;

  select * into v_policy
    from private.economy_policy_revisions p
    where p.economy_hash = p_expected_economy_hash;
  if not found or not exists (
    select 1 from private.pet_catalog_revisions c
    where c.catalog_revision = p_expected_catalog_revision
      and c.catalog_hash = p_expected_catalog_hash
  ) then raise exception 'POLICY_MISMATCH'; end if;

  perform 1
    from private.pet_inventory i
    where i.subject_key = p_subject_key and i.pet_id = v_source_pet_id
      and i.copies > 0
    order by i.user_pet_id
    for update;
  if not found then raise exception 'NOT_OWNED'; end if;
  select i.rarity into v_source_rarity
    from private.pet_inventory i
    where i.subject_key = p_subject_key and i.pet_id = v_source_pet_id
      and i.copies > 0
    order by i.user_pet_id
    limit 1;
  if exists (
    select 1 from private.pet_inventory i
    where i.subject_key = p_subject_key and i.pet_id = v_source_pet_id
      and i.copies > 0 and i.rarity <> v_source_rarity
  ) then raise exception 'INVALID_MATERIALS'; end if;
  select
    coalesce(sum(i.copies), 0)::integer,
    coalesce(sum(i.copies) filter (where not i.selected and not i.locked), 0)::integer
  into v_total_copies, v_eligible_copies
  from private.pet_inventory i
  where i.subject_key = p_subject_key and i.pet_id = v_source_pet_id
    and i.copies > 0;
  if v_total_copies < 11 or v_eligible_copies < 10 then raise exception 'INSUFFICIENT_DUPLICATES'; end if;
  if v_source_rarity = 'LEGENDARY' then raise exception 'COSMETIC_REWARD_POLICY_REQUIRED'; end if;
  -- Steps up the ladder to the nearest tier that has admitted art.
  v_target_rarity := private.resolve_promotion_rarity_v1(p_expected_catalog_revision, v_source_rarity);
  if v_target_rarity is null then raise exception 'COSMETIC_REWARD_POLICY_REQUIRED'; end if;

  select e.pet_id into v_target_pet_id
    from private.pet_catalog_revision_entries e
    where e.catalog_revision = p_expected_catalog_revision and e.rarity = v_target_rarity
    order by e.ordinal
    offset private.secure_random_below_v1((
      select count(*) from private.pet_catalog_revision_entries x
      where x.catalog_revision = p_expected_catalog_revision and x.rarity = v_target_rarity
    ))
    limit 1;
  if v_target_pet_id is null then raise exception 'POLICY_MISMATCH'; end if;

  for v_row in
    select i.user_pet_id, i.copies
    from private.pet_inventory i
    where i.subject_key = p_subject_key and i.pet_id = v_source_pet_id
      and not i.selected and not i.locked and i.copies > 0
    order by i.user_pet_id
  loop
    exit when v_remaining_to_consume = 0;
    v_take := least(v_row.copies, v_remaining_to_consume);
    update private.pet_inventory
      set copies = copies - v_take
      where user_pet_id = v_row.user_pet_id;
    v_consumed_rows := v_consumed_rows || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('userPetId', v_row.user_pet_id, 'copies', v_take)
    );
    v_remaining_to_consume := v_remaining_to_consume - v_take;
  end loop;
  if v_remaining_to_consume <> 0 then raise exception 'INSUFFICIENT_DUPLICATES'; end if;
  v_source_user_pet_id := (v_consumed_rows#>>'{0,userPetId}')::uuid;
  v_remaining := v_total_copies - 10;

  select i.user_pet_id, i.copies into v_target_user_pet_id, v_target_copies
    from private.pet_inventory i
    where i.subject_key = p_subject_key and i.pet_id = v_target_pet_id
      and i.copies > 0
    order by i.user_pet_id
    limit 1
    for update;
  if found then
    update private.pet_inventory
      set copies = copies + 1
      where user_pet_id = v_target_user_pet_id
      returning copies into v_target_copies;
  else
    insert into private.pet_inventory(
      subject_key, pet_id, rarity, acquired_catalog_revision, acquired_catalog_hash
    ) values (
      p_subject_key, v_target_pet_id, v_target_rarity,
      p_expected_catalog_revision, p_expected_catalog_hash
    ) returning user_pet_id, copies into v_target_user_pet_id, v_target_copies;
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'consumed', pg_catalog.jsonb_build_object(
      'petId', v_source_pet_id,
      'copies', 10,
      'rows', v_consumed_rows
    ),
    'remainingCopies', v_remaining,
    'output', pg_catalog.jsonb_build_object(
      'userPetId', v_target_user_pet_id,
      'petId', v_target_pet_id,
      'rarity', v_target_rarity,
      'copies', v_target_copies
    ),
    'economyVersion', v_policy.economy_version,
    'economyHash', v_policy.economy_hash,
    'catalogRevision', p_expected_catalog_revision,
    'catalogHash', p_expected_catalog_hash
  );
  insert into private.duplicate_promotion_receipts(
    subject_key, idempotency_key, request_hash, response_body
  ) values (
    p_subject_key, p_idempotency_key, p_request_hash, v_response
  ) returning promotion_receipt_id into v_receipt_id;
  insert into private.duplicate_promotion_entitlements(
    promotion_receipt_id, target_rarity, target_pet_id, target_user_pet_id,
    status, issued_at, consumed_at
  ) values (
    v_receipt_id, v_target_rarity, v_target_pet_id, v_target_user_pet_id,
    'CONSUMED', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  );
  insert into private.duplicate_promotion_history(
    promotion_receipt_id, subject_key,
    source_user_pet_id, source_pet_id, source_rarity, consumed_copies, consumed_rows,
    output_user_pet_id, output_pet_id, output_rarity,
    economy_version, economy_hash, catalog_revision, catalog_hash
  ) values (
    v_receipt_id, p_subject_key,
    v_source_user_pet_id, v_source_pet_id, v_source_rarity, 10, v_consumed_rows,
    v_target_user_pet_id, v_target_pet_id, v_target_rarity,
    v_policy.economy_version, v_policy.economy_hash,
    p_expected_catalog_revision, p_expected_catalog_hash
  ) returning duplicate_promotion_history_id into v_history_id;
  insert into private.pet_loop_outbox_events(
    event_type, subject_key, duplicate_promotion_history_id, payload,
    economy_version, economy_hash, catalog_revision, catalog_hash
  ) values (
    'DUPLICATE_PROMOTION_COMMITTED', p_subject_key, v_history_id, v_response,
    v_policy.economy_version, v_policy.economy_hash,
    p_expected_catalog_revision, p_expected_catalog_hash
  );
  return v_response;
end
$$;

alter function private.resolve_drawable_rarity_v1(text, public.pet_rarity) owner to economy_security_owner;
alter function private.resolve_promotion_rarity_v1(text, public.pet_rarity) owner to economy_security_owner;
revoke all on function private.resolve_drawable_rarity_v1(text, public.pet_rarity) from public, anon, authenticated, service_role, app_server, deployment_role;
revoke all on function private.resolve_promotion_rarity_v1(text, public.pet_rarity) from public, anon, authenticated, service_role, app_server, deployment_role;

do $$begin execute format('revoke economy_security_owner from %I', current_user); end$$;
