# TouchCatch Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 코드베이스의 문서·콘텐츠·모바일·서버·운영 게이트 간 드리프트를 제거하고, 캐주얼 학습 루프를 실제로 플레이 가능한 상태로 닫은 뒤 주간 랭킹을 production-enable 가능한 증거 상태까지 단계적으로 준비한다.

**Architecture:** 이미 착륙한 계약/DB를 재작성하지 않고 SSOT와 thin adapter를 먼저 정합화한다. Phase A는 모바일 캐주얼 힌트·펫 코치·일일 루프를 실제 화면에 연결하고, 콘텐츠 Ladder Batch-1은 별도 병렬 작업으로 공급한다. 이후 서버 attempt runtime → leaderboard/weekly pin → progression/settlement 순으로 로드맵 G3A→G3B→G3C→G4→G5→G6 게이트를 지키며 진행한다.

**Tech Stack:** TypeScript, React Native/Expo, Node 24.18.0, pnpm 11.13.0, Vitest, Supabase/Postgres/pgTAP, JSON Schema, existing content pipeline.

## Global Constraints

- `pnpm`은 11.13.0, Node는 24.18.0 기준으로 검증한다.
- 현재 working tree는 사용자 작업이 많으므로 기존 변경·미추적 파일을 되돌리거나 정리하지 않는다.
- `research.md`는 콘텐츠 파이프라인 참고 문서이며 랭킹·프로덕션 readiness의 SSOT가 아니다.
- 현재 측정값은 catalog/manifest 91팩, 모두 `DRAFT`, `publishBlocked: true`, 유효 admitted five-step ladder 3개다. 수치는 집계 명령과 날짜를 함께 기록한다.
- 현재 `content/learning/drafts/`에는 95개 JSON이 있어 manifest 91개와 orphan/미등록 draft를 별도로 조사한다.
- admitted 3개는 `en-resilience`, `ko-proverb-seeing-is-believing`, `ko-idiom-turn-misfortune`이며, 주간 MVP 대상 ENGLISH/PROVERB는 각각 admitted 1개뿐이다.
- 주간 시즌은 카테고리별 `PUBLISHED` + rights/education 승인 + 유효 5단 사다리 5개가 모두 충족될 때만 열며, 미충족이면 `SEASON_CONTENT_INSUFFICIENT`로 fail-closed한다.
- ADR-004의 fail-closed 경제 원칙과 daily-pet-loop 승급 규칙을 단일 정책 해시/정의로 통합한다.
- production readiness를 주장하려면 local PASS와 별도로 외부 증거(실기기, provider, DB 복구, 권리 승인, soak)를 확보한다.

---

### Task 1: SSOT inventory와 실행 원장 동기화

**Files:**
- Modify: `research.md`
- Modify: `docs/superpowers/specs/2026-07-30-adaptive-hints-pet-progression-weekly-ranking-design.md`
- Modify: `docs/superpowers/plans/2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan.md`
- Modify: `.superpowers/sdd/2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan/progress.md`
- Create: `docs/reviews/2026-08-01-inventory-snapshot.md`
- Test: `tests/specs/document-inventory-requirement-oracle.test.ts`

**Interfaces:** inventory snapshot은 이후 콘텐츠·시즌 게이트가 참조하는 날짜, 명령, category별 count, ladder admission, publish status의 유일한 수치 근거다.

- [x] **Step 1: 실제 집계 명령과 출력 정의를 고정한다.** `catalog.v1.json`과 `manifest.v1.json`에서 category/status/publishBlocked/admission을 집계하는 재현 가능한 Node 명령을 문서에 넣는다.
- [x] **Step 2: 91/3/0 수치와 frozen registry 79의 차이를 명시한다.** working, manifest, frozen registry를 별도 열로 두고 서로 대체하지 않는다. `drafts/` 95개와 manifest 91개의 orphan/미등록 파일 목록도 snapshot에 넣는다.
- [x] **Step 3: 기존 계획 체크박스와 progress ledger를 실제 Task 0A~3 완료 상태에 맞춘다.** migration 경로는 고정 파일명이 아니라 다음 free migration ID 규칙으로 정정한다.
- [ ] **Step 4: 문서 oracle과 docs check를 실행한다.** `pnpm docs:check`, `pnpm test tests/specs/document-inventory-requirement-oracle.test.ts -v` (현재 환경 Node/pnpm 엔진 불일치로 차단)

