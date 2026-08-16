# Adaptive Hints · Pet Progression · Weekly Ranking  
## 설계 · 구현계획 · research · 코드베이스 · 워크플로 재리뷰

| 항목 | 내용 |
|:---|:---|
| **작성일** | 2026-07-31 |
| **대상 설계** | `D:\touchcatch\docs\superpowers\specs\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-design.md` |
| **대상 계획** | `D:\touchcatch\docs\superpowers\plans\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan.md` |
| **연구 문서** | `D:\touchcatch\research.md` |
| **선행 리뷰** | `D:\touchcatch\docs\reviews\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-review.md` |
| **SDD 진행** | `D:\touchcatch\.superpowers\sdd\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan\progress.md` |
| **검토 범위** | 위 문서 + `content/learning/**`, `content/pets/**`, `config/*`, `packages/{contracts,content-validator,game-engine}`, `apps/{mobile,server}`, `supabase/migrations`, `supabase/tests`, `.github/workflows/ci.yml`, `docs/decisions/ADR-004-pet-economy.md`, `docs/04-Roadmap/12_IMPLEMENTATION_ROADMAP.md` |
| **판정** | **제품 원칙·Phase 분할·BEST-record 규칙은 채택 유지.** 선행 리뷰 P0 상당수는 설계/계획 본문에 반영됐고 Phase 0~A 핵심 코드도 상당 부분 착륙했다. 그러나 **(1) 문서 재고·Task 체크박스·마이그레이션 ID가 실제 코드와 어긋나고, (2) 힌트 사다리·게시 게이트·모바일 UX가 엔진보다 크게 뒤처지며, (3) ADR-004 융합 규칙과 일일 루프 승급 규칙이 충돌**한다. Phase C(랭킹 런타임/보드) 착수 전에 아래 **P0를 닫는 것**을 권고한다. |

---

## 1. 한 줄 요약

설계는 collection-first 북스타와 공정 랭킹·서버 권위·저작 힌트·fail-closed 경제를 일관되게 유지한다. 구현 계획도 이전 “11 Task 한 방 롤아웃” 비판을 받아 **Phase 0→A→B→C→D** 와 단계별 수용 기준으로 재구성됐다.

문제는 이제 “방향이 틀렸다”가 아니라 **실행 상태와 SSOT가 갈라져 있다**는 점이다.

- 엔진/계약/DB 조각은 앞서 가고
- 콘텐츠 readiness·모바일 루프·경제 ADR·CI 게이트는 뒤에 남았으며
- 계획 체크박스·설계 inventory 문장은 이미 틀린 스냅샷을 가리킨다

에이전트/사람이 이 문서만 보고 다음 Task를 잡으면, **이미 있는 마이그레이션을 다시 만들고**, **구식 카탈로그 수치로 readiness를 오판**하거나, **ADR-004와 다른 승급 규칙을 재도입**할 위험이 있다.

---

## 2. 선행 리뷰 대비 무엇이 좋아졌는가

2026-07-30 리뷰의 핵심 권고 중 다수가 **설계/계획 본문에 반영**됐다. 이 부분은 유지·강화한다.

| 선행 권고 | 현재 문서/코드 상태 | 평가 |
|:---|:---|:---|
| MVP 주간 카테고리 `ENGLISH`+`PROVERB` | 설계·`weekly-competition.v1.json`·DB 제약 모두 동일 | 반영됨 |
| `hintUnits` ≠ `HintStepV1` 분리 | 계획 Task 2, `research.md` 헤더/본문, validator 경로 | 반영됨 |
| learning 파이프라인 연동 | catalog/drafts/manifest/registry 경로 Task 2에 명시 | 반영됨 |
| 공식 = best verified (replay) | 설계·계획 Global Constraints; first-attempt 폐기 | 반영됨 |
| Phase 분할 + collection-first | Phase 0 펫 루프 선행, Phase D 주간 옵션 | 반영됨 |
| OPEN 상태 머신 | `OPEN→COMPLETED_VERIFIED\|…` | 반영됨 |
| coach/noHint 정의 | 코치도 `hintStepsUsed` 증가 | 반영됨 |
| thin server + pure package | Task 5 `packages/learning-competition` | 문서상 반영 |
| pinning tool / CI split | Task 10 | 문서상 반영 |
| research non-normative | `research.md` 상단 배너 | 반영됨 |

