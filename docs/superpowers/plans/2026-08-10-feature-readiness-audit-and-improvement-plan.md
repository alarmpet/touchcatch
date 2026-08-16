# TouchCatch 핵심 기능 준비도 감사 및 개선 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 펫 보상, 틀린그림 찾기, 단어·속담·사자성어 학습 퀴즈, 힌트, 주간 랭킹을 비공개 정답이 노출되지 않는 실제 모바일-서버-DB 세로 기능으로 완성한다.

**Architecture:** 현재 저장소에는 강한 순수 도메인 로직과 SQL 골격이 있지만, 실제 앱은 개발 전용 로컬 레지스트리에 의존하고 서버 런타임·인증·API 배선이 빠져 있다. 먼저 개발 프리뷰를 제품 앱에서 물리적으로 분리하고 검증 게이트를 복구한 뒤, 서버 권위 학습 세션 → 모바일 플레이 → 펫/보상 → 랭킹 순서로 세로 슬라이스를 완성한다.

**Tech Stack:** pnpm workspace, TypeScript, React Native/Expo Router, Vitest, Zod/AJV, PostgreSQL/Supabase. NestJS + Socket.IO는 장기 realtime 목표이며, 첫 서버 권위 캐주얼 슬라이스는 기존 pure domain/SQL-RPC adapter 위의 최소 HTTP 경계로 구현한다. Nest 스캐폴드를 선행 조건으로 만들지 않는다.

## 0. 리뷰 검증 결과 (2026-08-10)

지정 리뷰 문서의 14개 권고를 코드·SSOT·실행 결과와 다시 대조했다. **수용**은 계획에 반영하고, **조건부 수용**은 측정 정의나 범위를 명시한 뒤 반영한다.

| 리뷰 항목 | 판정 | 계획 반영 |
|---|---|---|
| F-001에 정적 `LearningDemoScreen` import까지 포함한 product entry 격리 | 수용 | product graph 0 import + export asset/string 3층 scan을 Task 2에 고정 |
| 인증·opaque subject 선행 경계 | 수용 | Task 5a(auth/subject)와 Task 5b(learning session)로 분리 |
| NestJS/Socket.IO는 현재 런타임이 아니라 장기 목표 | 조건부 수용 | 단기 최소 HTTP + 기존 adapter를 명시하고 realtime은 G3B 범위로 강등 |
| Task 3의 일괄 full-green 문제 | 수용 | 3a CI-min과 3b full-green 분리; 3b는 세로 슬라이스 차단선이 아님 |
| 기존 attempt/pets/progression adapter를 Create보다 Extend 우선으로 사용 | 수용 | 파일 목록과 체크리스트를 확장/연결 중심으로 수정 |
| `research.md` 91/95 inventory는 현재 79/105와 다른 historical snapshot | 수용 | Task 1에 날짜 스탬프·현행 inventory 재생성·비규범 표시를 추가 |
| registry semantic drift 수치 | 조건부 수용 | 재현 결과는 count 21건, private hash 28건이며 측정 스크립트를 baseline으로 고정; 단일 26건으로 단정하지 않음 |
| 첫 세로 슬라이스 범위 축소 | 수용 | `en-resilience` CASUAL FIND→MEANING을 Slice-0, word hunt/final/PROVERB·IDIOM을 Slice-1로 분리 |
| root `server:test`가 pets를 누락 | 수용 | `apps/server/src` 전체 범위로 복구하고 package script와 구분을 문서화 |
| CI job 분리 자체는 이미 존재 | 조건부 수용 | F-003을 전면 재구축이 아니라 typecheck/pets/bundle/semantic drift 공백 보완으로 정의 |
| batch-build 부분 실패 후 산출물 갱신 | 수용 | 임시 디렉터리·원자 rename·non-zero exit 테스트 유지 |
| Plan A 선행 체크리스트 | 수용 | Task 1~4 보안·재현성 체크리스트를 먼저 고정 |
| readiness %보다 상태 사전이 중요 | 수용 | `LOCAL_DEMO_ONLY`/`SERVER_SLICE_CASUAL`/`REWARD_READY`/`RANKED_READY`/`PRODUCTION_READY`를 완료 기준으로 추가 |
| 로드맵 G3A→G6 매핑 | 수용 | 세로 슬라이스·auth/realtime·pets·외부 증거의 G 단계 매핑을 추가 |

검증 근거 요약: product entry는 `apps/mobile/app/index.tsx`에서 demo 화면 정적 import와 registry `require`를 모두 사용한다. live drift 재현은 manifest 79, drafts 105, registry 79, count mismatch 21, private hash mismatch 28을 산출했다. `content:drift:check`는 key/admission 수준만 검사하며, root `server:test`는 learning만 실행한다. `corepack pnpm mobile:contracts`는 41/41, `corepack pnpm server:test`는 13/13으로 통과했지만 `corepack pnpm server:typecheck`는 `sql-rpc-client.ts` implicit `any`로 실패했다(실행 환경은 Node 22.16/pnpm 11.13이며 프로젝트 요구 Node 24.18과 다름).

## Global Constraints

- 감사 기준은 2026-08-10의 `D:\touchcatch` 현재 작업 디렉터리다. 작업트리는 대규모 미커밋 변경을 포함하므로 `HEAD`와 동일하지 않다.
- 제품 모바일 번들에는 `correctOptionId`, 전체 차이 좌표, `privateSolutionHash`, 정답 문자열·별칭을 포함하지 않는다.
- 캐주얼과 랭크 모두 제품 환경에서는 서버 권위 판정을 사용한다. 로컬 비공개 레지스트리는 별도 프리뷰 앱에서만 허용한다.
- `DRAFT` 경제·힌트·진행·주간 정책은 보상과 랭크 기록을 생성하지 않는다.
- 기존 적용 가능성이 있는 Supabase migration은 수정하지 않고 새 migration으로 보정한다.
- 랭크 기록은 `BEST_COMPLETED_VERIFIED` 규칙을 유지한다. first-completed-wins로 되돌리지 않는다.
- 선택 펫은 랭크 점수에 영향을 주지 않고 코칭·표현·수집 기능만 제공한다.
- 로컬 테스트 통과는 프로덕션 준비 완료를 의미하지 않는다. 실기기, 권리, 복구, 관측, 부하 증거는 별도 운영 게이트다.
- product `apps/mobile/app/**` 및 product feature route는 `learning-demo`, `registry`, `content/learning/source|drafts`를 import/require/re-export하지 않는다. private registry는 preview 전용 entry graph에서만 소비한다.
- 인증·subject resolver가 아직 완성되지 않은 로컬 서버 슬라이스는 `LOCAL_SERVER_SLICE`로 명시하고 production claim과 혼동하지 않는다.
- `research.md`의 inventory 수치는 historical 참고치이며, 현행 manifest/catalog/draft/registry 측정 결과를 우선한다.
- 기존 `attempt-repository`, `attempt-verifier`, `attempt-session`, `leaderboard`, pets pure logic, `SqlRpcClient`는 먼저 확장·연결하고 동일 책임의 새 facade/서비스를 중복 생성하지 않는다.

