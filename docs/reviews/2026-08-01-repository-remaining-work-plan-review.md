# Review: TouchCatch Repository Remaining Work Plan

| 항목 | 내용 |
|:---|:---|
| **작성일** | 2026-08-01 |
| **대상 계획** | `D:\touchcatch\docs\superpowers\plans\2026-08-01-repository-remaining-work-plan.md` |
| **연구 문서** | `D:\touchcatch\research.md` (비규범 / 콘텐츠 파이프라인 참고) |
| **선행 설계·계획** | `docs/superpowers/specs/2026-07-30-adaptive-hints-pet-progression-weekly-ranking-design.md`, `docs/superpowers/plans/2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan.md` |
| **선행 리뷰** | `docs/reviews/2026-07-30-adaptive-hints-pet-progression-weekly-ranking-review.md`, `docs/reviews/2026-07-31-adaptive-hints-pet-progression-weekly-ranking-plan-codebase-review.md` |
| **SDD 원장** | `.superpowers/sdd/2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan/progress.md` |
| **검토 범위** | 위 문서 + `content/learning/**`, `config/daily-pet-loop.v1.json`, `docs/decisions/ADR-004-pet-economy.md`, `packages/{contracts,learning-competition,content-validator,game-engine}`, `apps/{mobile,server}`, `supabase/migrations`, `tools/content/**`, `docs/04-Roadmap/12_IMPLEMENTATION_ROADMAP.md`, `docs/release-evidence-blockers.md`, `.github/workflows/ci.yml` |
| **검증 방법** | 계획 전항을 코드·SSOT·선행 리뷰와 교차 대조. catalog/manifest 집계, migration·서버 어댑터·모바일 화면 실측. (본 리뷰는 구현 패치를 포함하지 않음.) |
| **판정** | **방향 채택 · 구현 전 수정 필수.** 큰 축(SSOT 정합 → Phase A 플레이 → Ladder Batch-1 병렬 → thin adapter → weekly pin → 외부 evidence)은 선행 2026-07-31 리뷰와 정렬된다. 그러나 **(1) BEST-record 규범을 뒤엎는 Task 5 문구**, **(2) 이미 착륙한 코드/마이그레이션을 Create로 오인**, **(3) 잘못된 migration 타깃·radius 상수**, **(4) research 비규범 경계 혼동 위험**이 그대로면 에이전트가 회귀를 구현한다. |

---

## 0. 총평 (Executive Summary)

이 문서는 “남은 일을 한 줄로 모은 실행 계획”으로서 **쓸모가 크다.** 특히:

1. **dirty working tree를 건드리지 말 것** — 현재 저장소 현실과 맞다.
2. **`research.md`를 랭킹/프로덕션 SSOT로 쓰지 말 것** — 헤더 비규범 배너와 일치.
3. **콘텐츠 readiness fail-closed** (`SEASON_CONTENT_INSUFFICIENT`) — DB에 이미 존재.
4. **Task 1~4 우선, Task 5 이후는 규칙·콘텐츠 게이트 후** — 선행 리뷰 실행 순서와 거의 동일.
5. **local PASS ≠ production enable** — `docs/release-evidence-blockers.md`와 정합.

다만 2026-08-01 시점 코드베이스는 2026-07-31 리뷰 때보다 더 앞서 있다. 계획이 그 진전을 **baseline으로 다시 찍지 않아**, “없는 것을 만든다” 단계가 여러 곳에 남아 있다. 또한 Task 5 Step 4 한 줄이 **이미 폐기된 first-attempt 모델을 부활**시킨다.

