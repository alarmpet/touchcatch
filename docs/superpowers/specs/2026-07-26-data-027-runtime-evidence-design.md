# DATA-027 Runtime Evidence Design

## 목적

`DATA-027`은 20개 동시 세션이 실제 로컬 PostgreSQL/Supabase 경로를 통해 참가를 시도했으며 최종 좌석이 정확히 2개이고 모든 세션이 `app_server` role과 loopback database를 사용했다는 실행 증거만으로 PASS한다.

TypeScript 소스의 정적 형태는 보조 진단으로 사용할 수 있지만 PASS 근거가 될 수 없다. 로컬 DB 실행 증거가 없거나 검증할 수 없으면 상태는 `BLOCKED`이고 reason은 `LOCAL_DB_EVIDENCE_UNAVAILABLE`이다.

## 범위

### 포함

- bounded Supabase gate가 성공한 실행에서 구조화된 DATA-027 receipt 생성
- receipt freshness, provenance commit, 전체 evidence-input bundle binding 및 정확한 결과 검증
- DB/Docker 부재, timeout, test failure 시 fail-closed 처리
- 위조·stale·잘못된 cardinality·role·database origin mutation 검증
- requirement evidence와 generated registry가 BLOCKED/PASS 상태를 정직하게 반영

### 제외

- PostgreSQL/Supabase concurrency 로직 자체의 재설계
- production database 또는 원격 Supabase에서의 증거 수집
- synthetic fixture를 실제 local execution receipt로 승격
- DATA-027 외 요구사항의 승인 정책 변경
- 외부 provider/device evidence 생성

## 상태 계약

DATA-027 결과는 다음 두 상태만 허용한다.

```ts
type Data027Result =
  | Readonly<{
      status: "PASS";
      evidence: ValidatedData027Receipt;
    }>
  | Readonly<{
      status: "BLOCKED";
      reason: "LOCAL_DB_EVIDENCE_UNAVAILABLE";
    }>;
```

다음 상황은 모두 BLOCKED다.

- Docker daemon 또는 local Supabase를 시작할 수 없음
- DB reset/lint/pgTAP/concurrency 중 하나라도 실패 또는 timeout
- receipt가 없음
- receipt schema가 유효하지 않음
- receipt의 evidence-input bundle hash가 현재 검사 대상과 다름
- receipt 값이 exact acceptance contract와 다름
- receipt 무결성 hash가 다름
- receipt가 허용된 local evidence directory 밖을 참조함

정적 소스 검사가 통과해도 BLOCKED를 PASS로 바꾸지 않는다.

## 구성 요소

### 1. Bounded DB gate

`tools/run-supabase-gate.mjs`가 다음 단계를 bounded subprocess로 실행한다.

1. Docker preflight
2. `supabase db reset --local`
3. `supabase db lint --local --fail-on error`
4. `supabase test db --local`
5. local Auth integration tests
6. DB concurrency tests
7. DATA-027 receipt writer

앞 단계가 하나라도 실패하면 receipt writer는 실행하지 않는다. timeout과 일반 failure는 서로 다른 sanitized error code를 사용한다.

### 2. Concurrency observation

실제 DATA-027 test인 `tests/database/concurrency.test.ts`가 assertion 성공 후 다음 구조의 observation을 생성한다. test는 `connectionTimeoutMillis: 5_000`인 pool을 사용한다.

```ts
type Data027Observation = Readonly<{
  schemaVersion: 1;
  gateRunId: string;
  requirementId: "DATA-027";
  sessionsAttempted: 20;
  successfulSeats: 2;
  requiredRole: "app_server";
  databaseOrigin: "LOOPBACK_LOCAL_SUPABASE";
  testStatus: "PASS";
}>;
```

이 값은 테스트가 직접 관찰한 session/result 값에서 계산한다. 소스 문자열, 주석, 하드코딩된 별도 fixture에서 복사하지 않는다.

gate는 매 실행마다 암호학적으로 무작위인 `gateRunId`를 생성하고
`TOUCHCATCH_DATA027_GATE_RUN_ID`,
`TOUCHCATCH_DATA027_OBSERVATION_PATH`를 해당 DB test subprocess에만
전달한다. 두 변수가 모두 없는 직접 Vitest 실행은 observation을 쓰지 않는다.
observation 경로는
`os.tmpdir()/touchcatch-data-027/<gateRunId>.json`이고, payload의
`gateRunId`가 기대값과 정확히 일치해야 한다. 성공, 실패, timeout 모두
`finally`에서 해당 임시 파일을 제거한다.