---

## 1. 결론

현재 상태는 **도메인/DB 골격은 상당 부분 존재하지만 실제 사용자 기능은 미완성**이다. 개발 데모에서 틀린그림과 의미 선택을 일부 체험할 수 있으나, 프로덕션 앱은 의도적으로 예외를 던지고, 펫 UI는 렌더되지 않으며, 힌트 버튼은 내용을 보여 주지 않는다. 더 심각하게는 개발 전용 레지스트리의 정답 좌표와 정답 ID가 웹 프로덕션 산출물에 포함된다.

따라서 현 상태를 “기능 구현 완료” 또는 “배포 가능”으로 표시하면 안 된다. 권고 준비도는 다음과 같다.

| 기능 | 현재 준비도 | 판정 |
|---|---:|---|
| 개발용 틀린그림 플레이 | 60% | 기본 탭·중복 방지·퀴즈 전환은 동작하지만 레지스트리 드리프트, 힌트, 점수, 오답/생명, 프라이버시가 미완성 |
| 제품용 틀린그림 플레이 | 15% | `apps/mobile/app/index.tsx`가 프로덕션에서 예외를 던지고 서버 세션이 연결되지 않음 |
| 단어·속담·사자성어 맞히기 | 25% | 현재는 대부분 뜻 객관식이며 제목에서 정답 단어를 미리 노출; 자유 입력·최종 정답 UI가 없음 |
| 워드 헌트 | 20% | 게임 엔진에는 규칙이 있으나 모바일이 미션 문구와 상태를 표시하지 않음 |
| 힌트/펫 코치 | 20% | 순수 힌트 엔진은 강하지만 개발 화면의 버튼은 텍스트를 표시하지 않고 컴포넌트도 미연결 |
| 펫 도감·일일 뽑기·승급 | 35% | 계약·순수 로직·SQL 테스트 골격은 있으나 모바일/HTTP/인증/구현 repository가 없음; 정책은 DRAFT |
| 학습 XP·펫 XP·뽑기 포인트 | 20% | 계산 함수와 미완성 ledger migration만 존재; 실제 잔액 반영·일일 누적 cap·정책 검증이 없음 |
| 주간 랭킹 | 30% | SQL/adapter 골격은 있으나 정책 DRAFT, 콘텐츠 전부 publish-blocked, 제품 UI/세션 배선 없음 |
| CI/릴리스 워크플로우 | 35% | 부분 테스트는 통과하지만 전체 테스트·타입·스키마·문서 게이트가 실패하고 모바일 타입검사가 CI 경로에서 빠짐 |

## 2. 확인한 구현 흐름

```text
현재 개발 흐름
catalog/drafts/images
  -> manifest.v1.json
  -> generated registry.ts (정답·좌표 포함)
  -> LearningDemoScreen (로컬 판정)
  -> 개발 전용 화면

목표 제품 흐름
승인된 public content + private solution(DB/server only)
  -> 인증된 learning attempt 시작
  -> public challenge DTO + 서명된 이미지 URL
  -> 모바일 탭/정답 intent
  -> 서버 판정 + public result projection
  -> 원자적 attempt commit
  -> 원자적 progression/pet reward
  -> 공개 필드만 있는 leaderboard projection
```

## 3. 실행 검증 결과

| 명령/검사 | 결과 | 해석 |
|---|---|---|
| `pnpm content:catalog:check` | PASS, 79 entries | 카탈로그 JSON/schema 자체는 유효 |
| `pnpm content:drift:check` | PASS with warnings | manifest 79, drafts 105, source pairs 102, registry 79; 고아 draft 26개와 다수 자산을 오류가 아닌 경고로만 처리 |
| semantic registry 비교 | FAIL, count 21건 + private hash 28건 | 현행 draft와 frozen registry의 차이를 재현 스크립트로 측정한다. 좌표·내용·hash를 하나의 26건 수치로 단정하지 않는다. |
| `pnpm mobile:contracts` | PASS, 41 tests | 선택 단위 테스트만 통과; 타입·번들 보안·실제 API 연결을 증명하지 않음 |
| `pnpm --dir apps/mobile typecheck` | FAIL | SafeArea provider와 MatchSnapshot 계약 드리프트 등 |
| `pnpm server:typecheck` | FAIL | `sql-rpc-client.ts`의 암시적 `any` 등 |
| `pnpm server:test` | PASS, 13 tests | learning 폴더만 실행하며 pets 폴더를 누락 |
| 펫 서버/계약 집중 테스트 | PASS, 27 + 17 tests | 순수 로직 및 계약은 상대적으로 견고 |
| `pnpm test` | FAIL, 29/1147 | CI 배선, 콘텐츠 겹침, schema drift, 앱 라우팅, 문서/요구사항 추적 실패 |
| `pnpm content:schemas:check` | FAIL | `schemas/game-content.private.schema.json` 드리프트 |
| `pnpm docs:check` | FAIL | gate exact-order 및 numeric approval drift |
| OpenAPI lint | PASS | 문서 형식 유효성만 증명; 실제 route 구현은 없음 |
| 웹 export | 파일 생성 후 프로세스 timeout | 179 files, 약 357 MB; 79쌍 이미지가 모두 포함됨 |
| 웹 번들 문자열 검사 | **FAIL/치명** | `privateSolutionHash`, `correctOptionId`, 전체 차이 좌표가 JS 번들에 존재 |
| Supabase local status | timeout | DB migration/pgTAP은 이번 감사에서 실행 증거를 만들지 못함 |

