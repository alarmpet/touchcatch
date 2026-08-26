# Production Service Readiness Implementation Plan

> **For agentic workers:** Implement this plan checkbox-by-checkbox in order. Grok: do **not** use `/execute-plan` (parallel PR DAG). Claude/Codex: use Superpowers `executing-plans` / `subagent-driven-development` only if that skill is actually loaded in the session. Launch scope is Android closed casual beta: `docs/decisions/2026-08-20-launch-scope.md`. 2026-08-24 errata and agent/CI alignment: `docs/superpowers/plans/2026-08-24-production-readiness-gap-and-agent-workflow-improvement-plan.md`.

**Goal:** 현재의 로컬 계약 검증 및 개발 미리보기 상태를, 실제 사용자가 안전하게 플레이하고 운영자가 배포·관찰·복구할 수 있는 서비스로 전환한다. 이 문서는 코드 기능 완료와 실서비스 출시 승인을 분리하며, 모든 출시 차단 증거가 닫히기 전에는 PRODUCTION_READY를 선언하지 않는다.

**Architecture:** 모바일 앱은 공개 콘텐츠와 서버 권위의 세션 상태만 소비한다. 정답·히트박스·보상 판정·랭킹 판정은 서버와 승인된 데이터 저장소에만 남긴다. 서버 HTTP 경로와 공개 OpenAPI는 하나의 계약 검사로 동기화하고, 실시간 PvP를 출시 범위에 포함할 경우 인증된 실시간 게이트웨이와 내구성 있는 상태·복구 계층을 별도 구현한다. 콘텐츠·펫·경제 정책은 서명된 승인 아티팩트와 해시가 모두 일치할 때만 활성화한다. CI, 스테이징, 서명된 모바일 바이너리, 백업 복구 훈련, 관측성, 법무 증거를 하나의 출시 판정으로 묶는다.

**Tech Stack:** pnpm 11.13.0, Node 24.18.0, TypeScript, Expo/React Native, Next.js Admin, Node Fetch HTTP runtime, Supabase/PostgreSQL, pgTAP, Vitest, GitHub Actions, OpenAPI, Sentry/PostHog 후보, Redis/Socket.IO 또는 동등한 실시간 계층.

**Spec:** docs/04-Roadmap/12_IMPLEMENTATION_ROADMAP.md, docs/release-evidence-blockers.md, docs/release-evidence-owners.md, CLAUDE.md, 그리고 이 감사 계획서.

**Audit snapshot:** 2026-08-20, D:\touchcatch 작업 트리 기준. 본 문서는 구현 권한이나 사람의 승인 권한을 대신하지 않는다.

## Global Constraints

- 이 계획서는 현재 시점의 통합 실행 기준이다. 2026-08-10 및 2026-08-11 계획의 체크박스는 과거 작업 내역으로 보존하되, 완료 판정은 체크 여부가 아니라 현재 코드와 새 증거로만 한다.
- DRAFT, PENDING, 해시 불일치, 서명자 부재, 권리 증거 부재는 계속 fail-closed여야 한다. 편의를 위해 상태 문자열만 APPROVED 또는 PUBLISHED로 바꾸지 않는다.
- 공개 모바일 번들에는 정답, private solution, canonical answer, 좌표, 히트박스, 서버 비밀값, refresh-token fixture가 포함되면 안 된다. 소스 문자열 검사가 아니라 서명 직전의 실제 산출물을 검사한다.
- 클라이언트는 사용자 식별자, 점수, 보상, 랭크, 정책 해시, 정답 또는 판정 시간을 권위 값으로 제출할 수 없다. 서버와 데이터베이스가 다시 계산하고 공개 DTO만 반환한다.
- 현재 작업 트리에는 사용자 변경 사항이 196개 있고 diff --check 경고도 존재한다. 이 계획을 실행할 때 해당 변경을 되돌리거나 삭제하지 않으며, 별도의 깨끗한 release candidate 커밋을 만든 뒤에만 출시 검증을 시작한다.
- content/learning의 orphan 초안과 원본은 증거가 될 수 있으므로 자동 삭제하지 않는다. ADMIT, HOLD, REJECT의 명시적 인벤토리 결정과 권리 근거가 없는 한 출시 입력에서 제외한다.
- check:db는 로컬 데이터베이스를 reset하는 파괴적 명령이다. 폐기 가능한 전용 DB 또는 CI 환경에서만 실행하며, 운영·공유 개발 DB에 사용하지 않는다.
- 배포 공급자, 실제 도메인, OAuth 자격증명, 법무 승인, 콘텐츠 권리 승인, 서명 키는 저장소 코드만으로 만들 수 없다. 각 항목은 책임자가 증거를 제공해야 한다.

## 1. 결론과 현재 준비도

**현재 출시 판정은 NO-GO다.** 현재 상태는 기능·계약·로컬 Android 일부 검증이 진행된 개발 단계이며, 실제 서비스로 배포 가능한 상태가 아니다. 가장 중요한 이유는 배포 빌드의 게임 경로가 사용 가능한 게임을 제공하지 않고, 모든 실제 콘텐츠·경제·펫 활성화 입력이 DRAFT 또는 승인 부재 상태이기 때문이다.

