# Working-tree disposition (2026-08-24)

**Rule:** do not reset, checkout, or delete these changes. This file only says what a later release candidate may include.

Launch scope is Android closed casual beta: [`docs/decisions/2026-08-20-launch-scope.md`](../decisions/2026-08-20-launch-scope.md). Pet economy and extra packs are not that beta’s input until they are approved.

## (1) Candidate for M1 (server-authoritative casual Android) — still not production evidence

These help the *development* preview or the future production session wiring. They do not approve content.

- `content/learning/derived-hitboxes.v1.json`
- `content/learning/word-hunts.curated.v1.json`
- `apps/mobile/src/learning-demo/preview-registry.generated.ts` and the production-boundary tests that pin 79 derived packs
- `apps/mobile/src/features/learning/attempt-client.ts`, `ranked-session-controller.ts` (exist; not used by the production route yet)
- Art-pipeline / gate alignment from the 2026-08-24 plan (wrapper, `check:db` guard, agent docs)

## (2) Keep, but keep off the first Android RC

Pet presentation and new packs make the local demo richer. The shipped Android beta must hide pet/ranking rewards until policies are APPROVED, and new drafts stay `publishBlocked`.

- Pet FX/UI: `PetDrawCeremony`, `PetPromotionFX`, `PetRarityAura`, `PetCollection`, `PetReveal`, `DailyFreeDraw`, `InGameFXOverlay`, `GlassCard`, related tests
- Home/TabBar/design-token additions that exist only to showcase pets or vivid chrome
- New learning drafts/sources not in the 79-entry catalog/manifest: `geo-*`, `en-lowpoly-village`, `en-papercut-garden`, `ko-idiom-daegi-manseong`, and any unmatched `content/pets/mobile/*.png`
- Admin `next-env.d.ts` noise unless it is required for `admin:check`

## (3) Hold — evidence or generated drift, not a feature

- `content/learning/drafts` / `source` replacements for packs that are already in the 79 catalog: treat as art PRs with hash + derive + preview + word-hunt, not as silent draft edits
- `apps/admin/next-env.d.ts` if it is tool output
- Anything that would flip `config/*.v1.json` from `DRAFT` to `APPROVED`

## How to use this list

When cutting a clean release-candidate commit (08-20 WP-0), take basket (1) only after review. Cherry-pick or later-branch basket (2). Never `git clean` basket (2) away.