로컬 런타임도 프로젝트 핀과 다르다. 외부 셸은 Node 22.16.0/pnpm 11.13.0을, 중첩 `pnpm`은 Node 24.14.0/pnpm 11.16.0을 보고했으며 저장소 요구값은 Node 24.18.0/pnpm 11.13.0이다. 런타임 핀을 약화하지 말고 동일 환경에서 최종 재검증해야 한다.

## 4. 발견사항

### P0 — 출시 차단

#### F-001 비공개 정답 데이터가 제품 웹 번들에 포함됨

- `apps/mobile/app/index.tsx`의 `__DEV__` 조건 뒤에 `require('../src/learning-demo/registry')`가 있지만 Metro가 모듈과 자산을 정적으로 번들링한다.
- 산출물 JS에 `privateSolutionHash`, `correctOptionId`, 79개 팩의 차이 좌표와 정답 선택지가 그대로 존재한다.
- 현재 `production-boundary.test.ts`는 소스 코드에서 require의 위치만 검사하므로 실제 번들 누출을 잡지 못한다.
- 영향: 정답 추출, 랭크 부정행위, 357 MB 웹 산출물, 모바일 패키지 비대화.

#### F-002 프로덕션 모바일 진입점이 기능을 제공하지 않음

- `apps/mobile/app/index.tsx`는 `!__DEV__`에서 예외를 던진다.
- 별도의 로그인, 서버 연결, 학습 challenge route, `BattleScreen` 연결이 없다.
- `apps/server/package.json`의 main은 `src/index.ts`지만 해당 실행 진입점과 start script가 없다.

#### F-003 검증 게이트가 현재 빨간 상태

- 전체 테스트 29개 실패, root/mobile/server typecheck 실패, schema/docs gate 실패.
- `.github/workflows/ci.yml`의 모바일 job은 `mobile:contracts`와 web export만 실행하며 `mobile:typecheck`가 없다.
- `server:test`는 `apps/server/src/learning`만 실행하여 펫 테스트를 CI 증거에서 제외한다.
- CI의 check/database/server/mobile job 분리는 이미 존재하므로 F-003은 job 재구축이 아니라 typecheck, pets 범위, private bundle scan, semantic drift 공백을 채우는 증분 작업으로 처리한다.
- 현재 변경을 합치면 CI가 안정적으로 녹색이라는 근거가 없다.

### P1 — 핵심 기능 오동작/미연결

#### F-004 힌트 버튼이 실제 힌트를 표시하지 않음

- `currentHintText`를 계산하지만 렌더하지 않는다.
- 첫 클릭이 index 0이 아니라 1로 이동하여 올바른 ladder 구현에서도 첫 단계를 건너뛸 수 있다.
- ladder가 없는 76개 콘텐츠도 가짜 5단계를 소모하고 점수만 차감한다.
- `HintPanel`, `PetCoach`, coach charge state가 import/선언만 되고 사용되지 않는다.

#### F-005 펫 보상 UI가 실제 화면과 연결되지 않음

- `DailyFreeDraw`, `PetCollection`, `ChampionStars`, `PetCoach`가 `LearningDemoScreen`에서 import되지만 렌더되지 않는다.
- `mockPets`, `hasClaimedToday`, `coachCharges`는 사용되지 않는다.
- UI 테스트는 렌더/클릭/상태 변화가 아니라 props 객체의 숫자를 다시 확인하는 수준이다.
- `ChallengeResultBoard`는 React Native 컴포넌트 안에서 사용할 수 없는 DOM `div`, `p`, `span`을 사용한다.

#### F-006 펫 backend는 서비스가 아니라 라이브러리 골격

- `claimDailyFreeDrawV1`, `promoteDuplicateCardsV1`, `getPetCollectionV1` 순수/서비스 함수와 SQL은 존재한다.
- 실제 인증 토큰 → subject resolver, Supabase RPC repository, HTTP controller/handler가 없다.
- OpenAPI operation은 있으나 route 구현 검색 결과가 없다.
- `daily-pet-loop`, economy, pet catalog는 모두 DRAFT이므로 정상적인 production 함수는 fail-closed 해야 한다.

#### F-007 단어·속담·사자성어 “맞히기” UX가 아님

- 현재 학습 데모는 틀린그림 완료 후 의미 객관식만 제공한다.
- 헤더가 `selected.title`을 먼저 표시하여 단어/속담/사자성어 자체를 맞히는 문제라면 정답을 노출한다.
- 엔진에는 `SUBMIT_FINAL_ANSWER`가 있지만 `BattleScreen`의 intent 타입과 UI에는 최종 답 입력이 없다.
- `IDIOM`과 `GENERAL_KNOWLEDGE`는 주간 랭크 정책에서 명시적으로 disabled다. 캐주얼 지원과 랭크 지원을 구분해 설명해야 한다.

#### F-008 워드 헌트/최종 도전 엔진과 UI 불일치

- reducer는 word hunt prompt, 최종 정답, 의미 퀴즈, 점수/잠금/타이머를 처리한다.
- `BattleScreen` view model은 active mission, public answer pattern, final-answer input을 렌더하지 않는다.
- 사용자는 무엇을 찾아야 하는지 또는 어떤 단어를 제출해야 하는지 알 수 없다.

### P1 — 콘텐츠 무결성

#### F-009 registry semantic drift를 CI가 놓침

- current drafts의 difference는 79개 모두 10개지만 생성된 registry는 21개 콘텐츠가 4~9개만 포함한다.
- 재현 가능한 비교 기준으로 difference count mismatch는 21건, `privateSolutionHash` mismatch는 28건이다. 좌표/내용/해시를 합친 단일 drift 수치는 측정 정의에 따라 달라지므로 baseline 스크립트와 함께 기록한다.
- `content:drift:check`는 key 존재만 비교하고 hash/contentRevision/image hash/좌표를 비교하지 않아 PASS한다.
- 화면은 registry를 사용하므로 사용자는 draft/evidence가 아닌 낡은 좌표로 플레이한다.

