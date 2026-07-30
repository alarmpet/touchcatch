# Adaptive Hints, Pet Progression, and Weekly Ranking Design

## Status

Proposed for implementation planning. This design targets teenagers and adults
while retaining readable, accessible interactions for younger users.

## Product decision

TouchCatch will combine three loops without allowing one to corrupt another:

1. a learning loop with progressively stronger, content-specific hints;
2. a collection loop where solving problems grows a selected pet and earns
   transparent pet-draw rewards;
3. a fair competition loop with per-challenge Top 10 boards and weekly
   category championships.

The competitive board is online and server-authoritative. Casual learning may
use pet assistance; ranked attempts normalize pet effects so a rare pet never
creates a pay-to-win ranking advantage.

## Research findings

- Kahoot awards correct answers with a time component and also provides an
  accuracy-only mode. TouchCatch should therefore keep correctness, hints, and
  errors ahead of raw speed rather than making the fastest tap the sole winner:
  <https://support.kahoot.com/hc/en-us/articles/115002303908-How-points-work>
- Quizizz exposes accuracy, score, and rank separately. TouchCatch should do
  the same on the result board:
  <https://support.quizizz.com/hc/en-us/articles/21137312976281-Understand-How-Accuracy-Is-Measured-on-Quizizz>
- Apple recommends selecting best-score and reset behavior according to
  whether a challenge is repeatable. TouchCatch will keep one official first
  attempt and an unranked personal-best track:
  <https://developer.apple.com/documentation/gamekit/choosing-a-leaderboard-for-your-challenges>
- Duolingo uses XP and time-bounded leagues, but user reports show that pure XP
  farming can distract from learning. TouchCatch will use a fixed weekly
  challenge set rather than unlimited volume:
  <https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo/>
- Khan Academy Kids uses guide characters for instruction and awards
  collectibles as learning progresses. Pets should coach and celebrate rather
  than simply reveal answers:
  <https://khankids.zendesk.com/hc/en-us/articles/360049358751-Learn-more-about-the-characters-inside-Khan-Academy-Kids>
- Habitica connects completed activity to XP, currency, eggs, and pets. Its
  collection loop supports the proposed separation between account XP, pet
  XP, and draw currency:
  <https://habitica.com/static/overview?mobile-app=true&theme=wiki>
- Store reviews for spot-the-difference games repeatedly criticize forced
  advertisements, unsolicited hint prompts, and incorrect tap detection.
  TouchCatch will not force an advertisement to use a hint:
  <https://play.google.com/store/apps/details?id=com.miniit.spotit>
- Google Play requires transparent terms and probability or selection-method
  disclosure for chance-based reward programs. TouchCatch will publish every
  draw rule in-app before a ticket is consumed:
  <https://support.google.com/googleplay/android-developer/answer/17190352>

## Scope

### Included

- English word, Korean proverb, Korean four-character idiom, general knowledge,
  and visual-difference hint ladders.
- Account XP and selected-pet XP from completed learning challenges.
- Casual pet assistance with deterministic, auditable effects.
- Per-challenge Top 10 plus the current user's rank and percentile.
- Weekly category championships in `Asia/Seoul`.
- Exactly one rare-only ticket for each weekly category champion.
- Server-side attempt verification, ranking, settlement, and effect-once reward
  delivery.
- Probability and reward-method disclosure.

### Excluded

- Cash purchase of tickets or draw currency.
- Tradable pets, cash prizes, or user-to-user item transfer.
- Pet power advantages in ranked scoring.
- Client-authoritative elapsed time, score, ranking, or reward.
- Runtime LLM generation of hints.
- Global all-time prize settlement.

## Modes

### Casual learning

- Replays are unlimited.
- The selected pet may provide its configured coaching effect.
- Completion grants progression only according to the bounded reward policy.
- A personal best may be recorded, but it cannot replace the official ranked
  attempt.

### Weekly ranked challenge

- Each category publishes a fixed, versioned set of five challenges per week.
- A user's first completed verified attempt per challenge is the official
  ranked attempt.
- Later attempts are practice and update only the private personal best.
- Ranked hint steps and costs are identical for every player. Pet rarity,
  level, and species cannot alter them.
- A ranked attempt requires an online, server-issued attempt session.

## Hint model

Every hint is a pre-authored `HintStepV1`. Runtime code selects and reveals
steps; it never invents educational text.

