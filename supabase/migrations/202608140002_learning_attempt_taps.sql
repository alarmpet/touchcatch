-- Server-authoritative taps for ranked learning attempts.
--
-- The ranked client cannot be given hitboxes: `private.game_content_solutions` is the one
-- place the answer key lives and it must stay there. So the board cannot be judged on the
-- device at all, and every tap has to be resolved by the server.
--
-- The split of work is deliberate:
--
--   * Geometry lives in `packages/contracts/src/learning-board.ts`, where the same function
--     the client uses for its optimistic ring can be tested exhaustively. Two different
--     implementations of "did this land" would make legitimate taps flicker.
--   * Integrity lives here. Postgres decides whether an objective exists, whether it was
--     already claimed, and what the running counts are. The API states an objective id; it
--     cannot invent one, cannot claim the same difference twice, and cannot set a count.
--
-- The tap log also replaces two numbers the API used to take on trust. `wrong_taps` and the
-- find count are now derived from rows, so `commit_learning_attempt_owned_v1` stops
-- believing whatever the client declared.

do $$
begin
  execute format('grant game_security_owner to %I', current_user);
end
$$;

grant create on schema private to game_security_owner;

create table private.learning_attempt_taps (
  attempt_id uuid not null
    references private.learning_attempts(attempt_id),
  tap_ordinal integer not null
    check (tap_ordinal > 0),
  outcome text not null
    check (outcome in ('HIT', 'MISS', 'DUPLICATE')),
  -- Only a HIT names an objective it is claiming; a DUPLICATE names one it re-touched.
  objective_id text
    check (objective_id is null or objective_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  -- A dropped response must not cost a second wrong tap. Replaying the same key returns
  -- the stored outcome instead of appending another row.
  idempotency_key uuid not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (attempt_id, tap_ordinal),
  unique (attempt_id, idempotency_key),
  check ((outcome = 'MISS') = (objective_id is null))
);

-- One claim per difference per attempt. This is the constraint that makes the find count
-- trustworthy no matter how the API behaves.
create unique index learning_attempt_taps_one_claim
  on private.learning_attempt_taps(attempt_id, objective_id)
  where outcome = 'HIT';

create index learning_attempt_taps_by_attempt
  on private.learning_attempt_taps(attempt_id, tap_ordinal);

create function private.reject_learning_tap_mutation_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = 'P0001', message = 'IMMUTABLE_LEARNING_TAP';
end
$$;

create trigger learning_attempt_taps_append_only
before update or delete on private.learning_attempt_taps
for each row execute function private.reject_learning_tap_mutation_v1();

/**
 * Reads the board for one attempt so the API can resolve geometry.
 *
 * This hands the answer key to the API process, which already computes display scores and
 * therefore already had to be trusted with it. It never reaches an HTTP response: the tap
 * handler returns one objective id and one revealed unit, never the solution.
 */
create function private.read_learning_attempt_board_v1(
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
declare
  attempt private.learning_attempts%rowtype;
  solution jsonb;
  now_at timestamptz := pg_catalog.clock_timestamp();
begin
  perform private.assert_learning_attempt_owner_v1(
    requested_attempt_id,
    requested_subject_key
  );

  select * into attempt
    from private.learning_attempts a
    where a.attempt_id = requested_attempt_id;

  if expected_content_hash is null
     or expected_ruleset_hash is null
     or expected_hint_policy_hash is null
     or expected_competition_policy_hash is null
     or attempt.content_hash <> expected_content_hash
     or attempt.ruleset_hash <> expected_ruleset_hash
     or attempt.hint_policy_hash <> expected_hint_policy_hash
     or attempt.competition_policy_hash <> expected_competition_policy_hash then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  if attempt.verification_status <> 'OPEN' then
    return pg_catalog.jsonb_build_object(
      'attemptId', attempt.attempt_id,
      'status', attempt.verification_status
    );
  end if;

  if attempt.expires_at <= now_at then
    return pg_catalog.jsonb_build_object(
      'attemptId', attempt.attempt_id,
      'status', 'EXPIRED'
    );
  end if;

  select s.private_solution into solution
    from private.game_content_solutions s
    where s.content_revision_id = attempt.content_revision_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'ATTEMPT_NOT_FOUND';
  end if;

  return pg_catalog.jsonb_build_object(
    'attemptId', attempt.attempt_id,
    'status', 'OPEN',
    'category', attempt.category,
    'assetsReady', attempt.assets_ready_at is not null,
    'canonicalAnswer', solution #>> '{finalChallenge,canonicalAnswer}',
    'objectives', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'objectiveId', entry -> 'objectiveId',
            'hitboxes', entry -> 'hitboxes'
          )
        )
        from pg_catalog.jsonb_array_elements(solution -> 'differences') entry
      ),
      '[]'::jsonb
    ),
    'claimedObjectiveIds', coalesce(
      (
        select pg_catalog.jsonb_agg(t.objective_id order by t.tap_ordinal)
        from private.learning_attempt_taps t
        where t.attempt_id = attempt.attempt_id
          and t.outcome = 'HIT'
      ),
      '[]'::jsonb
    ),
    'wrongTaps', (
      select pg_catalog.count(*)
      from private.learning_attempt_taps t
      where t.attempt_id = attempt.attempt_id
        and t.outcome = 'MISS'
    )
  );
