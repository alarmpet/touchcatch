begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
select has_function('private','merge_learning_progress_v1',array['uuid','uuid','text','jsonb'],'merge function exists');
select ok((select not rolcanlogin and not rolinherit from pg_roles where rolname='learning_security_owner'),'learning owner is isolated');
select ok(has_function_privilege('app_server','private.merge_learning_progress_v1(uuid,uuid,text,jsonb)','EXECUTE'),'app server may merge');
select ok(not has_function_privilege('authenticated','private.merge_learning_progress_v1(uuid,uuid,text,jsonb)','EXECUTE'),'client cannot merge');
select ok(not has_table_privilege('app_server','private.learning_progress_events','SELECT'),'app server has no direct event access');
select ok(not has_table_privilege('app_server','private.learning_progress_batches','SELECT'),'app server has no direct batch access');

insert into auth.users(id,aud,role,email) values('20000000-0000-4000-8000-000000000001','authenticated','authenticated','progress@example.test');
set local role app_server; select private.ensure_account_v1('20000000-0000-4000-8000-000000000001'); reset role;
do $$begin execute format('grant game_security_owner to %I',current_user); end$$;
set local role game_security_owner;
insert into public.game_content_revisions(content_revision_id,content_id,version,schema_version,asset_policy_version,public_content,public_content_hash,status,approved_at,rights_manifest_set_id,validator_version)
values('20000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000011',1,'1.0.0','1.0.0','{"theme":"published-sample"}',repeat('a',64),'PUBLISHED',now(),'progress-rights','1.0.0');
reset role;
do $$begin execute format('revoke game_security_owner from %I',current_user); end$$;

set local role app_server;
create temporary table progress_result as select private.merge_learning_progress_v1('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000020',repeat('b',64),'[{"deviceEventId":"20000000-0000-4000-8000-000000000030","contentKey":"published-sample","contentRevision":"1","completedAt":"2026-07-19T00:00:00Z"}]') value;
reset role;
select ok((select value->'acceptedEventIds'->>0 from progress_result)='20000000-0000-4000-8000-000000000030','published event accepted');
select is(private.merge_learning_progress_v1('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000020',repeat('b',64),'[{"deviceEventId":"20000000-0000-4000-8000-000000000030","contentKey":"published-sample","contentRevision":"1","completedAt":"2026-07-19T00:00:00Z"}]'),(select value from progress_result),'batch replay returns exact response');
select throws_ok($$select private.merge_learning_progress_v1('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000020',repeat('c',64),'[{"deviceEventId":"20000000-0000-4000-8000-000000000030","contentKey":"published-sample","contentRevision":"1","completedAt":"2026-07-19T00:00:00Z"}]')$$,'P0001','IDEMPOTENCY_CONFLICT','changed batch conflicts');
select is(private.merge_learning_progress_v1('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000021',repeat('d',64),'[{"deviceEventId":"20000000-0000-4000-8000-000000000031","contentKey":"missing","contentRevision":"1","completedAt":"2026-07-19T00:00:00Z"}]')->'rejected'->0->>'code','UNKNOWN_CONTENT','unknown content rejected');
select is(private.merge_learning_progress_v1('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000023',repeat('f',64),'[{"deviceEventId":"20000000-0000-4000-8000-000000000033","contentKey":"published-sample","contentRevision":"2","completedAt":"2026-07-19T00:00:00Z"}]')->'rejected'->0->>'code','REVISION_MISMATCH','revision mismatch rejected');
select is(private.merge_learning_progress_v1('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000024',repeat('1',64),'[{"deviceEventId":"20000000-0000-4000-8000-000000000030","contentKey":"published-sample","contentRevision":"1","completedAt":"2026-07-19T00:00:01Z"}]')->'rejected'->0->>'code','DEVICE_EVENT_CONFLICT','changed device event rejected');
select is(private.merge_learning_progress_v1('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000025',repeat('2',64),'[{"deviceEventId":"20000000-0000-4000-8000-000000000034","contentKey":"public-sample-english","contentRevision":"1","completedAt":"2026-07-19T00:00:00Z"}]')->'acceptedEventIds'->>0,'20000000-0000-4000-8000-000000000034','authoritative guest manifest event accepted');
select throws_ok($$select private.merge_learning_progress_v1('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000022',repeat('e',64),'[{"deviceEventId":"20000000-0000-4000-8000-000000000032","contentKey":"published-sample","contentRevision":"1","completedAt":"2026-07-19T00:00:00Z","points":100}]')$$,'P0001','INVALID_PROGRESS_EVENT','economic field rejected');
do $$begin execute format('grant game_security_owner to %I',current_user); end$$; set local role game_security_owner;
insert into public.game_content_revisions(content_revision_id,content_id,version,schema_version,asset_policy_version,public_content,public_content_hash,status,approved_at,rights_manifest_set_id,validator_version) values('20000000-0000-4000-8000-000000000040','20000000-0000-4000-8000-000000000041',1,'1.0.0','1.0.0','{"theme":"published-sample"}',repeat('3',64),'PUBLISHED',now(),'progress-rights-2','1.0.0');
reset role; do $$begin execute format('revoke game_security_owner from %I',current_user); end$$;
select is(private.merge_learning_progress_v1('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000026',repeat('4',64),'[{"deviceEventId":"20000000-0000-4000-8000-000000000035","contentKey":"published-sample","contentRevision":"1","completedAt":"2026-07-19T00:00:00Z"}]')->'rejected'->0->>'code','CONTENT_AMBIGUOUS','ambiguous published mapping rejected');
select is((select count(*)::int from private.learning_progress_events),2,'only accepted events persisted');
select * from finish();
rollback;
