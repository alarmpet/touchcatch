do $$begin
  if not exists(select 1 from pg_roles where rolname='account_security_owner') then
    create role account_security_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  end if;
end$$;
do $$begin execute format('grant account_security_owner to %I',current_user); end$$;
do $$begin execute format('grant economy_security_owner to %I',current_user); end$$;

grant usage,create on schema private to account_security_owner;
grant usage on schema public,extensions to account_security_owner;
grant execute on function extensions.uuid_generate_v4() to account_security_owner;
grant select,insert on public.profiles to account_security_owner;
set role economy_security_owner;
grant select,insert on private.economy_subjects to account_security_owner;
reset role;

create table private.api_subjects (
  subject_key uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table private.api_subjects owner to account_security_owner;
revoke all on private.api_subjects from public,anon,authenticated,service_role,app_server,deployment_role,economy_server,admin_publish_role;

create policy profiles_account_owner_select on public.profiles for select to account_security_owner using (true);
create policy profiles_account_owner_insert on public.profiles for insert to account_security_owner with check (true);

set role account_security_owner;
create function private.ensure_account_v1(auth_sub uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare
  api_key uuid;
  economy_key uuid;
  display_name text;
begin
  if auth_sub is null then
    raise exception 'ACCOUNT_SUBJECT_INVALID';
  end if;
  insert into private.api_subjects(user_id) values(auth_sub) on conflict(user_id) do nothing;
  select subject_key into strict api_key from private.api_subjects where user_id=auth_sub;
  display_name := 'Player-' || upper(substr(replace(api_key::text,'-',''),1,8));
  insert into public.profiles(id,nickname) values(auth_sub,display_name) on conflict(id) do nothing;
  insert into private.economy_subjects(user_id) values(auth_sub) on conflict(user_id) do nothing;
  select subject_key into strict economy_key from private.economy_subjects where user_id=auth_sub;
  select nickname into strict display_name from public.profiles where id=auth_sub;
  return jsonb_build_object('apiSubjectKey',api_key,'economySubjectKey',economy_key,'nickname',display_name);
end$$;

create function private.read_me_v1(auth_sub uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object(
    'profile',jsonb_build_object('displayName',p.nickname),
    'points',e.gacha_points
  )
  from public.profiles p
  join private.api_subjects a on a.user_id=p.id
  join private.economy_subjects e on e.user_id=p.id
  where p.id=auth_sub
$$;
reset role;

alter function private.ensure_account_v1(uuid) owner to account_security_owner;
alter function private.read_me_v1(uuid) owner to account_security_owner;
revoke all on function private.ensure_account_v1(uuid),private.read_me_v1(uuid) from public,anon,authenticated,service_role,deployment_role,economy_server,admin_publish_role;
grant usage on schema private to app_server;
grant execute on function private.ensure_account_v1(uuid),private.read_me_v1(uuid) to app_server;

revoke select(level,exp,gacha_points),update(nickname) on public.profiles from authenticated;
grant select(id,nickname,created_at) on public.profiles to authenticated;

revoke create on schema private from account_security_owner;
do $$begin execute format('revoke account_security_owner from %I',current_user); end$$;
do $$begin execute format('revoke economy_security_owner from %I',current_user); end$$;
