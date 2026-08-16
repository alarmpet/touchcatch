# Adaptive Hints · Pet Progression · Weekly Ranking 설계/구현계획 리뷰

| 항목 | 내용 |
|:---|:---|
| **작성일** | 2026-07-30 |
| **대상 설계** | `D:\touchcatch\docs\superpowers\specs\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-design.md` |
| **대상 계획** | `D:\touchcatch\docs\superpowers\plans\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan.md` |
| **보조 문서** | `D:\touchcatch\research.md`, `docs/decisions/ADR-004-pet-economy.md`, `docs/01-GameDesign/05_PET_COLLECTION_SYSTEM.md`, `docs/02-Architecture/08_DATABASE_SCHEMA.md`, `docs/04-Roadmap/12_IMPLEMENTATION_ROADMAP.md` |
| **검토 범위** | 위 문서 + `content/learning/**`, `packages/contracts`, `packages/content-validator`, `packages/game-engine`, `apps/mobile`, `apps/server`, `supabase/migrations`, `.github/workflows/ci.yml` |
| **판정** | **제품 원칙(공정 랭킹 · 서버 권위 · 저작 힌트 · fail-closed 경제)은 강하고 채택해야 한다.** 다만 현재 코드베이스·콘텐츠 재고·로드맵 대비 **한 번에 세 루프를 11 Task로 묶은 계획이 과대**하며, **주간 시즌을 열 수 있는 콘텐츠/인프라 전제조건이 문서에 잠기지 않았다.** 아래 P0를 닫기 전에는 Task 4 이후(저장·시도·정산) 착수를 권하지 않는다. |

---

## 1. 한 줄 요약

설계는 Kahoot/Quizizz/Apple/Duolingo 연구 요약을 **정확성·힌트·오답 우선, 속도 보조, 첫 공식 시도 고정, 고정 주간 세트**로 잘 번역했다.  
문제는 **그 원칙을 실행할 데이터·서버·경제·콘텐츠 파이프라인이 아직 분리된 섬**이라는 점이다. `research.md`는 이미지·visual-delta 파이프라인 연구이지, 본 기능의 근거 문서가 아니다.

| 문서 주장 | 코드/콘텐츠 현실 (2026-07-30 스냅샷) |
|:---|:---|
| 주간 카테고리별 고정 5챌린지 (`ENGLISH`/`PROVERB`/`IDIOM`/`GENERAL_KNOWLEDGE`) | catalog 실측: **ENGLISH 71 · PROVERB 5 · IDIOM 4 · GENERAL_KNOWLEDGE 1** → IDIOM/GENERAL_KNOWLEDGE는 **5핀 불가** |
| 카테고리별 5단 힌트 사다리 입수(`HintStepV1`) | 기존 계약은 `finalChallenge.hintUnits`(정답 grapheme 분할)만 존재. **5단 교육 사다리 필드 없음** |
| `content/learning` 학습 팩이 주간 콘텐츠 공급원 | 구현 계획은 `packages/contracts` + `content/fixtures` + validator 중심. **learning catalog/drafts/manifest 연동 Task 부재** |
| `apps/server` 학습 attempt runtime | `apps/server/` **빈 디렉터리**. 권위 쓰기는 현재 DB 함수·계약·테스트 중심 |
| `RARE_ONLY_TICKET_V1` 주간 챔피언 보상 | 경제는 `gacha_points` + `draw_pet_v1` 직뽑기. **티켓/entitlement 테이블·스코프 없음** |
| pet `coachArchetype` | `pet-catalog.ts`는 `petId`/`rarity`/`displayKey`만. **코치 원형 필드 없음** |
| `learning-progression-v1` 후보 정책 | ADR-004: 프로덕션 reward schedule **미승인**, fail-closed. 방향은 일치하나 **승인 경로·ledger 키 설계 미완** |
| `research.md` 검증 완료 56팩 | catalog **81**, manifest/drafts는 별도 드리프트(기존 리뷰와 동일 계열). **숫자·역할 모두 구식** |

---

## 2. 잘된 점 (유지·강화 권고)

### 2.1 제품 원칙