| 영역 | 판정 | 확인된 근거 | 출시 의미 |
| --- | --- | --- | --- |
| 사용자 게임 경로 | P0 NO-GO | apps/mobile/app/game/spot-difference.tsx가 learning-demo를 정적으로 import한 뒤 production에서는 __DEV__ 가 아니면 준비 중 화면을 반환한다. | 실사용자는 게임을 시작할 수 없다. |
| 번들 경계 | P0 NO-GO | 같은 경로가 preview registry를 import하고, 그 registry는 title, correctOptionId, hintUnits 및 로컬 이미지 의존성을 가진다. 기존 production-boundary test는 이 import를 금지하지 않고 오히려 기대한다. | 실제 release bundle에 private 학습 정보가 없는지 아직 증명되지 않았다. 이는 유출 확정이 아니라 경계 보증 실패다. |
| 콘텐츠·정책·펫 아트 | P0 NO-GO | learning manifest 79개 모두 publishBlocked이고 catalog 79개 모두 DRAFT다. 경제, 일일 펫, 주간 경기, 학습 progression, hint 정책, runtime art, rights evidence, trusted signer registry도 DRAFT 또는 비어 있다. | 서버의 fail-closed 동작은 올바르지만 활성 서비스가 될 수 없다. |
| API와 제품 약속 | P0 NO-GO | packages/contracts/openapi.yaml은 21 path / 23 operation을 공개하지만 apps/server/src/http/router.ts는 healthz와 **10**개 `/v1` 경로만 매핑한다. Socket.IO/Redis/BullMQ 실행 구현도 없다. | 문서상 펫·매치·친구방·실시간 PvP를 제공한다고 해도 현재 런타임은 제공하지 못한다. 1차 안드로이드 베타는 PvP 경로를 숨기거나 공개 계약에서 제거한다. |
| 배포·운영 | P0 NO-GO | CI는 check, DB, server, mobile 검증까지만 수행하며 스테이징/프로덕션 배포, 롤백, 아티팩트 서명, 인프라 정의가 없다. | 재현 가능한 배포와 장애 복구가 보장되지 않는다. |
| 모바일 릴리스 | P0 NO-GO | versionName은 0.0.0, versionCode는 1이며 Android release가 debug signingConfig를 사용한다. iOS native/배포 결정도 없다. | 스토어 또는 외부 테스터용 신뢰 가능한 바이너리를 만들 수 없다. |
| 관측성·복구 | P0 NO-GO | Sentry/PostHog 환경변수와 analytics 계약은 있으나 앱·서버 delivery adapter와 실제 전송 증거가 없다. production DB backup/PITR/restore drill도 BLOCKED_EXTERNAL이다. | 출시 후 오류·성능·보상 이상을 탐지하거나 복구했다는 근거가 없다. |
| 개인정보·법무 | P0 NO-GO | retention, legal basis, delete-versus-redact, legal hold 승인 부재가 docs/operations/quarantine-policy-input.md에 명시되어 있으며 제품 내 account deletion, privacy policy, terms 흐름이 확인되지 않는다. | 인증 사용자 대상 공개 서비스의 필수 운영·법무 판단이 미완료다. |
| 자동 검증 신뢰성 | P1 BLOCKED | 직접 고정 런타임의 lint/typecheck는 통과했으나 root check의 재귀 corepack pnpm이 Codex fallback Node 24.19/pnpm 11.19로 돌아가 엔진 게이트에서 멈춘다. 전체 테스트는 1,571개 중 traceability test 1개가 동시 실행 시 10초 timeout을 냈고, 단독/해당 파일 실행은 통과했다. | 깨끗한 release candidate의 한 번의 재현 가능한 전체 PASS가 없다. |
| 작업 트리·문서 진실성 | P1 BLOCKED | 작업 트리 196개 변경, diff --check의 EOF 빈 줄 5건이 있고, 일부 architecture 문서는 VERIFIED 표기와 달리 실시간·provider adapter를 아직 planned로 설명한다. | 릴리스 기준점과 문서의 증거 수준을 분리해야 한다. |

### 이미 갖춘 기반

- Node/pnpm 버전 계약, 기본 GitHub Actions, lint/typecheck, secret scan, OpenAPI lint, 콘텐츠 스키마·카탈로그 검사가 있다.
- Supabase JWT JWKS 검증, CORS/본문 크기 제한, 제한된 PostgreSQL 역할과 fail-closed policy loader, 펫·랭킹·학습 attempt HTTP 수직 슬라이스가 구현되어 있다.
- admin은 역할·CSRF·idempotency·감사 로그를 고려한 게시 프로토콜을 갖고 있으며, contracts의 analytics privacy parser도 존재한다.
- 콘텐츠의 public/private 분리 의도와 derived hitbox 산출물은 있다. 다만 현재는 개발 미리보기 경로와 실제 배포 경로가 분리되지 않았다.

따라서 계획의 목적은 기반을 다시 만드는 것이 아니라, 개발용 경계를 제거하고 실제 출시 입력·운영 증거·런타임 범위를 일관되게 완성하는 것이다.

## 2. 이전 작업 내역의 정합성 처리

- 2026-08-24 재실측과 정오표는 docs/superpowers/plans/2026-08-24-production-readiness-gap-and-agent-workflow-improvement-plan.md에 있다. 라우터는 9개가 아니라 10개 `/v1` 경로이고, tap idempotency는 주석(키 없음)과 핸들러/OpenAPI(UUID 필수)가 모순이다. owners 파일은 docs/operations/release-evidence-owners.md이다. blockers의 “nine-pack”은 catalog 79개다. CLAUDE.md 25/79는 역사 사고치이며 현재 derived는 개발 미리보기 usable을 다시 계산한다.
- docs/superpowers/plans/2026-08-10-feature-readiness-audit-and-improvement-plan.md의 서버 권위 학습 세션, 콘텐츠 원자성, 운영 증거 과제는 아직 유효하다. 현 코드에는 일부 HTTP attempt 구현이 생겼지만 production UI와 release evidence까지 닫히지 않았다.
- docs/superpowers/plans/2026-08-11-production-pet-ranking-runtime-completion-plan.md의 JWT, HTTP bridge, pet/ranking projection 관련 설계는 현재 코드에서 부분적으로 관찰된다. 그러나 정책·아트·rights가 DRAFT이므로 이를 완료된 서비스 기능으로 표시하지 않는다.
- docs/release-evidence-blockers.md의 exact runtime, signed build, DB 복구, CDN/rights/legal, physical devices, analytics delivery, 200-match/400-socket soak은 모두 아직 외부 또는 환경 증거가 필요한 gate다.
- 이 문서의 작업 패키지는 위 계획을 삭제하지 않고, 중복 작업을 줄이기 위해 출시 우선순위와 의존성을 다시 정렬한다.

## 3. 출시 범위 결정 게이트

