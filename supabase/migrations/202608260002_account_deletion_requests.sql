-- Durable account-deletion requests and the access tombstone that makes 202 honest.
--
-- The deletion path this replaces answered 200 {"deleted":true} while doing nothing. The fix is
-- not to make the HTTP call delete more inside the request: auth deletion, provider unlink and
-- app-data disposal are separate systems that fail independently, and a response that waits for
-- all three either lies or hangs.
--
-- Instead the request itself is durable. The row and the tombstone commit in ONE transaction, so
-- the moment the caller sees 202 the account can no longer be used, whatever happens afterwards.
-- A worker with its own credentials advances the stages. Nothing here deletes anything yet --
-- disposal per table is a human decision recorded in docs/legal, and the worker refuses to run
-- until that approval exists.
--
-- Two things deliberately have no foreign key to the user:
--   * the request row must outlive auth.users deletion, or the receipt stops resolving exactly
--     when the person most needs to check that it finished;
--   * the tombstone is the record that a subject_key is closed, so it cannot cascade away with
--     the subject it closes.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'privacy_operator') then
    create role privacy_operator nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  end if;
end
$$;

do $$
begin
  execute format('grant economy_security_owner to %I', current_user);
end
$$;

-- The functions below are handed to economy_security_owner, and reassigning ownership requires
-- the incoming owner to hold CREATE on the schema. Every migration since 202607300002 grants it
-- here and revokes it at the end, because leaving it on would let a security-owner role create
-- objects in `private` outside a migration.
grant create on schema private to economy_security_owner;

