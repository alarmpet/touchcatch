# Adaptive Hints, Pet Progression, and Weekly Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authored adaptive hints, fair pet-assisted learning, account and pet progression, per-challenge Top 10 boards, and effect-once weekly category champion rewards.

**Architecture:** Versioned content, progression, competition, and reward policies are admitted before use. Ranked attempts are reconstructed from server-authoritative commands and written once; read models derive Top 10 and the current user's rank from one database snapshot. Casual pet coaching is isolated from ranked rules, and weekly settlement awards a rare-only ticket through the existing immutable economy ledger and outbox.

**Tech Stack:** TypeScript 5.9, React Native/Expo, Vitest, PostgreSQL/Supabase, pgTAP, JSON Schema, existing `packages/contracts`, `packages/game-engine`, and economy ledger primitives.

## Global Constraints

- Audience includes teenagers and adults; Korean and English copy must remain understandable without childish forced prompts.
- Ranked pet effects are cosmetic only. Pet rarity, level, and species must not change ranked hint strength, cost, score, or eligibility.
- Weekly boundaries use `Asia/Seoul` and are stored as pinned UTC instants.
- Official ranking uses the first completed verified attempt per user, challenge revision, and season.
- Runtime hint text is authored and admitted; no runtime LLM generation is allowed.
- Client clocks, submitted scores, and submitted ranks are never trusted.
- `RARE_ONLY_TICKET_V1` excludes COMMON and LEGENDARY, selects uniformly within pinned RARE pets, and does not affect direct-draw pity.
- Existing economy remains fail-closed until an approved immutable revision and decision ID exist.
- Cash purchase, trading, and real-world prizes remain out of scope.
- Every mutation is idempotent and emits at most one durable outbox effect.

---

### Task 1: Freeze Hint, Progression, and Competition Policy Contracts

**Files:**
- Create: `config/hint-policy.v1.json`
- Create: `config/learning-progression.v1.json`
- Create: `config/weekly-competition.v1.json`
- Create: `schemas/hint-policy.schema.json`
- Create: `schemas/learning-progression.schema.json`
- Create: `schemas/weekly-competition.schema.json`
- Create: `packages/contracts/src/learning-policy.ts`
- Create: `packages/contracts/src/learning-policy.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: canonical JSON hashing and existing category names.
- Produces: `parseHintPolicyV1`, `parseLearningProgressionV1`,
  `parseWeeklyCompetitionV1`, and their canonical hashes.

- [ ] **Step 1: Write failing exact-policy tests**

```ts
expect(parseHintPolicyV1(hintFixture)).toMatchObject({
  schemaVersion: '1.0.0',
  stepsPerChallenge: 5,
  ranked: { petEffects: 'COSMETIC_ONLY', penaltyPerStep: 15_000 },
});
expect(parseLearningProgressionV1(progressionFixture).accountXp).toEqual({
  firstCompletion: 30,
  allObjectivesCorrect: 10,
  noHint: 10,
  repeatPersonalBest: 5,
  dailyChallengeCap: 200,
});
expect(parseWeeklyCompetitionV1(competitionFixture)).toMatchObject({
  timezone: 'Asia/Seoul',
  challengesPerCategory: 5,
  officialAttempt: 'FIRST_COMPLETED_VERIFIED',
});
```

Also reject unknown keys, non-integer rewards, negative values, duplicate
categories, any ranked pet advantage, and a ticket definition containing
COMMON or LEGENDARY.

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm vitest run packages/contracts/src/learning-policy.test.ts
```

Expected: FAIL because `learning-policy.ts` does not exist.

- [ ] **Step 3: Implement strict parsers and JSON schemas**

