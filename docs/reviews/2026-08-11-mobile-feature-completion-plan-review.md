# Review: Mobile Learning, Pet, Ranking, and Game Modes Implementation Plan

| 항목 | 내용 |
|:---|:---|
| **작성일** | 2026-08-11 |
| **대상 계획** | `D:\touchcatch\docs\superpowers\plans\2026-08-11-mobile-feature-completion-plan.md` |
| **연구 문서** | `D:\touchcatch\research.md` (비규범 / 콘텐츠 파이프라인 참고) |
| **선행 계획** | `docs/superpowers/plans/2026-08-10-feature-readiness-audit-and-improvement-plan.md` (리뷰 반영 개정본) |
| **선행 리뷰** | `docs/reviews/2026-08-10-feature-readiness-audit-and-improvement-plan-review.md` |
| **연관 계획** | `docs/superpowers/plans/2026-07-19-supabase-auth-integration-plan.md`, `docs/superpowers/plans/2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan.md` |
| **검토 범위** | 대상 계획 + `research.md` + `apps/mobile/**` + `apps/server/src/{learning,pets}` + `packages/{contracts,game-engine,learning-competition}` + `config/*` + `content/learning/**` + `tools/content/**` + `.github/workflows/ci.yml` + `docs/release-evidence-blockers.md` |
| **검증 방법** | 계획 전항을 코드·SSOT·08-10 보안 경계 계획과 교차 대조. (본 리뷰는 구현 패치를 포함하지 않음.) |
| **판정** | **부분 채택 · 구현 전 대폭 수정 필수.** 홈 네비·답 입력 UX·Android smoke 자체는 제품에 필요하다. 그러나 이 계획은 **DEV 로컬 레지스트리 위에 홈/펫/랭킹/자유입력 모드를 얹는 데모 확장**에 가깝고, 08-10이 막은 **private 번들 격리·서버 권위 판정·DRAFT fail-closed** 와 정면으로 충돌한다. 그대로 실행하면 Approach B(데모 UI 우선) 회귀가 된다. |

---

## 0. 총평 (Executive Summary)

이 문서는 “Android에서 데모가 돌아간다 → 홈·펫·랭킹·철자/초성/속담 모드까지 제품처럼 보이게” 하는 **모바일 UX 완성 계획**이다. Task 단위가 짧고 인터페이스/테스트 체크박스가 있어 에이전트 실행 형식은 좋다.

문제는 **제품 정의가 08-10 readiness 계획과 반대 방향**이라는 점이다.

