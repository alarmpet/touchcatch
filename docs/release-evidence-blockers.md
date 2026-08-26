# Release evidence and blockers

Code gates are separate from deployment evidence. A local PASS must never be promoted to production readiness.

The Play-specific ordering, including which of these have a calendar cost, is in
[`docs/runbooks/google-play-release.md`](runbooks/google-play-release.md).

| Evidence | Status | Required closure |
|---|---|---|
| Google Play Console developer account | BLOCKED_EXTERNAL | account does not exist as of 2026-08-26; $25 registration plus identity verification. Nothing downstream can be uploaded until it does |
| closed testing 12 testers × 14 consecutive days | BLOCKED_EXTERNAL | required before production access for individual accounts created after 2023-11-13. Internal testing does not count toward it. This is the schedule floor, not a checklist item |
| Android upload keystore | BLOCKED_EXTERNAL | generated and held by a human outside this repository; `*.jks` is gitignored and the release build fails closed without the four signing env vars |
| Play App Signing SHA-256 fingerprint | BLOCKED_EXTERNAL | issued by Play after the first upload. Until then `.well-known/assetlinks.json` is not generated and the OAuth callback stays on the `touchcatch://` custom scheme |
| operator identity, contact, retention and child-directed decision | BLOCKED_EXTERNAL | human decisions recorded in `docs/legal/operator-identity.v1.json`; `pnpm portal:publishable` lists what is still `UNRESOLVED`. An agent must not guess these |
| public privacy-policy and data-deletion URLs | BLOCKED_EXTERNAL | pages exist in `apps/account-portal`; the deployment origin does not. Play requires both to be reachable without installing or signing in |
| production Supabase project and API host | BLOCKED_EXTERNAL | no cloud project is linked (`supabase/.temp/project-ref` absent) and `apps/mobile/.env` points at the emulator loopback. An installed build reaches no server |
| approved five-pack published to production DB and pinned to a casual season | BLOCKED_EXTERNAL | without it the app installs but learning fails closed |
| exact Node 24.18.0 / pnpm 11.13.0 clean-checkout verify | BLOCKED_EXTERNAL | run in matching provisioned environment; do not weaken runtime gate |
| Next production build and mobile client bundle | BLOCKED_EXTERNAL | signed reproducible build artifacts |
| production DB, backup, PITR and restore | BLOCKED_EXTERNAL | operator drill and approval |
| CDN/storage credentials and rights/legal approval | BLOCKED_EXTERNAL | credentialed environment plus owner/legal decision |
| physical iOS/Android goldens and accessibility | BLOCKED_EXTERNAL | actual devices and approved capture set |
| catalog learning content rights and education approval (working catalog is 79 DRAFT / publishBlocked entries; not a nine-pack) | BLOCKED_EXTERNAL | authorized human review using `content/learning/review-checklist.md`; local visual-delta PASS is not publication approval |
| development gameplay | LOCAL_CONTRACT_ONLY | development-only instructions are in `content/learning/PLAY.md`; production mode remains fail-closed because local bundles contain private solutions |
| Sentry/PostHog delivery, redaction and deletion | BLOCKED_EXTERNAL | production-like provider evidence. Note the app currently ships no telemetry SDK at all, and `tests/contracts/data-safety-claims.test.ts` fails if one is added without updating the Data safety declaration |
| account-deletion disposition approval | BLOCKED_EXTERNAL | `docs/legal/data-disposition.v1.json` is `PROPOSED`. The worker exists and refuses to dispose of anything until a named person approves it, so today a request still blocks access and removes nothing. Approving it is a human decision about 24 DELETE, 9 REDACT and 2 RETAIN tables |
| privacy worker deployment | BLOCKED_EXTERNAL | needs its own database login in `privacy_worker` and its own service-role key (`apps/server/.env.privacy-worker.example`). It must not share the API's credentials, and no environment to deploy it to exists yet |
| target-region 200-match/400-socket 30-minute soak | BLOCKED_EXTERNAL | server vertical slice and load environment |

Deterministic repository evidence is `LOCAL_CONTRACT_ONLY`, never production capacity or telemetry evidence.
