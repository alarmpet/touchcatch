-- Task 0B: effect-once daily pet draw and same-pet duplicate promotion.
do $$begin execute format('grant economy_security_owner to %I', current_user); end$$;

alter table private.pet_inventory
  add column if not exists level integer not null default 1 check (level > 0),
  add column if not exists xp bigint not null default 0 check (xp >= 0);
alter table private.pet_inventory add column if not exists acquired_at timestamptz;
update private.pet_inventory inventory
set acquired_at = history.acquired_at
from (
  select user_pet_id, min(created_at) acquired_at
  from private.gacha_history
  group by user_pet_id
) history
where inventory.user_pet_id = history.user_pet_id and inventory.acquired_at is null;
alter table private.pet_inventory alter column acquired_at set default clock_timestamp();
alter table private.pet_inventory drop constraint if exists pet_inventory_copies_check;
alter table private.pet_inventory
  add constraint pet_inventory_copies_check check (
    copies >= 0 and (copies > 0 or (not selected and not locked))
  );

create table private.daily_pet_claims (
  daily_claim_id bigint generated always as identity primary key,
  subject_key uuid not null references private.economy_subjects(subject_key),
  claim_date date not null,
  series_id text not null check (series_id = 'DAILY_FREE_DRAW_V1'),
  response_body jsonb not null check (jsonb_typeof(response_body) = 'object'),
  economy_version text not null,
  economy_hash text not null check (economy_hash ~ '^[0-9a-f]{64}$'),
  catalog_revision text not null,
  catalog_hash text not null check (catalog_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique(subject_key, claim_date, series_id)
);

create table private.daily_pet_draw_history (
  daily_draw_history_id bigint generated always as identity primary key,
  daily_claim_id bigint not null unique references private.daily_pet_claims(daily_claim_id),
  subject_key uuid not null references private.economy_subjects(subject_key),
  user_pet_id uuid not null references private.pet_inventory(user_pet_id),
  pet_id uuid not null references private.pet_definitions(pet_id),
  rarity public.pet_rarity not null,
  economy_version text not null,
  economy_hash text not null check (economy_hash ~ '^[0-9a-f]{64}$'),
  catalog_revision text not null,
  catalog_hash text not null check (catalog_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

create table private.duplicate_promotion_receipts (
  promotion_receipt_id bigint generated always as identity primary key,
  subject_key uuid not null references private.economy_subjects(subject_key),
  idempotency_key uuid not null check (
    (get_byte(uuid_send(idempotency_key), 6) >> 4) = 4
    and (get_byte(uuid_send(idempotency_key), 8) & 192) = 128
  ),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_body jsonb not null check (jsonb_typeof(response_body) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  unique(subject_key, idempotency_key)
);

create table private.duplicate_promotion_entitlements (
  promotion_entitlement_id bigint generated always as identity primary key,
  promotion_receipt_id bigint not null unique references private.duplicate_promotion_receipts(promotion_receipt_id),
  target_rarity public.pet_rarity not null check (target_rarity in ('RARE', 'LEGENDARY')),
  target_pet_id uuid not null references private.pet_definitions(pet_id),
  target_user_pet_id uuid not null references private.pet_inventory(user_pet_id),
  status text not null check (status = 'CONSUMED'),
  issued_at timestamptz not null default clock_timestamp(),
  consumed_at timestamptz not null default clock_timestamp(),
  check (issued_at <= consumed_at)
);

create table private.duplicate_promotion_history (
  duplicate_promotion_history_id bigint generated always as identity primary key,
  promotion_receipt_id bigint not null unique references private.duplicate_promotion_receipts(promotion_receipt_id),
  subject_key uuid not null references private.economy_subjects(subject_key),
  source_user_pet_id uuid not null references private.pet_inventory(user_pet_id),
  source_pet_id uuid not null references private.pet_definitions(pet_id),
  source_rarity public.pet_rarity not null,
  consumed_copies integer not null check (consumed_copies = 10),
  consumed_rows jsonb not null check (jsonb_typeof(consumed_rows) = 'array' and jsonb_array_length(consumed_rows) > 0),
  output_user_pet_id uuid not null references private.pet_inventory(user_pet_id),
  output_pet_id uuid not null references private.pet_definitions(pet_id),
  output_rarity public.pet_rarity not null check (output_rarity in ('RARE', 'LEGENDARY')),
  economy_version text not null,
  economy_hash text not null check (economy_hash ~ '^[0-9a-f]{64}$'),
  catalog_revision text not null,
  catalog_hash text not null check (catalog_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

create table private.pet_loop_outbox_events (
  event_id uuid primary key default extensions.uuid_generate_v4(),
  event_type text not null check (event_type in ('DAILY_FREE_DRAW_COMMITTED', 'DUPLICATE_PROMOTION_COMMITTED')),
  subject_key uuid not null references private.economy_subjects(subject_key),
  daily_claim_id bigint unique references private.daily_pet_claims(daily_claim_id),
  duplicate_promotion_history_id bigint unique references private.duplicate_promotion_history(duplicate_promotion_history_id),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  economy_version text not null,
  economy_hash text not null check (economy_hash ~ '^[0-9a-f]{64}$'),
  catalog_revision text not null,
  catalog_hash text not null check (catalog_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  published_at timestamptz,
  check (num_nonnulls(daily_claim_id, duplicate_promotion_history_id) = 1),
  check (
    (event_type = 'DAILY_FREE_DRAW_COMMITTED' and daily_claim_id is not null)
    or
    (event_type = 'DUPLICATE_PROMOTION_COMMITTED' and duplicate_promotion_history_id is not null)
  )
);

create function private.claim_daily_free_draw_v1(
  p_subject_key uuid,
  p_expected_economy_hash text,
  p_expected_catalog_revision text,
  p_expected_catalog_hash text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_claim_date date := (pg_catalog.timezone('Asia/Seoul', pg_catalog.clock_timestamp()))::date;
  v_existing private.daily_pet_claims%rowtype;
  v_policy private.economy_policy_revisions%rowtype;
  v_rarity public.pet_rarity;
  v_pet_id uuid;
  v_user_pet_id uuid;
  v_copies integer;
  v_claim_id bigint;
  v_history_id bigint;
  v_response jsonb;
  v_roll bigint;
begin
  perform 1
    from private.economy_subjects s
    join auth.users auth_user on auth_user.id = s.user_id
    where s.subject_key = p_subject_key and s.user_id is not null
    for update of s;
  if not found then raise exception 'AUTH_SUBJECT_REQUIRED'; end if;

  select * into v_existing
    from private.daily_pet_claims c
    where c.subject_key = p_subject_key
      and c.claim_date = v_claim_date
      and c.series_id = 'DAILY_FREE_DRAW_V1';
  if found then return v_existing.response_body; end if;

  select * into v_policy
    from private.economy_policy_revisions p
    where p.economy_hash = p_expected_economy_hash;
  if not found or not exists (
    select 1 from private.pet_catalog_revisions c
    where c.catalog_revision = p_expected_catalog_revision
      and c.catalog_hash = p_expected_catalog_hash
  ) then raise exception 'POLICY_MISMATCH'; end if;

  -- This series is intentionally independent from private.gacha_pity_state.
  v_roll := private.secure_random_below_v1(100);
  v_rarity := case
    when v_roll < 2 then 'LEGENDARY'::public.pet_rarity
    when v_roll < 20 then 'RARE'::public.pet_rarity
    else 'COMMON'::public.pet_rarity
  end;

  select e.pet_id into v_pet_id
    from private.pet_catalog_revision_entries e
    where e.catalog_revision = p_expected_catalog_revision and e.rarity = v_rarity
    order by e.ordinal
    offset private.secure_random_below_v1((
      select count(*) from private.pet_catalog_revision_entries x
      where x.catalog_revision = p_expected_catalog_revision and x.rarity = v_rarity
    ))
    limit 1;
  if v_pet_id is null then raise exception 'POLICY_MISMATCH'; end if;

  select i.user_pet_id, i.copies into v_user_pet_id, v_copies
    from private.pet_inventory i
    where i.subject_key = p_subject_key and i.pet_id = v_pet_id
    order by i.user_pet_id
    limit 1
    for update;
  if found then
    update private.pet_inventory
      set copies = copies + 1
      where user_pet_id = v_user_pet_id
      returning copies into v_copies;
  else
    insert into private.pet_inventory(
      subject_key, pet_id, rarity, acquired_catalog_revision, acquired_catalog_hash
    ) values (
      p_subject_key, v_pet_id, v_rarity, p_expected_catalog_revision, p_expected_catalog_hash
    ) returning user_pet_id, copies into v_user_pet_id, v_copies;
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'claimDate', v_claim_date,
    'seriesId', 'DAILY_FREE_DRAW_V1',
    'pet', pg_catalog.jsonb_build_object(
      'userPetId', v_user_pet_id,
      'petId', v_pet_id,
      'rarity', v_rarity,
      'copies', v_copies
    ),
    'economyVersion', v_policy.economy_version,
    'economyHash', v_policy.economy_hash,
    'catalogRevision', p_expected_catalog_revision,
    'catalogHash', p_expected_catalog_hash
  );
  insert into private.daily_pet_claims(
    subject_key, claim_date, series_id, response_body,
    economy_version, economy_hash, catalog_revision, catalog_hash
  ) values (
    p_subject_key, v_claim_date, 'DAILY_FREE_DRAW_V1', v_response,
    v_policy.economy_version, v_policy.economy_hash,
    p_expected_catalog_revision, p_expected_catalog_hash
  ) returning daily_claim_id into v_claim_id;
  insert into private.daily_pet_draw_history(
    daily_claim_id, subject_key, user_pet_id, pet_id, rarity,
    economy_version, economy_hash, catalog_revision, catalog_hash
  ) values (
    v_claim_id, p_subject_key, v_user_pet_id, v_pet_id, v_rarity,
    v_policy.economy_version, v_policy.economy_hash,
    p_expected_catalog_revision, p_expected_catalog_hash
  ) returning daily_draw_history_id into v_history_id;
  insert into private.pet_loop_outbox_events(
    event_type, subject_key, daily_claim_id, payload,
    economy_version, economy_hash, catalog_revision, catalog_hash
  ) values (
    'DAILY_FREE_DRAW_COMMITTED', p_subject_key, v_claim_id, v_response,
    v_policy.economy_version, v_policy.economy_hash,
    p_expected_catalog_revision, p_expected_catalog_hash
  );
  return v_response;
end
$$;

create function private.promote_duplicate_cards_v1(
  p_subject_key uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_materials jsonb,
  p_expected_economy_hash text,
  p_expected_catalog_revision text,
  p_expected_catalog_hash text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_receipt private.duplicate_promotion_receipts%rowtype;
  v_policy private.economy_policy_revisions%rowtype;
  v_source_user_pet_id uuid;
  v_source_pet_id uuid;
  v_source_rarity public.pet_rarity;
  v_row record;
  v_take integer;
  v_total_copies integer;
  v_eligible_copies integer;
  v_remaining_to_consume integer := 10;
  v_consumed_rows jsonb := '[]'::jsonb;
  v_target_rarity public.pet_rarity;
  v_target_pet_id uuid;
  v_target_user_pet_id uuid;
  v_target_copies integer;
  v_remaining integer;
  v_receipt_id bigint;
  v_history_id bigint;
  v_response jsonb;
begin
  select * into v_receipt
    from private.duplicate_promotion_receipts r
    where r.subject_key = p_subject_key and r.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_receipt.response_body;
  end if;

  if pg_catalog.jsonb_typeof(p_materials) <> 'array'
    or pg_catalog.jsonb_array_length(p_materials) <> 1
    or pg_catalog.jsonb_typeof(p_materials->0) <> 'object'
    or (select pg_catalog.array_agg(k order by k) from pg_catalog.jsonb_object_keys(p_materials->0) k)
      <> array['count','petId']::text[]
    or pg_catalog.jsonb_typeof(p_materials#>'{0,count}') <> 'number'
    or not (p_materials#>>'{0,petId}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  then raise exception 'INVALID_MATERIALS'; end if;
  if (p_materials#>>'{0,count}')::numeric <> 10
    or pg_catalog.trunc((p_materials#>>'{0,count}')::numeric) <> (p_materials#>>'{0,count}')::numeric
  then raise exception 'INVALID_MATERIALS'; end if;
  v_source_pet_id := (p_materials#>>'{0,petId}')::uuid;
  if (get_byte(uuid_send(v_source_pet_id), 6) >> 4) <> 4
    or (get_byte(uuid_send(v_source_pet_id), 8) & 192) <> 128
  then raise exception 'INVALID_MATERIALS'; end if;

  perform 1 from private.economy_subjects s where s.subject_key = p_subject_key for update;
  if not found then raise exception 'NOT_OWNED'; end if;
  select * into v_receipt
    from private.duplicate_promotion_receipts r
    where r.subject_key = p_subject_key and r.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return v_receipt.response_body;
  end if;

  select * into v_policy
    from private.economy_policy_revisions p
    where p.economy_hash = p_expected_economy_hash;
  if not found or not exists (
    select 1 from private.pet_catalog_revisions c
    where c.catalog_revision = p_expected_catalog_revision
      and c.catalog_hash = p_expected_catalog_hash
  ) then raise exception 'POLICY_MISMATCH'; end if;

  perform 1
    from private.pet_inventory i
    where i.subject_key = p_subject_key and i.pet_id = v_source_pet_id
    order by i.user_pet_id
    for update;
  if not found then raise exception 'NOT_OWNED'; end if;
  select i.rarity into v_source_rarity
    from private.pet_inventory i
    where i.subject_key = p_subject_key and i.pet_id = v_source_pet_id
    order by i.user_pet_id
    limit 1;
  if exists (
    select 1 from private.pet_inventory i
    where i.subject_key = p_subject_key and i.pet_id = v_source_pet_id
      and i.rarity <> v_source_rarity
  ) then raise exception 'INVALID_MATERIALS'; end if;
  select
    coalesce(sum(i.copies), 0)::integer,
    coalesce(sum(i.copies) filter (where not i.selected and not i.locked), 0)::integer
  into v_total_copies, v_eligible_copies
  from private.pet_inventory i
  where i.subject_key = p_subject_key and i.pet_id = v_source_pet_id;
  if v_total_copies < 11 or v_eligible_copies < 10 then raise exception 'INSUFFICIENT_DUPLICATES'; end if;
  if v_source_rarity = 'LEGENDARY' then raise exception 'COSMETIC_REWARD_POLICY_REQUIRED'; end if;
  v_target_rarity := case
    when v_source_rarity = 'COMMON' then 'RARE'::public.pet_rarity
    else 'LEGENDARY'::public.pet_rarity
  end;

  select e.pet_id into v_target_pet_id
    from private.pet_catalog_revision_entries e
    where e.catalog_revision = p_expected_catalog_revision and e.rarity = v_target_rarity
    order by e.ordinal
    offset private.secure_random_below_v1((
      select count(*) from private.pet_catalog_revision_entries x
      where x.catalog_revision = p_expected_catalog_revision and x.rarity = v_target_rarity
    ))
    limit 1;
  if v_target_pet_id is null then raise exception 'POLICY_MISMATCH'; end if;

  for v_row in
    select i.user_pet_id, i.copies
    from private.pet_inventory i
    where i.subject_key = p_subject_key and i.pet_id = v_source_pet_id
      and not i.selected and not i.locked and i.copies > 0
    order by i.user_pet_id
  loop
    exit when v_remaining_to_consume = 0;
    v_take := least(v_row.copies, v_remaining_to_consume);
    update private.pet_inventory
      set copies = copies - v_take
      where user_pet_id = v_row.user_pet_id;
    v_consumed_rows := v_consumed_rows || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('userPetId', v_row.user_pet_id, 'copies', v_take)
    );
    v_remaining_to_consume := v_remaining_to_consume - v_take;
  end loop;
  if v_remaining_to_consume <> 0 then raise exception 'INSUFFICIENT_DUPLICATES'; end if;
  v_source_user_pet_id := (v_consumed_rows#>>'{0,userPetId}')::uuid;
  v_remaining := v_total_copies - 10;

  select i.user_pet_id, i.copies into v_target_user_pet_id, v_target_copies
    from private.pet_inventory i
    where i.subject_key = p_subject_key and i.pet_id = v_target_pet_id
    order by i.user_pet_id
    limit 1
    for update;
  if found then
    update private.pet_inventory
      set copies = copies + 1
      where user_pet_id = v_target_user_pet_id
      returning copies into v_target_copies;
  else
    insert into private.pet_inventory(
      subject_key, pet_id, rarity, acquired_catalog_revision, acquired_catalog_hash
    ) values (
      p_subject_key, v_target_pet_id, v_target_rarity,
      p_expected_catalog_revision, p_expected_catalog_hash
    ) returning user_pet_id, copies into v_target_user_pet_id, v_target_copies;
  end if;

  v_response := pg_catalog.jsonb_build_object(
    'consumed', pg_catalog.jsonb_build_object(
      'petId', v_source_pet_id,
      'copies', 10,
      'rows', v_consumed_rows
    ),
    'remainingCopies', v_remaining,
    'output', pg_catalog.jsonb_build_object(
      'userPetId', v_target_user_pet_id,
      'petId', v_target_pet_id,
      'rarity', v_target_rarity,
      'copies', v_target_copies
    ),
    'economyVersion', v_policy.economy_version,
    'economyHash', v_policy.economy_hash,
    'catalogRevision', p_expected_catalog_revision,
    'catalogHash', p_expected_catalog_hash
  );
  insert into private.duplicate_promotion_receipts(
    subject_key, idempotency_key, request_hash, response_body
  ) values (
    p_subject_key, p_idempotency_key, p_request_hash, v_response
  ) returning promotion_receipt_id into v_receipt_id;
  insert into private.duplicate_promotion_entitlements(
    promotion_receipt_id, target_rarity, target_pet_id, target_user_pet_id,
    status, issued_at, consumed_at
  ) values (
    v_receipt_id, v_target_rarity, v_target_pet_id, v_target_user_pet_id,
    'CONSUMED', pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  );
  insert into private.duplicate_promotion_history(
    promotion_receipt_id, subject_key,
    source_user_pet_id, source_pet_id, source_rarity, consumed_copies, consumed_rows,
    output_user_pet_id, output_pet_id, output_rarity,
    economy_version, economy_hash, catalog_revision, catalog_hash
  ) values (
    v_receipt_id, p_subject_key,
    v_source_user_pet_id, v_source_pet_id, v_source_rarity, 10, v_consumed_rows,
    v_target_user_pet_id, v_target_pet_id, v_target_rarity,
    v_policy.economy_version, v_policy.economy_hash,
    p_expected_catalog_revision, p_expected_catalog_hash
  ) returning duplicate_promotion_history_id into v_history_id;
  insert into private.pet_loop_outbox_events(
    event_type, subject_key, duplicate_promotion_history_id, payload,
    economy_version, economy_hash, catalog_revision, catalog_hash
  ) values (
    'DUPLICATE_PROMOTION_COMMITTED', p_subject_key, v_history_id, v_response,
    v_policy.economy_version, v_policy.economy_hash,
    p_expected_catalog_revision, p_expected_catalog_hash
  );
  return v_response;
end
$$;

alter table private.daily_pet_claims owner to economy_security_owner;
alter table private.daily_pet_draw_history owner to economy_security_owner;
alter table private.duplicate_promotion_receipts owner to economy_security_owner;
alter table private.duplicate_promotion_entitlements owner to economy_security_owner;
alter table private.duplicate_promotion_history owner to economy_security_owner;
alter table private.pet_loop_outbox_events owner to economy_security_owner;
alter function private.claim_daily_free_draw_v1(uuid,text,text,text) owner to economy_security_owner;
alter function private.promote_duplicate_cards_v1(uuid,uuid,text,jsonb,text,text,text) owner to economy_security_owner;

revoke all on private.daily_pet_claims,
  private.daily_pet_draw_history,
  private.duplicate_promotion_receipts,
  private.duplicate_promotion_entitlements,
  private.duplicate_promotion_history,
  private.pet_loop_outbox_events
  from public, anon, authenticated, service_role, app_server, deployment_role, economy_server;
revoke execute on function private.claim_daily_free_draw_v1(uuid,text,text,text)
  from public, anon, authenticated, service_role, app_server, deployment_role;
revoke execute on function private.promote_duplicate_cards_v1(uuid,uuid,text,jsonb,text,text,text)
  from public, anon, authenticated, service_role, app_server, deployment_role;
grant execute on function private.claim_daily_free_draw_v1(uuid,text,text,text) to economy_server;
grant execute on function private.promote_duplicate_cards_v1(uuid,uuid,text,jsonb,text,text,text) to economy_server;

do $$begin execute format('revoke economy_security_owner from %I', current_user); end$$;