| # | 심각도 | 요약 |
|---|---|---|
| 1 | **치명** | Task 5 Step 4: “**first completed verified attempt만 official best**” — 설계·7/30 계획(Superseded)·DB `BEST_RECORD_REGRESSION`·코드 `BEST_COMPLETED_VERIFIED`와 **정면 충돌**. |
| 2 | **치명** | Task 2가 `supabase/migrations/202607300003_learning_progression.sql`을 수정 대상으로 지정. 이 파일은 **이미 progression ledger**용으로 착륙. 승급 규칙은 `202607300000_daily_pet_loop.sql` + `config/daily-pet-loop.v1.json`. **덮어쓰면 스키마 사고**. |
| 3 | **높음** | Task 5 “package/tsconfig 추가·adapter 구현”은 상당 부분 **이미 존재** (`apps/server/package.json`, `packages/learning-competition/**`, learning adapter 스텁). 그린필드 Create가 아니라 **스텁→실 RPC 완성**으로 재서술해야 한다. |
| 4 | **높음** | Task 4 Step 2: `ADVANCED 0.050` — 코드 SSOT `tools/content/pipeline-constants.js`는 **`ADVANCED: 0.055`**. research.md도 0.055. 계획이 잘못된 숫자를 문서보다 우선하라고 하면 파이프라인이 깨진다. |
| 5 | **높음** | Inventory 수치: catalog/manifest **91 DRAFT**, `publishBlocked`는 **manifest 91**, admitted ladder **3**, rankedEligible **3** — 계획 Global Constraints와 대체로 일치. 다만 catalog entry 자체에 `publishBlocked` 필드가 없고, research “79 packs committed snapshot”은 여전히 구식. Task 1이 이를 고치지 않으면 다시 드리프트. |
| 6 | **중간** | Phase A: `LearningDemoScreen`이 이미 HintPanel/PetCoach/DailyFreeDraw/PetCollection을 연결했으나 **mock state + alert 승급 + HintPanel DOM(`div`/`button`)**. Task 3은 “처음부터 연결”이 아니라 **실서버/실정책 경계 + RN 통일 + ranked 제거**. |
| 7 | **중간** | ADR-004(five-copy fusion) vs daily-loop(11장/ spare 10) 충돌은 Task 2로 다루지만, `PromotionRuleV1` 타입명은 계약에 없고 `DailyPetLoopPolicyV1.duplicatePromotion`이 정본. **이름·series 분리**를 계획에 명시하라. |
| 8 | **중간** | leaderboard adapter가 **하드코딩 스텁** (`Player1` 등). Task 6만으로는 부족하고, Task 5 commit 경로의 `isBestRecord: true` 고정 스텁도 규범과 어긋난다. |
| 9 | **중간** | 제품 우선순위: 7/30 계획은 weekly를 Phase D로 **deprioritize**. 본 계획은 Task 6~7로 production enable까지 민다. **로컬 플레이 가능(Phase A) vs 시즌 production-enable**을 완료 정의에서 분리하라. |
| 10 | **낮음** | research.md 알고리즘 수치 드리프트(pixelThreshold 60 vs 코드 75, cluster 50 vs 150). 비규범이므로 랭킹 게이트에 쓰지 말되, Task 1에서 “research를 고친다”면 **파이프라인 참고 정확도**만 목표로 한정. |
| 11 | **개선** | 성공 지표를 **(A) 문서 SSOT**, **(B) Phase A 플레이**, **(C) 콘텐츠 readiness**, **(D) 서버 권위 attempt**, **(E) 외부 release evidence** 다섯 줄로 분리. “저장소 남은 일 완료” 단일 체크는 오판을 부른다. |

---

## 1. 계획 주장 × 코드/SSOT 교차 검증 (2026-08-01 실측)

