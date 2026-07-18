-- Task 7: private, effect-once pet economy baseline. Product artifacts remain DRAFT.
create extension if not exists pgcrypto with schema extensions;
do $$begin if not exists(select 1 from pg_roles where rolname='economy_security_owner') then create role economy_security_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication; end if; end$$;
do $$begin execute format('grant economy_security_owner to %I',current_user); end$$;
grant usage, create on schema private to economy_security_owner;
grant usage on schema extensions to economy_security_owner;

create table private.economy_series_guard (
  singleton boolean primary key default true check (singleton),
  supported_pity_series_id text not null default 'pity-50-150-v1',
  pity_semantics_projection jsonb,
  pity_semantics_hash text check (pity_semantics_hash is null or pity_semantics_hash ~ '^[0-9a-f]{64}$')
);
insert into private.economy_series_guard(singleton) values(true);

create table private.economy_policy_revisions (
  economy_version text primary key,
  economy_hash text not null unique check (economy_hash ~ '^[0-9a-f]{64}$'),
  pity_series_id text not null,
  pity_semantics_hash text not null check (pity_semantics_hash ~ '^[0-9a-f]{64}$'),
  pity_semantics jsonb not null,
  draw_cost integer not null check(draw_cost > 0),
  reward_policies jsonb not null,
  approved_at timestamptz not null default clock_timestamp()
);
create table private.pet_definitions (
  pet_id uuid primary key,
  rarity public.pet_rarity not null,
  display_key text not null,
  created_at timestamptz not null default clock_timestamp()
);
create table private.pet_catalog_revisions (
  catalog_revision text primary key,
  catalog_hash text not null unique check(catalog_hash ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz not null default clock_timestamp()
);
create table private.pet_catalog_revision_entries (
  catalog_revision text not null references private.pet_catalog_revisions(catalog_revision),
  pet_id uuid not null references private.pet_definitions(pet_id),
  rarity public.pet_rarity not null,
  ordinal integer not null check(ordinal >= 0),
  primary key(catalog_revision,pet_id), unique(catalog_revision,rarity,ordinal)
);
create table private.economy_subjects (
  subject_key uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid unique references auth.users(id) on delete set null,
  gacha_points bigint not null default 0 check(gacha_points >= 0),
  created_at timestamptz not null default clock_timestamp()
);
create table private.idempotency_requests (
  id bigint generated always as identity primary key,
  subject_key uuid not null references private.economy_subjects(subject_key),
  scope text not null check(scope in ('DRAW_V1','FUSION_V1','SELECT_PET_V1','SET_PET_LOCK_V1')),
  idempotency_key uuid not null check ((get_byte(uuid_send(idempotency_key),6) >> 4)=4 and (get_byte(uuid_send(idempotency_key),8) & 192)=128),
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'COMPLETED' check(status='COMPLETED'),
  response_status integer not null,
  response_body jsonb not null check(jsonb_typeof(response_body)='object'),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz not null default clock_timestamp(),
  unique(subject_key,scope,idempotency_key)
);
create table private.reward_ledger (
  reward_ledger_id bigint generated always as identity primary key,
  match_id uuid not null,
  subject_key uuid not null references private.economy_subjects(subject_key),
  reward_type text not null,
  committed_result_revision bigint not null,
  request_hash text not null,
  amount bigint not null,
  economy_version text not null references private.economy_policy_revisions(economy_version),
  economy_hash text not null,
  catalog_revision text not null references private.pet_catalog_revisions(catalog_revision),
  catalog_hash text not null,
  response_body jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(match_id,subject_key,reward_type)
);
create table private.gacha_pity_state (
  subject_key uuid not null references private.economy_subjects(subject_key),
  pity_series_id text not null,
  pity_semantics_hash text not null,
  rare_counter integer not null default 0 check(rare_counter between 0 and 49),
  legendary_counter integer not null default 0 check(legendary_counter between 0 and 149),
  economy_version text not null,
  economy_hash text not null,
  catalog_revision text not null,
  catalog_hash text not null,
  primary key(subject_key,pity_series_id)
);
create table private.pet_inventory (
  user_pet_id uuid primary key default extensions.uuid_generate_v4(),
  subject_key uuid not null references private.economy_subjects(subject_key),
  pet_id uuid not null references private.pet_definitions(pet_id),
  rarity public.pet_rarity not null,
  copies integer not null default 1 check(copies > 0),
  selected boolean not null default false,
  locked boolean not null default false,
  acquired_catalog_revision text not null,
  acquired_catalog_hash text not null
);
create unique index pet_inventory_one_selected on private.pet_inventory(subject_key) where selected;
create table private.gacha_history (
  gacha_history_id bigint generated always as identity primary key,
  idempotency_request_id bigint not null unique references private.idempotency_requests(id),
  subject_key uuid not null,
  user_pet_id uuid not null references private.pet_inventory(user_pet_id),
  pet_id uuid not null,
  rarity public.pet_rarity not null,
  point_cost integer not null,
  economy_version text not null, economy_hash text not null,
  catalog_revision text not null, catalog_hash text not null,
  pity_series_id text not null, pity_semantics_hash text not null,
  created_at timestamptz not null default clock_timestamp()
);
create table private.fusion_history (
  fusion_history_id bigint generated always as identity primary key,
  idempotency_request_id bigint not null unique references private.idempotency_requests(id),
  subject_key uuid not null,
  materials jsonb not null, output_user_pet_id uuid not null, output_pet_id uuid not null,
  economy_version text not null, economy_hash text not null,
  catalog_revision text not null, catalog_hash text not null,
  created_at timestamptz not null default clock_timestamp()
);
create table private.outbox_events (
  event_id uuid primary key default extensions.uuid_generate_v4(),
  event_type text not null check(event_type in ('REWARD_COMMITTED','DRAW_COMMITTED','FUSION_COMMITTED','PET_SELECTED','PET_LOCK_CHANGED')),
  event_version integer not null default 1 check(event_version > 0),
  operation_scope text not null,
  operation_key text not null check(operation_key ~ '^[0-9a-f]{64}$'),
  aggregate_type text not null default 'ECONOMY_SUBJECT', aggregate_key uuid not null,
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  reward_ledger_id bigint references private.reward_ledger(reward_ledger_id),
  gacha_history_id bigint references private.gacha_history(gacha_history_id),
  fusion_history_id bigint references private.fusion_history(fusion_history_id),
  idempotency_request_id bigint references private.idempotency_requests(id),
  economy_version text, economy_hash text, catalog_revision text, catalog_hash text,
  occurred_at timestamptz not null default clock_timestamp(), created_at timestamptz not null default clock_timestamp(), published_at timestamptz,
  check(num_nonnulls(reward_ledger_id,gacha_history_id,fusion_history_id,idempotency_request_id)=1),
  check(occurred_at <= created_at and (published_at is null or created_at <= published_at)),
  check((event_type in ('PET_SELECTED','PET_LOCK_CHANGED') and num_nonnulls(economy_version,economy_hash,catalog_revision,catalog_hash)=0) or (event_type not in ('PET_SELECTED','PET_LOCK_CHANGED') and num_nonnulls(economy_version,economy_hash,catalog_revision,catalog_hash)=4)),
  unique(operation_scope,operation_key)
);
create unique index outbox_reward_source on private.outbox_events(reward_ledger_id) where reward_ledger_id is not null;
create unique index outbox_gacha_source on private.outbox_events(gacha_history_id) where gacha_history_id is not null;
create unique index outbox_fusion_source on private.outbox_events(fusion_history_id) where fusion_history_id is not null;
create unique index outbox_receipt_source on private.outbox_events(idempotency_request_id) where idempotency_request_id is not null;

create function private.reject_economy_immutable_v1() returns trigger language plpgsql set search_path=pg_catalog as $$begin raise exception 'IMMUTABLE_ECONOMY_REVISION'; end$$;
create trigger economy_policy_immutable before update or delete on private.economy_policy_revisions for each row execute function private.reject_economy_immutable_v1();
create trigger catalog_revision_immutable before update or delete on private.pet_catalog_revisions for each row execute function private.reject_economy_immutable_v1();
create trigger catalog_entries_immutable before update or delete on private.pet_catalog_revision_entries for each row execute function private.reject_economy_immutable_v1();
create trigger pet_definitions_immutable before update or delete on private.pet_definitions for each row execute function private.reject_economy_immutable_v1();

create function private.publish_economy_bundle_v1(economy jsonb,catalog jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare guard private.economy_series_guard%rowtype; entry jsonb; existing private.pet_definitions%rowtype;
begin
  -- This publisher is deliberately test-only until a product approval workflow exists.
  if economy->>'status'<>'APPROVED' or catalog->>'status'<>'APPROVED'
     or economy->>'approvalDecisionId'<>'TEST-DECISION' or catalog->>'approvalDecisionId'<>'TEST-DECISION'
     or economy->>'approvedBy'<>'test-approver' or catalog->>'approvedBy'<>'test-approver' then
    raise exception 'APPROVED_TEST_FIXTURE_REQUIRED' using errcode='22023';
  end if;
  if (select array_agg(key order by key) from jsonb_object_keys(economy) key) <>
     array['approvalDecisionId','approvedAt','approvedBy','catalogHash','catalogRevision','draw','economyHash','economyVersion','exp','fusion','pitySemantics','pitySemanticsHash','pitySeriesId','rewardPolicies','schemaVersion','simulationPolicy','status']::text[]
     or (select array_agg(key order by key) from jsonb_object_keys(catalog) key) <>
     array['approvalDecisionId','approvedAt','approvedBy','catalogHash','catalogRevision','entries','schemaVersion','status']::text[] then
    raise exception 'BUNDLE_SCHEMA_INVALID' using errcode='22023';
  end if;
  if economy->>'schemaVersion'<>'1' or catalog->>'schemaVersion'<>'1'
     or economy->>'catalogRevision'<>catalog->>'catalogRevision' or economy->>'catalogHash'<>catalog->>'catalogHash'
     or economy#>>'{draw,cost}'<>'100' or economy#>>'{fusion,materialCount}'<>'5'
     or economy#>>'{fusion,excludeSelected}'<>'true' or economy#>>'{fusion,excludeLocked}'<>'true'
     or economy#>>'{exp,win}'<>'100' or economy#>>'{exp,loss}'<>'60' or economy#>>'{exp,perfectWordMeaning}'<>'40'
     or economy#>>'{draw,probabilities,COMMON}'<>'0.8' or economy#>>'{draw,probabilities,RARE}'<>'0.18' or economy#>>'{draw,probabilities,LEGENDARY}'<>'0.02' then
    raise exception 'BUNDLE_PROJECTION_INVALID' using errcode='22023';
  end if;
  select * into guard from private.economy_series_guard where singleton for update;
  if guard.pity_semantics_hash is not null and (guard.supported_pity_series_id <> economy->>'pitySeriesId' or guard.pity_semantics_hash <> economy->>'pitySemanticsHash' or guard.pity_semantics_projection <> economy->'pitySemantics') then return jsonb_build_object('code','UNSUPPORTED_SERIES_MIGRATION'); end if;
  if jsonb_array_length(catalog->'entries') <> 50 then raise exception 'CATALOG_COUNT_INVALID' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(catalog->'entries') e where e->>'rarity'='COMMON')<>30 or (select count(*) from jsonb_array_elements(catalog->'entries') e where e->>'rarity'='RARE')<>15 or (select count(*) from jsonb_array_elements(catalog->'entries') e where e->>'rarity'='LEGENDARY')<>5 then raise exception 'CATALOG_GROUPING_INVALID' using errcode='22023'; end if;
  for entry in select value from jsonb_array_elements(catalog->'entries') loop
    select * into existing from private.pet_definitions where pet_id=(entry->>'petId')::uuid;
    if found and (existing.rarity::text<>entry->>'rarity' or existing.display_key<>entry->>'displayKey') then raise exception 'PET_IDENTITY_DRIFT' using errcode='22023'; end if;
  end loop;
  if exists(select 1 from private.pet_catalog_revisions c where c.catalog_revision=catalog->>'catalogRevision' and c.catalog_hash<>catalog->>'catalogHash') then raise exception 'CATALOG_REVISION_CONFLICT' using errcode='22023'; end if;
  insert into private.pet_catalog_revisions values(catalog->>'catalogRevision',catalog->>'catalogHash',clock_timestamp()) on conflict do nothing;
  for entry in select value from jsonb_array_elements(catalog->'entries') loop
    insert into private.pet_definitions(pet_id,rarity,display_key) values((entry->>'petId')::uuid,(entry->>'rarity')::public.pet_rarity,entry->>'displayKey') on conflict do nothing;
    insert into private.pet_catalog_revision_entries(catalog_revision,pet_id,rarity,ordinal) values(catalog->>'catalogRevision',(entry->>'petId')::uuid,(entry->>'rarity')::public.pet_rarity,(select count(*) from private.pet_catalog_revision_entries where catalog_revision=catalog->>'catalogRevision' and rarity=(entry->>'rarity')::public.pet_rarity)) on conflict do nothing;
  end loop;
  insert into private.economy_policy_revisions(economy_version,economy_hash,pity_series_id,pity_semantics_hash,pity_semantics,draw_cost,reward_policies) values(economy->>'economyVersion',economy->>'economyHash',economy->>'pitySeriesId',economy->>'pitySemanticsHash',economy->'pitySemantics',(economy#>>'{draw,cost}')::int,coalesce(economy->'rewardPolicies','{}'));
  if guard.pity_semantics_hash is null then update private.economy_series_guard set pity_semantics_projection=economy->'pitySemantics',pity_semantics_hash=economy->>'pitySemanticsHash' where singleton; end if;
  return jsonb_build_object('status','APPROVED','economyVersion',economy->>'economyVersion','catalogRevision',catalog->>'catalogRevision');
end$$;

create function private.fusion_materials_shape_valid_v1(materials jsonb) returns boolean
language sql immutable set search_path=pg_catalog as $$
  select jsonb_typeof(materials)='array' and jsonb_array_length(materials)>0
    and not exists(select 1 from jsonb_array_elements(materials)m where jsonb_typeof(m)<>'object'
      or (select array_agg(k order by k) from jsonb_object_keys(m) k)<>array['count','userPetId']::text[]
      or not (m->>'count' ~ '^[1-9][0-9]*$') or not (m->>'userPetId' ~* '^[0-9a-f-]{36}$'))
    and (select count(*)=count(distinct m->>'userPetId') and sum((m->>'count')::int)=5 from jsonb_array_elements(materials)m)
$$;
alter table private.fusion_history add constraint "INVALID_MATERIALS" check(private.fusion_materials_shape_valid_v1(materials));

create function private.operation_key_v1(parts jsonb) returns text language sql immutable set search_path=pg_catalog as $$select encode(extensions.digest(convert_to(parts::text,'UTF8'),'sha256'),'hex')$$;
create function private.secure_random_below_v1(n bigint) returns bigint language plpgsql volatile security definer set search_path=pg_catalog as $$declare x bigint; lim numeric; b bytea; begin if n<1 or n>4294967296 then raise exception 'RANDOM_BOUND_INVALID' using errcode='22023'; end if; lim:=floor(4294967296::numeric/n)*n; loop b:=extensions.gen_random_bytes(4); x:=(get_byte(b,0)::bigint<<24)+(get_byte(b,1)::bigint<<16)+(get_byte(b,2)::bigint<<8)+get_byte(b,3); exit when x<lim; end loop; return x%n; end$$;

create function private.award_match_reward_v1(match_id uuid,subject_key uuid,reward_type text,committed_result_revision bigint,expected_economy_hash text,expected_catalog_revision text,expected_catalog_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$declare policy private.economy_policy_revisions%rowtype; existing private.reward_ledger%rowtype; amount bigint; response jsonb; ledger_id bigint; opkey text; incoming_hash text; begin
  incoming_hash:=encode(extensions.digest(convert_to(jsonb_build_object('scope','REWARD_V1','matchId',match_id,'subjectKey',subject_key,'rewardType',reward_type,'committedResultRevision',committed_result_revision,'economyHash',expected_economy_hash,'catalogRevision',expected_catalog_revision,'catalogHash',expected_catalog_hash)::text,'UTF8'),'sha256'),'hex');
  select * into existing from private.reward_ledger r where r.match_id=award_match_reward_v1.match_id and r.subject_key=award_match_reward_v1.subject_key and r.reward_type=award_match_reward_v1.reward_type;
  if found then if existing.request_hash<>incoming_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return existing.response_body; end if;
  select * into policy from private.economy_policy_revisions where economy_hash=expected_economy_hash;
  if not found or not exists(select 1 from private.pet_catalog_revisions where catalog_revision=expected_catalog_revision and catalog_hash=expected_catalog_hash) then raise exception 'POLICY_MISMATCH'; end if;
  amount:=nullif(policy.reward_policies->>reward_type,'')::bigint; if amount is null then return jsonb_build_object('code','UNSUPPORTED_REWARD_POLICY'); end if;
  perform 1 from private.economy_subjects s where s.subject_key=award_match_reward_v1.subject_key for update; if not found then raise exception 'SUBJECT_NOT_FOUND'; end if;
  select * into existing from private.reward_ledger r where r.match_id=award_match_reward_v1.match_id and r.subject_key=award_match_reward_v1.subject_key and r.reward_type=award_match_reward_v1.reward_type;
  if found then if existing.request_hash<>incoming_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return existing.response_body; end if;
  update private.economy_subjects s set gacha_points=gacha_points+amount where s.subject_key=award_match_reward_v1.subject_key;
  response:=jsonb_build_object('rewardType',reward_type,'amount',amount,'balance',(select gacha_points from private.economy_subjects s where s.subject_key=award_match_reward_v1.subject_key),'economyVersion',policy.economy_version,'economyHash',policy.economy_hash,'catalogRevision',expected_catalog_revision,'catalogHash',expected_catalog_hash);
  insert into private.reward_ledger(match_id,subject_key,reward_type,committed_result_revision,request_hash,amount,economy_version,economy_hash,catalog_revision,catalog_hash,response_body) values(match_id,subject_key,reward_type,committed_result_revision,incoming_hash,amount,policy.economy_version,policy.economy_hash,expected_catalog_revision,expected_catalog_hash,response) returning reward_ledger_id into ledger_id;
  opkey:=encode(extensions.digest(convert_to(format('{"matchId":"%s","rewardType":"%s","subjectKey":"%s"}',match_id,reward_type,subject_key),'UTF8'),'sha256'),'hex');
  insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,reward_ledger_id,economy_version,economy_hash,catalog_revision,catalog_hash) values('REWARD_COMMITTED','REWARD_V1',opkey,subject_key,response,ledger_id,policy.economy_version,policy.economy_hash,expected_catalog_revision,expected_catalog_hash); return response;
exception when unique_violation then select * into existing from private.reward_ledger r where r.match_id=award_match_reward_v1.match_id and r.subject_key=award_match_reward_v1.subject_key and r.reward_type=award_match_reward_v1.reward_type; if existing.request_hash<>incoming_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return existing.response_body; end$$;

create function private.draw_pet_v1(subject_key uuid,idempotency_key uuid,request_hash text,expected_economy_version text,expected_economy_hash text,expected_catalog_revision text,expected_catalog_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$declare receipt private.idempotency_requests%rowtype; policy private.economy_policy_revisions%rowtype; selected_rarity public.pet_rarity; chosen uuid; userpet uuid; history_id bigint; response jsonb; rarec int; legc int; begin
  select * into receipt from private.idempotency_requests r where r.subject_key=draw_pet_v1.subject_key and scope='DRAW_V1' and r.idempotency_key=draw_pet_v1.idempotency_key; if found then if receipt.request_hash<>draw_pet_v1.request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return receipt.response_body; end if;
  perform 1 from private.economy_subjects s where s.subject_key=draw_pet_v1.subject_key for update; if not found then raise exception 'NOT_OWNED'; end if;
  select * into receipt from private.idempotency_requests r where r.subject_key=draw_pet_v1.subject_key and scope='DRAW_V1' and r.idempotency_key=draw_pet_v1.idempotency_key; if found then if receipt.request_hash<>draw_pet_v1.request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return receipt.response_body; end if;
  select * into policy from private.economy_policy_revisions where economy_version=expected_economy_version and economy_hash=expected_economy_hash; if not found or not exists(select 1 from private.pet_catalog_revisions where catalog_revision=expected_catalog_revision and catalog_hash=expected_catalog_hash) then raise exception 'POLICY_MISMATCH'; end if;
  insert into private.gacha_pity_state(subject_key,pity_series_id,pity_semantics_hash,economy_version,economy_hash,catalog_revision,catalog_hash) values(subject_key,policy.pity_series_id,policy.pity_semantics_hash,policy.economy_version,policy.economy_hash,expected_catalog_revision,expected_catalog_hash) on conflict do nothing;
  select rare_counter,legendary_counter into rarec,legc from private.gacha_pity_state p where p.subject_key=draw_pet_v1.subject_key and p.pity_series_id=policy.pity_series_id for update;
  if (select pity_semantics_hash from private.gacha_pity_state p where p.subject_key=draw_pet_v1.subject_key and p.pity_series_id=policy.pity_series_id)<>policy.pity_semantics_hash then raise exception 'POLICY_MISMATCH'; end if;
  if (select gacha_points from private.economy_subjects s where s.subject_key=draw_pet_v1.subject_key)<policy.draw_cost then raise exception 'INSUFFICIENT_FUNDS'; end if;
  if legc+1>=150 then selected_rarity:='LEGENDARY'; elsif rarec+1>=50 then selected_rarity:='RARE'; else case private.secure_random_below_v1(100) when 0,1 then selected_rarity:='LEGENDARY'; when 2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19 then selected_rarity:='RARE'; else selected_rarity:='COMMON'; end case; end if;
  select pet_id into chosen from private.pet_catalog_revision_entries e where e.catalog_revision=expected_catalog_revision and e.rarity=selected_rarity order by ordinal offset private.secure_random_below_v1((select count(*) from private.pet_catalog_revision_entries x where x.catalog_revision=expected_catalog_revision and x.rarity=selected_rarity)) limit 1;
  update private.economy_subjects s set gacha_points=gacha_points-policy.draw_cost where s.subject_key=draw_pet_v1.subject_key;
  if selected_rarity='LEGENDARY' then rarec:=0;legc:=0; elsif selected_rarity='RARE' then rarec:=0;legc:=legc+1; else rarec:=rarec+1;legc:=legc+1;end if;
  update private.gacha_pity_state p set rare_counter=rarec,legendary_counter=legc,economy_version=policy.economy_version,economy_hash=policy.economy_hash,catalog_revision=expected_catalog_revision,catalog_hash=expected_catalog_hash where p.subject_key=draw_pet_v1.subject_key and p.pity_series_id=policy.pity_series_id;
  insert into private.pet_inventory(subject_key,pet_id,rarity,acquired_catalog_revision,acquired_catalog_hash) values(subject_key,chosen,selected_rarity,expected_catalog_revision,expected_catalog_hash) returning user_pet_id into userpet;
  response:=jsonb_build_object('userPetId',userpet,'petId',chosen,'rarity',selected_rarity,'pointsRemaining',(select gacha_points from private.economy_subjects s where s.subject_key=draw_pet_v1.subject_key),'rareCounter',rarec,'legendaryCounter',legc,'economyVersion',policy.economy_version,'economyHash',policy.economy_hash,'catalogRevision',expected_catalog_revision,'catalogHash',expected_catalog_hash,'pitySeriesId',policy.pity_series_id,'pitySemanticsHash',policy.pity_semantics_hash);
  insert into private.idempotency_requests(subject_key,scope,idempotency_key,request_hash,response_status,response_body) values(subject_key,'DRAW_V1',idempotency_key,request_hash,200,response) returning * into receipt;
  insert into private.gacha_history(idempotency_request_id,subject_key,user_pet_id,pet_id,rarity,point_cost,economy_version,economy_hash,catalog_revision,catalog_hash,pity_series_id,pity_semantics_hash) values(receipt.id,subject_key,userpet,chosen,selected_rarity,policy.draw_cost,policy.economy_version,policy.economy_hash,expected_catalog_revision,expected_catalog_hash,policy.pity_series_id,policy.pity_semantics_hash) returning gacha_history_id into history_id;
  insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,gacha_history_id,economy_version,economy_hash,catalog_revision,catalog_hash) values('DRAW_COMMITTED','DRAW_V1',encode(extensions.digest(convert_to(format('{"idempotencyUuid":"%s","scope":"DRAW_V1","subjectKey":"%s"}',idempotency_key,subject_key),'UTF8'),'sha256'),'hex'),subject_key,response,history_id,policy.economy_version,policy.economy_hash,expected_catalog_revision,expected_catalog_hash); return response;
exception when unique_violation then select * into receipt from private.idempotency_requests r where r.subject_key=draw_pet_v1.subject_key and scope='DRAW_V1' and r.idempotency_key=draw_pet_v1.idempotency_key; if receipt.request_hash<>draw_pet_v1.request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return receipt.response_body; end$$;

-- Policy-neutral operations share the receipt before any inventory mutation.
create function private.select_pet_v1(subject_key uuid,idempotency_key uuid,request_hash text,pet_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r private.idempotency_requests%rowtype; response jsonb; begin select * into r from private.idempotency_requests i where i.subject_key=select_pet_v1.subject_key and scope='SELECT_PET_V1' and i.idempotency_key=select_pet_v1.idempotency_key; if found then if r.request_hash<>select_pet_v1.request_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;return r.response_body;end if; perform 1 from private.economy_subjects s where s.subject_key=select_pet_v1.subject_key for update; perform 1 from private.pet_inventory p where p.subject_key=select_pet_v1.subject_key and p.user_pet_id=select_pet_v1.pet_id for update;if not found then raise exception 'NOT_OWNED';end if;update private.pet_inventory p set selected=false where p.subject_key=select_pet_v1.subject_key and selected;update private.pet_inventory p set selected=true where p.user_pet_id=select_pet_v1.pet_id;response:=jsonb_build_object('petId',pet_id,'selected',true);insert into private.idempotency_requests(subject_key,scope,idempotency_key,request_hash,response_status,response_body) values(subject_key,'SELECT_PET_V1',idempotency_key,request_hash,200,response) returning * into r;insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,idempotency_request_id) values('PET_SELECTED','SELECT_PET_V1',private.operation_key_v1(jsonb_build_object('subjectKey',subject_key,'scope','SELECT_PET_V1','idempotencyUuid',idempotency_key)),subject_key,response,r.id);return response;end$$;
create function private.set_pet_lock_v1(subject_key uuid,idempotency_key uuid,request_hash text,pet_id uuid,locked boolean) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r private.idempotency_requests%rowtype;response jsonb;begin select * into r from private.idempotency_requests i where i.subject_key=set_pet_lock_v1.subject_key and scope='SET_PET_LOCK_V1' and i.idempotency_key=set_pet_lock_v1.idempotency_key;if found then if r.request_hash<>set_pet_lock_v1.request_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;return r.response_body;end if;perform 1 from private.economy_subjects s where s.subject_key=set_pet_lock_v1.subject_key for update;perform 1 from private.pet_inventory p where p.subject_key=set_pet_lock_v1.subject_key and p.user_pet_id=set_pet_lock_v1.pet_id for update;if not found then raise exception 'NOT_OWNED';end if;update private.pet_inventory p set locked=set_pet_lock_v1.locked where p.user_pet_id=set_pet_lock_v1.pet_id;response:=jsonb_build_object('petId',pet_id,'locked',locked);insert into private.idempotency_requests(subject_key,scope,idempotency_key,request_hash,response_status,response_body) values(subject_key,'SET_PET_LOCK_V1',idempotency_key,request_hash,200,response) returning * into r;insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,idempotency_request_id) values('PET_LOCK_CHANGED','SET_PET_LOCK_V1',private.operation_key_v1(jsonb_build_object('subjectKey',subject_key,'scope','SET_PET_LOCK_V1','idempotencyUuid',idempotency_key)),subject_key,response,r.id);return response;end$$;
create function private.fuse_pets_v1(subject_key uuid,idempotency_key uuid,request_hash text,materials jsonb,expected_economy_version text,expected_economy_hash text,expected_catalog_revision text,expected_catalog_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$declare r private.idempotency_requests%rowtype;source_rarity public.pet_rarity;target_rarity public.pet_rarity;output_pet uuid;output_user_pet uuid;history_id bigint;response jsonb;begin select * into r from private.idempotency_requests i where i.subject_key=fuse_pets_v1.subject_key and scope='FUSION_V1' and i.idempotency_key=fuse_pets_v1.idempotency_key;if found then if r.request_hash<>fuse_pets_v1.request_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;return r.response_body;end if;perform 1 from private.economy_subjects s where s.subject_key=fuse_pets_v1.subject_key for update;if not exists(select 1 from private.economy_policy_revisions where economy_version=expected_economy_version and economy_hash=expected_economy_hash) then raise exception 'POLICY_MISMATCH';end if;perform 1 from private.pet_inventory p join jsonb_array_elements(materials) m on p.user_pet_id=(m->>'userPetId')::uuid where p.subject_key=fuse_pets_v1.subject_key order by p.user_pet_id for update;if (select coalesce(sum((m->>'count')::int),0) from jsonb_array_elements(materials)m)<>5 or exists(select 1 from private.pet_inventory p join jsonb_array_elements(materials)m on p.user_pet_id=(m->>'userPetId')::uuid where p.subject_key<>fuse_pets_v1.subject_key or p.selected or p.locked or p.copies<(m->>'count')::int) then raise exception 'INVALID_MATERIALS';end if;select p.rarity into source_rarity from private.pet_inventory p join jsonb_array_elements(materials)m on p.user_pet_id=(m->>'userPetId')::uuid limit 1;if exists(select 1 from private.pet_inventory p join jsonb_array_elements(materials)m on p.user_pet_id=(m->>'userPetId')::uuid where p.rarity<>source_rarity) or source_rarity='LEGENDARY' then raise exception 'INVALID_MATERIALS';end if;target_rarity:=case source_rarity when 'COMMON' then 'RARE'::public.pet_rarity else 'LEGENDARY'::public.pet_rarity end;select pet_id into output_pet from private.pet_catalog_revision_entries e where e.catalog_revision=expected_catalog_revision and e.rarity=target_rarity order by ordinal offset private.secure_random_below_v1((select count(*) from private.pet_catalog_revision_entries x where x.catalog_revision=expected_catalog_revision and x.rarity=target_rarity)) limit 1;delete from private.pet_inventory p using jsonb_array_elements(materials)m where p.user_pet_id=(m->>'userPetId')::uuid and p.copies=(m->>'count')::int;update private.pet_inventory p set copies=copies-(m->>'count')::int from jsonb_array_elements(materials)m where p.user_pet_id=(m->>'userPetId')::uuid and p.copies>(m->>'count')::int;insert into private.pet_inventory(subject_key,pet_id,rarity,acquired_catalog_revision,acquired_catalog_hash) values(subject_key,output_pet,target_rarity,expected_catalog_revision,expected_catalog_hash) returning user_pet_id into output_user_pet;response:=jsonb_build_object('consumed',materials,'output',jsonb_build_object('userPetId',output_user_pet,'petId',output_pet,'rarity',target_rarity),'economyVersion',expected_economy_version,'economyHash',expected_economy_hash,'catalogRevision',expected_catalog_revision,'catalogHash',expected_catalog_hash);insert into private.idempotency_requests(subject_key,scope,idempotency_key,request_hash,response_status,response_body) values(subject_key,'FUSION_V1',idempotency_key,request_hash,200,response) returning * into r;insert into private.fusion_history(idempotency_request_id,subject_key,materials,output_user_pet_id,output_pet_id,economy_version,economy_hash,catalog_revision,catalog_hash) values(r.id,subject_key,materials,output_user_pet,output_pet,expected_economy_version,expected_economy_hash,expected_catalog_revision,expected_catalog_hash) returning fusion_history_id into history_id;insert into private.outbox_events(event_type,operation_scope,operation_key,aggregate_key,payload,fusion_history_id,economy_version,economy_hash,catalog_revision,catalog_hash) values('FUSION_COMMITTED','FUSION_V1',encode(extensions.digest(convert_to(format('{"idempotencyUuid":"%s","scope":"FUSION_V1","subjectKey":"%s"}',idempotency_key,subject_key),'UTF8'),'sha256'),'hex'),subject_key,response,history_id,expected_economy_version,expected_economy_hash,expected_catalog_revision,expected_catalog_hash);return response;end$$;

-- Reject malformed/duplicate/zero-row material sets before the implementation can produce output.
create function private.validate_fusion_materials_v1(materials jsonb) returns void
language plpgsql immutable set search_path=pg_catalog as $$
begin
  if jsonb_typeof(materials) <> 'array' or jsonb_array_length(materials)=0 then raise exception 'INVALID_MATERIALS'; end if;
  if exists(select 1 from jsonb_array_elements(materials) m where jsonb_typeof(m)<>'object'
    or (select array_agg(k order by k) from jsonb_object_keys(m) k)<>array['count','userPetId']::text[]
    or not (m->>'count' ~ '^[1-9][0-9]*$') or not (m->>'userPetId' ~* '^[0-9a-f-]{36}$')) then raise exception 'INVALID_MATERIALS'; end if;
  if (select count(*)<>count(distinct m->>'userPetId') or sum((m->>'count')::int)<>5 from jsonb_array_elements(materials)m) then raise exception 'INVALID_MATERIALS'; end if;
end$$;

alter table private.economy_series_guard owner to economy_security_owner;
alter table private.economy_policy_revisions owner to economy_security_owner;
alter table private.pet_definitions owner to economy_security_owner;
alter table private.pet_catalog_revisions owner to economy_security_owner;
alter table private.pet_catalog_revision_entries owner to economy_security_owner;
alter table private.economy_subjects owner to economy_security_owner;
alter table private.idempotency_requests owner to economy_security_owner;
alter table private.reward_ledger owner to economy_security_owner;
alter table private.gacha_pity_state owner to economy_security_owner;
alter table private.pet_inventory owner to economy_security_owner;
alter table private.gacha_history owner to economy_security_owner;
alter table private.fusion_history owner to economy_security_owner;
alter table private.outbox_events owner to economy_security_owner;
alter function private.reject_economy_immutable_v1() owner to economy_security_owner;
alter function private.publish_economy_bundle_v1(jsonb,jsonb) owner to economy_security_owner;
alter function private.operation_key_v1(jsonb) owner to economy_security_owner;
alter function private.secure_random_below_v1(bigint) owner to economy_security_owner;
alter function private.award_match_reward_v1(uuid,uuid,text,bigint,text,text,text) owner to economy_security_owner;
alter function private.draw_pet_v1(uuid,uuid,text,text,text,text,text) owner to economy_security_owner;
alter function private.fuse_pets_v1(uuid,uuid,text,jsonb,text,text,text,text) owner to economy_security_owner;
alter function private.select_pet_v1(uuid,uuid,text,uuid) owner to economy_security_owner;
alter function private.set_pet_lock_v1(uuid,uuid,text,uuid,boolean) owner to economy_security_owner;
revoke all on private.economy_series_guard,private.economy_policy_revisions,private.pet_definitions,private.pet_catalog_revisions,private.pet_catalog_revision_entries,private.economy_subjects,private.idempotency_requests,private.reward_ledger,private.gacha_pity_state,private.pet_inventory,private.gacha_history,private.fusion_history,private.outbox_events from public,anon,authenticated,service_role,app_server,deployment_role;
revoke all on sequence private.idempotency_requests_id_seq,private.reward_ledger_reward_ledger_id_seq,private.gacha_history_gacha_history_id_seq,private.fusion_history_fusion_history_id_seq from public,anon,authenticated,service_role,app_server,deployment_role;
grant all on private.economy_series_guard,private.economy_policy_revisions,private.pet_definitions,private.pet_catalog_revisions,private.pet_catalog_revision_entries,private.economy_subjects,private.idempotency_requests,private.reward_ledger,private.gacha_pity_state,private.pet_inventory,private.gacha_history,private.fusion_history,private.outbox_events to postgres;
grant all on sequence private.idempotency_requests_id_seq,private.reward_ledger_reward_ledger_id_seq,private.gacha_history_gacha_history_id_seq,private.fusion_history_fusion_history_id_seq to postgres;
revoke execute on function private.reject_economy_immutable_v1(),private.publish_economy_bundle_v1(jsonb,jsonb),private.operation_key_v1(jsonb),private.secure_random_below_v1(bigint),private.award_match_reward_v1(uuid,uuid,text,bigint,text,text,text),private.draw_pet_v1(uuid,uuid,text,text,text,text,text),private.fuse_pets_v1(uuid,uuid,text,jsonb,text,text,text,text),private.select_pet_v1(uuid,uuid,text,uuid),private.set_pet_lock_v1(uuid,uuid,text,uuid,boolean) from public,anon,authenticated,service_role,app_server,deployment_role;
grant usage on schema private to app_server,deployment_role;
grant execute on function private.publish_economy_bundle_v1(jsonb,jsonb) to deployment_role;
grant execute on function private.award_match_reward_v1(uuid,uuid,text,bigint,text,text,text),private.draw_pet_v1(uuid,uuid,text,text,text,text,text),private.fuse_pets_v1(uuid,uuid,text,jsonb,text,text,text,text),private.select_pet_v1(uuid,uuid,text,uuid),private.set_pet_lock_v1(uuid,uuid,text,uuid,boolean) to app_server;
do $$begin execute format('revoke economy_security_owner from %I',current_user); end$$;