**코드로 이미 닫힌 것 (SDD progress + 실측):**

| 영역 | 실측 |
|:---|:---|
| Phase 0 펫 아트/카탈로그 | `content/pets/**`, `config/pet-catalog.v1.json` **30/15/5**, `coachArchetype` 존재 |
| Phase 0 일일 루프 | `config/daily-pet-loop.v1.json`, `supabase/migrations/202607300000_daily_pet_loop.sql`, `apps/server/src/pets/*` |
| Task 1 정책 동결 | `config/{hint-policy,learning-progression,weekly-competition}.v1.json` (모두 **DRAFT**) |
| Task 2 사다리 입수 | `hint-ladder` validator, manifest `hintLadderAdmission` |
| Task 3 힌트 엔진 | `packages/game-engine/src/hint-engine.ts` |
| Task 4 DB (부분~상당) | `202607300002_learning_competition.sql` (~1765 LOC): attempts, best_records, seasons, pins, settlement lease, rank compare 등 |

즉 **선행 리뷰의 “빈 서버·힌트 필드 없음·코치 필드 없음” 진단은 더 이상 전부가 아니다.** 이번 리뷰는 그 이후 상태를 기준으로 다시 판정한다.

---

## 3. 현황 실측 (2026-07-31)

### 3.1 학습 콘텐츠 inventory

| 소스 | ENGLISH | PROVERB | IDIOM | GENERAL_KNOWLEDGE | 합계 | 비고 |
|:---|---:|---:|---:|---:|---:|:---|
| 설계 문서 주장 | 71 | 5 | 4 | 1 | 81 | **구식** |
| `catalog.v1.json` 실측 | 74 | 7 | 5 | 5 | **91** | 전부 `status: DRAFT` |
| `manifest.v1.json` | 74 | 7 | 5 | 5 | **91** | `publishBlocked: 91` |
| `research.md` | — | — | — | — | **79** (committed snapshot 문구) | **구식** |
| Task 2 frozen registry 리뷰 | — | — | — | — | **79** | SDD fix-round 기준 |

**힌트 사다리:**

| 상태 | 개수 | 키 |
|:---|---:|:---|
| `ADMITTED` | **3** | `en-resilience`, `ko-proverb-seeing-is-believing`, `ko-idiom-turn-misfortune` |
| `MISSING` | **88** | 나머지 |
| `rankedEligible` | **3** | 위와 동일 |

Phase C readiness 관점:

- 설계 readiness = 카테고리당 **5개 distinct `PUBLISHED` + education-reviewed + asset-complete + 5단 사다리**.
- 현재는 **게시 0**, **사다리 3**, **PROVERB 사다리 1**, **ENGLISH 사다리 1**.
- 카테고리 개수 자체는 IDIOM/GK가 5로 늘어 선행 P0 “핀 불가”는 완화됐지만, **품질·게시·사다리 게이트는 전혀 통과하지 못했다.**

### 3.2 펫 · 경제 · 서버

| 항목 | 실측 | 계획/설계 기대 |
|:---|:---|:---|
| 활성 카탈로그 | 30 COMMON / 15 RARE / 5 LEGENDARY | 일치 |
| `coachArchetype` 분포 | SCOUT **36**, CHEER 9, LINGUIST 3, SAGE 2 | 4원형 존재하나 **편향 큼** |
| 일일 루프 정책 | `daily-pet-loop.v1.json` | 존재 |
| 승급 규칙 (설계) | spare 10 / 총 11장 | 문서 규범 |
| 승급 규칙 (ADR-004) | **five-copy** fusion | **충돌** |
| `apps/server` | `src/pets/*` + `.env.example` only, **`package.json` 없음** | Task 0B/5는 패키지 스캐폴딩 가정 |
| `packages/learning-competition` | **없음** | Task 5 Create |
| learning 보상 ADR | `learning-economy-source-model.md` **없음** | Task 7 Create |
| progression/competition 정책 | 전부 **DRAFT** | 의도적 fail-closed — 유지 |

### 3.3 마이그레이션 ID 현실

| 실제 파일 | 역할 |
|:---|:---|
| `202607300000_daily_pet_loop.sql` | 일일 드로우/승급 |
| `202607300001_pet_coach_archetype.sql` | 코치 아키타입 정렬 |
| `202607300002_learning_competition.sql` | 랭킹 attempt/season/best (Task 4 상당) |

