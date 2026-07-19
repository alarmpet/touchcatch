begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select has_column('private','api_subjects','account_state','account state is DB authoritative');
select has_table('private','account_deletion_jobs','durable deletion jobs exist');
select has_function('private','request_account_deletion_v1',array['uuid','uuid'],'idempotent deletion admission exists');
select has_function('private','update_profile_v1',array['uuid','uuid','text'],'DB-authoritative nickname update exists');
select ok(has_function_privilege('app_server','private.request_account_deletion_v1(uuid,uuid)','EXECUTE'),'app server can request deletion');
select ok(not has_table_privilege('app_server','private.account_deletion_jobs','SELECT'),'app server cannot inspect deletion jobs');

insert into auth.users(id,aud,role,email) values('10000000-0000-4000-8000-000000000778','authenticated','authenticated','delete-me@example.test');
grant usage on schema extensions to app_server;
set local role app_server;
select private.ensure_account_v1('10000000-0000-4000-8000-000000000778');
select extensions.is((private.update_profile_v1('10000000-0000-4000-8000-000000000778','20000000-0000-4000-8000-000000000001',U&'  e\0301  ')->'profile'->>'displayName')::text,U&'\00E9'::text,'nickname is NFC-normalized in DB'::text);
select extensions.is((private.update_profile_v1('10000000-0000-4000-8000-000000000778','20000000-0000-4000-8000-000000000001',U&'\00E9')->'profile'->>'displayName')::text,U&'\00E9'::text,'canonical-equivalent replay has one identity'::text);
select extensions.throws_ok($$select private.update_profile_v1('10000000-0000-4000-8000-000000000778','20000000-0000-4000-8000-000000000002','')$$,'VALIDATION_FAILED'::text,'empty nickname rejected in DB'::text);
select extensions.is((private.request_account_deletion_v1('10000000-0000-4000-8000-000000000778','20000000-0000-4000-8000-000000000003')->>'status')::text,'DELETING'::text,'deletion moves admission state'::text);
select extensions.is((private.request_account_deletion_v1('10000000-0000-4000-8000-000000000778','20000000-0000-4000-8000-000000000003')->>'status')::text,'DELETING'::text,'same request replays'::text);
select extensions.throws_ok($$select private.request_account_deletion_v1('10000000-0000-4000-8000-000000000778','20000000-0000-4000-8000-000000000004')$$,'IDEMPOTENCY_CONFLICT'::text,'different deletion key conflicts'::text);
select extensions.throws_ok($$select private.ensure_account_v1('10000000-0000-4000-8000-000000000778')$$,'ACCOUNT_DELETING'::text,'bootstrap cannot resurrect deleting account'::text);
select extensions.throws_ok($$select private.read_me_v1('10000000-0000-4000-8000-000000000778')$$,'ACCOUNT_DELETING'::text,'issued-token read is blocked'::text);
select extensions.throws_ok($$select private.merge_learning_progress_v1('10000000-0000-4000-8000-000000000778','20000000-0000-4000-8000-000000000005',repeat('a',64),'[{"deviceEventId":"20000000-0000-4000-8000-000000000006","contentKey":"public-sample-english","contentRevision":"1","completedAt":"2026-07-20T00:00:00Z"}]')$$,'ACCOUNT_DELETING'::text,'mutation cannot race past deletion admission'::text);
select extensions.ok(exists(select 1 from pg_catalog.pg_constraint where conrelid='private.account_deletion_jobs'::regclass and pg_catalog.pg_get_constraintdef(oid) like '%status <> ''WAITING_FOR_POLICY''%deletion_mode IS NOT NULL%'),'policy-unapproved job cannot advance'::text);
reset role;

select is((select account_state from private.api_subjects where user_id='10000000-0000-4000-8000-000000000778'),'DELETING','state transition is durable');
select is((select status from private.account_deletion_jobs where auth_sub='10000000-0000-4000-8000-000000000778'),'WAITING_FOR_POLICY','hard versus soft deletion remains policy blocked');
select is((select count(*)::int from private.account_deletion_jobs where auth_sub='10000000-0000-4000-8000-000000000778'),1,'one opaque job exists');
select has_function('private','approve_account_deletion_policy_v1',array['uuid','text'],'policy approval projection exists');
select has_function('private','claim_account_deletion_job_v1',array['uuid','integer'],'worker lease claim exists');
select has_function('private','checkpoint_account_auth_deleted_v1',array['uuid','uuid','integer'],'fenced Auth checkpoint exists');
select has_function('private','finalize_account_deletion_v1',array['uuid'],'terminal finalizer exists');
select ok((select not rolcanlogin and not rolinherit from pg_roles where rolname='account_worker'),'account worker role is NOLOGIN NOINHERIT');
select ok((select not rolcanlogin and not rolinherit from pg_roles where rolname='account_deletion_policy_role'),'policy role is NOLOGIN NOINHERIT');
select ok(not has_table_privilege('account_worker','private.account_deletion_jobs','SELECT'),'worker cannot read jobs directly');

grant usage on schema extensions to account_worker,account_deletion_policy_role;
create temporary table job_to_approve(job_id uuid);
insert into job_to_approve select job_id from private.account_deletion_jobs where subject_key=(select subject_key from private.api_subjects where user_id='10000000-0000-4000-8000-000000000778');
grant select on job_to_approve to account_deletion_policy_role;
set local role account_deletion_policy_role;
select extensions.ok(private.approve_account_deletion_policy_v1((select job_id from job_to_approve),'HARD'),'explicit policy approval advances one job');
reset role;
create temporary table claimed_lease(value jsonb);
grant all on claimed_lease to account_worker;
set local role account_worker;
insert into claimed_lease select private.claim_account_deletion_job_v1('30000000-0000-4000-8000-000000000001',30000);
select extensions.ok(private.checkpoint_account_auth_deleted_v1((select (value->>'jobId')::uuid from claimed_lease),(select (value->>'leaseToken')::uuid from claimed_lease),(select (value->>'leaseGeneration')::int from claimed_lease)),'matching fence records Auth deletion');
select extensions.ok(private.finalize_account_deletion_v1((select (value->>'jobId')::uuid from claimed_lease)),'checkpointed job finalizes');
reset role;
select is((select auth_sub from private.account_deletion_jobs where job_id=(select (value->>'jobId')::uuid from claimed_lease)),null::uuid,'terminal checkpoint scrubs auth UUID');

select * from finish();
rollback;
