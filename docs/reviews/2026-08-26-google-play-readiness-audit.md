# Google Play 출시 준비 재감사 — 재현 기록

**결론: `NO_GO_EXTERNAL`.** 외부 closed beta와 실서비스 판정은 P0 NO-GO다.

이 문서는 [2026-08-26 시정 계획](../superpowers/plans/2026-08-26-google-play-production-readiness-remediation-plan.md)의 P0 표를 실제로 재현한 기록이다. 계획서가 주장을 적는 문서라면 이 문서는 그 주장을 **어떤 명령으로 확인했는지**를 적는 문서다.

모든 명령은 pinned runtime에서 실행했다.

```bash
export PATH="$APPDATA/fnm/node-versions/v24.18.0/installation:$PATH"
```

---

## 1. 재현한 P0

### P0-TYPE-1 — 서버가 컴파일되지 않는다

```bash
pnpm -s server:typecheck   # EXIT=2
```

```text
apps/server/src/http/router.ts(155,7): error TS2375: ... with 'exactOptionalPropertyTypes: true'
apps/server/src/http/router.ts(161,5): error TS2375: ... with 'exactOptionalPropertyTypes: true'
```

`resolve()`의 반환 타입이 `route?: Route`인데 `route: undefined`를 넣고 있었다. `DELETE /v1/me`를 추가하면서 들어온 회귀다.

### P0-CONTRACT-1 — 계약 테스트가 실패한다

```bash
pnpm check   # CHECK_EXIT=1, Test Files 4 failed | 177 passed
```

감사 시점 트리에서 실패한 것은 2건이다(나머지 2건은 이 세션의 게이트 구성 변경으로 발생했고 같은 커밋에서 함께 고쳤다).

| 테스트 | 실패 이유 |
|---|---|
| `packages/contracts/src/openapi.test.ts:54` | `openapi.yaml`에 `DELETE /v1/me`가 추가됐지만 고정된 method 집합이 갱신되지 않았다. **스펙 누락이 아니라 스펙과 pin의 불일치다.** |
| `tests/contracts/mobile-oauth-config.test.ts:41` | `app.json`의 `scheme`이 `touchcatch`로 바뀌었지만 나머지 identity는 `spotlearn`이었다. |

### P0-DEL-1 / P0-DEL-2 — 삭제가 삭제가 아니다

`apps/mobile/src/auth/session-controller.ts`의 `deleteAccount()`는 `auth.signOut({ scope: 'local' })`만 호출했다. 서버로 나가는 요청이 없다.

`apps/server/src/http/me-handler.ts`의 `createDeleteMeHandler`는 `subjectResolver.deleteAccount`가 **optional**이라 없으면 그냥 건너뛰고 `200 {deleted:true}`를 반환했다.

`apps/server/src/auth/subject-resolver.ts`의 구현은 존재하지 않는 RPC를 호출한 뒤 오류를 삼켰다. 코드에 남아 있던 주석이 그 의도를 그대로 적고 있다:

```ts
} catch (error) {
  if (error instanceof SubjectResolutionError) throw error;
  // Graceful handling if RPC is not present in mock
}
```

`private.delete_mobile_account_v1` migration은 저장소에 없다.

UI에는 **확인 다이얼로그가 없었다.** 「회원 탈퇴 (계정 삭제)」를 한 번 누르면 곧바로 실행되고 성공으로 표시된다.

### P0-AAB-1 / P0-AAB-2 — release 산출물 신뢰 경계가 없다

`apps/mobile/android/app/build.gradle`의 release signingConfig는 `KEYSTORE_PATH`가 없으면 **저장소에 커밋된 `debug.keystore`로 폴백**했다. release AAB는 0개이고 `build/outputs`에는 debug APK만 있다.

### P0-CI-1 — release/deploy workflow가 없다

`.github/workflows/`에는 `ci.yml` 하나뿐이다. job은 `check`, `database`, `server`, `mobile` 4개이고 Android 빌드·업로드·배포 job은 없다.