| # | 심각도 | 요약 |
|---|---|---|
| 1 | **치명** | Task 1 `HomeScreen`이 `LearningDemoEntry[]`를 소비한다. 이 타입/레지스트리에는 `correctOptionId`, 차이 좌표, `privateSolutionHash`, `canonicalAnswer`가 포함된다. product home이 demo registry에 묶이면 **F-001 private 번들 누출이 구조적으로 고착**된다. |
| 2 | **치명** | Task 2 answer engine이 클라이언트에서 `isCorrect`를 계산한다. production 권위 판정(서버 intent)과 충돌. “canonical을 UI props에 넣지 말자”만으로는 부족하고, **정답 자체 클라이언트를 떠나는 순간 우회 가능**하다. |
| 3 | **치명** | Task 4가 펫 보상을 `LearningDemoScreen` + 로컬 `pet-reward-controller`에 연결한다. `daily-pet-loop`/`learning-progression`/`economy`는 전부 **DRAFT**이며 서버 pure 로직은 “DB transaction + auth subject”를 전제로 한다. 클라이언트 보상 전이는 **가짜 경제**를 제품 UX로 오인시킨다. |
| 4 | **높음** | `AnswerMode = … \| 'IDIOM' \| 'PROVERB'` 는 **카테고리와 입력 모드를 혼동**한다. SSOT 카테고리는 `ENGLISH \| PROVERB \| IDIOM \| GENERAL_KNOWLEDGE`이고, 입력은 MCQ/자유입력/힌트 종류(`INITIAL_PATTERN` 등)다. |
| 5 | **높음** | 정규화·최종답 판정 SSOT가 이미 있다 (`packages/contracts/src/answer-normalization.ts`의 `normalizeFinalAnswer`, game-engine `SUBMIT_FINAL_ANSWER`). 모바일 전용 엔진 신설은 **이중 구현** 위험이 크다. |
| 6 | **높음** | 랭킹 Task 5가 새 `RankingRow`/`ranking-client`를 만들지만 기존 `WeeklyCategoryBoard`, learning-competition, weekly policy(`ENGLISH`+`PROVERB` only, IDIOM disabled)와 정합 서술이 없다. **BEST_COMPLETED_VERIFIED** 미언급. |
| 7 | **높음** | 인증·서버 HTTP·preview 격리 Task가 **전무**하다. 08-10 Task 2/5a/5b 없이 펫/랭킹 “production server responses”를 약속하면 mock이 고착된다. |
| 8 | **중간** | Task 3 “mode metadata를 manifest에 추가”는 계약/catalog schema 변경 없이 registry 생성기를 건드린다. **schema-first / generator SSOT** 위반 위험. |
| 9 | **중간** | research.md inventory(91)와 현재 79 불일치, `__DEV__` 안전 과신 — 계획이 research 한계를 인용하지 않음. |
| 10 | **중간** | Task 6 `@expo/ui` autolinking 검증 — mobile `package.json`에 `@expo/ui` 의존성 없음. 잘못된 성공 기준. |
| 11 | **중간** | “모든 feature에 Android smoke” — CI mobile job은 Linux web export만 수행. Android smoke는 **로컬/외부 evidence**로 분리해야 한다. |
| 12 | **개선** | Task 6/7이 선행 **리뷰 문서**를 수정 대상으로 삼는다. 리뷰는 불변 감사 기록으로 두고, 수용 보고서는 별도 파일만 갱신하라. |
| 13 | **개선** | Goal의 “usable mobile product”를 `LOCAL_DEMO_ONLY` / `SERVER_SLICE_CASUAL` / `REWARD_READY` 상태와 매핑하지 않아 완료 오판 가능. |

**한 줄 결론:**  
이 계획은 **preview/demo UX 백로그**로는 쓸 수 있으나, **product completion plan으로는 채택 불가**에 가깝다. 08-10 Plan A(private 격리 + CI-min + 서버 권위 캐주얼 1판) 뒤에 **Mobile UX Plan**으로 재배치하고, 펫/랭킹은 서버 receipt 이후에만 붙여야 한다.

---

## 1. 계획 주장 × 코드/SSOT 교차 검증 (2026-08-11)

