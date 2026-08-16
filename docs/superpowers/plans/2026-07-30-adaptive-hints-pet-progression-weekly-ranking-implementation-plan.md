# Adaptive Hints, Pet Progression, and Weekly Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily pet-collection learning loop with one free draw,
numeric pet progression, authored hints, replayable per-challenge Top 10
boards, champion stars, and a public-safe pet showcase.

**Architecture:** Versioned pet art, catalog, content, progression, competition,
and reward policies are admitted before use. Daily claims, duplicate promotion,
attempts, best-record replacement, stars, and rewards are server-authoritative
and effect-once. Pet level controls casual coaching presentation while rarity
and champion stars remain cosmetic prestige in ranked play.

**Tech Stack:** TypeScript 5.9, React Native/Expo, Vitest, PostgreSQL/Supabase, pgTAP, JSON Schema, existing `packages/contracts`, `packages/game-engine`, and economy ledger primitives.

## Execution Baseline and Inventory SSOT (2026-07-31 Review Update)

Repository verification on 2026-07-31 confirmed the current repository facts:

1. **Pet Catalog & Art (Phase 0 Complete):** Active catalog `config/pet-catalog.v1.json` is `30 COMMON / 15 RARE / 5 LEGENDARY` (`catalogHash: 0b97e563fde36aecb6e4cdcddf7f3e7d963a3efba05b1898274a8935b3cbfe1b`). Sources are admitted in `content/pets/source-manifest.v1.json`. `coachArchetype` fields exist across all 50 entries (`SCOUT`: 36, `CHEER`: 9, `LINGUIST`: 3, `SAGE`: 2).
2. **Daily Pet Loop (Phase 0 Complete):** `config/daily-pet-loop.v1.json`, migration `202607300000_daily_pet_loop.sql`, migration `202607300001_pet_coach_archetype.sql`, and `apps/server/src/pets/*` are landed in code and covered by tests.
3. **Content Inventory (Phase A Gate Blocked):** `content/learning/catalog.v1.json` contains **91 DRAFT packs** (`ENGLISH`: 74, `PROVERB`: 7, `IDIOM`: 5, `GENERAL_KNOWLEDGE`: 5; all `publishBlocked: 91`). Exactly **3 packs** carry `ADMITTED` hint ladders (`en-resilience`, `ko-proverb-seeing-is-believing`, `ko-idiom-turn-misfortune`). Phase C/D ranking remaining blocked until **Ladder Batch-1** (`ENGLISH` >= 5 and `PROVERB` >= 5 ADMITTED) passes.
4. **Economy Alignment (ADR-004 Resolution):** Daily loop duplicate promotion consumes 10 spare cards from 11 owned copies into 1 next-rarity card while preserving the 1 base copy (`DAILY_PET_PROMOTION_V1`). Match/direct-draw 5-copy fusion under ADR-004 remains separate or superseded by ADR-004 update; daily pet loop does not mutate direct-draw pity or fusion counters.
5. **Existing Migration IDs:**
   - `202607300000_daily_pet_loop.sql` (Landed)
   - `202607300001_pet_coach_archetype.sql` (Landed)
   - `202607300002_learning_competition.sql` (Landed - Task 4 attempts, best_records, views, RPCs)
   - Next free migration ID: `202607300003_...`
6. **Task Checkbox Status Alignment:** Tasks 0A, 0B, 1, 2 (validator/engine pipeline), 3 (engine), and 4 (DB schema) are substantially landed in codebase and noted in baseline. Outstanding tasks are Phase A Mobile UI (Task 9 casual slice), Ladder Batch-1, Server package setup (`apps/server/package.json`), Thin attempt runtime (Task 5), Leaderboard API (Task 6), Progression ADR/DB (Task 7), Weekly Ticket (Task 8), and CI/Gates (Task 10/11).

## Approved Review Corrections and Execution Phases

Review disposition after the collection-first product revision:

- **Accepted:** content readiness, real learning-pipeline integration,
  `hintUnits`/`HintStepV1` separation, economy source ADR, ticket entitlement,
  explicit attempt lifecycle, thin server adapter, coach/noHint semantics,
  private-coordinate rejection, pet-catalog archetype, solo/battle separation,
  deterministic pinning tool, split CI load, and non-normative `research.md`.
- **Superseded:** “first completed attempt is the official record.” The user
  explicitly chose replay-driven improvement, so the normative rule is best
  verified canonical rank tuple.
- **Deprioritized:** weekly ranking as the primary loop. Problem-level Top 10
  and champion stars are Phase C; weekly settlement is optional Phase D.
- **Rejected as current advice:** limiting the detailed implementation plan to
  the old Phase A only. Daily collection is now the product entry loop and has
  its own independently testable Phase 0, while every later phase remains
  gated.

Do not execute the tasks as one uninterrupted rollout:

1. **Phase 0 — Pet collection foundation (COMPLETE):** Tasks 0A-0B landed. Audit and import the approved 30/15/5 pet-art subset, daily free draw, duplicate promotion, collection, numeric levels, and showcase-safe projections.
2. **Phase A — Adaptive hints & Mobile Casual Loop:** Tasks 1-3 landed in engine/contracts. Task 9 casual slice (Mobile `HintPanel`, `PetCoach`, `DailyFreeDraw`, `PetCollection`, `PetShowcase`) and **Ladder Batch-1** (`ENGLISH` >=5, `PROVERB` >=5 admitted) are the active priority.
3. **Phase B — Progression:** Task 1 progression slice and Task 7, only after
   an economy-extension ADR fixes source identity and idempotency. Reuse
   `profiles.exp`, `profiles.gacha_points`, and `user_pets.exp`.
4. **Phase C — Problem ranking:** Task 4 DB landed in `202607300002_learning_competition.sql`. Task 5 thin attempt runtime (`packages/learning-competition` pure + `apps/server` adapter), Task 6 read APIs/stars, Task 9 ranked UI slice, and Tasks 10-11. Publish each user's best verified record and derive champion stars.
5. **Phase D — Optional weekly events:** Task 8 (`202607300004_weekly_champion_rewards.sql`) and weekly-only portions of Tasks 6 and 9. Start only after applicable G3/G4/G6 evidence and the content-readiness gate pass.

Roadmap mapping is explicit: Phase A requires the applicable G3A/G3C evidence;
Phase 0 and Phase B are G4 work and cannot be production-enabled before G3C;
Phase C requires G4 plus the authenticated server path; Phase D additionally
requires G5/G6 content and evaluation evidence. Each phase has its own focused
acceptance record; Task 11 is not the first point at which earlier phases can
be shown GREEN.

MVP weekly categories are `ENGLISH` and `PROVERB`. Each needs five distinct
`PUBLISHED`, education-reviewed, asset-complete revisions. `IDIOM` and
`GENERAL_KNOWLEDGE` remain disabled until the same gate passes and a new
approved policy revision enables them.

## Global Constraints

- Audience includes teenagers and adults; Korean and English copy must remain understandable without childish forced prompts.
- Ranked pet effects are cosmetic only. Pet rarity, level, and species must not change ranked hint strength, cost, score, or eligibility.
- Weekly boundaries use `Asia/Seoul` and are stored as pinned UTC instants.
- Per-challenge ranking uses each user's maximum verified canonical rank tuple; lower later attempts never replace a higher best.
- Result board copy MUST use "이번 기록" (This Attempt) and "내 최고 기록" (My Best Record). Phrases such as "공식 첫 도전" (Official First Attempt) are obsolete and strictly forbidden.
- Next migration creation MUST pick the next unused sequence number (`202607300003_...`). Overwriting existing migration files is strictly prohibited.
- Daily promotion rules use `DAILY_PET_PROMOTION_V1` (10 spare cards from 11 owned copies -> 1 next rarity card, base copy retained). ADR-004 matches 5-copy fusion without mutating daily loop or pity series.
- Runtime hint text is authored and admitted; no runtime LLM generation is allowed.
- Client clocks, submitted scores, and submitted ranks are never trusted.
- `RARE_ONLY_TICKET_V1` excludes COMMON and LEGENDARY, selects uniformly within pinned RARE pets, and does not affect direct-draw pity.
- Existing economy remains fail-closed until an approved immutable revision and decision ID exist.
- Cash purchase, trading, and real-world prizes remain out of scope.
- Every mutation is idempotent and emits at most one durable outbox effect.
- `OPEN` ranked reservations do not publish a record; an atomic `COMPLETED_VERIFIED` may replace the user's best only when better.
- Public MVP copy promises the rare-only ticket to rank 1 only.
- Pet level is numeric (`Lv.N`); star glyphs represent current #1 challenge records only.
- Desktop pet folders are source candidates only and never runtime paths.