Use exact-key checks before returning frozen typed values. Hash admitted policy
JSON with the existing RFC 8785 canonical SHA-256 helper. Set all policy
artifacts to `status: "DRAFT"`; parsing succeeds, but production admission
requires `APPROVED`, `approvalDecisionId`, `approvedBy`, and `approvedAt`.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run packages/contracts/src/learning-policy.test.ts packages/contracts/src/canonical-json.test.ts
corepack pnpm typecheck
```

Expected: policy tests and typecheck PASS.

- [ ] **Step 5: Commit**

```powershell
git add config/hint-policy.v1.json config/learning-progression.v1.json config/weekly-competition.v1.json schemas packages/contracts/src/learning-policy.ts packages/contracts/src/learning-policy.test.ts packages/contracts/src/index.ts
git commit -m "feat(learning): freeze hint progression and competition policies"
```

---

### Task 2: Admit Five-Step Category Hint Ladders

**Files:**
- Modify: `packages/contracts/src/content.ts`
- Modify: `packages/contracts/src/content.test.ts`
- Modify: `packages/content-validator/src/validate-content.ts`
- Modify: `packages/content-validator/src/validate-content.test.ts`
- Create: `packages/content-validator/src/hint-ladder.ts`
- Create: `packages/content-validator/src/hint-ladder.test.ts`
- Modify: `schemas/game-content.public.schema.json`
- Modify: `schemas/game-content.private.schema.json`
- Modify: `content/fixtures/valid/en-intermediate.json`
- Modify: `content/fixtures/valid/ko-beginner.json`
- Modify: `content/fixtures/valid/ja-advanced.json`

**Interfaces:**
- Consumes: canonical answer, content language/category, reviewed localized
  text, and grapheme segmentation.
- Produces: `HintStepV1[]` and `validateHintLadder(category, answer, steps)`.

- [ ] **Step 1: Write category-specific RED tests**

```ts
expect(validateHintLadder('ENGLISH', 'resilience', englishSteps)).toEqual([]);
expect(validateHintLadder('ENGLISH', 'book', revealsFirstAndLastEarly))
  .toContain('SHORT_ENGLISH_PREMATURE_DISCLOSURE');
expect(validateHintLadder('PROVERB', '백문이 불여일견', proverbSteps))
  .toEqual([]);
expect(validateHintLadder('IDIOM', '전화위복', idiomSteps)).toEqual([]);
expect(validateHintLadder('IDIOM', '전화위복', inferredHanjaSteps))
  .toContain('UNREVIEWED_HANJA');
```

Add failures for missing ordinal, duplicate reveal index, full-answer disclosure
before step 5, control characters, missing `ko`/`en` localization, and
non-grapheme indexes.

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm vitest run packages/content-validator/src/hint-ladder.test.ts
```

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement grapheme-safe admission**

Implement `segmentAnswer(answer, language)` with `Intl.Segmenter`. Treat spaces
and punctuation as visible separators that are never charged as reveal units.
Require exactly five steps and the category ladders defined in the design.
Only accept Hanja when the bundle includes `reviewedHanja` and
`hanjaReviewStatus: "APPROVED"`.

- [ ] **Step 4: Add valid and invalid fixtures**

Add fixtures for:

```text
en-short-word-premature.json
en-missing-context.json
ko-proverb-invalid-initials.json
ko-idiom-unreviewed-hanja.json
hint-full-answer-step-four.json
hint-duplicate-reveal-index.json
```

Assert the exact error code for each.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run packages/contracts/src/content.test.ts packages/content-validator/src
corepack pnpm content:schemas:check
```

Expected: all content and schema projections PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/contracts/src/content.ts packages/contracts/src/content.test.ts packages/content-validator schemas content/fixtures
git commit -m "feat(content): admit category-specific hint ladders"
```

---

### Task 3: Implement Deterministic Hint Revelation

**Files:**
- Create: `packages/game-engine/src/hint-engine.ts`
- Create: `packages/game-engine/src/hint-engine.test.ts`
- Modify: `packages/contracts/src/match.ts`
- Modify: `packages/contracts/src/socket.ts`
- Modify: `packages/contracts/src/socket.schema.ts`
- Modify: `packages/contracts/src/projection.ts`
- Modify: `packages/game-engine/src/reducer.ts`
- Modify: `packages/game-engine/src/reducer.test.ts`

**Interfaces:**
- Consumes: admitted `HintStepV1[]`, player reveal state, mode, and selected
  pet coach archetype.
- Produces:

```ts
revealNextHint(input: HintRevealInput): HintRevealResult
```

