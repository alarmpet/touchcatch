begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_view('public', 'game_content_catalog', 'safe public content catalog exists');
select has_table('private', 'game_content_solutions', 'private solutions table exists');
select hasnt_table('public', 'game_contents', 'legacy secret-bearing table is removed');
select hasnt_table('public', 'match_events', 'legacy event table is removed');
select ok(not has_table_privilege('anon', 'private.game_content_solutions', 'SELECT'), 'anon cannot select private solutions');
select ok(not has_table_privilege('authenticated', 'private.game_content_solutions', 'SELECT'), 'authenticated cannot select private solutions');
select ok(not has_table_privilege('service_role', 'private.game_content_solutions', 'SELECT'), 'service_role cannot select private solutions');
select ok(not has_table_privilege('deployment_role', 'public.game_content_revisions', 'INSERT'), 'deployment role cannot bypass publish function');
select ok(not has_table_privilege('deployment_role', 'private.game_content_solutions', 'INSERT'), 'deployment role cannot insert private solution directly');
select is((select count(*)::int from information_schema.columns where table_schema='public' and table_name='game_content_catalog' and column_name in ('private_solution','private_solution_hash','final_answer','answer_aliases','meaning_question','content_json')), 0, 'safe catalog has no secret columns');
select ok((select coalesce(reloptions, '{}'::text[]) @> array['security_invoker=true'] from pg_class where oid='public.game_content_catalog'::regclass), 'catalog view uses security_invoker');
select col_not_null('private', 'content_publish_attestations', 'invoked_role', 'publish attestation records explicit SET ROLE identity');

