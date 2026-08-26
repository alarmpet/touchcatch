# Google Play Production Readiness Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 거짓 양성인 계정 삭제·법무·Android 릴리스 준비 선언을 제거하고, TouchCatch Android closed beta가 실제 사용자에게 배포되기 전에 코드·계약·DB·법무·서명 AAB·백엔드·복구·관측성·Play Console 증거가 같은 release candidate를 가리키게 한다.

**Architecture:** `docs/superpowers/plans/2026-08-20-production-service-readiness-master-plan.md`의 WP-0…WP-11과 M0…M4를 출시 DAG로 유지한다. 이 문서는 2026-08-26 변경분을 재감사한 시정 계획이며 기존 DAG를 대체하거나 완료 처리하지 않는다. 구현은 하나의 clean release candidate에서 아래 작업 패키지를 순서대로 수행한다. 계정 삭제는 HTTP 성공 응답에 DB/Auth/외부 제공자 삭제를 억지로 동기화하지 않고, durable request와 fail-closed 상태 머신을 사용한다. Android release는 upload key가 없으면 구성 단계에서 실패하고, 최종 AAB 자체를 검사·해시·증명한다.

**Tech Stack:** Node.js 24.18.0, pnpm 11.13.0, TypeScript 5.9, Vitest 4, Expo 57 / React Native 0.86, Android Gradle Plugin / Gradle, PostgreSQL / Supabase Auth, pgTAP, OpenAPI / Redocly, PowerShell, GitHub Actions, Google Play App Signing.

---

## 0. 재감사 결론

**2026-08-26 현재 외부 closed beta와 실서비스 판정은 P0 NO-GO다.** 내부 테스트 트랙은 출시 승인이 아니다. 합성 계정·내부 인력·비프로덕션 DB만 사용하는 bootstrap 설치 QA조차 R0/R1, R6의 안전한 AAB, R8의 protected upload workflow를 먼저 만족해야 한다.

| 범위 | 현재 판정 | 승격 조건 |
|---|---|---|
| 로컬 소스 | NO-GO | clean RC에서 R0/R1 자동 게이트가 재현되어야 함 |
| Play internal track — bootstrap install-only | BLOCKED | 별도 staging versionCode, fail-closed upload signing, 최종 AAB 검사, protected upload, 합성 계정·비프로덕션 backend 전용 승인 |
| Play internal track — production RC | BLOCKED | R2…R8, production deploy/OAuth/portal, 새 versionCode의 production RC를 internal에서 검증 |
| 외부 closed beta | NO-GO | R0…R9 완료, WP-9/10 외부 증거 승인 |
| open/public production | NO-GO | closed beta 관찰 기간과 WP-11 go/no-go까지 완료 |

### 검증된 P0

| ID | 검증 사실 | 출시 영향 |
|---|---|---|
| P0-DEL-1 | `apps/mobile/src/auth/session-controller.ts:139-148`은 `DELETE /v1/me`를 호출하지 않고 local sign-out만 수행한다. sign-out의 `{error}`도 무시한다. | 사용자는 데이터가 삭제됐다고 오인한다. |
| P0-DEL-2 | `apps/server/src/http/me-handler.ts:22-38`은 optional 삭제 의존성이 없어도 200을 반환한다. 현재 runtime 조합은 존재하지 않는 RPC를 거부하고 resolver가 오류를 삼킨다. 재현 결과는 `status=200`, `deleted=true`, `dbCalls=0`이다. | 서버 성공 응답이 실제 삭제를 증명하지 않는다. |
| P0-DEL-3 | `private.delete_mobile_account_v1` migration·allowlist·statement가 없고 Supabase Admin user deletion/provider unlink 경로도 없다. | Auth user, identities, sessions, refresh token, 앱 데이터가 남는다. |
| P0-CONTRACT-1 | pinned runtime의 계약 테스트는 `packages/contracts/src/openapi.test.ts:54`에서 추가된 DELETE 때문에 실패한다. 전체 Vitest도 계약과 OAuth identity 두 테스트가 실패한다. | “계약 검증 완료” 주장이 사실이 아니다. |
| P0-TYPE-1 | `corepack pnpm server:typecheck`는 `apps/server/src/http/router.ts:155,161`의 TS2375로 실패한다. | 서버 변경이 compile gate를 통과하지 못한다. |
| P0-LEGAL-1 | 개인정보처리방침은 15줄, 약관은 5줄이며 실제 데이터·처리자·보존·backup·삭제 의미론과 일치하지 않는다. 앱 하단 문구는 링크가 아닌 `Text`다. | Play 정책과 저장소 WP-9를 충족하지 못한다. |
| P0-LEGAL-2 | 공개 privacy/account-deletion/terms URL, 작동이 입증된 support 채널, Play Console 제출 증거가 없다. | 앱 밖 계정 삭제 요청 요건을 충족하지 못한다. |
| P0-AAB-1 | `apps/mobile/android/app/build.gradle:107-118`은 release key가 없으면 tracked debug keystore로 조용히 폴백한다. | release 산출물 신뢰 경계가 깨진다. |
| P0-AAB-2 | 현재 release AAB는 0개다. 빌드 스크립트는 source scan/typecheck/Gradle만 수행하며 최종 AAB, 서명, 권한, prod URL, secret, SBOM을 검사하지 않는다. | 업로드 가능한 바이너리 증거가 없다. |
| P0-AAB-3 | `jarsigner`/`keytool` 출력만으로는 승인된 upload certificate와의 일치가 강제되지 않으며, 현재 계획 전 명령은 PowerShell native exit를 뒤 명령이 가릴 수 있었다. | 다른 keystore 또는 실패한 검사도 release PASS로 오인할 수 있다. |
| P0-CI-1 | 현재 GitHub workflow는 4개 local job뿐이고 감사 SHA의 run, main branch protection/ruleset, Android/deploy workflow가 없다. | 로컬 출력이 원격 release gate로 승격되지 않는다. |
| P0-PROMOTION-1 | 비프로덕션 API를 쓰는 조기 internal 후보와 production API를 쓰는 최종 RC를 한 AAB/versionCode로 취급할 수 없다. Play 원격 최대 versionCode와 동일 bundle 승격 증거도 없다. | internal 검증과 closed 배포가 서로 다른 바이너리를 가리키거나 versionCode 재사용으로 업로드가 막힌다. |
| P0-OPS-1 | staging/prod deploy, migration promotion, backup/PITR restore drill, telemetry delivery, alerts, incident runbook, rollback 증거가 없다. | 실행 중 장애를 탐지·복구할 수 있다는 증거가 없다. |
| P0-CONTENT-1 | production route는 이제 `AuthoritativeLearningSessionScreen`을 사용하지만, 승인된 5개 ENGLISH pack이 production DB에 `PUBLISHED`되고 casual season에 pin됐다는 증거가 없다. | 설치 후 실제 학습 시작이 fail-closed될 수 있다. |
| P0-RC-1 | 감사 최초 snapshot은 242개 변경(72 modified, 170 untracked)이었고 `git diff --check`도 실패했다. 계획 자체 최종 검증 snapshot은 248개(72 tracked changes, 176 untracked)이며 법무 문서, AAB 스크립트와 이 plan도 아직 untracked다. | 어떤 commit을 검증·배포하는지 고정할 수 없다. |

### Closed beta 전 P1/P2

| ID | 검증 사실 | 시정 package |
|---|---|---|
| P1-AUTH-RACE | 삭제 뒤 local storage purge error를 무시하고 delayed auth callback으로 signed-in이 부활한다. OAuth pending PKCE도 purge하지 않는다. | R4 |
| P1-DATA | auth mapping을 끊어도 stable subject, economy/daily/attempt/tap/progression data가 남는다. 최신 tables와 nested JSON은 기존 PII scan 범위 밖이다. | R2, R3 |
| P1-BACKUP | main manifest는 `allowBackup=true`; Supabase session은 SQLite localStorage에 지속되며 exclusion rule이 없다. | R6 |
| P1-PERMISSION | storage read/write와 `SYSTEM_ALERT_WINDOW` 권한의 release 필요성이 입증되지 않았다. | R6 |
| P1-READY | `/ready`는 attempt policy와 `select 1`만 확인해 PUBLISHED 5-pin casual season이 없어도 200이 될 수 있다. | R7 |
| P1-ROLE | production role 문서는 `app_server`만 예시하지만 runtime은 `economy_server`, season publish는 `economy_deployment_role`을 요구한다. | R7 |
| P1-ABUSE | router에는 production 분산 rate limit과 429/Retry-After 구현이 없다. | R3, R7 |
| P1-SUPPLY | Gradle wrapper checksum/dependency verification이 없고 dynamic JSC version과 broad JitPack, mutable Action tags가 있다. | R6, R8 |
| P2-IDENTITY | raw `app.json`은 TouchCatch/touchcatch지만 effective Expo/native config는 Spot Learn Battle/spotlearn이다. | R6 |
| P2-OAUTH | production callback은 host/path 제약 없는 custom scheme이고 Play app-signing certificate 기반 검증이 없다. | R6, R9 |
| P2-CORS | production config가 remote HTTP origin을 허용하고 router는 allow-list와 무관하게 loopback Origin을 허용한다. | R7 |

### “통과” 주장의 정확한 해석

- `mobile:contracts` 57 files / 343 tests와 `mobile:typecheck`는 직접 pinned 실행에서 통과했지만, 현재의 잘못된 local logout 의미론을 테스트할 뿐 실제 계정 삭제를 증명하지 않는다.
- `server:test` 25 files / 133 tests는 통과했지만 삭제 handler의 성공·실패·DB side effect를 테스트하지 않고 TypeScript compile 오류도 잡지 못한다.
- `openapi:lint`는 exit 0이지만 34 warnings를 출력한다. “오차 0건”이 아니다.
- `pnpm mobile:check`는 현재 Windows PATH에서 composite script 내부의 bare `pnpm`이 Node 24.19.0 / pnpm 11.19.0으로 이탈해 재현 실패했다. 직접 pinned 하위 명령의 성공과 composite gate 성공은 구분한다.
- `walkthrough.md`는 저장소에 없고 root `implementation_plan.md`는 계정 삭제/Play release 계획이 아니라 과거 500-pack 콘텐츠 계획이다.
- `docs/release-evidence-blockers.md:7-15`는 exact runtime, signed build, DB restore, legal, physical device, telemetry, soak를 계속 `BLOCKED_EXTERNAL`로 표시한다.
- production game route와 source-level private-content boundary는 이전 계획보다 개선됐다. 다만 source route scan은 imported transitive graph나 signed AAB를 증명하지 않으며, approved content의 live publication도 아직 external deployment step이다.

### 0.1 실행 중 확인한 정정 (2026-08-26)

R0/R1 착수 시점에 pinned runtime으로 재현한 결과다. 0절의 P0 표는 확인한 범위에서 모두 사실이었고, 아래 네 가지가 추가로 필요하다.

| ID | 정정 | 영향 |
|---|---|---|
| C-GATE-1 | P0-TYPE-1이 로컬 게이트를 통과한 이유는 router 코드가 아니라 **게이트 구성**이다. root `tsconfig.json`의 `include`는 `apps/mobile/src`, `packages`, `tests`, `tools`뿐이고 `apps/server/**`가 없다. `package.json`의 `check` 체인에도 `server:check`/`server:typecheck`가 없었다. 즉 서버 코드는 “23단계 전체 게이트”가 **한 번도 타입체크하지 않았다.** root `test`는 `apps/**/*.test.ts`를 포함하므로 서버 *테스트*만 돌고 있었다. | R1에서 router만 고치면 같은 종류의 회귀가 다시 통과한다. `check` 체인에 `server:typecheck`를 3단계로 넣어야 하고(24단계), `tools/check-docs-lib.ts`의 `requiredGateCommands`와 `CLAUDE.md`의 단계 수도 함께 고쳐야 한다. CI의 별도 `server` job은 이 구멍을 덮지 못한다 — 사람이 “게이트 통과”라고 말할 때 근거로 쓰는 것은 로컬 `pnpm check`다. |
| C-PLAY-1 | **closed testing 12명 / 연속 14일 요건이 계획에 전혀 없다.** 2023-11-13 이후 생성된 개인 개발자 계정은 production access 신청 전에 closed testing 트랙에서 tester 12명이 **연속 14일** opt-in 상태를 유지해야 한다. **internal testing은 이 요건에 1일도 산입되지 않는다.** 14일 창이 닫힌 뒤 신청하고 심사에 보통 7일 이하가 더 걸린다. | S3 → S4 승격의 실제 하한이 **최초 closed opt-in으로부터 21일 이상**이다. 계획의 S2A(internal bootstrap)는 이 시계를 시작시키지 못한다. Play Console 계정 유형과 생성일을 R0에서 먼저 확인하고, 확인 결과를 S3 진입 조건에 적어야 한다. |
| C-PLAY-2 | **2026-08-31부터 신규 앱과 앱 업데이트 모두 Android 16(API 36) 타깃이 필수다.** 이 계획 작성 5일 뒤다. 현재 Expo 57 기본값이 이미 `targetSdkVersion 36`으로 해석되므로 **요건은 충족 상태**지만, 저장소 어디에도 이 값을 고정하는 검사가 없어 의존성 변경으로 조용히 내려갈 수 있다. | R6에 targetSdk 회귀 검사를 넣는다. C-PLAY-1의 21일 하한 때문에 이 릴리스는 어떤 경로로도 08-31 이후에 제출되므로, API 36은 선택이 아니라 전제다. |
| C-DEL-1 | 계정 삭제 완료에 대한 **Google의 명시적 최대 기한은 없다.** 공식 문구는 “reasonably quick period of time”이며, 요구되는 것은 요청 시점에 사용자에게 무엇이 언제 일어나는지 알리는 것이다. Data safety form의 “90일” 옵션은 *자동* 삭제·익명화 주기를 묻는 별개 항목이지 삭제 요청 처리 기한이 아니다. | 2절의 durable 202 + worker 구조는 정책상 문제없다. 다만 **컴플라이언스 산출물은 HTTP 상태 코드가 아니라 “무엇이 언제”를 알리는 사용자 대면 문구**다. R4의 destructive UX와 R5의 portal 문구가 그 역할을 하도록 명시한다. |

또한 P2-IDENTITY는 P2가 아니라 R6의 선행 조건이다. `app.config.js`가 `name`/`slug`/`scheme`을 하드코딩해 `app.json`을 조용히 이겨왔고, 그래서 스토어 이름만 TouchCatch로 바뀐 채 빌드·설치되는 앱과 OAuth callback scheme은 계속 `Spot Learn Battle`/`spotlearn`이었다. 이름 하나가 아니라 **네이티브 manifest·`strings.xml`·Gradle·coordinator·Supabase redirect allow-list가 한 값을 따르는지**의 문제다.

## 1. 범위·원칙·승격 모델

### 범위

- 첫 외부 배포는 `docs/decisions/2026-08-20-launch-scope.md`대로 Android closed beta, KR cohort, server-authoritative casual learning만 포함한다.
- PvP, pet economy/rewards, ranking rewards, iOS, public store launch는 이번 plan의 출시 범위가 아니다. 바이너리·스토어 카피·Data Safety에서 숨기거나 `NOT_IN_SCOPE` 증거로 고정한다.
- Google Play internal track은 최대한 이른 설치 QA에 사용하되 production readiness의 대체 증거로 사용하지 않는다.

### 절대 원칙

- 현재 dirty tree를 reset, checkout, clean, 삭제하지 않는다. R0에서 파일별 포함/보존/제외 결정을 기록한 뒤 clean RC를 별도로 만든다.
- 한 번에 한 work package만 구현·검토·병합한다. Grok `/execute-plan`과 병렬 PR DAG를 사용하지 않는다.
- HTTP 2xx는 실제 완료 또는 durable request 수락만 의미한다. optional dependency, swallowed error, debug signing fallback을 금지한다.
- local PASS는 production proof가 아니다. 외부 증거는 immutable runtime source SHA, evidence commit SHA, artifact SHA-256, 환경, 승인자, 만료일과 연결한다. evidence-only commit은 runtime artifact를 바꾸지 못한다.
- `check:db`는 DB reset을 수행하므로 disposable local/CI Supabase에서 `TOUCHCATCH_ALLOW_LOCAL_DB_RESET=1`이 있을 때만 실행한다.
- 법적 근거·보존 기간·사업자 정보·아동 대상·지원 채널을 에이전트가 추정하거나 승인하지 않는다.
- 문서의 `<release-id>` 계열 표기는 사람이 채우는 미결정 placeholder가 아니라 R8 allocator가 생성하는 path parameter다. emitted manifest/path에 `<...>`, `TBD`, `TODO`, `UNKNOWN`이 남으면 preflight가 실패한다.

