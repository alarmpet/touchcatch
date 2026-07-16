-- Generated projection of config/ruleset.v1.json; parity-tested, never authoritative.
do $$
declare
  normal_differences integer := 7;
  hard_differences integer := 3;
  word_hunts integer := 3;
begin
  if normal_differences + hard_differences <> 10 or word_hunts <> 3 then raise exception 'RULESET_CONTENT_PROJECTION_INVALID'; end if;
end $$;