| 계획 주장 | 검증 | 근거 |
|---|---|---|
| catalog/manifest 91팩, 전부 DRAFT, publishBlocked, admitted 5단 3 | ✅/⚠️ | catalog `entries` 91·status DRAFT 91; manifest `publishBlocked` 91; `hintLadderAdmission.status=ADMITTED` **3** (`en-resilience`, `ko-proverb-seeing-is-believing`, `ko-idiom-turn-misfortune`); rankedEligible 3. catalog 쪽 `publishBlocked` 필드는 없음 |
| research는 랭킹 SSOT 아님 | ✅ | research 상단 NON-NORMATIVE 배너 |
| research 79 packs | ⚠️ 구식 | research §5 “Committed snapshot: 79”; working manifest 91 |
| Node 24.18 / pnpm 11.13 | ✅ | `package.json` engines + CI |
| dirty tree 정리 금지 | ✅ 운영 권고 | 유지 |
| season fail-closed `SEASON_CONTENT_INSUFFICIENT` | ✅ | `create_weekly_season_v1` / pgTAP |
| ADR-004와 daily promotion 단일화 필요 | ✅ 문제 인식 | ADR-004 = five-copy; `daily-pet-loop`/`promote_duplicate_cards_v1` = 11/10 |
| SQL RPC: start/attest/commit | ✅ 이름 일치 | `202607300002_learning_competition.sql` |
| apps/server package 없음 → 추가 | ❌ 구식 | `apps/server/package.json` 존재 (`@spot-learn/server`) |
| learning-competition 패키지 Create | ❌ 구식 | `packages/learning-competition` + tests 존재 |
| migration 003을 promotion용으로 수정 | ❌ 위험 | `202607300003_learning_progression.sql` = progression ledger 이미 존재 |
| ADVANCED radius 0.050 | ❌ | `pipeline-constants.js` **0.055** |
| first completed = official best | ❌ **규범 회귀** | 설계 BEST tuple; 코드 `BEST_COMPLETED_VERIFIED` |
| HintPanel 등 미연결 | ⚠️ 부분 | Demo에 연결됨; DOM/mock/실권위 미완 |
| pin-weekly CLI 없음 | ✅ | `tools/pin-weekly-challenges.ts` 부재 |
| document inventory oracle 테스트 | ✅ 존재 | `tests/specs/document-inventory-requirement-oracle.test.ts` (DOC-068/070/088) |
| external evidence 전부 BLOCKED | ✅ | `docs/release-evidence-blockers.md` |
| G3A→G6 게이트 준수 | ⚠️ 모호 | 로드맵 게이트와 “로컬 Phase A 완료”를 동일시하면 과잉 차단 |

### 1.1 콘텐츠 inventory (재현용)

```text
catalog.v1.json  entries: 91
  ENGLISH 74 | PROVERB 7 | IDIOM 5 | GENERAL_KNOWLEDGE 5
  status DRAFT: 91

manifest.v1.json entries: 91
  publishBlocked: 91
  hintLadderAdmission.status ADMITTED: 3
  rankedEligible: 3
  ADMITTED keys:
    en-resilience (ENGLISH)
    ko-proverb-seeing-is-believing (PROVERB)
    ko-idiom-turn-misfortune (IDIOM)   ← 주간 MVP 카테고리 아님

drafts/*.json: 95  (manifest 91과 불일치 — Task 1 inventory에 orphan draft 열 추가 권고)
```

**Ladder Batch-1 관점 잔여:** ENGLISH admitted 1→5 필요(+4), PROVERB 1→5 필요(+4). IDIOM admitted 1은 주간 MVP 핀에 **포함하지 않는다**(정책 enable 전).

### 1.2 이미 착륙한 서버/DB (계획을 “완성”으로 재서술)

| 영역 | 상태 |
|---|---|
| `202607300000` daily pet loop | 착륙 (`promote_duplicate_cards_v1` 11장 규칙) |
| `202607300001` coach archetype | 착륙 |
| `202607300002` learning competition | 착륙 (attempt/season/best/RPC) |
| `202607300003` learning progression | 착륙 (ledger + `award_learning_progression_v1`) |
| `packages/learning-competition` | pure session/verifier 골격 + `BEST_COMPLETED_VERIFIED` |
| `apps/server/src/learning/*` | thin adapter **스텁** (DB 미호출, leaderboard mock) |
| `apps/server/src/pets/*` | Phase 0 로직 + 테스트 |
| `apps/server/tsconfig.json` | **없음** (package.json만 있음) |

---

## 2. 문제점 상세

### 2.1 [치명] Task 5 Step 4가 BEST-record 규범을 되돌린다

계획 문구:

> first completed verified attempt만 official best가 되도록 검증한다.

이미 확정된 규범:

| 출처 | 규칙 |
|---|---|
| 설계 (2026-07-30) | 사용자별 **best verified rank tuple** (replay 개선) |
| 구현 계획 Global Constraints | “maximum verified canonical rank tuple”; “공식 첫 도전” 카피 **금지** |
| 7/30 계획 Superseded 절 | first completed official record **폐기** |
| SQL | `learning_rank_better_v1`, `BEST_RECORD_REGRESSION` |
| pure package | `rankedRecord: 'BEST_COMPLETED_VERIFIED'` |

에이전트가 이 Step을 그대로 구현하면 **DB 트리거·UI 카피·테스트와 전쟁을 시작한다.**

**수정 문안 (권고):**

```text
Step 4: COMPLETED_VERIFIED 커밋이 사용자의 best record를
  - 더 좋을 때만 교체하고
  - 같거나 나쁘면 BEST_RECORD_REGRESSION / no-op 으로 닫으며
  - 동일 complete 재전송은 idempotent replay
  - OPEN/실패/미완료는 보드에 올리지 않음
을 검증한다. first-completed-wins 는 금지.
```

현재 `AttemptRepository.commitAttempt` 스텁이 `isBestRecord: true`를 항상 반환하는 것도 **같은 회귀의 씨앗**이다. Task 5 완료 조건에 “스텁 제거 + RPC 결과 매핑”을 넣으라.

---

### 2.2 [치명] Task 2 migration 타깃 오지정

| 파일 | 실제 역할 | 계획 용도 |
|---|---|---|
| `202607300000_daily_pet_loop.sql` | 일일 드로우·**duplicate promotion(11/10)** | 여기가 승급 권위 |
| `config/daily-pet-loop.v1.json` | `ownedCopiesRequired: 11` 등 | TS 계약과 정렬됨 |
| `packages/contracts/src/daily-pet-loop.ts` | `DailyPetLoopPolicyV1` | `PromotionRuleV1`라는 이름은 없음 |
| `202607300003_learning_progression.sql` | attempt 단위 XP/draw_points ledger | **이미 progression** |
| ADR-004 | match/direct **five-copy fusion** | 일일 루프와 별 계열 |

Task 2 Files 목록이 `202607300003_learning_progression.sql`을 수정하라고 하면, 에이전트가 progression 함수 위에 promotion을 얹거나 파일을 재작성할 위험이 있다.

**권고:**

1. ADR-004에 **두 series를 병기**한다.  
   - `MATCH_OR_DIRECT_FUSION_V1` (five-copy, ADR-004 기존)  
   - `DAILY_PET_PROMOTION_V1` (11 owned / 10 spare / retain 1) — 이미 SQL·config에 존재  
2. “단일 정책 해시”는 **전 경제 하나의 해시**가 아니라 **series별 policy hash**로 정의한다.  
3. SQL 변경이 필요하면 **다음 free ID `202607300004_...`** 만 추가. 기존 000–003 **수정 금지**(이미 적용된 migration 불변).  
4. TypeScript 경계 테스트는 `daily-pet-loop.test.ts` / pgTAP daily-pet-loop에 **임계 11, 10, 멱등, 잘못된 hash**를 보강 (이름 `PromotionRuleV1` 신설보다 기존 스키마 확장).

DRAFT에서 보상 0 / APPROVED에서만 ledger — 이 원칙은 **유지·강화** (fail-closed 경제와 일치).

---

### 2.3 [높음] Task 5·6이 “없는 패키지 창조”로 읽힌다

계획 Task 5:

> package/tsconfig와 workspace script를 추가한다. … thin adapter를 구현한다.

실측:

- `apps/server/package.json` 있음, **tsconfig 없음**, root `pnpm typecheck`가 server를 포함하는지 불명.
- pure 로직 + adapter 클래스 골격 있음.
- leaderboard는 mock.
- repository는 RPC 주석만 있고 실제 DB 클라이언트 없음.

**재서술 권고:**

```text
Task 5 (개정): Attempt runtime 완성
  - apps/server/tsconfig + workspace typecheck/test 배선
  - packages/learning-competition: verify/commit pure 규칙 보강
  - adapters: start_learning_attempt_v1 / attest_... / commit_... 실호출
  - POLICY_MISMATCH / OPEN / EXPIRED / QUARANTINED / COMPLETED_VERIFIED /
    IDEMPOTENCY_CONFLICT / BEST_RECORD_REGRESSION 매핑 테스트
  - 스텁 leaderboard·항상 isBestRecord=true 제거

Task 6: pin CLI + 실 leaderboard read path
  - tools/pin-weekly-challenges.ts (dry-run 기본)
  - public view 필드 화이트리스트 contract test
  - 10k load는 nightly (계획 유지)
```

