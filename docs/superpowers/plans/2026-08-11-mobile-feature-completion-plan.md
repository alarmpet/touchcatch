# Mobile Learning, Pet, Ranking, and Game Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the Android-verified demo into a staged mobile product without leaking private answer data, with a public home, server-judged answer modes, fail-closed pets/ranking, and verifiable local Android evidence.

**Architecture:** Keep private learning snapshots in preview-only code and expose only public catalog projections to product routes. Reuse the existing contract answer normalizer and server/game-engine submit intents; the client renders server results rather than deciding production correctness. Split navigation, game-session state, rewards, and ranking into independent modules with explicit readiness states (`PREVIEW_UX`, `SERVER_SLICE_CASUAL`, `REWARD_READY`, `RANKED_READY`).

**Tech Stack:** Expo 57, React Native 0.86, Expo Router 57, TypeScript, existing contracts/content registry, Vitest, Android emulator/ADB.

**Remaining production work:** The four open auth/DB/policy/live-device items are decomposed into executable tasks in `docs/superpowers/plans/2026-08-11-production-pet-ranking-runtime-completion-plan.md`.

## Global Constraints

- Do not expose `canonicalAnswer`, private solution hashes, or authoritative reward/ranking mutation logic in production client bundles.
- Product routes under `apps/mobile/app/**` must not import `learning-demo/registry`, private solution fields, or source/draft content; preview-only routes may use them.
- Preserve the existing content admission rules: only entries with `hintAdmissionStatus: ADMITTED`, a valid 64-hex hash, and a five-step ladder may be ranked.
- Korean strings must remain UTF-8 and must be validated in generated registry output.
- Every feature must have a deterministic unit test and an Android smoke path.
- The Android build must continue to work from a short D-drive path because the original worktree hits Windows path-length limits.
- Production rewards remain zero/fail-closed while reward policy is `DRAFT`; local demo rewards must be visibly marked as preview-only.
- Ranking uses `BEST_COMPLETED_VERIFIED`; weekly ranked categories are limited to the approved policy (currently English and proverb; idiom/GK remain disabled until policy approval).

---

