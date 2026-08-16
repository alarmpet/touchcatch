# Adaptive Hints, Pet Progression, and Weekly Ranking Design

## Status

Reviewed and corrected against the repository on 2026-07-30. Implementation
remains gated by the phased plan and approved policy revisions. The design
targets teenagers and adults while retaining readable, accessible interactions
for younger users.

## Verified repository constraints (Updated 2026-07-31)

- `content/learning/catalog.v1.json` has **91 entries**: `ENGLISH=74`, `PROVERB=7`, `IDIOM=5`, `GENERAL_KNOWLEDGE=5`; all are `DRAFT` (`publishBlocked: 91`). Exactly **3 packs** carry `ADMITTED` hint ladders.
- Production learning content flows through `content/learning/{catalog.v1.json,drafts,geometry,evidence,manifest.v1.json}`. `content/fixtures` is contract-test data, not a publication path.
- Active pet catalog `config/pet-catalog.v1.json` is `30 COMMON / 15 RARE / 5 LEGENDARY` (`catalogHash: 0b97e563...`). Daily loop duplicate promotion consumes 10 spare cards from 11 owned copies into 1 next-rarity card (`DAILY_PET_PROMOTION_V1`), keeping direct-draw pity untouched.
- Account XP and draw currency live in `profiles.exp` and `profiles.gacha_points`. Daily loop storage uses `202607300000_daily_pet_loop.sql` and competition schema uses `202607300002_learning_competition.sql`.
- Solo learning UI currently lives under `apps/mobile/src/learning-demo`; `apps/mobile/src/ui/BattleScreen.tsx` is the separate two-player surface.
- Roadmap prerequisites G3/G4/G6 are not all closed, so weekly competition is not an immediately executable production extension until Ladder Batch-1 and server APIs pass.

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

The product north star is collection-first:

`daily visit -> one free draw -> collection update -> learning spot-difference
play -> pet XP/level -> personal-best replay -> champion stars -> pet showcase`.

Weekly competition is an optional event layer, not the main retention loop.

## Research findings

- Kahoot awards correct answers with a time component and also provides an
  accuracy-only mode. TouchCatch should therefore keep correctness, hints, and
  errors ahead of raw speed rather than making the fastest tap the sole winner:
  <https://support.kahoot.com/hc/en-us/articles/115002303908-How-points-work>
- Quizizz exposes accuracy, score, and rank separately. TouchCatch should do
  the same on the result board:
  <https://support.quizizz.com/hc/en-us/articles/21137312976281-Understand-How-Accuracy-Is-Measured-on-Quizizz>
- Apple recommends selecting best-score and reset behavior according to
  whether a challenge is repeatable. Because TouchCatch intentionally rewards
  replay and improvement, it publishes each user's best verified rank tuple:
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

- One server-authoritative free pet draw per KST calendar day.
- Collection completion, duplicate-card promotion, numeric pet levels, and
  public-safe pet showcase.
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
- Direct messages, comments, pet trading, and user-authored showcase text.

## Modes

### Casual learning

- Replays are unlimited.
- The selected pet may provide its configured coaching effect.
- Completion grants progression only according to the bounded reward policy.
- Offline/casual personal best is private and cannot replace a server-verified
  ranked best.

### Weekly ranked challenge

- MVP enables `ENGLISH` and `PROVERB` only after each has five distinct,
  published, education-reviewed, asset-complete revisions.
- `IDIOM` and `GENERAL_KNOWLEDGE` remain disabled until they independently pass
  that gate and an approved policy revision enables them.
- Each enabled category publishes a fixed, versioned set of five challenges
  per week; content is never padded or reused to meet cardinality.
- Every completed verified attempt may improve the user's per-challenge best.
  A lower later score never replaces a higher best.
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

### Daily collection loop

- One `DAILY_FREE_DRAW_V1` claim is available per authenticated account and
  KST calendar day; unused claims do not accumulate.
- The server derives the KST claim date, serializes concurrent claims, and
  returns the first stored result on retry.
- The DRAFT candidate daily probabilities are `COMMON=0.80`, `RARE=0.18`,
  `LEGENDARY=0.02`. The daily draw does not advance or reset the
  points/direct-draw pity series.
- Probability, duplicate behavior, active catalog revision, and next reset
  time are shown before claim.
- The first owned copy is never consumed. Ten spare duplicate cards of the
  same pet (11 total owned copies before exchange) atomically produce one
  uniformly random active next-rarity entitlement:
  `COMMON -> RARE`, `RARE -> LEGENDARY`.
- Legendary duplicates unlock approved cosmetic prestige rewards rather than
  recursively producing another legendary pet.

### Level and rarity

- Pet level is displayed only as `Lv.N` and grows through play XP. It never
  falls.
- Level represents effort and coaching familiarity. A `COMMON Lv.27` may have
  more casual coaching presentation unlocked than a `LEGENDARY Lv.1`.
- Rarity represents scarcity, art, animation, story, profile presentation,
  and cosmetic prestige; it never grants stronger ranked information.
- Ranked hint steps, costs, score effects, and eligibility are identical for
  every rarity and level.

### Pet art source and admission

The desktop folders are source candidates, never runtime dependencies:

- `C:\Users\petbl\Desktop\alarmpetgo_\svg`: 35 PNG files, all 1024x1536;
- `C:\Users\petbl\Desktop\alarmpetgo_\rare`: 35 PNG files, all 1024x1536;
- `C:\Users\petbl\Desktop\alarmpetgo_\legend`: 18 PNG files, all 1024x1536.

The first two sets form 35 name-matched common/rare transformation candidates.
The legendary set uses mythic subjects but a substantially darker,
more-realistic style. No file is admitted from its folder name alone.