```ts
type HintKind =
  | 'VISUAL_REGION'
  | 'SEMANTIC_CATEGORY'
  | 'DEFINITION'
  | 'CONTEXT_SENTENCE'
  | 'ANSWER_LENGTH'
  | 'INITIAL_PATTERN'
  | 'REVEAL_GRAPHEME'
  | 'ELIMINATE_OPTION';

type HintStepV1 = Readonly<{
  ordinal: 1 | 2 | 3 | 4 | 5;
  kind: HintKind;
  localizedText: Readonly<Record<'ko' | 'en', string>>;
  revealIndexes: readonly number[];
  rankedPenaltyUnits: 1;
}>;
```

All answer segmentation uses `Intl.Segmenter` grapheme boundaries and the
existing normalized canonical answer. Control characters, empty hints,
out-of-range indexes, duplicate ordinals, and a hint that discloses the whole
answer before step 5 are rejected at content admission.

### English word ladder

1. semantic category or short Korean definition;
2. an approved example sentence containing one blank;
3. grapheme count and, when reviewed, syllable count;
4. one deterministic grapheme: first for answers of at least five graphemes,
   otherwise an internal grapheme;
5. alternating unrevealed graphemes, while retaining at least one blank.

For answers of four graphemes or fewer, the system never reveals first and last
simultaneously before step 5.

### Korean proverb ladder

1. a situation where the proverb applies;
2. its central lesson without quoting the answer;
3. an initial-consonant pattern, such as `ㅂ ㄷ ㅁ ㅇ`;
4. one full syllable chosen by the authored reveal order;
5. alternating syllables while retaining at least one blank.

Spacing is shown, but punctuation does not consume a reveal.

### Korean four-character idiom ladder

1. a modern situation example;
2. an approved Korean meaning;
3. the four initial consonants;
4. one full syllable;
5. two full syllables.

Verified Hanja glosses may appear only when the content bundle contains an
education-reviewed Hanja field. The runtime must not infer Hanja.

### General-knowledge ladder

1. domain/category;
2. explanatory fact that does not repeat the answer;
3. eliminate one wrong option;
4. answer length or first grapheme;
5. eliminate a second wrong option.

### Visual-difference ladder

1. the pet looks toward the correct quadrant;
2. the quadrant receives a subtle accessible pulse;
3. the authored semantic object clue is shown;
4. a bounded region covering no more than 20% of the image is highlighted;
5. the exact hit circle is shown.

The hint button is always user-initiated. No timer may automatically consume a
hint or open an advertisement.

## Pet assistance and progression

### Assistance

Pets have a `coachArchetype`, not a combat-stat advantage:

- `SCOUT`: improves visual-region presentation in casual mode;
- `LINGUIST`: adds an approved example or pronunciation aid;
- `SAGE`: adds an approved meaning explanation;
- `CHEER`: gives neutral encouragement after repeated misses.

In casual mode a selected pet has three coach charges per challenge. One charge
reveals exactly one ordinary hint step; it cannot skip the ladder. In ranked
mode all coach archetypes are cosmetic and every player receives the same hint
interface and penalty.

### Candidate progression policy

This exact candidate must remain deployment-blocked until an immutable economy
revision is approved:

```json
{
  "policyVersion": "learning-progression-v1-candidate",
  "accountXp": {
    "firstCompletion": 30,
    "allObjectivesCorrect": 10,
    "noHint": 10,
    "repeatPersonalBest": 5,
    "dailyChallengeCap": 200
  },
  "selectedPetXp": {
    "firstCompletion": 15,
    "allObjectivesCorrect": 5,
    "noHint": 5,
    "repeatPersonalBest": 2,
    "dailyChallengeCap": 100
  },
  "drawPoints": {
    "firstCompletion": 10,
    "weeklyCategoryParticipation": 20,
    "dailyCap": 100
  }
}
```

The existing two-player values `win=100`, `loss=60`, and
`perfectWordMeaning=40` remain a separate match reward policy. They are not
silently reused for solo challenges.

XP is applied only to the pet selected when the attempt session starts. A later
selection change cannot redirect a committed reward.

## Ranking design

### Per-challenge board

The result board shows:

- Top 10 verified official attempts;
- the current user's official rank, even when outside Top 10;
- percentile, official score, completion time, mistakes, and hints;
- the user's unranked personal best and improvement;
- a label distinguishing `공식 첫 도전` from `연습 최고 기록`.

Only display nickname, pet portrait, score, and metrics. Never expose auth IDs,
email addresses, raw coordinates, private hitboxes, or answer event payloads.

### Official score

