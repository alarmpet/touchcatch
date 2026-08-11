import { readFile } from 'node:fs/promises';
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
});

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
