# Review: TouchCatch Feature Readiness Audit & Improvement Plan

| 항목 | 내용 |
|:---|:---|
| **작성일** | 2026-08-10 |
| **대상 계획** | `D:\touchcatch\docs\superpowers\plans\2026-08-10-feature-readiness-audit-and-improvement-plan.md` |
| **연구 문서** | `D:\touchcatch\research.md` (비규범 / 콘텐츠 파이프라인 참고) |
| **연관 계획** | `docs/superpowers/plans/2026-08-01-workflow-codebase-research-improvement-plan.md`, `docs/superpowers/plans/2026-08-01-repository-remaining-work-plan.md`, `docs/superpowers/plans/2026-07-30-adaptive-hints-pet-progression-weekly-ranking-implementation-plan.md`, `docs/superpowers/plans/2026-07-19-supabase-auth-integration-plan.md` |
| **선행 리뷰** | `docs/reviews/2026-08-01-repository-remaining-work-plan-review.md`, `docs/reviews/2026-07-31-adaptive-hints-pet-progression-weekly-ranking-plan-codebase-review.md` |
| **검토 범위** | 대상 계획 + `research.md` + `apps/{mobile,server}` + `tools/content/**` + `content/learning/**` + `packages/{learning-competition,contracts,game-engine}` + `supabase/migrations` + `.github/workflows/ci.yml` + `package.json` scripts + `docs/release-evidence-blockers.md` + `docs/04-Roadmap/12_IMPLEMENTATION_ROADMAP.md` |
| **검증 방법** | 계획 전항을 코드·SSOT·선행 리뷰와 교차 대조. inventory/registry hash·difference count 실측 스크립트. (본 리뷰는 구현 패치를 포함하지 않음.) |
| **판정** | **방향 채택 · 구현 전 수정 권고.** P0(비공개 번들 누출)·서버 권위 세로 슬라이스·BEST_COMPLETED_VERIFIED 유지·DRAFT fail-closed는 코드/규범과 일치한다. 다만 **(1) NestJS 프레임워크 암시, (2) 인증 Task 공백, (3) Task 3 과대 묶음, (4) 기존 서버 어댑터·08-01 워크플로 진전 과소평가, (5) research inventory 구식, (6) 첫 슬라이스에 워드헌트·퀴즈 전 카테고리 과포함**이 있으면 에이전트가 재작업·회귀를 만든다. |

---

## 0. 총평 (Executive Summary)

이 계획은 2026-08-10 작업 트리 기준으로 **“도메인/DB 골격은 있으나 제품 기능은 미완성”**이라는 현실을 가장 정직하게 적은 실행 문서다. 특히:

1. **F-001 private solution 웹 번들 누출**을 출시 차단으로 올바르게 최상위에 둔다.
2. **Approach A(보안 경계 우선 세로 슬라이스)** 를 권고하고 데모 UI 우선(B)을 거절한 판단이 옳다.
3. **BEST_COMPLETED_VERIFIED** 를 명시 유지한다 (과거 계획의 first-completed 회귀 실수를 반복하지 않음).
4. 기존 migration 수정 금지, DRAFT 보상 0건, 선택 펫 ≠ 랭크 점수 등 Global Constraints가 설계/코드 SSOT와 맞다.
5. 첫 중간 목표를 **“펫/랭크 전체”가 아니라 ENGLISH 1개 캐주얼 서버 권위 완료(보상 없이)** 로 잡은 것은 실행 가능하다.

동시에 이 문서는 **감사 리포트 + 11 Task 마스터 플랜**을 한 파일에 합쳐 놓아, 에이전트가 “전부 구현”으로 해석하기 쉽다. 또한 현재 코드베이스는 이미 thin SQL-RPC adapter·독립 CI job·drift checker·research 비규범 배너 등을 갖고 있는데, 계획이 일부 구간을 그린필드 Create처럼 서술한다.

