# TouchCatch Supabase 인증 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google·Kakao·이메일 로그인과 production-safe 게스트 전환을 기존 server-authoritative DB 경계에 연결한다.

**Architecture:** 모바일은 PKCE 세션과 UX만 담당하고, 공용 서버 verifier가 Supabase JWT를 검증한 뒤 trusted DB operation이 계정·opaque subject를 원자적으로 준비한다. 포인트·진행·경제·매치는 REST/Socket의 검증된 subject만 사용하며 Data API 권위 필드와 secret-key 우회 경로는 제거한다.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, `@supabase/supabase-js`, AsyncStorage, Expo WebBrowser/Linking, OpenAPI 3.1, PostgreSQL 17, Supabase CLI, Vitest, pgTAP.

## Global Constraints

- 모바일에는 project URL과 publishable key만 들어가며 secret/service-role key와 `DATABASE_URL`은 금지한다.
- OAuth callback은 `spotlearn://auth/callback`, PKCE code exchange만 허용하고 fragment token/`setSession()`은 거절한다.
- REST와 Socket은 issuer `${SUPABASE_URL}/auth/v1`, audience `authenticated`, 최대 30초 clock skew의 동일 verifier를 사용한다.
- `SUPABASE_SECRET_KEY`는 계정 삭제·전 세션 강제 종료 외에 사용하지 않는다.
- 권위 포인트는 `private.economy_subjects.gacha_points`를 읽은 `/v1/me`만 제공한다.
- production 게스트는 공개 샘플 팩만 사용하며 DEV registry/private solution을 import하지 않는다.
- Google/Kakao credential, legal retention 승인, 실제 iOS/Android golden은 외부 blocker다.

## 2026-07-22 완료 이력 판정

- `[x]`는 구현 커밋(`8c08d6b`, `6eafeba`, `951b25b`, `f19d236`, `518c0ad`, `4f05b85`, `45cb910`)과 현재 pinned Node `24.18.0` focused evidence가 함께 확인한 항목에만 사용한다.
- 과거 RED 실행 로그가 보존되지 않은 항목과 현재 DB focused gate를 다시 실행하지 않은 항목은 구현 파일이 있어도 `[ ]`로 유지한다.
- Task 7 재검증에서 JWT/REST·Socket/auth UUID/guest/deletion/PKCE/provider·device 계약 focused suite는 **15 files / 89 tests PASS**, 실제 local deletion cascade/concurrency는 **2 files / 4 tests PASS**했다.
- 전체 generated coverage는 **221/226 PASS**이며 `OBS-002`, `DATA-012`, `DATA-027`, `API-005`, `API-001` 5건은 Task 7 기준 커밋 `78b6614`에서 재현되는 기존 oracle 불일치다. docs check도 구조·추적성 drift는 0건이지만 numeric approval drift `DATA-004`, `DATA-017`, `DATA-027` 3건 때문에 FAIL이다.
- exact Node `24.18.0`/pnpm `11.13.0` aggregate `verify`는 runtime과 admin typecheck를 통과한 뒤 Windows Turbopack가 worktree의 `node_modules/pg` junction을 만들지 못해 중단됐다. 따라서 aggregate PASS는 주장하지 않는다.
- root `typecheck`도 기준 커밋에서 재현되는 workspace 오류가 있어 FAIL이다. OpenAPI lint와 scoped secretlint는 PASS했다.

---

## File map

