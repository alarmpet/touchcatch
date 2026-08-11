-- Forward-upgrade compatibility for databases that already applied the
-- original 202607150002 publisher before learning categories were admitted.
-- Fresh resets already contain the category clauses and take the no-op path.

do $mobile_category_upgrade$
declare
  v_signature regprocedure :=
    'private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text)'::regprocedure;
  v_definition text;
  v_old_keys constant text :=
    $keys$array['contentId','version','contentRevisionId','schemaVersion','assetPolicyVersion','theme','language','difficulty','imageA','imageB']$keys$;
  v_new_keys constant text :=
    $keys$array['contentId','version','contentRevisionId','schemaVersion','assetPolicyVersion','theme','category','language','difficulty','imageA','imageB']$keys$;
  v_old_value_guard constant text :=
    $guard$or requested_public_content->>'language' not in ('ko','en','ja')$guard$;
  v_new_value_guard constant text :=
    $guard$or requested_public_content->>'category' not in ('ENGLISH','PROVERB','IDIOM','GENERAL_KNOWLEDGE')
     or requested_public_content->>'language' not in ('ko','en','ja')$guard$;
begin
  select pg_catalog.pg_get_functiondef(v_signature)
  into v_definition;

  if pg_catalog.strpos(v_definition, v_new_keys) > 0
     and pg_catalog.strpos(v_definition, v_new_value_guard) > 0 then
    return;
  end if;

  if pg_catalog.strpos(v_definition, v_old_keys) = 0
     or pg_catalog.strpos(v_definition, v_old_value_guard) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'PUBLIC_CONTENT_CATEGORY_UPGRADE_UNEXPECTED';
  end if;

  v_definition := pg_catalog.replace(v_definition, v_old_keys, v_new_keys);
  v_definition := pg_catalog.replace(
    v_definition,
    v_old_value_guard,
    v_new_value_guard
  );

  if pg_catalog.strpos(v_definition, v_new_keys) = 0
     or pg_catalog.strpos(v_definition, v_new_value_guard) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'PUBLIC_CONTENT_CATEGORY_UPGRADE_UNEXPECTED';
  end if;

  execute v_definition;
end
$mobile_category_upgrade$;