| # | 심각도 | 요약 |
|---|---|---|
| 1 | **치명** | F-001 진단은 맞다. 다만 Task 2가 `registry` 분리만 강조하면 부족하다. product `app/index.tsx`의 **정적 `LearningDemoScreen` import** 자체가 learning-demo 그래프를 끌어온다. product entry는 learning-demo **0 import**여야 한다. |
| 2 | **치명** | Task 5 인증·세션이 **선행 auth 계획 없이** 등장. `2026-07-19-supabase-auth-integration-plan.md`와 subject resolver 없이 bearer 세션을 만들면 mock auth가 고착된다. |
| 3 | **높음** | Tech Stack의 **“NestJS + Socket.IO”** 는 문서 목표일 뿐 현재 `apps/server` 실체가 아니다. 에이전트가 Nest 스캐폴드를 새로 깔 위험이 크다. **기존 `SqlRpcClient` + learning/pets pure adapter 위에 최소 HTTP** 를 명시해야 한다. |
| 4 | **높음** | Task 3(전체 type/schema/docs/29 failures 일괄 녹색)이 **F-001 해소와 세로 슬라이스를 막는다.** CI 최소 게이트와 full-green을 분리하라. |
| 5 | **높음** | Task 5~7 File map이 기존 `attempt-repository` / `attempt-session` / `progression` / `leaderboard` / pets pure 로직을 **Create 위주**로 적어 중복 구현 위험이 있다. **Extend/완성** 으로 재서술. |
| 6 | **높음** | `research.md` inventory는 **2026-08-01 기준 91팩**인데 현재 catalog/manifest는 **79**. 계획은 79를 쓰지만 research 드리프트를 Task 1에 안 넣으면 다른 에이전트가 91을 다시 가져온다. |
| 7 | **중간** | semantic drift: 실측 **difference count mismatch 21**, **privateSolutionHash mismatch 28**. 계획의 “26/79”와 근접하나 측정 스크립트를 Task 1 baseline에 고정해야 한다. |
| 8 | **중간** | Task 6이 틀린그림+워드헌트+final answer+의미퀴즈+RN 전면 교체를 한 묶음으로 둔다. 첫 슬라이스는 **`en-resilience` 기준 FIND → MEANING(또는 final→meaning)** 만으로 축소 권고. |
| 9 | **중간** | `server:test` root script는 learning만 실행하지만 `apps/server/package.json`의 `test`는 이미 `src/**/*.test.ts`. 계획에 **root 좁힘 버그**를 명시하고 pets 포함을 복구하라. |
| 10 | **중간** | CI는 이미 check/database/server/mobile 분리 job + “local contract/build evidence” 네이밍이 있다. F-003은 **부분 진전을 baseline으로 인정**한 뒤 빈 구멍(typecheck, pets test, bundle scan)만 채우라. |
| 11 | **중간** | batch-build 부분 실패 후에도 manifest/registry 갱신 — 코드 확인됨 (`failures` 모아도 write 계속, non-zero exit 없음). Task 4 방향 유지. |
| 12 | **개선** | Plan A~D 분리를 “권고”만 하고 하위 문서/완료 정의를 안 나눴다. 구현 전 **Plan A 단독 체크리스트**를 먼저 고정하는 편이 안전하다. |
| 13 | **개선** | readiness % 표는 커뮤니케이션용으로 유용하나 게이트 증거가 아니다. `LOCAL_DEMO_ONLY` / `SERVER_SLICE` / `PRODUCTION_READY` 상태 사전(Task 1)이 더 중요하다. |
| 14 | **개선** | 로드맵 G3A→G6와 본 계획 Task 매핑이 없다. 세로 슬라이스를 G3A/G3B 부분 증거로 명시해 “로드맵 전체 완료” 오판을 막아라. |

---

## 1. 계획 주장 × 코드/SSOT 교차 검증 (2026-08-10 실측)

