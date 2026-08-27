do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'game_security_owner') then
    create role game_security_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_server') then
    create role app_server nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'deployment_role') then
    create role deployment_role nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  end if;
end
$$;

-- Supabase migrations run as postgres. NOINHERIT membership is required to
-- transfer ownership and lets local tests exercise the production roles with
-- explicit SET ROLE; postgres receives none of their privileges implicitly.
grant game_security_owner to postgres;
grant usage, create on schema public to game_security_owner;

create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to game_security_owner;
grant execute on function extensions.digest(bytea, text) to game_security_owner;

create schema if not exists private;
grant usage, create on schema private to game_security_owner;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to app_server, deployment_role;

alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated, service_role;

revoke all on all tables in schema public from public, anon, authenticated, service_role;
revoke all on all sequences in schema public from public, anon, authenticated, service_role;
revoke execute on all functions in schema public from public, anon, authenticated, service_role;

create table private.legacy_game_contents_quarantine (
  legacy_id uuid primary key,
  legacy_row jsonb not null,
  quarantine_reason text not null default 'VALIDATED_ARTIFACT_ATTESTATION_REQUIRED',
  quarantined_at timestamptz not null default now()
);
insert into private.legacy_game_contents_quarantine(legacy_id, legacy_row)
select id, to_jsonb(game_contents) from public.game_contents;

create table private.legacy_match_events_quarantine (
  legacy_id bigint primary key,
  legacy_row jsonb not null,
  quarantine_reason text not null default 'LEGACY_EVENT_CONTRACT_UNVERIFIED',
  quarantined_at timestamptz not null default now()
);
insert into private.legacy_match_events_quarantine(legacy_id, legacy_row)
select id, to_jsonb(match_events) from public.match_events;
drop table public.match_events;

create table public.game_content_revisions (
  content_revision_id uuid primary key,
  content_id uuid not null,
  version integer not null check (version >= 1),
  schema_version text not null check (schema_version = '1.0.0'),
  asset_policy_version text not null check (asset_policy_version = '1.0.0'),
  public_content jsonb not null check (jsonb_typeof(public_content) = 'object'),
  public_content_hash text not null unique check (public_content_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('DRAFT','PUBLISHED','RETIRED')),
  approved_at timestamptz,
  rights_manifest_set_id text not null check (rights_manifest_set_id ~ '^[a-z0-9][a-z0-9_-]{0,127}$'),
  validator_version text not null check (validator_version = '1.0.0'),
  created_at timestamptz not null default now(),
  unique(content_id, version),
  check ((status = 'PUBLISHED' and approved_at is not null) or (status <> 'PUBLISHED'))
);

