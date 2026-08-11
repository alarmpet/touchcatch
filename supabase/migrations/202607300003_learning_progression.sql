-- Learning Progression Migration: 202607300003_learning_progression.sql

grant game_security_owner to postgres;
grant create on schema private to game_security_owner;

create table if not exists private.learning_progression_ledgers (
  ledger_id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references private.learning_attempts(attempt_id),
  subject_key uuid not null,
  selected_user_pet_id uuid,
  account_xp_awarded int not null check (account_xp_awarded >= 0),
  pet_xp_awarded int not null check (pet_xp_awarded >= 0),
  draw_points_awarded int not null check (draw_points_awarded >= 0),
  policy_hash text not null,
  created_at timestamptz not null default clock_timestamp()
);

create or replace function private.award_learning_progression_v1(
  p_attempt_id uuid,
  p_subject_key uuid,
  p_selected_user_pet_id uuid,
  p_account_xp int,
  p_pet_xp int,
  p_draw_points int,
  p_policy_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_existing record;
begin
  select * into v_existing from private.learning_progression_ledgers where attempt_id = p_attempt_id;
  if found then
    return jsonb_build_object(
      'committed', true,
      'idempotentReplay', true,
      'accountXp', v_existing.account_xp_awarded,
      'petXp', v_existing.pet_xp_awarded,
      'drawPoints', v_existing.draw_points_awarded
    );
  end if;

  insert into private.learning_progression_ledgers (
    attempt_id, subject_key, selected_user_pet_id,
    account_xp_awarded, pet_xp_awarded, draw_points_awarded, policy_hash
  ) values (
    p_attempt_id, p_subject_key, p_selected_user_pet_id,
    p_account_xp, p_pet_xp, p_draw_points, p_policy_hash
  );

  return jsonb_build_object(
    'committed', true,
    'idempotentReplay', false,
    'accountXp', p_account_xp,
    'petXp', p_pet_xp,
    'drawPoints', p_draw_points
  );
end;
$$;

alter table private.learning_progression_ledgers
  owner to game_security_owner;
alter function private.award_learning_progression_v1(uuid,uuid,uuid,integer,integer,integer,text)
  owner to game_security_owner;

alter table private.learning_progression_ledgers enable row level security;
revoke all on private.learning_progression_ledgers
  from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_server, economy_deployment_role, admin_publish_role;
grant all on private.learning_progression_ledgers to postgres;

revoke execute on function private.award_learning_progression_v1(uuid,uuid,uuid,integer,integer,integer,text)
  from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_server, economy_deployment_role, admin_publish_role;

revoke create on schema private from game_security_owner;
revoke game_security_owner from postgres;