| 계획 주장 | 검증 | 근거 |
|---|---|---|
| catalog/manifest 79, drafts 105, registry 79, orphan draft 26 | ✅ | 실측 일치. research의 91은 **구식** |
| publishBlocked 79 / rankedEligible 3 / ADMITTED 3 | ✅ | `en-resilience`, `ko-proverb-seeing-is-believing`, `ko-idiom-turn-misfortune` |
| semantic registry drift (좌표/내용) | ✅/⚠️ | count mismatch **21**, hash mismatch **28**. “26”은 측정 정의에 따라 달라짐 |
| `content:drift:check`는 key 존재만 비교 | ✅ | `check-content-drift.js` — key/admission만, hash·좌표 없음 |
| batch-build 부분 실패 후 manifest/registry 갱신 | ✅ | `runBatchBuildAll` failures 이후에도 write + registry 생성; process.exit(1) 없음 |
| product index가 `!__DEV__`에서 throw | ✅ | `apps/mobile/app/index.tsx` |
| Metro가 DEV require 뒤 registry를 번들할 수 있음 | ✅ 위험 | 정적 `LearningDemoScreen` import + require registry; boundary 테스트는 소스 위치만 검사 |
| `production-boundary.test.ts`가 번들 스캔 안 함 | ✅ | 소스 가드/문자열 부재만 검증 |
| Hint: `currentHintText` 미렌더, 펫 컴포넌트 미연결 | ✅ | import만 존재, JSX 미사용; 힌트 버튼은 index만 증가 |
| ChallengeResultBoard DOM (`div`/`span`) | ✅ | RN 비호환 |
| 서버 main `src/index.ts` 부재, start script 없음 | ✅ | `apps/server/package.json` main 지정, 파일 없음; scripts에 start 없음 |
| `server:test` pets 누락 | ✅ | root `vitest run apps/server/src/learning` |
| mobile CI에 typecheck 없음 | ✅ | `mobile:check = contracts + web:build` |
| CI job 분리 (check/server/mobile/database) | ⚠️ 계획 과소평가 | 이미 존재; 이름도 local evidence 명시 |
| NestJS + Socket.IO 서버 경계 | ⚠️ 문서 목표 | `07_REALTIME_SERVER_SPEC.md`: “아직 계획 상태”; deps/코드 없음 |
| OpenAPI lint ≠ route 구현 | ✅ | 계약 문서와 구현 분리 |
| progression migration이 caller award 값을 신뢰 | ✅ (방향) | Task 9의 “서버 재계산 only” 재설계가 맞음; pure `calculateLearningProgression`은 DRAFT=0 처리 |
| BEST_COMPLETED_VERIFIED 유지 | ✅ | contracts/schema/attempt-session 일치 |
| research NON-NORMATIVE | ✅ | research 상단 배너 + pipeline-parameters.md |
| research 파라미터 75/150/0.055 | ✅ 대체로 정합 | 08-01 계획 일부 반영됨; inventory 수치만 뒤처짐 |
| 워드헌트 UI 미연결 | ✅ | mobile src에 SUBMIT_FINAL_ANSWER / word hunt 렌더 없음 |
| 점수 로컬 `100000 - hintIndex*15000` | ✅ | LearningDemoScreen 퀴즈 onPress |

### 1.1 콘텐츠 inventory (재현)

```text
catalog.v1.json / manifest.v1.json : 79
  ENGLISH 70 | PROVERB 4 | IDIOM 4 | GENERAL_KNOWLEDGE 1
  publishBlocked: 79
  rankedEligible / ADMITTED: 3
    en-resilience
    ko-proverb-seeing-is-believing
    ko-idiom-turn-misfortune

drafts/*.json : 105  (orphan 26)
registry.ts unique keys : 79
difference count draft≠registry : 21
privateSolutionHash draft≠registry : 28
```

`research.md` §5 “91 manifest/catalog packs / 95 drafts” 는 **2026-08-01 스냅샷**이며 현재 WD와 불일치한다. 비규범이어도 에이전트 혼동 비용이 크므로 Task 1에서 날짜 스탬프 갱신 또는 “historical” 표기가 필요하다.

### 1.2 이미 착륙한 것 (계획을 Create→Extend로 바꿀 근거)

| 영역 | 상태 |
|---|---|
| learning competition SQL + pure package | 착륙 (`BEST_COMPLETED_VERIFIED`) |
| attempt repository / verifier / session adapter | thin adapter + optional SqlRpcClient |
| progression pure 계산 + DRAFT=0 | 착륙; 원자적 DB award는 미완 |
| pets pure (daily draw, promotion, showcase) + tests | 착륙; HTTP/RPC repository 없음 |
| CI 4-job 분리 + local evidence 네이밍 | 착륙 |
| `content:drift:check` key-level | 착륙; semantic 미포함 |
| research 비규범 + pipeline-parameters.md | 착륙 |
| auth contracts/mobile session | **미완** (07-19 계획 미실행 다수) |
| NestJS/Socket 런타임 | **없음** |
| product learning route | **없음** (DEV demo only) |