### 상태 승격

```text
S0 DIRTY_LOCAL
  -> S1 CLEAN_RC_GREEN
  -> S2A INTERNAL_BOOTSTRAP_STAGING
  -> S2B STAGING_FULL_PRIVACY_QA
  -> S2C PRODUCTION_RC_INTERNAL
  -> S3 CLOSED_BETA_EXTERNAL
  -> S4 LIMITED_PRODUCTION
```

- S1: 동일 SHA의 clean checkout에서 현재 범위 자동 gate가 PASS하고 거짓 삭제 surface가 격리됨.
- S2A: R0/R1/R6과 R8 protected workflow가 PASS한 별도 bootstrap AAB(`versionCode=n`)를 internal에 올린다. 비프로덕션 API/DB, 합성·폐기 계정, 내부 설치·startup·navigation 및 Play App Signing bootstrap만 허용하며 deletion/Data Safety 완료 증거로 쓰지 않는다.
- S2B: R2…R8 구현과 production-like staging deploy/restore를 마친 뒤 삭제/portal/legal link/observability를 내부 계정으로 검증한다. bootstrap AAB는 production RC로 승격하지 않는다.
- S2C: production API/DB/portal/OAuth와 public `assetlinks.json`을 승인된 workflow로 배포한 뒤 Play 원격 최대값보다 큰 새 `versionCode=m`의 production RC를 한 번 빌드·업로드한다. Play에서 설치한 동일 bundle을 full privacy QA하고 재빌드하지 않는다.
- S3: S2C의 exact Play bundle/versionCode를 재빌드·재업로드 없이 closed review에 제출한다. managed publishing과 tester access를 비활성으로 유지한 채 final observed data inventory와 rendered legal artifact 승인, 실제 삭제 dry-run, restore drill, physical device, Console review `ACCEPTED` 증거를 같은 release manifest에 연결하고, 최종 서명 뒤 별도 protected activation으로 closed tester access를 연다.
- S4: P0 blocker 0개, closed beta 관찰·alert·rollback 증거, 서명된 WP-11 go/no-go.

## 2. 목표 아키텍처

### 계정 삭제

```text
Mobile / public account portal
  -> persist 256-bit receipt secret + Idempotency-Key before network
  -> recent-auth challenge bound to idempotency/receipt
  -> forced password/OAuth reauthentication
  -> exchange proof for one-time deletion grant
  -> DELETE /v1/me + Idempotency-Key + receipt proof + deletion grant
  -> privacy deletion request (durable DB row + access tombstone)
  -> 202 ACCESS_BLOCKED + request ID
  -> privacy worker (separate secret boundary)
       1. APP_DATA_DISPOSED
       2. PROVIDERS_REVOKED
       3. AUTH_DELETED
       4. COMPLETED
  -> client-held receipt status / completion notification
```

durable enqueue transaction은 request와 access tombstone을 함께 commit하므로 공개 상태는 `ACCESS_BLOCKED -> APP_DATA_DISPOSED -> PROVIDERS_REVOKED -> AUTH_DELETED -> COMPLETED`다. 운영 분기는 `FAILED_RETRYABLE`, `FAILED_PERMANENT`, `MANUAL_REVIEW`, `BLOCKED_LEGAL_HOLD`이며 개별 stage는 `NOT_APPLICABLE`을 가질 수 있다. 같은 user/idempotency key와 receipt proof는 같은 request를 반환한다. user당 nonterminal request는 하나뿐이다. API process에는 Supabase service-role secret을 주지 않고, worker deployment만 Auth Admin/provider secrets와 좁은 `privacy_operator` DB 권한을 가진다.

### 법무·Data Safety

`docs/legal/data-processing-inventory.v1.yaml`을 데이터 처리 SSOT로 만든다. 개인정보처리방침, account-deletion page, Data Safety worksheet는 이 inventory와 실제 dependency/manifest/network inventory에서 생성·검증한다. 사람이 승인한 `docs/approvals/privacy-data-processing-v1-approval.json` 없이는 release preflight가 실패한다.

### Android release

제품 identity는 `TouchCatch / touchcatch / com.touchcatch.mobile / 1.0.0`으로 승인하되 `versionCode`는 Play 원격 최대값보다 큰 값을 protected allocator가 각 업로드마다 배정한다. S2A bootstrap과 S2C production RC는 서로 다른 release ID/versionCode다. Expo resolved config, OAuth callback, native manifest, `strings.xml`, Gradle을 기계적으로 비교한다. release task에는 네 signing secret, 실제 upload keystore와 independent trust anchor로 검증된 upload-certificate approval이 필수다. fingerprint expected value를 환경변수로 override할 수 없다. 최종 `.aab`를 zip/binary/manifest/signature/dependency 관점에서 검사하고 SHA-256 및 OIDC provenance를 만든다.

### Required interface shapes

Account deletion public DTO는 다음 모양을 유지한다. receipt secret은 client가 요청 전에 256-bit CSPRNG로 만들고 SecureStore에 먼저 저장한다. 서버는 hash만 저장하고 202 body로 secret을 돌려주지 않으며 server log, URL, analytics에도 넣지 않는다.

```ts
export type AccountDeletionState =
  | 'ACCESS_BLOCKED'
  | 'APP_DATA_DISPOSED'
  | 'PROVIDERS_REVOKED'
  | 'AUTH_DELETED'
  | 'COMPLETED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT'
  | 'MANUAL_REVIEW'
  | 'BLOCKED_LEGAL_HOLD';

export type AccountDeletionAccepted = Readonly<{
  requestId: string;
  state: 'ACCESS_BLOCKED';
}>;

export type AccountDeletionStatus = Readonly<{
  requestId: string;
  state: AccountDeletionState;
  retryable: boolean;
  stages: readonly Readonly<{
    name: 'APP_DATA' | 'PROVIDERS' | 'AUTH' | 'NOTIFICATION';
    outcome: 'PENDING' | 'COMPLETED' | 'NOT_APPLICABLE' | 'FAILED_RETRYABLE' | 'FAILED_PERMANENT';
  }>[];
  updatedAt: string;
  receiptExpiresAt: string;
}>;
```

Mobile controller는 local sign-out을 삭제 API로 가장하지 않고 두 port를 명시적으로 받는다.

```ts
export interface AccountDeletionPort {
  createChallenge(input: Readonly<{ idempotencyKey: string; receiptSecret: string; method: 'password' | 'google' | 'kakao' }>): Promise<Readonly<{ challengeId: string; nonce: string; expiresAt: string }>>;
  exchangeRecentAuth(input: Readonly<{ challengeId: string; method: 'password' | 'google' | 'kakao'; proof: string }>): Promise<Readonly<{ deletionGrant: string; expiresAt: string }>>;
  request(input: Readonly<{ idempotencyKey: string; receiptSecret: string; deletionGrant: string }>): Promise<AccountDeletionAccepted>;
  readStatus(input: Readonly<{ receiptSecret: string }>): Promise<AccountDeletionStatus>;
}

export interface LocalAuthPurgePort {
  purgeSession(): Promise<void>;
  purgePendingOAuth(): Promise<void>;
  purgeAuthCaches(): Promise<void>;
}
```

Release Gradle 구성은 다음 fail-closed 형태를 따른다. debug task에서는 release secret을 요구하지 않지만 release task graph는 네 값과 file을 모두 검사한다.

```groovy
def releaseSigningNames = ["KEYSTORE_PATH", "KEYSTORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD"]
def releaseSigningValues = releaseSigningNames.collectEntries { [(it): System.getenv(it)] }

signingConfigs {
    release {
        if (releaseSigningValues.KEYSTORE_PATH) {
            storeFile file(releaseSigningValues.KEYSTORE_PATH)
            storePassword releaseSigningValues.KEYSTORE_PASSWORD
            keyAlias releaseSigningValues.KEY_ALIAS
            keyPassword releaseSigningValues.KEY_PASSWORD
        }
    }
}

gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.name.toLowerCase().contains("release") }) {
        def missing = releaseSigningNames.findAll { !releaseSigningValues[it]?.trim() }
        if (!missing.isEmpty()) throw new GradleException("Missing release signing inputs: ${missing.join(', ')}")
        if (!file(releaseSigningValues.KEYSTORE_PATH).isFile()) throw new GradleException("Release keystore file not found")
    }
}
```

## 3. Work packages

### R0. 출시 주장 동결, dirty tree 분류, clean RC 생성

**Maps to:** master WP-0, WP-1

**Files:**

- Create: `docs/reviews/2026-08-26-google-play-readiness-audit.md`
- Create: `docs/reviews/2026-08-26-working-tree-release-disposition.md`
- Create: `docs/release-evidence/release-manifest.schema.json`
- Create: `tools/powershell/Invoke-NativeChecked.ps1`
- Create: `tools/powershell/test-Invoke-NativeChecked.ps1`
- Modify: `docs/release-evidence-blockers.md`
- Modify: `docs/operations/release-evidence-owners.md`
- Create after human assignment: `docs/release-evidence/<release-id>/manifest.json`

- [ ] Audit document에 이 plan의 P0 표와 실제 재현 명령/출력을 기록하고, 결론을 `NO_GO_EXTERNAL`로 고정한다.
- [ ] 감사 최초 242개와 disposition 시점에 추가된 모든 dirty entry를 재열거하고 `INCLUDE_IN_RC`, `PRESERVE_FOR_LATER`, `EXPERIMENT_NOT_IN_RC`로 한 번씩 분류한다. 어떤 entry도 자동 삭제하지 않는다.
- [ ] release owner가 각 `INCLUDE_IN_RC` 변경의 출처와 검토자를 기록한다. untracked legal/build files도 commit 없이는 evidence가 아님을 명시한다.
- [ ] owner 표에 역할명만 두지 말고 실제 책임자 식별자, 승인 artifact URI, review/expiry를 기록한다. 계정 삭제, Privacy/Legal, DB/Ops, OAuth, Mobile QA, Release Engineering, Play Console Admin, Support 역할이 모두 있어야 한다.
- [ ] Product/Play owner가 product identity tuple `TouchCatch/touchcatch/com.touchcatch.mobile/1.0.0`을 승인한다. 기존 `Spot Learn Battle/spotlearn`을 유지하기로 결정하면 R6 시작 전에 이 plan과 legal/store/OAuth identity를 하나의 다른 tuple로 함께 개정하며 혼합 상태는 금지한다. `versionCode`는 identity 상수가 아니라 R8 protected allocator가 Play 원격 최대값을 조회해 배정한다.
- [ ] release evidence manifest schema를 `{releaseId, runtimeSourceSha, evidenceCommitSha, versionName, versionCode, applicationId, artifactRole, artifacts[], approvals[], blockers[], playRelease}`로 고정한다. artifact는 `{kind, sha256, sourceSha, uri, environment, createdAt, provenanceUri}`를 필수로 하고, Play upload/edit/track/versionCode/status, closed-review submission과 access-activation receipt를 서로 다른 record에 묶는다. evidence commit에 runtime-affecting diff가 있으면 manifest를 거부한다.
- [ ] PowerShell helper는 native exit를 각 호출 직후 검사하고 stdout/stderr를 보존한다. expected-failure helper는 non-zero만 보지 않고 exact error pattern과 forbidden artifact 부재를 assert한다. invalid Node command 뒤 `Pop-Location`이 실행돼도 전체 test가 0으로 바뀌지 않는 regression을 추가한다.
- [ ] clean worktree/branch는 disposition 승인 뒤에만 만들고 선택된 commit만 포함한다. 원래 dirty tree는 그대로 보존한다.

**Verify:**

```powershell
. tools/powershell/Invoke-NativeChecked.ps1
Invoke-NativeChecked powershell -NoProfile -ExecutionPolicy Bypass -File tools/powershell/test-Invoke-NativeChecked.ps1
$status = Invoke-NativeChecked git status --porcelain=v1
if ($status) { throw "release candidate is not clean" }
Invoke-NativeChecked git diff --check
Invoke-NativeChecked git ls-files --error-unmatch docs/legal/privacy-policy.md docs/legal/terms-of-service.md docs/legal/google-play-data-safety.md tools/mobile/build-release-aab.ps1
```

Expected: clean RC에서는 첫 두 명령 출력이 없고, 네 파일이 모두 tracked다. 원래 작업 트리는 이 acceptance 대상이 아니다.

**Commit:** `docs: freeze google play readiness as external no-go`

### R1. 자동 gate를 진실하고 재현 가능하게 복구

**Maps to:** master WP-1, WP-3

**Files:**

- Modify: `apps/server/src/http/router.ts`
- Modify: `apps/server/src/http/pet-handlers.ts`
- Modify: `apps/server/src/runtime.ts`
- Modify: `apps/mobile/src/auth/session-controller.ts`
- Modify: `apps/mobile/src/auth/session-controller.test.ts`
- Modify: `apps/mobile/app/profile.tsx`
- Modify: `apps/mobile/src/routes/profile-route.test.tsx`
- Modify: `packages/contracts/src/openapi.test.ts`
- Modify: `packages/contracts/openapi.yaml`
- Modify: `package.json`
- Modify: `tools/run-pnpm.mjs`
- Create: `redocly.yaml`
- Create: `tools/check-openapi.mjs`
- Create: `tools/check-openapi.test.ts`
- Create: `tests/contracts/composite-runtime-pinning.test.ts`

- [ ] RED: `router.ts`의 exact optional property compile 실패를 고정하는 `server:typecheck` regression을 기록한다.
- [ ] `resolve()`가 route를 찾지 못한 경우 `route: undefined`를 넣지 않고 conditional spread로 key 자체를 생략하게 수정한다.
- [ ] 실제 삭제가 R3/R4에서 준비될 때까지 거짓 삭제 UI, `SessionController.deleteAccount`, runtime DELETE wiring과 OpenAPI DELETE operation을 함께 제거한다. handler 파일이 남더라도 production route에서 도달할 수 없어야 한다.
- [ ] RED regression은 R3 전 candidate에서 `DELETE /v1/me`가 404/405이고 profile에 “회원 탈퇴” action이 없음을 요구한다. “실패할 수 있는 기능”을 200 성공으로 노출하지 않는다.
- [ ] lint warning을 0으로 만들기 위해 사용하지 않는 component는 `openapi.planned.yaml`로 이동하거나 삭제한다.
- [ ] `redocly.yaml`에서 `no-unused-components`를 포함한 release rules를 error severity로 고정하고, JSON lint output에 warning/error가 하나라도 있으면 `check-openapi.mjs`가 non-zero를 반환하게 한다. `--max-problems 0`은 warning을 오류로 만들지 않으므로 사용하지 않는다.
- [ ] composite scripts의 bare `pnpm`을 `node tools/run-pnpm.mjs` 호출로 교체한다. 최소 대상은 `admin:check`, `server:check`, `mobile:check`, `verify`다.
- [ ] `composite-runtime-pinning.test.ts`가 composite script 실행 중 `process.execPath`, Node, pnpm user agent가 각각 24.18.0/11.13.0인지 검사하게 한다.

**Verify:**

```powershell
$env:PATH="$env:APPDATA\fnm\node-versions\v24.18.0\installation;$env:PATH"
. tools/powershell/Invoke-NativeChecked.ps1
Invoke-NativeChecked corepack pnpm check:runtime
Invoke-NativeChecked corepack pnpm server:typecheck
Invoke-NativeChecked corepack pnpm exec vitest run packages/contracts/src/openapi.test.ts tests/contracts/composite-runtime-pinning.test.ts apps/server/src/http/router.test.ts apps/mobile/src/auth/session-controller.test.ts apps/mobile/src/routes/profile-route.test.tsx
Invoke-NativeChecked corepack pnpm exec vitest run tools/check-openapi.test.ts
Invoke-NativeChecked corepack pnpm openapi:lint
Invoke-NativeChecked corepack pnpm mobile:check
```

Expected: 모든 명령 exit 0, Redocly warning 0, 출력된 runtime은 Node 24.18.0 / pnpm 11.13.0 하나뿐이다.

**Commit:** `fix: restore truthful pinned release gates`

### R2. 데이터 처분·보존·아동·제공자 결정을 사람 승인으로 닫기

**Maps to:** master WP-9

**Files:**

