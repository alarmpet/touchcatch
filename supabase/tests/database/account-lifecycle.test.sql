begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_function('private','ensure_account_v1',array['uuid'],'account bootstrap exists');
select has_function('private','read_me_v1',array['uuid'],'authoritative me projection exists');
select ok((select not rolcanlogin and not rolinherit from pg_roles where rolname='account_security_owner'),'account owner is NOLOGIN NOINHERIT');
select ok(has_function_privilege('app_server','private.ensure_account_v1(uuid)','EXECUTE'),'app server can bootstrap');
select ok(has_function_privilege('app_server','private.read_me_v1(uuid)','EXECUTE'),'app server can read me');
select ok(not has_function_privilege('authenticated','private.ensure_account_v1(uuid)','EXECUTE'),'client cannot bootstrap');
select ok(not has_table_privilege('app_server','private.economy_subjects','SELECT'),'app server cannot directly read economy subjects');
select ok(not has_table_privilege('app_server','private.economy_subjects','INSERT'),'app server cannot directly create economy subjects');
select ok(not has_column_privilege('authenticated','public.profiles','gacha_points','SELECT'),'legacy points are hidden');
select ok(not has_column_privilege('authenticated','public.profiles','level','SELECT'),'legacy level is hidden');
select ok(not has_column_privilege('authenticated','public.profiles','exp','SELECT'),'legacy exp is hidden');

insert into auth.users(id,aud,role,email,raw_user_meta_data) values('10000000-0000-4000-8000-000000000777','authenticated','authenticated','private-name@example.test','{"name":"Private Name"}');
set local role app_server;
select private.ensure_account_v1('10000000-0000-4000-8000-000000000777');
reset role;
select is((private.read_me_v1('10000000-0000-4000-8000-000000000777')->'profile'->>'displayName') like 'Player-%',true,'nickname is non-PII');
select isnt(private.read_me_v1('10000000-0000-4000-8000-000000000777')->'profile'->>'displayName','Private Name','provider metadata is not copied');
select is((private.read_me_v1('10000000-0000-4000-8000-000000000777')->>'points')::bigint,0::bigint,'points come from economy subject');
select is((select count(*)::int from public.profiles where id='10000000-0000-4000-8000-000000000777'),1,'one profile exists');
select is((select count(*)::int from private.economy_subjects where user_id='10000000-0000-4000-8000-000000000777'),1,'one economy subject exists');

select * from finish();
rollback;