#### F-010 batch build가 부분 실패 후에도 manifest/registry를 갱신함

- `tools/content/batch-build.js`는 실패 key를 모은 뒤 non-zero로 종료하지 않고 manifest/registry 생성을 계속한다.
- 중간 파일에 직접 쓰기 때문에 실패한 batch가 일관되지 않은 snapshot을 남길 수 있다.
- 26개 고아 draft와 다수의 백업/임시 이미지가 경고로만 남아 inventory 판단을 흐린다.

#### F-011 현재 콘텐츠의 원형 목표가 겹침

- root test에서 영어 3개, 속담 3개, 사자성어 1개 팩의 difference와 word-hunt/final challenge 원형 겹침이 검출됐다.
- 동일 탭이 여러 목표 후보가 되는 경우 엔진의 우선순위에 따라 잘못된 목표를 판정할 수 있다.

### P1 — 보상/DB 무결성

#### F-012 학습 progression migration이 원자적 보상 구현이 아님

- `202607300003_learning_progression.sql`은 caller가 보낸 XP/point 값을 그대로 ledger에 기록한다.
- approved policy hash/status 검증, 서버 계산 재검증, 일일 누적 cap, `profiles.exp`, `private.pet_inventory.xp`, `economy_subjects.gacha_points` 반영이 없다.
- owner/revoke/grant/RLS/outbox 보강이 없고 attempt 상태가 verified인지 함수 내부에서 확인하지 않는다.
- 문서의 `user_pets.exp`와 신규 `private.pet_inventory.xp` 중 어느 저장소가 학습 펫 XP의 SSOT인지 정리가 필요하다.

#### F-013 점수·보상 계산이 여러 군데에서 불일치

- 개발 화면 점수는 `100000 - hintIndex * 15000`만 사용한다.
- ranked verifier는 시간, wrong tap, wrong answer, hint를 모두 차감한다.
- progression은 boolean 입력으로 별도 계산하며 commit attempt와 원자적으로 묶이지 않는다.
- 결과 화면이 어느 모드/정책의 점수인지 명확하지 않다.

### P2 — 운영/품질

#### F-014 모든 학습 콘텐츠가 publish-blocked

- manifest 79개 모두 `publishBlocked: true`다.
- rankedEligible은 3개뿐이며 ENGLISH 1, PROVERB 1, IDIOM 1이다.
- weekly policy는 ENGLISH/PROVERB 각 5개를 요구하므로 현 콘텐츠로 시즌을 열 수 없다.

#### F-015 문서 상태와 제품 상태 표현이 혼재

- 일부 게임 디자인 문서는 `status: VERIFIED`지만 경제 ADR과 config는 deployment-blocked/DRAFT다.
- VERIFIED가 “요구사항 문서 검증”인지 “기능 배포 완료”인지 구분되지 않아 진척 오판 가능성이 있다.

## 5. 개선 접근안 비교

### A. 보안 경계 우선 세로 슬라이스 — 권고

개발 프리뷰를 별도 앱으로 격리하고, 검증 게이트를 녹색으로 만든 뒤, 하나의 ENGLISH 캐주얼 challenge를 서버 권위로 끝까지 연결한다. 그 다음 PROVERB/IDIOM, 펫 보상, 랭크를 추가한다.

- 장점: 정답 유출을 즉시 차단하고 각 단계가 실제 실행 가능한 제품을 남긴다.
- 단점: 첫 UI 개선이 보이기 전에 앱/서버 경계 정리가 필요하다.

### B. 데모 UI 우선

현재 `LearningDemoScreen`에 펫·힌트·퀴즈를 먼저 붙인 후 나중에 서버로 교체한다.

- 장점: 빠르게 화면 시연 가능.
- 단점: private registry와 mock state에 더 많은 코드를 얹게 되어 재작업과 보안 위험이 커진다.
- 판정: 내부 프리뷰 이외에는 비권고.

### C. DB/랭크 backend 우선

attempt, progression, weekly settlement를 먼저 완성하고 모바일은 나중에 연결한다.

- 장점: 경제/경쟁 규칙을 조기에 고정할 수 있다.
- 단점: 실제 플레이 intent와 UX 없이 잘못된 API를 고정할 위험이 있다.
- 판정: A의 세로 슬라이스와 병행 가능한 후속 트랙이지만 단독 접근은 비권고.

## 6. 실행 계획

범위가 여러 독립 subsystem에 걸치므로 아래 master plan을 실제 구현 시 네 개의 하위 계획으로 분리한다.

1. **Plan A:** private preview 격리 + CI 복구 + 콘텐츠 원자성
2. **Plan B:** 서버 권위 학습 세션 + 모바일 틀린그림/퀴즈
3. **Plan C:** 펫 runtime + progression 보상
4. **Plan D:** ranked/weekly + 운영 release evidence

Plan A는 구현 위임 전에 별도 체크리스트로 고정한다: product private import 0, export 3층 leak scan, `server:test` pets 포함, mobile typecheck 배선, semantic drift baseline, batch-build 원자성·non-zero 실패. 이 체크리스트가 닫히기 전에는 Plan B의 제품 세션을 “완료”로 표시하지 않는다.

### Task 1: 현재 baseline과 배포 차단선 고정

**Files:**
- Create: `docs/reviews/2026-08-10-feature-readiness-baseline.md`
- Modify: `docs/release-evidence-blockers.md`
- Modify: `docs/testing/test-matrix.md`
- Modify: `research.md` (inventory 날짜 스탬프와 “DEV 가드는 번들 배제가 아님” 경고만; 비규범 지위 유지)

**Produces:** 현재 실패 목록, 재현 명령, 아래 상태 사전, 현행 콘텐츠 inventory 스냅샷.

상태 사전:

| 상태 | 의미 | 로컬 테스트만으로 선언 가능? |
|---|---|---|
| `LOCAL_DEMO_ONLY` | preview 앱에서 private registry를 사용하는 개발 전용 데모 | 예 |
| `SERVER_SLICE_CASUAL` | 인증 또는 명시적 dev subject + 1개 콘텐츠 서버 권위 + private leak 0 | 부분적; DB/서버 증거 필요 |
| `REWARD_READY` | APPROVED policy + atomic award + pets runtime | 아니오; 정책 승인 필요 |
| `RANKED_READY` | ENGLISH/PROVERB 5개 이상 published + weekly pin | 아니오; 콘텐츠·권리 증거 필요 |
| `PRODUCTION_READY` | `docs/release-evidence-blockers.md`의 모든 외부 증거 종료 | 아니오 |