계획 문서가 가정한 번호:

- Task 4 → `202607300001_learning_competition.sql` ← **이미 다른 용도로 사용됨**
- Task 6 → `202607300002_learning_leaderboards.sql` ← **0002가 competition에 점유됨**
- Task 7/8 → `…003/…004_…` ← 이후 번호도 계획 텍스트와 어긋남

이 상태에서는 계획 Step의 `git add` 경로를 그대로 따르면 **파일 충돌·중복 스키마**가 난다.

### 3.4 CI / 워크플로

`.github/workflows/ci.yml` 현재:

1. `pnpm check`
2. `pnpm db:start` → `pnpm check:db`

계획 Task 10의 다음 항목은 **미착륙**:

- `learning:competition:check`
- PR 20-way concurrency 분리
- nightly 10k + 100-way settlement workflow
- `tools/pin-weekly-challenges.ts`

로드맵 `G3A→…→G6` 의존 사슬은 그대로다. 경쟁 스키마가 먼저 들어와도 **프로덕션 활성 증거는 G3C/G4 게이트 없이 성립하지 않는다.**

### 3.5 모바일 표면

- 솔로: `apps/mobile/src/learning-demo/*` (registry/data/controller)
- 배틀: `apps/mobile/src/ui/BattleScreen.tsx` (분리 유지 — 좋음)
- Task 9 대상 `apps/mobile/src/features/**`: **없음**
- 힌트 엔진은 패키지에 있으나 **플레이어가 누르는 HintPanel/PetCoach/DailyFreeDraw UI는 없음**

Phase A “엔진 GREEN” ≠ Phase A “플레이 가능 루프 GREEN”.

### 3.6 `research.md` 역할

상단 non-normative 배너는 올바르다. 본문도 `hintUnits`/`hintLadder` 분리를 언급한다.

그러나 **Committed snapshot = 79 packs / 3 admitted** 은:

- admitted 3은 현 manifest와 맞지만
- pack 수는 working tree **91**, frozen registry **79** 와 혼재

즉 research는 여전히 **SSOT가 아니라 스냅샷 메모**다. 에이전트가 이 숫자를 readiness 게이트에 쓰면 오판한다.

---

## 4. 잘된 점 (유지 권고)

1. **Collection-first 북스타**  
   `daily visit → free draw → collection → play → Lv.N → PB replay → stars → showcase` 는 주간 시즌보다 즉시 검증 가능하고 리텐션 설명이 쉽다.

2. **랭크 cosmetic-only 펫**  
   pay-to-win 차단은 스토어·교육 제품 모두에서 필수. 계약/엔진 테스트로 고정한 방향이 맞다.

3. **BEST verified rank tuple**  
   Apple “repeatable challenge → best score”와 맞고, 학습 재시도 동기를 살린다. first-attempt 고정보다 제품 적합.

4. **힌트 저작·입수 분리**  
   runtime LLM 금지 + grapheme 서버/입수 경로 + 모바일 pattern 렌더 분리는 RN/Hermes 현실과 맞다.

5. **effect-once / fencing / POLICY_MISMATCH fail-closed**  
   기존 economy·G3 lease 철학과 정렬.

6. **Phase별 acceptance**  
   Task 11 하나로 GREEN을 미루지 말라는 문구는 실행 리스크를 줄인다.

7. **DB에 readiness·ENGLISH/PROVERB 하드 가드**  
   `enabled_categories = ['ENGLISH','PROVERB']`, `challenges_per_category = 5` 제약은 문서와 코드의 좋은 잠금이다.

---

## 5. 문제점 (P0 → P2)

### P0-1. 계획·설계 inventory / Task 상태가 코드와 불일치 (실행 안전 문제)

**사실**

- 설계 Verified constraints: catalog **81 / 71·5·4·1**
- 실제 catalog/manifest: **91 / 74·7·5·5**, 전부 DRAFT
- 계획 Task 체크박스: 대부분 `- [ ]` (0A~3 완료 미반영)
- SDD progress: Task 0A~3 complete, Task 4 미기록인데 migration은 존재
- 마이그레이션 파일명이 계획 Create 경로와 충돌