### P1-BACKUP / P1-PERMISSION — manifest

`android:allowBackup="true"`였고, `READ_EXTERNAL_STORAGE`·`WRITE_EXTERNAL_STORAGE`·`SYSTEM_ALERT_WINDOW`를 선언하고 있었다. merger 리포트상 출처는 각각 `expo.modules.filesystem`과 `react-android`이며, 앱 코드에서 쓰는 곳은 없다.

### P0-RC-1 — 트리가 고정되지 않았다

```bash
git status --porcelain | grep -c '^ M'   # 72
git status --porcelain | grep -c '^??'   # 177
```

`docs/legal/privacy-policy.md`(15줄), `terms-of-service.md`(5줄), `google-play-data-safety.md`(6줄), `tools/mobile/build-release-aab.ps1`(21줄)은 **존재하지만 전부 untracked다.** 커밋되지 않은 파일은 증거가 아니다.

---

## 2. 계획서에 없던 것

### 게이트가 서버를 검사한 적이 없다

P0-TYPE-1이 로컬에서 통과한 이유는 router 코드가 아니라 게이트 구성이다.

- root `tsconfig.json`의 `include`: `apps/mobile/src`, `packages`, `tests`, `tools`. **`apps/server/**`가 없다.**
- `package.json`의 `check` 체인: `server:check`도 `server:typecheck`도 없었다.
- root `test`는 `apps/**/*.test.ts`를 포함하므로 서버 *테스트*만 돌고 있었다.

즉 서버 TypeScript는 "23단계 전체 게이트"의 검사 대상이 아니었다. CI에 별도 `server` job이 있지만, 사람이 "게이트 통과"라고 말할 때 근거로 쓰는 것은 로컬 `pnpm check`다.

게이트 체인 자체도 **네 군데**에 손으로 적혀 있다. `package.json`의 `check`, `tools/check-docs-lib.ts`의 `requiredGateCommands`, `tools/check-docs.mjs`의 인라인 `required`, 그리고 `CLAUDE.md`의 단계 수다. 뒤의 둘은 앞의 것과 같은 배열을 복제한 것이라, 단계를 하나 추가하면 네 곳을 다 고쳐야 하고 하나라도 빠뜨리면 `docs:check`가 `gateDrift`로 막는다. 막아주긴 하지만 SSOT는 아니다.

### route 목록이 세 군데에 손으로 적혀 있다

`DELETE /v1/me` 하나를 지우는 데 세 파일을 고쳐야 했다: `openapi.yaml`, `router.ts`의 `routes` Map, 그리고 `router.ts`의 `PUBLIC_MOBILE_API_OPERATIONS` 배열. `apps/server/src/http/router.contract.test.ts`는 스펙을 **세 번째 것과** 대조하는데, 이건 라우터가 실제로 서빙하는 목록이 아니라 손으로 유지하는 선언이다. 둘이 어긋나도 이 테스트는 통과한다. 지금은 405 회귀 테스트가 그 틈을 덮고 있다.

### `app.config.js`가 `app.json`을 이기고 있었다

`app.config.js`가 `name`/`slug`/`scheme`을 하드코딩해 `app.json`을 덮어썼다. 스토어 이름만 TouchCatch로 바뀐 채, **실제로 빌드·설치되는 앱과 OAuth callback scheme은 계속 `Spot Learn Battle` / `spotlearn`이었다.**

### Play closed testing 12명 / 연속 14일

2023-11-13 이후 생성된 개인 개발자 계정은 production access 신청 전에 closed testing 트랙에서 tester 12명이 **연속 14일** opt-in 상태를 유지해야 한다. **internal testing은 1일도 산입되지 않는다.** 승인 심사가 보통 7일 이하 추가된다.

계획서의 S2A(internal bootstrap)는 이 시계를 시작시키지 못한다. 실제 하한은 최초 closed opt-in으로부터 **21일 이상**이다.

