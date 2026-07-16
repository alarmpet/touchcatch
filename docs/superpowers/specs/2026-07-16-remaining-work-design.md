# TouchCatch 잔여 작업 계획 구조 설계

## 목적

기존 동결 계획 `2026-07-15-spec-hardening-and-mvp-readiness.md`에서 아직 구현되지 않은 Task 1–4와 Task 7–10, 그리고 조건부 완료 상태인 Task 5–6의 잔여 gate를 실행 가능한 여러 계획서로 분해한다. 이미 통과한 Task 5–6 standalone 구현은 반복하지 않으며, 전체 계획의 production-ready 판정을 막는 의존성과 운영 조건만 후속 계획에 포함한다.

## 기준선

- Git 원격은 `https://github.com/alarmpet/touchcatch.git`, 기본 로컬 브랜치는 `main`이다.
- 현재 저장소의 첫 문서 커밋은 존재하지만 애플리케이션·DB·테스트 파일 대부분은 여전히 untracked다. 이 파일들은 Task 5–6 검증을 통과한 기존 구현이므로 Task 1에서 새로 생성하거나 덮어쓰지 않는다.
- Task 5–6 standalone 검증 기준은 일반 테스트 56개, 유효 콘텐츠 3개, DB lint 0건, pgTAP 62개, 20-session concurrency 통과다.
- `CONTENT_PREREQUISITE_STATUS.task3MatchContractImplemented`와 `task4WireContractImplemented`는 현재 `false`다.
- `pnpm check`와 `pnpm check:db`는 현재 Task 5–6 scoped gate이며 전체 계획의 `verify`를 의미하지 않는다.
- production publish는 `deployment_role`을 validator 전용 principal에만 부여한다는 신뢰 경계가 필요하다.
- legacy quarantine의 보관·삭제·법적 근거 승인이 외부 베타 진입 조건이다.

Task 1의 첫 실행 단위는 기존 구현 보존이다. untracked 파일을 기능 영역별로 inventory하고 secret·대용량·생성물 여부를 검사한 뒤, 현재 `pnpm check`와 `pnpm check:db`를 다시 통과시켜 의도적인 baseline 커밋으로 만든다. clean checkout에서 같은 검증을 재현하기 전에는 scaffold 생성, 파일 이동, 일괄 삭제를 시작하지 않는다.

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

기존 scaffold와 Task 5–6 구현을 보존한 baseline 커밋을 먼저 만든다. 그 뒤 Node/pnpm/runtime pin, lint·format·secret scan, CI, OpenAPI 기본 gate와 단일 `RulesetV1`을 만든다. `RulesetV1` 도입은 새 파일 추가만으로 끝내지 않고 현재 `content.ts`, 콘텐츠 validator, SQL CHECK/function에 흩어진 규칙 상수를 inventory해 공용 loader 또는 생성 산출물로 치환한다. TypeScript를 SQL이 직접 읽는 구조는 만들지 않으며, canonical hash와 generated parity test가 TS·JSON·DB 표현의 동일성을 증명해야 한다. 이후 모든 reducer, DB, UI가 규칙 상수를 임의로 복제하지 않고 이 계약을 소비하게 한다.

### B. 결정론 경기 엔진

외부 I/O가 없는 reducer, state/command/event 계약, timer intent, sequence 규칙, replay conformance를 구현한다. Task 5의 `PrivateGameSolutionV1`과 normalization 함수를 그대로 소비한다.

### C. 전송과 인증

REST/Socket runtime schema, subject mapping, idempotency, reconnect/replay, viewer별 projection과 private-data redaction을 구현한다. handshake에서 서버는 해당 경기의 `protocolVersion`, `engineVersion`, `rulesetVersion`/hash, `contentRevisionId`/hash를 보내고 클라이언트는 자신이 지원하는 protocol·engine·ruleset 범위를 선언한다. 호환되지 않으면 경기 command를 받기 전에 typed fail-closed 응답을 반환하며, UI는 업데이트 필요 상태로 전환한다. content hash는 클라이언트가 규칙의 진위를 판정하는 수단이 아니라 서버가 pin한 immutable match descriptor의 일부다.

