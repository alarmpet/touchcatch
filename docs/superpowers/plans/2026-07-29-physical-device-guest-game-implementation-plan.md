# Physical-Device Guest Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the offline guest spot-the-difference loop installable and
fully playable on a physical Android phone, with independently reportable iOS
status.

**Architecture:** Keep the first device milestone independent of Supabase and
the authentication worktree. A deterministic allow-listed registry projects
three validated local bundles into a development-only route; pure controller
and geometry modules own gameplay and touch conversion, while React Native
components own image lifecycle and screen state. Automated gates establish
internal readiness, and a schema-checked evidence record establishes physical
device completion without substituting Metro, web, emulator, or Android
results for iOS.

**Tech Stack:** Node 24.18.0, pnpm 11.13.0, TypeScript 5.9, Expo 57.0.1,
Expo Router 57.0.7, React Native 0.86.0, Vitest 4, JSON Schema.

## Global Constraints

- Implement from a new `codex/` worktree created from main after preserving
  the user's dirty main files; never execute this plan directly on dirty main.
- Do not merge `codex/supabase-auth-integration` into this milestone.
- Do not require `EXPO_PUBLIC_API_ORIGIN`, Supabase credentials, login, or a
  network connection.
- Keep the private playable registry behind the compile-time `__DEV__` guard.
- Canonical pack gameplay remains exactly ten differences: seven `NORMAL` and
  three `HARD`.
- Initial device allow-list is exactly `en-resilience`, `en-dilemma`, and
  `en-sustainability`.
- Do not mark content review, Android device evidence, or iOS device evidence
  PASS without the corresponding real artifact.
- Android PASS does not imply iOS PASS.
- Node must be exactly `v24.18.0`; pnpm must be exactly `11.13.0`.
- Use an Expo development build for acceptance. Expo Go is optional and is not
  acceptance evidence.
- Local developer play needs no legal or education approval. Store
  distribution and public content publication remain separate work.
- Every implementation task follows RED → GREEN → focused regression →
  read-only task review → commit.

---

### Task 1: Establish the Isolated Mobile Baseline

**Files:**
- Create: `docs/operations/mobile-guest-device-runbook.md`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/package.json`
- Modify: `package.json`
- Test: `apps/mobile/app/layout.test.tsx`

**Interfaces:**
- Consumes: repository runtime contract and Expo Router entry point.
- Produces: `mobile:typecheck`, `mobile:test`, and documented root-relative
  commands used by every later task.

- [ ] **Step 1: Create the isolated worktree**

Run from `D:\touchcatch` after confirming the main worktree status:

```powershell
git status --short
git worktree add D:\touchcatch\.worktrees\physical-device-guest -b codex/physical-device-guest-game main
```

Expected: a clean worktree on `codex/physical-device-guest-game`. Do not copy
untracked logs, generated `.next` output, or the untracked prompt guide into
the new worktree.

- [ ] **Step 2: Write the failing layout/runtime test**

Create `apps/mobile/app/layout.test.tsx`:

```tsx
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('mobile application layout', () => {
  it('uses only native modules present in the pinned mobile dependency graph', async () => {
    const source = await readFile('apps/mobile/app/_layout.tsx', 'utf8');
    expect(source).not.toContain('SafeAreaProvider');
    expect(source).toContain('<Stack');
  });

  it('pins executable mobile commands at the repository root', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    expect(pkg.scripts['mobile:typecheck']).toBe(
      'tsc -p apps/mobile/tsconfig.json --noEmit',
    );
    expect(pkg.scripts['mobile:test']).toBe(
      'vitest run apps/mobile/src/learning-demo apps/mobile/app',
    );
  });
});
```

- [ ] **Step 3: Verify RED**

Run:

```powershell
corepack pnpm vitest run apps/mobile/app/layout.test.tsx
```

Expected: FAIL because `_layout.tsx` still contains `SafeAreaProvider` and the
root mobile scripts do not exist.

- [ ] **Step 4: Implement the minimal layout and scripts**

Replace `apps/mobile/app/_layout.tsx` with:

```tsx
import { Stack } from 'expo-router';

export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

Add these root scripts:

```json
{
  "mobile:typecheck": "tsc -p apps/mobile/tsconfig.json --noEmit",
  "mobile:test": "vitest run apps/mobile/src/learning-demo apps/mobile/app"
}
```

Keep the mobile package commands:

```json
{
  "start": "expo start",
  "android": "expo run:android",
  "ios": "expo run:ios"
}
```

- [ ] **Step 5: Write the root-relative runbook**

`docs/operations/mobile-guest-device-runbook.md` must contain these exact
preflight commands:

```powershell
Set-Location D:\touchcatch\.worktrees\physical-device-guest
node --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm mobile:typecheck
corepack pnpm mobile:test
```