**영향**  
다음 에이전트가 Task 4를 “없는 것”으로 다시 구현하거나, readiness를 81 기준으로 잘못 보고, leaderboard migration을 `0002`로 생성해 덮을 수 있다.

**권고**

1. 설계 Status 절에 **Inventory SSOT 표**를 두고 날짜+명령을 고정:
   - `node`/`jq`로 category count, `hintLadderAdmission`, `publishBlocked` 집계
2. 계획 상단에 **Execution ledger** 절 추가 (또는 SDD progress를 유일 원장으로 선언하고 계획 체크박스를 동기화)
3. Task 4~8 Create 파일 경로를 **실제 다음 free migration ID**로 전부 개정
4. working-tree dirty 91 packs vs frozen 79 registry 정책을 한 줄로 고정  
   - 권장: **manifest/registry는 커밋 단위로 재생성**; dirty 81/91 registry를 런타임 진실로 쓰지 말 것

### P0-2. 콘텐츠 readiness가 Phase C/D를 여전히 차단

**사실**  
ADMITTED ladder 3, PUBLISHED 0, publishBlocked 91.  
ENGLISH/PROVERB 주간 5핀에 필요한 **사다리 완료 팩이 절대 부족**.

**권고 (제품 옵션 고정)**

| 옵션 | 내용 | 추천 |
|:---|:---|:---|
| **A** | Phase C 코드는 계속 쌓되, **시즌 오픈 금지**. 병렬 Workstream “Ladder Batch-1”: EN 5 + PROVERB 5 사다리 저작·입수 | **권장** |
| **B** | Phase C 착수 자체를 ladder batch 완료 후로 미룸 | 안전하나 서버 모멘텀 손실 |
| **C** | 사다리 없는 팩을 임시 랭크 허용 | **거부** (설계 위반) |

Ladder Batch-1 완료 정의를 계획에 명시:

```text
ENGLISH ≥5 ADMITTED + education-reviewed
PROVERB ≥5 ADMITTED + education-reviewed
각 팩 rankedEligible=true 가능 조건 충족
season create dry-run → SEASON_CONTENT_INSUFFICIENT 가 해소되는 경로 존재
```

IDIOM/GK는 개수 5가 됐어도 **정책 enable 전**이며, 지금 범위를 넓히지 말 것.

### P0-3. ADR-004 융합 규칙 vs 일일 루프 승급 규칙 충돌

| 문서 | 규칙 |
|:---|:---|
| ADR-004 | **five-copy** COMMON→RARE / RARE→LEGENDARY fusion |
| 설계/계획 Phase 0 | **spare 10 (총 11장)** → 다음 희귀도 1장, base 1 유지 |

이건 취향 차이가 아니라 **경제 불변식 충돌**이다. 구현·pgTAP·스토어 고지가 갈라진다.

**권고**

1. 제품 결정을 하나 고른 뒤 **ADR-004 개정** 또는 **learning/daily-loop 전용 ADR**로 승격.
2. 권장안:  
   - 기존 match/direct economy의 five-copy fusion은 유지할지 명시  
   - daily-loop duplicate promotion은 “수집 루프 전용 11장 규칙”으로 **별 series ID**  
   - 또는 전역을 11장으로 통일하고 ADR-004 문장·테스트를 교체
3. Task 7 전에 이 결정을 닫지 않으면 progression ledger 설계가 다시 흔들린다.

### P0-4. Phase A 플레이 루프 미완성인데 Phase C DB가 선행

**사실**

- hint-engine·3 ladders·policies: 있음
- mobile features (HintPanel, DailyFreeDraw, Collection, Result board): 없음
- competition SQL: 이미 큼

**위험**  
스키마가 먼저 굳으면 모바일/시도 UX 피드백이 DB 제약과 충돌할 때 비용이 커진다.  
또한 `apps/server`에 package manifest 없이 pets 모듈만 있어 **타입체크/CI 경계가 애매**하다.

**권고 실행 순서 (수정안)**

