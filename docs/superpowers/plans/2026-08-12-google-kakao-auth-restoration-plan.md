# Google and Kakao Authentication Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the previously designed Google and Kakao Supabase PKCE login flow on the current mobile runtime without reintroducing the obsolete parallel auth stack.

**Architecture:** Extend the existing narrow Supabase auth port with OAuth authorization and code-exchange operations. A standalone coordinator owns the exact `spotlearn://auth/callback` boundary, pending transaction state, browser result handling, replay protection, and account bootstrap through an authenticated public API request. The profile route invokes the coordinator through the current `MobileRuntimeProvider`; provider credentials remain external Supabase configuration.

**Tech Stack:** Expo 57, React Native 0.86, Expo Router 57, Supabase JS 2.112, `expo-web-browser`, Expo SQLite localStorage, TypeScript, Vitest, Android development build.

## Global Constraints

- Providers are the exact union `google | kakao`.
- Native callback is exactly `spotlearn://auth/callback`; fragments and extra query parameters are rejected.
- Only an authorization code is passed to `exchangeCodeForSession`; tokens, verifier, email, and full callback URLs are never logged.
- A pending transaction has one authorization start and one callback owner at a time; an exact WebBrowser/Router duplicate receives the cached terminal result, while competing starts or callbacks are rejected.
- OAuth controls render only after the session is confirmed signed out, and the coordinator rejects an existing or unexpectedly changed session to keep login separate from account linking.
- The mobile client never contains Google/Kakao client secrets or a Supabase secret/service-role key.
- OAuth account bootstrap must use an authenticated public endpoint and must never accept a client-supplied subject identifier.
- The existing session controller remains the single public session projection.
- Actual provider golden tests remain blocked until Google/Kakao consoles and Supabase provider credentials are configured.

---

### Task 1: Restore the PKCE coordinator and callback contract

**Files:**
- Create: `apps/mobile/src/auth/oauth-coordinator.ts`
- Test: `apps/mobile/src/auth/oauth-coordinator.test.ts`
- Modify: `apps/mobile/src/auth/session-controller.ts`
- Modify: `apps/mobile/src/auth/supabase-client.ts`

**Interfaces:**
- Consumes: `SupabaseAuthPort.signInWithOAuth`, `exchangeCodeForSession`, `getSessionIdentity`; browser `openAuthSessionAsync`; Web Storage-compatible persistence.
- Produces: `createOAuthCoordinator(...).startOAuth(provider)` and `.completeOAuth(url)` returning `READY | ACCOUNT_SETUP_FAILED`.

- [x] **Step 1: Write failing tests** for exact provider input, exact callback, code-only exchange, fragments/extra params/provider errors, cancellation, replay, and concurrent callback deduplication.
- [x] **Step 2: Run focused tests and verify RED** because `oauth-coordinator.ts` does not exist and the auth port lacks OAuth methods.
- [x] **Step 3: Implement the minimal coordinator** with pending transaction storage key `touchcatch.auth.pkce.pending`, callback parser, one-shot completion fence, and generic stable errors.
- [x] **Step 4: Extend the Supabase adapter narrowly** without exposing the raw client or refresh token.
- [x] **Step 5: Run focused tests and mobile typecheck; commit** with `feat(mobile): restore Google and Kakao PKCE boundary` (`53d183c`).

### Task 2: Connect OAuth to the current runtime and profile UX

**Files:**
- Modify: `apps/mobile/src/runtime/mobile-runtime.tsx`
- Modify: `apps/mobile/app/profile.tsx`
- Create: `apps/mobile/app/auth/callback.tsx`
- Test: `apps/mobile/src/auth/profile-social-login.test.tsx`
- Test: `apps/mobile/src/auth/oauth-callback-route.test.tsx`
- Test: `apps/mobile/src/auth/production-boundary.test.ts`

**Interfaces:**
- Consumes: Task 1 coordinator and current session controller.
- Produces: `runtime.oauth.startOAuth('google' | 'kakao')`, Google/Kakao profile buttons, and callback route completion.