- [ ] 위 표의 명령을 exact Node 24.18.0/pnpm 11.13.0 환경에서 다시 실행한다.
- [ ] 결과를 exit code, test count, artifact size와 함께 baseline 문서에 기록한다.
- [ ] manifest/catalog/drafts/registry를 현행 작업트리에서 재생성해 79/105/79와 orphan 수를 날짜와 명령으로 기록하고, `research.md`의 91/95 수치는 historical snapshot으로 표시한다.
- [ ] count mismatch 21건과 private hash mismatch 28건을 재현하는 비교 스크립트를 baseline artifact로 보존한다. 좌표·내용·해시를 합친 단일 수치는 측정 정의 없이는 사용하지 않는다.
- [ ] `docs/04-Roadmap/12_IMPLEMENTATION_ROADMAP.md`의 G3A→G6 의존성에 Task 2/3a/4, Task 5a/5b/6, Task 8/9, Task 11을 각각 매핑한다.
- [ ] `DB_NOT_RUN`을 PASS로 바꾸지 말고 Supabase가 실제로 시작된 후에만 pgTAP 결과를 추가한다.
- [ ] 모든 문서의 `VERIFIED`가 문서 검증인지 배포 검증인지 상태 사전을 추가한다.
- [ ] Commit: `docs: record feature readiness baseline`

### Task 2: 개발 프리뷰를 제품 모바일에서 물리적으로 분리

**Files:**
- Create: `apps/learning-preview/package.json`
- Create: `apps/learning-preview/app/index.tsx`
- Move: `apps/mobile/src/learning-demo/*` → `apps/learning-preview/src/learning-demo/*`
- Modify: `tools/content/generate-registry.js`
- Modify: `pnpm-workspace.yaml`
- Modify: `apps/mobile/app/index.tsx`
- Create: `tests/contracts/mobile-private-bundle-boundary.test.ts`

**Interfaces:**
- Preview consumes: generated `LearningDemoEntry[]` with private coordinates.
- Product mobile consumes: only `PublicLearningChallengeV1` and `PublicLearningProjectionV1` from the server.

- [ ] 먼저 실패 테스트를 작성해 product export JS/asset manifest에서 `privateSolutionHash`, `correctOptionId`, known private hash, `learningDemoEntries`를 검색한다.
- [ ] 현재 export를 대상으로 테스트가 실패하는지 확인한다.
- [ ] preview 앱을 별도 workspace/entry graph로 이동하고 registry generator output을 preview 경로로 바꾼다.
- [ ] `apps/mobile/app/**`의 정적 `LearningDemoScreen` import/type import와 registry `require`를 모두 제거해 product graph에서 preview/registry/content source로 향하는 import·require·re-export를 0개로 만든다.
- [ ] source graph, export asset manifest, bundle string의 3층 leak test를 모두 통과시킨다. `__DEV__` 런타임 throw만으로 번들 배제를 주장하지 않는다.
- [ ] product web export를 생성하고 leak test가 PASS인지 확인한다.
- [ ] product artifact 크기 budget을 정하고 CI에서 초과 시 실패시킨다. 초기 상한은 private assets 제거 후 측정값의 120%로 고정한다.
- [ ] Commit: `security: isolate private learning preview from product bundle`

### Task 3: TypeScript, lint, schema, package CI를 3a/3b 트랙으로 복구

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `apps/mobile/tsconfig.json`
- Modify: `apps/server/src/learning/sql-rpc-client.ts`
- Modify: `.github/workflows/ci.yml`
- Regenerate: `schemas/game-content.private.schema.json`
- Modify tests under `tests/specs/ci-package-verification.test.ts`

**Produces:** 보안·회귀를 먼저 막는 3a 최소 게이트와, 기존 29개 실패를 병렬로 닫는 3b full-green 트랙. 3b 완료 전에도 Slice-0는 3a의 차단선을 통과하면 진행할 수 있다.

#### Task 3a — CI-min (세로 슬라이스 차단선)

- [ ] `apps/server/package.json`의 `test`(`src/**/*.test.ts`)와 root `package.json`의 `server:test`(현재 `apps/server/src/learning`)는 서로 다른 범위임을 contract test와 문서에 명시한다.
- [ ] `server:test`를 `vitest run apps/server/src`로 바꾸어 pets와 learning을 모두 포함한다.
- [ ] `mobile:typecheck`를 `tsc -p apps/mobile/tsconfig.json --noEmit`으로 추가한다.
- [ ] `mobile:contracts`를 `apps/mobile/src`와 `apps/mobile/app` 전체로 확장한다.
- [ ] product export 후 private asset/string scan을 CI 필수 게이트로 배선한다.
- [ ] pets pure/contract tests가 server job에 포함되는지 확인한다.

#### Task 3b — Full-green (병렬 품질 트랙)

- [ ] `mobile:check = contracts + typecheck + web build + private bundle scan`으로 만든다.
- [ ] NodeNext 패키지와 Expo bundler app을 별도 tsconfig project로 검사하여 extension 규칙 충돌을 제거한다.
- [ ] 암시적 `any`, unused import/state, `SafeAreaProvider`, snapshot fixture 타입 드리프트를 수정한다.
- [ ] schema-first source에서 JSON schema를 재생성하고 drift check를 PASS시킨다.
- [ ] root test의 29개 실패를 원인별로 닫고 timeout 테스트는 기능 timeout과 test runner timeout을 분리한다.
- [ ] Commit: `ci: enforce mobile server and schema verification`

### Task 4: 콘텐츠 build를 원자적이고 의미론적으로 검증

**Files:**
- Modify: `tools/content/batch-build.js`
- Modify: `tools/content/check-content-drift.js`
- Modify: `tools/content/generate-registry.js`
- Modify: `tools/content/learning-manifest.ts`
- Create: `tools/content/validate-learning-inventory.ts`
- Add tests beside each tool.