---

### Task 0A: Audit, Normalize, and Admit Pet Art (LANDED IN CODEBASE)

**Files:**
- Create: `content/pets/source-manifest.v1.json`
- Create: `content/pets/source-manifest.schema.json`
- Create: `content/pets/review-checklist.md`
- Create: `content/pets/source/`
- Create: `content/pets/mobile/`
- Create: `tools/pets/audit-pet-assets.ts`
- Create: `tools/pets/audit-pet-assets.test.ts`
- Create: `tools/pets/build-pet-assets.ts`
- Create: `tools/pets/build-pet-assets.test.ts`
- Modify: `config/pet-catalog.v1.json`
- Modify: `packages/contracts/src/pet-catalog.ts`
- Modify: `packages/contracts/src/economy.schema.ts`
- Modify: `packages/contracts/src/economy.schema.test.ts`

**Interfaces:**
- Consumes: the three user-provided desktop source folders, rights/provenance
  decisions, and the existing exact `30 COMMON / 15 RARE / 5 LEGENDARY`
  catalog contract.
- Produces: repository-managed originals, mobile variants, immutable hashes,
  normalized slugs, reviewed visual families, and a DRAFT catalog revision.

- [x] **Step 1: Write asset-audit RED tests**
- [x] **Step 2: Verify RED**
- [x] **Step 3: Implement read-only audit and review manifest**
- [x] **Step 4: Implement deterministic repository import**
- [x] **Step 5: Select the active 30/15/5 subset**
- [x] **Step 6: Verify GREEN**
- [x] **Step 7: Commit**

---

### Task 0B: Implement Daily Draw, Duplicate Promotion, and Collection Projection (LANDED IN CODEBASE)

**Files:**
- Create: `config/daily-pet-loop.v1.json`
- Create: `schemas/daily-pet-loop.schema.json`
- Create: `packages/contracts/src/daily-pet-loop.ts`
- Create: `packages/contracts/src/daily-pet-loop.test.ts`
- Create: `supabase/migrations/202607300000_daily_pet_loop.sql`
- Create: `supabase/migrations/202607300001_pet_coach_archetype.sql`
- Create: `supabase/tests/database/daily-pet-loop.test.sql`
- Create: `apps/server/src/pets/daily-draw.ts`
- Create: `apps/server/src/pets/daily-draw.test.ts`
- Create: `apps/server/src/pets/duplicate-promotion.ts`
- Create: `apps/server/src/pets/duplicate-promotion.test.ts`
- Create: `apps/server/src/pets/showcase.ts`
- Create: `apps/server/src/pets/showcase.test.ts`
- Modify: `packages/contracts/openapi.yaml`

**Interfaces:**
- Consumes: approved catalog/economy hashes, authenticated economy subject,
  server-derived KST date, spare duplicate counts, and selected-pet metadata.
- Produces: `claimDailyFreeDrawV1`, `promoteDuplicateCardsV1`,
  `getPetCollectionV1`, and a public-safe `PetShowcaseV1`.

- [x] **Step 1: Write policy and DB RED tests**
- [x] **Step 2: Verify RED**
- [x] **Step 3: Implement effect-once daily claim**
- [x] **Step 4: Implement duplicate-card promotion**
- [x] **Step 5: Implement collection and showcase projections**
- [x] **Step 6: Verify GREEN**
- [x] **Step 7: Commit**

