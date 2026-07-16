# TouchCatch 에이전트 실행·검증 운영 설계

## 목적

남은 TouchCatch 구현을 작업 단위마다 새로운 코딩 에이전트에게 위임하고, 주 에이전트가 각 결과를 독립 검증한 뒤에만 다음 작업을 여는 운영 계약을 정의한다. 구현 속도보다 결함 전파 방지와 검증 가능한 인계를 우선한다.

## 기준선

- 기준 브랜치: `main`
- 시작 커밋: `3aae6c1 feat: complete task 5 and 6 standalone gates`
- Task 5·6 standalone gate: `pnpm check` 65개 테스트, 유효 콘텐츠 3개/오류 0, DB lint 0건, pgTAP 62개, 실제 DB concurrency test 통과
- 아직 구현되지 않은 선행 범위: Task 1–4와 Task 7–10
- Task 5·6의 `task3MatchContractImplemented`, `task4WireContractImplemented`는 실제 선행 계약이 들어오기 전까지 `false`를 유지한다.
- 외부 production credential, 법률 승인, 실기기·운영 환경 증거는 로컬 구현으로 대체하거나 완료로 선언하지 않는다.

## 실행 단위

잔여 작업은 다음 순서의 일곱 phase로 나눈다.

1. A — 저장소 부트스트랩과 Ruleset SSOT
2. B — 결정론 경기 엔진
3. C — 인증·Socket·재접속·projection
4. D — Task 5·6 cross-layer 통합 폐쇄
5. E — effect-once 경제·보상
6. F — Expo UI·접근성·운영 게시 도구
7. G — 관측성·부하·밸런스·최종 출시 gate

각 phase는 여러 개의 독립 작업으로 분해한다. 한 작업은 하나의 명확한 산출물, RED→GREEN 테스트 주기, 리뷰 가능한 커밋 경계를 가진다. 서로 다른 작업을 한 구현 에이전트에게 연속 배정하지 않는다.

## 역할

### 구현 에이전트

- 지정된 작업 하나만 수행한다.
- 전용 branch/worktree에서 작업한다.
- 작업 지시서의 `Consumes`, `Produces`, 허용 파일 목록, 금지사항을 따른다.
- production code를 바꾸기 전에 실패 테스트를 만들고 기대한 이유로 실패하는 로그를 보존한다.
- 기존 테스트를 삭제·skip·완화하지 않는다.
- 지정된 집중 테스트와 `pnpm check`를 실행한다. DB 작업이면 `pnpm check:db`도 실행한다.
- 제출 시 base/head SHA, 변경 파일, RED/GREEN 명령과 결과, 알려진 미완료·외부 blocker를 보고한다.
- push, PR, 기준 브랜치 merge는 주 에이전트의 별도 지시 없이는 수행하지 않는다.

### 주 에이전트

- 작업 시작 전에 base SHA와 허용 범위를 고정한다.
- 구현 에이전트의 설명을 신뢰하지 않고 실제 diff와 테스트를 직접 확인한다.
- 명세 적합성 검토와 코드 품질 검토를 분리한다.
- Critical 또는 Important 문제가 있으면 같은 구현 에이전트에게 구체적인 수정 지시를 반환한다.
- 수정 결과를 처음부터 재검증하고, 합격 전에는 다음 의존 작업을 열지 않는다.
- 합격 커밋만 기준 브랜치에 통합한다.

### 읽기 전용 리뷰어

보안·동시성·대규모 계획 위험이 큰 작업에서는 선택적으로 읽기 전용 리뷰어를 먼저 붙인다. 리뷰어는 파일을 수정하지 않고 근거 파일·라인, 심각도, 재현 방법만 보고한다. 주 에이전트는 모든 피드백을 코드베이스에 대조해 타당한 항목만 구현 에이전트에게 전달한다.

## 작업 상태 기계

```text
READY
  → ASSIGNED
  → RED_VERIFIED
  → IMPLEMENTED
  → SUBMITTED
  → SPEC_REVIEW
  → QUALITY_REVIEW
  → INDEPENDENT_VERIFICATION
  → ACCEPTED
  → INTEGRATED
```

검토 중 문제가 발견되면 `CHANGES_REQUESTED`로 이동한다. 수정 제출은 `SUBMITTED`로 돌아가며 이후 검증 단계를 생략하지 않는다. 외부 증거가 없거나 선행 계약이 없으면 `BLOCKED_EXTERNAL` 또는 `BLOCKED_DEPENDENCY`로 기록하고 완료로 바꾸지 않는다.

## 작업 패킷

모든 구현 에이전트에게 전달하는 작업 패킷에는 다음 정보가 반드시 들어간다.