코드를 더 넓게 구현하기 전에 Product Owner와 Engineering Owner가 아래 문서를 승인한다.

생성할 기록: docs/decisions/2026-08-20-launch-scope.md

| 선택지 | 권장 용도 | 출시 전에 반드시 충족할 것 | 포함하지 않는 것 |
| --- | --- | --- | --- |
| Android 비공개 베타 | 현재 상태에서 가장 짧고 안전한 사용자 검증 경로 | 서버 권위 casual 학습 세션, 승인된 최소 콘텐츠 풀, 실제 signed Android build, auth, privacy/legal, observability, DB 복구, device QA | 실시간 PvP, 랭킹 보상, 펫 경제가 아직 승인되지 않았다면 해당 UI·카피·API를 숨긴다. |
| 공개 PvP 서비스 | 현재 제품 포지셔닝을 그대로 출시 | 비공개 베타 요건 전부와 실시간 match/queue/friend room, Redis 또는 동등한 내구성 계층, reconnect/replay, abuse 제어, 200-match/400-socket soak | 임시 local score, preview ghost, 문서에만 있는 socket 계약 |
| iOS 동시 출시 | 플랫폼 동시 런칭 | 위 선택 범위의 기능 외에 iOS native build/signing, 실제 iOS OAuth 정책 결정, physical iOS accessibility 증거 | Android 결과만으로 iOS 적합성을 추정하는 것 |

**결정 (2026-08-24):** Android 비공개 베타 + 서버 권위 casual 학습 세션. 실시간 PvP·랭킹 보상·펫 경제·iOS는 독립 게이트. 기록: docs/decisions/2026-08-20-launch-scope.md. 마케팅이나 스토어 설명에서 PvP 또는 보상을 약속할 경우 해당 기능은 선택이 아니라 P0이 된다.

## 4. 작업 패키지와 완료 기준

### WP-0. 출시 기준선과 책임자 확정

**우선순위:** P0
**의존성:** 없음
**책임:** Product Owner, Engineering Owner, Release Manager

- [x] docs/decisions/2026-08-20-launch-scope.md에 출시 지역, 플랫폼, 베타/공개 여부, PvP 포함 여부, 지원 시간, 목표 동시성, 허용 가능한 장애 기준, 중단 조건을 명시한다. (2026-08-24: Android 비공개 캐주얼. 실명 운영자/법무 승인은 아직 비움.)
- [ ] docs/operations/release-evidence-owners.md에 각 gate의 실명 역할, 승인 권한, 증거 저장 위치, 만료일을 추가한다. 코드 에이전트가 사람의 승인자 이름이나 날짜를 임의로 채우지 않는다.
- [x] 현재 사용자 변경을 기능 단위로 검토하여 release candidate에 포함할 변경과 별도 후속 변경을 결정한다. 이 단계는 reset, checkout, 자동 삭제를 수행하지 않는다. 분류: docs/reviews/2026-08-24-working-tree-disposition.md.
- [ ] 새 clean commit에서 git status --porcelain이 비어 있고 git diff --check가 0건인 상태를 release candidate 기준선으로 기록한다. 현재의 5개 EOF 빈 줄 경고는 해당 파일 소유자가 처리한 뒤에만 기준선에 포함한다.
- [ ] docs/release-evidence/<release-id>/baseline.json에 commit SHA, Node/pnpm 버전, lockfile hash, 대상 환경, 빌드 담당자를 기록한다.

**완료 증거:** 범위 승인 문서, 깨끗한 immutable commit, release candidate ID, 책임자 표가 모두 존재한다.

### WP-1. 재현 가능한 검증 게이트 복구

**우선순위:** P0
**의존성:** WP-0의 clean candidate
**대상 파일:** package.json, tools/check-runtime.mjs, 새 tools/run-pnpm.mjs, .github/workflows/ci.yml, tests/specs/traceability.test.ts, tools/check-docs.mjs, 필요 시 tools/write-release-blockers.mjs

- [x] 현재 환경 문제를 테스트로 고정한다. 부모 pnpm이 Node 24.18.0/pnpm 11.13.0일 때 모든 하위 check 명령도 같은 node executable과 pnpm entrypoint를 사용하는지를 검증한다. (`tests/contracts/runtime-wrapper.test.ts`)
- [x] package.json의 재귀 corepack pnpm 체인을, 현재 실행 중인 pnpm의 npm_execpath와 process.execPath를 명시적으로 전달하는 tools/run-pnpm.mjs wrapper로 바꾼다. wrapper는 먼저 tools/check-runtime.mjs를 통과하지 못하면 하위 명령을 실행하지 않는다.
- [x] check:db를 release gate와 분리한다. 이름에 destructive/local-reset 성격을 드러내고, 전용 DB임을 명시적으로 확인하는 환경 플래그가 없으면 실행을 중단하도록 한다. CI의 ephemeral Supabase DB에서는 `TOUCHCATCH_ALLOW_LOCAL_DB_RESET=1`로 계속 실행한다.
- [x] traceability test가 docs/testing/reports/release-blockers.v1.json 같은 공유 파일을 수정하지 않게 만든다. tools/check-docs.mjs에 `--release-blockers=`를 주입하고, 테스트는 임시 사본만 변경한다.
- [ ] traceability test의 timeout 증가는 마지막 수단으로만 사용한다. 먼저 공유 파일 mutation과 병렬 경쟁을 제거하고, 전체 test를 최소 세 번 연속 실행하여 flaky failure가 사라졌음을 증명한다.
- [ ] CI가 로컬과 동일한 wrapper를 호출하도록 바꾸고, CI 로그에 Node/pnpm 실제 경로와 버전을 출력한다.

**TDD 검증:**

- [ ] wrapper 적용 전에는 하위 스크립트가 fallback Node 24.19.0/pnpm 11.19.0을 발견하는 회귀 테스트가 실패해야 한다.
- [ ] 적용 후 고정 Node 24.18.0/pnpm 11.13.0으로 실행한 check와 CI check가 같은 runtime report를 낸다.
- [ ] tests/specs/traceability.test.ts 단독, 해당 spec 파일 전체, 전체 pnpm test를 각각 반복 실행한다.
- [ ] clean candidate에서 pnpm check, 전용 DB에서 pnpm check:db, pnpm verify가 모두 PASS한다.