---

## 2. 잘 잡힌 점 (유지·강화)

### 2.1 보안 우선순위

F-001을 다른 UI 개선보다 앞에 둔 것은 이 저장소 역사상 가장 중요한 우선순위 교정이다. DEV 가드만으로 안전하다고 믿게 만드는 `production-boundary` 테스트의 한계도 정확히 짚었다.

**강화 권고:** leak 테스트는 다음 세 층을 모두 통과해야 한다.

1. **소스 그래프:** product app entry → learning-demo/registry/source 경로 0 edges  
2. **Metro/export asset manifest:** private 이미지·JSON 0  
3. **번들 문자열:** `privateSolutionHash`, `correctOptionId`, 알려진 hash, `learningDemoEntries`, `canonicalAnswer` 0  

### 2.2 세로 슬라이스와 중간 목표

“ENGLISH 1 캐주얼, private leak 없이, 서버 권위, 보상 없이 종료”는 구현·검증 모두에 적합한 최소 단위다. 펫/랭크를 뒤로 미룬 것도 collection-first·fail-closed 경제와 맞다.

### 2.3 규범 회귀 방지

- first-completed 금지  
- migration 덮어쓰기 금지  
- DRAFT 보상/랭크 write 0  
- 선택 펫 점수 비영향  

선행 리뷰에서 지적된 사고 유형을 반복하지 않는다. 유지.

### 2.4 콘텐츠 원자성 (Task 4)

batch-build의 “실패해도 manifest/registry 갱신”은 실측으로 확인됐다. semantic drift checker + temp dir rename 커밋은 반드시 Plan A에 남겨야 한다.

---

## 3. 문제점과 수정 권고

### 3.1 [치명] Product entry 격리 범위를 더 넓혀라 (Task 2)

현재:

```ts
// apps/mobile/app/index.tsx
import { LearningDemoScreen } from '../src/learning-demo/LearningDemoScreen';
// ...
if (!__DEV__) throw new Error('...');
const { learningDemoEntries } = require('../src/learning-demo/registry');
```

문제:

- 정적 import만으로 learning-demo 모듈 그래프·타입이 제품 엔트리에 묶인다.  
- `__DEV__` throw는 **런타임 차단**이지 **번들 배제**가 아니다.  
- preview 앱으로 옮긴 뒤에도 product `index`가 demo를 import하면 실패다.

**수정 문구 제안:**

> product `apps/mobile/app/**` 및 product feature route는 `learning-demo`, `registry`, `content/learning/source|drafts` 에 대한 import/require/re-export **0건**.  
> preview 전용 패키지/엔트리만 private registry를 소비한다.  
> CI는 product export 산출물에 대해 문자열·asset scan을 수행한다.

### 3.2 [치명] Auth를 Task 5 안으로 숨기지 마라

계획 Task 5:

- bearer → subject resolver  
- authenticated learning attempt  

그러나 저장소에는 완료된 production auth 세로 슬라이스가 없고, 별도 계획(`2026-07-19-supabase-auth-integration-plan.md`)이 미완이다.

**권고 순서:**

```text
Task 2 private 격리
  → Task 5a: JWT verify + opaque subject + /health (또는 /v1/me stub)
  → Task 5b: learning attempt start/intent/public projection
  → Task 6: mobile product session UI
```

게스트-only 로컬 슬라이스를 허용한다면 **명시적으로 `LOCAL_SERVER_SLICE` 상태**로 이름 붙이고, production claim과 분리한다. “인증된 학습 세션”이라고 쓰면서 게스트 하드코드를 넣지 말 것.

### 3.3 [높음] NestJS를 Tech Stack 기본값에서 제거하라

실측:

- `apps/server` = pure/adapters + tests, HTTP 프레임워크 없음  
- 아키텍처 문서도 Nest/Socket을 “계획 상태”로 명시  
- 기존 패턴 = SQL RPC 이름 매핑 + in-memory fallback  