1. **랭킹에서 펫 효과 cosmetic-only** — pay-to-win 차단. 스토어·커뮤니티 리스크를 정확히 짚음.
2. **공식 = 첫 검증 완료 시도 / 연습 = 개인 최고** — Apple leaderboard 가이드와 맞음.
3. **고정 주간 5문항 세트** — Duolingo식 무제한 XP 파밍을 피함.
4. **런타임 LLM 힌트 금지, 저작·입수 힌트** — 교육 품질·감사 가능성·결정론 유지.
5. **클라이언트 시계/점수/순위 불신** — 기존 match/economy 권위 모델과 철학 일치.
6. **effect-once + fencing + POLICY_MISMATCH fail-closed** — `reward_ledger` / G3 lease 패턴 연장으로 타당.
7. **접근성·닉네임 모더레이션·private 필드 누수 금지** — 결과판 설계가 구체적.
8. **후보 진행 정책 deployment-blocked** — ADR-004와 충돌하지 않음.

### 2.2 구현 계획의 강점

- 정책 JSON → schema → contracts parser → hash 입수 순서가 프로젝트 관례와 맞음.
- RED/GREEN/커밋 단위 Task, pgTAP RLS, 동시 완료 멱등, 릴리즈 게이트 지표가 명시됨.
- 점수 타이브레이크 튜플이 결정론적으로 잠겨 있음.
- Rank 2–10 보상은 MVP에서 placement만 기록 — 공급 폭주 방지 합리적.

---

## 3. 현황 실측

### 3.1 콘텐츠 카테고리 재고

`content/learning/catalog.v1.json` 기준:

| category | entries | 주간 5핀 가능? |
|:---|---:|:---|
| ENGLISH | 71 | 가능 (품질 게이트 필요) |
| PROVERB | 5 | 경계선 (전원 게시·힌트 완료 시만) |
| IDIOM | 4 | **불가 (1개 부족)** |
| GENERAL_KNOWLEDGE | 1 | **불가** |
| **합계** | **81** | 시즌 오픈 조건 미충족 |

설계는 시즌 오픈 전 “empty/invalid set 거부”를 말하지만, **콘텐츠 생산 계획이 구현 11 Task에 없음**. 코드만 완성해도 시즌을 열 수 없다.

### 3.2 힌트 계약 이중성

| 계층 | 현재 | 설계 목표 |
|:---|:---|:---|
| `finalChallenge.hintUnits` | 정답 grapheme 배열, concat == canonical | 답 분할 단위 |
| `HintStepV1` (신규) | 없음 | 5단 교육 사다리 (의미·예문·초성·일부 공개…) |
| learning draft | public 이미지 + private differences/wordHunts/finalChallenge | 카테고리별 사다리 텍스트·region·ELIMINATE_OPTION |
| visual-delta 파이프라인 (`research.md`) | A/B 픽셀·geometry | 힌트 저작과 무관 |

즉 **기존 hintUnits를 확장한다고 사다리가 생기지 않는다.** 별도 필드·입수 규칙·저작 도구가 필요하다.

### 3.3 서버·경제·앱 표면

- `apps/server/`: 패키지 골격 없음. 계획 Task 5가 사실상 **신규 앱 스캐폴딩**이다.
- Economy: `award_match_reward_v1(match_id, …)` 중심. learning은 `attempt_id` 기반 ledger가 필요하며 **match_id NOT NULL 가정과 충돌 가능**.
- Draw: 포인트 차감 직뽑기만 존재. **미사용 티켓 인벤토리·소모 draw** 는 새 스코프(`TICKET_DRAW_V1` 등).
- Mobile: `learning-demo`는 FIND→QUIZ 로컬 리듀서. 힌트/랭킹/펫 코치 없음. `BattleScreen`은 배틀 셸. Task 9가 둘을 섞으면 **모드 경계 붕괴** 위험.
- CI: `pnpm check` + `check:db`만. `learning:competition:check`·10k synthetic load는 **워크플로 미반영**.
- Roadmap: G3A→…→G4(보상/펫)→G5→G6(학습 평가). 본 계획은 **G3 미완 상태에서 G4+G6 상당 기능을 동시 착수**하는 형태.