**완료 증거:** 세 번의 연속 전체 test PASS, runtime report, DB 검증 로그, CI run URL 또는 artifact, 0개 flaky retry.

### WP-2. 실제 production 게임 경로와 private-content 번들 경계 구현

**우선순위:** P0
**의존성:** WP-0, WP-1, WP-3의 공개 attempt 계약
**대상 파일:** apps/mobile/app/game/spot-difference.tsx, apps/mobile/app/game/answer.tsx, apps/mobile/src/features/learning/attempt-client.ts, apps/mobile/src/features/learning/ranked-session-controller.ts, 새 apps/mobile/src/features/learning/AuthoritativeLearningSessionScreen.tsx, apps/mobile/src/learning-demo/production-boundary.test.ts, 새 tools/check-mobile-production-boundary.mjs, 새 apps/learning-preview

- [x] apps/mobile/app/game/spot-difference.tsx에서 learning-demo, preview-home, preview-registry, LearningDemoScreen의 모든 정적·동적 import를 제거한다. production route는 AuthoritativeLearningSessionScreen만 import한다.
- [ ] 개발 데모 전체를 별도 apps/learning-preview Expo workspace로 옮긴다. content/learning/source, draft, preview registry, correctOptionId와 같은 개발용 입력은 apps/mobile의 import graph 밖에 둔다. (2026-08-24: 제품 라우트에서 분리됨. 모듈은 아직 `apps/mobile/src/learning-demo`에 테스트·생성기용으로 남음.)
- [x] AuthoritativeLearningSessionScreen은 기존 attempt-client와 ranked-session-controller를 통해 로그인 후 POST /v1/learning/attempts, assets-ready, tap, complete 흐름을 호출한다. 화면에는 서버가 반환한 공개 이미지 URL, 공개 진행 상태, 서버 timer/attempt state만 표시한다.
- [x] apps/mobile/app/game/answer.tsx의 local evaluatePreviewAnswer 경로는 서버 권위 제출 UI로 바꾸거나 expo-router에서 제거한다. 배포된 route가 로컬 정답을 판정해서는 안 된다.
- [x] 콘텐츠가 아직 비활성일 때는 이름 있는 서버 오류와 다시 시도/지원 동작을 렌더한다. 베타 출시 범위에 게임이 포함되면 단순 준비 중 화면은 허용되지 않는다.
- [x] tools/check-mobile-production-boundary.mjs를 추가해 production app route 소스와 같은 마커 목록으로 버퍼를 검사한다. 서명된 Android export 산출물 스캔은 잔여 (WP-10).
- [x] production-boundary.test.ts를 수정한다. 더 이상 preview import를 기대하지 않고, 제품 route의 import graph에 preview 모듈이 없으며 scanner가 forbidden marker를 발견하면 실패하도록 한다.

**TDD 검증:**

- [x] production route가 preview module을 import하면 실패하는 source/import-graph test를 먼저 작성한다.
- [x] 서버 attempt mock으로 signed-out, policy disabled, 시작 성공, tap 재시도, 네트워크 실패, 완료 성공 UI를 component test로 고정한다.
- [x] release Android bundle에 의도적으로 fixture canonical-answer sentinel을 주입하면 scanner가 실패하고, 정상 bundle은 통과하는 테스트를 작성한다. (소스/버퍼 스캐너. 서명 artifact는 WP-10.)
- [ ] Android signed release artifact에서 scanner, mobile:check, 실제 서버 smoke를 실행한다.

**완료 증거:** 배포 빌드에서 게임 시작부터 완료까지 서버 권위로 동작하는 물리 기기 영상·로그, bundle scan PASS, private-data scanner 결과, disabled state가 아닌 승인된 콘텐츠 session 1건의 서버 감사 기록.

### WP-3. OpenAPI, HTTP 런타임, 활성 제품 범위 동기화

**우선순위:** P0
**의존성:** WP-0
**대상 파일:** packages/contracts/openapi.yaml, packages/contracts/src/openapi.test.ts, apps/server/src/http/router.ts, apps/server/src/http/router.test.ts, 새 apps/server/src/http/router.contract.test.ts, apps/server/src/runtime.ts, packages/config/src/env.ts

- [x] packages/contracts/openapi.yaml의 공개 REST 경로를 inventory로 만든다. 각 경로를 IMPLEMENTED, HIDDEN_UNTIL_READY, REMOVED 중 하나로 분류한다. (`docs/decisions/2026-08-24-http-route-inventory.md`)
- [x] 공개 OpenAPI에는 실제 apps/server/src/http/router.ts handler가 있는 경로만 남긴다. 미구현 pets list/select/lock, gacha, fusion, queue, friend-room, showcase는 `packages/contracts/openapi.planned.yaml`로 옮긴다.
- [x] 제품이 해당 경로를 출시 범위에 포함한다면 반대로 handler, 인증, DB adapter, idempotency, DTO projection, rate limit, integration test까지 구현한다. YAML만 추가해서 완료로 표시하지 않는다. **WP-0 결정:** PvP/gacha/select-lock/showcase는 출시 범위 밖. handler를 추가하지 않고 `openapi.planned.yaml`에 둔다.
- [x] router.contract.test.ts에서 OpenAPI method/path와 runtime router의 method/path가 양방향으로 동일한지 검사한다. healthz와 비공개 admin route는 의도적으로 allow-list 처리한다.
- [x] attempt tap의 idempotency 의미를 통일한다. 핸들러와 OpenAPI가 요구하는 UUID `Idempotency-Key`를 권위로 두고 router 주석을 맞춘다. 물리적으로 다른 탭은 다른 키, 재전송은 같은 키.
- [x] apps/server/src/runtime.ts와 packages/config/src/env.ts의 환경 검증을 하나의 production config loader로 통합한다. DATABASE_URL, SUPABASE_URL, origin allow-list, host binding, Redis와 telemetry의 선택/필수 조건을 환경별로 명확히 한다. (`parseMobileApiEnv`; Redis/Sentry는 casual beta에서 선택)
- [x] healthz와 readiness를 분리한다. readiness는 DB 연결, 필요한 승인 policy, 필요한 외부 의존성의 상태를 공개하지 않는 안전한 코드로 보고한다.