---

### 2.4 [높음] Task 4 radius·파이프라인 상수

| 출처 | BEGINNER | INTERMEDIATE | ADVANCED |
|---|---:|---:|---:|
| `pipeline-constants.js` (코드 SSOT) | 0.085 | 0.070 | **0.055** |
| research.md §3.2 | 0.085 | 0.070 | **0.055** |
| **본 계획 Task 4** | 0.085 | 0.070 | **0.050** ❌ |

또한 research의 `pixelThreshold=60`, cluster 50은 코드 `PIXEL_THRESHOLD=75`, `MIN_CLUSTER_CHANGED_PIXELS=150`과 다르다. 계획은 “코드 상수 우선”이라고 올바르게 말했으면서 **틀린 코드 상수를 적어 두었다.**

**권고:** Task 4 Step 2 숫자를 `pipeline-constants.js`에서 인용하거나, 테스트가 상수를 import 해 문서 리터럴을 없앤다.

Batch-1 자체(EN5+PROVERB5 사다리 저작, human rights/education ≠ local visual-delta)는 **강하게 동의**. orphan `drafts` 95 vs manifest 91도 inventory에 넣을 것.

---

### 2.5 [높음] Task 1 inventory — 무엇을 SSOT로 둘 것인가

계획: snapshot 문서 + research/설계/계획/progress 동기화 + oracle 테스트.

동의 및 보강:

1. **수치 SSOT 한 파일:** `docs/reviews/2026-08-01-inventory-snapshot.md` (또는 `docs/operations/content-inventory-snapshot.md`)에  
   `날짜 | 명령 | catalog | manifest | admitted by category | publishBlocked | orphan drafts | frozen registry 79 정책`.
2. **research.md**는 수치 표의 권위가 되지 않게 한다. Task 1이 research를 “수정”할 때 허용 범위:  
   - 파이프라인 설명 정확도  
   - “79” 같은 **명백히 틀린 스냅샷 삭제 또는 “historical” 표기**  
   - 랭킹/시즌 게이트 문장 **추가 금지**
3. **7/30 구현 계획 체크박스**와 **SDD progress.md**는 Task 0A–3 complete 이후 코드 진전(competition SQL, progression migration, server learning stubs, mobile demo wiring)을 반영하지 않으면 **원장이 거짓**이다. progress를 유일 실행 원장으로 선언하든지, 08-01 계획 체크박스를 원장으로 승격하고 7/30 계획에 “superseded ledger → 08-01 plan” 한 줄을 넣어라.
4. frozen 79 vs working 91: 7/31 리뷰 권고 유지 — **커밋 단위 재생성 registry**를 런타임 진실로, dirty working tree를 배포 진실로 쓰지 말 것.

---

### 2.6 [중간] Task 3 Phase A — “연결”이 아니라 “권위 있는 데모 완성”

실측 `LearningDemoScreen.tsx`:

- HintPanel / PetCoach / DailyFreeDraw / PetCollection / ChampionStars / ChallengeResultBoard **이미 import·렌더**
- coach charge·daily claim·pet list는 **로컬 useState mock**
- 승급은 `alert(...)`
- `HintPanel`만 **DOM `div`/`button`** (RN 깨짐 위험)
- PetCoach 등은 이미 `View`/`Pressable`

완료 정의 개정:

```text
Phase A done =
  1) RN-only UI (HintPanel 포함)
  2) admitted EN + PROVERB 각 ≥1 팩을 홈에서 선택·5단 힌트 소진·완료
  3) casual 완료가 ranked insert / leaderboard write를 호출하지 않음 (스파이 테스트)
  4) coach charge 0 이후 비활성
  5) daily draw 1/일 fail-closed (가능하면 contracts 정책 해시 사용; 없으면 명시적 demo-only 배너)
  6) private solution / 정답 좌표가 클라이언트 번들 로그·UI 문자열로 새지 않음 (__DEV__ registry 경고 유지)
```