---

### Task 1: Freeze Hint, Progression, and Competition Policy Contracts (LANDED IN CODEBASE)

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

- [x] **Step 1: Write failing exact-policy tests**
- [x] **Step 2: Verify RED**
- [x] **Step 3: Implement strict parsers and JSON schemas**
- [x] **Step 4: Verify GREEN**
- [x] **Step 5: Commit**

---

### Task 2: Admit Five-Step Category Hint Ladders (ENGINE/PIPELINE LANDED, LADDER BATCH-1 PENDING)

**Files:**
- Modify: `packages/contracts/src/content.ts`
- Modify: `packages/contracts/src/content.test.ts`
- Modify: `packages/content-validator/src/validate-content.ts`
- Modify: `packages/content-validator/src/validate-content.test.ts`
- Create: `packages/content-validator/src/hint-ladder.ts`
- Create: `packages/content-validator/src/hint-ladder.test.ts`
- Modify: `schemas/game-content.public.schema.json`
- Modify: `schemas/game-content.private.schema.json`
- Modify: `content/learning/catalog.schema.json`
- Modify: `content/learning/catalog.v1.json`
- Modify: `packages/content-validator/src/validate-learning-draft.ts`
- Modify: `tools/content/write-learning-bundle.ts`
- Modify: `tools/content/write-learning-manifest.ts`

**Interfaces:**
- Consumes: canonical answer, content language/category, reviewed localized
  text, and grapheme segmentation.
- Produces: `HintStepV1[]` and `validateHintLadder(category, answer, steps)`.

- [x] **Step 1: Write category-specific RED tests**
- [x] **Step 2: Verify RED**
- [x] **Step 3: Implement grapheme-safe admission**
- [x] **Step 4: Add valid and invalid fixtures**
- [x] **Step 5: Verify GREEN**
- [x] **Step 6: Commit**
- [ ] **Step 7 (Active Workstream - Ladder Batch-1):** Complete authored five-step ladders for at least 5 `ENGLISH` and 5 `PROVERB` draft packs to unblock Phase C/D readiness.

---

### Task 3: Implement Deterministic Hint Revelation (LANDED IN CODEBASE)

**Files:**
- Create: `packages/game-engine/src/hint-engine.ts`
- Create: `packages/game-engine/src/hint-engine.test.ts`
- Modify: `packages/contracts/src/match.ts`
- Modify: `packages/contracts/src/socket.ts`
- Modify: `packages/contracts/src/socket.schema.ts`
- Modify: `packages/contracts/src/projection.ts`
- Modify: `packages/game-engine/src/reducer.ts`

**Interfaces:**
- Consumes: admitted `HintStepV1[]`, player reveal state, mode, and selected
  pet coach archetype.
- Produces: `revealNextHint(input: HintRevealInput): HintRevealResult` and authoritative `HINT_STEP_REVEALED` events.

- [x] **Step 1: Write reducer RED tests**
- [x] **Step 2: Verify RED**
- [x] **Step 3: Implement the pure hint engine**
- [x] **Step 4: Integrate authoritative commands and projections**
- [x] **Step 5: Verify GREEN**
- [x] **Step 6: Commit**

---

### Task 4: Create Ranked Attempt and Weekly Season Storage (LANDED IN `202607300002_learning_competition.sql`)