- [x] **Step 1: Write failing render and boundary tests** requiring both provider buttons, no secrets/raw client, and a callback route that consumes only coordinator results.
- [x] **Step 2: Run focused tests and verify RED** because runtime/UI/callback wiring is absent.
- [x] **Step 3: Add pinned Expo browser dependency** using the existing workspace package manager; use installed Expo Router linking for the callback route.
- [x] **Step 4: Implement runtime wiring and UX** with cancellation-safe messages and no sensitive error details.
- [x] **Step 5: Run focused tests, mobile contracts, typecheck, and ESLint; commit** with `feat(mobile): expose social login on profile` (`6ff65d1`).

### Task 3: Implement the authenticated account-bootstrap endpoint

**Files:**
- Create: `apps/server/src/http/me-handler.ts`
- Test: `apps/server/src/http/me-handler.test.ts`
- Modify: `apps/server/src/http/pet-handlers.ts`
- Modify: `apps/server/src/http/router.ts`
- Modify: `apps/server/src/runtime.ts`

**Interfaces:**
- Consumes: the shared Bearer verifier and existing `SubjectResolver.ensureAndResolve(authenticatedUserId)`.
- Produces: `GET /v1/me` returning only `{ accountReady: true }`; it accepts no query/body/subject fields.

- [x] **Step 1: Write failing handler/router tests** for verified JWT bootstrap, missing/invalid authorization, query rejection, and absence of private IDs in the response.
- [x] **Step 2: Run focused tests and verify RED** because the OpenAPI operation has no runtime route.
- [x] **Step 3: Implement the minimal handler and wire it into the router/runtime** using the existing resolver; do not return profile/provider/subject fields.
- [x] **Step 4: Run server tests, typecheck, and OpenAPI lint; commit** with `feat(server): expose authenticated account bootstrap` (`ab33b52`).

### Task 4: Align local callback configuration and Android evidence

**Files:**
- Modify: `supabase/config.toml`
- Create: `tests/contracts/mobile-oauth-config.test.ts`
- Modify: `tools/mobile/start-metro-local.ps1`
- Modify: `docs/superpowers/plans/2026-07-19-supabase-auth-integration-plan.md`
- Modify: `docs/reviews/2026-08-11-mobile-feature-acceptance-report.md`

**Interfaces:**
- Consumes: exact callback contract and Android development build.
- Produces: local redirect allow-list, manual-linking gate, automated callback evidence, and truthful provider-golden blocker.

- [x] **Step 1: Write a failing config contract** requiring exact `spotlearn://auth/callback` and `enable_manual_linking = true`.
- [x] **Step 2: Run the config test and verify RED** against the current empty redirect list.
- [x] **Step 3: Update local Supabase config** without adding provider secrets or falsely enabling unconfigured Google/Kakao providers.
- [x] **Step 4: Rebuild or refresh Metro, open the profile on Android, verify both buttons and fail-closed provider behavior, and capture D-drive evidence.** APK/package/intent, rendered profile, provider-disabled 400s, generic app failures, and clean logcat were captured under `D:\tcbuild\android-oauth-runtime`.
- [x] **Step 5: Run the full non-DB suite, mobile/server typechecks, OpenAPI/docs/secret/ESLint gates, and `git diff --check`; update docs and commit** with `docs(auth): record social login restoration evidence`. Verified 153 files/1,326 tests, 37 mobile files/128 tests, mobile/server/root typechecks, Expo dependency compatibility, focused ESLint, OpenAPI, docs, secret scan, Android rebuild/reinstall, and final emulator smoke.

## External Acceptance Gate

- Google console OAuth client and consent screen approval.
- Kakao Login/OIDC activation, REST API key, and client secret.
- Supabase provider configuration containing those credentials and the Supabase callback URL.
- Android and iOS development-build golden using real accounts and the exact native callback.
- iOS Sign in with Apple policy decision before release.