에이전트가 Task 5에서 Nest 모듈/가드/DI 트리를 새로 만들면, 이미 있는 learning-competition 패키지와 이중 권위가 생긴다.

**권고:**

1. 단기: 최소 HTTP (기존 admin 패턴 또는 Hono/Fastify 한 줄 메모로 고정)  
2. 권위 로직은 `packages/learning-competition` + DB RPC 유지  
3. Socket.IO/realtime match는 **본 학습 캐주얼 슬라이스의 비범위**로 명시 (G3B 본선)

### 3.4 [높음] Task 3을 두 트랙으로 쪼개라

| 트랙 | 목적 | 포함 | 세로 슬라이스 차단? |
|---|---|---|---|
| **3a CI-min** | 보안·회귀 최소 | `server:test`→`apps/server/src`, mobile typecheck script, private bundle scan on export, pets tests in CI | 예, 먼저 |
| **3b Full-green** | root `pnpm check` 29 failures, docs gate, schema drift 전부 | 병렬 가능 | **아니오** (슬라이스와 병행) |

지금 Task 3은 “모든 빨간 게이트를 먼저 녹색”으로 읽어 F-001 수정이 뒤로 밀릴 수 있다. 계획 §8 순서는 Task 2 다음 Task 3인데, **Task 2의 leak test + export scan** 이 Task 3 전체보다 우선이다.

### 3.5 [높음] Task 5~9 File map을 “이미 있는 파일 완성”으로 고쳐라

| 계획 표현 | 실제 | 권고 |
|---|---|---|
| Create `learning-service.ts` | session/verifier/repository 분산 존재 | façade는 선택; 기존 모듈 확장 우선 |
| Create `sql` 경로 암시 | `SqlRpcClient` 존재 | transport 구현체 연결이 핵심 |
| Create pets repositories | pure 로직 존재 | RPC 이름 매핑 + HTTP only |
| Create progression migration 재설계 | `202607300003` 존재 | **새** migration으로 award 재검증 — 계획 문구는 맞음, “수정 금지” 재강조 |

### 3.6 [중간] 첫 세로 슬라이스 범위 축소 (Task 6~7)

계획 완료 정의는 ENGLISH/PROVERB/IDIOM 캐주얼 전부 + final answer + word hunt를 한꺼번에 요구하는 인상을 준다. §8 중간 목표는 더 좁다. **본문 Task와 완료 정의를 중간 목표에 맞춰라.**

**권고 MVP 슬라이스 (Slice-0):**

1. content key 고정: `en-resilience` (ADMITTED + ladder 존재)  
2. mode: `CASUAL` only  
3. flow: preload public images → 10 differences (server judge) → meaning choice → public result  
4. **no** leaderboard write, **no** progression award (policy DRAFT)  
5. word hunt / SUBMIT_FINAL_ANSWER / PROVERB·IDIOM 은 Slice-1  

헤더에 `selected.title`(정답 단어) 노출 문제(F-007)는 Slice-0에서도 **카피 회귀 테스트**로 막는 것이 맞다.

### 3.7 [중간] 힌트/펫 dead code 처리 방침

F-004/F-005는 정확하다. 다만 Approach B 거절과 모순되게 demo에 펫 UI를 다시 붙이는 해석이 가능하다.

**권고:**

- preview 이동 시: 미사용 import/`mockPets` **삭제 또는 preview-only 명시 배너**  
- `HintPanel` 연결은 preview에서만 “로컬 힌트 미리보기”로 허용하되, **점수/보상/랭크 문구 금지**  
- product 힌트는 서버 `USE_HINT` projection만  

### 3.8 [중간] research.md · 08-01 workflow 계획과의 관계

| 문서 | 역할 | 본 계획과의 관계 |
|---|---|---|
| `research.md` | 파이프라인 설명, NON-NORMATIVE | inventory 구식; 알고리즘 값은 대체로 정합 |
| `docs/testing/content-pipeline-parameters.md` | 파라미터 내비 SSOT | Task 4가 이 표를 깨면 안 됨 |
| `2026-08-01-workflow-codebase-research-improvement-plan.md` | CI/drift/research 정합 | Task 1~4와 **대량 중복**; 완료 step 재실행 금지 |
| `2026-08-01-repository-remaining-work-plan.md` | 남은 일 통합 | BEST 규칙 등은 이미 교정됨 |