**Files:**
- Create: `supabase/migrations/202607300002_learning_competition.sql`
- Create: `supabase/tests/database/learning-competition.test.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Modify: `docs/02-Architecture/08_DATABASE_SCHEMA.md`

**Interfaces:**
- Consumes: authenticated subject, pinned content/policy hashes, server event
  metrics, and selected pet.
- Produces: immutable attempts (`private.learning_attempts`), official entries (`private.learning_best_records`), weekly seasons, challenge pins, ranking projections, and settlement leases.

- [x] **Step 1: Write pgTAP RED assertions**
- [x] **Step 2: Verify RED**
- [x] **Step 3: Add immutable schema and constraints**
- [x] **Step 4: Add RLS-safe leaderboard projection**
- [x] **Step 5: Verify GREEN**
- [x] **Step 6: Commit**

---

### Task 5: Build the Server-Authoritative Attempt Runtime (LANDED IN CODEBASE)

**Files:**
- Create: `packages/learning-competition/package.json`
- Create: `packages/learning-competition/src/attempt-session.ts`
- Create: `packages/learning-competition/src/attempt-verifier.ts`
- Modify: `apps/server/package.json` (Register workspace server package)
- Create: `apps/server/src/learning/attempt-session.ts`
- Create: `apps/server/src/learning/attempt-verifier.ts`
- Create: `apps/server/src/learning/attempt-repository.ts`
- Modify: `packages/contracts/openapi.yaml`

**Interfaces:**
- Consumes: authenticated user, pinned weekly challenge, accepted command
  sequence, asset attestations, and approved policies.
- Produces: `startRankedAttempt(input): RankedAttemptSession` and `completeRankedAttempt(input): VerifiedAttemptResult`.

`packages/learning-competition` owns pure session policy, replay verification,
score calculation, and DTO construction. `apps/server` serves as a thin authentication/HTTP/repository adapter over existing RPCs in `202607300002_learning_competition.sql`.

- [x] **Step 1: Write session RED tests**
- [x] **Step 2: Write verifier RED tests**
- [x] **Step 3: Verify RED**
- [x] **Step 4: Implement start and completion endpoints**
- [x] **Step 5: Verify concurrency and retry behavior**
- [x] **Step 6: Verify GREEN**
- [x] **Step 7: Commit**

---

### Task 6: Derive Top 10, My Rank, and Weekly Category Standings (LANDED IN CODEBASE)

**Files:**
- Create: `apps/server/src/learning/leaderboard.ts`
- Create: `apps/server/src/learning/leaderboard.test.ts`
- Modify: `packages/contracts/openapi.yaml`

**Interfaces:**
- Consumes: immutable verified attempts, their pinned selected pets, and one transaction snapshot from `202607300002_learning_competition.sql`.
- Produces: `getChallengeLeaderboard`, `getWeeklyCategoryLeaderboard`, `getPetChampionSummary`.

- [x] **Step 1: Write rank-order RED tests**
- [x] **Step 2: Verify RED**
- [x] **Step 3: Implement thin server adapter over DB ranking views**
- [x] **Step 4: Add read endpoints**
- [x] **Step 5: Verify GREEN**
- [x] **Step 6: Commit**

---

### Task 7: Commit Account XP, Pet XP, and Bounded Draw Points (LANDED IN CODEBASE)

**Files:**
- Create: `docs/decisions/learning-economy-source-model.md`
- Create: `supabase/migrations/202607300003_learning_progression.sql`
- Create: `supabase/tests/database/learning-progression.test.sql`
- Create: `apps/server/src/learning/progression.ts`
- Create: `apps/server/src/learning/progression.test.ts`
- Modify: `packages/contracts/src/economy.ts`
- Modify: `docs/decisions/ADR-004-pet-economy.md`

**Interfaces:**
- Consumes: verified attempt, pinned selected pet, daily counters, and approved `learning-progression-v1`.
- Produces: one progression receipt and outbox event per attempt.

- [x] **Step 1: Write reward RED tests**
- [x] **Step 2: Verify RED**
- [x] **Step 3: Add transactional progression function (`202607300003_learning_progression.sql`)**
- [x] **Step 4: Keep activation fail-closed**
- [x] **Step 5: Verify GREEN**
- [x] **Step 6: Commit**

---

### Task 8: Settle Weekly Champions and Issue Rare-Only Tickets

**Files:**
- Create: `supabase/migrations/202607300004_weekly_champion_rewards.sql`
- Create: `supabase/tests/database/weekly-champion-rewards.test.sql`
- Create: `apps/server/src/learning/weekly-settlement.ts`
- Create: `apps/server/src/learning/settlement-worker.ts`
- Modify: `packages/contracts/src/economy.ts`

**Interfaces:**
- Consumes: closed season, final weekly ranking snapshot, approved catalog and economy hashes, and a fencing token.
- Produces: one `RARE_ONLY_TICKET_V1` entitlement for each category champion.

- [ ] **Step 1: Write settlement RED tests**
- [ ] **Step 2: Write rare-ticket draw RED tests**
- [ ] **Step 3: Verify RED**
- [ ] **Step 4: Implement fenced settlement (`202607300004_weekly_champion_rewards.sql`)**
- [ ] **Step 5: Implement ticket consumption**
- [ ] **Step 6: Verify GREEN**
- [ ] **Step 7: Commit**

---

### Task 9: Add Mobile Hint, Pet Coach, and Result-Board UX (LANDED IN CODEBASE)

**Files:**
- Create: `apps/mobile/src/features/learning/HintPanel.tsx`
- Create: `apps/mobile/src/features/learning/HintPanel.test.tsx`
- Create: `apps/mobile/src/features/learning/PetCoach.tsx`
- Create: `apps/mobile/src/features/learning/PetCoach.test.tsx`
- Create: `apps/mobile/src/features/leaderboard/ChallengeResultBoard.tsx`
- Create: `apps/mobile/src/features/leaderboard/ChallengeResultBoard.test.tsx`
- Create: `apps/mobile/src/features/leaderboard/WeeklyCategoryBoard.tsx`
- Create: `apps/mobile/src/features/pets/DailyFreeDraw.tsx`
- Create: `apps/mobile/src/features/pets/DailyFreeDraw.test.tsx`
- Create: `apps/mobile/src/features/pets/PetCollection.tsx`
- Create: `apps/mobile/src/features/pets/ChampionStars.tsx`
- Create: `apps/mobile/src/features/pets/ChampionStars.test.tsx`
- Refactor: `apps/mobile/src/learning-demo/LearningDemoScreen.tsx` into
  `apps/mobile/src/features/learning`
- Modify: the solo-learning route/shell under `apps/mobile/app`

- [x] **Step 1: Write hint and pet RED tests**
- [x] **Step 2: Write result-board RED tests**
- [x] **Step 3: Implement accessible mobile UI components**
- [x] **Step 4: Verify GREEN**
- [x] **Step 5: Commit**
expect(screen.getByText('143위 / 812명')).toBeTruthy();
expect(screen.getByText('상위 18%')).toBeTruthy();
expect(screen.getByLabelText('내 순위로 이동')).toBeTruthy();
expect(screen.getByText('이번 기록')).toBeTruthy();
expect(screen.getByText('내 최고 기록')).toBeTruthy();
expect(screen.queryByText('공식 첫 도전')).toBeNull();
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

The ordinary casual hint button remains available after coach charges are
spent. A coach charge changes approved pet presentation but advances the same
next `HintStepV1`; both paths increment `hintStepsUsed`, so either path
disqualifies the `noHint` bonus.

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
git add apps/mobile/src/features apps/mobile/src/learning-demo apps/mobile/app packages/contracts/src/ui.ts packages/contracts/src/ui.test.ts
git commit -m "feat(mobile): add hints pet coaching and leaderboards"
```

