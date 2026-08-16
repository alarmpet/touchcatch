-- Learning attempt ownership + weekly challenge read
--
-- Two gaps blocked wiring the ranked attempt routes to the app.
--
-- 1. attest_learning_assets_ready_v1 and commit_learning_attempt_v1 key on attempt_id
--    alone, so any authenticated caller holding an attempt id could drive somebody else's
--    session. The owned_ wrappers below take the caller's subject and refuse a row that is
--    not theirs. The v1 functions keep their exact signatures — the pgTAP suite pins them —
--    but execute is revoked from economy_server so the API can only reach the guarded path.
--
-- 2. The client had no way to learn which content revisions this season pinned.
--    read_weekly_challenges_v1 returns the pins and the public half of each revision.
--    It never touches private.game_content_solutions, so no answer material can leave.

do $$
begin
  execute format('grant game_security_owner to %I', current_user);
end
$$;

grant create on schema private to game_security_owner;

create function private.assert_learning_attempt_owner_v1(
  requested_attempt_id uuid,
  requested_subject_key uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if requested_subject_key is null then
    raise exception using errcode = 'P0001', message = 'AUTH_SUBJECT_REQUIRED';
  end if;

  -- A subject that does not own the attempt is told the attempt does not exist. Saying
  -- "not yours" would confirm the id is real and turn the check into an oracle.
  if not exists(
    select 1
    from private.learning_attempts a
    where a.attempt_id = requested_attempt_id
      and a.subject_key = requested_subject_key
  ) then
    raise exception using errcode = 'P0001', message = 'ATTEMPT_NOT_FOUND';
  end if;
end
$$;

create function private.attest_learning_assets_ready_owned_v1(
  requested_subject_key uuid,
  requested_attempt_id uuid,
  expected_content_hash text,
  expected_ruleset_hash text,
  expected_hint_policy_hash text,
  expected_competition_policy_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform private.assert_learning_attempt_owner_v1(
    requested_attempt_id,
    requested_subject_key
  );
  return private.attest_learning_assets_ready_v1(
    requested_attempt_id,
    expected_content_hash,
    expected_ruleset_hash,
    expected_hint_policy_hash,
    expected_competition_policy_hash
  );
end
$$;

create function private.commit_learning_attempt_owned_v1(
  requested_subject_key uuid,
  requested_attempt_id uuid,
  requested_completion_idempotency_key uuid,
  requested_request_hash text,
  expected_content_hash text,
  expected_ruleset_hash text,
  expected_hint_policy_hash text,
  expected_competition_policy_hash text,
  trusted_display_score integer,
  trusted_hints_used integer,
  trusted_wrong_taps integer,
  trusted_wrong_answers integer,
  trusted_event_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform private.assert_learning_attempt_owner_v1(
    requested_attempt_id,
    requested_subject_key
  );
  return private.commit_learning_attempt_v1(
    requested_attempt_id,
    requested_completion_idempotency_key,
    requested_request_hash,
    expected_content_hash,
    expected_ruleset_hash,
    expected_hint_policy_hash,
    expected_competition_policy_hash,
    trusted_display_score,
    trusted_hints_used,
    trusted_wrong_taps,
    trusted_wrong_answers,
    trusted_event_digest
  );
end
$$;

create function private.read_weekly_challenges_v1(
  p_subject_key uuid,
  p_season_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  season private.weekly_seasons%rowtype;
  v_challenges jsonb;
begin
  if p_subject_key is null then
    raise exception using errcode = 'P0001', message = 'AUTH_SUBJECT_REQUIRED';
  end if;

  if not exists(
    select 1
    from private.economy_subjects subjects
    where subjects.subject_key = p_subject_key
      and subjects.user_id is not null
  ) then
    raise exception using errcode = 'P0001', message = 'AUTH_SUBJECT_REQUIRED';
  end if;

  -- Same policy consistency gate the leaderboard read uses: a season whose pinned hashes
  -- no longer line up with an approved policy row must not hand out playable challenges.
  select seasons.*
    into season
    from private.weekly_seasons seasons
    join private.learning_competition_policies policies
      on policies.competition_policy_hash = seasons.competition_policy_hash
     and policies.ruleset_hash = seasons.ruleset_hash
     and policies.hint_policy_hash = seasons.hint_policy_hash
     and policies.attempt_ttl_seconds = seasons.attempt_ttl_seconds
    where seasons.season_id = p_season_id
      and seasons.challenges_per_category = 5
      and policies.challenges_per_category = 5;
  if not found then
    raise exception using errcode = 'P0001', message = 'RANKING_POLICY_NOT_APPROVED';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'category', entry.category,
        'ordinal', entry.challenge_ordinal,
        'contentRevisionId', entry.content_revision_id,
        'contentHash', entry.content_hash,
        'imageA', entry.public_content -> 'imageA',
        'imageB', entry.public_content -> 'imageB'
      )
      order by entry.category, entry.challenge_ordinal
    ),
    '[]'::jsonb
  )
  into v_challenges
  from (
    select
      pins.category,
      pins.challenge_ordinal,
      pins.content_revision_id,
      pins.content_hash,
      revisions.public_content
    from private.weekly_challenge_pins pins
    join public.game_content_revisions revisions
      on revisions.content_revision_id = pins.content_revision_id
     and revisions.public_content_hash = pins.content_hash
    where pins.season_id = season.season_id
      and pins.category = any(season.enabled_categories)
      and private.learning_content_eligible_v1(
        pins.content_revision_id,
        pins.category
      )
  ) entry;

  return pg_catalog.jsonb_build_object(
    'seasonId', season.season_id,
    'startsAt', season.starts_at,
    'endsAt', season.ends_at,
    'attemptTtlSeconds', season.attempt_ttl_seconds,
    'challenges', v_challenges
  );
end
$$;

alter function private.assert_learning_attempt_owner_v1(uuid,uuid)
  owner to game_security_owner;
alter function private.attest_learning_assets_ready_owned_v1(
  uuid,uuid,text,text,text,text
) owner to game_security_owner;
alter function private.commit_learning_attempt_owned_v1(
  uuid,uuid,uuid,text,text,text,text,text,integer,integer,integer,integer,text
) owner to game_security_owner;
alter function private.read_weekly_challenges_v1(uuid,uuid)
  owner to game_security_owner;

revoke execute on function
  private.assert_learning_attempt_owner_v1(uuid,uuid),
  private.attest_learning_assets_ready_owned_v1(uuid,uuid,text,text,text,text),
  private.commit_learning_attempt_owned_v1(
    uuid,uuid,uuid,text,text,text,text,text,integer,integer,integer,integer,text
  ),
  private.read_weekly_challenges_v1(uuid,uuid)
from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role, economy_server;

grant execute on function
  private.attest_learning_assets_ready_owned_v1(uuid,uuid,text,text,text,text),
  private.commit_learning_attempt_owned_v1(
    uuid,uuid,uuid,text,text,text,text,text,integer,integer,integer,integer,text
  ),
  private.read_weekly_challenges_v1(uuid,uuid)
to economy_server;

-- The unguarded pair stays for the pgTAP suite and for the wrappers that own it, but the
-- API role loses its direct grant so an attempt can only be driven by its owner.
revoke execute on function
  private.attest_learning_assets_ready_v1(uuid,text,text,text,text),
  private.commit_learning_attempt_v1(
    uuid,uuid,text,text,text,text,text,integer,integer,integer,integer,text
  )
from economy_server;

revoke create on schema private from game_security_owner;

do $$
begin
  execute format('revoke game_security_owner from %I', current_user);
end
$$;