**권고 한 줄:**

> 본 2026-08-10 계획은 feature readiness 마스터이며, 08-01 workflow 계획의 미완 step(원자적 batch, research inventory 스탬프, mobile LAN 문서 등)을 **Plan A에 흡수·supersede** 한다고 명시한다.

### 3.9 [중간] progression 일일 cap 의미

`calculateLearningProgression`의 `Math.min(200, accountXp)` 는 **단발 호출 상한**이지 KST 일일 누적 cap이 아니다. Task 9가 DB 누적 cap을 올바르게 요구하므로, F-013에 “pure 함수 min은 daily cap이 아님”을 한 줄 보강하면 구현자가 함수만 고치고 끝내지 않는다.

### 3.10 [개선] 상태 사전과 로드맵 매핑

Task 1이 제안한 상태를 다음처럼 고정하는 것을 권고한다.

| 상태 | 의미 | 로컬 테스트만으로 선언 가능? |
|---|---|---|
| `LOCAL_DEMO_ONLY` | preview 앱, private registry 허용 | 예 |
| `SERVER_SLICE_CASUAL` | 인증(또는 명시적 dev subject) + 1 content 서버 권위 + private leak 0 | 부분 (DB 필요) |
| `REWARD_READY` | APPROVED policy + atomic award + pets runtime | 아니오 (정책 승인) |
| `RANKED_READY` | ENGLISH/PROVERB 5+ published + weekly pin | 아니오 (콘텐츠·권리) |
| `PRODUCTION_READY` | release-evidence-blockers 전부 닫힘 | 아니오 |

로드맵 매핑 예:

- Slice-0 + F-001 해소 → G3A 부분 증거  
- Auth + realtime/match → G3B (본 계획 비범위 가능)  
- Pets runtime → G4  
- 외부 evidence → G5/G6 및 `release-evidence-blockers.md`

---

## 4. research.md 관점 메모

| 항목 | 평가 |
|---|---|
| 비규범 배너 | 유지 — 랭킹/경제 SSOT 아님 |
| 파이프라인 7단계·writer 설명 | 대체로 유효; batch 호출 순서 보강은 08-01 Task 3 잔여 |
| 파라미터 75 / 150 / 0.055 / 0.08 | 코드·`content-pipeline-parameters.md`와 정합 |
| inventory 91/95 | **현재 79/105와 불일치 — 갱신 필요** |
| `__DEV__` 안전 장치 서술 | **과신**. F-001과 충돌. “DEV 가드는 번들 배제가 아님” 문구 추가 권고 |
| registry 생성 경로 | preview 분리 후 출력 경로 변경을 research에 반영 |

research는 계속 비규범으로 두되, **날짜 스탬프 inventory + “번들 격리” 한 절**만 고쳐도 에이전트 오판이 줄어든다.

---

## 5. 워크플로/CI 관점 메모

현재 `.github/workflows/ci.yml`:

- Node 24.18.0 / pnpm 11.13.0 고정 — 계획 Global Constraints와 일치  
- job 이름 local contract/build evidence — 08-01 방향 반영  
- 구멍: mobile typecheck 없음, root `server:test` pets 제외, product private bundle scan 없음, semantic content drift 없음  

**권고 CI 증분 (Plan A):**

1. `mobile:private-bundle-scan` (export 후) — F-001  
2. `server:test` → `apps/server/src`  
3. `mobile:typecheck` (처음엔 continue-on-error 금지; 기존 오류는 3b에서 처리하되 **새 오류 도입 금지** 정책을 문서화)  
4. `content:semantic-drift:check` (hash/coords)  

`pnpm check` 전체 녹색은 필요하지만 **출시 차단 해제 조건과 혼동하지 말 것** — 계획 본문도 이를 말하므로, Task 11과 상태를 더 강하게 연결하면 된다.

---

## 6. 권고 실행 순서 (계획 §8 개정안)

