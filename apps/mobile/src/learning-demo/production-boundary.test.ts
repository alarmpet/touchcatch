import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('places the private learning registry behind the compile-time DEV branch', async () => {
  const source = await readFile('apps/mobile/app/index.tsx', 'utf8');
  expect(source).not.toMatch(/^import .*learning-demo\/registry/m);
  const guard = source.indexOf('if (!__DEV__)');
  const registryLoad = source.indexOf("require('../src/learning-demo/registry')");
  expect(guard).toBeGreaterThan(-1);
  expect(registryLoad).toBeGreaterThan(guard);
});

it('uses Metro-resolvable extensionless imports in runtime modules', async () => {
  const runtimeFiles = [
    'apps/mobile/app/index.tsx',
    'apps/mobile/src/learning-demo/LearningDemoScreen.tsx',
    'apps/mobile/src/learning-demo/data.ts',
    'apps/mobile/src/learning-demo/registry.ts',
  ];
  for (const file of runtimeFiles) {
    expect(await readFile(file, 'utf8'), file).not.toMatch(/(?:from\s+|require\()['"][^'"]+\.js['"]/);
  }
});