```text
1) 문서 SSOT 동기화 + migration ID 개정          [반나절]
2) ADR-004 vs promotion 결정                     [반나절]
3) Phase A 잔여: Task 9 casual slice only
   - HintPanel + PetCoach + DailyFreeDraw + Collection
   - BattleScreen 비수정 유지
4) Ladder Batch-1 (EN5+PROVERB5)                 [콘텐츠 병렬]
5) Task 5: packages/learning-competition + server package.json
   - 이미 있는 DB 함수에 thin adapter
6) Task 6 boards / stars
7) Task 7 progression (ADR 후)
8) Task 8/D weekly ticket 은 readiness+G 증거 후
```

Task 4를 “다시 구현”하지 말고 **이미 착륙한 SQL을 계획의 baseline으로 재서술**하는 편이 안전하다.

### P0-5. Task 9 카피가 폐기된 first-attempt 모델을 여전히 가정

계획 Task 9 RED 테스트:

```tsx
expect(screen.getByText('공식 첫 도전')).toBeTruthy();
expect(screen.getByText('연습 최고 기록')).toBeTruthy();
```

설계 규범은 **내 최고 기록 / 이번 기록** 구분과 best replacement다.  
“공식 첫 도전” 문구는 구 모델 잔재이며, UX·접근성 라벨까지 오염시킨다.

**권고 카피**

- `이번 기록` / `내 최고 기록` / `최고 기록 갱신!`
- ranked: `서버 검증 완료 시에만 반영`
- casual offline: `연습 기록 (랭킹 미반영)`

---

### P1-1. `apps/server` 스캐폴딩 공백

pets 도메인 파일만 있고 `package.json`/`tsconfig`가 없다.  
Task 5가 다시 “Create package.json”을 말하지만 이미 소스가 존재 → **반쯤 착륙한 앱**.

**권고:** Task 0B 후속 또는 Task 5 Step 0으로

- `apps/server`를 워크스페이스 패키지로 정식 등록
- `src/pets` 테스트를 `pnpm --dir apps/server test` 경로로 고정
- HTTP 프레임워크 선택(최소: 기존 admin 패턴 vs 경량 Hono/Fastify)을 한 줄 ADR/메모로 고정

### P1-2. 코치 아키타입 분포 편향

SCOUT 36 / LINGUIST 3 / SAGE 2 / CHEER 9.  
수집 다양성·코칭 체감이 SCOUT(시각 사분면)에 과도하게 쏠린다.

**권고**

- MVP: 활성 50마리 재매핑 목표 예) SCOUT 20 / CHEER 15 / LINGUIST 10 / SAGE 5
- 또는 “시각 중심 제품이라 SCOUT 다수”를 설계 Assistance 절에 명시
- 입수 경고만으로 방치하지 말 것

### P1-3. 점수식·힌트 페널티는 유지하되 증거 게이트 강화

```ts
timePenalty = min(30_000, floor(completionMs / 3))  // 90s 포화
hintStepsUsed * 15_000
```

방향(정확성 > 속도)은 Kahoot/Quizizz 연구 요약과 맞다.  
다만 상위권에서 시간 항 소멸 → `accepted_at`/`attempt_id` 타이브레이크 의존.

**권고:** Task 10 증거 필드(동점 분포) 유지. 상수 변경은 코드 하드코딩 금지, policy JSON만.

힌트 −15000은 오탭 5회보다 비싸다. 랭크에서는 공정성 이유로 유지 가능하나,  
**결과 UI 확인 모달**(계획에 있음)은 casual/ranked 모두 필수.

### P1-4. 주간 핀 운영 도구 공백은 여전히 위험

DB season create가 있어도 **누가 매주 5 revision을 고르는지** Admin/CLI가 없다.  
Task 10 `pin-weekly-challenges.ts`를 Phase C 직전으로 **앞당길 것**을 권고한다.  
수동 SQL 핀 금지는 유지.

### P1-5. CI가 계획 게이트를 모름

PR CI에 장시간 10k를 넣지 말라는 계획 방향은 맞다.  
지금은 반대로 **경쟁 무결성 스모크가 전혀 없다.**

**권고 최소 PR 게이트 (Task 10 전이라도):**

```text
vitest: learning-policy + hint-ladder + hint-engine + daily-pet-loop
supabase: daily-pet-loop + learning-competition pgTAP (이미 있으면)
```

Nightly에만 10k/100-settlement.

### P1-6. 로드맵 게이트 문구 vs 실제 착수

계획: Phase A ↔ G3A/G3C, Phase 0/B ↔ G4 (G3C 전 프로덕션 enable 금지), Phase C ↔ 인증 서버 경로.

