# TouchCatch 잔여 작업 계획 구조 설계

## 목적

기존 동결 계획 `2026-07-15-spec-hardening-and-mvp-readiness.md`에서 아직 구현되지 않은 Task 1–4와 Task 7–10, 그리고 조건부 완료 상태인 Task 5–6의 잔여 gate를 실행 가능한 여러 계획서로 분해한다. 이미 통과한 Task 5–6 standalone 구현은 반복하지 않으며, 전체 계획의 production-ready 판정을 막는 의존성과 운영 조건만 후속 계획에 포함한다.

## 기준선

- Git 원격은 `https://github.com/alarmpet/touchcatch.git`, 기본 로컬 브랜치는 `main`이다.
- 현재 저장소는 최초 커밋 전 상태이며 기존 파일 대부분은 untracked다. 계획 문서 커밋은 명시된 문서만 stage한다.
- Task 5–6 standalone 검증 기준은 일반 테스트 56개, 유효 콘텐츠 3개, DB lint 0건, pgTAP 62개, 20-session concurrency 통과다.
- `CONTENT_PREREQUISITE_STATUS.task3MatchContractImplemented`와 `task4WireContractImplemented`는 현재 `false`다.
- `pnpm check`와 `pnpm check:db`는 현재 Task 5–6 scoped gate이며 전체 계획의 `verify`를 의미하지 않는다.
- production publish는 `deployment_role`을 validator 전용 principal에만 부여한다는 신뢰 경계가 필요하다.
- legacy quarantine의 보관·삭제·법적 근거 승인이 외부 베타 진입 조건이다.

## 문서 구조

잔여 작업은 마스터 로드맵 하나와 실행 계획 일곱 개로 관리한다.

1. 마스터 로드맵: 전체 상태, 의존성, 공통 제약, 단계별 진입·종료 gate를 관리한다.
2. 실행 계획 A: Task 1–2 저장소 부트스트랩과 ruleset SSOT.
3. 실행 계획 B: Task 3 결정론 reducer와 state machine.
4. 실행 계획 C: Task 4 인증·Socket·재접속·projection.
5. 실행 계획 D: Task 5–6 exact boundary, cross-layer parity, production publish, quarantine 잔여 작업.
6. 실행 계획 E: Task 7 effect-once 보상과 펫 경제.
7. 실행 계획 F: Task 8A–8B UI reference, 조작·접근성, 운영 게시 도구.
8. 실행 계획 G: Task 9–10 관측성·밸런스·최종 gate·추적성.

각 실행 계획은 다른 계획의 내부 구현을 전제로 하지 않고 `Consumes`와 `Produces` 인터페이스로 연결한다. 한 계획의 종료 gate가 다음 계획의 진입 gate가 된다.

## 의존성 순서

```text
Task 1 → Task 2 → Task 3 → Task 4 → Task 5·6 잔여 통합
                                      ↓
                                   Task 7
                                      ↓
                                  Task 8A·8B
                                      ↓
                                  Task 9 → Task 10
```

UI 작업을 reducer·wire 계약보다 먼저 시작하지 않는다. 시각 자산 탐색이나 비기능적 reference 정리는 병렬로 할 수 있지만 production UI 구현은 Task 4 종료 gate 이후에만 시작한다.

## 계획별 책임

### A. 저장소와 규칙 기반

Node/pnpm/runtime pin, lint·format·secret scan, CI, OpenAPI 기본 gate와 단일 `RulesetV1`을 만든다. 이후 모든 reducer, DB, UI가 규칙 상수를 복제하지 않고 이 계약을 소비하게 한다.

### B. 결정론 경기 엔진

외부 I/O가 없는 reducer, state/command/event 계약, timer intent, sequence 규칙, replay conformance를 구현한다. Task 5의 `PrivateGameSolutionV1`과 normalization 함수를 그대로 소비한다.

### C. 전송과 인증

REST/Socket runtime schema, subject mapping, idempotency, reconnect/replay, viewer별 projection과 private-data redaction을 구현한다. 어떤 wire payload도 private solution 전체를 직렬화하지 않는다.