- Create: `docs/legal/data-processing-inventory.v1.yaml`
- Create: `docs/legal/account-deletion-disposition.v1.yaml`
- Create: `docs/legal/data-processing-inventory.schema.json`
- Create: `docs/legal/account-deletion-disposition.schema.json`
- Create: `docs/approvals/privacy-data-processing-v1-approval.schema.json`
- Create after human approval: `docs/approvals/privacy-data-processing-v1-approval.json`
- Create: `docs/approvals/target-audience-decision.schema.json`
- Create after Product/Privacy approval: `docs/approvals/target-audience-decision.json`
- Create: `docs/legal/families-compliance-matrix.v1.yaml`
- Modify: `config/trusted-approval-signers.v1.json` only through owner-reviewed key rotation
- Modify: `docs/operations/quarantine-policy-input.md`
- Create: `tools/legal/validate-data-processing.mjs`
- Create: `tools/legal/validate-data-processing.test.ts`
- Create: `tools/legal/derive-data-processing-evidence.mjs`
- Create: `tools/legal/derive-data-processing-evidence.test.ts`
- Create: `tools/approvals/verify-approval-signature.mjs`
- Create: `tools/approvals/verify-approval-signature.test.ts`

- [ ] Inventory schema에 `surface`, `playTaxonomy`, `playSubtype`, `dataType`, `fields`, `source`, `storage`, `processor`, `sdkAndVersion`, `offDevice`, `recipients`, `firstOrThirdParty`, `sharingExceptionAndEvidence`, `collected`, `shared`, `ephemeral`, `required`, `purposes`, `legalBasis`, `retention`, `deletionAction`, `backupAction`, `encryptedInTransit`, `evidence`를 모두 required로 만든다. web/support-only data가 Android Data Safety로 잘못 투영되지 않게 `surface`를 강제한다.
- [ ] 최소 범주는 email/password auth metadata, OAuth/user IDs, access/refresh sessions, profile/nickname, subject key, learning attempts/taps/metrics, pet/economy ledgers, deletion request/tombstone/receipt hash/stage audit, mobile SecureStore와 web sealed-cookie의 receipt/idempotency recovery state, portal OTP/OAuth, support ticket/identity evidence/approval audit, portal/API access-security log, logs/crash, analytics, raw quarantine JSON, object storage, backup/WAL/PITR다.
- [ ] completeness scanner가 migrations/tables/columns/JSON payload, package dependencies, Android manifests, environment endpoint usage, local/SecureStore keys를 source-derived evidence로 만들고 inventory의 각 row와 양방향 대조한다. 사람이 작성한 목록만 schema-valid하면 통과하는 validator는 금지한다.
- [ ] disposition은 각 테이블/processor에 `DELETE`, `REDACT`, `RETAIN_UNTIL` 중 하나를 요구한다. `RETAIN_UNTIL`에는 기간과 법적 근거가 필수이며 빈 문자열과 승인되지 않았음을 뜻하는 sentinel 값을 validator가 거부한다.
- [ ] closed beta 기본 권고는 single-user profile, pet, attempt/tap, progression, economy/receipt 데이터를 live DB에서 삭제하고, shared match row는 auth 연결과 사용자 표시값을 redact하는 것이다. 실제 action은 Privacy/Legal 및 DB/Ops owner가 승인한다.
- [ ] backup/WAL/PITR에는 backup 보존 horizon, tombstone 재적용 방식, restore drill 검사, legal hold 우선순위와 해제 절차를 승인한다.
- [ ] Supabase, Google, Kakao, hosting/CDN, crash/telemetry provider별 controller/processor/shared 판정, 계약 근거, 삭제/revoke 경로를 승인한다.
- [ ] Product owner가 intended target age를 versioned decision artifact로 선언한다. artifact는 적용 Google policy version/date, UI/store-copy/content evidence hash, mixed-audience 여부, approver/signature/expiry를 필수로 한다. validator가 실제 UI/copy/function과 Google 기준으로 Families branch를 계산하며 선언과 evidence가 다르면 실패한다.
- [ ] 아동 연령을 포함하면 Families matrix의 child-directed SDK, ads, PII/auth/consent, parental gate, content/creative, store listing acceptance가 모두 자동 필수가 된다. 각 control은 evidence hash와 owner를 가져야 하며 사람 서명이나 빈 `NOT_APPLICABLE`로 정책 branch를 면제할 수 없다.
- [ ] R2 approval은 구현 전 `DESIGN_APPROVED`다. approval JSON에 inventory/disposition SHA-256, approver IDs, approvedAt, reviewAt, decision ID, `signerKeyId`, detached signature, registry SHA-256와 independent protected/KMS trust-anchor ID/digest가 정확히 들어가야 validator가 cryptographically PASS한다. R9의 정적 production pre-scan 뒤에는 합성 계정만 허용하는 `PRODUCTION_E2E_APPROVED`, mobile+portal+support E2E와 통합 재스캔 뒤에는 일반 처리용 최종 `RELEASE_APPROVED`를 별도로 발급한다.
- [ ] repository registry는 trust root가 아니다. signature verifier는 independent KMS/public-key anchor로 registry signature/revocation을 먼저 검증한 뒤 canonical JSON, algorithm/key ID allow-list, approval scope, expiry를 검사한다. forged approver, repository registry+verifier 동시 replacement, unknown/revoked key, modified hash, expired/wrong-release approval을 negative test하고 signing private key를 repository/local CI artifact에 저장하지 않는다.

**Verify:**

```powershell
. tools/powershell/Invoke-NativeChecked.ps1
Invoke-NativeChecked corepack pnpm exec vitest run tools/legal/validate-data-processing.test.ts
Invoke-NativeChecked corepack pnpm exec vitest run tools/legal/derive-data-processing-evidence.test.ts
Invoke-NativeChecked corepack pnpm exec vitest run tools/approvals/verify-approval-signature.test.ts
Invoke-NativeChecked node tools/legal/derive-data-processing-evidence.mjs --check
Invoke-NativeChecked node tools/legal/validate-data-processing.mjs --check
```

Expected: 데이터 범주/processor/table 누락 0, 미승인 retention 0, hash drift 0. 사람 승인 전에는 두 번째 명령이 의도적으로 non-zero이며 external gate는 닫혀 있어야 한다.

**Commit:** `docs: approve account deletion data disposition`

### R3. Durable account-deletion DB/API/worker 구현

**Maps to:** master WP-3, WP-7, WP-8, WP-9

**Files:**

- Create: `supabase/migrations/202608260001_account_deletion_workflow.sql`
- Create: `supabase/tests/database/account-deletion.test.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Modify: `supabase/tests/database/daily-pet-loop.test.sql`
- Create: `tests/database/account-deletion-concurrency.test.ts`
- Create: `tests/database/account-deletion-postgrest.test.ts`
- Modify: `supabase/roles.sql` only for disposable local test roles
- Modify: `docs/operations/database-role-provisioning.md`
- Create: `apps/server/src/privacy/account-deletion-service.ts`
- Create: `apps/server/src/privacy/account-deletion-service.test.ts`
- Create: `apps/server/src/privacy/account-deletion-api-rpc.ts`
- Create: `apps/server/src/privacy/account-deletion-api-rpc.test.ts`
- Create: `apps/server/src/privacy/account-deletion-worker.ts`
- Create: `apps/server/src/privacy/account-deletion-worker.test.ts`
- Create: `apps/server/src/privacy/account-deletion-worker.integration.test.ts`
- Create: `apps/server/src/privacy/privacy-effect-journal.ts`
- Create: `apps/server/src/privacy/privacy-effect-journal.test.ts`
- Create: `apps/server/src/privacy/privacy-worker-rpc.ts`
- Create: `apps/server/src/privacy/privacy-worker-rpc.test.ts`
- Create: `apps/server/src/privacy/privacy-worker-env.ts`
- Create: `apps/server/src/privacy/privacy-worker-env.test.ts`
- Create: `apps/server/src/privacy/worker-runtime.ts`
- Create: `apps/server/src/privacy/worker-runtime.test.ts`
- Create: `apps/server/src/privacy/supabase-auth-admin.ts`
- Create: `apps/server/src/privacy/supabase-auth-admin.test.ts`
- Create: `apps/server/src/privacy/provider-revocation.ts`
- Create: `apps/server/src/privacy/provider-revocation.test.ts`
- Create: `apps/server/src/privacy/provider-handle-vault.ts`
- Create: `apps/server/src/privacy/provider-handle-vault.test.ts`
- Create: `apps/server/src/privacy/storage-disposition.ts`
- Create: `apps/server/src/privacy/storage-disposition.test.ts`
- Create: `apps/server/src/privacy/deletion-notification-outbox.ts`
- Create: `apps/server/src/privacy/deletion-notification-outbox.test.ts`
- Create: `apps/server/src/privacy/deletion-notification.ts`
- Create: `apps/server/src/privacy/deletion-notification.test.ts`
- Create: `apps/server/src/privacy/disposition-approval-verifier.ts`
- Create: `apps/server/src/privacy/disposition-approval-verifier.test.ts`
- Create: `apps/server/src/privacy/worker-trust-anchor.ts`
- Create: `apps/server/src/privacy/worker-trust-anchor.test.ts`
- Create: `apps/server/src/privacy/legal-hold-service.ts`
- Create: `apps/server/src/privacy/legal-hold-service.test.ts`
- Create: `apps/server/src/privacy/retention-sweeper.ts`
- Create: `apps/server/src/privacy/retention-sweeper.test.ts`
- Create: `apps/server/src/http/account-deletion-handler.ts`
- Create: `apps/server/src/http/account-deletion-handler.test.ts`
- Create: `apps/server/src/http/rate-limit.ts`
- Create: `apps/server/src/http/rate-limit.test.ts`
- Create: `apps/server/src/auth/account-access-guard.ts`
- Create: `apps/server/src/auth/account-access-guard.test.ts`
- Create: `apps/server/src/auth/account-deletion-reauth.ts`
- Create: `apps/server/src/auth/account-deletion-reauth.test.ts`
- Create: `apps/server/src/auth/deletion-grant.ts`
- Create: `apps/server/src/auth/deletion-grant.test.ts`
- Modify: `apps/server/src/database/pg-rpc.ts`
- Modify: `apps/server/src/auth/subject-resolver.ts`
- Modify: `apps/server/src/http/me-handler.ts`
- Modify: `apps/server/src/http/pet-handlers.ts`
- Modify: `apps/server/src/http/router.ts`
- Modify: `apps/server/src/runtime.ts`
- Modify: `apps/server/src/http/me-handler.test.ts`
- Modify: `apps/server/src/auth/subject-resolver.test.ts`
- Modify: `apps/server/src/database/pg-rpc.test.ts`
- Modify: `apps/server/src/http/router.test.ts`
- Modify: `apps/server/src/http/router.contract.test.ts`
- Modify: `apps/server/package.json`
- Modify: `apps/server/.env.example`
- Create: `apps/server/.env.privacy-worker.example`
- Create: `apps/server/src/privacy/secret-boundary.test.ts`
- Create: `docs/operations/privacy-worker-trust-anchor.md`
- Modify: `packages/config/src/env.ts`
- Modify: `packages/config/src/env.test.ts`
- Modify: `packages/contracts/openapi.yaml`
- Modify: `packages/contracts/src/openapi.test.ts`

#### R3.1 Database RED/GREEN

- [ ] RED pgTAP은 deterministic single-session policy를 검사한다. 같은 user/key/receipt proof replay는 같은 request ID와 202 의미론을 갖고, 같은 key에 다른 proof 또는 같은 user의 두 번째 nonterminal request는 unique constraint/typed conflict로 거부되어야 한다.
- [ ] RED Node DB integration은 별도 connection들을 barrier로 동시에 풀어 두 DELETE, DELETE-vs-ensure, DELETE-vs-attempt start/tap/read 경합을 재현한다. pgTAP 단일 transaction을 true concurrency 증거로 사용하지 않는다.
- [ ] RED pgTAP은 R2 disposition의 모든 user-linked table, object-storage reference와 nested JSON을 seed한 뒤 DELETE/REDACT/RETAIN 결과를 table별로 검사한다. 기존 구형 economy 8종만 검사하는 테스트로 대체하지 않는다.
- [ ] migration에 private request, reauth challenge/grant, state/stage/effect history, tombstone, legal hold, retention queue와 notification outbox를 만들고 raw email, nickname, provider token, access token을 평문으로 저장하지 않는다. receipt-only lookup은 32-byte CSPRNG receipt에 `SHA-256("touchcatch:deletion-receipt:v1\0" || receiptBytes)`를 적용한 고정 길이 verifier와 unique index를 사용하고 원문을 저장·재발급하지 않는다. 256-bit 무작위 입력의 preimage 저항을 신뢰 경계로 문서화하고, domain/version 변경은 기존 verifier를 계속 지원하는 명시적 protocol migration 없이는 금지한다.
- [ ] partial unique index로 user당 incomplete request 하나를 강제하고 `(user,idempotency_key)` replay와 receipt lookup digest를 DB가 원자적으로 묶는다. 오직 `COMPLETED`만 terminal이다. `FAILED_PERMANENT`, `MANUAL_REVIEW`, `BLOCKED_LEGAL_HOLD`도 access tombstone과 active uniqueness를 유지하며 receipt는 incomplete request보다 먼저 만료되지 않는다. notification delivery는 unique outbox의 별도 상태로 두고 data-deletion completion을 되돌리지 않는다.
- [ ] enqueue 함수는 user/subject row lock 또는 advisory lock을 잡고 active request와 access tombstone을 한 transaction에서 생성한다. tombstone이 생긴 즉시 receipt-authenticated status와 same-user/key/proof의 exact DELETE replay를 제외한 모든 bearer-authenticated read/write와 `ensure_mobile_account_v1`가 중앙 guard 및 각 SECURITY DEFINER 함수에서 fail-closed해야 한다. replay exception은 새 side effect 없이 동일 202 body만 반환한다.
- [ ] worker-only SECURITY DEFINER 함수는 승인된 disposition만 수행한다. direct table privilege를 `privacy_operator`, `service_role`, public/anon/authenticated에 주지 않는다.
- [ ] privacy worker group role은 `NOLOGIN NOINHERIT`이며 exact worker functions만 실행한다. production login/secret은 migration이나 `supabase/roles.sql`에 만들지 않는다.
- [ ] append-only tap/economy trigger는 오직 security-owner deletion function 내부에서 승인된 privacy job에만 삭제를 허용하고 일반 role에는 계속 immutable이다.
- [ ] 기존 `rls.test.sql`과 `daily-pet-loop.test.sql`의 SECURITY DEFINER exact allowlist를 갱신하고 owner, fixed search_path, PUBLIC/authenticated/service_role revoke, API role-vs-worker role cross-denial을 검사한다.
- [ ] Supabase exposed schema의 모든 table/view/function과 PostgREST route를 inventory로 생성한다. tombstoned subject가 접근 가능한 direct grant는 revoke하고, 필요한 authenticated RLS에는 중앙 tombstone predicate를 강제한다. 실제 Supabase JWT로 PostgREST SELECT/INSERT/UPDATE/DELETE/RPC를 호출하는 integration test가 stale token, refreshed token, subject remap을 모두 거부해야 한다.
- [ ] `RETAIN_UNTIL`은 signed scope/authority/approvers/review/expiry가 있는 case-specific legal hold보다 우선순위를 명시한다. retention sweeper가 만료된 row/object/audit를 disposition대로 purge하고 overdue/hold-expiry alert를 내며 backup restore 뒤 tombstone/retention schedule을 재적용한다.

#### R3.2 Server RED/GREEN

- [ ] RED handler test: deletion dependency, recent-auth verifier, DB 또는 distributed rate-limit dependency가 없거나 실패하면 2xx가 절대 나오지 않는다. current runtime의 `dbCalls=0` 재현을 반대로 고정해 durable enqueue 1회 뒤에만 202를 요구한다.
- [ ] 기존 `createDeleteMeHandler`와 `SubjectResolver.deleteAccount?`를 제거하고 `me-handler.ts`는 GET만 담당하게 한다. dedicated `AccountDeletionService`를 `account-deletion-handler.ts`와 runtime에 required로 주입하고 router/pet-handler wiring 누락을 compile error로 만든다.
- [ ] API용 challenge/enqueue/status statement는 `AccountDeletionApiRpcName` exact allowlist와 API pool/login만 사용한다. hard-delete/stage-advance 함수는 별도 `PrivacyWorkerRpc`, 별도 pool/login/role에서만 호출하며 `MobileRpcName` 또는 `economy_server`에 넣지 않는다.
- [ ] challenge는 user/provider subject/idempotency key/receipt lookup digest/method에 묶인 nonce다. password는 challenge 이후 발급된 fresh session, Google/Kakao는 issuer/audience/azp/nonce/auth_time/state/PKCE와 authorization-code replay를 검증한 뒤 short-lived opaque deletion grant를 발급한다. grant는 user/provider subject/challenge/idempotency/receipt digest/`iat`/`exp`/`jti`에 묶고 DELETE transaction에서 한 번만 소비한다. UI confirmation만으로 충족하지 않는다.
- [ ] cross-user/provider/challenge/key/receipt grant swap, expired/replayed grant, OAuth code replay와 password pre-challenge session을 RED test로 고정한다. 기존 same-user/key/receipt request가 이미 commit된 경우 idempotent lookup을 consumed-grant 검사보다 먼저 수행해 동일 202만 반환한다.
- [ ] client가 네트워크 전에 저장한 UUIDv4 `Idempotency-Key`와 256-bit `Deletion-Receipt-Proof`를 DELETE header로 보낸다. request와 tombstone의 durable commit 성공 시만 `202 {requestId,state:'ACCESS_BLOCKED'}`를 반환하고 `200 deleted:true`와 server-generated receipt를 제거한다. 응답 유실 재시도는 같은 key/proof로 같은 body를 반환한다.
- [ ] OpenAPI에 challenge 201, proof-exchange 200, DELETE 202, receipt-authenticated `GET /v1/account-deletions/status`를 추가한다. status는 receipt lookup digest로 response-loss 뒤 request ID를 복구하므로 URL에 request ID/secret이 필요 없다. challenge/exchange/DELETE/status 각각의 400/401/403/404/409/410/429/503와 public error code를 exact map으로 고정한다. tombstoned account의 다른 authenticated route는 410 `ACCOUNT_DELETION_PENDING`이며 client가 token refresh하지 않는다. `MeError`를 재사용하지 않는다.
- [ ] status route는 global bearer security를 명시적으로 override하고 `Authorization: DeletionReceipt <secret>`만 허용한다. missing/wrong receipt는 constant-time-safe lookup/compare 뒤 동일 404 body/timing class를 사용하고, 승인된 metadata retention 안에서 valid-but-expired receipt만 410 `RECEIPT_EXPIRED`를 반환한다. URL/query/body/access log/analytics에 receipt를 넣지 않는다.
- [ ] enqueue/status endpoint에 user/request 단위 bounded rate limit을 적용하고 초과 시 documented 429를 반환한다. in-memory counter를 production 분산 rate limit이라고 오인하지 않는다.
- [ ] API runtime은 receipt verifier를 unkeyed domain-separated SHA-256으로 계산하며 이를 위한 KMS/HMAC secret을 로드하지 않는다. Auth Admin/service-role/provider/worker-KMS secret도 API에 로드하지 않는다. `server:privacy-worker` 별도 entrypoint와 `PrivacyWorkerEnv`만 Auth Admin/provider/KMS credentials와 worker DB login을 받으며, negative secret-boundary test가 API에 worker secret 주입 및 worker의 economy role 사용을 실패시킨다.
- [ ] worker claim은 짧은 transaction에서 `FOR UPDATE SKIP LOCKED`로 row를 잡아 random `owner_token`, monotonic `fence`, `lease_until`을 기록하고 commit한다. 외부 I/O는 transaction 밖에서 수행하고, stage 완료/lease 연장은 owner+fence+unexpired lease의 compare-and-set일 때만 성공한다. bounded backoff, max-attempt 전이/alert와 crash 후 lease 회수를 fault test한다.
- [ ] lease CAS만으로 외부 side effect 중복을 막았다고 주장하지 않는다. `(request,stage,target)` immutable effect journal, provider-supported idempotency key/current-state reconciliation, unique notification outbox를 사용한다. timeout 뒤 outcome이 불명확하면 `UNKNOWN_OUTCOME -> MANUAL_REVIEW`로 보내고 blind retry하지 않는다. provider handle은 APP_DATA dispose 전에 KMS로 capture한 뒤 subject association을 재검증한다.
- [ ] repository의 signer registry는 trust root가 아니다. worker는 protected environment/KMS의 독립 trust-anchor resource ID와 public-key digest를 image/deploy provenance에 pin하고 registry signature/revocation을 검증한다. approval scope는 release source SHA, migration-manifest hash, worker image digest, disposition hash, environment를 포함한다. staging synthetic worker만 `DESIGN_APPROVED`를 허용한다. production에서는 유효한 `PRODUCTION_E2E_APPROVED`의 exact synthetic-subject allowlist에 속하고 승인 hash를 request에 원자적으로 기록한 job만 제한적으로 claim하며, 일반 subject는 post-all-E2E `RELEASE_APPROVED` 전까지 claim을 거부한다.
- [ ] Supabase Auth Admin adapter는 user/identity/session delete 실패를 성공으로 바꾸지 않는다. Google/Kakao revoke/unlink는 R2 승인과 provider 테스트 계정으로 검증된 adapter만 활성화한다. 재개에 provider handle이 필요하면 R2가 승인한 최소 handle만 KMS envelope encryption으로 보존하고 stage 종료/expiry 시 삭제하며, 불필요한 provider는 `NOT_APPLICABLE`로 기록한다.
- [ ] R2 disposition에 따라 object storage를 삭제/redact하는 adapter와 ownership-conflict test를 추가한다. 완료 통지는 durable outbox와 provider adapter를 사용하고 contact data의 보존/삭제/`NOT_APPLICABLE`을 inventory와 일치시킨다.
- [ ] stale access JWT는 중앙 tombstone guard와 DB 함수별 방어로 receipt status와 exact idempotent DELETE replay를 제외한 모든 authenticated read/write에서 410 `ACCOUNT_DELETION_PENDING`을 반환한다. refresh, subject remap, 새 attempt, leaderboard/profile read로 우회할 수 없어야 한다.
- [ ] edge/API/worker structured audit에는 request ID, stage, outcome, duration, retry class만 남기고 auth UUID/subject/email/provider token/receipt/grant/proof를 남기지 않는다. canary secret로 access/error/edge log redaction을 검사하고 invalid-vs-missing receipt timing envelope를 통계적 허용 범위로 고정한다.

**Verify:**

```powershell
. tools/powershell/Invoke-NativeChecked.ps1
Invoke-NativeChecked corepack pnpm server:typecheck
Invoke-NativeChecked corepack pnpm exec vitest run apps/server/src/privacy apps/server/src/http/account-deletion-handler.test.ts apps/server/src/http/rate-limit.test.ts apps/server/src/http/me-handler.test.ts apps/server/src/auth/subject-resolver.test.ts apps/server/src/database/pg-rpc.test.ts apps/server/src/http/router.test.ts apps/server/src/http/router.contract.test.ts packages/contracts/src/openapi.test.ts