서버 권위 점수·정답 판정은 **ranked 경로(Task 5+)** 와 분리해도 된다. 캐주얼 데모가 모든 점수를 서버에 맡기라고 한 문장은 이상적이나, Phase A 병목을 키운다. **권고:** casual은 로컬 엔진(`hint-engine` / demo controller) 허용, ranked/private 필드 미노출만 강제; ranked만 서버 검증.

---

### 2.7 [중간] 제품 로드맵 vs 본 계획의 “production enable” 무게

`12_IMPLEMENTATION_ROADMAP.md`: G3A→G3B→G3C→G4→G5→G6, 로컬 PASS ≠ 게이트 완료.

본 계획 Task 7은 실기기·PITR·soak·Sentry 등 **외부 증거 전부**를 한 Task에 묶는다. 방향은 맞으나:

- **에이전트 혼자 닫을 수 없는 일**과 **코드로 닫는 일**이 섞여 있다.
- weekly production enable을 Phase A와 같은 문서 완료 조건에 넣으면 진행이 영구 정체처럼 보인다.

**권고 완료 정의 분리:**

| 트랙 | 완료 의미 | 본 계획 Task |
|---|---|---|
| T0 문서/경제 정합 | inventory snapshot + ADR series 분리 | 1–2 |
| T1 로컬 플레이 | Phase A casual 플레이 가능 | 3 (+4 일부 admitted 증가) |
| T2 콘텐츠 readiness | EN5+PROVERB5 admitted + human approval 경로 | 4 |
| T3 서버 권위 ranked | real RPC + best-record + public board | 5–6 |
| T4 production enable | release-evidence-blockers 전부 CLOSED | 7 — **별도 운영 에픽** |

Task 7을 “코드 PR 완료”와 동일 체크박스로 두지 말고, runbook + evidence 표 갱신 에픽으로 분리하는 편이 에이전트 실행에 안전하다.

---

### 2.8 [중간] research.md와 워크플로

research가 올바르게 말하는 것:

- 7단계 콘텐츠 파이프라인 (source → delta → geometry → bundle → manifest → registry)
- `hintUnits` ≠ `hintLadder` 분리
- ranked 후보는 5단 입수 필수

research가 틀린/위험한 것:

- 79 packs snapshot
- 일부 알고리즘 수치(픽셀 임계·클러스터 최소)
- “Focused verification” 명령이 현재 패키지 레이아웃과 어긋날 수 있음

**워크플로 권고 (에이전트):**

```text
콘텐츠 작업: research §2 다이어그램 + tools/content/* + pipeline-constants.js
경제/펫: ADR-004 + daily-pet-loop 정책 + 000 migration
랭킹: 설계 2026-07-30 + 002 migration + learning-competition
운영 게이트: 12_IMPLEMENTATION_ROADMAP + release-evidence-blockers
금지: research를 열어 시즌 오픈 조건을 “79팩” 기준으로 판단
```

본 계획 Global Constraints 3번째 줄은 이 금지를 이미 적었다 — **유지.** Task 1이 research를 SSOT처럼 키우지 않게 주의.

---

### 2.9 [낮음] 기타

- CI: `pnpm check` + `pnpm check:db` 분리 — 계획 Task 6 “경쟁 스모크 PR / 10k nightly”와 맞음. 스모크 스크립트 경로를 명시할 것.
- `pixelThreshold` 등 research 드리프트는 Task 1 부록으로 “코드 우선, research 정리” 한 줄.
- mobile `registry.ts` 자동생성 — 수동 편집 금지(파일 헤더). Task 3이 registry를 손으로 고치지 않게 명시.
- admin 앱·G3 배틀 경로는 본 계획 비범위로 두는 것이 맞다. BattleScreen 비수정 유지(7/31 리뷰) 재확인.

---

## 3. 더 나은 방향 — 개정 실행 순서