**Produces:** `validateLearningInventory(): { ok: boolean; errors: string[]; warnings: string[]; counts: ... }`.

- [ ] drift checker가 key뿐 아니라 contentRevisionId, privateSolutionHash, image hashes, difference count/coordinates, hint admission hash를 비교하는 실패 테스트를 작성한다.
- [ ] baseline 스크립트가 count mismatch 21건과 private hash mismatch 28건을 재현하는지 확인하고, 좌표/내용/해시 비교 정의를 테스트에 고정한다.
- [ ] batch build를 임시 디렉터리에 생성하고 모든 key가 성공한 경우에만 manifest/preview registry를 rename하도록 바꾼다.
- [ ] 한 key라도 실패하면 manifest/registry가 byte-for-byte 유지되고 exit code가 non-zero인지 테스트한다.
- [ ] 26개 orphan draft와 backup/source 파일에 `ADMIT`, `ARCHIVE`, `DELETE_AFTER_REVIEW` inventory disposition을 부여한다.
- [ ] 겹치는 difference/word-hunt/final circles를 고치고 해당 7개 콘텐츠 회귀 테스트를 PASS시킨다.
- [ ] 모든 79개 draft를 실제로 순회 검증하는 명령을 CI에 추가한다. 테스트 fixture만 검사하는 기존 명령과 이름을 구분한다.
- [ ] Commit: `content: make learning inventory atomic and drift-safe`

### Task 5: 실행 가능한 서버와 인증된 학습 세션 경계 구현 (5a/5b)

Task 5는 인증을 내부 체크박스로 숨기지 않는다. 별도 auth 계획의 production verifier/opaque subject가 아직 완성되지 않았으므로, 먼저 5a를 닫은 뒤 5b 학습 세션을 구현한다. 게스트 또는 dev subject로 진행하는 경우 상태를 `LOCAL_SERVER_SLICE`로 명시하고 production claim과 분리한다.

단기 HTTP 구현체는 기존 admin/runtime 패턴 또는 최소 Hono/Fastify 중 하나를 ADR로 고정한다. NestJS 모듈/DI 트리와 Socket.IO match 서버를 이 캐주얼 Slice-0의 선행 조건으로 새로 스캐폴드하지 않는다. 권위 판정은 기존 `packages/learning-competition`과 SQL RPC 경계를 계속 사용한다.

**Files:**
- Create: `apps/server/src/index.ts`
- Create: `apps/server/src/learning/http/learning-controller.ts`
- Create only if needed: `apps/server/src/learning/learning-service.ts` (기존 `attempt-repository`, `attempt-verifier`, `attempt-session`, `leaderboard` 확장 우선)
- Create: `apps/server/src/auth/authenticated-subject.ts`
- Modify: `apps/server/package.json`
- Create: `packages/contracts/src/learning-session.ts`
- Modify: `packages/contracts/src/index.ts`
- Extend: `packages/contracts/openapi.yaml`

#### Task 5a — JWT 검증과 opaque subject

- [ ] `2026-07-19-supabase-auth-integration-plan.md`의 issuer/audience/clock-skew 계약을 재사용하고, REST와 향후 Socket이 동일 verifier를 소비하게 한다.
- [ ] invalid/anonymous/unverified/ready subject의 401/403/503/허용 gate를 테스트한다.
- [ ] 클라이언트가 subjectKey/economy key를 지정할 수 없고, JWT·auth UUID가 public projection/receipt에 노출되지 않음을 검증한다.
- [ ] `/health`(또는 `/v1/me` stub)로 runtime wiring을 먼저 증명한다.

#### Task 5b — 권위적 learning attempt/session

**Interfaces:**

```ts
type PublicLearningChallengeV1 = {
  attemptId: string;
  category: 'ENGLISH' | 'PROVERB' | 'IDIOM' | 'GENERAL_KNOWLEDGE';
  imageA: { url: string; sha256: string; width: number; height: number };
  imageB: { url: string; sha256: string; width: number; height: number };
  differenceCount: number;
  mode: 'CASUAL' | 'RANKED';
  expiresAt: string;
};

type LearningIntentV1 =
  | { type: 'TAP_IMAGE'; side: 'A' | 'B'; x: number; y: number; clientSeq: number }
  | { type: 'USE_HINT'; expectedOrdinal: 1 | 2 | 3 | 4 | 5; clientSeq: number }
  | { type: 'SUBMIT_FINAL_ANSWER'; answer: string; clientSeq: number }
  | { type: 'SUBMIT_MEANING'; optionId: string; clientSeq: number };
```

- [ ] production startup이 DRAFT policy/content를 fail-closed 하는 테스트를 먼저 작성한다.
- [ ] 5a에서 검증된 bearer subject를 live economy/learning subject에 매핑하고 클라이언트가 subjectKey를 지정할 수 없게 한다.
- [ ] 시작 응답에서 private field recursive allow-list test를 통과시킨다.
- [ ] 동일 clientSeq/idempotency key replay와 conflicting payload를 구분한다.
- [ ] TAP/힌트/정답을 기존 game engine/learning competition 규칙에 위임하고 public projection만 반환한다.
- [ ] Slice-0 casual은 leaderboard/progression commit을 호출하지 않고, ranked 경로만 verified attempt commit으로 이어지는 spy test를 추가한다.
- [ ] Commit: `feat(server): add authoritative learning sessions`

### Task 6: 제품 모바일에 서버 권위 learning UI 연결 (Slice-0/Slice-1)

**Files:**
- Modify: `apps/mobile/app/index.tsx`
- Create: `apps/mobile/src/features/learning/LearningGameScreen.tsx`
- Create: `apps/mobile/src/features/learning/useLearningSession.ts`
- Modify: `apps/mobile/src/ui/BattleScreen.tsx`
- Modify: `apps/mobile/src/ui/battle-shell.ts`
- Replace DOM in `apps/mobile/src/features/leaderboard/ChallengeResultBoard.tsx`

**Consumes:** `PublicLearningChallengeV1`, `LearningIntentV1`, public server projections.

#### Slice-0 — `en-resilience` CASUAL FIND→MEANING

