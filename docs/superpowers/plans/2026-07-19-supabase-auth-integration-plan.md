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

---

## File map

- `packages/contracts/openapi.yaml`: `/v1/me`, nickname patch, 진행 병합의 wire SSOT.
- `packages/contracts/src/auth.ts`: auth state/error/provider exact unions와 merge runtime schemas.
- `packages/config/src/env.ts`: 기존 exact public/server env 경계 유지.
- `apps/server/src/auth/verify.ts`: REST/Socket 공용 JWT verifier.
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
- Produces: `authProviderSchema`, `authGateStateSchema`, `authErrorCodeSchema`, `learningProgressMergeRequestSchema`와 OpenAPI `POST /v1/learning/progress/merge`, `PATCH /v1/me`.

- [ ] **Step 1: RED 계약 테스트 작성** — provider는 `google|kakao`, gate는 `GUEST|UNVERIFIED|READY|ACCOUNT_SETUP_FAILED`, merge event는 네 필드만 허용하고 경제 키·추가 속성·비-UUIDv4를 거절하도록 exact assertions를 쓴다.
- [ ] **Step 2: RED 확인** — `corepack pnpm vitest run tests/contracts/auth-contract.test.ts tests/contracts/openapi.test.ts`; 새 export/path가 없어서 FAIL이어야 한다.
- [ ] **Step 3: 최소 schema/OpenAPI 구현** — `schemaVersion: '1'`, 최대 100 events, ISO timestamp, `Idempotency-Key` 재사용, accepted/rejected 응답과 설계의 typed error enum을 그대로 선언한다.
- [ ] **Step 4: GREEN 및 회귀** — 같은 focused 명령 후 `corepack pnpm check`; 모두 PASS여야 한다.
- [ ] **Step 5: 커밋** — `git add packages/contracts tests/contracts && git commit -m "feat(auth): define account and progress contracts"`.

