begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('private','economy_policy_revisions','economy policy revisions are private');
select has_table('private','pet_catalog_revisions','catalog revisions are private');
select has_table('private','pet_catalog_revision_entries','catalog entries are private');
select has_table('private','economy_subjects','random subject mapping exists');
select has_table('private','idempotency_requests','subject-scoped receipts exist');
select has_table('private','reward_ledger','reward ledger exists');
select has_table('private','gacha_history','draw history exists');
select has_table('private','fusion_history','fusion history exists');
select has_table('private','gacha_pity_state','pity state exists');
select has_table('private','outbox_events','transactional outbox exists');
select has_function('private','publish_economy_bundle_v1','approved bundle publish function exists');
select has_function('private','award_match_reward_v1','reward command exists');
select has_function('private','draw_pet_v1','draw command exists');
select has_function('private','fuse_pets_v1','fusion command exists');
select has_function('private','select_pet_v1','select command exists');
select has_function('private','set_pet_lock_v1','lock command exists');

select ok(has_function_privilege('economy_deployment_role','private.publish_economy_bundle_v1(jsonb,jsonb)','EXECUTE') and not has_function_privilege('deployment_role','private.publish_economy_bundle_v1(jsonb,jsonb)','EXECUTE'),'only economy deployment role publishes');
select ok(has_function_privilege('economy_server','private.draw_pet_v1(uuid,uuid,text,text,text,text,text)','EXECUTE') and not has_function_privilege('app_server','private.draw_pet_v1(uuid,uuid,text,text,text,text,text)','EXECUTE'),'only economy server draws');
select isnt(has_schema_privilege('authenticated','private','USAGE'),true,'authenticated cannot use private schema');
select isnt(has_table_privilege('app_server','private.economy_subjects','INSERT'),true,'app_server cannot mutate economy tables directly');

insert into private.economy_policy_revisions(economy_version,economy_hash,pity_series_id,pity_semantics_hash,pity_semantics,draw_cost,reward_policies)
values('mutation-test','a'||repeat('0',63),'pity-50-150-v1','b'||repeat('0',63),'{}',100,'{}');
insert into private.pet_catalog_revisions(catalog_revision,catalog_hash)
values('catalog-mutation-test','c'||repeat('0',63));
insert into private.pet_definitions(pet_id,rarity,display_key,coach_archetype)
values
  ('00000000-0000-4000-8000-000000000998','COMMON','pet.entry-test','CHEER'),
  ('00000000-0000-4000-8000-000000000999','COMMON','pet.identity-test','CHEER');
insert into private.pet_catalog_revision_entries(catalog_revision,pet_id,rarity,ordinal)
values('catalog-mutation-test','00000000-0000-4000-8000-000000000998','COMMON',0);

select throws_ok($$update private.economy_policy_revisions set draw_cost=101 where economy_version='mutation-test'$$,'P0001','IMMUTABLE_ECONOMY_REVISION','approved policy update is rejected');
select throws_ok($$delete from private.economy_policy_revisions where economy_version='mutation-test'$$,'P0001','IMMUTABLE_ECONOMY_REVISION','approved policy delete is rejected');
select throws_ok($$update private.pet_catalog_revisions set catalog_hash='d'||repeat('0',63) where catalog_revision='catalog-mutation-test'$$,'P0001','IMMUTABLE_ECONOMY_REVISION','approved catalog revision update is rejected');
select throws_ok($$delete from private.pet_catalog_revisions where catalog_revision='catalog-mutation-test'$$,'P0001','IMMUTABLE_ECONOMY_REVISION','approved catalog revision delete is rejected');
select throws_ok($$update private.pet_catalog_revision_entries set rarity='RARE' where catalog_revision='catalog-mutation-test'$$,'P0001','IMMUTABLE_ECONOMY_REVISION','approved catalog entry update is rejected');
select throws_ok($$delete from private.pet_catalog_revision_entries where catalog_revision='catalog-mutation-test'$$,'P0001','IMMUTABLE_ECONOMY_REVISION','approved catalog entry delete is rejected');
select throws_ok($$update private.pet_definitions set rarity='RARE' where pet_id='00000000-0000-4000-8000-000000000999'$$,'P0001','IMMUTABLE_ECONOMY_REVISION','cross-revision rarity mutation is rejected');
select throws_ok($$update private.pet_definitions set display_key='pet.drift' where pet_id='00000000-0000-4000-8000-000000000999'$$,'P0001','IMMUTABLE_ECONOMY_REVISION','cross-revision identity mutation is rejected');
select throws_ok($$delete from private.pet_definitions where pet_id='00000000-0000-4000-8000-000000000999'$$,'P0001','IMMUTABLE_ECONOMY_REVISION','stable pet identity delete is rejected');
select is((select row_to_json(x)::text from (select rarity,display_key from private.pet_definitions where pet_id='00000000-0000-4000-8000-000000000999') x),'{"rarity":"COMMON","display_key":"pet.identity-test"}','failed identity and rarity mutations write zero rows');
select is((select count(*)::int from private.pet_catalog_revision_entries where catalog_revision='catalog-mutation-test'),1,'failed catalog entry mutations write zero rows');

