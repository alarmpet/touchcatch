begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function(
  'private',
  'publish_casual_learning_revision_v1',
  array['jsonb','jsonb','jsonb','text','text','text','text'],
  'casual publish exists for derived-hitbox packs'
);

select has_function(
  'private',
  'create_casual_season_v1',
  array['uuid','timestamp with time zone','timestamp with time zone','text','text','text','integer','text','text','jsonb'],
  'casual English season exists'
);

select ok(
  (
    select prosrc not like '%SELECTED_PET_REQUIRED%'
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where nspname = 'private'
      and proname = 'start_learning_attempt_v1'
  ),
  'casual attempts no longer fail closed on a missing selected pet'
);

select ok(
  (
    select attnotnull = false
    from pg_attribute
    join pg_class on pg_class.oid = pg_attribute.attrelid
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where nspname = 'private'
      and relname = 'learning_attempts'
      and attname = 'selected_user_pet_id'
  ),
  'selected pet columns are nullable for casual play'
);

select function_privs_are(
  'private',
  'create_casual_season_v1',
  array['uuid','timestamp with time zone','timestamp with time zone','text','text','text','integer','text','text','jsonb'],
  'economy_deployment_role',
  array['EXECUTE'],
  'only the economy deployment role creates casual seasons'
);

select function_privs_are(
  'private',
  'publish_casual_learning_revision_v1',
  array['jsonb','jsonb','jsonb','text','text','text','text'],
  'deployment_role',
  array['EXECUTE'],
  'only the deployment role publishes casual revisions'
);

select * from finish();
rollback;