- `packages/contracts/openapi.yaml`: `/v1/me`, nickname patch, 진행 병합의 wire SSOT.
- `packages/contracts/src/auth.ts`: auth state/error/provider exact unions와 merge runtime schemas.
- `packages/config/src/env.ts`: 기존 exact public/server env 경계 유지.
- `apps/server/src/auth/verify.ts`: REST/Socket 공용 JWT verifier. publishable key만 사용하는 일반 API process에 속한다.
- `apps/server/src/http/router.ts`: `/v1/me`, profile patch, progress merge의 실제 HTTP route.
- `apps/server/src/socket/authenticate.ts`: 같은 verifier를 사용하는 Socket handshake.
- `apps/account-worker/src/runtime.ts`: secret key가 필요한 계정 삭제·전 세션 종료만 수행하는 별도 deploy identity/process.
- `supabase/roles.sql`: 실제 API/worker LOGIN identity와 최소 group-role membership의 local test bootstrap.
- `apps/server/src/account/ensure-account.ts`: idempotent account bootstrap adapter.
- `apps/mobile/src/auth/*`: SDK wrapper, lifecycle, PKCE, email, gate; 화면의 SDK 직접 접근 금지.
- `supabase/migrations/*_auth_account_lifecycle.sql`: bootstrap DB function, grants, legacy profile 권위 철회.
- `supabase/migrations/*_learning_progress.sql`: opaque subject 기반 진행 receipt.

### Task 1: Auth와 merge 계약 고정

**Files:**
- Create: `packages/contracts/src/auth.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/openapi.yaml`
- Test: `tests/contracts/auth-contract.test.ts`
- Test: `tests/contracts/openapi.test.ts`

**Interfaces:**
- Produces: OAuth 전용 `oauthProviderSchema = google|kakao`, 로그인 수단 `authMethodSchema = email|google|kakao`, `authGateStateSchema`, `authErrorCodeSchema`, `learningProgressMergeRequestSchema`와 OpenAPI `POST /v1/learning/progress/merge`, `PATCH /v1/me`.

- [ ] **Step 1: RED 계약 테스트 작성** — OAuth provider는 `google|kakao`, 전체 auth method는 `email|google|kakao`, gate는 `GUEST|VERIFICATION_PENDING|READY|ACCOUNT_SETUP_FAILED`, merge event는 네 필드만 허용하고 경제 키·추가 속성·비-UUIDv4를 거절하도록 exact assertions를 쓴다.
- [ ] **Step 2: RED 확인** — `corepack pnpm vitest run tests/contracts/auth-contract.test.ts tests/contracts/openapi.test.ts`; 새 export/path가 없어서 FAIL이어야 한다.
- [ ] **Step 3: 최소 schema/OpenAPI 구현** — `schemaVersion: '1'`, 최대 100 events, ISO timestamp, `Idempotency-Key` 재사용, accepted/rejected 응답을 선언한다. `/v1/me`는 200 ready response와 401/403/503 discriminated errors를 exact status별로 명시하고 구현 gate와 동일 enum을 공유한다.
- [ ] **Step 4: GREEN 및 회귀** — 같은 focused 명령 후 `corepack pnpm check`; 모두 PASS여야 한다.
- [x] **Step 5: 커밋** — `git add packages/contracts tests/contracts && git commit -m "feat(auth): define account and progress contracts"`.

### Task 2: 공용 JWT verifier와 gate matrix

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Modify: `tsconfig.json`
- Modify: `package.json`
- Create: `apps/server/src/auth/verify.ts`
- Create: `apps/server/src/auth/gate.ts`
- Create: `apps/server/src/http/router.ts`
- Create: `apps/server/src/socket/authenticate.ts`
- Test: `apps/server/src/auth/verify.test.ts`
- Test: `apps/server/src/auth/gate.test.ts`

**Interfaces:**
- Produces: `verifyAccessToken(token): Promise<VerifiedIdentity>`, `authorize(identity, capability): AuthDecision`, `createHttpRouter(deps)`, `authenticateSocket(handshake)`; `VerifiedIdentity={authSub,isAnonymous}`. Email verification pending은 bearer가 없는 signup UX state이며 서버 JWT gate 상태가 아니다.