```text
P0  문서·규범 고정 (반나절~1일)
    Task 1  inventory snapshot + 집계 명령 + progress/7-30 체크박스 동기화
            research 79 문구 정리 (비규범 유지)
    Task 5 문구 수정  first-completed → BEST verified (문서만, 즉시)
    Task 2  migration 타깃 수정  000/config/contracts; 003 손대지 않음
    Task 4  radius 0.055 로 정정

P1  경제 series 명시 (반나절)
    ADR-004 개정: five-copy vs DAILY_PET_PROMOTION_V1 병기
    경계 테스트 보강 (TS + pgTAP)
    DRAFT 보상 0 유지

P2  Phase A 로컬 플레이 (1~2일 코드)
    HintPanel RN 전환
    demo mock 최소화 + casual≠ranked insert 테스트
    EN/PROVERB admitted 팩 홈 실행

P3  Ladder Batch-1 (콘텐츠 병렬, 사람 리뷰 병목)
    EN+4, PROVERB+4 사다리 저작
    batch-build idempotent + constants 테스트
    rights/education 승인 전 publish 금지
    시즌 pin dry-run still fail until human approval + PUBLISHED

P4  Attempt runtime 실배선
    server tsconfig + RPC adapters
    BEST record / idempotency / POLICY_MISMATCH
    leaderboard mock 제거 + PII 필드 테스트

P5  Weekly pin 도구 (콘텐츠 readiness 후)
    pin CLI dry-run default
    create_weekly_season_v1 adapter
    SEASON_CONTENT_INSUFFICIENT 유지

P6  Production enable (운영 에픽)
    release-evidence-blockers 항목별 owner
    로컬 테스트 PASS로 체크하지 않음
```

이것은 본 계획 Handoff의 “Task 1~4 다음, 5는 2+콘텐츠 후”와 같되, **이미 있는 코드를 재구현하지 않도록 baseline을 고정**한 버전이다.

---

## 4. 완료 조건 개정안

| 트랙 | 계획 원문 취지 | 개정 완료 조건 |
|---|---|---|
| Task 1 | inventory 동기화 | 재현 명령 1개 + snapshot 파일 + working/manifest/frozen 3열 + orphan drafts; oracle PASS |
| Task 2 | ADR·promotion 단일화 | series 2개 문서화; 000/config/contracts 정합; **003 무수정**; 경계 테스트 |
| Task 3 | Phase A slice | RN-only; admitted EN+PROVERB 각 1 플레이; casual no ranked write; coach/daily fail-closed |
| Task 4 | Ladder Batch-1 | EN≥5 & PROVERB≥5 ADMITTED; human approval 기록; radius/constants 코드 SSOT; 시즌 오픈은 승인 전 불가 |
| Task 5 | server adapter | **스텁 제거**; 실 RPC; **BEST record** (first-completed 금지); 상태 머신 테스트 |
| Task 6 | pin + board | dry-run pin; 공개 필드 화이트리스트; load nightly |
| Task 7 | production | blockers 표 전부 외부 증거; G3A–G6 주장 시 로드맵 evidence 링크 |

---

## 5. 계획 문서 수정 체크리스트

구현 에이전트 투입 전, 계획 본문에 최소 반영:

- [ ] Task 5 Step 4 **first completed → best verified rank tuple** 교체
- [ ] Task 2 Files: `202607300003_learning_progression.sql` 제거; `202607300000_daily_pet_loop.sql` + 필요 시 **새** `202607300004_*.sql` 만 허용
- [ ] Task 2 인터페이스 이름을 `DailyPetLoopPolicyV1.duplicatePromotion` / series ID로 정정
- [ ] Task 4 ADVANCED **0.055** (또는 “import from pipeline-constants”)
- [ ] Task 5를 Create 패키지가 아니라 **existing scaffold 완성**으로 재서술
- [ ] Task 3을 “이미 연결된 demo의 mock/DOM 제거”로 재서술; casual 서버 권위 범위 완화 또는 단계 분리
- [ ] Global Constraints에 **drafts 95 vs manifest 91**, **ADMITTED 3 키 목록**, 집계 명령 블록 추가
- [ ] Verification: 완료 트랙 T0–T4 분리; Task 7을 코드 완료와 동일시하지 않음
- [ ] 선행 문서 Depends-on / Supersedes: 7/30 계획 ledger → 본 계획, 7/31 리뷰 P0 반영 여부 표
- [ ] research 수정 범위: 파이프라인 참고 정확도 only; 시즌 게이트 비기재