### D. 콘텐츠·DB 통합 폐쇄

Task 5–6 기존 구현을 기준으로 실제 8 MiB, 4096 dimension, 16,000,000 pixel boundary fixture를 추가한다. Task 3 phase/end-reason과 DB enum의 생성 기반 parity를 만들고, validator 전용 production principal과 CDN origin migration, quarantine retention/deletion gate를 검증한다.

### E. 경제와 effect-once

random economy subject, append-only ledger, idempotency, pity, reward/fusion/gacha transaction, outbox consumer를 구현한다. 경기 결과 side effect는 Task 3 event를 입력으로 받고 한 번만 적용한다.

### F. UI와 운영 도구

승인된 reference 이미지와 design token을 기반으로 Expo UI, zoom/pan/tap/accessibility를 구현하고 Next.js 콘텐츠 운영 도구를 만든다. 운영 도구의 publish 동작은 validator 전용 backend 경로만 호출한다.

### G. 검증과 출시 추적성

Sentry/analytics privacy allow-list, load/replay/fault-injection, balance simulation, 최종 `verify`를 구성한다. 문서·ADR·API·DB·코드·테스트 간 추적성 표를 생성하고 출시 gate를 자동화한다.

## 공통 실행 원칙

- 모든 동작 변경은 실패 테스트를 먼저 만들고 RED를 확인한다.
- 계획의 각 Task는 독립적으로 리뷰 가능한 deliverable과 커밋으로 끝난다.
- public/private, client/server, auth participant/economy subject 경계를 합치지 않는다.
- production credential, secret, 실제 사용자 데이터는 migration·fixture·로그에 기록하지 않는다.
- local-only `supabase/roles.sql`을 production `--include-roles` 배포에 포함하지 않는다.
- 기존 Task 5–6 테스트를 삭제하거나 약화하지 않는다.
- 전체 계획 완료는 `pnpm verify`와 별도 production readiness checklist가 모두 통과한 경우에만 선언한다.

## 오류와 중단 처리

- 선행 계약이 없거나 이름이 충돌하면 후속 계획에서 임시 타입을 만들지 않고 선행 계획으로 되돌린다.
- 외부 서비스 credential이 없으면 adapter contract와 deterministic fake까지 구현하고 production integration gate를 미통과 상태로 남긴다.
- quarantine 법적 승인이 없으면 legacy import와 외부 베타를 중단하되 신규 데이터 경로의 개발은 계속할 수 있다.
- 실제 CDN origin이 정해지지 않으면 production validator와 DB publish는 fail closed를 유지한다.

## 테스트 전략

각 계획은 집중 테스트와 누적 gate를 함께 실행한다.

- 빠른 계약·단위 테스트: `pnpm check`
- DB migration·RLS·pgTAP·race: `pnpm check:db`
- reducer·wire conformance: 계획 B/C에서 추가하는 집중 Vitest suite
- UI: component, accessibility, screenshot/reference 비교와 실제 기기 smoke test
- fault/load/balance: 계획 G의 별도 장시간 suite
- 최종: Task 1에서 정의하고 Task 10에서 완성하는 `pnpm verify`

## 완료 기준

마스터 로드맵의 모든 실행 계획이 완료되고 다음 조건을 만족해야 전체 계획 완료로 판정한다.

1. Task 3/4 prerequisite flag가 실제 구현과 함께 `true`다.
2. DB phase/end-reason이 공용 domain contract에서 생성되거나 cross-layer parity test로 자동 증명된다.
3. production publish principal, asset origin, quarantine 정책이 환경별 증거와 함께 승인됐다.
4. reward/economy side effect가 crash/retry에도 effect-once임이 증명된다.
5. UI 접근성과 private-data redaction이 자동 및 수동 검증을 통과한다.
6. `pnpm verify`가 clean checkout에서 통과한다.
7. 출시 blocker가 없는 추적성·운영 checklist가 남는다.