select ok((select convalidated from pg_constraint where conrelid='private.fusion_history'::regclass and conname='INVALID_MATERIALS'),'fusion exact unique-five shape constraint is validated');
select ok((select count(*)=5 from information_schema.role_routine_grants where routine_schema='private' and grantee='economy_server' and routine_name in ('award_match_reward_v1','draw_pet_v1','fuse_pets_v1','select_pet_v1','set_pet_lock_v1')),'economy-server command allowlist is exact');
select ok((select count(*)=0 from information_schema.role_table_grants where table_schema='private' and grantee in ('app_server','authenticated','anon','service_role') and privilege_type in ('INSERT','UPDATE','DELETE')),'client and app roles have no direct economy DML grants');

insert into auth.users(id,aud,role,email) values('10000000-0000-4000-8000-000000000099','authenticated','authenticated','economy-delete@example.test');
insert into private.economy_subjects(subject_key,user_id,gacha_points) values('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000099',100);
insert into private.idempotency_requests(subject_key,scope,idempotency_key,request_hash,response_status,response_body)
values
 ('70000000-0000-4000-8000-000000000001','DRAW_V1','20000000-0000-4000-8000-000000000001',repeat('1',64),200,'{"petId":"00000000-0000-4000-8000-000000000998","rarity":"COMMON"}'),
 ('70000000-0000-4000-8000-000000000001','FUSION_V1','20000000-0000-4000-8000-000000000002',repeat('2',64),200,'{"output":{"petId":"00000000-0000-4000-8000-000000000998","rarity":"COMMON"}}');
insert into private.reward_ledger(match_id,subject_key,reward_type,committed_result_revision,request_hash,amount,economy_version,economy_hash,catalog_revision,catalog_hash,response_body)
values('30000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','TEST_ONLY_TRANSACTION_PROBE',1,repeat('3',64),1,'mutation-test','a'||repeat('0',63),'catalog-mutation-test','c'||repeat('0',63),jsonb_build_object('amount',1,'balance',101,'rewardType','TEST_ONLY_TRANSACTION_PROBE','economyVersion','mutation-test','economyHash','a'||repeat('0',63),'catalogRevision','catalog-mutation-test','catalogHash','c'||repeat('0',63)));
insert into private.gacha_pity_state(subject_key,pity_series_id,pity_semantics_hash,rare_counter,legendary_counter,economy_version,economy_hash,catalog_revision,catalog_hash)
values('70000000-0000-4000-8000-000000000001','pity-50-150-v1','b'||repeat('0',63),7,17,'mutation-test','a'||repeat('0',63),'catalog-mutation-test','c'||repeat('0',63));
insert into private.pet_inventory(user_pet_id,subject_key,pet_id,rarity,acquired_catalog_revision,acquired_catalog_hash)
values('40000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000998','COMMON','catalog-mutation-test','c'||repeat('0',63));
insert into private.gacha_history(idempotency_request_id,subject_key,user_pet_id,pet_id,rarity,point_cost,economy_version,economy_hash,catalog_revision,catalog_hash,pity_series_id,pity_semantics_hash)
select id,'70000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000998','COMMON',100,'mutation-test','a'||repeat('0',63),'catalog-mutation-test','c'||repeat('0',63),'pity-50-150-v1','b'||repeat('0',63)
from private.idempotency_requests where idempotency_key='20000000-0000-4000-8000-000000000001';
insert into private.fusion_history(idempotency_request_id,subject_key,materials,output_user_pet_id,output_pet_id,economy_version,economy_hash,catalog_revision,catalog_hash)
select id,'70000000-0000-4000-8000-000000000001','[{"userPetId":"40000000-0000-4000-8000-000000000001","count":5}]','40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000998','mutation-test','a'||repeat('0',63),'catalog-mutation-test','c'||repeat('0',63)
from private.idempotency_requests where idempotency_key='20000000-0000-4000-8000-000000000002';
insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash,occurred_at,created_at)
select 'REWARD_COMMITTED','REWARD_V1',repeat('4',64),subject_key,response_body,reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash,clock_timestamp(),clock_timestamp()
from private.reward_ledger where subject_key='70000000-0000-4000-8000-000000000001';