create temp table publish_bundle(public_json jsonb, private_json jsonb, rights_json jsonb, public_text text, private_text text, rights_text text) on commit drop;
with private_body as (
  select jsonb_build_object(
    'contentRevisionId','ffffffff-ffff-4fff-8fff-ffffffffffff','schemaVersion','1.0.0',
    'differences',(select jsonb_agg(jsonb_build_object('objectiveId','difference_'||i,'tier',case when i<=7 then 'NORMAL' else 'HARD' end,'hitboxes',jsonb_build_object('imageA',jsonb_build_object('cx',i/20.0,'cy',0.2,'r',0.01),'imageB',jsonb_build_object('cx',i/20.0,'cy',0.2,'r',0.01))) order by i) from generate_series(1,10) i),
    'wordHunts',(select jsonb_agg(jsonb_build_object('missionId','word_'||i,'kind',case when i<=2 then 'NORMAL' else 'SPECIAL' end,'publicPrompt','prompt','hitboxes',jsonb_build_object('imageA',jsonb_build_object('cx',i/10.0,'cy',0.6,'r',0.01),'imageB',jsonb_build_object('cx',i/10.0,'cy',0.6,'r',0.01))) order by i) from generate_series(1,3) i),
    'suddenDeath',jsonb_build_object('objectiveId','sudden_1','hitboxes',jsonb_build_object('imageA',jsonb_build_object('cx',0.8,'cy',0.8,'r',0.01),'imageB',jsonb_build_object('cx',0.8,'cy',0.8,'r',0.01))),
    'finalChallenge',jsonb_build_object('canonicalAnswer','cat','aliases',jsonb_build_array('feline'),'hintUnits',jsonb_build_array('c','a','t'),'meaning',jsonb_build_object('prompt','meaning','options',jsonb_build_array(jsonb_build_object('id','a','label','animal'),jsonb_build_object('id','b','label','plant'),jsonb_build_object('id','c','label','place')),'correctOptionId','a'))
  ) body
), bundle as (
  select
    '{"contentId":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","version":1,"contentRevisionId":"ffffffff-ffff-4fff-8fff-ffffffffffff","schemaVersion":"1.0.0","assetPolicyVersion":"1.0.0","theme":"publish-test","category":"ENGLISH","language":"en","difficulty":"BEGINNER","imageA":{"url":"https://cdn.spot-learn.test/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","encodedBytes":1,"width":1,"height":1,"mimeType":"image/png"},"imageB":{"url":"https://cdn.spot-learn.test/assets/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","encodedBytes":1,"width":1,"height":1,"mimeType":"image/png"}}'::jsonb public_json,
    body,
    '{"schemaVersion":"1.0.0","manifestSetId":"rights_publish_test","entries":[{"rightsRecordId":"rights_a","assetSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","source":{"kind":"OWNED","sourceRecordId":"source_a","sourceUri":"https://rights.test/a"},"generator":{"provider":"UNKNOWN","model":"UNKNOWN","modelVersion":"UNKNOWN","termsVersion":"UNKNOWN","generatedAt":"2026-07-16T00:00:00Z"},"prompt":{"available":false,"sha256":null,"unavailabilityReason":"NOT_AVAILABLE"},"rights":{"status":"APPROVED","licenseOrPermission":"owned","approverId":"rights","approvedAt":"2026-07-16T00:00:00Z"},"education":{"status":"APPROVED","reviewerId":"education","reviewedAt":"2026-07-16T00:00:00Z"},"takedown":{"ownerId":"ops","contact":"ops@test","runbookVersion":"1.0.0"}},{"rightsRecordId":"rights_b","assetSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","source":{"kind":"OWNED","sourceRecordId":"source_b","sourceUri":"https://rights.test/b"},"generator":{"provider":"UNKNOWN","model":"UNKNOWN","modelVersion":"UNKNOWN","termsVersion":"UNKNOWN","generatedAt":"2026-07-16T00:00:00Z"},"prompt":{"available":false,"sha256":null,"unavailabilityReason":"NOT_AVAILABLE"},"rights":{"status":"APPROVED","licenseOrPermission":"owned","approverId":"rights","approvedAt":"2026-07-16T00:00:00Z"},"education":{"status":"APPROVED","reviewerId":"education","reviewedAt":"2026-07-16T00:00:00Z"},"takedown":{"ownerId":"ops","contact":"ops@test","runbookVersion":"1.0.0"}}]}'::jsonb rights_json
  from private_body
)
insert into publish_bundle
select public_json, body || jsonb_build_object('privateSolutionHash',encode(extensions.digest(convert_to(body::text,'UTF8'),'sha256'),'hex')), rights_json, public_json::text, body::text, rights_json::text from bundle;
grant select on publish_bundle to deployment_role;

set local role deployment_role;
do $$
declare published_id uuid; public_value jsonb; private_value jsonb; rights_value jsonb; public_canonical text; private_canonical text; rights_canonical text;
begin
  select public_json,private_json,rights_json,public_text,private_text,rights_text into public_value,private_value,rights_value,public_canonical,private_canonical,rights_canonical from publish_bundle;
  published_id := private.publish_content_revision_v1(
    public_value, private_value, rights_value,
    public_canonical, private_canonical, rights_canonical,
    '1.0.0'
  );
  if published_id <> 'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid then raise exception 'PUBLISH_ID_MISMATCH'; end if;
  begin
    perform private.publish_content_revision_v1(
      public_value || jsonb_build_object('finalAnswer','must-not-leak'), private_value, rights_value,
      public_canonical, private_canonical, rights_canonical, '1.0.0'
    );
    raise exception 'PUBLIC_SECRET_KEY_ACCEPTED';
  exception when sqlstate '22023' then
    if sqlerrm <> 'PUBLIC_CONTENT_SHAPE_INVALID' then raise; end if;
  end;
end
$$;
reset role;
set local role anon;
do $$
begin
  if not exists (select 1 from public.game_content_catalog where content_revision_id='ffffffff-ffff-4fff-8fff-ffffffffffff') then raise exception 'PUBLIC_REVISION_MISSING'; end if;
end
$$;
reset role;
select pass('deployment role publishes public and private artifacts atomically with attestation and rejects extra public keys');

select * from finish();
rollback;
