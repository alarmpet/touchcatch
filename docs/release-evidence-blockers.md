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
| approved five-pack published to production DB and pinned to a casual season | **BLOCKED_REPOSITORY** | not waiting on infrastructure. `tools/content/publish-learning-season.ts` now performs this step and is proven end to end locally, two of the three repository defects that blocked it are now fixed — see [Casual season publication](#casual-season-publication) below |
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

### 1. Production path to a pinned season — resolved 2026-08-27

`private.weekly_seasons.pet_catalog_revision` was a NOT NULL foreign key into
`private.pet_catalog_revisions`, and the only function that writes that table is
`private.publish_economy_bundle_v1`, which opens with

```sql
-- This publisher is deliberately test-only until a product approval workflow exists.
if economy->>'approvalDecisionId'<>'TEST-DECISION' ... raise 'APPROVED_TEST_FIXTURE_REQUIRED'
```

So no casual season could be created outside a test fixture, on any environment — a
migration-only database failed at the foreign key.

`202608270001_casual_season_without_pet_catalog.sql` finishes on the season side what
`202608240001` started on the attempt side: a casual season may pin no pet catalog, and
`start_learning_attempt_v1` compares the pin only when the season carries one. A season that
does pin a catalog is checked exactly as strictly as before, so a ranked season keeps the
guarantee that an attempt cannot start against a catalog the API did not agree to.

Verified on a migration-only database: a season created through
`private.create_casual_season_v1` with a null catalog, then a 16-difference board played to
`COMPLETED_VERIFIED` with the attempt's pet columns recorded as null. `pnpm check:db` passes,
including `casual-learning-season.test.sql`.

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

**77 packs are publishable today** — every pack with curated word hunts, a complete final
challenge and artwork the derivation admits. Two more would qualify but carry a baked guide
grid (below). Fifteen need only word-hunt coordinates; 35 need a final challenge too.
Hint reveal already scales: `unitsPerFind` is `ceil(openableUnits ÷ differenceCount)` under
the approved `SCALE_TO_COVER` rule, so a ten-letter answer on a five-difference board opens
two letters per find and still finishes.

Verified on a migration-only database with boards of 5, 6, 9, 14 and 16 differences: the
tier split Postgres computed matched TypeScript at every size (2, 2, 3, 4, 5), and both
extremes played to `COMPLETED_VERIFIED`.

The bundles in `content/learning/approvals/` are still not publishable as written — their
`privateSolution` omits `privateSolutionHash`, which the database requires as a key — but
their difference counts are no longer the reason.

### 3. Two packs ship a baked composition grid, and the detector could not see it

`tools/content/check-art-grid.js` probed only the rule-of-thirds lines and required all four
to be covered. `en-phonics-apple` carries a 5×5 guide grid at columns 205/410/614/819; the
thirds it sampled — x=341 and x=683 — came back at 14% and 3% coverage, so the gate reported
the file clean while the grid is plainly visible in the picture. `en-papercut-lighthouse`
carries a 4×4 grid and was missed the same way.

Both grids are in image A and absent from image B, so every line reads as a difference a
player can see and can never claim — the exact failure the check exists to prevent.

The detector now scans every column and row and calls a grid only when at least two of each
direction run the full span, which scenery does not produce and an overlay always does. A
single full-span line stays legal: a horizon, a table edge, and the synthwave scan lines in
`en-neon-synthwave-drive` are all real art.

`derive-hitboxes.js` now rejects a grid pack on that same evidence, as `BAKED_GUIDE_GRID`
alongside `TOO_FEW_DIFFERENCES`. That is deliberately not a hold-out list: the previous
hard-coded exclusion set sat empty while the comment above it still named a pack, and nothing
caught the disagreement. Everything downstream reads the derivation's verdict, so the preview
registry, the word-hunt checker and `publish-learning-season.ts` all exclude the pack without
being told separately.

Replacing the artwork remains the fix. Until it lands the two packs are not served, and the
catalog ships 77 rather than 79.

Measured across all 136 packs with artwork: 15 have at least one full-span line, 8 have the
two-directional signature, and 2 of those are registered and were otherwise shippable.

### 4. Config pairs that cannot validate together

- `config/economy.v1.json` names `catalogRevision: "catalog-v1"`; `config/pet-catalog.v1.json`
  is on `catalog-v2-pet-admission-draft`. `publish_economy_bundle_v1` requires the pair to
  agree, so the two DRAFT files can never be published as a bundle as written.
- Most drafts omit `category` from `publicContent` and carry it only on the manifest entry,
  which the database rejects as `PUBLIC_CONTENT_SHAPE_INVALID`.
- 59 of the 138 drafts are absent from `content/learning/manifest.v1.json`, 55 of them with
  artwork on disk. They are invisible to hitbox derivation, the preview registry and every
  content gate.