코드는 G3 미완 상태에서 competition schema를 이미 넣었다.  
**개발 착수 ≠ production enable** 원칙을 로드맵/계획 Status에 더 강하게 적을 것.  
그렇지 않으면 “스키마 있음 = 시즌 오픈 가능”으로 오해된다.

### P1-7. GENERAL_KNOWLEDGE 옵션 매핑

catalog 선택지 개수·`ELIMINATE_OPTION` 검증은 Task 2에서 상당 부분 보강된 것으로 보인다(SDD review).  
남은 리스크는 **신규 dirty packs**가 검증 없이 registry에 섞이는 것.

**권고:** generate-registry / write-manifest가 dirty working tree를 조용히 삼키지 못하게,  
CI에서 frozen manifest hash 또는 `publishBlocked` invariant를 검사.

### P1-8. 티켓 inventory는 여전히 설계만

`RARE_ONLY_TICKET_V1`·내구 entitlement 테이블은 Task 8 이전 공백.  
Phase D 전용으로 미루는 것은 맞다.  
다만 Phase B ledger 키 설계 때 `WEEKLY_SETTLEMENT` source_type 자리를 **미리 예약**하지 않으면 Task 8에서 ledger 재작성이 난다.

---

### P2-1. research.md 숫자 갱신

- packs: committed/frozen/working 세 층을 표로 분리
- auto-detect 파라미터는 “코드 상수 우선” 한 줄 유지
- 본 기능 readiness 계산에 research 숫자를 쓰지 말 것

### P2-2. 설계 Research findings 절

비규범 참고로 충분. 링크 장애가 수용 기준을 훼손하지 않게 Acceptance만 규범으로 유지 (현재 대체로 그러함).

### P2-3. Rank 2–10 보상 비활성

동의. public 카피 “1위만 희귀 티켓” 고지 유지.

### P2-4. Legendary 스페어 화장품 정책

`COSMETIC_REWARD_POLICY_REQUIRED` 방향 좋음.  
승인 전 UI에 “준비 중” 상태를 명시하지 않으면 승급 CTA가 막힌 것처럼 보인다.

---

## 6. 더 나은 방향 (의견)

### 6.1 “세 루프 비전 문서”는 유지, “실행 원장”은 분리

지금 설계+계획 한 쌍은 비전·규범으로 훌륭하다.  
실행은 다음 두 파일로 쪼개는 편이 에이전트 오류가 적다.

| 문서 | 역할 |
|:---|:---|
| 설계 | 규범 (점수식, 상태머신, 공정성) |
| 계획 | Task 인터페이스·테스트 스케치 |
| **`progress.md` (SSOT 실행 원장)** | 완료 Task, 실제 커밋, 실제 migration 파일명, 열린 리스크 |
| **`inventory-snapshot.md` (주 1회)** | catalog/manifest/ladder 집계 |

계획이 Create 경로를 절대화하면 안 된다. **“다음 free ID” 규칙**을 계획 Global Constraints에 추가하자.

### 6.2 Phase A 완료 정의를 “플레이 가능”으로 상향

현재 Phase A acceptance는 admitted bundle 1+1과 전면 공개 금지 중심이다.  
제품 관점 권장 완료 정의:

1. 캐주얼 모드에서 5단 힌트 버튼 동작 (모바일)
2. 코치 3회 + 소진 후 일반 힌트
3. `noHint` 의미가 UI 툴팁에 노출
4. EN/PROVERB 각 최소 1팩이 데모 홈에서 바로 실행
5. (보너스) Ladder Batch-1 진행률 대시보드

엔진-only GREEN으로 Phase B/C를 열지 말 것.

### 6.3 Phase C는 “best board first”, 주간 합산은 나중

이미 best_records 테이블 방향이 좋다.  
권장 제품 컷:

1. **문제별 Top 10 + 내 순위 + 챔피언 별** (Phase C core)
2. 주간 카테고리 합산 보드 (C-late)
3. 희귀 티켓 정산 (D)

주간 합산 없이도 collection + PB + stars로 루프가 닫힌다.  
이게 설계 북스타와도 일치한다.

### 6.4 서버 배치 권고 (재확인)

