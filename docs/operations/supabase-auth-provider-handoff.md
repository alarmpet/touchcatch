# Supabase Auth provider operations handoff

This handoff records configuration ownership and release evidence. It contains no credential values or callback query strings. Repository-local Auth code and integration evidence does not prove that an external provider console or deployed Supabase project is configured.

## Callback ownership

Provider-console and application redirects are two separate registrations:

1. In the Google provider console, register the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback`; do not register the app callback there.
2. In the Kakao provider console, register the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback`; do not register the app callback there.
3. In the matching Supabase project's redirect allow-list, register the exact app callbacks `spotlearn://auth/callback` and `spotlearn://auth/recovery`; do not use a wildcard or an Expo Go LAN address.

The project reference is selected from the target environment's approved Supabase project inventory. Evidence captures must redact credential fields and URL query strings.

## Environment checklist

| Environment | Configuration procedure | Secret storage location | Owner | Verifier | Evidence path | State |
| --- | --- | --- | --- | --- | --- | --- |
| LOCAL | Run `supabase status`, take the API URL and Mailpit UI/API endpoint from that command, and verify the checked-in exact app callbacks. | Local Supabase CLI process environment; no committed value | application engineer | test reviewer | `tests/integration/local-auth.test.ts` | `LOCAL_AUTH_CODE: PASS`; external provider credentials are not required |
| PREVIEW | Use the preview project reference in both provider consoles, register its Supabase callback, then add both exact app callbacks to the preview Supabase redirect allow-list. | Preview deployment secret manager entries managed outside Git | platform owner | release verifier | `evidence/external/auth/providers/preview/` | `PROVIDER_CREDENTIALS: BLOCKED` pending credential and console evidence |
| PRODUCTION | Use the production project reference in both provider consoles, register its Supabase callback, then add both exact app callbacks to the production Supabase redirect allow-list. | Production deployment secret manager entries managed outside Git | platform owner | release verifier | `evidence/external/auth/providers/production/` | `PROVIDER_CREDENTIALS: BLOCKED` pending credential and console evidence |

`supabase status` is the source for the running local Mailpit UI/API endpoints. Do not copy a legacy mail-capture product name or assume a fixed port from an old document.

## Evidence acceptance

- Provider console and Supabase dashboard evidence is accepted only when the accountable owner supplies redacted screenshots at the environment evidence path and the named verifier checks the exact callback entries. Until then, `PROVIDER_CREDENTIALS: BLOCKED` remains unchanged.
- The repository-local signup, confirmation, PKCE, JWT, privacy, and cleanup tests support `LOCAL_AUTH_CODE: PASS` only. They do not promote preview or production provider evidence to PASS.
- Evidence must not contain tokens, client credential values, service keys, or raw callback query strings.

## Platform release scope

When Google or Kakao is offered as a primary account login, the iOS release verifier checks the equivalent-login conditions in Apple App Review Guideline 4.8 before release and records that decision under the production evidence path. With no review evidence, `iOS release: BLOCKED`.

This iOS policy gate is platform-specific: `Android release: not blocked by the iOS policy gate`, and `guest game play: not blocked by the iOS policy gate`. Their own independent release gates still apply.

## Native development-build golden handoff

The checked-in manifest at `docs/testing/reports/auth-device-goldens.v1.json` is the native authentication evidence contract, not evidence that a run occurred. Android and iOS remain `BLOCKED` until a human runner completes the following steps on an actual development build. A web run, source review, or Expo Go run cannot promote a native scenario to `PASS`.

1. Obtain the preview build and provider access through the approved out-of-repository secret manager. Never paste credentials into the manifest, terminal transcript, screenshots, or issue text.
2. Record the immutable application build hash and the exact OS/device description before testing. Use an Android record only for Android evidence and an iOS record only for iOS evidence.
3. Exercise, in manifest order, email confirmation, one configured Google or Kakao provider, a callback received after a cold start, a callback received while the app is live, restart/recovery, logout, and account deletion.
4. For callback evidence, retain only the callback mode and outcome. Remove the entire query and fragment before capturing or transcribing a URL. Never retain authorization codes or credential/session material.
5. Have a named human reviewer compare the evidence to the exact build, device, and scenario list. Only then replace the applicable scenario and platform `BLOCKED` values with reviewed results and real UTC capture metadata.
6. Keep each unmet dependency as its non-secret blocker code: `PROVIDER_CREDENTIALS_PREVIEW`, `ANDROID_DEVELOPMENT_BUILD_DEVICE_GOLDEN`, `IOS_DEVELOPMENT_BUILD_DEVICE_GOLDEN`, or `IOS_GUIDELINE_4_8_REVIEW`.

An Expo Go version mismatch is infrastructure evidence only. It must not be classified as an application defect unless the same behavior is reproduced in a development build. The iOS Guideline 4.8 review remains iOS-only and cannot block Android or guest game play.

Each promoted scenario points to its exact in-repository JSON evidence file and records that file's SHA-256 digest. The contract verifies file existence, the safe platform/scenario path, the digest, and exact build/device/provider/callback/capture/reviewer binding. A filename or screenshot reference alone is not PASS evidence. Platform results are independent: one platform may be `PASS` while the other remains `BLOCKED`, in which case the manifest is `PARTIAL` and retains only the unresolved platform blocker codes.

A platform PASS also requires an Ed25519 detached signature over canonical platform metadata and all seven exact evidence paths and hashes. Trusted reviewer public keys and ownership metadata live in `config/auth-device-reviewer-keys.v1.json`; that registry is intentionally empty, so `NO_TRUSTED_REVIEWER_KEYS` remains an unresolved platform and root blocker. ACTIVE requires separate Security and Operations approval receipts, signed by distinct approvers and bound to the exact reviewer-registry hash. No repository-controlled governance approval keys or real receipts exist yet, so joint-control approval remains an external release blocker and PASS is impossible. Private keys never enter the repository. Evidence files must be regular, non-symlink files whose real paths remain inside the repository.