create table private.account_deletion_requests (
  request_id uuid primary key default extensions.uuid_generate_v4(),
  authenticated_user_id uuid not null,
  subject_key uuid not null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  -- Only the hash. The 256-bit receipt secret is generated on the device, stored there before
  -- the request is sent, and never travels back: a secret the server could return is a secret
  -- that lands in logs and crash reports.
  receipt_hash text not null unique check (receipt_hash ~ '^[a-f0-9]{64}$'),
  state text not null check (state in (
    'ACCESS_BLOCKED','APP_DATA_DISPOSED','PROVIDERS_REVOKED','AUTH_DELETED','COMPLETED',
    'FAILED_RETRYABLE','FAILED_PERMANENT','MANUAL_REVIEW','BLOCKED_LEGAL_HOLD'
  )),
  stage_app_data text not null default 'PENDING' check (stage_app_data in ('PENDING','COMPLETED','NOT_APPLICABLE','FAILED_RETRYABLE','FAILED_PERMANENT')),
  stage_providers text not null default 'PENDING' check (stage_providers in ('PENDING','COMPLETED','NOT_APPLICABLE','FAILED_RETRYABLE','FAILED_PERMANENT')),
  stage_auth text not null default 'PENDING' check (stage_auth in ('PENDING','COMPLETED','NOT_APPLICABLE','FAILED_RETRYABLE','FAILED_PERMANENT')),
  stage_notification text not null default 'PENDING' check (stage_notification in ('PENDING','COMPLETED','NOT_APPLICABLE','FAILED_RETRYABLE','FAILED_PERMANENT')),
  failure_code text check (failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  receipt_expires_at timestamptz not null,
  completed_at timestamptz,
  unique (authenticated_user_id, idempotency_key),
  -- COMPLETED is the only state that may carry a completion time, and it must carry one.
  check ((state = 'COMPLETED') = (completed_at is not null)),
  check (receipt_expires_at > created_at)
);

-- One open request per person. A second tap, a retry from a flaky network, or a duplicate from
-- the public portal must join the request already running rather than start a rival one.
create unique index account_deletion_requests_one_open_per_user
  on private.account_deletion_requests (authenticated_user_id)
  where state not in ('COMPLETED','FAILED_PERMANENT');

create index account_deletion_requests_workable
  on private.account_deletion_requests (state, updated_at)
  where state not in ('COMPLETED','FAILED_PERMANENT');

create table private.account_access_tombstones (
  subject_key uuid primary key,
  authenticated_user_id uuid not null,
  request_id uuid not null references private.account_deletion_requests(request_id) on delete restrict,
  blocked_at timestamptz not null default now()
);

create index account_access_tombstones_user
  on private.account_access_tombstones (authenticated_user_id);

alter table private.account_deletion_requests enable row level security;
alter table private.account_access_tombstones enable row level security;

-- The functions below run as economy_security_owner, which does not own these tables and is
-- therefore subject to RLS like anyone else. Without both the grants and the policies the
-- security-definer path would fail closed at runtime rather than at migration time -- the worst
-- place to find out.
grant select, insert, update on private.account_deletion_requests to economy_security_owner;
grant select, insert, delete on private.account_access_tombstones to economy_security_owner;
grant select on private.account_access_tombstones to game_security_owner;
grant select on private.account_deletion_requests to privacy_operator;

create policy account_deletion_requests_owner_all
on private.account_deletion_requests
for all
to economy_security_owner
using (true)
with check (true);

create policy account_access_tombstones_owner_all
on private.account_access_tombstones
for all
to economy_security_owner
using (true)
with check (true);

create policy account_access_tombstones_ranking_read
on private.account_access_tombstones
for select
to game_security_owner
using (true);

create policy account_deletion_requests_privacy_read
on private.account_deletion_requests
for select
to privacy_operator
using (true);

-- Accepts a deletion request, or returns the one already open.
--
-- The tombstone insert shares this function's transaction with the request insert. There is no
-- window in which a request exists but access is still allowed.
create function private.request_account_deletion_v1(
  p_authenticated_user_id uuid,
  p_idempotency_key text,
  p_receipt_hash text,
  p_receipt_ttl interval
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_subject_key uuid;
  v_existing private.account_deletion_requests%rowtype;
  v_request private.account_deletion_requests%rowtype;
begin
  if p_authenticated_user_id is null or p_idempotency_key is null or p_receipt_hash is null then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST';
  end if;
  if p_receipt_ttl is null or p_receipt_ttl <= interval '0' then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST';
  end if;

  select * into v_existing
  from private.account_deletion_requests
  where authenticated_user_id = p_authenticated_user_id
    and idempotency_key = p_idempotency_key;

  if found then
    -- Replaying the same key with a different receipt is a different caller, not a retry.
    if v_existing.receipt_hash <> p_receipt_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'requestId', v_existing.request_id::text,
      'state', v_existing.state,
      'replayed', true
    );
  end if;

  select subject_key into v_subject_key
  from private.economy_subjects
  where user_id = p_authenticated_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'AUTH_SUBJECT_REQUIRED';
  end if;

  begin
    insert into private.account_deletion_requests(
      authenticated_user_id, subject_key, idempotency_key, receipt_hash, state, receipt_expires_at
    )
    values (
      p_authenticated_user_id, v_subject_key, p_idempotency_key, p_receipt_hash,
      'ACCESS_BLOCKED', pg_catalog.now() + p_receipt_ttl
    )
    returning * into v_request;
  exception
    when unique_violation then
      -- Another open request for the same person, under a different idempotency key.
      raise exception using errcode = 'P0001', message = 'DELETION_ALREADY_IN_PROGRESS';
  end;

  insert into private.account_access_tombstones(subject_key, authenticated_user_id, request_id)
  values (v_subject_key, p_authenticated_user_id, v_request.request_id)
  on conflict (subject_key) do nothing;

  return pg_catalog.jsonb_build_object(
    'requestId', v_request.request_id::text,
    'state', v_request.state,
    'replayed', false
  );
end
$$;

-- Resolves a receipt to its status. Keyed only by the receipt hash, because after AUTH_DELETED
-- there is no session left to authenticate with and the person still needs to see it finish.
create function private.read_account_deletion_status_v1(p_receipt_hash text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_request private.account_deletion_requests%rowtype;
begin
  if p_receipt_hash is null or p_receipt_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST';
  end if;

  select * into v_request
  from private.account_deletion_requests
  where receipt_hash = p_receipt_hash;

  if not found then
    raise exception using errcode = 'P0001', message = 'DELETION_REQUEST_NOT_FOUND';
  end if;
  if v_request.receipt_expires_at <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'RECEIPT_EXPIRED';
  end if;

  return pg_catalog.jsonb_build_object(
    'requestId', v_request.request_id::text,
    'state', v_request.state,
    'retryable', v_request.state in ('FAILED_RETRYABLE','MANUAL_REVIEW'),
    'stages', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('name', 'APP_DATA', 'outcome', v_request.stage_app_data),
      pg_catalog.jsonb_build_object('name', 'PROVIDERS', 'outcome', v_request.stage_providers),
      pg_catalog.jsonb_build_object('name', 'AUTH', 'outcome', v_request.stage_auth),
      pg_catalog.jsonb_build_object('name', 'NOTIFICATION', 'outcome', v_request.stage_notification)
    ),
    'updatedAt', pg_catalog.to_char(v_request.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'receiptExpiresAt', pg_catalog.to_char(v_request.receipt_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
end
$$;

-- Tells the runtime whether a subject is closed. Every authenticated read goes through this, so
-- a deletion that is still working its way through the stages already reads as gone.
create function private.is_account_access_blocked_v1(p_subject_key uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (select 1 from private.account_access_tombstones where subject_key = p_subject_key);
$$;

alter function private.request_account_deletion_v1(uuid,text,text,interval)
  owner to economy_security_owner;
alter function private.read_account_deletion_status_v1(text)
  owner to economy_security_owner;
alter function private.is_account_access_blocked_v1(uuid)
  owner to economy_security_owner;

revoke execute on function private.request_account_deletion_v1(uuid,text,text,interval)
  from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role;
revoke execute on function private.read_account_deletion_status_v1(text)
  from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role;
revoke execute on function private.is_account_access_blocked_v1(uuid)
  from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role;

-- The API may accept and report a request. It may not advance one, and it is never given the
-- credentials that could: stage advancement belongs to the worker alone.
grant execute on function private.request_account_deletion_v1(uuid,text,text,interval)
  to economy_server;
grant execute on function private.read_account_deletion_status_v1(text)
  to economy_server, privacy_operator;
grant execute on function private.is_account_access_blocked_v1(uuid)
  to economy_server, game_security_owner;

-- Every authenticated route resolves its subject through this function, so putting the tombstone
-- check here is what makes the 202 mean something: the moment the request commits, nothing the
-- account could do still works. Checking it in each handler instead would mean the next handler
-- someone adds is the one that forgets.
--
-- Re-registration is unaffected. A new sign-up mints a new auth user id, which no tombstone
-- names, so a person who deleted their account can come back as a new one.
create or replace function private.ensure_mobile_account_v1(
  p_authenticated_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_subject_key uuid;
  v_nickname text;
begin
  if p_authenticated_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'AUTH_USER_REQUIRED';
  end if;

  if exists (
    select 1 from private.account_access_tombstones
    where authenticated_user_id = p_authenticated_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ACCOUNT_CLOSED';
  end if;

  begin
    insert into private.economy_subjects(user_id)
    values (p_authenticated_user_id)
    on conflict (user_id) do update
      set user_id = excluded.user_id
    returning subject_key into v_subject_key;
  exception
    when foreign_key_violation then
      raise exception using
        errcode = 'P0001',
        message = 'AUTH_USER_REQUIRED';
  end;

  loop
    v_nickname := 'learner-' || pg_catalog.substring(
      pg_catalog.replace(extensions.uuid_generate_v4()::text, '-', ''),
      1,
      12
    );
    exit when pg_catalog.strpos(
      v_nickname,
      pg_catalog.substring(
        pg_catalog.replace(v_subject_key::text, '-', ''),
        1,
        8
      )
    ) = 0;
  end loop;

  insert into public.profiles(id, nickname)
  values (
    p_authenticated_user_id,
    v_nickname
  )
  on conflict (id) do nothing;

  return pg_catalog.to_jsonb(v_subject_key::text);
end
$$;

revoke create on schema private from economy_security_owner;
