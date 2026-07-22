-- New game accounts use the approved hard-deletion policy. Legacy quarantine
-- retention is deliberately outside this lifecycle.
do $$begin execute format('grant account_security_owner to %I',current_user); end$$;
grant usage,create on schema private to account_security_owner;
set role account_security_owner;

update private.account_deletion_jobs
set status = 'READY', deletion_mode = 'HARD'
where status = 'WAITING_FOR_POLICY';

alter table private.account_deletion_jobs
  alter column status set default 'READY',
  alter column deletion_mode set default 'HARD',
  alter column deletion_mode set not null;

alter table private.account_deletion_jobs
  drop constraint if exists account_deletion_jobs_status_check,
  drop constraint if exists account_deletion_jobs_deletion_mode_check,
  drop constraint if exists account_deletion_jobs_check;

alter table private.account_deletion_jobs
  add constraint account_deletion_jobs_status_check check(status in ('READY','LEASED','AUTH_DELETED','COMPLETE')),
  add constraint account_deletion_jobs_deletion_mode_check check(deletion_mode = 'HARD');

create or replace function private.request_account_deletion_v1(auth_sub uuid,requested_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare subject private.api_subjects; job private.account_deletion_jobs;
begin
  select * into strict subject from private.api_subjects where user_id=auth_sub for update;
  select * into job from private.account_deletion_jobs where subject_key=subject.subject_key;
  if found then
    if job.idempotency_key <> requested_idempotency_key then raise exception using message='IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('jobId',job.job_id,'status','DELETING','policyPending',false);
  end if;
  update private.api_subjects set account_state='DELETING' where subject_key=subject.subject_key;
  insert into private.account_deletion_jobs(auth_sub,subject_key,idempotency_key,status,deletion_mode)
  values(auth_sub,subject.subject_key,requested_idempotency_key,'READY','HARD') returning * into job;
  return jsonb_build_object('jobId',job.job_id,'status','DELETING','policyPending',false);
end$$;

alter function private.request_account_deletion_v1(uuid,uuid) owner to account_security_owner;
revoke all on function private.request_account_deletion_v1(uuid,uuid) from public,anon,authenticated,service_role,deployment_role,economy_server,admin_publish_role,account_worker,account_deletion_policy_role;
grant execute on function private.request_account_deletion_v1(uuid,uuid) to app_server;

drop function private.approve_account_deletion_policy_v1(uuid,text);
reset role;

revoke usage on schema private from account_deletion_policy_role;
revoke create on schema private from account_security_owner;
do $$begin execute format('revoke account_security_owner from %I',current_user); end$$;