Document that running `corepack pnpm --dir apps/mobile ...` from
`C:\Users\petbl` resolves the wrong path and is unsupported.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run apps/mobile/app/layout.test.tsx
node tools/check-runtime.mjs
git diff --check
```

Expected: test PASS, runtime reports Node 24.18.0/pnpm 11.13.0, and no
whitespace errors.

- [ ] **Step 7: Commit**

```powershell
git add apps/mobile/app/_layout.tsx apps/mobile/app/layout.test.tsx apps/mobile/package.json package.json docs/operations/mobile-guest-device-runbook.md
git commit -m "fix(mobile): establish guest device baseline"
```

---

### Task 2: Close the Mobile TypeScript Contract Drift

**Files:**
- Modify: `packages/contracts/src/socket.schema.ts`
- Modify: `apps/mobile/src/ui/battle-shell.test.ts`
- Modify: `apps/mobile/src/ui/BattleScreen.render.test.tsx`
- Modify: `apps/mobile/tsconfig.json`
- Test: `packages/contracts/src/socket.schema.test.ts`
- Test: `apps/mobile/src/ui/battle-shell.test.ts`
- Test: `apps/mobile/src/ui/BattleScreen.render.test.tsx`

**Interfaces:**
- Consumes: exported `MatchSnapshotV1` and READY asset schema.
- Produces: contract/schema and battle-fixture diagnostics closed; the only
  permitted remaining mobile diagnostics are the generated-registry errors
  closed by Task 3. No gameplay behavior changes.

- [ ] **Step 1: Capture the current TypeScript RED**

Run:

```powershell
corepack pnpm mobile:typecheck
```

Expected: FAIL with the current registry errors, snapshot fixture drift, and
`socket.schema.ts` asset refinement errors. Save the exact output in the task
review report; do not suppress it with `skipLibCheck`.

- [ ] **Step 2: Add a typed READY duplicate regression**

In `packages/contracts/src/socket.schema.test.ts`, add:

```ts
it('rejects duplicate READY asset hashes after typed parsing', () => {
  const result = clientCommandEnvelopeSchema.safeParse({
    ...validReadyEnvelope,
    payload: {
      ...validReadyEnvelope.payload,
      assetHashes: [HASH_A, HASH_A],
    },
  });
  expect(result.success).toBe(false);
});
```

Use the existing valid READY fixture and hash constants from that test file;
do not introduce a second wire shape.

- [ ] **Step 3: Verify the focused RED or compiler failure**

Run:

```powershell
corepack pnpm vitest run packages/contracts/src/socket.schema.test.ts
corepack pnpm mobile:typecheck
```

Expected: the runtime schema test remains meaningful while TypeScript still
fails at the `unknown` refinement and stale mobile fixtures.

- [ ] **Step 4: Fix the schema narrowing**

Extract a typed asset-dimension schema before applying uniqueness refinements:

```ts
const decodedAssetDimensionSchema = z.object({
  assetHash: sha256Schema,
  width: z.number().int().min(1).max(16384),
  height: z.number().int().min(1).max(16384),
}).strict();

const decodedAssetDimensionsSchema = z.array(decodedAssetDimensionSchema)
  .length(2)
  .refine(
    (rows) => new Set(rows.map((row) => row.assetHash)).size === rows.length,
    'assetHash values must be unique',
  );
```

Reuse the repository's existing `sha256Schema` and exact error vocabulary.

- [ ] **Step 5: Update snapshot fixtures to the current required shape**

For each fixture passed to `adaptMatchSnapshot` or `<BattleScreen>`, add the
required field explicitly:

```ts
phaseEndsAtMs: null,
```

Use the phase-appropriate non-null timestamp only where the existing test is
specifically exercising a timed phase. Do not make `phaseEndsAtMs` optional in
the production contract to accommodate a stale test.

- [ ] **Step 6: Restrict the mobile project without hiding imported errors**

Set `apps/mobile/tsconfig.json` to:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "noEmit": true
  },
  "include": [
    "app/**/*.ts",
    "app/**/*.tsx",
    "src/**/*.ts",
    "src/**/*.tsx"
  ]
}
```

Imported workspace sources remain typechecked transitively. Do not exclude
`packages/contracts` or enable `skipLibCheck`.