재접속 시 클라이언트는 `lastEventSeq`를 보내고 서버는 durable journal을 권위 기준으로 gap을 재생한다. Redis/메모리의 최근-event 저장소는 bounded 성능 캐시로만 허용하며 source of truth로 사용하지 않는다. 요청 구간이 보존 범위를 벗어나거나 cursor/revision 연속성을 증명할 수 없으면 private-safe full snapshot으로 교체한다. stale event 무시, exact gap replay, replay unavailable snapshot fallback을 같은 conformance suite에서 검증한다. 어떤 wire payload도 private solution 전체를 직렬화하지 않는다.

### D. 콘텐츠·DB 통합 폐쇄

Task 5–6 기존 구현을 기준으로 actual/declared encoded byte의 8 MiB 전후, width/height의 4096 전후, decoded pixel의 16,000,000 전후를 서로 독립된 실제 container fixture로 검증한다. 초과 파일은 전체 read/hash/decode 전에 중단하고, 열린 file handle에서 최대 limit+1만 읽어 path swap과 메모리 고갈을 방어한다. Task 3 phase/end-reason과 DB enum의 생성 기반 parity를 만들고, 계획 A에서 도입한 ruleset canonical hash와 콘텐츠 validator·DB constraint/function의 parity도 함께 증명한다. prerequisite boolean은 증거가 아니며 공용 runtime tuple/schema, terminal mapping, wire normalization/limit의 생성 산출물과 drift test가 통과할 때만 파생한다. validator 전용 production principal은 로컬에서도 별도 non-superuser LOGIN 연결로 `SET ROLE` 전 실패·후 성공과 direct DML 거절을 검증한다. 배포 gate는 validator의 `CONTENT_ASSET_ORIGINS`와 DB allow-list가 exact equality인지 확인하고, 기존 revision/match가 참조하는 origin은 보존·이관 증거 없이 제거하지 않는다.

legacy quarantine은 먼저 필드별 개인정보 분류, 법적 근거, 최대 보관기간, account-deletion subject mapping, 접근 감사 책임자를 승인된 표로 고정한다. 이 표에는 backup/WAL/PITR/replica/export/log 보관 범위, legal hold 우선순위, restore 후 tombstone 재적용, 다중 참가자 row의 delete-vs-redact 규칙도 포함한다. 그 정책을 입력으로 하는 idempotent deletion/redaction job은 전용 privacy-operator 역할과 좁은 dry-run/apply surface만 사용하고, raw PII나 안정적 원문 hash를 audit log에 남기지 않는다. dry-run, aggregate 증거, 재실행·crash/restart 안전성, nested PII recursive scan, backup restore 후 재삭제를 검증해야 한다. 무조건적인 DB delete trigger는 법적 보존 의무와 충돌할 수 있어 기본 설계로 채택하지 않고, crypto-shredding은 subject별 암호화·키 폐기 구조가 별도로 승인된 경우에만 선택한다. 정책과 job의 production 증거가 없으면 외부 베타 gate는 닫힌 상태다.

### E. 경제와 effect-once

random economy subject, append-only ledger, idempotency, pity, reward/fusion/gacha transaction, outbox consumer를 구현한다. 모든 balance/inventory mutation은 economy subject serialization row를 먼저 `FOR UPDATE`하고, 필요한 pity row를 잠근 뒤 pet row를 stable ID 오름차순으로 잠근다. 동일 idempotency key의 completed receipt replay는 새 lock·entropy·side effect보다 먼저 처리한다. distinct-key 동시 draw, 동일 재료 fusion, draw/fusion 교차 경쟁을 20-session race로 검증해 stale balance·pity·inventory와 deadlock이 없음을 증명한다. 경기 결과 side effect는 Task 3 event를 입력으로 받고 한 번만 적용한다.

### F. UI와 운영 도구

승인된 reference 이미지와 design token을 기반으로 Expo UI, zoom/pan/tap/accessibility를 구현하고 Next.js 콘텐츠 운영 도구를 만든다. 시각 회귀는 플랫폼별 runner/OS·emulator·font·scale·locale·GPU와 seed/time을 pin하고, 동적 영역 mask와 반복 캡처 noise 측정으로 threshold를 보정한다. Docker는 웹 또는 지원되는 Android 경로에서 재현성을 실제로 높이는 경우에만 사용하며 iOS runner를 대체한다고 가정하지 않는다. pixel 비교와 별도로 geometry/token/component 테스트 및 사람이 승인한 iOS·Android golden을 gate로 둔다. 운영 도구의 publish 동작은 validator 전용 backend 경로만 호출한다.