try {
    $env:TOUCHCATCH_ALLOW_LOCAL_DB_RESET='1'
    Invoke-NativeChecked corepack pnpm check:db
} finally {
    Remove-Item Env:TOUCHCATCH_ALLOW_LOCAL_DB_RESET -ErrorAction SilentlyContinue
}
```

Expected: unit/contract/pgTAP/다중-connection/PostgREST integration test가 모두 PASS한다. missing dependency, grant swap/replay, independent trust-anchor/approval tamper, DB/provider/Auth/Storage/notification unknown outcome, worker lease loss, direct-RLS bypass와 concurrent request가 거짓 2xx·중복 effect·권한 상승을 만들지 않는다. DB 명령은 disposable Supabase에서만 실행한다.

**Commit:** `feat: add durable account deletion workflow`

### R4. 모바일 삭제 client, race-safe session, destructive UX 구현

**Maps to:** master WP-9, WP-10

**Files:**

- Create: `apps/mobile/src/auth/account-deletion-client.ts`
- Create: `apps/mobile/src/auth/account-deletion-client.test.ts`
- Create: `apps/mobile/src/auth/account-deletion-receipt-store.ts`
- Create: `apps/mobile/src/auth/account-deletion-receipt-store.test.ts`
- Create: `apps/mobile/src/auth/account-deletion-reauth.ts`
- Create: `apps/mobile/src/auth/account-deletion-reauth.test.ts`
- Modify: `apps/mobile/src/api/mobile-api-transport.ts`
- Modify: `apps/mobile/src/api/mobile-api-transport.test.ts`
- Modify: `apps/mobile/src/auth/session-controller.ts`
- Modify: `apps/mobile/src/auth/session-controller.test.ts`
- Modify: `apps/mobile/src/auth/supabase-client.ts`
- Modify: `apps/mobile/src/auth/supabase-client.test.ts`
- Modify: `apps/mobile/src/auth/oauth-coordinator.ts`
- Modify: `apps/mobile/src/auth/oauth-coordinator.test.ts`
- Modify: `apps/mobile/src/runtime/mobile-runtime.tsx`
- Modify: `apps/mobile/app/profile.tsx`
- Modify: `apps/mobile/src/routes/profile-route.test.tsx`
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/app.json`
- Modify: `pnpm-lock.yaml`

- [ ] RED client test: idempotency/receipt-bound challenge를 만든 뒤 password/Google/Kakao recent-auth를 exchange해 one-time deletion grant를 받고, bearer+key+receipt+grant로 DELETE를 호출해 secret 없는 202 body를 strict parse한다. challenge/exchange/DELETE/status의 exact 400/401/403/404/409/410/429/503/network timeout을 typed result로 구분하고 `ACCOUNT_DELETION_PENDING` 410에서는 refresh하지 않는다.
- [ ] RED persistence test: CSPRNG 32-byte receipt secret과 idempotency key를 DELETE 전 SecureStore에 원자적으로 저장한다. timeout/응답 유실/앱 kill 뒤 receipt-only status로 request ID를 복구한다. generic 404는 request 부재의 증명이 아니므로 bounded poll 뒤에도 새 credential을 만들지 않고 같은 key/receipt와 새 recent-auth grant로 exact idempotent DELETE만 재시도한다. 202/status의 request ID만 같은 record에 추가한다.
- [ ] RED session test: 일반 sign-out storage error를 무시하지 않고 `AUTH_LOCAL_PURGE_FAILED`를 반환한다. 삭제가 durable accept된 뒤 purge가 실패하면 요청 자체를 실패/취소하거나 signed-in으로 되돌리지 않고 `deletion-pending`과 cleanup warning/retry를 유지한다.
- [ ] RED race test: delete accepted 뒤 `TOKEN_REFRESHED`, OAuth callback, app resume, stale initialize response가 와도 signed-in 상태가 부활하지 않는다.
- [ ] RED status test: global bearer를 쓰지 않고 `DeletionReceipt` scheme으로 polling하며 wrong/missing receipt의 generic 404, completed metadata-retention 뒤 valid receipt expiry 410, retryable/permanent/manual/legal-hold 상태와 restart 복구를 검사한다. incomplete request의 receipt는 만료되지 않고 request/receipt/grant/proof가 URL, body, log, analytics에 나타나지 않아야 한다.
- [ ] RED restart test: pending deletion record를 secure local state에서 복원하되 access/refresh token과 OAuth pending PKCE state는 제거한다.
- [ ] Expo-compatible `expo-secure-store` adapter에는 idempotency key, receipt secret, request ID, expiry만 저장하고 access token, email, provider token은 저장하지 않는다. COMPLETED 또는 서버가 확인한 expiry 뒤 즉시 제거한다.
- [ ] session controller에 monotonic operation generation과 `deletion-pending` state를 추가한다. stale auth callback은 generation mismatch 시 폐기한다.
- [ ] server가 request를 durable accept하기 전에는 local sign-out을 하지 않는다. accept 후 Supabase local session, OAuth pending key, auth-scoped caches를 purge하고 결과를 각각 검사하며, pending deletion record는 auth cache purge와 분리해 보존한다.
- [ ] recent reauth adapter는 server challenge 뒤 Supabase에 password를 재입력해 새 session을 받거나 Google/Kakao forced account-selection/OAuth를 완료한 뒤 proof exchange를 수행한다. TouchCatch API에 raw password를 보내지 않는다. deletion grant는 memory에만 두고 SecureStore/log/analytics에 남기지 않으며 UI에서만 최근 로그인을 추정하거나 오래된 bearer를 재사용하지 않는다.
- [ ] destructive UX는 2단계 confirmation, 서버가 검증하는 최근 재인증, 삭제/보존/처리기간/provider unlink 설명, 취소, processing, retryable/permanent/manual-review/legal-hold, request accepted/completed 상태를 제공한다.
- [ ] 확인 버튼은 정확한 계정 email 또는 고정 문구 입력을 요구하고 TalkBack label/live region/focus 순서를 테스트한다.
- [ ] 다른 기기 세션, offline, duplicate tap, 응답 유실, 앱 kill/restart, local purge 부분 실패, receipt expiry를 테스트한다. duplicate/response-loss 경로는 request row 하나와 동일 request ID를 증명한다.
- [ ] profile의 privacy/terms/account-deletion 링크는 `Linking.openURL` 또는 Expo Router link를 쓰고 일반 `Text`를 제거한다.

**Verify:**

```powershell
. tools/powershell/Invoke-NativeChecked.ps1
Invoke-NativeChecked corepack pnpm exec vitest run apps/mobile/src/auth/account-deletion-client.test.ts apps/mobile/src/auth/account-deletion-receipt-store.test.ts apps/mobile/src/auth/account-deletion-reauth.test.ts apps/mobile/src/auth/session-controller.test.ts apps/mobile/src/auth/supabase-client.test.ts apps/mobile/src/auth/oauth-coordinator.test.ts apps/mobile/src/routes/profile-route.test.tsx
Invoke-NativeChecked corepack pnpm mobile:typecheck
Invoke-NativeChecked corepack pnpm mobile:web:build
```

Expected: local sign-out-only expectation이 0개다. response loss에도 한 request만 존재하고, accepted 뒤 purge 실패와 delayed callback 재로그인 재현이 `deletion-pending`을 유지하며 receipt가 어떤 telemetry/URL에도 나타나지 않는다.

**Commit:** `feat: make mobile account deletion truthful and race-safe`

### R5. 공개 account portal, 개인정보처리방침, 약관, Data Safety SSOT

**Maps to:** master WP-9

**Files:**