select throws_ok($$insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload) values('DRAW_COMMITTED','DRAW_V1',repeat('a',64),extensions.uuid_generate_v4(),'{}')$$,'23514',null,'outbox requires exactly one source and complete policy provenance');
select throws_ok($$insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash) select 'REWARD_COMMITTED','REWARD_V1',repeat('5',64),subject_key,'[]',reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash from private.reward_ledger where subject_key='70000000-0000-4000-8000-000000000001'$$,'23514',null,'outbox payload must be a JSON object');
select throws_ok($$insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,reward_ledger_id,gacha_history_id,economy_version,economy_hash,catalog_revision,catalog_hash) select 'REWARD_COMMITTED','REWARD_V1',repeat('6',64),r.subject_key,'{}',r.reward_ledger_id,g.gacha_history_id,r.economy_version,r.economy_hash,r.catalog_revision,r.catalog_hash from private.reward_ledger r cross join private.gacha_history g where r.subject_key='70000000-0000-4000-8000-000000000001'$$,'23514',null,'outbox rejects multiple source references');
select throws_ok($$insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash,occurred_at,created_at) select 'REWARD_COMMITTED','REWARD_V1',repeat('7',64),subject_key,'{}',reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash,clock_timestamp()+interval '1 minute',clock_timestamp() from private.reward_ledger where subject_key='70000000-0000-4000-8000-000000000001'$$,'23514',null,'outbox rejects occurred_at after created_at');
select throws_ok($$insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash) select 'REWARD_COMMITTED','REWARD_V1',repeat('8',64),subject_key,response_body||'{"private":"leak"}',reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash from private.reward_ledger where subject_key='70000000-0000-4000-8000-000000000001'$$,'23514',null,'outbox rejects extra/private payload keys');
select throws_ok($$insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash) select 'REWARD_COMMITTED','REWARD_V1',repeat('9',64),subject_key,response_body-'amount',reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash from private.reward_ledger where subject_key='70000000-0000-4000-8000-000000000001'$$,'23514',null,'outbox rejects missing required payload keys');
select throws_ok($$insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash) select 'REWARD_COMMITTED','REWARD_V1',repeat('a',64),subject_key,jsonb_set(response_body,'{amount}','"one"'),reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash from private.reward_ledger where subject_key='70000000-0000-4000-8000-000000000001'$$,'23514',null,'outbox rejects wrong payload types');
select ok((select o.payload=r.response_body and jsonb_typeof(o.payload)='object' and o.reward_ledger_id is not null and o.gacha_history_id is null and o.fusion_history_id is null and o.idempotency_request_id is null and o.economy_version is not null and o.economy_hash is not null and o.catalog_revision is not null and o.catalog_hash is not null and o.occurred_at<=o.created_at and o.published_at is null from private.outbox_events o join private.reward_ledger r using(reward_ledger_id) where o.operation_key=repeat('4',64)),'reward outbox payload, exclusive source, refs, nullability, and timestamps match the committed ledger');