### 3.4 `research.md` 와의 관계

`research.md`는 **학습 이미지 생성·visual-delta·번들·manifest 파이프라인** 문서다.

- 힌트 사다리, 주간 랭킹, 펫 진행, 티켓 정산과 **교집합이 거의 없다.**
- 팩 수·파라미터는 이미 다른 리뷰에서 지적된 대로 **코드와 어긋난 구버전**이다.
- 본 기능 리뷰의 “연구 근거”로 쓰기보다, **콘텐츠 공급 파이프라인이 힌트 필드를 아직 모름**을 보여주는 증거로만 써야 한다.

---

## 4. 문제점 (P0 → P2)

### P0-1. 주간 시즌 콘텐츠 재고 부족 (시즌 오픈 불가)

**사실:** IDIOM 4, GENERAL_KNOWLEDGE 1. 설계의 “카테고리당 정확히 5 pinned revision”을 만족 못 함.

**권고:**

1. 설계/계획에 **Content Readiness Gate**를 명시:
   - 카테고리별 `PUBLISHED` + education/rights 승인 + 유효 5단 사다리 ≥ 5.
2. MVP 카테고리 축소 옵션을 문서에 고정:
   - **옵션 A (권장):** MVP는 `ENGLISH` + `PROVERB`만 주간 보드. IDIOM/GK는 콘텐츠 충족 후 시즌 타입에 추가.
   - **옵션 B:** 4카테고리 유지 시, 구현 Task 0으로 “카테고리 팩 보충 + 힌트 저작”을 먼저 완료.
3. 시즌 오픈 함수는 readiness 미달 시 `SEASON_CONTENT_INSUFFICIENT`로 fail-closed (설계 Failure behavior와 연결).

### P0-2. 학습 콘텐츠 파이프라인과 계약 경로 단절

**사실:** 실제 플레이 가능 콘텐츠는 `content/learning/{catalog,drafts,geometry,evidence,manifest}` 이다. 계획 Task 2는 `content/fixtures`·`game-content` schema 중심이다.

**권고:**

1. Task 2를 둘로 나누거나 확장:
   - **2a** 공통 `HintStepV1` 계약 + grapheme 규칙 (packages).
   - **2b** `content/learning` draft schema · catalog optional `hintLadder` · `validate-learning-draft` · `write-learning-bundle` · manifest 게이트.
2. `research.md` / `10_CONTENT_AND_IMAGE_PIPELINE.md`에 힌트 입수 단계 추가 (이미지 파이프라인 다음 **교육 사다리 입수**).
3. “힌트 없는 팩”은 캐주얼 데모는 가능, **랭크 핀 후보에서 제외**.

### P0-3. 경제 티켓·러닝 보상 ledger가 기존 스키마와 미접합

**사실:**

- `reward_ledger` / `award_match_reward_v1`은 match 단위.
- 티켓 entitlement, `RARE_ONLY_TICKET_V1` draw, pity 비변이 테스트 요구는 있으나 **스키마 초안이 계획에 SQL 컬럼 수준으로만 암시**됨.
- ADR-004는 미승인 reward를 금지 — 좋지만 **티켓이 draw_cost/gacha_points와 어떻게 병행되는지** 불명.

**권고:**

1. 경제 확장용 짧은 ADR 초안을 Task 7–8 전에 추가:
   - `LEARNING_PROGRESSION_V1` reward types (accountXp / petXp / drawPoints).
   - `TICKET_INVENTORY_V1` + `consume_ticket_draw_v1` (pity sources = `DIRECT_DRAW` only 유지).
   - ledger unique key: `(subject_key, source_type, source_id, reward_type)` where source_type ∈ `MATCH` \| `LEARNING_ATTEMPT` \| `WEEKLY_SETTLEMENT`.
2. account XP는 `profiles.exp`와 **동일 컬럼인지 / 별도 learning XP인지** 한 줄로 결정. 침묵 시 이중 레벨 UI가 생김.
3. drawPoints는 기존 `gacha_points`에 적립하는 것이 기본안(추가 재화 폭발 방지). 문서에 명시.