- Create: `apps/account-portal/package.json`
- Create: `apps/account-portal/tsconfig.json`
- Create: `apps/account-portal/next.config.ts`
- Create: `apps/account-portal/app/layout.tsx`
- Create: `apps/account-portal/app/page.tsx`
- Create: `apps/account-portal/app/privacy/page.tsx`
- Create: `apps/account-portal/app/terms/page.tsx`
- Create: `apps/account-portal/app/account-deletion/page.tsx`
- Create: `apps/account-portal/app/account-deletion/callback/page.tsx`
- Create: `apps/account-portal/app/api/account-deletion/request/route.ts`
- Create: `apps/account-portal/app/api/account-deletion/status/route.ts`
- Create: `apps/account-portal/app/support/account-deletion/page.tsx`
- Create: `apps/account-portal/src/account-deletion-flow.ts`
- Create: `apps/account-portal/src/account-deletion-flow.test.ts`
- Create: `apps/account-portal/src/portal-receipt-cookie.ts`
- Create: `apps/account-portal/src/portal-receipt-cookie.test.ts`
- Create: `apps/account-portal/src/support-deletion-flow.ts`
- Create: `apps/account-portal/src/support-deletion-flow.test.ts`
- Create: `apps/account-portal/src/env.ts`
- Create: `apps/account-portal/src/env.test.ts`
- Create: `tools/legal/write-legal-projections.mjs`
- Create: `tools/legal/write-legal-projections.test.ts`
- Create: `tools/legal/check-final-sdk-data-inventory.mjs`
- Create: `tools/legal/check-final-sdk-data-inventory.test.ts`
- Create: `supabase/migrations/202608260002_support_deletion_handoff.sql`
- Create: `supabase/tests/database/support-deletion-handoff.test.sql`
- Create: `apps/server/src/privacy/support-deletion-service.ts`
- Create: `apps/server/src/privacy/support-deletion-service.test.ts`
- Create: `apps/server/src/privacy/support-deletion-rpc.ts`
- Create: `apps/server/src/privacy/support-deletion-rpc.test.ts`
- Create: `apps/server/src/auth/support-deletion-authorizer.ts`
- Create: `apps/server/src/auth/support-deletion-authorizer.test.ts`
- Create: `apps/server/src/http/support-deletion-handler.ts`
- Create: `apps/server/src/http/support-deletion-handler.test.ts`
- Modify: `docs/legal/privacy-policy.md`
- Modify: `docs/legal/terms-of-service.md`
- Modify: `docs/legal/google-play-data-safety.md`
- Create: `docs/operations/account-deletion-support.md`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] R2 inventory에서 Korean privacy, deletion disclosure, Data Safety worksheet를 생성한다. 손으로 세 복본을 따로 관리하지 않는다.
- [ ] privacy/terms/deletion rendered bytes는 account-portal image의 build-time immutable artifact로 만들고 clean build에서 projection hash를 검증한다. runtime CMS, production hot-edit 또는 mutable object를 법무 SSOT로 사용하지 않는다. 법무 byte 변경은 portal source/image가 바뀐 새 RC이며 R8 staging/S2B부터 다시 검증한다.
- [ ] privacy에는 developer/controller identity, 작동하는 contact, 모든 data type/purpose/processor, 국외 처리, security, retention, DELETE/REDACT/RETAIN, backup, rights, complaint, children/age decision, change notice와 effective date를 포함한다.
- [ ] terms에는 계정, 허용 사용, 학습 서비스 범위, beta/availability, IP, 이용 제한, 해지, 책임, 변경·통지, 준거법·분쟁, contact를 포함하고 법무 owner 승인을 연결한다.
- [ ] Data Safety worksheet는 Play taxonomy별 collected/shared/ephemeral/required/purpose를 기록하고 third-party SDK까지 포함한다. 실제 adapter가 없는 crash/analytics를 수집한다고 표시하지 않는다. adapter 활성화와 문서 갱신은 같은 release commit이어야 한다.
- [ ] public deletion page는 앱/개발자 identity, prominent 실제 request control, 요청 단계, 삭제 대상, REDACT/RETAIN 대상과 정확한 기간·근거, 처리 예상기간, status/지원 경로를 표시한다. 단순 설명/메일 주소만 있거나 앱 재설치를 요구하면 실패다.
- [ ] account portal은 로그인 없이 policy/deletion 설명을 보여주고, 삭제 요청은 Supabase existing-user OTP(`shouldCreateUser:false`) 또는 승인된 Google/Kakao forced reauth 뒤 server challenge와 R3 API를 호출한다. fresh-auth server 검증을 우회하거나 email만 입력해 제3자 계정을 삭제하는 endpoint를 만들지 않는다.
- [ ] portal BFF는 CSPRNG receipt/idempotency를 API 호출 전에 Secure+HttpOnly+SameSite=Strict의 authenticated-encrypted cookie에 seal하고 원문을 server DB/log에 저장하지 않는다. response loss/reload에서 receipt-only status로 request를 복구하고, key rotation overlap/expiry/logout/XSS/CSRF/cookie tamper를 테스트한다. 필요하면 사용자에게 일회성 recovery code를 명확히 표시하되 URL/HTML source/analytics에는 넣지 않는다.
- [ ] OTP/OAuth 시작 응답은 계정 존재 여부를 노출하지 않고 state/PKCE/redirect allow-list를 검증한다. deletion receipt는 browser URL, server-rendered HTML, analytics, access log에 남기지 않는다.
- [ ] email/provider 접근을 잃은 사용자는 public support deletion flow에서 요청을 시작할 수 있어야 한다. runbook은 rate limit, generic acknowledgement, 최소 수집, 본인확인 단계, 불충분한 확인 시 non-deletion, authorized support actor의 audited durable-request handoff, separation-of-duties approval, completion notice, ticket retention/deletion을 정의한다. support flow가 worker 함수를 직접 호출하거나 recent-auth를 무기록 bypass하지 않는다.
- [ ] support handoff DB/service는 최소권한 support intake role과 별도 privacy approver 두 명의 canonical signed approval을 요구하고, 승인 뒤 R3의 동일 durable request/tombstone service만 호출한다. raw identity evidence는 승인 disposition에 따라 암호화/만료하며 unauthorized/single-approval/duplicate/replay/race/identity mismatch/partial failure를 non-2xx와 audit로 검증한다.
- [ ] public origin은 HTTPS, 로그인 불필요 policy pages, 비PDF, non-geofenced, 사용자 편집 불가능한 published page 조건을 env validator가 강제한다.
- [ ] support mailbox 또는 web form은 실제 수신·identity-verification handoff·완료 통지 시험을 통과하고 evidence URI를 남긴다.
- [ ] incognito와 KR 외부 network에서 privacy/terms/account-deletion URL의 200, app/developer name, no-auth/no-edit/no-redirect 조건을 검사하는 도구를 만든다. 실제 deployed URL 실행은 R9 production evidence다.
- [ ] app profile의 세 링크와 Play Console URL이 동일한 deployed origin을 사용하도록 build-time contract test를 추가한다.
- [ ] `check-final-sdk-data-inventory`를 source/dependency mode로 실행해 app/web/server surface와 현재 SDK 전송을 R2 inventory와 비교한다. 이 단계 결과는 draft projection 검증이며 R6/R7 뒤 R9 final observed scan을 대체하지 않는다.

**Verify:**

```powershell
. tools/powershell/Invoke-NativeChecked.ps1
Invoke-NativeChecked corepack pnpm exec vitest run tools/legal/write-legal-projections.test.ts tools/legal/check-final-sdk-data-inventory.test.ts apps/account-portal/src apps/server/src/privacy/support-deletion-service.test.ts apps/server/src/privacy/support-deletion-rpc.test.ts apps/server/src/auth/support-deletion-authorizer.test.ts apps/server/src/http/support-deletion-handler.test.ts
Invoke-NativeChecked node tools/legal/check-final-sdk-data-inventory.mjs --source-scan --check
Invoke-NativeChecked node tools/legal/write-legal-projections.mjs --check
Invoke-NativeChecked corepack pnpm --dir apps/account-portal build
Invoke-NativeChecked corepack pnpm docs:check

try {
    $env:TOUCHCATCH_ALLOW_LOCAL_DB_RESET='1'
    Invoke-NativeChecked corepack pnpm check:db
} finally {
    Remove-Item Env:TOUCHCATCH_ALLOW_LOCAL_DB_RESET -ErrorAction SilentlyContinue
}
```

Expected: inventory/projection hash drift 0, production portal build PASS. 실제 public URL curl과 support 수신 증거 전에는 external gate가 계속 BLOCKED다.

**Commit:** `feat: publish account deletion and legal portal`

### R6. Android identity, permission, backup, signing을 fail-closed로 고정

**Maps to:** master WP-10

**Files:**

- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/app.config.js`
- Modify: `apps/mobile/src/auth/oauth-coordinator.ts`
- Modify: `apps/mobile/android/app/src/main/AndroidManifest.xml`
- Modify: `apps/mobile/android/app/src/debug/AndroidManifest.xml`
- Modify: `apps/mobile/android/app/src/main/res/values/strings.xml`
- Create: `apps/mobile/android/app/src/main/res/xml/backup_rules.xml`
- Create: `apps/mobile/android/app/src/main/res/xml/data_extraction_rules.xml`
- Modify: `apps/mobile/android/app/build.gradle`
- Modify: `apps/mobile/android/build.gradle`
- Modify: `apps/mobile/android/gradle.properties`
- Modify: `apps/mobile/android/gradle/wrapper/gradle-wrapper.properties`
- Create: `apps/mobile/android/gradle/verification-metadata.xml`
- Create: `apps/mobile/android/gradle.lockfile`
- Modify: `.gitignore`
- Modify: `apps/mobile/android/.gitignore`
- Create: `docs/approvals/android-upload-certificate.schema.json`
- Create after Release Engineering approval: `docs/approvals/android-upload-certificate.json`
- Create: `deploy/environment-manifest.schema.json`
- Create after environment-owner approval: `docs/approvals/environment-staging.json`
- Create after environment-owner approval: `docs/approvals/environment-production.json`
- Create: `docs/operations/android-signing-key-lifecycle.md`
- Create: `tools/mobile/fetch-bundletool.ps1`
- Create: `tools/mobile/bundletool-1.18.3.sha256`
- Create: `tools/mobile/check-android-toolchain.mjs`
- Create: `tools/mobile/check-android-toolchain.test.ts`
- Create: `tools/mobile/verify-release-environment.mjs`
- Create: `tools/mobile/verify-release-environment.test.ts`
- Create: `tools/mobile/check-release-identity.mjs`
- Create: `tools/mobile/check-release-identity.test.ts`
- Create: `tools/mobile/inspect-release-aab.mjs`
- Create: `tools/mobile/inspect-release-aab.test.ts`
- Create: `tools/mobile/write-mobile-sbom.mjs`
- Create: `tools/mobile/write-mobile-sbom.test.ts`
- Modify: `tools/check-mobile-production-boundary.mjs`
- Modify: `tests/contracts/mobile-production-boundary-scanner.test.ts`
- Modify: `tools/mobile/build-release-aab.ps1`
- Modify: `tests/contracts/mobile-oauth-config.test.ts`
- Modify: `apps/mobile/app/profile.tsx`
- Create: `apps/account-portal/app/.well-known/assetlinks.json/route.ts`

- [ ] RED identity test: resolved Expo config가 현재 `Spot Learn Battle/spot-learn-battle/spotlearn`을 반환하는 것을 실패로 고정한다.
- [ ] `app.config.js`가 identity를 override하지 않게 하고 canonical product tuple을 `TouchCatch/touchcatch/com.touchcatch.mobile/1.0.0`으로 통일한다. OAuth coordinator, manifest callback, app name도 `touchcatch`로 맞춘다. versionCode는 protected build input이며 Play remote maximum 이하 또는 재사용이면 실패한다.
- [ ] identity checker가 Expo public config, Gradle, manifest, strings, OAuth test, allocated release ID/versionCode를 비교하고 어떤 drift도 실패시킨다.
- [ ] version label은 profile source에 `1.0.0`을 hardcode하지 않고 resolved app metadata에서 읽으며 identity checker가 Gradle/Expo와 비교한다.
- [ ] release merged manifest에서 `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`를 제거한다. 허용 permission은 기능상 필요한 `INTERNET`, `VIBRATE`와 release owner가 승인한 항목뿐이다.
- [ ] `usesCleartextTraffic=false`를 적용한다. production endpoint는 HTTPS만 허용한다.
- [ ] `allowBackup=false`와 API별 backup/data-extraction rules를 추가해 database/sharedpref/files/root의 auth session 및 OAuth pending state가 cloud/D2D restore로 돌아오지 않게 한다.
- [ ] `EX_DEV_CLIENT_NETWORK_INSPECTOR`는 debug에만 적용하고 release merged configuration에서 비활성임을 검사한다.
- [ ] release OAuth callback은 build profile의 verified HTTPS App Link로 제한하고 `android:autoVerify=true`, environment별 exact host, exact `/auth/callback` path를 사용한다. bootstrap은 staging host, production RC는 production host를 사용하며 inspector가 교차 사용을 거부한다. custom scheme은 debug manifest로 이동한다. 각 portal route는 R8의 signed Play-certificate registry에서 복수 app-signing SHA-256 fingerprint를 생성하고 registry가 비어 있거나 signature가 틀리면 배포를 실패시킨다.
- [ ] Gradle release config에서 debug keystore fallback을 삭제한다. release task graph에 `KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` 중 하나라도 없거나 file/certificate가 유효하지 않으면 `GradleException`으로 실패한다. build preflight는 signed approval을 independent protected/KMS trust anchor로 검증하고 keystore DER fingerprint를 내부에서 도출·비교한다.
- [ ] `.gitignore`에 `*.jks`, `*.keystore`, `*.p12`, release key export를 추가한다. tracked `debug.keystore`는 debug 전용으로 유지한다.
- [ ] upload certificate approval은 DER SHA-256, subject/public-key algorithm/size, serial, notBefore/notAfter, owner, evidence URI, review/expiry, signer signature와 independent trust-anchor ID/digest를 포함한다. inspector는 approval에서 fingerprint를 내부 도출해 exact DER fingerprint, 모든 JAR entry signed, RSA 2048+/EC P-256+, Android 요구에 맞춘 2033-10-22 이후 유효기간을 assert한다. CLI/env fingerprint override와 `jarsigner` 출력의 수동 비교는 acceptance가 아니다.
- [ ] wrapper에 official Gradle distribution SHA-256을 고정하고 wrapper JAR checksum/validation, dependency verification strict mode와 `dependencyLocking { lockAllConfigurations() }`을 켠다. checked-in lock을 review하며 사용하지 않는 JitPack repository를 제거하고 `2026004.+` 같은 dynamic dependency를 exact version으로 고정한다.
- [ ] build runner는 승인된 JDK distribution/version과 Android SDK command-line tools, platform 36, build-tools, NDK(사용 시)를 exact inventory로 검사한다. 빈 격리 `GRADLE_USER_HOME`에서 lock/verification metadata만으로 dependency resolution과 build가 성공해야 한다.
- [ ] artifact tooling은 official Google bundletool 1.18.3만 내려받고 checked-in SHA-256과 일치할 때만 cache한다. versionless/latest download를 금지한다.
- [ ] build script는 signed `-EnvironmentApproval`, allocated versionCode/release ID, runtime/clean RC/signing을 preflight하고 manifest에서 exact HTTPS Supabase/API/portal/App-Link origin, publishable key와 active casual season ID를 읽는다. non-secret value를 ambient env로 override하지 못하며 staging도 release-mode 보안 검사를 적용하되 production origin이라고 거짓 표기하지 않는다. Metro가 실행 중이면 process를 종료하지 말고 중단 메시지를 낸다.
- [ ] build는 frozen install, root gates, clean isolated Gradle cache의 `--dependency-verification strict :app:dependencies :app:clean :app:bundleRelease --no-daemon`, final artifact inspection 순서다. 각 native command 직후 exit를 검사하는 공통 PowerShell wrapper를 쓰며 후속 `Pop-Location`/cmdlet이 실패를 0으로 덮지 못하게 한다.
- [ ] AAB inspector는 고정 경로 `.tools/bundletool/1.18.3/bundletool.jar`의 validate/dump를 사용해 SHA-256, JAR signature/approved upload certificate, applicationId/version, target SDK 36, merged permissions, cleartext/backup rules, declared environment의 exact API origin, loopback/example.invalid, private solution sentinel, Metro/dev menu, secrets, native/transitive dependency inventory를 검사한다. private field는 `correctOptionId`, `hintUnits`, `canonicalAnswer`, `privateSolutionHash`와 registry object 구조의 조합으로 탐지하며 일반 UI의 `title` 단어만으로 false positive를 만들지 않는다.
- [ ] CycloneDX JSON SBOM은 pnpm/JS, Gradle/AAR/JAR, native libraries를 포함하고 tool/version을 기록한다. pinned scanner의 vulnerability/license policy는 severity threshold를 강제하며 waiver/VEX에는 owner, 근거, expiry, artifact hash가 필요하다.
- [ ] inspector 출력은 secret 없는 JSON attestation이고 release evidence manifest에 AAB hash와 함께 연결한다.
- [ ] signing runbook은 upload key 2FA/backup/reset, Play app-signing key upgrade/rotation, legacy+new fingerprint 동시 운영, Google OAuth SHA-1, Asset Links SHA-256, Kakao provider key hash의 소비자별 갱신/rollback을 정의한다.

**Verify:**

```powershell
Remove-Item Env:KEYSTORE_PATH,Env:KEYSTORE_PASSWORD,Env:KEY_ALIAS,Env:KEY_PASSWORD -ErrorAction SilentlyContinue
. tools/powershell/Invoke-NativeChecked.ps1
Invoke-NativeExpectFailure -WorkingDirectory apps/mobile/android -FilePath .\gradlew.bat -Arguments @(':app:clean', ':app:bundleRelease', '--no-daemon') -ExpectedPattern 'Missing release signing inputs' -AssertPathAbsent 'app/build/outputs/bundle/release/app-release.aab'
```

Expected: clean isolated runner에서 정확한 missing release signing error로 non-zero이고 AAB가 생성되지 않는다. unrelated Gradle failure, debug signing 성공, 뒤 `Pop-Location`에 의한 exit 0은 모두 실패다.

승인된 secret runner에서:

```powershell
. tools/powershell/Invoke-NativeChecked.ps1
Invoke-NativeChecked corepack pnpm exec vitest run tools/mobile/check-android-toolchain.test.ts tools/mobile/verify-release-environment.test.ts tools/mobile/check-release-identity.test.ts tools/mobile/inspect-release-aab.test.ts tools/mobile/write-mobile-sbom.test.ts tests/contracts/mobile-production-boundary-scanner.test.ts tests/contracts/mobile-oauth-config.test.ts
Invoke-NativeChecked powershell -NoProfile -ExecutionPolicy Bypass -File tools/mobile/build-release-aab.ps1 -EnvironmentApproval docs/approvals/environment-staging.json -VersionCode $env:TOUCHCATCH_ALLOCATED_VERSION_CODE
Invoke-NativeChecked java -jar .tools/bundletool/1.18.3/bundletool.jar validate --bundle=apps/mobile/android/app/build/outputs/bundle/release/app-release.aab
Invoke-NativeChecked node tools/mobile/inspect-release-aab.mjs --aab apps/mobile/android/app/build/outputs/bundle/release/app-release.aab --upload-cert-approval docs/approvals/android-upload-certificate.json --environment-approval docs/approvals/environment-staging.json --check
Invoke-NativeChecked jarsigner -verify -verbose -certs apps/mobile/android/app/build/outputs/bundle/release/app-release.aab
```

Expected: AAB 정확히 1개, clean-cache strict dependency resolution과 bundletool/inspector/SBOM policy PASS, 모든 entry가 signed이고 DER fingerprint가 signed approval과 자동으로 일치한다. attestation hash와 `Get-FileHash`가 동일하다. `jarsigner`의 self-signed diagnostic은 별도 policy로 분류하되 inspector의 fingerprint/entry/validity assertion을 대체하지 않는다.

**Commit:** `build: fail closed and attest android release bundle`

### R7. 승격 가능한 API/DB/portal 산출물, 복구·관측성 운영 구현

**Maps to:** master WP-3, WP-4, WP-7, WP-8

**Files:**

- Create: `deploy/server/Dockerfile`
- Create: `deploy/server/.dockerignore`
- Create: `deploy/account-portal/Dockerfile`
- Create: `deploy/account-portal/.dockerignore`
- Create: `deploy/release-manifest.schema.json`
- Create: `docs/decisions/2026-08-26-production-hosting.md`
- Create: `docs/operations/production-environment.md`
- Create: `docs/operations/server-deploy-rollback.md`
- Create: `docs/operations/database-migration-rollback.md`
- Create: `docs/operations/database-restore-drill.md`
- Create: `docs/operations/account-deletion-incident.md`
- Create: `docs/operations/incident-response.md`
- Create: `tools/deploy/smoke-mobile-api.mjs`
- Create: `tools/deploy/smoke-mobile-api.test.ts`
- Create: `tools/deploy/assert-target-environment.mjs`
- Create: `tools/deploy/assert-target-environment.test.ts`
- Create: `tools/deploy/inspect-container.mjs`
- Create: `tools/deploy/inspect-container.test.ts`
- Create: `tools/deploy/write-container-sbom.mjs`
- Create: `tools/deploy/write-container-sbom.test.ts`
- Create: `tools/deploy/verify-environment-manifest.mjs`
- Create: `tools/deploy/verify-environment-manifest.test.ts`
- Create: `tools/deploy/inspect-running-workloads.mjs`
- Create: `tools/deploy/inspect-running-workloads.test.ts`
- Create: `tools/db/write-migration-manifest.mjs`
- Create: `tools/db/write-migration-manifest.test.ts`
- Create: `tools/db/apply-migration-manifest.mjs`
- Create: `tools/db/apply-migration-manifest.test.ts`
- Create: `tools/db/verify-production-roles.sql`
- Create: `tools/db/verify-casual-season-readiness.sql`
- Create: `tools/deploy/publish-casual-beta-content.mjs`
- Create: `tools/deploy/publish-casual-beta-content.test.ts`
- Create: `apps/server/src/observability/telemetry.ts`
- Create: `apps/server/src/observability/telemetry.test.ts`
- Modify: `apps/server/src/runtime.ts`
- Modify: `apps/server/src/runtime.test.ts`
- Modify: `apps/server/src/http/router.ts`
- Modify: `apps/server/src/http/router.test.ts`
- Modify: `apps/server/.env.example`
- Modify: `packages/config/src/env.ts`
- Modify: `packages/config/src/env.test.ts`
- Modify: `docs/operations/database-role-provisioning.md`

- [ ] Repository owner가 hosting provider/region, Supabase production project/region, secrets manager, custom HTTPS domain, deploy/rollback mechanism을 decision record로 승인한다. provider 결정 전 production deployment를 시작하지 않는다.
- [ ] 같은 decision에 beta RPO/RTO, backup horizon, alert acknowledgement target과 on-call owner를 숫자로 승인한다. 값이 없는 “best effort”는 external gate를 열지 못한다.
- [ ] API/privacy-worker 공용 server image와 account-portal image는 registry tag가 아니라 reviewed Node 24.18.0 base digest(`@sha256`)를 pin하고, frozen lockfile, non-root user, read-only filesystem compatibility, health/readiness probe를 갖고 source map/secret/dev dependency를 최소화한다. image에는 source commit/release ID label만 넣고 secret을 넣지 않는다.
- [ ] staging과 production은 별도 Supabase project, secrets, OAuth clients, domain, telemetry environment를 사용한다. production secret을 PR/fork runner에 제공하지 않는다.
- [ ] staging/production별 non-secret environment manifest는 project ref/host/region, API/portal/App-Link origin, season/content ID, OAuth client identity, CORS를 서명한다. 두 manifest의 digest는 서로 달라도 되지만 versioned schema의 explicit allowed-diff field만 달라야 하며 verifier가 structural diff를 수행한다. deploy/build는 각 환경의 exact approved manifest와 independent trust anchor를 입력으로 쓰며 같은 ambient env끼리 비교하지 않는다. AAB/server/worker/portal provenance의 material에 해당 환경의 exact manifest digest를 포함하고 승인 뒤 drift를 금지한다.
- [ ] `loadRuntimeConfiguration`과 `packages/config/src/env.ts`의 production env 모델을 하나로 합친다. production CORS origin은 HTTPS만 허용하고 loopback 자동 허용은 development mode에서만 가능하게 한다.
- [ ] target assertion은 protected input의 expected Supabase project ref, database host, region, API/portal host와 실제 연결 metadata를 비교한다. ambient `supabase --linked` state나 현재 CLI project를 신뢰하지 않는다. `psql` credential은 process argv의 URL이 아니라 ephemeral `PGSERVICE`/permission-restricted `PGPASSFILE`로 전달하고 항상 제거한다.
- [ ] migrations는 `supabase/roles.sql` 없이 signed migration-manifest의 exact ordered files/hash만 dry-run 후 적용한다. deploy login은 runtime login과 분리하고 최소 role만 가진다. partial apply, unknown remote migration, hash drift는 중단한다.
- [ ] production role runbook을 실제 코드에 맞춘다. API runtime login은 `economy_server`, content publisher는 `deployment_role`, casual season publisher는 `economy_deployment_role`, privacy worker는 R3 exact privacy role만 사용할 수 있어야 하며 교차 권한은 모두 거부한다.
- [ ] R7에서는 expand migration, API/worker/portal digest deploy, content publish, readiness, rollback/roll-forward, soak와 running-digest inspection을 수행하는 idempotent 도구와 failure test를 만든다. destructive/contract migration은 backward-compatible RC 관찰 뒤 별도 후속 RC에서만 실행한다. 실제 staging/production 실행은 R8/R9 protected workflow에서만 하며 이 package의 로컬 명령으로 배포 완료를 주장하지 않는다.
- [ ] signed approval에 있는 정확한 5개 ENGLISH pack만 `deployment_role` job으로 publish하고 `economy_deployment_role`로 5-pin casual season을 만드는 command를 구현한다. git manifest의 DRAFT/publishBlocked를 편의상 뒤집지 않으며 staging에서 승인된 exact content-manifest hash만 production으로 promote한다.
- [ ] `/ready`는 DB `select 1`만 보지 않고 active casual season, 5개 PUBLISHED/eligible pin, attempt policy와 required dependency를 검사한다. publish 전에는 503, valid season 후에만 200이어야 한다.
- [ ] backup/PITR runbook과 검사 도구는 격리된 restore target에서 RPO/RTO, auth mapping, content revision, deletion tombstone replay를 측정한다. staging rehearsal은 R8, production backup과 isolated restore drill은 R9에서 evidence를 만든다.
- [ ] API smoke는 `/healthz`, `/ready`, authenticated `/v1/me`, learning attempt start/tap/complete, deletion enqueue/status failure paths를 HTTPS에서 검사한다. raw token/PII를 로그에 쓰지 않는다.
- [ ] structured telemetry는 request ID, route template, status class, latency, DB pool, deletion queue age/failure를 수집한다. Authorization, receipt, email, auth UUID, subject key, tap coordinate 원문은 redaction test로 금지한다.
- [ ] closed beta에서 crash provider를 활성화하면 mobile/server adapter, sampling, retention, deletion, R2 inventory/Data Safety 갱신을 같은 RC에 포함한다. PostHog는 별도 승인 전 비활성으로 유지한다.
- [ ] alert는 5xx rate, p95 latency, readiness failure, DB saturation, deletion queue age/max retry, Auth/provider deletion failure, backup failure를 포함하고 on-call route를 시험한다.
- [ ] hosting edge/API gateway의 IP rate limit과 DB-backed subject/idempotency limit을 함께 적용하고 `Retry-After`를 검증한다. process-local limiter만으로 multi-instance abuse gate를 닫지 않는다.
- [ ] rollback은 server/worker previous image digest, portal artifact digest, mobile rollout halt, DB forward-fix/restore decision, deletion job fence/tombstone 중복 방지를 다룬다. server와 portal image는 CI에서 각각 한 번 build/push하고 staging과 production이 동일 registry digest를 사용한다. 환경 차이는 signed runtime config manifest로만 주입한다.
- [ ] OCI SBOM은 CycloneDX/SPDX 중 승인된 한 형식으로 OS+Node production dependency를 포함한다. pinned vulnerability/license scanner, severity gate, signed waiver/VEX owner·expiry를 구현하고 R8 provenance에 연결한다.

**Verify:**

```powershell
. tools/powershell/Invoke-NativeChecked.ps1
Invoke-NativeChecked docker build --no-cache -f deploy/server/Dockerfile -t touchcatch-server:rc .
Invoke-NativeChecked docker build --no-cache -f deploy/account-portal/Dockerfile -t touchcatch-account-portal:rc .
Invoke-NativeChecked node tools/deploy/inspect-container.mjs --image touchcatch-server:rc --expected-node 24.18.0 --require-nonroot --require-pinned-base --check
Invoke-NativeChecked node tools/deploy/inspect-container.mjs --image touchcatch-account-portal:rc --expected-node 24.18.0 --require-nonroot --require-pinned-base --check
Invoke-NativeChecked docker run --rm --read-only --tmpfs /tmp touchcatch-server:rc node --version
Invoke-NativeChecked corepack pnpm exec vitest run tools/deploy/assert-target-environment.test.ts tools/deploy/inspect-container.test.ts tools/deploy/write-container-sbom.test.ts tools/deploy/verify-environment-manifest.test.ts tools/deploy/inspect-running-workloads.test.ts tools/db/write-migration-manifest.test.ts tools/db/apply-migration-manifest.test.ts tools/deploy/smoke-mobile-api.test.ts tools/deploy/publish-casual-beta-content.test.ts apps/server/src/observability/telemetry.test.ts apps/server/src/runtime.test.ts packages/config/src/env.test.ts
```

Expected: pinned-base image runtime v24.18.0, non-root/read-only/health assertions와 도구 failure tests가 PASS한다. 이 단계는 deployable artifacts만 만들며 protected staging deploy/restore artifact URI가 없으면 S2B는 계속 BLOCKED다.

**Commit:** `ops: add production deploy restore and telemetry gates`

### R8. CI release workflow와 immutable evidence 자동화

**Maps to:** master WP-1, WP-10, WP-11

**Files:**

- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/android-release.yml`
- Create: `.github/workflows/play-bootstrap.yml`
- Create: `.github/workflows/submit-play-closed-review.yml`
- Create: `.github/workflows/activate-play-closed-access.yml`
- Create: `.github/workflows/deploy-staging.yml`
- Create: `.github/workflows/deploy-production.yml`
- Create: `.github/workflows/deploy-account-portal.yml`
- Create: `tools/release/check-release-candidate.mjs`
- Create: `tools/release/check-release-candidate.test.ts`
- Create: `tools/release/write-release-attestation.mjs`
- Create: `tools/release/write-release-attestation.test.ts`
- Create: `tools/release/verify-build-provenance.mjs`
- Create: `tools/release/verify-build-provenance.test.ts`
- Create: `tools/release/verify-required-checks.mjs`
- Create: `tools/release/verify-required-checks.test.ts`
- Create: `tools/release/verify-repository-rules.mjs`
- Create: `tools/release/verify-repository-rules.test.ts`
- Create: `tools/release/run-local-release-gates.ps1`
- Create: `tools/release/test-run-local-release-gates.ps1`
- Create: `config/required-release-checks.v1.json`
- Create: `tools/play/allocate-version-code.mjs`
- Create: `tools/play/allocate-version-code.test.ts`
- Create: `tools/play/version-code-ledger.schema.json`
- Create: `tools/play/upload-release.mjs`
- Create: `tools/play/upload-release.test.ts`
- Create: `tools/play/play-bundle-upload-receipt.schema.json`
- Create: `tools/play/verify-upload-receipt.mjs`
- Create: `tools/play/verify-upload-receipt.test.ts`
- Create: `tools/play/submit-closed-review.mjs`
- Create: `tools/play/submit-closed-review.test.ts`
- Create: `tools/play/activate-closed-access.mjs`
- Create: `tools/play/activate-closed-access.test.ts`
- Create: `tools/play/capture-signing-certificates.mjs`
- Create: `tools/play/capture-signing-certificates.test.ts`
- Create: `tools/play/verify-installed-release.ps1`
- Create: `tools/play/verify-installed-release.Tests.ps1`
- Create: `tools/deploy/verify-account-portal.mjs`
- Create: `tools/deploy/verify-account-portal.test.ts`
- Create: `docs/approvals/android-play-signing-certificates.schema.json`
- Create after Play bootstrap owner signature: `docs/approvals/android-play-signing-certificates.json`
- Create: `docs/approvals/play-app-signing-bootstrap.schema.json`
- Create after Play Console Admin approval: `docs/approvals/play-app-signing-bootstrap.json`
- Create: `docs/operations/play-signing-bootstrap-and-rotation.md`
- Modify: `package.json`
- Modify: `docs/operations/repository-rules.md`

