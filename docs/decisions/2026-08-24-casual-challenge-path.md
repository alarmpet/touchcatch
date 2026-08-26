# Casual challenge path (Android closed beta)

**Status:** Product-owner content admission signed; DB publish/season seed still a deployment step  
**Date:** 2026-08-24  
**Does not approve:** learning drafts, rights, education review, pet economy, or a public store listing.

## What the runtime can do today

Attempts policy is enabled for the Android casual-beta approval (`weekly-competition` + `hint-policy`). The HTTP router serves `GET /v1/learning/challenges` and `POST /v1/learning/attempts`. Pets and ranking rewards stay fail-closed.

## What still blocks a real playable season

| Gate | Current fact | Why an agent must not fake it |
| --- | --- | --- |
| Published revision | Five ENGLISH ADMIT packs have signed product-owner pack files under `content/learning/approvals/`. Manifest git rows stay `publishBlocked`. | `learning_content_eligible_v1` still needs a `PUBLISHED` row. `publish_casual_learning_revision_v1` is the deployment-role path. Do not insert PUBLISHED rows from a workstation without that role. |
| Season pins | `create_casual_season_v1` pins 5 ENGLISH revisions. Ranked `create_weekly_season_v1` still wants 5+5. | There are only 4 PROVERB ADMIT packs. Do not invent a fifth proverb or flip HOLD geo packs into the ranked board. |
| Selected pet | `start_learning_attempt_v1` no longer raises `SELECTED_PET_REQUIRED`. Pet columns are nullable. | WP-0 still hides pet rewards. Do not mint pets or flip economy DRAFT. |

Local `prepare-local-authenticated-fixture.ts` seeds `PUBLISHED` rows with `localFixture: true` behind `LOCAL_ACCEPTANCE_CONFIRMATION`. That path is not a production season.

## Candidate pool

`content/learning/inventory.v1.json` classifies every draft and source pair.

- **ADMIT** (10) — `en-resilience`, `en-architecture-studio`, `en-3d-serenity`, `en-3d-creativity`, `en-3d-harmony`, `ko-proverb-dark-under-lamp`, `ko-proverb-seeing-is-believing`, `ko-proverb-kind-words-return`, `ko-proverb-cow-barn`, `ko-idiom-turn-misfortune`. Usable derived hitboxes and admitted hint ladders. Still not published.
- **HOLD** — the other 69 manifest packs (hint ladder `MISSING`) plus orphans (new geo packs, extra drafts). Out of release input.
- **REJECT** — none yet. Do not delete HOLD originals.

Even if a human approved all 10 ADMIT packs, `create_weekly_season_v1` would still fail: it wants 5 ENGLISH + 5 PROVERB and there are only 4 PROVERB candidates. Casual beta should pin one approved pack, not a ranked 5+5 board. That SQL change waits for the first real signature.

Product owner signed the five ENGLISH ADMIT packs on 2026-08-24 (`docs/approvals/learning-content-v1-approval.json`). `202608240001_casual_learning_season.sql` lets attempts start without a selected pet and creates an English-only 5-pin casual season. Publishing those packs into `game_content_revisions` is still a deployment-role step against a live database; this repository does not insert PUBLISHED rows from the agent.