- [ ] **Step 1: RED verifier 테스트 작성** — 허용 algorithm exact set, rotated JWKS fixture 성공, unknown `kid` 1회 refresh 후 성공/실패, expired/bad signature/bad issuer/bad audience, 30초 초과 skew 실패를 고정한다. production env는 normalized HTTPS Supabase URL만 허용하고 local/test에만 HTTP loopback 예외를 둔다.
- [x] **Step 2: RED gate table 작성** — guest/invalid 401, anonymous 403, bootstrap failure 503, ready 허용을 table test로 만든다. Confirm Email이 켜진 email signup의 미검증 사용자는 JWT가 없으므로 모바일 `VERIFICATION_PENDING`으로만 테스트한다.
- [ ] **Step 3: RED 확인** — `corepack pnpm --filter @spot-learn/server test`; 모듈 부재로 FAIL이어야 한다.
- [ ] **Step 4: 최소 구현** — remote JWKS verifier 한 개를 주입 가능하게 만들고 algorithm/issuer/audience/expiry를 라이브러리에 위임한다. email 검증은 JWT payload 추측이 아니라 주입된 trusted user lookup 결과로 채운다.
- [x] **Step 5: 실제 ingress와 secret 경계 검사 추가** — `/v1/me` route와 Socket handshake가 동일 verifier를 호출하는 executable test를 추가한다. 일반 server env에서 `SUPABASE_SECRET_KEY`를 제거하고 `SUPABASE_PUBLISHABLE_KEY`만 허용하며 deletion worker 외부의 secret import를 boundary test로 거절한다.
- [ ] **Step 6: build gate 연결** — root TypeScript include와 `server:typecheck`/`check` script에 새 server를 연결해 파일이 검사 밖으로 빠지지 않게 한다.
- [ ] **Step 7: GREEN/회귀/커밋** — focused test와 `corepack pnpm check` 후 `git commit -m "feat(server): verify Supabase access tokens"`.

### Task 3: 원자적 account bootstrap과 권위 `/v1/me`

**Files:**
- Create: `supabase/migrations/202607190007_auth_account_lifecycle.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Modify: `supabase/tests/database/economy.test.sql`
- Modify: `tests/database/concurrency.test.ts`
- Modify: `supabase/roles.sql`
- Test: `tests/database/login-role.test.ts`
- Create: `apps/server/src/account/ensure-account.ts`
- Test: `apps/server/src/account/ensure-account.test.ts`

**Interfaces:**
- Produces: dedicated NOLOGIN/NOINHERIT `account_security_owner`, `private.ensure_account_v1(uuid)` exact `app_server` RPC와 read-only `private.read_me_v1(uuid)`, `ensureAccount(authSub)`; 결과 `{apiSubjectKey,economySubjectKey,nickname,points}`.

- [ ] **Step 1: RED DB 테스트 작성** — profile+economy subject 동시 생성, `Player-XXXXXXXX`, provider metadata 미복사, 20-way concurrent replay, auth UUID가 response/receipt에 없음, 한쪽만 있는 legacy 상태 복구를 검증한다.
- [ ] **Step 2: RED 확인** — `supabase db reset --local && supabase test db --local && corepack pnpm test:db:concurrency`; 함수 부재로 FAIL이어야 한다.
- [ ] **Step 3: 최소 migration 구현** — migration version 중복 검사를 먼저 통과시킨다. dedicated `account_security_owner`에게 필요한 `profiles`, `api_subjects`, `economy_subjects` 최소 권한만 부여하고, `security definer`, `search_path=pg_catalog`, UUID input 검증, transaction 내 upsert/unique replay, app_server exact execute grant를 사용한다. `private.api_subjects`가 기존 migration에 없으면 이 migration에서 random key와 unique `user_id`를 만든다. `game_security_owner`와 `economy_security_owner`의 기존 경계는 넓히지 않는다.
- [ ] **Step 4: 권위 drift 제거** — authenticated의 `profiles.level/exp/gacha_points` SELECT와 nickname UPDATE grant를 철회하고 safe columns SELECT만 다시 grant한다. `/v1/me`는 account owner의 exact `read_me_v1` projection을 통해 economy subject points를 읽으며 app_server에 direct private table SELECT를 주지 않는다.
- [ ] **Step 5: 실제 DB LOGIN 경계 구현** — production과 동형인 restricted LOGIN identity를 local role bootstrap에 만들고 필요한 group role membership만 부여한다. pool transaction마다 `SET LOCAL ROLE`, transaction 종료 뒤 role reset을 확인하며 non-allowlisted 함수/DML 호출은 실패해야 한다.
- [ ] **Step 6: pgTAP allow-list 갱신** — 허용 함수를 느슨한 패턴으로 바꾸지 말고 새 exact signature만 추가한다.
- [ ] **Step 7: GREEN/회귀/커밋** — `corepack pnpm check:db`와 server focused test 후 `git commit -m "feat(auth): bootstrap authoritative accounts"`.

### Task 4: 모바일 client와 session lifecycle

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/src/auth/env.ts`
- Create: `apps/mobile/src/auth/client.ts`
- Create: `apps/mobile/src/auth/session.ts`
- Create: `apps/mobile/src/auth/index.ts`
- Test: `apps/mobile/src/auth/client.test.ts`
- Test: `apps/mobile/src/auth/session.test.ts`