| 계획 주장/가정 | 검증 | 근거 |
|---|---|---|
| Android-verified learning demo를 제품으로 확장 | ⚠️ | 현재 entry는 DEV demo + registry private 데이터. 제품 확장 전 **격리**가 선결 |
| Home이 `LearningDemoEntry[]` 소비 | ❌ 위험 | `LearningDemoEntry`에 `correctOptionId`, differences 좌표, (registry 경로상) private hash/answer 포함 |
| product routes `/`, `/game/*`, `/pets`, `/ranking` | ✅ 방향 | 현재 `app/`는 `_layout.tsx` + `index.tsx`만 존재 — 네비 추가는 필요 |
| 클라이언트 answer mode 엔진 | ⚠️ | MCQ만 demo controller에 존재; free text/final answer는 engine에만 있음 |
| `AnswerMode`에 IDIOM/PROVERB | ❌ | 카테고리 필드와 충돌; 주간 정책에서 IDIOM ranked disabled |
| 정규화 신규 구현 | ⚠️ 중복 | `normalizeFinalAnswer` 이미 contracts에 존재 (NFKC, trim, space, lower) |
| 힌트 실제 텍스트 렌더 | ✅ 필요 | `LearningDemoScreen`은 `currentHintText` 계산 후 미렌더; `HintPanel` 미연결 |
| 펫 claim/idempotent | ⚠️ | UI 스텁만 존재; 서버 `claimEffectOnce` + KST date pure 로직 존재, HTTP/auth 없음 |
| 일일 1회 / 승급 11장 | ✅ 규범 존재 | `daily-pet-loop` + server pets; status **DRAFT** |
| 랭킹 production-safe | ⚠️ 부분 | 클라이언트 boundary 테스트만 확장 예정; 서버 leaderboard adapter/SQL은 별 트랙 |
| admitted + 5-step + 64-hex hash만 ranked | ✅ | manifest/registry admission 규칙과 일치 |
| 콘텐츠 mode별 admitted fixture ≥1 | ❌ 현재 불가에 가까움 | ADMITTED 3개: EN 1 / PROVERB 1 / IDIOM 1. “SPELLING/INITIALS 전용 admitted” 없음 |
| UTF-8 registry 검사 | ✅ 유용 | research/파이프라인과 정합; 다만 inventory 구식 문제와 별개 |
| `@expo/ui` autolink | ❌ | mobile dependencies에 없음 |
| D:\tcbuild 짧은 경로 빌드 | ⚠️ 운영 메모 | 저장소 스크립트/문서 SSOT 아님; runbook으로 분리 가능 |
| demo와 production 보상 분리 | ❌ 자기모순 | Self-review는 분리 주장, Task 4는 demo 화면에 보상 연결 |
| CI/release gates | ⚠️ | typecheck/content/unit/web은 가능; Android smoke는 CI 범위 밖 |

### 1.1 현행 inventory (research 대비)

```text
research.md (2026-08-01 historical): catalog/manifest 91, drafts 95
현재 working tree: catalog/manifest 79, drafts 105, registry 79
publishBlocked: 79
ADMITTED / rankedEligible: 3
  en-resilience (ENGLISH)
  ko-proverb-seeing-is-believing (PROVERB)
  ko-idiom-turn-misfortune (IDIOM)  ← weekly ranked categories에 없음
```

research 상단 NON-NORMATIVE 배너는 유지해야 한다. 계획 Task 3이 research/registry 파이프라인을 건드릴 때 **inventory 숫자나 ranked readiness를 research에서 읽지 말 것**.

### 1.2 이미 있는 것 (재발명 금지 목록)

| 영역 | 위치 | 계획과의 관계 |
|---|---|---|
| answer normalize | `packages/contracts/src/answer-normalization.ts` | Task 2는 import/재사용 |
| final answer / meaning quiz | `packages/game-engine` reducer | 서버 권위 경로로 위임 |
| hint ladder kinds | contracts + content-validator (`INITIAL_PATTERN` 등) | 입력 모드 ≠ hint kind ≠ category |
| demo FIND→QUIZ controller | `learning-demo/controller.ts` | MCQ only; 확장 시 preview 전용 유지 |
| HintPanel / PetCoach UI | `features/learning/*` | 연결만; 로컬 권위 판정 금지 |
| DailyFreeDraw / PetCollection / ChampionStars | `features/pets/*` | props 스텁; controller는 서버 receipt 후 |
| daily draw pure | `apps/server/src/pets/daily-draw.ts` | 모바일 로컬 복제 금지 |
| WeeklyCategoryBoard | `features/leaderboard/` | RankingScreen과 통합/재사용 |
| production-boundary (소스 가드) | `learning-demo/production-boundary.test.ts` | **번들 스캔 부재** — 08-10 F-001 유지 |
| weekly policy DRAFT | `config/weekly-competition.v1.json` | rank write fail-closed |
| CI mobile job | web contracts + export only | Android smoke 비포함 |

---

## 2. 잘 잡힌 점 (유지·재배치 권고)