### P0-4. 로드맵·의존성 무시로 인한 “큰 바이트 한 번에”

**사실:** G3A 엔진/리플레이, G3B 인증 실시간, G4 펫 런타임이 완료 증거 전에 본 계획이 서버·DB·모바일·정산·부하 10k를 요구.

**권고: 3-Phase 분할 (아래 §5).**  
한 문서에 세 루프 비전을 유지하되, **구현 계획 체크박스는 Phase 단위로 재구성**한다. 그렇지 않으면 Task 11 E2E가 영원히 RED다.

### P0-5. 공식 시도 수명·실패 UX가 제품 리스크

**사실:** “실패한 ranked upload는 클라이언트 요약으로 복구 불가 → 새 공식 시도”. 설계는 first **completed** verified를 공식으로 하므로, 시작만 하고 미완료면 공식 슬롯은 비어 있어야 한다. 계획 문구(“second official session after one verified completion”)는 맞지만,

- 장시간 열린 세션 / 다중 동시 start / 완료 직전 네트워크 실패 시 **유저가 공식 기회를 잃었다고 느끼는 UX**가 미정의.
- “must retry a new official attempt” 문장은 **완료 실패 시 재시도 가능**으로 읽히나, 일부 구현은 start 멱등 키를 잘못 잡으면 잠글 수 있음.

**권고:**

1. 상태 머신 명시: `OPEN → COMPLETED_VERIFIED | ABANDONED | EXPIRED | QUARANTINED`.
2. `OPEN`은 공식 슬롯을 점유하지 않음(또는 soft hold + TTL 후 자동 ABANDON).
3. 동일 세션 complete 재시도는 idempotency로 복구; **새 start는 OPEN이 없을 때만**.
4. UI 카피: “공식 기록은 서버 검증 완료 시에만 확정됩니다. 연결 실패 시 같은 도전을 이어서 제출할 수 있습니다.”

---

### P1-1. 힌트·펫 코치 경제가 모호

설계:

- 캐주얼: 펫 코치 차시 3회, 1차시 = 사다리 1스텝.
- 랭크: 동일 힌트 UI·페널티, 펫 효과 cosmetic.

불명확한 점:

1. 캐주얼에서 **펫 없이 / 차시 소진 후** 힌트를 쓸 수 있는가?
2. 코치 차시가 힌트를 “무료 페널티 0”으로 만드는가, 아니면 단순 연출인가? (캐주얼은 점수 무관이므로 진행 보상 `noHint`와의 관계만 중요)
3. `noHint` 보너스는 코치 사용 시 제외인가?

**권고 (권장 기본값):**

- 캐주얼 힌트 버튼은 항상 사용 가능(학습 우선). 펫 코치는 **같은 스텝에 부가 연출/승인된 추가 문장**이며, 차시 3은 “강화 코치” 한도.
- 또는 코치 차시 = 힌트 스텝 공개 수단으로 단순화하되, 차시 소진 후에도 **약한 공통 힌트**는 남김.
- `noHint` = `hintStepsUsed == 0` (코치 포함). 문서에 한 줄 고정.

### P1-2. 점수식 시간 압축

```ts
timePenalty = min(30_000, floor(completionMs / 3))
```

90초 이후 시간 항이 포화된다. 연구 취지(속도 단독 우승 방지)에는 맞지만, **상위권 동점 시 시간 변별이 사라짐** → 이후 타이브레이크에 과도 의존.

**권고:** 현 식 유지 가능. 다만 타이브레이크 6–7항(`accepted_at`, `attempt_id`)이 주간 챔피언을 가를 수 있음을 운영 문서에 적고, 시뮬레이션(Task 10의 10k)에서 **동점 분포**를 증거로 남길 것. 필요 시 soft cap 대신 `log` 감쇠 후보를 DRAFT 정책 필드로만 준비.

### P1-3. `displayScore` vs 학습 목표 불일치 가능

차이점 오탭 −3000, 최종답 오답 −10000, 힌트 −15000.  
힌트 1회가 오탭 5회보다 비싸다. 학습 루프에서는 힌트 사용을 과도하게 처벌하면 **힌트 기피 → 좌절**이 생길 수 있다(스토어 리뷰가 강제 힌트/오탐을 싫어한다는 연구와 별개로, **처벌형 힌트**도 불만 요인).