- [ ] content key를 `en-resilience`(ADMITTED + hint ladder 존재)로 고정하고 mode는 `CASUAL`만 허용한다.
- [ ] public image preload → 서버 권위 10 differences 판정 → meaning choice → public result만 연결한다.
- [ ] Slice-0에서는 leaderboard write와 progression award를 호출하지 않는다(DRAFT fail-closed).
- [ ] 로그인/로딩/정책 차단/오프라인/재연결/만료 상태를 렌더하는 component tests를 작성한다.
- [ ] 이미지 contain 영역 기준 좌표 변환을 공통 함수 하나로 사용하고 web/native 이벤트 분기를 타입 안전하게 만든다.
- [ ] 차이 개수, 진행률, timer, wrong taps/lives를 서버 projection에서 표시한다. 숫자 10, 생명 5를 UI에 하드코딩하지 않는다.
- [ ] 헤더/카피에서 `selected.title` 또는 canonical answer를 문제 전에 노출하지 않는 회귀 테스트를 추가한다.

#### Slice-1 — 확장 모드

- [ ] word-hunt active prompt와 남은 시간을 표시한다.
- [ ] final challenge에서 masked public pattern과 text input을 표시하고 `SUBMIT_FINAL_ANSWER`를 보낸다.
- [ ] 의미 객관식은 final answer가 맞은 뒤에만 표시한다.
- [ ] 모든 결과 컴포넌트를 RN `View/Text/Pressable`로 통일한다.
- [ ] PROVERB/IDIOM과 word hunt/final answer를 각각 1개 이상 end-to-end contract test로 확장한다.
- [ ] Slice-1의 ranked/보상 연결은 승인된 policy와 Task 8~10 완료 후에만 연다.

- [ ] Commit: `feat(mobile): complete authoritative learning game flow`

### Task 7: 퀴즈 의미와 카테고리 UX를 명확히 분리

**Files:**
- Modify: `packages/contracts/src/content.ts`
- Modify: `content/learning/catalog.schema.json`
- Modify: content authoring/validator tests.
- Modify: mobile learning screen copy.

**Produces:** category별 challenge specification.

- [ ] ENGLISH는 `WORD_FROM_MEANING` 또는 `MEANING_FROM_WORD` 중 하나를 콘텐츠에 명시한다.
- [ ] PROVERB/IDIOM은 `ANSWER_EXPRESSION`과 `MEANING_CHOICE`를 두 단계로 분리한다.
- [ ] 제목/헤더가 답 표현을 문제 전에 노출하지 않는 회귀 테스트를 작성한다.
- [ ] aliases와 띄어쓰기/대소문자/한글 정규화는 기존 answer normalization 한 곳에서만 처리한다.
- [ ] IDIOM/GK의 casual 지원 여부와 ranked disabled 상태를 UI badge/copy로 구분한다.
- [ ] Commit: `feat(learning): define category-specific answer flows`

### Task 8: 펫 도감·일일 뽑기·승급을 실제 API에 연결

**Files:**
- Extend the existing pure pet services (`daily-draw.ts`, `duplicate-promotion.ts`, `showcase.ts`) with concrete repositories under `apps/server/src/pets/repositories/` only where transport is missing.
- Add HTTP handlers under `apps/server/src/pets/http/`; do not duplicate pure policy logic.
- Modify: `apps/mobile/src/features/pets/PetCollection.tsx`
- Modify: `apps/mobile/src/features/pets/DailyFreeDraw.tsx`
- Create: `apps/mobile/src/features/pets/PetHubScreen.tsx`
- Extend server/mobile integration tests.

**Consumes:** existing `dailyFreeDrawV1Schema`, `duplicatePromotionV1Schema`, `petCollectionV1Schema`.

- [ ] Supabase RPC transport가 `claim_daily_free_draw_v1`와 `promote_duplicate_cards_v1`의 이름·인자를 정확히 매핑하는 contract test를 작성한다.
- [ ] KST date는 서버에서만 계산하고 동시 20회 claim이 같은 receipt를 반환하는 DB test를 실행한다.
- [ ] 선택/잠금 펫을 승급 재료에서 제외하고 11/10/1 불변식을 TS와 pgTAP 양쪽에서 검증한다.
- [ ] 모바일은 optimistic inventory mutation을 하지 않고 receipt 후 query cache를 갱신한다.
- [ ] DRAFT policy이면 버튼을 숨기거나 “준비 중”으로 표시하고 가짜 로컬 보상을 지급하지 않는다.
- [ ] PetCollection은 total 0 division, duplicate rows, unknown catalog pet, 접근성 동작을 테스트한다.
- [ ] Commit: `feat(pets): connect collection draw and promotion runtime`

### Task 9: 학습 progression을 원자적 보상 transaction으로 재설계

**Files:**
- Create a new migration after `202607300003_learning_progression.sql`; never modify or overwrite the existing migration.
- Modify: `apps/server/src/learning/progression.ts`
- Create: `apps/server/src/learning/progression-repository.ts`
- Modify: `docs/decisions/learning-economy-source-model.md`
- Add pgTAP/concurrency tests.

**Produces:** `commit_verified_learning_reward_v1(attempt_id, expected_policy_hash)`; 클라이언트/일반 server code가 award 숫자를 전달하지 않는다.

- [ ] 함수가 COMPLETED_VERIFIED attempt, owner subject, selected pet, approved immutable policy hash를 DB에서 다시 읽도록 한다.
- [ ] first completion, all correct, no hint, personal best 여부와 award 값을 trusted DB/server policy로 계산한다.
- [ ] KST 일일 누적 Account XP 200, Pet XP 100, Draw Points 100을 기존 지급액과 함께 잠그고 cap한다.
- [ ] ledger, `profiles.exp`, 선택한 canonical pet XP 저장소, `economy_subjects.gacha_points`, outbox를 한 transaction으로 갱신한다.
- [ ] 동일 attempt replay는 같은 receipt를 반환하고 다른 policy hash replay는 conflict로 닫는다.
- [ ] DRAFT/QUARANTINED/EXPIRED attempt가 모든 balance/ledger/outbox를 0건 변경하는지 검증한다.
- [ ] `public.user_pets.exp`와 `private.pet_inventory.xp` 중 하나를 SSOT로 결정하고 migration/ADR/DTO를 일치시킨다.
- [ ] Commit: `feat(economy): award learning progression atomically`