and authoritative `HINT_STEP_REVEALED` events.

- [ ] **Step 1: Write reducer RED tests**

```ts
const first = revealNextHint({
  mode: 'CASUAL',
  steps,
  revealedOrdinals: [],
  coachCharges: 3,
});
expect(first).toMatchObject({
  ordinal: 1,
  rankedPenaltyUnits: 0,
  coachChargesRemaining: 2,
});

const ranked = revealNextHint({
  mode: 'RANKED',
  steps,
  revealedOrdinals: [],
  coachCharges: 99,
  pet: { rarity: 'LEGENDARY', coachArchetype: 'LINGUIST' },
});
expect(ranked).toMatchObject({
  ordinal: 1,
  rankedPenaltyUnits: 1,
});
```

Assert COMMON and LEGENDARY pets return identical ranked results. Assert retry
with the same request ID reveals no additional step.

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm vitest run packages/game-engine/src/hint-engine.test.ts
```

Expected: FAIL because `revealNextHint` is missing.

- [ ] **Step 3: Implement the pure hint engine**

Return the next ordinal only. Do not concatenate private answers into public
events. For visual hints return an admitted public region descriptor; exact
hit circles may appear only at step 5. Exhausted ladders return
`NO_HINT_REMAINING`.

- [ ] **Step 4: Integrate authoritative commands and projections**

Add:

```ts
type UseLearningHint = {
  type: 'USE_LEARNING_HINT';
  attemptId: string;
  expectedOrdinal: number;
};
```

Emit the localized hint text, public pattern/region, ordinal, and cumulative
ranked penalty. Never emit remaining private steps.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run packages/game-engine/src packages/contracts/src/socket.test.ts packages/contracts/src/projection.test.ts
```

Expected: engine replay and projection tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/game-engine/src packages/contracts/src
git commit -m "feat(game): add deterministic learning hints"
```

---

### Task 4: Create Ranked Attempt and Weekly Season Storage

**Files:**
- Create: `supabase/migrations/202607300001_learning_competition.sql`
- Create: `supabase/tests/database/learning-competition.test.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Modify: `docs/02-Architecture/08_DATABASE_SCHEMA.md`

**Interfaces:**
- Consumes: authenticated subject, pinned content/policy hashes, server event
  metrics, and selected pet.
- Produces: immutable attempts, official entries, weekly seasons, challenge
  pins, ranking projections, and settlement leases.

- [ ] **Step 1: Write pgTAP RED assertions**

```sql
select has_table('private', 'learning_attempts');
select has_table('private', 'weekly_seasons');
select has_table('private', 'weekly_challenge_pins');
select has_table('private', 'weekly_reward_settlements');
select has_view('public', 'learning_leaderboard_entries');
select has_function('private', 'commit_learning_attempt_v1');
```

Assert application roles cannot insert attempts, official entries, settlement
rows, or reward effects directly.

- [ ] **Step 2: Verify RED**

Run:

```powershell
supabase test db --local
```

Expected: new table/function assertions FAIL.

- [ ] **Step 3: Add immutable schema and constraints**

`private.learning_attempts` stores:

```text
attempt_id, subject_key, season_id, category, content_revision_id,
mode, started_at, assets_ready_at, completed_at, completion_ms,
display_score, hints_used, wrong_taps, wrong_answers,
selected_user_pet_id, ruleset_hash, hint_policy_hash,
competition_policy_hash, event_digest, verification_status
```

Create unique official key:

```sql
unique (subject_key, season_id, content_revision_id)
where mode = 'RANKED' and verification_status = 'VERIFIED'
```

Practice records use a separate personal-best table and cannot conflict with
official rows.

- [ ] **Step 4: Add RLS-safe leaderboard projection**

Expose only:

```text
season_id, category, content_revision_id, rank, nickname,
pet_catalog_id, display_score, completion_ms, hints_used,
wrong_taps, wrong_answers
```