---

## 6. 최종 권고

| 우선순위 | 행동 | 기대 효과 | 위험 |
|---|---|---|---|
| **즉시(문서)** | Task 5 BEST-record 문구 수정 | 규범 회귀 차단 | 없음 |
| **즉시(문서)** | Task 2 migration 타깃 수정 | progression 스키마 파괴 방지 | 없음 |
| **즉시(문서)** | radius 0.055 정정 | 콘텐츠 파이프 오설정 방지 | 없음 |
| P0 | Task 1 inventory snapshot | 에이전트 오판(79 vs 91) 제거 | 낮음 |
| P0 | Task 2 ADR series 병기 + 테스트 | 경제 불변식 충돌 해소 | 중(제품 결정) |
| P1 | Task 3 Phase A 마무리 | 실제 플레이 루프 | 낮음~중 |
| P1 | Task 4 Ladder Batch-1 (사람 병렬) | 시즌 게이트 해제의 필요조건 | 콘텐츠/리뷰 병목 |
| P2 | Task 5–6 실 adapter + pin | ranked 경쟁 가능 골격 | 중(인증·DB) |
| P3 | Task 7 외부 evidence | production 주장 가능 | 외부 의존 — 코드 PR과 분리 |
| 하지 말 것 | first-completed best, 사다리 없는 ranked, 003 덮어쓰기, research를 시즌 SSOT로 승격, dirty tree 강제 정리 | — | 제품/데이터 사고 |

**한 줄 결론:**  
이 계획은 저장소 “남은 일”을 올바른 큰 순서로 묶었고, 선행 리뷰의 핵심(콘텐츠 게이트·fail-closed·로컬≠프로덕션)을 계승한다.  
구현 전에 **BEST-record 문구, migration 타깃, radius 상수, 이미 존재하는 서버 스캐폴드 인식** 네 가지만 고치면 P0부터 안전하게 착수할 수 있다.  
고치지 않고 실행하면, 이미 맞는 DB·계약을 에이전트가 다시 부러뜨릴 확률이 높다.

---

## 7. 검증에 사용한 핵심 앵커

- `content/learning/catalog.v1.json` — 91 DRAFT entries  
- `content/learning/manifest.v1.json` — publishBlocked 91, ADMITTED 3  
- `tools/content/pipeline-constants.js` — RADIUS ADVANCED 0.055, PIXEL_THRESHOLD 75  
- `research.md` — NON-NORMATIVE, 79 snapshot, radius 0.055  
- `docs/decisions/ADR-004-pet-economy.md` — five-copy fusion  
- `config/daily-pet-loop.v1.json` / `packages/contracts/src/daily-pet-loop.ts` — 11/10 promotion  
- `supabase/migrations/202607300000_daily_pet_loop.sql` — `promote_duplicate_cards_v1`  
- `supabase/migrations/202607300002_learning_competition.sql` — start/attest/commit/create_weekly_season  
- `supabase/migrations/202607300003_learning_progression.sql` — progression ledger (이미 존재)  
- `packages/learning-competition/src/attempt-session.ts` — `BEST_COMPLETED_VERIFIED`  
- `apps/server/package.json`, `apps/server/src/learning/*` — scaffold + stubs  
- `apps/mobile/src/learning-demo/LearningDemoScreen.tsx`, `HintPanel.tsx` — partial Phase A  
- `docs/release-evidence-blockers.md`, `docs/04-Roadmap/12_IMPLEMENTATION_ROADMAP.md`  
- `docs/reviews/2026-07-31-adaptive-hints-pet-progression-weekly-ranking-plan-codebase-review.md`  

---

*본 리뷰는 구현 패치를 포함하지 않는다. 계획 문구 수정 후 Task 1~3부터 착수하는 것을 권고한다.*