**TDD 검증:**

- [x] OpenAPI에 route만 추가하거나 router에 route만 추가했을 때 contract test가 각각 실패해야 한다.
- [ ] 잘못된 origin, JWT, body size, UUID idempotency key, unknown request field, retry/replay, policy disabled 상태를 route-level integration test로 검증한다.
- [x] production config에서 loopback host, 비어 있는 allowed origins, 모순된 env 조합이 fail-closed 되는 테스트를 추가한다.

**완료 증거:** 공개 OpenAPI와 런타임 route inventory의 0건 차이, 모든 활성 endpoint의 인증·오류·재시도 contract test, 스테이징 readiness와 API smoke 결과.

### WP-4. 콘텐츠, 권리, 정책, 펫 아트의 승인 가능한 출시 파이프라인

**우선순위:** P0
**의존성:** WP-0, 법무/교육/콘텐츠 책임자
**대상 파일:** content/learning/manifest.v1.json, content/learning/catalog.v1.json, content/learning/derived-hitboxes.v1.json, content/learning/inventory.v1.json, config/trusted-approval-signers.v1.json, config/pet-runtime-art.v1.json, config/pet-rights-evidence.v1.json, docs/approvals, tools/content/batch-build.js, tools/content/check-content-drift.js

- [x] 출시할 최소 콘텐츠 풀을 명시한다. casual beta에는 최소 1개 이상의 실제 승인 revision, ranked launch에는 각 활성 category별 정책이 요구하는 수의 approved/published/pinned revision을 확보한다. **Android casual:** 영어 ADMIT 5팩 서명 (`docs/approvals/learning-content-v1-approval.json`). DB PUBLISHED 행은 배포 단계.
- [x] 콘텐츠마다 public asset hash, private solution hash, rights manifest, 교육 검토, revision ID, 승인자, 승인 시각, signer key ID를 immutable approval record로 저장한다. test-* 정체성, 누락 서명, stale hash, HTTP asset URL은 거부한다. (`tools/check-learning-content-approval.mjs`)
- [ ] trusted-approval-signers registry를 실제 공개 키와 key rotation 절차로 채우고, 서버가 환경 변수의 registry hash와 정확히 대조하게 한다. 개인 키, 원본 라이선스 문서의 비공개 내용, 사용자 정보는 저장소에 넣지 않는다.
- [ ] pet-runtime-art와 pet-rights-evidence에 활성 펫의 thumbnail/full asset URL 및 파일 hash, 출처, 사용권, 만료/철회 정보를 넣고 실제 storage/CDN object와 대조한다. 현재 빈 entries를 임의의 placeholder로 채우지 않는다.
- [x] content/learning/inventory.v1.json을 만들어 manifest에 없는 모든 draft/source pair에 ADMIT, HOLD, REJECT와 근거를 기록한다. HOLD/REJECT는 release input에서 제외하되 원본 증거는 보존한다. ADMIT 10개는 사람 권리/교육 서명 전까지 publishBlocked.
- [ ] tools/content/batch-build.js를 staged temporary output 방식으로 바꾼다. 하나라도 실패하면 manifest와 registry는 byte-for-byte 유지되고 process exit code는 non-zero여야 한다. 전부 성공하고 semantic validation을 통과할 때만 atomic rename으로 publish input을 교체한다.
- [ ] tools/content/check-content-drift.js를 확장한다. manifest key 존재 여부뿐 아니라 revision ID, public/private hash, source pair hash, image dimension, difference count, derived hitbox relation, hint admission, registry entry를 비교한다. unclassified orphan은 release check의 오류다.
- [ ] hitbox의 출시 검토는 draft private coordinates가 아닌 derived-hitboxes.v1.json과 실제 public rendering 결과를 기준으로 한다. 현재 30% 미만 diagnostic은 즉시 차단 또는 통과 판정이 아니라 visual review queue로 처리한다.
- [ ] admin publish 흐름에 실제 로그인 진입점, publisher role provisioning, 배포 환경의 audit key rotation, attestation 보관과 rollback/takedown 절차를 연결한다.

**TDD 검증:**

- [ ] batch build에서 한 key가 실패할 때 기존 manifest/registry가 byte-for-byte 유지되는 실패 테스트를 먼저 추가한다.
- [ ] stale signer, stale asset hash, missing rights evidence, unsigned approval, duplicate asset hash, unclassified orphan을 각각 거부하는 contract test를 추가한다.
- [ ] 실제 승인된 샘플 revision을 production policy loader로 읽어 enabled가 되고, DRAFT 의존성이 하나라도 있으면 해당 capability만 disabled가 되는 integration test를 추가한다.
- [ ] full content inventory, semantic drift, public asset hash fetch, visual-delta review 결과를 CI와 release evidence에 저장한다.

**완료 증거:** 실제 책임자의 서명된 approval record, storage/CDN asset inventory, atomic build failure proof, enabled production policy smoke, 각 콘텐츠의 권리·교육 승인 링크.

### WP-5. 실시간 PvP를 약속하는 경우의 실시간 플랫폼 완성

**우선순위:** 공개 PvP 출시에서는 P0, Android casual beta에서는 범위 밖
**의존성:** WP-3, WP-4, WP-7, WP-8
**대상 파일:** 새 docs/decisions/2026-08-20-realtime-runtime-adr.md, 새 packages/contracts/src/realtime-protocol.ts, 새 apps/server/src/realtime, 새 tests/load