---

### Task 10: Add Analytics, Abuse Review, and Operational Gates

**Files:**
- Create: `tools/pin-weekly-challenges.ts`
- Create: `tools/pin-weekly-challenges.test.ts`
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/weekly-learning-nightly.yml`
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

The pinning tool is the supported operational path. It supports `--dry-run`,
prints category/revision/policy hashes, validates readiness/cardinality, and
is deterministic; manual production SQL is not accepted.

PR CI runs unit/contract tests and a bounded 20-worker concurrency suite.
Nightly/manual CI runs the 10,000-attempt load and 100-way settlement race.
Missing credentials or local Supabase reports a named blocked gate rather than
a silent skip.

- [ ] **Step 1: Write privacy and risk RED tests**

Reject analytics containing auth UUID, email, answer text, raw coordinates,
hitboxes, or unrevealed hint text. Assert completion below 500 ms,
non-monotonic event order, impossible asset timing, and replay mismatch yield
`REVIEW_REQUIRED`, not an automatic ban or reward.

- [ ] **Step 2: Write release-gate RED tests**

Require:

```text
verified_attempt_duplicate_total = 0
best_record_lower_score_overwrite_total = 0
champion_star_projection_mismatch_total = 0
leaderboard_snapshot_mismatch_total = 0
weekly_reward_duplicate_total = 0
rare_ticket_pity_mutation_total = 0
private_field_leak_total = 0
```

Require at least 10,000 synthetic verified attempts for ranking/load evidence
and 100 concurrent settlement retries for exact-once evidence. Record the
percentage tied on `display_score`, the percentage resolved by each canonical
tie-break field, and specifically how often `accepted_at` or `attempt_id`
decides #1 after the 90-second time-penalty cap. These are evidence fields, not
permission to alter the approved scoring policy.

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
git add packages/contracts/src/analytics* apps/server/src/learning/attempt-risk* docs/analytics docs/operations tools/release-learning-competition* tools/pin-weekly-challenges* .github/workflows/ci.yml .github/workflows/weekly-learning-nightly.yml package.json
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
4. verified scores `50 -> 60 -> 100 -> 80` for one user/challenge;
5. a user outside Top 10;
6. two concurrent weekly settlers;
7. champion ticket consumption and duplicate pet handling.

- [ ] **Step 2: Assert the complete outcome**

Assert:

```ts
expect(challengeBoard.top10).toHaveLength(10);
expect(challengeBoard.me.rank).toBe(12);
expect(challengeBoard.me.score).toBe(100);
expect(challengeBoard.me.attemptId).toBe(hundredPointAttempt.attemptId);
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