- [ ] **Step 7: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run packages/contracts/src/socket.schema.test.ts apps/mobile/src/ui/battle-shell.test.ts apps/mobile/src/ui/BattleScreen.render.test.tsx
corepack pnpm mobile:typecheck
```

Expected: all focused tests PASS. The compiler output contains only the missing
`./types` and category errors in generated `learning-demo/registry.ts`; save
that exact output as the RED handoff to Task 3. Any other diagnostic blocks the
commit.

- [ ] **Step 8: Commit**

```powershell
git add packages/contracts/src/socket.schema.ts packages/contracts/src/socket.schema.test.ts apps/mobile/src/ui/battle-shell.test.ts apps/mobile/src/ui/BattleScreen.render.test.tsx apps/mobile/tsconfig.json
git commit -m "fix(mobile): align imported runtime contracts"
```

---

### Task 3: Generate an Exact Three-Pack Playable Registry

**Files:**
- Create: `content/learning/device-demo.v1.json`
- Create: `content/learning/device-demo.schema.json`
- Create: `tools/content/generate-playable-registry.ts`
- Create: `tools/content/generate-playable-registry.test.ts`
- Modify: `apps/mobile/src/learning-demo/data.ts`
- Modify: `apps/mobile/src/learning-demo/registry.ts` through the generator
- Modify: `apps/mobile/src/learning-demo/registry.test.ts`
- Modify: `package.json`
- Delete: `tools/content/generate-registry.js`

**Interfaces:**
- Consumes: `content/learning/manifest.v1.json`, draft bundles, local PNG
  paths, and exact allow-list keys.
- Produces: `learningDemoEntries: readonly LearningDemoEntry[]` and commands
  `content:generate-playable-registry` /
  `content:generate-playable-registry:check`.

- [ ] **Step 1: Write the allow-list**

Create:

```json
{
  "$schema": "./device-demo.schema.json",
  "schemaVersion": "1.0.0",
  "keys": [
    "en-resilience",
    "en-dilemma",
    "en-sustainability"
  ]
}
```

The schema requires exactly three unique kebab-case keys and rejects
additional properties.

- [ ] **Step 2: Write generator RED tests**

`tools/content/generate-playable-registry.test.ts` must assert:

```ts
expect(result.entries.map((entry) => entry.key)).toEqual([
  'en-resilience',
  'en-dilemma',
  'en-sustainability',
]);
expect(result.entries.every((entry) => entry.differenceCount === 10)).toBe(true);
expect(result.entries.every((entry) => entry.normalCount === 7)).toBe(true);
expect(result.entries.every((entry) => entry.hardCount === 3)).toBe(true);
```

Add explicit negative fixtures for:

- allow-listed key missing from manifest;
- missing draft;
- missing Image A;
- duplicate objective ID;
- 6 NORMAL + 4 HARD;
- hitbox coordinate outside `[0,1]`;
- missing correct quiz option;
- generated file drift under `--check`.

- [ ] **Step 3: Verify RED**

Run:

```powershell
corepack pnpm vitest run tools/content/generate-playable-registry.test.ts
```

Expected: FAIL because the TypeScript generator and exact allow-list contract
do not exist.

- [ ] **Step 4: Unify the runtime entry types**

Move the exported entry type to `data.ts`:

```ts
import type { ImageSourcePropType } from 'react-native';

export type LearningCategory = 'ENGLISH' | 'PROVERB' | 'IDIOM';

export type LearningDemoEntry = Readonly<{
  key: string;
  category: LearningCategory;
  title: string;
  imageA: ImageSourcePropType;
  imageB: ImageSourcePropType;
  sourceSize: Readonly<{ width: number; height: number }>;
  differences: readonly {
    id: string;
    tier: 'NORMAL' | 'HARD';
    imageA: Circle;
    imageB: Circle;
  }[];
  prompt: string;
  options: readonly { id: string; label: string }[];
  correctOptionId: string;
}>;
```

`LearningDemoScreen.tsx` imports this type. The generated registry imports
`buildDemoEntry`, `Bundle`, and `LearningDemoEntry` from `./data`; it never
imports a nonexistent `./types`.

- [ ] **Step 5: Implement deterministic validation and rendering**

Export:

```ts
export async function buildPlayableRegistry(
  root: string,
): Promise<Readonly<{
  source: string;
  entries: readonly {
    key: string;
    differenceCount: number;
    normalCount: number;
    hardCount: number;
  }[];
}>>;
```

The emitted category mapping is:

```ts
const categoryMap = {
  ENGLISH: 'ENGLISH',
  PROVERB: 'PROVERB',
  IDIOM: 'IDIOM',
} as const;
```

Reject any other category for this first milestone. Include PNG dimensions
derived from the actual file headers; do not hard-code `1.5`.

- [ ] **Step 6: Add scripts and generate**

Add:

```json
{
  "content:generate-playable-registry": "tsx tools/content/generate-playable-registry.ts",
  "content:generate-playable-registry:check": "tsx tools/content/generate-playable-registry.ts --check"
}
```

Run:

```powershell
corepack pnpm content:generate-playable-registry
corepack pnpm content:generate-playable-registry:check
```

Expected: the first command writes one deterministic three-entry registry and
the second exits 0 without modifying it.

- [ ] **Step 7: Update the registry projection test**

Assert exact allow-list/registry equality and reject private registry imports
above the production guard:

```ts
expect(projectedKeys).toEqual(deviceDemo.keys);
expect(projectedKeys).toHaveLength(3);
expect(new Set(projectedKeys).size).toBe(3);
```

- [ ] **Step 8: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run tools/content/generate-playable-registry.test.ts apps/mobile/src/learning-demo/data.test.ts apps/mobile/src/learning-demo/registry.test.ts apps/mobile/src/learning-demo/production-boundary.test.ts
corepack pnpm content:generate-playable-registry:check
corepack pnpm mobile:typecheck
```

Expected: all tests and the full mobile typecheck PASS.

- [ ] **Step 9: Commit**