```text
packages/game-engine          pure hint/score replay
packages/learning-competition pure session/verify/DTO   (미착륙 → 우선)
apps/server                   auth + HTTP + repo adapter only
supabase private.*            authority writes, RLS-safe views
apps/mobile features/*        presentation + optimistic UX only
```

`apps/server/src/pets`에 비즈니스 규칙이 두꺼우면 장기적으로 DB 함수와 이중 소스가 된다.  
**권위 쓰기는 SQL/RPC, 서버 TS는 orchestration** 경계를 Task 5 착수 시 한 번 더 고정하자.

### 6.5 콘텐츠 저작 워크플로 제안

research 파이프라인(이미지→delta→bundle) 다음에 **교육 사다리 입수**를 공식 8단계로 승격:

```text
7. write-learning-manifest
8. admit-hint-ladder (human authored)  ← 지금 병목
9. generate-registry
```

배치 도구 제안:

- `tools/content/scaffold-hint-ladder.ts` : 카테고리 템플릿 생성
- `tools/content/report-ladder-coverage.ts` : 카테고리별 ADMITTED 수 리포트
- CI: `ladder-coverage --min-en=0 --min-proverb=0` (임계는 점진 상향)

### 6.6 점수·학습 한 줄 정책 (재확인)

> 랭크 점수는 **정답 품질(힌트·오답) > 시간** 순으로 벌점한다.  
> 캐주얼은 힌트를 점수 처벌하지 않고 `noHint` 소액 보너스만 준다.  
> 펫 희귀도/레벨은 랭크 정보량을 바꾸지 않는다.

이 문장만 모바일 카피·정책 주석·스토어 FAQ에 복붙하면 구현 논쟁이 줄어든다.

---

## 7. Task별 재평가 (현재 시점)

| Task | 문서 상태 | 실제 | 조정 |
|:---|:---|:---|:---|
| 0A 펫 아트 | checkbox 미완료 | **완료 추정** | 계획 체크 반영, 아키타입 재균형 후속 |
| 0B 일일 루프 | checkbox 미완료 | **완료 추정** (pets src+SQL) | server package 등록 후속 |
| 0C/0D | 계획 본문에 Task 번호 약함 | SDD상 완료 | 계획에 0C/0D 존재 명시 |
| 1 정책 | checkbox 미완료 | **완료** (DRAFT JSON) | 승인 메타는 B/C 게이트 |
| 2 사다리 | checkbox 미완료 | **계약/파이프라인 완료, 콘텐츠 3팩만** | Ladder Batch workstream 분리 |
| 3 힌트 엔진 | checkbox 미완료 | **완료** | mobile 연동만 남음 |
| 4 DB | checkbox 미완료 | **SQL 대량 착륙** | 계획을 “verify/harden existing migration”으로 개서 |
| 5 attempt runtime | 미착수 | package 없음 | **다음 본코드 우선순위 후보** (A 모바일 병행) |
| 6 boards | 미착수 | migration ID 충돌 위험 | ID 재할당 필수 |
| 7 progression | 미착수 | economy ADR 없음 | **P0-3 결정 후** |
| 8 weekly ticket | 미착수 | entitlement 없음 | Phase D, readiness 후 |
| 9 mobile UX | 미착수 | features 없음 | **Phase A 잔여 최우선** |
| 10 analytics/CI | 미착수 | ci.yml 기본만 | pin tool을 C 직전으로 앞당김 |
| 11 E2E | 미착수 | — | 단계별 evidence로 해체 |

---

## 8. 수용 기준 보완 제안

설계 Acceptance에 추가·수정 권고:

1. **Inventory freshness:** 설계/계획/research 중 catalog 수치를 인용하면 측정 날짜와 집계 명령을 함께 기록.
2. **Ladder coverage gate:** 시즌 오픈 전 EN≥5, PROVERB≥5 ADMITTED.
3. **Promotion rule single source:** ADR과 daily-loop 정책 해시가 동일 규칙을 가리킴.
4. **UI model strings:** “공식 첫 도전” 금지; best/current 라벨만 허용.
5. **Migration path drift:** 계획의 Create 경로가 실제 트리에 없으면 계획이 stale → fail review.
6. **Server package boundary:** `apps/server`가 workspace package로 typecheck/test 가능.
7. **기존 유지:** best replacement, star transfer 1회, pity byte-identical, private field leak 0.

