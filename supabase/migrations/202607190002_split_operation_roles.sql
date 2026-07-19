-- Forward-only least-privilege split. The original content and match roles keep
-- the single entry points documented by DATA-010 and DATA-011.
do $$
begin
  if not exists (select 1 from pg_roles where rolname='economy_deployment_role') then create role economy_deployment_role nologin noinherit nosuperuser nocreatedb nocreaterole noreplication; end if;
  if not exists (select 1 from pg_roles where rolname='economy_server') then create role economy_server nologin noinherit nosuperuser nocreatedb nocreaterole noreplication; end if;
  if not exists (select 1 from pg_roles where rolname='admin_publish_role') then create role admin_publish_role nologin noinherit nosuperuser nocreatedb nocreaterole noreplication; end if;
end $$;

grant game_security_owner, economy_security_owner to postgres;
set role economy_security_owner;

revoke execute on function private.publish_economy_bundle_v1(jsonb,jsonb) from deployment_role;
grant execute on function private.publish_economy_bundle_v1(jsonb,jsonb) to economy_deployment_role;

revoke execute on function private.award_match_reward_v1(uuid,uuid,text,bigint,text,text,text), private.draw_pet_v1(uuid,uuid,text,text,text,text,text), private.fuse_pets_v1(uuid,uuid,text,jsonb,text,text,text,text), private.select_pet_v1(uuid,uuid,text,uuid), private.set_pet_lock_v1(uuid,uuid,text,uuid,boolean) from app_server;
grant execute on function private.award_match_reward_v1(uuid,uuid,text,bigint,text,text,text), private.draw_pet_v1(uuid,uuid,text,text,text,text,text), private.fuse_pets_v1(uuid,uuid,text,jsonb,text,text,text,text), private.select_pet_v1(uuid,uuid,text,uuid), private.set_pet_lock_v1(uuid,uuid,text,uuid,boolean) to economy_server;

reset role;
set role game_security_owner;
revoke execute on function private.claim_admin_publish_v1(text,text,text,text,int4), private.complete_admin_publish_v1(text,text,text,int8,jsonb,jsonb,jsonb,text,text,text,text,text,text), private.resolve_admin_publish_v1(text,text), private.write_admin_publish_audit_v1(text,text,text,text,text,text), private.lookup_admin_session_v1(text), private.create_admin_session_v1(text,text,uuid) from deployment_role;
grant execute on function private.claim_admin_publish_v1(text,text,text,text,int4), private.complete_admin_publish_v1(text,text,text,int8,jsonb,jsonb,jsonb,text,text,text,text,text,text), private.resolve_admin_publish_v1(text,text), private.write_admin_publish_audit_v1(text,text,text,text,text,text), private.lookup_admin_session_v1(text), private.create_admin_session_v1(text,text,uuid) to admin_publish_role;

reset role;
grant usage on schema private to economy_deployment_role, economy_server, admin_publish_role;
revoke game_security_owner, economy_security_owner from postgres;