Never expose `subject_key`, event digest, selected user-pet ID, auth IDs, raw
events, coordinates, or private content.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
supabase db reset --local
supabase db lint --local --fail-on error
supabase test db --local
```

Expected: schema, immutability, and RLS tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/202607300001_learning_competition.sql supabase/tests/database docs/02-Architecture/08_DATABASE_SCHEMA.md
git commit -m "feat(db): add verified learning competition storage"
```

---

### Task 5: Build the Server-Authoritative Attempt Runtime

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/learning/attempt-session.ts`
- Create: `apps/server/src/learning/attempt-session.test.ts`
- Create: `apps/server/src/learning/attempt-verifier.ts`
- Create: `apps/server/src/learning/attempt-verifier.test.ts`
- Create: `apps/server/src/learning/attempt-repository.ts`
- Modify: `packages/contracts/openapi.yaml`
- Modify: `packages/contracts/src/openapi.test.ts`

**Interfaces:**
- Consumes: authenticated user, pinned weekly challenge, accepted command
  sequence, asset attestations, and approved policies.
- Produces:

```ts
startRankedAttempt(input): RankedAttemptSession
completeRankedAttempt(input): VerifiedAttemptResult
```

- [ ] **Step 1: Write session RED tests**

Assert:

```ts
expect(started).toMatchObject({
  mode: 'RANKED',
  officialEligibility: 'FIRST_COMPLETED_VERIFIED',
});
expect(started).not.toHaveProperty('privateSolution');
```

Reject a missing challenge pin, wrong season, unapproved policy, mismatched
content revision, and a second official session after one verified completion.

- [ ] **Step 2: Write verifier RED tests**

Replay a command log and assert the server derives:

```ts
expect(result).toMatchObject({
  hintsUsed: 0,
  wrongTaps: 1,
  wrongAnswers: 0,
  completionMs: 42_000,
  displayScore: 83_000,
});
```

Reject client-supplied score/time, completion below 500 ms, impossible event
order, missing asset readiness, replay digest mismatch, and private-answer
fields in analytics.

- [ ] **Step 3: Verify RED**

Run:

```powershell
corepack pnpm vitest run apps/server/src/learning
```

Expected: FAIL because the runtime modules do not exist.

- [ ] **Step 4: Implement start and completion endpoints**

Add:

```text
POST /v1/learning/attempts
POST /v1/learning/attempts/{attemptId}/complete
GET  /v1/learning/attempts/{attemptId}
```

Require idempotency keys for both mutations. Pin selected pet, challenge
revision, policy hashes, and server start time at creation. Derive completion
from replay; pass only derived values to `commit_learning_attempt_v1`.

- [ ] **Step 5: Verify concurrency and retry behavior**

Run 20 concurrent completion calls with the same idempotency key and assert one
official row, one response body, and zero duplicate effects. Run differing
payloads with the same key and expect `IDEMPOTENCY_CONFLICT`.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run apps/server/src/learning packages/contracts/src/openapi.test.ts
corepack pnpm --dir apps/server typecheck
```

Expected: runtime, contract, and concurrency tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/server packages/contracts/openapi.yaml packages/contracts/src/openapi.test.ts
git commit -m "feat(server): verify ranked learning attempts"
```

---

### Task 6: Derive Top 10, My Rank, and Weekly Category Standings

**Files:**
- Create: `apps/server/src/learning/leaderboard.ts`
- Create: `apps/server/src/learning/leaderboard.test.ts`
- Create: `apps/server/src/learning/leaderboard-repository.ts`
- Create: `supabase/migrations/202607300002_learning_leaderboards.sql`
- Create: `supabase/tests/database/learning-leaderboards.test.sql`
- Modify: `packages/contracts/openapi.yaml`
- Modify: `packages/contracts/src/openapi.test.ts`

**Interfaces:**
- Consumes: verified official attempts and one transaction snapshot.
- Produces:

```ts
getChallengeLeaderboard(query): ChallengeLeaderboardV1
getWeeklyCategoryLeaderboard(query): WeeklyCategoryLeaderboardV1
```

- [ ] **Step 1: Write rank-order RED tests**

```ts
expect(rankAttempts(fixtures).map((row) => row.attemptId)).toEqual([
  'higher-score',
  'fewer-hints',
  'fewer-final-errors',
  'fewer-misses',
  'faster',
  'earlier',
]);
```

Assert Top 10 and `myRank` are from the same `snapshotRevision`. Assert a user
ranked 143rd receives rank, total competitors, percentile, and two neighboring
rows without leaking subject IDs.

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm vitest run apps/server/src/learning/leaderboard.test.ts
```