1. **홈 스크린 + Expo Router 라우트 분리** — 현재 단일 demo boot는 제품 구조가 아니다. 다만 데이터 소스를 public projection으로 바꿔야 한다.  
2. **힌트 텍스트 실제 렌더 + charge 1회 소모** — F-004와 일치하는 UX 수정. preview/product 모두 필요.  
3. **UTF-8/mojibake registry 검사** — 한국어 콘텐츠 파이프라인에 실용적. `tools/content` + CI content job에 두는 것이 맞다.  
4. **랭킹 UI 상태(loading/empty/stale/error/privacy nickname)** — 보드 UX로 채택 가능.  
5. **Android smoke 스크립트 + logcat FATAL 실패** — 로컬 수용 게이트로 유용. release-evidence의 physical golden과 구분할 것.  
6. **짧은 D-drive 빌드 경로** — Windows path limit 실무 제약은 타당. `docs/runbooks/`에 기록.

---

## 3. 문제점 상세와 수정 권고

### 3.1 [치명] Product 그래프에 private learning-demo를 올리지 말 것

계획 Task 1:

> `HomeScreen` consumes `LearningDemoEntry[]`

08-10 Global Constraints (개정):

> product `apps/mobile/app/**` 는 learning-demo/registry/source/drafts **0 import**

**수정:**

```text
HomeScreen / product routes
  → PublicHomeModel (server or static public catalog projection)
  → no correctOptionId, no difference circles, no canonicalAnswer

Preview-only (apps/learning-preview or DEV-only route graph)
  → LearningDemoEntry[] + private registry
```

홈 카드 “비활성 이유”는 예를 들어:

- `SERVER_UNAVAILABLE`
- `POLICY_DRAFT`
- `CONTENT_NOT_ADMITTED`
- `CATEGORY_DISABLED_FOR_RANKED`

로 표현하고, private 콘텐츠 존재 여부로 카드를 켜지 않는다.

### 3.2 [치명] 답 판정 권위를 클라이언트 엔진에 두지 말 것

Task 2의 `AnswerAttempt.isCorrect`는:

- **preview/local fixture tests** 에서만 허용  
- **product** 에서는 `SUBMIT_*` intent → server public result (`correct: boolean` projection 또는 다음 phase)만 표시  

정규화는 클라이언트가 UX용으로 미리 적용할 수 있으나, **동일 함수를 서버도 사용**해야 하고 구현체는 `normalizeFinalAnswer` 단일 SSOT.

**AnswerMode 재정의 제안:**

```ts
// 입력 표면 (UI)
type AnswerInputSurface =
  | 'MULTIPLE_CHOICE'
  | 'FREE_TEXT'          // spelling / expression
  | 'PATTERN_ASSISTED'; // initials reveal assist — still free text submit

// 콘텐츠 카테고리 (SSOT 유지)
type LearningCategory = 'ENGLISH' | 'PROVERB' | 'IDIOM' | 'GENERAL_KNOWLEDGE';

// 힌트 종류 (이미 존재)
// SEMANTIC_CATEGORY | CONTEXT_SENTENCE | INITIAL_PATTERN | REVEAL_GRAPHEME | ...
```

`IDIOM`/`PROVERB`를 AnswerMode enum에 넣지 말 것. 카테고리 배지와 입력 surface를 분리하면 Task 3 “mode metadata”도 catalog `category` + optional `preferredInputSurface` 정도로 축소된다.

### 3.3 [치명] 펫/보상을 demo 완료 훅에 붙이지 말 것

Task 4 문제:

- `GAME_COMPLETED` → local reward transition  
- LearningDemoScreen 수정  
- 일일 claim idempotent를 모바일 controller가 보장  

서버 실체:

- `claimEffectOnce`는 **DB 트랜잭션 + subject lock** 계약  
- policy status DRAFT이면 production은 **0 reward**  
- 모바일은 receipt 후 캐시 갱신만  

**수정 Task 분할:**

