# Physical-Device Guest Game Design

**Date:** 2026-07-29  
**Status:** APPROVED  
**Scope decision:** Deliver an offline guest single-player loop on a physical
phone before Supabase login, matchmaking, or online battle integration.

## 1. Goal

A developer can install and open the TouchCatch mobile app on a physical
Android phone, select a bundled learning pack, find all ten differences on
Image A or Image B, answer the meaning quiz, reach completion, and replay or
select another pack without a network connection.

The same scenario must subsequently pass on a physical iPhone. Android is the
first mandatory device gate because it is available to the current workflow;
iOS is a separate follow-up gate and must never be inferred from Android,
Metro, web, simulator, or automated test results.

## 2. Non-goals

- Supabase, Google, Kakao, or email authentication
- Matchmaking, friend rooms, sockets, or two-player battle
- Production content publication or CDN upload
- Economy, pets, rewards, analytics, or crash-reporting integration
- Treating local play as production release approval
- Moving private hitboxes to a public production bundle
- Making all 79 current generated packs playable in the first device gate

## 3. Verified Current State

The main branch contains a complete development-only reducer loop and local
Image A/B assets. The focused learning-demo suite passes 11 tests, but mobile
TypeScript currently fails for independently verified reasons:

- `_layout.tsx` imports `SafeAreaProvider`, but the currently resolved
  `react-native-safe-area-context` declaration does not export it.
- `tools/content/generate-registry.js` emits a registry that imports a missing
  `./types` module and uses a category vocabulary different from
  `LearningDemoEntry`.
- generated `PROVERB` and `IDIOM` values do not match the generator's declared
  category union.
- battle UI fixtures have drifted from the current `MatchSnapshotV1`.
- `packages/contracts/src/socket.schema.ts` contains `unknown` refinement
  errors that are visible through the mobile TypeScript project.
- Korean UI strings in `LearningDemoScreen.tsx` are mojibake.

The `codex/supabase-auth-integration` worktree contains authentication work and
a nine-pack registry, but its root route currently renders guest samples rather
than the playable game. Merging that branch is not a prerequisite for this
milestone.

## 4. Architecture

### 4.1 Runtime boundary

The first milestone remains a compile-time development route:

```text
apps/mobile/app/index.tsx
  -> playable catalog loader
  -> LearningDemoScreen
  -> pure learning-demo controller
  -> bundled draft JSON + local PNG assets
```

`index.tsx` must not statically import the private playable registry. It loads
the registry only after the `__DEV__` guard. A production bundle must fail
closed before importing any private solution.

### 4.2 Playable catalog boundary

The 79-entry authoring catalog is not automatically a playable catalog. A
deterministic generator reads the learning manifest and an explicit allow-list
of device-demo pack keys. It emits only entries that have:

- one draft bundle;
- Image A and Image B local PNG assets;
- exactly ten difference objectives;
- seven `NORMAL` and three `HARD` objectives;
- valid normalized hitboxes for both images;
- one meaning question with selectable answers and a valid correct option.

The first allow-list contains three known learning packs:

```text
en-resilience
en-dilemma
en-sustainability
```

Adding a fourth pack requires passing the same generator and device scenario;
directory presence alone is not sufficient.

### 4.3 Mobile UI boundary

The guest application contains four explicit states:

```text
CATALOG -> FIND -> QUIZ -> COMPLETE
```

- `CATALOG`: choose one of the allowed packs.
- `FIND`: render both images, progress `0/10` through `10/10`, and show claimed
  circles without revealing unclaimed answers.
- `QUIZ`: accept multiple-choice meaning answers and retain the screen after a
  wrong answer.
- `COMPLETE`: offer `다시 하기` and `다른 문제 선택`.

The reducer remains pure. Screen measurement, image loading, and application
lifecycle state stay outside it.

### 4.4 Coordinate boundary

Hitboxes use normalized source-image coordinates. `resizeMode="contain"` can
letterbox an image, so raw board width and height must not be used directly.
The screen computes the actual contained image rectangle and converts a touch
into normalized coordinates only when it falls inside that rectangle.