### Task 2: 공용 JWT verifier와 gate matrix

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/auth/verify.ts`
- Create: `apps/server/src/auth/gate.ts`
- Test: `apps/server/src/auth/verify.test.ts`
- Test: `apps/server/src/auth/gate.test.ts`

**Interfaces:**
- Produces: `verifyAccessToken(token): Promise<VerifiedIdentity>`와 `authorize(identity, capability): AuthDecision`; `VerifiedIdentity={authSub,isAnonymous,emailVerified}`.

- [ ] **Step 1: RED verifier 테스트 작성** — rotated JWKS fixture 성공, expired/bad signature/bad issuer/bad audience/unknown `kid` 실패, 30초 초과 skew 실패를 고정한다.
- [ ] **Step 2: RED gate table 작성** — guest/invalid 401, anonymous 403, unverified `/v1/me`만 허용, bootstrap failure 503, ready 허용을 table test로 만든다.
- [ ] **Step 3: RED 확인** — `corepack pnpm --filter @spot-learn/server test`; 모듈 부재로 FAIL이어야 한다.
- [ ] **Step 4: 최소 구현** — remote JWKS verifier 한 개를 주입 가능하게 만들고 algorithm/issuer/audience/expiry를 라이브러리에 위임한다. email 검증은 JWT payload 추측이 아니라 주입된 trusted user lookup 결과로 채운다.
- [ ] **Step 5: secret 경계 검사 추가** — verifier가 `SUPABASE_SECRET_KEY`를 읽지 않고 REST/Socket adapter가 동일 instance를 소비하는 import-boundary test를 추가한다.
- [ ] **Step 6: GREEN/회귀/커밋** — focused test와 `corepack pnpm check` 후 `git commit -m "feat(server): verify Supabase access tokens"`.

### Task 3: 원자적 account bootstrap과 권위 `/v1/me`

**Files:**
- Create: `supabase/migrations/202607190003_auth_account_lifecycle.sql`
- Modify: `supabase/tests/database/rls.test.sql`
- Modify: `supabase/tests/database/economy.test.sql`
- Modify: `tests/database/concurrency.test.ts`
- Create: `apps/server/src/account/ensure-account.ts`
- Test: `apps/server/src/account/ensure-account.test.ts`

**Interfaces:**
- Produces: `private.ensure_account_v1(uuid)` exact `app_server` RPC와 `ensureAccount(authSub)`; 결과 `{apiSubjectKey,economySubjectKey,nickname,points}`.

- [ ] **Step 1: RED DB 테스트 작성** — profile+economy subject 동시 생성, `Player-XXXXXXXX`, provider metadata 미복사, 20-way concurrent replay, auth UUID가 response/receipt에 없음, 한쪽만 있는 legacy 상태 복구를 검증한다.
- [ ] **Step 2: RED 확인** — `supabase db reset --local && supabase test db --local && corepack pnpm test:db:concurrency`; 함수 부재로 FAIL이어야 한다.
- [ ] **Step 3: 최소 migration 구현** — `security definer`, owner `game_security_owner`, `search_path=pg_catalog`, UUID input 검증, transaction 내 upsert/unique replay, app_server exact execute grant를 사용한다. `private.api_subjects`가 기존 migration에 없으면 이 migration에서 random key와 unique `user_id`를 만든다.
- [ ] **Step 4: 권위 drift 제거** — authenticated의 `profiles.level/exp/gacha_points` SELECT와 nickname UPDATE grant를 철회하고 safe columns SELECT만 다시 grant한다. `/v1/me` adapter는 economy subject points만 읽는다.
- [ ] **Step 5: pgTAP allow-list 갱신** — 허용 함수를 느슨한 패턴으로 바꾸지 말고 새 exact signature 한 개만 추가한다.
- [ ] **Step 6: GREEN/회귀/커밋** — `corepack pnpm check:db`와 server focused test 후 `git commit -m "feat(auth): bootstrap authoritative accounts"`.

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
- [ ] **Step 2: RED 테스트 작성** — env 누락 fail closed, singleton, AsyncStorage persistence, `detectSessionInUrl:false`, process lock, foreground refresh, logout cache purge를 fake adapter로 검증한다.
- [ ] **Step 3: RED 확인** — `corepack pnpm vitest run apps/mobile/src/auth/client.test.ts apps/mobile/src/auth/session.test.ts`; FAIL이어야 한다.
- [ ] **Step 4: 의존성과 최소 구현** — Expo install로 `@supabase/supabase-js`, AsyncStorage, `expo-web-browser`, `expo-linking`을 pin하고 SDK를 `src/auth` 밖에서 import하지 못하게 boundary test를 추가한다.
- [ ] **Step 5: GREEN/회귀/커밋** — focused test, `corepack pnpm typecheck`, `corepack pnpm check` 후 `git commit -m "feat(mobile): add persistent Supabase session"`.

### Task 5: Email과 Google/Kakao PKCE UI

**Files:**
- Create: `apps/mobile/src/auth/email.ts`
- Create: `apps/mobile/src/auth/oauth.ts`
- Create: `apps/mobile/app/auth/index.tsx`
- Create: `apps/mobile/app/auth/callback.tsx`
- Test: `apps/mobile/src/auth/email.test.ts`
- Test: `apps/mobile/src/auth/oauth.test.ts`
- Modify: `supabase/config.toml`
- Modify: `tests/contracts/supabase-config.test.ts`

**Interfaces:**
- Produces: `signUpEmail`, `signInEmail`, `resendVerification`, `requestPasswordReset`, `startOAuth(provider)`, `completeOAuth(url)`.

- [x] **Step 1: RED callback 테스트** — exact scheme/path, stored state, one-shot completion fence, code-only exchange를 허용하고 fragment token, replay, mismatch, provider error를 거절한다. (`53d183c`)
- [ ] **Step 2: RED email 테스트** — unverified 상태, generalized resend/reset response, verified 뒤 bootstrap 호출, `ACCOUNT_SETUP_FAILED` 보존을 검증한다.
- [x] **Step 3: local config RED** — config test가 exact callback과 `enable_manual_linking=true`를 요구하도록 만들고 FAIL을 확인한다.
- [x] **Step 4: 최소 구현** — WebBrowser auth session을 열고 반환 code만 `exchangeCodeForSession`에 넘긴다. callback URL/token/email 전체를 로그하지 않는다. (`53d183c`, `6ff65d1`)
- [ ] **Step 5: config와 Inbucket 연결** — `additional_redirect_urls=["spotlearn://auth/callback"]`을 설정하고 로컬 email test 절차를 operations 문서에 기록한다.
- [ ] **Step 6: GREEN/회귀/커밋** — focused tests와 `corepack pnpm check` 후 `git commit -m "feat(mobile): add PKCE and email authentication"`.

### Task 6: Production-safe guest pack과 진행 병합

**Files:**
- Create: `apps/mobile/src/guest-content/registry.ts`
- Create: `apps/mobile/src/guest-content/progress.ts`
- Modify: `apps/mobile/app/index.tsx`
- Modify: `apps/mobile/src/learning-demo/production-boundary.test.ts`
- Create: `supabase/migrations/202607190004_learning_progress.sql`
- Create: `apps/server/src/learning/merge-progress.ts`
- Test: `apps/server/src/learning/merge-progress.test.ts`
- Test: `supabase/tests/database/learning-progress.test.sql`

**Interfaces:**
- Produces: public sample registry와 `mergeLearningProgress(identity, idempotencyKey, body)`.

- [ ] **Step 1: RED boundary 테스트** — production graph에 DEV registry/private solution이 없고 공개 sample manifest만 포함되는지 검사한다.
- [ ] **Step 2: RED merge 테스트** — published revision만 수용, extra/economy fields 전체 요청 거절, per-subject event replay, changed-body conflict, partial accepted/rejected 응답을 고정한다.
- [ ] **Step 3: 최소 DB/server 구현** — auth UUID 대신 api subject FK와 `(subject_key,device_event_id)` unique receipt를 사용하고 권위 보상 함수를 호출하지 않는다.
- [ ] **Step 4: 모바일 pending lifecycle** — receipt 전 pending 유지, accepted만 제거, rejected 이유 보존, login 후 explicit merge를 구현한다.
- [ ] **Step 5: GREEN/회귀/커밋** — focused tests, `corepack pnpm check`, `corepack pnpm check:db` 후 `git commit -m "feat(learning): merge safe guest progress"`.

### Task 7: Identity 관리, nickname, 계정 삭제

**Files:**
- Create: `apps/mobile/src/auth/linking.ts`
- Create: `apps/server/src/account/update-profile.ts`
- Create: `apps/server/src/account/delete-account.ts`
- Test: `apps/mobile/src/auth/linking.test.ts`
- Test: `apps/server/src/account/delete-account.test.ts`
- Modify: `packages/contracts/openapi.yaml`
- Modify: `supabase/tests/database/economy.test.sql`

**Interfaces:**
- Produces: explicit reauth/link/unlink facade, `PATCH /v1/me`, `DELETE /v1/me` job entrypoint.

- [ ] **Step 1: RED identity 테스트** — Supabase automatic same-email linking을 앱 데이터 merge로 오해하지 않으며, manual link는 recent reauth, unlink는 검증된 identities 2개 이상을 요구한다.
- [ ] **Step 2: RED nickname 테스트** — 1~40자, normalized text, rate limit, 금칙어와 provider metadata 미사용을 검증한다.
- [ ] **Step 3: RED deletion 테스트** — admission 차단→queue cancel→개인 진행/profile 삭제→Auth Admin delete→economy mapping null 순서와 retry idempotency를 검증한다.
- [ ] **Step 4: 최소 구현** — secret key 호출 모듈의 method allow-list를 `deleteUser`/global sign-out으로 고정하고 다른 admin method 접근 test를 실패시킨다.
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
- [ ] **Step 4: 전체 검증** — `corepack pnpm verify`; expected PASS. `rg -n "access_token|refresh_token|service_role|SUPABASE_SECRET_KEY" apps/mobile docs/operations` 결과에 실제 secret 값이 없어야 한다.
- [ ] **Step 5: 읽기 전용 최종 리뷰** — 고정 diff를 별도 reviewer에게 주고 JWT 경계, auth UUID 유출, guest bundle, deletion retry를 검토받아 Important 이상을 모두 닫는다.
- [ ] **Step 6: 커밋** — `git add 06_CLIENT_ARCHITECTURE.md 09_API_AND_SOCKET_EVENTS.md docs config tests/integration && git commit -m "docs(auth): bind integration evidence and handoff"`.

## 완료 판정

- 코드 완료: `corepack pnpm verify`와 읽기 전용 diff review가 통과하고 실제 secret/token/UUID 유출이 0건이다.
- 로컬 통합 완료: Supabase reset 뒤 email confirm→bootstrap→`/v1/me`→merge→delete가 재현된다.
- production 준비 완료: 코드 완료만으로 승격하지 않는다. Google/Kakao credential, retention/legal, Apple 정책 판단, 실제 Android/iOS golden이 모두 승인되어야 한다.
