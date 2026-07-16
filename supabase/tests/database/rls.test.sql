begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_schema('private', 'private schema exists');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.user_pets'::regclass), 'user_pets has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.matches'::regclass), 'matches has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.match_players'::regclass), 'match_players has RLS');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon cannot use private schema');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated cannot use private schema');
select ok(not has_schema_privilege('service_role', 'private', 'USAGE'), 'service_role cannot use private schema');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated cannot update profiles table directly');
select ok(not has_table_privilege('authenticated', 'public.match_players', 'UPDATE'), 'authenticated cannot update score directly');
select ok(not has_table_privilege('service_role', 'public.match_players', 'UPDATE'), 'service_role cannot update authoritative score directly');
select ok(not has_table_privilege('service_role', 'public.user_pets', 'UPDATE'), 'service_role cannot update authoritative inventory directly');
select ok(has_function_privilege('app_server', 'private.join_match_participant_v1(uuid,uuid,uuid)', 'EXECUTE'), 'app_server can execute join function');
select ok(not has_function_privilege('service_role', 'private.join_match_participant_v1(uuid,uuid,uuid)', 'EXECUTE'), 'service_role cannot execute private operation');
select ok(has_function_privilege('deployment_role', 'private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text)', 'EXECUTE'), 'deployment role can publish content');
select ok(not has_function_privilege('app_server', 'private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text)', 'EXECUTE'), 'app_server cannot publish content');
select ok(not has_function_privilege('anon', 'private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text)', 'EXECUTE') and not has_function_privilege('authenticated', 'private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text)', 'EXECUTE'), 'client roles cannot publish content');
select ok((select not rolcanlogin and not rolinherit from pg_roles where rolname='game_security_owner'), 'security owner is NOLOGIN NOINHERIT');
select ok((select not rolcanlogin and not rolinherit from pg_roles where rolname='app_server'), 'app server group is NOLOGIN NOINHERIT');
select ok((select not rolcanlogin and not rolinherit from pg_roles where rolname='deployment_role'), 'deployment group is NOLOGIN NOINHERIT');
select ok(not pg_has_role('app_server','deployment_role','MEMBER') and not pg_has_role('deployment_role','app_server','MEMBER'), 'operation and deployment roles are not cross-members');
select ok(not has_schema_privilege('game_security_owner','public','CREATE'), 'security owner cannot create arbitrary public objects after migration');
select ok((select proconfig = array['search_path=pg_catalog'] from pg_proc where oid='private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text)'::regprocedure), 'publish definer pins exact search_path');
select ok((select proowner = (select oid from pg_roles where rolname='game_security_owner') from pg_proc where oid='private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text)'::regprocedure), 'publish definer has dedicated owner');
select is((select count(*)::int from pg_proc where prosecdef and pronamespace in ('public'::regnamespace, 'private'::regnamespace) and oid not in (
  'private.join_match_participant_v1(uuid,uuid,uuid)'::regprocedure,
  'private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text)'::regprocedure
)), 0, 'no unexpected security definer functions');
select is((select count(*)::int from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclnamespace in ('public'::regnamespace, 'private'::regnamespace) and d.defaclrole in ((select oid from pg_roles where rolname='postgres'), (select oid from pg_roles where rolname='game_security_owner')) and a.grantee in (0, (select oid from pg_roles where rolname='anon'), (select oid from pg_roles where rolname='authenticated'), (select oid from pg_roles where rolname='service_role'))), 0, 'future object default ACLs do not expose client/service roles');

select * from finish();
rollback;