1. 작업 ID와 목표
2. base SHA와 작업 branch/worktree
3. 선행 `Consumes`와 후속 `Produces`
4. 수정·생성·테스트할 exact file path
5. 변경 금지 파일과 아키텍처 경계
6. 작성할 실패 테스트와 예상 RED 원인
7. 최소 구현 요구
8. 집중 검증과 누적 검증 명령
9. 커밋 메시지
10. 제출 보고 형식
11. 중단 조건

지시서에 없는 타입이나 임시 adapter가 필요하면 구현 에이전트가 독자적으로 만들지 않고 `BLOCKED_DEPENDENCY`로 보고한다.

## 주 에이전트 검증 gate

### 1. 범위 gate

- 제출 base/head SHA가 지정된 범위인지 확인한다.
- `git diff --name-status <base>..<head>`가 허용 파일과 일치하는지 확인한다.
- 사용자 소유 변경이나 다른 작업의 파일이 섞였으면 반려한다.
- generated file은 생성 명령과 source-of-truth를 함께 확인한다.

### 2. 명세 gate

- 작업 지시서의 모든 인수 기준을 diff·테스트에 매핑한다.
- `Consumes` 타입과 `Produces` 타입의 이름·version·hash 계약이 정확히 일치하는지 확인한다.
- public/private, client/server, participant/economy subject 경계가 유지되는지 확인한다.
- 외부 blocker가 성공으로 위장되지 않았는지 확인한다.

### 3. 품질 gate

- 실패 테스트가 구현 전 실제로 실패했고 올바른 원인을 검증하는지 확인한다.
- idempotency, ordering, race, retry, replay, stale input, error redaction을 해당 작업 위험에 맞게 검토한다.
- secret·PII·canonical answer·private hitbox가 client payload, log, analytics, fixture에 유출되지 않는지 확인한다.
- reviewer suggestion은 맹목적으로 적용하지 않고 현재 코드와 동결 계획에 대조한다.

### 4. 실행 gate

- 작업 집중 테스트를 주 에이전트가 새로 실행한다.
- 모든 작업에서 `pnpm check`를 실행한다.
- migration·RLS·transaction·DB race를 건드린 작업은 `pnpm check:db`를 실행한다.
- phase 종료 시 clean checkout에서 해당 phase 누적 gate를 실행한다.
- 최종 G phase는 `pnpm verify`와 production readiness checklist를 모두 요구한다.

## 심각도와 처리

- Critical: 보안 경계 붕괴, 데이터 손실, effect 중복, private-data 노출, 결정론 파괴. 즉시 반려한다.
- Important: 명세 누락, race/retry 미검증, cross-layer drift, 회귀 가능성이 큰 설계 결함. 다음 작업 전에 수정한다.
- Minor: 가독성·유지보수성 개선. 현재 작업에서 안전하게 고치거나 명시적으로 backlog에 기록한다.

Critical/Important가 0이고 모든 필수 명령이 통과해야 `ACCEPTED`다.

## 브랜치와 통합

- 실행 시 `superpowers:using-git-worktrees`로 격리된 worktree를 만든다.
- branch 이름은 `agent/<phase>-<task-id>-<slug>` 형식을 사용한다.
- 구현 에이전트는 자신의 branch에만 커밋한다.
- 주 에이전트는 accepted head SHA를 재확인한 뒤 non-interactive 방식으로 기준 브랜치에 통합한다.
- 충돌이 발생하면 구현 에이전트 결과를 임의 재작성하지 않고 새 base에서 작업을 다시 배정한다.

## 단계별 종료 조건

각 phase는 모든 작업이 `INTEGRATED`이고 phase 누적 테스트가 통과해야 종료한다. 다음 phase는 이전 phase의 public interface만 소비하며 내부 구현을 복제하지 않는다.

Task 5·6 통합 phase는 Task 3/4의 실제 shared contract, generated DB parity, wire normalization/limit parity가 들어온 뒤에만 prerequisite를 갱신한다. production principal·CDN·quarantine 관련 외부 증거가 없으면 코드 gate와 별개로 production readiness는 미통과 상태를 유지한다.

## 완료 기준

1. A–G 모든 작업이 `INTEGRATED`다.
2. Critical/Important review issue가 0건이다.
3. `pnpm verify`가 clean checkout에서 통과한다.
4. Task 3/4 prerequisite가 실제 생성·parity 증거와 함께 활성화됐다.
5. production credential/TLS/rotation, CDN origin, quarantine 정책, 실기기 UI 증거가 checklist에 연결됐다.
6. 문서·ADR·API·DB·코드·테스트 traceability에 누락이 없다.

