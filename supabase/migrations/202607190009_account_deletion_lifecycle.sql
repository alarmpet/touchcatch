do $$begin execute format('grant account_security_owner to %I',current_user); end$$;
do $$begin execute format('grant learning_security_owner to %I',current_user); end$$;
do $$begin if not exists(select 1 from pg_roles where rolname='account_worker') then create role account_worker nologin noinherit nosuperuser nocreatedb nocreaterole noreplication; end if; end$$;
do $$begin if not exists(select 1 from pg_roles where rolname='account_deletion_policy_role') then create role account_deletion_policy_role nologin noinherit nosuperuser nocreatedb nocreaterole noreplication; end if; end$$;
grant usage,create on schema private to account_security_owner;

alter table private.api_subjects add column account_state text not null default 'ACTIVE'
  check(account_state in ('ACTIVE','DELETING'));
alter table private.api_subjects add column nickname_digest_key bytea not null default extensions.gen_random_bytes(32);

create function private.reject_inactive_learning_mutation_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if not exists(select 1 from private.api_subjects where subject_key=new.subject_key and account_state='ACTIVE' for share) then raise exception using message='ACCOUNT_DELETING'; end if;
  return new;
end$$;

grant update(nickname) on public.profiles to account_security_owner;
grant update(account_state) on private.api_subjects to account_security_owner;

