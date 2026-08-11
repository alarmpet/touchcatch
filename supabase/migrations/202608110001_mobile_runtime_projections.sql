-- Restricted mobile runtime account, pet collection, and weekly ranking reads.
-- Behavior is added incrementally under pgTAP and real-session concurrency tests.

do $$
begin
  execute format('grant economy_security_owner to %I', current_user);
  execute format('grant game_security_owner to %I', current_user);
end
$$;

grant create on schema private to game_security_owner;

grant select(id, nickname), insert(id, nickname)
  on public.profiles to economy_security_owner;
grant select(id, nickname)
  on public.profiles to game_security_owner;

create policy profiles_mobile_runtime_owner_read
on public.profiles
for select
to economy_security_owner
using (true);

create policy profiles_mobile_runtime_owner_insert
on public.profiles
for insert
to economy_security_owner
with check (true);

create policy profiles_mobile_ranking_owner_read
on public.profiles
for select
to game_security_owner
using (true);

set role economy_security_owner;
grant select(subject_key, user_id)
  on private.economy_subjects to game_security_owner;
reset role;

create policy economy_subjects_mobile_ranking_owner_read
on private.economy_subjects
for select
to game_security_owner
using (true);

create function private.ensure_mobile_account_v1(
  p_authenticated_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_subject_key uuid;
begin
  if p_authenticated_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'AUTH_USER_REQUIRED';
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

  insert into public.profiles(id, nickname)
  values (
    p_authenticated_user_id,
    'learner-' || pg_catalog.substring(v_subject_key::text, 1, 8)
  )
  on conflict (id) do nothing;

  return pg_catalog.to_jsonb(v_subject_key::text);
end
$$;

create function private.read_pet_inventory_v1(
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
    'rarityProgress', pg_catalog.jsonb_build_object(
      'COMMON', pg_catalog.jsonb_build_object(
        'ownedCount', (
          select pg_catalog.count(distinct inventory.pet_id)
          from private.pet_inventory inventory
          join private.pet_catalog_revision_entries entries
            on entries.catalog_revision = p_catalog_revision
           and entries.pet_id = inventory.pet_id
           and entries.rarity = 'COMMON'
          where inventory.subject_key = p_subject_key
            and inventory.copies > 0
        ),
        'totalCount', (
          select pg_catalog.count(*)
          from private.pet_catalog_revision_entries entries
          where entries.catalog_revision = p_catalog_revision
            and entries.rarity = 'COMMON'
        )
      ),
      'RARE', pg_catalog.jsonb_build_object(
        'ownedCount', (
          select pg_catalog.count(distinct inventory.pet_id)
          from private.pet_inventory inventory
          join private.pet_catalog_revision_entries entries
            on entries.catalog_revision = p_catalog_revision
           and entries.pet_id = inventory.pet_id
           and entries.rarity = 'RARE'
          where inventory.subject_key = p_subject_key
            and inventory.copies > 0
        ),
        'totalCount', (
          select pg_catalog.count(*)
          from private.pet_catalog_revision_entries entries
          where entries.catalog_revision = p_catalog_revision
            and entries.rarity = 'RARE'
        )
      ),
      'LEGENDARY', pg_catalog.jsonb_build_object(
        'ownedCount', (
          select pg_catalog.count(distinct inventory.pet_id)
          from private.pet_inventory inventory
          join private.pet_catalog_revision_entries entries
            on entries.catalog_revision = p_catalog_revision
           and entries.pet_id = inventory.pet_id
           and entries.rarity = 'LEGENDARY'
          where inventory.subject_key = p_subject_key
            and inventory.copies > 0
        ),
        'totalCount', (
          select pg_catalog.count(*)
          from private.pet_catalog_revision_entries entries
          where entries.catalog_revision = p_catalog_revision
            and entries.rarity = 'LEGENDARY'
        )
      )
    ),
    'pets', coalesce((
      select pg_catalog.jsonb_agg(projected.pet order by projected.rarity_order, projected.ordinal, projected.user_pet_id)
      from (
        select
          inventory.user_pet_id,
          case entries.rarity
            when 'COMMON' then 1
            when 'RARE' then 2
            when 'LEGENDARY' then 3
          end as rarity_order,
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

create function private.read_weekly_category_board_v1(
  p_subject_key uuid,
  p_season_id uuid,
  p_category text,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_season_created_at timestamptz;
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

  if p_category is null or p_category not in ('ENGLISH', 'PROVERB') then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_CATEGORY';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_LIMIT';
  end if;

  select seasons.created_at
  into v_season_created_at
  from private.weekly_seasons seasons
  join private.learning_competition_policies policies
    on policies.competition_policy_hash = seasons.competition_policy_hash
   and policies.ruleset_hash = seasons.ruleset_hash
   and policies.hint_policy_hash = seasons.hint_policy_hash
   and policies.attempt_ttl_seconds = seasons.attempt_ttl_seconds
  where seasons.season_id = p_season_id
    and p_category = any(seasons.enabled_categories)
    and seasons.challenges_per_category = 5
    and policies.challenges_per_category = 5
    and (
      select pg_catalog.count(*)
      from private.weekly_challenge_pins pins
      where pins.season_id = seasons.season_id
        and pins.category = p_category
    ) = 5;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'RANKING_POLICY_NOT_APPROVED';
  end if;

  with eligible as (
    select
      best.subject_key,
      profiles.nickname,
      pg_catalog.sum(attempts.display_score)::bigint as total_score,
      pg_catalog.sum(attempts.hints_used)::bigint as total_hints,
      pg_catalog.sum(attempts.wrong_answers)::bigint as total_wrong_answers,
      pg_catalog.sum(attempts.wrong_taps)::bigint as total_wrong_taps,
      pg_catalog.sum(attempts.completion_ms)::bigint as total_completion_ms,
      pg_catalog.min(attempts.accepted_at) as earliest_completion,
      pg_catalog.max(best.updated_at) as latest_best_update
    from private.learning_best_records best
    join private.learning_attempts attempts
      on attempts.attempt_id = best.attempt_id
     and attempts.subject_key = best.subject_key
     and attempts.season_id = best.season_id
     and attempts.content_revision_id = best.content_revision_id
     and attempts.verification_status = 'COMPLETED_VERIFIED'
    join private.weekly_challenge_pins pins
      on pins.season_id = attempts.season_id
     and pins.category = attempts.category
     and pins.content_revision_id = attempts.content_revision_id
     and pins.content_hash = attempts.content_hash
    join private.economy_subjects subjects
      on subjects.subject_key = best.subject_key
     and subjects.user_id is not null
    join public.profiles profiles
      on profiles.id = subjects.user_id
    where best.season_id = p_season_id
      and attempts.category = p_category
    group by best.subject_key, profiles.nickname
  ), ranked as (
    select
      eligible.*,
      pg_catalog.row_number() over (
        order by
          eligible.total_score desc,
          eligible.total_hints asc,
          eligible.total_wrong_answers asc,
          eligible.total_wrong_taps asc,
          eligible.total_completion_ms asc,
          eligible.earliest_completion asc,
          eligible.subject_key asc
      ) as board_rank,
      pg_catalog.count(*) over () as total_competitors,
      pg_catalog.max(eligible.latest_best_update) over () as snapshot_updated_at
    from eligible
  )
  select pg_catalog.jsonb_build_object(
    'seasonId', p_season_id,
    'category', p_category,
    'snapshotRevision', p_season_id::text || ':' || p_category || ':'
      || pg_catalog.date_part(
        'epoch', coalesce(
          pg_catalog.max(ranked.snapshot_updated_at),
          v_season_created_at
        )
      )::text,
    'rows', coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'rank', ranked.board_rank,
          'nickname', ranked.nickname,
          'displayScore', ranked.total_score
        ) order by ranked.board_rank
      ) filter (where ranked.board_rank <= p_limit),
      '[]'::jsonb
    ),
    'myRank', (
      select pg_catalog.jsonb_build_object(
        'rank', mine.board_rank,
        'totalCompetitors', mine.total_competitors,
        'percentile', case
          when mine.total_competitors = 1 then 100.00::numeric
          else pg_catalog.round(
            (
              (mine.total_competitors - mine.board_rank) * 100.0
              / (mine.total_competitors - 1)
            )::numeric,
            2
          )
        end,
        'displayScore', mine.total_score
      )
      from ranked mine
      where mine.subject_key = p_subject_key
    )
  )
  into v_result
  from ranked;

  if v_result is null then
    v_result := pg_catalog.jsonb_build_object(
      'seasonId', p_season_id,
      'category', p_category,
      'snapshotRevision', p_season_id::text || ':' || p_category || ':'
        || pg_catalog.date_part('epoch', v_season_created_at)::text,
      'rows', '[]'::jsonb,
      'myRank', null
    );
  end if;

  return v_result;
end
$$;

alter function private.ensure_mobile_account_v1(uuid)
  owner to economy_security_owner;
alter function private.read_pet_inventory_v1(uuid,text,text)
  owner to economy_security_owner;
alter function private.read_weekly_category_board_v1(uuid,uuid,text,integer)
  owner to game_security_owner;

revoke execute on function private.ensure_mobile_account_v1(uuid)
  from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role;
revoke execute on function private.read_pet_inventory_v1(uuid,text,text)
  from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role;
revoke execute on function private.read_weekly_category_board_v1(uuid,uuid,text,integer)
  from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role;

grant execute on function private.ensure_mobile_account_v1(uuid)
  to economy_server;
grant execute on function private.read_pet_inventory_v1(uuid,text,text)
  to economy_server;
grant execute on function private.read_weekly_category_board_v1(uuid,uuid,text,integer)
  to economy_server;

revoke create on schema private from game_security_owner;

do $$
begin
  execute format('revoke economy_security_owner from %I', current_user);
  execute format('revoke game_security_owner from %I', current_user);
end
$$;