### Task 10: 랭크/주간 시즌과 보상 연결

**Files:**
- Complete server adapters in `apps/server/src/learning/`.
- Create: `tools/pin-weekly-challenges.ts`
- Modify mobile leaderboard components.
- Extend `supabase/tests/database/learning-competition.test.sql`.

- [ ] ENGLISH와 PROVERB 각각 최소 5개의 rights/education-approved, PUBLISHED, 5-step admitted revision이 없으면 dry-run이 실패하도록 한다.
- [ ] season pin CLI는 기본 dry-run이며 exact content/policy/catalog hash를 출력한다.
- [ ] start/attest/commit RPC 상태를 OPEN, EXPIRED, QUARANTINED, COMPLETED_VERIFIED, replay, conflict로 매핑한다.
- [ ] leaderboard는 공개 view의 allow-list 필드만 반환한다.
- [ ] best verified tuple이 개선될 때만 official record를 교체한다.
- [ ] rank 1 rare-only ticket settlement가 effect-once이고 direct draw pity에 영향을 주지 않는지 검증한다.
- [ ] IDIOM/GK는 정책 승인 전 ranked route에서 명시적 disabled 응답을 반환한다.
- [ ] Commit: `feat(ranked): complete weekly learning competition`

### Task 11: 운영 릴리스 증거 수집

**Files:**
- Modify: `docs/release-evidence-blockers.md`
- Create runbooks/evidence manifests under `docs/testing/reports/`.

- [ ] clean checkout에서 exact runtime `pnpm verify`를 PASS시킨다.
- [ ] iOS/Android 실기기에서 tap geometry, text scale 200%, VoiceOver/TalkBack, reconnect, background/resume를 검증한다.
- [ ] private string bundle scan을 signed release artifact에도 실행한다.
- [ ] DB backup/PITR/restore drill과 pet/reward ledger reconciliation을 수행한다.
- [ ] Sentry/PostHog redaction, 전송, 삭제 증거를 수집한다.
- [ ] target region 30-minute soak 및 fault/replay test를 실행한다.
- [ ] 권리/교육 승인자가 content revision/hash별 승인 기록을 남긴다.
- [ ] 모든 외부 증거가 닫히기 전 `PRODUCTION_READY`를 표시하지 않는다.

## 7. 완료 정의

### Slice-0 / `SERVER_SLICE_CASUAL` 완료

- product mobile export에서 private answer/coordinate 문자열 0건.
- Task 3a의 server/mobile 최소 게이트와 product bundle 3층 scan이 PASS한다. 전체 `pnpm check`는 3b 품질 트랙의 별도 결과로 기록한다.
- `en-resilience` CASUAL 세션이 인증/명시적 subject → 이미지 preload → 서버 권위 10개 찾기 → meaning choice → public result까지 완료된다.
- Slice-0에서는 leaderboard/progression/pet reward write가 0건이다.
- `SERVER_SLICE_CASUAL` 상태를 선언할 때 DB/RPC 증거와 private leak 0을 함께 링크한다.

### Slice-1 기능 완료

- PROVERB/IDIOM 및 word hunt/final answer가 각자 공개 UI·정답 비노출·계약 테스트를 통과한다.
- `pnpm check`, `pnpm server:check`, `pnpm mobile:check`, `pnpm check:db` PASS 결과를 3b/full-green 증거로 기록한다.
- ENGLISH/PROVERB/IDIOM 세션의 보상 receipt는 APPROVED policy와 Task 8~9 완료 이후에만 허용한다.
- pet collection → daily draw → duplicate promotion이 실제 receipt와 inventory 갱신으로 완료된다.
- DRAFT policy에서 reward/leaderboard write 0건.

### 랭크 기능 완료

- approved/published 콘텐츠 ENGLISH 5, PROVERB 5 이상.
- 서버 검증 score와 BEST_COMPLETED_VERIFIED leaderboard가 재시도/동시성에서도 안정적.
- weekly settlement effect-once와 public-field privacy tests PASS.

### 프로덕션 완료

- `docs/release-evidence-blockers.md`의 외부 차단 항목이 실제 증거 링크와 승인자로 닫힘.
- 로컬 PASS 문구만으로 프로덕션 준비 상태를 선언하지 않음.

## 8. 권고 실행 순서

```text
즉시 차단: F-001 private bundle leak
  -> Task 1 baseline
  -> Task 2 preview 격리
  -> Task 3a CI-min (3b와 병행)
  -> Task 4 content atomicity
  -> Task 5a auth/subject
  -> Task 5b + Task 6 Slice-0 (en-resilience CASUAL FIND→MEANING)
  -> Task 7 카피/정답 비노출 회귀
  -> Task 6 Slice-1 word hunt/final/PROVERB·IDIOM
  -> Task 8-9 pets/progression
  -> Task 10 ranked/weekly
  -> Task 3b full-green 병행
  -> Task 11 external release evidence
```

로드맵 매핑은 다음처럼 해석한다. Slice-0와 F-001 해소는 G3A의 부분 증거일 뿐이며, 본 계획 전체 완료나 G3A→G6 종료를 의미하지 않는다.

| 본 계획 범위 | 로드맵 의미 |
|---|---|
| Task 2 + Task 3a + Task 4 + Slice-0 | G3A 부분 증거 |
| Task 5a/5b 및 realtime/match 확장 | G3B; Socket/실시간 매치는 본 캐주얼 Slice-0의 선행 조건이 아님 |
| Task 6 제품 UI goldens | G3C |
| Task 8~9 pets/progression | G4 |
| Task 10 ranked/weekly 및 rights/content 운영 | G5 진입 조건 |
| Task 11 외부 release evidence/evaluation | G5~G6 증거 |

첫 배포 가능한 중간 목표는 “펫/랭크 전체”가 아니라 **승인된 ENGLISH 1개 캐주얼 세션을 private leak 없이 서버 권위로 완료하고 보상 없이 종료하는 것**이다. 그 상태가 안정되면 동일 경계를 PROVERB/IDIOM과 펫 보상에 확장한다.
