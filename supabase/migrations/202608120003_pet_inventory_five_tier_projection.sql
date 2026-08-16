-- Project all five rarity tiers in the mobile pet collection payload.
--
-- The runtime contract (packages/contracts daily-pet-loop.ts) now requires a
-- rarityProgress entry for every admitted tier, and pet ordering must place
-- UNCOMMON and EPIC in ladder position rather than sorting them as NULL.

do $$begin execute format('grant economy_security_owner to %I', current_user); end$$;

create or replace function private.read_pet_inventory_v1(
  p_subject_key uuid,
  p_catalog_revision text,
  p_catalog_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
begin
  if p_subject_key is null then
    raise exception using
      errcode = 'P0001',
      message = 'AUTH_SUBJECT_REQUIRED';
  end if;

  perform 1
  from private.economy_subjects subjects
  join public.profiles profiles on profiles.id = subjects.user_id
  where subjects.subject_key = p_subject_key
    and subjects.user_id is not null;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'AUTH_SUBJECT_REQUIRED';
  end if;

  perform 1
  from private.pet_catalog_revisions revisions
  where revisions.catalog_revision = p_catalog_revision
    and revisions.catalog_hash = p_catalog_hash;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'POLICY_MISMATCH';
  end if;

  select pg_catalog.jsonb_build_object(
    'catalogRevision', p_catalog_revision,
    'catalogHash', p_catalog_hash,
    'claimedToday', exists (
      select 1
      from private.daily_pet_claims claims
      where claims.subject_key = p_subject_key
        and claims.claim_date = (
          pg_catalog.timezone('Asia/Seoul', pg_catalog.clock_timestamp())
        )::date
        and claims.series_id = 'DAILY_FREE_DRAW_V1'
    ),
    'ownedCount', (
      select pg_catalog.count(distinct inventory.pet_id)
      from private.pet_inventory inventory
      join private.pet_catalog_revision_entries entries
        on entries.catalog_revision = p_catalog_revision
       and entries.pet_id = inventory.pet_id
      where inventory.subject_key = p_subject_key
        and inventory.copies > 0
    ),
    'totalCount', (
      select pg_catalog.count(*)
      from private.pet_catalog_revision_entries entries
      where entries.catalog_revision = p_catalog_revision
    ),
    'rarityProgress', coalesce((
      select pg_catalog.jsonb_object_agg(
        tier.rarity::text,
        pg_catalog.jsonb_build_object(
          'ownedCount', (
            select pg_catalog.count(distinct inventory.pet_id)
            from private.pet_inventory inventory
            join private.pet_catalog_revision_entries entries
              on entries.catalog_revision = p_catalog_revision
             and entries.pet_id = inventory.pet_id
             and entries.rarity = tier.rarity
            where inventory.subject_key = p_subject_key
              and inventory.copies > 0
          ),
          'totalCount', (
            select pg_catalog.count(*)
            from private.pet_catalog_revision_entries entries
            where entries.catalog_revision = p_catalog_revision
              and entries.rarity = tier.rarity
          )
        )
      )
      from pg_catalog.unnest(array['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY']::public.pet_rarity[]) as tier(rarity)
    ), '{}'::jsonb),
    'pets', coalesce((
      select pg_catalog.jsonb_agg(projected.pet order by projected.rarity_order, projected.ordinal, projected.user_pet_id)
      from (
        select
          inventory.user_pet_id,
          array_position(array['COMMON','UNCOMMON','RARE','EPIC','LEGENDARY']::public.pet_rarity[], entries.rarity) as rarity_order,
          entries.ordinal,
          pg_catalog.jsonb_build_object(
            'userPetId', inventory.user_pet_id,
            'petId', inventory.pet_id,
            'rarity', entries.rarity,
            'displayKey', definitions.display_key,
            'level', 1,
            'xp', 0,
            'copies', inventory.copies,
            'selected', inventory.selected,
            'locked', inventory.locked,
            'acquiredAt', inventory.acquired_at,
            'acquisitionDateStatus', case
              when inventory.acquired_at is null then 'UNAVAILABLE_LEGACY'
              else 'KNOWN'
            end,
            'acquiredCatalogRevision', inventory.acquired_catalog_revision,
            'acquiredCatalogHash', inventory.acquired_catalog_hash
          ) as pet
        from private.pet_inventory inventory
        join private.pet_catalog_revision_entries entries
          on entries.catalog_revision = p_catalog_revision
         and entries.pet_id = inventory.pet_id
        join private.pet_definitions definitions
          on definitions.pet_id = inventory.pet_id
        where inventory.subject_key = p_subject_key
          and inventory.copies > 0
      ) projected
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;

do $$begin execute format('revoke economy_security_owner from %I', current_user); end$$;