```powershell
git add content/learning/device-demo.v1.json content/learning/device-demo.schema.json tools/content/generate-playable-registry.ts tools/content/generate-playable-registry.test.ts apps/mobile/src/learning-demo/data.ts apps/mobile/src/learning-demo/LearningDemoScreen.tsx apps/mobile/src/learning-demo/registry.ts apps/mobile/src/learning-demo/registry.test.ts apps/mobile/src/learning-demo/production-boundary.test.ts package.json
git rm tools/content/generate-registry.js
git commit -m "feat(content): generate device-playable registry"
```

---

### Task 4: Make Contained-Image Touch Coordinates Exact

**Files:**
- Create: `apps/mobile/src/learning-demo/geometry.ts`
- Create: `apps/mobile/src/learning-demo/geometry.test.ts`
- Modify: `apps/mobile/src/learning-demo/LearningDemoScreen.tsx`
- Modify: `apps/mobile/src/learning-demo/LearningDemoScreen.test.tsx`

**Interfaces:**
- Consumes: board viewport size, source PNG size, and React Native
  `locationX/locationY`.
- Produces: `containRect(viewport, source)` and
  `normalizeTouch(point, rect)`.

- [ ] **Step 1: Write geometry RED tests**

```ts
it('computes horizontal letterboxing', () => {
  expect(containRect(
    { width: 360, height: 360 },
    { width: 600, height: 400 },
  )).toEqual({ left: 0, top: 60, width: 360, height: 240 });
});

it('ignores touches in contain padding', () => {
  const rect = { left: 0, top: 60, width: 360, height: 240 };
  expect(normalizeTouch({ x: 180, y: 30 }, rect)).toBeNull();
});

it('normalizes a touch inside the image', () => {
  const rect = { left: 0, top: 60, width: 360, height: 240 };
  expect(normalizeTouch({ x: 180, y: 180 }, rect)).toEqual({ x: .5, y: .5 });
});

it.each([
  [{ width: 0, height: 100 }, { width: 600, height: 400 }],
  [{ width: 100, height: 100 }, { width: 0, height: 400 }],
  [{ width: Number.NaN, height: 100 }, { width: 600, height: 400 }],
])('rejects invalid dimensions', (viewport, source) => {
  expect(() => containRect(viewport, source)).toThrow('INVALID_IMAGE_SIZE');
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm vitest run apps/mobile/src/learning-demo/geometry.test.ts
```

Expected: FAIL because `geometry.ts` does not exist.

- [ ] **Step 3: Implement pure contain geometry**

```ts
export function containRect(viewport: Size, source: Size): ContainedRect {
  for (const value of [
    viewport.width, viewport.height, source.width, source.height,
  ]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('INVALID_IMAGE_SIZE');
    }
  }
  const scale = Math.min(
    viewport.width / source.width,
    viewport.height / source.height,
  );
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    left: (viewport.width - width) / 2,
    top: (viewport.height - height) / 2,
    width,
    height,
  };
}

export function normalizeTouch(
  point: Point,
  rect: ContainedRect,
): Point | null {
  if (
    point.x < rect.left ||
    point.y < rect.top ||
    point.x > rect.left + rect.width ||
    point.y > rect.top + rect.height
  ) return null;
  return {
    x: (point.x - rect.left) / rect.width,
    y: (point.y - rect.top) / rect.height,
  };
}
```

- [ ] **Step 4: Integrate the conversion**

Store each board's viewport, derive the contained rectangle from
`selected.sourceSize`, and dispatch `TAP` only when `normalizeTouch` returns a
point. Claimed-circle overlays must be positioned relative to the contained
image rectangle, not the outer pressable.

- [ ] **Step 5: Add rendered regressions**

Update the component tests to assert:

- a touch in the 60-pixel top padding does not claim;
- a touch at the visual image center claims;
- claimed overlays include the contained rectangle offset;
- zero-size layout does not dispatch;
- both A and B use their own layout measurement.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run apps/mobile/src/learning-demo/geometry.test.ts apps/mobile/src/learning-demo/controller.test.ts apps/mobile/src/learning-demo/LearningDemoScreen.test.tsx
corepack pnpm mobile:typecheck
```

Expected: all tests and typecheck PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/mobile/src/learning-demo/geometry.ts apps/mobile/src/learning-demo/geometry.test.ts apps/mobile/src/learning-demo/LearningDemoScreen.tsx apps/mobile/src/learning-demo/LearningDemoScreen.test.tsx
git commit -m "fix(mobile): align taps with contained images"
```

---

### Task 5: Add Catalog, Asset Lifecycle, and Korean Guest UX

**Files:**
- Create: `apps/mobile/src/learning-demo/GuestGameScreen.tsx`
- Create: `apps/mobile/src/learning-demo/GuestGameScreen.test.tsx`
- Create: `apps/mobile/src/learning-demo/asset-state.ts`
- Create: `apps/mobile/src/learning-demo/asset-state.test.ts`
- Modify: `apps/mobile/app/index.tsx`
- Modify: `apps/mobile/src/learning-demo/LearningDemoScreen.tsx`
- Modify: `apps/mobile/src/learning-demo/LearningDemoScreen.test.tsx`

**Interfaces:**
- Consumes: the three-entry registry and pure demo controller.
- Produces: explicit `CATALOG | PLAYING` application state and per-board
  `LOADING | READY | FAILED` asset state.

