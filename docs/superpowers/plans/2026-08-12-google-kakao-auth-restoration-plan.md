# Google and Kakao Authentication Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the previously designed Google and Kakao Supabase PKCE login flow on the current mobile runtime without reintroducing the obsolete parallel auth stack.

**Architecture:** Extend the existing narrow Supabase auth port with OAuth authorization and code-exchange operations. A standalone coordinator owns the exact `spotlearn://auth/callback` boundary, pending transaction state, browser result handling, replay protection, and account bootstrap through an authenticated public API request. The profile route invokes the coordinator through the current `MobileRuntimeProvider`; provider credentials remain external Supabase configuration.

**Tech Stack:** Expo 57, React Native 0.86, Expo Router 57, Supabase JS 2.112, `expo-web-browser`, Expo SQLite localStorage, TypeScript, Vitest, Android development build.

## Global Constraints

- Providers are the exact union `google | kakao`.
- Native callback is exactly `spotlearn://auth/callback`; fragments and extra query parameters are rejected.
- Only an authorization code is passed to `exchangeCodeForSession`; tokens, verifier, email, and full callback URLs are never logged.
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

- [ ] **Step 1: Write failing tests** for exact provider input, exact callback, code-only exchange, fragments/extra params/provider errors, cancellation, replay, and concurrent callback deduplication.
- [ ] **Step 2: Run focused tests and verify RED** because `oauth-coordinator.ts` does not exist and the auth port lacks OAuth methods.
- [ ] **Step 3: Implement the minimal coordinator** with pending transaction storage key `touchcatch.auth.pkce.pending`, callback parser, one-shot completion fence, and generic stable errors.
- [ ] **Step 4: Extend the Supabase adapter narrowly** without exposing the raw client or refresh token.
- [ ] **Step 5: Run focused tests and mobile typecheck; commit** with `feat(mobile): restore Google and Kakao PKCE boundary`.

### Task 2: Connect OAuth to the current runtime and profile UX

**Files:**
- Modify: `apps/mobile/src/runtime/mobile-runtime.tsx`
- Modify: `apps/mobile/app/profile.tsx`
- Create: `apps/mobile/app/auth/callback.tsx`
- Test: `apps/mobile/app/profile.test.tsx`
- Test: `apps/mobile/src/auth/production-boundary.test.ts`

**Interfaces:**
- Consumes: Task 1 coordinator and current session controller.
- Produces: `runtime.oauth.startOAuth('google' | 'kakao')`, Google/Kakao profile buttons, and callback route completion.

- [ ] **Step 1: Write failing render and boundary tests** requiring both provider buttons, no secrets/raw client, and a callback route that consumes only coordinator results.
- [ ] **Step 2: Run focused tests and verify RED** because runtime/UI/callback wiring is absent.
- [ ] **Step 3: Add pinned Expo browser dependency** using the existing workspace package manager; use installed Expo Router linking for the callback route.
- [ ] **Step 4: Implement runtime wiring and UX** with cancellation-safe messages and no sensitive error details.
- [ ] **Step 5: Run focused tests, mobile contracts, typecheck, and ESLint; commit** with `feat(mobile): expose social login on profile`.

### Task 3: Align local callback configuration and Android evidence

**Files:**
- Modify: `supabase/config.toml`
- Create: `tests/contracts/mobile-oauth-config.test.ts`
- Modify: `docs/superpowers/plans/2026-07-19-supabase-auth-integration-plan.md`
- Modify: `docs/reviews/2026-08-11-mobile-feature-acceptance-report.md`

**Interfaces:**
- Consumes: exact callback contract and Android development build.
- Produces: local redirect allow-list, manual-linking gate, automated callback evidence, and truthful provider-golden blocker.

- [ ] **Step 1: Write a failing config contract** requiring exact `spotlearn://auth/callback` and `enable_manual_linking = true`.
- [ ] **Step 2: Run the config test and verify RED** against the current empty redirect list.
- [ ] **Step 3: Update local Supabase config** without adding provider secrets or falsely enabling unconfigured Google/Kakao providers.
- [ ] **Step 4: Rebuild or refresh Metro, open the profile on Android, verify both buttons and fail-closed provider behavior, and capture D-drive evidence.**
- [ ] **Step 5: Run the full non-DB suite, mobile/server typechecks, OpenAPI/docs/secret/ESLint gates, and `git diff --check`; update docs and commit** with `docs(auth): record social login restoration evidence`.

## External Acceptance Gate

- Google console OAuth client and consent screen approval.
- Kakao Login/OIDC activation, REST API key, and client secret.
- Supabase provider configuration containing those credentials and the Supabase callback URL.
- Android and iOS development-build golden using real accounts and the exact native callback.
- iOS Sign in with Apple policy decision before release.