- [ ] 현재 Fetch HTTP runtime을 확장할지 NestJS/Socket.IO로 이전할지 ADR로 결정한다. docs/02-Architecture/07_REALTIME_SERVER_SPEC.md의 planned 상태를 구현 완료로 표기하지 않는다.
- [ ] JWT verifier를 REST와 WebSocket handshake가 공유하도록 만들고, anonymous token, expired token, wrong audience, duplicate connection, room 권한 오류를 fail-closed 한다.
- [ ] match queue, ticket polling/cancel, friend-room join, presence, game command, authoritative timer, state revision, event sequence, snapshot/replay, reconnect, timeout, surrender, dispute/quarantine 상태를 protocol contract와 durable repository에 구현한다.
- [ ] Redis 또는 선택한 동등 계층은 ephemeral presence/cache 용도와 PostgreSQL의 권위 이벤트·receipt 용도를 분리한다. Redis 장애가 점수·보상·판정을 잃게 해서는 안 된다.
- [ ] command idempotency, rate limit, anti-cheat, server clock authority, outbox, dead-letter/retry, trace correlation, PII 없는 audit log를 구현한다.
- [ ] casual beta가 실시간 기능을 제외하면 socket endpoint, matchmaking CTA, PvP 카피를 앱·OpenAPI·스토어 설명에서 모두 숨긴다.

**TDD 및 부하 검증:**

- [ ] disconnect/reconnect, duplicate command, out-of-order event, timer expiry, Redis restart, process restart, DB transaction retry의 deterministic test를 먼저 만든다.
- [ ] REST/WebSocket contract compatibility test와 replay snapshot equality test를 추가한다.
- [ ] target region에서 200 active matches, 400 sockets, 30분 soak을 실행하고 latency, disconnect rate, error rate, recovery loss를 사전에 결정한 기준과 비교한다.

**완료 증거:** ADR, protocol versioned schema, 부하 테스트 원시 결과, 장애 주입 결과, 운영 대시보드, 출시 범위와 일치하는 앱/스토어 화면.

### WP-6. 펫 경제, progression, 랭킹, Admin 활성화

**우선순위:** 보상 또는 랭킹이 사용자에게 노출되면 P0, 그렇지 않으면 P1
**의존성:** WP-3, WP-4, WP-7, WP-8
**대상 파일:** apps/server/src/policy/mobile-runtime-policy.ts, apps/server/src/pets, apps/server/src/learning, apps/mobile/src/features/pets, apps/mobile/src/features/ranking, apps/admin/src/client/publish-console.tsx, apps/admin/src/server

- [ ] DRAFT 정책이 있는 현재의 disabled UX는 유지한다. 승인된 economy, daily-pet-loop, weekly-competition, learning-progression, catalog, runtime art, rights evidence가 모두 일치할 때만 관련 capability를 하나씩 켠다.
- [ ] daily draw, duplicate promotion, pet selection/lock, progression award, weekly ranking은 DB transaction과 idempotent receipt를 단일 권위로 사용한다. 모바일 optimistic score 또는 로컬 reward는 금지한다.
- [ ] progression의 source of truth, 시즌 pin, leaderboard 공개 DTO, 보상 receipt, duplicate/pity 불변식을 ADR 및 pgTAP/TypeScript 테스트에 함께 고정한다.
- [ ] Admin PublishConsole에 실제 sign-in/onboarding 흐름을 추가하고, CONTENT_PUBLISHER 역할 부여/회수, CSRF, session expiry, attestation expiry, idempotency conflict, audit log 조회를 스테이징에서 검증한다.
- [ ] 운영자는 콘텐츠 enable, rollback, takedown, policy rotation을 audit trail 없이 수행할 수 없게 한다.

**완료 증거:** 승인된 실제 policy에서 한 번의 draw/promotion/ranking 및 replay 결과가 동일한 DB receipt를 반환하는 증거, admin role 회수 후 publish 거부 증거, 공개 DTO privacy scan.

### WP-7. 인프라, DB, 스테이징과 롤백 체계

**우선순위:** P0
**의존성:** WP-0, WP-1
**대상 파일:** 새 infra, 새 deploy, docs/operations/production-environment.md, docs/operations/database-role-provisioning.md, .github/workflows/ci.yml 및 새 release workflow

- [ ] docs/operations/production-environment.md에 선택한 호스팅, 네트워크 경계, TLS 도메인, 서버/DB/스토리지 분리, 환경별 URL, secret owner, key rotation, 비용·용량 책임을 확정한다.
- [ ] 선택한 배포 대상에 대해 서버와 admin의 재현 가능한 production build definition을 infra와 deploy 디렉터리에 코드화한다. Docker, managed buildpack, provider deployment 중 하나를 명시적으로 선택하고 CI와 동일한 artifact를 promotion한다.
- [ ] staging과 production을 분리하고, production secrets는 CI logs, mobile bundle, git history에 노출되지 않게 secret manager에서 주입한다. public mobile 변수는 allow-list로 검증한다.
- [ ] migration은 forward-only deployment 절차로 운영한다. production에는 supabase db reset을 절대 호출하지 않으며, migration compatibility, connection limit, restricted role, RLS, rollback 또는 forward-fix 절차를 사전 검토한다.
- [ ] 백업 빈도, WAL/PITR 보존, 암호화, restore target, RTO/RPO를 책임자가 확정한다. staging 또는 격리 restore 환경에서 실제 restore 후 핵심 attempt/economy/ledger reconciliation을 수행한다.
- [ ] CDN/storage에 승인된 public assets만 업로드하고 content revision hash와 object hash를 배포 단계에서 대조한다. takedown/rollback은 새 immutable revision과 CDN purge evidence를 남긴다.
- [ ] CI에는 dependency vulnerability/SBOM 또는 선택한 공급망 검사를 추가하고, release workflow는 signed artifact hash, migration ID, bundle scanner 결과, smoke 결과를 attestation으로 저장한다.

**완료 증거:** staging deploy와 rollback rehearsal, production-like migration rehearsal, backup restore drill, secret scan, public endpoint TLS/API smoke, immutable artifact hash와 promotion 로그.

### WP-8. 관측성, 보안 운영, 장애 대응