- [ ] **Step 1: Write asset-state RED tests**

```ts
expect(createAssetState()).toEqual({ A: 'LOADING', B: 'LOADING' });
expect(reduceAssetState(createAssetState(), {
  type: 'READY', side: 'A',
})).toEqual({ A: 'READY', B: 'LOADING' });
expect(canAcceptBoardTap({
  A: 'READY', B: 'LOADING',
})).toBe(false);
expect(canAcceptBoardTap({
  A: 'READY', B: 'READY',
})).toBe(true);
expect(reduceAssetState({
  A: 'FAILED', B: 'READY',
}, { type: 'RETRY' })).toEqual({ A: 'LOADING', B: 'LOADING' });
```

- [ ] **Step 2: Write guest-screen RED tests**

Assert the exact flow:

```ts
expect(tree.root.findByProps({
  accessibilityLabel: '학습 게임 선택',
})).toBeTruthy();

act(() => tree.root.findByProps({
  accessibilityLabel: 'resilience 시작',
}).props.onPress());

expect(tree.root.findByProps({
  accessibilityLabel: '틀린 그림 찾기',
})).toBeTruthy();
```

Add tests for:

- empty registry renders `플레이 가능한 문제가 없습니다`;
- failed image renders `이미지를 불러오지 못했습니다` and `다시 시도`;
- taps are disabled until both images are ready;
- `다시 하기` resets the current pack;
- `다른 문제 선택` returns to `CATALOG`;
- switching packs resets claimed IDs and image state.

- [ ] **Step 3: Verify RED**

Run:

```powershell
corepack pnpm vitest run apps/mobile/src/learning-demo/asset-state.test.ts apps/mobile/src/learning-demo/GuestGameScreen.test.tsx
```

Expected: FAIL because the state module and guest orchestrator do not exist.

- [ ] **Step 4: Implement the asset reducer**

```ts
export type BoardSide = 'A' | 'B';
export type AssetStatus = 'LOADING' | 'READY' | 'FAILED';
export type AssetState = Readonly<Record<BoardSide, AssetStatus>>;

export function createAssetState(): AssetState {
  return { A: 'LOADING', B: 'LOADING' };
}

export function canAcceptBoardTap(state: AssetState): boolean {
  return state.A === 'READY' && state.B === 'READY';
}
```

Implement exhaustive `READY`, `FAILED`, and `RETRY` actions without timers or
network fallback.

- [ ] **Step 5: Implement the orchestrator**

`GuestGameScreen` owns:

```ts
type GuestRoute =
  | Readonly<{ name: 'CATALOG' }>
  | Readonly<{ name: 'PLAYING'; contentKey: string; session: number }>;
```

Increment `session` for retry/replay so React Native `Image` components
remount. Preserve the same route through application background/foreground;
do not reset from an `AppState` event.

- [ ] **Step 6: Replace corrupted copy**

Use these exact visible strings:

```text
학습 틀린그림찾기
학습 게임 선택
틀린 그림 찾기
찾은 차이
다시 생각해 보세요
완료!
다시 하기
다른 문제 선택
이미지를 불러오고 있습니다
이미지를 불러오지 못했습니다
다시 시도
플레이 가능한 문제가 없습니다
```

Add a UTF-8 regression that reads both TSX files and rejects the Unicode
replacement character and known mojibake fragments:

```ts
expect(source).not.toContain('\uFFFD');
expect(source).not.toMatch(/[?][숈뒿]|쨌/);
```

- [ ] **Step 7: Keep the private production boundary**

`apps/mobile/app/index.tsx` remains:

```tsx
export default function Home() {
  if (!__DEV__) {
    throw new Error(
      'Guest device registry is DEV-only; production requires server projection',
    );
  }
  const { learningDemoEntries } = require(
    '../src/learning-demo/registry',
  );
  return <GuestGameScreen entries={learningDemoEntries} />;
}
```

No top-level import may reference `registry`.

- [ ] **Step 8: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run apps/mobile/src/learning-demo apps/mobile/app
corepack pnpm mobile:typecheck
corepack pnpm content:generate-playable-registry:check
```

Expected: all guest tests, typecheck, and registry drift check PASS.

- [ ] **Step 9: Commit**

```powershell
git add apps/mobile/app/index.tsx apps/mobile/src/learning-demo/GuestGameScreen.tsx apps/mobile/src/learning-demo/GuestGameScreen.test.tsx apps/mobile/src/learning-demo/asset-state.ts apps/mobile/src/learning-demo/asset-state.test.ts apps/mobile/src/learning-demo/LearningDemoScreen.tsx apps/mobile/src/learning-demo/LearningDemoScreen.test.tsx
git commit -m "feat(mobile): complete offline guest game flow"
```

---

### Task 6: Add a Reproducible Metro and Android Bundle Gate

**Files:**
- Create: `tools/mobile/check-expo-project.ts`
- Create: `tools/mobile/check-expo-project.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `docs/operations/mobile-guest-device-runbook.md`

