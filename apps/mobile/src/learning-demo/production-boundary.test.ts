import { readFile, rm } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('boots the public home without placing the private learning registry in the game route graph', async () => {
  const homeSource = await readFile('apps/mobile/app/index.tsx', 'utf8');
  expect(homeSource).toContain("from '../src/home/HomeScreen'");
  expect(homeSource).not.toContain('learning-demo');

  const source = await readFile('apps/mobile/app/game/spot-difference.tsx', 'utf8');
  expect(source).toContain('AuthoritativeLearningSessionScreen');
  expect(source).not.toMatch(/learning-demo/);
  expect(source).not.toMatch(/preview-home|preview-registry|LearningDemoScreen/);
  expect(source).not.toMatch(/privateSolutionHash|canonicalAnswer/);
  const answer = await readFile('apps/mobile/app/game/answer.tsx', 'utf8');
  expect(answer).not.toContain('evaluatePreviewAnswer');
  expect(answer).not.toMatch(/learning-demo/);
  const { scanProductionAppRoutes } = await import('../../../../tools/check-mobile-production-boundary.mjs');
  expect(scanProductionAppRoutes()).toEqual([]);
  const preview = await readFile('apps/mobile/src/learning-demo/preview-registry.ts', 'utf8');
  expect(preview).not.toMatch(/privateSolutionHash|canonicalAnswer|contentRevisionId|hintAdmissionHash/);

  // The preview registry now pulls in a generated file, so checking only the hand-written
  // one would let the same secrets in through the back door.
  const generated = await readFile('apps/mobile/src/learning-demo/preview-registry.generated.ts', 'utf8');
  expect(generated).not.toMatch(/privateSolutionHash|canonicalAnswer|contentRevisionId|hintAdmissionHash/);
});

it('keeps the generated preview registry in step with the drafts', async () => {
  const { generatePreviewRegistry } = await import('../../../../tools/content/generate-preview-registry.js');
  const committed = await readFile('apps/mobile/src/learning-demo/preview-registry.generated.ts', 'utf8');
  // Regenerating into a scratch path proves the committed file is what the drafts produce,
  // without a check that silently rewrites the tree it is meant to be verifying.
  const scratch = 'apps/mobile/src/learning-demo/.preview-registry.check.ts';
  const { code, count } = await generatePreviewRegistry({ outputPath: scratch });
  await rm(scratch, { force: true });
  // 79 catalog packs derive playable hitboxes; two are held out by
  // content/learning/defective-art.v1.json for a baked composition guide grid, which no
  // measurement of the difference map can see.
  expect(count).toBe(77);
  expect(committed).toBe(code);
}, 30_000);

it('takes every difference hitbox from the artwork, never from the draft', async () => {
  const derived = JSON.parse(await readFile('content/learning/derived-hitboxes.v1.json', 'utf8'));
  const generated = await readFile('apps/mobile/src/learning-demo/preview-registry.generated.ts', 'utf8');

  // The drafts' own coordinates are what made boards unclearable, so a regression here is
  // invisible in play until someone taps a difference and is told they missed.
  for (const [key, pack] of Object.entries(derived.packs) as [string, { usable: boolean; differences: { id: string }[] }][]) {
    if (!pack.usable) continue;
    expect(generated, key).toContain(`"key":"daily-${key}"`);
  }
  expect(generated).not.toMatch(/"id":"difference_\d+"/);
  expect(generated).toMatch(/"id":"derived-1"/);
});

it('keeps artwork with a baked-in guide grid out of the daily rotation', async () => {
  const { checkArtGrid } = await import('../../../../tools/content/check-art-grid.js');
  const derived = JSON.parse(await readFile('content/learning/derived-hitboxes.v1.json', 'utf8'));
  const generated = await readFile('apps/mobile/src/learning-demo/preview-registry.generated.ts', 'utf8');
  const offenders = await checkArtGrid();

  // This used to assert the offender list was empty, which held only while the detector was
  // blind: it probed the rule-of-thirds lines alone, so `en-phonics-apple`'s 5x5 grid at
  // columns 205/410/614/819 read as 14% and 3% coverage and the gate called the file clean.
  //
  // The assertion is now the property the title names, and it is the stronger one. A grid is
  // invisible to every other gate, so what matters is that no pack carrying one can reach the
  // daily rotation — not that none exists on disk. `derive-hitboxes.js` rejects them on the
  // same evidence this check reads, so there is no hold-out list to extend and none to go
  // stale. Replacing the artwork is still the fix; until it lands the board is not served.
  for (const { key } of offenders as { key: string }[]) {
    expect(derived.packs[key]?.usable, `${key} carries a guide grid and must not be usable`).toBe(false);
    expect(derived.packs[key]?.reason, key).toBe('BAKED_GUIDE_GRID');
    expect(generated, key).not.toContain(`"key":"daily-${key}"`);
  }
}, 60_000);

it('uses Metro-resolvable extensionless imports in runtime modules', async () => {
  const runtimeFiles = [
    'apps/mobile/app/index.tsx',
    'apps/mobile/app/game/spot-difference.tsx',
    'apps/mobile/src/learning-demo/preview-registry.ts',
    'apps/mobile/src/learning-demo/LearningDemoScreen.tsx',
    'apps/mobile/src/learning-demo/data.ts',
    'apps/mobile/src/learning-demo/registry.ts',
  ];
  for (const file of runtimeFiles) {
    expect(await readFile(file, 'utf8'), file).not.toMatch(/(?:from\s+|require\()['"][^'"]+\.js['"]/);
  }
});

it('keeps the development demo casual-only and free of fake leaderboard data', async () => {
  const source = await readFile('apps/mobile/src/learning-demo/LearningDemoScreen.tsx', 'utf8');
  expect(source).not.toContain("useState<'CASUAL' | 'RANKED'>");
  expect(source).not.toContain('mockTop10');
  expect(source).not.toContain('랭킹 모드');
});
