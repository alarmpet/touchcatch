# 계정 삭제 worker 운영

요청을 접수하는 것과 데이터를 지우는 것은 **다른 권한**이다. 이 문서는 지우는 쪽을 어떻게
띄우고, 왜 지금은 아무것도 지우지 않는지를 적는다.

## 지금 상태: 접수는 되고 파기는 안 된다

worker는 `docs/legal/data-disposition.v1.json`의 `approval.status`가 `APPROVED`가 아니면
**단 한 건도 claim하지 않는다.** 현재 값은 `PROPOSED`다.

```bash
pnpm --dir apps/server privacy-worker
# {"at":"...","event":"worker.started","detail":"DISPOSITION_NOT_APPROVED:PROPOSED"}
# {"at":"...","event":"worker.refused","detail":"DISPOSITION_NOT_APPROVED:PROPOSED"}
```

버그가 아니다. 어떤 테이블이 삭제 요청에서 살아남는지는 사람이 정할 일이고, 에이전트가 만든
표를 근거로 데이터를 파기하는 것보다 아무것도 안 하는 편이 낫다. 그동안 사용자에게 일어나는
일은 정확히 이것이다 — **요청은 접수되고, 계정은 즉시 닫히고, 데이터는 남아 있다.**

## 승인하는 법

`docs/legal/data-disposition.v1.json`을 표째 읽는다. 35개 테이블이 세 값 중 하나를 갖는다.

| 값 | 개수 | 뜻 |
| --- | ---: | --- |
| `DELETE` | 24 | 그 사람의 행을 지운다 |
| `REDACT` | 9 | 행은 남고 신원 연결만 끊는다 |
| `RETAIN` | 2 | 그대로 둔다 — 삭제 기록 자체 |

`REDACT` 9개는 전부 매치 기록이다. 스키마가 `public.match_players.user_id`를 `SET NULL`로
선언해 둔 것이 근거이며, 한 참가자가 떠났다고 상대의 기록까지 지울 수는 없다. 다만 **지금
제품에는 매치를 만드는 코드가 없다** — 실시간 전송 계층이 없고 `join_match_participant_v1`을
부르는 곳이 pgTAP 말고는 없다. 즉 이 9개는 현재 도달 불가능한 행에 대한 결정이다.

납득했으면 이렇게 고친다.

```json
"approval": {
  "status": "APPROVED",
  "approvedBy": "<이름>",
  "approvedAt": "2026-08-__T__:__:__Z",
  "scope": "closed-beta"
}
```

`approvedBy`나 `approvedAt`이 비어 있으면 verifier가 `DISPOSITION_APPROVAL_UNATTRIBUTED`로
거부한다. **JSON 한 글자를 바꾸는 것과 사람이 결정하는 것을 구분하려고 검사하는 필드다.**

승인 뒤에는 `apps/server/src/privacy/disposition-approval-verifier.test.ts`의 마지막 테스트가
실패한다. 그 테스트는 "지금 이 저장소가 아무것도 안 지운다"를 고정한 것이라, 승인과 함께
같이 고치는 것이 맞다.

## 배포

worker는 **별도 프로세스, 별도 자격 증명**이다. API의 `.env`를 복사하면 시작 자체가 거부된다
(`API_ENV_PRESENT:DATABASE_URL`).

```bash
cp apps/server/.env.privacy-worker.example apps/server/.env.privacy-worker
# 채운다:
#   PRIVACY_WORKER_DATABASE_URL      privacy_worker 롤의 로그인
#   PRIVACY_WORKER_SUPABASE_URL      HTTPS (로컬 루프백만 예외)
#   PRIVACY_WORKER_SERVICE_ROLE_KEY  인증 계정을 지우는 최강 자격 증명
pnpm --dir apps/server privacy-worker
```

DB 로그인은 사람이 환경별로 만든다. 마이그레이션은 `privacy_worker` **그룹 롤**만 만들고
로그인은 만들지 않는다.

```sql
create role privacy_worker_prod login password '...' in role privacy_worker;
```

이 로그인을 `economy_server`에 넣지 않는다. 넣는 순간 API와 worker의 구분이 사라진다.

## 무엇이 어떤 순서로 일어나는가

```
ACCESS_BLOCKED      요청 접수와 같은 트랜잭션에서 tombstone이 커밋됨. 이미 계정은 닫혔다.
  ↓ dispose_account_app_data_v1
APP_DATA_DISPOSED   24개 테이블에서 FK 순서대로 삭제. 삭제 행 수가 effect journal에 기록됨.
  ↓ (PROVIDERS = NOT_APPLICABLE)
PROVIDERS_REVOKED   인증 계정 삭제가 identities를 함께 지우므로 별도 호출이 없다.
  ↓ Supabase Auth Admin DELETE
AUTH_DELETED        세션·identity·refresh token이 GoTrue 쪽에서 사라진다.
  ↓ (NOTIFICATION = NOT_APPLICABLE)
COMPLETED           보낼 곳이 삭제 대상이었다. 기기의 접수증이 그 역할을 한다.
```

한 tick에 한 단계씩만 진행한다. 각 단계가 별개의 외부 효과라, 하나씩 커밋해야 journal이
사후 요약이 아니라 실제 기록이 된다.

## 고장났을 때

| 상태 | 뜻 | 할 일 |
| --- | --- | --- |
| `MANUAL_REVIEW` | 외부 호출의 결과를 확정할 수 없었다 (타임아웃, 5xx, 429) | Supabase에서 해당 auth user가 실제로 지워졌는지 직접 확인한 뒤 단계를 손으로 기록한다. **재시도하지 않는다** — 이미 성공했을 수 있다 |
| `FAILED_PERMANENT` | 401/403 등, 같은 자격 증명으로는 계속 실패한다 | 배포 설정을 본다 |
| `FAILED_RETRYABLE` | 일시적 | 다음 claim이 이어받는다. `attempts`가 8을 넘으면 멈춘다 |
| `BLOCKED_LEGAL_HOLD` | 보존 의무 | 사람이 해제해야 한다 |

lease를 잃은 worker는 조용히 손을 뗀다(`worker.lease-lost`). 다른 worker가 그 요청을 쥐고
있다는 뜻이며, 실패가 아니다.

## 로그에 없는 것

request id 말고는 아무것도 없다. auth user id, subject key, 이메일, 접수증 모두 로그에 넣지
않으며 `account-deletion-worker.test.ts`가 그걸 검사한다. 삭제 요청을 추적하려다 삭제 대상을
로그에 남기는 것은 그 자체로 사고다.
