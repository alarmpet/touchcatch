do $$begin
  if not exists(select 1 from pg_roles where rolname='learning_security_owner') then
    create role learning_security_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  end if;
end$$;
do $$begin execute format('grant learning_security_owner to %I',current_user); end$$;
do $$begin execute format('grant account_security_owner,game_security_owner to %I',current_user); end$$;

grant usage,create on schema private to learning_security_owner;
grant usage on schema public,extensions to learning_security_owner;
set role account_security_owner;
grant select,references on private.api_subjects to learning_security_owner;
reset role;
set role game_security_owner;
grant references on public.game_content_revisions to learning_security_owner;
reset role;
create table public.guest_learning_samples(content_key text not null,content_revision text not null,category text not null check(category in ('ENGLISH','PROVERB','IDIOM')),theme text not null,primary key(content_key,content_revision));
grant create on schema public to game_security_owner;
alter table public.guest_learning_samples owner to game_security_owner;
revoke create on schema public from game_security_owner;
set role game_security_owner;
insert into public.guest_learning_samples values ('public-sample-english','1','ENGLISH','Resilience Garden'),('public-sample-proverb','1','PROVERB','Wisdom in Daily Life'),('public-sample-idiom','1','IDIOM','Four-character Wisdom');
alter table public.guest_learning_samples enable row level security;
create policy guest_learning_samples_select on public.guest_learning_samples for select to anon,authenticated using(true);
grant select on public.guest_learning_samples to anon,authenticated,learning_security_owner;
create function private.resolve_published_learning_revision_v1(content_key text,content_revision text) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
  with matches as (select content_revision_id from public.game_content_revisions where status='PUBLISHED' and public_content->>'theme'=content_key and version::text=content_revision),
  counts as (select count(*) n,(array_agg(content_revision_id order by content_revision_id))[1] revision from matches),
  facts as (select exists(select 1 from public.guest_learning_samples where guest_learning_samples.content_key=resolve_published_learning_revision_v1.content_key and guest_learning_samples.content_revision=resolve_published_learning_revision_v1.content_revision) guest_exact,exists(select 1 from public.guest_learning_samples where guest_learning_samples.content_key=resolve_published_learning_revision_v1.content_key) guest_exists,exists(select 1 from public.game_content_revisions where status='PUBLISHED' and public_content->>'theme'=resolve_published_learning_revision_v1.content_key) published_exists)
  select jsonb_build_object('contentRevisionId',case when n=1 then revision end,'contentExists',guest_exists or published_exists,'accepted',guest_exact or n=1,'ambiguous',n>1) from counts,facts
$$;
reset role;
alter function private.resolve_published_learning_revision_v1(text,text) owner to game_security_owner;
revoke all on function private.resolve_published_learning_revision_v1(text,text) from public,anon,authenticated,service_role,app_server,deployment_role,economy_server,admin_publish_role;
grant execute on function private.resolve_published_learning_revision_v1(text,text) to learning_security_owner;
grant execute on function extensions.digest(bytea,text) to learning_security_owner;

create table private.learning_progress_events (
  subject_key uuid not null references private.api_subjects(subject_key) on delete cascade,
  device_event_id uuid not null,
  event_hash text not null check(event_hash ~ '^[a-f0-9]{64}$'),
  content_revision_id uuid references public.game_content_revisions(content_revision_id) on delete restrict,
  content_key text not null,
  content_revision text not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(subject_key,device_event_id)
);
create table private.learning_progress_batches (
  subject_key uuid not null references private.api_subjects(subject_key) on delete cascade,
  idempotency_key uuid not null,
  request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  response_body jsonb,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(subject_key,idempotency_key)
);
alter table private.learning_progress_events owner to learning_security_owner;
alter table private.learning_progress_batches owner to learning_security_owner;
revoke all on private.learning_progress_events,private.learning_progress_batches from public,anon,authenticated,service_role,app_server,deployment_role,economy_server,admin_publish_role;

