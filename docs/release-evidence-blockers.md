# Release evidence and blockers

Code gates are separate from deployment evidence. A local PASS must never be promoted to production readiness.

| Evidence | Status | Required closure |
|---|---|---|
| exact Node 24.18.0 / pnpm 11.13.0 clean-checkout verify | BLOCKED_EXTERNAL | run in matching provisioned environment; do not weaken runtime gate |
| Next production build and mobile client bundle | BLOCKED_EXTERNAL | signed reproducible build artifacts |
| production DB, backup, PITR and restore | BLOCKED_EXTERNAL | operator drill and approval |
| CDN/storage credentials and rights/legal approval | BLOCKED_EXTERNAL | credentialed environment plus owner/legal decision |
| physical iOS/Android goldens and accessibility | BLOCKED_EXTERNAL | actual devices and approved capture set |
| Sentry/PostHog delivery, redaction and deletion | BLOCKED_EXTERNAL | production-like provider evidence |
| target-region 200-match/400-socket 30-minute soak | BLOCKED_EXTERNAL | server vertical slice and load environment |

Deterministic repository evidence is `LOCAL_CONTRACT_ONLY`, never production capacity or telemetry evidence.