| Task | 범위 | 허용 상태 |
|---|---|---|
| 4p | `/pets` UI: empty/error/loading + DRAFT “준비 중” | `LOCAL_DEMO_ONLY` |
| 4s | HTTP claim/promote → existing server pure + RPC | `REWARD_READY` 전제: APPROVED policy + auth |
| 4x | demo/preview에 mock pet 붙이기 | **비권고** (08-10 Approach B) |

### 3.4 [높음] 랭킹은 기존 계약·정책에 붙일 것

필수 명시 누락:

- `rankedRecord: BEST_COMPLETED_VERIFIED`  
- weekly categories: ENGLISH + PROVERB only; IDIOM/GK disabled  
- `publishBlocked: true` 전량이므로 **시즌 pin 전 rank production 불가**  
- 선택 펫 COSMETIC_ONLY  

`RankingScreen`은 `WeeklyCategoryBoard`를 재사용하고, `ranking-client`는 서버 public leaderboard view allow-list만 호출한다. 로컬 score 재계산·hint penalty 필터를 클라이언트가 “권위적으로” 하지 않는다 (서버 verified attempt만 반영).

### 3.5 [높음] 08-10 선행 게이트와의 순서

권고 실행 순서 (본 계획 재배치):

```text
[08-10 Plan A]
  F-001 product private 0-import + export leak scan
  CI-min (server pets tests, bundle scan)
  content atomicity / semantic drift (registry 재생 전)

[08-10 Slice-0]
  en-resilience CASUAL server-authoritative FIND → MEANING
  no reward writes (DRAFT)

[본 계획 Mobile UX — 수정본]
  Task 1' public Home + routes (disabled cards with reasons)
  Task 2' shared input surfaces using normalizeFinalAnswer
  Task 3' UTF-8 + mode-compatible validation (schema-first)
  Task 4' pets UI fail-closed; server claim later
  Task 5' ranking UI + server client; DRAFT/empty season states
  Task 6  Android smoke as LOCAL evidence
  Task 7  acceptance report ≠ production ready
```

**본 계획을 08-10보다 먼저 실행하지 말 것.**

### 3.6 [중간] Task 3 콘텐츠/manifest 직접 수정 위험

- `manifest.v1.json` 수동 수정 금지에 가깝다 (generator/writer 산출물).  
- mode 메타데이터는 `catalog.v1.json` + contracts schema + draft validation 경로로.  
- “각 모드 admitted fixture ≥1”은 현재 콘텐츠 현실과 충돌 → **목표 수용 기준**으로 두고, 단기에는 `en-resilience`(EN/MCQ·ladder), `ko-proverb-seeing-is-believing`(PROVERB/free text+INITIAL_PATTERN 힌트) 두 축만 강제.

### 3.7 [중간] research.md 정합

| research 주장 | 계획/코드 |
|---|---|
| registry는 `__DEV__` 로컬 플레이 바인딩 | 계획이 product home에 registry 데이터를 쓰면 research 안전 모델 붕괴 |
| `__DEV__` 조건부 로딩이 안전 장치 | **번들 배제 아님** — 08-10 F-001; research 문구 과신 |
| inventory 91 | 현재 79 — Task 3 완료 정의에 91 사용 금지 |
| 파라미터 75/150/0.055 | 본 모바일 계획 범위 외; 건드리지 말 것 |

### 3.8 [중간] 워크플로/CI

현재:

- `mobile:check` = contracts + web export  
- Android/emulator 없음  
- private bundle scan 없음  

본 계획 Task 7 “readiness complete” 조건에 Android smoke를 넣으면 **CI에서 절대 닫히지 않거나**, 로컬 한 번의 수동 실행으로 production ready를 선언하게 된다.

**권고 게이트 표:**

| 게이트 | 자동화 | 완료 시 상태 |
|---|---|---|
| unit + typecheck + web export + private scan | CI | 코드 계약 |
| Android smoke script | 개발자 머신 / 외부 | `LOCAL_ANDROID_SMOKE` |
| rights/policy APPROVED + server reward | 외부+DB | `REWARD_READY` |
| release-evidence-blockers | 외부 | `PRODUCTION_READY` |