---

## 9. 워크플로·에이전트 실행 권고

1. **subagent-driven-development** 시 매 Task 시작 전:
   - `progress.md` 읽기
   - `supabase/migrations` 최신 번호 확인
   - catalog ladder coverage 집계
2. Task 4를 greenfield로 시작하지 말 것. 기존 `202607300002_learning_competition.sql` diff 리뷰부터.
3. content dirty tree(추가 drafts 12+)와 frozen registry를 섞어 커밋하지 말 것.  
   Task 2 리뷰가 이미 dirty 81 registry 사고를 한 번 잡았다.
4. research.md는 참고만; **권위는 contracts + approved policy + design Acceptance**.

---

## 10. 최종 판정

| 영역 | 판정 |
|:---|:---|
| 제품 원칙 (공정 랭킹·서버 권위·저작 힌트·collection-first) | **채택 유지** |
| Phase 0→D 분할 | **채택 유지** |
| BEST-record + champion stars | **채택 유지** |
| 힌트 엔진·정책·펫 루프 코드 방향 | **대체로 건전** |
| 설계/계획 문서의 inventory·Task 상태 | **즉시 갱신 필요 (P0)** |
| ADR-004 vs 11장 승급 | **즉시 결정 필요 (P0)** |
| 콘텐츠 readiness (사다리·PUBLISHED) | **Phase C/D 차단 지속** |
| 모바일 Phase A UX | **미완 — 다음 최우선** |
| 주간 티켓/정산 | **Phase D 이연 유지** |
| research.md | **비규범 유지, 숫자만 갱신** |
| CI | **경쟁 스모크 최소 추가 권고** |

### 한 줄 결론

원칙과 Phase 구조는 프로덕션 방향으로 옳고, 선행 리뷰 이후 **코드도 상당 부분 그 방향으로 움직였다.**  
지금은 기능을 더 쌓기 전에 **SSOT(문서·체크박스·migration ID·경제 규칙)를 코드에 맞추고**, **캐주얼 힌트/수집 UX + 사다리 배치**로 Phase A를 플레이 가능하게 닫은 뒤, 이미 존재하는 competition 스키마 위에 **thin attempt runtime → best board** 순으로 진행하는 것이 이 저장소에서 성공 확률이 가장 높다.

---

## 11. 문서 경로

| 구분 | 전체 경로 |
|:---|:---|
| **본 리뷰 (신규)** | `D:\touchcatch\docs\reviews\2026-07-31-adaptive-hints-pet-progression-weekly-ranking-plan-codebase-review.md` |
| 선행 리뷰 | `D:\touchcatch\docs\reviews\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-review.md` |
| 설계 | `D:\touchcatch\docs\superpowers\specs\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-design.md` |
| 구현 계획 | `D:\touchcatch\docs\superpowers\plans\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan.md` |
| 연구(콘텐츠 파이프라인) | `D:\touchcatch\research.md` |
| SDD 진행 원장 | `D:\touchcatch\.superpowers\sdd\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan\progress.md` |
| 경제 ADR | `D:\touchcatch\docs\decisions\ADR-004-pet-economy.md` |
| CI | `D:\touchcatch\.github\workflows\ci.yml` |

---

## 12. 권장 후속 액션 (우선순위)

| 우선순위 | 액션 | 소유 문서/코드 |
|:---|:---|:---|
| P0 | 설계 inventory 표 갱신 (91 / ladder 3) | design Status |
| P0 | 계획 체크박스·migration Create 경로 동기화 | implementation plan |
| P0 | ADR-004 ↔ 11장 승급 단일화 | ADR + daily-pet-loop |
| P0 | Task 9 casual slice (힌트/드로우/컬렉션) | `apps/mobile/src/features` |
| P0 | Ladder Batch-1 EN5+PROVERB5 | `content/learning/drafts` |
| P1 | `apps/server` package 정식화 | `apps/server/package.json` |
| P1 | Task 5 thin adapter on existing SQL | `packages/learning-competition` |
| P1 | pin-weekly-challenges 도구 앞당김 | `tools/` |
| P1 | PR CI 경쟁/펫 스모크 최소 세트 | `ci.yml` |
| P2 | research.md pack 표 3층 분리 | `research.md` |
| P2 | coachArchetype 재균형 | pet catalog |