**권고:**

- 랭크 페널티는 유지하되, 결과 UI에 “힌트 전 예상 점수 영향”을 확인 모달로 보여 줌(계획 Task 9에 이미 유사 문구 — 유지).
- 캐주얼 진행 보상의 `noHint`는 소액 유지(현재 10/5) — 동의.
- A/B 없이 페널티 상수를 코드 매직넘버로 박지 말고 **hint-policy JSON**에만 둘 것(계획은 있음, 엔진 hardcode 금지 재확인).

### P1-4. Visual 사다리 step 5 = exact hit circle

전 플레이어 동일하면 공정성은 유지. 다만:

- 명령 로그/분석에 hit circle이 남으면 private solution 누수.
- 모바일 접근성 “텍스트 방향 + non-flashing”은 좋음.

**권고:** step 5 public descriptor는 attempt projection ephemeral; analytics/leaderboard/outbox payload 스키마에서 **좌표 필드 reject** (Task 10과 연결, 계약 테스트 필수).

### P1-5. 펫 카탈로그·아키타입 부재

`coachArchetype` 4종은 콘텐츠/카탈로그 리비전 필드가 필요하다.  
RARE_ONLY 티켓은 “pinned active RARE set” — 카탈로그 generation/activation 가드와 동일 패턴.

**권고:** Task 1 또는 7 전에 `pet-catalog` 스키마 확장 Task를 명시. 아키타입 미할당 펫은 `CHEER` 기본값 + 입수 경고.

### P1-6. 모바일 통합 표면 오류 위험

Task 9가 `BattleScreen`을 수정하고 `features/learning/*`를 추가한다.  
현재 학습 데모는 `LearningDemoScreen` + registry.

**권고:**

- 캐주얼 학습 UX는 `learning-demo` → `features/learning` 승격.
- 배틀 모드와 공유할 것은 `HintPanel` 등 **순수 컴포넌트만**.
- 랭크 모드는 온라인 세션 가드 없이 BattleShell에 넣지 말 것.

### P1-7. 주간 핀·시즌 운영 워크플로 공백

계획에 settlement runbook은 있으나 **누가 매주 5×N revision을 고르고 승인·게시하는지** Admin UI/CLI가 없다.

**권고:** Task 4에 `tools/pin-weekly-challenges.ts` (또는 admin API) + 체크섬 출력 + dry-run. 수동 SQL 핀 금지.

### P1-8. CI / 워크플로

`learning:competition:check`와 10k synthetic은 로컬 장시간 작업이 되기 쉽다.

**권고:**

- PR CI: 단위·계약·소규모 동시성(20)만.
- Nightly/manual: 10k + settlement 100 concurrent.
- `ci.yml`에 새 잡 추가를 Task 10에 명시(계획에 파일 목록 누락).

### P1-9. GENERAL_KNOWLEDGE / ELIMINATE_OPTION 전제

사다리 step 3·5가 오답 제거인데, 옵션 집합·오답 ID 저작 규칙이 카탈로그 meaning.options(3지선다)와 어떻게 매핑되는지 없음.  
step 3에서 정답을 제거하면 입수 단계에서 잡아야 함.

**권고:** `validateHintLadder`에 `ELIMINATE_OPTION` ∈ wrong options only, 중복 제거 금지, 최종 1개 이상 오답 잔존.

### P1-10. Intl.Segmenter 런타임

서버(Node 24 CI)는 가능. RN/Hermes 버전별 Segmenter 지원은 별도 검증 필요.  
**권고:** 세그멘테이션은 **입수·서버 권위 경로만** 사용. 클라이언트는 서버가 준 public pattern 문자열만 표시(계획과 일치하도록 명시).

---

### P2-1. 연구 링크·범위 과다

설계 Research findings는 방향 설정에 유용하나 구현 수용 기준은 아님. 링크 장애 시 문서 신뢰도만 깎임.  
**권고:** “비규범 참고” 절로 격하, 규범은 Acceptance criteria만.