create table private.profile_update_decisions (
  subject_key uuid not null references private.api_subjects(subject_key) on delete cascade,
  idempotency_key uuid not null check(idempotency_key::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  nickname_hash text not null check(nickname_hash ~ '^[0-9a-f]{64}$'),
  decided_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(subject_key,idempotency_key)
);
alter table private.profile_update_decisions owner to account_security_owner;

create table private.account_deletion_jobs (
  job_id uuid primary key default extensions.uuid_generate_v4(),
  auth_sub uuid unique,
  subject_key uuid not null,
  idempotency_key uuid not null,
  status text not null default 'WAITING_FOR_POLICY' check(status in ('WAITING_FOR_POLICY','READY','LEASED','AUTH_DELETED','COMPLETE')),
  deletion_mode text check(deletion_mode in ('HARD','SOFT')),
  lease_token uuid,
  lease_generation integer not null default 0 check(lease_generation >= 0),
  lease_expires_at timestamptz,
  checkpoint_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(subject_key,idempotency_key),
  check((status='WAITING_FOR_POLICY' and deletion_mode is null) or (status<>'WAITING_FOR_POLICY' and deletion_mode is not null)),
  check((status='LEASED')=(lease_token is not null and lease_expires_at is not null))
);
alter table private.account_deletion_jobs owner to account_security_owner;

set role learning_security_owner;
create trigger learning_events_account_active before insert or update on private.learning_progress_events for each row execute function private.reject_inactive_learning_mutation_v1();
create trigger learning_batches_account_active before insert or update on private.learning_progress_batches for each row execute function private.reject_inactive_learning_mutation_v1();
reset role;

revoke all on private.profile_update_decisions,private.account_deletion_jobs from public,anon,authenticated,service_role,app_server,deployment_role,economy_server,admin_publish_role;

set role account_security_owner;
create or replace function private.assert_account_active_v1(auth_sub uuid) returns private.api_subjects
language plpgsql stable security definer set search_path=pg_catalog as $$
declare subject private.api_subjects;
begin
  select * into strict subject from private.api_subjects where user_id=auth_sub;
  if subject.account_state <> 'ACTIVE' then raise exception using message='ACCOUNT_DELETING'; end if;
  return subject;
end$$;

create or replace function private.ensure_account_v1(auth_sub uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare api_key uuid; economy_key uuid; display_name text; state text;
begin
  if auth_sub is null then raise exception using message='ACCOUNT_SUBJECT_INVALID'; end if;
  insert into private.api_subjects(user_id) values(auth_sub) on conflict(user_id) do nothing;
  select subject_key,account_state into strict api_key,state from private.api_subjects where user_id=auth_sub for update;
  if state <> 'ACTIVE' then raise exception using message='ACCOUNT_DELETING'; end if;
  display_name := 'Player-' || upper(substr(replace(api_key::text,'-',''),1,8));
  insert into public.profiles(id,nickname) values(auth_sub,display_name) on conflict(id) do nothing;
  insert into private.economy_subjects(user_id) values(auth_sub) on conflict(user_id) do nothing;
  select subject_key into strict economy_key from private.economy_subjects where user_id=auth_sub;
  select nickname into strict display_name from public.profiles where id=auth_sub;
  return jsonb_build_object('apiSubjectKey',api_key,'economySubjectKey',economy_key,'nickname',display_name);
end$$;

create or replace function private.read_me_v1(auth_sub uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
  perform private.assert_account_active_v1(auth_sub);
  select jsonb_build_object('profile',jsonb_build_object('displayName',p.nickname),'points',e.gacha_points) into result
  from public.profiles p join private.economy_subjects e on e.user_id=p.id where p.id=auth_sub;
  return result;
end$$;

create function private.update_profile_v1(auth_sub uuid,requested_idempotency_key uuid,requested_nickname text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare subject private.api_subjects; normalized text; nickname_hash text; prior private.profile_update_decisions; points bigint;
begin
  select * into strict subject from private.api_subjects where user_id=auth_sub for update;
  if subject.account_state <> 'ACTIVE' then raise exception using message='ACCOUNT_DELETING'; end if;
  normalized := pg_catalog.normalize(pg_catalog.regexp_replace(pg_catalog.btrim(requested_nickname), '\s+', ' ', 'g'));
  if normalized is null or pg_catalog.char_length(normalized) not between 1 and 40 or normalized ~ '[[:cntrl:]​-‏‪-‮⁠-⁯﻿]' then raise exception using message='VALIDATION_FAILED'; end if;
  nickname_hash := pg_catalog.encode(extensions.hmac(pg_catalog.convert_to(normalized,'UTF8'),subject.nickname_digest_key,'sha256'),'hex');
  select * into prior from private.profile_update_decisions where subject_key=subject.subject_key and idempotency_key=requested_idempotency_key;
  if found then
    if prior.nickname_hash <> nickname_hash then raise exception using message='IDEMPOTENCY_CONFLICT'; end if;
  else
    if exists(select 1 from private.profile_update_decisions where subject_key=subject.subject_key and decided_at > pg_catalog.clock_timestamp()-interval '60 seconds') then raise exception using message='RATE_LIMITED'; end if;
    update public.profiles set nickname=normalized where id=auth_sub;
    insert into private.profile_update_decisions(subject_key,idempotency_key,nickname_hash) values(subject.subject_key,requested_idempotency_key,nickname_hash);
  end if;
  select gacha_points into strict points from private.economy_subjects where user_id=auth_sub;
  return jsonb_build_object('profile',jsonb_build_object('displayName',normalized),'points',points);
end$$;

create function private.request_account_deletion_v1(auth_sub uuid,requested_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare subject private.api_subjects; job private.account_deletion_jobs;
begin
  select * into strict subject from private.api_subjects where user_id=auth_sub for update;
  select * into job from private.account_deletion_jobs where subject_key=subject.subject_key;
  if found then
    if job.idempotency_key <> requested_idempotency_key then raise exception using message='IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('jobId',job.job_id,'status','DELETING','policyPending',true);
  end if;
  update private.api_subjects set account_state='DELETING' where subject_key=subject.subject_key;
  insert into private.account_deletion_jobs(auth_sub,subject_key,idempotency_key) values(auth_sub,subject.subject_key,requested_idempotency_key) returning * into job;
  return jsonb_build_object('jobId',job.job_id,'status','DELETING','policyPending',true);
end$$;

create function private.approve_account_deletion_policy_v1(requested_job_id uuid,requested_mode text) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if requested_mode not in ('HARD','SOFT') then raise exception using message='INVALID_DELETION_MODE'; end if;
  update private.account_deletion_jobs set status='READY',deletion_mode=requested_mode where job_id=requested_job_id and status='WAITING_FOR_POLICY';
  return found;
end$$;

create function private.claim_account_deletion_job_v1(worker_id uuid,requested_lease_ms integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare job private.account_deletion_jobs; token uuid;
begin
  if worker_id is null or requested_lease_ms not between 1000 and 300000 then raise exception using message='INVALID_LEASE_REQUEST'; end if;
  select * into job from private.account_deletion_jobs where status='READY' or (status='LEASED' and lease_expires_at <= pg_catalog.clock_timestamp()) order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  token := extensions.uuid_generate_v4();
  update private.account_deletion_jobs set status='LEASED',lease_token=token,lease_generation=lease_generation+1,lease_expires_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>requested_lease_ms::double precision/1000),checkpoint_at=null where job_id=job.job_id returning * into job;
  return jsonb_build_object('jobId',job.job_id,'authSub',job.auth_sub,'deletionMode',job.deletion_mode,'leaseToken',job.lease_token,'leaseGeneration',job.lease_generation);
end$$;

create function private.checkpoint_account_auth_deleted_v1(requested_job_id uuid,requested_lease_token uuid,requested_generation integer) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
  update private.account_deletion_jobs set status='AUTH_DELETED',auth_sub=null,lease_token=null,lease_expires_at=null,checkpoint_at=pg_catalog.clock_timestamp()
  where job_id=requested_job_id and status='LEASED' and lease_token=requested_lease_token and lease_generation=requested_generation and lease_expires_at>pg_catalog.clock_timestamp();
  return found;
end$$;

create function private.finalize_account_deletion_v1(requested_job_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
  update private.account_deletion_jobs set status='COMPLETE' where job_id=requested_job_id and status='AUTH_DELETED' and auth_sub is null and checkpoint_at is not null;
  return found;
end$$;
reset role;

alter function private.assert_account_active_v1(uuid) owner to account_security_owner;
alter function private.reject_inactive_learning_mutation_v1() owner to account_security_owner;
alter function private.ensure_account_v1(uuid) owner to account_security_owner;
alter function private.read_me_v1(uuid) owner to account_security_owner;
alter function private.update_profile_v1(uuid,uuid,text) owner to account_security_owner;
alter function private.request_account_deletion_v1(uuid,uuid) owner to account_security_owner;
alter function private.approve_account_deletion_policy_v1(uuid,text) owner to account_security_owner;
alter function private.claim_account_deletion_job_v1(uuid,integer) owner to account_security_owner;
alter function private.checkpoint_account_auth_deleted_v1(uuid,uuid,integer) owner to account_security_owner;
alter function private.finalize_account_deletion_v1(uuid) owner to account_security_owner;
revoke all on function private.assert_account_active_v1(uuid),private.reject_inactive_learning_mutation_v1(),private.update_profile_v1(uuid,uuid,text),private.request_account_deletion_v1(uuid,uuid) from public,anon,authenticated,service_role,deployment_role,economy_server,admin_publish_role;
grant execute on function private.update_profile_v1(uuid,uuid,text),private.request_account_deletion_v1(uuid,uuid) to app_server;
revoke all on function private.approve_account_deletion_policy_v1(uuid,text),private.claim_account_deletion_job_v1(uuid,integer),private.checkpoint_account_auth_deleted_v1(uuid,uuid,integer),private.finalize_account_deletion_v1(uuid) from public,anon,authenticated,service_role,app_server,deployment_role,economy_server,admin_publish_role;
grant usage on schema private to account_worker,account_deletion_policy_role;
grant execute on function private.approve_account_deletion_policy_v1(uuid,text) to account_deletion_policy_role;
grant execute on function private.claim_account_deletion_job_v1(uuid,integer),private.checkpoint_account_auth_deleted_v1(uuid,uuid,integer),private.finalize_account_deletion_v1(uuid) to account_worker;
revoke create on schema private from account_security_owner;
do $$begin execute format('revoke account_security_owner from %I',current_user); end$$;
do $$begin execute format('revoke learning_security_owner from %I',current_user); end$$;