### Task 2: ADR-004와 daily loop 승급 규칙 단일화

**Files:**
- Modify: `docs/decisions/ADR-004-pet-economy.md`
- Modify: `config/daily-pet-loop.v1.json`
- Modify: `supabase/migrations/202607300000_daily_pet_loop.sql` (필요한 경우에만; 기존 함수 계약을 보존)
- Modify: `packages/contracts/src/daily-pet-loop.ts`
- Modify: `packages/contracts/src/daily-pet-loop.test.ts`
- Test: `supabase/tests/database/daily-pet-loop.test.sql`

**Interfaces:** `DailyPetLoopPolicyV1.duplicatePromotion`과 `seriesId`가 정본이다. 별도 `PromotionRuleV1` 타입을 새로 만들지 않으며, progression ledger인 `supabase/migrations/202607300003_learning_progression.sql`은 이 Task에서 수정하지 않는다.

- [x] **Step 1: ADR에 후보 정책과 production 승인 상태를 명확히 분리한다.** DRAFT에서는 보상 0, APPROVED에서만 ledger 반영이라는 규칙을 고정한다.
- [x] **Step 2: ADR에 두 제품 규칙의 series를 분리해 명시한다.** `DAILY_PET_PROMOTION_V1`은 11장 보유·10장 소모·1장 유지의 일일 펫 승급이고, ADR-004의 five-copy fusion은 별도 경제 규칙이므로 서로 덮어쓰지 않는다.
- [x] **Step 3: TypeScript와 pgTAP에 경계 테스트를 추가한다.** series ID 계약 테스트를 추가했고 기존 임계치·멱등 pgTAP 테스트를 보존했다.
- [ ] **Step 4: `pnpm test packages/contracts/src/daily-pet-loop.test.ts`, `pnpm check:db`를 실행한다.** Vitest focused 11/11 PASS; full DB gate는 Node/pnpm 엔진 불일치로 대기.

### Task 3: Phase A 모바일 캐주얼 학습 slice 완성

**Files:**
- Modify: `apps/mobile/app/index.tsx`
- Modify: `apps/mobile/src/learning-demo/LearningDemoScreen.tsx`
- Modify: `apps/mobile/src/learning-demo/registry.ts`
- Modify: `apps/mobile/src/features/learning/HintPanel.tsx`
- Modify: `apps/mobile/src/features/learning/PetCoach.tsx`
- Modify: `apps/mobile/src/features/pets/PetCollection.tsx`
- Modify: `apps/mobile/src/features/pets/DailyFreeDraw.tsx`
- Create/Modify tests: `apps/mobile/src/features/**/*.test.tsx`

**Interfaces:** 화면은 서버 권위 점수/정답/힌트 문자열을 소비하고, 클라이언트가 점수·랭킹·private solution을 계산하거나 번들에 노출하지 않는다.

- [ ] **Step 1: RED 테스트를 먼저 작성한다.** 5단 힌트 순서, 마지막 단계 이후 비활성화, coach charge 소진, daily draw 1일 1회, casual 완료가 ranked insert를 만들지 않는 동작을 검증한다.
- [x] **Step 2: 이미 연결된 `LearningDemoScreen`의 mock state와 `alert` 승급 흐름을 명시적인 development-only demo 경계로 제한한다.** admitted demo pack 하나 이상을 시작하고 힌트 버튼 → visual/text hint → 완료 상태가 이어지게 하되, 실제 ranked/production write를 암시하지 않는다.
- [x] **Step 3: PetCoach/PetCollection/DailyFreeDraw의 props-only 동작을 demo callback과 fail-closed 상태에 연결한다.** 서버 연동은 이 Task의 필수 범위가 아니며, ranked 보드와 official attempt는 Task 5 이후로 둔다.
- [x] **Step 4: RN 환경에서만 쓰는 컴포넌트에 DOM 전용 `<div>/<button>`이 남지 않도록 정리한다.** 접근성 label, disabled, press handler를 React Native API로 통일한다.
- [ ] **Step 5: `pnpm --dir apps/mobile typecheck`와 관련 Vitest를 실행한다.** focused Vitest 7/7 PASS; pnpm typecheck와 EN/PROVERB 실기기/홈 실행은 요구 엔진 버전 환경에서 남아 있다.