### P2-2. 글로벌 올타임 보드 제외는 유지

동의. 주간 고정 세트가 학습·공정성에 더 맞음.

### P2-3. Rank 2–10 보상 나중 정책

동의. 다만 public 카피에 “지금은 1위만 희귀 티켓”을 시즌 약관에 고정(오해 방지).

### P2-4. `research.md` 정합

별도 작업으로 팩 수·auto-detect 파라미터를 코드 SSOT에 맞출 것. 본 기능 착수 차단 사유는 아니나, **에이전트가 research를 진실로 오해**하지 않게 헤더에 “콘텐츠 파이프라인 전용 / 랭킹 비범위”를 달 것.

---

## 5. 더 나은 방향 (권장 재구성)

### 5.1 세 루프를 한 비전 문서 + 세 구현 트랙으로

| Phase | 목표 | 의존 | 완료 정의 |
|:---|:---|:---|:---|
| **A. Adaptive Hints** | `HintStepV1` 입수 + hint-engine + 캐주얼 모바일 힌트 | content/learning 파이프라인, 기존 demo | 카테고리 샘플 N팩 사다리 플레이, 조기 전면 공개 0건 |
| **B. Progression** | account/pet XP + drawPoints, 펫 코치 연출 | A, ADR-004 후보, economy ledger 확장 | 일일 캡·멱등·DRAFT fail-closed 증명 |
| **C. Weekly Ranking** | attempt verify, board, season pin, champion ticket | A+B, 인증 서버 경로, 카테고리 readiness | 1시즌 합성 E2E, exact-once ticket, pity 불변 |

설계 문서 Status를 `Proposed` 유지하되, 구현 계획은 **Phase A만 상세 Task**, B/C는 인터페이스 계약만 먼저 고정하는 편이 실패 비용이 적다.

### 5.2 MVP 제품 범위 제안

1. **주간 보드:** ENGLISH(+ 가능 시 PROVERB)만.
2. **보상:** 진행 포인트 + 1위 RARE ticket (현 설계 유지).
3. **펫:** 캐주얼 코치 1종(`CHEER` 또는 `SCOUT`)부터; 4 아키타입은 카탈로그 채워진 뒤.
4. **힌트:** 전 랭크 공통 5단; 시각 step 1–2는 캐주얼 우선, 랭크는 step 3+부터 써도 됨(선택).

### 5.3 콘텐츠 선행 작업 (코드 전)

1. IDIOM·GENERAL_KNOWLEDGE 팩 보충 **또는** MVP 카테고리 축소 결정 기록.
2. 힌트 저작 가이드(카테고리별 예시 1세트) + 배치 검증 스크립트.
3. 주간 핀용 “난이도 혼합 5” 선정 규칙(너무 쉬운 5개 방지).

### 5.4 서버 배치

빈 `apps/server`를 바로 비대하게 키우기보다:

1. **순수 로직**은 `packages/game-engine` / `packages/learning-competition`(신규)에 두고 테스트.
2. HTTP 어댑터는 기존 admin/server 패턴 또는 최소 `apps/server` thin layer.
3. DB 함수 `commit_learning_attempt_v1` 등 private 권위 쓰기는 현 economy/match와 동일 보안 모델.

### 5.5 점수·학습 균형 한 줄 정책

> 랭크 점수는 **정답 품질(힌트·오답) > 시간** 순으로 벌점하고, 학습 캐주얼은 **힌트 사용을 수치 처벌하지 않고** `noHint` 소액 보너스만 준다.

설계 정신은 이미 이에 가깝다. 캐주얼/랭크 보상 문장만 분리해 적으면 구현 논쟁이 줄어든다.

### 5.6 공식 시도 상태 머신 (권장 그림)

```text
startRanked  → OPEN (not on board)
complete OK  → VERIFIED → official row (unique first)
complete bad → QUARANTINED (no reward, no board)
TTL / quit   → ABANDONED (slot free)
practice     → personal_best only
```

### 5.7 문서 수정 체크리스트 (설계·계획에 반영할 항목)

