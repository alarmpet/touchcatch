begin;
set local statement_timeout = '20s';
create extension if not exists pgtap with schema extensions;
select plan(26);

do $$begin execute format('grant economy_security_owner to %I', current_user); end$$;

-- A subject with something to lose, so "disposal deleted the rows" is a claim with evidence
-- behind it rather than a function that ran against nothing.
insert into auth.users(id, aud, role, email)
values ('44444444-4444-4444-8444-000000000001','authenticated','authenticated','delete-me@example.test');

set local role economy_server;
select private.ensure_mobile_account_v1('44444444-4444-4444-8444-000000000001');
reset role;

create temp table subject_under_test on commit drop as
select subject_key from private.economy_subjects where user_id = '44444444-4444-4444-8444-000000000001';

-- The economy ledgers all carry interlocking constraints that tie a row to a claim or a
-- promotion, so the one table that can be seeded on its own is the pity state. It is enough:
-- what is under test is that the disposal reaches a subject_key-keyed row at all.
insert into private.gacha_pity_state(
  subject_key, pity_series_id, pity_semantics_hash, rare_counter, legendary_counter,
  economy_version, economy_hash, catalog_revision, catalog_hash)
select subject_key, 'series-1', repeat('a', 64), 3, 7,
       '1.0.0', repeat('b', 64), 'rev-1', repeat('c', 64)
from subject_under_test;

select is(
  (select count(*)::int from private.gacha_pity_state g join subject_under_test s using (subject_key)),
  1, 'seeded subject data exists before deletion');

-- Roles ------------------------------------------------------------------------------------

select ok(
  (select not rolcanlogin and not rolinherit from pg_roles where rolname = 'privacy_worker'),
  'privacy worker group is NOLOGIN NOINHERIT');
select ok(
  not pg_has_role('economy_server','privacy_worker','MEMBER'),
  'the API role is not a member of the worker role');
select ok(
  not pg_has_role('privacy_worker','economy_server','MEMBER'),
  'the worker role is not a member of the API role');

-- The grant split is the whole security argument for answering 202 before anything is deleted.
select ok(
  not has_function_privilege('economy_server','private.dispose_account_app_data_v1(uuid,uuid,bigint)','EXECUTE'),
  'the API role cannot dispose of account data');
select ok(
  not has_function_privilege('economy_server','private.claim_account_deletion_v1(uuid,integer,integer)','EXECUTE'),
  'the API role cannot claim a deletion request');
select ok(
  has_function_privilege('privacy_worker','private.dispose_account_app_data_v1(uuid,uuid,bigint)','EXECUTE'),
  'the worker role can dispose of account data');
select ok(
  not has_function_privilege('authenticated','private.dispose_account_app_data_v1(uuid,uuid,bigint)','EXECUTE')
  and not has_function_privilege('anon','private.dispose_account_app_data_v1(uuid,uuid,bigint)','EXECUTE')
  and not has_function_privilege('service_role','private.dispose_account_app_data_v1(uuid,uuid,bigint)','EXECUTE'),
  'client and service roles cannot dispose of account data');

-- Request and claim -------------------------------------------------------------------------

set local role economy_server;
select private.request_account_deletion_v1(
  '44444444-4444-4444-8444-000000000001',
  'idempotency-key-000000000001',
  repeat('a', 64),
  interval '30 days'
);
reset role;

select is(
  (select state from private.account_deletion_requests
   where authenticated_user_id = '44444444-4444-4444-8444-000000000001'),
  'ACCESS_BLOCKED', 'request commits in the access-blocked state');

select is(
  (select count(*)::int from private.account_access_tombstones t join subject_under_test s using (subject_key)),
  1, 'the tombstone commits with the request');

create temp table claim_one on commit drop as
select private.claim_account_deletion_v1('55555555-5555-4555-8555-000000000001', 60, 8) as response;

select is((select (response->>'claimed')::boolean from claim_one), true, 'a workable request is claimable');
select is((select (response->>'fence')::bigint from claim_one), 1::bigint, 'the first claim fences at one');

-- A second worker must not get the same row while the lease holds.
select is(
  (select (private.claim_account_deletion_v1('66666666-6666-4666-8666-000000000001', 60, 8)->>'claimed')::boolean),
  false, 'a leased request is not claimable by a second worker');

-- Fencing ------------------------------------------------------------------------------------

-- The right token with a stale fence is exactly the returning-zombie case the fence exists for.
select throws_ok(
  $$select private.dispose_account_app_data_v1(
      (select request_id from private.account_deletion_requests limit 1),
      '55555555-5555-4555-8555-000000000001', 0)$$,
  'P0001', 'LEASE_LOST', 'a stale fence cannot dispose');

select throws_ok(
  $$select private.dispose_account_app_data_v1(
      (select request_id from private.account_deletion_requests limit 1),
      '99999999-9999-4999-8999-000000000001', 1)$$,
  'P0001', 'LEASE_LOST', 'a foreign owner token cannot dispose');

-- Disposal -----------------------------------------------------------------------------------

create temp table disposal on commit drop as
select private.dispose_account_app_data_v1(
  (select request_id from private.account_deletion_requests limit 1),
  '55555555-5555-4555-8555-000000000001',
  1) as response;

select ok((select (response->>'deletedRows')::bigint > 0 from disposal), 'disposal removed rows');

select is(
  (select count(*)::int from private.gacha_pity_state g join subject_under_test s using (subject_key)),
  0, 'seeded subject data is gone');
select is(
  (select count(*)::int from private.economy_subjects s join subject_under_test u using (subject_key)),
  0, 'the subject root is gone');
select is(
  (select count(*)::int from public.profiles where id = '44444444-4444-4444-8444-000000000001'),
  0, 'the profile is gone');

-- The two audit tables are the reason a receipt still resolves after everything else is removed.
select is(
  (select count(*)::int from private.account_deletion_requests
   where authenticated_user_id = '44444444-4444-4444-8444-000000000001'),
  1, 'the deletion request survives the deletion it records');
select is(
  (select count(*)::int from private.account_access_tombstones t join subject_under_test s using (subject_key)),
  1, 'the tombstone survives, so access stays closed');

-- auth.users is the Auth Admin API's to remove; SQL here must not have touched it.
select is(
  (select count(*)::int from auth.users where id = '44444444-4444-4444-8444-000000000001'),
  1, 'the auth user is left to the Auth Admin API');

select is(
  (select state from private.account_deletion_requests
   where authenticated_user_id = '44444444-4444-4444-8444-000000000001'),
  'APP_DATA_DISPOSED', 'the request advances to app-data-disposed');

-- Effect journal -------------------------------------------------------------------------------

select is(
  (select outcome from private.account_deletion_effects where stage = 'APP_DATA'),
  'COMPLETED', 'the disposal is recorded in the effect journal');

select throws_ok(
  $$update private.account_deletion_effects set outcome = 'NOT_APPLICABLE'$$,
  'P0001', 'EFFECT_JOURNAL_IMMUTABLE', 'the effect journal cannot be rewritten');

select throws_ok(
  $$delete from private.account_deletion_effects$$,
  'P0001', 'EFFECT_JOURNAL_IMMUTABLE', 'the effect journal cannot be erased');

select * from finish();
rollback;
