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
| approved five-pack published to production DB and pinned to a casual season | **BLOCKED_REPOSITORY** | not waiting on infrastructure. `tools/content/publish-learning-season.ts` now performs this step and is proven end to end locally, but three repository defects block the production run — see [Casual season publication](#casual-season-publication) below |
| exact Node 24.18.0 / pnpm 11.13.0 clean-checkout verify | BLOCKED_EXTERNAL | run in matching provisioned environment; do not weaken runtime gate |
| Next production build and mobile client bundle | BLOCKED_EXTERNAL | signed reproducible build artifacts |
| production DB, backup, PITR and restore | BLOCKED_EXTERNAL | operator drill and approval |
| CDN/storage credentials and rights/legal approval | BLOCKED_EXTERNAL | credentialed environment plus owner/legal decision |
| physical iOS/Android goldens and accessibility | BLOCKED_EXTERNAL | actual devices and approved capture set |
| catalog learning content rights and education approval (working catalog is 79 DRAFT / publishBlocked entries; not a nine-pack) | BLOCKED_EXTERNAL | authorized human review using `content/learning/review-checklist.md`; local visual-delta PASS is not publication approval |
| development gameplay | LOCAL_CONTRACT_ONLY | development-only instructions are in `content/learning/PLAY.md`; production mode remains fail-closed because local bundles contain private solutions |
| Sentry/PostHog delivery, redaction and deletion | BLOCKED_EXTERNAL | production-like provider evidence. Note the app currently ships no telemetry SDK at all, and `tests/contracts/data-safety-claims.test.ts` fails if one is added without updating the Data safety declaration |
| account-deletion disposition approval | CLOSED 2026-08-27 | `docs/legal/data-disposition.v1.json` is `APPROVED` (commit `f41efc8`). The worker will now dispose once deployed |
| privacy worker deployment | BLOCKED_EXTERNAL | needs its own database login in `privacy_worker` and its own service-role key (`apps/server/.env.privacy-worker.example`). It must not share the API's credentials, and no environment to deploy it to exists yet |
| target-region 200-match/400-socket 30-minute soak | BLOCKED_EXTERNAL | server vertical slice and load environment |

Deterministic repository evidence is `LOCAL_CONTRACT_ONLY`, never production capacity or telemetry evidence.

## Casual season publication

Measured 2026-08-27 against a local Supabase stack with the full migration set, by running
`tools/content/publish-learning-season.ts` and then driving an attempt through the database
functions directly. Everything below is a repository defect, not an infrastructure wait.

### The game itself works

Proven for the first time, on `en-clay-bakery`:

| step | result |
| --- | --- |
| `publish_content_revision_v1` × 5 | 5 revisions `PUBLISHED` |
| season pinned with the API's own ruleset/hint/competition/catalog hashes | accepted |
| `start_learning_attempt_v1` | `OPEN` |
| `attest_learning_assets_ready_owned_v1` | clock started |
| `record_learning_tap_v1` × 10 | `HIT` ×10, `wrongTaps: 0`, `differenceCount: 10` |
| tap on a fabricated objective id | `OBJECTIVE_NOT_FOUND` |
| `commit_learning_attempt_owned_v1` | `COMPLETED_VERIFIED`, score 69 |

Score 69 is `7×6 + 3×9`, the value RULE-030 approves for a board of ten. The board clears,
which is exactly what the pre-rework packs could not do. Re-verified after the board-size
change on boards of 5 and 16 differences.

### 1. No production path to a pinned season

`private.weekly_seasons.pet_catalog_revision` is a foreign key into
`private.pet_catalog_revisions`. The only function that writes that table is
`private.publish_economy_bundle_v1`, which opens with

```sql
-- This publisher is deliberately test-only until a product approval workflow exists.
if economy->>'approvalDecisionId'<>'TEST-DECISION' ... raise 'APPROVED_TEST_FIXTURE_REQUIRED'
```

So **no casual season can be created in production at all** — not for want of a tool, but
because the schema's only route to a row it requires refuses non-fixture input. A production
catalog publisher has to exist, or casual seasons have to stop depending on a pet catalog
revision. Closing this is a schema change, and it blocks play on any deployed environment.

### 2. Board size — resolved 2026-08-27

Boards used to be fixed at ten differences (7 NORMAL + 3 HARD), which no artwork in the
repository actually supplies: only 41 of 136 packs derive ten or more, and loosening the
derivation thresholds finds texture noise rather than more differences. A board now carries
as many differences as its picture holds, between `content.minDifferences` and
`content.maxDifferences`, with HARD taken as `round(count × 3 ÷ 10)`.

Measured across every pack with artwork, not just the 79 in the manifest:

| differences | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| packs | 8 | 18 | 19 | 19 | 24 | 11 | 11 | 8 | 2 | 6 | 2 | 1 |

**79 packs are publishable today** — every pack that has curated word hunts and a complete
final challenge. Fifteen more need only word-hunt coordinates; 35 need a final challenge too.
Hint reveal already scales: `unitsPerFind` is `ceil(openableUnits ÷ differenceCount)` under
the approved `SCALE_TO_COVER` rule, so a ten-letter answer on a five-difference board opens
two letters per find and still finishes.

Verified on a migration-only database with boards of 5, 6, 9, 14 and 16 differences: the
tier split Postgres computed matched TypeScript at every size (2, 2, 3, 4, 5), and both
extremes played to `COMPLETED_VERIFIED`.

The bundles in `content/learning/approvals/` are still not publishable as written — their
`privateSolution` omits `privateSolutionHash`, which the database requires as a key — but
their difference counts are no longer the reason.

### 3. Config pairs that cannot validate together

- `config/economy.v1.json` names `catalogRevision: "catalog-v1"`; `config/pet-catalog.v1.json`
  is on `catalog-v2-pet-admission-draft`. `publish_economy_bundle_v1` requires the pair to
  agree, so the two DRAFT files can never be published as a bundle as written.
- Most drafts omit `category` from `publicContent` and carry it only on the manifest entry,
  which the database rejects as `PUBLIC_CONTENT_SHAPE_INVALID`.
- 59 of the 138 drafts are absent from `content/learning/manifest.v1.json`, 55 of them with
  artwork on disk. They are invisible to hitbox derivation, the preview registry and every
  content gate.