### targetSdk 36 (2026-08-31)

2026-08-31부터 신규 앱과 **업데이트 모두** Android 16(API 36) 타깃이 필수다. 현재 Expo 57 기본값이 이미 36으로 해석되어 요건은 충족 상태지만, 저장소에 이 값을 고정하는 검사가 없었다.

### 삭제 완료 기한

Google의 명시적 최대 기한은 **없다.** 공식 문구는 "reasonably quick period of time"이고, 요구되는 것은 요청 시점에 사용자에게 무엇이 언제 일어나는지 알리는 것이다. Data safety form의 "90일" 항목은 *자동* 삭제·익명화 주기를 묻는 별개 항목이다. 따라서 durable 202 + worker 구조는 정책상 문제없고, **컴플라이언스 산출물은 HTTP 상태 코드가 아니라 사용자 대면 문구다.**

---

## 3. 소스가 말해주지 않은 것 — 병합된 release manifest

`src/main/AndroidManifest.xml`은 권한을 두 개(`INTERNET`, `VIBRATE`)만 선언한다. 실제로 빌드된 release manifest에는 **여섯 개**가 있다.

```bash
KEYSTORE_PATH=... KEYSTORE_PASSWORD=... KEY_ALIAS=... KEY_PASSWORD=... \
  ./gradlew :app:processReleaseMainManifest
```

`app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml`:

| 권한 | 출처 |
|---|---|
| `INTERNET` | 소스 |
| `VIBRATE` | 소스 |
| `MODIFY_AUDIO_SETTINGS` | expo-audio |
| `ACCESS_NETWORK_STATE` | react-native |
| `WAKE_LOCK` | react-native / expo |
| `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | androidx core (signature 수준 내부 권한) |

넷은 소스 어디에도 없다. 전부 normal/signature 권한이라 런타임 프롬프트는 없지만, **권한 정당성과 Data Safety가 답해야 하는 목록은 소스의 두 줄이 아니라 이 여섯 줄이다.** 소스 스캔이 산출물을 증명하지 못한다는 계획서의 원칙이 그대로 나타난 사례다.

같은 병합 결과에서 함께 확인한 것:

- `android:allowBackup="false"`
- `android:targetSdkVersion="36"`
- deep link `android:scheme="touchcatch"` (`https`는 브라우저 `<queries>` 블록이라 별개)
- `package="com.touchcatch.mobile"`, `versionName="1.0.0"`, `versionCode="1"`

`versionCode`는 여전히 1로 고정돼 있다. 계획서 R8의 allocator 사안이다.

서명 fail-closed도 실제로 확인했다. secret 없이 release 태스크를 실행하면:

```text
* What went wrong:
Missing release signing inputs: KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD
BUILD FAILED in 6s
```

---

## 4. 삭제 대상 인벤토리 — FK를 따라가면 놓치는 것

계정 삭제는 **지우는 목록만큼만 완전하다.** 그 목록이 어디에도 없어서 마이그레이션에서 기계적으로 유도했다.

```bash
pnpm privacy:inventory          # docs/legal/data-subject-inventory.v1.json 재생성
pnpm privacy:inventory:check    # 게이트 (25단계 중 하나)
```

`auth.users` / `private.economy_subjects` / `public.profiles`를 뿌리로 두고 외래키를 따라 나가면 **27개 테이블**이 사용자 데이터를 담는다. 그중 11개에 자유형 `jsonb` 컬럼이 있어 컬럼명 기반 PII 스캔으로는 안이 안 보인다 — `idempotency_requests.response_body`는 API 응답 전체를 저장한다.

문제는 외래키를 따라가면 **놓치는 게 11개 더 있다는 것**이다.

| 테이블 | 연결 방식 | 왜 안 지워지나 |
|---|---|---|
| `private.g3_journal` | `match_id` + `event jsonb` | FK 없음 |
| `private.g3_snapshots` | `match_id` + `state jsonb` | FK 없음 |
| `private.g3_command_receipts` | `match_id` | FK 없음 |
| `private.g3_effect_outbox` | `match_id` | FK 없음 |
| `private.g3_timer_intents` | `match_id` | FK 없음 |
| `private.g3_match_leases` | `match_id` | FK 없음 |
| `private.legacy_matches_quarantine` | `match_row`, `player_rows` jsonb | 사용자 행이 통째로 JSON 안에 |
| `private.legacy_match_events_quarantine` | `legacy_row` jsonb | 같음 |
| `private.legacy_game_contents_quarantine` | `legacy_row` jsonb | 내용 확인 필요 (오탐 가능) |
| `private.admin_sessions` | `actor_id` | 운영자 개인정보, 별개 주체 |
| `private.admin_publish_receipts` | `owner_id` | 같음 |

`g3_*` 여섯 개는 전부 `match_id uuid not null`을 갖지만 `public.matches`를 참조하지 않는다. **cascade 삭제는 이들을 그냥 지나간다.** legacy quarantine 세 개는 더 나쁘다 — 사용자 행 자체가 jsonb 값으로 복사돼 있어서, 어떤 컬럼 기반 스캔에도 안 걸린다.

FK 기반 삭제를 먼저 구현했다면 이 11개는 조용히 남았을 것이고, 통합 테스트도 통과했을 것이다. 지우는 쪽과 확인하는 쪽이 같은 FK 그래프를 보기 때문이다.

`unlinkedSubjectCandidates`는 **판정이 아니라 검토 지시**다. 각 항목의 처분 방식(삭제 / 익명화 / 법적 보존)은 R2에서 사람이 결정한다.

### 11개를 실제로 추적한 결과

도구는 SQL만 본다. 런타임에 데이터가 실제로 쌓이는지는 따로 확인했다.

| 대상 | 확인 결과 |
|---|---|
| `g3_*` 6개 | `apply_match_command_g3`를 호출하는 코드가 `apps/`·`packages/` 어디에도 없다. 서버는 `public.matches`를 읽지도 쓰지도 않는다. DB 함수만 있고 **런타임 경로가 없다** — 현재 행이 생기지 않는다. |
| `legacy_*_quarantine` 3개 | 마이그레이션 시점 백필이다. `insert ... select ... from public.match_events` / `from public.matches`. 즉 **마이그레이션을 돌리는 순간 그 테이블에 있던 행**을 복사한다. 새 DB에서는 0행이다. |
| `admin_sessions`, `admin_publish_receipts` | 운영자 데이터. 앱 사용자와 **다른 주체**이므로 사용자 삭제 범위가 아니지만, 개인정보인 것은 같다. |

프로덕션 DB가 아직 없으므로 **현재 어떤 환경에도 실사용자 데이터가 없다.** 실질 위험은 0이다.

그래서 이건 사고 보고가 아니라 기회다. 프로덕션이 뜨고 나면 legacy quarantine에는 실제 사용자 행이 jsonb로 들어가고, 그 뒤에 온 삭제 요청은 JSON 내부를 뒤져야 한다. **실사용자가 없는 지금이 `g3_*`에 FK를 붙이거나 범위에서 들어내고, quarantine 처분 규칙을 정할 유일하게 싼 시점이다.**

---

## 5. R3/R4로 만든 것과, 여전히 만들지 않은 것

### 만든 것

| 계층 | 내용 |
|---|---|
| DB | `account_deletion_requests` + `account_access_tombstones`. 요청 행과 tombstone이 **한 트랜잭션**에서 커밋된다. `ensure_mobile_account_v1`(모든 인증 경로의 관문)이 tombstone을 확인해 `ACCOUNT_CLOSED`를 던진다. |
| API | `DELETE /v1/me` → 202, `POST /v1/me/deletion-status` → 200. 상태 조회는 **인증 없음** — auth 단계가 끝나면 제시할 세션이 없다. |
| 모바일 | receipt secret을 **네트워크 요청 전에** 저장. `closeForDeletion()`으로 세션을 latch. 2단계 확인 카드. |
| 게이트 | `privacy:inventory:check`가 25단계로 편입. 새 테이블이 인벤토리에 없으면 실패한다. |

설계에서 되짚을 만한 판단 세 가지다.

**삭제 핸들러는 `ensureAndResolve`를 거치지 않는다.** 그 함수가 이제 닫힌 계정을 거부하므로, 통과시키면 재시도가 막힌다 — 네트워크가 끊겼을 때 반드시 생기는 그 재시도다.

**receipt는 저장이 먼저, 전송이 나중이다.** 중요한 실패는 "요청이 거부됨"이 아니라 "요청은 성공했는데 앱이 유일한 확인 수단을 잃음"이다. 테스트가 이 순서를 직접 단언한다.

**`match_players`가 `on delete set null`이다.** 계정을 지워도 대전 기록은 남고 `user_id`만 null이 된다. 2인 기록이라 이게 옳은 설계지만, 결과적으로 **삭제 worker는 "전부 지운다"가 아니라 테이블별로 삭제/익명화가 갈린다**는 전제 위에서 만들어야 한다. 개인정보처리방침에도 그대로 적혀야 한다.

### 만들지 않은 것

- **실제 처분.** 접근 차단과 요청 기록까지다. worker는 R2 결정(테이블별 삭제/익명화/보존)이 있어야 짤 수 있다.
- **recent-auth 재인증.** 계획서는 삭제 전 재인증을 요구하지만 지금은 Bearer 토큰이면 된다. 2단계 확인이 완충은 되나 같지 않다.
- **SecureStore.** receipt는 SQLite localStorage에 있다. `expo-secure-store` 추가는 네이티브 재빌드가 필요하고 지금 검증할 수 없다. `allowBackup=false`가 백업 유출은 막지만 Keystore와 같지 않다.
- **DB 검증.** 마이그레이션 3개가 SQL 문법 이상 확인되지 않았다. 로컬 Docker가 뜨지 않아 `check:db`를 돌리지 못했다.

### Docker가 뜨지 않은 이유 (기록)

`unix://C:\Users\...` 형태의 소켓 경로에서 리스너 생성이 실패한다. `dockerInference`와 `docker-secrets-engine\engine.sock` 둘 다 같은 증상이며, 파일 삭제는 PowerShell·`fsutil` 모두 Error 1920으로 막힌다. 디렉터리 rename으로 하나를 치우면 다음 소켓이 같은 오류를 낸다. `EnableDockerAI=False`로도 Inference manager 초기화를 막지 못했다(Docker Desktop 4.63.0). `docker-secrets-engine.stale-20260811-2237`이 남아 있는 것으로 보아 이 머신에서 재발하는 문제다.

CI의 `database` job이 `pnpm db:start && pnpm check:db`를 돌리므로, 커밋·푸시하면 원격에서 검증된다.

---

## 6. 사람만 닫을 수 있는 항목

에이전트가 추정하거나 승인할 수 없다.

| 항목 | 필요한 것 |
|---|---|
| Supabase / Google Cloud Console | redirect allow-list를 `touchcatch://auth/callback`으로 변경. 로컬 `supabase/config.toml`은 로컬 스택만 덮는다. |
| 보존 기간·법적 근거·사업자 정보 | R2 승인. 개인정보처리방침과 Data Safety의 입력값이다. |
| 아동 대상 여부 | 학습 앱이므로 Families 정책 적용 여부가 갈린다. |
| 공개 privacy / terms / account-deletion URL | 호스팅과 도메인. 앱을 설치하지 않고도 삭제를 요청할 수 있어야 한다. |
| support 채널 | 실제로 응답하는 주소. |
| upload keystore | 생성·보관. 4개 secret. |
| Play Console | 계정 유형과 생성일 확인, 트랙 구성, Data safety form 제출. |