```ts
function displayScore(input: {
  completionMs: number;
  wrongDifferenceTaps: number;
  wrongFinalAnswers: number;
  hintStepsUsed: number;
}): number {
  const timePenalty = Math.min(30_000, Math.floor(input.completionMs / 3));
  return Math.max(
    0,
    100_000
      - timePenalty
      - input.wrongDifferenceTaps * 3_000
      - input.wrongFinalAnswers * 10_000
      - input.hintStepsUsed * 15_000,
  );
}
```

Canonical order is:

1. `display_score DESC`;
2. `hint_steps_used ASC`;
3. `wrong_final_answers ASC`;
4. `wrong_difference_taps ASC`;
5. `completion_ms ASC`;
6. `accepted_at ASC`;
7. `attempt_id ASC`.

Completion time begins after both assets are attested ready and stops at the
server-accepted final answer. Network round-trip time is not taken directly
from a client clock.

### Weekly category board

- Season boundary: Monday 00:00:00 through the next Monday 00:00:00 in
  `Asia/Seoul`, stored as exact UTC instants.
- Categories: `ENGLISH`, `PROVERB`, `IDIOM`, `GENERAL_KNOWLEDGE`.
- Each category contains exactly five pinned challenge revisions.
- Weekly score is the sum of official display scores for those five revisions.
  Missing challenges contribute zero.
- Weekly tie-breaks are total hints, final-answer mistakes, difference misses,
  completion milliseconds, then earliest final qualifying attempt.
- Top 10 and the current user's surrounding two ranks are returned.

## Weekly champion reward

Each category has one champion settlement row. Rank 1 receives one
`RARE_ONLY_TICKET_V1`:

- COMMON is excluded.
- The result is uniformly selected from active RARE pets in the pinned catalog
  revision.
- The ticket cannot produce LEGENDARY and does not increment or reset direct
  draw pity.
- A duplicate increments the existing copy count.
- One `(season_id, category, subject_key, reward_type)` effect may commit once.
- A tie is resolved by the canonical rank tuple; there is no client-selected
  winner.

Ranks 2–3 receive two ordinary draw tickets and ranks 4–10 receive one ordinary
draw ticket only in a later policy revision. MVP implementation records these
placements but activates only the rank-1 rare ticket to keep reward supply
bounded.

The in-app terms screen states the eligible population, season window,
selection method, RARE catalog, duplicate behavior, pity exclusion, settlement
time, and support path before participation.

## Security and abuse controls

- Attempt session, content revision, ruleset hash, season, category, selected
  pet, and asset attestations are server-pinned.
- Commands are idempotent and replayable through the authoritative reducer.
- A client cannot submit score, rank, elapsed time, or reward type.
- Completion below 500 ms or impossible command ordering is quarantined, not
  rewarded.
- Excessive tap rate uses the existing bounded attempt limiter.
- Emulator/root signals may raise review risk but cannot alone ban a user.
- Settlement reads only finalized, non-quarantined attempts.
- Leaderboard reads use RLS-safe projections and opaque cursors.
- Nicknames pass moderation; blocked users are omitted from public boards but
  retain private progress.

## Failure behavior

- Offline casual completion is stored locally as practice and never enters a
  ranked board.
- A failed ranked upload cannot be reconstructed from client summary fields;
  the user must retry a new official attempt.
- If settlement crashes, the same fencing token resumes it without issuing a
  second ticket.
- If a catalog or economy hash changes during settlement, processing fails
  closed with `POLICY_MISMATCH`.
- An empty or invalid weekly challenge set prevents the season from opening.

## Accessibility

- Rankings never use color alone; position and movement are announced.
- The user's row is reachable directly and announced as “전체 N명 중 M위”.
- Hint changes use a polite live region and preserve the unrevealed pattern for
  screen readers.
- Visual-region hints include a text direction and a non-flashing highlight.
- Reduced-motion mode replaces pet animation with a static pose.
- Competition, pet animation, and public nickname display can be disabled
  independently.

## Acceptance criteria

- Every admitted category bundle has a valid five-step hint ladder.
- English short words and Korean graphemes cannot be prematurely disclosed.
- Ranked results are identical under replay and cannot change with pet rarity.
- The Top 10 and “my rank” are derived from the same snapshot.
- Official first attempts cannot be overwritten by practice attempts.
- A weekly category champion receives exactly one rare-only ticket after any
  number of retries or concurrent settlers.
- The ticket never affects direct-draw pity.
- No private solution, raw coordinate, auth identifier, or secret reaches
  leaderboard APIs or analytics.
- Casual progress remains usable when competition is disabled.

