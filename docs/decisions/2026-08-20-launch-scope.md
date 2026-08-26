# Launch scope decision

**Status:** DECIDED  
**Date:** 2026-08-24  
**Product decision:** repository owner, this session — Android first. Remaining open questions resolved by the engineering recommendations in `docs/superpowers/plans/2026-08-24-production-readiness-gap-and-agent-workflow-improvement-plan.md`.  
**Does not replace:** legal, rights, privacy, or named-operator approvals. Those remain vacant until a human fills `docs/operations/release-evidence-owners.md`.

This file is the WP-0 scope record required by `docs/superpowers/plans/2026-08-20-production-service-readiness-master-plan.md` §3.

## Decision

Ship **Android closed beta** first. The first user-facing slice is a **server-authoritative casual learning session**. Realtime PvP, ranking rewards, pet economy, and iOS are **later independent gates**, not part of the first binary.

| Axis | Decision | Why |
| --- | --- | --- |
| Platform | Android only | Native signing, OAuth callback, and device evidence exist only as local Android partials. iOS has no native/signing/VoiceOver evidence. |
| Distribution | Closed / private beta, not a public Play listing | Content, economy, rights, and legal inputs are still DRAFT. A public store page that promises PvP or rewards would promote those features to P0 immediately. |
| Language / region | Korean client copy; KR cohort first | Product UI and learning packs are Korean-first. Do not claim other store locales until legal/privacy text exists for them. |
| Application id | `com.touchcatch.mobile` | `apps/mobile/app.json` and current Gradle `applicationId`. The 2026-08-12 e2e note `com.spotlearnbattle` is stale and must not be copied into signing evidence. |
| Game | Logged-in casual session: `POST /v1/learning/attempts` → assets-ready → tap → complete | Production `__DEV__` “준비 중” screen is not allowed once this beta includes play. Preview-registry play is development-only. |
| Realtime PvP | **Out of scope** | No Socket.IO/Redis/BullMQ runtime. OpenAPI queue/friend-room paths stay non-public or must be removed from the shipped contract (08-20 WP-3). |
| Pets / ranking rewards | **Hidden in the shipped Android UI** until economy, daily-pet-loop, weekly-competition, pet-runtime-art, and rights evidence are actually APPROVED | Fail-closed DISABLED is correct. Do not flip DRAFT → APPROVED for screenshots. Temporary READY fixtures stay `__DEV__` / test-only. |
| iOS | **Not in this launch** | No TestFlight, signing, Apple login policy, or VoiceOver evidence. App Store copy must not claim iOS. |

## Explicitly not promised

- Matchmaking, friend rooms, gacha, fusion, pet showcase URLs
- Weekly ranking rewards or public leaderboard as a store feature
- Daily pet draw as a live economy
- 200-match / 400-socket soak (that number is a PvP gate, not this beta)
- Account deletion / privacy policy / terms until WP-9 is closed — **beta cannot go to external testers** until those exist even for a closed cohort
- Production Sentry/PostHog until a delivery adapter and redaction proof exist

## Operating targets (beta, not a public SLO)

These are planning bounds so later evidence has something to miss. They are not approved capacity numbers.

| Item | Bound |
| --- | --- |
| Cohort | Invite-only; tens of testers, not a public install base |
| Concurrent learning attempts | Start at **50** authenticated HTTP attempts. Raise only with staging evidence. |
| Support window | Best-effort KR weekdays. No 24/7 on-call claim until WP-8 runbook and a named owner exist. |
| Acceptable user-visible failure | Testers may see named policy-disabled or retryable network errors. They must not see preview answers, draft hitboxes, or a silent empty “준비 중” if play is in scope. |
| RPO / RTO | Not set. Closed beta that stores account or attempt data still needs a restore drill (WP-7) before the first external tester. |
| Abort / kill | Stop rollout if a signed bundle contains private learning markers, if DRAFT policy is enabled by a status-string flip, if auth tokens leak to logs, or if any P0 in the 08-20 go/no-go list is BLOCKED. |

## Follow-on gates (not this file)

| Later gate | Opens when |
| --- | --- |
| Pet economy + ranking rewards | 08-20 WP-6 + approved policy/art/rights |
| Public PvP | 08-20 WP-5 + soak + store copy that is allowed to mention it |
| iOS | Separate WP-0 amendment: Apple login policy, signing, VoiceOver, physical devices |
| Public Play listing | 08-20 WP-11 with P0 BLOCKED = 0 |

## Amendments

### 2026-08-24 — Casual learning policy approval

Product owner instructed: approve and continue. Record: `docs/decisions/2026-08-24-android-casual-learning-approval.json`.

Approved for Android closed-beta **attempts only**:

- `config/weekly-competition.v1.json` (signed `WEEKLY_COMPETITION_V1`)
- `config/hint-policy.v1.json` (approval envelope on the artifact)
- `config/trusted-approval-signers.v1.json` (public key only)

Still DRAFT, not in this approval: economy, daily-pet-loop, pet-runtime-art, pet-rights-evidence, learning-progression. Pet/ranking reward UI stays hidden in production. This is not legal/rights approval and does not authorize a public store listing.

### 2026-08-24 — Casual learning content approval

Product owner instructed: approve and continue. Record: `docs/decisions/2026-08-24-android-casual-content-approval.json`.

Approved for Android closed-beta **playable English packs** (derived hitboxes, product-owner rights/education admission):

- `en-resilience`, `en-architecture-studio`, `en-3d-serenity`, `en-3d-creativity`, `en-3d-harmony`
- Signer `android-casual-content-2026-08-24` added to `config/trusted-approval-signers.v1.json` (public key only; previous weekly-competition key stays ACTIVE)

Still not in this approval: pet economy, pet art/rights, public store, iOS, PvP, third-party license opinions. Manifest entries stay `publishBlocked` in git; publish into `game_content_revisions` is a deployment step that uses the signed pack files.

Change this file with a dated paragraph, not a silent edit. Expanding scope to PvP, pets, or iOS is a new product decision, not an agent default.