**우선순위:** P0
**의존성:** WP-3, WP-7
**대상 파일:** packages/contracts/src/analytics.ts, 새 apps/server/src/observability, 새 apps/mobile/src/observability, docs/operations/incident-response.md, docs/operations/telemetry-data-handling.md

- [ ] packages/contracts/src/analytics.ts의 allow-list와 privacyScan을 실제 모바일·서버 telemetry adapter 앞에 둔다. 앱과 서버가 서로 다른 임의 event payload를 provider로 직접 보내지 못하게 한다.
- [ ] 오류 추적과 제품 analytics provider를 책임자와 함께 확정하고, SENTRY_DSN 및 EXPO_PUBLIC_SENTRY_DSN, EXPO_PUBLIC_POSTHOG_KEY 같은 환경값은 선택된 adapter에서만 사용한다.
- [ ] JWT, auth UUID, email, subject key, private solution, hitbox, precise tap coordinate, raw content source, secret header가 telemetry/log/crash report에 나오지 않는 end-to-end redaction test를 작성한다.
- [ ] API latency/error rate, auth failure, attempt completion, policy disabled, content publish, queue/reconnect, DB pool saturation, outbox/dead-letter, reward reconciliation에 대한 metrics·dashboard·alert를 만든다.
- [ ] severity, on-call owner, escalation, customer communication, rollback, data integrity check, incident postmortem 템플릿을 docs/operations/incident-response.md에 정의한다.
- [ ] rate limit, abuse detection, CORS allow-list, body-size limit, dependency update cadence, secret rotation, admin audit review, alert test를 운영 runbook으로 검증한다.

**완료 증거:** staging에서 의도적인 오류와 synthetic user flow를 발생시킨 뒤 redacted event가 provider에 전달되고 alert가 열리는 증거, dashboard link, alert acknowledgement, incident simulation 기록.

### WP-9. 인증, 개인정보, 법무, 스토어 정책의 출시 전 결정을 닫기

**우선순위:** P0
**의존성:** Product Owner, Privacy/Legal Owner, WP-7
**대상 파일:** apps/mobile/src/auth, apps/mobile/app, apps/server/src, docs/legal, docs/operations/quarantine-policy-input.md, docs/decisions/2026-08-20-launch-scope.md

- [ ] Google/Kakao OAuth의 실제 client ID, redirect URI, provider console 설정, 허용 플랫폼, staging/prod callback, 실제 계정 sign-in/sign-out/token refresh/withdrawal 테스트를 완료한다. 자격증명은 저장소에 넣지 않는다.
- [ ] iOS 출시를 결정했다면 Apple 로그인 의무·예외 여부와 native callback/signing을 실제 정책 검토로 닫는다. iOS를 출시하지 않으면 app config, store copy, release evidence에 Android-only 범위를 명시한다.
- [ ] privacy notice, terms, 연령/동의 요구, analytics disclosure, support 연락처, account deletion entrypoint와 처리 상태를 앱과 웹 지원 경로에 제공한다.
- [ ] account deletion은 인증된 요청, revoke/logout, 최소한의 법적 보존과 비식별화/삭제, third-party processor 삭제 요청, 결과 notification을 하나의 runbook으로 정의하고 staging에서 검증한다.
- [ ] retention period, legal basis, backup/WAL/PITR 내 삭제 요청 처리, delete-versus-redact, legal hold release를 담당 법무/개인정보 책임자가 승인한다.
- [ ] 앱 권한을 release manifest 기준으로 검토한다. Android의 storage, overlay, backup 설정은 실제 기능·정책상 정당성이 없으면 제거하거나 승인 근거를 문서화한다.

**완료 증거:** 실제 provider 테스트 계정 영상/로그, 승인된 legal/privacy 문서 버전, deletion dry run과 완료 기록, store privacy declaration, 권한 검토 기록.

### WP-10. 서명된 모바일 릴리스와 물리 기기 품질 검증

**우선순위:** P0
**의존성:** WP-2, WP-7, WP-8, WP-9
**대상 파일:** apps/mobile/app.json, apps/mobile/android/app/build.gradle, 새 eas.json 또는 선택한 빌드 공급자의 동등한 config, apps/mobile/e2e/android-feature-matrix.md, docs/release-evidence

- [ ] Android release에서 debug signingConfig를 제거하고 안전한 keystore/key management와 CI signing 절차를 구현한다. versionName, versionCode, application ID, package ownership을 실제 release 값으로 동결한다.
- [ ] 선택한 빌드 시스템에 production profile을 만들고 source commit, lockfile hash, native dependency, signing certificate fingerprint, output AAB/APK SHA-256를 attestation에 기록한다.
- [ ] signed Android artifact에 WP-2 bundle scanner, secret scanner, API base URL/allowed origin scanner를 실행한다. 개발 Metro, loopback API, preview assets를 포함한 artifact는 즉시 실패한다.
- [ ] physical Android에서 login, authorized game session, background/resume, offline/reconnect, text scale 200%, TalkBack, permission denial, low-memory recovery, 3G/latency, content error, account deletion entrypoint를 수행한다.
- [ ] iOS 동시 출시 결정이 있으면 같은 수준의 Xcode/signing/TestFlight/VoiceOver/device test를 추가한다. 결정이 없으면 iOS support claim을 release scope와 일치시킨다.
- [ ] 오래된 검증 문서의 package ID 등 현 코드와 다른 사실은 현재 signed artifact evidence로 정정한다. 과거 local PASS를 production PASS로 승격하지 않는다.

**완료 증거:** signed artifact hash, bundle scanner PASS, device matrix의 실제 담당자/날짜/OS/device evidence, accessibility 결과, release build install/rollback proof.

### WP-11. 출시 판정, 제한적 롤아웃, 사후 검증

**우선순위:** P0
**의존성:** 모든 출시 범위에 해당하는 P0 작업 패키지
**대상 파일:** docs/release-evidence/<release-id>, docs/release-evidence-blockers.md, docs/release-evidence-owners.md, 새 docs/release-evidence/<release-id>/go-no-go.json