Expected: FAIL because rank functions do not exist.

- [ ] **Step 3: Implement database ranking functions**

Use `row_number()` with the exact canonical order from the design. Compute
weekly category totals across exactly five pinned revisions; missing attempts
contribute zero. Use one repeatable-read transaction for Top 10, current user,
neighbors, total count, and snapshot revision.

- [ ] **Step 4: Add read endpoints**

```text
GET /v1/leaderboards/challenges/{contentRevisionId}?seasonId=...
GET /v1/leaderboards/categories/{category}?seasonId=...
```

Return opaque cursors and moderated public profile fields only.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run apps/server/src/learning/leaderboard.test.ts packages/contracts/src/openapi.test.ts
supabase test db --local
```

Expected: ordering, snapshot, privacy, and database tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/server/src/learning/leaderboard* supabase/migrations/202607300002_learning_leaderboards.sql supabase/tests/database/learning-leaderboards.test.sql packages/contracts
git commit -m "feat(leaderboard): add challenge and weekly rankings"
```

---

### Task 7: Commit Account XP, Pet XP, and Bounded Draw Points

**Files:**
- Create: `supabase/migrations/202607300003_learning_progression.sql`
- Create: `supabase/tests/database/learning-progression.test.sql`
- Create: `apps/server/src/learning/progression.ts`
- Create: `apps/server/src/learning/progression.test.ts`
- Modify: `packages/contracts/src/economy.ts`
- Modify: `packages/contracts/src/economy.schema.test.ts`
- Modify: `docs/decisions/ADR-004-pet-economy.md`

**Interfaces:**
- Consumes: verified attempt, pinned selected pet, daily counters, and approved
  `learning-progression-v1`.
- Produces one progression receipt and outbox event per attempt.

- [ ] **Step 1: Write reward RED tests**

```ts
expect(calculateLearningProgression(perfectFirst)).toEqual({
  accountXp: 50,
  selectedPetXp: 25,
  drawPoints: 10,
});
expect(calculateLearningProgression(repeatPersonalBest)).toEqual({
  accountXp: 5,
  selectedPetXp: 2,
  drawPoints: 0,
});
```

Assert daily caps of 200 account XP, 100 pet XP, and 100 draw points. Assert a
pet selected after session start receives zero XP from the prior attempt.

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm vitest run apps/server/src/learning/progression.test.ts
```

Expected: FAIL because the progression module is missing.

- [ ] **Step 3: Add transactional progression function**

Create `private.award_learning_progression_v1(attempt_id, subject_key,
expected_policy_hash)`. Lock the subject and pinned user-pet rows, apply
remaining daily capacity, write immutable account/pet/draw ledger rows, and
emit one outbox event. Repeated calls return the stored response.

- [ ] **Step 4: Keep activation fail-closed**

Update ADR-004 with the candidate policy and require an explicit approval
decision before production startup admits it. Tests must prove `DRAFT` returns
`UNSUPPORTED_REWARD_POLICY` with no balance change.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run apps/server/src/learning/progression.test.ts packages/contracts/src/economy.schema.test.ts
supabase test db --local
```