### 3. Receipt writer

테스트 프로세스는 임시 observation 파일만 생성한다. bounded DB gate는 전체 DB 단계가 성공한 뒤 observation을 검증하고 최종 receipt를 원자적으로 기록한다.

```json
{
  "schemaVersion": 1,
  "requirementId": "DATA-027",
  "scope": "LOCAL_DETERMINISTIC_NOT_PRODUCTION",
  "commitSha": "<40 lowercase hex>",
  "evidenceInputs": [
    {
      "path": "supabase/migrations/202607150001_initial_schema.sql",
      "sha256": "sha256:<64 lowercase hex>"
    },
    {
      "path": "tests/database/concurrency.test.ts",
      "sha256": "sha256:<64 lowercase hex>"
    }
  ],
  "evidenceInputsSha256": "sha256:<64 lowercase hex>",
  "sessionsAttempted": 20,
  "successfulSeats": 2,
  "requiredRole": "app_server",
  "databaseOrigin": "LOOPBACK_LOCAL_SUPABASE",
  "testStatus": "PASS",
  "receiptSha256": "sha256:<canonical payload hash>"
}
```

`evidenceInputs`는 다음 allow-list를 POSIX 상대 경로로 정규화하고
경로 오름차순으로 정렬한 manifest다.

- 모든 `supabase/migrations/*.sql`
- `tests/database/concurrency.test.ts`
- `vitest.db.config.ts`
- `tools/run-supabase-gate.mjs`
- receipt contract/writer module
- `tools/requirement-oracle.ts`

각 entry hash는 파일 bytes의 SHA-256이고, `evidenceInputsSha256`는
정렬된 canonical manifest의 SHA-256이다. receipt schema version 자체도
canonical payload에 포함되므로 contract 변경은 freshness를 무효화한다.
`commitSha`는 provenance일 뿐 freshness 판정에 사용하지 않는다. 따라서
문서-only commit은 재실행을 요구하지 않지만, PASS 의미에 영향을 주는 입력
변경은 반드시 새 DB 실행을 요구한다.

`receiptSha256`는 해당 필드를 제외한 payload의 canonical JSON SHA-256이다. timestamp, 사용자명, 개인 경로, database URL, password, token은 기록하지 않는다.

최종 경로는 현재 Git worktree top-level 기준
`.superpowers/evidence/data-027/receipt.json`이다. `.superpowers/`는
Git에서 무시되며 worktree마다 물리적으로 분리된다. `node_modules/.cache`는
install/clean 과정에서 교체될 수 있으므로 사용하지 않는다. gate는 같은
worktree에서 exclusive lock을 획득하고, root 밖 경로와 symlink를 거부한다.
임시 파일은 성공 후 제거하며, 쓰기는 같은 디렉터리의 temp-file + atomic
rename으로 수행한다.

### 4. Requirement oracle

DATA-027 oracle은 다음 순서로 검증한다.

1. fixed receipt path만 허용
2. strict schema와 exact key set 검증
3. receipt canonical hash 검증
4. current evidence-input allow-list와 entry hash 일치
5. current evidence-input bundle SHA-256 일치
6. exact acceptance values 검증
7. PASS 반환

어느 단계든 실패하면 `BLOCKED: LOCAL_DB_EVIDENCE_UNAVAILABLE`을 반환한다. invalid receipt를 FAIL/PASS 사이의 모호한 상태로 처리하지 않는다.

기존 DATA-027 정적 AST/SQL 검사는 PASS 결정 경로에서 제거한다. 필요하면 별도의 diagnostic test로 유지할 수 있지만 requirement status를 승격시키지 못한다.

## 데이터 흐름

```text
Docker/Supabase preflight
  -> reset/lint/pgTAP
  -> DB concurrency test
  -> runtime observation
  -> full DB gate success
  -> receipt validation + atomic write
  -> requirement oracle freshness/hash/exact-value validation
  -> DATA-027 PASS
```

실패 흐름:

```text
preflight/test/timeout/receipt mismatch
  -> no new valid receipt
  -> stale receipt rejected
  -> DATA-027 BLOCKED: LOCAL_DB_EVIDENCE_UNAVAILABLE
```

## Receipt 수명주기

- gate 시작 시 기존 receipt를 별도 backup이나 새 성공 근거로 복사하지 않는다. 실패 후 기존 파일이 남아 있어도 current evidence-input bundle 검증으로 stale evidence를 무효화한다.
- 동일 evidence-input bundle에서 성공한 receipt만 재사용할 수 있다. `commitSha` 불일치만으로는 무효화하지 않는다.
- migration, concurrency test, DB Vitest config, receipt schema/writer, gate runner 또는 requirement oracle이 변경되면 bundle hash가 바뀌므로 새 실행이 필요하다.
- receipt는 Git에 기본 커밋하지 않는다. release evidence로 승격하려면 별도 정책과 리뷰가 필요하다.