### Task 4: Ladder Batch-1 콘텐츠와 게시 readiness gate

**Files:**
- Modify: `content/learning/catalog.v1.json`
- Create/Modify: `content/learning/drafts/*.json`, `content/learning/geometry/*.json`, `content/learning/evidence/*.visual-delta.json`
- Modify: `content/learning/manifest.v1.json`
- Modify: `content/learning/review-checklist.md`
- Modify: `tools/content/batch-build.js`
- Modify: `tools/content/validate-catalog.js`
- Test: `content/learning/all-content.test.ts`, `packages/content-validator/src/validate-learning-draft.test.ts`

**Interfaces:** batch pipeline은 idempotent하게 완성 팩을 skip하고, partial output은 재시도 가능하게 하며, admitted/published 판정은 human rights/education approval 없이는 통과시키지 않는다.

- [ ] **Step 1: ENGLISH 5개와 PROVERB 5개 후보를 선정하고 각 팩에 5단 hint ladder와 private solution을 저작한다.** step 3/5의 option mapping도 schema로 검증한다.
- [ ] **Step 2: batch-build의 difficulty radius와 non-overlap 필터가 `tools/content/pipeline-constants.js`와 일치하는지 테스트한다.** 현재 기준은 `BEGINNER 0.085`, `INTERMEDIATE 0.070`, `ADVANCED 0.055`이며, pixel threshold와 cluster minimum도 코드 SSOT와 비교한다.
- [ ] **Step 3: SHA/manifest/registry를 재생성하고 byte-identical 재실행을 검증한다.** `pnpm content:batch-build`, `pnpm content:generate-registry`, `pnpm content:catalog:check`.
- [ ] **Step 4: human review 입력물과 결과 상태를 기록한다.** local visual-delta PASS를 rights/education 승인으로 승격하지 않는다.
- [ ] **Step 5: readiness test를 추가한다.** EN/PROVERB 각각 5 admitted가 아니면 시즌 pin/create가 실패하도록 검증한다. 시즌 오픈은 이 Task 완료 전 불가다.

### Task 5: 기존 `apps/server` 스캐폴드와 learning competition thin adapter 실배선

**Files:**
- Verify/Modify: `apps/server/package.json` (패키지는 이미 존재하며 workspace에서 독립 검증 가능하게 유지)
- Create/Modify: `apps/server/tsconfig.json`
- Modify: `apps/server/src/learning/attempt-session.ts`
- Modify: `apps/server/src/learning/attempt-verifier.ts`
- Modify: `apps/server/src/learning/attempt-repository.ts`
- Modify: `apps/server/src/learning/leaderboard.ts`
- Modify: `packages/learning-competition/src/*.ts`
- Test: `apps/server/src/learning/*.test.ts`, `packages/learning-competition/src/attempt.test.ts`

**Interfaces:** adapter는 SQL 함수 `start_learning_attempt_v1`, `attest_learning_assets_ready_v1`, `commit_learning_attempt_v1`의 반환 상태를 타입 안전하게 변환하며, 클라이언트 metric을 신뢰하지 않는다.

- [x] **Step 1: 기존 package를 기준으로 `tsconfig.json`과 필요한 workspace script만 추가한다.** `apps/server/package.json`을 새로 만들지 않으며 기존 learning/pets source와 계약의 module resolution을 독립적으로 typecheck/test한다.
- [ ] **Step 2: start→asset attestation→complete 상태 머신의 RED 테스트를 작성한다.** OPEN, EXPIRED, QUARANTINED, COMPLETED_VERIFIED, IDEMPOTENCY_CONFLICT를 포함한다.
- [ ] **Step 3: 현재 stub adapter를 SQL RPC 경계에 실배선한다.** `Player1` 등 mock leaderboard 값을 제거하고 policy/content/ruleset/hint/competition hash 불일치는 `POLICY_MISMATCH`로 닫는다. 이번 단계에서 mock 제거와 주입 가능한 DB read provider 경계까지 완료했으며, 실제 Supabase/Postgres provider 연결은 남아 있다.
- [x] **Step 4: 각 사용자의 verified rank tuple이 개선될 때만 BEST record를 갱신하도록 검증한다.** `BEST_COMPLETED_VERIFIED`와 DB의 `learning_rank_better_v1` 규범을 유지하며, 실패/미완료 ranked session은 새 시도 가능하고 동일 complete 재전송은 idempotent replay여야 한다. first-completed-only 규칙은 도입하지 않는다. 현재 pure adapter에 rank tuple best-selection 테스트를 추가했다.
- [ ] **Step 5: `pnpm typecheck`, `pnpm test packages/learning-competition apps/server/src/learning`과 DB concurrency suite를 실행한다.**