### Task 1: Establish real mobile navigation and home screen

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app/index.tsx`
- Create: `apps/mobile/src/home/HomeScreen.tsx`
- Create: `apps/mobile/src/home/home-model.ts`
- Test: `apps/mobile/src/home/home-model.test.ts`

**Interfaces:**
- `HomeScreen` consumes a public `PublicHomeModel`, not `LearningDemoEntry[]`.
- `PublicHomeModel` contains card id, label, route, availability state, and optional reason (`SERVER_UNAVAILABLE`, `POLICY_DRAFT`, `CONTENT_NOT_ADMITTED`, `CATEGORY_DISABLED_FOR_RANKED`).
- `home-model.ts` exports `buildHomeCards()` returning typed cards for Spot Difference, Word/Spelling, Idiom/Proverb, Pets, and Ranking.

- [x] Write tests proving all five cards exist, disabled cards show an explicit reason, and navigation targets are stable route names.
- [x] Add Expo Router routes for `/`, `/game/spot-difference`, `/game/answer`, `/pets`, and `/ranking`; keep private demo routes outside the product route graph.
- [x] Replace the current direct demo boot with the public home screen; pass only public catalog projections to product cards.
- [x] Run mobile typecheck and the home model test under the pinned Node/pnpm runtime.

### Task 2: Extract a reusable answer-mode engine

**Files:**
- Create: `apps/mobile/src/features/answer-modes/answer-mode.ts`
- Create: `apps/mobile/src/features/answer-modes/answer-controller.ts`
- Modify: `apps/mobile/src/learning-demo/controller.ts`
- Test: `apps/mobile/src/features/answer-modes/answer-controller.test.ts`

**Interfaces:**
- `AnswerInputSurface = 'MULTIPLE_CHOICE' | 'FREE_TEXT' | 'PATTERN_ASSISTED'`.
- Learning category remains `ENGLISH | PROVERB | IDIOM | GENERAL_KNOWLEDGE`; category and input surface are separate fields.
- `AnswerAttempt = { mode, rawAnswer, normalizedAnswer, isCorrect, penaltyUnits }`.
- `reduceAnswerState(state, action)` must support `SUBMIT`, `REVEAL_HINT`, `RESET`.

- [x] Add failing tests for whitespace/case normalization, Korean spacing normalization, spelling errors, initial-pattern answers, and ranked penalty accounting.
- [x] Reuse `packages/contracts/src/answer-normalization.ts` (`normalizeFinalAnswer`) rather than creating a second normalizer.
- [x] Keep `isCorrect` calculation in preview fixtures/tests only; the integrated registry route is guarded by `__DEV__`, while the production battle surface submits the existing server/game-engine intent and renders its public result.
- [x] Add `TextInput` and submit UI for spelling and free-answer idiom/proverb modes.
- [x] Render the actual admitted hint text or fallback spelling/initial pattern when a hint is revealed; decrement the remaining count exactly once per reveal.
- [x] Verify incorrect and correct submissions through unit tests and Android UI smoke tests.

### Task 3: Complete content coverage and encoding validation

**Files:**
- Modify: `tools/content/generate-registry.js`
- Modify: `content/learning/manifest.v1.json`
- Modify: `apps/mobile/src/learning-demo/registry.ts` (generated output only)
- Create: `tools/content/check-utf8-registry.js`
- Test: `apps/mobile/src/learning-demo/registry.test.ts`

- [x] Add explicit manifest entries for spelling, initial-pattern, proverb, and idiom modes with mode metadata.
- [x] Generate registry output using UTF-8 and assert Korean titles/prompts are not mojibake.
- [x] Add tests requiring the currently approved admitted ranked fixtures: English and proverb; do not require idiom/GK until weekly policy enables them.
- [x] Add a check that every selected entry has mode-compatible prompt, options/input policy, hints, and answer metadata.
- [x] Run registry generation and all content validation tests.

### Task 4: Implement pet rewards and daily claim flow

**Files:**
- Modify: `apps/mobile/src/features/pets/DailyFreeDraw.tsx`
- Modify: `apps/mobile/src/features/pets/PetCollection.tsx`
- Modify: `apps/mobile/src/features/pets/ChampionStars.tsx`
- Create: `apps/mobile/src/features/pets/pet-reward-controller.ts`
- Create: `apps/mobile/src/features/pets/pet-api.ts`
- Modify: `apps/mobile/src/learning-demo/LearningDemoScreen.tsx` (preview-only wiring; no product reward writes)
- Test: `apps/mobile/src/features/pets/pet-reward-controller.test.ts`

- [x] Define typed preview events and deterministic local transitions for `LOCAL_DEMO_ONLY` UI tests.
- [x] Keep typed production claim/promote calls in `pet-api.ts`; send no client subject ID and require canonical UUIDv4 idempotency keys for mutations.
- [ ] Back the mobile calls with an HTTP runtime that invokes the existing server pure logic using an authenticated subject and the DB effect-once transaction. Keep this blocked until an `APPROVED` reward policy exists.
- [x] Show zero rewards and disabled claim controls while policy is `DRAFT`; only enable server claims after `APPROVED` policy evidence exists.
- [x] Render pet collection, rarity, owned copies, champion stars, and empty/error states on `/pets`.
- [x] Test concurrent duplicate daily claims, replay, insufficient duplicate copies, material boundaries, and authenticated-subject rejection in server pure logic.
- [ ] Test collection/claim/promotion persistence restoration through the live auth + DB runtime; the repository does not currently have that executable production transport.

### Task 5: Implement ranking with production-safe boundaries

**Files:**
- Create: `apps/mobile/src/features/ranking/ranking-model.ts`
- Create: `apps/mobile/src/features/ranking/RankingScreen.tsx`
- Create: `apps/mobile/src/features/ranking/ranking-client.ts`
- Modify: `apps/mobile/src/learning-demo/production-boundary.test.ts`
- Test: `apps/mobile/src/features/ranking/ranking-model.test.ts`

- [x] Define `RankingRow`, `RankingPeriod`, and `RankingEligibility` contracts.
- [x] Filter out non-admitted content and scores containing unverified hint penalties.
- [x] Add loading, empty, stale, network-error, and privacy-safe nickname states.
- [x] Add `ranking-client.ts` with an ENGLISH/PROVERB allow-list, exact public-response field validation, and no local score submission path.
- [ ] Reuse `WeeklyCategoryBoard`/learning-competition policy in the live server transport and expose only public leaderboard rows; allow clearly marked fixtures only in preview.
- [x] Enforce `BEST_COMPLETED_VERIFIED` and the weekly category allow-list; do not rank local client scores.
- [x] Test tie ordering, pagination, stale responses, and ineligible content exclusion.

### Task 6: Android end-to-end acceptance matrix

**Files:**
- Create: `apps/mobile/e2e/android-feature-matrix.md`
- Create: `tools/mobile/run-android-smoke.ps1`
- Modify: `docs/reviews/2026-08-10-feature-readiness-audit-and-improvement-plan-review.md`

- [x] Build/install the Android app using D-drive build/evidence paths, verify Expo native-module autolinking, and cold-launch the generated native app. The tested native identifier was `com.spotlearnbattle`, while `app.json` declares `com.touchcatch.mobile`; resolving this release-identity drift remains mandatory. Do not add `@expo/ui`: the app does not import it, and the reviewed plan explicitly rejected an unused direct dependency.
- [x] Install with ADB and launch the home route.
- [x] Verify home cards, spot-difference taps, spelling input, initials hint, proverb/idiom answers, the DRAFT pet-claim gate, and the disabled ranking state on Android.
- [ ] Verify an enabled pet claim and live ranking rows after the reward/weekly policies and server transports are approved and available.
- [x] Capture logcat and fail the smoke script on `FATAL EXCEPTION`, `Cannot find native module`, `Unable to resolve module`, or React Native/Expo runtime errors.
- [x] Record pass/fail evidence as local Android evidence, separate from CI/release evidence, and update the acceptance record with only verified claims.

### Task 7: Release gates and documentation

**Files:**
- Modify: `docs/reviews/2026-08-10-feature-readiness-audit-and-improvement-plan-review.md`
- Create: `docs/reviews/2026-08-11-mobile-feature-acceptance-report.md`
- Modify: `README.md`

- [x] Require typecheck, content validation, unit tests, web smoke, Android smoke, and boundary tests before readiness is marked complete.
- [x] Document emulator setup, D-drive build path, Metro startup, ADB install, and known production-vs-demo boundaries.
- [x] Publish an acceptance report containing screenshots/log evidence and unresolved risks.

## Execution evidence — 2026-08-11

- Mobile TypeScript check: PASS.
- Focused mobile verification: 22 test files, 76 tests passed.
- Repository-wide non-DB gate: PASS (`pnpm check`), including 121 test files and 1,185 tests.
- Final Android export: 1,404 modules, 185 assets, 2.8 MB Hermes bytecode at `D:\tcbuild\expo-export-integrated-final`.
- Home → integrated picture game → ten differences → direct answer → completion: PASS on `com.touchcatch.mobile/.MainActivity`.
- English spelling hint and Korean proverb initial hint: PASS on the emulator.
- Game → home navigation, pets, ranking, and profile route smoke: PASS.
- Latest fail-closed pet/ranking device evidence: `D:\tcbuild\android-smoke\20260811-152004-pets` and `D:\tcbuild\android-smoke\20260811-152004-ranking`.
- Draft pet policy gate: daily claim reports `enabled=false`; no reward is issued.
- Runtime error filter: empty for React Native, Android runtime, Expo, native-module, and route resolution fatal errors.
- Repeatable local smoke: `tools/mobile/run-android-smoke.ps1`.
- Latest cold-launch smoke: `D:\tcbuild\android-smoke\20260811-172156` (cold start, focused activity, rendered JS UI, fatal log filter empty).
- Detailed matrix: `apps/mobile/e2e/android-feature-matrix.md`.
- Acceptance report: `docs/reviews/2026-08-11-mobile-feature-acceptance-report.md`.

### Deliberately still open

- Task 3 is complete: the official manifest assessment and 79-entry registry regeneration pass, mode metadata is explicit, and the UTF-8 gate verifies 26 Korean registry values. All entries remain `publishBlocked: true`; technical hint admission is not a production publication approval.
- The typed pet collection/claim/promotion client boundary exists, and pet/ranking state UIs are implemented. Runtime authentication/DB integration and the production leaderboard transport remain unwired while their policies are `DRAFT`.
- The composite Android matrix item covering every proverb/idiom variant and an enabled server pet claim remains open; the current reward/ranking policies intentionally fail closed.
- The schema-byte drift, stale mobile CI contract, API mutation fixture, traceability race, and seven content-geometry violations were repaired. The challenge targets were reselected against the actual images and the builder now rejects word-hunt/sudden-death circles that overlap normal differences. After official manifest reassessment and registry regeneration, the fresh repository-wide non-DB run passes all 1,185 tests across 121 files.

## Self-review

- Main screen, pets, ranking, free-answer modes, hints, content coverage, encoding, Android execution, and release gates each have a dedicated task.
- Product/private data boundaries, server judging, reward policy, and ranking policy are explicit; the demo is not treated as production authority.
- No task relies on “implement later” or unspecified behavior; interfaces and test expectations are stated.
- The plan intentionally separates the current demo from production server-authoritative rewards and rankings.
- The primary learning flow is a single session (`/game/spot-difference`): spot-difference completion advances to hint-assisted answer input and result; `/game/answer` remains a compatibility/deep-link surface rather than a separate product concept.