- [ ] release preflight는 clean tree, exact runtime/toolchains, lockfiles, product identity, artifact role/environment, blocker status와 exact runtime source SHA를 검사한다. `bootstrap-staging`은 nonproduction/synthetic restriction을, `production-rc`는 R9 production deploy/OAuth/portal evidence를 요구한다. `closed-review-submit`은 mobile+portal+support E2E 뒤의 final inventory/rendered legal `RELEASE_APPROVED` hash, separate evidence commit, runtime-diff 0과 exact prior internal Play receipt를 요구하고, `closed-access-activate`는 그 submission receipt, Console `ACCEPTED`/unresolved 0, 최종 signer set을 추가로 요구한다.
- [ ] version allocator는 package-global workflow concurrency와 protected external CAS ledger를 사용한다. signed initial Play remote baseline을 확인하고 모든 track/artifact의 max를 조회한 뒤 큰 값을 release ID에 예약하며 upload 직전 재조회한다. abandoned/failed/reserved code도 재사용하지 않고 충돌 시 새 release ID/code를 배정한다. evidence path는 `<release-id>`로 parameterize한다.
- [ ] 모든 third-party GitHub Action은 mutable major tag가 아니라 reviewed full commit SHA로 pin하고 Dependabot/Renovate update도 별도 review를 거치게 한다.
- [ ] workflow마다 최소 `permissions`, `persist-credentials:false`, protected environment/ref restriction, concurrency, timeout과 `if: always()` secret cleanup을 설정한다. fork/PR cache·artifact·script를 privileged environment에서 실행하지 않는다.
- [ ] privileged release/deploy job은 event payload나 `workflow_run` artifact를 신뢰하지 않고 protected main/tag의 exact SHA를 새 checkout한다. Check Runs parser는 이름뿐 아니라 GitHub App ID/slug, workflow path와 blob SHA, event, repository, protected ref/head SHA를 allow-list하고 모두 `completed/success`인지 검사한다. ruleset은 expected source app, strict/update requirement, bypass actor 0을 확인하며 failed/cancelled/skipped/missing/spoofed-name check를 거부한다.
- [ ] Android workflow는 protected environment의 upload keystore secrets를 ephemeral file로 복원하고 종료 시 제거한다. secret value/path/password를 log/artifact에 넣지 않는다.
- [ ] workflow는 R6 script로 AAB를 만들고 AAB/hash/certificate/SBOM/inspector 결과를 업로드한다. server/worker 공용 image와 portal image는 각각 한 번 build/push한 registry digest만 staging→production으로 promote한다. GitHub OIDC 기반 artifact attestation 또는 Sigstore/cosign으로 AAB, 두 image digest, SBOM, environment/migration/content manifest의 subject digest와 source SHA를 서명하고 verifier가 issuer/identity/subject를 검사한다.
- [ ] SBOM/provenance만 존재하면 PASS하지 않는다. pinned scanner의 JS/Gradle/native/OCI coverage, vulnerability/license threshold, waiver/VEX owner·expiry를 preflight가 검사한다.
- [ ] Play control-plane bootstrap을 artifact upload와 분리한다. Play Console Admin이 canonical package ownership, Google-generated/existing/shared app-signing-key strategy, Play terms, upload certificate와 2FA owners를 먼저 승인하고 App Signing을 구성한다. signed bootstrap artifact 없이는 AAB upload를 시작하지 않는다.
- [ ] S2A에서 protected manual approval 후 별도 staging release ID/versionCode `n`을 배정하고 nonproduction API/DB를 가리키는 AAB를 internal에 업로드한다. `edits.bundles.upload` 원본 `{versionCode,sha1,sha256}`을 local attested AAB digest와 commit 전에 exact 비교하고 signed receipt로 저장한다. edit commit 후 track/version/status를 다시 조회하며 이 AAB는 closed로 승격하지 않는다.
- [ ] Play Console에서 얻은 current/legacy app-signing certificate와 SDK별 signer lineage를 signed registry에 저장한다. Asset Links는 복수 SHA-256, Google Android OAuth는 package+app-signing SHA-1, Kakao는 provider key hash를 사용한다. verifier는 protected/KMS independent trust anchor, owner, capturedAt, review/rotation을 검사하고 CLI/env fingerprint override를 거부한다.
- [ ] bootstrap cert registry를 사용해 staging/public portal의 `assetlinks.json`을 배포하고 HTTPS 200, no redirect, `application/json`, cache 정책, exact package/relation/fingerprints를 외부 network에서 검사한다. Google/Kakao staging OAuth 등록 후 Play-installed bootstrap binary로 App Link를 확인한다.
- [ ] protected staging workflow는 signed environment manifest와 target project를 확인한 뒤 `backup/checkpoint -> backward-compatible expand migration dry-run/apply -> exact server+worker+portal digest deploy -> running digest/health/smoke -> content publish -> readiness -> rollback/roll-forward -> soak -> isolated restore/tombstone replay`를 실제 실행한다. before/after/running workload digest, environment/migration/content/portal hash와 timestamp를 한 staging manifest에 기록한다.
- [ ] S2B 승인 뒤 code/config/dependency/migration/portal source가 바뀌면 staging approval을 자동 무효화한다. production AAB/server/worker/portal source SHA는 마지막 S2B manifest와 같아야 하며 runtime-affecting 차이는 새 bootstrap versionCode와 영향받은 staging QA부터 다시 수행한다. evidence-only 문서 변경은 signed change-control로 별도 분류한다.
- [ ] main branch protection/ruleset에 exact required check names, approval 수, force-push/delete 금지, conversation resolution을 설정한다. GitHub API JSON을 출력만 하지 말고 parser가 expected rules/enforcement를 compare/throw하고 snapshot hash를 release evidence에 저장한다.
- [ ] checked-in `run-local-release-gates.ps1`는 `Set-StrictMode`, `$ErrorActionPreference='Stop'`, top-level try/catch/finally, 명시적 non-zero exit와 secret/env cleanup을 사용한다. `pnpm check` 3회는 각각 새 ephemeral clean checkout/worktree에서 실행하고 각 실행 전후 dirty/generated drift를 0으로 검사한다.

**Verify:**

```powershell
. tools/powershell/Invoke-NativeChecked.ps1
Invoke-NativeChecked corepack pnpm exec vitest run tools/release/check-release-candidate.test.ts tools/release/write-release-attestation.test.ts tools/release/verify-build-provenance.test.ts tools/release/verify-required-checks.test.ts tools/release/verify-repository-rules.test.ts tools/play/allocate-version-code.test.ts tools/play/upload-release.test.ts tools/play/verify-upload-receipt.test.ts tools/play/submit-closed-review.test.ts tools/play/activate-closed-access.test.ts tools/play/capture-signing-certificates.test.ts tools/deploy/verify-account-portal.test.ts tests/contracts/workflow-coverage.test.ts
Invoke-NativeChecked powershell -NoProfile -ExecutionPolicy Bypass -File tools/release/test-run-local-release-gates.ps1
Invoke-NativeChecked node tools/release/check-release-candidate.mjs --track internal --artifact-role bootstrap-staging --release-id $env:TOUCHCATCH_BOOTSTRAP_RELEASE_ID
Invoke-NativeChecked powershell -NoProfile -ExecutionPolicy Bypass -File tools/release/run-local-release-gates.ps1 -FreshRuns 3
Invoke-NativeChecked node tools/release/verify-repository-rules.mjs --repo alarmpet/touchcatch --check
Invoke-NativeChecked node tools/release/verify-build-provenance.mjs --manifest docs/release-evidence/$env:TOUCHCATCH_BOOTSTRAP_RELEASE_ID/manifest.json --check
```

Expected: tests/check 3회, parsed branch/ruleset, OIDC provenance가 PASS한다. S2A evidence에는 bootstrap Play upload receipt, app-signing registry와 install/App-Link 결과만 있다. 별도의 R8 staging deployment manifest에는 deploy/smoke/restore 증거가 있고 이는 S2B 진입 조건이지 S2A 성공의 의미를 넓히지 않는다. Play credentials/approval/external evidence가 없는 로컬 환경에서는 bootstrap upload, `closed-review-submit`, `closed-access-activate`가 의도적으로 실패한다.

**Commit:** `ci: attest and gate android release artifacts`

### R9. Staging QA, production RC internal 검증, 동일 Play bundle closed review/activation

**Maps to:** master WP-9, WP-10, WP-11

**Files:**

- Create: `docs/release-evidence/<bootstrap-release-id>/staging-full-privacy-qa.md`
- Create: `docs/release-evidence/<production-release-id>/production-deploy-report.md`
- Create: `docs/release-evidence/<production-release-id>/internal-track-report.md`
- Create: `docs/release-evidence/<production-release-id>/account-deletion-dry-run.md`
- Create: `docs/release-evidence/<production-release-id>/production-mobile-e2e.json`
- Create: `docs/release-evidence/<production-release-id>/production-portal-e2e.json`
- Create: `docs/release-evidence/<production-release-id>/production-support-e2e.json`
- Create: `docs/release-evidence/<production-release-id>/physical-device-matrix.md`
- Create: `docs/release-evidence/<production-release-id>/play-console-submission.md`
- Create: `docs/release-evidence/<production-release-id>/play-console-evidence.json`
- Create: `docs/release-evidence/play-console-evidence.schema.json`
- Create: `docs/release-evidence/<production-release-id>/play-closed-review-submission-receipt.json`
- Create: `docs/release-evidence/<production-release-id>/play-closed-access-activation-receipt.json`
- Create: `docs/release-evidence/<production-release-id>/go-no-go.md`
- Create: `docs/release-evidence/<production-release-id>/pre-e2e-data-processing-inventory.json`
- Create: `docs/release-evidence/<production-release-id>/final-data-processing-inventory.json`
- Create: `docs/approvals/production-e2e-release.schema.json`
- Create after scoped human approval: `docs/approvals/production-e2e-<production-release-id>.json`
- Create after final human approval: `docs/approvals/legal-artifacts-<production-release-id>.json`
- Create: `docs/approvals/legal-artifacts-release.schema.json`
- Create: `tools/release/verify-production-e2e-approval.mjs`
- Create: `tools/release/verify-production-e2e-approval.test.ts`
- Create: `tools/release/run-production-mobile-e2e.ps1`
- Create: `tools/release/run-production-mobile-e2e.Tests.ps1`
- Create: `tools/legal/verify-release-legal-approval.mjs`
- Create: `tools/legal/verify-release-legal-approval.test.ts`
- Create: `tools/play/validate-console-evidence.mjs`
- Create: `tools/play/validate-console-evidence.test.ts`
- Create: `tools/release/verify-go-no-go-signatures.mjs`
- Create: `tools/release/verify-go-no-go-signatures.test.ts`
- Create: `apps/account-portal/playwright.config.ts`
- Create: `apps/account-portal/e2e/account-deletion.spec.ts`

#### S2B — production-like staging full privacy/deletion QA

- [ ] R8 bootstrap AAB hash/certificate/commit, Play upload receipt와 staging server/image/migration/content/portal manifest가 일치하는지 확인한다. bootstrap AAB는 staging endpoint만 사용하고 production release로 promote하지 않는다.
- [ ] Play에서 설치한 실제 Android 기기 2종 이상에서 cold install, staging Google/Kakao/password auth, token refresh, learning session, background/resume, upgrade를 시험한다.
- [ ] 합성·폐기 계정에 profile, attempt/tap, pet/economy fixture, provider identity를 만든 뒤 삭제한다. Auth/DB/provider/local storage/다른 기기/재설치에서 부활하지 않아야 한다.
- [ ] 네트워크 중단, provider 5xx, worker crash/lease expiry/restart, duplicate DELETE/response loss, stale JWT, approval expiry/tamper를 fault-inject하고 2xx 오표시·중복 삭제·권한 우회가 없는지 확인한다.
- [ ] staging isolated DB restore와 Android cloud/D2D restore, 앱 재설치 후 deleted data/session/OAuth pending state가 돌아오지 않는지 확인한다.
- [ ] TalkBack, destructive confirmation, legal links, status notification을 영상/스크린샷으로 남긴다. 영상에는 email/token을 redact한다.
- [ ] production-like staging portal에서 password, Google, Kakao 계정 각각 `request -> durable 202 -> receipt status -> completion` browser E2E를 수행한다. account access 상실/support fallback도 request, identity verification, handoff, completion notice까지 검증한다.
- [ ] staging API/portal/worker의 telemetry redaction, deletion backlog/provider failure alert delivery, on-call acknowledgement, rollback/roll-forward와 restore RPO/RTO가 승인 기준을 만족해야 S2B를 통과한다.

#### Production environment promotion — 외부 사용자 유입 전

- [ ] R8 protected production workflow는 S2B 승인 manifest를 요구하고 staging에서 검증한 **동일 server/worker image digest, portal image digest, migration-manifest hash, content-manifest hash**를 production으로 promote한다. production에서 image/portal을 rebuild하거나 migration/content를 편집하지 않는다. staging/production environment manifest는 각자 서명된 별도 hash이며 schema verifier가 explicit allowed-diff만 허용하고, exact production manifest hash를 production deploy와 AAB provenance에 결합한 뒤 drift를 금지한다.
- [ ] signed production project/ref/host를 assert한 뒤 `backup/checkpoint -> backward-compatible expand migration dry-run/apply -> exact server+worker+portal digest deploy -> actual running digest/health/smoke -> exact 5-pack publish -> 5-pin season/readiness -> rollback drill -> soak` 순서를 수행한다. contract migration은 후속 RC로 미룬다. receipt에 각 단계의 before/after/running digest, actor, approval, timestamp를 기록한다.
- [ ] production API/DB/worker/portal을 외부 tester 초대 전 배포하되 privacy worker claim은 유효한 `PRODUCTION_E2E_APPROVED` 전 0건이어야 한다. E2E 승인 중에는 exact synthetic-subject allowlist만 enqueue/claim할 수 있고 일반 subject 요청은 side effect 없는 503 `DELETION_RELEASE_NOT_APPROVED`로 거부한다. final `RELEASE_APPROVED` 뒤에만 일반 claim을 연다. production Google OAuth(package+Play app-signing SHA-1), Kakao key hash, redirect allow-list, consent branding을 확인하고 `assetlinks.json`은 signed registry의 current/legacy app-signing SHA-256 lineage를 제공해야 한다.
- [ ] production backup/PITR을 활성화하고 isolated restore target에서 RPO/RTO, exact content, account-deletion tombstone replay를 검증한다. 5xx/readiness/deletion backlog/provider/backup alert, on-call, previous-image rollback을 실제로 시험한다.

#### S2C — 새 production RC를 internal에서 검증

- [ ] Play remote maximum보다 큰 새 versionCode `m`과 `<production-release-id>`를 예약한다. production endpoint/config를 가진 AAB를 protected workflow에서 **한 번만** build하고 AAB/SBOM/provenance/inspector hash를 manifest에 고정한다.
- [ ] production RC를 internal track에 업로드한다. `edits.bundles.upload`의 versionCode/SHA-1/SHA-256을 local attested AAB와 commit 전에 exact 비교하고, commit 뒤 track/version/status를 새 API read로 확인해 signed raw receipt를 manifest에 연결한다. 결함으로 rebuild하면 새 versionCode/release ID로 S2C를 다시 시작한다.
- [ ] device의 기존 앱을 제거하고 exact internal opt-in link에서 Play로 설치한다. `dumpsys package`/PackageManager로 package, versionName, `longVersionCode=m`, installing+initiating source를 검사하고 base와 모든 split APK를 pull해 `apksigner verify --print-certs`로 signed registry의 SDK별 current/legacy certificate lineage를 확인한다. `pm verify-app-links --re-verify`/`pm get-app-links`는 production host를 verified로 반환해야 한다. Play Integrity를 활성화하면 `PLAY_RECOGNIZED`, `LICENSED`, package/version/cert verdict를 R2 inventory/Data Safety와 함께 검증한다.
- [ ] final AAB dependency/manifest/endpoint scan, deployed portal/server dependency·network flow와 support/deletion DB schema를 `check-final-sdk-data-inventory` 입력으로 수집한다. 이 post-build scan은 verify-only다. observed/design diff가 하나라도 있으면 RC를 폐기하고 변경을 commit한 뒤 새 versionCode/release ID로 production deploy 필요성부터 판정해 S2C 전체를 다시 시작하며, 만들어진 AAB/approval을 수정해 재사용하지 않는다.
- [ ] diff 0인 pre-E2E observed inventory에서 이미 staging→production으로 승격된 immutable portal image의 legal projections와 deployed rendered bytes를 **verify-only**로 검사한다. bytes/source/image가 다르면 production을 hot-edit하지 않고 RC를 폐기해 변경을 commit한 뒤 R8 staging/S2B부터 새 portal image와 새 versionCode로 반복한다.
- [ ] Privacy/Legal+DB/Ops가 최대 4시간 유효한 `PRODUCTION_E2E_APPROVED`에 exact release/artifact/environment/disposition/pre-scan hash, 목적, synthetic auth UUID/provider subject allowlist, subject당 request 1개, 승인자·서명·expiry를 묶는다. API와 worker는 enqueue 시 approval hash를 원자적으로 기록하고 유효한 allowlist 밖 요청/claim을 거부한다. 만료 시 새 enqueue/claim을 중단하고 remaining tombstone을 수동 점검한 뒤 같은 범위의 재승인 없이는 계속하지 않는다.
- [ ] E2E approval activation 뒤 실제 Android 기기 2종 이상에서 production password/Google/Kakao auth, learning, resume/upgrade와 allowlisted 합성 계정 삭제 request-to-completion을 수행한다. Auth/DB/object storage/provider/local/other-device/restore 결과와 mobile network/telemetry evidence를 release ID에 연결한다.
- [ ] public production portal E2E는 production-only project/origin/TLS/DNS assertion을 먼저 통과하고 request interception/mock/fixture backend를 금지한다. allowlisted password, Google, Kakao와 support fallback 합성 계정 각각 `request -> durable 202 -> receipt status -> completion`을 수행해 실제 production DB audit request ID, support approval과 network/telemetry/disposition evidence를 연결한다. public privacy/terms/deletion URL은 incognito/외부 network에서 HTTPS 200, public, non-geofenced, non-editable이고 pre-scan rendered-byte hash와 같아야 한다.
- [ ] mobile+portal+support가 모두 완료된 뒤 AAB/portal/server dependencies, 실제 network flow, telemetry, support audit와 DB disposition을 한 번에 재스캔한다. pre-E2E/design diff 0, 새 category/processor/runtime disposition 0, legal byte drift 0일 때만 Privacy/Legal owner가 최종 `RELEASE_APPROVED`를 발급한다. approval은 production AAB hash, server/worker image digest와 source SHA, migration hash, portal deployment digest/source SHA, scanner-input·pre/post inventory hash, 모든 mobile/portal/support E2E evidence hash, disposition/privacy/terms/deletion/Data Safety hash, rendered HTML bytes, effective date, controller/contact, deployed URL/hash와 independent KMS trust-anchor ID/digest를 묶는다. 이 approval 뒤 일반 deletion enqueue/worker claim을 열며 diff가 있으면 RC를 폐기한다.

#### Closed beta — 외부 사용자 전 필수