**Interfaces:**
- Produces: singleton `getAuthClient()`, `restoreSession()`, `subscribeAuthState()`, `signOut()`; 화면에는 typed facade만 export.

- [ ] **Step 1: dependency 호환 확인** — `corepack pnpm --dir apps/mobile exec expo install --check`; Expo 57 호환 범위를 기록하고 임의 latest 설치를 금지한다.
- [x] **Step 2: RED 테스트 작성** — env 누락 fail closed, singleton, AsyncStorage persistence, `flowType:'pkce'`, `detectSessionInUrl:false`, process lock, foreground refresh, logout cache purge를 fake adapter로 검증한다.
- [ ] **Step 3: RED 확인** — `corepack pnpm vitest run apps/mobile/src/auth/client.test.ts apps/mobile/src/auth/session.test.ts`; FAIL이어야 한다.
- [x] **Step 4: 의존성과 최소 구현** — Expo install로 `@supabase/supabase-js`, AsyncStorage, `expo-web-browser`, `expo-linking`을 pin하고 SDK를 `src/auth` 밖에서 import하지 못하게 boundary test를 추가한다.
- [ ] **Step 5: GREEN/회귀/커밋** — focused test, `corepack pnpm typecheck`, `corepack pnpm check` 후 `git commit -m "feat(mobile): add persistent Supabase session"`.

### Task 5: Email과 Google/Kakao PKCE UI

**Files:**
- Create: `apps/mobile/src/auth/email.ts`
- Create: `apps/mobile/src/auth/oauth.ts`
- Create: `apps/mobile/app/auth/index.tsx`
- Create: `apps/mobile/app/auth/callback.tsx`
- Test: `apps/mobile/src/auth/email.test.ts`
- Test: `apps/mobile/src/auth/oauth.test.ts`
- Create: `apps/mobile/app/auth/recovery.tsx`
- Modify: `supabase/config.toml`
- Modify: `tests/contracts/supabase-config.test.ts`

**Interfaces:**
- Produces: `signUpEmail`, `signInEmail`, `resendVerification`, `requestPasswordReset`, `completePasswordRecovery`, `startOAuth(provider)`, `completeOAuth(url)`.