```text
0. Task 1 baseline + 상태 사전 + research inventory 스탬프
1. Task 2 F-001: product 0-private-import + export leak tests + preview 격리
2. Task 3a: pets tests CI, server:test 범위, bundle scan 배선
3. Task 4: atomic batch-build + semantic drift (registry 재생 전)
4. Task 5a: auth/subject (또는 명시적 LOCAL_SERVER_SLICE subject)
5. Task 5b+6a: en-resilience CASUAL 서버 권위 FIND→MEANING
6. Task 7 카피/정답 비노출 회귀
7. Task 6b word hunt / final answer
8. Task 8–9 pets + atomic progression (policy APPROVED 전 fail-closed UI)
9. Task 10 ranked/weekly (콘텐츠 5+5 readiness 후)
10. Task 3b full-green 병행
11. Task 11 external evidence only → PRODUCTION_READY
```

**하지 말 것**

- LearningDemoScreen에 펫/랭크 mock을 더 얹기  
- `202607300003` 덮어쓰기  
- first-completed best 재도입  
- research 수치를 ranked readiness로 사용  
- Nest 풀스택을 학습 캐주얼 슬라이스 선결 조건으로 만들기  
- dirty working tree reset/대량 삭제  

---

## 7. 계획 문서에 바로 반영할 패치 체크리스트

구현 시작 전 대상 plan 파일에 아래를 반영하는 것을 권고한다.

- [ ] Tech Stack: NestJS/Socket을 “장기 realtime 목표”로 강등; 단기 thin HTTP + SqlRpc 명시  
- [ ] Task 2: product entry learning-demo **0 import** 및 3층 leak 테스트  
- [ ] Task 5 앞: Auth/subject 선행 또는 `LOCAL_SERVER_SLICE` 명시  
- [ ] Task 3 → 3a/3b 분리; 3b는 세로 슬라이스 non-blocking  
- [ ] Task 5~9: Create → Extend 기존 adapter 파일 목록으로 수정  
- [ ] Task 6: Slice-0 (`en-resilience` CASUAL) vs Slice-1 분리  
- [ ] Task 1: research.md inventory 날짜 갱신 + 측정 스크립트 커밋  
- [ ] 08-01 workflow 계획 supersede/흡수 한 줄  
- [ ] dirty tree 보존 제약 한 줄  
- [ ] 완료 정의 readiness % 대신 상태 enum 사용  
- [ ] G3A–G6 매핑 표 추가  
- [ ] `server` package `test` vs root `server:test` 불일치 명시  

---

## 8. 최종 판정

| 질문 | 답 |
|---|---|
| 이 계획의 큰 방향이 맞는가? | **예.** 보안 경계 → 세로 슬라이스 → 보상 → 랭크 → 외부 evidence |
| 지금 그대로 에이전트에 던져도 되는가? | **아니오.** §7 패치 후 Plan A만 위임 |
| 가장 먼저 닫을 티켓은? | **F-001 product private bundle isolation** |
| research.md를 SSOT로 써도 되는가? | **아니오.** 파이프라인 참고만; inventory는 재스탬프 |
| 첫 데모 가능한 제품 상태 정의는? | `SERVER_SLICE_CASUAL` on `en-resilience`, private leak 0, DRAFT reward 0 |

**한 줄 결론:**  
계획은 “무엇이 진짜로 안 되는지”를 정확히 보았다. 이제 필요한 것은 Nest/풀기능 확장 서사가 아니라, **private 격리 + 기존 어댑터 위의 최소 서버 권위 캐주얼 한 판**을 문서와 체크박스에 더 좁고 날카롭게 새기는 일이다.

---

## 9. 참고 경로

| 종류 | 경로 |
|---|---|
| 대상 계획 | `D:\touchcatch\docs\superpowers\plans\2026-08-10-feature-readiness-audit-and-improvement-plan.md` |
| 본 리뷰 | `D:\touchcatch\docs\reviews\2026-08-10-feature-readiness-audit-and-improvement-plan-review.md` |
| research | `D:\touchcatch\research.md` |
| pipeline params | `D:\touchcatch\docs\testing\content-pipeline-parameters.md` |
| release blockers | `D:\touchcatch\docs\release-evidence-blockers.md` |
| CI | `D:\touchcatch\.github\workflows\ci.yml` |