- [ ] Data Safety, account deletion URL, privacy URL, target audience 및 정책상 도출된 Families branch, app access, permissions, content rating, ads declaration을 Play Console에 제출하고 export/screenshot을 기록한다.
- [ ] S2C의 exact Play versionCode/bundle reference를 재업로드·재빌드하지 않고 closed edit/release에 넣어 review를 요청한다. submission receipt는 source internal upload의 AAB SHA-256, versionCode, edit/track ID와 closed read-back을 포함한다. managed publishing을 유지하고 tester group/rollout은 비활성으로 둔다.
- [ ] Console submission만으로 PASS하지 않는다. structured evidence schema는 package/versionCode, form revision, submittedAt/reviewedAt, Data Safety/data deletion/closed release accepted status, unresolved issue count 0, listing-rendered URL/text hash, source internal과 target closed artifact/versionCode를 필수로 한다. API로 확인할 수 없는 필드는 Console Admin의 scoped cryptographic attestation이 필요하며 parser가 screenshot/markdown 존재만으로 통과시키지 않는다.
- [ ] blockers를 PASS/BLOCKED/NOT_IN_SCOPE로 판정한다. NOT_IN_SCOPE는 binary, contract, UI, store copy에서 실제 제거된 기능만 허용한다.
- [ ] Product, Privacy/Legal, DB/Ops, OAuth/Provider, Support, Mobile QA, Release Engineering, Play Console owner가 자기 운영 증거와 post-all-E2E `RELEASE_APPROVED` hash를 attest하고 같은 release manifest hash에 서명한다. independent protected/KMS trust anchor가 signer registry와 각 scope/signature/expiry를 검증한 뒤에만 closed access를 활성화한다.
- [ ] review `ACCEPTED`, unresolved issue 0, post-all-E2E `RELEASE_APPROVED`, final signatures와 closed read-back이 모두 PASS한 뒤 별도 protected activation job이 tester group과 closed rollout을 활성화한다. review submission과 access activation은 서로 다른 approval/evidence receipt를 가진다.

**Verify:**

```powershell
. tools/powershell/Invoke-NativeChecked.ps1
Invoke-NativeChecked node tools/legal/check-final-sdk-data-inventory.mjs --aab $env:TOUCHCATCH_PRODUCTION_AAB_PATH --portal-origin $env:TOUCHCATCH_PRODUCTION_PORTAL_ORIGIN --api-origin $env:TOUCHCATCH_PRODUCTION_API_ORIGIN --output docs/release-evidence/$env:TOUCHCATCH_PRODUCTION_RELEASE_ID/pre-e2e-data-processing-inventory.json --check
Invoke-NativeChecked node tools/legal/write-legal-projections.mjs --check
Invoke-NativeChecked corepack pnpm exec vitest run tools/release/verify-production-e2e-approval.test.ts tools/legal/verify-release-legal-approval.test.ts tools/play/validate-console-evidence.test.ts tools/release/verify-go-no-go-signatures.test.ts
Invoke-NativeChecked node tools/release/verify-production-e2e-approval.mjs --release-id $env:TOUCHCATCH_PRODUCTION_RELEASE_ID --check
Invoke-NativeChecked powershell -NoProfile -ExecutionPolicy Bypass -File tools/play/verify-installed-release.ps1 -ReleaseId $env:TOUCHCATCH_PRODUCTION_RELEASE_ID -PlayCertificateRegistry docs/approvals/android-play-signing-certificates.json
Invoke-NativeChecked powershell -NoProfile -ExecutionPolicy Bypass -File tools/release/run-production-mobile-e2e.ps1 -ReleaseId $env:TOUCHCATCH_PRODUCTION_RELEASE_ID
Invoke-NativeChecked corepack pnpm --dir apps/account-portal exec playwright test
Invoke-NativeChecked node tools/legal/check-final-sdk-data-inventory.mjs --aab $env:TOUCHCATCH_PRODUCTION_AAB_PATH --portal-origin $env:TOUCHCATCH_PRODUCTION_PORTAL_ORIGIN --api-origin $env:TOUCHCATCH_PRODUCTION_API_ORIGIN --e2e-evidence-dir docs/release-evidence/$env:TOUCHCATCH_PRODUCTION_RELEASE_ID --output docs/release-evidence/$env:TOUCHCATCH_PRODUCTION_RELEASE_ID/final-data-processing-inventory.json --check
Invoke-NativeChecked node tools/legal/write-legal-projections.mjs --check
Invoke-NativeChecked node tools/legal/verify-release-legal-approval.mjs --release-id $env:TOUCHCATCH_PRODUCTION_RELEASE_ID --require-post-e2e --check
Invoke-NativeChecked node tools/release/check-release-candidate.mjs --track closed-review-submit --release-id $env:TOUCHCATCH_PRODUCTION_RELEASE_ID
Invoke-NativeChecked node tools/play/submit-closed-review.mjs --release-id $env:TOUCHCATCH_PRODUCTION_RELEASE_ID --dry-run --check
```

Console review가 끝난 뒤 별도 protected activation job에서만 실행한다.

```powershell
. tools/powershell/Invoke-NativeChecked.ps1
Invoke-NativeChecked node tools/play/validate-console-evidence.mjs --release-id $env:TOUCHCATCH_PRODUCTION_RELEASE_ID --require-accepted --check
Invoke-NativeChecked node tools/release/verify-go-no-go-signatures.mjs --release-id $env:TOUCHCATCH_PRODUCTION_RELEASE_ID --require-post-e2e-approval --check
Invoke-NativeChecked node tools/release/check-release-candidate.mjs --track closed-access-activate --release-id $env:TOUCHCATCH_PRODUCTION_RELEASE_ID
Invoke-NativeChecked node tools/play/activate-closed-access.mjs --release-id $env:TOUCHCATCH_PRODUCTION_RELEASE_ID --dry-run --check
```

Expected: pre-scan 뒤 exact allowlist용 E2E approval만 열리고, mobile/password/Google/Kakao와 portal/support E2E 뒤 통합 observed/design inventory diff 0, legal projection drift 0인 final `RELEASE_APPROVED`가 생성된다. protected workflow가 그 hash로 closed review를 제출하고, accepted 상태와 cryptographic 사람 서명 뒤 별도 job으로 access를 활성화한다.

**Final acceptance:**

```text
P0 BLOCKED = 0
runtime source SHA = server/worker/portal image provenance source = production AAB provenance source
evidence commit SHA is separate and contains no runtime-affecting diff; deployed legal byte hashes are explicit manifest subjects
final inventory hash + scanner-input evidence hash + legal approval hash + Console evidence hash = release manifest subjects
PRODUCTION_E2E_APPROVED = exact synthetic subjects only + <=4h + one request/subject; general deletion remains closed
RELEASE_APPROVED = post mobile+portal+support E2E final inventory + every E2E evidence hash; general deletion opens only afterward
versionName/applicationId = 1.0.0/com.touchcatch.mobile; production versionCode > Play remote prior max
closed Play bundle/versionCode = S2C internal Play bundle/versionCode; rebuild/re-upload = 0
Play Bundle upload SHA-256 = local attested AAB SHA-256 = internal source SHA-256 = closed-review submission source SHA-256
all public legal URLs = HTTPS 200 + public/non-geofenced/non-editable + approved byte hash
public deletion portal = password/Google/Kakao/support request-to-completion E2E PASS
account deletion disposition = DELETE rows absent; REDACT rows not reconnectable; RETAIN_UNTIL fields/period/basis/purge schedule exact; Auth/providers/local storage removed; restore tombstone replay PASS
Play Console Data Safety/data deletion/closed release review = ACCEPTED with unresolved issue 0
signed Play-installed device matrix = installer com.android.vending + app-signing cert + verified App Link PASS
server/worker image + portal image + migration/content manifests = staging-verified exact digests promoted to production
rollback + restore + alert drills = PASS
```

**Commit:** `docs: record android closed beta go-no-go evidence`

## 4. 필수 테스트 매트릭스

| Layer | 필수 성공 경로 | 필수 실패/경합 경로 |
|---|---|---|
| Contract | challenge 201, DELETE 202 without receipt secret, receipt status | 400/401/403/404/409/410/429/503, security override, schema mutation |
| Handler | challenge → proof exchange → one-time grant → durable enqueue → 202 | cross-user/proof/grant replay, missing dependency, RPC/DB outage, receipt leak |
| DB/PostgREST | all approved DELETE/REDACT/RETAIN actions | replay, active uniqueness, multi-connection race, direct RLS/grant/read/write bypass denial |
| Worker | fenced lease + effect journal + stage resume | remote unknown outcome, duplicate effect, lease loss/process crash, max retry/legal hold/retention expiry |
| Supabase Auth | user/identity/session removed | stale JWT, storage ownership conflict, admin API failure |
| Mobile | pre-persist proof → reauth → request → purge → status | offline/response loss, purge error, receipt expiry, delayed auth callback |
| Web portal | existing-user auth → request | enumeration, CSRF/state mismatch, new-user creation, invalid receipt |
| Legal | inventory → projections exact | undeclared SDK/field/processor, hash drift, expired approval |
| Android | approved upload-key signed AAB + Play-installed app-signing APK | missing signing env, wrong cert, native exit masking, unlocked dependency, loopback/permission/backup |
| Supply chain | AAB/image/SBOM OIDC provenance | wrong subject/issuer/SHA, vulnerable dependency, expired waiver, mutable action/base |
| Play review/activation | upload response hash; bootstrap `n`; production RC `m` internal→same closed bundle | remote hash/version collision, rebuild/re-upload, premature access activation, cert/App Link/installed version mismatch |
| Ops | exact digest/manifest staging→prod, smoke/alert/restore | wrong project, DB unavailable, worker backlog, rollback, restore+tombstone replay |

## 5. 최종 명령 순서

clean RC와 승인된 secret runner에서만 다음 순서로 실행한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/release/run-local-release-gates.ps1 -FreshRuns 3 -IncludeDisposableDatabase
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

그 뒤 protected workflow가 다음 순서를 강제한다.

1. Play Console Admin이 canonical package ownership, app-signing-key strategy, upload certificate와 2FA owners를 승인하고 Play App Signing control plane을 구성한다. signed bootstrap approval 전에는 AAB를 업로드하지 않는다.
2. Play 원격 최대값에서 bootstrap versionCode `n`을 예약하고 staging AAB를 build/attest/internal upload한다.
3. Play가 제공한 app-signing certificate/lineage를 capture해 registry에 서명하고 OAuth/App Link를 구성한 뒤 동일 bootstrap AAB의 S2A 설치 QA를 수행한다.
4. exact server/worker image, portal image, migration/content digest를 staging에 배포해 restore·full deletion S2B를 수행한다.
5. 같은 server/worker/portal image와 migration/content digest를 production에 promote한다. 별도 signed production environment manifest는 schema의 allowed-diff만 허용하고 exact hash를 deploy/AAB provenance에 결합한 뒤 production OAuth/portal/backup/alert를 검증한다.
6. 새 production versionCode `m`을 예약해 production RC를 한 번 build/attest/internal upload한다. pre-scan 뒤 합성계정 전용 E2E approval로 mobile+portal+support를 모두 실행하고, post-E2E 통합 재스캔 diff 0에 최종 `RELEASE_APPROVED`를 서명한다.
7. internal의 exact `m` bundle reference를 closed release review에 제출하되 managed publishing/tester access를 닫아 둔다. review accepted와 최종 cryptographic go/no-go 뒤 별도 activation job으로 closed tester access를 연다. 재빌드·재업로드하지 않는다.

`pnpm check`만 통과하거나 AAB 파일 하나가 생긴 상태, 또는 staging AAB의 성공은 external release 승인 조건이 아니다.

## 6. Stop conditions

다음 중 하나라도 발생하면 해당 work package를 완료 처리하지 않고 외부 배포를 중단한다.

- 삭제 dependency/RPC/provider/Auth 단계가 optional이거나 오류를 삼킨다.
- deletion request가 durable하지 않은데 2xx를 반환한다.
- receipt/idempotency가 network 전 저장되지 않거나 응답 유실 후 새 값을 만든다.
- recent-auth deletion grant가 user/provider/challenge/idempotency/receipt에 묶이지 않거나 one-time consume/replay test가 없다.
- tombstone 뒤 receipt status/exact no-side-effect DELETE replay 외 authenticated read/write가 가능하거나 worker hard-delete RPC를 API DB role이 실행할 수 있다.
- direct PostgREST/RLS/grant 경로가 tombstone을 우회한다.
- worker가 lease/fence/effect journal 없이 외부 I/O를 수행하거나 independent trust anchor로 exact environment approval을 검증하지 않는다.
- `PRODUCTION_E2E_APPROVED`가 4시간을 넘거나 exact synthetic-subject/one-request 범위가 없거나, 만료·allowlist 밖 enqueue/claim이 가능하다.
- mobile+portal+support 전체 E2E와 통합 post-E2E 재스캔 전에 최종 `RELEASE_APPROVED`를 발급하거나 그 전에 일반 deletion enqueue/claim을 연다.
- retained data에 기간·법적 근거·승인 ID가 없다.
- public legal/deletion URL 또는 support 채널이 실제로 동작하지 않는다.
- release signing key가 없는데 Gradle이 성공하거나 AAB certificate가 signed upload-certificate approval과 자동 비교되지 않는다.
- native command 실패가 후속 PowerShell command로 exit 0이 되거나 expected-failure 검사가 정확한 오류/AAB 부재를 확인하지 않는다.
- AAB의 cert, version, API origin, permissions, backup rules, dependency inventory를 읽지 못한다.
- Play 원격 maximum 이하 versionCode를 사용하거나 bootstrap/staging AAB를 production RC/closed로 승격한다.
- Play bundle upload response SHA-256이 local attested AAB와 다르거나 production RC를 internal 검증 뒤 다시 build/upload하거나 closed receipt의 source SHA/versionCode가 다르다.
- staging에서 검증한 server/worker/portal image 또는 migration/content digest를 production에서 rebuild/변경한다.
- staging/production environment manifest 차이가 versioned schema의 explicit allowed-diff를 벗어나거나, exact production manifest hash가 deploy/AAB provenance에 묶이지 않거나, 승인 뒤 drift한다.
- production DB restore 후 deleted account/data가 재등장한다.
- server/worker/portal image, AAB와 Play release의 runtime source SHA가 다르거나 evidence-only commit에 runtime-affecting diff가 있다.
- `docs/release-evidence-blockers.md`에 P0 `BLOCKED_EXTERNAL`이 남아 있다.
- 승인 역할 중 하나라도 비어 있거나 approval이 만료됐다.

## 7. Official references

- Google Play account deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en
- Google Play User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311?hl=en
- Google Play Data Safety form: https://support.google.com/googleplay/android-developer/answer/10787469?hl=en
- Google Play internal/closed/open testing: https://support.google.com/googleplay/android-developer/answer/9845334?hl=en
- Google Play target audience and Families: https://support.google.com/googleplay/android-developer/answer/9867159?hl=en
- Google Play Families policy: https://support.google.com/googleplay/android-developer/answer/9893335?hl=en
- Android Auto Backup: https://developer.android.com/identity/data/autobackup
- Android App Bundle signing / Play App Signing: https://developer.android.com/studio/publish/upload-bundle
- Android app signing and upload/app-signing key separation: https://developer.android.com/studio/publish/app-signing
- Android App Links / multiple signing fingerprints: https://developer.android.com/training/app-links/configure-assetlinks
- Android Publisher Bundle upload response: https://developers.google.com/android-publisher/api-ref/rest/v3/edits.bundles
- Play Integrity app integrity verdicts: https://developer.android.com/google/play/integrity/verdicts
- Gradle dependency locking: https://docs.gradle.org/current/userguide/dependency_locking.html
- GitHub artifact attestations: https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
- GitHub ruleset required-status-check source controls: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- JDK jarsigner verification semantics: https://docs.oracle.com/en/java/javase/12/tools/jarsigner.html
- Google bundletool 1.18.3: https://github.com/google/bundletool/releases/tag/1.18.3
- Supabase Auth Admin user deletion: https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
- Kakao Login unlink: https://developers.kakao.com/docs/en/kakaologin/rest-api

## 8. 계획 자체 검토 체크리스트

- [x] 사용자 요청의 세 축(계정 삭제, 법무/Data Safety, Android/AAB)과 production backend/ops/workflow를 모두 포함했다.
- [x] master WP-0…WP-11을 대체하거나 완료로 표시하지 않았다.
- [x] product code를 이 감사 단계에서 수정하지 않았다.
- [x] 모든 구현 task에 정확한 파일, RED/GREEN 또는 운영 단계, 명령, expected outcome이 있다.
- [x] 실행자가 값을 추정하게 만드는 placeholder나 미결정 sentinel이 없다.
- [x] destructive DB 명령은 disposable stack guard를 명시했다.
- [x] dirty tree 보존과 sequential one-WP rule을 명시했다.
- [x] local contract evidence와 external production evidence를 구분했다.
- [x] 법무/보존/아동/사업자 결정을 에이전트가 대신 승인하지 않았다.