### 3.9 [개선] 문서 위생

- Task 6/7에서 `2026-08-10-...-review.md` 수정 삭제 → 새 `2026-08-11-mobile-feature-acceptance-report.md`만 기록  
- Self-review의 “demo와 production 분리”를 Task 파일 목록과 일치하도록 재작성  
- `@expo/ui` 검증 항목 삭제 또는 실제 의존성 추가 이유가 있을 때만 재도입  

---

## 4. 권고 개정 체크리스트 (계획 문서에 반영)

구현 시작 전 대상 plan에 아래를 반영할 것.

- [ ] Goal을 “product completion”이 아니라 단계 상태로 재정의:  
  `PREVIEW_UX` → `SERVER_SLICE_CASUAL` → `REWARD_READY` → `RANKED_READY`
- [ ] Global Constraints에 08-10 항목 흡수: product 0-private-import, DRAFT write 0, BEST_COMPLETED_VERIFIED, dirty tree 보존
- [ ] Task 1: `LearningDemoEntry[]` 제거; public home model + disabled reasons
- [ ] Task 2: AnswerMode 재정의; `normalizeFinalAnswer` 재사용; product는 server judge only
- [ ] Task 3: manifest 수동 편집 금지; schema/catalog 경로; admitted 요구를 현실적 fixture 목록으로
- [ ] Task 4: LearningDemoScreen 보상 연결 삭제; pets route fail-closed; server claim 별 Task
- [ ] Task 5: WeeklyCategoryBoard/ weekly policy / BEST record 명시; 로컬 rank 산출 금지
- [ ] Task 0(선행): 08-10 F-001 + Slice-0 링크 또는 “blocked until” 표
- [ ] Task 6: `@expo/ui` 제거; Android = LOCAL evidence
- [ ] Task 7: 선행 리뷰 파일 수정 금지; production ready ≠ local smoke
- [ ] research.md를 ranked/reward SSOT로 인용 금지 한 줄

---

## 5. 최종 판정

| 질문 | 답 |
|---|---|
| 홈 네비·힌트 렌더·UTF-8·Android smoke 아이디어가 유용한가? | **예** — 재배치 후 채택 |
| 지금 문서 그대로 구현을 시작해도 되는가? | **아니오** |
| 가장 위험한 한 줄은? | Home/Task4가 private demo registry + local rewards에 제품 기능을 결합하는 것 |
| 08-10 계획과의 관계 | **후속 Mobile UX 트랙**; 대체 마스터 플랜 아님 |
| research.md 역할 | 파이프라인 참고만; inventory·보안 결론에 사용 금지 |

**한 줄 결론:**  
모바일에서 “다 되는 것처럼 보이는” 완성도를 노린 계획은 이해되지만, TouchCatch의 실제 차단선은 UX 카드 개수가 아니라 **private 데이터 격리와 서버 권위 경제**다. 이 문서는 그 순서를 뒤집는다. 순서를 바로잡은 개정본만 에이전트에 위임하라.

---

## 6. 참고 경로

| 종류 | 경로 |
|---|---|
| 대상 계획 | `D:\touchcatch\docs\superpowers\plans\2026-08-11-mobile-feature-completion-plan.md` |
| **본 리뷰** | `D:\touchcatch\docs\reviews\2026-08-11-mobile-feature-completion-plan-review.md` |
| 08-10 readiness 계획 | `D:\touchcatch\docs\superpowers\plans\2026-08-10-feature-readiness-audit-and-improvement-plan.md` |
| 08-10 리뷰 | `D:\touchcatch\docs\reviews\2026-08-10-feature-readiness-audit-and-improvement-plan-review.md` |
| research | `D:\touchcatch\research.md` |
| release blockers | `D:\touchcatch\docs\release-evidence-blockers.md` |
| CI | `D:\touchcatch\.github\workflows\ci.yml` |