delete from auth.users where id='10000000-0000-4000-8000-000000000099';
select is((select user_id from private.economy_subjects where subject_key='70000000-0000-4000-8000-000000000001'),null::uuid,'account deletion nulls economy auth mapping');
select is((select count(*)::int from private.economy_subjects where subject_key='70000000-0000-4000-8000-000000000001'),1,'non-identifying economy subject survives deletion');
select is((select count(*)::int from private.reward_ledger where subject_key='70000000-0000-4000-8000-000000000001'),1,'populated reward ledger survives account deletion');
select is((select count(*)::int from private.gacha_history where subject_key='70000000-0000-4000-8000-000000000001'),1,'populated gacha history survives account deletion');
select is((select count(*)::int from private.fusion_history where subject_key='70000000-0000-4000-8000-000000000001'),1,'populated fusion history survives account deletion');
select is((select count(*)::int from private.gacha_pity_state where subject_key='70000000-0000-4000-8000-000000000001'),1,'populated pity state survives account deletion');
select is((select count(*)::int from private.idempotency_requests where subject_key='70000000-0000-4000-8000-000000000001'),2,'safe UUIDv4 receipts survive account deletion');
select ok((select bool_and((get_byte(uuid_send(idempotency_key),6)>>4)=4 and (get_byte(uuid_send(idempotency_key),8)&192)=128) from private.idempotency_requests where subject_key='70000000-0000-4000-8000-000000000001'),'retained receipt keys are random UUIDv4 values');
select ok(not exists(
  select 1 from (
    select to_jsonb(s) document from private.economy_subjects s where subject_key='70000000-0000-4000-8000-000000000001'
    union all select to_jsonb(i) from private.idempotency_requests i where subject_key='70000000-0000-4000-8000-000000000001'
    union all select to_jsonb(r) from private.reward_ledger r where subject_key='70000000-0000-4000-8000-000000000001'
    union all select to_jsonb(g) from private.gacha_history g where subject_key='70000000-0000-4000-8000-000000000001'
    union all select to_jsonb(f) from private.fusion_history f where subject_key='70000000-0000-4000-8000-000000000001'
    union all select to_jsonb(p) from private.gacha_pity_state p where subject_key='70000000-0000-4000-8000-000000000001'
    union all select to_jsonb(o) from private.outbox_events o where aggregate_key='70000000-0000-4000-8000-000000000001'
  ) retained
  where document::text ~* '(economy-delete@example\.test|10000000-0000-4000-8000-000000000099|"(email|phone|nickname)"\s*:)'
),'recursive retained ledger/history/pity/receipt/outbox JSON contains no auth identifier or PII field');