**Interfaces:**
- Consumes: pinned runtime, `apps/mobile/app.json`, dependency versions, and
  generated playable registry.
- Produces: `mobile:preflight`, `mobile:bundle:android`, and a bounded export
  directory outside tracked source.

- [ ] **Step 1: Write preflight RED tests**

The checker returns exact error codes:

```ts
expect(checkExpoProject(validFixture)).toEqual([]);
expect(checkExpoProject({
  ...validFixture,
  nodeVersion: '22.0.0',
})).toContain('MOBILE_NODE_VERSION');
expect(checkExpoProject({
  ...validFixture,
  expoVersion: '56.0.0',
})).toContain('MOBILE_EXPO_VERSION');
expect(checkExpoProject({
  ...validFixture,
  registryDrift: true,
})).toContain('MOBILE_REGISTRY_DRIFT');
```

Also reject a working directory whose normalized path is not the repository
root.

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm vitest run tools/mobile/check-expo-project.test.ts
```

Expected: FAIL because the checker does not exist.

- [ ] **Step 3: Implement and wire commands**

Add:

```json
{
  "mobile:preflight": "tsx tools/mobile/check-expo-project.ts",
  "mobile:bundle:android": "corepack pnpm --dir apps/mobile exec expo export --platform android --output-dir ../../.superpowers/mobile-export/android --clear"
}
```

Add `.superpowers/mobile-export/` to `.gitignore`.

The preflight checks:

- exact Node/pnpm versions;
- exact Expo/Router/React Native versions from `apps/mobile/package.json`;
- Android package `com.touchcatch.mobile`;
- scheme `spotlearn`;
- generated registry drift command exit;
- empty Supabase variables are acceptable for guest play;
- `SUPABASE_SECRET_KEY` must never appear in the mobile environment.

- [ ] **Step 4: Verify the production-boundary bundle separately**

Do not attempt to make the production export playable with private hitboxes.
The Android export is a Metro/native compatibility gate. The development
build is the playable artifact.

Run:

```powershell
corepack pnpm mobile:preflight
corepack pnpm mobile:bundle:android
```

Expected: preflight exits 0 and Expo produces Android export assets without
module-resolution or syntax errors. The command output is not physical-device
evidence.

- [ ] **Step 5: Update the runbook**

Document:

```powershell
corepack pnpm mobile:preflight
corepack pnpm mobile:bundle:android
corepack pnpm --dir apps/mobile android
```

For an already installed compatible development build:

```powershell
corepack pnpm --dir apps/mobile start -- --clear
```

Explain that the first command builds/installs through the Android toolchain,
while the second only starts Metro.

- [ ] **Step 6: Verify GREEN**

Run:

```powershell
corepack pnpm vitest run tools/mobile/check-expo-project.test.ts
corepack pnpm mobile:preflight
corepack pnpm mobile:bundle:android
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 7: Commit**

```powershell
git add tools/mobile/check-expo-project.ts tools/mobile/check-expo-project.test.ts package.json .gitignore docs/operations/mobile-guest-device-runbook.md
git commit -m "build(mobile): add Android guest smoke gates"
```

---

### Task 7: Record Real Android Physical-Device Evidence

**Files:**
- Create: `docs/evidence/mobile/guest-device-evidence.schema.json`
- Create: `docs/evidence/mobile/android-guest-device.v1.json`
- Create: `docs/evidence/mobile/android/README.md`
- Create after real run: `docs/evidence/mobile/android/catalog.png`
- Create after real run: `docs/evidence/mobile/android/progress-10-of-10.png`
- Create after real run: `docs/evidence/mobile/android/quiz.png`
- Create after real run: `docs/evidence/mobile/android/complete.png`
- Create: `tools/mobile/check-device-evidence.ts`
- Create: `tools/mobile/check-device-evidence.test.ts`
- Modify: `package.json`
- Modify: `docs/operations/mobile-guest-device-runbook.md`

**Interfaces:**
- Consumes: installed Android development build, exact git SHA, screenshots,
  and manual scenario results.
- Produces: `mobile:evidence:android` and an auditable Android
  `PASS | FAIL | BLOCKED` result.

- [ ] **Step 1: Write evidence checker RED tests**

Valid PASS evidence must require:

```ts
expect(validateAndroidEvidence(validPass)).toEqual([]);
```

Negative cases:

```ts
it.each([
  'missing-commit',
  'missing-device-model',
  'missing-android-version',
  'missing-development-build-id',
  'missing-screenshot',
  'three-pack-scenario-not-pass',
  'offline-not-pass',
  'background-restore-not-pass',
  'android-pass-with-synthetic-value',
  'ios-status-in-android-record',
])('rejects %s', (name) => {
  expect(validateFixture(name)).not.toEqual([]);
});
```