## 오류와 보안

- 오류 메시지는 고정 code만 노출하고 DB URL, credential, stdout 전체를 receipt에 복사하지 않는다.
- subprocess timeout 시 자식 process tree를 종료한다.
- observation/receipt 경로는 고정 root에서 resolve한 뒤 path traversal과 symlink를 거부한다.
- receipt writer는 arbitrary requirement ID, role, origin 또는 counts를 CLI 인자로 받지 않는다.
- canonical hash는 무결성 검사용이며 서명이나 외부 신뢰를 의미하지 않는다.
- synthetic receipt fixture는 validator mutation test에서만 사용하며 실제 DATA-027 PASS 파일로 등록하지 않는다.
- 고정된 오류 taxonomy는
  `SUPABASE_GATE_DOCKER_UNAVAILABLE`,
  `SUPABASE_GATE_TIMEOUT:<step>`,
  `SUPABASE_GATE_FAILED:<step>`,
  `DATA_027_OBSERVATION_MISSING`,
  `DATA_027_OBSERVATION_INVALID`,
  `DATA_027_CONCURRENCY_FAILED`,
  `DATA_027_RECEIPT_INVALID`이다. `LOCAL_DB_POOL_EXHAUSTED`는 pg error를
  안정적으로 분류할 수 있는 근거가 생기기 전에는 만들지 않는다.

## 테스트 전략

### Receipt validator 단위 테스트

- exact valid receipt PASS
- missing/extra key BLOCKED
- 다른 commit SHA이지만 동일 evidence-input bundle이면 PASS
- migration/test/gate/writer/oracle/config 중 하나의 hash가 stale이면 BLOCKED
- evidence-input manifest의 missing/extra/reordered/path mutation은 BLOCKED
- wrong receipt hash BLOCKED
- sessions `19` 또는 `21` BLOCKED
- seats `1` 또는 `3` BLOCKED
- role이 `app_server`가 아니면 BLOCKED
- origin이 loopback local Supabase가 아니면 BLOCKED
- symlink/path traversal BLOCKED

### Writer 단위 테스트

- 전체 성공 observation만 atomic receipt 생성
- failed/partial observation은 생성하지 않음
- canonical output이 결정적임
- secret-like field와 개인 경로를 거부
- 기존 파일이 있어도 partial write를 남기지 않음

### Gate 테스트

- Docker unavailable → `SUPABASE_GATE_DOCKER_UNAVAILABLE`
- reset/lint/test timeout → 단계별 `SUPABASE_GATE_TIMEOUT:<step>`
- nonzero → `SUPABASE_GATE_FAILED:<step>`
- concurrency failure → receipt writer 미실행
- direct Vitest without gate env → observation 미생성
- stale observation, 다른 `gateRunId`, missing observation → receipt 미생성
- success/failure/timeout → exact observation temp file cleanup
- same-worktree concurrent gate → exclusive lock으로 한 실행만 writer 진입
- 전체 성공 → receipt 생성

### Oracle mutation 테스트

- receipt가 없으면 정확한 BLOCKED reason
- 위조된 값/hash/path는 PASS하지 않음
- static source가 완벽해도 receipt가 없으면 BLOCKED
- valid receipt가 현재 evidence-input bundle과 일치할 때만 PASS

### 실제 검증

Docker/local Supabase가 가용한 환경에서 Task 5 bounded gate를 실행한다. 사용할 수 없는 환경에서는 테스트를 synthetic PASS로 바꾸지 않고 DATA-027을 BLOCKED로 유지한다.

## 수용 기준

- DATA-027은 정적 소스만으로 PASS할 수 없다.
- local DB receipt 부재 시 exact BLOCKED reason을 반환한다.
- bounded DB gate의 전체 성공만 receipt를 생성한다.
- valid receipt는 current evidence-input bundle, 20 sessions, 2 seats, `app_server`, loopback local Supabase에 결합되고 commit SHA는 provenance로 보존된다.
- 모든 위조/stale/mutation test가 fail-closed다.
- receipt에 credential, URL, token, 개인 절대 경로가 없다.
- generated requirement coverage와 docs gate는 BLOCKED를 정직하게 허용하고 false PASS를 만들지 않는다.