Expected: calculation, cap, idempotency, and fail-closed tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/202607300003_learning_progression.sql supabase/tests/database/learning-progression.test.sql apps/server/src/learning/progression* packages/contracts/src/economy* docs/decisions/ADR-004-pet-economy.md
git commit -m "feat(economy): add bounded learning progression"
```

---

### Task 8: Settle Weekly Champions and Issue Rare-Only Tickets

**Files:**
- Create: `supabase/migrations/202607300004_weekly_champion_rewards.sql`
- Create: `supabase/tests/database/weekly-champion-rewards.test.sql`
- Create: `apps/server/src/learning/weekly-settlement.ts`
- Create: `apps/server/src/learning/weekly-settlement.test.ts`
- Create: `apps/server/src/learning/settlement-worker.ts`
- Modify: `packages/contracts/src/economy.ts`
- Modify: `packages/contracts/openapi.yaml`

**Interfaces:**
- Consumes: closed season, final weekly ranking snapshot, approved catalog and
  economy hashes, and a fencing token.
- Produces one `RARE_ONLY_TICKET_V1` entitlement for each category champion.

- [ ] **Step 1: Write settlement RED tests**

```ts
expect(settleCategory(closedEnglishSeason)).toMatchObject({
  category: 'ENGLISH',
  rank: 1,
  rewardType: 'RARE_ONLY_TICKET_V1',
  quantity: 1,
});
```

Assert an open season, incomplete challenge set, quarantined winner, stale
fence, policy mismatch, or missing champion writes no reward. Run two settlers
concurrently and assert one entitlement and one outbox event.

- [ ] **Step 2: Write rare-ticket draw RED tests**

Assert the result rarity is always `RARE`, selection is uniform across the
pinned active RARE set, a duplicate increments copies, and rare/legendary pity
counters remain byte-for-byte unchanged.

- [ ] **Step 3: Verify RED**

Run:

```powershell
corepack pnpm vitest run apps/server/src/learning/weekly-settlement.test.ts
supabase test db --local
```

Expected: settlement and ticket functions are missing.

- [ ] **Step 4: Implement fenced settlement**

Use a lease with monotonically increasing fencing token. Snapshot the champion
attempt ID and rank tuple, then call
`private.issue_weekly_champion_ticket_v1`. Unique key:

```text
(season_id, category, subject_key, RARE_ONLY_TICKET_V1)
```

Persist policy/catalog hashes on settlement, entitlement, draw, inventory, and
outbox rows.

- [ ] **Step 5: Implement ticket consumption**

Add:

```text
POST /v1/gacha/tickets/{ticketId}/draw
```

The server chooses uniformly from pinned RARE definitions. Require an
idempotency key and disclose catalog candidates and selection method before
the confirmation action.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run apps/server/src/learning/weekly-settlement.test.ts packages/contracts/src/openapi.test.ts
supabase test db --local
corepack pnpm test:db:concurrency
```