- [ ] MVP 주간 카테고리 목록 + readiness 수치
- [ ] `HintStepV1` vs `hintUnits` 관계 다이어그램
- [ ] learning 파이프라인 연동 Task
- [ ] economy ledger/ticket ADR 포인터
- [ ] account XP ↔ `profiles.exp` 결정
- [ ] 코치 차시 vs 힌트 버튼 vs `noHint` 정의
- [ ] OPEN 세션 TTL / 동시 start 규칙
- [ ] 시즌 핀 운영 도구
- [ ] CI vs nightly 부하 게이트
- [ ] Roadmap gate 매핑 (A→G3A/G3C, B→G4, C→G4/G6)
- [ ] `research.md` 범위 한계 문구

---

## 6. 계획 Task별 조정 메모

| Task | 평가 | 조정 |
|:---|:---|:---|
| 1 Policy freeze | 좋음 | DRAFT 필수. ranked pet cosmetic invariant 테스트 유지 |
| 2 Hint ladders | **경로 수정 필요** | fixtures만이 아니라 `content/learning` 입수 |
| 3 Hint engine | 좋음 | pure package 우선; socket/match 결합은 최소화 |
| 4 DB storage | Phase C | readiness·OPEN 상태 컬럼 포함 |
| 5 Attempt runtime | Phase C | thin server + package 로직; 앱 스캐폴딩 범위 명시 |
| 6 Leaderboard | Phase C | snapshot isolation 테스트 유지 |
| 7 Progression | Phase B | ledger 키·gacha_points 적립 명시, ADR-004 갱신 |
| 8 Settlement | Phase C | 티켓 스키마 선행; pity 바이트 동등 테스트 유지 |
| 9 Mobile UX | Phase A 일부 + C | learning surface와 battle 분리 |
| 10 Analytics/gates | 각 Phase 말미 | 10k는 nightly |
| 11 E2E season | Phase C only | Phase A/B는 각각 작은 acceptance |

---

## 7. 수용 기준 보완 제안

설계 Acceptance에 추가 권고:

1. **시즌 오픈 전** 카테고리별 pinned 5가 모두 `hintLadder` 입수 통과.
2. **OPEN** 시도만으로 official unique 제약에 걸리지 않음.
3. learning 보상 재시도 시 ledger row 수 불변, `gacha_points` 델타 불변.
4. rare ticket draw 전후 `gacha_pity_state` 행 바이트 동일.
5. leaderboard API 응답 JSON 스키마에 `subject_key`/`user_id`/`email`/좌표 키 0건.
6. 캐주얼 오프라인 완료가 ranked 테이블 insert 0건.

---

## 8. 최종 판정

| 영역 | 판정 |
|:---|:---|
| 제품 원칙·공정성·보안 철학 | **채택** |
| 힌트 사다리 교육 설계 | **채택** (저작 비용·파이프라인 연결 필요) |
| 진행 보상 수치 후보 | **DRAFT 유지·시뮬레이션 후 승인** (수치 자체 반대 아님) |
| 주간 랭킹 + 챔피언 티켓 | **Phase C로 이연**, readiness·경제 ADR 선행 |
| 현재 11-Task 단일 구현 계획 | **재분할 필요** — 이대로 agent 실행 시 콘텐츠/경제/서버 공백에서 장기 표류 |
| research.md 정합 | **본 기능 SSOT 아님** — 파이프라인 한계 증거로만 사용 |

**한 줄 결론:**  
원칙은 프로덕션 방향으로 옳다. **먼저 Phase A(힌트+학습 파이프라인)와 콘텐츠 readiness를 닫고**, 경제 티켓/ledger ADR을 고정한 뒤, **주간 랭킹·정산은 별도 게이트로 구현**하는 것이 이 코드베이스에서 성공 확률이 높다.

---

## 9. 문서 경로

| 구분 | 전체 경로 |
|:---|:---|
| **본 리뷰** | `D:\touchcatch\docs\reviews\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-review.md` |
| 설계 | `D:\touchcatch\docs\superpowers\specs\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-design.md` |
| 구현 계획 | `D:\touchcatch\docs\superpowers\plans\2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan.md` |
| 연구(콘텐츠 파이프라인) | `D:\touchcatch\research.md` |