create table private.game_content_solutions (
  content_revision_id uuid primary key references public.game_content_revisions(content_revision_id) on delete restrict,
  private_solution jsonb not null check (jsonb_typeof(private_solution) = 'object'),
  private_solution_hash text not null unique check (private_solution_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create table private.content_rights_manifests (
  rights_manifest_set_id text primary key check (rights_manifest_set_id ~ '^[a-z0-9][a-z0-9_-]{0,127}$'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  manifest_hash text not null unique check (manifest_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create table private.content_publish_attestations (
  content_revision_id uuid primary key references public.game_content_revisions(content_revision_id) on delete restrict,
  validator_version text not null,
  public_content_hash text not null,
  private_solution_hash text not null,
  rights_manifest_hash text not null,
  database_role text not null,
  session_role text not null,
  invoked_role text not null,
  published_at timestamptz not null default now()
);

create table private.content_asset_origins (
  asset_policy_version text not null,
  origin text not null check (origin ~ '^https://[A-Za-z0-9.-]+$'),
  primary key(asset_policy_version, origin)
);
insert into private.content_asset_origins(asset_policy_version, origin)
values ('1.0.0', 'https://cdn.spot-learn.test');

alter table public.game_content_revisions owner to game_security_owner;
alter table private.game_content_solutions owner to game_security_owner;
alter table private.content_rights_manifests owner to game_security_owner;
alter table private.content_publish_attestations owner to game_security_owner;
alter table private.content_asset_origins owner to game_security_owner;

create function private.reject_immutable_content_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = 'P0001', message = 'IMMUTABLE_CONTENT_REVISION';
end
$$;
alter function private.reject_immutable_content_v1() owner to game_security_owner;
revoke execute on function private.reject_immutable_content_v1() from public, anon, authenticated, service_role, app_server, deployment_role;

create trigger game_content_revisions_immutable
before update or delete on public.game_content_revisions
for each row execute function private.reject_immutable_content_v1();
create trigger game_content_solutions_immutable
before update or delete on private.game_content_solutions
for each row execute function private.reject_immutable_content_v1();
create trigger content_rights_manifests_immutable
before update or delete on private.content_rights_manifests
for each row execute function private.reject_immutable_content_v1();
create trigger content_publish_attestations_immutable
before update or delete on private.content_publish_attestations
for each row execute function private.reject_immutable_content_v1();
create trigger content_asset_origins_immutable
before update or delete on private.content_asset_origins
for each row execute function private.reject_immutable_content_v1();

create or replace function private.publish_content_revision_v1(
  requested_public_content jsonb,
  requested_private_solution jsonb,
  requested_rights_manifest jsonb,
  expected_public_canonical_json text,
  expected_private_canonical_json text,
  expected_rights_canonical_json text,
  expected_validator_version text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  revision_id uuid;
  logical_content_id uuid;
  revision_version integer;
  manifest_set_id text;
  rights_manifest_hash text;
  public_content_hash text;
  private_solution_hash text;
  existing_public_hash text;
  existing_private_hash text;
  public_asset_hashes text[];
  rights_asset_hashes text[];
begin
  if expected_validator_version <> '1.0.0' then
    raise exception using errcode = '22023', message = 'VALIDATOR_VERSION_MISMATCH';
  end if;
  if jsonb_typeof(requested_public_content) <> 'object'
     or jsonb_typeof(requested_private_solution) <> 'object'
     or jsonb_typeof(requested_rights_manifest) <> 'object' then
    raise exception using errcode = '22023', message = 'CONTENT_BUNDLE_OBJECT_REQUIRED';
  end if;
  if requested_public_content->>'schemaVersion' <> '1.0.0'
     or requested_private_solution->>'schemaVersion' <> '1.0.0'
     or requested_public_content->>'assetPolicyVersion' <> '1.0.0'
     or requested_rights_manifest->>'schemaVersion' <> '1.0.0' then
    raise exception using errcode = '22023', message = 'CONTENT_SCHEMA_VERSION_MISMATCH';
  end if;
  if not requested_public_content ?& array['contentId','version','contentRevisionId','schemaVersion','assetPolicyVersion','theme','category','language','difficulty','imageA','imageB']
     or exists (
       select 1 from jsonb_object_keys(requested_public_content) key
       where key <> all(array['contentId','version','contentRevisionId','schemaVersion','assetPolicyVersion','theme','category','language','difficulty','imageA','imageB'])
     )
     or jsonb_typeof(requested_public_content->'imageA') <> 'object'
     or jsonb_typeof(requested_public_content->'imageB') <> 'object'
     or not (requested_public_content->'imageA') ?& array['url','sha256','encodedBytes','width','height','mimeType']
     or not (requested_public_content->'imageB') ?& array['url','sha256','encodedBytes','width','height','mimeType']
     or exists (
       select 1 from jsonb_object_keys(requested_public_content->'imageA') key
       where key <> all(array['url','sha256','encodedBytes','width','height','mimeType'])
     )
     or exists (
       select 1 from jsonb_object_keys(requested_public_content->'imageB') key
       where key <> all(array['url','sha256','encodedBytes','width','height','mimeType'])
     ) then
    raise exception using errcode = '22023', message = 'PUBLIC_CONTENT_SHAPE_INVALID';
  end if;
  if jsonb_typeof(requested_public_content->'version') <> 'number'
     or jsonb_typeof(requested_public_content->'theme') <> 'string'
     or requested_public_content->>'category' not in ('ENGLISH','PROVERB','IDIOM','GENERAL_KNOWLEDGE')
     or requested_public_content->>'language' not in ('ko','en','ja')
     or requested_public_content->>'difficulty' not in ('BEGINNER','INTERMEDIATE','ADVANCED') then
    raise exception using errcode = '22023', message = 'PUBLIC_CONTENT_VALUE_INVALID';
  end if;
  if exists (
    select 1
    from (values (requested_public_content->'imageA'), (requested_public_content->'imageB')) asset(value)
    where jsonb_typeof(value->'encodedBytes') <> 'number'
       or jsonb_typeof(value->'width') <> 'number'
       or jsonb_typeof(value->'height') <> 'number'
       or value->>'mimeType' not in ('image/png','image/jpeg','image/webp')
       or (value->>'encodedBytes')::bigint not between 1 and 8388608
       or (value->>'width')::integer not between 1 and 4096
       or (value->>'height')::integer not between 1 and 4096
       or (value->>'width')::bigint * (value->>'height')::bigint > 16000000
       or not exists (
         select 1 from private.content_asset_origins policy
         where policy.asset_policy_version = requested_public_content->>'assetPolicyVersion'
           and (
             (value->>'mimeType'='image/png' and value->>'url'=policy.origin||'/assets/'||(value->>'sha256')||'.png')
             or (value->>'mimeType'='image/webp' and value->>'url'=policy.origin||'/assets/'||(value->>'sha256')||'.webp')
             or (value->>'mimeType'='image/jpeg' and value->>'url' in (policy.origin||'/assets/'||(value->>'sha256')||'.jpg', policy.origin||'/assets/'||(value->>'sha256')||'.jpeg'))
           )
       )
  )
     or requested_public_content#>>'{imageA,width}' <> requested_public_content#>>'{imageB,width}'
     or requested_public_content#>>'{imageA,height}' <> requested_public_content#>>'{imageB,height}' then
    raise exception using errcode = '22023', message = 'PUBLIC_ASSET_POLICY_INVALID';
  end if;
  if not requested_private_solution ?& array['contentRevisionId','schemaVersion','privateSolutionHash','differences','wordHunts','suddenDeath','finalChallenge']
     or exists (
       select 1 from jsonb_object_keys(requested_private_solution) key
       where key <> all(array['contentRevisionId','schemaVersion','privateSolutionHash','differences','wordHunts','suddenDeath','finalChallenge'])
     )
     or jsonb_typeof(requested_private_solution->'differences') <> 'array'
     or jsonb_typeof(requested_private_solution->'wordHunts') <> 'array'
     or jsonb_typeof(requested_private_solution->'suddenDeath') <> 'object'
     or jsonb_typeof(requested_private_solution->'finalChallenge') <> 'object' then
    raise exception using errcode = '22023', message = 'PRIVATE_CONTENT_SHAPE_INVALID';
  end if;
  -- BEGIN GENERATED RULESET CONTENT PREDICATES
  if jsonb_array_length(requested_private_solution->'differences') < 5
     or jsonb_array_length(requested_private_solution->'differences') > 20
     or jsonb_array_length(requested_private_solution->'wordHunts') <> 3
     or (select count(*) from jsonb_array_elements(requested_private_solution->'differences') item where item->>'tier'='HARD') <> ((2 * 3 * jsonb_array_length(requested_private_solution->'differences') + 10) / 20)
     or (select count(*) from jsonb_array_elements(requested_private_solution->'differences') item where item->>'tier'='NORMAL') <> jsonb_array_length(requested_private_solution->'differences') - ((2 * 3 * jsonb_array_length(requested_private_solution->'differences') + 10) / 20)
     or (select count(*) from jsonb_array_elements(requested_private_solution->'wordHunts') item where item->>'kind'='NORMAL') <> 2
     or (select count(*) from jsonb_array_elements(requested_private_solution->'wordHunts') item where item->>'kind'='SPECIAL') <> 1
     or (select count(distinct item->>'objectiveId') from jsonb_array_elements(requested_private_solution->'differences') item) <> jsonb_array_length(requested_private_solution->'differences')
     or (select count(distinct item->>'missionId') from jsonb_array_elements(requested_private_solution->'wordHunts') item) <> 3
  then
    raise exception using errcode = '22023', message = 'PRIVATE_CONTENT_VALUE_INVALID';
  end if;
  -- END GENERATED RULESET CONTENT PREDICATES
  if not (requested_private_solution->'suddenDeath') ?& array['objectiveId','hitboxes']
     or not (requested_private_solution->'finalChallenge') ?& array['canonicalAnswer','aliases','hintUnits','meaning']
     or jsonb_typeof(requested_private_solution#>'{finalChallenge,meaning,options}') <> 'array'
     or jsonb_array_length(requested_private_solution#>'{finalChallenge,meaning,options}') <> 3
     or nullif(requested_private_solution#>>'{finalChallenge,canonicalAnswer}', '') is null
     or exists (
       select 1 from jsonb_array_elements(requested_private_solution->'differences') item
       where not (item ?& array['objectiveId','tier','hitboxes'])
          or jsonb_typeof(item->'hitboxes') <> 'object'
          or not ((item->'hitboxes') ?& array['imageA','imageB'])
          or not ((item#>'{hitboxes,imageA}') ?& array['cx','cy','r'])
          or not ((item#>'{hitboxes,imageB}') ?& array['cx','cy','r'])
     )
     or exists (
       select 1 from jsonb_array_elements(requested_private_solution->'wordHunts') item
       where not (item ?& array['missionId','kind','publicPrompt','hitboxes'])
          or nullif(item->>'publicPrompt','') is null
          or jsonb_typeof(item->'hitboxes') <> 'object'
          or not ((item->'hitboxes') ?& array['imageA','imageB'])
     )
     or not ((requested_private_solution#>'{finalChallenge,meaning}') ?& array['prompt','options','correctOptionId'])
     or not exists (
       select 1 from jsonb_array_elements(requested_private_solution#>'{finalChallenge,meaning,options}') option
       where option->>'id' = requested_private_solution#>>'{finalChallenge,meaning,correctOptionId}'
     )
     or exists (
       select 1 from jsonb_array_elements(requested_private_solution#>'{finalChallenge,meaning,options}') option
       where not (option ?& array['id','label']) or nullif(option->>'label','') is null
     ) then
    raise exception using errcode = '22023', message = 'PRIVATE_CONTENT_VALUE_INVALID';
  end if;
  if jsonb_typeof(requested_rights_manifest->'entries') <> 'array'
     or jsonb_array_length(requested_rights_manifest->'entries') <> 2
     or exists (
       select 1 from jsonb_array_elements(requested_rights_manifest->'entries') entry
       where not entry ?& array['rightsRecordId','assetSha256','source','generator','prompt','rights','education','takedown']
          or not (entry->'source') ?& array['kind','sourceRecordId','sourceUri']
          or not (entry->'generator') ?& array['provider','model','modelVersion','termsVersion','generatedAt']
          or not (entry->'prompt') ?& array['available','sha256','unavailabilityReason']
          or not (entry->'rights') ?& array['status','licenseOrPermission','approverId','approvedAt']
          or not (entry->'education') ?& array['status','reviewerId','reviewedAt']
          or not (entry->'takedown') ?& array['ownerId','contact','runbookVersion']
          or nullif(entry->>'rightsRecordId','') is null
          or nullif(entry#>>'{source,sourceRecordId}','') is null
          or nullif(entry#>>'{source,sourceUri}','') is null
          or nullif(entry#>>'{generator,provider}','') is null
          or nullif(entry#>>'{generator,model}','') is null
          or nullif(entry#>>'{generator,modelVersion}','') is null
          or nullif(entry#>>'{generator,termsVersion}','') is null
          or nullif(entry#>>'{takedown,ownerId}','') is null
          or nullif(entry#>>'{takedown,contact}','') is null
     ) then
    raise exception using errcode = '22023', message = 'RIGHTS_MANIFEST_SHAPE_INVALID';
  end if;
  revision_id := (requested_public_content->>'contentRevisionId')::uuid;
  if revision_id is null or requested_private_solution->>'contentRevisionId' <> revision_id::text then
    raise exception using errcode = '22023', message = 'CONTENT_REVISION_MISMATCH';
  end if;
  logical_content_id := (requested_public_content->>'contentId')::uuid;
  revision_version := (requested_public_content->>'version')::integer;
  if logical_content_id is null or revision_version is null or revision_version < 1 then
    raise exception using errcode = '22023', message = 'CONTENT_REVISION_IDENTITY_INVALID';
  end if;
  manifest_set_id := requested_rights_manifest->>'manifestSetId';
  if manifest_set_id is null or manifest_set_id !~ '^[a-z0-9][a-z0-9_-]{0,127}$' then
    raise exception using errcode = '22023', message = 'RIGHTS_MANIFEST_ID_INVALID';
  end if;
  begin
    if expected_public_canonical_json::jsonb is distinct from requested_public_content
       or expected_private_canonical_json::jsonb is distinct from (requested_private_solution - 'privateSolutionHash')
       or expected_rights_canonical_json::jsonb is distinct from requested_rights_manifest then
      raise exception using errcode = '22023', message = 'CANONICAL_CONTENT_BINDING_MISMATCH';
    end if;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'CANONICAL_CONTENT_BINDING_MISMATCH';
  end;
  public_content_hash := encode(extensions.digest(convert_to(expected_public_canonical_json, 'UTF8'), 'sha256'), 'hex');
  private_solution_hash := encode(extensions.digest(convert_to(expected_private_canonical_json, 'UTF8'), 'sha256'), 'hex');
  rights_manifest_hash := encode(extensions.digest(convert_to(expected_rights_canonical_json, 'UTF8'), 'sha256'), 'hex');
  if requested_private_solution->>'privateSolutionHash' <> private_solution_hash then
    raise exception using errcode = '22023', message = 'PRIVATE_SOLUTION_HASH_ATTESTATION_MISMATCH';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(requested_rights_manifest->'entries', '[]'::jsonb)) entry
    where entry#>>'{rights,status}' <> 'APPROVED'
       or entry#>>'{education,status}' <> 'APPROVED'
       or nullif(entry#>>'{rights,approverId}', '') is null
       or nullif(entry#>>'{education,reviewerId}', '') is null
  ) then
    raise exception using errcode = '22023', message = 'RIGHTS_APPROVAL_REQUIRED';
  end if;
  select array_agg(value order by value) into public_asset_hashes
  from (values (requested_public_content#>>'{imageA,sha256}'), (requested_public_content#>>'{imageB,sha256}')) hashes(value);
  select array_agg(entry->>'assetSha256' order by entry->>'assetSha256') into rights_asset_hashes
  from jsonb_array_elements(coalesce(requested_rights_manifest->'entries', '[]'::jsonb)) entry;
  if public_asset_hashes is null or cardinality(public_asset_hashes) <> 2 or public_asset_hashes[1] = public_asset_hashes[2]
     or public_asset_hashes is distinct from rights_asset_hashes then
    raise exception using errcode = '22023', message = 'RIGHTS_ASSET_BIJECTION';
  end if;
  select r.public_content_hash, s.private_solution_hash
    into existing_public_hash, existing_private_hash
  from public.game_content_revisions r
  join private.game_content_solutions s using (content_revision_id)
  where r.content_revision_id = revision_id;
  if found then
    if existing_public_hash = public_content_hash and existing_private_hash = private_solution_hash then
      return revision_id;
    end if;
    raise exception using errcode = '23505', message = 'CONTENT_REVISION_CONFLICT';
  end if;

  insert into private.content_rights_manifests(rights_manifest_set_id, manifest, manifest_hash)
  values (manifest_set_id, requested_rights_manifest, rights_manifest_hash)
  on conflict (rights_manifest_set_id) do nothing;
  if not exists (select 1 from private.content_rights_manifests where rights_manifest_set_id = manifest_set_id and manifest_hash = rights_manifest_hash) then
    raise exception using errcode = '23505', message = 'RIGHTS_MANIFEST_CONFLICT';
  end if;

  insert into public.game_content_revisions(
    content_revision_id, content_id, version, schema_version, asset_policy_version,
    public_content, public_content_hash, status, approved_at, rights_manifest_set_id, validator_version
  ) values (
    revision_id, logical_content_id, revision_version, '1.0.0', '1.0.0',
    requested_public_content, public_content_hash, 'PUBLISHED', clock_timestamp(), manifest_set_id, expected_validator_version
  );
  insert into private.game_content_solutions(content_revision_id, private_solution, private_solution_hash)
  values (revision_id, requested_private_solution, private_solution_hash);
  insert into private.content_publish_attestations(
    content_revision_id, validator_version, public_content_hash, private_solution_hash,
    rights_manifest_hash, database_role, session_role, invoked_role
  ) values (
    revision_id, expected_validator_version, public_content_hash, private_solution_hash,
    rights_manifest_hash, current_user, session_user, current_setting('role', true)
  );
  return revision_id;
end
$$;
alter function private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text) owner to game_security_owner;
revoke execute on function private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text) from public, anon, authenticated, service_role, app_server;
grant execute on function private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text) to deployment_role;

alter table public.game_content_revisions enable row level security;
create policy game_content_revisions_published_select on public.game_content_revisions
for select to anon, authenticated
using (status = 'PUBLISHED' and approved_at is not null);
grant select on public.game_content_revisions to anon, authenticated;

create view public.game_content_catalog
with (security_invoker = true)
as
select
  content_revision_id,
  content_id,
  version,
  schema_version,
  asset_policy_version,
  public_content,
  public_content_hash,
  approved_at,
  rights_manifest_set_id,
  validator_version
from public.game_content_revisions
where status = 'PUBLISHED' and approved_at is not null;
revoke all on public.game_content_catalog from public, service_role;
grant select on public.game_content_catalog to anon, authenticated;

revoke all on all tables in schema private from public, anon, authenticated, service_role, app_server, deployment_role;
revoke all on all sequences in schema private from public, anon, authenticated, service_role, app_server, deployment_role;
revoke execute on all functions in schema private from public, anon, authenticated, service_role;
grant execute on function private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text) to deployment_role;