Expected: exact-once settlement, ticket, inventory, pity-isolation, and
concurrency tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add supabase/migrations/202607300004_weekly_champion_rewards.sql supabase/tests/database/weekly-champion-rewards.test.sql apps/server/src/learning packages/contracts
git commit -m "feat(rewards): issue weekly champion rare tickets"
```

---

### Task 9: Add Mobile Hint, Pet Coach, and Result-Board UX

**Files:**
- Create: `apps/mobile/src/features/learning/HintPanel.tsx`
- Create: `apps/mobile/src/features/learning/HintPanel.test.tsx`
- Create: `apps/mobile/src/features/learning/PetCoach.tsx`
- Create: `apps/mobile/src/features/learning/PetCoach.test.tsx`
- Create: `apps/mobile/src/features/leaderboard/ChallengeResultBoard.tsx`
- Create: `apps/mobile/src/features/leaderboard/ChallengeResultBoard.test.tsx`
- Create: `apps/mobile/src/features/leaderboard/WeeklyCategoryBoard.tsx`
- Create: `apps/mobile/src/features/leaderboard/WeeklyCategoryBoard.test.tsx`
- Create: `apps/mobile/src/features/pets/WeeklyRewardTicket.tsx`
- Modify: `apps/mobile/src/ui/BattleScreen.tsx`
- Modify: `packages/contracts/src/ui.ts`
- Modify: `packages/contracts/src/ui.test.ts`

**Interfaces:**
- Consumes: public hint events, pet coach projection, challenge/weekly
  leaderboard DTOs, progression receipt, and ticket disclosure.
- Produces accessible casual and ranked learning/result experiences.

- [ ] **Step 1: Write hint and pet RED tests**

Assert:

```tsx
expect(rankHint.props.accessibilityLabel).toContain('힌트 사용 시 15000점 감소');
expect(legendaryRankedHint).toEqual(commonRankedHint);
expect(casualPetCoach.props.accessibilityLabel).toContain('남은 도움 3회');
```

Assert no hint is consumed without pressing the button, reduced motion uses a
static pet, and failed hint requests preserve the prior state.

- [ ] **Step 2: Write result-board RED tests**

Render a user ranked 143rd and assert:

```tsx
expect(screen.getByText('143위 / 812명')).toBeTruthy();
expect(screen.getByText('상위 18%')).toBeTruthy();
expect(screen.getByLabelText('내 순위로 이동')).toBeTruthy();
expect(screen.getByText('공식 첫 도전')).toBeTruthy();
expect(screen.getByText('연습 최고 기록')).toBeTruthy();
```

Assert exactly ten Top 10 rows, tie metrics, snapshot label, and no auth ID or
email text.

- [ ] **Step 3: Verify RED**

Run:

```powershell
corepack pnpm vitest run apps/mobile/src/features
```

Expected: feature components do not exist.

- [ ] **Step 4: Implement mode-explicit hint and pet UI**

Casual mode shows three pet coach charges. Ranked mode replaces pet ability
copy with “랭킹에서는 모든 펫의 도움 효과가 동일합니다.” Present the next
hint and exact score penalty before confirmation.

- [ ] **Step 5: Implement challenge and weekly boards**

Display Top 10, current user, two neighbors, percentile, score breakdown, and
personal best. Weekly category board shows five challenge contributions and
the champion ticket rules. Do not imply that a BLOCKED or quarantined result is
ranked.

- [ ] **Step 6: Implement reward disclosure**

Before consuming a rare-only ticket show:

```text
일반 및 전설 등급은 나오지 않습니다.
현재 시즌에 고정된 희귀 펫 중 동일 확률로 1종을 획득합니다.
중복 펫은 보유 수량이 증가하며 일반 뽑기 천장에는 영향을 주지 않습니다.
```

- [ ] **Step 7: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run apps/mobile/src/features apps/mobile/src/ui
corepack pnpm mobile:typecheck
```

Expected: interaction, accessibility, privacy, and type tests PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/mobile/src/features apps/mobile/src/ui/BattleScreen.tsx packages/contracts/src/ui.ts packages/contracts/src/ui.test.ts
git commit -m "feat(mobile): add hints pet coaching and leaderboards"
```

---

### Task 10: Add Analytics, Abuse Review, and Operational Gates

**Files:**
- Modify: `packages/contracts/src/analytics.ts`
- Create: `packages/contracts/src/analytics.test.ts`
- Create: `apps/server/src/learning/attempt-risk.ts`
- Create: `apps/server/src/learning/attempt-risk.test.ts`
- Create: `docs/analytics/learning-competition-metrics.md`
- Create: `docs/operations/weekly-learning-settlement.md`
- Create: `tools/release-learning-competition.ts`
- Create: `tools/release-learning-competition.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: opaque attempt/season IDs, verification outcomes, settlement
  outcomes, and aggregate metrics.
- Produces privacy-safe telemetry, quarantine decisions, and
  `learning:competition:check`.

- [ ] **Step 1: Write privacy and risk RED tests**

Reject analytics containing auth UUID, email, answer text, raw coordinates,
hitboxes, or unrevealed hint text. Assert completion below 500 ms,
non-monotonic event order, impossible asset timing, and replay mismatch yield
`REVIEW_REQUIRED`, not an automatic ban or reward.

- [ ] **Step 2: Write release-gate RED tests**

Require:

```text
verified_attempt_duplicate_total = 0
official_attempt_overwrite_total = 0
leaderboard_snapshot_mismatch_total = 0
weekly_reward_duplicate_total = 0
rare_ticket_pity_mutation_total = 0
private_field_leak_total = 0
```

Require at least 10,000 synthetic verified attempts for ranking/load evidence
and 100 concurrent settlement retries for exact-once evidence.

- [ ] **Step 3: Verify RED**

Run:

```powershell
corepack pnpm vitest run apps/server/src/learning/attempt-risk.test.ts tools/release-learning-competition.test.ts
```