Completion is per phase. Phase A may ship with competition disabled; Phase B
requires the approved economy ADR; Phase C requires roadmap, content, runtime,
and settlement evidence.

- **Phase 0 acceptance:** approved 30/15/5 asset catalog; one 20-way daily
  claim result; direct-draw pity byte-identical; same-pet 11 copies become one
  retained base plus one next-rarity result.
- **Phase A acceptance:** at least one admitted ENGLISH and one PROVERB bundle
  carries distinct `hintUnits` and five `HintStepV1` entries through
  catalog/draft/manifest/mobile; no pre-step-5 full disclosure.
- **Phase B acceptance:** 20 retries create one learning reward source effect,
  one XP/points delta, and one outbox event; DRAFT policy remains fail-closed.
- **Phase C acceptance:** `50 -> 60 -> 100 -> 80` publishes 100, a concurrent
  overtake transfers one champion star, and leaderboard responses contain zero
  private identifiers/coordinate keys.
- **Phase D acceptance:** an eligible five-pin season settles one optional
  champion ticket under 100-way retry without pity mutation.

- Hint ladders are authored, locale-safe, and do not reveal short answers too
  early.
- Casual pet assistance works while ranked pet effects remain identical.
- Account XP, selected-pet XP, and draw points are bounded and effect-once.
- Challenge Top 10 and current-user rank share one database snapshot.
- Weekly category standings use exactly five pinned challenges.
- A better verified replay replaces the published best and a worse replay
  cannot.
- Current champion stars exactly equal current #1 challenge records pinned to
  each pet; historical #1 counts are numeric and monotonic.
- Pet level is displayed as `Lv.N`; rarity and level never change ranked hint
  information.
- Daily free draw and ten-card promotion are effect-once and preserve the base
  owned copy.
- Active pet art is a reviewed, rights-recorded 30/15/5 subset stored inside
  the repository; desktop paths are absent from runtime artifacts.
- Public showcase exposes approved pet and achievement fields only.
- One category champion receives one rare-only ticket after concurrent retries.
- Rare-only tickets never mutate ordinary draw pity.
- Policies remain deployment-blocked until explicit approval metadata exists.
- Store-facing reward terms disclose selection and duplicate behavior.
