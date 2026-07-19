-- Local Supabase test bootstrap only. Production login membership is
-- provisioned out of band; do not deploy this file with --include-roles.
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
  if not exists (select 1 from pg_roles where rolname = 'economy_deployment_role') then create role economy_deployment_role nologin noinherit nosuperuser nocreatedb nocreaterole noreplication; end if;
  if not exists (select 1 from pg_roles where rolname = 'economy_server') then create role economy_server nologin noinherit nosuperuser nocreatedb nocreaterole noreplication; end if;
  if not exists (select 1 from pg_roles where rolname = 'admin_publish_role') then create role admin_publish_role nologin noinherit nosuperuser nocreatedb nocreaterole noreplication; end if;
end
$$;

grant app_server, deployment_role, economy_deployment_role, economy_server, admin_publish_role to postgres;

-- Local integration credential only. Production provisions an equivalent
-- LOGIN identity through the deployment secret manager and rotates it there.
do $$begin
  if not exists (select 1 from pg_roles where rolname='touchcatch_api_test') then
    create role touchcatch_api_test login noinherit nosuperuser nocreatedb nocreaterole noreplication password 'touchcatch_local_test_only';
  else
    alter role touchcatch_api_test with login noinherit password 'touchcatch_local_test_only';
  end if;
end$$;
grant app_server to touchcatch_api_test;