select ok((select not rolcanlogin and not rolinherit from pg_roles where rolname='economy_security_owner'),'economy security owner is NOLOGIN NOINHERIT');
select is((select count(*)::int from pg_proc where prosecdef and pronamespace='private'::regnamespace and proowner=(select oid from pg_roles where rolname='economy_security_owner') and oid not in (
  'private.publish_economy_bundle_v1(jsonb,jsonb)'::regprocedure,
  'private.secure_random_below_v1(bigint)'::regprocedure,
  'private.award_match_reward_v1(uuid,uuid,text,bigint,text,text,text)'::regprocedure,
  'private.draw_pet_v1(uuid,uuid,text,text,text,text,text)'::regprocedure,
  'private.fuse_pets_v1(uuid,uuid,text,jsonb,text,text,text,text)'::regprocedure,
  'private.select_pet_v1(uuid,uuid,text,uuid)'::regprocedure,
  'private.set_pet_lock_v1(uuid,uuid,text,uuid,boolean)'::regprocedure,
  'private.claim_daily_free_draw_v1(uuid,text,text,text)'::regprocedure,
  'private.promote_duplicate_cards_v1(uuid,uuid,text,jsonb,text,text,text)'::regprocedure
)),0,'private security-definer function allowlist is exact');
select ok(not exists(select 1 from pg_proc where prosecdef and pronamespace='private'::regnamespace and proowner=(select oid from pg_roles where rolname='economy_security_owner') and proconfig is distinct from array['search_path=pg_catalog']),'every economy security definer has the dedicated owner and pinned search_path');
select is((select count(*)::int from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclnamespace in ('public'::regnamespace,'private'::regnamespace) and d.defaclrole in ((select oid from pg_roles where rolname='postgres'),(select oid from pg_roles where rolname='economy_security_owner')) and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),(select oid from pg_roles where rolname='service_role'))),0,'future default ACLs do not expose client or service roles');
select is(private.economy_outbox_payload_valid_v1('FUSION_COMMITTED',1,'FUSION_V1','{"catalogHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","catalogRevision":"v1","consumed":[{"count":2,"userPetId":"40000000-0000-4000-8000-000000000001"},{"count":3,"userPetId":"40000000-0000-4000-8000-000000000001"}],"economyHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","economyVersion":"v1","output":{"petId":"00000000-0000-4000-8000-000000000001","rarity":"RARE","userPetId":"40000000-0000-4000-8000-000000000002"}}'),false,'fusion outbox rejects duplicate consumed userPetId');
select is(private.economy_outbox_payload_valid_v1('FUSION_COMMITTED',1,'FUSION_V1','{"catalogHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","catalogRevision":"v1","consumed":[{"count":4,"userPetId":"40000000-0000-4000-8000-000000000001"}],"economyHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","economyVersion":"v1","output":{"petId":"00000000-0000-4000-8000-000000000001","rarity":"RARE","userPetId":"40000000-0000-4000-8000-000000000002"}}'),false,'fusion outbox rejects consumed sum other than five');
select is(private.economy_outbox_payload_valid_v1('FUSION_COMMITTED',1,'FUSION_V1','{"catalogHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","catalogRevision":"v1","consumed":[{"count":"5","userPetId":"40000000-0000-4000-8000-000000000001"}],"economyHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","economyVersion":"v1","output":{"petId":"00000000-0000-4000-8000-000000000001","rarity":"RARE","userPetId":"40000000-0000-4000-8000-000000000002"}}'),false,'fusion outbox rejects string count');
select is(private.economy_outbox_payload_valid_v1('DRAW_COMMITTED',1,'DRAW_V1','{"catalogHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","catalogRevision":1,"economyHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","economyVersion":"v1","legendaryCounter":0,"petId":"00000000-0000-4000-8000-000000000001","pitySemanticsHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","pitySeriesId":"p1","pointsRemaining":0,"rareCounter":0,"rarity":"RARE","userPetId":"40000000-0000-4000-8000-000000000002"}'),false,'draw outbox rejects non-string policy provenance');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.prosecdef and p.pronamespace='private'::regnamespace and a.privilege_type='EXECUTE' and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),(select oid from pg_roles where rolname='service_role'))),'security-definer functions deny PUBLIC and client/service EXECUTE');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='private'::regnamespace and a.privilege_type='EXECUTE' and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),(select oid from pg_roles where rolname='service_role'))),'complete private executable surface denies PUBLIC and client/service EXECUTE');
select ok(not exists(select 1 from pg_proc p where p.pronamespace='private'::regnamespace and p.proname in ('economy_outbox_payload_valid_v1','canonical_json_v1','canonical_json_sha256_v1','fusion_materials_shape_valid_v1','validate_fusion_materials_v1','operation_key_v1','reject_economy_immutable_v1','fuse_pets_impl_v1') and (p.proowner<>(select oid from pg_roles where rolname='economy_security_owner') or p.proconfig is distinct from array['search_path=pg_catalog'])),'all economy private helpers have fixed owner and pinned search_path');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='private'::regnamespace and p.proname in ('economy_outbox_payload_valid_v1','canonical_json_v1','canonical_json_sha256_v1','fusion_materials_shape_valid_v1','validate_fusion_materials_v1','operation_key_v1','reject_economy_immutable_v1','fuse_pets_impl_v1') and a.privilege_type='EXECUTE' and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),(select oid from pg_roles where rolname='service_role'),(select oid from pg_roles where rolname='app_server'),(select oid from pg_roles where rolname='deployment_role'))),'private helpers deny every non-owner runtime and deployment role');

select * from finish();
rollback;