Every screenshot path must exist and have a non-zero SHA-256. Reject timestamps
in the future and commit SHAs different from the checked-out HEAD.

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm vitest run tools/mobile/check-device-evidence.test.ts
```

Expected: FAIL because the schema and checker do not exist.

- [ ] **Step 3: Implement the evidence schema**

The record shape is:

```ts
type AndroidGuestEvidenceV1 = Readonly<{
  schemaVersion: '1.0.0';
  platform: 'ANDROID';
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  commitSha: string;
  recordedAt: string;
  runtime: Readonly<{
    node: 'v24.18.0';
    pnpm: '11.13.0';
    expo: '57.0.1';
    applicationId: 'com.touchcatch.mobile';
    developmentBuildId: string;
  }>;
  device: Readonly<{
    manufacturer: string;
    model: string;
    androidVersion: string;
  }>;
  scenarios: readonly {
    id: string;
    status: 'PASS' | 'FAIL';
    note: string;
  }[];
  screenshots: readonly {
    id: 'CATALOG' | 'TEN_OF_TEN' | 'QUIZ' | 'COMPLETE';
    path: string;
    sha256: string;
  }[];
  blocker: string | null;
}>;
```

PASS requires these exact scenario IDs:

```text
COLD_START
PACK_EN_RESILIENCE
PACK_EN_DILEMMA
PACK_EN_SUSTAINABILITY
TAP_IMAGE_A
TAP_IMAGE_B
MISS_NO_PROGRESS
DUPLICATE_NO_PROGRESS
WRONG_THEN_CORRECT_QUIZ
REPLAY
SELECT_ANOTHER_PACK
BACKGROUND_FOREGROUND
OFFLINE_COMPLETE
```

- [ ] **Step 4: Add the command**

```json
{
  "mobile:evidence:android": "tsx tools/mobile/check-device-evidence.ts --platform android"
}
```

- [ ] **Step 5: Perform the real Android run**

Connect the phone with USB debugging enabled:

```powershell
adb devices
corepack pnpm --dir apps/mobile android
corepack pnpm --dir apps/mobile start -- --clear
```

Expected: exactly one authorized physical device. If no device is listed,
write a `BLOCKED` record with `blocker: "DEVICE_UNAVAILABLE"`; do not create
PASS screenshots.

Turn off Wi-Fi and mobile data before `OFFLINE_COMPLETE`. Execute every
scenario on all three allow-listed packs. Save screenshots from the physical
device, not web or emulator.

- [ ] **Step 6: Generate hashes and validate**

Use PowerShell only to inspect hashes:

```powershell
Get-FileHash docs/evidence/mobile/android/catalog.png -Algorithm SHA256
Get-FileHash docs/evidence/mobile/android/progress-10-of-10.png -Algorithm SHA256
Get-FileHash docs/evidence/mobile/android/quiz.png -Algorithm SHA256
Get-FileHash docs/evidence/mobile/android/complete.png -Algorithm SHA256
corepack pnpm mobile:evidence:android
```

Expected: checker exits 0 for an honest PASS or an explicitly allowed BLOCKED
record. A BLOCKED record does not complete the Android milestone.

- [ ] **Step 7: Commit evidence**

For PASS:

```powershell
git add docs/evidence/mobile/guest-device-evidence.schema.json docs/evidence/mobile/android-guest-device.v1.json docs/evidence/mobile/android tools/mobile/check-device-evidence.ts tools/mobile/check-device-evidence.test.ts package.json docs/operations/mobile-guest-device-runbook.md
git commit -m "test(mobile): record Android guest device pass"
```

For BLOCKED, omit nonexistent screenshots and use:

```powershell
git add docs/evidence/mobile/guest-device-evidence.schema.json docs/evidence/mobile/android-guest-device.v1.json docs/evidence/mobile/android/README.md tools/mobile/check-device-evidence.ts tools/mobile/check-device-evidence.test.ts package.json docs/operations/mobile-guest-device-runbook.md
git commit -m "test(mobile): record Android device blocker"
```

---

### Task 8: Add the Independent iOS Gate and Final Internal Verification

**Files:**
- Create: `docs/evidence/mobile/ios-guest-device.v1.json`
- Create when available: `docs/evidence/mobile/ios/README.md`
- Create when available: `docs/evidence/mobile/ios/catalog.png`
- Create when available: `docs/evidence/mobile/ios/progress-10-of-10.png`
- Create when available: `docs/evidence/mobile/ios/quiz.png`
- Create when available: `docs/evidence/mobile/ios/complete.png`
- Modify: `tools/mobile/check-device-evidence.ts`
- Modify: `tools/mobile/check-device-evidence.test.ts`
- Modify: `package.json`
- Modify: `docs/operations/mobile-guest-device-runbook.md`

**Interfaces:**
- Consumes: the Android-ready implementation and a physical iPhone when
  available.
- Produces: `mobile:evidence:ios`, explicit iOS status, and the aggregate local
  guest-game verification command.

- [ ] **Step 1: Write the cross-platform isolation RED**

Add tests:

```ts
expect(validateIosEvidence({
  ...validAndroidPass,
  platform: 'IOS',
})).not.toEqual([]);

expect(aggregateDeviceStatus({
  android: 'PASS',
  ios: 'BLOCKED',
})).toEqual({
  localGuestGame: 'PASS',
  android: 'PASS',
  ios: 'BLOCKED',
});
```

An Android screenshot path or Android OS field must never satisfy the iOS
schema.

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack pnpm vitest run tools/mobile/check-device-evidence.test.ts
```