- [ ] release evidence 디렉터리에 baseline, CI, DB, content approvals, bundle scan, signed build, staging smoke, restore drill, telemetry delivery, device QA, legal approval, load test, rollback rehearsal의 immutable 링크와 hash를 수집한다.
- [ ] 각 blocker를 PASS, BLOCKED, NOT_IN_SCOPE 중 하나로 판정한다. NOT_IN_SCOPE는 WP-0 범위 승인 문서와 앱/계약/스토어 카피에서 기능이 실제로 제거된 경우에만 허용한다.
- [ ] P0 BLOCKED가 0개인지 자동 검사하는 release decision script를 만든다. 단순 문서 문자열 치환으로 통과하지 않도록 artifact hash, commit SHA, 만료일, 승인자 역할을 검증한다.
- [ ] 비공개 베타는 제한된 cohort, feature flag/kill switch, support channel, alert coverage, rollback owner를 먼저 적용한다. 공개 전환은 베타 SLO와 data integrity 결과가 기준을 충족한 뒤에만 한다.
- [ ] 배포 후 24시간, 7일, 첫 season 종료 시점에 오류율, auth failure, attempt completion, content complaint, reward reconciliation, privacy request, queue health를 검토하고 evidence에 첨부한다.

**완료 증거:** 서명된 go-no-go decision, P0 0개 BLOCKED, rollback 가능한 limited rollout, 운영자와 책임자의 명시적 출시 승인.

## 5. 실행 순서와 의존성

| 마일스톤 | 선행 작업 | 종료 조건 |
| --- | --- | --- |
| M0. 신뢰 가능한 기준선 | WP-0, WP-1 | clean candidate에서 모든 자동 검증이 재현되고 destructive DB 검증이 격리된다. |
| M1. 실제 플레이 가능한 비공개 베타 | M0, WP-2, WP-3, WP-4, WP-7, WP-8, WP-9, WP-10 | production build에서 승인된 casual session을 서버 권위로 플레이하고 운영·법무·복구 증거가 있다. |
| M2. 펫·랭킹 기능 활성화 | M1, WP-6 | 승인된 정책·아트·rights·경제 transaction과 admin 운영 증거가 모두 있다. |
| M3. 공개 실시간 PvP | M2 또는 범위상 필요한 M1, WP-5 | protocol, reconnect/recovery, 200-match/400-socket soak, abuse/observability, 공개 카피가 일치한다. |
| M4. 공개 출시 | 선택된 범위의 M1/M2/M3, WP-11 | P0 blocker 0개, 제한적 롤아웃과 rollback이 증명되고 책임자가 승인한다. |

WP-2, WP-3, WP-4는 M1의 병렬 핵심 경로지만, 실제 release build와 승인 콘텐츠가 연결되기 전에는 어느 하나도 단독으로 사용자 출시를 열 수 없다. WP-5는 PvP를 출시 범위에서 제외할 때만 병렬 후속 작업으로 둘 수 있다.

## 6. 테스트와 증거 기준

| 계층 | 반드시 확인할 것 | 허용되지 않는 대체 |
| --- | --- | --- |
| 단위/계약 | policy fail-closed, DTO allow-list, JWT, idempotency, OpenAPI-router parity, content hash/signature, privacy redaction | 타입 검사 또는 mock 성공만으로 기능 완료 선언 |
| 통합/DB | migration, pgTAP, concurrency, receipt replay, policy-disabled zero effect, backup restore reconciliation | 개발 PC의 기존 데이터베이스 결과 |
| 번들/보안 | signed artifact에서 preview/private/secret scanner, dependency/secret scan, production env validation | source file grep만 수행 |
| 스테이징 | HTTPS API, auth provider, public content asset, admin publish, telemetry, alerts, rollback | local emulator 또는 localhost smoke만 수행 |
| 기기/접근성 | 실제 Android, 필요 시 iOS, network/reconnect/background/a11y | simulator screenshot만 수행 |
| 용량/복구 | 200-match/400-socket 30분 soak은 PvP 범위일 때, DB restore와 incident drill은 모든 범위에서 | 문서 속 목표 숫자 또는 synthetic unit test만 수행 |

## 7. 최종 Go/No-Go 체크리스트

- [ ] 선택된 출시 범위가 승인되었고, 범위 밖 기능은 앱·OpenAPI·스토어 카피에서 노출되지 않는다.
- [ ] clean release candidate에서 고정 Node 24.18.0/pnpm 11.13.0으로 pnpm verify가 통과한다.
- [ ] OpenAPI와 실제 runtime route의 차이가 0이고, 활성 route의 인증·오류·재시도 계약이 통과한다.
- [ ] production game route에 preview/local private data import가 없고 signed artifact bundle scanner가 통과한다.
- [ ] 실제 승인된 콘텐츠, 정책, signer, 권리, public asset hash가 서버에서 enabled로 검증된다.
- [ ] enabled capability에 대한 DB transaction, replay/idempotency, audit, rollback/takedown이 검증된다.
- [ ] staging과 production-like 환경의 deploy, migration, backup restore, rollback rehearsal가 통과한다.
- [ ] telemetry/redaction/alert/on-call/incident runbook이 실제 provider 및 synthetic error로 검증된다.
- [ ] auth provider, privacy/terms/deletion/retention, mobile permissions, store declaration이 책임자 승인으로 닫힌다.
- [ ] signed build와 물리 기기/접근성 evidence가 있다.
- [ ] PvP를 출시한다면 실시간 protocol, reconnect, fault injection, 200-match/400-socket soak이 통과한다.
- [ ] 모든 P0 gate가 PASS이고 유효한 증거 링크·hash·승인자가 존재한다.

이 체크리스트 중 하나라도 충족하지 못하면 상태는 NO-GO 또는 제한된 beta 범위로 유지한다. LOCAL_CONTRACT_ONLY, 문서 VERIFIED, 단일 CI 성공, 개발용 preview 동작은 실서비스 출시 승인 근거가 아니다.
