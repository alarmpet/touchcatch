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