Expected: risk and release modules are missing.

- [ ] **Step 4: Implement bounded telemetry and risk quarantine**

Use opaque identifiers and enumerated reasons only. Store sensitive replay
material in the private operational boundary with retention and access logs;
never forward it to product analytics.

- [ ] **Step 5: Add commands and runbooks**

Add:

```json
{
  "learning:competition:check": "tsx tools/release-learning-competition.ts --check"
}
```

Document opening/closing a season, fence recovery, reward reconciliation,
nickname moderation, appeal, and rollback without deleting ledger history.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run apps/server/src/learning tools/release-learning-competition.test.ts packages/contracts/src/analytics.test.ts
corepack pnpm learning:competition:check
```

Expected: privacy, abuse, load, and exact-once gates PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/contracts/src/analytics* apps/server/src/learning/attempt-risk* docs/analytics docs/operations tools/release-learning-competition* package.json
git commit -m "test(learning): gate ranking and reward integrity"
```

---

### Task 11: Perform End-to-End Season Acceptance

**Files:**
- Create: `tests/integration/learning-season.test.ts`
- Create: `docs/evidence/learning-competition/acceptance.v1.json`
- Create: `docs/evidence/learning-competition/README.md`
- Modify: `docs/04-Roadmap/12_IMPLEMENTATION_ROADMAP.md`

**Interfaces:**
- Consumes: approved test policies, five pinned challenges per category,
  authenticated test users, settlement worker, and mobile DTOs.
- Produces an auditable pre-production acceptance record.

- [ ] **Step 1: Write the end-to-end scenario**

Create 12 users and run:

1. five English challenges with deterministic timing and mistakes;
2. one casual pet-assisted challenge;
3. one ranked challenge with COMMON and LEGENDARY pets producing identical
   authoritative results;
4. an official first attempt followed by a faster practice attempt;
5. a user outside Top 10;
6. two concurrent weekly settlers;
7. champion ticket consumption and duplicate pet handling.

- [ ] **Step 2: Assert the complete outcome**

Assert:

```ts
expect(challengeBoard.top10).toHaveLength(10);
expect(challengeBoard.me.rank).toBe(12);
expect(officialAttempt.attemptId).toBe(firstAttempt.attemptId);
expect(personalBest.attemptId).toBe(fasterPractice.attemptId);
expect(champion.entitlements).toHaveLength(1);
expect(champion.draw.rarity).toBe('RARE');
expect(afterPity).toEqual(beforePity);
```

- [ ] **Step 3: Run full verification**

Run:

```powershell
corepack pnpm check:runtime
corepack pnpm content:schemas:check
corepack pnpm ruleset:projections:check
corepack pnpm typecheck
corepack pnpm test
corepack pnpm check:db
corepack pnpm learning:competition:check
git diff --check
```

Expected: every command PASS. DRAFT policies may pass validation but production
startup must still reject them until approval metadata is supplied.

- [ ] **Step 4: Record evidence**

Record exact git SHA, policy/config hashes, database migration head, test
counts, load sample size, settlement retry count, and gate results. Do not mark
production approved without the product/economy approval decision.

- [ ] **Step 5: Commit**

```powershell
git add tests/integration/learning-season.test.ts docs/evidence/learning-competition docs/04-Roadmap/12_IMPLEMENTATION_ROADMAP.md
git commit -m "test(learning): record weekly season acceptance"
```

## Completion Conditions

- Hint ladders are authored, locale-safe, and do not reveal short answers too
  early.
- Casual pet assistance works while ranked pet effects remain identical.
- Account XP, selected-pet XP, and draw points are bounded and effect-once.
- Challenge Top 10 and current-user rank share one database snapshot.
- Weekly category standings use exactly five pinned challenges.
- Official first attempts cannot be replaced by faster practice attempts.
- One category champion receives one rare-only ticket after concurrent retries.
- Rare-only tickets never mutate ordinary draw pity.
- Policies remain deployment-blocked until explicit approval metadata exists.
- Store-facing reward terms disclose selection and duplicate behavior.