- [x] **Step 1: RED callback 테스트** — exact scheme/path, persisted verifier/state, one-shot completion fence, code-only exchange를 허용하고 fragment token, replay, mismatch, provider error를 거절한다. WebBrowser result, cold-start initial URL, live Linking event가 동시에 도착해도 하나의 coordinator가 정확히 한 번 완료하고 app restart 뒤 pending flow를 복구해야 한다.
- [x] **Step 2: RED email 테스트** — Confirm Email signup은 session 없이 `VERIFICATION_PENDING`, generalized resend/reset response, recovery callback의 one-shot code exchange와 `updateUser({password})`, verified 뒤 bootstrap 호출, `ACCOUNT_SETUP_FAILED` 보존을 검증한다.
- [ ] **Step 3: local config RED** — config test가 exact callback과 `enable_manual_linking=true`를 요구하도록 만들고 FAIL을 확인한다.
- [x] **Step 4: 최소 구현** — WebBrowser auth session을 열고 반환 code만 `exchangeCodeForSession`에 넘긴다. callback URL/token/email 전체를 로그하지 않는다.
- [ ] **Step 5: config와 Inbucket 연결** — `additional_redirect_urls=["spotlearn://auth/callback","spotlearn://auth/recovery"]`, `[auth.email] enable_confirmations=true`를 설정하고 로컬 email confirm/recovery 절차를 operations 문서에 기록한다.
- [ ] **Step 6: GREEN/회귀/커밋** — focused tests와 `corepack pnpm check` 후 `git commit -m "feat(mobile): add PKCE and email authentication"`.

### Task 6: Production-safe guest pack과 진행 병합

**Files:**
- Create: `apps/mobile/src/guest-content/registry.ts`
- Create: `apps/mobile/src/guest-content/progress.ts`
- Modify: `apps/mobile/app/index.tsx`
- Modify: `apps/mobile/src/learning-demo/production-boundary.test.ts`
- Create: `supabase/migrations/202607190008_learning_progress.sql`
- Create: `apps/server/src/learning/merge-progress.ts`
- Test: `apps/server/src/learning/merge-progress.test.ts`
- Test: `supabase/tests/database/learning-progress.test.sql`

**Interfaces:**
- Produces: public sample registry와 `mergeLearningProgress(identity, idempotencyKey, body)`.

- [x] **Step 1: RED boundary 테스트** — production graph에 DEV registry/private solution이 없고 공개 sample manifest만 포함되는지 검사한다.
- [x] **Step 2: RED merge 테스트** — published revision만 수용, extra/economy fields 전체 요청 거절, batch replay가 원 응답을 재현, 같은 key/different hash conflict, batch 내부 duplicate event, 같은 device event/changed payload conflict, partial accepted/rejected 응답을 고정한다.
- [ ] **Step 3: 최소 DB/server 구현** — dedicated learning owner의 security-definer projection으로 published revision을 검증해 app_server direct SELECT를 피한다. auth UUID 대신 api subject FK와 `(subject_key,device_event_id)` event receipt, `(subject_key,idempotency_key,request_hash,response,status)` batch receipt를 원자적으로 claim/complete하고 권위 보상 함수를 호출하지 않는다.
- [x] **Step 4: 모바일 pending lifecycle** — receipt 전 pending 유지, accepted만 제거, rejected 이유 보존, login 후 explicit merge를 구현한다.
- [ ] **Step 5: GREEN/회귀/커밋** — focused tests, `corepack pnpm check`, `corepack pnpm check:db` 후 `git commit -m "feat(learning): merge safe guest progress"`.

### Task 7: Identity 관리, nickname, 계정 삭제

**Files:**
- Create: `apps/mobile/src/auth/linking.ts`
- Create: `apps/server/src/account/update-profile.ts`
- Create: `apps/server/src/account/delete-account.ts`
- Create: `apps/account-worker/package.json`
- Create: `apps/account-worker/src/runtime.ts`
- Create: `supabase/migrations/202607190009_account_deletion_lifecycle.sql`
- Test: `apps/mobile/src/auth/linking.test.ts`
- Test: `apps/server/src/account/delete-account.test.ts`
- Modify: `packages/contracts/openapi.yaml`
- Modify: `supabase/tests/database/economy.test.sql`

**Interfaces:**
- Produces: explicit reauth/link/unlink facade, `PATCH /v1/me`, `DELETE /v1/me` job entrypoint.

