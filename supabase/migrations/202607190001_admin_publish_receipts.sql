do $$begin execute format('grant game_security_owner to %I',current_user); end$$;
grant usage, create on schema private to game_security_owner;

create table if not exists private.admin_sessions (
  session_id text primary key check (session_id ~ '^[A-Za-z0-9_-]{16,128}$'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  actor_id uuid not null,
  roles text[] not null,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
alter table private.admin_sessions enable row level security;

create table if not exists private.admin_publish_receipts (
  idempotency_key text primary key,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  attestation_hash text not null unique check (attestation_hash ~ '^[a-f0-9]{64}$'),
  owner_id text,
  fence bigint not null default 1 check (fence > 0),
  lease_expires_at timestamptz,
  state text not null check (state in ('PENDING','COMPLETED')),
  content_revision_id uuid,
  result jsonb,
  created_at timestamptz not null default clock_timestamp()
);
alter table private.admin_publish_receipts enable row level security;

create table if not exists private.admin_publish_audit (
  audit_id bigint generated always as identity primary key,
  action text not null check (action in ('VALIDATION_FAILED','VALIDATION_SUCCEEDED','PUBLISH_FAILED','PUBLISH_SUCCEEDED')),
  actor_ref text not null check (actor_ref ~ '^[A-Za-z0-9_-]{20,64}$'),
  session_ref text not null check (session_ref ~ '^[A-Za-z0-9_-]{20,64}$'),
  artifact_id text not null check (artifact_id ~ '^[A-Za-z0-9:_-]{1,128}$'),
  content_revision_id text not null check (content_revision_id ~ '^[A-Za-z0-9:_-]{1,128}$'),
  occurred_at timestamptz not null,
  outcome text not null check (outcome in ('REJECTED','VALIDATED','ZERO_EFFECT','PUBLISHED'))
);
alter table private.admin_publish_audit enable row level security;
alter table private.admin_sessions owner to game_security_owner;
alter table private.admin_publish_receipts owner to game_security_owner;
alter table private.admin_publish_audit owner to game_security_owner;
grant select,insert,update,delete on private.admin_publish_receipts to game_security_owner;

create or replace function private.lookup_admin_session_v1(p_token_hash pg_catalog.text)
returns table(session_id pg_catalog.text, actor_id pg_catalog.uuid, roles pg_catalog.text[])
language sql security definer set search_path = pg_catalog as $$
  select s.session_id,s.actor_id,s.roles from private.admin_sessions as s
  where s.token_hash=p_token_hash and s.revoked_at is null and s.expires_at>pg_catalog.clock_timestamp()
$$;

create or replace function private.create_admin_session_v1(p_session_id pg_catalog.text,p_token_hash pg_catalog.text,p_actor_id pg_catalog.uuid)
returns void language sql security definer set search_path = pg_catalog as $$
  insert into private.admin_sessions(session_id,token_hash,actor_id,roles,expires_at)
  values(p_session_id,p_token_hash,p_actor_id,array['CONTENT_PUBLISHER']::pg_catalog.text[],pg_catalog.clock_timestamp()+interval '1 hour')
$$;

create or replace function private.publish_attested_content_revision_v1(
  p_idempotency_key pg_catalog.text, p_request_hash pg_catalog.text, p_attestation_hash pg_catalog.text,
  p_public_content pg_catalog.jsonb, p_private_solution pg_catalog.jsonb, p_rights_manifest pg_catalog.jsonb,
  p_public_canonical pg_catalog.text, p_private_canonical pg_catalog.text, p_rights_canonical pg_catalog.text,
  p_actor_ref pg_catalog.text, p_session_ref pg_catalog.text, p_owner_id pg_catalog.text
) returns pg_catalog.uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_receipt private.admin_publish_receipts%rowtype; v_revision pg_catalog.uuid; v_fence pg_catalog.int8;
begin
  if p_idempotency_key !~ '^[A-Za-z0-9_-]{8,128}$' or p_request_hash !~ '^[a-f0-9]{64}$' or p_attestation_hash !~ '^[a-f0-9]{64}$' or p_actor_ref !~ '^[A-Za-z0-9_-]{20,64}$' or p_session_ref !~ '^[A-Za-z0-9_-]{20,64}$' then raise exception 'ADMIN_PUBLISH_INPUT_INVALID'; end if;
  insert into private.admin_publish_receipts(idempotency_key,request_hash,attestation_hash,owner_id,fence,lease_expires_at,state)
    values(p_idempotency_key,p_request_hash,p_attestation_hash,p_owner_id,1,pg_catalog.clock_timestamp()+interval '30 seconds','PENDING')
    on conflict (idempotency_key) do nothing;
  select * into v_receipt from private.admin_publish_receipts where idempotency_key=p_idempotency_key for update;
  if v_receipt.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if v_receipt.attestation_hash <> p_attestation_hash then raise exception 'ATTESTATION_REPLAY'; end if;
  if v_receipt.state='COMPLETED' then return v_receipt.content_revision_id; end if;
  if exists(select 1 from private.admin_publish_receipts where attestation_hash=p_attestation_hash and idempotency_key<>p_idempotency_key) then raise exception 'ATTESTATION_REPLAY'; end if;
  if v_receipt.owner_id<>p_owner_id and v_receipt.lease_expires_at>pg_catalog.clock_timestamp() then raise exception 'PUBLISH_IN_PROGRESS'; end if;
  update private.admin_publish_receipts set owner_id=p_owner_id,fence=fence+1,lease_expires_at=pg_catalog.clock_timestamp()+interval '30 seconds' where idempotency_key=p_idempotency_key returning fence into v_fence;
  v_revision := private.publish_content_revision_v1(p_public_content,p_private_solution,p_rights_manifest,p_public_canonical,p_private_canonical,p_rights_canonical,'1.0.0');
  update private.admin_publish_receipts set state='COMPLETED',content_revision_id=v_revision,result=pg_catalog.jsonb_build_object('contentRevisionId',v_revision) where idempotency_key=p_idempotency_key and request_hash=p_request_hash and owner_id=p_owner_id and fence=v_fence;
  if not found then raise exception 'PUBLISH_FENCE_LOST'; end if;
  insert into private.admin_publish_audit(action,actor_ref,session_ref,artifact_id,content_revision_id,occurred_at,outcome)
  values('PUBLISH_SUCCEEDED',p_actor_ref,p_session_ref,'artifact:'||p_request_hash,'revision:'||v_revision::text,pg_catalog.clock_timestamp(),'PUBLISHED');
  return v_revision;
end $$;

revoke all on private.admin_sessions, private.admin_publish_receipts, private.admin_publish_audit from public, anon, authenticated;
alter function private.publish_attested_content_revision_v1(text,text,text,jsonb,jsonb,jsonb,text,text,text,text,text,text) owner to game_security_owner;
alter function private.lookup_admin_session_v1(text) owner to game_security_owner;
alter function private.create_admin_session_v1(text,text,uuid) owner to game_security_owner;
revoke all on function private.publish_attested_content_revision_v1(text,text,text,jsonb,jsonb,jsonb,text,text,text,text,text,text) from public, anon, authenticated, service_role, app_server;
grant execute on function private.publish_attested_content_revision_v1(text,text,text,jsonb,jsonb,jsonb,text,text,text,text,text,text) to deployment_role;
revoke all on function private.lookup_admin_session_v1(text), private.create_admin_session_v1(text,text,uuid) from public,anon,authenticated,service_role,app_server;
grant execute on function private.lookup_admin_session_v1(text), private.create_admin_session_v1(text,text,uuid) to deployment_role;
do $$begin execute format('revoke game_security_owner from %I',current_user); end$$;
