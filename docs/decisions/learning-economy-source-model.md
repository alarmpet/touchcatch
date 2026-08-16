# Learning Economy Source Model ADR

## Context

TouchCatch requires bounded progression rewards (Account XP, Pet XP, and Draw Points) from completed learning attempts. To preserve existing match-mode economy integrity under `ADR-004`, learning progression must introduce a dedicated ledger source identity without altering two-player match reward semantics.

## Decision

1. **Source Type Identity**:
   - `MATCH`: Two-player battle rewards (`award_match_reward_v1`).
   - `LEARNING_ATTEMPT`: Solo/ranked learning attempt rewards (`award_learning_progression_v1`).
   - `WEEKLY_SETTLEMENT`: Weekly champion ticket issuance.

2. **Progression Caps & Bounds**:
   - Daily Account XP Cap: 200 XP (`profiles.exp`)
   - Daily Pet XP Cap: 100 XP (`user_pets.exp`)
   - Daily Draw Points Cap: 100 Points (`profiles.gacha_points`)

3. **Pet Level Presentation**:
   - Monotonic numeric levels `Lv.N`. Level unlocked presentation is casual coaching only and provides zero ranked score advantage.

4. **Fail-Closed Policy**:
   - DRAFT policies commit no ledger, balance, or outbox effects until an approved immutable policy hash and approval metadata exist.