Admission requires a normalized slug, immutable pet identity, source hash,
rights/provenance record, alpha/background inspection, silhouette and
small-card legibility, safe crop, visual-style review, and generated mobile
variants. Approved originals are copied into repository-managed source storage;
absolute desktop paths never appear in catalog JSON or application code.

The existing economy contract currently admits exactly `30 COMMON / 15 RARE /
5 LEGENDARY`. MVP selection therefore chooses the strongest approved subset
instead of importing all 88 files. Remaining candidates stay outside the
active catalog. Legendary candidates that fail style cohesion are redrawn in
the approved TouchCatch character style while preserving only the reviewed
creature concept.

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

A coach charge advances that same ladder and increments `hintStepsUsed`
exactly once. `noHint` means `hintStepsUsed === 0`, including coach-triggered
steps. A missing or unknown `coachArchetype` falls back to `CHEER` with a
catalog-admission warning, and each attempt pins its pet-catalog revision.
After three coach charges are spent, the ordinary casual hint button remains
available and advances the same ladder without the pet-specific presentation.

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

- Top 10 verified per-user best attempts;
- the current user's best rank, even when outside Top 10;
- percentile, official score, completion time, mistakes, and hints;
- this attempt versus the user's previous best and improvement;
- a label distinguishing `이번 기록` from `내 최고 기록`.

Only display nickname, pet portrait, score, and metrics. Never expose auth IDs,
email addresses, raw coordinates, private hitboxes, or answer event payloads.

The authoritative row per user and challenge is the maximum verified canonical
rank tuple across all attempts. Verified scores `50 -> 60 -> 100 -> 80`
publish `100`. The row pins the pet selected when that best was achieved.

### Champion stars

- Each challenge has exactly one current champion after canonical tie-breaks.
- A pet receives one current champion star per challenge whose #1 best row is
  pinned to that pet. Three current #1 challenges display `★3`.
- When another verified best overtakes the record, the star transfers
  transactionally to the new champion pet.
- Current stars are derived prestige, not spendable inventory or XP.
- Historical achievement is numeric: `역대 1위 N문제`; no second star system
  is introduced.
- Mobile shows at most five glyphs and then uses `★×N`.
- Stars grant no hint, score, economy, or matchmaking advantage.

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
- MVP categories: `ENGLISH`, `PROVERB`, subject to the readiness gate.
- Future categories: `IDIOM`, `GENERAL_KNOWLEDGE`, enabled only by a later
  approved policy revision after five eligible revisions exist.
- Each category contains exactly five pinned challenge revisions.
- Weekly score is the sum of official display scores for those five revisions.
  Missing challenges contribute zero.
- Weekly tie-breaks are total hints, final-answer mistakes, difference misses,
  completion milliseconds, then earliest final qualifying attempt.
- Top 10 and the current user's surrounding two ranks are returned.

## Weekly champion reward

This is a later optional event policy. It must not block daily collection,
numeric pet progression, per-challenge best-score boards, or champion stars.

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

Public MVP copy states that only rank 1 receives a rare-only ticket. It must
not imply active rewards for ranks 2-10.

## Attempt lifecycle and scoring policy

A ranked reservation follows
`OPEN -> COMPLETED_VERIFIED | ABANDONED | EXPIRED | QUARANTINED`.

- `OPEN` does not publish or replace a best record.
- At most one unexpired `OPEN` exists per user, season, and pinned challenge;
  another start request returns or resumes it.
- Each idempotent transition to `COMPLETED_VERIFIED` atomically compares its
  canonical rank tuple with the existing best and replaces only when better.
- A policy-pinned TTL permits resume after disconnect. After expiry a new
  reservation may open because no verified completion was consumed.
- Invalid ordering or impossible timing becomes `QUARANTINED` and cannot rank
  or earn progression.
- UI copy explains that only a server-verified better result changes the
  published best and that retries remain available.

The score formula is a versioned candidate policy, not hard-coded authority.
Its 30,000 time cap means time after 90 seconds affects only tie-breaks.
Admission tests must cover the score/tie distribution around that cap.

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
- Exact solution coordinates exist only in an ephemeral authenticated attempt
  projection. Analytics, outbox payloads, leaderboard rows, and public APIs
  reject coordinate and hitbox fields.
- Nicknames pass moderation; blocked users are omitted from public boards but
  retain private progress.

## Failure behavior

- Offline casual completion is stored locally as practice and never enters a
  ranked board.
- A failed ranked upload cannot be reconstructed from client summary fields.
  The client resumes the same unexpired `OPEN` reservation or, after server
  expiry, starts a new one; neither consumes a slot without verification.
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
- A higher verified replay replaces the user's published best; a lower replay
  does not.
- Current champion-star counts equal the current #1 challenge rows pinned to
  that pet and transfer exactly once when overtaken.
- One daily free draw commits per account/KST date under retry and concurrency
  without mutating direct-draw pity.
- Ten eligible spare duplicate cards atomically produce one next-rarity
  entitlement while retaining the base owned copy.
- A weekly category champion receives exactly one rare-only ticket after any
  number of retries or concurrent settlers.
- The ticket never affects direct-draw pity.
- No private solution, raw coordinate, auth identifier, or secret reaches
  leaderboard APIs or analytics.
- Casual progress remains usable when competition is disabled.
- General-knowledge elimination reveals only distinct wrong options, never the
  correct option, and leaves at least one wrong option visible.
- Grapheme segmentation runs during admission/server processing; mobile
  renders a server-supplied pattern and does not depend on Hermes
  `Intl.Segmenter` support.