```ts
type Size = Readonly<{ width: number; height: number }>;
type Point = Readonly<{ x: number; y: number }>;
type ContainedRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

function containRect(viewport: Size, source: Size): ContainedRect;
function normalizeTouch(point: Point, rect: ContainedRect): Point | null;
```

Touches in letterbox padding return `null`. Zero or non-finite dimensions
cannot generate a game action.

### 4.5 Asset lifecycle boundary

Each board reports `LOADING`, `READY`, or `FAILED`.

- Both images must be `READY` before taps are accepted.
- A failed image displays a Korean error message and a retry action.
- Background/foreground transitions preserve current progress.
- Selecting another lesson or choosing replay intentionally resets progress.

No network fallback is used for this milestone.

## 5. Runtime and Tooling Contract

- Repository runtime: Node `24.18.0`
- Package manager: pnpm `11.13.0`
- Mobile stack: Expo `57.0.1`, Expo Router `57.0.7`, React Native `0.86.0`
- The supported acceptance runtime is an Expo development build whose native
  dependencies match the repository.
- Expo Go may be used only when its installed SDK is compatible; an Expo Go
  version error is not an application failure and is not device evidence.
- Commands must be run from `D:\touchcatch`; running `--dir apps/mobile` from
  `C:\Users\petbl` is invalid.
- The plan must use repository-local or Corepack-pinned commands and may not
  install a different global pnpm to bypass version checks.

## 6. Error Handling

| Condition | Required behavior |
|---|---|
| playable catalog empty | render a blocking Korean diagnostic, never crash |
| invalid pack selected | return to catalog with an error code |
| image still loading | disable both boards |
| image load failed | show retry and keep the selected pack |
| layout/source dimension zero | ignore touch and record no claim |
| touch in contain padding | ignore touch |
| duplicate correct touch | do not increment progress |
| wrong quiz answer | remain in `QUIZ` and increment visible retry feedback |
| app background/foreground | preserve selected pack and progress |
| production build attempts private registry load | fail before the import |

## 7. Validation Strategy

### 7.1 Automated gates

The implementation is internally ready only when all of these pass:

```powershell
node tools/check-runtime.mjs
corepack pnpm content:generate-playable-registry
corepack pnpm content:generate-playable-registry:check
corepack pnpm vitest run apps/mobile/src/learning-demo apps/mobile/app
corepack pnpm typecheck:mobile
corepack pnpm mobile:bundle:android
corepack pnpm docs:check
git diff --check
```

The mobile typecheck must cover the mobile app and the contracts imported by
it. Unrelated admin or database gates do not block local phone play, but no
failing mobile-imported contract error may be ignored.

### 7.2 Android physical-device gate

Evidence must record:

- exact commit SHA;
- Node, pnpm, Expo, Android, and device model/OS versions;
- development-build application ID;
- cold start log without red screen;
- offline completion of all three allow-listed packs;
- taps on both Image A and Image B;
- at least one miss and one duplicate tap;
- wrong and correct quiz answers;
- replay and different-pack selection;
- background/foreground restoration;
- screenshots of catalog, `10/10`, quiz, and completion;
- timestamped PASS/FAIL for every scenario.

### 7.3 iOS physical-device gate

The same scenario and evidence fields apply. Android PASS leaves iOS
`BLOCKED: DEVICE_UNAVAILABLE` until a physical iPhone run is performed.

## 8. Completion Criteria

The milestone is complete when:

1. the mobile TypeScript gate is green;
2. the deterministic three-pack playable registry is green and drift-free;
3. the automated guest loop and coordinate tests are green;
4. an Android development build installs and completes all physical-device
   scenarios offline;
5. Android evidence is committed with real device metadata and screenshots;
6. iOS is either independently PASS or explicitly BLOCKED without weakening
   the Android/local-play result.

Local play does not require a legal or education approver. Content ownership
and store-distribution review apply only before external publication, not
before a developer runs the bundled demo on their own phone.