set role learning_security_owner;
create function private.merge_learning_progress_v1(auth_sub uuid,idempotency_key uuid,request_hash text,events jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare
  subject uuid; batch private.learning_progress_batches%rowtype; item jsonb; revision uuid; prior_hash text; content_projection jsonb;
  event_hash text; accepted jsonb := '[]'::jsonb; rejected jsonb := '[]'::jsonb; response jsonb;
begin
  if auth_sub is null or idempotency_key is null or request_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(events) <> 'array' or jsonb_array_length(events) not between 1 and 100 then raise exception 'INVALID_PROGRESS_BATCH'; end if;
  select subject_key into strict subject from private.api_subjects where user_id=auth_sub;
  insert into private.learning_progress_batches(subject_key,idempotency_key,request_hash) values(subject,idempotency_key,request_hash) on conflict do nothing;
  select * into strict batch from private.learning_progress_batches where subject_key=subject and learning_progress_batches.idempotency_key=merge_learning_progress_v1.idempotency_key for update;
  if batch.request_hash <> request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  if batch.response_body is not null then return batch.response_body; end if;
  if (select count(*) <> count(distinct value->>'deviceEventId') from jsonb_array_elements(events)) then raise exception 'DUPLICATE_DEVICE_EVENT_ID'; end if;
  for item in select value from jsonb_array_elements(events) loop
    if item ?| array['points','coins','currency','reward','gacha'] or not item ?& array['deviceEventId','contentKey','contentRevision','completedAt'] or exists(select 1 from jsonb_object_keys(item) k where k <> all(array['deviceEventId','contentKey','contentRevision','completedAt'])) then raise exception 'INVALID_PROGRESS_EVENT'; end if;
    event_hash := encode(extensions.digest(convert_to(item::text,'UTF8'),'sha256'),'hex');
    content_projection := private.resolve_published_learning_revision_v1(item->>'contentKey',item->>'contentRevision');
    revision := (content_projection->>'contentRevisionId')::uuid;
    if not (content_projection->>'accepted')::boolean then
      rejected := rejected || jsonb_build_array(jsonb_build_object('deviceEventId',item->>'deviceEventId','code',case when (content_projection->>'ambiguous')::boolean then 'CONTENT_AMBIGUOUS' when (content_projection->>'contentExists')::boolean then 'REVISION_MISMATCH' else 'UNKNOWN_CONTENT' end));
      continue;
    end if;
    insert into private.learning_progress_events(subject_key,device_event_id,event_hash,content_revision_id,content_key,content_revision,completed_at) values(subject,(item->>'deviceEventId')::uuid,event_hash,revision,item->>'contentKey',item->>'contentRevision',(item->>'completedAt')::timestamptz) on conflict do nothing;
    select learning_progress_events.event_hash into prior_hash from private.learning_progress_events where subject_key=subject and device_event_id=(item->>'deviceEventId')::uuid;
    if prior_hash <> event_hash then rejected := rejected || jsonb_build_array(jsonb_build_object('deviceEventId',item->>'deviceEventId','code','DEVICE_EVENT_CONFLICT'));
    else accepted := accepted || jsonb_build_array(item->>'deviceEventId'); end if;
  end loop;
  response := jsonb_build_object('acceptedEventIds',accepted,'rejected',rejected);
  update private.learning_progress_batches set response_body=response where subject_key=subject and learning_progress_batches.idempotency_key=merge_learning_progress_v1.idempotency_key;
  return response;
end$$;
reset role;
alter function private.merge_learning_progress_v1(uuid,uuid,text,jsonb) owner to learning_security_owner;
revoke all on function private.merge_learning_progress_v1(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role,deployment_role,economy_server,admin_publish_role;
grant usage on schema private to app_server;
grant execute on function private.merge_learning_progress_v1(uuid,uuid,text,jsonb) to app_server;
revoke create on schema private from learning_security_owner;
do $$begin execute format('revoke learning_security_owner from %I',current_user); end$$;
do $$begin execute format('revoke account_security_owner,game_security_owner from %I',current_user); end$$;