end
$$;

/**
 * Appends one resolved tap.
 *
 * `claimed_objective_id` is what the API decided the finger landed on, or null for a miss.
 * The unique partial index — not the API — is what guarantees a difference can only be
 * claimed once, and the existence check is what stops an invented id from counting.
 */
create function private.record_learning_tap_v1(
  requested_subject_key uuid,
  requested_attempt_id uuid,
  expected_content_hash text,
  expected_ruleset_hash text,
  expected_hint_policy_hash text,
  expected_competition_policy_hash text,
  claimed_objective_id text,
  requested_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  attempt private.learning_attempts%rowtype;
  existing private.learning_attempt_taps%rowtype;
  solution jsonb;
  now_at timestamptz := pg_catalog.clock_timestamp();
  resolved_outcome text;
  next_ordinal integer;
  total_differences integer;
  found_count integer;
  wrong_taps integer;
begin
  perform private.assert_learning_attempt_owner_v1(
    requested_attempt_id,
    requested_subject_key
  );

  if requested_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'INVALID_REQUEST';
  end if;

  select * into attempt
    from private.learning_attempts a
    where a.attempt_id = requested_attempt_id
    for update;

  if expected_content_hash is null
     or expected_ruleset_hash is null
     or expected_hint_policy_hash is null
     or expected_competition_policy_hash is null
     or attempt.content_hash <> expected_content_hash
     or attempt.ruleset_hash <> expected_ruleset_hash
     or attempt.hint_policy_hash <> expected_hint_policy_hash
     or attempt.competition_policy_hash <> expected_competition_policy_hash then
    raise exception using errcode = 'P0001', message = 'POLICY_MISMATCH';
  end if;

  -- Replay before any state check: a retry of a tap that has already been recorded must
  -- answer the same way even if the attempt has since expired.
  select * into existing
    from private.learning_attempt_taps t
    where t.attempt_id = requested_attempt_id
      and t.idempotency_key = requested_idempotency_key;
  if found then
    select
      pg_catalog.count(*) filter (where t.outcome = 'HIT')::integer,
      pg_catalog.count(*) filter (where t.outcome = 'MISS')::integer
      into found_count, wrong_taps
      from private.learning_attempt_taps t
      where t.attempt_id = requested_attempt_id
        and t.tap_ordinal <= existing.tap_ordinal;
    select s.private_solution into solution
      from private.game_content_solutions s
      where s.content_revision_id = attempt.content_revision_id;
    select pg_catalog.count(*)::integer into total_differences
      from pg_catalog.jsonb_array_elements(solution -> 'differences');
    return pg_catalog.jsonb_build_object(
      'attemptId', attempt.attempt_id,
      'status', 'OPEN',
      'outcome', existing.outcome,
      'objectiveId', existing.objective_id,
      'foundCount', found_count,
      'differenceCount', total_differences,
      'wrongTaps', wrong_taps
    );
  end if;

  if attempt.verification_status <> 'OPEN' then
    return pg_catalog.jsonb_build_object(
      'attemptId', attempt.attempt_id,
      'status', attempt.verification_status
    );
  end if;

  if attempt.expires_at <= now_at then
    update private.learning_attempts
    set verification_status = 'EXPIRED', terminal_at = now_at
    where attempt_id = attempt.attempt_id;
    return pg_catalog.jsonb_build_object(
      'attemptId', attempt.attempt_id,
      'status', 'EXPIRED'
    );
  end if;

  -- A tap before the assets-ready stamp has no clock to be scored against. Refusing it is
  -- what stops a client from playing the whole board and only then starting the timer.
  if attempt.assets_ready_at is null then
    raise exception using errcode = 'P0001', message = 'ASSETS_NOT_READY';
  end if;

  select s.private_solution into solution
    from private.game_content_solutions s
    where s.content_revision_id = attempt.content_revision_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'ATTEMPT_NOT_FOUND';
  end if;

  select pg_catalog.count(*)::integer into total_differences
    from pg_catalog.jsonb_array_elements(solution -> 'differences');

  if claimed_objective_id is null then
    resolved_outcome := 'MISS';
  elsif not exists(
    select 1
    from pg_catalog.jsonb_array_elements(solution -> 'differences') entry
    where entry ->> 'objectiveId' = claimed_objective_id
  ) then
    raise exception using errcode = 'P0001', message = 'OBJECTIVE_NOT_FOUND';
  elsif exists(
    select 1
    from private.learning_attempt_taps t
    where t.attempt_id = attempt.attempt_id
      and t.outcome = 'HIT'
      and t.objective_id = claimed_objective_id
  ) then
    resolved_outcome := 'DUPLICATE';
  else
    resolved_outcome := 'HIT';
  end if;

  select coalesce(pg_catalog.max(t.tap_ordinal), 0) + 1 into next_ordinal
    from private.learning_attempt_taps t
    where t.attempt_id = attempt.attempt_id;

  insert into private.learning_attempt_taps(
    attempt_id, tap_ordinal, outcome, objective_id, idempotency_key, occurred_at
  ) values (
    attempt.attempt_id, next_ordinal, resolved_outcome, claimed_objective_id,
    requested_idempotency_key, now_at
  );

  select
    pg_catalog.count(*) filter (where t.outcome = 'HIT')::integer,
    pg_catalog.count(*) filter (where t.outcome = 'MISS')::integer
    into found_count, wrong_taps
    from private.learning_attempt_taps t
    where t.attempt_id = attempt.attempt_id;

  return pg_catalog.jsonb_build_object(
    'attemptId', attempt.attempt_id,
    'status', 'OPEN',
    'outcome', resolved_outcome,
    'objectiveId', claimed_objective_id,
    'foundCount', found_count,
    'differenceCount', total_differences,
    'wrongTaps', wrong_taps
  );
end
$$;

/**
 * Adds the board skeleton to the challenge listing.
 *
 * `differenceCount` lets the client draw "0 / N" and `answerUnitCount` / `spaceIndexes`
 * let it draw the empty answer slots. None of it is answer material: the slot count is
 * hint ladder step three (`ANSWER_LENGTH`) and the casual board already shows the boxes
 * from the first second. The characters themselves still arrive one at a time, from taps.
 */
create or replace function private.read_weekly_challenges_v1(
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
        'imageB', entry.public_content -> 'imageB',
        'differenceCount', entry.difference_count,
        'assistPattern', case
          when entry.category = 'ENGLISH' then 'SPELLING'
          else 'INITIAL_PATTERN'
        end,
        'answerUnitCount', pg_catalog.length(entry.answer_text),
        'spaceIndexes', coalesce(
          (
            select pg_catalog.jsonb_agg(position - 1 order by position)
            from pg_catalog.generate_series(1, pg_catalog.length(entry.answer_text)) position
            where pg_catalog.substr(entry.answer_text, position, 1) = ' '
          ),
          '[]'::jsonb
        )
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
      revisions.public_content,
      (
        select pg_catalog.count(*)::integer
        from pg_catalog.jsonb_array_elements(solutions.private_solution -> 'differences')
      ) difference_count,
      -- Mirrors `buildAnswerUnits`: English trims before spreading, Korean does not.
      case
        when pins.category = 'ENGLISH'
          then pg_catalog.btrim(
            solutions.private_solution #>> '{finalChallenge,canonicalAnswer}'
          )
        else solutions.private_solution #>> '{finalChallenge,canonicalAnswer}'
      end answer_text
    from private.weekly_challenge_pins pins
    join public.game_content_revisions revisions
      on revisions.content_revision_id = pins.content_revision_id
     and revisions.public_content_hash = pins.content_hash
    join private.game_content_solutions solutions
      on solutions.content_revision_id = pins.content_revision_id
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

/**
 * Replaces the owned commit wrapper so the tap log, not the request body, supplies the two
 * counts it can now prove. `hints_used` and `wrong_answers` still arrive from the API and
 * remain a known trust boundary until they get their own server-side commands.
 */
create or replace function private.commit_learning_attempt_owned_v1(
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
declare
  recorded_wrong_taps integer;
  has_taps boolean;
begin
  perform private.assert_learning_attempt_owner_v1(
    requested_attempt_id,
    requested_subject_key
  );

  select
    pg_catalog.count(*) > 0,
    pg_catalog.count(*) filter (where t.outcome = 'MISS')::integer
    into has_taps, recorded_wrong_taps
    from private.learning_attempt_taps t
    where t.attempt_id = requested_attempt_id;

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
    -- An attempt with no recorded taps predates the tap log; fall back rather than
    -- silently scoring it as a flawless run.
    case when has_taps then recorded_wrong_taps else trusted_wrong_taps end,
    trusted_wrong_answers,
    trusted_event_digest
  );
end
$$;

alter table private.learning_attempt_taps owner to game_security_owner;
alter function private.reject_learning_tap_mutation_v1()
  owner to game_security_owner;
alter function private.read_learning_attempt_board_v1(uuid,uuid,text,text,text,text)
  owner to game_security_owner;
alter function private.record_learning_tap_v1(uuid,uuid,text,text,text,text,text,uuid)
  owner to game_security_owner;

-- Enabled without FORCE, matching every sibling table: the owning role reaches the rows
-- through its security-definer functions and RLS shuts out everyone else. FORCE would
-- also lock out the owner, and with no policies that means nothing can write at all.
alter table private.learning_attempt_taps enable row level security;

revoke all on table private.learning_attempt_taps
from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role, economy_server;

revoke execute on function
  private.reject_learning_tap_mutation_v1(),
  private.read_learning_attempt_board_v1(uuid,uuid,text,text,text,text),
  private.record_learning_tap_v1(uuid,uuid,text,text,text,text,text,uuid)
from public, anon, authenticated, service_role, app_server, deployment_role,
  economy_deployment_role, admin_publish_role, economy_server;

grant execute on function
  private.read_learning_attempt_board_v1(uuid,uuid,text,text,text,text),
  private.record_learning_tap_v1(uuid,uuid,text,text,text,text,text,uuid)
to economy_server;

revoke create on schema private from game_security_owner;

do $$
begin
  execute format('revoke game_security_owner from %I', current_user);
end
$$;