- [x] **Step 1: RED identity 테스트** — Supabase automatic same-email linking을 앱 데이터 merge로 오해하지 않으며, manual link는 recent reauth, unlink는 검증된 identities 2개 이상을 요구한다.
- [x] **Step 2: RED nickname 테스트** — 1~40자, normalized text, rate limit, 금칙어와 provider metadata 미사용을 검증한다.
- [ ] **Step 3: RED deletion 테스트** — durable `ACTIVE→DELETING→DELETED` lifecycle, bootstrap-vs-delete 동시성, admission 차단→queue cancel→outbox claim→Auth Admin delete→개인 진행/profile 삭제→economy mapping null 순서, worker crash/restart와 retry idempotency를 검증한다. `ensureAccount`는 DELETING/DELETED tombstone을 보고 재생성을 거절한다.
- [x] **Step 4: 최소 구현** — 일반 API process에는 secret이 없고 deletion job은 opaque job payload로 별도 account worker에 전달한다. worker의 secret-key method allow-list를 `deleteUser`/global sign-out으로 고정하고 다른 admin method 접근 test를 실패시킨다.
- [ ] **Step 5: GREEN/회귀/커밋** — focused tests와 `corepack pnpm verify` 후 `git commit -m "feat(auth): manage identities and account lifecycle"`.

### Task 8: 추적성, 통합 검증, 외부 handoff

**Files:**
- Modify: `06_CLIENT_ARCHITECTURE.md`
- Modify: `09_API_AND_SOCKET_EVENTS.md`
- Modify: `docs/requirements-registry.v1.json` (generator output only)
- Modify: `config/requirement-evidence.v1.json`
- Create: `docs/operations/supabase-auth-provider-handoff.md`
- Create: `tests/integration/local-auth.test.ts`

**Interfaces:**
- Produces: SEC-001 정합 oracle, local email/JWT/bootstrap golden, 외부 credential checklist.

- [ ] **Step 1: 규범 문장과 oracle RED** — 기존 SEC-001을 확장할 수 있으면 새 ID를 만들지 않고 schema/test/metric을 연결한다. 별도 의미일 때만 다음 미사용 AUTH/SEC ID를 generator 규칙으로 발급한다.
- [ ] **Step 2: local integration 작성** — Inbucket email confirm, PKCE exchange, `/v1/me`, forged/expired JWT, bootstrap replay, redaction을 실제 local Supabase에 검증한다.
- [ ] **Step 3: operations handoff 작성** — Google/Kakao callback, exact app redirect, secret 위치, Apple 4.8, privacy/retention, Android/iOS development-build golden을 체크박스로 기록하고 미승인 항목은 `BLOCKED`로 둔다.
- [ ] **Step 4: 전체 검증** — exact pinned runtime의 `pnpm verify`는 Windows Turbopack junction 오류로 FAIL했다. focused auth 89/89, local deletion 4/4, OpenAPI lint와 scoped secretlint는 PASS했으며, generated coverage 5건·docs numeric approval 3건·root typecheck는 기준 커밋 결함으로 별도 기록했다.
- [ ] **Step 5: 읽기 전용 최종 리뷰** — 고정 diff를 별도 reviewer에게 주고 JWT 경계, auth UUID 유출, guest bundle, deletion retry를 검토받아 Important 이상을 모두 닫는다.
- [ ] **Step 6: 커밋** — `git add 06_CLIENT_ARCHITECTURE.md 09_API_AND_SOCKET_EVENTS.md docs config tests/integration && git commit -m "docs(auth): bind integration evidence and handoff"`.

## 완료 판정

- 코드 완료: focused 보안·인증·삭제 경계와 scoped secret scan은 통과했지만 aggregate `verify`, generated coverage, docs check, root typecheck가 아직 실패하므로 완료로 승격하지 않는다.
- 로컬 통합 완료: Supabase reset 뒤 email confirm→bootstrap→`/v1/me`→merge→delete가 재현된다.
- production 준비 완료: 코드 완료만으로 승격하지 않는다. Google/Kakao credential, retention/legal, Apple 정책 판단, 실제 Android/iOS golden이 모두 승인되어야 한다.
