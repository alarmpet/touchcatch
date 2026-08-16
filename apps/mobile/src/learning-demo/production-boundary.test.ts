import { readFile, rm } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('boots the public home without placing the private learning registry in the game route graph', async () => {
  const homeSource = await readFile('apps/mobile/app/index.tsx', 'utf8');
  expect(homeSource).toContain("from '../src/home/HomeScreen'");
  expect(homeSource).not.toContain('learning-demo');

  const source = await readFile('apps/mobile/app/game/spot-difference.tsx', 'utf8');
  expect(source).toContain("from '../../src/learning-demo/preview-home'");
  expect(source).toContain("from '../../src/learning-demo/preview-registry'");
  expect(source).not.toMatch(/learning-demo\/registry|privateSolutionHash|canonicalAnswer/);
  const guard = source.indexOf('if (!__DEV__)');
  expect(guard).toBeGreaterThan(-1);
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
  // 79 admitted packs, less those whose artwork cannot support a playable board. The two
  // held out are en-resonance-stage (IMAGES_DIFFER_GLOBALLY — regenerated rather than edited)
  // and en-3d-creativity (TOO_FEW_DIFFERENCES); `pnpm content:hitboxes:derive` prints both.
  expect(count).toBe(77);
  expect(committed).toBe(code);
});

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
  const offenders = await checkArtGrid();
  // The held-out list is only honest if it still matches what the artwork actually shows.
  // Empty is the goal, not an empty assertion: a composition grid baked into a source image
  // is invisible to every other gate, so this is the only thing standing between one and the
  // daily rotation. If it ever reports a key, replace that artwork — do not extend this list.
  expect(offenders.map((offender: { key: string }) => offender.key).sort()).toEqual([]);
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