### G. 검증과 출시 추적성

Sentry/analytics privacy allow-list, load/replay/fault-injection, balance simulation, 최종 `verify`를 구성한다. 로컬의 빠른 피드백은 DB/Docker 비의존 `pnpm check`로 유지하고, `pnpm check:db`를 포함한 `pnpm verify`는 clean checkout CI merge gate로 실행한다. hook을 도입한다면 pre-commit은 빠른 check만 실행하고 full verify를 개발자 로컬 hook의 필수 조건으로 만들지 않는다. 현재 `package.json`에는 아직 `verify` script가 없으므로 계획 A가 이를 정의하고 계획 G가 전체 범위로 완성한다. 문서·ADR·API·DB·코드·테스트 간 추적성 표를 생성하고 출시 gate를 자동화한다.

## 공통 실행 원칙

- 모든 동작 변경은 실패 테스트를 먼저 만들고 RED를 확인한다.
- 계획의 각 Task는 독립적으로 리뷰 가능한 deliverable과 커밋으로 끝난다.
- public/private, client/server, auth participant/economy subject 경계를 합치지 않는다.
- production credential, secret, 실제 사용자 데이터는 migration·fixture·로그에 기록하지 않는다.
- local-only `supabase/roles.sql`을 production `--include-roles` 배포에 포함하지 않는다.
- 기존 Task 5–6 테스트를 삭제하거나 약화하지 않는다.
- frozen plan과 이미 구현된 파일의 `Create` 표기는 파일이 없을 때만 생성한다는 뜻이다. 파일이 존재하면 먼저 diff·contract·test를 보존한 채 수정하며, 동일 경로를 scaffold로 덮어쓰지 않는다.
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

`pnpm check`는 현재의 Task 5–6 범위에서 시작해 각 계획이 추가한 lint·type·contract·security gate를 누적한다. `pnpm verify`는 단순 별칭이 아니라 clean checkout에서 runtime pin, 전체 fast check, DB/container gate와 문서·자산 검증을 순서대로 실행하는 CI 계약이다.

## 완료 기준

마스터 로드맵의 모든 실행 계획이 완료되고 다음 조건을 만족해야 전체 계획 완료로 판정한다.

1. Task 3/4 prerequisite flag가 실제 구현과 함께 `true`다.
2. DB phase/end-reason이 공용 domain contract에서 생성되거나 cross-layer parity test로 자동 증명된다.
3. production publish principal, asset origin, quarantine 정책이 환경별 증거와 함께 승인됐다.
4. reward/economy side effect가 crash/retry에도 effect-once임이 증명된다.
5. UI 접근성과 private-data redaction이 자동 및 수동 검증을 통과한다.
6. `pnpm verify`가 clean checkout에서 통과한다.
7. 출시 blocker가 없는 추적성·운영 checklist가 남는다.

## 설계 리뷰 판정 기록

`2026-07-16-remaining-work-design-review.md`는 비규범 검토 자료이며 다음과 같이 판정했다.

- 채택: untracked 기존 구현 보존과 baseline 커밋, ruleset 도입 시 기존 validator/DB 상수 migration, client/server version compatibility handshake, quarantine lifecycle, 경제 mutation의 결정적 lock order, 로컬 fast check와 CI full verify 분리.
- 기존 요구를 명시적으로 강화: `lastEventSeq` 기반 gap replay와 snapshot fallback, 경제 `FOR UPDATE`, 고정된 시각 회귀 환경은 동결 계획에 이미 있었으므로 새 아키텍처로 추가하지 않고 해당 실행 계획의 종료 gate로 드러냈다.
- 조건부 채택: Redis/메모리 recent-event 저장소는 durable journal 앞의 cache로만 허용한다. quarantine hard delete 또는 crypto-shredding은 승인된 retention·암호화 정책이 있을 때만 사용한다. Docker visual runner는 지원 플랫폼에만 적용한다.
- 사실관계 수정: 현재 root `package.json`에는 `pnpm verify`가 아직 없다. 따라서 기존 script의 실행 위치를 바꾸는 작업이 아니라 계획 A에서 script를 도입하고 계획 G/CI에서 완성하는 작업으로 정의했다.