### Task 6: weekly pin 운영 도구와 leaderboard read path

**Files:**
- Create: `tools/pin-weekly-challenges.ts`
- Modify: `apps/server/src/learning/leaderboard.ts`
- Modify: `packages/contracts/src/index.ts` 또는 기존 learning contract 파일
- Test: `apps/server/src/learning/leaderboard.test.ts`
- Test: `supabase/tests/database/learning-competition.test.sql`

- [ ] **Step 1: 카테고리별 정확히 5개 revision을 선택하는 CLI 입력/출력 계약을 정의한다.** content hash, policy hash, reviewer evidence를 출력한다.
- [ ] **Step 2: readiness 미달·중복 revision·DRAFT·publishBlocked 입력에 대한 RED 테스트를 작성한다.** 오류는 `SEASON_CONTENT_INSUFFICIENT` 또는 명시적 validation code여야 한다.
- [ ] **Step 3: `create_weekly_season_v1` 호출 adapter와 dry-run 모드를 구현한다.** 실제 publish는 명시적 승인 evidence가 있을 때만 가능하게 한다.
- [ ] **Step 4: leaderboard query가 subject_key/user_id/email/좌표/private 필드를 노출하지 않는지 contract test를 추가한다.**
- [ ] **Step 5: 경쟁 스모크를 PR CI에 추가하고 10k load는 nightly/release evidence로 분리한다.**

### Task 7: 외부 release evidence와 production enablement

**Files:**
- Modify: `docs/release-evidence-blockers.md`
- Modify: `docs/testing/test-matrix.md`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/operations/learning-competition-release-runbook.md`
- Create/Update: `docs/testing/reports/*` evidence artifacts

- [ ] **Step 1: exact Node/pnpm clean-checkout 검증을 provisioned environment에서 실행한다.** 로컬 버전 차이를 완화하지 않는다.
- [ ] **Step 2: Next production build와 mobile signed/reproducible bundle을 생성한다.** physical iOS/Android golden 및 accessibility capture를 첨부한다.
- [ ] **Step 3: production-like DB backup/PITR/restore drill과 200-match/400-socket 30-minute soak를 수행한다.** 결과와 operator approval을 기록한다.
- [ ] **Step 4: CDN/storage credentials, rights/legal, education approval, Sentry/PostHog redaction/deletion evidence를 확보한다.**
- [ ] **Step 5: 모든 선행 G3A→G3B→G3C→G4→G5→G6 증거가 있을 때만 production enable checklist를 체크한다.** local PASS는 blocker를 해제하지 않는다.

## Verification and Handoff

- 각 Task는 해당 테스트를 먼저 RED로 확인한 뒤 최소 구현, focused PASS, 전체 관련 gate 순서로 검증한다.
- 실행 전용 다음 단계는 Task 1~4(문서 정합화·규칙 단일화·모바일 Phase A·Ladder Batch-1)이며, Task 5 이후는 Task 2와 콘텐츠 readiness gate가 완료된 뒤 착수한다.
- 본 계획은 현재 dirty working tree의 파일을 커밋하지 않는다. 구현을 시작할 때 별도 worktree/branch 정책을 먼저 정하고, 각 Task 단위로 커밋한다.
- 완료 상태는 다섯 트랙으로 별도 기록한다: (A) 문서 SSOT 정합성, (B) Phase A 로컬 플레이 가능성, (C) 콘텐츠 readiness, (D) 서버 권위 attempt/leaderboard, (E) 외부 release evidence. A~D의 local PASS만으로 E 또는 production enable을 주장하지 않는다.
- 구현 전 필수 회귀 방지 점검은 `first completed verified` 문구가 없는지, `202607300003_learning_progression.sql`을 불필요하게 덮어쓰지 않는지, `ADVANCED`가 0.055인지, 이미 존재하는 서버 scaffold를 재생성하지 않는지 확인하는 것이다.