Expected: FAIL until the iOS branch and aggregate status exist.

- [ ] **Step 3: Implement iOS evidence**

iOS uses:

```ts
platform: 'IOS';
device: Readonly<{
  model: string;
  iosVersion: string;
}>;
runtime: Readonly<{
  bundleIdentifier: 'com.touchcatch.mobile';
  developmentBuildId: string;
}>;
```

It requires the same scenario IDs and screenshot roles as Android. If no
physical iPhone and macOS build host are available, commit:

```json
{
  "schemaVersion": "1.0.0",
  "platform": "IOS",
  "status": "BLOCKED",
  "blocker": "DEVICE_OR_MACOS_HOST_UNAVAILABLE"
}
```

The schema defines the exact reduced fields permitted for BLOCKED evidence;
do not insert fabricated device/runtime values.

- [ ] **Step 4: Add aggregate commands**

```json
{
  "mobile:evidence:ios": "tsx tools/mobile/check-device-evidence.ts --platform ios",
  "mobile:guest:check": "corepack pnpm mobile:preflight && corepack pnpm content:generate-playable-registry:check && corepack pnpm mobile:typecheck && corepack pnpm mobile:test && corepack pnpm mobile:bundle:android && corepack pnpm mobile:evidence:android && corepack pnpm mobile:evidence:ios"
}
```

The aggregate command may exit 0 with iOS BLOCKED only when Android is PASS
and the final report prints `ios: BLOCKED`; it must never print an aggregate
production-release PASS.

- [ ] **Step 5: Run the iOS scenario when infrastructure exists**

On a macOS host with the physical iPhone:

```powershell
corepack pnpm --dir apps/mobile ios
corepack pnpm --dir apps/mobile start -- --clear
```

Execute the same thirteen scenarios and save the four screenshots. If the
infrastructure does not exist, retain the honest BLOCKED record.

- [ ] **Step 6: Run fresh final verification**

From the clean worktree:

```powershell
node tools/check-runtime.mjs
corepack pnpm content:generate-playable-registry:check
corepack pnpm mobile:typecheck
corepack pnpm mobile:test
corepack pnpm mobile:preflight
corepack pnpm mobile:bundle:android
corepack pnpm mobile:evidence:android
corepack pnpm mobile:evidence:ios
node tools/check-docs.mjs
git diff --check
git status --short
```

Expected for milestone completion:

- runtime, registry, typecheck, tests, preflight, bundle, Android evidence,
  docs, and diff checks exit 0;
- Android record is PASS;
- iOS record is independently PASS or explicitly BLOCKED;
- `git status --short` is empty;
- no Supabase credential was required.

- [ ] **Step 7: Request final read-only review**

Provide the reviewer:

- the design spec;
- this implementation plan;
- `git diff main...HEAD`;
- all automated command outputs;
- Android evidence and screenshot hashes;
- iOS PASS or BLOCKED evidence.

The reviewer must separately verdict:

```text
LOCAL_GUEST_LOOP
PRIVATE_CONTENT_BOUNDARY
ANDROID_PHYSICAL_DEVICE
IOS_PHYSICAL_DEVICE
AUTH_SCOPE_EXCLUDED
```

Any Critical/Important finding is fixed and re-reviewed before branch
completion.

- [ ] **Step 8: Commit**

```powershell
git add docs/evidence/mobile/ios-guest-device.v1.json docs/evidence/mobile/ios tools/mobile/check-device-evidence.ts tools/mobile/check-device-evidence.test.ts package.json docs/operations/mobile-guest-device-runbook.md
git commit -m "test(mobile): finalize guest device verification"
```

---

## Execution Order and Stop Conditions

1. Tasks 1–3 close the reproducibility, TypeScript, and registry blockers.
2. Tasks 4–5 make the actual phone interaction correct and complete.
3. Task 6 proves Metro/Android export compatibility but not physical play.
4. Task 7 is the mandatory Android physical-device acceptance gate.
5. Task 8 reports iOS independently and performs the final review.

Stop and report instead of guessing when:

- the exact Node/pnpm runtime cannot be obtained;
- frozen dependency installation changes the lockfile;
- the three allow-listed bundles do not satisfy 7 NORMAL + 3 HARD;
- Metro resolves a different package graph from the frozen lockfile;
- no authorized Android device is available for Task 7;
- any screenshot or manual scenario was not produced by the physical device;
- a requested change would statically import private hitboxes into production.

## Completion Matrix

| Outcome | Required tasks |
|---|---|
| Internally playable guest loop | Tasks 1–5 |
| Android bundle-ready | Tasks 1–6 |
| Android physical phone PASS | Tasks 1–7 with Android evidence PASS |
| iOS physical phone PASS | Task 8 with iOS evidence PASS |
| Requested milestone complete | Android PASS; iOS PASS or explicit BLOCKED |
| Supabase/authenticated play | Not part of this plan |
| Online two-player battle | Not part of this plan |
